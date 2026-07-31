const { checkLocalBadwords } = require('../utils/badwordFilter');

const DEEPINFRA_API_URL = 'https://api.deepinfra.com/v1/openai/chat/completions';
const DEFAULT_DEEPINFRA_MODEL = 'meta-llama/Llama-3.2-1B-Instruct';

/**
 * Pengecekan AI Moderasi melalui Cloudflare Workers AI
 */
async function checkCloudflareModeration(text) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiKey = process.env.CLOUDFLARE_API_KEY;

  if (!accountId || !apiKey) {
    return { isToxic: false, source: 'cloudflare_unconfigured' };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  try {
    const model = process.env.CLOUDFLARE_MODERATION_MODEL || '@cf/meta/llama-3.1-8b-instruct';
    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      signal: controller.signal,
      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content: 'Anda adalah AI Moderasi Konten. Analisis apakah teks mengandung kata kasar, insult, ujaran kebencian, atau toksisitas. Jawab HANYA dalam format JSON valid: {"isToxic": true/false, "reason": "alasan singkat"}'
          },
          {
            role: 'user',
            content: `Teks: "${text}"`
          }
        ]
      })
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return { isToxic: false, source: 'cloudflare_http_error' };
    }

    const data = await response.json();
    const resultObj = data.result?.response || data.result;

    if (typeof resultObj === 'object' && resultObj !== null && 'isToxic' in resultObj) {
      return {
        isToxic: Boolean(resultObj.isToxic),
        reason: resultObj.reason || 'Terdeteksi oleh Cloudflare AI Moderasi',
        source: 'cloudflare_ai'
      };
    }

    // Jika berupa string response
    const content = typeof resultObj === 'string' ? resultObj : JSON.stringify(data);
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        isToxic: Boolean(parsed.isToxic),
        reason: parsed.reason || 'Terdeteksi oleh Cloudflare AI Moderasi',
        source: 'cloudflare_ai'
      };
    }

    return { isToxic: false, source: 'cloudflare_parse_failed' };
  } catch (err) {
    clearTimeout(timeoutId);
    return { isToxic: false, source: 'cloudflare_exception' };
  }
}

/**
 * Pengecekan AI Moderasi melalui DeepInfra
 */
async function checkDeepInfraModeration(text) {
  const apiKey = process.env.DEEPINFRA_API_KEY;
  if (!apiKey) {
    return checkCloudflareModeration(text);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  try {
    const response = await fetch(DEEPINFRA_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: process.env.DEEPINFRA_MODERATION_MODEL || DEFAULT_DEEPINFRA_MODEL,
        messages: [
          {
            role: 'system',
            content: 'Anda adalah AI Moderasi Konten. Analisis apakah teks mengandung kata kasar, insult, ujaran kebencian, atau toksisitas. Jawab HANYA dalam format JSON valid: {"isToxic": true/false, "reason": "alasan singkat"}'
          },
          {
            role: 'user',
            content: `Teks: "${text}"`
          }
        ],
        temperature: 0.0,
        max_tokens: 80
      })
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      // Fallback ke Cloudflare jika DeepInfra error
      return checkCloudflareModeration(text);
    }

    const data = await response.json();
    if (data.error) {
      return checkCloudflareModeration(text);
    }

    const content = data.choices?.[0]?.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        isToxic: Boolean(parsed.isToxic),
        reason: parsed.reason || 'Terdeteksi oleh DeepInfra AI',
        source: 'deepinfra_ai'
      };
    }

    return checkCloudflareModeration(text);
  } catch (err) {
    clearTimeout(timeoutId);
    return checkCloudflareModeration(text);
  }
}

/**
 * Modul utama moderasi teks (Fast-Path: Filter Lokal -> DeepInfra / Cloudflare AI)
 * @param {string} text 
 * @returns {Promise<{ isToxic: boolean, reason?: string, source: string }>}
 */
async function moderateText(text) {
  if (!text || typeof text !== 'string') {
    return { isToxic: false, source: 'none' };
  }

  // 1. Filter Lokal (Instant < 1ms)
  const localCheck = checkLocalBadwords(text);
  if (localCheck.isToxic) {
    return {
      isToxic: true,
      reason: `Filter Lokal: Kata Kasar Terdeteksi ('${localCheck.word}')`,
      source: 'local_filter'
    };
  }

  // 2. AI Moderation (DeepInfra dengan Fallback ke Cloudflare AI)
  return await checkDeepInfraModeration(text);
}

/**
 * Pengecekan Moderasi secara Asinkron (Post-Processing / Background)
 * Fungsi ini tidak menahan respon utama (non-blocking).
 * @param {string} text - Pesan user yang diperiksa
 * @param {Function} onViolation - Callback jika terdeteksi toxic: (result) => {}
 */
function moderateTextAsync(text, onViolation) {
  setImmediate(async () => {
    try {
      const result = await moderateText(text);
      if (result.isToxic && typeof onViolation === 'function') {
        onViolation(result);
      }
    } catch (err) {
      console.error('[Moderation Async] Error:', err.message);
    }
  });
}

module.exports = {
  checkLocalBadwords,
  checkDeepInfraModeration,
  checkCloudflareModeration,
  moderateText,
  moderateTextAsync
};
