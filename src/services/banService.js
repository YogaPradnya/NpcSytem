'use strict';

/**
 * Sistem ban massal berbasis kata terlarang.
 *
 * Dua pintu, satu mesin:
 *   - Dashboard admin: GET /api/admin/badword-scan (pindai + pratinjau) dan
 *     POST /api/admin/badword-mass-ban (pindai + langsung ban semua).
 *   - CLI: scripts/mass-ban-badwords.js (sama, dengan --dry-run default).
 *
 * Cara kerja:
 *   1. Daftar kata aktif = settings `badwords` milik admin bila diisi,
 *      kalau kosong pakai daftar default badwordFilter.js (sama persis dengan
 *      yang dipakai auto-ban live).
 *   2. Semua chat_logs dipindai bertahap (id-index, hemat memori) dengan
 *      semantik yang SAMA dengan auto-ban: regex word-boundary + normalisasi
 *      leetspeak (k0ntol → kontol). Pesan yang cocok dihitung per user_id.
 *   3. Semua user yang cocok di-ban dengan alasan otomatis, mis.:
 *      "mass-ban: pesan memuat kata terlarang ('kontol', 'sex')".
 *      User yang sudah diban tidak diulang.
 *   4. Posisi scan terakhir disimpan di settings `badword_scan_last_id`
 *      supaya scan berikutnya incremental (hanya pesan baru). Scan penuh
 *      dari awal bisa dipaksa (--full / ?full=1 / body { full: true }).
 */

const { getBadWords, makeScanner } = require('../utils/badwordFilter');
const { ensureUserIdentitySchema, legacyIdFor } = require('./userIdentity');

const SCAN_MARKER_KEY = 'badword_scan_last_id';
const REASON_PREFIX = 'mass-ban';

/** Parse input kata flexibel: array, JSON array, atau teks pisah koma/baris. */
function parseWordsFromList(input) {
    if (input == null) return [];
    if (typeof input === 'string') {
        const text = input.trim();
        if (!text) return [];
        if (text.startsWith('[')) {
            try {
                const arr = JSON.parse(text);
                if (Array.isArray(arr)) return normalizeWords(arr);
            } catch (e) { /* fallback split manual */ }
        }
        return normalizeWords(text.split(/[\n,;]+/));
    }
    return normalizeWords(input);
}

function normalizeWords(input) {
    const arr = Array.isArray(input) ? input : [input];
    return [...new Set(
        arr.map(w => String(w ?? '').trim().toLowerCase()).filter(w => w.length > 0 && w.length <= 50)
    )].slice(0, 500);
}

/**
 * Daftar kata yang sedang AKTIF dipakai auto-ban:
 * custom settings `badwords` bila diisi, kalau tidak → daftar default.
 */
async function getActiveBadWords(db) {
    let custom = [];
    try {
        const setting = await db.execute("SELECT value FROM settings WHERE key = 'badwords'");
        custom = parseWordsFromList(setting.rows?.[0]?.value || '');
    } catch (e) { /* tabel settings mungkin belum ada */ }
    return custom.length > 0 ? custom : getBadWords();
}

/** Posisi scan terakhir (id chat_logs). 0 = belum pernah scan. */
async function getScanMarker(db) {
    try {
        const res = await db.execute({
            sql: 'SELECT value FROM settings WHERE key = ?',
            args: [SCAN_MARKER_KEY]
        });
        const id = Number(res.rows?.[0]?.value);
        return Number.isFinite(id) && id >= 0 ? id : 0;
    } catch (e) {
        return 0;
    }
}

async function setScanMarker(db, id) {
    await db.execute({
        sql: 'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
        args: [SCAN_MARKER_KEY, String(id)]
    });
}

/** Kumpulkan id chat_logs yang sudah ada... */
function existingBanKeySets(rows) {
    const ids = new Set();
    const names = new Set();
    for (const row of rows) {
        if (row.user_id != null) ids.add(String(row.user_id));
        const name = String(row.username ?? '').trim().toLowerCase();
        if (name) names.add(name);
    }
    return { ids, names };
}

/**
 * Pindai chat_logs bertahap lewat index id (PK). Hemat memori: 2000 baris per
 * putaran. Kembalikan agregat per user_id + jumlah baris dipindai + id terakhir.
 */
async function scanBadwordUsers(db, { scanner, fromId = 0, log = () => {}, chunkRows = 2000 }) {
    const results = new Map(); // user_id -> agregat
    let cursor = fromId;
    let scanned = 0;

    for (;;) {
        const res = await db.execute({
            sql: 'SELECT id, user_id, username, user_message, timestamp FROM chat_logs WHERE id > ? ORDER BY id LIMIT ?',
            args: [cursor, chunkRows]
        });
        if (!res.rows.length) break;

        for (const row of res.rows) {
            const rowId = Number(row.id) || 0;
            if (rowId > cursor) cursor = rowId;
            scanned++;

            const message = row.user_message ? String(row.user_message) : '';
            if (!message.trim() || row.user_id == null) continue;

            const matched = scanner.match(message);
            if (!matched.length) continue;

            const key = String(row.user_id);
            const ts = row.timestamp == null ? null : String(row.timestamp);
            let rec = results.get(key);
            if (!rec) {
                rec = {
                    user_id: key,
                    username: '',
                    matched_words: new Set(),
                    matched_chat_count: 0,
                    first_matched: ts,
                    last_matched: ts,
                    sample_message: message
                };
                results.set(key, rec);
            }
            if (row.username) rec.username = String(row.username); // nama terkini yang ditemukan
            rec.matched_chat_count++;
            for (const w of matched) rec.matched_words.add(w);
            if (ts) {
                if (!rec.first_matched || ts < rec.first_matched) rec.first_matched = ts;
                if (!rec.last_matched || ts > rec.last_matched) rec.last_matched = ts;
            }
        }
        log(`[scan] ${scanned.toLocaleString('id-ID')} pesan dipindai, ${results.size.toLocaleString('id-ID')} user cocok…`);
        if (res.rows.length < chunkRows) break;
    }

    return { results: [...results.values()], scannedRows: scanned, lastId: cursor };
}

/** Ban semua hasil scan. Prioritaskan pesan agar alasan ban informatif. */
function buildReason(rec, activeWords) {
    const wordSet = rec.matched_words instanceof Set ? rec.matched_words : new Set(rec.matched_words);
    const inList = activeWords.filter(w => wordSet.has(w));
    const rest = [...wordSet].filter(w => !activeWords.includes(w));
    const picked = inList.concat(rest).slice(0, 3);
    return `${REASON_PREFIX}: pesan memuat kata terlarang (${picked.map(w => `'${w}'`).join(', ')})`;
}

function displayName(userId, username) {
    if (username) return username;
    const id = String(userId || '');
    return id.startsWith('legacy:') ? '@' + id.slice('legacy:'.length) : id;
}

/**
 * INSERT semua ban. Batch (db.batch) supaya cepat; fallback satu-per-satu bila
 * batch tidak tersedia. rowsAffected>0 = benar-benar baru di-ban.
 */
async function insertBans(db, usersWithReason, log = () => {}) {
    const stmts = usersWithReason.map(rec => ({
        sql: 'INSERT OR IGNORE INTO banned_users (user_id, username, reason) VALUES (?, ?, ?)',
        args: [rec.user_id, rec.username, rec.reason]
    }));

    let inserted = 0;
    if (typeof db.batch === 'function') {
        const CHUNK = 100;
        for (let i = 0; i < stmts.length; i += CHUNK) {
            try {
                const results = await db.batch(stmts.slice(i, i + CHUNK), 'write');
                for (const r of results) inserted += Number(r.rowsAffected) || 0;
            } catch (e) {
                // batch bisa gagal per-chunk (mis. kontradiksi unik) → ulangi satu-satu
                for (const s of stmts.slice(i, i + CHUNK)) {
                    try {
                        const res = await db.execute(s);
                        inserted += Number(res.rowsAffected) || 0;
                    } catch (e2) {
                        log(`[mass-ban] gagal ban ${s.args[0]}: ${e2.message}`);
                    }
                }
            }
        }
    } else {
        for (const s of stmts) {
            try {
                const res = await db.execute(s);
                inserted += Number(res.rowsAffected) || 0;
            } catch (e) {
                log(`[mass-ban] gagal ban ${s.args[0]}: ${e.message}`);
            }
        }
    }
    return inserted;
}

function toPublicUser(rec, activeWords, alreadyBanned) {
    const wordSet = rec.matched_words instanceof Set ? rec.matched_words : new Set(rec.matched_words);
    const inList = activeWords.filter(w => wordSet.has(w));
    const rest = [...wordSet].filter(w => !activeWords.includes(w));
    return {
        user_id: rec.user_id,
        username: rec.username || displayName(rec.user_id),
        matched_chat_count: rec.matched_chat_count,
        words: inList.concat(rest).slice(0, 5),
        first_matched: rec.first_matched,
        last_matched: rec.last_matched,
        sample: (rec.sample_message || '').replace(/\s+/g, ' ').trim().slice(0, 180),
        already_banned: !!alreadyBanned
    };
}

/**
 * Satu panggilan lengkap: pindai (+ opsional ban) sesuai daftar kata.
 * @param {object} db client libSQL
 * @param {object} options { words, full, apply, previewLimit, log }
 */
async function scanAndMaybeBan(db, options = {}) {
    const {
        words = null,
        full = false,
        apply = false,
        previewLimit = 200,
        log = () => {}
    } = options;

    // banned_users.user_id harus sudah ada (idempoten; sekali saja di boot/script).
    await ensureUserIdentitySchema(db, log);

    const activeWords = words == null ? await getActiveBadWords(db) : parseWordsFromList(words);
    if (!activeWords.length) throw new Error('Daftar kata terlarang kosong.');
    const scanner = makeScanner(activeWords);

    const fromId = full ? 0 : await getScanMarker(db);
    const bansNow = existingBanKeySets((await db.execute('SELECT user_id, username FROM banned_users')).rows);
    log(`[scan] mulai dari id > ${fromId} dengan ${activeWords.length} kata terlarang`);

    const t0 = Date.now();
    const scan = await scanBadwordUsers(db, { scanner, fromId, log });
    for (const rec of scan.results) {
        const nameKey = String(rec.username || '').trim().toLowerCase();
        rec.already_banned = bansNow.ids.has(rec.user_id) || (nameKey && bansNow.names.has(nameKey));
    }
    log(`[scan] selesai: ${scan.scannedRows.toLocaleString('id-ID')} pesan dalam ${((Date.now() - t0) / 1000).toFixed(1)}s, ${scan.results.length} user cocok`);

    // Yang paling banyak pesan kasar saya taruh di atas.
    scan.results.sort((a, b) => b.matched_chat_count - a.matched_chat_count);

    let bannedNew = 0;
    let alreadyBanned = scan.results.filter(r => r.already_banned).length;
    if (apply) {
        const toInsert = scan.results.filter(r => !r.already_banned);
        const usersWithReason = toInsert.map(rec => {
            const nameKey = String(rec.username || '').trim().toLowerCase();
            if (nameKey) bansNow.names.add(nameKey);
            return { user_id: rec.user_id, username: rec.username || displayName(rec.user_id), reason: buildReason(rec, activeWords) };
        });
        bannedNew = await insertBans(db, usersWithReason, log);
        alreadyBanned = scan.results.length - bannedNew;
        if (scan.lastId > fromId) await setScanMarker(db, scan.lastId);
        log(`[mass-ban] ${bannedNew.toLocaleString('id-ID')} user baru di-ban, ${alreadyBanned} sebelumnya`);
    }

    const preview = scan.results.slice(0, previewLimit)
        .map(rec => toPublicUser(rec, activeWords, rec.already_banned));

    return {
        words: activeWords,
        from_id: fromId,
        last_id: scan.lastId,
        scanned_rows: scan.scannedRows,
        duration_ms: Date.now() - t0,
        matched_users: scan.results.length,
        banned_new: bannedNew,
        already_banned: alreadyBanned,
        applied: !!apply,
        truncated: scan.results.length > preview.length,
        users: preview
    };
}

module.exports = {
    parseWordsFromList,
    getActiveBadWords,
    getScanMarker,
    setScanMarker,
    scanAndMaybeBan,
    SCAN_MARKER_KEY
};
