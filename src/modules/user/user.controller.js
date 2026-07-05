const bcrypt = require('bcrypt');
const User = require('../auth/auth.model');

// Lấy danh sách tài khoản
const getUsers = async (req, res) => {
    try {
        const users = await User.find().select('-password');
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: 'Lỗi khi lấy danh sách tài khoản', error: error.message });
    }
};

// Tạo mới tài khoản (Chỉ thực hiện trong trang quản trị)
const createUser = async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ message: 'Vui lòng điền đầy đủ thông tin' });
        }
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ message: 'Tên đăng nhập đã tồn tại' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ username, password: hashedPassword });
        await newUser.save();
        res.status(201).json({ message: 'Thêm tài khoản thành công', user: { _id: newUser._id, username: newUser.username } });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi máy chủ', error: error.message });
    }
};

// Cập nhật thông tin tài khoản (username và mật khẩu mới)
const updateUser = async (req, res) => {
    try {
        const { id } = req.params;
        const { username, password } = req.body;

        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ message: 'Không tìm thấy tài khoản cần chỉnh sửa' });
        }

        if (username && username.trim() !== user.username) {
            const existingUser = await User.findOne({ username: username.trim() });
            if (existingUser) {
                return res.status(400).json({ message: 'Tên đăng nhập đã được sử dụng bởi tài khoản khác' });
            }
            user.username = username.trim();
        }

        if (password) {
            user.password = await bcrypt.hash(password, 10);
        }

        await user.save();
        res.json({ message: 'Cập nhật tài khoản thành công', user: { _id: user._id, username: user.username } });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi máy chủ', error: error.message });
    }
};

// Xoá tài khoản
const deleteUser = async (req, res) => {
    try {
        const { id } = req.params;

        // Không cho phép tài khoản tự xóa chính mình khi đang đăng nhập
        if (req.user.id === id) {
            return res.status(400).json({ message: 'Bạn không thể tự xóa tài khoản đang đăng nhập của chính mình' });
        }

        const user = await User.findByIdAndDelete(id);
        if (!user) {
            return res.status(404).json({ message: 'Không tìm thấy tài khoản cần xóa' });
        }
        res.json({ message: 'Xóa tài khoản thành công' });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi khi xóa tài khoản', error: error.message });
    }
};

module.exports = {
    getUsers,
    createUser,
    updateUser,
    deleteUser
};
