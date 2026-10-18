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

// ── Peringkat kata (total kata/karakter ketikan user) ───────────────────────
// Kata dihitung perkiraan dengan pemisah spasi (spasi ganda bisa terhitung
// ganda); karakter = panjang pesan apa adanya (termasuk spasi). Semua dihitung
// live dari chat_logs, tanpa tabel tambahan.
const WORD_COUNT_SQL = `(CASE WHEN user_message IS NULL OR TRIM(user_message) = '' THEN 0
    ELSE (LENGTH(TRIM(user_message)) - LENGTH(REPLACE(TRIM(user_message), ' ', '')) + 1) END)`;
const CHAR_COUNT_SQL = `COALESCE(LENGTH(user_message), 0)`;

async function getTopWordUsers(db, { limit = 10, aiName = null } = {}) {
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
                COUNT(*) as total_chats,
                SUM(${WORD_COUNT_SQL}) as total_words,
                SUM(${CHAR_COUNT_SQL}) as total_chars,
                MAX(timestamp) as last_active
              FROM chat_logs
              ${where}
              GROUP BY username
              ORDER BY total_words DESC, total_chats DESC
              LIMIT ?`,
        args: [...args, safeLimit]
    });
    return result.rows;
}

// Statistik total kata SATU user + peringkatnya di antara semua user
// (peringkat dihitung pada kelompok filter yang sama). Null kalau user tidak
// punya chat sama sekali.
async function getUserWordStats(db, { username, aiName = null } = {}) {
    let where = "WHERE username = ?";
    const args = [username];
    if (aiName) {
        where += " AND LOWER(ai_name) = ?";
        args.push(aiName);
    }

    const stats = await db.execute({
        sql: `SELECT
                COUNT(*) as total_chats,
                SUM(${WORD_COUNT_SQL}) as total_words,
                SUM(${CHAR_COUNT_SQL}) as total_chars,
                MAX(timestamp) as last_active
              FROM chat_logs
              ${where}`,
        args
    });

    const row = stats.rows[0];
    if (!row || Number(row.total_chats) === 0) return null;

    let rankWhere = "WHERE username IS NOT NULL AND TRIM(username) != ''";
    const rankArgs = [];
    if (aiName) {
        rankWhere += " AND LOWER(ai_name) = ?";
        rankArgs.push(aiName);
    }
    const rank = await db.execute({
        sql: `SELECT COUNT(*) + 1 as rank FROM (
                SELECT username, SUM(${WORD_COUNT_SQL}) as words
                FROM chat_logs
                ${rankWhere}
                GROUP BY username
              ) WHERE words > ?`,
        args: [...rankArgs, Number(row.total_words) || 0]
    });

    return {
        username: String(username),
        total_chats: Number(row.total_chats) || 0,
        total_words: Number(row.total_words) || 0,
        total_chars: Number(row.total_chars) || 0,
        last_active: row.last_active || null,
        rank: rank.rows[0] ? Number(rank.rows[0].rank) : null
    };
}

// ── Peringkat waifu (karakter AI paling sering dichat) ───────────────────────
async function getTopWaifus(db, { limit = 10 } = {}) {
    const safeLimit = normalizeLimit(limit, 10);
    const result = await db.execute({
        sql: `SELECT
                cl.ai_name,
                COUNT(*) as total_chats,
                COUNT(DISTINCT cl.username) as total_users,
                MAX(cl.timestamp) as last_active,
                (SELECT c.npc_name FROM characters c
                  WHERE LOWER(c.id) = LOWER(cl.ai_name) LIMIT 1) as npc_name
              FROM chat_logs cl
              WHERE cl.ai_name IS NOT NULL AND TRIM(cl.ai_name) != ''
              GROUP BY cl.ai_name
              ORDER BY total_chats DESC, cl.ai_name ASC
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
    getTopWordUsers,
    getUserWordStats,
    getTopWaifus,
    recordChatActivity,
    backfillChatTime,
    ensureChatTimeBackfill
};
