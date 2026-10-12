require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const connectDB = require('./config/db');
const authRoutes = require('./routes/auth.routes');
const roomRoutes = require('./routes/room.routes');
const versionRoutes = require('./routes/version.routes');
const initSocketServer = require('./socket');

const app = express();
const httpServer = http.createServer(app);

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Routes ──────────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/rooms/:roomId/versions', versionRoutes);

// 404 handler — catches any unmatched route
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handler
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

// ── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  initSocketServer(httpServer);
  httpServer.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
});
