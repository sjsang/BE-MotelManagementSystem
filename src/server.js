require('dotenv').config();
const express = require('express');
const cors = require('cors');

const connectDB = require('./config/db');
connectDB();

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());

app.listen(process.env.PORT || 5000, () => {
  console.log(`Server running on port ${process.env.PORT || 5000}`);
});

// Routes
app.use('/api/rooms', require('./modules/room/room.routes'));
app.use('/api/bookings', require('./modules/booking/booking.routes'));
app.use('/api/prices', require('./modules/price/price.routes'));
app.use('/api/auth', require('./modules/auth/auth.routes'));
app.use('/api/customers', require('./modules/customer/customer.routes'));
app.use('/api/invoices', require('./modules/invoice/invoice.routes'));
app.use('/api/reports', require('./modules/report/report.routes'));
app.use('/api/users', require('./modules/user/user.routes'));

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok sang', time: new Date() }));

// Bên dưới để deploy, đừng xóa
// const path = require("path");

// app.use(express.static(path.join(__dirname, "dist")));

// app.use((req, res) => {
//   res.sendFile(path.join(__dirname, "dist", "index.html"));
// });