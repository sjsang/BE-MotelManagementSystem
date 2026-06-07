const Invoice = require('./invoice.model');
const Booking = require('../booking/booking.model');

// Helper: sinh invoiceNumber dạng INV-YYYYMMDD-XXX
const generateInvoiceNumber = async () => {
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, ''); // 20240607

    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const endOfDay = new Date(today.setHours(23, 59, 59, 999));

    const count = await Invoice.countDocuments({
        issuedAt: { $gte: startOfDay, $lte: endOfDay },
    });

    const seq = String(count + 1).padStart(3, '0');
    return `INV-${dateStr}-${seq}`;
};

// POST /invoices
// Body: { bookingId, paymentMethod, discount, issuedBy, notes }
const createInvoice = async (req, res) => {
    try {
        const { bookingId, paymentMethod = 'cash', discount = 0, issuedBy = '', notes = '' } = req.body;

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
        const totalAmount = booking.totalAmount;
        const paidAmount = totalAmount - discount;

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

            basePrice: booking.basePrice,
            extraHours: booking.extraHours,
            extraCharge: booking.extraCharge,
            servicesCharge: booking.servicesCharge,
            services: booking.services,

            discount,
            totalAmount,
            paidAmount,
            paymentMethod,

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
        const { page = 1, limit = 20, roomNumber, guestName, from, to, status, paymentMethod } = req.query;

        const filter = {};
        if (roomNumber) filter.roomNumber = { $regex: roomNumber, $options: 'i' };
        if (guestName) filter.guestName = { $regex: guestName, $options: 'i' };
        if (status) filter.status = status;
        if (paymentMethod) filter.paymentMethod = paymentMethod;
        if (from || to) {
            filter.issuedAt = {};
            if (from) filter.issuedAt.$gte = new Date(from);
            if (to) filter.issuedAt.$lte = new Date(new Date(to).setHours(23, 59, 59, 999));
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