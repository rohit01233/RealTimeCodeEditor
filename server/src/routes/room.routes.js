const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/requireAuth');
const requireRoomRole = require('../middleware/requireRoomRole');
const {
  createRoom,
  getUserRooms,
  getRoom,
  inviteToRoom,
  deleteRoom,
} = require('../controllers/room.controller');

// All room routes require authentication
router.use(requireAuth);

router.post('/', createRoom);
router.get('/', getUserRooms);
router.get('/:id', requireRoomRole('viewer'), getRoom);
router.post('/:id/invite', requireRoomRole('owner'), inviteToRoom);
router.delete('/:id', requireRoomRole('owner'), deleteRoom);

module.exports = router;
