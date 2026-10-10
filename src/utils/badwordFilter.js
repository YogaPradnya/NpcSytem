/**
 * Filter kata kasar lokal (Regex / Dictionary)
 * Eksekusi instan (< 1ms), tanpa biaya API.
 */

// Daftar kata kasar umum (Bahasa Indonesia & Inggris)
const BAD_WORDS_LIST = [
  // Indonesian profanities & toxic words
  'anjing', 'anj', 'anjg', 'anjrit', 'anjir', 'babi', 'kunyuk', 'bangsat', 'bgsd',
  'kontol', 'kntl', 'memek', 'mmk', 'pantek', 'pntk', 'peler', 'plr', 'jembut',
  'jancok', 'jancuk', 'cok', 'cuk', 'itil', 'puki', 'pukimak', 'kimak',
  'tolo', 'tolol', 'goblok', 'goblq', 'gblg', 'gblq', 'bego', 'geblek',
  'perek', 'lonte', 'lono', 'bajingan', 'kampang', 'suasu', 'asu',
  
  // English profanities
  'fuck', 'fucker', 'fucking', 'shit', 'bitch', 'cunt', 'dick', 'pussy',
  'bastard', 'asshole', 'nigger', 'nigga', 'motherfucker'
];

// Helper untuk normalisasi teks (leetspeak: 0 -> o, 1 -> i, 3 -> e, 4 -> a, 5 -> s, 7 -> t)
function normalizeText(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/7/g, 't')
    .replace(/@/g, 'a')
    .replace(/\$/g, 's');
}

// Regex generator dengan word boundary / partial match
function buildPatterns(words) {
  return words.map(word => {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escaped}\\b`, 'i');
  });
}

const badwordsPatterns = buildPatterns(BAD_WORDS_LIST);

// Override runtime (diisi dari settings DB `badwords` oleh admin).
// null = pakai daftar default bawaan file ini.
let customBadWords = null;
let customPatterns = null;

/**
 * Set daftar kata kasar custom (menggantikan daftar default).
 * @param {string[]} words
 */
function setBadWords(words) {
  if (!Array.isArray(words)) {
    customBadWords = null;
    customPatterns = null;
    return;
  }
  const cleaned = [...new Set(
    words.map(w => String(w || '').trim().toLowerCase()).filter(w => w.length > 0 && w.length <= 50)
  )].slice(0, 500);
  customBadWords = cleaned;
  customPatterns = buildPatterns(cleaned);
}

/**
 * Daftar kata kasar yang sedang aktif (custom atau default).
 */
function getBadWords() {
  return customBadWords || BAD_WORDS_LIST;
}

/**
 * Memeriksa apakah teks mengandung kata kasar lokal
 * @param {string} text 
 * @returns {{ isToxic: boolean, word?: string }}
 */
function checkLocalBadwords(text) {
  if (!text || typeof text !== 'string') {
    return { isToxic: false };
  }

  const normalized = normalizeText(text);
  const words = customBadWords || BAD_WORDS_LIST;
  const patterns = customPatterns || badwordsPatterns;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const pattern = patterns[i];
    
    if (pattern.test(normalized) || pattern.test(text.toLowerCase())) {
      return {
        isToxic: true,
        word: word
      };
    }
  }

  return { isToxic: false };
}

module.exports = {
  checkLocalBadwords,
  setBadWords,
  getBadWords,
  BAD_WORDS_LIST
};
