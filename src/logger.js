let logListeners = [];
let consoleAttached = false;

function broadcastLog(data) {
    const logEntry = typeof data === 'string' ? { message: data, type: 'info' } : data;
    logEntry.timestamp = new Date().toISOString();
    const payload = `data: ${JSON.stringify(logEntry)}\n\n`;
    logListeners.forEach(res => res.write(payload));
}

function attachConsoleBroadcast() {
    if (consoleAttached) return;
    consoleAttached = true;

    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    console.log = (...args) => {
        originalLog(...args);
        broadcastLog({ message: args.join(' '), type: 'log' });
    };
    console.warn = (...args) => {
        originalWarn(...args);
        broadcastLog({ message: args.join(' '), type: 'warn' });
    };
    console.error = (...args) => {
        originalError(...args);
        broadcastLog({ message: args.join(' '), type: 'error' });
    };
}

function openLogStream(req, res) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    logListeners.push(res);
    broadcastLog({ message: `Admin connected to log stream (@${req.user.username})`, type: 'system' });

    req.on('close', () => {
        logListeners = logListeners.filter(listener => listener !== res);
    });
}

module.exports = {
    attachConsoleBroadcast,
    broadcastLog,
    openLogStream
};
