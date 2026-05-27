const express = require('express');
const router = express.Router();
const authMiddleware = require('../../middlewares/auth.middleware');

router.use(authMiddleware);

const {
    getAllRooms,
    getRoomById,
    createRoom,
    updateRoom,
    deleteRoom
} = require('./room.controller');

router.get('/', getAllRooms);
router.post('/', createRoom);
router.get('/:id', getRoomById);
router.put('/:id', updateRoom);
router.delete('/:id', deleteRoom);

module.exports = router;