const InventorySlip = require('./inventory.model');
const PriceConfig = require('../price/price.model');
const ExcelJS = require('exceljs');

// Helper sinh mã phiếu theo ngày: NK20260808-001 hoặc XK20260808-001
async function generateSlipCode(prefix) {
  const now = new Date();
  const dateStr = now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0');
  
  const codePrefix = `${prefix}${dateStr}`;
  const count = await InventorySlip.countDocuments({
    code: new RegExp(`^${codePrefix}`)
  });
  
  const sequence = String(count + 1).padStart(3, '0');
  return `${codePrefix}-${sequence}`;
}

// GET /api/inventory/stock — Danh sách tồn kho dịch vụ
exports.getInventoryStock = async (req, res) => {
  try {
    let config = await PriceConfig.findOne({ isActive: true });
    if (!config) {
      config = await PriceConfig.findOne();
    }
    if (!config) {
      return res.json({ services: [], summary: { totalItems: 0, totalQuantity: 0, totalValue: 0 } });
    }

    const trackedServicesList = config.services.filter(s => s.trackInventory !== false);
    const services = trackedServicesList.map(s => {
      const quantity = s.quantity || 0;
      const price = s.price || 0;
      return {
        _id: s._id,
        name: s.name,
        price: price,
        unit: s.unit || 'cái',
        quantity: quantity,
        trackInventory: s.trackInventory,
        totalValue: quantity * price,
      };
    });

    const totalQuantity = services.reduce((sum, s) => sum + s.quantity, 0);
    const totalValue = services.reduce((sum, s) => sum + s.totalValue, 0);

    res.json({
      priceConfigId: config._id,
      services,
      summary: {
        totalItems: services.length,
        totalQuantity,
        totalValue,
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// PUT /api/inventory/stock/:serviceId — Cập nhật số lượng tồn kho trực tiếp
exports.updateStockQuantity = async (req, res) => {
  try {
    const { quantity } = req.body;
    if (quantity == null || isNaN(quantity) || Number(quantity) < 0) {
      return res.status(400).json({ error: 'Số lượng không hợp lệ' });
    }

    const config = await PriceConfig.findOne({ isActive: true });
    if (!config) return res.status(404).json({ error: 'Không tìm thấy bảng giá active' });

    const svc = config.services.id(req.params.serviceId);
    if (!svc) return res.status(404).json({ error: 'Không tìm thấy dịch vụ' });

    svc.quantity = Number(quantity);
    await config.save();

    res.json({ message: 'Cập nhật tồn kho thành công', service: svc });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// POST /api/inventory/import — Tạo phiếu nhập kho
exports.createImportSlip = async (req, res) => {
  try {
    const { items, date, notes, created_by } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Danh sách dịch vụ nhập kho không được để trống' });
    }

    let config = await PriceConfig.findOne({ isActive: true });
    if (!config) return res.status(404).json({ error: 'Không tìm thấy bảng giá' });

    const slipCode = await generateSlipCode('NK');
    const processedItems = [];
    let totalQty = 0;
    let totalAmt = 0;

    for (const item of items) {
      const qty = Number(item.quantity);
      if (isNaN(qty) || qty <= 0) continue;

      let svc = null;
      if (item.serviceId) {
        svc = config.services.id(item.serviceId);
      }
      if (!svc && item.serviceName) {
        svc = config.services.find(s => s.name.trim().toLowerCase() === item.serviceName.trim().toLowerCase());
      }

      if (svc) {
        svc.quantity = (svc.quantity || 0) + qty;
        const itemPrice = item.price != null ? Number(item.price) : svc.price;
        const itemTotal = itemPrice * qty;

        processedItems.push({
          serviceId: svc._id,
          serviceName: svc.name,
          unit: svc.unit,
          price: itemPrice,
          quantity: qty,
          totalAmount: itemTotal,
        });

        totalQty += qty;
        totalAmt += itemTotal;
      } else {
        // Dịch vụ chưa tồn tại trong bảng giá -> Thêm dịch vụ mới với số lượng nhập
        const itemPrice = Number(item.price) || 0;
        const itemUnit = item.unit || 'cái';
        const itemTotal = itemPrice * qty;

        config.services.push({
          name: item.serviceName,
          price: itemPrice,
          unit: itemUnit,
          quantity: qty,
        });
        const newSvc = config.services[config.services.length - 1];

        processedItems.push({
          serviceId: newSvc._id,
          serviceName: newSvc.name,
          unit: newSvc.unit,
          price: itemPrice,
          quantity: qty,
          totalAmount: itemTotal,
        });

        totalQty += qty;
        totalAmt += itemTotal;
      }
    }

    if (processedItems.length === 0) {
      return res.status(400).json({ error: 'Không có dịch vụ hợp lệ để nhập kho' });
    }

    await config.save();

    const slip = new InventorySlip({
      code: slipCode,
      type: 'import',
      date: date ? new Date(date) : new Date(),
      items: processedItems,
      totalQuantity: totalQty,
      totalAmount: totalAmt,
      notes: notes || '',
      created_by: created_by || (req.user ? req.user.username : 'Quản trị viên'),
    });

    await slip.save();

    res.status(201).json({ message: 'Tạo phiếu nhập kho thành công', slip, services: config.services });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// POST /api/inventory/export — Tạo phiếu xuất kho thủ công
exports.createExportSlip = async (req, res) => {
  try {
    const { items, date, notes, roomNumber, bookingId, created_by } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Danh sách dịch vụ xuất kho không được để trống' });
    }

    let config = await PriceConfig.findOne({ isActive: true });
    if (!config) return res.status(404).json({ error: 'Không tìm thấy bảng giá' });

    const slipCode = await generateSlipCode('XK');
    const processedItems = [];
    let totalQty = 0;
    let totalAmt = 0;

    for (const item of items) {
      const qty = Number(item.quantity);
      if (isNaN(qty) || qty <= 0) continue;

      let svc = null;
      if (item.serviceId) {
        svc = config.services.id(item.serviceId);
      }
      if (!svc && item.serviceName) {
        svc = config.services.find(s => s.name.trim().toLowerCase() === item.serviceName.trim().toLowerCase());
      }

      if (svc) {
        const currentQty = svc.quantity || 0;
        if (qty > currentQty) {
          return res.status(400).json({
            error: `Dịch vụ "${svc.name}" không đủ tồn kho để xuất (Hiện tồn: ${currentQty} ${svc.unit || 'cái'}, Yêu cầu xuất: ${qty} ${svc.unit || 'cái'})`
          });
        }

        svc.quantity = currentQty - qty;
        const itemPrice = item.price != null ? Number(item.price) : svc.price;
        const itemTotal = itemPrice * qty;

        processedItems.push({
          serviceId: svc._id,
          serviceName: svc.name,
          unit: svc.unit,
          price: itemPrice,
          quantity: qty,
          totalAmount: itemTotal,
        });

        totalQty += qty;
        totalAmt += itemTotal;
      }
    }

    if (processedItems.length === 0) {
      return res.status(400).json({ error: 'Không tìm thấy dịch vụ tương ứng để xuất kho' });
    }

    await config.save();

    const slip = new InventorySlip({
      code: slipCode,
      type: 'export',
      date: date ? new Date(date) : new Date(),
      items: processedItems,
      totalQuantity: totalQty,
      totalAmount: totalAmt,
      notes: notes || '',
      roomNumber: roomNumber || '',
      bookingId: bookingId || null,
      created_by: created_by || (req.user ? req.user.username : 'Quản trị viên'),
    });

    await slip.save();

    res.status(201).json({ message: 'Tạo phiếu xuất kho thành công', slip, services: config.services });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// GET /api/inventory/slips — Lịch sử phiếu nhập/xuất kho
exports.getInventorySlips = async (req, res) => {
  try {
    const { type, from, to, preset, search, limit = 50, page = 1 } = req.query;

    const filter = {};
    if (type && type !== 'all') {
      filter.type = type;
    }

    // Xử lý Lọc Ngày
    let startDate = from ? new Date(from) : null;
    let endDate = to ? new Date(to) : null;

    if (preset) {
      const now = new Date();
      const startOfDay = (d) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
      const endOfDay = (d) => { const x = new Date(d); x.setHours(23,59,59,999); return x; };

      switch (preset) {
        case 'today':
          startDate = startOfDay(now);
          endDate = endOfDay(now);
          break;
        case 'yesterday': {
          const y = new Date(now); y.setDate(y.getDate() - 1);
          startDate = startOfDay(y);
          endDate = endOfDay(y);
          break;
        }
        case 'this_week': {
          const mon = new Date(now); mon.setDate(now.getDate() - ((now.getDay() + 6) % 7));
          startDate = startOfDay(mon);
          endDate = endOfDay(now);
          break;
        }
        case 'this_month': {
          const first = new Date(now.getFullYear(), now.getMonth(), 1);
          startDate = startOfDay(first);
          endDate = endOfDay(now);
          break;
        }
      }
    }

    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = startDate;
      if (endDate) filter.date.$lte = endDate;
    }

    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      filter.$or = [
        { code: regex },
        { notes: regex },
        { roomNumber: regex },
        { 'items.serviceName': regex },
      ];
    }

    const pageSize = Math.min(parseInt(limit) || 50, 200);
    const pageNum = Math.max(parseInt(page) || 1, 1);
    const skip = (pageNum - 1) * pageSize;

    const [slips, total] = await Promise.all([
      InventorySlip.find(filter).sort({ date: -1, _id: -1 }).skip(skip).limit(pageSize),
      InventorySlip.countDocuments(filter),
    ]);

    res.json({
      slips,
      pagination: {
        total,
        page: pageNum,
        limit: pageSize,
        totalPages: Math.ceil(total / pageSize),
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /api/inventory/export-excel — Xuất File Excel Tồn Kho
exports.exportInventoryExcel = async (req, res) => {
  try {
    let config = await PriceConfig.findOne({ isActive: true });
    if (!config) config = await PriceConfig.findOne();
    const services = config ? config.services.filter(s => s.trackInventory !== false) : [];

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Bảng Tồn Kho Dịch Vụ');

    // Title
    worksheet.mergeCells('A1:F1');
    const titleCell = worksheet.getCell('A1');
    titleCell.value = 'BÁO CÁO TỒN KHO DỊCH VỤ';
    titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FF1C3E2D' } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

    worksheet.mergeCells('A2:F2');
    const dateCell = worksheet.getCell('A2');
    dateCell.value = `Ngày xuất: ${new Date().toLocaleDateString('vi-VN')} ${new Date().toLocaleTimeString('vi-VN')}`;
    dateCell.font = { name: 'Arial', size: 11, italic: true, color: { argb: 'FF666666' } };
    dateCell.alignment = { horizontal: 'center', vertical: 'middle' };

    worksheet.addRow([]);

    // Headers
    const headerRow = worksheet.addRow([
      'STT', 'Tên Dịch Vụ', 'Đơn Vị Tính', 'Đơn Giá (VNĐ)', 'Số Lượng Tồn Kho', 'Giá Trị Tồn Kho (VNĐ)'
    ]);

    headerRow.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF357A55' }
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });

    let totalQty = 0;
    let totalVal = 0;

    services.forEach((s, idx) => {
      const qty = s.quantity || 0;
      const price = s.price || 0;
      const val = qty * price;
      totalQty += qty;
      totalVal += val;

      const row = worksheet.addRow([
        idx + 1,
        s.name,
        s.unit || 'cái',
        price,
        qty,
        val
      ]);

      row.font = { name: 'Arial', size: 10 };
      row.getCell(1).alignment = { horizontal: 'center' };
      row.getCell(2).alignment = { horizontal: 'left' };
      row.getCell(3).alignment = { horizontal: 'center' };
      row.getCell(4).alignment = { horizontal: 'right' };
      row.getCell(4).numFmt = '#,##0';
      row.getCell(5).alignment = { horizontal: 'center' };
      row.getCell(6).alignment = { horizontal: 'right' };
      row.getCell(6).numFmt = '#,##0';

      row.eachCell(cell => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
          left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
          bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
          right: { style: 'thin', color: { argb: 'FFE0E0E0' } }
        };
      });
    });

    // Summary Row
    const summaryRow = worksheet.addRow([
      '', 'TỔNG CỘNG', '', '', totalQty, totalVal
    ]);
    summaryRow.font = { name: 'Arial', size: 11, bold: true };
    summaryRow.getCell(2).alignment = { horizontal: 'center' };
    summaryRow.getCell(5).alignment = { horizontal: 'center' };
    summaryRow.getCell(6).alignment = { horizontal: 'right' };
    summaryRow.getCell(6).numFmt = '#,##0';

    summaryRow.eachCell(cell => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE8F5E9' }
      };
      cell.border = {
        top: { style: 'medium' },
        left: { style: 'thin' },
        bottom: { style: 'medium' },
        right: { style: 'thin' }
      };
    });

    // Set Column Widths
    worksheet.getColumn(1).width = 8;
    worksheet.getColumn(2).width = 30;
    worksheet.getColumn(3).width = 15;
    worksheet.getColumn(4).width = 20;
    worksheet.getColumn(5).width = 20;
    worksheet.getColumn(6).width = 25;

    const dateStr = new Date().toISOString().slice(0, 10);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="Ton-kho-dich-vu-${dateStr}.xlsx"`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
