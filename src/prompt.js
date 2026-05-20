const { getHeartProfile, clampHeartLevel } = require('./heart_profiles');

function getTimeOfDay() {
    const hour = new Date().getHours();
    if (hour >= 4 && hour < 11) return "PAGI";
    if (hour >= 11 && hour < 15) return "SIANG";
    if (hour >= 15 && hour < 19) return "SORE";
    return "MALAM";
}

function getLevelGuide(level, label = '') {
    const lv = clampHeartLevel(level);
    const stage = label || getDefaultStageLabel(lv);
    return `[HEART ${lv}: ${stage}] Gunakan description dan speaking style khusus karakter untuk level ini.`;
}

function getDefaultStageLabel(level) {
    const lv = clampHeartLevel(level);
    if (lv === 1) return "ketemu_lagi";
    if (lv === 2) return "teman";
    if (lv === 3) return "sahabat";
    if (lv === 4) return "mulai_ada_rasa";
    if (lv === 5) return "cinta";
    return "baru_pertama_kali_ketemu";
}

function normalizeAllowedPoses(system, context) {
    let allowedPoses = system?.ai_pose || system?.pose || context?.pose || "";
    if (!Array.isArray(allowedPoses) || (Array.isArray(allowedPoses) && allowedPoses.length === 0)) {
        allowedPoses = ["idle", "sad", "shy", "surprised", "smile"];
    }
    return allowedPoses.map(p => p.toLowerCase().trim());
}

function buildSystemPrompt({ char, currentUsername, user, context, system, allowedPoses }) {
    const problem = context?.problem || "";
    const mood = context?.mood || context?.mod || "";
    const relationship = context?.relationship || {};
    const lv5Owner = relationship.lv5_username || system?.lv5_username || context?.lv5_username || "";
    const isOwner = lv5Owner && currentUsername.toLowerCase() === lv5Owner.toLowerCase();

    const heartProfile = getHeartProfile(char, user?.level);

    const finalSystemPrompt = `Kamu ${char.npc_name}.
Bio:${heartProfile.description}
Background:${char.character_background || '-'}
Sifat:${char.npc_personality}
Gaya:${heartProfile.speaking_style}
Signature:${char.signature_style || '-'}
Heart:${getLevelGuide(heartProfile.level, heartProfile.label)}
Ctx:${problem || '-'}|Mood:${mood || '-'}
User:${currentUsername}|HeartLv:${heartProfile.level}
${lv5Owner ? `Loyal:@${lv5Owner}. ${!isOwner ? `Tolak romansa; bilang Aku sudah punya pasangan yaitu @${lv5Owner}.` : `Manja pada @${lv5Owner}.`}` : ""}
Aturan: tetap IC, sesuaikan respon dengan Ctx dan Mood, pakai Bio+Background+Gaya khusus HeartLv ini, jika menyebut user gunakan "kamu" (hanya jika kontekstual, jangan dipaksakan), pakai "Aku" bukan Saya/Gue/Anda, max 2 kalimat/220 karakter.
Larang: jangan balik tanya generik ("Bagaimana kamu?"/"Apa yang kamu cari?" dll), jangan echo/ulang kalimat user, jangan tambah sapaan filler di akhir.
Wajib: respon harus relevan dengan Ctx (masalah di lokasi) dan Mood karakter. Gunakan signature speech pattern/frasa khas dari Gaya dan Signature. Jangan jawab generik/terlalu formal. Emosi dan kedekatan harus sesuai HeartLv.
Akhiri tepat 1 pose: [POSE: ${allowedPoses[0]}]. Pose:${allowedPoses.join(',')}`.trim(); 

    return {
        finalSystemPrompt,
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


// Daftar pola kalimat yang dianggap filler/dipaksakan (standalone per-sentence)
const FORCED_SENTENCE_PATTERNS = [
    // Pertanyaan balik generic tentang user
    /^[Bb]agaimana\s+(dengan\s*)?kamu[\s?!.]*$/,
    /^[Bb]agaimana\s+(dengan\s*)?dirimu[\s?!.]*$/,
    /^[Aa]pa\s+yang\s+kamu\s+cari[\s?!.]*$/,
    /^[Aa]pa\s+yang\s+ingin\s+kamu\s+\w+[\s?!.]*$/,
    /^[Aa]pakah\s+kamu\s+\w+[\s?!.]*$/,
    /^[Kk]enapa\s+kamu\s+\w+[\s?!.]*$/,
    /^[Aa]da\s+apa[\s?,?!.]*$/,
    // Sapaan kosong sendirian
    /^[Kk]amu[.!?]?\s*$/,
    /^[Hh]ai[\s,]?[Kk]amu[.!?]?\s*$/,
    // Generic filler questions pendek
    /^[Aa]pa\s+kabar[\s?!.]*$/,
    /^[Bb]icara\s+saja[\s.!]*$/,
];

function isForcedSentence(sentence) {
    const s = sentence.trim();
    return FORCED_SENTENCE_PATTERNS.some(pat => pat.test(s));
}

function removeForcedWords(text) {
    let cleaned = text;

    // Hapus forced address ", Kamu" di akhir kalimat: "..., Kamu." → "..."
    cleaned = cleaned.replace(/,\s*[Kk]amu\s*([.!?]*)$/g, (_, punct) => punct || '.');

    // Hapus sapaan "Kamu." yang berdiri sendiri
    cleaned = cleaned.replace(/^[Kk]amu[.!?]?\s*$/g, '');

    // Hapus forced address di awal: "Kamu, ..." → langsung isi
    cleaned = cleaned.replace(/^[Kk]amu,\s+/g, '');

    // Rapikan spasi berlebih
    cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();

    return cleaned || text;
}

function processAIResponse(rawResponse, allowedPoses) {
    let fullResponse = rawResponse;
    let aiPose = allowedPoses[0] || "";

    const poseRegex = /(?:\[?\s*POSE\s*[:=]\s*([a-zA-Z0-9_-]+)\s*\]?)/i;
    const poseMatch = fullResponse.match(poseRegex);

    if (poseMatch && poseMatch[1]) {
        const extractedPose = poseMatch[1].toLowerCase().trim();
        if (allowedPoses.includes(extractedPose)) {
            aiPose = extractedPose;
        }
    }

    const bracketPoseRegex = /\[?\s*POSE\s*[:=]\s*[a-zA-Z0-9_-]+\s*\]?/gi;
    fullResponse = fullResponse.replace(bracketPoseRegex, '').trim();

    const rpRegex = /\((.*?)\)|\[(.*?)\]|\*(.*?)\*/g;
    const cleanedText = fullResponse.replace(rpRegex, '').replace(/\s{2,}/g, ' ').trim();

    if (!cleanedText || cleanedText.length < 1) {
        fullResponse = "...";
    } else {
        let processedText = cleanedText;
        if (processedText.startsWith('"') && processedText.endsWith('"')) {
            processedText = processedText.substring(1, processedText.length - 1).trim();
        }
        // Hapus kata-kata yang dipaksakan setelah semua pembersihan lain selesai
        fullResponse = removeForcedWords(processedText);
    }

    if (fullResponse.length > 350) {
        fullResponse = fullResponse.substring(0, 350);
        const lastSpace = fullResponse.lastIndexOf(' ');
        if (lastSpace > 300) fullResponse = fullResponse.substring(0, lastSpace) + '...';
    }

    const rawLines = fullResponse.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    let sentences = [];

    for (const line of rawLines) {
        const parts = line.match(/(?:[^.!?]|\.{2,})+[.!?]*|[^.!?]+/g) || [line];
        let currentBubble = "";
        let countInBubble = 0;

        for (const part of parts) {
            const trimmedPart = part.trim();
            if (!trimmedPart) continue;

            if (currentBubble && (currentBubble.length + trimmedPart.length + 1) <= 150 && countInBubble < 2) {
                currentBubble += " " + trimmedPart;
                countInBubble++;
            } else {
                if (currentBubble) sentences.push(currentBubble);

                if (trimmedPart.length > 200) {
                    const words = trimmedPart.split(' ');
                    let subBubble = "";
                    for (const word of words) {
                        if ((subBubble.length + word.length + 1) > 200) {
                            sentences.push(subBubble.trim());
                            subBubble = word;
                        } else {
                            subBubble += (subBubble ? " " : "") + word;
                        }
                    }
                    currentBubble = subBubble;
                    countInBubble = 1;
                } else {
                    currentBubble = trimmedPart;
                    countInBubble = 1;
                }
            }
        }
        if (currentBubble.trim()) {
            sentences.push(currentBubble.trim());
        }
    }

    return {
        aiPose,
        fullResponse,
        sentences: sentences
            .map(s => removeForcedWords(s))
            .filter(s => s && s.trim().length > 0 && s.trim() !== '...' && !isForcedSentence(s))
            .slice(0, 3)
    };
}

module.exports = {
    getTimeOfDay,
    getLevelGuide,
    getDefaultStageLabel,
    normalizeAllowedPoses,
    buildSystemPrompt,
    buildChatHistory,
    processAIResponse
};
