const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
  roomNumber: { type: String, required: true },
  guestName: { type: String, required: true },
  guestPhone: { type: String, default: '' },
  guestId: { type: String, default: '' }, // CMND/CCCD

  // Loại đặt phòng
  bookingType: {
    type: String,
    enum: ['hourly', 'overnight', 'fullday'],
    // hourly: nghỉ giờ, overnight: qua đêm, fullday: ngày đêm 24h
    required: true
  },
  shift: { type: String, enum: ['day', 'night'], default: 'day' }, // ca ngày / ca đêm

  checkIn: { type: Date, required: true },
  checkOut: { type: Date }, // null nếu chưa check out
  expectedCheckOut: { type: Date }, // dự kiến trả phòng

  basePrice: { type: Number, required: true },    // giá gốc
  extraHours: { type: Number, default: 0 },        // số giờ phụ thu
  extraCharge: { type: Number, default: 0 },       // tiền phụ thu
  servicesCharge: { type: Number, default: 0 },    // dịch vụ thêm
  totalAmount: { type: Number, default: 0 },       // tổng tiền

  services: [{
    name: String,
    price: Number,
    quantity: { type: Number, default: 1 }
  }],

  status: { type: String, enum: ['active', 'completed', 'cancelled'], default: 'active' },
  notes: { type: String, default: '' },
  is_reported: { type: Boolean, default: false },
  reported: { type: Date },
  reported_by: { type: String, default: '' },
}, { timestamps: true });

// Các field thường filter/sort
invoiceSchema.index({ booking: 1 });           // getInvoiceById populate
invoiceSchema.index({ issuedAt: -1 });         // sort mới nhất trước
invoiceSchema.index({ status: 1, issuedAt: -1 }); // filter status + sort
invoiceSchema.index({ roomNumber: 1, issuedAt: -1 }); // filter theo phòng
invoiceSchema.index({ guestName: 'text' });    // text search tên khách

module.exports = mongoose.model('Booking', bookingSchema);
