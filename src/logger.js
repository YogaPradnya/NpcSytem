const fs = require('fs');
const path = require('path');

let logListeners = [];
let consoleAttached = false;

const LOG_DIR = path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'system.log.jsonl');
const MAX_BUFFER_LINES = Number(process.env.SYSTEM_LOG_BUFFER_LINES || 500);
let logBuffer = [];

function ensureLogFile() {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    if (!fs.existsSync(LOG_FILE)) fs.writeFileSync(LOG_FILE, '', 'utf8');
}

function loadPersistedLogs() {
    ensureLogFile();
    try {
        const lines = fs.readFileSync(LOG_FILE, 'utf8').split('\n').filter(Boolean);
        logBuffer = lines.slice(-MAX_BUFFER_LINES).map(line => JSON.parse(line)).filter(Boolean);
        return logBuffer.length;
    } catch (error) {
        logBuffer = [];
        return 0;
    }
}

function persistLog(logEntry) {
    ensureLogFile();
    fs.appendFile(LOG_FILE, JSON.stringify(logEntry) + '\n', () => {});
}

function writeToListeners(logEntry) {
    const payload = `data: ${JSON.stringify(logEntry)}\n\n`;
    logListeners.forEach(res => res.write(payload));
}

function broadcastLog(data) {
    const logEntry = typeof data === 'string' ? { message: data, type: 'info' } : { ...data };
    logEntry.timestamp = logEntry.timestamp || new Date().toISOString();

    logBuffer.push(logEntry);
    if (logBuffer.length > MAX_BUFFER_LINES) logBuffer.shift();
    persistLog(logEntry);
    writeToListeners(logEntry);
}

function attachConsoleBroadcast() {
    if (consoleAttached) return;
    consoleAttached = true;

    const loaded = loadPersistedLogs();
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

    broadcastLog({ message: `Loaded ${loaded} persisted system logs.`, type: 'system' });
}

function openLogStream(req, res) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    logListeners.push(res);
    logBuffer.forEach(writeLog => {
        const payload = `data: ${JSON.stringify(writeLog)}\n\n`;
        res.write(payload);
    });
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
