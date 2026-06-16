const Invoice = require('../invoice/invoice.model');
const ExcelJS = require('exceljs');
const Booking = require('../booking/booking.model');
const Customer = require('../customer/customer.model');

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Parse và validate khoảng thời gian từ query string
 * Mặc định: tháng hiện tại
 */
function parseDateRange(query) {
    const now = new Date();

    let from = query.from
        ? new Date(query.from)
        : new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);

    let to = query.to
        ? new Date(query.to)
        : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    // Đảm bảo `to` bao trọn ngày cuối
    to.setHours(23, 59, 59, 999);

    return { from, to };
}

const BOOKING_TYPE_LABEL = {
    hourly: 'Nghỉ giờ',
    overnight: 'Qua đêm',
    fullday: 'Cả ngày',
};

// ─── 1. Tổng quan doanh thu (summary cards) ─────────────────────────────────

/**
 * GET /api/reports/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Trả về:
 *   - totalRevenue, totalInvoices, totalDiscount
 *   - breakdown theo bookingType
 *   - breakdown theo paymentMethod (paidAmount vs totalAmount để detect còn nợ)
 */
exports.getSummary = async (req, res) => {
    try {
        const { from, to } = parseDateRange(req.query);

        const [result] = await Invoice.aggregate([
            {
                $match: {
                    status: 'issued',
                    issuedAt: { $gte: from, $lte: to },
                },
            },
            {
                $group: {
                    _id: null,
                    totalRevenue: { $sum: '$totalAmount' },
                    totalBasePrice: { $sum: '$basePrice' },
                    totalExtraCharge: { $sum: '$extraCharge' },
                    totalServicesCharge: { $sum: '$servicesCharge' },
                    totalDiscount: { $sum: '$discount' },
                    totalTax: { $sum: '$tax' },
                    totalPaid: { $sum: '$paidAmount' },
                    totalInvoices: { $sum: 1 },
                },
            },
        ]);

        // Breakdown theo loại thuê
        const byType = await Invoice.aggregate([
            {
                $match: {
                    status: 'issued',
                    issuedAt: { $gte: from, $lte: to },
                },
            },
            {
                $group: {
                    _id: '$bookingType',
                    revenue: { $sum: '$totalAmount' },
                    count: { $sum: 1 },
                },
            },
        ]);

        const summary = result || {
            totalRevenue: 0,
            totalBasePrice: 0,
            totalExtraCharge: 0,
            totalServicesCharge: 0,
            totalDiscount: 0,
            totalTax: 0,
            totalPaid: 0,
            totalInvoices: 0,
        };

        res.json({
            period: { from, to },
            summary: {
                ...summary,
                _id: undefined,
            },
            byBookingType: byType.map((t) => ({
                type: t._id,
                label: BOOKING_TYPE_LABEL[t._id] || t._id,
                revenue: t.revenue,
                count: t.count,
            })),
        });
    } catch (err) {
        console.error('getSummary error:', err);
        res.status(500).json({ message: 'Lỗi lấy tổng quan báo cáo', error: err.message });
    }
};

// ─── 2. Doanh thu theo ngày ─────────────────────────────────────────────────

/**
 * GET /api/reports/daily?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Trả về mảng doanh thu mỗi ngày trong khoảng, kể cả ngày không có invoice (revenue = 0)
 */
exports.getDailyRevenue = async (req, res) => {
    try {
        const { from, to } = parseDateRange(req.query);

        const rows = await Invoice.aggregate([
            {
                $match: {
                    status: 'issued',
                    issuedAt: { $gte: from, $lte: to },
                },
            },
            {
                $group: {
                    _id: {
                        year: { $year: { date: '$issuedAt', timezone: 'Asia/Ho_Chi_Minh' } },
                        month: { $month: { date: '$issuedAt', timezone: 'Asia/Ho_Chi_Minh' } },
                        day: { $dayOfMonth: { date: '$issuedAt', timezone: 'Asia/Ho_Chi_Minh' } },
                    },
                    revenue: { $sum: '$totalAmount' },
                    count: { $sum: 1 },
                    discount: { $sum: '$discount' },
                    servicesCharge: { $sum: '$servicesCharge' },
                },
            },
            { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
        ]);

        // Map thành { date: 'YYYY-MM-DD', revenue, count }
        // Điền ngày 0 cho ngày không có giao dịch
        const map = {};
        for (const r of rows) {
            const { year, month, day } = r._id;
            const key = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            map[key] = { revenue: r.revenue, count: r.count, discount: r.discount, servicesCharge: r.servicesCharge };
        }

        const daily = [];
        const cursor = new Date(from);
        cursor.setHours(0, 0, 0, 0);
        const end = new Date(to);
        end.setHours(0, 0, 0, 0);

        while (cursor <= end) {
            const key = cursor.toISOString().slice(0, 10);
            daily.push({
                date: key,
                revenue: map[key]?.revenue || 0,
                count: map[key]?.count || 0,
                discount: map[key]?.discount || 0,
                servicesCharge: map[key]?.servicesCharge || 0,
            });
            cursor.setDate(cursor.getDate() + 1);
        }

        res.json({ period: { from, to }, daily });
    } catch (err) {
        console.error('getDailyRevenue error:', err);
        res.status(500).json({ message: 'Lỗi lấy doanh thu theo ngày', error: err.message });
    }
};

// ─── 3. Doanh thu theo tháng ────────────────────────────────────────────────

/**
 * GET /api/reports/monthly?year=2025
 *
 * Trả về 12 tháng của năm, điền 0 cho tháng không có giao dịch
 */
exports.getMonthlyRevenue = async (req, res) => {
    try {
        const year = parseInt(req.query.year) || new Date().getFullYear();
        const from = new Date(year, 0, 1, 0, 0, 0);
        const to = new Date(year, 11, 31, 23, 59, 59);

        const rows = await Invoice.aggregate([
            {
                $match: {
                    status: 'issued',
                    issuedAt: { $gte: from, $lte: to },
                },
            },
            {
                $group: {
                    _id: { month: { $month: { date: '$issuedAt', timezone: 'Asia/Ho_Chi_Minh' } } },
                    revenue: { $sum: '$totalAmount' },
                    count: { $sum: 1 },
                    discount: { $sum: '$discount' },
                    servicesCharge: { $sum: '$servicesCharge' },
                },
            },
            { $sort: { '_id.month': 1 } },
        ]);

        const map = {};
        for (const r of rows) map[r._id.month] = r;

        const monthly = Array.from({ length: 12 }, (_, i) => {
            const m = i + 1;
            return {
                month: m,
                label: `Tháng ${m}`,
                revenue: map[m]?.revenue || 0,
                count: map[m]?.count || 0,
                discount: map[m]?.discount || 0,
                servicesCharge: map[m]?.servicesCharge || 0,
            };
        });

        res.json({ year, monthly });
    } catch (err) {
        console.error('getMonthlyRevenue error:', err);
        res.status(500).json({ message: 'Lỗi lấy doanh thu theo tháng', error: err.message });
    }
};

// ─── 4. Danh sách hóa đơn chi tiết (cho bảng) ──────────────────────────────

/**
 * GET /api/reports/invoices?from=&to=&page=1&limit=50&bookingType=&roomNumber=
 */
exports.getInvoiceList = async (req, res) => {
    try {
        const { from, to } = parseDateRange(req.query);
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(200, parseInt(req.query.limit) || 50);
        const skip = (page - 1) * limit;

        const filter = {
            status: 'issued',
            issuedAt: { $gte: from, $lte: to },
        };
        if (req.query.bookingType) filter.bookingType = req.query.bookingType;
        if (req.query.roomNumber) filter.roomNumber = req.query.roomNumber;

        const [invoices, total] = await Promise.all([
            Invoice.find(filter)
                .sort({ issuedAt: -1 })
                .skip(skip)
                .limit(limit)
                .select(
                    'invoiceNumber roomNumber guestName bookingType shift checkIn checkOut ' +
                    'basePrice extraCharge servicesCharge discount tax totalAmount issuedAt'
                )
                .lean(),
            Invoice.countDocuments(filter),
        ]);

        res.json({
            period: { from, to },
            pagination: { page, limit, total, pages: Math.ceil(total / limit) },
            invoices,
        });
    } catch (err) {
        console.error('getInvoiceList error:', err);
        res.status(500).json({ message: 'Lỗi lấy danh sách hóa đơn', error: err.message });
    }
};

// ─── 5. Export Excel ────────────────────────────────────────────────────────

/**
 * GET /api/reports/export/excel?from=&to=&bookingType=&roomNumber=
 *
 * Trả về file .xlsx với 2 sheet:
 *   Sheet 1 - Tổng quan
 *   Sheet 2 - Chi tiết hóa đơn
 */
exports.exportExcel = async (req, res) => {
    try {
        const { from, to } = parseDateRange(req.query);

        const filter = {
            status: 'issued',
            issuedAt: { $gte: from, $lte: to },
        };
        if (req.query.bookingType) filter.bookingType = req.query.bookingType;
        if (req.query.roomNumber) filter.roomNumber = req.query.roomNumber;

        // Lấy toàn bộ invoice trong kỳ (không phân trang)
        const invoices = await Invoice.find(filter)
            .sort({ issuedAt: 1 })
            .lean();

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Nhà nghỉ 79';
        workbook.created = new Date();

        // ── Sheet 1: Tổng quan ──────────────────────────────────────────────────
        const ws1 = workbook.addWorksheet('Tổng quan');

        const periodStr =
            `${from.toLocaleDateString('vi-VN')} – ${to.toLocaleDateString('vi-VN')}`;

        // Tiêu đề
        ws1.mergeCells('A1:D1');
        ws1.getCell('A1').value = `BÁO CÁO DOANH THU – ${periodStr}`;
        ws1.getCell('A1').font = { bold: true, size: 14 };
        ws1.getCell('A1').alignment = { horizontal: 'center' };

        ws1.addRow([]);

        // Header bảng tổng
        const headerRow = ws1.addRow(['Chỉ tiêu', 'Giá trị']);
        headerRow.font = { bold: true };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6E4F0' } };

        const totals = invoices.reduce(
            (acc, inv) => {
                acc.totalRevenue += inv.totalAmount || 0;
                acc.totalBasePrice += inv.basePrice || 0;
                acc.totalExtraCharge += inv.extraCharge || 0;
                acc.totalServicesCharge += inv.servicesCharge || 0;
                acc.totalDiscount += inv.discount || 0;
                acc.totalTax += inv.tax || 0;
                return acc;
            },
            { totalRevenue: 0, totalBasePrice: 0, totalExtraCharge: 0, totalServicesCharge: 0, totalDiscount: 0, totalTax: 0 }
        );

        const summaryData = [
            ['Tổng số hóa đơn', invoices.length],
            ['Tổng doanh thu', totals.totalRevenue],
            ['  Tiền phòng cơ bản', totals.totalBasePrice],
            ['  Phụ thu thêm giờ', totals.totalExtraCharge],
            ['  Dịch vụ', totals.totalServicesCharge],
            ['Tổng giảm giá', totals.totalDiscount],
            ['Tổng thuế', totals.totalTax],
        ];

        for (const [label, value] of summaryData) {
            const row = ws1.addRow([label, value]);
            if (typeof value === 'number' && label !== 'Tổng số hóa đơn') {
                row.getCell(2).numFmt = '#,##0 "đ"';
            }
        }

        ws1.addRow([]);

        // Breakdown theo loại thuê
        ws1.addRow(['Theo loại thuê', 'Số HĐ', 'Doanh thu']).font = { bold: true };

        const byType = {};
        for (const inv of invoices) {
            const t = inv.bookingType || 'unknown';
            if (!byType[t]) byType[t] = { count: 0, revenue: 0 };
            byType[t].count++;
            byType[t].revenue += inv.totalAmount || 0;
        }
        for (const [type, data] of Object.entries(byType)) {
            const row = ws1.addRow([BOOKING_TYPE_LABEL[type] || type, data.count, data.revenue]);
            row.getCell(3).numFmt = '#,##0 "đ"';
        }

        ws1.getColumn(1).width = 30;
        ws1.getColumn(2).width = 15;
        ws1.getColumn(3).width = 20;

        // ── Sheet 2: Chi tiết ───────────────────────────────────────────────────
        const ws2 = workbook.addWorksheet('Chi tiết hóa đơn');

        const headers2 = [
            'Số HĐ', 'Ngày xuất', 'Phòng', 'Khách', 'Loại thuê',
            'Check-in', 'Check-out',
            'Tiền phòng', 'Phụ thu', 'Dịch vụ', 'Giảm giá', 'Thuế', 'Tổng cộng',
        ];
        const hRow = ws2.addRow(headers2);
        hRow.font = { bold: true };
        hRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6E4F0' } };
        hRow.alignment = { horizontal: 'center' };

        const viLocale = 'vi-VN';
        const dtOpts = { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' };

        for (const inv of invoices) {
            const row = ws2.addRow([
                inv.invoiceNumber,
                inv.issuedAt ? new Date(inv.issuedAt).toLocaleDateString(viLocale) : '',
                inv.roomNumber,
                inv.guestName,
                BOOKING_TYPE_LABEL[inv.bookingType] || inv.bookingType,
                inv.checkIn ? new Date(inv.checkIn).toLocaleString(viLocale, dtOpts) : '',
                inv.checkOut ? new Date(inv.checkOut).toLocaleString(viLocale, dtOpts) : '',
                inv.basePrice || 0,
                inv.extraCharge || 0,
                inv.servicesCharge || 0,
                inv.discount || 0,
                inv.tax || 0,
                inv.totalAmount || 0,
            ]);

            // Format cột tiền
            for (let c = 8; c <= 13; c++) {
                row.getCell(c).numFmt = '#,##0';
            }
        }

        // Dòng tổng cuối sheet
        const totalRow = ws2.addRow([
            '', '', '', '', '', '', 'TỔNG CỘNG',
            totals.totalBasePrice,
            totals.totalExtraCharge,
            totals.totalServicesCharge,
            totals.totalDiscount,
            totals.totalTax,
            totals.totalRevenue,
        ]);
        totalRow.font = { bold: true };
        totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
        for (let c = 8; c <= 13; c++) {
            totalRow.getCell(c).numFmt = '#,##0';
        }

        // Column widths
        const colWidths = [16, 12, 8, 20, 12, 18, 18, 14, 12, 12, 12, 10, 14];
        colWidths.forEach((w, i) => { ws2.getColumn(i + 1).width = w; });

        // Freeze header row
        ws2.views = [{ state: 'frozen', ySplit: 1 }];

        // ── Stream về client ────────────────────────────────────────────────────
        const filename = `doanhthu_${from.toISOString().slice(0, 10)}_${to.toISOString().slice(0, 10)}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        await workbook.xlsx.write(res);
        res.end();
    } catch (err) {
        console.error('exportExcel error:', err);
        res.status(500).json({ message: 'Lỗi xuất Excel', error: err.message });
    }
};

/**
 * GET /api/reports/export/bca?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Xuất báo cáo ANTT theo Thông tư 30/2026/TT-BCA
 */
exports.exportBCA = async (req, res) => {
    try {
        const { from, to } = parseDateRange(req.query);

        // 1. Hàm helper để đếm số khách theo quốc tịch trong 1 khoảng thời gian
        const getStatsByNationality = async (startDate, endDate) => {
            const bookings = await Booking.find({
                status: { $in: ['active', 'completed'] },
                $or: [
                    { checkIn: { $gte: startDate, $lte: endDate } },
                    { checkOut: { $gte: startDate, $lte: endDate } }
                ]
            }).lean();

            const guestIds = bookings.map(b => b.guestId).filter(id => id);
            const customers = await Customer.find({
                $or: [{ cccd: { $in: guestIds } }, { passport: { $in: guestIds } }]
            }).lean();

            const customerMap = {};
            for (const c of customers) {
                if (c.cccd) customerMap[c.cccd] = c;
                if (c.passport) customerMap[c.passport] = c;
            }

            const stats = {};
            for (const b of bookings) {
                const cus = customerMap[b.guestId] || {};
                // Chuẩn hóa quốc tịch, nếu trống thì mặc định là Việt Nam
                const nat = (cus.quoctich || 'Việt Nam').trim();
                stats[nat] = (stats[nat] || 0) + 1;
            }
            return stats;
        };

        // 2. Lấy data kỳ hiện tại
        const currStats = await getStatsByNationality(from, to);

        // 3. Tính toán thời gian của kỳ trước (để so sánh)
        const duration = to.getTime() - from.getTime();
        const prevTo = new Date(from.getTime() - 1); // Giảm 1 mili-giây
        const prevFrom = new Date(prevTo.getTime() - duration);

        // Lấy data kỳ trước
        const prevStats = await getStatsByNationality(prevFrom, prevTo);

        // 4. Gộp danh sách tất cả các quốc tịch xuất hiện trong cả 2 kỳ
        const allNats = Array.from(new Set([...Object.keys(currStats), ...Object.keys(prevStats)])).sort((a, b) => {
            // Đưa Việt Nam lên đầu, các nước khác xếp alphabet ở dưới
            if (a.toLowerCase() === 'việt nam') return -1;
            if (b.toLowerCase() === 'việt nam') return 1;
            return a.localeCompare(b);
        });

        // 5. Khởi tạo Excel
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Hệ thống';
        const ws = workbook.addWorksheet('Báo cáo lưu trú', { views: [{ showGridLines: false }] });

        // --- TIÊU ĐỀ BÁO CÁO ---
        ws.mergeCells('A1:E1');
        ws.getCell('A1').value = 'PHỤ LỤC BÁO CÁO';
        ws.getCell('A1').font = { bold: true, size: 14, name: 'Times New Roman' };
        ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };

        ws.mergeCells('A2:E2');
        const reportYear = to.getFullYear();
        const reportQuarter = Math.ceil((to.getMonth() + 1) / 3);

        ws.getCell('A2').value = `Tình hình, kết quả kinh doanh dịch vụ lưu trú - Quý ${reportQuarter} Năm ${reportYear}`;
        ws.getCell('A2').font = { bold: true, size: 12, name: 'Times New Roman' };
        ws.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' };

        ws.mergeCells('A3:E3');
        ws.getCell('A3').value = '(Đính kèm mẫu ĐK13 ban hành kèm theo Thông tư số 30/2026/TT-BCA ngày 31/3/2026)';
        ws.getCell('A3').font = { italic: true, size: 11, name: 'Times New Roman' };
        ws.getCell('A3').alignment = { horizontal: 'center', vertical: 'middle' };

        ws.addRow([]); // Dòng 4 trống

        // --- HEADER BẢNG ---
        // Thiết lập độ rộng cột
        ws.getColumn(1).width = 32; // Nới rộng xíu để chứa đường chéo cho đẹp
        ws.getColumn(2).width = 25;
        ws.getColumn(3).width = 15;
        ws.getColumn(4).width = 15;
        ws.getColumn(5).width = 20;

        // 1. Xử lý ô A5 (Đường chéo và chữ 2 góc)
        ws.mergeCells('A5:A6');
        const cellA5 = ws.getCell('A5');
        // Dùng nhiều khoảng trắng để đẩy "Phân tích" sang góc phải trên, \n\n để đẩy "Quốc tịch" xuống góc trái dưới
        cellA5.value = '                               Phân tích\n\nQuốc tịch';
        cellA5.font = { bold: true, name: 'Times New Roman', size: 12 };
        cellA5.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };

        // Cấu hình đường chéo (diagonal) từ góc trên-trái xuống góc dưới-phải (down: true)
        cellA5.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' },
            diagonal: { up: false, down: true, style: 'thin' }
        };

        // 2. Xử lý các ô còn lại
        ws.mergeCells('B5:B6');
        ws.getCell('B5').value = 'Số lượt khách\nlưu trú\n(người)';

        ws.mergeCells('C5:D5');
        ws.getCell('C5').value = 'So với Quý trước\n(số lượng khách)';

        ws.mergeCells('E5:E6');
        ws.getCell('E5').value = 'Ghi chú';

        ws.getCell('C6').value = 'Tăng';
        ws.getCell('D6').value = 'Giảm';

        // Đánh số cột ở dòng 7
        ws.addRow(['(1)', '(2)', '(3)', '(4)', '(5)']);

        // Định dạng khu vực Header (Dòng 5, 6, 7) - Bỏ qua ô A5 vì đã làm ở trên
        for (let r = 5; r <= 7; r++) {
            const row = ws.getRow(r);
            row.height = r === 5 ? 30 : r === 6 ? 25 : 15; // Chỉnh chiều cao dòng cho đường chéo đỡ bị ép
            row.eachCell({ includeEmpty: true }, cell => {
                // Không ghi đè lại border của A5
                if (cell.address !== 'A5' && cell.address !== 'A6') {
                    cell.font = { bold: true, name: 'Times New Roman', size: 12 };
                    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
                    cell.border = {
                        top: { style: 'thin' }, left: { style: 'thin' },
                        bottom: { style: 'thin' }, right: { style: 'thin' }
                    };
                }
            });
        }

        // --- ĐIỀN DỮ LIỆU ---
        let totalCurr = 0;
        let totalInc = 0;
        let totalDec = 0;

        for (const nat of allNats) {
            const curr = currStats[nat] || 0;
            const prev = prevStats[nat] || 0;

            let tang = '';
            let giam = '';

            if (curr > prev) {
                tang = curr - prev;
                totalInc += tang;
            } else if (curr < prev) {
                giam = prev - curr;
                totalDec += giam;
            }

            totalCurr += curr;

            const dataRow = ws.addRow([
                nat,
                curr || '', // Nếu 0 thì để trống cho giống form
                tang,
                giam,
                ''
            ]);

            dataRow.eachCell({ includeEmpty: true }, cell => {
                cell.font = { name: 'Times New Roman' };
                cell.border = {
                    top: { style: 'thin' }, left: { style: 'thin' },
                    bottom: { style: 'thin' }, right: { style: 'thin' }
                };
                if (cell.col > 1) cell.alignment = { horizontal: 'center', vertical: 'middle' };
            });
        }

        // --- DÒNG TỔNG SỐ ---
        const sumRow = ws.addRow([
            'Tổng số',
            totalCurr || '',
            totalInc || '',
            totalDec || '',
            ''
        ]);
        sumRow.eachCell({ includeEmpty: true }, cell => {
            cell.font = { bold: true, name: 'Times New Roman' };
            cell.border = {
                top: { style: 'thin' }, left: { style: 'thin' },
                bottom: { style: 'thin' }, right: { style: 'thin' }
            };
            if (cell.col > 1) cell.alignment = { horizontal: 'center', vertical: 'middle' };
        });

        ws.addRow([]); // Dòng trống

        // --- CHỮ KÝ ---
        const sigRow1 = ws.addRow(['', '', '', 'ĐẠI DIỆN CƠ SỞ KINH DOANH', '']);
        sigRow1.getCell(4).font = { bold: true, name: 'Times New Roman' };
        sigRow1.getCell(4).alignment = { horizontal: 'center' };
        ws.mergeCells(`D${sigRow1.number}:E${sigRow1.number}`);

        const today = new Date();
        const sigRow2 = ws.addRow(['', '', '', `………., ngày ${today.getDate()} tháng ${today.getMonth() + 1} năm ${today.getFullYear()}`, '']);
        sigRow2.getCell(4).font = { italic: true, name: 'Times New Roman' };
        sigRow2.getCell(4).alignment = { horizontal: 'center' };
        ws.mergeCells(`D${sigRow2.number}:E${sigRow2.number}`);

        const sigRow3 = ws.addRow(['', '', '', '(Ký; ghi họ tên; đóng dấu - nếu có)', '']);
        sigRow3.getCell(4).font = { italic: true, name: 'Times New Roman' };
        sigRow3.getCell(4).alignment = { horizontal: 'center' };
        ws.mergeCells(`D${sigRow3.number}:E${sigRow3.number}`);

        // --- STREAM FILE VỀ CLIENT ---
        const fileName = `PhuLuc_TT30_BCA_${from.toISOString().slice(0, 10)}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

        await workbook.xlsx.write(res);
        res.end();

    } catch (err) {
        console.error('exportBCA error:', err);
        res.status(500).json({ message: 'Lỗi xuất báo cáo BCA', error: err.message });
    }
};