const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middlewares/auth.middleware');
const {
    getUsers,
    createUser,
    updateUser,
    deleteUser
} = require('./user.controller');

// Tất cả các tuyến này yêu cầu đăng nhập mới được thao tác
router.get('/', authMiddleware, getUsers);
router.post('/', authMiddleware, createUser);
router.put('/:id', authMiddleware, updateUser);
router.delete('/:id', authMiddleware, deleteUser);

module.exports = router;
