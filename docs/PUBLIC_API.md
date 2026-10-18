# Public API — NPC System

Endpoint publik **read-only** untuk web/app Animein: peringkat chat, jam obrolan, total kata, & waifu paling sering dichat.
Tanpa login admin — cukup API key statis lewat header `X-API-Key`.

- **Base URL produksi:** `https://npc.yogaa.web.id`
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
- **Cache server:** hasil disimpan in-memory maksimal **2 menit** per kombinasi parameter (`limit`, `ai_name`, `username`, dst.). Hit pertama lambat (kueri DB), hit berikutnya instan.
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
  "https://npc.yogaa.web.id/api/public/top-chat?limit=10&ai_name=alya"
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
      "user_id": "8123456789",
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
| `user_id` | string \| null | Identitas user stabil (ID akun dari app; data lama = `legacy:<nama>`). Pakai ini untuk mencocokkan "aku" — bukan `username` yang bisa berubah. |
| `username` | string | Nama tampilan terbaru user (dari tabel `users`). |
| `level` | number | Level hati tertinggi yang pernah dicapai (0–5). |
| `total_chat` | number | Jumlah pesan user tersebut (yang tersimpan di `chat_logs`). |
| `last_active` | string \| null | Terakhir aktif, format `YYYY-MM-DD HH:MM:SS` **UTC** (tambah +7 jam untuk WIB). |

> **Identitas:** baris digabung per `user_id`, jadi user yang ganti nama tampilan tetap satu baris. Data lama yang belum punya ID akun memakai `legacy:<username>` (nama yang dulu terpecah karena beda huruf besar/kecil otomatis tergabung). Detail: `docs/USER_ID.md`.

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
  "https://npc.yogaa.web.id/api/public/top-hours?limit=25"
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
      "user_id": "8123456789",
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
| `user_id` | string \| null | Identitas user stabil (ID akun; data lama = `legacy:<nama>`). |
| `username` | string | Nama tampilan terbaru user (dari tabel `users`). |
| `total_seconds` | number | Total detik obrolan aktif (dibulatkan). |
| `total_hours` | number | `total_seconds / 3600`, dibulatkan 2 desimal. |
| `last_active` | string \| null | Terakhir aktif, format `YYYY-MM-DD HH:MM:SS` **UTC**. |
| `rule.gap_minutes` | number | Batas jeda yang dipakai server (10 menit). |

---

## 5. `GET /api/public/top-words`

Peringkat user berdasarkan **total kata** yang mereka ketik (seluruh periode, sumber `chat_logs`).

**Cara hitung (perkiraan):**
- `total_words` = jumlah kata pada pesan user, dipisah spasi. Pesan kosong dihitung 0 kata.
  (Spasi ganda bisa terhitung ganda dan baris baru tidak memisah kata — jadi ini estimasi.)
- `total_chars` = jumlah karakter pesan apa adanya (termasuk spasi).
- Angka dihitung saat kueri (bukan disimpan), jadi selalu mengikuti data terbaru.

Bisa juga untuk **satu user tertentu**: tambahkan `user_id=...` (disarankan — identitas stabil) atau
`username=...` → hasilnya satu baris lengkap dengan `rank` user tersebut di antara semua user.
Kalau keduanya diisi, `user_id` yang dipakai.

### Query parameters

| Param | Wajib | Nilai | Default | Keterangan |
|---|---|---|---|---|
| `limit` | tidak | `10`, `20`, `25`, `50`, `100` | `10` | Jumlah baris (diabaikan kalau `user_id`/`username` diisi). |
| `ai_name` | tidak | ID karakter, mis. `alya` | — | Filter per karakter (case-insensitive). |
| `user_id` | tidak | ID akun user, mis. `8123456789` — atau identitas lama `legacy:<nama>`, mis. `legacy:sakiko` | — | Statistik satu user berdasarkan identitas stabil. Maks 64 karakter. |
| `username` | tidak | nama user, mis. `seialenz` | — | Statistik satu user berdasarkan nama (case-insensitive). Maks 50 karakter. |

### Contoh request

```bash
# Top 10 berdasarkan total kata
curl -H "X-API-Key: <PUBLIC_STATS_KEY>" \
  "https://npc.yogaa.web.id/api/public/top-words?limit=10"

# Statistik satu user (identitas stabil)
curl -H "X-API-Key: <PUBLIC_STATS_KEY>" \
  "https://npc.yogaa.web.id/api/public/top-words?user_id=8123456789"

# Statistik satu user (berdasarkan nama)
curl -H "X-API-Key: <PUBLIC_STATS_KEY>" \
  "https://npc.yogaa.web.id/api/public/top-words?username=seialenz"
```

### Contoh response (daftar)

```json
{
  "success": true,
  "generated_at": "2026-10-18T07:30:00.000Z",
  "limit": 10,
  "ai_name": null,
  "user_id": null,
  "username": null,
  "users": [
    {
      "rank": 1,
      "user_id": "8123456789",
      "username": "sakiko",
      "total_words": 73704,
      "total_chars": 464864,
      "total_chat": 5865,
      "last_active": "2026-10-11 19:15:43"
    }
  ]
}
```

### Contoh response (satu user)

```json
{
  "success": true,
  "generated_at": "2026-10-18T07:30:00.000Z",
  "limit": 10,
  "ai_name": null,
  "user_id": "8123456789",
  "username": "seialenz",
  "users": [
    {
      "rank": 5,
      "user_id": "8123456789",
      "username": "seialenz",
      "total_words": 41317,
      "total_chars": 237238,
      "total_chat": 8334,
      "last_active": "2026-10-18 03:09:58"
    }
  ]
}
```

| Field | Tipe | Keterangan |
|---|---|---|
| `rank` | number | Peringkat berdasarkan `total_words` (1 = teratas). Kalau filter `ai_name` dipakai, peringkat dihitung di kelompok filter itu. |
| `user_id` | string \| null | Identitas stabil user (ID akun; data lama = `legacy:<nama>`). Terisi kalau dicari lewat `user_id`. |
| `username` | string | Nama tampilan terbaru user. |
| `total_words` | number | Perkiraan jumlah kata yang diketik user. |
| `total_chars` | number | Jumlah karakter yang diketik user. |
| `total_chat` | number | Jumlah pesan user (sama seperti `top-chat`). |
| `last_active` | string \| null | Terakhir aktif, format `YYYY-MM-DD HH:MM:SS` **UTC**. |

> Kalau `user_id`/`username` tidak ditemukan: `users` berisi array kosong (`[]`) dengan `success: true`.

---

## 6. `GET /api/public/top-waifu`

Peringkat karakter AI (waifu) yang **paling sering diajak chat**, diurutkan dari total chat terbanyak.

### Query parameters

| Param | Wajib | Nilai | Default | Keterangan |
|---|---|---|---|---|
| `limit` | tidak | `10`, `20`, `25`, `50`, `100` | `10` | Jumlah baris. Nilai lain otomatis jatuh ke default. |

### Contoh request

```bash
curl -H "X-API-Key: <PUBLIC_STATS_KEY>" \
  "https://npc.yogaa.web.id/api/public/top-waifu?limit=10"
```

### Contoh response

```json
{
  "success": true,
  "generated_at": "2026-10-18T07:30:00.000Z",
  "limit": 10,
  "waifus": [
    {
      "rank": 1,
      "ai_name": "alya",
      "name": "Alya",
      "total_chat": 27423,
      "total_users": 3356,
      "last_active": "2026-09-07 02:18:55"
    }
  ]
}
```

| Field | Tipe | Keterangan |
|---|---|---|
| `rank` | number | Peringkat (1 = paling sering dichat). |
| `ai_name` | string | ID karakter — pakai nilai ini untuk filter `ai_name` di endpoint lain. |
| `name` | string | Nama tampilan karakter (dari tabel `characters`); fallback ke `ai_name` kalau tidak ketemu. |
| `total_chat` | number | Jumlah pesan user yang dikirim ke karakter tersebut. |
| `total_users` | number | Jumlah user unik yang pernah chat karakter tersebut. |
| `last_active` | string \| null | Waktu chat terakhir ke karakter tersebut, format `YYYY-MM-DD HH:MM:SS` **UTC**. |

---

## 7. Cara pemanggilan & penggunaan

### 7.1 Quick test (curl)

```bash
# Ganti ISI_KEY dengan nilai PUBLIC_STATS_KEY
curl -H "X-API-Key: ISI_KEY" \
  "https://npc.yogaa.web.id/api/public/top-hours?limit=25"
```

### 7.2 Web / JavaScript (browser atau Node)

```js
const NPC_API = 'https://npc.yogaa.web.id';
const NPC_KEY = 'ISI_PUBLIC_STATS_KEY';

async function getLeaderboard(path, params = {}) {
  const query = new URLSearchParams(params).toString();
  const url = `${NPC_API}${path}${query ? '?' + query : ''}`;
  const res = await fetch(url, { headers: { 'X-API-Key': NPC_KEY } });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`NPC API ${res.status}: ${err.error || 'unknown'}`);
  }
  return res.json();
}

// Peringkat jam — top 25
const hours = await getLeaderboard('/api/public/top-hours', { limit: 25 });
console.log(hours.users); // [{ rank, username, total_seconds, total_hours, last_active }, ...]

// Peringkat chat — filter karakter (opsional)
const chats = await getLeaderboard('/api/public/top-chat', { limit: 10, ai_name: 'alya' });
console.log(chats.users);

// Peringkat total kata
const words = await getLeaderboard('/api/public/top-words', { limit: 10 });
console.log(words.users); // [{ rank, username, total_words, total_chars, total_chat, last_active }, ...]

// Statistik satu user
const one = await getLeaderboard('/api/public/top-words', { username: 'seialenz' });
console.log(one.users[0]);

// Waifu paling sering dichat
const waifus = await getLeaderboard('/api/public/top-waifu', { limit: 10 });
console.log(waifus.waifus); // [{ rank, ai_name, name, total_chat, total_users, last_active }, ...]
```

> Catatan: `await` di top-level hanya bisa di ES module. Kalau dipakai di `<script>` biasa, bungkus dalam `async function` lalu panggil dengan `getLeaderboard(...).then(...)`.

### 7.3 Android / APK (Kotlin — OkHttp)

```kotlin
val client = OkHttpClient()
val request = Request.Builder()
    .url("https://npc.yogaa.web.id/api/public/top-hours?limit=25")
    .addHeader("X-API-Key", "ISI_PUBLIC_STATS_KEY")
    .build()

client.newCall(request).enqueue(object : Callback {
    override fun onFailure(call: Call, e: IOException) {
        // error jaringan
    }

    override fun onResponse(call: Call, response: Response) {
        val body = response.body?.string() ?: return
        if (!response.isSuccessful) return // 401 = key salah, 429 = rate limit, dll
        val users = JSONObject(body).getJSONArray("users")
        for (i in 0 until users.length()) {
            val u = users.getJSONObject(i)
            // u.getInt("rank"), u.getString("username"), u.getDouble("total_hours") ...
        }
    }
})
```

> Di HP fisik, pastikan punya izin `INTERNET` di `AndroidManifest.xml`. URL harus HTTPS (sudah, di Render) — tidak perlu setting cleartext.

### 7.4 Flutter (Dart — package http)

```dart
import 'dart:convert';
import 'package:http/http.dart' as http;

Future<List<dynamic>> fetchTopHours() async {
  final res = await http.get(
    Uri.parse('https://npc.yogaa.web.id/api/public/top-hours?limit=25'),
    headers: {'X-API-Key': 'ISI_PUBLIC_STATS_KEY'},
  );
  if (res.statusCode != 200) {
    throw Exception('NPC API ${res.statusCode}');
  }
  final data = jsonDecode(res.body);
  return data['users'] as List<dynamic>;
}
```

### 7.5 Tips penggunaan

- Batas `limit` yang diterima hanya `10`, `20`, `25`, `50`, `100` — nilai lain (mis. `limit=3`) otomatis jatuh ke default (`10` untuk top-chat/top-words/top-waifu, `25` untuk top-hours).
- Data di-cache 2 menit di server, jadi cukup polling tiap 2–5 menit; jangan tiap detik.
- `total_hours` sudah angka siap tampil (2 desimal). Untuk format cantik di UI: `total_hours.toFixed(1) + ' jam'`.
- `last_active` format UTC — untuk WIB tambah 7 jam, atau tampilkan "terakhir aktif" relatif (mis. "2 hari lalu").
- Simpan key di satu tempat (mis. konstanta/config), jangan tulis ulang di banyak file.

---

## 8. Ringkasan error

| Status | Arti | Contoh penyebab |
|---|---|---|
| `400` | Parameter tidak valid | `ai_name` mengandung karakter aneh / lebih dari 50 huruf; `username` lebih dari 50 karakter; `user_id` lebih dari 64 karakter / karakter aneh. |
| `401` | API key salah/tidak ada | Header `X-API-Key` lupa dikirim. |
| `429` | Kena rate limit | Lebih dari 60 request/menit dari IP yang sama. |
| `500` | Error server/DB | Kueri DB gagal — coba beberapa saat lagi. |
| `503` | Public API nonaktif | `PUBLIC_STATS_KEY` kosong di `.env` server. |

---

## 9. Catatan internal (untuk admin/dev)

- Endpoint admin yang setara (butuh login dashboard, tanpa API key):
  - `GET /api/admin/top-users?limit=&ai_name=` — sama dengan `top-chat`.
  - `GET /api/admin/top-hours?limit=` — sama dengan `top-hours`, plus `rule.gap_minutes`.
- Semua peringkat user berbasis **`user_id`** (identitas stabil): ID akun dari body chat (`user.id`), fallback `legacy:<username>` untuk data lama/klien lama. Nama tampilan diambil dari tabel `users` (nama terbaru). Detail alur + kontrak client: `docs/USER_ID.md`.
- `top-words` & `top-waifu` dihitung **live dari `chat_logs`** (tanpa tabel tambahan). `total_words` = estimasi dipisah spasi; `total_chars` = panjang pesan.
- Tabel `user_chat_time` (user_id, username, total_seconds, last_message_at) dipelihara **incremental** setiap chat tersimpan di `src/routes/chatRoutes.js` (via `recordChatActivity`). Backfill histori otomatis saat boot (`ensureChatTimeBackfill` di `src/services/leaderboardService.js`):
  - `NODE_ENV=production` → backfill sekali lalu ditandai di `settings.chat_time_backfill_v1`.
  - selain production → backfill selalu dijalankan dan marker tidak ditulis (agar deploy pertama di production pasti memuat seluruh histori).
  - Butuh backfill ulang manual? Hapus baris `chat_time_backfill_v1` dari tabel `settings` lalu restart server (mode production).
- Cache in-memory 2 menit dapat diubah lewat konstanta `PUBLIC_CACHE_TTL_MS` di `src/routes/publicRoutes.js` (cache key sudah termasuk `user_id`).
