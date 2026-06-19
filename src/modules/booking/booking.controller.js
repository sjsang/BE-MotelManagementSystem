const Booking = require('../booking/booking.model');
const Room = require('../room/room.model');
const PriceConfig = require('../price/price.model');

// Grace period 15 phút — vượt quá mới tính thêm 1h
function ceilWithGrace(hours, grace = 0.25) {
  const floored = Math.floor(hours);
  return (hours - floored) > grace ? floored + 1 : floored;
}

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
      const extraH = ceilWithGrace(diffHours - 24);
      extraCharge = extraH * (priceConfig.lateEarlyFee || 20000);
    }
  } else if (bookingType === 'overnight') {
    basePrice = typePrices.overnight || priceConfig.dayShift[room_type === 'double' ? 'double' : 'single'].overnight;
    if (diffHours > 14) {
      const extraH = ceilWithGrace(diffHours - 14);
      extraCharge = extraH * (priceConfig.lateEarlyFee || 20000);
    }
  } else if (bookingType === 'hourly') {
    if (shift === 'night') {
      basePrice = typePrices.hourly_first;
      if (diffHours > 1) {
        const extraH = ceilWithGrace(diffHours - 1);
        extraCharge = extraH * typePrices.hourly_extra;
      }
    } else {
      if (diffMinutes <= 30) {
        basePrice = typePrices.hourly_first ?? typePrices.hourly_2h ?? 0;
      } else if (diffHours <= 2) {
        basePrice = typePrices.hourly_2h ?? typePrices.hourly_first ?? 0;
      } else {
        basePrice = typePrices.hourly_2h ?? typePrices.hourly_first ?? 0;
        const extraH = ceilWithGrace(diffHours - 2);
        extraCharge = extraH * (typePrices.hourly_extra ?? 0);
      }
    }
  }

  const servicesCharge = (services || []).reduce((sum, s) => sum + (s.price * s.quantity), 0);
  const totalAmount = basePrice + extraCharge + servicesCharge;

  return { basePrice, extraCharge, servicesCharge, totalAmount, extraHours: Math.max(0, ceilWithGrace(diffHours - (bookingType === 'fullday' ? 24 : bookingType === 'overnight' ? 14 : 2))) };
}

exports.previewCheckout = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.bookingId).populate('room');
    if (!booking) return res.status(404).json({ error: 'Không tìm thấy booking' });
    if (booking.status !== 'active') return res.status(400).json({ error: 'Booking không active' });

    const priceConfig = await PriceConfig.findOne({ isActive: true });
    const { basePrice, extraCharge, extraHours, servicesCharge, totalAmount } = calculateAmount(
      { ...booking.toObject(), room_type: booking.room?.type || 'single', checkOut: new Date() },
      priceConfig
    );

    res.json({
      basePrice, extraCharge, extraHours, servicesCharge, totalAmount,
      deposit: booking.deposit,
      remaining: Math.max(0, totalAmount - booking.deposit),
      checkIn: booking.checkIn, checkOutEstimated: new Date()
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Hàm parse date preset thành { from, to }
function parseDatePreset(preset) {
  const now = new Date();
  const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const endOfDay = (d) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };

  switch (preset) {
    case 'today': {
      return { from: startOfDay(now), to: endOfDay(now) };
    }
    case 'yesterday': {
      const y = new Date(now); y.setDate(y.getDate() - 1);
      return { from: startOfDay(y), to: endOfDay(y) };
    }
    case 'this_week': {
      const day = now.getDay(); // 0=Sun
      const mon = new Date(now); mon.setDate(now.getDate() - ((day + 6) % 7));
      return { from: startOfDay(mon), to: endOfDay(now) };
    }
    case 'last_week': {
      const day = now.getDay();
      const thisMonday = new Date(now); thisMonday.setDate(now.getDate() - ((day + 6) % 7));
      const lastMon = new Date(thisMonday); lastMon.setDate(thisMonday.getDate() - 7);
      const lastSun = new Date(thisMonday); lastSun.setDate(thisMonday.getDate() - 1);
      return { from: startOfDay(lastMon), to: endOfDay(lastSun) };
    }
    case 'this_month': {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: startOfDay(first), to: endOfDay(now) };
    }
    case 'last_month': {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: startOfDay(first), to: endOfDay(last) };
    }
    default:
      return null;
  }
}

// GET all bookings — hỗ trợ lọc chi tiết + lazy loading (cursor-based)
exports.getAllBookings = async (req, res) => {
  try {
    const {
      status,
      roomNumber,
      bookingType,   // hourly | overnight | fullday
      room_type,     // single | double
      shift,         // day | night
      dateField,     // checkIn | checkOut | createdAt (default: checkIn)
      preset,        // today | yesterday | this_week | last_week | this_month | last_month
      from,          // ISO date string (khoảng ngày tuỳ chỉnh)
      to,
      search,        // tìm theo guestName / guestPhone / roomNumber
      // Lazy loading
      limit: limitStr,
      cursor,        // _id cuối cùng của trang trước (cursor-based pagination)
    } = req.query;

    const filter = {};

    // ── Bộ lọc trạng thái / loại phòng / ca ─────────────────────────────
    if (status) filter.status = status;
    if (bookingType) filter.bookingType = bookingType;
    if (room_type) filter.room_type = room_type;
    if (shift) filter.shift = shift;
    if (roomNumber) filter.roomNumber = roomNumber;

    // ── Tìm kiếm text ───────────────────────────────────────────────────
    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      filter.$or = [
        { guestName: regex },
        { guestPhone: regex },
        { roomNumber: regex },
        { guestId: regex },
      ];
    }

    // ── Lọc theo ngày ───────────────────────────────────────────────────
    const field = ['checkIn', 'checkOut', 'createdAt'].includes(dateField) ? dateField : 'checkIn';

    let dateRange = null;
    if (preset) {
      dateRange = parseDatePreset(preset);
    } else if (from || to) {
      dateRange = {
        from: from ? new Date(from) : null,
        to: to ? new Date(to) : null,
      };
    }

    if (dateRange) {
      filter[field] = {};
      if (dateRange.from) filter[field].$gte = dateRange.from;
      if (dateRange.to) filter[field].$lte = dateRange.to;
    }

    // ── Lazy loading (cursor-based) ──────────────────────────────────────
    let PAGE_LIMIT = Math.min(parseInt(limitStr) || 30, 100);
    if (limitStr === 'none' || parseInt(limitStr) === -1) {
      PAGE_LIMIT = 100000;
    }
    if (cursor) {
      // Lấy các bản ghi có _id < cursor (mới hơn được sort trước → cursor là _id nhỏ nhất đã thấy)
      filter._id = { $lt: cursor };
    }

    const bookings = await Booking.find(filter)
      .sort({ _id: -1 })
      .limit(PAGE_LIMIT + 1); // lấy thêm 1 để biết còn trang sau không

    const hasMore = bookings.length > PAGE_LIMIT;
    if (hasMore) bookings.pop();

    const nextCursor = hasMore ? bookings[bookings.length - 1]._id : null;

    res.json({ data: bookings, hasMore, nextCursor });
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
    const { roomId, roomNumber, guestName, guestPhone, guestId, bookingType, shift, expectedCheckOut, notes, services, deposit } = req.body;
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
      basePrice = shift === 'night'
        ? (typePrices.hourly_first ?? 0)
        : (typePrices.hourly_first ?? typePrices.hourly_2h ?? 0);
    }

    const checkInTime = new Date();
    const defaultExpectedCheckOut = new Date(checkInTime);
    defaultExpectedCheckOut.setDate(defaultExpectedCheckOut.getDate() + 1);
    defaultExpectedCheckOut.setHours(0, 0, 0, 0);

    const booking = new Booking({
      room: roomId,
      roomNumber: room.roomNumber,
      guestName,
      guestPhone: guestPhone || '',
      guestId: guestId || '',
      bookingType,
      shift: shift || 'day',
      checkIn: checkInTime,
      expectedCheckOut: expectedCheckOut ? new Date(expectedCheckOut) : defaultExpectedCheckOut,
      basePrice,
      services: services || [],
      deposit: deposit || 0,
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
    if (req.body.is_reported && req.user) {
      const User = require('../auth/auth.model');
      const user = await User.findById(req.user.id);
      if (user) {
        req.body.reported_by = user.username;
      }
    }

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
