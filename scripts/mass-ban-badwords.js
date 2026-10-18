#!/usr/bin/env node
'use strict';

/**
 * BAN MASSAL berbasis kata terlarang — mesin yang sama dengan dashboard admin
 * (src/services/banService.js). Semua user yang PESANNYA pernah memuat kata
 * dari daftar filter aktif akan di-ban dengan alasan otomatis, mis.:
 *   "mass-ban: pesan memuat kata terlarang ('kontol', 'sex')"
 *
 * Pakai (dari root repo):
 *   node scripts/mass-ban-badwords.js --list-words      # lihat daftar kata aktif
 *   node scripts/mass-ban-badwords.js                   # scan + pratinjau (TANPA ban)
 *   node scripts/mass-ban-badwords.js --apply           # scan lalu BAN semua hasil
 *   node scripts/mass-ban-badwords.js --full --apply    # pindai seluruh histori dari awal
 *   node scripts/mass-ban-badwords.js --words=sex,ngewe --apply
 *   node scripts/mass-ban-badwords.js --limit=50        # jumlah baris pratinjau (default 25)
 *
 * Target default: TURSO_URL / TURSO_AUTH_TOKEN di .env (= sqld produksi).
 * Pindaiannya incremental: posisi terakhir disimpan di settings badword_scan_last_id.
 * Jalankan dengan --full saat pertama kali agar semua pesan lama ikut dipindai.
 */

const { loadDotenv, makeClient } = require('./libsql-sync');
const { createClient } = require('@libsql/client');
const banService = require('../src/services/banService');

loadDotenv();

function argValue(name) {
    const prefix = '--' + name + '=';
    const hit = process.argv.slice(2).find((a) => a.startsWith(prefix));
    return hit ? hit.slice(prefix.length) : null;
}

function fmt(n) {
    return (Number(n) || 0).toLocaleString('id-ID');
}

async function main() {
    const url = argValue('url') || process.env.TURSO_URL;
    const token = argValue('token') || process.env.TURSO_AUTH_TOKEN || process.env.SQLD_AUTH_TOKEN;
    const apply = process.argv.includes('--apply');
    const full = process.argv.includes('--full');
    const listWords = process.argv.includes('--list-words');
    const words = argValue('words'); // "a,b,c" atau file? cukup string koma
    const previewLimit = Math.max(1, parseInt(argValue('limit'), 10) || 25);

    if (!url) throw new Error('URL target kosong — isi TURSO_URL di .env atau pakai --url=...');
    const db = url.startsWith('file:') ? createClient({ url }) : makeClient('target', url, token);

    console.log('Target :', url);
    console.log('Mode   :', apply ? 'SCAN + BAN (apply)' : 'scan saja (pratinjau). Jalankan dengan --apply untuk benar-benar men-ban.');
    console.log('');

    // --list-words: hanya cetak daftar kata aktif lalu keluar.
    if (listWords) {
        const active = words ? banService.parseWordsFromList(words) : await banService.getActiveBadWords(db);
        console.log(`Daftar kata aktif (${active.length}):`);
        for (const w of active) console.log('  -', w);
        return;
    }

    const log = (m) => console.log(new Date().toISOString().slice(11, 19), m);

    const result = await banService.scanAndMaybeBan(db, {
        words: words || null,
        full,
        apply,
        previewLimit,
        log
    });

    console.log('');
    console.log('=== RINGKASAN ===');
    console.log('Kata dipakai   :', result.words.length, 'kata');
    console.log('Rentang scan   : id >', result.from_id, 'sampai id', result.last_id);
    console.log('Pesan dipindai :', fmt(result.scanned_rows), `(${(result.duration_ms / 1000).toFixed(1)} dtk)`);
    console.log('User cocok     :', fmt(result.matched_users));
    console.log('Ban baru       :', fmt(result.banned_new), apply ? '' : '(belum diban — mode pratinjau)');
    console.log('Sudah diban    :', fmt(result.already_banned));

    if (result.applied) {
        const marker = await banService.getScanMarker(db);
        console.log('Marker scan    : settings badword_scan_last_id =', marker);
    }

    console.log('');
    console.log('=== PRATINJAU USER (teratas) ===');
    if (!result.users.length) {
        console.log('Tidak ada user yang cocok.');
        return;
    }
    for (const u of result.users) {
        const name = u.username || ('@' + String(u.user_id).replace(/^legacy:/, ''));
        console.log(
            `• ${name}  [${u.user_id}]  pesan-cocok=${fmt(u.matched_chat_count)}  ` +
            `kata=${u.words.join(', ')}  ${u.already_banned ? '(sudah diban)' : (apply ? '(baru di-ban)' : '(belum diban)')}`
        );
        if (u.sample) console.log(`   contoh: "${u.sample.slice(0, 120)}"`);
    }
    if (result.truncated) console.log(`… menampilkan ${result.users.length} teratas; total ${fmt(result.matched_users)} user.`);
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('[mass-ban-badwords] GAGAL:', err.message);
        process.exit(1);
    });
