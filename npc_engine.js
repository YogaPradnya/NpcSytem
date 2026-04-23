const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const Groq = require('groq-sdk');
const cookieParser = require('cookie-parser');
require('dotenv').config();
const { createClient } = require('@libsql/client');
const { getAdminDashboardHTML, getLoginPageHTML } = require('./dashboard.js');

const app = express();
app.use(cors()); // Mengizinkan akses dari aplikasi luar (APK/Web)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser('npc-system-secret-88'));

// Tambahkan middleware no-cache agar perubahan UI langsung terlihat
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    next();
});
// Redirect root ke Admin Dashboard
app.get('/', (req, res) => {
    res.redirect('/admin');
});

// Middleware Session Auth untuk Admin Dashboard
const sessionAuth = (req, res, next) => {
    if (req.signedCookies.isLoggedIn === 'true') {
        next();
    } else {
        res.redirect('/login');
    }
};

// Middleware Session Auth khusus API (kembalikan 401, bukan redirect)
const apiAuth = (req, res, next) => {
    if (req.signedCookies.isLoggedIn === 'true') {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized. Please login.' });
    }
};

// Route Login
app.get('/login', (req, res) => {
    if (req.signedCookies.isLoggedIn === 'true') return res.redirect('/admin');
    res.send(getLoginPageHTML());
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (username === process.env.DASHBOARD_USER && password === process.env.DASHBOARD_PASS) {
        res.cookie('isLoggedIn', 'true', { 
            signed: true, 
            httpOnly: true, 
            maxAge: 86400000 * 7 // 7 hari
        });
        res.redirect('/admin');
    } else {
        res.send(getLoginPageHTML('Username atau Password salah!'));
    }
});

app.get('/logout', (req, res) => {
    res.clearCookie('isLoggedIn');
    res.redirect('/login');
});

const PORT = process.env.PORT || 4000; // Menggunakan port dari environment atau 4000 jika lokal

// Statistik Monitoring (InMemory)
let globalStats = {
    totalRequests: 0,
    totalTokens: 0,
    startTime: new Date(),
    charUsage: {} // Track tokens per character
};

// Konfigurasi Model AI
let aiConfig = {
    primaryModel: 'llama-3.3-70b-versatile',
    fallbackModel: 'llama-3.1-8b-instant'
};

// Fungsi untuk mendapatkan waktu dunia nyata secara deskriptif
function getTimeOfDay() {
    const hour = new Date().getHours();
    if (hour >= 4 && hour < 11) return "PAGI";
    if (hour >= 11 && hour < 15) return "SIANG";
    if (hour >= 15 && hour < 19) return "SORE";
    return "MALAM";
}

// Fungsi untuk mendapatkan panduan berdasarkan level (Opsional token)
function getLevelGuide(level) {
    const lv = Number(level) || 0; 
    if (lv <= 0) {
        return `[PANDUAN HUBUNGAN: LV 0 (ORANG ASING)]:
- BICARA LEMBUT, SEDIKIT RAGU, DAN SOPAN. Gunakan elipsis (...) untuk jeda.
- Soft Boundary: Batasi diri secara halus. Malu jika dipuji. Jaga jarak personal.`;
    }
    if (lv === 1) {
        return `[PANDUAN HUBUNGAN: LV 1 (KENALAN)]:
- Mulai ramah dan tidak terlalu kaku. Masih menjaga wibawa tapi sudah mau mengobrol santai.`;
    }
    if (lv === 2) {
        return `[PANDUAN HUBUNGAN: LV 2 (TEMAN BIASA)]:
- Sudah nyaman bercanda sedikit. Menunjukkan ketertarikan pada hobi atau cerita user.`;
    }
    if (lv === 3) {
        return `[PANDUAN HUBUNGAN: LV 3 (TEMAN BAIK)]:
- Bicara hangat dan peduli. Senang jika user ada di dekatmu. Mulai menunjukkan sisi imut.`;
    }
    if (lv === 4) {
        return `[PANDUAN HUBUNGAN: LV 4 (SAHABAT)]:
- Sangat percaya pada user. Berbagi cerita personal dan memberikan perhatian ekstra yang manis.`;
    }
    return `[PANDUAN HUBUNGAN: LV 5 (ORANG SPESIAL)]:
- Sangat akrab, penuh kasih sayang, dan protektif. Kamu merasa user adalah orang paling berharga.`;
}

// Inisialisasi Turso Client
const db = createClient({
    url: process.env.TURSO_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
});

let characters = {};

// Fungsi untuk inisialisasi Database & Migrasi dari JSON
async function initDB() {
    try {
        await db.execute(`
            CREATE TABLE IF NOT EXISTS characters (
                id TEXT PRIMARY KEY,
                npc_name TEXT,
                npc_description TEXT,
                npc_personality TEXT,
                npc_speaking_style TEXT,
                world_setting TEXT,
                language TEXT,
                is_enabled INTEGER DEFAULT 1
            )
        `);
        
        await db.execute(`
            CREATE TABLE IF NOT EXISTS chat_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                ai_name TEXT,
                username TEXT,
                user_message TEXT,
                bot_response TEXT,
                tokens INTEGER,
                model TEXT
            )
        `);
        await db.execute(`
            CREATE TABLE IF NOT EXISTS users (
                username TEXT PRIMARY KEY,
                last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log("[DB] Tables 'characters', 'chat_logs', & 'users' ready.");

        // Ambil data dari Turso
        const result = await db.execute("SELECT * FROM characters");
        if (result.rows.length > 0) {
            result.rows.forEach(row => {
                characters[row.id] = { ...row };
            });
            console.log(`[DB] Loaded ${result.rows.length} characters from Turso.`);
        } else {
            // Jika DB kosong, migrasi dari JSON
            const jsonPath = path.join(__dirname, 'characters.json');
            if (fs.existsSync(jsonPath)) {
                const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
                for (const id in jsonData) {
                    const c = jsonData[id];
                    await db.execute({
                        sql: "INSERT INTO characters (id, npc_name, npc_description, npc_personality, npc_speaking_style, world_setting, language, is_enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                        args: [id, c.npc_name, c.npc_description, c.npc_personality, c.npc_speaking_style, c.world_setting, c.language || 'id', c.is_enabled !== undefined ? (c.is_enabled ? 1 : 0) : 1]
                    });
                    characters[id] = { id, ...c, is_enabled: c.is_enabled !== undefined ? !!c.is_enabled : true };
                }
                console.log("[DB] Migrated data from characters.json to Turso.");
            }
        }
    } catch (e) {
        console.error("[DB] Gagal inisialisasi database:", e.message);
    }
}
initDB();

// Inisialisasi Groq Clients
const keys = [
    process.env.GROQ_API_KEY,
    process.env.GROQ_API_KEY_2,
    process.env.GROQ_API_KEY_3,
    process.env.GROQ_API_KEY_4,
    process.env.GROQ_API_KEY_5,
    process.env.GROQ_API_KEY_6,
    process.env.GROQ_API_KEY_7,
    process.env.GROQ_API_KEY_8,
    process.env.GROQ_API_KEY_9,
    process.env.GROQ_API_KEY_10,
    process.env.GROQ_API_KEY_11,
    process.env.GROQ_API_KEY_12,
    process.env.GROQ_API_KEY_13,
    process.env.GROQ_API_KEY_14,
    process.env.GROQ_API_KEY_15,
    process.env.GROQ_API_KEY_16,
    process.env.GROQ_API_KEY_17,
    process.env.GROQ_API_KEY_18,
    process.env.GROQ_API_KEY_19,
    process.env.GROQ_API_KEY_20,

].filter(Boolean);

// Inisialisasi Groq Clients dengan status cooldown & manual toggle
const groqClients = keys.map((key, index) => ({
    id: index + 1,
    client: new Groq({ apiKey: key }),
    cooldownUntil: 0,
    isEnabled: true
}));

if (groqClients.length === 0) {
    console.warn("[NPC] Peringatan: Tidak ada API Key Groq yang ditemukan di .env!");
}   

app.post('/api/npc/v1/chat', async (req, res) => {
    const startTime = Date.now();
    try {
        const { user, message, context, system } = req.body;

        if (!message) return res.status(400).json({ success: false, error: 'Message is required' });

        // Pilih karakter
        const aiKey = (system && system.ai_name) ? system.ai_name.toLowerCase() : 'alya';
        let char = characters[aiKey] || characters['alya'];

        if (!char || char.is_enabled === false) {
            return res.status(404).json({ success: false, error: `Character '${aiKey}' not found or disabled.` });
        }

        // System Prompt: Membangun dari Struktur Data Baru
        const finalSystemPrompt = `KAMU ADALAH ${char.npc_name.toUpperCase()} (Bukan AI).
[PANDUAN KARAKTER]:
- Deskripsi: ${char.npc_description}
- Kepribadian: ${char.npc_personality}
- Gaya Bicara: ${char.npc_speaking_style}
- Dunia: ${char.world_setting}

[KONTEKS SAAT INI]:
- Lokasi: ${context?.location || 'Tidak diketahui'}
- Waktu: ${context?.time || getTimeOfDay()}
- Suasana: ${context?.mood || 'normal'}
- User: ${user?.username} (Lv Hati: ${user?.level})

${getLevelGuide(user?.level)}

[GAYA BICARA]:
- Gunakan 'Enter' (newline) untuk memisahkan responmu menjadi 2 sampai 4 bagian.
- MAKSIMAL 4 bagian per jawaban.
- TOTAL KARAKTER HARUS DI BAWAH 300 HURUF. JANGAN MENULIS TERLALU PANJANG.
- Gunakan elipsis (...) untuk jeda perasaan dalam satu baris.
- JANGAN GUNAKAN ASTERISK atau 'ANDA'. Pakai 'Kamu/Kau'.
- Fokus pada pembicaraan tatap muka yang bermakna.

Berikan respon yang setara dengan kepribadian ${char.npc_name}. JANGAN JAWAB SEBAGAI ASISTEN.`;

        // Siapkan History (Terbatas hanya 4 pesan terakhir untuk hemat token)
        let chatHistory = [];
        if (context && Array.isArray(context.history)) {
            const recentHistory = context.history.slice(-4); 
            chatHistory = recentHistory.map(h => ({
                role: (h.role === 'bot' || h.role === 'assistant') ? 'assistant' : 'user',
                content: h.content || h.message || ''
            }));
        }

        // Pilih client yang tidak sedang cooldown & diaktifkan secara manual
        const availableClients = groqClients.filter(c => c.isEnabled && Date.now() > c.cooldownUntil);
        
        if (availableClients.length === 0) {
            return res.status(503).json({ 
                success: false, 
                error: 'Semua token/otak sedang mencapai batas limit (Exhausted). Silakan coba lagi nanti.' 
            });
        }

        const selectedClientObj = availableClients[Math.floor(Math.random() * availableClients.length)];
        const client = selectedClientObj.client;

        if (!client) throw new Error("No AI clients available.");

        // Konfigurasi Model (Gunakan pilihan dari config)
        const primaryModel = aiConfig.primaryModel;
        const fallbackModel = aiConfig.fallbackModel;

        let completion;
        try {
            completion = await client.chat.completions.create({
                model: primaryModel,
                messages: [
                    { role: 'system', content: finalSystemPrompt },
                    ...chatHistory,
                    { role: 'user', content: message }
                ],
                max_tokens: 150, // Dibatasi agar total karakter di bawah 300
                temperature: 0.8
            });
        } catch (error) {
            // Jika error adalah rate limit (token habis)
            if (error.status === 429 || error.message.toLowerCase().includes('rate limit')) {
                selectedClientObj.cooldownUntil = Date.now() + (3600 * 1000); // Delay 1 jam
                console.warn(`[NPC] Otak ${selectedClientObj.id} Exhausted! Delay 1 jam.`);
            }

            console.warn(`[NPC] Model ${primaryModel} gagal, mencoba fallback ke ${fallbackModel}:`, error.message);
            completion = await client.chat.completions.create({
                model: fallbackModel,
                messages: [
                    { role: 'system', content: finalSystemPrompt },
                    ...chatHistory,
                    { role: 'user', content: message }
                ],
                max_tokens: 150,
                temperature: 0.8
            });
        }

        let fullResponse = completion.choices[0].message.content;
        
        // Hard limit: 300 Karakter (Programmatic safety)
        if (fullResponse.length > 300) {
            fullResponse = fullResponse.substring(0, 300);
            // Coba potong di spasi terakhir agar tidak terputus di tengah kata
            const lastSpace = fullResponse.lastIndexOf(' ');
            if (lastSpace > 200) fullResponse = fullResponse.substring(0, lastSpace) + '...';
        }

        // Pecah menjadi kalimat (Trigger: Titik atau Koma, abaikan Elipsis ...)
        const rawFragments = fullResponse
            .replace(/\.\.\./g, '___ELL___')
            .split(/(?<=[.!?, \n])/) // Pecah setelah . ! ? , atau \n
            .map(s => s.replace(/___ELL___/g, '...').trim())
            .filter(s => s.length > 0);

        let sentences = [];
        let currentSentence = "";

        for (let fragment of rawFragments) {
            currentSentence += (currentSentence ? " " : "") + fragment;

            const isStrongBreak = /[.!?]$/.test(fragment); // Titik, Seru, Tanya
            const isSoftBreak = /[,]$/.test(fragment);    // Koma
            const isNewline = fragment.includes('\n');    // Enter

            // Logika Cerdas:
            // - Jika Enter -> Pisah.
            // - Jika (.!?) dan sudah > 30 karakter -> Pisah (Cukup panjang untuk 1 bubble).
            // - Jika (,) tapi kalimat sudah kepanjangan (> 60 karakter) -> Pisah agar tidak sesak.
            if (isNewline || 
                (isStrongBreak && currentSentence.length >= 30) || 
                (isSoftBreak && currentSentence.length >= 60) ||
                currentSentence.length >= 100) {
                
                sentences.push(currentSentence.trim());
                currentSentence = "";
            }
        }
        // Masukkan sisa potongan terakhir jika ada
        if (currentSentence.trim()) {
            sentences.push(currentSentence.trim());
        }
        sentences = sentences.slice(0, 4); // Maksimal 4 sentence

        // Update Statistik
        const tokens = completion.usage?.total_tokens || 0;
        globalStats.totalRequests++;
        globalStats.totalTokens += tokens;
        if (!globalStats.charUsage[aiKey]) globalStats.charUsage[aiKey] = 0;
        globalStats.charUsage[aiKey] += tokens;

        // Simpan/Update Metadata User
        const currentUsername = user?.username || 'Guest';
        const currentHeartLv = Number(user?.level) || 0;
        
        try {
            await db.execute({
                sql: "INSERT INTO users (username, last_seen) VALUES (?, CURRENT_TIMESTAMP) ON CONFLICT(username) DO UPDATE SET last_seen=CURRENT_TIMESTAMP",
                args: [currentUsername]
            });
        } catch (uErr) {
            console.error("[DB USER SYNC ERROR]:", uErr.message);
        }

        // Simpan Log ke Database
        try {
            await db.execute({
                sql: "INSERT INTO chat_logs (ai_name, username, user_message, bot_response, tokens, model) VALUES (?, ?, ?, ?, ?, ?)",
                args: [aiKey, currentUsername, message, sentences.join('\n'), tokens, completion.model]
            });
        } catch (logErr) {
            console.error("[DB LOG ERROR]:", logErr.message);
        }

        const endTime = Date.now();
        const result = {
            ai_name: aiKey,
            level: currentHeartLv,
            model_used: completion.model,
            processing_time_ms: endTime - startTime,
            sentence_count: sentences.length,
            sentences: sentences
        };

        console.log(`[NPC] Name: ${char.npc_name} | Lv: ${currentHeartLv} | Sentences: ${sentences.length} | Tokens: ${tokens} | ${endTime - startTime}ms`);
        res.json(result);

    } catch (e) {
        console.error("[NPC V1 API ERROR]:", e.message);
        res.status(500).json({ 
            success: false, 
            error: "Gagal mengambil balasan AI", 
            message: e.message 
        });
    }
});

// API: Get Stats
app.get('/api/stats', (req, res) => {
    const active = groqClients.filter(c => Date.now() > c.cooldownUntil && c.isEnabled).length;
    const cooldown = groqClients.filter(c => Date.now() <= c.cooldownUntil).length;
    
    // Get top usage
    const topChars = Object.entries(globalStats.charUsage)
        .sort((a,b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, toks]) => ({ name, toks }));

    res.json({
        ...globalStats,
        uptime: Math.floor((new Date() - globalStats.startTime) / 1000) + "s",
        available_keys: groqClients.length,
        active_keys: active,
        cooldown_keys: cooldown,
        topChars
    });
});

// Admin Dashboard UI
app.get('/admin', sessionAuth, (req, res) => {
    const active = groqClients.filter(c => Date.now() > c.cooldownUntil).length;
    const stats = {
        ...globalStats,
        uptime: Math.floor((new Date() - globalStats.startTime) / 1000) + "s",
        available_keys: groqClients.length,
        active_keys: active,
        cooldown_keys: groqClients.length - active
    };
    res.send(getAdminDashboardHTML(stats));
});

// API: Get Model Config & Otak Status
app.get('/api/admin/models', apiAuth, (req, res) => {
    res.json({
        config: aiConfig,
        otak: groqClients.map(c => ({
            id: c.id,
            isEnabled: c.isEnabled,
            isCoolingDown: Date.now() < c.cooldownUntil,
            cooldownRemaining: Math.max(0, Math.floor((c.cooldownUntil - Date.now()) / 1000))
        }))
    });
});

// API: Toggle Otak
app.post('/api/admin/models/toggle', apiAuth, (req, res) => {
    const { id, enabled } = req.body;
    const otak = groqClients.find(c => c.id === id);
    if (otak) {
        otak.isEnabled = enabled;
        res.json({ success: true, id, enabled });
    } else {
        res.status(404).json({ error: "Otak not found" });
    }
});

// API: Switch Primary Model
app.post('/api/admin/models/switch', apiAuth, (req, res) => {
    const { primaryModel } = req.body;
    if (primaryModel) {
        aiConfig.primaryModel = primaryModel;
        res.json({ success: true, primaryModel });
    } else {
        res.status(400).json({ error: "Missing model name" });
    }
});

// API: Get Chat Logs
app.get('/api/admin/logs', apiAuth, async (req, res) => {
    try {
        const result = await db.execute("SELECT * FROM chat_logs ORDER BY timestamp DESC LIMIT 100");
        res.json({ logs: result.rows });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// API: Get Users List
app.get('/api/admin/users', apiAuth, async (req, res) => {
    try {
        const result = await db.execute("SELECT * FROM users ORDER BY last_seen DESC");
        res.json({ users: result.rows });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// API: Get Specific User Logs
app.get('/api/admin/user-logs/:username', apiAuth, async (req, res) => {
    try {
        const result = await db.execute({
            sql: "SELECT * FROM chat_logs WHERE username = ? ORDER BY timestamp DESC LIMIT 50",
            args: [req.params.username]
        });
        res.json({ logs: result.rows });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// API: Save/Update Character
app.post('/api/characters/save', async (req, res) => {
    const { id, data } = req.body;
    if (!id || !data) return res.status(400).json({ error: "Missing data" });

    try {
        await db.execute({
            sql: `INSERT INTO characters (id, npc_name, npc_description, npc_personality, npc_speaking_style, world_setting, language, is_enabled) 
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                  ON CONFLICT(id) DO UPDATE SET 
                  npc_name=excluded.npc_name, 
                  npc_description=excluded.npc_description, 
                  npc_personality=excluded.npc_personality, 
                  npc_speaking_style=excluded.npc_speaking_style, 
                  world_setting=excluded.world_setting, 
                  language=excluded.language,
                  is_enabled=excluded.is_enabled`,
            args: [id, data.npc_name, data.npc_description, data.npc_personality, data.npc_speaking_style, data.world_setting, data.language || 'id', data.is_enabled ? 1 : 0]
        });
        
        characters[id] = { id, ...data };
        res.json({ success: true, message: `Character ${id} saved to Turso.` });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// API: Delete Character
app.post('/api/characters/delete', async (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: "Missing ID" });

    try {
        await db.execute({
            sql: "DELETE FROM characters WHERE id = ?",
            args: [id]
        });
        delete characters[id];
        res.json({ success: true, message: `Character ${id} deleted from Turso.` });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// API: Get characters list
app.get('/api/characters', (req, res) => {
    const list = Object.keys(characters).map(key => ({
        id: key,
        ...characters[key]
    }));
    res.json({ success: true, characters: list });
});



app.listen(PORT, () => {
    console.log(`------------------------------------------`);
    console.log(`NPC Engine V1 is now active!`);
    console.log(`Listening at: http://localhost:${PORT}`);
    console.log(`Endpoint: http://localhost:${PORT}/api/npc/v1/chat`);
    console.log(`------------------------------------------`);
});
