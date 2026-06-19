const mongoose = require('mongoose');
const invoiceSchema = new mongoose.Schema({
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
    invoiceNumber: { type: String, required: true, unique: true },

    // Snapshot thông tin tại thời điểm xuất (tránh bị ảnh hưởng nếu booking bị sửa)
    roomNumber: { type: String, required: true },
    roomType: { type: String, enum: ['single', 'double'] },
    guestName: { type: String, required: true },
    guestPhone: { type: String, default: '' },
    guestId: { type: String, default: '' },

    checkIn: { type: Date },
    checkOut: { type: Date },
    bookingType: { type: String, enum: ['hourly', 'overnight', 'fullday'] },
    shift: { type: String, enum: ['day', 'night'] },

    basePrice: { type: Number, default: 0 },
    extraCharge: { type: Number, default: 0 },
    servicesCharge: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    payableAmount: { type: Number, default: 0 }, // <-- Trường bổ sung mới
    deposit: { type: Number, default: 0 },
    paidAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    services: [{ name: String, price: Number, quantity: Number }],

    status: { type: String, enum: ['issued', 'cancelled'], default: 'issued' },

    issuedAt: { type: Date, default: Date.now },
    issuedBy: { type: String, default: '' },
    notes: { type: String, default: '' },
}, { timestamps: true });
// Các field thường filter/sort
invoiceSchema.index({ booking: 1 });           // getInvoiceById populate
invoiceSchema.index({ issuedAt: -1 });         // sort mới nhất trước
invoiceSchema.index({ status: 1, issuedAt: -1 }); // filter status + sort
invoiceSchema.index({ roomNumber: 1, issuedAt: -1 }); // filter theo phòng
invoiceSchema.index({ guestName: 'text' });    // text search tên khách
module.exports = mongoose.model('Invoice', invoiceSchema);