const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
    code: {
        type: String,
        required: true,
        unique: true
    },
    pricePerHour: {
        type: Number,
        required: true
    },
    pricePerDay: {
        type: Number,
        required: true
    },
    status: {
        type: String,
        enum: ['AVAILABLE', 'OCCUPIED', 'CLEANING'],
        default: 'AVAILABLE'
    },
    currentBooking: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Booking',
        default: null
    }
}, { timestamps: true });

const Room = mongoose.model('Room', roomSchema);

module.exports = Room;