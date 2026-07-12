const express = require('express');
const {
    normalizeAllowedPoses,
    buildSystemPrompt
} = require('../prompt');
const { parseJsonResponse } = require('../parser');
const { validateChatInput } = require('../guards/input_guard');
const { validatePrompt, logSuspiciousActivity } = require('../guards/prompt_guard');

function createChatRoutes({ db, characters, providers, globalStats }) {
    const router = express.Router();

    router.post('/api/npc/v1/chat', async (req, res) => {
        const startTime = Date.now();
        let isAdminCaller = false;
        try {
            if (req.signedCookies && req.signedCookies.user) {
                const parsed = JSON.parse(req.signedCookies.user);
                isAdminCaller = parsed && parsed.role === 'admin';
            }
        } catch (e) { /* ignore */ }
        try {
            const { user, message, context: rawContext, contex: rawContex, system } = req.body;
            const context = rawContext || rawContex;
            
            // SECURITY: Validate and sanitize all input before processing
            const validationResult = validateChatInput({
                user,
                message,
                context,
                system
            });
            
            if (!validationResult.valid) {
                // Log suspicious activity
                const username = user?.username || system?.user_name || 'Guest';
                logSuspiciousActivity({
                    username,
                    reason: validationResult.reason,
                    threat: validationResult.threat,
                    details: validationResult.details
                });
                
                // Return user-friendly error without revealing security details
                return res.status(400).json({
                    success: false,
                    error: 'Input contains invalid or suspicious content. Please rephrase your message.',
                    code: 'INVALID_INPUT'
                });
            }
            
            // Use sanitized values from validation
            const sanitizedUser = validationResult.sanitized.user || user;
            const sanitizedMessage = validationResult.sanitized.message;
            const sanitizedContext = validationResult.sanitized.context || {};
            let currentUsername = validationResult.sanitized.username || 'Guest';

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

                const banDebug = {
                    model: "BLOCKED",
                    tokens: 0,
                    otak_id: "BAN-SYSTEM",
                    latency: Date.now() - startTime
                };
                if (isAdminCaller) banDebug.system_prompt = "USER BANNED";

                return res.json({
                    ai_name: system?.ai_name || "NPC",
                    ai_pose: "sad",
                    sentences: [banMsg],
                    debug: banDebug
                });
            }

            if (!sanitizedMessage) return res.status(400).json({ success: false, error: 'Message is required' });

            const aiKey = (system && system.ai_name) ? system.ai_name.toLowerCase() : 'alya';
            const char = characters[aiKey] || characters['alya'];

            if (!char || char.is_enabled === false) {
                return res.status(404).json({ success: false, error: `Character '${aiKey}' not found or disabled.` });
            }

            const allowedPoses = normalizeAllowedPoses(system, sanitizedContext);
            const { staticSystemPrompt, dynamicUserContent, lv5Owner, isOwner } = buildSystemPrompt({
                char,
                currentUsername,
                user: sanitizedUser,
                context: sanitizedContext,
                system,
                allowedPoses,
                history: sanitizedContext?.history,
                message: sanitizedMessage
            });

            // SECURITY: Validate final prompt before sending to AI
            const promptValidation = validatePrompt({
                staticSystemPrompt,
                dynamicUserContent
            });
            
            if (!promptValidation.valid) {
                logSuspiciousActivity({
                    username: currentUsername,
                    reason: promptValidation.reason,
                    threat: promptValidation.threat
                });
                
                return res.status(400).json({
                    success: false,
                    error: 'Request contains invalid content structure.',
                    code: 'INVALID_PROMPT'
                });
            }

            const cacheKey = `npc-${aiKey}-lv${Number(sanitizedUser?.level) || 0}`;

            const { completion, usedProvider, usedClientId } = await providers.createChatCompletion({
                staticSystemPrompt,
                dynamicUserContent,
                cacheKey
            });

            console.log(`[DEBUG] MODEL USED: ${completion.model}`);

            const usageCheck = completion.usage || {};
            const cachedCheck = usageCheck.prompt_tokens_details?.cached_tokens || 0;
            if (cachedCheck > 0) {
                console.log(`[CACHE HIT] ${cachedCheck}/${usageCheck.prompt_tokens} prompt tokens cached (${Math.round(cachedCheck / usageCheck.prompt_tokens * 100)}%) | key: ${cacheKey}`);
            } else {
                console.log(`[CACHE MISS] 0/${usageCheck.prompt_tokens || 0} cached | key: ${cacheKey}`);
            }

            const rawResponse = completion.choices[0].message.content;

            let aiPose = allowedPoses[0];
            let fullResponse = '';
            let sentences = [];

            // Attempt 1: parse response pertama
            let firstParseOk = false;
            try {
                const r = parseJsonResponse(rawResponse, allowedPoses);
                sentences = r.sentences;
                aiPose = r.aiPose;
                fullResponse = sentences.join(' ');
                firstParseOk = sentences.length > 0;
            } catch (parseErr) {
                console.error('[JSON PARSE ERROR] Attempt 1:', parseErr.message);
            }

            // Attempt 2: retry ke AI jika sentences kosong
            if (!firstParseOk) {
                console.warn('[RETRY] Sentences kosong atau parse gagal, mencoba ulang ke AI...');
                try {
                    const { completion: retryCompletion } = await providers.createChatCompletion({
                        staticSystemPrompt,
                        dynamicUserContent
                    });
                    const retryRaw = retryCompletion.choices[0].message.content;
                    const r = parseJsonResponse(retryRaw, allowedPoses);
                    sentences = r.sentences;
                    aiPose = r.aiPose;
                    fullResponse = sentences.join(' ');
                } catch (retryErr) {
                    console.error('[RETRY ERROR]:', retryErr.message);
                }
            }

            // Fallback final: jangan kirim kosong
            if (sentences.length === 0) {
                sentences = ['...'];
                fullResponse = '...';
            }

            const endTime = Date.now();
            const usage = completion.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
            const tokens = usage.total_tokens || 0;
            const cachedTokens = usage.prompt_tokens_details?.cached_tokens || 0;
            globalStats.totalRequests++;
            globalStats.totalTokens += tokens;
            globalStats.totalPromptTokens += usage.prompt_tokens || 0;
            globalStats.totalCompletionTokens += usage.completion_tokens || 0;
            globalStats.totalCachedTokens += cachedTokens;
            if (cachedTokens > 0) {
                const modelKey = completion.model || 'unknown';
                if (!globalStats.cachedByModel[modelKey]) globalStats.cachedByModel[modelKey] = 0;
                globalStats.cachedByModel[modelKey] += cachedTokens;
            }
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
                    sql: "INSERT INTO chat_logs (ai_name, username, user_message, bot_response, tokens, prompt_tokens, completion_tokens, model, provider, latency, ai_pose, user_level) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    args: [aiKey, currentUsername, sanitizedMessage, botResponse, tokens, usage.prompt_tokens || 0, usage.completion_tokens || 0, completion.model, usedProvider, endTime - startTime, aiPose, currentHeartLv]
                });
                console.log(`[DB] Log saved for @${currentUsername} | Pose: ${aiPose} | Lv: ${currentHeartLv}`);
            } catch (logErr) {
                console.error("[DB LOG ERROR]: Gagal menyimpan percakapan!", logErr.message);
            }

            const debugPayload = {
                model: completion.model,
                tokens,
                otak_id: usedProvider === 'FALLBACK' ? 'FALLBACK' : `${usedProvider} #${usedClientId}`,
                latency: endTime - startTime
            };
            if (isAdminCaller) debugPayload.system_prompt = staticSystemPrompt;

            const result = {
                ai_name: aiKey,
                ai_pose: aiPose,
                level: currentHeartLv,
                is_loyalty_active: !!(lv5Owner && !isOwner),
                processing_time_ms: endTime - startTime,
                sentence_count: sentences.length,
                sentences,
                debug: debugPayload
            };

            console.log(`[NPC] Name: ${char.npc_name} | Lv: ${currentHeartLv} | Sentences: ${sentences.length} | Tokens: ${tokens}${cachedTokens > 0 ? ' (cached: ' + cachedTokens + ')' : ''} | ${endTime - startTime}ms`);
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
