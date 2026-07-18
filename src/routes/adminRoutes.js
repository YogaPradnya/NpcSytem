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
    const deepInfraPricingPerMillion = {
        'meta-llama/meta-llama-3.1-8b-instruct': { input: 0.02, output: 0.05 },
        'meta-llama-3.1-8b-instruct': { input: 0.02, output: 0.05 },
        'meta-llama/meta-llama-3.1-8b-instruct-turbo': { input: 0.02, output: 0.03 },
        'meta-llama-3.1-8b-instruct-turbo': { input: 0.02, output: 0.03 },
        'nousresearch/hermes-3-llama-3.1-70b': { input: 0.30, output: 0.30 },
        'hermes-3-llama-3.1-70b': { input: 0.30, output: 0.30 },
        'mistralai/mistral-small-24b-instruct-2501': { input: 0.05, output: 0.08 },
        'mistral-small-24b-instruct-2501': { input: 0.05, output: 0.08 },
        'qwen/qwen3.5-0.8b': { input: 0.01, output: 0.05 },
        'qwen3.5-0.8b': { input: 0.01, output: 0.05 }
    };

    function normalizeModelName(model = '') {
        return String(model).trim().toLowerCase();
    }

    function normalizeAutoBanWords(value = '') {
        return String(value || '')
            .split(/[\n,]+/)
            .map(word => word.trim().toLowerCase())
            .filter(Boolean);
    }

    function escapeRegex(value) {
        return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function findAutoBanWord(message, words) {
        const text = String(message || '').toLowerCase();
        return words.find(word => {
            const pattern = new RegExp(`(^|[^a-z0-9_])${escapeRegex(word)}(?=$|[^a-z0-9_])`, 'i');
            return pattern.test(text);
        }) || null;
    }

    function getDeepInfraRates(model = '') {
        const normalized = normalizeModelName(model);
        if (deepInfraPricingPerMillion[normalized]) {
            return deepInfraPricingPerMillion[normalized];
        }

        const shortName = normalized.split('/').pop();
        return deepInfraPricingPerMillion[shortName] || { input: 0.02, output: 0.05 };
    }

    async function getLocalBillingUsage() {
        if (Date.now() - cachedDBStats.usageLastUpdate <= 30000 && cachedDBStats.usage) {
            return cachedDBStats.usage;
        }

        try {
            const usageRes = await db.execute(`
                SELECT
                    COALESCE(NULLIF(model, ''), 'unknown') as model,
                    SUM(COALESCE(tokens, 0)) as tokens,
                    SUM(COALESCE(prompt_tokens, 0)) as prompt_tokens,
                    SUM(COALESCE(completion_tokens, 0)) as completion_tokens,
                    COUNT(*) as requests
                FROM chat_logs
                WHERE model IS NOT NULL
                    AND TRIM(model) != ''
                    AND (provider = 'DEEPINFRA' OR provider IS NULL)
                    AND LOWER(model) NOT IN ('llama-3.1-8b-instant', 'llama3.1-8b')
                GROUP BY model
                ORDER BY tokens DESC
            `);

            let totalCostCents = 0;
            const items = [];

            usageRes.rows.forEach(row => {
                const model = row.model;
                const totalTokens = Number(row.tokens || 0);
                let promptTokens = Number(row.prompt_tokens || 0);
                let completionTokens = Number(row.completion_tokens || 0);

                if (promptTokens + completionTokens === 0 && totalTokens > 0) {
                    promptTokens = Math.round(totalTokens * 0.95);
                    completionTokens = totalTokens - promptTokens;
                }

                const rates = getDeepInfraRates(model);
                const inputCostCents = (promptTokens / 1000000) * rates.input * 100;
                const outputCostCents = (completionTokens / 1000000) * rates.output * 100;
                totalCostCents += inputCostCents + outputCostCents;

                items.push({
                    model: { model_name: model },
                    pricing_type: 'input_tokens',
                    units: promptTokens,
                    rate: rates.input / 10000,
                    cost: inputCostCents,
                    requests: Number(row.requests || 0),
                    source: 'local_chat_logs'
                });

                items.push({
                    model: { model_name: model },
                    pricing_type: 'output_tokens',
                    units: completionTokens,
                    rate: rates.output / 10000,
                    cost: outputCostCents,
                    requests: Number(row.requests || 0),
                    source: 'local_chat_logs'
                });
            });

            cachedDBStats.usage = {
                source: 'local_chat_logs',
                months: [{
                    period: new Date().toISOString().slice(0, 7),
                    items,
                    total_cost: totalCostCents
                }]
            };
            cachedDBStats.usageLastUpdate = Date.now();
        } catch (e) {
            cachedDBStats.usage = null;
            cachedDBStats.usageLastUpdate = Date.now();
        }

        return cachedDBStats.usage;
    }

    async function runtimeStats(extra = {}) {
        const providerStats = providers.getProviderStats();
        const deepinfraBilling = providerStats.deepinfra_billing;
        const hasLiveBilling = !!(deepinfraBilling && deepinfraBilling.months && deepinfraBilling.months.length);

        // Hitung penghematan cache per model
        const cacheSavings = [];
        let totalSaved = 0;
        for (const [model, cached] of Object.entries(globalStats.cachedByModel || {})) {
            const rates = getDeepInfraRates(model);
            // Cached tokens mendapat diskon 50%, jadi savings = cached * rate * 0.5
            const saved = (cached / 1000000) * rates.input * 0.5;
            totalSaved += saved;
            cacheSavings.push({ model, cached_tokens: cached, rate: rates.input, saved });
        }

        return {
            ...globalStats,
            uptime: formatUptime(Math.floor((new Date() - globalStats.startTime) / 1000)),
            ...providerStats,
            deepinfra_billing: hasLiveBilling ? deepinfraBilling : await getLocalBillingUsage(),
            deepinfra_billing_source: hasLiveBilling ? 'deepinfra_api' : 'local_chat_logs',
            cache_savings: cacheSavings,
            cache_total_saved: totalSaved,
            ...extra
        };
    }

    function streamStats(req, res) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();

        const send = async () => {
            res.write(`data: ${JSON.stringify(await runtimeStats())}\n\n`);
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

        res.json(await runtimeStats({ recentLogs: cachedDBStats.recentLogs }));
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

        if (Date.now() - cachedDBStats.lastUpdate > 30000) {
            try {
                const logRes = await db.execute("SELECT ai_name, username, user_message, bot_response, timestamp, ai_pose, user_level FROM chat_logs ORDER BY id DESC LIMIT 5");
                cachedDBStats.recentLogs = logRes.rows;
                cachedDBStats.lastUpdate = Date.now();
            } catch(e) {}
        }

        res.send(getAdminDashboardHTML(await runtimeStats({ topChars, recentLogs: cachedDBStats.recentLogs }), req.user));
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
            const autoBanSetting = await db.execute("SELECT value FROM settings WHERE key = 'auto_ban_words'");
            res.json({
                success: true,
                list: bans.rows,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.max(1, Math.ceil(total / limit))
                },
                ban_message: settings.rows[0]?.value,
                auto_ban_words: autoBanSetting.rows[0]?.value || ''
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
        username = username.toString().trim().replace(/^@/, '').toLowerCase();
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
        username = username.toString().trim().replace(/^@/, '').toLowerCase();
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

    router.get('/api/admin/auto-ban-words', apiAuth, adminOnly, async (req, res) => {
        try {
            const result = await db.execute("SELECT value FROM settings WHERE key = 'auto_ban_words'");
            res.json({ success: true, words: result.rows[0]?.value || '' });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    router.post('/api/admin/auto-ban-words', apiAuth, adminOnly, async (req, res) => {
        const words = normalizeAutoBanWords(req.body?.words).join('\n');
        try {
            await db.execute({
                sql: "INSERT INTO settings (key, value) VALUES ('auto_ban_words', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                args: [words]
            });
            res.json({ success: true, message: "Daftar kata auto-ban berhasil diperbarui.", words });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    router.post('/api/admin/ban-by-auto-ban-words', apiAuth, adminOnly, async (req, res) => {
        try {
            const setting = await db.execute("SELECT value FROM settings WHERE key = 'auto_ban_words'");
            const words = normalizeAutoBanWords(setting.rows[0]?.value);
            if (!words.length) {
                return res.status(400).json({ success: false, error: 'Daftar kata auto-ban masih kosong.' });
            }

            const logs = await db.execute(`
                SELECT username, user_message
                FROM chat_logs
                WHERE username IS NOT NULL
                    AND TRIM(username) != ''
                ORDER BY id DESC
                LIMIT 5000
            `);

            const matchedUsers = new Map();
            for (const row of logs.rows) {
                const username = String(row.username || '').trim().replace(/^@/, '').toLowerCase();
                if (!username || matchedUsers.has(username)) continue;
                const matchedWord = findAutoBanWord(row.user_message, words);
                if (matchedWord) matchedUsers.set(username, matchedWord);
            }

            for (const username of matchedUsers.keys()) {
                await db.execute({
                    sql: "INSERT OR IGNORE INTO banned_users (username) VALUES (?)",
                    args: [username]
                });
            }

            res.json({
                success: true,
                message: `${matchedUsers.size} user berhasil diproses sesuai kata auto-ban.`,
                banned: Array.from(matchedUsers, ([username, matched_word]) => ({ username, matched_word }))
            });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    return router;
}

module.exports = {
    createAdminRoutes
};
