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
        default: 'VNM - Viet Nam',
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
    },
    diachichitiet: {
        type: String,
        trim: true
    },
    diachichitietcu: {
        type: String,
        trim: true
    },
    loaigiayto: {
        type: String,
        trim: true
    },
    tengiayto: {
        type: String,
        trim: true
    },
    noicutruhiennay: {
        type: String,
        trim: true
    },
    sodienthoai: {
        type: String,
        trim: true
    },
    thuongtrumoi: {
        type: String,
        trim: true
    },
    thuongtrucu: {
        type: String,
        trim: true
    },
    diachichitietmoi: {
        type: String,
        trim: true
    }
}, {
    collection: 'khachhangs',
    timestamps: true
});

const Customer = mongoose.model('Customer', customerSchema);

module.exports = Customer;
