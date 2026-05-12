const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
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
const PORT = process.env.PORT || 4000;
const characters = {};

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(cookieParser('npc-system-secret-88'));

app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    next();
});

app.get('/', (req, res) => {
    res.redirect('/admin');
});

attachConsoleBroadcast();
initDB(characters);
providers.startDeepInfraBillingSync();
providers.startDailyStatsReset();

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

app.listen(PORT, () => {
    console.log(`------------------------------------------`);
    console.log(`NPC Engine V1 is now active!`);
    console.log(`Listening at: http://localhost:${PORT}`);
    console.log(`Endpoint: http://localhost:${PORT}/api/npc/v1/chat`);
    console.log(`------------------------------------------`);
});
