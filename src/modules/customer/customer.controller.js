const fs = require('fs');
const path = require('path');
const Customer = require('./customer.model');

// Dữ liệu mẫu dùng cho dropdowns ở frontend
const nationalities = [
    "VNM - Viet Nam",
    "AFG - Afghanistan",
    "ALB - Albania",
    "DZA - Algeria",
    "AND - Andorra",
    "AGO - Angola",
    "ATG - Antigua and Barbuda",
    "ARG - Argentina",
    "ARM - Armenia",
    "AUS - Australia",
    "AUT - Austria",
    "AZE - Azerbaijan",
    "BHS - Bahamas",
    "BHR - Bahrain",
    "BGD - Bangladesh",
    "BRB - Barbados",
    "BLR - Belarus",
    "BEL - Belgium",
    "BLZ - Belize",
    "BEN - Benin",
    "BTN - Bhutan",
    "BOL - Bolivia",
    "BIH - Bosnia and Herzegovina",
    "BWA - Botswana",
    "BRA - Brazil",
    "BRN - Brunei Darussalam",
    "BGR - Bulgaria",
    "BFA - Burkina Faso",
    "BDI - Burundi",
    "CPV - Cabo Verde",
    "KHM - Cambodia",
    "CMR - Cameroon",
    "CAN - Canada",
    "CAF - Central African Republic",
    "TCD - Chad",
    "CHL - Chile",
    "CHN - China",
    "COL - Colombia",
    "COM - Comoros",
    "COG - Congo",
    "COD - Democratic Republic of the Congo",
    "CRI - Costa Rica",
    "CIV - Côte d'Ivoire",
    "HRV - Croatia",
    "CUB - Cuba",
    "CYP - Cyprus",
    "CZE - Czechia",
    "DNK - Denmark",
    "DJI - Djibouti",
    "DMA - Dominica",
    "DOM - Dominican Republic",
    "ECU - Ecuador",
    "EGY - Egypt",
    "SLV - El Salvador",
    "GNQ - Equatorial Guinea",
    "ERI - Eritrea",
    "EST - Estonia",
    "SWZ - Eswatini",
    "ETH - Ethiopia",
    "FJI - Fiji",
    "FIN - Finland",
    "FRA - France",
    "GAB - Gabon",
    "GMB - Gambia",
    "GEO - Georgia",
    "DEU - Germany",
    "GHA - Ghana",
    "GRC - Greece",
    "GRD - Grenada",
    "GTM - Guatemala",
    "GIN - Guinea",
    "GNB - Guinea-Bissau",
    "GUY - Guyana",
    "HTI - Haiti",
    "HND - Honduras",
    "HUN - Hungary",
    "ISL - Iceland",
    "IND - India",
    "IDN - Indonesia",
    "IRN - Iran (Islamic Republic of)",
    "IRQ - Iraq",
    "IRL - Ireland",
    "ISR - Israel",
    "ITA - Italy",
    "JAM - Jamaica",
    "JPN - Japan",
    "JOR - Jordan",
    "KAZ - Kazakhstan",
    "KEN - Kenya",
    "KIR - Kiribati",
    "KWT - Kuwait",
    "KGZ - Kyrgyzstan",
    "LAO - Lao People's Democratic Republic",
    "LVA - Latvia",
    "LBN - Lebanon",
    "LSO - Lesotho",
    "LBR - Liberia",
    "LBY - Libya",
    "LIE - Liechtenstein",
    "LTU - Lithuania",
    "LUX - Luxembourg",
    "MDG - Madagascar",
    "MWI - Malawi",
    "MYS - Malaysia",
    "MDV - Maldives",
    "MLI - Mali",
    "MLT - Malta",
    "MHL - Marshall Islands",
    "MRT - Mauritania",
    "MUS - Mauritius",
    "MEX - Mexico",
    "FSM - Micronesia (Federated States of)",
    "MDA - Moldova (Republic of)",
    "MCO - Monaco",
    "MNG - Mongolia",
    "MNE - Montenegro",
    "MAR - Morocco",
    "MOZ - Mozambique",
    "MMR - Myanmar",
    "NAM - Namibia",
    "NRU - Nauru",
    "NPL - Nepal",
    "NLD - Netherlands",
    "NZL - New Zealand",
    "NIC - Nicaragua",
    "NER - Niger",
    "NGA - Nigeria",
    "PRK - Democratic People's Republic of Korea",
    "MKD - North Macedonia",
    "NOR - Norway",
    "OMN - Oman",
    "PAK - Pakistan",
    "PLW - Palau",
    "PAN - Panama",
    "PNG - Papua New Guinea",
    "PRY - Paraguay",
    "PER - Peru",
    "PHL - Philippines",
    "POL - Poland",
    "PRT - Portugal",
    "QAT - Qatar",
    "KOR - Republic of Korea",
    "ROU - Romania",
    "RUS - Russian Federation",
    "RWA - Rwanda",
    "KNA - Saint Kitts and Nevis",
    "LCA - Saint Lucia",
    "VCT - Saint Vincent and the Grenadines",
    "WSM - Samoa",
    "SMR - San Marino",
    "STP - Sao Tome and Principe",
    "SAU - Saudi Arabia",
    "SEN - Senegal",
    "SRB - Serbia",
    "SYC - Seychelles",
    "SLE - Sierra Leone",
    "SGP - Singapore",
    "SVK - Slovakia",
    "SVN - Slovenia",
    "SLB - Solomon Islands",
    "SOM - Somalia",
    "ZAF - South Africa",
    "SSD - South Sudan",
    "ESP - Spain",
    "LKA - Sri Lanka",
    "SDN - Sudan",
    "SUR - Suriname",
    "SWE - Sweden",
    "CHE - Switzerland",
    "SYR - Syrian Arab Republic",
    "TJK - Tajikistan",
    "THA - Thailand",
    "TLS - Timor-Leste",
    "TGO - Togo",
    "TON - Tonga",
    "TTO - Trinidad and Tobago",
    "TUN - Tunisia",
    "TUR - Türkiye",
    "TKM - Turkmenistan",
    "TUV - Tuvalu",
    "UGA - Uganda",
    "UKR - Ukraine",
    "ARE - United Arab Emirates",
    "GBR - United Kingdom of Great Britain and Northern Ireland",
    "TZA - United Republic of Tanzania",
    "USA - United States of America",
    "URY - Uruguay",
    "UZB - Uzbekistan",
    "VUT - Vanuatu",
    "VEN - Venezuela (Bolivarian Republic of)",
    "YEM - Yemen",
    "ZMB - Zambia",
    "ZWE - Zimbabwe"
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

// Đọc và phân tích cú pháp địa chỉ sau sáp nhập từ file .txt
let cachedAddresses = null;
const getPostMergerAddresses = () => {
    if (cachedAddresses) return cachedAddresses;
    try {
        const provincesPath = path.join(__dirname, '../../data/post_merger_provinces.txt');
        const wardsPath = path.join(__dirname, '../../data/post_merger_wards.txt');

        if (!fs.existsSync(provincesPath) || !fs.existsSync(wardsPath)) {
            return { provinces: [], wards: {} };
        }

        const provincesData = fs.readFileSync(provincesPath, 'utf8');
        const wardsData = fs.readFileSync(wardsPath, 'utf8');

        const parsedProvinces = [];
        provincesData.split('\n').forEach(line => {
            const clean = line.trim();
            if (!clean) return;
            const match = clean.match(/^(\d{3})\s*-\s*(.+)$/);
            if (match) {
                parsedProvinces.push({ code: match[1], name: match[2].trim() });
            }
        });

        const parsedWards = {};
        parsedProvinces.forEach(p => {
            parsedWards[p.code] = [];
        });

        wardsData.split('\n').forEach(line => {
            const clean = line.trim();
            if (!clean) return;
            const match = clean.match(/^(\d{3}\d*)\s*-\s*(.+)$/);
            if (match) {
                const code = match[1];
                const name = match[2].trim();
                const provCode = code.substring(0, 3);
                if (parsedWards[provCode]) {
                    parsedWards[provCode].push(`${code} - ${name}`);
                }
            }
        });

        // Sắp xếp Phường/Xã theo bảng chữ cái tiếng Việt dựa trên tên (sau dấu gạch ngang)
        Object.keys(parsedWards).forEach(provCode => {
            parsedWards[provCode].sort((a, b) => {
                const nameIndex = a.indexOf(' - ');
                const nameA = nameIndex !== -1 ? a.substring(nameIndex + 3) : a;
                const nameB = nameIndex !== -1 ? b.substring(nameIndex + 3) : b;
                return nameA.localeCompare(nameB, 'vi');
            });
        });

        cachedAddresses = { provinces: parsedProvinces, wards: parsedWards };
        return cachedAddresses;
    } catch (err) {
        console.error('Lỗi khi đọc file địa chỉ sáp nhập:', err);
        return { provinces: [], wards: {} };
    }
};

// Trả về dữ liệu dropdown
const getCustomerOptions = async (req, res) => {
    try {
        const postMerger = getPostMergerAddresses();
        res.status(200).json({
            nationalities,
            provinces,
            visaTypes,
            postMergerProvinces: postMerger.provinces,
            postMergerWards: postMerger.wards
        });
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
                { hoten: regex },
                { cccd: regex },
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
        const {
            hoten, gioitinh, ngaythangnamsinh, quoctich, cccd, ngaycap, noicap, thuongtru,
            passport, visaType, visaExpiredDate, entryDate, diachichitiet, loaigiayto, tengiayto, noicutruhiennay,
            sodienthoai, diachichitietcu, thuongtrumoi, diachichitietmoi, thuongtrucu
        } = req.body;

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
            quoctich: quoctich || 'VNM - Viet Nam',
            diachichitiet: diachichitiet || undefined,
            diachichitietcu: diachichitietcu || undefined,
            loaigiayto: loaigiayto || undefined,
            tengiayto: tengiayto || undefined,
            noicutruhiennay: noicutruhiennay || undefined,
            sodienthoai: sodienthoai || undefined,
            thuongtrumoi: thuongtrumoi || undefined,
            diachichitietmoi: diachichitietmoi || undefined,
            thuongtrucu: thuongtrucu || thuongtru || undefined
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
        if (thuongtru || thuongtrucu) customerData.thuongtru = thuongtru || thuongtrucu;

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
        const {
            hoten, gioitinh, ngaythangnamsinh, quoctich, cccd, ngaycap, noicap, thuongtru,
            passport, visaType, visaExpiredDate, entryDate, diachichitiet, loaigiayto, tengiayto, noicutruhiennay,
            sodienthoai, diachichitietcu, thuongtrumoi, diachichitietmoi, thuongtrucu
        } = req.body;

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
            quoctich: quoctich || 'VNM - Viet Nam',
            cccd: cccd ? cccd.trim() : null,
            ngaycap: ngaycap || null,
            noicap: noicap || null,
            thuongtru: thuongtru || thuongtrucu || null,
            thuongtrucu: thuongtrucu || thuongtru || null,
            passport: passport ? passport.trim() : null,
            visaType: visaType || null,
            visaExpiredDate: visaExpiredDate || null,
            entryDate: entryDate || null,
            diachichitiet: diachichitiet || null,
            diachichitietcu: diachichitietcu || null,
            loaigiayto: loaigiayto || null,
            tengiayto: tengiayto || null,
            noicutruhiennay: noicutruhiennay || null,
            sodienthoai: sodienthoai || null,
            thuongtrumoi: thuongtrumoi || null,
            diachichitietmoi: diachichitietmoi || null
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
