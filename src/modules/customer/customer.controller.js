const Customer = require('./customer.model');

// Dữ liệu mẫu dùng cho dropdowns ở frontend
const nationalities = [
    'Việt Nam',
    'Mỹ',
    'Anh',
    'Pháp',
    'Đức',
    'Nhật Bản',
    'Hàn Quốc',
    'Trung Quốc',
    'Đài Loan',
    'Nga',
    'Úc',
    'Canada',
    'Singapore',
    'Thái Lan',
    'Malaysia',
    'Khác'
];

const provinces = [
    'An Giang', 'Bà Rịa - Vũng Tàu', 'Bắc Giang', 'Bắc Kạn', 'Bạc Liêu', 'Bắc Ninh', 'Bến Tre', 'Bình Định', 
    'Bình Dương', 'Bình Phước', 'Bình Thuận', 'Cà Mau', 'Cần Thơ', 'Cao Bằng', 'Đà Nẵng', 'Đắk Lắk', 
    'Đắk Nông', 'Điện Biên', 'Đồng Nai', 'Đồng Tháp', 'Gia Lai', 'Hà Giang', 'Hà Nam', 'Hà Nội', 
    'Hà Tĩnh', 'Hải Dương', 'Hải Phòng', 'Hậu Giang', 'Hòa Bình', 'Hưng Yên', 'Khánh Hòa', 'Kiên Giang', 
    'Kon Tum', 'Lai Châu', 'Lâm Đồng', 'Lạng Sơn', 'Lào Cai', 'Long An', 'Nam Định', 'Nghệ An', 
    'Ninh Bình', 'Ninh Thuận', 'Phú Thọ', 'Phú Yên', 'Quảng Bình', 'Quảng Nam', 'Quảng Ngãi', 'Quảng Ninh', 
    'Quảng Trị', 'Sóc Trăng', 'Sơn La', 'Tây Ninh', 'Thái Bình', 'Thái Nguyên', 'Thanh Hóa', 'Thừa Thiên Huế', 
    'Tiền Giang', 'TP. Hồ Chí Minh', 'Trà Vinh', 'Tuyên Quang', 'Vĩnh Long', 'Vĩnh Phúc', 'Yên Bái'
];

const visaTypes = [
    'DL (Du lịch)',
    'DN1 (Doanh nghiệp nước ngoài)',
    'DN2 (Doanh nghiệp nội địa)',
    'LĐ1 (Lao động có chứng nhận)',
    'LĐ2 (Lao động không chứng nhận)',
    'TT (Thăm thân)',
    'VR (Việc riêng)',
    'Khác'
];

// Trả về dữ liệu dropdown
const getCustomerOptions = async (req, res) => {
    try {
        res.status(200).json({
            nationalities,
            provinces,
            visaTypes
        });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi khi lấy danh sách cấu hình', error: error.message });
    }
};

// Lấy tất cả khách hàng
const getAllCustomers = async (req, res) => {
    try {
        const customers = await Customer.find().sort({ createdAt: -1 });
        res.status(200).json(customers);
    } catch (error) {
        res.status(500).json({ message: 'Lỗi khi lấy danh sách khách lưu trú', error: error.message });
    }
};

// Lấy chi tiết khách hàng theo ID
const getCustomerById = async (req, res) => {
    try {
        const { id } = req.params;
        const customer = await Customer.findById(id);
        if (!customer) {
            return res.status(404).json({ message: 'Không tìm thấy khách hàng' });
        }
        res.status(200).json(customer);
    } catch (error) {
        res.status(500).json({ message: 'Lỗi khi lấy thông tin khách hàng', error: error.message });
    }
};

// Tạo mới khách lưu trú
const createCustomer = async (req, res) => {
    try {
        const {
            hoten,
            gioitinh,
            ngaythangnamsinh,
            quoctich,
            cccd,
            ngaycap,
            noicap,
            thuongtru,
            passport,
            visaType,
            visaExpiredDate,
            entryDate
        } = req.body;

        // Kiểm tra các trường chung bắt buộc
        if (!hoten || !gioitinh || !ngaythangnamsinh || !quoctich) {
            return res.status(400).json({ message: 'Vui lòng điền đầy đủ các thông tin bắt buộc (Họ tên, Giới tính, Ngày sinh, Quốc tịch)' });
        }

        if (!['Nam', 'Nữ'].includes(gioitinh)) {
            return res.status(400).json({ message: 'Giới tính phải là Nam hoặc Nữ' });
        }

        const customerData = {
            hoten,
            gioitinh,
            ngaythangnamsinh,
            quoctich
        };

        // Phân nhánh logic kiểm tra dữ liệu theo Quốc tịch
        if (quoctich === 'Việt Nam') {
            if (!cccd || !thuongtru) {
                return res.status(400).json({ message: 'Đối với quốc tịch Việt Nam, vui lòng nhập đầy đủ Số CCCD và Địa chỉ thường trú' });
            }
            // Kiểm tra trùng CCCD
            const existingCCCD = await Customer.findOne({ cccd });
            if (existingCCCD) {
                return res.status(400).json({ message: 'Số CCCD đã tồn tại trong hệ thống' });
            }
            customerData.cccd = cccd;
            customerData.ngaycap = ngaycap;
            customerData.noicap = noicap;
            customerData.thuongtru = thuongtru;
        } else {
            if (!passport || !visaType || !visaExpiredDate || !entryDate) {
                return res.status(400).json({ message: 'Đối với người nước ngoài, vui lòng nhập đầy đủ thông tin Hộ chiếu, Loại Visa, Ngày hết hạn Visa, và Ngày nhập cảnh' });
            }
            // Kiểm tra trùng Passport
            const existingPassport = await Customer.findOne({ passport });
            if (existingPassport) {
                return res.status(400).json({ message: 'Số Hộ chiếu đã tồn tại trong hệ thống' });
            }
            customerData.passport = passport;
            customerData.visaType = visaType;
            customerData.visaExpiredDate = visaExpiredDate;
            customerData.entryDate = entryDate;
        }

        const newCustomer = new Customer(customerData);
        await newCustomer.save();
        res.status(201).json(newCustomer);
    } catch (error) {
        res.status(500).json({ message: 'Lỗi khi thêm khách hàng', error: error.message });
    }
};

// Cập nhật thông tin khách lưu trú
const updateCustomer = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            hoten,
            gioitinh,
            ngaythangnamsinh,
            quoctich,
            cccd,
            ngaycap,
            noicap,
            thuongtru,
            passport,
            visaType,
            visaExpiredDate,
            entryDate
        } = req.body;

        // Tìm khách hàng hiện tại
        const currentCustomer = await Customer.findById(id);
        if (!currentCustomer) {
            return res.status(404).json({ message: 'Không tìm thấy khách hàng' });
        }

        // Kiểm tra các trường chung bắt buộc
        if (!hoten || !gioitinh || !ngaythangnamsinh || !quoctich) {
            return res.status(400).json({ message: 'Vui lòng điền đầy đủ các thông tin bắt buộc (Họ tên, Giới tính, Ngày sinh, Quốc tịch)' });
        }

        if (!['Nam', 'Nữ'].includes(gioitinh)) {
            return res.status(400).json({ message: 'Giới tính phải là Nam hoặc Nữ' });
        }

        const updateData = {
            hoten,
            gioitinh,
            ngaythangnamsinh,
            quoctich
        };

        // Phân nhánh logic kiểm tra dữ liệu theo Quốc tịch mới cập nhật
        if (quoctich === 'Việt Nam') {
            if (!cccd || !thuongtru) {
                return res.status(400).json({ message: 'Đối với quốc tịch Việt Nam, vui lòng nhập đầy đủ Số CCCD và Địa chỉ thường trú' });
            }
            // Kiểm tra trùng CCCD
            const existingCCCD = await Customer.findOne({ cccd, _id: { $ne: id } });
            if (existingCCCD) {
                return res.status(400).json({ message: 'Số CCCD đã tồn tại trong hệ thống' });
            }
            updateData.cccd = cccd;
            updateData.ngaycap = ngaycap;
            updateData.noicap = noicap;
            updateData.thuongtru = thuongtru;

            // Xóa thông tin cũ nước ngoài để đồng bộ
            updateData.passport = null;
            updateData.visaType = null;
            updateData.visaExpiredDate = null;
            updateData.entryDate = null;
        } else {
            if (!passport || !visaType || !visaExpiredDate || !entryDate) {
                return res.status(400).json({ message: 'Đối với người nước ngoài, vui lòng nhập đầy đủ thông tin Hộ chiếu, Loại Visa, Ngày hết hạn Visa, và Ngày nhập cảnh' });
            }
            // Kiểm tra trùng Passport
            const existingPassport = await Customer.findOne({ passport, _id: { $ne: id } });
            if (existingPassport) {
                return res.status(400).json({ message: 'Số Hộ chiếu đã tồn tại trong hệ thống' });
            }
            updateData.passport = passport;
            updateData.visaType = visaType;
            updateData.visaExpiredDate = visaExpiredDate;
            updateData.entryDate = entryDate;

            // Xóa thông tin cũ Việt Nam để đồng bộ
            updateData.cccd = null;
            updateData.ngaycap = null;
            updateData.noicap = null;
            updateData.thuongtru = null;
        }

        const updatedCustomer = await Customer.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        );

        res.status(200).json(updatedCustomer);
    } catch (error) {
        res.status(500).json({ message: 'Lỗi khi cập nhật khách hàng', error: error.message });
    }
};

// Xóa khách lưu trú
const deleteCustomer = async (req, res) => {
    try {
        const { id } = req.params;
        const deletedCustomer = await Customer.findByIdAndDelete(id);
        if (!deletedCustomer) {
            return res.status(404).json({ message: 'Không tìm thấy khách hàng' });
        }
        res.status(200).json({ message: 'Xóa khách hàng thành công' });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi khi xóa khách hàng', error: error.message });
    }
};

module.exports = {
    getCustomerOptions,
    getAllCustomers,
    getCustomerById,
    createCustomer,
    updateCustomer,
    deleteCustomer
};
