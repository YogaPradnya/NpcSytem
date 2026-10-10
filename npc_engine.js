const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const { getAdminDashboardHTML, getLoginPageHTML } = require('./dashboard.js');
const { db, initDB } = require('./src/db');
const { sessionAuth, apiAuth, adminOnly } = require('./src/auth');
const { globalStats } = require('./src/stats');
const providers = require('./src/providers');
const { attachConsoleBroadcast, openLogStream } = require('./src/logger');
const { createAuthRoutes } = require('./src/routes/authRoutes');
const { createChatRoutes } = require('./src/routes/chatRoutes');
const { createAdminRoutes } = require('./src/routes/adminRoutes');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 4000;
const characters = {};

const chatCors = cors();
const chatLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false, 
    message: { success: false, error: 'Terlalu banyak request, coba lagi nanti.' }
});

// Rate-limit khusus login: hanya POST /login (halaman GET tetap bisa dibuka).
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        res.status(429).send(getLoginPageHTML('Terlalu banyak percobaan login. Coba lagi dalam 15 menit.'));
    }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(cookieParser(process.env.COOKIE_SECRET || 'npc-system-secret-88'));
if (!process.env.COOKIE_SECRET) {
    console.warn('[SECURITY] COOKIE_SECRET tidak di-set di .env, memakai fallback lemah. Segera set COOKIE_SECRET acak yang panjang!');
}
app.use('/api/npc', chatCors, chatLimiter);

app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    next();
});

app.get('/api/status', (req, res) => {
    const { formatUptime } = require('./src/stats');
    const uptimeSeconds = Math.floor((Date.now() - globalStats.startTime) / 1000);

    res.json({
        status: 'online',
        uptime: formatUptime(uptimeSeconds),
        uptime_seconds: uptimeSeconds,
        total_requests: globalStats.totalRequests,
        timestamp: new Date().toISOString()
    });
});

app.get('/', (req, res) => {
    res.redirect('/admin');
});

attachConsoleBroadcast();

let server;

async function boot() {
    // Load characters from DB before accepting traffic (avoid empty-characters race).
    await initDB(characters);
    providers.startDeepInfraBillingSync();
    providers.startDailyStatsReset();

    server = app.listen(PORT, () => {
        console.log(`------------------------------------------`);
        console.log(`NPC Engine V1 is now active!`);
        console.log(`Listening at: http://localhost:${PORT}`);
        console.log(`Endpoint: http://localhost:${PORT}/api/npc/v1/chat`);
        console.log(`------------------------------------------`);
    });
}

boot();

app.post('/login', loginLimiter);
app.use(createAuthRoutes({ getLoginPageHTML }));
app.use(createChatRoutes({
    db,
    characters,
    providers,
    globalStats
}));
app.use(createAdminRoutes({
    db,
    characters,
    providers,
    globalStats,
    getAdminDashboardHTML,
    sessionAuth,
    apiAuth,
    adminOnly,
    openLogStream
}));

function gracefulShutdown(signal) {
    console.log(`[SYSTEM] ${signal} received. Shutting down...`);
    if (!server) process.exit(0);
    server.close(() => {
        console.log('[SYSTEM] HTTP server closed.');
        process.exit(0);
    });
    setTimeout(() => process.exit(0), 10000);
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
