const fs = require('fs');
const path = require('path');
const { createClient } = require('@libsql/client');
const { stringifyHeartProfiles, parseHeartProfiles } = require('./heart_profiles');
const { ensureUserIdentitySchema } = require('./services/userIdentity');

const db = createClient({
    url: process.env.TURSO_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
});

async function initDB(characters) {
    try {
        await db.execute(`
            CREATE TABLE IF NOT EXISTS characters (
                id TEXT PRIMARY KEY,
                npc_name TEXT,
                npc_description TEXT,
                npc_personality TEXT,
                npc_speaking_style TEXT,
                character_background TEXT,
                language TEXT,
                heart_profiles TEXT,
                signature_style TEXT,
                is_enabled INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await db.execute(`
            CREATE TABLE IF NOT EXISTS chat_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                ai_name TEXT,
                username TEXT,
                user_id TEXT,
                user_message TEXT,
                bot_response TEXT,
                tokens INTEGER,
                prompt_tokens INTEGER DEFAULT 0,
                completion_tokens INTEGER DEFAULT 0,
                model TEXT,
                provider TEXT,
                latency INTEGER,
                ai_pose TEXT,
                user_level INTEGER
            )
        `);

        try { await db.execute("ALTER TABLE chat_logs ADD COLUMN ai_pose TEXT"); } catch (e) {}
        try { await db.execute("ALTER TABLE chat_logs ADD COLUMN user_level INTEGER"); } catch (e) {}
        try { await db.execute("ALTER TABLE chat_logs ADD COLUMN provider TEXT"); } catch (e) {}
        try { await db.execute("ALTER TABLE chat_logs ADD COLUMN prompt_tokens INTEGER DEFAULT 0"); } catch (e) {}
        try { await db.execute("ALTER TABLE chat_logs ADD COLUMN completion_tokens INTEGER DEFAULT 0"); } catch (e) {}
        try { await db.execute("ALTER TABLE characters ADD COLUMN heart_profiles TEXT"); } catch (e) {}
        try { await db.execute("ALTER TABLE characters ADD COLUMN signature_style TEXT"); } catch (e) {}
        try { await db.execute("ALTER TABLE characters ADD COLUMN character_background TEXT"); } catch (e) {}
        try { await db.execute("ALTER TABLE characters ADD COLUMN created_at DATETIME"); } catch (e) {}
        try { await db.execute("UPDATE characters SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL"); } catch (e) {}

        await db.execute(`CREATE TABLE IF NOT EXISTS banned_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            user_id TEXT,
            reason TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
        // user_id: ban mengikuti ID akun (aman rename); diisi 'legacy:<nama>' oleh
        // ensureUserIdentitySchema() untuk baris lama/cadangan.
        try { await db.execute("ALTER TABLE banned_users ADD COLUMN reason TEXT"); } catch (e) {}

        await db.execute(`CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        )`);

        // users: satu baris per IDENTITAS (user_id) — username = nama terbaru,
        // last_seen = terakhir terlihat. ID akun dari client atau 'legacy:<nama>'
        // untuk data lama (lihat src/services/userIdentity.js).
        await db.execute(`
            CREATE TABLE IF NOT EXISTS users (
                user_id TEXT PRIMARY KEY,
                username TEXT,
                last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Peringkat jam: total detik obrolan aktif per user (dipelihara incremental
        // oleh chatRoutes; histori lama di-backfill sekali saat boot dari chat_logs).
        await db.execute(`
            CREATE TABLE IF NOT EXISTS user_chat_time (
                user_id TEXT PRIMARY KEY,
                username TEXT,
                total_seconds REAL DEFAULT 0,
                last_message_at DATETIME
            )
        `);

        // Skema identitas user_id (idempoten): tambah kolom chat_logs.user_id dan
        // bangun ulang tabel users / user_chat_time kuno (PK username) menjadi
        // PK user_id — nama yang beda huruf besar/kecil otomatis digabung.
        await ensureUserIdentitySchema(db, (m) => console.log(m));

        await db.execute("CREATE INDEX IF NOT EXISTS idx_chat_logs_username ON chat_logs(username)");
        await db.execute("CREATE INDEX IF NOT EXISTS idx_chat_logs_ai_name ON chat_logs(ai_name)");
        await db.execute("CREATE INDEX IF NOT EXISTS idx_banned_lower_username ON banned_users(username COLLATE NOCASE)");
        await db.execute("CREATE INDEX IF NOT EXISTS idx_chat_logs_user_id ON chat_logs(user_id)");
        await db.execute("CREATE INDEX IF NOT EXISTS idx_user_chat_time_leaderboard ON user_chat_time(total_seconds DESC, user_id ASC)");

        await db.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('ban_message', 'Aku malas berbicara dengan kamu.')");
        await db.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('badwords', '')");

        console.log("[DB] Tables 'characters', 'chat_logs', 'users', 'banned_users', & 'settings' ready.");

        const result = await db.execute("SELECT * FROM characters");
        if (result.rows.length > 0) {
            result.rows.forEach(row => {
                characters[row.id] = { ...row, heart_profiles: parseHeartProfiles(row.heart_profiles) };
            });
            console.log(`[DB] Loaded ${result.rows.length} characters from Turso.`);
            return;
        }

        const jsonPath = path.join(__dirname, '../characters.json');
        if (fs.existsSync(jsonPath)) {
            const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
            for (const id in jsonData) {
                const c = jsonData[id];
                const isEnabled = c.is_enabled !== undefined ? (c.is_enabled ? 1 : 0) : 1;
                const createdAt = c.created_at || new Date().toISOString();
                await db.execute({
                    sql: "INSERT INTO characters (id, npc_name, npc_description, npc_personality, npc_speaking_style, character_background, language, heart_profiles, signature_style, is_enabled, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    args: [id, c.npc_name, c.npc_description, c.npc_personality, c.npc_speaking_style, c.character_background || '', c.language || 'id', stringifyHeartProfiles(c.heart_profiles), c.signature_style || '', isEnabled, createdAt]
                });
                characters[id] = { id, ...c, is_enabled: !!isEnabled, created_at: createdAt };
            }
            console.log("[DB] Migrated data from characters.json to Turso.");
        }
    } catch (e) {
        console.error("[DB] Gagal inisialisasi database:", e.message);
    }
}

module.exports = {
    db,
    initDB
};
