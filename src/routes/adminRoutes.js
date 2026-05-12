const express = require('express');
const { formatUptime } = require('../stats');

function createAdminRoutes({
    db,
    characters,
    providers,
    globalStats,
    getAdminDashboardHTML,
    sessionAuth,
    apiAuth,
    adminOnly,
    openLogStream
}) {
    const router = express.Router();
    const cachedDBStats = { topChars: [], recentLogs: [], lastUpdate: 0, usage: null, usageLastUpdate: 0, logs: null, logsLastUpdate: 0 };

    function runtimeStats(extra = {}) {
        return {
            ...globalStats,
            uptime: formatUptime(Math.floor((new Date() - globalStats.startTime) / 1000)),
            ...providers.getProviderStats(),
            ...extra
        };
    }

    router.get('/api/admin/logs/stream', apiAuth, adminOnly, openLogStream);

    router.get('/api/stats', async (req, res) => {
        if (Date.now() - cachedDBStats.lastUpdate > 30000) {
            try {
                const logRes = await db.execute("SELECT ai_name, username, user_message, bot_response, timestamp, ai_pose, user_level FROM chat_logs ORDER BY id DESC LIMIT 5");
                cachedDBStats.recentLogs = logRes.rows;
            } catch(e) {}

            cachedDBStats.lastUpdate = Date.now();
        }

        res.json(runtimeStats({ recentLogs: cachedDBStats.recentLogs }));
    });

    router.get('/admin', sessionAuth, async (req, res) => {
        let topChars = [];
        try {
            const topRes = await db.execute(`
                SELECT 
                    COALESCE(c.npc_name, l.ai_name) as name, 
                    SUM(l.tokens) as toks 
                FROM chat_logs l
                LEFT JOIN characters c ON l.ai_name = c.id
                GROUP BY l.ai_name 
                ORDER BY toks DESC 
                LIMIT 10
            `);
            topChars = topRes.rows;
        } catch(e) {}

        let recentLogs = [];
        try {
            const logRes = await db.execute("SELECT ai_name, username, user_message, bot_response, timestamp, ai_pose, user_level FROM chat_logs ORDER BY id DESC LIMIT 5");
            recentLogs = logRes.rows;
        } catch(e) {}

        res.send(getAdminDashboardHTML(runtimeStats({ topChars, recentLogs }), req.user));
    });

    router.get('/api/admin/models', apiAuth, adminOnly, (req, res) => {
        res.json(providers.getModelsStatus());
    });

    router.post('/api/admin/config/update', apiAuth, adminOnly, (req, res) => {
        const { primaryModel } = req.body;
        if (primaryModel) {
            providers.setPrimaryModel(primaryModel);
            console.log(`[CONFIG] Primary Model changed to: ${primaryModel}`);
            return res.json({ success: true, message: `Model berhasil diubah ke ${primaryModel}` });
        }
        res.status(400).json({ success: false, error: 'Model tidak valid' });
    });

    router.post('/api/admin/models/toggle', apiAuth, adminOnly, (req, res) => {
        const { id, enabled, type } = req.body;
        const otak = providers.toggleClient(type, id, enabled);

        if (otak) {
            res.json({ success: true, id, enabled, type });
        } else {
            res.status(404).json({ error: "Otak not found" });
        }
    });

    router.post('/api/admin/models/switch', apiAuth, adminOnly, (req, res) => {
        const { primaryModel } = req.body;
        if (primaryModel) {
            providers.setPrimaryModel(primaryModel);
            res.json({ success: true, primaryModel });
        } else {
            res.status(400).json({ error: "Missing model name" });
        }
    });

    router.get('/api/admin/logs', apiAuth, adminOnly, async (req, res) => {
        if (Date.now() - cachedDBStats.logsLastUpdate > 15000 || !cachedDBStats.logs) {
            try {
                const result = await db.execute("SELECT * FROM chat_logs ORDER BY id DESC LIMIT 100");
                cachedDBStats.logs = result.rows;
                cachedDBStats.logsLastUpdate = Date.now();
            } catch (e) {
                console.error("[DB LOGS ERROR]:", e.message);
            }
        }
        res.json({ logs: cachedDBStats.logs || [] });
    });

    router.get('/api/admin/users', apiAuth, adminOnly, async (req, res) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 30;
            const offset = (page - 1) * limit;

            const result = await db.execute({
                sql: "SELECT * FROM users ORDER BY last_seen DESC LIMIT ? OFFSET ?",
                args: [limit, offset]
            });

            const countRes = await db.execute("SELECT COUNT(*) as total FROM users");
            const total = countRes.rows[0].total;

            res.json({
                users: result.rows,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit)
                }
            });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    router.get('/api/admin/user-logs/:username', apiAuth, async (req, res) => {
        try {
            const result = await db.execute({
                sql: "SELECT * FROM chat_logs WHERE username = ? ORDER BY id DESC LIMIT 50",
                args: [req.params.username]
            });
            res.json({ logs: result.rows });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    router.get('/api/admin/usage', apiAuth, adminOnly, async (req, res) => {
        res.json({ usage: [] });
    });

    router.post('/api/characters/save', async (req, res) => {
        const { id, data } = req.body;
        if (!id || !data) return res.status(400).json({ error: "Missing data" });

        try {
            await db.execute({
                sql: `INSERT INTO characters (id, npc_name, npc_description, npc_personality, npc_speaking_style, world_setting, language, is_enabled) 
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                      ON CONFLICT(id) DO UPDATE SET 
                      npc_name=excluded.npc_name, 
                      npc_description=excluded.npc_description, 
                      npc_personality=excluded.npc_personality, 
                      npc_speaking_style=excluded.npc_speaking_style, 
                      world_setting=excluded.world_setting, 
                      language=excluded.language,
                      is_enabled=excluded.is_enabled`,
                args: [id, data.npc_name, data.npc_description, data.npc_personality, data.npc_speaking_style, data.world_setting, data.language || 'id', data.is_enabled ? 1 : 0]
            });

            characters[id] = { id, ...data };
            res.json({ success: true, message: `Character ${id} saved to Turso.` });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    router.post('/api/characters/delete', async (req, res) => {
        const { id } = req.body;
        if (!id) return res.status(400).json({ error: "Missing ID" });

        try {
            await db.execute({
                sql: "DELETE FROM characters WHERE id = ?",
                args: [id]
            });
            delete characters[id];
            res.json({ success: true, message: `Character ${id} deleted from Turso.` });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    router.get('/api/characters', async (req, res) => {
        try {
            const result = await db.execute("SELECT * FROM characters");
            const list = result.rows.map(row => ({
                ...row,
                is_enabled: !!row.is_enabled
            }));

            list.forEach(c => {
                characters[c.id] = c;
            });

            res.json({ success: true, characters: list });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    router.get('/api/admin/ban-list', async (req, res) => {
        try {
            const bans = await db.execute("SELECT * FROM banned_users ORDER BY created_at DESC");
            const settings = await db.execute("SELECT value FROM settings WHERE key = 'ban_message'");
            res.json({ success: true, list: bans.rows, ban_message: settings.rows[0]?.value });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    router.post('/api/admin/ban-user', async (req, res) => {
        let { username } = req.body;
        username = username.toString().trim().replace(/^@/, '');
        try {
            await db.execute({
                sql: "INSERT OR IGNORE INTO banned_users (username) VALUES (?)",
                args: [username]
            });
            res.json({ success: true, message: `User ${username} berhasil di-ban.` });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    router.post('/api/admin/unban-user', async (req, res) => {
        let { username } = req.body;
        username = username.toString().trim().replace(/^@/, '');
        try {
            await db.execute({
                sql: "DELETE FROM banned_users WHERE username = ?",
                args: [username]
            });
            res.json({ success: true, message: `User ${username} berhasil dilepas dari ban.` });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    router.post('/api/admin/update-ban-message', async (req, res) => {
        const { message } = req.body;
        try {
            await db.execute({
                sql: "UPDATE settings SET value = ? WHERE key = 'ban_message'",
                args: [message]
            });
            res.json({ success: true, message: "Pesan ban berhasil diperbarui." });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    return router;
}

module.exports = {
    createAdminRoutes
};
