# Identitas User (`user_id`) — NPC System

Dokumen ini menjelaskan cara kerja identitas user di NPC System dan **apa yang perlu dikirim aplikasi chat (Animein)** supaya statistik/leaderboard rapi dan tidak terpecah.

---

## 1. Konsep

Sebelumnya, user diidentifikasi hanya dari **username** yang diketik. Akibatnya:

- User yang **ganti nama** → statistik terpecah jadi dua.
- Username dengan **beda huruf besar/kecil** (data lama, mis. `Zyxe` vs `zyxe`) → dua baris terpisah.
- Dua orang kebetulan pakai nama sama → statistik tercampur.

Sekarang sistem memakai **`user_id`** — identitas stabil per user:

| Sumber `user_id` | Kapan dipakai |
|---|---|
| **ID akun dari app** (dikirim client di `user.id`) | User yang app-nya sudah mengirim ID (cara utama). |
| `legacy:<nama ternormalisasi>` | Otomatis untuk data lama & client yang belum mengirim ID (mis. `legacy:zyxe`). |

Aturan otomatis:

- **Ganti nama aman** — selama `user_id`-nya sama, statistik tetap satu baris; nama yang ditampilkan selalu **nama terbaru**.
- **Case/format nama digabung** — `Zyxe`, `zyxe`, `@zyxe` dianggap satu identitas untuk data lama.
- **Auto-claim** — saat user dengan ID akun pertama kali chat memakai nama yang masih punya histori lama, histori itu otomatis dipindahkan ke ID-nya (mis. semua chat `legacy:zyxe` → `8123456789`). Statistik sebelum & sesudah pakai ID menyatu.

**ID yang dikirim = ID resmi akun Animein** (`data.user.id` dari login AnimeinWeb, angka, mis. `299634`) — bukan ID buatan client. Kalau app belum mengirim ID, selama user pernah memakai bot Animein, historinya bisa digabung ke ID resmi lewat mapping DB bot:

```bash
node scripts/sync-user-id-animein.js          # pratinjau: nama → ID resmi
node scripts/sync-user-id-animein.js --apply  # pindah chat/users/uct/ban ke ID resmi
```

Sumber mapping: DB bot (`../chat bot animein/.env`). Idempoten — aman diulang; jalankan ulang sewaktu-waktu kalau bot menambah user baru.

---

## 2. Yang perlu dikirim aplikasi chat

Di body `POST /api/npc/v1/chat`, object `user` sekarang boleh membawa `id`:

```jsonc
{
  "user": {
    "id": "8123456789",        // ID akun dari sistem login app (string, stabil)
    "username": "zyxe",        // nama tampilan (boleh berubah kapan saja)
    "level": 3
  },
  "message": "halo",
  "context": { }
}
```

Ketentuan `user.id`:

- String, **1–64 karakter**, huruf/angka serta `._:@+-`, harus diawali huruf/angka.
- Harus **stabil dan unik per user/akun** (pakai ID dari sistem login; jangan pakai nomor urut sesi).
- Tidak boleh diawali `legacy:` (namespace cadangan sistem).
- Kalau tidak dikirim / tidak valid → otomatis fallback ke `legacy:<username>` (chat tetap jalan normal).

### Contoh (JavaScript / web)

```js
// Wujudkan sekali dari sistem login, lalu kirim tiap chat.
async function chat(npcApiBase, user, message, context) {
  const res = await fetch(`${npcApiBase}/api/npc/v1/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user: {
        id: String(user.accountId),   // <— kunci: ID akun yang stabil
        username: user.displayName,
        level: user.heartLevel
      },
      message,
      context
    })
  });
  return res.json();
}
```

### Contoh (Kotlin — OkHttp)

```kotlin
val json = JSONObject().apply {
    put("user", JSONObject().apply {
        put("id", accountId)          // ID akun dari sesi login
        put("username", displayName)
        put("level", heartLevel)
    })
    put("message", message)
    put("context", JSONObject())
}
```

> Pakai `id` = **ID akun** (bukan device id) supaya user yang login dari perangkat lain tetap satu identitas.

---

## 3. Pemakaian di Public API

Semua endpoint `/api/public/*` yang menampilkan user kini mengembalikan `user_id` di tiap baris — **pakai `user_id` untuk mencocokkan "aku"**, bukan `username`:

```js
// Contoh: tandai "aku" di leaderboard
const me = myUser.accountId;
const res = await getLeaderboard('/api/public/top-words', { limit: 10 });
const row = res.users.find(u => u.user_id === String(me));
```

Filter satu user di `top-words` bisa lewat `user_id` (disarankan) atau `username`:

```bash
curl -H "X-API-Key: <KEY>" "https://npc.yogaa.web.id/api/public/top-words?user_id=8123456789"
```

- `user_id` → cocok persis dengan identitas stabil user.
- `username` → pencarian nama (case-insensitive; untuk data lama, satu nama = satu identitas).
- Identitas lama juga bisa dicek langsung: `?user_id=legacy:<nama>` (mis. `legacy:sakiko`) — berguna untuk data sebelum app mengirim ID akun.

---

## 4. Catatan teknis (untuk dev/server)

- Implementasi: `src/services/userIdentity.js`
  - `sanitizeUserId()` — validasi ID dari client (dipakai `input_guard.js`).
  - `legacyIdFor()` — normalisasi nama → kunci `legacy:<nama>`.
  - `claimLegacyUser()` — pemindahan histori `legacy:*` ke ID akun (transaksional, sekali per nama).
  - `ensureUserIdentitySchema()` / `backfillUserIds()` — migrasi skema & backfill (idempoten).
- Penyimpanan: `chat_logs.user_id`, tabel `users` (PK `user_id`), tabel `user_chat_time` (PK `user_id`).
- Migrasi/backfill manual (idempoten, ada verifikasi):
  ```bash
  node scripts/migrate-user-id.js                 # target sqld produksi (TURSO_URL di .env)
  node scripts/migrate-user-id.js --url=<url> --token=<token>   # target lain (mis. Turso cadangan)
  node scripts/migrate-user-id.js --schema-only   # hanya skema, tanpa backfill
  ```
  Otomatis juga dijalankan saat boot aplikasi (bagian `initDB`) untuk skema.
- Editor chat (simulator admin) tidak menulis identitas — hanya chat user asli yang tercatat.
