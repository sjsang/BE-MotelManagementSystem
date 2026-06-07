const invoiceSchema = new mongoose.Schema({
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
    invoiceNumber: { type: String, required: true, unique: true }, // VD: INV-20240607-001

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
    paidAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },

    services: [{ name: String, price: Number, quantity: Number }],

    paymentMethod: { type: String, enum: ['cash', 'transfer', 'card'], default: 'cash' },
    status: { type: String, enum: ['issued', 'cancelled'], default: 'issued' },

    issuedAt: { type: Date, default: Date.now },
    issuedBy: { type: String, default: '' },
    notes: { type: String, default: '' },
}, { timestamps: true });