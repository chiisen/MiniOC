require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { initBot } = require('./bot');
const { initDatabase, clearAllConversations } = require('./db');

const LOCK_FILE = path.join(__dirname, '..', 'data', 'bot.lock');

function acquireLock() {
    try {
        if (fs.existsSync(LOCK_FILE)) {
            const pid = fs.readFileSync(LOCK_FILE, 'utf8').trim();
            console.log(`🔍 Found existing lock file, PID: ${pid}`);
            try {
                process.kill(parseInt(pid), 'SIGKILL');
                console.log(`🔪 Killed process ${pid}`);
            } catch (e) {
                console.log(`⚠️ Could not kill process ${pid}: ${e.message}`);
            }
            fs.unlinkSync(LOCK_FILE);
        }
        fs.writeFileSync(LOCK_FILE, process.pid.toString());
        console.log(`🔒 Lock acquired, PID: ${process.pid}`);
        return true;
    } catch (e) {
        console.error('❌ Failed to acquire lock:', e.message);
        return false;
    }
}

function releaseLock() {
    try {
        if (fs.existsSync(LOCK_FILE)) {
            fs.unlinkSync(LOCK_FILE);
            console.log('🔓 Lock released');
        }
    } catch (e) {}
}

async function main() {
    console.log('🤖 Starting Telegram AI Agent...');
    
    if (!acquireLock()) {
        console.error('❌ Could not acquire lock, exiting');
        process.exit(1);
    }
    
    process.on('exit', releaseLock);
    process.on('SIGINT', releaseLock);
    process.on('SIGTERM', releaseLock);
    
    initDatabase();
    clearAllConversations();
    console.log('✅ Database initialized and cleared');

    await initBot();
    console.log('✅ Bot started and listening for messages');
}

main().catch(err => {
    console.error('❌ Failed to start:', err);
    releaseLock();
    process.exit(1);
});
