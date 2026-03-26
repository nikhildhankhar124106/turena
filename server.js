// ── TURENA — Multiplayer Turn-Based 2D Grid Game Server ─────────────
const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');

const { PORT, CLIENT_URL } = require('./config/env');
const connectDB = require('./config/db');
const logger = require('./utils/logger');
const errorHandler = require('./middlewares/errorHandler');
const initSocket = require('./sockets/gameSocket');

// ── Express setup ───────────────────────────────────────────────────
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
    cors({
        origin: CLIENT_URL,
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        credentials: true,
    })
);

// ── REST Routes ─────────────────────────────────────────────────────
const authRoutes = require('./routes/authRoutes');
const gameRoutes = require('./routes/gameRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/games', gameRoutes);

// Health-check
app.get('/', (_req, res) => {
    res.json({ status: 'ok', game: 'TURENA' });
});

// Error handler (must be last middleware)
app.use(errorHandler);

// ── HTTP + Socket.io server ─────────────────────────────────────────
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: CLIENT_URL,
        methods: ['GET', 'POST'],
    },
});

initSocket(io);

// ── Start ───────────────────────────────────────────────────────────
const start = async () => {
    await connectDB();
    server.listen(PORT, () => {
        logger.info(`🚀 TURENA server running on http://localhost:${PORT}`);
        logger.info(`🌐 CORS origin allowed: ${CLIENT_URL}`);
    });
};

start();
