const express = require('express');
const router = express.Router();
const { createInvoice, getInvoices, getInvoiceById, cancelInvoice } = require('../controllers/invoice.controller');

router.post('/', createInvoice);
router.get('/', getInvoices);
router.get('/:id', getInvoiceById);
router.patch('/:id/cancel', cancelInvoice);

module.exports = router;