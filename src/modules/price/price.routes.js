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

module.exports = router;