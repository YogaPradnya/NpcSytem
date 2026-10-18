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
| `coolify/npc-db-compose.yaml` | Definisi stack Coolify `npc-db`: service `sqld` + container `backup` (cron internal). |

Sumber boleh dioverride lewat env `SOURCE_URL`/`SOURCE_AUTH_TOKEN`; target via `SQLD_URL`/`SQLD_AUTH_TOKEN` (produksi) atau `BACKUP_TURSO_URL`/`BACKUP_TURSO_AUTH_TOKEN` (cadangan).

## Operasional

- **Cek backup terakhir:** Coolify → service `npc-db` → container `backup` → Runtime Logs (backup mulai `[npc-backup]`).
- **Backup manual (dari laptop):** `SQLD_AUTH_TOKEN=<jwt> node scripts/backup-sqld-to-turso.js`
- **Restore darurat (kalau sqld bermasalah):** jalankan `migrate-turso-to-sqld.js` dengan sumber Turso (default: `TURSO_OLD_*` di `.env`) → data 100% kembali ke sqld.
- **VPS SumoPod** perlu diperpanjang sebelum **14 Nov 2026**.
