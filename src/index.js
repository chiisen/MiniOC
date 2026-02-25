require('dotenv').config();
const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const { initBot } = require('./bot');
const { initDatabase, clearAllConversations, closeDatabase } = require('./db');

const LOCK_FILE = path.join(process.cwd(), 'data', 'bot.lock');

function acquireLock() {
    try {
        if (fs.existsSync(LOCK_FILE)) {
            const pid = fs.readFileSync(LOCK_FILE, 'utf8').trim();
            logger.warn(`Found existing lock file, PID: ${pid}`);
            
            try {
                process.kill(parseInt(pid), 'SIGKILL');
                logger.info(`Killed old process: ${pid}`);
            } catch (e) {
                logger.warn(`Could not kill process ${pid}: ${e.message}`);
            }
            
            fs.unlinkSync(LOCK_FILE);
        }
        
        fs.writeFileSync(LOCK_FILE, process.pid.toString());
        logger.info(`Lock acquired, PID: ${process.pid}`);
        return true;
    } catch (e) {
        logger.error('Failed to acquire lock', e);
        logger.error('Possible causes: data folder is read-only or locked by another process');
        return false;
    }
}

function releaseLock() {
    try {
        if (fs.existsSync(LOCK_FILE)) {
            fs.unlinkSync(LOCK_FILE);
            logger.info('Lock released');
        }
    } catch (e) {
        logger.error('Failed to release lock', e);
    }
}

async function main() {
    logger.info('========================================');
    logger.info('Starting Telegram AI Agent...');
    logger.info('========================================');
    
    if (!acquireLock()) {
        logger.error('Could not acquire lock, exiting');
        process.exit(1);
    }
    
    process.on('exit', () => {
        releaseLock();
        closeDatabase();
    });
    process.on('SIGINT', () => {
        logger.info('SIGINT received, shutting down...');
        releaseLock();
        closeDatabase();
    });
    process.on('SIGTERM', () => {
        logger.info('SIGTERM received, shutting down...');
        releaseLock();
        closeDatabase();
    });

    try {
        initDatabase();
    } catch (error) {
        logger.error('Failed to initialize database', error);
        logger.error('Possible causes: SQLite not installed, data folder permission issue, or disk full');
        logger.error('Solution: Check data folder permissions and reinstall dependencies');
        releaseLock();
        process.exit(1);
    }

    try {
        clearAllConversations();
    } catch (error) {
        logger.error('Failed to clear conversations', error);
    }

    try {
        await initBot();
    } catch (error) {
        logger.error('Failed to initialize bot', error);
        releaseLock();
        closeDatabase();
        process.exit(1);
    }
    
    logger.success('Bot started and listening for messages');
}

main();
