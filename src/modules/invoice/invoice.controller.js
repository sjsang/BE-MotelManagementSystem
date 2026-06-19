const Invoice = require('./invoice.model');
const Booking = require('../booking/booking.model');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

dayjs.extend(utc);
dayjs.extend(timezone);

// Múi giờ chuẩn Việt Nam
const TZ = 'Asia/Ho_Chi_Minh';

// Helper: sinh invoiceNumber dạng HDYYMMXXX (VD: HD2606001)
const generateInvoiceNumber = async () => {
    // Lấy thời điểm hiện tại theo giờ VN
    const nowVN = dayjs().tz(TZ);

    // Lấy 2 số cuối của năm (VD: 2026 -> '26')
    const yearStr = nowVN.format('YY');
    // Lấy tháng, đã có padding 0 sẵn (VD: 6 -> '06')
    const monthStr = nowVN.format('MM');

    // Đầu tháng và cuối tháng tính theo giờ VN, convert sang UTC để query MongoDB
    const startOfMonth = nowVN.startOf('month').toDate();
    const endOfMonth = nowVN.endOf('month').toDate();

    // Đếm số lượng hóa đơn đã xuất trong THÁNG
    const count = await Invoice.countDocuments({
        issuedAt: { $gte: startOfMonth, $lte: endOfMonth },
    });

    // Tạo chuỗi 3 số thứ tự (001, 002...).
    // Nếu tháng đó bán được hơn 999 hóa đơn thì nó tự động thành 1000, không lo bị lỗi.
    const seq = String(count + 1).padStart(3, '0');

    return `HD${yearStr}${monthStr}${seq}`;
};
// POST /invoices
// Body: { bookingId, discount, taxType, taxPercent, tax, issuedBy, notes }
const createInvoice = async (req, res) => {
    try {
        // Nhận thêm taxType, taxPercent và tax (vnd) từ req.body
        const { bookingId, discount = 0, taxType = 'vnd', taxPercent = 0, tax: inputTax = 0, issuedBy = '', notes = '' } = req.body;

        if (!bookingId) return res.status(400).json({ message: 'bookingId là bắt buộc' });

        const booking = await Booking.findById(bookingId).populate('room');
        if (!booking) return res.status(404).json({ message: 'Không tìm thấy booking' });

        if (booking.status !== 'completed') {
            return res.status(400).json({ message: 'Booking chưa hoàn thành, không thể xuất hóa đơn' });
        }

        // Kiểm tra đã có hóa đơn chưa (tránh tạo trùng)
        const existing = await Invoice.findOne({ booking: bookingId, status: 'issued' });
        if (existing) {
            return res.status(409).json({ message: 'Booking này đã có hóa đơn', invoice: existing });
        }

        const invoiceNumber = await generateInvoiceNumber();

        // 1. Sao chép totalAmount và deposit từ booking
        const totalAmount = booking.totalAmount || 0;
        const deposit = booking.deposit || 0;

        // 2. Tính toán Tax
        let calculatedTax = 0;
        if (taxType === 'percent') {
            calculatedTax = (totalAmount - discount) * (taxPercent / 100);
        } else if (taxType === 'vnd') {
            calculatedTax = inputTax;
        }

        // 3. Tính Giá trị Thanh toán (payableAmount) và Thực thu (paidAmount)
        const payableAmount = totalAmount - discount + calculatedTax;
        const paidAmount = Math.max(0, payableAmount - deposit);

        const invoice = await Invoice.create({
            booking: booking._id,
            invoiceNumber,

            // Snapshot
            roomNumber: booking.roomNumber,
            roomType: booking.room?.type,
            guestName: booking.guestName,
            guestPhone: booking.guestPhone,
            guestId: booking.guestId,
            checkIn: booking.checkIn,
            checkOut: booking.checkOut,
            bookingType: booking.bookingType,
            shift: booking.shift,

            basePrice: booking.basePrice || 0,
            earlyCheckInCharge: booking.earlyCheckInCharge || 0, // <-- ĐÃ THÊM PHỤ THU VÀO SỚM
            extraCharge: booking.extraCharge || 0,               // <-- ĐÃ ĐẢM BẢO LUÔN CÓ SỐ (Phụ thu ra trễ)
            servicesCharge: booking.servicesCharge || 0,
            services: booking.services || [],

            // Lưu các trường tiền tệ theo đúng thứ tự
            discount,
            tax: calculatedTax,
            payableAmount,
            deposit,
            paidAmount,
            totalAmount,

            issuedAt: new Date(),
            issuedBy,
            notes,
        });

        return res.status(201).json(invoice);
    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
};
// GET /invoices
// Query: ?page=1&limit=20&roomNumber=101&guestName=abc&from=2024-06-01&to=2024-06-30&status=issued
const getInvoices = async (req, res) => {
    try {
        const { page = 1, limit = 20, roomNumber, guestName, from, to, status } = req.query;

        const filter = {};
        if (roomNumber) filter.roomNumber = { $regex: roomNumber, $options: 'i' };
        if (guestName) filter.guestName = { $regex: guestName, $options: 'i' };
        if (status) filter.status = status;

        if (from || to) {
            filter.issuedAt = {};
            // Parse ngày theo giờ VN: from = 0h00 đầu ngày, to = 23h59 cuối ngày
            if (from) filter.issuedAt.$gte = dayjs.tz(from, TZ).startOf('day').toDate();
            if (to) filter.issuedAt.$lte = dayjs.tz(to, TZ).endOf('day').toDate();
        }

        const skip = (Number(page) - 1) * Number(limit);
        const [invoices, total] = await Promise.all([
            Invoice.find(filter).sort({ issuedAt: -1 }).skip(skip).limit(Number(limit)),
            Invoice.countDocuments(filter),
        ]);

        return res.json({
            data: invoices,
            total,
            page: Number(page),
            totalPages: Math.ceil(total / Number(limit)),
        });
    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
};

// GET /invoices/:id
const getInvoiceById = async (req, res) => {
    try {
        const invoice = await Invoice.findById(req.params.id).populate('booking');
        if (!invoice) return res.status(404).json({ message: 'Không tìm thấy hóa đơn' });
        return res.json(invoice);
    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
};

// PATCH /invoices/:id/cancel
// Body: { reason }
const cancelInvoice = async (req, res) => {
    try {
        const invoice = await Invoice.findById(req.params.id);
        if (!invoice) return res.status(404).json({ message: 'Không tìm thấy hóa đơn' });
        if (invoice.status === 'cancelled') {
            return res.status(400).json({ message: 'Hóa đơn đã bị hủy trước đó' });
        }

        invoice.status = 'cancelled';
        if (req.body.reason) invoice.notes = `[HỦY] ${req.body.reason}`;
        await invoice.save();

        return res.json({ message: 'Hủy hóa đơn thành công', invoice });
    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
};

module.exports = { createInvoice, getInvoices, getInvoiceById, cancelInvoice };