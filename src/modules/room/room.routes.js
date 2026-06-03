const express = require('express');
const router = express.Router();
const roomController = require('./room.controller'); // Bạn hãy điều chỉnh lại đường dẫn chính xác tới file controller ở trên

// GET all rooms with current booking info
router.get('/', roomController.getAllRooms);

// GET single room
router.get('/:id', roomController.getRoomById);

// POST create room
router.post('/', roomController.createRoom);

// PUT update room
router.put('/:id', roomController.updateRoom);

// DELETE room
router.delete('/:id', roomController.deleteRoom);

module.exports = router;