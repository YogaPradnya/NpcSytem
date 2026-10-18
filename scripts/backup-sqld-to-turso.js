#!/usr/bin/env node
'use strict';

/**
 * Backup: sqld VPS (database produksi) -> Turso (cadangan).
 *
 * Sumber : environment -> SQLD_URL (default https://npc-db.yogaa.web.id),
 *                         SQLD_AUTH_TOKEN (token JWT sqld)
 * Tujuan : file .env    -> TURSO_OLD_URL, TURSO_OLD_AUTH_TOKEN
 *           (bisa juga lewat env BACKUP_TURSO_URL / BACKUP_TURSO_AUTH_TOKEN)
 *
 * Contoh pakai (dari root repo):
 *   SQLD_AUTH_TOKEN=<token-sqld> node scripts/backup-sqld-to-turso.js --dry-run
 *   SQLD_AUTH_TOKEN=<token-sqld> node scripts/backup-sqld-to-turso.js
 *
 * Sifat backup:
 *   - chat_logs  : incremental (hanya baris baru, dihitung dari rowid terakhir
 *                  yang ada di Turso) -> hemat kuota baca/tulis Turso
 *   - tabel lain : disalin ulang penuh; baris yang sudah dihapus di sumber
 *                  ikut dihapus di cadangan (prune)
 * Aman dijalankan berulang kali (mis. tiap hari lewat Scheduled Task Coolify).
 */

const { loadDotenv, makeClient, sync, verify } = require('./libsql-sync');

loadDotenv();

const DEFAULT_SOURCE_URL = 'https://npc-db.yogaa.web.id';

const argv = process.argv.slice(2);
const flag = (name) => argv.includes('--' + name);

async function main() {
    const sourceUrl = process.env.SQLD_URL || DEFAULT_SOURCE_URL;
    const sourceToken = process.env.SQLD_AUTH_TOKEN;
    const targetUrl = process.env.BACKUP_TURSO_URL || process.env.TURSO_OLD_URL;
    const targetToken = process.env.BACKUP_TURSO_AUTH_TOKEN || process.env.TURSO_OLD_AUTH_TOKEN;

    const norm = (u) => String(u || '').replace(/\/+$/, '');
    if (norm(sourceUrl) === norm(targetUrl)) {
        throw new Error('Sumber dan tujuan menunjuk database yang sama (' + sourceUrl + ').');
    }

    const source = makeClient('sqld (sumber)', sourceUrl, sourceToken);
    const target = makeClient('Turso (cadangan)', targetUrl, targetToken);

    console.log('Sumber : sqld  (' + sourceUrl + ')');
    console.log('Tujuan : Turso (' + targetUrl + ')');
    console.log('');

    await sync({
        source,
        target,
        prune: true,
        dryRun: flag('dry-run'),
        log: console.log,
    });
    if (flag('dry-run')) return;

    console.log('');
    const ok = await verify({ source, target, log: console.log });
    console.log('');
    console.log(ok ? 'BACKUP SELESAI: cadangan cocok dengan sumber ✅' : 'BACKUP: ADA PERBEDAAN — cek baris BEDA di atas ⚠️');
    process.exit(ok ? 0 : 1);
}

main().catch((e) => {
    console.error('');
    console.error('GAGAL:', (e && e.message) || e);
    console.error('');
    console.error('Contoh pakai (dari root repo):');
    console.error('  SQLD_AUTH_TOKEN=<token-sqld> node scripts/backup-sqld-to-turso.js --dry-run');
    console.error('  SQLD_AUTH_TOKEN=<token-sqld> node scripts/backup-sqld-to-turso.js');
    process.exit(1);
});
