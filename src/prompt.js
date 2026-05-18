function getTimeOfDay() {
    const hour = new Date().getHours();
    if (hour >= 4 && hour < 11) return "PAGI";
    if (hour >= 11 && hour < 15) return "SIANG";
    if (hour >= 15 && hour < 19) return "SORE";
    return "MALAM";
}

function getLevelGuide(level) {
    const lv = Number(level) || 0;
    if (lv <= 0) return "[LV0:ASING] Dingin, formal, jaga jarak.";
    if (lv === 1) return "[LV1:KENALAN] Ramah, sedikit kaku.";
    if (lv === 2) return "[LV2:TEMAN] Santai, luwes, bercanda.";
    if (lv === 3) return "[LV3:TEMAN BAIK] Jujur, terbuka, antusias.";
    if (lv === 4) return "[LV4:SAHABAT] Protektif, manja, takut kehilangan.";
    return "[LV5:PASANGAN] Intim, setia, manja, cinta mati.";
}

function getDefaultStageLabel(level) {
    const lv = Number(level) || 0;
    if (lv === 1) return "kenalan";
    if (lv === 2) return "teman_biasa";
    if (lv === 3) return "teman_baik";
    if (lv === 4) return "sahabat_dekat";
    if (lv >= 5) return "orang_terspesial";
    return "belum_kenal";
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
    const mood = context?.mood || "";
    const relationship = context?.relationship || {};
    const lv5Owner = relationship.lv5_username || system?.lv5_username || context?.lv5_username || "";
    const isOwner = lv5Owner && currentUsername.toLowerCase() === lv5Owner.toLowerCase();

    const finalSystemPrompt = `Kamu ${char.npc_name}.
Bio:${char.npc_description}
Sifat:${char.npc_personality}
Gaya:${char.npc_speaking_style}
Ctx:${problem || '-'}|Mood:${mood || '-'}
User:${currentUsername}|Lv${user?.level||0}=${getLevelGuide(user?.level)}
${lv5Owner ? `Loyal:@${lv5Owner}. ${!isOwner ? `Tolak romansa; bilang Aku sudah punya pasangan yaitu @${lv5Owner}.` : `Manja pada @${lv5Owner}.`}` : ""}
Aturan: tetap IC, panggil user "Kamu", pakai "Aku" bukan Saya/Gue/Anda, max 2 kalimat/200 karakter.
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
        fullResponse = processedText;
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
        sentences: sentences.slice(0, 4)
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
