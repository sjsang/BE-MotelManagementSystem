const express = require('express');
const router = express.Router();

const authMiddleware = require('../../middlewares/auth.middleware');

const { register, login, getUserInfo } = require('./auth.controller');

router.post('/register', register);
router.post('/login', login);
router.get('/me', authMiddleware, getUserInfo);

module.exports = router;