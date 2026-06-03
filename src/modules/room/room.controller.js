const Room = require('../room/room.model');
const Booking = require('../booking/booking.model');

// GET all rooms with current booking info
exports.getAllRooms = async (req, res) => {
  try {
    const rooms = await Room.find().sort({ floor: 1, roomNumber: 1 });
    const activeBookings = await Booking.find({ status: 'active' });
    const bookingMap = {};
    activeBookings.forEach(b => { bookingMap[b.roomNumber] = b; });

    const result = rooms.map(r => ({
      ...r.toObject(),
      currentBooking: bookingMap[r.roomNumber] || null
    }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET single room
exports.getRoomById = async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);
    if (!room) return res.status(404).json({ error: 'Không tìm thấy phòng' });
    const booking = await Booking.findOne({ roomNumber: room.roomNumber, status: 'active' });
    res.json({ ...room.toObject(), currentBooking: booking });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST create room
exports.createRoom = async (req, res) => {
  try {
    const room = new Room(req.body);
    await room.save();
    res.status(201).json(room);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// PUT update room
exports.updateRoom = async (req, res) => {
  try {
    const room = await Room.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!room) return res.status(404).json({ error: 'Không tìm thấy phòng' });
    res.json(room);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// DELETE room
exports.deleteRoom = async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);
    if (!room) return res.status(404).json({ error: 'Không tìm thấy phòng' });
    const active = await Booking.findOne({ roomNumber: room.roomNumber, status: 'active' });
    if (active) return res.status(400).json({ error: 'Phòng đang có khách, không thể xóa' });
    await Room.findByIdAndDelete(req.params.id);
    res.json({ message: 'Đã xóa phòng' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};