const fs = require('fs');
const path = require('path');
const { createClient } = require('@libsql/client');
require('dotenv').config();

const db = createClient({
    url: process.env.TURSO_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
});

async function sync() {
    try {
        const jsonPath = path.join(__dirname, 'characters.json');
        const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
        
        console.log("Syncing characters to Turso...");
        
        for (const id in jsonData) {
            const c = jsonData[id];
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
                args: [id, c.npc_name, c.npc_description, c.npc_personality, c.npc_speaking_style, c.world_setting, c.language || 'id', 1]
            });
            console.log(`- Synced character: ${id}`);
        }
        
        console.log("Sync complete!");
        process.exit(0);
    } catch (e) {
        console.error("Sync failed:", e.message);
        process.exit(1);
    }
}

sync();
