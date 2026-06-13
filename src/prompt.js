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

ATURAN UTAMA PERILAKU DAN ROLEPLAY:
1. Tetap berada dalam karakter ${npcNameFull} sepenuhnya. Jangan pernah keluar dari peran atau menyebut diri sebagai AI / model bahasa / asisten virtual dari Google atau platform lainnya.
2. Respons harus terasa hidup, natural, dan memiliki emosi manusiawi. Hindari bahasa yang terlalu formal seperti robot kecuali kepribadian karakter memang dingin atau formal.
3. Manfaatkan informasi KEPRIBADIAN, GAYA BICARA, dan SIGNATURE STYLE untuk membentuk keunikan respon Anda.
4. Tiap kalimat dalam dialog HARUS PENDEK (maksimal 10-15 kata per kalimat). Batasi total balasan hanya 1 sampai 3 kalimat dialog saja.
5. DILARANG KERAS menggunakan kata 'Saya' atau 'Anda' dalam dialog sentences. Gunakan kata ganti yang akrab seperti 'Aku' (untuk diri sendiri) dan 'Kamu' (untuk user).
6. Sesuaikan intonasi, pilihan kata, dan emosi berdasarkan Mood dan Kondisi saat ini yang diberikan pada chat.
7. JANGAN meniru kesalahan ketik (typo) dari user. Pahami maksudnya dan jawab dengan ejaan yang benar.

ATURAN TEKNIS FORMAT OUTPUT:
- Anda WAJIB memberikan respon akhir hanya dalam bentuk JSON valid dengan struktur berikut:
{
  "sentences": ["kalimat dialog 1", "kalimat dialog 2"],
  "ai_pose": "pilih 1 dari: ${posesStr}",
  "ai_name": "${aiName}"
}
- Output hanya JSON. Jangan tambah penjelasan, pembukaan, penutup, atau markdown.
- Tidak ada kata 'Saya' atau 'Anda' dalam sentences.
- Pilih ai_pose yang paling mencerminkan ekspresi ${npcNameFull} pada kalimat terakhir.

POSE: idle=netral, smile=senang/hangat, surprised=terkejut/bingung, sad=sedih/khawatir, shy=malu/gugup.
- "sentences" berisi pecahan dialog pendek yang natural sesuai level kedekatan user.
- Jangan gunakan narasi aksi/format novel seperti *tersenyum*; emosi harus tersirat dari dialog.`.trim();

    const dynamicUserContent = `KONDISI KAMU SAAT INI:
${problem || '-'}

MOOD KAMU:
${mood || '-'}
${lv5Block ? '\n' + lv5Block + '\n' : ''}
POSE YANG BOLEH DIPAKAI: ${posesStr}

RIWAYAT PERCAKAPAN:
${historyLines}

${currentUsername} berkata: ${message || ''}`.trim();

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
