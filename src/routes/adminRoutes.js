const express = require('express');
const { formatUptime } = require('../stats');
const { parseHeartProfiles, stringifyHeartProfiles } = require('../heart_profiles');
const { getTopChatUsers, getTopChatHours, normalizeLimit, normalizeAiName } = require('../services/leaderboardService');
const { legacyIdFor } = require('../services/userIdentity');
const banService = require('../services/banService');

function parseBadwordsSetting(raw) {
    if (!raw) return [];
    const text = String(raw).trim();
    if (!text) return [];
    // Dukung format JSON array (["a","b"]) atau teks pisah koma/baris.
    if (text.startsWith('[')) {
        try {
            const arr = JSON.parse(text);
            if (Array.isArray(arr)) return normalizeBadwordsInput(arr);
        } catch (e) { /* fallback ke split manual */ }
    }
    return normalizeBadwordsInput(text.split(/[\n,;]+/));
}

function normalizeBadwordsInput(input) {
    const arr = Array.isArray(input) ? input : [input];
    const flat = [];
    for (const item of arr) {
        if (typeof item === 'string' && item.includes('\n')) flat.push(...item.split('\n'));
        else flat.push(item);
    }
    return [...new Set(
        flat.map(w => String(w || '').trim().toLowerCase()).filter(w => w.length > 0 && w.length <= 50)
    )].slice(0, 500);
}

function createAdminRoutes({    db,
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

    router.get('/api/admin/top-users', apiAuth, adminOnly, async (req, res) => {
        try {
            const limit = normalizeLimit(req.query.limit, 10);
            const aiName = normalizeAiName(req.query.ai_name);
            const users = await getTopChatUsers(db, { limit, aiName });
            res.json({ success: true, users });
        } catch (e) {
            console.error("[DB TOP USERS ERROR]:", e.message);
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // Peringkat jam: total waktu obrolan aktif per user
    // (jeda antar pesan < 10 menit dihitung, >= 10 menit diabaikan).
    router.get('/api/admin/top-hours', apiAuth, adminOnly, async (req, res) => {
        try {
            const limit = normalizeLimit(req.query.limit, 25);
            const rows = await getTopChatHours(db, { limit });
            res.json({
                success: true,
                rule: { gap_minutes: 10 },
                users: rows.map((row, i) => {
                    const totalSeconds = Math.max(0, Number(row.total_seconds) || 0);
                    return {
                        rank: i + 1,
                        username: row.username,
                        total_seconds: Math.round(totalSeconds),
                        total_hours: Math.round((totalSeconds / 3600) * 100) / 100,
                        last_active: row.last_message_at || null
                    };
                })
            });
        } catch (e) {
            console.error("[DB TOP HOURS ERROR]:", e.message);
            res.status(500).json({ success: false, error: e.message });
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
            const allowedLimits = [10, 20, 50, 100];
            const reqLimit = parseInt(req.query.limit, 10);
            const limit = allowedLimits.includes(reqLimit) ? reqLimit : 10;
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
            const rawId = String(id).trim();
            if (!rawId) return res.status(400).json({ error: "ID tidak boleh kosong" });

            // ID lama TIDAK diubah apa pun (pelestarian data existing).
            // Normalisasi hanya untuk karakter BARU agar konsisten lowercase.
            let finalId = rawId;
            const existsExact = await db.execute({
                sql: "SELECT id FROM characters WHERE id = ?",
                args: [rawId]
            });
            if (existsExact.rows.length === 0) {
                const normalized = rawId.toLowerCase();
                if (!/^[a-z0-9_-]{1,50}$/.test(normalized)) {
                    return res.status(400).json({ error: "ID baru hanya boleh huruf kecil, angka, tanda - dan _ (maks 50 karakter). Contoh: alya" });
                }
                const existsNormalized = await db.execute({
                    sql: "SELECT id FROM characters WHERE LOWER(id) = ?",
                    args: [normalized]
                });
                if (existsNormalized.rows.length > 0) {
                    return res.status(409).json({ error: `ID '${normalized}' sudah ada (tidak sensitif huruf-besar). Gunakan edit pada karakter tersebut.` });
                }
                finalId = normalized;
            }

            const createdAt = data.created_at || (characters[finalId] && characters[finalId].created_at) || new Date().toISOString();
            await db.execute({
                sql: `INSERT INTO characters (id, npc_name, npc_description, npc_personality, npc_speaking_style, character_background, language, heart_profiles, signature_style, is_enabled, created_at) 
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                      ON CONFLICT(id) DO UPDATE SET 
                      npc_name=excluded.npc_name, 
                      npc_description=excluded.npc_description, 
                      npc_personality=excluded.npc_personality, 
                      npc_speaking_style=excluded.npc_speaking_style, 
                      character_background=excluded.character_background, 
                      language=excluded.language,
                      heart_profiles=excluded.heart_profiles,
                      signature_style=excluded.signature_style,
                      is_enabled=excluded.is_enabled,
                      created_at=COALESCE(characters.created_at, excluded.created_at)`,
                args: [finalId, data.npc_name, data.npc_description, data.npc_personality, data.npc_speaking_style, data.character_background || '', data.language || 'id', stringifyHeartProfiles(data.heart_profiles), data.signature_style || '', data.is_enabled ? 1 : 0, createdAt]
            });

            characters[finalId] = { id: finalId, ...data, heart_profiles: parseHeartProfiles(data.heart_profiles), signature_style: data.signature_style || '', character_background: data.character_background || '', created_at: createdAt };
            res.json({ success: true, message: `Character ${finalId} saved to Turso.`, id: finalId });
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
            const result = await db.execute("SELECT * FROM characters ORDER BY created_at DESC");
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
            const allowedLimits = [10, 20, 50, 100];
            const reqLimit = parseInt(req.query.limit, 10);
            const limit = allowedLimits.includes(reqLimit) ? reqLimit : 10;
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
            const badwordsSetting = await db.execute("SELECT value FROM settings WHERE key = 'badwords'");
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
                auto_ban_words: badwordsSetting.rows[0]?.value || ''
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
        try {
            let username = String(req.body?.username ?? '').trim().replace(/^@+/, '').toLowerCase();
            if (!username) return res.status(400).json({ success: false, error: 'Username/ID user diperlukan.' });

            // Ban mengikuti identitas: pakai user_id akun bila terdaftar,
            // kalau tidak pakai ID legacy:<nama> (sama seperti data lama).
            const found = await db.execute({
                sql: "SELECT user_id FROM users WHERE LOWER(TRIM(TRIM(username, '@'))) = LOWER(TRIM(TRIM(?, '@'))) ORDER BY last_seen DESC LIMIT 1",
                args: [username]
            });
            const userId = found.rows[0]?.user_id || legacyIdFor(username);
            const reason = String(req.body?.reason ?? '').trim() || 'manual-ban oleh admin';

            await db.execute({
                sql: "INSERT OR IGNORE INTO banned_users (user_id, username, reason) VALUES (?, ?, ?)",
                args: [userId, username, reason]
            });
            res.json({ success: true, message: `User ${username} berhasil di-ban.` });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    router.post('/api/admin/unban-user', apiAuth, adminOnly, async (req, res) => {
        try {
            const raw = String(req.body?.username ?? '').trim();
            if (!raw) return res.status(400).json({ success: false, error: 'Username/ID user diperlukan.' });
            const username = raw.replace(/^@+/, '').toLowerCase().replace(/@+$/, '');

            // Lepas semua varian baris ban milik orang yang sama: ID akun
            // (bila terdaftar), ID legacy nama ini, dan varian nama apa pun.
            const found = await db.execute({
                sql: "SELECT user_id FROM users WHERE LOWER(TRIM(TRIM(username, '@'))) = LOWER(TRIM(TRIM(?, '@'))) ORDER BY last_seen DESC LIMIT 1",
                args: [username]
            });
            const resolvedId = found.rows[0]?.user_id || ':-:-:';
            const legacyId = legacyIdFor(username);

            const del = await db.execute({
                sql: `DELETE FROM banned_users
                      WHERE user_id = ? OR user_id = ? OR LOWER(TRIM(TRIM(username, '@'))) = LOWER(TRIM(TRIM(?, '@')))`,
                args: [resolvedId, legacyId, username]
            });
            const removed = Number(del.rowsAffected) || 0;
            res.json({
                success: true,
                message: removed > 0
                    ? `User ${username} berhasil dilepas dari ban (${removed} baris).`
                    : `Tidak ada ban aktif untuk ${username}.`
            });
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

    // ===== Sistem ban massal berbasis kata terlarang =====
    // 1) Daftar kata yang sedang aktif dipakai auto-ban.
    router.get('/api/admin/badword-words', apiAuth, adminOnly, async (req, res) => {
        try {
            const words = await banService.getActiveBadWords(db);
            res.json({ success: true, words });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // 2) Pindai histori chat + pratinjau hasil (tanpa men-ban).
    //    ?words=a,b      → pakai daftar kata sendiri (opsional)
    //    ?full=1         → pindai seluruh histori dari awal (bisa lama)
    router.get('/api/admin/badword-scan', apiAuth, adminOnly, async (req, res) => {
        try {
            const result = await banService.scanAndMaybeBan(db, {
                words: req.query.words || null,
                full: req.query.full === '1' || req.query.full === 'true',
                apply: false
            });
            res.json({ success: true, ...result });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // 3) Pindai + langsung ban SEMUA user yang pesannya cocok (alasan otomatis).
    router.post('/api/admin/badword-mass-ban', apiAuth, adminOnly, async (req, res) => {
        try {
            const result = await banService.scanAndMaybeBan(db, {
                words: req.body?.words ?? null,
                full: req.body?.full === true || req.body?.full === '1',
                apply: true
            });
            res.json({ success: true, ...result });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // Daftar kata kasar untuk auto-ban (diisi manual oleh admin).
    // Kosong = pakai daftar default di src/utils/badwordFilter.js.
    router.get('/api/admin/badwords', apiAuth, adminOnly, async (req, res) => {
        try {
            const { getBadWords } = require('../utils/badwordFilter');
            const settings = await db.execute("SELECT value FROM settings WHERE key = 'badwords'");
            const raw = settings.rows[0]?.value || '';
            res.json({ success: true, words: parseBadwordsSetting(raw), active_words: getBadWords() });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    router.post('/api/admin/badwords/update', apiAuth, adminOnly, async (req, res) => {
        try {
            const { setBadWords } = require('../utils/badwordFilter');
            const words = normalizeBadwordsInput(req.body?.words ?? req.body?.text ?? '');
            await db.execute({
                sql: "INSERT INTO settings (key, value) VALUES ('badwords', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                args: [words.join('\n')]
            });
            setBadWords(words.length > 0 ? words : null);
            res.json({ success: true, message: `Daftar kata kasar diperbarui (${words.length} kata).`, words });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });



    return router;
}

module.exports = {
    createAdminRoutes
};
