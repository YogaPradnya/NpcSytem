// Sumber data peringkat (leaderboard):
// - Top chat (jumlah chat per user) dihitung live dari tabel chat_logs.
// - Total jam obrolan aktif dipelihara incremental di tabel user_chat_time.
//   Aturan jeda: selisih antar pesan < 10 menit dihitung sebagai waktu aktif,
//   jeda >= 10 menit dianggap sesi baru (waktu di luar aplikasi) dan diabaikan.

const GAP_WINDOW_SECONDS = 10 * 60;
const LIMIT_CHOICES = [10, 20, 25, 50, 100];

function normalizeLimit(raw, fallback) {
    const n = parseInt(raw, 10);
    return LIMIT_CHOICES.includes(n) ? n : fallback;
}

function normalizeAiName(raw) {
    const value = String(raw ?? '').trim().toLowerCase();
    return value || null;
}

async function getTopChatUsers(db, { limit = 10, aiName = null } = {}) {
    const safeLimit = normalizeLimit(limit, 10);
    let where = "WHERE username IS NOT NULL AND TRIM(username) != ''";
    const args = [];
    if (aiName) {
        where += " AND LOWER(ai_name) = ?";
        args.push(aiName);
    }

    const result = await db.execute({
        sql: `SELECT
                username,
                MAX(user_level) as max_level,
                COUNT(*) as total_chats,
                MAX(timestamp) as last_active
              FROM chat_logs
              ${where}
              GROUP BY username
              ORDER BY max_level DESC, total_chats DESC
              LIMIT ?`,
        args: [...args, safeLimit]
    });
    return result.rows;
}

async function getTopChatHours(db, { limit = 25 } = {}) {
    const safeLimit = normalizeLimit(limit, 25);
    const result = await db.execute({
        sql: `SELECT username, total_seconds, last_message_at
              FROM user_chat_time
              ORDER BY total_seconds DESC, username ASC
              LIMIT ?`,
        args: [safeLimit]
    });
    return result.rows;
}

// Dipanggil setiap chat tersimpan: tambahkan selisih detik dari pesan sebelumnya
// bila jedanya < 10 menit. Satu query UPSERT; perhitungan gap dilakukan di SQLite
// memakai nilai baris lama (user_chat_time.last_message_at) vs nilai baru (excluded).
async function recordChatActivity(db, username) {
    const name = String(username ?? '').trim();
    if (!name) return;

    const gapExpr = '(julianday(excluded.last_message_at) - julianday(user_chat_time.last_message_at)) * 86400.0';
    await db.execute({
        sql: `INSERT INTO user_chat_time (username, total_seconds, last_message_at)
              VALUES (?, 0, CURRENT_TIMESTAMP)
              ON CONFLICT(username) DO UPDATE SET
                total_seconds = user_chat_time.total_seconds
                    + CASE WHEN ${gapExpr} >= 0 AND ${gapExpr} < ? THEN ${gapExpr} ELSE 0 END,
                last_message_at = excluded.last_message_at`,
        args: [name, GAP_WINDOW_SECONDS]
    });
}

// Backfill satu kali dari seluruh histori chat_logs (aturan jeda yang sama).
// INSERT ... SELECT tunggal, jadi atomik dan tanpa round-trip per user.
async function backfillChatTime(db) {
    await db.execute({
        sql: `INSERT OR REPLACE INTO user_chat_time (username, total_seconds, last_message_at)
              WITH ordered AS (
                  SELECT username, timestamp,
                         LAG(timestamp) OVER (PARTITION BY username ORDER BY timestamp) AS prev_ts,
                         MAX(timestamp) OVER (PARTITION BY username) AS last_active
                  FROM chat_logs
                  WHERE username IS NOT NULL AND TRIM(username) != ''
              ),
              gaps AS (
                  SELECT username, last_active,
                         (julianday(timestamp) - julianday(prev_ts)) * 86400.0 AS gap_seconds
                  FROM ordered
                  WHERE prev_ts IS NOT NULL
              )
              SELECT username,
                     SUM(CASE WHEN gap_seconds >= 0 AND gap_seconds < ? THEN gap_seconds ELSE 0 END),
                     MAX(last_active)
              FROM gaps
              GROUP BY username`,
        args: [GAP_WINDOW_SECONDS]
    });
}

// Backfill histori ke user_chat_time.
// - Production: cukup sekali (ditandai di settings) agar boot berikutnya cepat.
// - Non-production (lokal/tes): selalu backfill dan TIDAK menulis marker, supaya
//   boot lokal tidak pernah membuat backfill pertama di production ter-skip.
// Jika backfill gagal, marker tidak ditulis sehingga boot berikutnya mencoba lagi.
async function ensureChatTimeBackfill(db) {
    const isProduction = process.env.NODE_ENV === 'production';

    if (isProduction) {
        const marker = await db.execute("SELECT value FROM settings WHERE key = 'chat_time_backfill_v1'");
        if (marker.rows.length > 0) return false;
    }

    await backfillChatTime(db);

    if (isProduction) {
        await db.execute({
            sql: "INSERT INTO settings (key, value) VALUES ('chat_time_backfill_v1', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            args: [new Date().toISOString()]
        });
    }
    return true;
}

module.exports = {
    GAP_WINDOW_SECONDS,
    LIMIT_CHOICES,
    normalizeLimit,
    normalizeAiName,
    getTopChatUsers,
    getTopChatHours,
    recordChatActivity,
    backfillChatTime,
    ensureChatTimeBackfill
};
