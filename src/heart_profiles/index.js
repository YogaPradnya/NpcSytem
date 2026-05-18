const HEART_LEVELS = [
    { level: 0, key: 'heart_0', label: 'Baru pertama kali ketemu' },
    { level: 1, key: 'heart_1', label: 'Ketemu lagi' },
    { level: 2, key: 'heart_2', label: 'Teman' },
    { level: 3, key: 'heart_3', label: 'Sahabat' },
    { level: 4, key: 'heart_4', label: 'Mulai ada rasa' },
    { level: 5, key: 'heart_5', label: 'Cinta' }
];

function clampHeartLevel(level) {
    const value = Number.parseInt(level, 10);
    if (Number.isNaN(value)) return 0;
    return Math.max(0, Math.min(5, value));
}

function emptyHeartProfiles() {
    return HEART_LEVELS.reduce((acc, item) => {
        acc[item.key] = { description: '', speaking_style: '' };
        return acc;
    }, {});
}

function parseHeartProfiles(value) {
    const defaults = emptyHeartProfiles();
    if (!value) return defaults;

    let source = value;
    if (typeof value === 'string') {
        try {
            source = JSON.parse(value);
        } catch (e) {
            return defaults;
        }
    }

    if (!source || typeof source !== 'object') return defaults;

    for (const item of HEART_LEVELS) {
        const profile = source[item.key] || source[item.level] || {};
        defaults[item.key] = {
            description: String(profile.description || profile.npc_description || '').trim(),
            speaking_style: String(profile.speaking_style || profile.npc_speaking_style || '').trim()
        };
    }

    return defaults;
}

function stringifyHeartProfiles(value) {
    return JSON.stringify(parseHeartProfiles(value));
}

function getHeartProfile(char, level) {
    const lv = clampHeartLevel(level);
    const profiles = parseHeartProfiles(char?.heart_profiles);
    const profile = profiles[`heart_${lv}`] || {};

    return {
        level: lv,
        label: HEART_LEVELS[lv].label,
        description: profile.description || char?.npc_description || '',
        speaking_style: profile.speaking_style || char?.npc_speaking_style || ''
    };
}

module.exports = {
    HEART_LEVELS,
    clampHeartLevel,
    emptyHeartProfiles,
    parseHeartProfiles,
    stringifyHeartProfiles,
    getHeartProfile
};
