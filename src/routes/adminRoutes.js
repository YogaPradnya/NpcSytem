const express = require('express');
const { formatUptime } = require('../stats');
const { parseHeartProfiles, stringifyHeartProfiles } = require('../heart_profiles');

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

    function streamStats(req, res) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();

        const send = () => {
            res.write(`data: ${JSON.stringify(runtimeStats())}\n\n`);
        };

        send();
        const timer = setInterval(send, 3000);
        req.on('close', () => clearInterval(timer));
    }

    router.get('/api/admin/logs/stream', apiAuth, adminOnly, openLogStream);
    router.get('/api/admin/stats/stream', apiAuth, adminOnly, streamStats);

    router.get('/api/stats', apiAuth, async (req, res) => {
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
        const config = providers.updateModelConfig(req.body || {});
        if (req.body && Object.keys(req.body).length > 0) {
            console.log(`[CONFIG] Model config updated: ${JSON.stringify(config)}`);
            return res.json({ success: true, message: 'Konfigurasi model berhasil diperbarui.', config });
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

    router.get('/api/admin/logs', apiAuth, adminOnly, async (req, res) => {
        try {
            const page = Math.max(1, parseInt(req.query.page, 10) || 1);
            const limit = Math.min(100, Math.max(10, parseInt(req.query.limit, 10) || 30));
            const offset = (page - 1) * limit;
            const q = String(req.query.q || '').trim();

            let where = '';
            let args = [];
            if (q) {
                where = "WHERE LOWER(username) LIKE LOWER(?) OR LOWER(ai_name) LIKE LOWER(?) OR LOWER(user_message) LIKE LOWER(?) OR LOWER(bot_response) LIKE LOWER(?)";
                const like = `%${q}%`;
                args = [like, like, like, like];
            }

            const result = await db.execute({
                sql: `SELECT * FROM chat_logs ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
                args: [...args, limit, offset]
            });
            const countRes = await db.execute({
                sql: `SELECT COUNT(*) as total FROM chat_logs ${where}`,
                args
            });
            const total = Number(countRes.rows[0]?.total || 0);

            res.json({
                logs: result.rows,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.max(1, Math.ceil(total / limit))
                }
            });
        } catch (e) {
            console.error("[DB LOGS ERROR]:", e.message);
            res.status(500).json({ error: e.message });
        }
    });

    router.get('/api/admin/users', apiAuth, adminOnly, async (req, res) => {
        try {
            const page = Math.max(1, parseInt(req.query.page, 10) || 1);
            const limit = Math.min(100, Math.max(10, parseInt(req.query.limit, 10) || 30));
            const offset = (page - 1) * limit;
            const q = String(req.query.q || '').trim();
            const where = q ? "WHERE LOWER(username) LIKE LOWER(?)" : "";
            const args = q ? [`%${q}%`] : [];

            const result = await db.execute({
                sql: `SELECT * FROM users ${where} ORDER BY last_seen DESC LIMIT ? OFFSET ?`,
                args: [...args, limit, offset]
            });

            const countRes = await db.execute({
                sql: `SELECT COUNT(*) as total FROM users ${where}`,
                args
            });
            const total = Number(countRes.rows[0].total || 0);

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

    router.get('/api/admin/user-logs/:username', apiAuth, adminOnly, async (req, res) => {
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

    router.post('/api/characters/save', apiAuth, adminOnly, async (req, res) => {
        const { id, data } = req.body;
        if (!id || !data) return res.status(400).json({ error: "Missing data" });

        try {
            await db.execute({
                sql: `INSERT INTO characters (id, npc_name, npc_description, npc_personality, npc_speaking_style, character_background, language, heart_profiles, signature_style, is_enabled) 
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                      ON CONFLICT(id) DO UPDATE SET 
                      npc_name=excluded.npc_name, 
                      npc_description=excluded.npc_description, 
                      npc_personality=excluded.npc_personality, 
                      npc_speaking_style=excluded.npc_speaking_style, 
                      character_background=excluded.character_background, 
                      language=excluded.language,
                      heart_profiles=excluded.heart_profiles,
                      signature_style=excluded.signature_style,
                      is_enabled=excluded.is_enabled`,
                args: [id, data.npc_name, data.npc_description, data.npc_personality, data.npc_speaking_style, data.character_background || '', data.language || 'id', stringifyHeartProfiles(data.heart_profiles), data.signature_style || '', data.is_enabled ? 1 : 0]
            });

            characters[id] = { id, ...data, heart_profiles: stringifyHeartProfiles(data.heart_profiles), signature_style: data.signature_style || '', character_background: data.character_background || '' };
            res.json({ success: true, message: `Character ${id} saved to Turso.` });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    router.post('/api/characters/delete', apiAuth, adminOnly, async (req, res) => {
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

    router.get('/api/characters', apiAuth, async (req, res) => {
        try {
            const result = await db.execute("SELECT * FROM characters");
            const list = result.rows.map(row => ({
                ...row,
                heart_profiles: parseHeartProfiles(row.heart_profiles),
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

    router.get('/api/admin/ban-list', apiAuth, adminOnly, async (req, res) => {
        try {
            const page = Math.max(1, parseInt(req.query.page, 10) || 1);
            const limit = 35; // Per page 35 as requested
            const offset = (page - 1) * limit;
            const q = String(req.query.q || '').trim();

            let where = '';
            let args = [];
            if (q) {
                where = "WHERE LOWER(username) LIKE LOWER(?)";
                args = [`%${q}%`];
            }

            const bans = await db.execute({
                sql: `SELECT * FROM banned_users ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
                args: [...args, limit, offset]
            });
            const countRes = await db.execute({
                sql: `SELECT COUNT(*) as total FROM banned_users ${where}`,
                args
            });
            const total = Number(countRes.rows[0]?.total || 0);

            const settings = await db.execute("SELECT value FROM settings WHERE key = 'ban_message'");
            res.json({
                success: true,
                list: bans.rows,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.max(1, Math.ceil(total / limit))
                },
                ban_message: settings.rows[0]?.value
            });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    router.get('/api/admin/banned-usernames', apiAuth, adminOnly, async (req, res) => {
        try {
            const bans = await db.execute("SELECT username FROM banned_users");
            res.json({
                success: true,
                usernames: bans.rows.map(r => r.username)
            });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    router.post('/api/admin/ban-user', apiAuth, adminOnly, async (req, res) => {
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

    router.post('/api/admin/unban-user', apiAuth, adminOnly, async (req, res) => {
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

    router.post('/api/admin/update-ban-message', apiAuth, adminOnly, async (req, res) => {
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
