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
    if (lv <= 0) return "[STATUS: ORANG ASING] - Sikap: Dingin/Sungkan, jaga jarak aman. Bicara: Sangat sopan, formal, tidak ada kontak emosional, sering ragu (...). Kamu merasa asing dengan orang ini.";
    if (lv === 1) return "[STATUS: KENALAN] - Sikap: Mulai santai tapi tetap waspada. Bicara: Ramah sewajarnya, tidak membicarakan hal pribadi. Masih ada sedikit kaku ('wall') dalam nada bicaramu.";
    if (lv === 2) return "[STATUS: TEMAN BIASA] - Sikap: Nyaman. Bicara: Mulai berani bercanda, SUDAH MULAI MEMANGGIL NAMA USER, nada bicara lebih luwes dan hangat.";
    if (lv === 3) return "[STATUS: TEMAN BAIK] - Sikap: Terbuka, peduli secara emosional. Bicara: Blistering (jujur), sering memanggil nama user, berani curhat tipis-tipis, selalu antusias.";
    if (lv === 4) return "[STATUS: SAHABAT DEKAT] - Sikap: Sangat percaya, protektif. Bicara: Manis, memanggil user dengan nama akrab, sering menggoda (teasing), merasa kehilangan saat user pergi.";
    return "[STATUS: ORANG TERSPESIAL] - Sikap: Penuh cinta, posesif manis. Bicara: Sangat akrab, bermanja-manja memanggil namanya, setiap kalimat mengandung rasa sayang.";
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
                latency INTEGER
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
    isEnabled: true,
    stats: {
        requests: 0,
        success: 0,
        errors: 0
    }
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

        // Extract struktur data baru
        const scene = context?.scene || {};
        const story = context?.story || {};
        const turnGuide = context?.turn_guide || {};
        const relationship = context?.relationship || {};
        const opening = context?.opening_narration || {};

        let dynamicGuards = [];
        if (story.avoid_reset_to_opening || turnGuide.avoid_resetting_to_opening) {
            dynamicGuards.push("- JANGAN mengulang konflik/peristiwa awal yang sudah berlalu. Jangan reset ke opener.");
        }
        if (turnGuide.on_track) {
            dynamicGuards.push("- Lanjutkan topik yang sedang berjalan secara natural.");
        }
        if (turnGuide.topic_shift) {
            dynamicGuards.push(`- Arahkan ucapan kembali dengan halus ke topik aktif: ${scene.active_topic || 'utama'}.`);
        }
        
        if (scene.scene_phase === 'closing' || story.story_beat_current === 'closing') {
            dynamicGuards.push("- Scene sudah mendekati closing. Balasan harus terasa menutup natural, BUKAN membuka konflik baru.");
        } else {
            dynamicGuards.push(`- Jangan mengubah masalah kecil menjadi drama besar jika story beat belum mendukung. Jangan buat lompatan emosi mendadak yang tidak sesuai state.`);
        }
        
        if (scene.allowed_npc_poses && scene.allowed_npc_poses.length > 0) {
            dynamicGuards.push(`- [Wajib Dipatuhi] Gesture tubuh dalam narasi tersirat/feeling pembicaraan: ${scene.allowed_npc_poses.join(', ')}`);
        }

        const dynamicGuardsString = dynamicGuards.length > 0 ? '\n' + dynamicGuards.join('\n') : '';

        // System Prompt: Membangun dari Struktur Data Baru yang Komprehensif
        const finalSystemPrompt = `Kamu adalah ${char.npc_name}.
[BIO & SIFAT]: ${char.npc_description} | Sifat: ${char.npc_personality} | Gaya Bicara: ${char.npc_speaking_style}
[DUNIA]: ${char.world_setting} | Lokasi: ${context?.location || 'Sekolah'} | Waktu: ${context?.time || getTimeOfDay()}

[LATAR AWAL CERITA] (Hanya Latar): ${opening.story_hook || ''} ${opening.micro_event_hook || ''}

[SITUASI SAAT INI (Kebenaran Utama)]:
- Ringkasan: ${story.current_scene_summary || ''}
- Fase Scene: ${scene.scene_phase || ''} | Beat: ${story.story_beat_current || ''}
- Emosi Berjalan: ${scene.current_emotion || ''}
- Arah Interaksi: ${scene.interaction_direction || ''}

[PANDUAN BALASAN TURN INI (Prioritas Tertinggi)]:
- Niat/Intent: ${turnGuide.reply_intent || scene.reply_intent || ''}
- Catatan Batasan: ${turnGuide.boundary_note || scene.boundary_note || ''}${dynamicGuardsString}

[STATUS HUBUNGAN DENGAN USER]:
User: ${user?.username} | Level Kedekatan: ${user?.level || 0} (${relationship.stage_label || getDefaultStageLabel(user?.level)})
${getLevelGuide(user?.level)}
Gaya bicara & keterbukaan-mu WAJIB sesuai urutan Level Kedekatan ini.

[ATURAN TEKNIS]:
- SANGAT PENTING: Kosa kata dan narasi bicaramu WAJIB 100% selaras dengan deskripsi [BIO & SIFAT], gaya bahasa, dan [DUNIA] yang ditetapkan! Sesuaikan juga cara reaksimu dengan Latar Event yang sedang berlangsung!
- TULISKAN EKSPRESI/AKSI FISIK dengan tanda kurung, misal: (tersipu malu) atau (menunduk).
- BICARALAH SEBAGAI KARAKTER FIKSI. DILARANG menggunakan kata 'Anda' dan 'saya'. Gunakan 'Aku' untuk dirimu. Untuk memanggil user, sangat biasakan memanggil namanya secara langsung (yaitu: ${user?.username}) jika sesuai dengan level kedekatan, atau bisa diselingi dengan 'Kamu/Kau'.
- HINDARI istilah religius atau kosa kata daerah yang tidak sesuai dengan budaya asli karakter (Contoh: jangan gunakan 'Alhamdulillah', 'Puji Tuhan', 'Insya Allah', dsb).
- Maksimal panjang total: 500 karakter.`;

        // Siapkan History (Terbatas beberapa pesan terakhir untuk hemat token, sekaligus jaga konteks)
        let chatHistory = [];
        if (context && Array.isArray(context.history)) {
            const recentHistory = context.history.slice(-5); // Ambil 5 history terakhir agar lebih nyambung
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
        selectedClientObj.stats.requests++; // Increment request count

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
                max_tokens: 130,
                temperature: 0.8
            });
            selectedClientObj.stats.success++; // Success!
        } catch (error) {
            selectedClientObj.stats.errors++; // Error!
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

        // --- EKSTRAKSI EKSPRESI & AKSI ---
        // Tangkap teks di dalam tanda () atau [] atau ** untuk dijadikan data terpisah
        const rpRegex = /[\(\[\*](.*?)[\)\]\*]/g;
        let extractedExpressions = [];
        let matchData;
        while ((matchData = rpRegex.exec(fullResponse)) !== null) {
            if (matchData[1] && matchData[1].trim().length > 0) {
                extractedExpressions.push(matchData[1].trim());
            }
        }
        
        // Hapus riwayat ekspresi dari balasan utamanya agar tidak merusak bubble percakapan clean text
        fullResponse = fullResponse.replace(rpRegex, '').replace(/\s{2,}/g, ' ').trim();
        
        // Hard limit: 500 Karakter (Programmatic safety)
        if (fullResponse.length > 500) {
            fullResponse = fullResponse.substring(0, 500);
            // Coba potong di spasi terakhir agar tidak terputus di tengah kata
            const lastSpace = fullResponse.lastIndexOf(' ');
            if (lastSpace > 400) fullResponse = fullResponse.substring(0, lastSpace) + '...';
        }

        // Pecah menjadi kalimat penggalan berdasar tanda baca agar tidak terpotong di tengah (Smart Split)
        const rawLines = fullResponse.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        let sentences = [];

        for (const line of rawLines) {
            // Jika satu baris utuh sudah di bawah 300 karakter, masukkan langsung sebagai 1 bubble
            if (line.length <= 300) {
                sentences.push(line);
                continue;
            }
            
            // Jika baris sangat panjang (> 300), coba pecah berdasarkan tanda baca (. ! ?)
            const parts = line.match(/[^.!?]+[.!?]*|[^.!?]+/g) || [line];
            let currentBubble = "";

            for (const part of parts) {
                // Jika digabung masih muat di 300 karakter, satukan
                if ((currentBubble.length + part.length + 1) <= 300) {
                    currentBubble += (currentBubble ? " " : "") + part.trim();
                } else {
                    // Jika sudah penuh, simpan yang ada dan mulai bubble baru
                    if (currentBubble) sentences.push(currentBubble.trim());
                    
                    // Jika satu kalimat saja sudah > 300 karakter (casuistik), pecah per kata (Emergency split)
                    if (part.length > 300) {
                        const words = part.split(' ');
                        let subBubble = "";
                        for (const word of words) {
                            if ((subBubble.length + word.length + 1) > 295) {
                                sentences.push(subBubble.trim());
                                subBubble = word;
                            } else {
                                subBubble += (subBubble ? " " : "") + word;
                            }
                        }
                        currentBubble = subBubble;
                    } else {
                        currentBubble = part.trim();
                    }
                }
            }
            if (currentBubble.trim()) {
                sentences.push(currentBubble.trim());
            }
        }

        sentences = sentences.slice(0, 4); // Tetap Maksimal 4 sentence sesuai rule

        // Update Statistik
        const endTime = Date.now();
        const tokens = completion.usage?.total_tokens || 0;
        globalStats.totalRequests++;
        globalStats.totalTokens += tokens;
        if (!globalStats.charUsage[aiKey]) globalStats.charUsage[aiKey] = 0;
        globalStats.charUsage[aiKey] += tokens;

        // Simpan/Update Metadata User
        const currentUsername = user?.username || system?.user_name || 'Guest';
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
            const botResponse = sentences.join('\n') || fullResponse; // Fallback ke teks mentah jika pecah kalimat gagal
            await db.execute({
                sql: "INSERT INTO chat_logs (ai_name, username, user_message, bot_response, tokens, model, latency) VALUES (?, ?, ?, ?, ?, ?, ?)",
                args: [aiKey, currentUsername, message, botResponse, tokens, completion.model, endTime - startTime]
            });
            console.log(`[DB] Log saved successfully for @${currentUsername}`);
        } catch (logErr) {
            console.error("[DB LOG ERROR]: Gagal menyimpan percakapan!", logErr.message);
        }

        const result = {
            ai_name: aiKey,
            level: currentHeartLv,
            model_used: completion.model,
            processing_time_ms: endTime - startTime,
            sentence_count: sentences.length,
            sentences: sentences,
            expressions: extractedExpressions // <-- Ekspresi karakter terpisah dari chat!
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
app.get('/api/stats', async (req, res) => {
    const active = groqClients.filter(c => Date.now() > c.cooldownUntil && c.isEnabled).length;
    const cooldown = groqClients.filter(c => Date.now() <= c.cooldownUntil).length;
    
    // Get top usage FROM DATABASE (Persistent)
    let topChars = [];
    try {
        const topRes = await db.execute("SELECT ai_name as name, SUM(tokens) as toks FROM chat_logs GROUP BY ai_name ORDER BY toks DESC LIMIT 5");
        topChars = topRes.rows;
    } catch(e) {
        console.error("[DB STATS ERROR]:", e.message);
    }

    // Get Recent Logs (Last 5)
    let recentLogs = [];
    try {
        const logRes = await db.execute("SELECT ai_name, username, user_message, bot_response, timestamp FROM chat_logs ORDER BY id DESC LIMIT 5");
        recentLogs = logRes.rows;
    } catch(e) {}

    res.json({
        ...globalStats,
        uptime: formatUptime(Math.floor((new Date() - globalStats.startTime) / 1000)),
        available_keys: groqClients.length,
        active_keys: active,
        cooldown_keys: cooldown,
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
        const topRes = await db.execute("SELECT ai_name as name, SUM(tokens) as toks FROM chat_logs GROUP BY ai_name ORDER BY toks DESC LIMIT 5");
        topChars = topRes.rows;
    } catch(e) {}

    // Get Recent Logs for Server Side Rendering
    let recentLogs = [];
    try {
        const logRes = await db.execute("SELECT ai_name, username, user_message, bot_response, timestamp FROM chat_logs ORDER BY id DESC LIMIT 5");
        recentLogs = logRes.rows;
    } catch(e) {}

    const stats = {
        ...globalStats,
        uptime: formatUptime(Math.floor((new Date() - globalStats.startTime) / 1000)),
        available_keys: groqClients.length,
        active_keys: active,
        cooldown_keys: groqClients.length - active,
        topChars,
        recentLogs
    };
    res.send(getAdminDashboardHTML(stats, req.user));
});

// API: Get Model Config & Otak Status
app.get('/api/admin/models', apiAuth, adminOnly, (req, res) => {
    res.json({
        config: aiConfig,
        otak: groqClients.map(c => ({
            id: c.id,
            isEnabled: c.isEnabled,
            isCoolingDown: Date.now() < c.cooldownUntil,
            cooldownRemaining: Math.max(0, Math.floor((c.cooldownUntil - Date.now()) / 1000)),
            stats: c.stats
        }))
    });
});

// API: Toggle Otak
app.post('/api/admin/models/toggle', apiAuth, adminOnly, (req, res) => {
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

// API: Get Users List
app.get('/api/admin/users', apiAuth, adminOnly, async (req, res) => {
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
