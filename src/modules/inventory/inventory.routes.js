const express = require('express');
const router = express.Router();
const inventoryController = require('./inventory.controller');

// Stock management
router.get('/stock', inventoryController.getInventoryStock);
router.put('/stock/:serviceId', inventoryController.updateStockQuantity);

// Import & Export Slips
router.post('/import', inventoryController.createImportSlip);
router.post('/export', inventoryController.createExportSlip);
router.get('/slips', inventoryController.getInventorySlips);

// Excel Export
router.get('/export-excel', inventoryController.exportInventoryExcel);

module.exports = router;
