const VersionSnapshot = require('../models/VersionSnapshot');

/**
 * GET /api/rooms/:roomId/versions
 * Returns all snapshots for a room, sorted by createdAt descending.
 * Selects only metadata (id, createdAt, label).
 */
const getVersions = async (req, res, next) => {
  try {
    const { roomId } = req.params;
    const versions = await VersionSnapshot.find({ roomId })
      .select('_id createdAt label')
      .sort({ createdAt: -1 });

    res.json({ versions });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/rooms/:roomId/versions/:versionId
 * Returns the full version details, including the binary yjsState base64 encoded.
 */
const getVersionState = async (req, res, next) => {
  try {
    const { versionId } = req.params;
    const version = await VersionSnapshot.findById(versionId);

    if (!version) {
      return res.status(404).json({ error: 'Version not found' });
    }

    res.json({
      _id: version._id,
      roomId: version.roomId,
      label: version.label,
      createdAt: version.createdAt,
      yjsState: version.yjsState.toString('base64'),
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getVersions,
  getVersionState,
};
