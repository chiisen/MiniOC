const TelegramBot = require('node-telegram-bot-api');
const { processMessage } = require('./ai');
const { getChatHistory, addMessage } = require('./db');

let bot;

async function initBot() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
        throw new Error('TELEGRAM_BOT_TOKEN is not set in .env');
    }

    const botOptions = {
        polling: {
            autoStart: false  // 先不自動啟動，等清除 webhook 後再手動啟動
        },
        request: {
            forever: false,
            timeout: 30000,
            family: 4
        }
    };

    bot = new TelegramBot(token, botOptions);

    // 啟動 polling 前先清除可能殘留的 webhook，避免 409 衝突
    try {
        await bot.deleteWebHook();
        console.log('✅ Webhook cleared, starting polling...');
    } catch (err) {
        console.warn('⚠️ Failed to delete webhook:', err.message);
    }

    // 現在才啟動 polling
    bot.startPolling();

    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const text = msg.text;
        const userId = msg.from.id;

        if (!text) return;
        if (text.startsWith('/')) return;

        console.log(`📩 Received message from ${userId}: ${text}`);

        try {
            await bot.sendChatAction(chatId, 'typing');

            const history = getChatHistory(userId);

            const response = await processMessage(userId, text, history);

            const cleanResponse = response.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '').trim();

            addMessage(userId, 'user', text);
            addMessage(userId, 'assistant', cleanResponse);

            await bot.sendMessage(chatId, cleanResponse, { parse_mode: 'Markdown' });

            console.log(`📤 Sent response to ${userId}`);
        } catch (error) {
            console.error('❌ Error processing message:', error);
            await bot.sendMessage(chatId, 'Sorry, something went wrong. Please try again.');
        }
    });

    bot.on('polling_error', (error) => {
        if (error.code === 409) {
            console.warn('⚠️ 409 Conflict: 有其他 Bot 實例正在運行，請檢查是否有重複進程');
            return;
        }
        console.error('❌ Polling error:', error);
    });

    // Graceful shutdown — 確保舊的 polling 連線在進程退出前正確關閉
    const gracefulShutdown = (signal) => {
        console.log(`🛑 Received ${signal}, stopping bot...`);
        bot.stopPolling().then(() => {
            console.log('✅ Polling stopped, exiting.');
            process.exit(0);
        }).catch(() => {
            process.exit(1);
        });
    };

    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

    return bot;
}

function getBot() {
    return bot;
}

module.exports = { initBot, getBot };
