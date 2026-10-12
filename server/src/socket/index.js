const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const Y = require('yjs');
const User = require('../models/User');
const Room = require('../models/Room');
const Document = require('../models/Document');
const VersionSnapshot = require('../models/VersionSnapshot');

// ── Constants ────────────────────────────────────────────────────────────────
const PERSIST_DEBOUNCE_MS = 5000;   // save after 5 s of inactivity
const SNAPSHOT_CAP = 50;             // keep last 50 snapshots per room

// ── In-memory state ──────────────────────────────────────────────────────────
// roomId → { ydoc: Y.Doc, refCount: number, persistTimer: Timeout | null }
const roomDocs = new Map();

// ── Persistence helpers ──────────────────────────────────────────────────────
const persistRoom = async (roomId, ydoc) => {
  try {
    const state = Buffer.from(Y.encodeStateAsUpdate(ydoc));

    // Overwrite the live Document record
    await Document.findOneAndUpdate(
      { roomId },
      { yjsState: state },
      { upsert: true, new: true }
    );

    // Also append a snapshot, then prune old ones
    await VersionSnapshot.create({ roomId, yjsState: state, label: 'auto-save' });

    const count = await VersionSnapshot.countDocuments({ roomId });
    if (count > SNAPSHOT_CAP) {
      const oldest = await VersionSnapshot.find({ roomId })
        .sort({ createdAt: 1 })
        .limit(count - SNAPSHOT_CAP)
        .select('_id');
      await VersionSnapshot.deleteMany({ _id: { $in: oldest.map((s) => s._id) } });
    }
  } catch (err) {
    console.error(`[socket] persist error for room ${roomId}:`, err.message);
  }
};

const schedulePersist = (roomId, ydoc, entry) => {
  if (entry.persistTimer) clearTimeout(entry.persistTimer);
  entry.persistTimer = setTimeout(() => {
    entry.persistTimer = null;
    persistRoom(roomId, ydoc);
  }, PERSIST_DEBOUNCE_MS);
};

// ── Socket server ────────────────────────────────────────────────────────────
const initSocketServer = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:5173',
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // ── Auth middleware (runs before any event) ──────────────────────────────
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('AUTH_MISSING'));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId).select('-passwordHash');
      if (!user) return next(new Error('AUTH_USER_NOT_FOUND'));

      socket.user = user;
      next();
    } catch {
      next(new Error('AUTH_INVALID'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`[socket] + ${socket.user.name} (${socket.id})`);

    // ── join-room ────────────────────────────────────────────────────────
    socket.on('join-room', async ({ roomId }, ack) => {
      try {
        // 1. Verify membership & role
        const room = await Room.findById(roomId);
        if (!room) return ack({ error: 'Room not found' });

        const member = room.members.find(
          (m) => m.userId.toString() === socket.user._id.toString()
        );
        if (!member) return ack({ error: 'Not a member of this room' });

        socket.join(roomId);
        socket.roomId = roomId;
        socket.userRole = member.role;

        // 2. Get or create in-memory Y.Doc
        if (!roomDocs.has(roomId)) {
          const ydoc = new Y.Doc();

          // Hydrate from persisted state
          const dbDoc = await Document.findOne({ roomId });
          if (dbDoc?.yjsState) {
            Y.applyUpdate(ydoc, new Uint8Array(dbDoc.yjsState));
          }

          roomDocs.set(roomId, { ydoc, refCount: 0, persistTimer: null });
        }

        const entry = roomDocs.get(roomId);
        entry.refCount++;

        // 3. Send full current state to the joining client
        const state = Array.from(Y.encodeStateAsUpdate(entry.ydoc));
        ack({ state, role: member.role });

        // 4. Announce arrival to other clients in the room
        socket.to(roomId).emit('user-joined', {
          userId: socket.user._id,
          name: socket.user.name,
        });

        console.log(`[socket] ${socket.user.name} → room ${roomId} (${member.role})`);
      } catch (err) {
        console.error('[socket] join-room error:', err.message);
        ack({ error: 'Failed to join room' });
      }
    });

    // ── doc-update ───────────────────────────────────────────────────────
    // Binary Yjs update from a client — relay unchanged to all others,
    // apply to in-memory doc, schedule a persist.
    socket.on('doc-update', (update) => {
      const roomId = socket.roomId;
      if (!roomId) return;

      // Server-side role enforcement — viewers must not be able to mutate
      // the document even if they bypass the client's readOnly flag.
      if (socket.userRole === 'viewer') {
        console.warn(`[socket] viewer ${socket.user.name} tried to send doc-update — blocked`);
        return;
      }

      // Relay to everyone else in the room (server is a dumb relay)
      socket.to(roomId).emit('doc-update', update);

      // Apply to server-side Y.Doc and debounce persist
      const entry = roomDocs.get(roomId);
      if (entry) {
        try {
          Y.applyUpdate(entry.ydoc, new Uint8Array(update));
          schedulePersist(roomId, entry.ydoc, entry);
        } catch (err) {
          console.error(`[socket] invalid Yjs update from ${socket.user.name}:`, err.message);
        }
      }
    });

    // ── awareness-update ─────────────────────────────────────────────────
    // Yjs awareness binary frames — dumb relay, same as doc-update.
    // Carries cursor positions, selections, and user metadata (name, color).
    socket.on('awareness-update', (update) => {
      if (!socket.roomId) return;
      socket.to(socket.roomId).emit('awareness-update', update);
    });

    // ── cursor-move ──────────────────────────────────────────────────────
    // Lightweight presence — throttled on the client side to ~10/s
    socket.on('cursor-move', (data) => {
      if (!socket.roomId) return;
      socket.to(socket.roomId).emit('cursor-move', {
        ...data,
        userId: socket.user._id,
        name: socket.user.name,
      });
    });

    // ── disconnect ───────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      const roomId = socket.roomId;
      if (!roomId) return;

      socket.to(roomId).emit('user-left', {
        userId: socket.user._id,
        name: socket.user.name,
      });

      const entry = roomDocs.get(roomId);
      if (entry) {
        entry.refCount--;
        if (entry.refCount <= 0) {
          // Last client left — flush immediately then evict
          if (entry.persistTimer) {
            clearTimeout(entry.persistTimer);
            entry.persistTimer = null;
          }
          persistRoom(roomId, entry.ydoc).then(() => {
            entry.ydoc.destroy();
            roomDocs.delete(roomId);
            console.log(`[socket] room ${roomId} evicted from memory`);
          });
        }
      }

      console.log(`[socket] - ${socket.user.name} (${socket.id})`);
    });
  });

  return io;
};

module.exports = initSocketServer;
