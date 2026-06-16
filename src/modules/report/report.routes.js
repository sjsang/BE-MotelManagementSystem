const express = require('express');
const router = express.Router();
const { getSummary, getDailyRevenue, getMonthlyRevenue, getInvoiceList, exportExcel, exportBCA } = require('./report.controller');

router.get('/summary', getSummary);
router.get('/daily', getDailyRevenue);
router.get('/monthly', getMonthlyRevenue);
router.get('/invoices', getInvoiceList);
router.get('/export/excel', exportExcel);
router.get('/export/bca', exportBCA);

module.exports = router;