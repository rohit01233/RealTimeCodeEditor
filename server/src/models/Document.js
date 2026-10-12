const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema(
  {
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Room',
      required: true,
      unique: true, // one document per room
    },
    // Binary Yjs state — stored as a Buffer in MongoDB
    yjsState: {
      type: Buffer,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Document', documentSchema);
