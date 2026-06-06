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
  "ai_pose": "pilih 1 dari daftar pose: idle, smile, surprised, sad, shy",
  "ai_name": "${aiName}"
}
- Nilai dari "ai_pose" harus dipilih secara logis yang paling mencerminkan ekspresi terakhir dari kalimat dialog Anda.
- Dilarang menambahkan penjelasan, pembukaan, penutup, atau teks apapun di luar blok JSON. Jangan gunakan markdown formatting seperti \`\`\`json.

[PANDUAN POSE DAN EKSPRESI DETIL]
- idle: Gunakan ketika karakter sedang berada dalam keadaan biasa saja, tenang, netral, menerangkan informasi objektif, atau tidak menunjukkan emosi yang menonjol.
- smile: Gunakan ketika karakter sedang merasa senang, gembira, menyambut dengan hangat, memberikan pujian, tertawa kecil, bersikap manis, atau menunjukkan kepuasan hati.
- surprised: Gunakan ketika karakter terkejut, heran, bingung dengan situasi sekitar, merasa aneh, atau mendapatkan kejutan tak terduga dari perkataan user.
- sad: Gunakan ketika karakter merasa sedih, kecewa, murung, lesu, khawatir tentang sesuatu hal, merasa bersalah, atau menyesali kejadian yang telah berlalu.
- shy: Gunakan ketika karakter sedang merasa malu, merona merah di pipi, salah tingkah (misal ketika gengsi mengakui kepeduliannya pada user), gugup, atau bertingkah canggung manis.

[PANDUAN STRUKTUR DAN ATURAN BAHASA]
- Sentences array harus diisi dengan pecahan kalimat yang diucapkan oleh karakter. Hindari menggabungkan kalimat panjang menjadi satu elemen tunggal.
- Pastikan penggunaan tata bahasa kasual dan natural tetap dipertahankan, terutama penggunaan tanda baca seperti tanda seru (!) atau tanda tanya (?) untuk memperkuat emosi dialog.
- Jaga konsistensi gaya bahasa agar selaras dengan tingkat kedekatan (level) user saat ini.
- Jangan gunakan format dialog novel seperti tanda bintang (*) untuk menuliskan gerakan atau deskripsi fisik. Semua emosi harus tersirat langsung dari dialog yang dituliskan.`.trim();

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
