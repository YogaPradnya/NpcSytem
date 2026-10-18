# Database & Backup — npc.yogaa.web.id

## Arsitektur (sejak 18 Okt 2026)

| Komponen | Lokasi |
|---|---|
| **DB produksi** | sqld (libsql-server) di VPS SumoPod — `https://npc-db.yogaa.web.id` (Coolify service `npc-db`, volume `sqld-data` — persist) |
| **App** | Render Singapore — `https://npc.yogaa.web.id` — semua baca/tulis ke sqld |
| **Cadangan (backup)** | Turso — `libsql://npcsytem-yogapradnyan.aws-ap-northeast-1.turso.io` — diisi otomatis tiap hari **03:00 WITA (19:00 UTC)** oleh container `backup` di stack Coolify |

Alasan: latensi lebih baik (VPS Singapura) + bebas limit kuota Turso untuk beban harian.

## Kredensial (ada di `.env` lokal & Environment Variables Render/Coolify)

| Variabel | Isi |
|---|---|
| `TURSO_URL` + `TURSO_AUTH_TOKEN` | DB **produksi** (sqld VPS, token JWT Ed25519) |
| `TURSO_OLD_URL` + `TURSO_OLD_AUTH_TOKEN` | Turso (**cadangan**), dipakai script backup |

> `.env` tidak pernah di-commit (ada di `.gitignore`).

## Script (`scripts/`)

| Script | Fungsi |
|---|---|
| `libsql-sync.js` | Mesin sinkronisasi: batch `INSERT OR REPLACE`, pertahankan `rowid` asli, bisa dilanjut (resume), guard anti "sumber = tujuan", verifikasi n/max/sum per tabel. |
| `migrate-turso-to-sqld.js` | Migrasi/restore **Turso → sqld**. Contoh: `SQLD_AUTH_TOKEN=<jwt> node scripts/migrate-turso-to-sqld.js [--dry-run] [--tables=chat_logs]` |
| `backup-sqld-to-turso.js` | Backup **sqld → Turso**: tabel kecil disalin penuh (+prune), `chat_logs` inkremental. Contoh: `SQLD_AUTH_TOKEN=<jwt> node scripts/backup-sqld-to-turso.js` |
| `migrate-user-id.js` | Migrasi identitas user (skema `user_id` + backfill data lama) — **idempoten**, ada verifikasi ringkas. Default target `TURSO_URL` (sqld); target lain via `--url=` / `--token=`. |
| `coolify/npc-db-compose.yaml` | Definisi stack Coolify `npc-db`: service `sqld` + container `backup` (cron internal). |

Sumber boleh dioverride lewat env `SOURCE_URL`/`SOURCE_AUTH_TOKEN`; target via `SQLD_URL`/`SQLD_AUTH_TOKEN` (produksi) atau `BACKUP_TURSO_URL`/`BACKUP_TURSO_AUTH_TOKEN` (cadangan).

## Identitas user (`user_id`)

Semua peringkat user memakai identitas stabil **`user_id`** (ID akun yang dikirim app lewat `user.id`; data lama memakai `legacy:<nama ternormalisasi>`) — bukan username lagi:

| Tabel | Skema sekarang |
|---|---|
| `chat_logs` | kolom `user_id` (+ index) di samping `username` |
| `users` | PK `user_id`, kolom `username` (nama terbaru) + `last_seen` |
| `user_chat_time` | PK `user_id`, kolom `username`, `total_seconds`, `last_message_at` |

- Skema dipastikan otomatis saat app boot (`initDB` → `ensureUserIdentitySchema` di `src/services/userIdentity.js`).
- Backfill data lama (isi `chat_logs.user_id` = `legacy:<nama>`) + verifikasi:
  ```bash
  node scripts/migrate-user-id.js
  ```
  Aman dijalankan berulang kali (mis. sekali lagi setelah deploy untuk mengejar baris yang ditulis kode lama).
- ⚠️ **Turso (cadangan) harus ikut dimigrasi** dengan script yang sama setelah sqld, supaya backup harian tidak gagal karena beda skema:
  ```bash
  node scripts/migrate-user-id.js --url="$TURSO_OLD_URL" --token="$TURSO_OLD_AUTH_TOKEN"
  ```
- Detail alur identitas (auto-claim, kontrak client): `docs/USER_ID.md`.

## Operasional

- **Cek backup terakhir:** Coolify → service `npc-db` → container `backup` → Runtime Logs (backup mulai `[npc-backup]`).
- **Backup manual (dari laptop):** `SQLD_AUTH_TOKEN=<jwt> node scripts/backup-sqld-to-turso.js`
- **Migrasi/backfill identitas user:** `node scripts/migrate-user-id.js` (idempoten; ulangi setelah deploy & untuk Turso).
- **Restore darurat (kalau sqld bermasalah):** jalankan `migrate-turso-to-sqld.js` dengan sumber Turso (default: `TURSO_OLD_*` di `.env`) → data 100% kembali ke sqld.
- **VPS SumoPod** perlu diperpanjang sebelum **14 Nov 2026**.
