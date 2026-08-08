const mongoose = require('mongoose');

const inventorySlipSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true }, // Mã phiếu: NK20260808-001 hoặc XK20260808-001
  type: { type: String, enum: ['import', 'export'], required: true }, // import: Nhập kho, export: Xuất kho
  date: { type: Date, default: Date.now },
  items: [{
    serviceId: { type: mongoose.Schema.Types.ObjectId },
    serviceName: { type: String, required: true },
    unit: { type: String, default: 'cái' },
    price: { type: Number, default: 0 },
    quantity: { type: Number, required: true, min: 1 },
    totalAmount: { type: Number, default: 0 },
  }],
  totalQuantity: { type: Number, default: 0 },
  totalAmount: { type: Number, default: 0 },
  notes: { type: String, default: '' },
  roomNumber: { type: String, default: '' },
  bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
  created_by: { type: String, default: 'Hệ thống' },
}, { timestamps: true });

module.exports = mongoose.model('InventorySlip', inventorySlipSchema);
