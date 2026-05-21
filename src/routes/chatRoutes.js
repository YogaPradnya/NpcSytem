const express = require('express');
const {
    normalizeAllowedPoses,
    buildSystemPrompt,
    buildChatHistory,
    processAIResponse
} = require('../prompt');

function createChatRoutes({ db, characters, providers, globalStats }) {
    const router = express.Router();

    router.post('/api/npc/v1/chat', async (req, res) => {
        const startTime = Date.now();
        try {
            const { user, message, context: rawContext, contex: rawContex, system } = req.body;
            const context = rawContext || rawContex;
            let currentUsername = user?.username || system?.user_name || 'Guest';
            currentUsername = currentUsername.toString().trim().replace(/^@/, '');

            const banCheck = await db.execute({
                sql: "SELECT * FROM banned_users WHERE LOWER(TRIM(username)) = LOWER(?)",
                args: [currentUsername]
            });

            if (banCheck.rows.length > 0) {
                const banMsgSetting = await db.execute({
                    sql: "SELECT value FROM settings WHERE key = 'ban_message'",
                    args: []
                });
                const banMsg = banMsgSetting.rows[0]?.value || "Aku malas berbicara dengan kamu.";

                return res.json({
                    ai_name: system?.ai_name || "NPC",
                    ai_pose: "sad",
                    sentences: [banMsg],
                    debug: {
                        model: "BLOCKED",
                        tokens: 0,
                        otak_id: "BAN-SYSTEM",
                        system_prompt: "USER BANNED",
                        latency: Date.now() - startTime
                    }
                });
            }

            if (!message) return res.status(400).json({ success: false, error: 'Message is required' });

            const aiKey = (system && system.ai_name) ? system.ai_name.toLowerCase() : 'alya';
            const char = characters[aiKey] || characters['alya'];

            if (!char || char.is_enabled === false) {
                return res.status(404).json({ success: false, error: `Character '${aiKey}' not found or disabled.` });
            }

            const allowedPoses = normalizeAllowedPoses(system, context);
            const { finalSystemPrompt, lv5Owner, isOwner } = buildSystemPrompt({
                char,
                currentUsername,
                user,
                context,
                system,
                allowedPoses,
                history: context?.history,
                message
            });
            const chatHistory = [];

            const { completion, usedProvider, usedClientId } = await providers.createChatCompletion({
                finalSystemPrompt,
                chatHistory,
                message
            });

            console.log(`[DEBUG] MODEL USED: ${completion.model}`);

            const rawResponse = completion.choices[0].message.content;

            let aiPose = allowedPoses[0];
            let fullResponse = '';
            let sentences = [];

            try {
                // Bersihkan markdown code block jika ada
                let cleaned = rawResponse.replace(/```json|```/gi, '').trim();

                // Jika tidak langsung parseable, coba extract JSON object via regex
                if (!cleaned.startsWith('{')) {
                    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
                    if (jsonMatch) cleaned = jsonMatch[0];
                }

                const parsed = JSON.parse(cleaned);

                sentences = Array.isArray(parsed.sentences)
                    ? parsed.sentences.filter(s => s && typeof s === 'string' && s.trim().length > 0)
                    : [];

                if (parsed.ai_pose && allowedPoses.includes(parsed.ai_pose.toLowerCase())) {
                    aiPose = parsed.ai_pose.toLowerCase();
                }

                fullResponse = sentences.join(' ');
            } catch (parseErr) {
                console.error('[JSON PARSE ERROR] Raw response tidak valid JSON:', parseErr.message);
                console.error('[RAW RESPONSE]:', rawResponse.substring(0, 300));
                // Jangan tampilkan raw JSON ke user — biarkan sentences kosong
                // Frontend harus handle gracefully jika sentences kosong
            }

            const endTime = Date.now();
            const usage = completion.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
            const tokens = usage.total_tokens || 0;
            globalStats.totalRequests++;
            globalStats.totalTokens += tokens;
            globalStats.totalPromptTokens += usage.prompt_tokens || 0;
            globalStats.totalCompletionTokens += usage.completion_tokens || 0;
            if (!globalStats.charUsage[aiKey]) globalStats.charUsage[aiKey] = 0;
            globalStats.charUsage[aiKey] += tokens;

            const currentHeartLv = Number(user?.level) || 0;

            try {
                await db.execute({
                    sql: "INSERT INTO users (username, last_seen) VALUES (?, CURRENT_TIMESTAMP) ON CONFLICT(username) DO UPDATE SET last_seen=CURRENT_TIMESTAMP",
                    args: [currentUsername]
                });
            } catch (uErr) {
                console.error("[DB USER SYNC ERROR]:", uErr.message);
            }

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
                is_loyalty_active: !!(lv5Owner && !isOwner),
                processing_time_ms: endTime - startTime,
                sentence_count: sentences.length,
                sentences,
                debug: {
                    model: completion.model,
                    tokens,
                    otak_id: usedProvider === 'FALLBACK' ? 'FALLBACK' : `${usedProvider} #${usedClientId}`,
                    system_prompt: finalSystemPrompt,
                    latency: endTime - startTime
                }
            };

            console.log(`[NPC] Name: ${char.npc_name} | Lv: ${currentHeartLv} | Sentences: ${sentences.length} | Tokens: ${tokens} | ${endTime - startTime}ms`);
            res.json(result);
        } catch (e) {
            console.error("[NPC V1 API ERROR]:", e.message);
            if (e.statusCode === 503) {
                return res.status(503).json({ success: false, error: e.message });
            }
            res.status(500).json({
                success: false,
                error: "Gagal mengambil balasan AI",
                message: e.message
            });
        }
    });

    return router;
}

module.exports = {
    createChatRoutes
};
