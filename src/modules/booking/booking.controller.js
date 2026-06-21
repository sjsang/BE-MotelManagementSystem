const Booking = require('../booking/booking.model');
const Room = require('../room/room.model');
const PriceConfig = require('../price/price.model');

// ─── Hằng số khung giờ chuẩn ─────────────────────────────────────────────────
// overnight: check-in chuẩn 18:00, check-out chuẩn 8:00 hôm sau (14h)
// fullday  : check-in chuẩn 12:00, check-out chuẩn 12:00 hôm sau (24h)
const STANDARD_CHECKIN_HOUR = {
  overnight: 18,
  fullday: 12,
};
const STANDARD_DURATION_HOURS = {
  overnight: 14,
  fullday: 24,
};

// Grace period 15 phút — vượt quá mới tính thêm 1 giờ
function ceilWithGrace(hours, grace = 0.25) {
  if (hours <= 0) return 0;
  const floored = Math.floor(hours);
  return (hours - floored) > grace ? floored + 1 : floored;
}

/**
 * Tính phụ thu check-in sớm cho overnight / fullday.
 *
 * Ví dụ overnight (chuẩn 18h):
 *   - Khách vào 15h → sớm 3h → earlyCheckInCharge = 3 × earlyCheckInFee
 *   - Khách vào 18h trở đi → 0đ
 *
 * @returns {{ earlyH: number, earlyCheckInCharge: number, standardCheckIn: Date }}
 */
function calcEarlyCheckIn(bookingType, checkInTime, dayPrices, priceConfig) {
  const standardHour = STANDARD_CHECKIN_HOUR[bookingType];
  if (standardHour == null) {
    return { earlyH: 0, earlyCheckInCharge: 0, standardCheckIn: null };
  }

  // Xây dựng mốc giờ chuẩn trong cùng ngày với checkIn
  const standardCheckIn = new Date(checkInTime);
  standardCheckIn.setHours(standardHour, 0, 0, 0);

  if (checkInTime >= standardCheckIn) {
    return { earlyH: 0, earlyCheckInCharge: 0, standardCheckIn };
  }

  const earlyMs = standardCheckIn - checkInTime;
  const earlyHoursRaw = earlyMs / (1000 * 60 * 60);
  const earlyH = ceilWithGrace(earlyHoursRaw);

  // Phí mỗi giờ check-in sớm: dùng earlyCheckInFee, fallback về hourly_extra hoặc lateEarlyFee
  const feePerHour =
    priceConfig.earlyCheckInFee ??
    dayPrices.hourly_extra ??
    priceConfig.lateEarlyFee ??
    20000;

  return { earlyH, earlyCheckInCharge: earlyH * feePerHour, standardCheckIn };
}

/**
 * Hàm tính tiền chính — được dùng ở cả previewCheckout và checkOut.
 *
 * Trả về:
 *   basePrice          — giá gốc theo loại thuê
 *   earlyCheckInCharge — phụ thu check-in sớm (overnight/fullday)
 *   earlyCheckInHours  — số giờ check-in sớm (để lưu + hiển thị)
 *   extraCharge        — phụ thu check-out muộn
 *   extraHours         — số giờ check-out muộn
 *   servicesCharge     — dịch vụ
 *   totalAmount        — tổng
 */
function calculateAmount(booking, priceConfig) {
  const { bookingType, shift, room_type, checkIn, checkOut, services } = booking;

  // overnight/fullday luôn tính giá gốc theo dayShift
  const dayPrices = priceConfig.dayShift[room_type === 'double' ? 'double' : 'single'];
  // hourly ca đêm dùng nightShift
  const shiftPrices = (shift === 'night' ? priceConfig.nightShift : priceConfig.dayShift)
    [room_type === 'double' ? 'double' : 'single'];

  let basePrice = 0;
  let earlyCheckInCharge = 0;
  let earlyCheckInHours = 0;
  let extraCharge = 0;
  let extraHours = 0;

  const checkInTime = new Date(checkIn);
  const checkOutTime = checkOut ? new Date(checkOut) : new Date();
  const diffMs = checkOutTime - checkInTime;
  const diffHours = diffMs / (1000 * 60 * 60);
  const diffMinutes = diffMs / (1000 * 60);

  // ── FULLDAY ───────────────────────────────────────────────────────────────
  if (bookingType === 'fullday') {
    basePrice = dayPrices.fullday ?? 0;

    // 1. Phụ thu check-in sớm (vào trước 12h)
    const early = calcEarlyCheckIn('fullday', checkInTime, dayPrices, priceConfig);
    earlyCheckInCharge = early.earlyCheckInCharge;
    earlyCheckInHours = early.earlyH;

    // 2. Phụ thu check-out muộn: tính từ mốc check-in CHUẨN (12h), không phải giờ thực
    //    Nếu vào sớm hơn 12h → mốc tính là 12h (đã trả phụ thu rồi)
    //    Nếu vào sau 12h → mốc tính là giờ check-in thực
    const effectiveStart = early.standardCheckIn
      ? (checkInTime < early.standardCheckIn ? early.standardCheckIn : checkInTime)
      : checkInTime;
    const effectiveHours = (checkOutTime - effectiveStart) / (1000 * 60 * 60);
    if (effectiveHours > STANDARD_DURATION_HOURS.fullday) {
      extraHours = ceilWithGrace(effectiveHours - STANDARD_DURATION_HOURS.fullday);
      extraCharge = extraHours * (priceConfig.lateEarlyFee ?? 20000);
    }

  // ── OVERNIGHT ─────────────────────────────────────────────────────────────
  } else if (bookingType === 'overnight') {
    basePrice = dayPrices.overnight ?? 0;

    // 1. Phụ thu check-in sớm (vào trước 18h)
    const early = calcEarlyCheckIn('overnight', checkInTime, dayPrices, priceConfig);
    earlyCheckInCharge = early.earlyCheckInCharge;
    earlyCheckInHours = early.earlyH;

    // 2. Phụ thu check-out muộn: tính từ mốc 18h chuẩn
    const effectiveStart = early.standardCheckIn
      ? (checkInTime < early.standardCheckIn ? early.standardCheckIn : checkInTime)
      : checkInTime;
    const effectiveHours = (checkOutTime - effectiveStart) / (1000 * 60 * 60);
    if (effectiveHours > STANDARD_DURATION_HOURS.overnight) {
      extraHours = ceilWithGrace(effectiveHours - STANDARD_DURATION_HOURS.overnight);
      extraCharge = extraHours * (priceConfig.lateEarlyFee ?? 20000);
    }

  // ── HOURLY ────────────────────────────────────────────────────────────────
  } else if (bookingType === 'hourly') {
    if (shift === 'night') {
      // Ca đêm: giá giờ đầu cố định, mỗi giờ thêm tính extra
      basePrice = shiftPrices.hourly_first ?? 0;
      if (diffHours > 1) {
        extraHours = ceilWithGrace(diffHours - 1);
        extraCharge = extraHours * (shiftPrices.hourly_extra ?? 0);
      }
    } else {
      // Ca ngày: <= 30 phút → hourly_first, <= 2h → hourly_2h, > 2h → + extra/giờ
      if (diffMinutes <= 30) {
        basePrice = shiftPrices.hourly_first ?? shiftPrices.hourly_2h ?? 0;
      } else if (diffHours <= 2) {
        basePrice = shiftPrices.hourly_2h ?? shiftPrices.hourly_first ?? 0;
      } else {
        basePrice = shiftPrices.hourly_2h ?? shiftPrices.hourly_first ?? 0;
        extraHours = ceilWithGrace(diffHours - 2);
        extraCharge = extraHours * (shiftPrices.hourly_extra ?? 0);
      }
    }
  }

  const servicesCharge = (services || []).reduce(
    (sum, s) => sum + (s.price * s.quantity),
    0
  );
  const totalAmount = basePrice + earlyCheckInCharge + extraCharge + servicesCharge;

  return {
    basePrice,
    earlyCheckInCharge,
    earlyCheckInHours,
    extraCharge,
    extraHours,
    servicesCharge,
    totalAmount,
  };
}

// ─── PREVIEW CHECKOUT ─────────────────────────────────────────────────────────
exports.previewCheckout = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.bookingId).populate('room');
    if (!booking) return res.status(404).json({ error: 'Không tìm thấy booking' });
    if (booking.status !== 'active') return res.status(400).json({ error: 'Booking không active' });

    const priceConfig = await PriceConfig.findOne({ isActive: true });
    const result = calculateAmount(
      { ...booking.toObject(), room_type: booking.room?.type || 'single', checkOut: new Date() },
      priceConfig
    );

    res.json({
      ...result,
      deposit: booking.deposit,
      remaining: Math.max(0, result.totalAmount - booking.deposit),
      checkIn: booking.checkIn,
      checkOutEstimated: new Date(),
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// ─── PARSE DATE PRESET ────────────────────────────────────────────────────────
function parseDatePreset(preset) {
  const now = new Date();
  const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const endOfDay = (d) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };

  switch (preset) {
    case 'today':
      return { from: startOfDay(now), to: endOfDay(now) };
    case 'yesterday': {
      const y = new Date(now); y.setDate(y.getDate() - 1);
      return { from: startOfDay(y), to: endOfDay(y) };
    }
    case 'this_week': {
      const mon = new Date(now); mon.setDate(now.getDate() - ((now.getDay() + 6) % 7));
      return { from: startOfDay(mon), to: endOfDay(now) };
    }
    case 'last_week': {
      const thisMonday = new Date(now); thisMonday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
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

// ─── GET ALL BOOKINGS ─────────────────────────────────────────────────────────
exports.getAllBookings = async (req, res) => {
  try {
    const {
      status, roomNumber, bookingType, room_type, shift,
      dateField, preset, from, to, search,
      limit: limitStr, cursor,
    } = req.query;

    const filter = {};
    if (status)      filter.status = status;
    if (bookingType) filter.bookingType = bookingType;
    if (room_type)   filter.room_type = room_type;
    if (shift)       filter.shift = shift;
    if (roomNumber)  filter.roomNumber = roomNumber;

    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      filter.$or = [
        { guestName: regex }, { guestPhone: regex },
        { roomNumber: regex }, { guestId: regex },
      ];
    }

    const field = ['checkIn', 'checkOut', 'createdAt'].includes(dateField) ? dateField : 'checkIn';
    let dateRange = preset ? parseDatePreset(preset) : (from || to) ? { from: from ? new Date(from) : null, to: to ? new Date(to) : null } : null;
    if (dateRange) {
      filter[field] = {};
      if (dateRange.from) filter[field].$gte = dateRange.from;
      if (dateRange.to)   filter[field].$lte = dateRange.to;
    }

    let PAGE_LIMIT = Math.min(parseInt(limitStr) || 30, 100);
    if (limitStr === 'none' || parseInt(limitStr) === -1) PAGE_LIMIT = 100000;
    if (cursor) filter._id = { $lt: cursor };

    const bookings = await Booking.find(filter).sort({ _id: -1 }).limit(PAGE_LIMIT + 1);
    const hasMore = bookings.length > PAGE_LIMIT;
    if (hasMore) bookings.pop();

    res.json({ data: bookings, hasMore, nextCursor: hasMore ? bookings[bookings.length - 1]._id : null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─── GET BOOKING BY ID ────────────────────────────────────────────────────────
exports.getBookingById = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id).populate('room');
    if (!booking) return res.status(404).json({ error: 'Không tìm thấy booking' });
    res.json(booking);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─── CHECK-IN ─────────────────────────────────────────────────────────────────
exports.checkIn = async (req, res) => {
  try {
    const {
      roomId, roomNumber, guestName, guestPhone, guestId,
      bookingType, shift, expectedCheckOut, notes, services, deposit,
      lydocutru, nhaplydo
    } = req.body;

    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ error: 'Không tìm thấy phòng' });
    if (room.status === 'occupied') return res.status(400).json({ error: 'Phòng đang có khách' });

    const priceConfig = await PriceConfig.findOne({ isActive: true });
    if (!priceConfig) return res.status(400).json({ error: 'Chưa cấu hình bảng giá' });

    // Lấy giá gốc tại thời điểm check-in (overnight/fullday luôn dùng dayShift)
    const dayPrices = priceConfig.dayShift[room.type === 'double' ? 'double' : 'single'];
    const nightPrices = priceConfig.nightShift[room.type === 'double' ? 'double' : 'single'];

    let basePrice = 0;
    if (bookingType === 'fullday') {
      basePrice = dayPrices.fullday ?? 0;
    } else if (bookingType === 'overnight') {
      basePrice = dayPrices.overnight ?? 0;
    } else if (bookingType === 'hourly') {
      basePrice = shift === 'night'
        ? (nightPrices.hourly_first ?? 0)
        : (dayPrices.hourly_first ?? dayPrices.hourly_2h ?? 0);
    }

    const checkInTime = new Date();

    // Tính earlyCheckInCharge ngay lúc check-in để lưu vào booking
    const early = calcEarlyCheckIn(bookingType, checkInTime, dayPrices, priceConfig);

    // expectedCheckOut mặc định: đầu ngày hôm sau (0h)
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
      earlyCheckInCharge: early.earlyCheckInCharge,
      services: services || [],
      deposit: deposit || 0,
      status: 'active',
      notes: notes || '',
      room_type: room.type,
      lydocutru: lydocutru || '',
      nhaplydo: nhaplydo || '',
    });
    await booking.save();

    room.status = 'occupied';
    await room.save();

    res.status(201).json(booking);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// ─── CHECK-OUT ────────────────────────────────────────────────────────────────
exports.checkOut = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.bookingId).populate('room');
    if (!booking) return res.status(404).json({ error: 'Không tìm thấy booking' });
    if (booking.status !== 'active') return res.status(400).json({ error: 'Booking không active' });

    const priceConfig = await PriceConfig.findOne({ isActive: true });
    booking.checkOut = new Date();
    booking.services = req.body.services || booking.services;
    booking.notes = req.body.notes || booking.notes;

    const result = calculateAmount(
      { ...booking.toObject(), room_type: booking.room?.type || 'single' },
      priceConfig
    );

    booking.basePrice          = result.basePrice;
    booking.earlyCheckInCharge = result.earlyCheckInCharge;
    booking.extraCharge        = result.extraCharge;
    booking.extraHours         = result.extraHours;
    booking.servicesCharge     = result.servicesCharge;
    booking.totalAmount        = result.totalAmount;
    booking.status             = 'completed';
    await booking.save();

    const room = await Room.findById(booking.room);
    if (room) { room.status = 'cleaning'; await room.save(); }

    res.json(booking);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// ─── UPDATE BOOKING ───────────────────────────────────────────────────────────
exports.updateBooking = async (req, res) => {
  try {
    if (req.body.is_reported && req.user) {
      const User = require('../auth/auth.model');
      const user = await User.findById(req.user.id);
      if (user) req.body.reported_by = user.username;
    }
    const booking = await Booking.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!booking) return res.status(404).json({ error: 'Không tìm thấy booking' });
    res.json(booking);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// ─── CHANGE ROOM ──────────────────────────────────────────────────────────────
exports.changeRoom = async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.bookingId).populate('room');
    if (!booking) return res.status(404).json({ error: 'Không tìm thấy booking' });
    if (booking.status !== 'active') return res.status(400).json({ error: 'Booking không active' });

    const { newRoomId } = req.body;
    if (!newRoomId) return res.status(400).json({ error: 'Thiếu newRoomId' });

    const newRoom = await Room.findById(newRoomId);
    if (!newRoom) return res.status(404).json({ error: 'Không tìm thấy phòng mới' });
    if (newRoom.status !== 'available') return res.status(400).json({ error: 'Phòng mới không trống, không thể đổi' });
    if (newRoom._id.toString() === booking.room._id.toString()) {
      return res.status(400).json({ error: 'Phòng mới trùng với phòng hiện tại' });
    }

    // Cập nhật phòng cũ → cleaning
    const oldRoom = await Room.findById(booking.room._id);
    if (oldRoom) { oldRoom.status = 'cleaning'; await oldRoom.save(); }

    // Cập nhật phòng mới → occupied
    newRoom.status = 'occupied';
    await newRoom.save();

    // Cập nhật booking
    booking.room = newRoom._id;
    booking.roomNumber = newRoom.roomNumber;
    await booking.save();

    res.json({
      message: `Đã đổi phòng sang ${newRoom.roomNumber}`,
      booking,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// ─── REVENUE STATS ────────────────────────────────────────────────────────────
exports.getRevenueStats = async (req, res) => {
  try {
    const { from, to } = req.query;
    const filter = { status: 'completed' };
    if (from || to) {
      filter.checkOut = {};
      if (from) filter.checkOut.$gte = new Date(from);
      if (to)   filter.checkOut.$lte = new Date(to);
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
