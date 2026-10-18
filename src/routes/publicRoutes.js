// Endpoint publik read-only untuk web/app animein (tanpa login admin).
// Dilindungi API key statis dari env PUBLIC_STATS_KEY (header X-API-Key)
// + dibatasi rate-limit dan cache in-memory singkat.

const express = require('express');
const crypto = require('crypto');
const { getTopChatUsers, getTopChatHours, getTopWordUsers, getUserWordStats, getTopWaifus, normalizeLimit, normalizeAiName } = require('../services/leaderboardService');

const PUBLIC_CACHE_TTL_MS = 2 * 60 * 1000; // 2 menit
const AI_NAME_PATTERN = /^[a-z0-9._-]{1,50}$/;

function safeCompare(input, expected) {
    const bufA = Buffer.from(String(input ?? ''), 'utf8');
    const bufB = Buffer.from(String(expected ?? ''), 'utf8');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
}

function formatHours(totalSeconds) {
    return Math.round((totalSeconds / 3600) * 100) / 100;
}

function createPublicRoutes({ db }) {
    const router = express.Router();
    const cache = new Map();

    function requireApiKey(req, res, next) {
        const expected = process.env.PUBLIC_STATS_KEY;
        if (!expected) {
            return res.status(503).json({
                success: false,
                error: 'Public API belum diaktifkan. Set PUBLIC_STATS_KEY di .env lalu restart server.'
            });
        }

        const provided = req.get('x-api-key') || '';
        if (!provided || !safeCompare(provided, expected)) {
            return res.status(401).json({
                success: false,
                error: 'API key tidak valid. Kirim header X-API-Key.'
            });
        }
        next();
    }

    // Serve dari cache bila masih segar; cache per kombinasi param.
    async function respondWithCache(res, cacheKey, producer) {
        const hit = cache.get(cacheKey);
        if (hit && Date.now() - hit.at < PUBLIC_CACHE_TTL_MS) {
            res.set('X-Cache', 'HIT');
            res.set('Cache-Control', 'public, max-age=120');
            return res.json(hit.payload);
        }

        const payload = await producer();
        cache.set(cacheKey, { at: Date.now(), payload });
        res.set('X-Cache', 'MISS');
        res.set('Cache-Control', 'public, max-age=120');
        return res.json(payload);
    }

    function readAiName(query) {
        const raw = query?.ai_name;
        if (raw === undefined) return { aiName: null, error: null };

        const aiName = normalizeAiName(raw);
        if (!aiName) return { aiName: null, error: null };
        if (!AI_NAME_PATTERN.test(aiName)) {
            return { aiName: null, error: 'Parameter ai_name tidak valid. Gunakan ID karakter (huruf kecil, angka, - _ .).' };
        }
        return { aiName, error: null };
    }

    const USERNAME_MAX_LENGTH = 50;

    function readUsername(query) {
        const raw = query?.username;
        if (raw === undefined) return { username: null, error: null };

        const username = String(raw).trim();
        if (!username) return { username: null, error: null };
        if (username.length > USERNAME_MAX_LENGTH) {
            return { username: null, error: 'Parameter username tidak valid (maks 50 karakter).' };
        }
        return { username, error: null };
    }

    router.get('/api/public/top-chat', requireApiKey, async (req, res) => {
        try {
            const limit = normalizeLimit(req.query.limit, 10);
            const { aiName, error } = readAiName(req.query);
            if (error) return res.status(400).json({ success: false, error });

            const cacheKey = `top-chat:${limit}:${aiName || ''}`;
            await respondWithCache(res, cacheKey, async () => {
                const rows = await getTopChatUsers(db, { limit, aiName });
                return {
                    success: true,
                    generated_at: new Date().toISOString(),
                    limit,
                    ai_name: aiName,
                    users: rows.map((row, i) => ({
                        rank: i + 1,
                        username: row.username,
                        level: Number(row.max_level) || 0,
                        total_chat: Number(row.total_chats) || 0,
                        last_active: row.last_active || null
                    }))
                };
            });
        } catch (e) {
            console.error('[PUBLIC API] top-chat error:', e.message);
            res.status(500).json({ success: false, error: 'Gagal memuat data peringkat chat.' });
        }
    });

    router.get('/api/public/top-hours', requireApiKey, async (req, res) => {
        try {
            const limit = normalizeLimit(req.query.limit, 25);

            const cacheKey = `top-hours:${limit}`;
            await respondWithCache(res, cacheKey, async () => {
                const rows = await getTopChatHours(db, { limit });
                return {
                    success: true,
                    generated_at: new Date().toISOString(),
                    limit,
                    rule: { gap_minutes: 10 },
                    users: rows.map((row, i) => {
                        const totalSeconds = Math.max(0, Number(row.total_seconds) || 0);
                        return {
                            rank: i + 1,
                            username: row.username,
                            total_seconds: Math.round(totalSeconds),
                            total_hours: formatHours(totalSeconds),
                            last_active: row.last_message_at || null
                        };
                    })
                };
            });
        } catch (e) {
            console.error('[PUBLIC API] top-hours error:', e.message);
            res.status(500).json({ success: false, error: 'Gagal memuat data peringkat jam.' });
        }
    });

    router.get('/api/public/top-words', requireApiKey, async (req, res) => {
        try {
            const limit = normalizeLimit(req.query.limit, 10);
            const { aiName, error } = readAiName(req.query);
            if (error) return res.status(400).json({ success: false, error });

            const { username, error: usernameError } = readUsername(req.query);
            if (usernameError) return res.status(400).json({ success: false, error: usernameError });

            const cacheKey = `top-words:${limit}:${aiName || ''}:${username || ''}`;
            await respondWithCache(res, cacheKey, async () => {
                if (username) {
                    const stats = await getUserWordStats(db, { username, aiName });
                    return {
                        success: true,
                        generated_at: new Date().toISOString(),
                        limit,
                        ai_name: aiName,
                        username,
                        users: stats ? [{
                            rank: stats.rank,
                            username: stats.username,
                            total_words: stats.total_words,
                            total_chars: stats.total_chars,
                            total_chat: stats.total_chats,
                            last_active: stats.last_active
                        }] : []
                    };
                }

                const rows = await getTopWordUsers(db, { limit, aiName });
                return {
                    success: true,
                    generated_at: new Date().toISOString(),
                    limit,
                    ai_name: aiName,
                    username: null,
                    users: rows.map((row, i) => ({
                        rank: i + 1,
                        username: row.username,
                        total_words: Number(row.total_words) || 0,
                        total_chars: Number(row.total_chars) || 0,
                        total_chat: Number(row.total_chats) || 0,
                        last_active: row.last_active || null
                    }))
                };
            });
        } catch (e) {
            console.error('[PUBLIC API] top-words error:', e.message);
            res.status(500).json({ success: false, error: 'Gagal memuat data peringkat kata.' });
        }
    });

    router.get('/api/public/top-waifu', requireApiKey, async (req, res) => {
        try {
            const limit = normalizeLimit(req.query.limit, 10);

            const cacheKey = `top-waifu:${limit}`;
            await respondWithCache(res, cacheKey, async () => {
                const rows = await getTopWaifus(db, { limit });
                return {
                    success: true,
                    generated_at: new Date().toISOString(),
                    limit,
                    waifus: rows.map((row, i) => ({
                        rank: i + 1,
                        ai_name: row.ai_name,
                        name: row.npc_name || row.ai_name,
                        total_chat: Number(row.total_chats) || 0,
                        total_users: Number(row.total_users) || 0,
                        last_active: row.last_active || null
                    }))
                };
            });
        } catch (e) {
            console.error('[PUBLIC API] top-waifu error:', e.message);
            res.status(500).json({ success: false, error: 'Gagal memuat data peringkat waifu.' });
        }
    });

    return router;
}

module.exports = { createPublicRoutes };
