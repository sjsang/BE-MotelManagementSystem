const express = require('express');
const router = express.Router();
const priceConfigController = require("./price.controller"); // Hãy điều chỉnh lại đường dẫn chính xác tới file controller ở trên

// GET active price config (Đặt lên trước route '/' và '/:id' để tránh xung đột)
router.get('/active', priceConfigController.getActiveConfig);

// GET all configs
router.get('/', priceConfigController.getAllConfigs);

// POST create config
router.post('/', priceConfigController.createConfig);

// PUT update config
router.put('/:id', priceConfigController.updateConfig);

// DELETE config
router.delete('/:id', priceConfigController.deleteConfig);

// ── Dịch vụ trong bảng giá ──────────────────────────────────────────────────
// Lưu ý: /reorder phải đứng TRƯỚC /:serviceId để không bị nhận nhầm là id
router.get   ('/:id/services',                   priceConfigController.getServices);
router.post  ('/:id/services',                   priceConfigController.addService);
router.post  ('/:id/services/reorder',           priceConfigController.reorderServices);
router.put   ('/:id/services/:serviceId',        priceConfigController.updateService);
router.delete('/:id/services/:serviceId',        priceConfigController.deleteService);

module.exports = router;