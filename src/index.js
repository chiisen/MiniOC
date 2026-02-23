require('dotenv').config();
const { initBot } = require('./bot');
const { initDatabase, clearAllConversations } = require('./db');

async function main() {
    console.log('🤖 Starting Telegram AI Agent...');

    initDatabase();
    clearAllConversations();
    console.log('✅ Database initialized and cleared');

    await initBot();
    console.log('✅ Bot started and listening for messages');
}

main().catch(err => {
    console.error('❌ Failed to start:', err);
    process.exit(1);
});
