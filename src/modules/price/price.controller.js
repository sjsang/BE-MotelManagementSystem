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