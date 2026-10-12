const express = require('express');
const router = express.Router();
const { register, login, refresh, logout, me } = require('../controllers/auth.controller');
const requireAuth = require('../middleware/requireAuth');

router.post('/register', register);
router.post('/login', login);
router.post('/refresh', refresh);
router.post('/logout', logout);
router.get('/me', requireAuth, me);

module.exports = router;
