const Customer = require('./customer.model');

// Dữ liệu mẫu dùng cho dropdowns ở frontend
const nationalities = [
    'Việt Nam', 'Mỹ', 'Anh', 'Pháp', 'Đức', 'Nhật Bản', 'Hàn Quốc', 'Trung Quốc',
    'Đài Loan', 'Nga', 'Úc', 'Canada', 'Singapore', 'Thái Lan', 'Malaysia', 'Khác'
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
    'DL (Du lịch)', 'DN1 (Doanh nghiệp nước ngoài)', 'DN2 (Doanh nghiệp nội địa)',
    'LĐ1 (Lao động có chứng nhận)', 'LĐ2 (Lao động không chứng nhận)',
    'TT (Thăm thân)', 'VR (Việc riêng)', 'Khác'
];

// Trả về dữ liệu dropdown
const getCustomerOptions = async (req, res) => {
    try {
        res.status(200).json({ nationalities, provinces, visaTypes });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi khi lấy danh sách cấu hình', error: error.message });
    }
};

// Lấy tất cả khách hàng — hỗ trợ lọc phía server + cursor-based & page-based pagination
const getAllCustomers = async (req, res) => {
    try {
        const {
            search,       // tìm theo hoten / cccd / passport
            quoctich,     // 'Việt Nam' | tên quốc tịch khác | 'nuoc-ngoai' (không phải VN)
            gioitinh,     // 'Nam' | 'Nữ'
            limit: limitStr,
            cursor,       // _id cuối cùng của trang trước
            page: pageStr, // số trang cần tải
            sort,         // 'name' hoặc 'hoten' để sắp xếp theo bảng chữ cái
        } = req.query;

        let PAGE_LIMIT = Math.min(parseInt(limitStr) || 30, 100);
        if (limitStr === 'none' || parseInt(limitStr) === -1) {
            PAGE_LIMIT = 100000;
        }
        const filter = {};

        // ── Tìm kiếm text ──────────────────────────────────────────────
        if (search && search.trim()) {
            const regex = new RegExp(search.trim(), 'i');
            filter.$or = [
                { hoten:    regex },
                { cccd:     regex },
                { passport: regex },
            ];
        }

        // ── Quốc tịch ─────────────────────────────────────────────────
        if (quoctich) {
            if (quoctich === 'nuoc-ngoai') {
                filter.quoctich = { $ne: 'Việt Nam' };
            } else {
                filter.quoctich = quoctich;
            }
        }

        // ── Giới tính ─────────────────────────────────────────────────
        if (gioitinh && ['Nam', 'Nữ'].includes(gioitinh)) {
            filter.gioitinh = gioitinh;
        }

        // Sắp xếp: theo thứ tự thêm vào hệ thống (mới nhất lên đầu)
        let sortObj = { _id: -1 };

        let resultCustomers = [];
        let hasMore = false;
        let nextCursor = null;
        let nextPage = null;

        if (pageStr) {
            const page = parseInt(pageStr) || 1;
            const skip = (page - 1) * PAGE_LIMIT;
            resultCustomers = await Customer.find(filter)
                .sort(sortObj)
                .skip(skip)
                .limit(PAGE_LIMIT + 1);
            
            hasMore = resultCustomers.length > PAGE_LIMIT;
            if (hasMore) resultCustomers.pop();
            nextPage = hasMore ? page + 1 : null;
        } else {
            // Cursor-based pagination fallback
            if (cursor && sortObj._id === -1) {
                filter._id = { $lt: cursor };
            }
            resultCustomers = await Customer.find(filter)
                .sort(sortObj)
                .limit(PAGE_LIMIT + 1);

            hasMore = resultCustomers.length > PAGE_LIMIT;
            if (hasMore) resultCustomers.pop();
            nextCursor = hasMore ? resultCustomers[resultCustomers.length - 1]._id : null;
        }

        res.status(200).json({ 
            data: resultCustomers, 
            hasMore, 
            nextCursor, 
            nextPage 
        });
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
        const { hoten, gioitinh, ngaythangnamsinh, quoctich, cccd, ngaycap, noicap, thuongtru, passport, visaType, visaExpiredDate, entryDate } = req.body;

        if (!hoten || !hoten.trim()) {
            return res.status(400).json({ message: 'Vui lòng điền họ và tên khách hàng' });
        }
        if (gioitinh && !['Nam', 'Nữ', '', null].includes(gioitinh)) {
            return res.status(400).json({ message: 'Giới tính phải là Nam hoặc Nữ' });
        }

        const customerData = {
            hoten: hoten.trim(),
            gioitinh: gioitinh || undefined,
            ngaythangnamsinh: ngaythangnamsinh || undefined,
            quoctich: quoctich || 'Việt Nam'
        };

        if (cccd && cccd.trim()) {
            const existingCCCD = await Customer.findOne({ cccd: cccd.trim() });
            if (existingCCCD) {
                return res.status(400).json({ message: 'Số CCCD đã tồn tại trong hệ thống' });
            }
            customerData.cccd = cccd.trim();
        }
        if (ngaycap) customerData.ngaycap = ngaycap;
        if (noicap) customerData.noicap = noicap;
        if (thuongtru) customerData.thuongtru = thuongtru;

        if (passport && passport.trim()) {
            const existingPassport = await Customer.findOne({ passport: passport.trim() });
            if (existingPassport) {
                return res.status(400).json({ message: 'Số Hộ chiếu đã tồn tại trong hệ thống' });
            }
            customerData.passport = passport.trim();
        }
        if (visaType) customerData.visaType = visaType;
        if (visaExpiredDate) customerData.visaExpiredDate = visaExpiredDate;
        if (entryDate) customerData.entryDate = entryDate;

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
        const { hoten, gioitinh, ngaythangnamsinh, quoctich, cccd, ngaycap, noicap, thuongtru, passport, visaType, visaExpiredDate, entryDate } = req.body;

        const currentCustomer = await Customer.findById(id);
        if (!currentCustomer) {
            return res.status(404).json({ message: 'Không tìm thấy khách hàng' });
        }
        if (!hoten || !hoten.trim()) {
            return res.status(400).json({ message: 'Vui lòng điền họ và tên khách hàng' });
        }
        if (gioitinh && !['Nam', 'Nữ', '', null].includes(gioitinh)) {
            return res.status(400).json({ message: 'Giới tính phải là Nam hoặc Nữ' });
        }

        if (cccd && cccd.trim()) {
            const existingCCCD = await Customer.findOne({ cccd: cccd.trim(), _id: { $ne: id } });
            if (existingCCCD) {
                return res.status(400).json({ message: 'Số CCCD đã tồn tại trong hệ thống' });
            }
        }

        if (passport && passport.trim()) {
            const existingPassport = await Customer.findOne({ passport: passport.trim(), _id: { $ne: id } });
            if (existingPassport) {
                return res.status(400).json({ message: 'Số Hộ chiếu đã tồn tại trong hệ thống' });
            }
        }

        const updateData = {
            hoten: hoten.trim(),
            gioitinh: gioitinh || null,
            ngaythangnamsinh: ngaythangnamsinh || null,
            quoctich: quoctich || 'Việt Nam',
            cccd: cccd ? cccd.trim() : null,
            ngaycap: ngaycap || null,
            noicap: noicap || null,
            thuongtru: thuongtru || null,
            passport: passport ? passport.trim() : null,
            visaType: visaType || null,
            visaExpiredDate: visaExpiredDate || null,
            entryDate: entryDate || null
        };

        const updatedCustomer = await Customer.findByIdAndUpdate(id, updateData, { new: true, runValidators: true });
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

module.exports = { getCustomerOptions, getAllCustomers, getCustomerById, createCustomer, updateCustomer, deleteCustomer };
