const express = require('express');
const router = express.Router();
const bookingController = require('./booking.controller'); 
const authMiddleware = require('../../middlewares/auth.middleware');

// GET all bookings
router.get('/', bookingController.getAllBookings);

// GET revenue stats (Lưu ý: Đặt route tĩnh này lên trước route động '/:id' để tránh bị nhận nhầm thành id='stats')
router.get('/stats/revenue', bookingController.getRevenueStats);

// GET booking by id
router.get('/:id', bookingController.getBookingById);

// POST check-in
router.post('/checkin', bookingController.checkIn);

// POST check-out
router.post('/checkout/:bookingId', bookingController.checkOut);

// PUT update booking (add services, notes)
router.put('/:id', authMiddleware, bookingController.updateBooking);

module.exports = router;