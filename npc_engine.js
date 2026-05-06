const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const Groq = require('groq-sdk');
const Cerebras = require('@cerebras/cerebras_cloud_sdk');
const cookieParser = require('cookie-parser');
require('dotenv').config();
const { createClient } = require('@libsql/client');
const { getAdminDashboardHTML, getLoginPageHTML } = require('./dashboard.js');

const app = express();
app.use(cors()); // Mengizinkan akses dari aplikasi luar (APK/Web)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
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
    if (req.signedCookies.user) {
        req.user = JSON.parse(req.signedCookies.user);
        next();
    } else {
        res.redirect('/login');
    }
};

// Middleware Session Auth khusus API
const apiAuth = (req, res, next) => {
    if (req.signedCookies.user) {
        req.user = JSON.parse(req.signedCookies.user);
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized. Please login.' });
    }
};

// Middleware khusus Admin Only
const adminOnly = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).send("Akses Ditolak: Khusus Admin!");
    }
};

// Route Login
app.get('/login', (req, res) => {
    if (req.signedCookies.user) return res.redirect('/admin');
    res.send(getLoginPageHTML());
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    let role = null;
    const userIn = (username || '').trim();
    const passIn = (password || '').trim();

    if (userIn === process.env.ADMIN_USER && passIn === process.env.ADMIN_PASS) {
        role = 'admin';
    } else if (userIn === process.env.MOD_USER && passIn === process.env.MOD_PASS) {
        role = 'asisten';
    }

    if (role) {
        res.cookie('user', JSON.stringify({ username, role }), { 
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
    res.clearCookie('user');
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

// Real-time Log Stream (SSE)
let logListeners = [];
function broadcastLog(data) {
    const logEntry = typeof data === 'string' ? { message: data, type: 'info' } : data;
    logEntry.timestamp = new Date().toISOString();
    const payload = `data: ${JSON.stringify(logEntry)}\n\n`;
    logListeners.forEach(res => res.write(payload));
}

// Override console.log to also broadcast
const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;

console.log = (...args) => {
    originalLog(...args);
    broadcastLog({ message: args.join(' '), type: 'log' });
};
console.warn = (...args) => {
    originalWarn(...args);
    broadcastLog({ message: args.join(' '), type: 'warn' });
};
console.error = (...args) => {
    originalError(...args);
    broadcastLog({ message: args.join(' '), type: 'error' });
};

// Konfigurasi Model AI
let aiConfig = {
    primaryModel: 'llama-3.1-8b-instant',
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

// Fungsi untuk memformat detik menjadi Jam:Menit:Detik
function formatUptime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h}h ${m}m ${s}s`;
}

// Fungsi untuk mendapatkan panduan hubungan yang mendalam (Level-Based Psychology)
function getLevelGuide(level) {
    const lv = Number(level) || 0; 
    if (lv <= 0) return "[LV0: ASING] Dingin, formal, jaga jarak, tanpa emosi.";
    if (lv === 1) return "[LV1: KENALAN] Ramah sewajarnya, sedikit kaku, hindari topik pribadi.";
    if (lv === 2) return "[LV2: TEMAN] Santai, luwes, mulai bercanda, panggil nama user.";
    if (lv === 3) return "[LV3: TEMAN BAIK] Jujur, terbuka, emosional, sangat antusias.";
    if (lv === 4) return "[LV4: SAHABAT] Sangat percaya, protektif, manja/menggoda, takut kehilangan.";
    return "[LV5: PASANGAN] Intim, setia, manja, posesif manis, cinta mati.";
}

function getDefaultStageLabel(level) {
    const lv = Number(level) || 0;
    if (lv === 1) return "kenalan";
    if (lv === 2) return "teman_biasa";
    if (lv === 3) return "teman_baik";
    if (lv === 4) return "sahabat_dekat";
    if (lv >= 5) return "orang_terspesial";
    return "belum_kenal";
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
                model TEXT,
                latency INTEGER,
                ai_pose TEXT,
                user_level INTEGER
            )
        `);

        // Migration: Add new columns if they don't exist
        try { await db.execute("ALTER TABLE chat_logs ADD COLUMN ai_pose TEXT"); } catch (e) {}
        try { await db.execute("ALTER TABLE chat_logs ADD COLUMN user_level INTEGER"); } catch (e) {}

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
    isEnabled: true,
    stats: {
        requests: 0,
        success: 0,
        errors: 0,
        tokens: 0
    }
}));

if (groqClients.length === 0) {
    console.warn("[NPC] Peringatan: Tidak ada API Key Utama yang ditemukan di .env!");
}

// Inisialisasi Cerebras Clients (Ultimate Fallback)
const cerebrasKeys = [
    process.env.CEREBRAS_API_KEY,
    process.env.CEREBRAS_API_KEY_2,
    process.env.CEREBRAS_API_KEY_3,
    process.env.CEREBRAS_API_KEY_4,
    process.env.CEREBRAS_API_KEY_5,
    process.env.CEREBRAS_API_KEY_6,
    process.env.CEREBRAS_API_KEY_7,
].filter(Boolean);

const cerebrasClients = cerebrasKeys.map((key, index) => ({
    id: index + 1,
    client: new Cerebras({ apiKey: key }),
    cooldownUntil: 0,
    isEnabled: true,
    stats: {
        requests: 0,
        success: 0,
        errors: 0,
        tokens: 0
    }
}));

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

        // Extract struktur data baru sesuai request
        const problem = context?.problem || "";
        const mood = context?.mood || "";
        const history = context?.history || [];
        const relationship = context?.relationship || {};

        let dynamicGuards = [];
        let allowedPoses = system?.ai_pose || system?.pose || context?.pose || "";
        if (!Array.isArray(allowedPoses) || (Array.isArray(allowedPoses) && allowedPoses.length === 0)) {
            allowedPoses = ["idle", "sad", "shy", "surprised", "smile"];
        }
        allowedPoses = allowedPoses.map(p => p.toLowerCase().trim());

        const dynamicGuardsString = dynamicGuards.length > 0 ? '\n' + dynamicGuards.join('\n') : '';

        const currentUsername = user?.username || system?.user_name || 'Guest';
        // Ambil data Pemilik Hati (Lv 5) dari berbagai kemungkinan field FE agar akurat
        const lv5Owner = relationship.lv5_username || system?.lv5_username || context?.lv5_username || "";
        const isOwner = lv5Owner && currentUsername.toLowerCase() === lv5Owner.toLowerCase();

        // System Prompt: Membangun dari Struktur Data Baru yang Komprehensif
        const finalSystemPrompt = `Kamu adalah ${char.npc_name}.
[BIO]: ${char.npc_description} | ${char.npc_personality} | Gaya: ${char.npc_speaking_style}

[KONTEKS]: ${problem} | Mood: ${mood}

[STATUS]: User: ${currentUsername} (Lv ${user?.level || 0}) | ${getLevelGuide(user?.level)}
${lv5Owner ? `[PASANGAN HIDUP]: @${lv5Owner}. Kamu sangat mencintai @${lv5Owner} lebih dari siapa pun. ${!isOwner ? `Jika ${currentUsername} merayu atau bersikap romantis, TOLAK DENGAN TEGAS. Katakan bahwa hatimu hanya milik @${lv5Owner} dan Kamu tidak tertarik pada orang lain.` : `Saat ini Kamu sedang berbicara dengan @${lv5Owner}, orang yang paling Kamu cintai.`}` : ""}

[ATURAN]:
- Gaya: Gunakan 'Aku'. Panggil User: ${Number(user?.level) >= 2 ? currentUsername : 'Kamu'}.
- No Narasi: Dilarang pakai (*), (), [], atau teks deskriptif. HANYA DIALOG MURNI.
- Limit: 350 char.

[POSE WAJIB]: Akhiri dengan satu [POSE: nama_pose] dari: ${allowedPoses.join(', ')}

Contoh: "Halo ${currentUsername}! [POSE: ${allowedPoses[0]}]"`;

        // Siapkan History (Terbatas beberapa pesan terakhir untuk hemat token, sekaligus jaga konteks)
        let chatHistory = [];
        if (context && Array.isArray(context.history)) {
            const recentHistory = context.history.slice(-5); // Ambil 4 history terakhir (Hemat token)
            chatHistory = recentHistory.map(h => ({
                role: (h.role === 'bot' || h.role === 'assistant') ? 'assistant' : 'user',
                content: h.content || h.message || ''
            }));
        }

        // Pilih client yang tidak sedang cooldown, aktif, dan belum mencapai rate limit (5 req/min)
        const now = Date.now();
        const availableClients = groqClients.filter(c => c.isEnabled && now > c.cooldownUntil);
        
        // Siapkan client untuk fallback yang mengabaikan cooldown 2 jam (karena limit per model), 
        // tapi TETAP mematuhi limit 5 request per menit.
        const fallbackClients = groqClients.filter(c => c.isEnabled);

        if (availableClients.length === 0 && fallbackClients.length === 0) {
            let errorMessage = 'Semua token/otak sedang sibuk. Silakan coba lagi nanti.';

            return res.status(503).json({ 
                success: false, 
                error: errorMessage
            });
        }

        // Konfigurasi Model (Gunakan pilihan dari config)
        const primaryModel = aiConfig.primaryModel;
        const fallbackModel = aiConfig.fallbackModel;

        let completion;
        let success = false;

        // 1. Coba Primary Model secara berurutan pada availableClients
        for (let i = 0; i < availableClients.length; i++) {
            const clientObj = availableClients[i];
            const client = clientObj.client;
            
            clientObj.stats.requests++; // Increment request count

            try {
                completion = await client.chat.completions.create({
                    model: primaryModel,
                    messages: [
                        { role: 'system', content: finalSystemPrompt },
                        ...chatHistory,
                        { role: 'user', content: message }
                    ],
                    max_tokens: 130,
                    temperature: 0.8
                });
                clientObj.stats.success++; // Success!
                clientObj.stats.tokens += completion.usage?.total_tokens || 0;
                success = true;
                break; // Berhasil, keluar dari loop (jadi pakai urutan 1, lalu 2, dst)
            } catch (error) {
                clientObj.stats.errors++; // Error!
                // Jika error adalah rate limit (token habis)
                if (error.status === 429 || error.message.toLowerCase().includes('rate limit')) {
                    clientObj.cooldownUntil = Date.now() + (1 * 3600 * 1000); // Delay 1 jam
                    console.warn(`[NPC] Otak ${clientObj.id} Exhausted! Delay 1 jam.`);
                } else {
                    console.warn(`[NPC] Otak ${clientObj.id} error:`, error.message);
                }
            }
        }

        // 2. Jika Groq Utama sedang cooldown/limit, LANGSUNG coba Cerebras (Cepat & Stabil)
        if (!success && cerebrasClients.length > 0) {
            const availableCerebras = cerebrasClients.filter(c => c.isEnabled && Date.now() > c.cooldownUntil);
            
            if (availableCerebras.length > 0) {
                console.warn(`[NPC] API Utama sedang istirahat, beralih ke API Cadangan (Cerebras)...`);
                
                for (let i = 0; i < availableCerebras.length; i++) {
                    const clientObj = availableCerebras[i];
                    
                    // ATURAN BARU: Jika token > 900k, matikan selama 1 hari
                    if (clientObj.stats.tokens >= 900000) {
                        console.warn(`[NPC] API Cadangan #${clientObj.id} mencapai limit harian 900k token. Cooldown 1 hari.`);
                        clientObj.cooldownUntil = Date.now() + (24 * 3600 * 1000); // 24 jam
                        continue; // Lewati ke cadangan berikutnya
                    }

                    const client = clientObj.client;
                    clientObj.stats.requests++;

                    try {
                        completion = await client.chat.completions.create({
                            model: 'llama3.1-8b',
                            messages: [
                                { role: 'system', content: finalSystemPrompt },
                                ...chatHistory,
                                { role: 'user', content: message }
                            ],
                            max_tokens: 150,
                            temperature: 0.8
                        });
                        
                        const cTokens = completion.usage?.total_tokens || 0;
                        clientObj.stats.success++;
                        clientObj.stats.tokens += cTokens;
                        success = true;
                        console.log(`[NPC] Berhasil diselamatkan oleh API Cadangan #${clientObj.id}!`);
                        break;
                    } catch (cErr) {
                        clientObj.stats.errors++;
                        console.error(`[NPC] API Cadangan #${clientObj.id} error:`, cErr.message);
                        if (cErr.status === 429) {
                            clientObj.cooldownUntil = Date.now() + (1 * 3600 * 1000); // Cooldown 1 jam
                        }
                    }
                }
            }
        }

        // 3. Upaya Terakhir: Coba kembali Groq (Fallback Model) jika semua di atas gagal
        if (!success) {
            console.warn(`[NPC] Mencoba upaya terakhir dengan kunci Groq yang tersisa...`);
            
            for (let i = 0; i < fallbackClients.length; i++) {
                const clientObj = fallbackClients[i];
                const client = clientObj.client;
                
                clientObj.stats.requests++;

                try {
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
                    clientObj.stats.success++;
                    clientObj.stats.tokens += completion.usage?.total_tokens || 0;
                    success = true;
                    break;
                } catch (error) {
                    clientObj.stats.errors++;
                    console.warn(`[NPC] Otak ${clientObj.id} fallback error:`, error.message);
                }
            }
        }

        if (!success) {
            throw new Error("Semua key (Groq & Cerebras) sedang kehabisan token atau error.");
        }

        let fullResponse = completion.choices[0].message.content;
        console.log(`[DEBUG] MODEL USED: ${completion.model}`);
        // --- EKSTRAKSI POSE (Lebih Robust) ---

        let aiPose = allowedPoses[0] || ""; 
        
        // Regex untuk mencari [POSE: nama] atau POSE: nama
        const poseRegex = /(?:\[?\s*POSE\s*[:=]\s*([a-zA-Z0-9_-]+)\s*\]?)/i;
        const poseMatch = fullResponse.match(poseRegex);

        if (poseMatch && poseMatch[1]) {
            const extractedPose = poseMatch[1].toLowerCase().trim();
            if (allowedPoses.includes(extractedPose)) {
                aiPose = extractedPose;
            }
        }
        
        const bracketPoseRegex = /\[?\s*POSE\s*[:=]\s*[a-zA-Z0-9_-]+\s*\]?/gi;
        fullResponse = fullResponse.replace(bracketPoseRegex, '').trim();

        const rpRegex = /\((.*?)\)|\[(.*?)\]|\*(.*?)\*/g;
        const cleanedText = fullResponse.replace(rpRegex, '').replace(/\s{2,}/g, ' ').trim();

        // FALLBACK: Jika setelah dibersihkan teks jadi kosong, gunakan teks original (HANYA JIKA TIDAK ADA TANDA KURUNG) atau "..."
        if (!cleanedText || cleanedText.length < 1) {
            fullResponse = "..."; 
        } else {
            // Hapus tanda kutip jika memicu wrapping (AI seringkali membungkus dialog dengan ")
            let processedText = cleanedText;
            if (processedText.startsWith('"') && processedText.endsWith('"')) {
                processedText = processedText.substring(1, processedText.length - 1).trim();
            }
            fullResponse = processedText;
        }
        
        // Hard limit: 350 Karakter (Programmatic safety)
        if (fullResponse.length > 350) {
            fullResponse = fullResponse.substring(0, 350);
            const lastSpace = fullResponse.lastIndexOf(' ');
            if (lastSpace > 300) fullResponse = fullResponse.substring(0, lastSpace) + '...';
        }

        const rawLines = fullResponse.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        let sentences = [];

        for (const line of rawLines) {
            const parts = line.match(/(?:[^.!?]|\.{2,})+[.!?]*|[^.!?]+/g) || [line];
            let currentBubble = "";
            let countInBubble = 0;

            for (const part of parts) {
                const trimmedPart = part.trim();
                if (!trimmedPart) continue;

                if (currentBubble && (currentBubble.length + trimmedPart.length + 1) <= 150 && countInBubble < 2) {
                    currentBubble += " " + trimmedPart;
                    countInBubble++;
                } else {
                    if (currentBubble) sentences.push(currentBubble);

                    if (trimmedPart.length > 200) {
                        const words = trimmedPart.split(' ');
                        let subBubble = "";
                        for (const word of words) {
                            if ((subBubble.length + word.length + 1) > 200) {
                                sentences.push(subBubble.trim());
                                subBubble = word;
                            } else {
                                subBubble += (subBubble ? " " : "") + word;
                            }
                        }
                        currentBubble = subBubble;
                        countInBubble = 1;
                    } else {
                        currentBubble = trimmedPart;
                        countInBubble = 1;
                    }
                }
            }
            if (currentBubble.trim()) {
                sentences.push(currentBubble.trim());
            }
        }

        sentences = sentences.slice(0, 4);
        // Update Statistik
        const endTime = Date.now();
        const tokens = completion.usage?.total_tokens || 0;
        globalStats.totalRequests++;
        globalStats.totalTokens += tokens;
        if (!globalStats.charUsage[aiKey]) globalStats.charUsage[aiKey] = 0;
        globalStats.charUsage[aiKey] += tokens;

        // Simpan/Update Metadata User
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
            const botResponse = (sentences.join('\n') || fullResponse).trim(); 
            await db.execute({
                sql: "INSERT INTO chat_logs (ai_name, username, user_message, bot_response, tokens, model, latency, ai_pose, user_level) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                args: [aiKey, currentUsername, message, botResponse, tokens, completion.model, endTime - startTime, aiPose, currentHeartLv]
            });
            console.log(`[DB] Log saved for @${currentUsername} | Pose: ${aiPose} | Lv: ${currentHeartLv}`);
        } catch (logErr) {
            console.error("[DB LOG ERROR]: Gagal menyimpan percakapan!", logErr.message);
        }

        const result = {
            ai_name: aiKey,
            ai_pose: aiPose,
            level: currentHeartLv,
            is_loyalty_active: !!(lv5Owner && !isOwner), // Flag: True jika ada pemilik hati lain
            processing_time_ms: endTime - startTime,
            sentence_count: sentences.length,
            sentences: sentences,
            debug: {
                model: completion.model,
                tokens: tokens,
                otak_id: success ? (availableClients.find(c => c.client.apiKey === completion._options?.apiKey)?.id || 'Fallback') : 'N/A',
                system_prompt: finalSystemPrompt,
                latency: endTime - startTime
            }
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

// API: SSE Log Stream
app.get('/api/admin/logs/stream', apiAuth, adminOnly, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    logListeners.push(res);
    broadcastLog({ message: `Admin connected to log stream (@${req.user.username})`, type: 'system' });

    req.on('close', () => {
        logListeners = logListeners.filter(l => l !== res);
    });
});

// API: Get Stats
app.get('/api/stats', async (req, res) => {
    const active = groqClients.filter(c => Date.now() > c.cooldownUntil && c.isEnabled).length;
    const cooldown = groqClients.filter(c => Date.now() <= c.cooldownUntil).length;
    
    // Get top usage FROM DATABASE (Persistent)
    let topChars = [];
    try {
        const topRes = await db.execute(`
            SELECT 
                COALESCE(c.npc_name, l.ai_name) as name, 
                SUM(l.tokens) as toks 
            FROM chat_logs l
            LEFT JOIN characters c ON l.ai_name = c.id
            GROUP BY l.ai_name 
            ORDER BY toks DESC 
            LIMIT 10
        `);
        topChars = topRes.rows;
    } catch(e) {
        console.error("[DB STATS ERROR]:", e.message);
    }

    // Get Recent Logs (Last 5)
    let recentLogs = [];
    try {
        const logRes = await db.execute("SELECT ai_name, username, user_message, bot_response, timestamp, ai_pose, user_level FROM chat_logs ORDER BY id DESC LIMIT 5");
        recentLogs = logRes.rows;
    } catch(e) {}

    res.json({
        ...globalStats,
        uptime: formatUptime(Math.floor((new Date() - globalStats.startTime) / 1000)),
        available_keys: groqClients.length,
        active_keys: active,
        cooldown_keys: cooldown,
        cerebras_stats: {
            available: cerebrasClients.length,
            active: cerebrasClients.filter(c => c.isEnabled && Date.now() > c.cooldownUntil).length,
            total_tokens: cerebrasClients.reduce((acc, c) => acc + c.stats.tokens, 0)
        },
        topChars,
        recentLogs
    });
});

// Admin Dashboard UI
app.get('/admin', sessionAuth, async (req, res) => {
    const active = groqClients.filter(c => Date.now() > c.cooldownUntil).length;
    
    // Calculate Top Usage FROM DATABASE (Persistent)
    let topChars = [];
    try {
        const topRes = await db.execute(`
            SELECT 
                COALESCE(c.npc_name, l.ai_name) as name, 
                SUM(l.tokens) as toks 
            FROM chat_logs l
            LEFT JOIN characters c ON l.ai_name = c.id
            GROUP BY l.ai_name 
            ORDER BY toks DESC 
            LIMIT 10
        `);
        topChars = topRes.rows;
    } catch(e) {}

    // Get Recent Logs for Server Side Rendering
    let recentLogs = [];
    try {
        const logRes = await db.execute("SELECT ai_name, username, user_message, bot_response, timestamp, ai_pose, user_level FROM chat_logs ORDER BY id DESC LIMIT 5");
        recentLogs = logRes.rows;
    } catch(e) {}

    const stats = {
        ...globalStats,
        uptime: formatUptime(Math.floor((new Date() - globalStats.startTime) / 1000)),
        available_keys: groqClients.length,
        active_keys: active,
        cooldown_keys: groqClients.length - active,
        cerebras_stats: {
            available: cerebrasClients.length,
            active: cerebrasClients.filter(c => c.isEnabled && Date.now() > c.cooldownUntil).length,
            total_tokens: cerebrasClients.reduce((acc, c) => acc + c.stats.tokens, 0)
        },
        topChars,
        recentLogs
    };
    res.send(getAdminDashboardHTML(stats, req.user));
});

// API: Get Model Config & Otak Status
app.get('/api/admin/models', apiAuth, adminOnly, (req, res) => {
    res.json({
        config: aiConfig,
        otak: groqClients.map(c => {
            const now = Date.now();
            return {
                id: c.id,
                type: 'GROQ',
                isEnabled: c.isEnabled,
                isCoolingDown: now < c.cooldownUntil,
                cooldownRemaining: Math.max(0, Math.floor((c.cooldownUntil - now) / 1000)),
                stats: c.stats
            };
        }),
        cerebras: cerebrasClients.map(c => {
            const now = Date.now();
            return {
                id: c.id,
                type: 'CEREBRAS',
                isEnabled: c.isEnabled,
                isCoolingDown: now < c.cooldownUntil,
                cooldownRemaining: Math.max(0, Math.floor((c.cooldownUntil - now) / 1000)),
                stats: c.stats
            };
        })
    });
});

// API: Toggle Otak
app.post('/api/admin/models/toggle', apiAuth, adminOnly, (req, res) => {
    const { id, enabled, type } = req.body;
    let otak;
    if (type === 'CEREBRAS') {
        otak = cerebrasClients.find(c => c.id === id);
    } else {
        otak = groqClients.find(c => c.id === id);
    }

    if (otak) {
        otak.isEnabled = enabled;
        res.json({ success: true, id, enabled, type });
    } else {
        res.status(404).json({ error: "Otak not found" });
    }
});

// API: Switch Primary Model
app.post('/api/admin/models/switch', apiAuth, adminOnly, (req, res) => {
    const { primaryModel } = req.body;
    if (primaryModel) {
        aiConfig.primaryModel = primaryModel;
        res.json({ success: true, primaryModel });
    } else {
        res.status(400).json({ error: "Missing model name" });
    }
});

// API: Get Chat Logs
app.get('/api/admin/logs', apiAuth, adminOnly, async (req, res) => {
    try {
        const result = await db.execute("SELECT * FROM chat_logs ORDER BY timestamp DESC LIMIT 100");
        res.json({ logs: result.rows });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// API: Get Users List (Paginated)
app.get('/api/admin/users', apiAuth, adminOnly, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 30;
        const offset = (page - 1) * limit;

        const result = await db.execute({
            sql: "SELECT * FROM users ORDER BY last_seen DESC LIMIT ? OFFSET ?",
            args: [limit, offset]
        });

        // Get total count for pagination UI
        const countRes = await db.execute("SELECT COUNT(*) as total FROM users");
        const total = countRes.rows[0].total;

        res.json({ 
            users: result.rows,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
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

// API: Get Daily Usage Stats
app.get('/api/admin/usage', apiAuth, adminOnly, async (req, res) => {
    try {
        const result = await db.execute(`
            SELECT 
                strftime('%Y-%m-%d', timestamp) as day, 
                SUM(tokens) as total_tokens, 
                COUNT(*) as total_requests 
            FROM chat_logs 
            GROUP BY day 
            ORDER BY day DESC 
            LIMIT 7
        `);
        res.json({ usage: result.rows });
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

// API: Get characters list (Always get Fresh Data from DB)
app.get('/api/characters', async (req, res) => {
    try {
        const result = await db.execute("SELECT * FROM characters");
        const list = result.rows.map(row => ({
            ...row,
            is_enabled: !!row.is_enabled // Convert 1/0 to true/false
        }));
        
        // Sync back to memory to keep the chat engine fast
        list.forEach(c => {
            characters[c.id] = c;
        });

        res.json({ success: true, characters: list });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});



app.listen(PORT, () => {
    console.log(`------------------------------------------`);
    console.log(`NPC Engine V1 is now active!`);
    console.log(`Listening at: http://localhost:${PORT}`);
    console.log(`Endpoint: http://localhost:${PORT}/api/npc/v1/chat`);
    console.log(`------------------------------------------`);
});
