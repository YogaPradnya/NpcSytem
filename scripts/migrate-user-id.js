#!/usr/bin/env node
'use strict';

/**
 * Migrasi identitas user (user_id) — skema + backfill + verifikasi ringkas.
 * Idempoten: aman dijalankan berulang kali (mis. sekali lagi setelah deploy
 * untuk mengejar baris yang masih memakai kode lama).
 *
 * Langkah:
 *   1. ensureUserIdentitySchema(): tambah kolom chat_logs.user_id, bangun ulang
 *      tabel users & user_chat_time ke PK user_id (gabung case-variant), index.
 *   2. backfillUserIds(): isi user_id baris lama dengan 'legacy:<nama>'.
 *   3. Verifikasi: jumlah baris, sisa NULL, jumlah identitas.
 *
 * Pakai (dari root repo):
 *   node scripts/migrate-user-id.js                    # target: TURSO_URL (.env = sqld produksi)
 *   node scripts/migrate-user-id.js --url=file:/tmp/x.db
 *   node scripts/migrate-user-id.js --url=<turso-url> --token=<token>
 *   node scripts/migrate-user-id.js --schema-only
 */

const { loadDotenv, makeClient } = require('./libsql-sync');
const { createClient } = require('@libsql/client');
const { ensureUserIdentitySchema, backfillUserIds } = require('../src/services/userIdentity');

loadDotenv();

function argValue(name) {
    const prefix = '--' + name + '=';
    const hit = process.argv.slice(2).find((a) => a.startsWith(prefix));
    return hit ? hit.slice(prefix.length) : null;
}

async function main() {
    const url = argValue('url') || process.env.TURSO_URL;
    const token = argValue('token') || process.env.TURSO_AUTH_TOKEN;
    const schemaOnly = process.argv.includes('--schema-only');

    if (!url) throw new Error('URL target kosong — isi TURSO_URL di .env atau pakai --url=...');
    const db = url.startsWith('file:') ? createClient({ url }) : makeClient('target', url, token);

    console.log('Target :', url);
    console.log('');

    const report = await ensureUserIdentitySchema(db, (m) => console.log(m));
    console.log('Skema  :', JSON.stringify(report));

    if (!schemaOnly) {
        const t0 = Date.now();
        const n = await backfillUserIds(db);
        console.log(`Backfill user_id: ${n} baris diisi (${((Date.now() - t0) / 1000).toFixed(1)} dtk)`);
    }

    const one = async (sql) => (await db.execute(sql)).rows[0];
    const cl = await one(`SELECT COUNT(*) AS total,
                                 SUM(CASE WHEN user_id IS NULL THEN 1 ELSE 0 END) AS nulls,
                                 COUNT(DISTINCT user_id) AS ids FROM chat_logs`);
    const u = await one(`SELECT COUNT(*) AS total,
                                SUM(CASE WHEN user_id LIKE 'legacy:%' THEN 1 ELSE 0 END) AS legacy FROM users`);
    const ct = await one(`SELECT COUNT(*) AS total,
                                 SUM(CASE WHEN user_id LIKE 'legacy:%' THEN 1 ELSE 0 END) AS legacy FROM user_chat_time`);

    console.log('');
    console.log('Verifikasi:');
    console.log(`  chat_logs      total=${cl.total} user_id_null=${cl.nulls} identitas_unik=${cl.ids}`);
    console.log(`  users          total=${u.total} legacy=${u.legacy}`);
    console.log(`  user_chat_time total=${ct.total} legacy=${ct.legacy}`);
    console.log('');
    console.log('MIGRASI IDENTITAS SELESAI ✅');
}

main().catch((e) => {
    console.error('');
    console.error('GAGAL:', (e && e.message) || e);
    process.exit(1);
});
