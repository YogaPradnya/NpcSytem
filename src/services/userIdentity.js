'use strict';

/**
 * Identitas user stabil (user_id) untuk leaderboard & tabel user.
 *
 * - Client chat boleh mengirim `user.id` (ID akun yang stabil — tidak berubah
 *   walau user ganti nama tampilan atau ganti perangkat). Nilai itu dipakai
 *   apa adanya sebagai user_id.
 * - Data lama (dan client yang belum ikut mengirim ID) memakai identitas
 *   `legacy:<nama ternormalisasi>` — lowercase + buang spasi/@ di ujung.
 *   Normalisasi ini otomatis menggabungkan username yang dulu terpecah karena
 *   beda huruf besar/kecil (mis. "Zyxe" vs "zyxe").
 * - Saat user ber-ID asli chat dengan nama yang masih punya histori lama,
 *   claimLegacyUser() memindahkan histori itu ke ID-nya supaya statistik tidak
 *   terbelah antara era sebelum & sesudah pakai ID.
 * - ensureUserIdentitySchema() / backfillUserIds() dipanggil otomatis saat boot
 *   (src/db.js) dan lewat scripts/migrate-user-id.js — keduanya idempoten.
 *
 * Catatan namespace: user_id dari client TIDAK boleh diawali "legacy:"
 * (itu namespace cadangan) — bila dikirim, dianggap tidak valid → fallback.
 */

const LEGACY_PREFIX = 'legacy:';
const USER_ID_MAX_LENGTH = 64;
// Huruf/angka di karakter pertama, sisanya karakter umum ID akun
// (UUID, snowflake angka, email-ish, dsb). Karakter aneh ditolak → fallback legacy.
const USER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@+-]*$/;

/** Normalisasi kunci nama: buang spasi & '@' di ujung, lalu lowercase. */
function normalizeNameKey(username) {
    return String(username ?? '')
        .replace(/^@+/, '')
        .replace(/@+$/, '')
        .trim()
        .toLowerCase();
}

/** Identitas cadangan untuk baris tanpa ID akun (juga hasil backfill data lama). */
function legacyIdFor(username) {
    return LEGACY_PREFIX + normalizeNameKey(username);
}

/**
 * Validasi + rapikan ID akun dari client. Tidak valid → null (fallback ke
 * legacy), bukan error — supaya chat tetap jalan walau client mengirim ID aneh.
 */
function sanitizeUserId(raw) {
    if (raw === undefined || raw === null) return null;
    const value = String(raw).trim();
    if (!value || value.length > USER_ID_MAX_LENGTH) return null;
    if (!USER_ID_PATTERN.test(value)) return null;
    if (value.toLowerCase().startsWith(LEGACY_PREFIX)) return null; // namespace cadangan
    return value;
}

async function columnExists(db, table, column) {
    const res = await db.execute(`PRAGMA table_info(${table})`);
    return res.rows.some((r) => String(r.name) === column);
}

/** Timestamp paling baru dari dua nilai (string datetime SQLite aman dibanding lexikografis). */
function pickLatestTs(a, b) {
    const sa = a == null ? null : String(a);
    const sb = b == null ? null : String(b);
    if (sa && sb) return sa >= sb ? a : b;
    return sa ? a : (sb ? b : null);
}

/**
 * Bangun ulang tabel users → (user_id PK, username, last_seen).
 * Nama yang sama setelah normalisasi digabung: username = nama terbaru,
 * last_seen = paling akhir. Dipakai sekali saat migrasi ke skema user_id.
 */
async function rebuildUsersTable(db) {
    const rows = (await db.execute('SELECT username, last_seen FROM users')).rows;
    const merged = new Map(); // user_id -> { username, last_seen }
    for (const row of rows) {
        const name = String(row.username ?? '').trim();
        if (!name) continue;
        const key = legacyIdFor(name);
        const seen = row.last_seen == null ? null : String(row.last_seen);
        const cur = merged.get(key);
        if (!cur) {
            merged.set(key, { username: name, last_seen: seen });
            continue;
        }
        if (seen && (!cur.last_seen || seen > cur.last_seen)) {
            cur.username = name;
            cur.last_seen = seen;
        }
    }

    const entries = [...merged.entries()];
    const tx = await db.transaction('write');
    try {
        await tx.execute('DROP TABLE IF EXISTS users_new');
        await tx.execute(`CREATE TABLE users_new (
            user_id TEXT PRIMARY KEY,
            username TEXT,
            last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
        for (let i = 0; i < entries.length; i += 100) {
            const chunk = entries.slice(i, i + 100);
            const sql = 'INSERT OR REPLACE INTO users_new (user_id, username, last_seen) VALUES '
                + chunk.map(() => '(?, ?, ?)').join(', ');
            const args = [];
            for (const [key, v] of chunk) args.push(key, v.username, v.last_seen);
            await tx.execute({ sql, args });
        }
        await tx.execute('DROP TABLE users');
        await tx.execute('ALTER TABLE users_new RENAME TO users');
        await tx.commit();
    } catch (e) {
        try { await tx.rollback(); } catch (_) { /* noop */ }
        throw e;
    }
    return entries.length;
}

/**
 * Sama seperti rebuildUsersTable tapi untuk user_chat_time:
 * total_seconds dari nama yang digabung dijumlahkan, last_message_at diambil
 * yang paling akhir, username = nama pada baris terakhir.
 */
async function rebuildChatTimeTable(db) {
    const rows = (await db.execute('SELECT username, total_seconds, last_message_at FROM user_chat_time')).rows;
    const merged = new Map(); // user_id -> { username, total_seconds, last_message_at }
    for (const row of rows) {
        const name = String(row.username ?? '').trim();
        if (!name) continue;
        const key = legacyIdFor(name);
        const total = Number(row.total_seconds) || 0;
        const ts = row.last_message_at == null ? null : String(row.last_message_at);
        const cur = merged.get(key);
        if (!cur) {
            merged.set(key, { username: name, total_seconds: total, last_message_at: ts });
            continue;
        }
        cur.total_seconds += total;
        if (ts && (!cur.last_message_at || ts > cur.last_message_at)) {
            cur.username = name;
            cur.last_message_at = ts;
        }
    }

    const entries = [...merged.entries()];
    const tx = await db.transaction('write');
    try {
        await tx.execute('DROP TABLE IF EXISTS user_chat_time_new');
        await tx.execute(`CREATE TABLE user_chat_time_new (
            user_id TEXT PRIMARY KEY,
            username TEXT,
            total_seconds REAL DEFAULT 0,
            last_message_at DATETIME
        )`);
        for (let i = 0; i < entries.length; i += 100) {
            const chunk = entries.slice(i, i + 100);
            const sql = 'INSERT OR REPLACE INTO user_chat_time_new (user_id, username, total_seconds, last_message_at) VALUES '
                + chunk.map(() => '(?, ?, ?, ?)').join(', ');
            const args = [];
            for (const [key, v] of chunk) args.push(key, v.username, v.total_seconds, v.last_message_at);
            await tx.execute({ sql, args });
        }
        await tx.execute('DROP TABLE user_chat_time');
        await tx.execute('ALTER TABLE user_chat_time_new RENAME TO user_chat_time');
        await tx.commit();
    } catch (e) {
        try { await tx.rollback(); } catch (_) { /* noop */ }
        throw e;
    }
    return entries.length;
}

/**
 * Backfill chat_logs.user_id untuk baris lama (tanpa ID akun):
 * 'legacy:' + LOWER(TRIM(TRIM(username, '@'))).
 * Harus sama persis dengan normalizeNameKey() di atas & query claim.
 * Idempoten: hanya menyentuh baris yang user_id-nya masih NULL.
 */
async function backfillUserIds(db) {
    const res = await db.execute({
        sql: `UPDATE chat_logs SET user_id = ? || LOWER(TRIM(TRIM(username, '@')))
              WHERE user_id IS NULL AND username IS NOT NULL AND TRIM(username) != ''`,
        args: [LEGACY_PREFIX]
    });
    return Number(res.rowsAffected) || 0;
}

/**
 * Pindahkan histori 'legacy:<nama>' ke user_id asli (ID akun) saat pertama kali
 * user ber-ID chat. Semua langkah dijalankan dalam satu transaksi supaya tidak
 * ada baris yang "nyangkut" kalau gagal di tengah.
 * Return jumlah baris chat_logs yang dipindahkan (0 = tidak ada histori lama).
 */
async function claimLegacyUser(db, { userId, username } = {}) {
    const uid = sanitizeUserId(userId);
    const legacyId = legacyIdFor(username);
    if (!uid || !legacyId || legacyId === LEGACY_PREFIX || uid === legacyId) return 0;

    const probe = await db.execute({
        sql: 'SELECT 1 FROM chat_logs WHERE user_id = ? LIMIT 1',
        args: [legacyId]
    });
    if (probe.rows.length === 0) return 0;

    const tx = await db.transaction('write');
    try {
        const moved = await tx.execute({
            sql: 'UPDATE chat_logs SET user_id = ? WHERE user_id = ?',
            args: [uid, legacyId]
        });

        // user_chat_time: jumlahkan total detik, ambil timestamp paling akhir.
        const legacyTime = (await tx.execute({
            sql: 'SELECT username, total_seconds, last_message_at FROM user_chat_time WHERE user_id = ?',
            args: [legacyId]
        })).rows[0];
        if (legacyTime) {
            const targetTime = (await tx.execute({
                sql: 'SELECT username, total_seconds, last_message_at FROM user_chat_time WHERE user_id = ?',
                args: [uid]
            })).rows[0];
            const totalSeconds = Number(legacyTime.total_seconds || 0) + Number(targetTime?.total_seconds || 0);
            const lastAt = pickLatestTs(legacyTime.last_message_at, targetTime?.last_message_at);
            const name = targetTime?.username || legacyTime.username;
            if (targetTime) {
                await tx.execute({
                    sql: 'UPDATE user_chat_time SET username = ?, total_seconds = ?, last_message_at = ? WHERE user_id = ?',
                    args: [name, totalSeconds, lastAt, uid]
                });
            } else {
                await tx.execute({
                    sql: 'INSERT INTO user_chat_time (user_id, username, total_seconds, last_message_at) VALUES (?, ?, ?, ?)',
                    args: [uid, name, totalSeconds, lastAt]
                });
            }
            await tx.execute({ sql: 'DELETE FROM user_chat_time WHERE user_id = ?', args: [legacyId] });
        }

        // users: pertahankan nama terlama-yang-terbaru, last_seen paling akhir.
        const legacyUser = (await tx.execute({
            sql: 'SELECT username, last_seen FROM users WHERE user_id = ?',
            args: [legacyId]
        })).rows[0];
        if (legacyUser) {
            const targetUser = (await tx.execute({
                sql: 'SELECT username, last_seen FROM users WHERE user_id = ?',
                args: [uid]
            })).rows[0];
            const lastSeen = pickLatestTs(legacyUser.last_seen, targetUser?.last_seen);
            const name = targetUser?.username || legacyUser.username;
            if (targetUser) {
                await tx.execute({
                    sql: 'UPDATE users SET username = ?, last_seen = ? WHERE user_id = ?',
                    args: [name, lastSeen, uid]
                });
            } else {
                await tx.execute({
                    sql: 'INSERT INTO users (user_id, username, last_seen) VALUES (?, ?, ?)',
                    args: [uid, name, lastSeen]
                });
            }
            await tx.execute({ sql: 'DELETE FROM users WHERE user_id = ?', args: [legacyId] });
        }

        // Ban ikut pindah ke ID akun: baris ban 'legacy:<nama>' diperbarui jadi
        // ID asli. Kalau user ternyata sudah diban dengan ID akun-nya, baris
        // legacy dihapus saja (sudah tertutup baris ID-nya) supaya tidak duplikat
        // dengan UNIQUE index banned_users(user_id).
        await tx.execute({
            sql: `UPDATE banned_users SET user_id = ?
                  WHERE user_id = ? AND NOT EXISTS (SELECT 1 FROM banned_users WHERE user_id = ?)`,
            args: [uid, legacyId, uid]
        });
        await tx.execute({ sql: 'DELETE FROM banned_users WHERE user_id = ?', args: [legacyId] });

        await tx.commit();
        return Number(moved.rowsAffected) || 0;
    } catch (e) {
        try { await tx.rollback(); } catch (_) { /* noop */ }
        throw e;
    }
}

/**
 * Pastikan skema mendukung user_id (idempoten; aman dipanggil tiap boot):
 * 1. chat_logs.user_id ditambahkan bila belum ada.
 * 2. Tabel users / user_chat_time kuno (PK username) dibangun ulang ke PK user_id.
 * 3. Index pendukung dibuat.
 */
async function ensureUserIdentitySchema(db, log = () => {}) {
    const report = { chatLogsColumnAdded: false, usersRebuilt: 0, chatTimeRebuilt: 0 };

    if (!(await columnExists(db, 'chat_logs', 'user_id'))) {
        try {
            await db.execute('ALTER TABLE chat_logs ADD COLUMN user_id TEXT');
            report.chatLogsColumnAdded = true;
            log('[schema] kolom chat_logs.user_id ditambahkan');
        } catch (e) {
            if (!/duplicate column/i.test(String(e.message || ''))) throw e;
        }
    }

    if (!(await columnExists(db, 'users', 'user_id'))) {
        report.usersRebuilt = await rebuildUsersTable(db);
        log(`[schema] tabel users dibangun ulang → PK user_id (${report.usersRebuilt} identitas, case-variant digabung)`);
    }

    if (!(await columnExists(db, 'user_chat_time', 'user_id'))) {
        report.chatTimeRebuilt = await rebuildChatTimeTable(db);
        log(`[schema] tabel user_chat_time dibangun ulang → PK user_id (${report.chatTimeRebuilt} identitas)`);
    }

    // Ban ikut identitas: banned_users.user_id (kolom + pemetaan baris lama).
    // Ban lama berbasis username dipetakan ke 'legacy:<nama>' — sama seperti
    // chat_logs — supaya cek ban per-ID akun tetap menangkapnya.
    if (!(await columnExists(db, 'banned_users', 'user_id'))) {
        await db.execute('ALTER TABLE banned_users ADD COLUMN user_id TEXT');
        report.bannedColumnAdded = true;
        log('[schema] kolom banned_users.user_id ditambahkan');
        const mapped = await db.execute({
            sql: `UPDATE banned_users SET user_id = ? || LOWER(TRIM(TRIM(username, '@')))
                  WHERE user_id IS NULL AND username IS NOT NULL AND TRIM(username) != ''`,
            args: [LEGACY_PREFIX]
        });
        report.bannedRowsMapped = Number(mapped.rowsAffected) || 0;
        log(`[schema] ${report.bannedRowsMapped} baris ban lama dipetakan ke user_id legacy`);

        // Baris yang setelah normalisasi jadi sama (varian huruf besar/kecil dsb)
        // digabungkan: pertahankan baris tertua, sisanya dihapus.
        const banRows = (await db.execute('SELECT id, user_id FROM banned_users WHERE user_id IS NOT NULL ORDER BY id ASC')).rows;
        const seen = new Set();
        const duplicateIds = [];
        for (const row of banRows) {
            if (seen.has(String(row.user_id))) duplicateIds.push(Number(row.id));
            else seen.add(String(row.user_id));
        }
        for (const id of duplicateIds) {
            await db.execute({ sql: 'DELETE FROM banned_users WHERE id = ?', args: [id] });
        }
        report.bannedDuplicatesRemoved = duplicateIds.length;
        if (duplicateIds.length) log(`[schema] ${duplicateIds.length} baris ban duplikat digabung`);
    }

    await db.execute('CREATE INDEX IF NOT EXISTS idx_chat_logs_user_id ON chat_logs(user_id)');
    await db.execute('CREATE INDEX IF NOT EXISTS idx_user_chat_time_leaderboard ON user_chat_time(total_seconds DESC, user_id ASC)');
    // Satu baris ban per identitas; INSERT OR IGNORE mengandalkan ini juga.
    await db.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_banned_user_id ON banned_users(user_id)');

    return report;
}

// Pola untuk lookup identitas lama lewat filter/query param (?user_id=legacy:...).
const LEGACY_ID_PATTERN = /^legacy:[^\x00-\x1f\x7f]{1,57}$/;

/**
 * Seperti sanitizeUserId() tapi juga menerima nilai `legacy:<nama>`.
 * Dipakai untuk FILTER pencarian (bukan identitas yang dikirim client).
 */
function sanitizeUserIdFilter(raw) {
    if (raw === undefined || raw === null) return null;
    const value = String(raw).trim();
    if (!value) return null;
    const asAccount = sanitizeUserId(value);
    if (asAccount) return asAccount;
    if (LEGACY_ID_PATTERN.test(value)) return value;
    return null;
}

module.exports = {
    LEGACY_PREFIX,
    USER_ID_MAX_LENGTH,
    normalizeNameKey,
    legacyIdFor,
    sanitizeUserId,
    sanitizeUserIdFilter,
    ensureUserIdentitySchema,
    backfillUserIds,
    claimLegacyUser
};
