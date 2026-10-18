#!/usr/bin/env node
'use strict';

/**
 * Migrasi data: Turso (lama) -> sqld VPS (baru).
 *
 * Sumber  : file .env  -> TURSO_URL, TURSO_AUTH_TOKEN        (Turso)
 *           bisa dioverride lewat env: SOURCE_URL, SOURCE_AUTH_TOKEN
 * Tujuan  : environment -> SQLD_URL (default https://npc-db.yogaa.web.id),
 *                         SQLD_AUTH_TOKEN (WAJIB, token JWT sqld)
 *
 * Contoh pakai (dari root repo):
 *   SQLD_AUTH_TOKEN=<token-sqld> node scripts/migrate-turso-to-sqld.js --dry-run
 *   SQLD_AUTH_TOKEN=<token-sqld> node scripts/migrate-turso-to-sqld.js
 *   SQLD_AUTH_TOKEN=<token-sqld> SOURCE_URL=<url-turso> SOURCE_AUTH_TOKEN=<token-turso> node scripts/migrate-turso-to-sqld.js
 *
 * Opsi:
 *   --dry-run      hanya menampilkan rencana (tidak menulis apa pun)
 *   --verify-only  hanya membandingkan jumlah baris sumber vs target
 *   --tables=a,b   batasi tabel tertentu saja
 *   --chunk=N      jumlah baris per batch baca (default 1000)
 *   --full         paksa salin ulang penuh termasuk chat_logs
 *   --prune        hapus di target baris yang sudah tidak ada di sumber
 *                  (untuk tabel kecil; chat_logs tidak dipangkas)
 *
 * Aman dijalankan berulang kali: tulisan memakai INSERT OR REPLACE dan
 * pembacaan memakai posisi rowid, jadi bisa dilanjutkan kalau terputus.
 * Menjelang cutover, jalankan sekali lagi supaya baris terakhir yang
 * masih masuk ke Turso ikut tersalin.
 */

const { loadDotenv, makeClient, sync, verify } = require('./libsql-sync');

loadDotenv();

const DEFAULT_TARGET_URL = 'https://npc-db.yogaa.web.id';

const argv = process.argv.slice(2);
const flag = (name) => argv.includes('--' + name);
const opt = (name) => {
    const p = '--' + name + '=';
    const found = argv.find((a) => a.startsWith(p));
    return found ? found.slice(p.length) : null;
};

async function main() {
    const onlyTables = opt('tables') ? opt('tables').split(',').map((s) => s.trim()).filter(Boolean) : null;
    const chunkRows = opt('chunk') ? Number(opt('chunk')) : undefined;
    const sourceUrl = process.env.SOURCE_URL || process.env.TURSO_OLD_URL || process.env.TURSO_URL;
    const sourceToken = process.env.SOURCE_AUTH_TOKEN || process.env.TURSO_OLD_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN;
    const targetUrl = process.env.SQLD_URL || DEFAULT_TARGET_URL;

    const norm = (u) => String(u || '').replace(/\/+$/, '');
    if (norm(sourceUrl) === norm(targetUrl)) {
        throw new Error(
            'Sumber dan tujuan menunjuk database yang sama (' + sourceUrl + '). ' +
            'Set SOURCE_URL + SOURCE_AUTH_TOKEN (kredensial Turso) supaya arahnya jelas.'
        );
    }

    const source = makeClient('sumber', sourceUrl, sourceToken);
    const target = makeClient('sqld (tujuan)', targetUrl, process.env.SQLD_AUTH_TOKEN);

    console.log('Sumber : Turso  (' + sourceUrl + ')');
    console.log('Tujuan : sqld   (' + targetUrl + ')');
    if (onlyTables) console.log('Tabel  : ' + onlyTables.join(', '));
    console.log('');

    if (flag('verify-only')) {
        const ok = await verify({ source, target, onlyTables: onlyTables, log: console.log });
        process.exit(ok ? 0 : 1);
    }

    await sync({
        source,
        target,
        onlyTables,
        chunkRows,
        forceFull: flag('full'),
        prune: flag('prune'),
        dryRun: flag('dry-run'),
        log: console.log,
    });
    if (flag('dry-run')) return;

    console.log('');
    const ok = await verify({ source, target, onlyTables: onlyTables, log: console.log });
    console.log('');
    console.log(ok ? 'HASIL: SEMUA COCOK ✅' : 'HASIL: ADA PERBEDAAN — cek baris BEDA di atas ⚠️');
    console.log('Catatan: saat cutover, jalankan ulang script ini untuk menyapu baris terakhir yang masuk ke Turso.');
    process.exit(ok ? 0 : 1);
}

main().catch((e) => {
    console.error('');
    console.error('GAGAL:', (e && e.message) || e);
    console.error('');
    console.error('Contoh pakai (dari root repo):');
    console.error('  SQLD_AUTH_TOKEN=<token-sqld> node scripts/migrate-turso-to-sqld.js --dry-run');
    console.error('  SQLD_AUTH_TOKEN=<token-sqld> node scripts/migrate-turso-to-sqld.js');
    console.error('  SQLD_AUTH_TOKEN=<token-sqld> SOURCE_URL=<url-turso> SOURCE_AUTH_TOKEN=<token-turso> node scripts/migrate-turso-to-sqld.js');
    process.exit(1);
});
