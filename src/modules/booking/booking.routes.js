const express = require('express');
const router = express.Router();
const bookingController = require('./booking.controller'); // Bạn hãy điều chỉnh lại đường dẫn chính xác tới file controller vừa tạo ở trên

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
router.put('/:id', bookingController.updateBooking);

module.exports = router;