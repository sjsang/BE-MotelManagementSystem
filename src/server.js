require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());

// Routes
app.use('/api/rooms', require('../src/modules/room/room.routes'));
app.use('/api/bookings', require('../src/modules/booking/booking.routes'));
app.use('/api/prices', require('../src/modules/price/price.routes'));
app.use('/api/auth', require('../src/modules/auth/auth.routes'));
app.use('/api/customers', require('../src/modules/customer/customer.routes'));

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

// Seed initial rooms if none exist
async function seedRooms() {
  const Room = require('./modules/room/room.model');
  
  // Tự động xóa index 'code_1' cũ nếu còn sót lại từ schema cũ để tránh lỗi trùng lặp khi seed
  try {
    await Room.collection.dropIndex('code_1');
    console.log('✅ Đã xóa index code_1 cũ thành công');
  } catch (err) {
    // Bỏ qua nếu index không tồn tại hoặc collection chưa khởi tạo
  }

  const count = await Room.countDocuments();
  if (count === 0) {
    const rooms = [];
    // Tầng 1: phòng đơn 101-105
    for (let i = 1; i <= 5; i++) rooms.push({ roomNumber: `10${i}`, type: 'single', floor: 1 });
    // Tầng 1: phòng đôi 106-108
    for (let i = 6; i <= 8; i++) rooms.push({ roomNumber: `10${i}`, type: 'double', floor: 1 });
    // Tầng 2: phòng đơn 201-205
    for (let i = 1; i <= 5; i++) rooms.push({ roomNumber: `20${i}`, type: 'single', floor: 2 });
    // Tầng 2: phòng đôi 206-208
    for (let i = 6; i <= 8; i++) rooms.push({ roomNumber: `20${i}`, type: 'double', floor: 2 });
    await Room.insertMany(rooms);
    console.log('✅ Đã tạo dữ liệu phòng mẫu');
  }
}

const PORT = process.env.PORT || 8080;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/motel_manager';

mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log('✅ Kết nối MongoDB thành công');
    await seedRooms();
    app.listen(PORT, () => console.log(`🚀 Server chạy tại http://localhost:${PORT}`));
  })
  .catch(err => {
    console.error('❌ Lỗi kết nối MongoDB:', err.message);
    process.exit(1);
  });
