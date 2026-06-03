const Booking = require('../booking/booking.model');
const Room = require('../room/room.model');
const PriceConfig = require('../price/price.model');

// Tính tiền dựa trên loại đặt phòng
function calculateAmount(booking, priceConfig) {
  const { bookingType, shift, room_type, checkIn, checkOut, services } = booking;
  const prices = shift === 'night' ? priceConfig.nightShift : priceConfig.dayShift;
  const typePrices = room_type === 'double' ? prices.double : prices.single;

  let basePrice = 0;
  let extraCharge = 0;
  const checkInTime = new Date(checkIn);
  const checkOutTime = checkOut ? new Date(checkOut) : new Date();
  const diffMs = checkOutTime - checkInTime;
  const diffHours = diffMs / (1000 * 60 * 60);
  const diffMinutes = diffMs / (1000 * 60);

  if (bookingType === 'fullday') {
    basePrice = typePrices.fullday || priceConfig.dayShift[room_type === 'double' ? 'double' : 'single'].fullday;
    if (diffHours > 24) {
      const extraH = Math.ceil(diffHours - 24);
      extraCharge = extraH * (priceConfig.lateEarlyFee || 20000);
    }
  } else if (bookingType === 'overnight') {
    basePrice = typePrices.overnight || priceConfig.dayShift[room_type === 'double' ? 'double' : 'single'].overnight;
    if (diffHours > 14) { // qua 8h sáng
      const extraH = Math.ceil(diffHours - 14);
      extraCharge = extraH * (priceConfig.lateEarlyFee || 20000);
    }
  } else if (bookingType === 'hourly') {
    if (shift === 'night') {
      basePrice = typePrices.hourly_first;
      if (diffHours > 1) {
        const extraH = Math.ceil(diffHours - 1);
        extraCharge = extraH * typePrices.hourly_extra;
      }
    } else {
      // Ca ngày: ≤30p = hourly_first, ≤2h = hourly_2h, >2h = hourly_2h + phụ thu
      if (diffMinutes <= 30) {
        basePrice = typePrices.hourly_first ?? typePrices.hourly_2h ?? 0;
      } else if (diffHours <= 2) {
        basePrice = typePrices.hourly_2h ?? typePrices.hourly_first ?? 0;
      } else {
        basePrice = typePrices.hourly_2h ?? typePrices.hourly_first ?? 0;
        const extraH = Math.ceil(diffHours - 2);
        extraCharge = extraH * (typePrices.hourly_extra ?? 0);
      }
    }
  }

  const servicesCharge = (services || []).reduce((sum, s) => sum + (s.price * s.quantity), 0);
  const totalAmount = basePrice + extraCharge + servicesCharge;

  return { basePrice, extraCharge, servicesCharge, totalAmount, extraHours: Math.max(0, Math.ceil(diffHours - (bookingType === 'fullday' ? 24 : bookingType === 'overnight' ? 14 : 2))) };
}

// GET all bookings
exports.getAllBookings = async (req, res) => {
  try {
    const { status, roomNumber, date } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (roomNumber) filter.roomNumber = roomNumber;
    if (date) {
      const d = new Date(date);
      const nextD = new Date(d); nextD.setDate(nextD.getDate() + 1);
      filter.checkIn = { $gte: d, $lt: nextD };
    }
    const bookings = await Booking.find(filter).sort({ createdAt: -1 }).limit(200);
    res.json(bookings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET booking by id
exports.getBookingById = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id).populate('room');
    if (!booking) return res.status(404).json({ error: 'Không tìm thấy booking' });
    res.json(booking);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST check-in
exports.checkIn = async (req, res) => {
  try {
    const { roomId, roomNumber, guestName, guestPhone, guestId, bookingType, shift, expectedCheckOut, notes, services } = req.body;

    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ error: 'Không tìm thấy phòng' });
    if (room.status === 'occupied') return res.status(400).json({ error: 'Phòng đang có khách' });

    const priceConfig = await PriceConfig.findOne({ isActive: true });
    if (!priceConfig) return res.status(400).json({ error: 'Chưa cấu hình bảng giá' });

    const typePrices = shift === 'night'
      ? priceConfig.nightShift[room.type === 'double' ? 'double' : 'single']
      : priceConfig.dayShift[room.type === 'double' ? 'double' : 'single'];

    let basePrice = 0;
    if (bookingType === 'fullday') basePrice = typePrices.fullday ?? 0;
    else if (bookingType === 'overnight') basePrice = typePrices.overnight ?? 0;
    else if (bookingType === 'hourly') {
      // Ca đêm: giá giờ đầu tiên
      // Ca ngày: hourly_first (≤30p). Phòng đôi không có hourly_first → fallback hourly_2h
      basePrice = shift === 'night'
        ? (typePrices.hourly_first ?? 0)
        : (typePrices.hourly_first ?? typePrices.hourly_2h ?? 0);
    }

    const booking = new Booking({
      room: roomId,
      roomNumber: room.roomNumber,
      guestName,
      guestPhone: guestPhone || '',
      guestId: guestId || '',
      bookingType,
      shift: shift || 'day',
      checkIn: new Date(),
      expectedCheckOut: expectedCheckOut ? new Date(expectedCheckOut) : null,
      basePrice,
      services: services || [],
      status: 'active',
      notes: notes || '',
      room_type: room.type
    });
    await booking.save();

    room.status = 'occupied';
    await room.save();

    res.status(201).json(booking);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// POST check-out
exports.checkOut = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.bookingId).populate('room');
    if (!booking) return res.status(404).json({ error: 'Không tìm thấy booking' });
    if (booking.status !== 'active') return res.status(400).json({ error: 'Booking không active' });

    const priceConfig = await PriceConfig.findOne({ isActive: true });
    booking.checkOut = new Date();
    booking.services = req.body.services || booking.services;
    booking.notes = req.body.notes || booking.notes;

    // Recalculate with checkout time
    const { basePrice, extraCharge, servicesCharge, totalAmount, extraHours } = calculateAmount(
      { ...booking.toObject(), room_type: booking.room?.type || 'single' },
      priceConfig
    );

    booking.basePrice = basePrice;
    booking.extraCharge = extraCharge;
    booking.servicesCharge = servicesCharge;
    booking.totalAmount = totalAmount;
    booking.extraHours = extraHours;
    booking.status = 'completed';
    await booking.save();

    // Update room status
    const room = await Room.findById(booking.room);
    if (room) { room.status = 'cleaning'; await room.save(); }

    res.json(booking);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// PUT update booking (add services, notes)
exports.updateBooking = async (req, res) => {
  try {
    const booking = await Booking.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!booking) return res.status(404).json({ error: 'Không tìm thấy booking' });
    res.json(booking);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// GET revenue stats
exports.getRevenueStats = async (req, res) => {
  try {
    const { from, to } = req.query;
    const filter = { status: 'completed' };
    if (from || to) {
      filter.checkOut = {};
      if (from) filter.checkOut.$gte = new Date(from);
      if (to) filter.checkOut.$lte = new Date(to);
    }
    const bookings = await Booking.find(filter);
    const total = bookings.reduce((s, b) => s + (b.totalAmount || 0), 0);
    const byType = { hourly: 0, overnight: 0, fullday: 0 };
    bookings.forEach(b => { byType[b.bookingType] = (byType[b.bookingType] || 0) + (b.totalAmount || 0); });

    // Group by day
    const byDay = {};
    bookings.forEach(b => {
      const day = new Date(b.checkOut).toISOString().split('T')[0];
      byDay[day] = (byDay[day] || 0) + (b.totalAmount || 0);
    });

    res.json({ total, byType, byDay, count: bookings.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};