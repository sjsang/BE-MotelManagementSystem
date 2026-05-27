const Room = require('./room.model');

const getAllRooms = async (req, res) => {
    try {
        const rooms = await Room.find();
        res.status(200).json(rooms);
    } catch (error) {
        res.status(500).json({ message: 'Lỗi khi lấy danh sách phòng', error: error.message });
    }
};

const getRoomById = async (req, res) => {
    try {
        const { id } = req.params;
        const room = await Room.findById(id);
        if (!room) {
            return res.status(404).json({ message: 'Không tìm thấy phòng' });
        }
        res.status(200).json(room);
    } catch (error) {
        res.status(500).json({ message: 'Lỗi khi lấy thông tin phòng', error: error.message });
    }
};

const createRoom = async (req, res) => {
    try {
        const { code, pricePerHour, pricePerDay } = req.body;
        const existingRoom = await Room.findOne({ code });
        if (existingRoom) {
            return res.status(400).json({ message: 'Mã phòng đã tồn tại' });
        }
        const newRoom = new Room({ code, pricePerHour, pricePerDay });
        await newRoom.save();
        res.status(201).json(newRoom);
    } catch (error) {
        res.status(500).json({ message: 'Lỗi khi tạo phòng', error: error.message });
    }
};

const updateRoom = async (req, res) => {
    try {
        const { id } = req.params;
        const { code, pricePerHour, pricePerDay, status } = req.body;
        const updatedRoom = await Room.findByIdAndUpdate(
            id,
            { code, pricePerHour, pricePerDay, status },
            { new: true, runValidators: true }
        );
        if (!updatedRoom) {
            return res.status(404).json({ message: 'Không tìm thấy phòng' });
        }
        res.status(200).json(updatedRoom);
    } catch (error) {
        res.status(500).json({ message: 'Lỗi khi cập nhật phòng', error: error.message });
    }
};

const deleteRoom = async (req, res) => {
    try {
        const { id } = req.params;
        const deletedRoom = await Room.findByIdAndDelete(id);
        if (!deletedRoom) {
            return res.status(404).json({ message: 'Không tìm thấy phòng' });
        }
        res.status(200).json({ message: 'Xóa phòng thành công' });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi khi xóa phòng', error: error.message });
    }
};

module.exports = {
    getAllRooms,
    getRoomById,
    createRoom,
    updateRoom,
    deleteRoom
};