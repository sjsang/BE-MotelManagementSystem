const Invoice = require('../invoice/invoice.model');
const ExcelJS = require('exceljs');
const Booking = require('../booking/booking.model');
const Customer = require('../customer/customer.model');

const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ = 'Asia/Ho_Chi_Minh';

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Parse và validate khoảng thời gian từ query string theo múi giờ VN
 * Mặc định: tháng hiện tại
 */
function parseDateRange(query) {
    const now = dayjs().tz(TZ);

    let from = query.from
        ? dayjs.tz(query.from, TZ).startOf('day')
        : now.startOf('month');

    let to = query.to
        ? dayjs.tz(query.to, TZ).endOf('day')
        : now.endOf('month');

    // Mongoose hoạt động tốt với native Date (sẽ tự động query theo UTC chuẩn)
    return { from: from.toDate(), to: to.toDate() };
}

const BOOKING_TYPE_LABEL = {
    hourly: 'Nghỉ giờ',
    overnight: 'Qua đêm',
    fullday: 'Cả ngày',
};

// ─── 1. Tổng quan doanh thu (summary cards) ─────────────────────────────────

/**
 * GET /api/reports/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
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
                    totalRevenue: { $sum: '$payableAmount' }, // Đổi từ totalAmount sang payableAmount
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
                    revenue: { $sum: '$payableAmount' }, // Đổi từ totalAmount sang payableAmount
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
                        year: { $year: { date: '$issuedAt', timezone: TZ } },
                        month: { $month: { date: '$issuedAt', timezone: TZ } },
                        day: { $dayOfMonth: { date: '$issuedAt', timezone: TZ } },
                    },
                    revenue: { $sum: '$payableAmount' }, // Đổi từ totalAmount sang payableAmount
                    count: { $sum: 1 },
                    discount: { $sum: '$discount' },
                    servicesCharge: { $sum: '$servicesCharge' },
                },
            },
            { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
        ]);

        const map = {};
        for (const r of rows) {
            const { year, month, day } = r._id;
            const key = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            map[key] = { revenue: r.revenue, count: r.count, discount: r.discount, servicesCharge: r.servicesCharge };
        }

        const daily = [];
        let cursor = dayjs(from).tz(TZ).startOf('day');
        const end = dayjs(to).tz(TZ).startOf('day');

        // Loop theo chuẩn dayjs timezone
        while (cursor.isBefore(end) || cursor.isSame(end, 'day')) {
            const key = cursor.format('YYYY-MM-DD');
            daily.push({
                date: key,
                revenue: map[key]?.revenue || 0,
                count: map[key]?.count || 0,
                discount: map[key]?.discount || 0,
                servicesCharge: map[key]?.servicesCharge || 0,
            });
            cursor = cursor.add(1, 'day');
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
 */
exports.getMonthlyRevenue = async (req, res) => {
    try {
        const year = parseInt(req.query.year) || dayjs().tz(TZ).year();
        const from = dayjs.tz(`${year}-01-01`, TZ).startOf('year').toDate();
        const to = dayjs.tz(`${year}-12-31`, TZ).endOf('year').toDate();

        const rows = await Invoice.aggregate([
            {
                $match: {
                    status: 'issued',
                    issuedAt: { $gte: from, $lte: to },
                },
            },
            {
                $group: {
                    _id: { month: { $month: { date: '$issuedAt', timezone: TZ } } },
                    revenue: { $sum: '$payableAmount' }, // Đổi từ totalAmount sang payableAmount
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
                    'basePrice extraCharge servicesCharge discount tax payableAmount issuedAt' // Đã thay thế totalAmount bằng payableAmount
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

        const invoices = await Invoice.find(filter).sort({ issuedAt: 1 }).lean();

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Nhà nghỉ 79';
        workbook.created = dayjs().tz(TZ).toDate();

        // ── Sheet 1: Tổng quan ──────────────────────────────────────────────────
        const ws1 = workbook.addWorksheet('Tổng quan');

        const periodStr = `${dayjs(from).tz(TZ).format('DD/MM/YYYY')} – ${dayjs(to).tz(TZ).format('DD/MM/YYYY')}`;

        ws1.mergeCells('A1:D1');
        ws1.getCell('A1').value = `BÁO CÁO DOANH THU – ${periodStr}`;
        ws1.getCell('A1').font = { bold: true, size: 14 };
        ws1.getCell('A1').alignment = { horizontal: 'center' };

        ws1.addRow([]);

        const headerRow = ws1.addRow(['Chỉ tiêu', 'Giá trị']);
        headerRow.font = { bold: true };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6E4F0' } };

        const totals = invoices.reduce(
            (acc, inv) => {
                acc.totalRevenue += inv.payableAmount || 0; // Đổi sang payableAmount
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

        ws1.addRow(['Theo loại thuê', 'Số HĐ', 'Doanh thu']).font = { bold: true };

        const byType = {};
        for (const inv of invoices) {
            const t = inv.bookingType || 'unknown';
            if (!byType[t]) byType[t] = { count: 0, revenue: 0 };
            byType[t].count++;
            byType[t].revenue += inv.payableAmount || 0; // Đổi sang payableAmount
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

        for (const inv of invoices) {
            const row = ws2.addRow([
                inv.invoiceNumber,
                inv.issuedAt ? dayjs(inv.issuedAt).tz(TZ).format('DD/MM/YYYY') : '',
                inv.roomNumber,
                inv.guestName,
                BOOKING_TYPE_LABEL[inv.bookingType] || inv.bookingType,
                inv.checkIn ? dayjs(inv.checkIn).tz(TZ).format('DD/MM/YYYY HH:mm') : '',
                inv.checkOut ? dayjs(inv.checkOut).tz(TZ).format('DD/MM/YYYY HH:mm') : '',
                inv.basePrice || 0,
                inv.extraCharge || 0,
                inv.servicesCharge || 0,
                inv.discount || 0,
                inv.tax || 0,
                inv.payableAmount || 0, // Đổi sang payableAmount
            ]);

            for (let c = 8; c <= 13; c++) {
                row.getCell(c).numFmt = '#,##0';
            }
        }

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

        const colWidths = [16, 12, 8, 20, 12, 18, 18, 14, 12, 12, 12, 10, 14];
        colWidths.forEach((w, i) => { ws2.getColumn(i + 1).width = w; });

        ws2.views = [{ state: 'frozen', ySplit: 1 }];

        const filename = `doanhthu_${dayjs(from).tz(TZ).format('YYYY-MM-DD')}_${dayjs(to).tz(TZ).format('YYYY-MM-DD')}.xlsx`;
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
 */
exports.exportBCA = async (req, res) => {
    try {
        const { from, to } = parseDateRange(req.query);

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
                const nat = (cus.quoctich || 'Việt Nam').trim();
                stats[nat] = (stats[nat] || 0) + 1;
            }
            return stats;
        };

        const currStats = await getStatsByNationality(from, to);

        // Tính toán khoảng thời gian dùng dayjs để an toàn hơn
        const fromObj = dayjs(from);
        const toObj = dayjs(to);
        const durationMs = toObj.diff(fromObj);

        const prevTo = fromObj.subtract(1, 'millisecond').toDate();
        const prevFrom = dayjs(prevTo).subtract(durationMs, 'millisecond').toDate();

        const prevStats = await getStatsByNationality(prevFrom, prevTo);

        const allNats = Array.from(new Set([...Object.keys(currStats), ...Object.keys(prevStats)])).sort((a, b) => {
            if (a.toLowerCase() === 'việt nam') return -1;
            if (b.toLowerCase() === 'việt nam') return 1;
            return a.localeCompare(b);
        });

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Hệ thống';
        const ws = workbook.addWorksheet('Báo cáo lưu trú', { views: [{ showGridLines: false }] });

        ws.mergeCells('A1:E1');
        ws.getCell('A1').value = 'PHỤ LỤC BÁO CÁO';
        ws.getCell('A1').font = { bold: true, size: 14, name: 'Times New Roman' };
        ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };

        ws.mergeCells('A2:E2');
        // Sử dụng timezone để lấy năm, quý an toàn
        const reportYear = toObj.tz(TZ).year();
        const reportQuarter = Math.ceil((toObj.tz(TZ).month() + 1) / 3);

        ws.getCell('A2').value = `Tình hình, kết quả kinh doanh dịch vụ lưu trú - Quý ${reportQuarter} Năm ${reportYear}`;
        ws.getCell('A2').font = { bold: true, size: 12, name: 'Times New Roman' };
        ws.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' };

        ws.mergeCells('A3:E3');
        ws.getCell('A3').value = '(Đính kèm mẫu ĐK13 ban hành kèm theo Thông tư số 30/2026/TT-BCA ngày 31/3/2026)';
        ws.getCell('A3').font = { italic: true, size: 11, name: 'Times New Roman' };
        ws.getCell('A3').alignment = { horizontal: 'center', vertical: 'middle' };

        ws.addRow([]);

        ws.getColumn(1).width = 32;
        ws.getColumn(2).width = 25;
        ws.getColumn(3).width = 15;
        ws.getColumn(4).width = 15;
        ws.getColumn(5).width = 20;

        ws.mergeCells('A5:A6');
        const cellA5 = ws.getCell('A5');
        cellA5.value = '                               Phân tích\n\nQuốc tịch';
        cellA5.font = { bold: true, name: 'Times New Roman', size: 12 };
        cellA5.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };

        cellA5.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' },
            diagonal: { up: false, down: true, style: 'thin' }
        };

        ws.mergeCells('B5:B6');
        ws.getCell('B5').value = 'Số lượt khách\nlưu trú\n(người)';

        ws.mergeCells('C5:D5');
        ws.getCell('C5').value = 'So với Quý trước\n(số lượng khách)';

        ws.mergeCells('E5:E6');
        ws.getCell('E5').value = 'Ghi chú';

        ws.getCell('C6').value = 'Tăng';
        ws.getCell('D6').value = 'Giảm';

        ws.addRow(['(1)', '(2)', '(3)', '(4)', '(5)']);

        for (let r = 5; r <= 7; r++) {
            const row = ws.getRow(r);
            row.height = r === 5 ? 30 : r === 6 ? 25 : 15;
            row.eachCell({ includeEmpty: true }, cell => {
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
                curr || '',
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

        ws.addRow([]);

        const sigRow1 = ws.addRow(['', '', '', 'ĐẠI DIỆN CƠ SỞ KINH DOANH', '']);
        sigRow1.getCell(4).font = { bold: true, name: 'Times New Roman' };
        sigRow1.getCell(4).alignment = { horizontal: 'center' };
        ws.mergeCells(`D${sigRow1.number}:E${sigRow1.number}`);

        const today = dayjs().tz(TZ);
        const sigRow2 = ws.addRow(['', '', '', `………., ngày ${today.date()} tháng ${today.month() + 1} năm ${today.year()}`, '']);
        sigRow2.getCell(4).font = { italic: true, name: 'Times New Roman' };
        sigRow2.getCell(4).alignment = { horizontal: 'center' };
        ws.mergeCells(`D${sigRow2.number}:E${sigRow2.number}`);

        const sigRow3 = ws.addRow(['', '', '', '(Ký; ghi họ tên; đóng dấu - nếu có)', '']);
        sigRow3.getCell(4).font = { italic: true, name: 'Times New Roman' };
        sigRow3.getCell(4).alignment = { horizontal: 'center' };
        ws.mergeCells(`D${sigRow3.number}:E${sigRow3.number}`);

        const fileName = `PhuLuc_TT30_BCA_${fromObj.tz(TZ).format('YYYY-MM-DD')}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

        await workbook.xlsx.write(res);
        res.end();

    } catch (err) {
        console.error('exportBCA error:', err);
        res.status(500).json({ message: 'Lỗi xuất báo cáo BCA', error: err.message });
    }
};