const express = require('express');
const cors = require('cors');

const authRoutes = require('./modules/auth/auth.routes');
const roomRoutes = require('./modules/room/room.routes');
const customerRoutes = require('./modules/customer/customer.routes');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/customers', customerRoutes);

module.exports = app;