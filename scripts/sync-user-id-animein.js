#!/usr/bin/env node
'use strict';

/**
 * SINKRONISASI user_id resmi dari sistem chat bot Animein ke npc_system.
 *
 * ID resmi user = `data.user.id` dari login AnimeinWeb (angka, mis. 299634)
 * — sama dengan yang dipakai sistem bot untuk membedakan user.
 *
 * Cara kerja:
 *   1. Bangun mapping nama → ID resmi dari DB bot Animein
 *      (chat_logs: baris dengan user_id angka; user_id non-angka diabaikan).
 *   2. Di DB npc_system, histori lama tersimpan sebagai 'legacy:<nama>'.
 *      Tiap nama yang ketemu di mapping dikeluarkan dari status legacy via
 *      claimLegacyUser(): chat_logs, user_chat_time, users, dan baris ban
 *      semuanya dipindah/gabung ke ID resmi (transaksi per nama).
 *   3. Idempoten: nama yang sudah tidak punya baris legacy tidak menyentuh apa pun.
 *
 * DUA nama berbeda milik 1 akun Animein otomatis menyatu ke ID yang sama.
 *
 * Pakai (dari root npc_system):
 *   node scripts/sync-user-id-animein.js                  # DRY-RUN (pratinjau)
 *   node scripts/sync-user-id-animein.js --apply          # eksekusi ke target
 *   node scripts/sync-user-id-animein.js --limit=30       # jumlah daftar yang ditampilkan
 *   node scripts/sync-user-id-animein.js --animein-url=<url> --animein-token=<token>
 *   node scripts/sync-user-id-animein.js --url=<url> --token=<token> --apply
 *
 * Sumber default  : folder ../chat bot animein/.env (TURSO_URL/TURSO_AUTH_TOKEN di sana).
 * Target default  : .env npc_system (TURSO_URL/TURSO_AUTH_TOKEN = sqld produksi).
 */

const path = require('path');
const fs = require('fs');
const { loadDotenv, makeClient } = require('./libsql-sync');
const { createClient } = require('@libsql/client');
const { claimLegacyUser, legacyIdFor } = require('../src/services/userIdentity');

loadDotenv(); // .env npc_system

/** Baca TURSO_URL/TURSO_AUTH_TOKEN dari .env folder animein tanpa memunculkan token. */
function readAnimeinEnv() {
    const envPath = path.resolve(__dirname, '..', '..', 'chat bot animein', '.env');
    const out = {};
    try {
        const body = fs.readFileSync(envPath, 'utf8');
        for (const line of body.split(/\r?\n/)) {
            const m = line.match(/^\s*(TURSO_URL|TURSO_AUTH_TOKEN)\s*=\s*(.*)\s*$/);
            if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
        }
    } catch (e) { /* file mungkin tidak ada */ }
    return out;
}

function argValue(name) {
    const prefix = '--' + name + '=';
    const hit = process.argv.slice(2).find((a) => a.startsWith(prefix));
    return hit ? hit.slice(prefix.length) : null;
}

/** Kunci nama sama dengan normalisasi legacy npc_system. */
function nameKey(username) {
    return String(username ?? '').replace(/^@+/, '').replace(/@+$/, '').trim().toLowerCase();
}

async function buildMapping(animeinDb) {
    // (1) chat_logs bot: bobot= jumlah pesan → nama terbaru tetap dominan.
    const chats = (await animeinDb.execute(
        "SELECT user_id, username, COUNT(*) AS c FROM chat_logs WHERE user_id IS NOT NULL AND user_id != '' AND username IS NOT NULL AND TRIM(username) != '' AND user_id GLOB '[0-9]*' GROUP BY user_id, username"
    )).rows;
    // (2) user_stats numeric sebagai cadangan (bobot kecil).
    const stats = (await animeinDb.execute(
        "SELECT user_id, username FROM user_stats WHERE user_id GLOB '[0-9]*' AND username IS NOT NULL AND TRIM(username) != ''"
    )).rows;

    const byName = new Map(); // kunci nama → Map(id → weight)
    const bump = (name, userId, weight) => {
        const key = nameKey(name);
        if (!key) return;
        let ids = byName.get(key);
        if (!ids) { ids = new Map(); byName.set(key, ids); }
        ids.set(userId, (ids.get(userId) || 0) + weight);
    };
    for (const r of chats) bump(r.username, String(r.user_id), Number(r.c) || 0);
    for (const r of stats) bump(r.username, String(r.user_id), 1);

    // Pilih ID dengan bobot terbesar per nama.
    const mapping = new Map(); // kunci nama → { userId, weight }
    for (const [key, ids] of byName) {
        let best = null;
        for (const [id, w] of ids) {
            if (!best || w > best.w) best = { userId: id, w };
        }
        mapping.set(key, best);
    }
    return { mapping, sources: { chatRows: chats.length, statRows: stats.length } };
}

async function main() {
    const apply = process.argv.includes('--apply');
    const listLimit = Math.max(1, parseInt(argValue('limit'), 10) || 40);

    const animeinEnv = readAnimeinEnv();
    const animeinUrl = argValue('animein-url') || animeinEnv.TURSO_URL;
    const animeinToken = argValue('animein-token') || animeinEnv.TURSO_AUTH_TOKEN;
    const npcUrl = argValue('url') || process.env.TURSO_URL;
    const npcToken = argValue('token') || process.env.TURSO_AUTH_TOKEN || process.env.SQLD_AUTH_TOKEN;

    if (!animeinUrl) throw new Error('URL DB Animein kosong — set TURSO_URL di folder "chat bot animein/.env" atau --animein-url=');
    if (!npcUrl) throw new Error('URL target npc_system kosong — isi .env atau --url=');

    const animeinDb = animeinUrl.startsWith('file:') ? createClient({ url: animeinUrl }) : makeClient('animein', animeinUrl, animeinToken);
    const npcDb = npcUrl.startsWith('file:') ? createClient({ url: npcUrl }) : makeClient('target', npcUrl, npcToken);

    console.log('Sumber (Animein) :', animeinUrl);
    console.log('Target (npc)     :', npcUrl);
    console.log('Mode             :', apply ? 'APPLY (pindah histori ke ID resmi)' : 'DRY-RUN (pratinjau; jalankan dengan --apply)');
    console.log('');

    const t0 = Date.now();
    const { mapping, sources } = await buildMapping(animeinDb);
    console.log(`Mapping dibangun: ${mapping.size} nama unik → ID resmi (chat_rows=${sources.chatRows}, stats=${sources.statRows}), ${((Date.now() - t0) / 1000).toFixed(1)}s`);

    // Histori legacy target yang relevan
    const legacyRows = (await npcDb.execute(
        "SELECT user_id, COUNT(*) AS chats FROM chat_logs WHERE user_id LIKE 'legacy:%' GROUP BY user_id"
    )).rows;
    console.log(`Baris legacy di npc: ${legacyRows.length} identitas`);

    const plan = [];
    for (const row of legacyRows) {
        const name = String(row.user_id).slice('legacy:'.length);
        const hit = mapping.get(name) || mapping.get(nameKey(name));
        if (!hit) continue;
        plan.push({ legacyId: row.user_id, username: name, userId: hit.userId, chats: Number(row.chats) });
    }

    // Kelompokkan per ID resmi untuk melihat kasus "2 nama → 1 ID".
    const byTarget = new Map();
    for (const p of plan) {
        if (!byTarget.has(p.userId)) byTarget.set(p.userId, []);
        byTarget.get(p.userId).push(p);
    }
    const multiName = [...byTarget.values()].filter(v => v.length > 1);

    const totalChats = plan.reduce((s, p) => s + p.chats, 0);
    console.log(`Nama terpa        : ${plan.length} (menyentuh ${totalChats.toLocaleString('id-ID')} chat)`);
    console.log(`ID multi-nama     : ${multiName.length} ID resmi punya >1 nama lama (merge nama ganda)\n`);

    if (!plan.length) {
        console.log('Tidak ada nama yang cocok dengan mapping. Selesai, tidak ada perubahan.');
        return;
    }

    const sorted = plan.slice().sort((a, b) => b.chats - a.chats);
    console.log('=== DAFTAR (terbesar dulu) ===');
    for (const p of sorted.slice(0, listLimit)) {
        console.log(`• legacy:${p.username}  →  ${p.userId}  (${p.chats.toLocaleString('id-ID')} chat)`);
    }
    if (sorted.length > listLimit) console.log(`… +${sorted.length - listLimit} lainnya`);
    if (multiName.length) {
        console.log('\n=== NAMA GANDA → 1 ID ===');
        for (const set of multiName.slice(0, 15)) {
            console.log(`ID ${set[0].userId}: ${set.map(p => p.username).join(', ')}`);
        }
        if (multiName.length > 15) console.log(`… +${multiName.length - 15} ID lain`);
    }

    if (!apply) {
        console.log('\nDRY-RUN selesai — tidak ada data yang diubah. Jalankan dengan --apply untuk eksekusi.');
        return;
    }

    console.log('\n=== APPLY ===');
    let movedChats = 0, touchedNames = 0;
    for (const p of sorted) {
        try {
            const moved = await claimLegacyUser(npcDb, { userId: p.userId, username: p.username });
            if (moved > 0) {
                movedChats += moved;
                touchedNames++;
                console.log(`  [claim] ${p.username} → ${p.userId}: ${moved.toLocaleString('id-ID')} chat dipindah`);
            }
        } catch (e) {
            console.error(`  [claim GAGAL] ${p.username} → ${p.userId}: ${e.message}`);
        }
    }
    console.log(`\nSelesai: ${touchedNames} nama diproses, total ${movedChats.toLocaleString('id-ID')} chat dipindah ke ID resmi.`);

    // Verifikasi singkat
    const one = async (sql) => (await npcDb.execute(sql)).rows[0];
    const remain = await one("SELECT COUNT(DISTINCT user_id) AS ids FROM chat_logs WHERE user_id LIKE 'legacy:%'");
    const mappedIds = await one("SELECT COUNT(DISTINCT user_id) AS c FROM chat_logs WHERE user_id NOT LIKE 'legacy:%'");
    console.log(`Sisa identitas legacy : ${remain.ids}`);
    console.log(`Identitas ber-ID resmi: ${mappedIds.c}`);
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('[sync-user-id] GAGAL:', err.message);
        process.exit(1);
    });
