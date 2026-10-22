# Sistem Ban & Kata Terlarang (Auto-Ban + Ban Massal)

Semua ban sekarang **mengikuti `user_id`** (ID akun) — user ganti nama sekalipun tetap terekam ban. Reset identitas lama memakai `legacy:<nama>`.

## 1. Identitas pada tabel ban

Tabel `banned_users`:

| kolom      | isi                                                        |
|------------|------------------------------------------------------------|
| `id`       | autoincrement                                              |
| `username` | nama saat dibuat ban (berapa baris boleh beda nama)        |
| `user_id`  | **ID akun** (atau `legacy:<nama>` untuk ban lama/tanpa ID)  |
| `reason`   | alasan ban (teks)                                          |
| `created_at` | waktu ban                                                |

- **Index unik `banned_users(user_id)`** → one baris per identitas; `INSERT OR IGNORE` otomatis menolak ban ganda.
- Ban username-based lama dimigrasi otomatis (`ensureUserIdentitySchema()` saat boot / script migrasi): `user_id = legacy: + LOWER(TRIM(TRIM(username,'@')))`, varian huruf besar/kecil digabung.
- Saat user ber-ID asli chat dan histori lama ditemukan (`claimLegacyUser`), **baris ban lama ikut pindah** ke ID akun — ban tidak bisa kabur lewat rename.

## 2. Auto-Ban live (chat baru)

Sistem lama tetap jalan, kini menulis `user_id`:

- Daftar kata aktif: admin mengisi settings `badwords` (dashboard → **Daftar Ban → Kata Kasar Auto-Ban**); kosong = pakai daftar default di `src/utils/badwordFilter.js`.
- Daftar default sekarang memuat kata seksual + berantasan umum: **sex, seks, ngewe, ngentot, bokep**, kontol, memek, jancok, anjing, bangsat, bgsd, dll (total ±60 kata, word-boundary + leetspeak `k0ntol`/`5ex` tetap tertangkap).
- Pesan cocok → chat diblok & user ditambah ke `banned_users` dengan alasan `auto-ban: kata kasar ('<kata>')`.
- Admin yang tes via simulator **tidak** ikut di-ban (hanya diblok).

## 3. Ban massal (pindai histori → ban semua yang cocok)

Mesin: `src/services/banService.js` — satu logika untuk dashboard & CLI. Semantik pencarian **sama persis** dengan auto-ban.

### Dashboard

Halaman **Daftar Ban → panel "Ban Massal Kata Terlarang"** (baris bawah):

1. **Pakai Daftar Filter Aktif** — muat daftar kata yang sedang aktif.
2. **Cari User** — pindai + pratinjau (TANPA men-ban): user, kata yang cocok, jumlah pesan, contoh pesan, status ban.
3. **BAN MASSAL** — pindai lalu langsung ban semua yang cocok (alasan otomatis: `mass-ban: pesan memuat kata terlarang ('kontol', 'sex')`).

Catatan:
- Pindaiannya **incremental** — posisi terakhir disimpan di settings `badword_scan_last_id`; scan berikutnya hanya membaca pesan baru. Centang **"Pindai seluruh histori"** untuk memaksa dari id 0.
- Endpoint admin: `GET /api/admin/badword-words`, `GET /api/admin/badword-scan`, `POST /api/admin/badword-mass-ban` (body `{ words, full }`).

### CLI

```bash
node scripts/mass-ban-badwords.js --list-words     # lihat daftar kata aktif
node scripts/mass-ban-badwords.js                  # scan + pratinjau (TANPA ban)
node scripts/mass-ban-badwords.js --full --apply   # pindai seluruh histori → BAN semua
node scripts/mass-ban-badwords.js --words=sex,ngewe --apply  #override kata
```

Target default `.env`: `TURSO_URL` / `TURSO_AUTH_TOKEN` (sqld produksi). `--full` dipakai saat pertama kali agar pesan lama ikut terpindai; setelah itu tanpa `--full` cukup (incremental).

## 4. Ban / unban manual (dashboard)

- **Ban user** (`POST /api/admin/ban-user`): nama yang diketik dicari di tabel `users` → pakai `user_id` akunnya; tidak ada → `legacy:<nama>`. Kolom `reason` opsional (default `manual-ban oleh admin`).
- **Unban** (`POST /api/admin/unban-user`): melepas SEMUA varian baris ban milik orang itu (ID akun, `legacy:<nama>`, dan varian nama).

## 5. Halaman publik `/ban`

Halaman `GET /ban` bisa dibuka **tanpa login** dan hanya menampilkan:

- `username`
- `reason` (alasan ban)
- `created_at` (tanggal ban)

Fitur: pencarian username (`?q=`) dan pagination 20 baris (`?page=`). `user_id` dan data internal lain tidak pernah dikirim ke browser. Halaman diberi rate-limit 60 request/menit/IP.

Halaman dashboard lain tetap memerlukan login: `/admin` memakai `sessionAuth`, sedangkan endpoint `/api/admin/*` memakai `apiAuth` + `adminOnly`.

## 6. Checklist cadangan

Ban massal hanya menulis tabel `banned_users` kecil — nightly backup sqld → Turso otomatis mengikutinya. Jalankan manual bila ingin segera: `node scripts/backup-sqld-to-turso.js`.
