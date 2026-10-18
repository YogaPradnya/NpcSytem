# Public API — NPC System

Endpoint publik **read-only** untuk web/app Animein: peringkat chat & peringkat jam.
Tanpa login admin — cukup API key statis lewat header `X-API-Key`.

- **Base URL produksi:** `https://npcsytem.onrender.com`
- **Base URL lokal:** `http://localhost:4000`

---

## 1. Autentikasi

Semua endpoint `/api/public/*` wajib menyertakan header:

```
X-API-Key: <PUBLIC_STATS_KEY>
```

Nilai key diambil dari file `.env` server:

```env
# PUBLIC API (web/app animein) - API key untuk endpoint /api/public/*
PUBLIC_STATS_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

| Kondisi | Response |
|---|---|
| Key benar | `200` data normal |
| Key salah / tidak dikirim | `401 {"success":false,"error":"API key tidak valid. Kirim header X-API-Key."}` |
| `PUBLIC_STATS_KEY` belum di-set di `.env` | `503 {"success":false,"error":"Public API belum diaktifkan..."}` |

> Ganti key = edit `.env` lalu restart server. Key baru langsung berlaku (tidak ada cache key).
> Jangan taruh key di kode frontend publik yang bisa dibaca siapa saja; simpan di server sisi web/app Animein (proxy), atau terima risikonya untuk data publik ini.

**CORS:** aktif untuk semua origin (`Access-Control-Allow-Origin: *`), jadi bisa dipanggil langsung dari browser via `fetch` dengan header `X-API-Key`.

---

## 2. Rate limit & cache

- **Rate limit:** 60 request / menit / IP untuk seluruh `/api/public/*`. Lewat batas → `429 {"success":false,"error":"Terlalu banyak request, coba lagi nanti."}`
- **Cache server:** hasil disimpan in-memory maksimal **2 menit** per kombinasi parameter (`limit` + `ai_name`). Hit pertama lambat (kueri DB), hit berikutnya instan.
- **Header tambahan di response:**
  - `X-Cache: HIT | MISS` — menandakan data dari cache server atau hasil kueri baru.
  - `Cache-Control: public, max-age=120` — boleh di-cache juga oleh browser/CDN selama 2 menit.
- `generated_at` pada JSON = waktu data **dibuat** (saat cache MISS), bukan waktu request. Pada cache HIT nilainya bisa tertinggal hingga 2 menit — ini normal.

---

## 3. `GET /api/public/top-chat`

Peringkat user berdasarkan **jumlah chat**, urut: level hati tertinggi → total chat terbanyak.
(Sumber: tabel `chat_logs`, seluruh periode. Sama dengan halaman "Top Users" di dashboard admin.)

### Query parameters

| Param | Wajib | Nilai | Default | Keterangan |
|---|---|---|---|---|
| `limit` | tidak | `10`, `20`, `25`, `50`, `100` | `10` | Jumlah baris. Nilai lain otomatis jatuh ke default. |
| `ai_name` | tidak | ID karakter, mis. `alya` | — | Filter per karakter (case-insensitive). Harus cocok pola `^[a-z0-9._-]{1,50}$`. |

### Contoh request

```bash
curl -H "X-API-Key: <PUBLIC_STATS_KEY>" \
  "https://npcsytem.onrender.com/api/public/top-chat?limit=10&ai_name=alya"
```

### Contoh response

```json
{
  "success": true,
  "generated_at": "2026-10-18T05:00:00.000Z",
  "limit": 10,
  "ai_name": "alya",
  "users": [
    {
      "rank": 1,
      "username": "dapaaPRODIGY",
      "level": 5,
      "total_chat": 314,
      "last_active": "2026-05-13 03:10:45"
    }
  ]
}
```

| Field | Tipe | Keterangan |
|---|---|---|
| `rank` | number | Peringkat (1 = teratas). |
| `username` | string | Nama user di log chat. |
| `level` | number | Level hati tertinggi yang pernah dicapai (0–5). |
| `total_chat` | number | Jumlah pesan user tersebut (yang tersimpan di `chat_logs`). |
| `last_active` | string \| null | Terakhir aktif, format `YYYY-MM-DD HH:MM:SS` **UTC** (tambah +7 jam untuk WIB). |

---

## 4. `GET /api/public/top-hours`

Peringkat user berdasarkan **total jam obrolan aktif**.

**Aturan perhitungan (penting):**
1. Setiap pesan user dicatat waktunya.
2. Selisih waktu dengan pesan sebelumnya dihitung:
   - **jeda < 10 menit** → dihitung sebagai waktu obrolan aktif (ditambahkan ke total detik user);
   - **jeda ≥ 10 menit** → dianggap user sedang tidak mengobrol (tidur/keluar aplikasi), diabaikan.
3. Total detik ÷ 3600 = total jam, lalu diurutkan dari yang terbesar.
4. Histori lama (sejak sistem berjalan) ikut dihitung lewat proses backfill otomatis sekali saat deploy.
5. User dengan **1 pesan saja** belum punya jeda sebelumnya, sehingga tidak muncul di daftar ini (total 0 jam).

### Query parameters

| Param | Wajib | Nilai | Default | Keterangan |
|---|---|---|---|---|
| `limit` | tidak | `10`, `20`, `25`, `50`, `100` | `25` | Jumlah baris. Nilai lain otomatis jatuh ke default. |

### Contoh request

```bash
curl -H "X-API-Key: <PUBLIC_STATS_KEY>" \
  "https://npcsytem.onrender.com/api/public/top-hours?limit=25"
```

### Contoh response

```json
{
  "success": true,
  "generated_at": "2026-10-18T05:00:00.000Z",
  "limit": 25,
  "rule": { "gap_minutes": 10 },
  "users": [
    {
      "rank": 1,
      "username": "sakiko",
      "total_seconds": 697809,
      "total_hours": 193.84,
      "last_active": "2026-10-11 19:15:43"
    }
  ]
}
```

| Field | Tipe | Keterangan |
|---|---|---|
| `rank` | number | Peringkat (1 = teratas). |
| `username` | string | Nama user di log chat. |
| `total_seconds` | number | Total detik obrolan aktif (dibulatkan). |
| `total_hours` | number | `total_seconds / 3600`, dibulatkan 2 desimal. |
| `last_active` | string \| null | Terakhir aktif, format `YYYY-MM-DD HH:MM:SS` **UTC**. |
| `rule.gap_minutes` | number | Batas jeda yang dipakai server (10 menit). |

---

## 5. Contoh pemakaian (JavaScript)

```js
const NPC_API = 'https://npcsytem.onrender.com';
const NPC_KEY = process.env.NPC_PUBLIC_KEY; // simpan di server web/app, jangan di frontend publik

async function getTopHours(limit = 25) {
  const res = await fetch(`${NPC_API}/api/public/top-hours?limit=${limit}`, {
    headers: { 'X-API-Key': NPC_KEY }
  });
  if (!res.ok) throw new Error(`NPC API ${res.status}`);
  return res.json(); // { success, generated_at, limit, rule, users }
}
```

---

## 6. Ringkasan error

| Status | Arti | Contoh penyebab |
|---|---|---|
| `400` | Parameter tidak valid | `ai_name` mengandung karakter aneh / lebih dari 50 huruf. |
| `401` | API key salah/tidak ada | Header `X-API-Key` lupa dikirim. |
| `429` | Kena rate limit | Lebih dari 60 request/menit dari IP yang sama. |
| `500` | Error server/DB | Kueri DB gagal — coba beberapa saat lagi. |
| `503` | Public API nonaktif | `PUBLIC_STATS_KEY` kosong di `.env` server. |

---

## 7. Catatan internal (untuk admin/dev)

- Endpoint admin yang setara (butuh login dashboard, tanpa API key):
  - `GET /api/admin/top-users?limit=&ai_name=` — sama dengan `top-chat`.
  - `GET /api/admin/top-hours?limit=` — sama dengan `top-hours`, plus `rule.gap_minutes`.
- Tabel `user_chat_time` (username, total_seconds, last_message_at) dipelihara **incremental** setiap chat tersimpan di `src/routes/chatRoutes.js` (via `recordChatActivity`). Backfill histori otomatis saat boot (`ensureChatTimeBackfill` di `src/services/leaderboardService.js`):
  - `NODE_ENV=production` → backfill sekali lalu ditandai di `settings.chat_time_backfill_v1`.
  - selain production → backfill selalu dijalankan dan marker tidak ditulis (agar deploy pertama di production pasti memuat seluruh histori).
  - Butuh backfill ulang manual? Hapus baris `chat_time_backfill_v1` dari tabel `settings` lalu restart server (mode production).
- Cache in-memory 2 menit dapat diubah lewat konstanta `PUBLIC_CACHE_TTL_MS` di `src/routes/publicRoutes.js`.
