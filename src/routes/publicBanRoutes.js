// Halaman publik daftar ban (tanpa login).
// Hanya menampilkan username, alasan, dan tanggal ban. user_id dan data
// internal lain tidak pernah dikirim ke browser.

const express = require('express');

const PAGE_SIZE = 20;
const MAX_QUERY_LENGTH = 50;

function normalizePage(value) {
    const page = parseInt(value, 10);
    return Number.isFinite(page) && page > 0 ? page : 1;
}

function normalizeQuery(value) {
    return String(value ?? '').trim().slice(0, MAX_QUERY_LENGTH);
}

function createPublicBanRoutes({ db, getPublicBanPageHTML }) {
    const router = express.Router();

    router.get('/ban', async (req, res) => {
        const q = normalizeQuery(req.query.q);
        let page = normalizePage(req.query.page);

        try {
            const where = q ? "WHERE LOWER(username) LIKE LOWER(?) ESCAPE '\\'" : '';
            const likeQuery = q.replace(/[\\%_]/g, '\\$&');
            const filterArgs = q ? [`%${likeQuery}%`] : [];

            const countRes = await db.execute({
                sql: `SELECT COUNT(*) AS total FROM banned_users ${where}`,
                args: filterArgs
            });
            const total = Number(countRes.rows[0]?.total) || 0;
            const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
            page = Math.min(page, totalPages);

            const offset = (page - 1) * PAGE_SIZE;
            const listRes = await db.execute({
                sql: `SELECT username, reason, created_at FROM banned_users ${where}
                      ORDER BY created_at DESC, id DESC
                      LIMIT ? OFFSET ?`,
                args: [...filterArgs, PAGE_SIZE, offset]
            });

            const users = listRes.rows.map(row => ({
                username: String(row.username ?? ''),
                reason: String(row.reason ?? ''),
                created_at: row.created_at ?? null
            }));

            res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
            res.send(getPublicBanPageHTML({
                users,
                q,
                pagination: { page, limit: PAGE_SIZE, total, totalPages }
            }));
        } catch (err) {
            console.error('[PUBLIC BAN] gagal memuat daftar ban:', err.message);
            res.status(500).send(getPublicBanPageHTML({
                users: [],
                q,
                pagination: { page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 },
                error: 'Gagal memuat daftar ban. Coba lagi beberapa saat lagi.'
            }));
        }
    });

    return router;
}

module.exports = {
    createPublicBanRoutes,
    PAGE_SIZE,
    MAX_QUERY_LENGTH
};
