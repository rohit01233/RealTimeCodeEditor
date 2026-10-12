const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// ── Token helpers ────────────────────────────────────────────────────────────

const generateAccessToken = (userId) =>
  jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '15m' });

const generateRefreshToken = (userId) =>
  jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });

// ── Controllers ──────────────────────────────────────────────────────────────

/**
 * POST /api/auth/register
 * Body: { name, email, password }
 */
const register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email, and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ name, email, passwordHash });

    const accessToken = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    res.status(201).json({ user, accessToken, refreshToken });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/login
 * Body: { email, password }
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const accessToken = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    // toJSON strips passwordHash automatically
    res.json({ user, accessToken, refreshToken });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/refresh
 * Body: { refreshToken }
 */
const refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'refreshToken is required' });
    }

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const accessToken = generateAccessToken(user._id);
    res.json({ accessToken });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/auth/logout
 * Stateless — client discards tokens. Endpoint exists for future blocklist support.
 */
const logout = (_req, res) => {
  res.json({ message: 'Logged out successfully' });
};

/**
 * GET /api/auth/me  (requires requireAuth middleware)
 */
const me = (req, res) => {
  res.json({ user: req.user });
};

module.exports = { register, login, refresh, logout, me };
