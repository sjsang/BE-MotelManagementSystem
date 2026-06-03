const PriceConfig = require('./price.model');

// GET active price config
exports.getActiveConfig = async (req, res) => {
  try {
    let config = await PriceConfig.findOne({ isActive: true });
    if (!config) {
      // Tạo config mặc định
      config = new PriceConfig({ 
        name: 'Bảng giá mặc định', 
        services: [
          { name: 'Nước suối Aqua', price: 10000, unit: 'chai' },
          { name: 'Sting', price: 15000, unit: 'lon' },
          { name: 'Ô long', price: 15000, unit: 'lon' },
          { name: 'Bò cụng', price: 20000, unit: 'lon' },
          { name: 'Trà xanh', price: 15000, unit: 'lon' },
          { name: 'Mì ly', price: 20000, unit: 'ly' },
          { name: 'Mì ly xúc xích', price: 25000, unit: 'ly' },
          { name: 'Thuốc lá Mèo đỏ', price: 35000, unit: 'gói' },
          { name: 'Thuốc lá Yes', price: 20000, unit: 'gói' },
          { name: 'Giặt sấy (<2kg)', price: 20000, unit: 'lần' },
          { name: 'Thuê xe', price: 80000, unit: 'ngày' },
          { name: 'Phụ thu (khăn, đá...)', price: 20000, unit: 'lần' },
        ]
      });
      await config.save();
    }
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET all configs
exports.getAllConfigs = async (req, res) => {
  try {
    const configs = await PriceConfig.find().sort({ createdAt: -1 });
    res.json(configs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST create config
exports.createConfig = async (req, res) => {
  try {
    if (req.body.isActive) {
      await PriceConfig.updateMany({}, { isActive: false });
    }
    const config = new PriceConfig(req.body);
    await config.save();
    res.status(201).json(config);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// PUT update config
exports.updateConfig = async (req, res) => {
  try {
    if (req.body.isActive) {
      await PriceConfig.updateMany({ _id: { $ne: req.params.id } }, { isActive: false });
    }
    const config = await PriceConfig.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!config) return res.status(404).json({ error: 'Không tìm thấy bảng giá' });
    res.json(config);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// DELETE config
exports.deleteConfig = async (req, res) => {
  try {
    await PriceConfig.findByIdAndDelete(req.params.id);
    res.json({ message: 'Đã xóa bảng giá' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─── Service CRUD ────────────────────────────────────────────────────────────

// Helper: lấy config và tìm service, trả lỗi nếu không có
async function getConfigAndService(req, res) {
  const config = await PriceConfig.findById(req.params.id);
  if (!config) { res.status(404).json({ error: 'Không tìm thấy bảng giá' }); return null; }
  const svc = config.services.id(req.params.serviceId);
  if (!svc) { res.status(404).json({ error: 'Không tìm thấy dịch vụ' }); return null; }
  return { config, svc };
}

// GET /prices/:id/services — danh sách dịch vụ
exports.getServices = async (req, res) => {
  try {
    const config = await PriceConfig.findById(req.params.id).select('services');
    if (!config) return res.status(404).json({ error: 'Không tìm thấy bảng giá' });
    res.json(config.services);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// POST /prices/:id/services — thêm dịch vụ { name, price, unit? }
exports.addService = async (req, res) => {
  try {
    const { name, price, unit } = req.body;
    if (!name || price == null) return res.status(400).json({ error: 'Thiếu name hoặc price' });
    const config = await PriceConfig.findById(req.params.id);
    if (!config) return res.status(404).json({ error: 'Không tìm thấy bảng giá' });
    config.services.push({ name, price: Number(price), unit: unit || 'cái' });
    await config.save();
    res.status(201).json(config.services[config.services.length - 1]);
  } catch (err) { res.status(400).json({ error: err.message }); }
};

// PUT /prices/:id/services/:serviceId — sửa dịch vụ
exports.updateService = async (req, res) => {
  try {
    const result = await getConfigAndService(req, res);
    if (!result) return;
    const { config, svc } = result;
    if (req.body.name  != null) svc.name  = req.body.name;
    if (req.body.price != null) svc.price = Number(req.body.price);
    if (req.body.unit  != null) svc.unit  = req.body.unit;
    await config.save();
    res.json(svc);
  } catch (err) { res.status(400).json({ error: err.message }); }
};

// DELETE /prices/:id/services/:serviceId — xóa dịch vụ
exports.deleteService = async (req, res) => {
  try {
    const result = await getConfigAndService(req, res);
    if (!result) return;
    const { config, svc } = result;
    svc.deleteOne();
    await config.save();
    res.json({ message: 'Đã xóa dịch vụ' });
  } catch (err) { res.status(400).json({ error: err.message }); }
};

// POST /prices/:id/services/reorder — sắp xếp lại { order: ['id1','id2',...] }
exports.reorderServices = async (req, res) => {
  try {
    const { order } = req.body;
    if (!Array.isArray(order)) return res.status(400).json({ error: 'order phải là mảng serviceId' });
    const config = await PriceConfig.findById(req.params.id);
    if (!config) return res.status(404).json({ error: 'Không tìm thấy bảng giá' });
    const map = new Map(config.services.map(s => [s._id.toString(), s.toObject()]));
    const ordered   = order.map(id => map.get(id)).filter(Boolean);
    const remaining = config.services.filter(s => !order.includes(s._id.toString())).map(s => s.toObject());
    config.services = [...ordered, ...remaining];
    await config.save();
    res.json(config.services);
  } catch (err) { res.status(400).json({ error: err.message }); }
};
