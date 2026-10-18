'use strict';

/**
 * Utilitas sinkronisasi antar database libSQL (Turso <-> sqld VPS).
 *
 * Dipakai oleh:
 *   - scripts/migrate-turso-to-sqld.js  (Turso -> sqld, saat pindah database)
 *   - scripts/backup-sqld-to-turso.js   (sqld -> Turso, backup harian)
 *
 * Cara kerja singkat:
 *   1. Skema tabel disalin persis dari sumber (CREATE TABLE IF NOT EXISTS).
 *   2. Data disalin per-batch (INSERT OR REPLACE), diurutkan lewat rowid
 *      sehingga aman diulang / bisa dilanjutkan kalau terputus.
 *      Rowid asli ikut disalin untuk tabel yang PK-nya bukan INTEGER
 *      (supaya salinannya benar-benar identik).
 *   3. Tabel chat_logs (besar, hanya bertambah) disalin incremental:
 *      hanya baris dengan rowid di atas data terakhir yang ada di target.
 *   4. Index dibuat setelah data selesai masuk.
 *   5. Counter AUTOINCREMENT (sqlite_sequence) ikut disamakan.
 */

const path = require('path');
const { createClient } = require('@libsql/client');

const DEFAULTS = {
    chunkRows: 1000,            // baris per batch baca dari sumber
    maxParams: 20000,           // batas parameter per statement INSERT
    maxBytes: 1500 * 1024,      // batas perkiraan ukuran per statement INSERT
};

function loadDotenv() {
    try {
        require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
    } catch (_) {
        /* dotenv opsional */
    }
}

function makeClient(role, url, authToken) {
    if (!url) throw new Error(`[${role}] URL belum diisi`);
    if (!authToken) throw new Error(`[${role}] auth token belum diisi`);
    return createClient({ url, authToken });
}

function quoteIdent(name) {
    return '"' + String(name).replace(/"/g, '""') + '"';
}

function quoteStr(s) {
    return "'" + String(s).replace(/'/g, "''") + "'";
}

function addIfNotExists(sql, type) {
    if (type === 'table') {
        return String(sql).replace(/^(\s*CREATE\s+TABLE\s+)(?!IF\s)/i, '$1IF NOT EXISTS ');
    }
    if (type === 'index') {
        return String(sql).replace(/^(\s*CREATE\s+(?:UNIQUE\s+)?INDEX\s+)(?!IF\s)/i, '$1IF NOT EXISTS ');
    }
    return sql;
}

async function listObjects(client) {
    const res = await client.execute(
        "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\'"
    );
    return res.rows.map((r) => ({
        type: String(r.type),
        name: String(r.name),
        tbl_name: String(r.tbl_name || ''),
        sql: String(r.sql),
    }));
}

async function tableInfo(client, table) {
    const res = await client.execute(`PRAGMA table_info(${quoteStr(table)})`);
    const cols = res.rows.map((r) => ({
        name: String(r.name),
        type: String(r.type || ''),
        pk: Number(r.pk || 0),
    }));
    // Kalau ada kolom INTEGER PRIMARY KEY (alias rowid), rowid = kolom itu,
    // jadi tidak perlu disalin terpisah. Kalau tidak ada, rowid disalin eksplisit.
    const pkIsRowidAlias = cols.some((c) => c.pk === 1 && /^integer$/i.test(c.type));
    return { columns: cols.map((c) => c.name), pkIsRowidAlias };
}

async function stats(client, table) {
    const res = await client.execute(
        `SELECT COUNT(*) AS n, IFNULL(SUM(rowid), 0) AS s, IFNULL(MAX(rowid), 0) AS m FROM ${quoteIdent(table)}`
    );
    const r = res.rows[0];
    return { n: Number(r.n), s: Number(r.s), m: Number(r.m) };
}

function toArg(v) {
    if (v === undefined) return null;
    if (typeof v === 'bigint') {
        return (v >= -9007199254740991n && v <= 9007199254740991n) ? Number(v) : v.toString();
    }
    return v;
}

function estimateBytesRow(row, columns) {
    let n = 0;
    for (const c of columns) {
        const v = row[c];
        n += typeof v === 'string' ? v.length + 2 : 18;
    }
    return n;
}

function splitRows(rows, columns, maxBytes, maxParams) {
    const parts = [];
    let cur = [];
    let bytes = 0;
    for (const row of rows) {
        const rb = estimateBytesRow(row, columns);
        const wouldExceedParams = (cur.length + 1) * (columns.length + 1) > maxParams;
        if (cur.length > 0 && (bytes + rb > maxBytes || wouldExceedParams)) {
            parts.push(cur);
            cur = [];
            bytes = 0;
        }
        cur.push(row);
        bytes += rb;
    }
    if (cur.length) parts.push(cur);
    return parts;
}

async function fetchChunk(source, table, afterRowid, limit) {
    return source.execute({
        sql: `SELECT rowid AS __sync_rowid__, * FROM ${quoteIdent(table)} WHERE rowid > ? ORDER BY rowid LIMIT ?`,
        args: [afterRowid, limit],
    });
}

async function insertChunk(target, table, columns, rows, includeRowid) {
    const insertCols = includeRowid ? ['rowid'].concat(columns) : columns;
    const head =
        `INSERT OR REPLACE INTO ${quoteIdent(table)} (` +
        insertCols.map((c) => (c === 'rowid' ? 'rowid' : quoteIdent(c))).join(', ') +
        ') VALUES ';
    const run = async (part) => {
        try {
            const valuesSql = part.map(() => '(' + insertCols.map(() => '?').join(', ') + ')').join(', ');
            const args = [];
            for (const row of part) {
                for (const c of insertCols) {
                    args.push(c === 'rowid' ? toArg(row.__sync_rowid__) : toArg(row[c]));
                }
            }
            await target.execute({ sql: head + valuesSql, args });
        } catch (e) {
            const msg = String((e && e.message) || e);
            // kalau statement kebesaran (parameter/ukuran), pecah dua lalu coba lagi
            const shrinkable = part.length > 1 && /too many sql variables|too many terms|variable|too big|payload|statement|413|length/i.test(msg);
            if (shrinkable) {
                const half = Math.ceil(part.length / 2);
                await run(part.slice(0, half));
                await run(part.slice(half));
                return;
            }
            throw e;
        }
    };
    await run(rows);
}

async function pruneStale(target, table, sourceRowids, log) {
    const res = await target.execute(`SELECT rowid AS r FROM ${quoteIdent(table)}`);
    const srcSet = new Set(sourceRowids);
    const stale = res.rows.map((r) => Number(r.r)).filter((r) => !srcSet.has(r));
    for (let i = 0; i < stale.length; i += 400) {
        const chunk = stale.slice(i, i + 400);
        await target.execute(
            `DELETE FROM ${quoteIdent(table)} WHERE rowid IN (${chunk.map(() => '?').join(',')})`,
            chunk
        );
    }
    if (stale.length && log) log(`  [prune] ${table}: ${stale.length} baris usang dihapus dari target`);
    return stale.length;
}

/**
 * Salin skema + data dari `source` ke `target`.
 * Opsi: onlyTables, chunkRows, maxParams, maxBytes, forceFull, prune, dryRun, log
 */
async function sync({
    source,
    target,
    onlyTables = null,
    chunkRows = DEFAULTS.chunkRows,
    maxParams = DEFAULTS.maxParams,
    maxBytes = DEFAULTS.maxBytes,
    forceFull = false,
    prune = false,
    dryRun = false,
    log = console.log,
}) {
    const srcObjects = await listObjects(source);
    const tgtObjects = await listObjects(target);
    const srcTables = srcObjects.filter((o) => o.type === 'table');
    const srcIndexes = srcObjects.filter((o) => o.type === 'index');
    const tgtNames = new Set(tgtObjects.map((o) => o.name));

    const skipped = srcTables.filter((o) => /WITHOUT\s+ROWID/i.test(o.sql)).map((o) => o.name);
    let tables = srcTables.filter((o) => !/WITHOUT\s+ROWID/i.test(o.sql)).map((o) => o.name);
    if (onlyTables && onlyTables.length) tables = tables.filter((t) => onlyTables.includes(t));
    // tabel kecil dulu, chat_logs (paling besar) paling belakang
    tables.sort((a, b) => (a === 'chat_logs' ? 1 : 0) - (b === 'chat_logs' ? 1 : 0));

    if (!tables.length) {
        throw new Error('Tidak ada tabel yang bisa disinkronkan di sumber — cek URL/token sumber (jangan-jangan sumber & tujuan tertukar).');
    }

    const plan = [];
    for (const t of tables) {
        plan.push({ table: t, source: await stats(source, t), existsOnTarget: tgtNames.has(t) });
    }

    if (dryRun) {
        log('RENCANA SINKRONISASI (dry-run, tidak menulis apa pun):');
        for (const p of plan) {
            log(`  ${p.table.padEnd(16)} sumber=${p.source.n} baris${p.existsOnTarget ? ' (tabel sudah ada di target)' : ' (tabel akan dibuat)'}`);
        }
        if (skipped.length) log('  dilewati (WITHOUT ROWID): ' + skipped.join(', '));
        return { plan, skipped, results: [] };
    }

    // 1) buat tabel yang belum ada (persis mengikuti definisi sumber)
    for (const t of tables) {
        if (tgtNames.has(t)) continue;
        const obj = srcTables.find((o) => o.name === t);
        await target.execute(addIfNotExists(obj.sql, 'table'));
        log(`[schema] tabel ${t} dibuat di target`);
    }

    // 2) salin data
    const results = [];
    for (const t of tables) {
        const info = plan.find((p) => p.table === t);
        const tInfo = await tableInfo(source, t);
        const columns = tInfo.columns;
        const includeRowid = !tInfo.pkIsRowidAlias;
        const tgt = await stats(target, t);
        const incremental = !forceFull && t === 'chat_logs' && tgt.n > 0;
        let cursor = incremental ? tgt.m : 0;
        let done = 0;
        const t0 = Date.now();
        let lastLog = t0;

        for (;;) {
            let res;
            try {
                res = await fetchChunk(source, t, cursor, chunkRows);
            } catch (e) {
                throw new Error(`Gagal baca ${t} pada rowid > ${cursor}: ${e.message}`);
            }
            if (!res.rows.length) break;
            const parts = splitRows(res.rows, columns, maxBytes, maxParams);
            for (const part of parts) await insertChunk(target, t, columns, part, includeRowid);
            cursor = Number(res.rows[res.rows.length - 1].__sync_rowid__);
            done += res.rows.length;

            const now = Date.now();
            if (now - lastLog >= 5000) {
                const total = incremental ? Math.max(info.source.n - tgt.n, done) : info.source.n;
                const pct = total ? ((done / total) * 100).toFixed(1) : '?';
                const rate = done / Math.max((now - t0) / 1000, 0.001);
                const remain = Math.max(total - done, 0) / Math.max(rate, 0.001);
                log(`  [${t}] ${done}/${total} (${pct}%) ~${Math.round(rate)} baris/dtk, sisa ~${Math.round(remain)} dtk`);
                lastLog = now;
            }
        }

        // hapus baris di target yang sudah tidak ada di sumber (opsional)
        if (prune && !incremental) {
            const idRes = await source.execute(`SELECT rowid AS r FROM ${quoteIdent(t)}`);
            await pruneStale(target, t, idRes.rows.map((r) => Number(r.r)), log);
        }

        const after = await stats(target, t);
        results.push({ table: t, source: info.source.n, target: after.n, copied: done, incremental, ms: Date.now() - t0 });
        log(`[selesai] ${t}: disalin ${done} baris (target total ${after.n})`);
    }

    // 3) buat index yang belum ada (dilakukan setelah data masuk supaya cepat)
    for (const idx of srcIndexes) {
        if (idx.tbl_name && !tables.includes(idx.tbl_name)) continue;
        if (tgtNames.has(idx.name)) continue;
        try {
            await target.execute(addIfNotExists(idx.sql, 'index'));
            log(`[schema] index ${idx.name} dibuat di target`);
        } catch (e) {
            log(`[peringatan] index ${idx.name} gagal dibuat: ${e.message}`);
        }
    }

    // 4) samakan counter AUTOINCREMENT (sqlite_sequence)
    for (const t of tables) {
        const obj = srcTables.find((o) => o.name === t);
        if (!obj || !/AUTOINCREMENT/i.test(obj.sql)) continue;
        const s = await source.execute({ sql: 'SELECT seq FROM sqlite_sequence WHERE name = ?', args: [t] });
        const d = await target.execute({ sql: 'SELECT seq FROM sqlite_sequence WHERE name = ?', args: [t] });
        const sSeq = s.rows.length ? Number(s.rows[0].seq) : 0;
        const dSeq = d.rows.length ? Number(d.rows[0].seq) : 0;
        if (dSeq < sSeq) {
            try {
                const upd = await target.execute({ sql: 'UPDATE sqlite_sequence SET seq = ? WHERE name = ?', args: [sSeq, t] });
                if (Number(upd.rowsAffected) === 0) {
                    await target.execute({ sql: 'INSERT INTO sqlite_sequence(name, seq) VALUES (?, ?)', args: [t, sSeq] });
                }
                log(`[schema] sqlite_sequence ${t}: ${dSeq} -> ${sSeq}`);
            } catch (e) {
                log(`[peringatan] gagal set sqlite_sequence ${t}: ${e.message}`);
            }
        }
    }

    return { plan, skipped, results };
}

/** Bandingkan jumlah baris, MAX(rowid), dan SUM(rowid) per tabel. */
async function verify({ source, target, onlyTables = null, log = console.log }) {
    const srcTables = (await listObjects(source))
        .filter((o) => o.type === 'table' && !/WITHOUT\s+ROWID/i.test(o.sql))
        .map((o) => o.name);
    let tables = srcTables;
    if (onlyTables && onlyTables.length) tables = tables.filter((t) => onlyTables.includes(t));
    tables.sort((a, b) => (a === 'chat_logs' ? 1 : 0) - (b === 'chat_logs' ? 1 : 0));

    if (!tables.length) {
        log('VERIFIKASI: tidak ada tabel di sumber — kemungkinan URL/token sumber salah.');
        return false;
    }

    let allOk = true;
    log('VERIFIKASI (sumber vs target):');
    for (const t of tables) {
        const a = await stats(source, t);
        const b = await stats(target, t);
        const ok = a.n === b.n && a.m === b.m && a.s === b.s;
        if (!ok) allOk = false;
        log(`  ${ok ? 'OK  ' : 'BEDA'} ${t.padEnd(16)} sumber n=${a.n} max=${a.m} sum=${a.s} | target n=${b.n} max=${b.m} sum=${b.s}`);
    }
    return allOk;
}

module.exports = {
    DEFAULTS,
    loadDotenv,
    makeClient,
    listObjects,
    tableInfo,
    stats,
    sync,
    verify,
};
