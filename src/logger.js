const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(process.cwd(), 'data', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'bot.log');

function ensureLogDir() {
    if (!fs.existsSync(LOG_DIR)) {
        fs.mkdirSync(LOG_DIR, { recursive: true });
    }
}

function getTimestamp() {
    return new Date().toISOString();
}

function formatLog(level, message, error = null) {
    let log = `[${getTimestamp()}] [${level}] ${message}`;
    
    if (error) {
        if (error.code) log += `\n  └─ Error Code: ${error.code}`;
        if (error.message) log += `\n  └─ Error Message: ${error.message}`;
        if (error.stack) log += `\n  └─ Stack Trace: ${error.stack}`;
        
        if (error.response && error.response.body) {
            const body = error.response.body;
            if (body.error_code) log += `\n  └─ Telegram Error Code: ${body.error_code}`;
            if (body.description) log += `\n  └─ Telegram Description: ${body.description}`;
        }
    }
    
    return log;
}

function writeToFile(text) {
    try {
        ensureLogDir();
        fs.appendFileSync(LOG_FILE, text + '\n');
    } catch (e) {
        console.error('Failed to write to log file:', e.message);
    }
}

const logger = {
    info(message) {
        const text = formatLog('INFO', message);
        console.log(message);
        writeToFile(text);
    },
    
    warn(message, error = null) {
        const text = formatLog('WARN', message, error);
        console.warn(message);
        writeToFile(text);
    },
    
    error(message, error = null) {
        const text = formatLog('ERROR', message, error);
        console.error(message);
        writeToFile(text);
    },
    
    debug(message) {
        const text = formatLog('DEBUG', message);
        console.log(message);
        writeToFile(text);
    },
    
    success(message) {
        const text = formatLog('SUCCESS', message);
        console.log(message);
        writeToFile(text);
    }
};

module.exports = logger;
