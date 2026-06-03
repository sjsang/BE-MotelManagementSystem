const mongoose = require('mongoose');

const priceConfigSchema = new mongoose.Schema({
  name: { type: String, default: 'Bảng giá mặc định' },
  isActive: { type: Boolean, default: true },

  // CA NGÀY (5h - 23h)
  dayShift: {
    single: {
      fullday: { type: Number, default: 300000 },      // Ngày đêm 24h
      overnight: { type: Number, default: 200000 },    // Qua đêm 18h-8h
      hourly_first: { type: Number, default: 80000 },  // <= 30 phút
      hourly_2h: { type: Number, default: 100000 },    // 30 phút đến 2h
      hourly_extra: { type: Number, default: 20000 },  // Mỗi giờ thêm sau 2h
    },
    double: {
      fullday: { type: Number, default: 450000 },
      overnight: { type: Number, default: 350000 },
      hourly_2h: { type: Number, default: 150000 },
      hourly_extra: { type: Number, default: 30000 },
    }
  },

  // CA ĐÊM (23h - 5h)
  nightShift: {
    single: {
      hourly_first: { type: Number, default: 120000 }, // Giờ đầu
      hourly_extra: { type: Number, default: 40000 },  // Mỗi giờ thêm
    },
    double: {
      hourly_first: { type: Number, default: 150000 },
      hourly_extra: { type: Number, default: 50000 },
    }
  },

  // Phụ thu check-in sớm / check-out muộn
  lateEarlyFee: { type: Number, default: 20000 }, // /giờ

  // Dịch vụ
  services: [{
    name: String,
    price: Number,
    unit: String
  }],

  // Áp dụng từ ngày / đến ngày (null = không giới hạn)
  validFrom: { type: Date, default: null },
  validTo: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('PriceConfig', priceConfigSchema);
