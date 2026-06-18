const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
    hoten: {
        type: String,
        required: true,
        trim: true
    },
    gioitinh: {
        type: String,
        enum: ['Nam', 'Nữ', '', null],
        required: false
    },
    ngaythangnamsinh: {
        type: Date,
        required: false
    },
    quoctich: {
        type: String,
        required: false,
        default: 'Việt Nam',
        trim: true
    },
    // Dành cho quốc tịch Việt Nam
    cccd: {
        type: String,
        trim: true
    },
    ngaycap: {
        type: Date
    },
    noicap: {
        type: String,
        trim: true
    },
    thuongtru: {
        type: String,
        trim: true
    },
    // Dành cho người nước ngoài
    passport: {
        type: String,
        trim: true
    },
    visaType: {
        type: String,
        trim: true
    },
    visaExpiredDate: {
        type: Date
    },
    entryDate: {
        type: Date
    }
}, { 
    collection: 'khachhangs', 
    timestamps: true 
});

const Customer = mongoose.model('Customer', customerSchema);

module.exports = Customer;
