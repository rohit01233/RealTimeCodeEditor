const express = require('express');
const router = express.Router({ mergeParams: true });
const requireAuth = require('../middleware/requireAuth');
const requireRoomRole = require('../middleware/requireRoomRole');
const { getVersions, getVersionState } = require('../controllers/version.controller');

// All version routes require auth and at least viewer access to the room
router.use(requireAuth);
router.use(requireRoomRole('viewer'));

router.get('/', getVersions);
router.get('/:versionId', getVersionState);

module.exports = router;
