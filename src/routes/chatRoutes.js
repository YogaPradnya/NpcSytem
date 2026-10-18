const express = require('express');
const {
    normalizeAllowedPoses,
    buildSystemPrompt
} = require('../prompt');
const { parseJsonResponse } = require('../parser');
const { validateChatInput } = require('../guards/input_guard');
const { validatePrompt, logSuspiciousActivity } = require('../guards/prompt_guard');
const { checkLocalBadwords, setBadWords } = require('../utils/badwordFilter');
const { clampHeartLevel } = require('../heart_profiles');
const { recordChatActivity } = require('../services/leaderboardService');
const { claimLegacyUser, legacyIdFor } = require('../services/userIdentity');




// Cache daftar kata kasar custom dari settings DB (TTL singkat agar edit admin cepat berlaku).
let badwordsCacheExpiresAt = 0;
const BADWORDS_CACHE_TTL_MS = 60 * 1000;

function parseBadwordsRaw(raw) {
    if (!raw) return [];
    const text = String(raw).trim();
    if (!text) return [];
    if (text.startsWith('[')) {
        try {
            const arr = JSON.parse(text);
            if (Array.isArray(arr)) return arr.map(w => String(w || '').trim().toLowerCase()).filter(w => w.length > 0 && w.length <= 50).slice(0, 500);
        } catch (e) { /* fallback ke split manual */ }
    }
    return [...new Set(
        text.split(/[\n,;]+/).map(w => String(w || '').trim().toLowerCase()).filter(w => w.length > 0 && w.length <= 50)
    )].slice(0, 500);
}

async function refreshBadwordsCache(db) {
    if (Date.now() < badwordsCacheExpiresAt) return;
    badwordsCacheExpiresAt = Date.now() + BADWORDS_CACHE_TTL_MS;
    try {
        const setting = await db.execute({
            sql: "SELECT value FROM settings WHERE key = 'badwords'",
            args: []
        });
        const words = parseBadwordsRaw(setting.rows[0]?.value || '');
        // Kosong = pakai daftar default bawaan file badwordFilter.js
        setBadWords(words.length > 0 ? words : null);
    } catch (e) {
        // Gagal baca DB: tetap pakai daftar terakhir/default
    }
}




async function getBanMessage(db) {
    const banMsgSetting = await db.execute({
        sql: "SELECT value FROM settings WHERE key = 'ban_message'",
        args: []
    });
    return banMsgSetting.rows[0]?.value || "Aku malas berbicara dengan kamu.";
}

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

            // Identitas stabil untuk leaderboard/users: pakai ID akun dari client
            // bila dikirim; kalau tidak, jatuh ke identitas historis
            // 'legacy:<username>' (perilaku lama tetap jalan).
            const currentUserId = validationResult.sanitized.userId || legacyIdFor(currentUsername);

            // Cek ban: cocokkan ID akun (ikut rename) ATAU username apa adanya.
            const banCheck = await db.execute({
                sql: "SELECT * FROM banned_users WHERE user_id = ? OR LOWER(TRIM(username)) = LOWER(?)",
                args: [currentUserId, currentUsername]
            });

            if (banCheck.rows.length > 0) {
                const banMsg = await getBanMessage(db);

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

            // AUTO-BAN kata kasar: daftar diatur manual oleh admin (settings `badwords`).
            await refreshBadwordsCache(db);
            const toxicCheck = checkLocalBadwords(sanitizedMessage || '');
            if (toxicCheck.isToxic) {
                console.warn(`[AUTO-BAN] @${currentUsername} berkata kasar ('${toxicCheck.word}').`);
                // Admin yang tes via simulator tidak ikut ke-ban, hanya diblokir pesannya.
                if (!isAdminCaller) {
                    try {
                        await db.execute({
                            sql: "INSERT OR IGNORE INTO banned_users (user_id, username, reason) VALUES (?, ?, ?)",
                            args: [currentUserId, currentUsername, `auto-ban: kata kasar ('${toxicCheck.word}')`]
                        });
                    } catch (banErr) {
                        console.error("[AUTO-BAN DB ERROR]:", banErr.message);
                    }
                }

                const banMsg = await getBanMessage(db);
                const autoBanDebug = {
                    model: "BLOCKED",
                    tokens: 0,
                    otak_id: "AUTO-BAN",
                    latency: Date.now() - startTime
                };
                if (isAdminCaller) autoBanDebug.system_prompt = "AUTO-BAN: BADWORD";

                return res.json({
                    ai_name: system?.ai_name || "NPC",
                    ai_pose: "sad",
                    sentences: [banMsg],
                    debug: autoBanDebug
                });
            }



            const aiKey = (system && system.ai_name) ? String(system.ai_name).trim().toLowerCase() : 'alya';
            // Lookup toleran huruf-besar agar ID lama yang tercampur case tetap ketemu.
            // ID yang tersimpan TIDAK diubah; hanya cara pencariannya yang case-insensitive.
            const char = characters[aiKey]
                || Object.values(characters).find(c => String(c.id || '').toLowerCase() === aiKey)
                || characters['alya'];

            if (!char || char.is_enabled === false) {
                return res.status(404).json({ success: false, error: `Character '${aiKey}' not found or disabled.` });
            }

            // Satu sumber level: selalu dari sanitizedUser + clamp 0-5.
            // Dipakai untuk prompt, cacheKey, log DB, dan response.
            const effectiveHeartLv = clampHeartLevel(sanitizedUser?.level);
            // Simulator admin (dashboard) tidak boleh mengotori users/chat_logs produksi.
            // Flag hanya berlaku untuk pemanggil admin bertanda tangan, request luar diabaikan.
            const isSimulator = isAdminCaller && system?.simulator === true;

            const allowedPoses = normalizeAllowedPoses(system, sanitizedContext);
            const { staticSystemPrompt, dynamicUserContent, lv5Owner, isOwner } = buildSystemPrompt({
                char,
                currentUsername,
                user: { ...sanitizedUser, level: effectiveHeartLv },
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

            const cacheKey = `npc-${aiKey}-lv${effectiveHeartLv}`;
            const requestedModel = system?.model || req.body?.model || null;

            // Allowlist model untuk pemanggil publik (non-admin): cegah pemakaian
            // model mahal di luar daftar resmi. Admin/simulator tetap bebas.
            if (requestedModel && typeof requestedModel === 'string'
                && requestedModel.trim() && requestedModel.trim() !== 'auto' && !isAdminCaller) {
                const allowedModels = new Set();
                for (const m of providers.getAvailableModels()) {
                    if (m.id) allowedModels.add(m.id);
                    if (m.model) allowedModels.add(m.model);
                }
                if (!allowedModels.has(requestedModel.trim())) {
                    return res.status(400).json({
                        success: false,
                        error: 'Model tidak diizinkan.',
                        code: 'MODEL_NOT_ALLOWED'
                    });
                }
            }

            const { completion, usedProvider, usedClientId } = await providers.createChatCompletion({
                staticSystemPrompt,
                dynamicUserContent,
                cacheKey,
                requestedModel
            });

            console.log(`[DEBUG] MODEL USED: ${completion.model}`);

            const usageCheck = completion.usage || {};
            const cachedCheck = usageCheck.prompt_tokens_details?.cached_tokens || 0;
            if (cachedCheck > 0) {
                const promptTotal = usageCheck.prompt_tokens || 0;
                const pct = promptTotal > 0 ? Math.round(cachedCheck / promptTotal * 100) : 0;
                console.log(`[CACHE HIT] ${cachedCheck}/${promptTotal} prompt tokens cached (${pct}%) | key: ${cacheKey}`);
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
            let retryCompletion = null;
            if (!firstParseOk) {
                console.warn('[RETRY] Sentences kosong atau parse gagal, mencoba ulang ke AI...');
                try {
                    const { completion: retryRes } = await providers.createChatCompletion({
                        staticSystemPrompt,
                        dynamicUserContent,
                        cacheKey,
                        requestedModel
                    });
                    retryCompletion = retryRes;
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
            // Samakan atribusi: konten balasan berasal dari retry jika retry dipakai,
            // token dihitung dari SEMUA pemanggilan (awal + retry).
            const activeCompletion = retryCompletion || completion;
            const allUsages = [completion.usage || {}, retryCompletion?.usage || {}];
            const sumUsage = (key) => allUsages.reduce((a, u) => a + (u[key] || 0), 0);
            const usage = {
                prompt_tokens: sumUsage('prompt_tokens'),
                completion_tokens: sumUsage('completion_tokens'),
                total_tokens: sumUsage('total_tokens')
            };
            const tokens = usage.total_tokens || 0;
            const cachedTokens = allUsages.reduce((a, u) => a + (u.prompt_tokens_details?.cached_tokens || 0), 0);
            globalStats.totalRequests++;
            globalStats.totalTokens += tokens;
            globalStats.totalPromptTokens += usage.prompt_tokens || 0;
            globalStats.totalCompletionTokens += usage.completion_tokens || 0;
            globalStats.totalCachedTokens += cachedTokens;
            for (const comp of [completion, retryCompletion].filter(Boolean)) {
                const c = comp.usage?.prompt_tokens_details?.cached_tokens || 0;
                if (c > 0) {
                    const modelKey = comp.model || 'unknown';
                    if (!globalStats.cachedByModel[modelKey]) globalStats.cachedByModel[modelKey] = 0;
                    globalStats.cachedByModel[modelKey] += c;
                }
            }
            if (!globalStats.charUsage[aiKey]) globalStats.charUsage[aiKey] = 0;
            globalStats.charUsage[aiKey] += tokens;

            const currentHeartLv = effectiveHeartLv;

            // Simulator admin tidak ditulis ke users/chat_logs (token tetap dihitung di globalStats).
            if (!isSimulator) {
                // Klaim histori lama ('legacy:<username>') ke ID akun — hanya
                // berpengaruh sekali per nama, setelah itu baris legacy-nya habis.
                try {
                    const claimed = await claimLegacyUser(db, { userId: currentUserId, username: currentUsername });
                    if (claimed > 0) {
                        console.log(`[DB] Histori @${currentUsername} (${claimed} baris) diklaim ke user_id ${currentUserId}.`);
                    }
                } catch (claimErr) {
                    console.error("[DB CLAIM ERROR]:", claimErr.message);
                }

                try {
                    await db.execute({
                        sql: "INSERT INTO users (user_id, username, last_seen) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET username=excluded.username, last_seen=CURRENT_TIMESTAMP",
                        args: [currentUserId, currentUsername]
                    });
                } catch (uErr) {
                    console.error("[DB USER SYNC ERROR]:", uErr.message);
                }

                try {
                    const botResponse = (sentences.join('\n') || fullResponse).trim();
                    await db.execute({
                        sql: "INSERT INTO chat_logs (user_id, ai_name, username, user_message, bot_response, tokens, prompt_tokens, completion_tokens, model, provider, latency, ai_pose, user_level) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        args: [currentUserId, aiKey, currentUsername, sanitizedMessage, botResponse, tokens, usage.prompt_tokens || 0, usage.completion_tokens || 0, activeCompletion.model, usedProvider, endTime - startTime, aiPose, currentHeartLv]
                    });
                    console.log(`[DB] Log saved for @${currentUsername} | Pose: ${aiPose} | Lv: ${currentHeartLv}`);
                } catch (logErr) {
                    console.error("[DB LOG ERROR]: Gagal menyimpan percakapan!", logErr.message);
                }

                // Peringkat jam: akumulasi waktu aktif user (jeda < 10 menit dihitung).
                // Terpisah dari log di atas agar kegagalan tidak memblokir balasan chat.
                try {
                    await recordChatActivity(db, currentUserId, currentUsername);
                } catch (timeErr) {
                    console.error("[DB CHAT TIME ERROR]: Gagal memperbarui total jam chat!", timeErr.message);
                }
            } else {
                console.log(`[SIM] Skip DB log for simulator @${currentUsername} | Pose: ${aiPose} | Lv: ${currentHeartLv}`);
            }

            const debugPayload = {
                model: activeCompletion.model,
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
