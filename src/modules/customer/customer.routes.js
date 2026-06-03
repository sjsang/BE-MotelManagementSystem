const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middlewares/auth.middleware');

const {
    getCustomerOptions,
    getAllCustomers,
    getCustomerById,
    createCustomer,
    updateCustomer,
    deleteCustomer
} = require('./customer.controller');

// Đăng nhập mới có thể truy cập APIs quản lý khách hàng
router.use(authMiddleware);

router.get('/options', getCustomerOptions);
router.get('/', getAllCustomers);
router.get('/:id', getCustomerById);
router.post('/', createCustomer);
router.put('/:id', updateCustomer);
router.delete('/:id', deleteCustomer);

module.exports = router;
