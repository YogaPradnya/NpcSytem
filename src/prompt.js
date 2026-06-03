const { getHeartProfile, clampHeartLevel } = require('./heart_profiles');

function normalizeAllowedPoses(system, context) {
    let allowedPoses = system?.ai_pose || system?.pose || context?.pose || "";
    if (!Array.isArray(allowedPoses) || (Array.isArray(allowedPoses) && allowedPoses.length === 0)) {
        allowedPoses = ["idle", "sad", "shy", "surprised", "smile"];
    }
    return allowedPoses.map(p => p.toLowerCase().trim());
}

function buildSystemPrompt({ char, currentUsername, user, context, system, allowedPoses, history, message }) {
    const problem = context?.problem || "";
    const mood = context?.mood || context?.mod || "";
    const relationship = context?.relationship || {};
    const lv5Owner = relationship.lv5_username || system?.lv5_username || context?.lv5_username || "";
    const isOwner = lv5Owner && currentUsername.toLowerCase() === lv5Owner.toLowerCase();
    const heartProfile = getHeartProfile(char, user?.level);

    const npcNameFull = char.npc_name_full || char.npc_name;
    const aiName = system?.ai_name || npcNameFull;
    const posesStr = allowedPoses.join('|');

    const historyLines = Array.isArray(history)
        ? history.slice(-5).map(h => {
            const role = (h.role === 'bot' || h.role === 'assistant') ? npcNameFull : currentUsername;
            return `${role}: ${h.content || h.message || ''}`;
        }).join('\n')
        : (Array.isArray(context?.history)
            ? context.history.slice(-5).map(h => {
                const role = (h.role === 'bot' || h.role === 'assistant') ? npcNameFull : currentUsername;
                return `${role}: ${h.content || h.message || ''}`;
            }).join('\n')
            : '-');

    const lv5Block = (lv5Owner && isOwner)
        ? `- ${currentUsername} adalah orang yang paling dekat denganmu saat ini, boleh sedikit lebih hangat.`
        : '';

    // STATIC SYSTEM PROMPT -- identik untuk kombinasi character + heart level yang sama.
    // DeepInfra akan meng-cache prefix ini dan memberikan diskon 50% input tokens.
    const staticSystemPrompt = `Kamu adalah ${npcNameFull}.
KEPRIBADIAN:
${char.npc_personality}
GAYA BICARA:
${heartProfile.speaking_style}
GAYA KHAS / SIGNATURE STYLE:
${char.signature_style || '-'}
DUNIA:
${char.character_background || '-'}
ATURAN WAJIB:
- Balas hanya sebagai ${npcNameFull}, tetap dalam karakter.
- Balas dengan 1-3 kalimat dialog natural sesuai kepribadian dan mood. Tiap kalimat HARUS PENDEK (maks 10-15 kata per kalimat).
- DILARANG KERAS memakai kata 'Saya' atau 'Anda' — wajib ganti dengan 'Aku' dan 'Kamu'.
- Jangan keluar dari karakter dan jangan sebut diri sebagai AI.
- Mood mempengaruhi nada bicara — perhatikan mood saat memilih kata.
- Jika pesan user mengandung typo atau salah ketik, pahami MAKSUD sebenarnya lalu balas sesuai maksud itu. JANGAN meniru atau mengulangi typo user.
- Untuk sapaan biasa (halo, hai, apa kabar, dll), balas dengan natural dan ramah sesuai kepribadian karakter. Jangan membuat jawaban yang aneh atau tidak nyambung.
PANDUAN POSE: idle = datar/netral, smile = senang/hangat, surprised = kaget/tidak terduga, sad = sedih/kecewa, shy = malu/salah tingkah.
Pilih pose yang paling mencerminkan ekspresi ${npcNameFull} saat mengucapkan kalimat terakhir dalam sentences.
Format output wajib JSON valid:
{
  "sentences": ["kalimat dialog 1", "kalimat dialog 2"],
  "ai_pose": "pilih 1 dari daftar pose yang diberikan",
  "ai_name": "${aiName}"
}
Pastikan:
- Output hanya JSON.
- Jangan menambahkan penjelasan di luar JSON.
- Jangan gunakan markdown.
- Tidak ada kata 'Saya' atau 'Anda' dalam sentences.`.trim();

    // DYNAMIC USER CONTENT -- berubah setiap request, bayar harga penuh.
    // Semua variabel dinamis dikumpulkan di sini agar tidak merusak cache system prompt.
    const dynamicUserContent = `[KONDISI SAAT INI]
- Mood: ${mood || '-'}
- Kondisi: ${problem || '-'}
${lv5Block ? lv5Block + '\n' : ''}[POSE YANG TERSEDIA]
${posesStr}
[RIWAYAT PERCAKAPAN]
${historyLines}
[PESAN]
${currentUsername}: ${message || ''}`.trim();

    return {
        staticSystemPrompt,
        dynamicUserContent,
        lv5Owner,
        isOwner
    };
}

function buildChatHistory(context) {
    if (!context || !Array.isArray(context.history)) return [];
    return context.history.slice(-5).map(h => ({
        role: (h.role === 'bot' || h.role === 'assistant') ? 'assistant' : 'user',  
        content: h.content || h.message || ''
    }));
}


module.exports = {
    normalizeAllowedPoses,
    buildSystemPrompt,
    buildChatHistory
};
