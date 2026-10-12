const mongoose = require('mongoose');

const versionSnapshotSchema = new mongoose.Schema(
  {
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Room',
      required: true,
      index: true,
    },
    yjsState: {
      type: Buffer,
      required: true,
    },
    // Optional human-readable label ("auto-save", "before refactor", etc.)
    label: {
      type: String,
      default: 'auto-save',
      maxlength: 100,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('VersionSnapshot', versionSnapshotSchema);
