const Room = require('../models/Room');

// Role hierarchy — higher index = more permissions
const ROLE_LEVELS = { viewer: 0, editor: 1, owner: 2 };

/**
 * Middleware factory: check that req.user has at least `minRole` in the room.
 * Expects requireAuth to have run first (req.user is set).
 * Room ID is read from req.params.id or req.params.roomId.
 * Attaches req.room and req.userRole on success.
 */
const requireRoomRole = (minRole) => async (req, res, next) => {
  try {
    const roomId = req.params.id || req.params.roomId;
    const room = await Room.findById(roomId);

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const member = room.members.find(
      (m) => m.userId.toString() === req.user._id.toString()
    );

    if (!member) {
      return res.status(403).json({ error: 'You are not a member of this room' });
    }

    const userLevel = ROLE_LEVELS[member.role] ?? -1;
    const requiredLevel = ROLE_LEVELS[minRole] ?? 99;

    if (userLevel < requiredLevel) {
      return res.status(403).json({ error: `Requires at least '${minRole}' role` });
    }

    req.room = room;
    req.userRole = member.role;
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = requireRoomRole;
