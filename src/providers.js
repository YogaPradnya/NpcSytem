const Groq = require('groq-sdk');
const Cerebras = require('@cerebras/cerebras_cloud_sdk');
const OpenAI = require('openai');

const aiConfig = {
    primaryModel: 'meta-llama/Meta-Llama-3.1-8B-Instruct',
    fallbackModel: 'llama-3.1-8b-instant',
    groqFallbackModel: 'llama-3.1-8b-instant',
    cerebrasFallbackModel: 'llama3.1-8b',
    maxTokens: 80,
    temperature: 0.8
};

function makeStats() {
    return {
        requests: 0,
        success: 0,
        errors: 0,
        tokens: 0,
        prompt_tokens: 0,
        completion_tokens: 0
    };
}

function collectKeys(prefix, count) {
    return Array.from({ length: count }, (_, index) => {
        const suffix = index === 0 ? '' : `_${index + 1}`;
        return process.env[`${prefix}${suffix}`];
    }).filter(Boolean);
}

function addUsageStats(clientObj, completion) {
    const usage = completion.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    clientObj.stats.tokens += usage.total_tokens || 0;
    clientObj.stats.prompt_tokens += usage.prompt_tokens || 0;
    clientObj.stats.completion_tokens += usage.completion_tokens || 0;
}

function isRateLimit(error) {
    const message = String(error?.message || '').toLowerCase();
    return error?.status === 429 || message.includes('rate limit');
}

const FALLBACK_RPM_LIMIT = Number(process.env.FALLBACK_API_RPM_LIMIT || 30);
const RPM_WINDOW_MS = 60 * 1000;

function makeClientState(extra = {}) {
    return {
        cooldownUntil: 0,
        isEnabled: true,
        requestTimestamps: [],
        stats: makeStats(),
        ...extra
    };
}

function pruneRequestWindow(clientObj, now = Date.now()) {
    clientObj.requestTimestamps = (clientObj.requestTimestamps || []).filter(ts => now - ts < RPM_WINDOW_MS);
}

function canUseClientByRpm(clientObj, limit = FALLBACK_RPM_LIMIT) {
    pruneRequestWindow(clientObj);
    return clientObj.requestTimestamps.length < limit;
}

function markClientRequest(clientObj) {
    pruneRequestWindow(clientObj);
    clientObj.requestTimestamps.push(Date.now());
}

function getRpmCooldownMs(clientObj, limit = FALLBACK_RPM_LIMIT) {
    pruneRequestWindow(clientObj);
    if (clientObj.requestTimestamps.length < limit) return 0;
    return Math.max(1000, RPM_WINDOW_MS - (Date.now() - clientObj.requestTimestamps[0]));
}

const groqClients = collectKeys('GROQ_API_KEY', 20).map((key, index) => ({
    id: index + 1,
    client: new Groq({ apiKey: key }),
    ...makeClientState()
}));

if (groqClients.length === 0) {
    console.warn("[NPC] Peringatan: Tidak ada API Key Utama yang ditemukan di .env!");
}

const cerebrasClients = collectKeys('CEREBRAS_API_KEY', 20).map((key, index) => ({
    id: index + 1,
    client: new Cerebras({ apiKey: key }),
    ...makeClientState()
}));

const deepInfraClients = collectKeys('DEEPINFRA_API_KEY', 5).map((key, index) => ({
    id: index + 1,
    client: new OpenAI({
        apiKey: key,
        baseURL: 'https://api.deepinfra.com/v1/openai',
    }),
    ...makeClientState()
}));

if (deepInfraClients.length === 0) {
    console.warn("[NPC] Peringatan: Tidak ada API Key DeepInfra Utama yang ditemukan di .env!");
}

let deepinfraBillingData = null;
let deepinfraAccountData = null;
let billingInterval = null;
let dailyResetInterval = null;
let lastResetDate = new Date().getDate();

async function fetchDeepInfraBilling() {
    const apiKey = process.env.DEEPINFRA_API_KEY;
    if (!apiKey) return;
    try {
        const now = new Date();
        const period = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}`;
        const urlBilling = `https://api.deepinfra.com/payment/usage/tokens?from=${period}`;
        const urlAccount = `https://api.deepinfra.com/payment/checklist`;

        const [resB, resA] = await Promise.all([
            fetch(urlBilling, { headers: { 'Authorization': `Bearer ${apiKey}` } }),
            fetch(urlAccount, { headers: { 'Authorization': `Bearer ${apiKey}` } })
        ]);

        if (resB.ok) deepinfraBillingData = await resB.json();
        if (resA.ok) deepinfraAccountData = await resA.json();
    } catch (e) {
        console.error("[DEEPINFRA SYNC ERROR]:", e.message);
    }
}

function startDeepInfraBillingSync() {
    if (billingInterval) return;
    billingInterval = setInterval(fetchDeepInfraBilling, 300000);
    fetchDeepInfraBilling();
}

function startDailyStatsReset() {
    if (dailyResetInterval) return;
    dailyResetInterval = setInterval(() => {
        const now = new Date();
        if (now.getDate() !== lastResetDate) {
            console.log("[SYSTEM] Reset statistik harian untuk semua otak...");
            [...deepInfraClients, ...groqClients, ...cerebrasClients].forEach(c => {
                c.stats = makeStats();
                c.cooldownUntil = 0;
            });
            lastResetDate = now.getDate();
        }
    }, 1000 * 60 * 15);
}

function getStatsSummary(clients) {
    return {
        available: clients.length,
        active: clients.filter(c => c.isEnabled && Date.now() > c.cooldownUntil).length,
        requests: clients.reduce((acc, c) => acc + c.stats.requests, 0),
        success: clients.reduce((acc, c) => acc + c.stats.success, 0),
        errors: clients.reduce((acc, c) => acc + c.stats.errors, 0),
        total_tokens: clients.reduce((acc, c) => acc + c.stats.tokens, 0),
        prompt_tokens: clients.reduce((acc, c) => acc + c.stats.prompt_tokens, 0),
        completion_tokens: clients.reduce((acc, c) => acc + c.stats.completion_tokens, 0)
    };
}

function getProviderStats() {
    return {
        deepinfra_stats: getStatsSummary(deepInfraClients),
        groq_stats: getStatsSummary(groqClients),
        cerebras_stats: getStatsSummary(cerebrasClients),
        deepinfra_billing: deepinfraBillingData,
        deepinfra_account: deepinfraAccountData
    };
}

function serializeClient(clientObj, type) {
    const now = Date.now();
    return {
        id: clientObj.id,
        type,
        isEnabled: clientObj.isEnabled,
        isCoolingDown: now < clientObj.cooldownUntil,
        cooldownRemaining: Math.max(0, Math.floor((clientObj.cooldownUntil - now) / 1000)),
        rpmUsed: (clientObj.requestTimestamps || []).filter(ts => now - ts < RPM_WINDOW_MS).length,
        rpmLimit: type === 'GROQ' || type === 'CEREBRAS' ? FALLBACK_RPM_LIMIT : null,
        stats: clientObj.stats
    };
}

function getModelsStatus() {
    return {
        config: aiConfig,
        deepinfra: deepInfraClients.map(c => serializeClient(c, 'DEEPINFRA')),
        otak: groqClients.map(c => serializeClient(c, 'GROQ')),
        cerebras: cerebrasClients.map(c => serializeClient(c, 'CEREBRAS'))
    };
}

function setPrimaryModel(primaryModel) {
    aiConfig.primaryModel = primaryModel;
}

function updateModelConfig(config = {}) {
    if (typeof config.primaryModel === 'string' && config.primaryModel.trim()) {
        aiConfig.primaryModel = config.primaryModel.trim();
    }
    if (typeof config.fallbackModel === 'string' && config.fallbackModel.trim()) {
        aiConfig.fallbackModel = config.fallbackModel.trim();
    }
    if (typeof config.groqFallbackModel === 'string' && config.groqFallbackModel.trim()) {
        aiConfig.groqFallbackModel = config.groqFallbackModel.trim();
    }
    if (typeof config.cerebrasFallbackModel === 'string' && config.cerebrasFallbackModel.trim()) {
        aiConfig.cerebrasFallbackModel = config.cerebrasFallbackModel.trim();
    }
    if (config.maxTokens !== undefined) {
        const maxTokens = Number(config.maxTokens);
        if (Number.isFinite(maxTokens) && maxTokens >= 32 && maxTokens <= 2048) {
            aiConfig.maxTokens = Math.floor(maxTokens);
        }
    }
    if (config.temperature !== undefined) {
        const temperature = Number(config.temperature);
        if (Number.isFinite(temperature) && temperature >= 0 && temperature <= 2) {
            aiConfig.temperature = Number(temperature.toFixed(2));
        }
    }
    return { ...aiConfig };
}

function findClient(type, id) {
    if (type === 'CEREBRAS') return cerebrasClients.find(c => c.id === id);
    if (type === 'DEEPINFRA') return deepInfraClients.find(c => c.id === id);
    return groqClients.find(c => c.id === id);
}

function toggleClient(type, id, enabled) {
    const clientObj = findClient(type, id);
    if (!clientObj) return null;
    clientObj.isEnabled = enabled;
    return clientObj;
}

async function tryClients({ clients, providerName, model, messages, cooldownMs, skipClient }) {
    for (const clientObj of clients) {
        const rpmLimited = providerName === 'GROQ' || providerName === 'CEREBRAS' || providerName === 'FALLBACK';
        if (rpmLimited && !canUseClientByRpm(clientObj)) {
            clientObj.cooldownUntil = Date.now() + getRpmCooldownMs(clientObj);
            continue;
        }

        clientObj.stats.requests++;
        if (rpmLimited) markClientRequest(clientObj);
        try {
            const completion = await clientObj.client.chat.completions.create({
                model,
                messages,
                max_tokens: aiConfig.maxTokens,
                temperature: aiConfig.temperature
            });
            clientObj.stats.success++;
            addUsageStats(clientObj, completion);
            return {
                completion,
                usedProvider: providerName,
                usedClientId: clientObj.id
            };
        } catch (error) {
            clientObj.stats.errors++;
            if (isRateLimit(error)) {
                clientObj.cooldownUntil = Date.now() + cooldownMs;
                if (providerName === 'DEEPINFRA') {
                    console.warn(`[NPC] DeepInfra #${clientObj.id} Limit! Cooldown 5m.`);
                }
            } else if (providerName === 'DEEPINFRA') {
                console.warn(`[NPC] DeepInfra #${clientObj.id} Error:`, error.message);
            }
        }
    }
    return null;
}

async function createChatCompletion({ finalSystemPrompt, chatHistory, message }) {
    const messages = [
        { role: 'system', content: finalSystemPrompt },
        ...chatHistory,
        { role: 'user', content: message }
    ];

    const now = Date.now();
    const availableDeepInfra = deepInfraClients.filter(c => c.isEnabled && now > c.cooldownUntil);
    const availableGroq = groqClients.filter(c => c.isEnabled && now > c.cooldownUntil && canUseClientByRpm(c));
    const availableCerebras = cerebrasClients.filter(c => c.isEnabled && now > c.cooldownUntil && canUseClientByRpm(c));
    const fallbackClients = groqClients.filter(c => c.isEnabled && canUseClientByRpm(c));

    if (availableDeepInfra.length === 0 && availableGroq.length === 0 && availableCerebras.length === 0 && fallbackClients.length === 0) {
        const error = new Error('Semua token/otak sedang sibuk. Silakan coba lagi nanti.');
        error.statusCode = 503;
        throw error;
    }

    if (availableDeepInfra.length > 0) {
        console.log(`[NPC] Mencoba DeepInfra Utama (${availableDeepInfra.length} node)...`);
        const result = await tryClients({
            clients: availableDeepInfra,
            providerName: 'DEEPINFRA',
            model: aiConfig.primaryModel,
            messages,
            cooldownMs: 5 * 60 * 1000
        });
        if (result) return result;
    }

    if (availableGroq.length > 0) {
        console.warn(`[NPC] DeepInfra gagal/limit, beralih ke Groq...`);
        const result = await tryClients({
            clients: availableGroq,
            providerName: 'GROQ',
            model: aiConfig.groqFallbackModel,
            messages,
            cooldownMs: 30 * 60 * 1000
        });
        if (result) return result;
    }

    if (availableCerebras.length > 0) {
        console.warn(`[NPC] Groq gagal, beralih ke Cerebras...`);
        const result = await tryClients({
            clients: availableCerebras,
            providerName: 'CEREBRAS',
            model: aiConfig.cerebrasFallbackModel,
            messages,
            cooldownMs: 30 * 60 * 1000,
            skipClient: clientObj => {
                if (clientObj.stats.tokens < 900000) return false;
                clientObj.cooldownUntil = Date.now() + (24 * 3600 * 1000);
                return true;
            }
        });
        if (result) return result;
    }

    console.warn(`[NPC] Semua API Utama & Cadangan gagal, mencoba fallback terakhir...`);
    const fallbackResult = await tryClients({
        clients: fallbackClients,
        providerName: 'GROQ',
        model: aiConfig.fallbackModel,
        messages,
        cooldownMs: 30 * 60 * 1000
    });
    if (fallbackResult) {
        fallbackResult.usedProvider = 'FALLBACK';
        return fallbackResult;
    }

    throw new Error("Semua provider (DeepInfra, Groq, Cerebras) gagal merespon.");
}

module.exports = {
    aiConfig,
    deepInfraClients,
    groqClients,
    cerebrasClients,
    startDeepInfraBillingSync,
    startDailyStatsReset,
    getProviderStats,
    getModelsStatus,
    setPrimaryModel,
    updateModelConfig,
    toggleClient,
    createChatCompletion
};
