const fs = require('fs');
const path = require('path');
const { createClient } = require('@libsql/client');
const { stringifyHeartProfiles } = require('./heart_profiles');

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
                world_setting TEXT,
                character_background TEXT,
                language TEXT,
                heart_profiles TEXT,
                signature_style TEXT,
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

        try { await db.execute("ALTER TABLE chat_logs ADD COLUMN ai_pose TEXT"); } catch (e) {}
        try { await db.execute("ALTER TABLE chat_logs ADD COLUMN user_level INTEGER"); } catch (e) {}
        try { await db.execute("ALTER TABLE characters ADD COLUMN heart_profiles TEXT"); } catch (e) {}
        try { await db.execute("ALTER TABLE characters ADD COLUMN signature_style TEXT"); } catch (e) {}
        try { await db.execute("ALTER TABLE characters ADD COLUMN character_background TEXT"); } catch (e) {}

        await db.execute(`CREATE TABLE IF NOT EXISTS banned_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

        await db.execute(`CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        )`);

        await db.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('ban_message', 'Aku malas berbicara dengan kamu.')");

        console.log("[DB] Tables 'characters', 'chat_logs', 'users', 'banned_users', & 'settings' ready.");

        await db.execute(`
            CREATE TABLE IF NOT EXISTS users (
                username TEXT PRIMARY KEY,
                last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log("[DB] Tables 'characters', 'chat_logs', & 'users' ready.");

        const result = await db.execute("SELECT * FROM characters");
        if (result.rows.length > 0) {
            result.rows.forEach(row => {
                characters[row.id] = { ...row };
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
                await db.execute({
                    sql: "INSERT INTO characters (id, npc_name, npc_description, npc_personality, npc_speaking_style, world_setting, character_background, language, heart_profiles, signature_style, is_enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    args: [id, c.npc_name, c.npc_description, c.npc_personality, c.npc_speaking_style, c.world_setting, c.character_background || '', c.language || 'id', stringifyHeartProfiles(c.heart_profiles), c.signature_style || '', isEnabled]
                });
                characters[id] = { id, ...c, is_enabled: !!isEnabled };
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
