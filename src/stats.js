const globalStats = {
    totalRequests: 0,
    totalTokens: 0,
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    totalCachedTokens: 0,
    cachedByModel: {},
    startTime: new Date(),
    charUsage: {}
};

function formatUptime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h}h ${m}m ${s}s`;
}

module.exports = {
    globalStats,
    formatUptime
};
