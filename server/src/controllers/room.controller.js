const Room = require('../models/Room');
const Document = require('../models/Document');
const User = require('../models/User');

/**
 * POST /api/rooms
 * Body: { name }
 * Creates a room and makes the creator the owner.
 * Also creates an empty Document for the room.
 */
const createRoom = async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Room name is required' });
    }

    const room = await Room.create({
      name: name.trim(),
      ownerId: req.user._id,
      members: [{ userId: req.user._id, role: 'owner' }],
    });

    // Eagerly create an empty document so Phase 3 socket handler always finds it
    await Document.create({ roomId: room._id });

    const populated = await room.populate('members.userId', 'name email');
    res.status(201).json({ room: populated });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/rooms
 * Returns all rooms the authenticated user belongs to.
 */
const getUserRooms = async (req, res, next) => {
  try {
    const rooms = await Room.find({ 'members.userId': req.user._id })
      .populate('ownerId', 'name email')
      .sort({ createdAt: -1 });

    res.json({ rooms });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/rooms/:id
 * Returns a single room. Requires at least 'viewer' role (enforced by middleware).
 */
const getRoom = async (req, res) => {
  // req.room already populated by requireRoomRole middleware
  await req.room.populate('members.userId', 'name email');
  await req.room.populate('ownerId', 'name email');
  res.json({ room: req.room, userRole: req.userRole });
};

/**
 * POST /api/rooms/:id/invite
 * Body: { email, role: 'editor' | 'viewer' }
 * Owner invites a user by email. Requires 'owner' role.
 */
const inviteToRoom = async (req, res, next) => {
  try {
    const { email, role } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'email is required' });
    }
    if (!['editor', 'viewer'].includes(role)) {
      return res.status(400).json({ error: "role must be 'editor' or 'viewer'" });
    }

    const invitee = await User.findOne({ email: email.toLowerCase() });
    if (!invitee) {
      return res.status(404).json({ error: 'No user found with that email' });
    }

    const room = req.room;
    const alreadyMember = room.members.some(
      (m) => m.userId.toString() === invitee._id.toString()
    );
    if (alreadyMember) {
      return res.status(409).json({ error: 'User is already a member of this room' });
    }

    room.members.push({ userId: invitee._id, role });
    await room.save();

    await room.populate('members.userId', 'name email');
    res.json({ room });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/rooms/:id
 * Deletes the room and its document. Requires 'owner' role.
 */
const deleteRoom = async (req, res, next) => {
  try {
    const room = req.room;
    await Document.deleteOne({ roomId: room._id });
    await room.deleteOne();
    res.json({ message: 'Room deleted' });
  } catch (err) {
    next(err);
  }
};

module.exports = { createRoom, getUserRooms, getRoom, inviteToRoom, deleteRoom };
