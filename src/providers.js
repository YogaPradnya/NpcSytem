const Groq = require('groq-sdk');
const Cerebras = require('@cerebras/cerebras_cloud_sdk');
const OpenAI = require('openai');

const DEFAULT_DEEPINFRA_MODEL = 'meta-llama/Meta-Llama-3.1-8B-Instruct';
const DEFAULT_DEEPINFRA_FALLBACK_MODEL = DEFAULT_DEEPINFRA_MODEL;
const DEFAULT_NOVITA_MODEL = 'meta-llama/llama-3.1-8b-instruct';

const deepInfraModelProfiles = {
    'meta-llama/Meta-Llama-3.1-8B-Instruct': { provider: 'deepinfra' },
    'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo': { provider: 'deepinfra' },
    'meta-llama/Llama-3.3-70B-Instruct-Turbo': { provider: 'deepinfra' },
    'mistralai/Mistral-Small-24B-Instruct-2501': { provider: 'deepinfra' },
    'Qwen/Qwen3.5-0.8B': { provider: 'deepinfra', supportsTemperature: false },
    'Qwen/Qwen2.5-7B-Instruct': { provider: 'deepinfra' },
    'Qwen/Qwen2.5-Coder-7B-Instruct': { provider: 'deepinfra' },
    'deepseek-ai/DeepSeek-V3': { provider: 'deepinfra' },
    'google/gemma-2-9b-it': { provider: 'deepinfra' }
};

const aiConfig = {
    primaryModel: process.env.DEEPINFRA_MODEL || DEFAULT_DEEPINFRA_MODEL,
    deepinfraFallbackModel: process.env.DEEPINFRA_FALLBACK_MODEL || DEFAULT_DEEPINFRA_FALLBACK_MODEL,
    groqFallbackModel: process.env.GROQ_FALLBACK_MODEL || 'llama-3.1-8b-instant',
    cerebrasFallbackModel: process.env.CEREBRAS_FALLBACK_MODEL || 'gemma-4-31b',
    novitaFallbackModel: process.env.NOVITA_FALLBACK_MODEL || DEFAULT_NOVITA_MODEL,
    maxTokens: Number(process.env.AI_MAX_TOKENS || 100),
    temperature: Number(process.env.AI_TEMPERATURE || 0.8)
};      

function makeStats() {
    return {
        requests: 0,
        success: 0,
        errors: 0,
        tokens: 0,
        prompt_tokens: 0,
        completion_tokens: 0,
        cached_tokens: 0
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
    clientObj.stats.cached_tokens += usage.prompt_tokens_details?.cached_tokens || 0;
}

function isRateLimit(error) {
    const message = String(error?.message || '').toLowerCase();
    return error?.status === 429 || message.includes('rate limit');
}

const GROQ_RPM_LIMIT = Number(process.env.GROQ_RPM_LIMIT || 30);
const CEREBRAS_RPM_LIMIT = Number(process.env.CEREBRAS_RPM_LIMIT || 30);
const NOVITA_RPM_LIMIT = Number(process.env.NOVITA_RPM_LIMIT || 30);
const FALLBACK_RPM_LIMIT = Number(process.env.FALLBACK_API_RPM_LIMIT || 30);
const RPM_WINDOW_MS = 60 * 1000;

function getRpmLimitForType(type) {
    if (type === 'GROQ') return GROQ_RPM_LIMIT;
    if (type === 'CEREBRAS') return CEREBRAS_RPM_LIMIT;
    if (type === 'NOVITA') return NOVITA_RPM_LIMIT;
    return FALLBACK_RPM_LIMIT;
}

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

const novitaClients = collectKeys('NOVITA_API_KEY', 5).map((key, index) => ({
    id: index + 1,
    client: new OpenAI({
        apiKey: key,
        baseURL: 'https://api.novita.ai/v3/openai',
    }),
    ...makeClientState()
}));

if (novitaClients.length > 0) {
    console.log(`[NPC] Novita AI: ${novitaClients.length} key(s) loaded.`);
}

let deepinfraBillingData = null;
let deepinfraAccountData = null;
let deepinfraFetchError = null;
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
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);

        const [resB, resA] = await Promise.all([
            fetch(urlBilling, { headers: { 'Authorization': `Bearer ${apiKey}` }, signal: controller.signal }),
            fetch(urlAccount, { headers: { 'Authorization': `Bearer ${apiKey}` }, signal: controller.signal })
        ]);

        clearTimeout(timeout);
        if (resB.ok) deepinfraBillingData = await resB.json();
        if (resA.ok) deepinfraAccountData = await resA.json();
        deepinfraFetchError = null;
    } catch (e) {
        deepinfraFetchError = e.message;
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
            [...deepInfraClients, ...groqClients, ...cerebrasClients, ...novitaClients].forEach(c => {
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
        completion_tokens: clients.reduce((acc, c) => acc + c.stats.completion_tokens, 0),
        cached_tokens: clients.reduce((acc, c) => acc + c.stats.cached_tokens, 0)
    };
}

function getProviderStats() {
    return {
        deepinfra_stats: getStatsSummary(deepInfraClients),
        groq_stats: getStatsSummary(groqClients),
        cerebras_stats: getStatsSummary(cerebrasClients),
        novita_stats: getStatsSummary(novitaClients),
        deepinfra_billing: deepinfraBillingData,
        deepinfra_account: deepinfraAccountData,
        deepinfra_fetch_error: deepinfraFetchError
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
        rpmLimit: (type === 'GROQ' || type === 'CEREBRAS' || type === 'NOVITA') ? getRpmLimitForType(type) : null,
        stats: clientObj.stats
    };
}

function getSupportedDeepInfraModels() {
    const configuredModels = [aiConfig.primaryModel, aiConfig.deepinfraFallbackModel]
        .filter(Boolean)
        .filter(model => !deepInfraModelProfiles[model]);
    return [...Object.keys(deepInfraModelProfiles), ...configuredModels];
}

function getAvailableModels() {
    const groqModels = [
        'llama-3.1-8b-instant',
        'llama-3.3-70b-versatile',
        'mixtral-8x7b-32768'
    ].map(m => ({ id: `groq:${m}`, model: m, provider: 'GROQ', label: `Groq - ${m}` }));

    const cerebrasModels = [
        'gemma-4-31b',
        'llama3.1-8b',
        'llama3.1-70b',
        'llama-3.3-70b'
    ].map(m => ({ id: `cerebras:${m}`, model: m, provider: 'CEREBRAS', label: `Cerebras - ${m}` }));

    const deepinfraModels = getSupportedDeepInfraModels().map(m => ({
        id: `deepinfra:${m}`,
        model: m,
        provider: 'DEEPINFRA',
        label: `DeepInfra - ${m}`
    }));

    const novitaModels = [
        aiConfig.novitaFallbackModel
    ].map(m => ({ id: `novita:${m}`, model: m, provider: 'NOVITA', label: `Novita - ${m}` }));

    return [
        { id: 'auto', model: 'auto', provider: 'AUTO', label: 'Auto (Queue Default)' },
        ...groqModels,
        ...cerebrasModels,
        ...deepinfraModels,
        ...novitaModels
    ];
}

function getModelsStatus() {
    return {
        config: aiConfig,
        availableModels: getAvailableModels(),
        supportedDeepinfraModels: getSupportedDeepInfraModels(),
        deepinfra: deepInfraClients.map(c => serializeClient(c, 'DEEPINFRA')),
        otak: groqClients.map(c => serializeClient(c, 'GROQ')),
        cerebras: cerebrasClients.map(c => serializeClient(c, 'CEREBRAS')),
        novita: novitaClients.map(c => serializeClient(c, 'NOVITA'))
    };
}


function updateModelConfig(config = {}) {
    if (typeof config.primaryModel === 'string' && config.primaryModel.trim()) {
        aiConfig.primaryModel = config.primaryModel.trim();
    }
    if (typeof config.deepinfraFallbackModel === 'string' && config.deepinfraFallbackModel.trim()) {
        aiConfig.deepinfraFallbackModel = config.deepinfraFallbackModel.trim();
    }
    if (typeof config.groqFallbackModel === 'string' && config.groqFallbackModel.trim()) {
        aiConfig.groqFallbackModel = config.groqFallbackModel.trim();
    }
    if (typeof config.cerebrasFallbackModel === 'string' && config.cerebrasFallbackModel.trim()) {
        aiConfig.cerebrasFallbackModel = config.cerebrasFallbackModel.trim();
    }
    if (typeof config.novitaFallbackModel === 'string' && config.novitaFallbackModel.trim()) {
        aiConfig.novitaFallbackModel = config.novitaFallbackModel.trim();
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
    if (type === 'NOVITA') return novitaClients.find(c => c.id === id);
    return groqClients.find(c => c.id === id);
}

function toggleClient(type, id, enabled) {
    const clientObj = findClient(type, id);
    if (!clientObj) return null;
    clientObj.isEnabled = enabled;
    return clientObj;
}

function buildChatCompletionPayload({ providerName, model, messages, cacheKey }) {
    const payload = {
        model,
        messages,
        max_tokens: aiConfig.maxTokens
    };

    const profile = providerName === 'DEEPINFRA'
        ? deepInfraModelProfiles[model] || { provider: 'deepinfra' }
        : {};

    if (profile.supportsTemperature !== false) {
        payload.temperature = aiConfig.temperature;
    }

    // Kirim prompt_cache_key ke DeepInfra agar prefix caching lebih reliable
    // daripada mengandalkan automatic byte-matching yang mudah di-evict
    if (providerName === 'DEEPINFRA' && cacheKey) {
        payload.prompt_cache_key = cacheKey;
    }

    return payload;
}

function getDeepInfraModelQueue() {
    const models = [aiConfig.primaryModel, aiConfig.deepinfraFallbackModel, DEFAULT_DEEPINFRA_FALLBACK_MODEL]
        .map(model => String(model || '').trim())
        .filter(Boolean);
    return [...new Set(models)];
}

function isModelCompatibilityError(error) {
    const message = String(error?.message || '').toLowerCase();
    return error?.status === 400 || error?.status === 404 ||
        message.includes('model') ||
        message.includes('unsupported') ||
        message.includes('invalid') ||
        message.includes('temperature');
}

async function tryClients({ clients, providerName, model, messages, cooldownMs, cacheKey }) {
    for (const clientObj of clients) {
        const rpmLimit = getRpmLimitForType(providerName);
        const rpmLimited = providerName === 'GROQ' || providerName === 'CEREBRAS' || providerName === 'NOVITA' || providerName === 'FALLBACK';
        if (rpmLimited && !canUseClientByRpm(clientObj, rpmLimit)) {
            clientObj.cooldownUntil = Date.now() + getRpmCooldownMs(clientObj, rpmLimit);
            continue;
        }

        clientObj.stats.requests++;
        if (rpmLimited) markClientRequest(clientObj);
        try {
            const completion = await clientObj.client.chat.completions.create(
                buildChatCompletionPayload({ providerName, model, messages, cacheKey })
            );
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
                } else if (providerName === 'NOVITA') {
                    console.warn(`[NPC] Novita #${clientObj.id} Limit! Cooldown 30m.`);
                }
            } else if (providerName === 'DEEPINFRA') {
                console.warn(`[NPC] DeepInfra #${clientObj.id} Error (${model}):`, error.message);
                if (isModelCompatibilityError(error)) break;
            }
        }
    }
    return null;
}

async function createChatCompletion({ staticSystemPrompt, dynamicUserContent, cacheKey, requestedModel }) {
    const messages = [
        { role: 'system', content: staticSystemPrompt },
        { role: 'user', content: dynamicUserContent }
    ];

    const now = Date.now();
    const availableDeepInfra = deepInfraClients.filter(c => c.isEnabled && now > c.cooldownUntil);
    const availableGroq = groqClients.filter(c => c.isEnabled && now > c.cooldownUntil && canUseClientByRpm(c));
    const availableCerebras = cerebrasClients.filter(c => {
        if (!c.isEnabled || now <= c.cooldownUntil || !canUseClientByRpm(c)) return false;
        if (c.stats.tokens >= 900000) {
            c.cooldownUntil = now + (24 * 3600 * 1000);
            return false;
        }
        return true;
    });
    const availableNovita = novitaClients.filter(c => c.isEnabled && now > c.cooldownUntil && canUseClientByRpm(c));
    const fallbackClients = deepInfraClients.filter(c => c.isEnabled);

    // Pengujian model spesifik (Manual override dari Live Simulator)
    if (requestedModel && typeof requestedModel === 'string' && requestedModel.trim() && requestedModel.trim() !== 'auto') {
        let providerHint = null;
        let actualModel = requestedModel.trim();

        if (actualModel.includes(':')) {
            const parts = actualModel.split(':');
            providerHint = parts[0].toUpperCase();
            actualModel = parts.slice(1).join(':');
        }

        console.log(`[NPC] Manual Model Selection: '${actualModel}' (Provider: ${providerHint || 'Auto'})`);

        if (providerHint === 'GROQ' || (!providerHint && (actualModel.includes('instant') || actualModel.includes('mixtral')))) {
            const clients = availableGroq.length > 0 ? availableGroq : groqClients.filter(c => c.isEnabled);
            if (clients.length > 0) {
                const res = await tryClients({ clients, providerName: 'GROQ', model: actualModel, messages, cooldownMs: 60 * 60 * 1000 });
                if (res) return res;
            }
        }
        if (providerHint === 'CEREBRAS' || (!providerHint && (actualModel.startsWith('gemma-4') || actualModel.includes('cerebras')))) {
            const clients = availableCerebras.length > 0 ? availableCerebras : cerebrasClients.filter(c => c.isEnabled);
            if (clients.length > 0) {
                const res = await tryClients({ clients, providerName: 'CEREBRAS', model: actualModel, messages, cooldownMs: 30 * 60 * 1000 });
                if (res) return res;
            }
        }
        if (providerHint === 'NOVITA') {
            const clients = availableNovita.length > 0 ? availableNovita : novitaClients.filter(c => c.isEnabled);
            if (clients.length > 0) {
                const res = await tryClients({ clients, providerName: 'NOVITA', model: actualModel, messages, cooldownMs: 30 * 60 * 1000 });
                if (res) return res;
            }
        }
        if (providerHint === 'DEEPINFRA' || !providerHint) {
            const clients = availableDeepInfra.length > 0 ? availableDeepInfra : fallbackClients;
            if (clients.length > 0) {
                const res = await tryClients({ clients, providerName: 'DEEPINFRA', model: actualModel, messages, cooldownMs: 5 * 60 * 1000, cacheKey });
                if (res) return res;
            }
        }

        throw new Error(`Model '${actualModel}' gagal dipanggil. Provider tidak merespon, limit, atau tidak aktif.`);
    }

    if (availableDeepInfra.length === 0 && availableGroq.length === 0 && availableCerebras.length === 0 && availableNovita.length === 0 && fallbackClients.length === 0) {
        const error = new Error('Semua token/otak sedang sibuk. Silakan coba lagi nanti.');
        error.statusCode = 503;
        throw error;
    }

    if (availableGroq.length > 0) {
        console.log(`[NPC] Mencoba Groq Utama (${availableGroq.length} node)...`);
        const result = await tryClients({
            clients: availableGroq,
            providerName: 'GROQ',
            model: aiConfig.groqFallbackModel,
            messages,
            cooldownMs: 60 * 60 * 1000
        });
        if (result) return result;
    }

    if (availableCerebras.length > 0) {
        console.warn(`[NPC] Groq gagal/limit, beralih ke Cerebras...`);
        const result = await tryClients({
            clients: availableCerebras,
            providerName: 'CEREBRAS',
            model: aiConfig.cerebrasFallbackModel,
            messages,
            cooldownMs: 30 * 60 * 1000
        });
        if (result) return result;
    }

    if (availableDeepInfra.length > 0) {
        console.warn(`[NPC] Cerebras gagal, beralih ke DeepInfra...`);
        for (const model of getDeepInfraModelQueue()) {
            const result = await tryClients({
                clients: availableDeepInfra,
                providerName: 'DEEPINFRA',
                model,
                messages,
                cooldownMs: 5 * 60 * 1000,
                cacheKey
            });
            if (result) return result;
        }
    }

    if (availableNovita.length > 0) {
        console.warn(`[NPC] DeepInfra gagal, beralih ke Novita AI...`);
        const result = await tryClients({
            clients: availableNovita,
            providerName: 'NOVITA',
            model: aiConfig.novitaFallbackModel,
            messages,
            cooldownMs: 30 * 60 * 1000
        });
        if (result) return result;
    }

    console.warn(`[NPC] Semua API Utama & Cadangan gagal, mencoba fallback terakhir...`);
    const fallbackResult = await tryClients({
        clients: fallbackClients,
        providerName: 'DEEPINFRA',
        model: aiConfig.primaryModel,
        messages,
        cooldownMs: 5 * 60 * 1000,
        cacheKey
    });
    if (fallbackResult) {
        fallbackResult.usedProvider = 'FALLBACK';
        return fallbackResult;
    }

    throw new Error("Semua provider (Groq, Cerebras, DeepInfra, Novita) gagal merespon.");
}

module.exports = {
    aiConfig,
    deepInfraClients,
    groqClients,
    cerebrasClients,
    novitaClients,
    startDeepInfraBillingSync,
    startDailyStatsReset,
    getProviderStats,
    getModelsStatus,
    getAvailableModels,
    updateModelConfig,
    toggleClient,
    createChatCompletion,
    getSupportedDeepInfraModels
};
