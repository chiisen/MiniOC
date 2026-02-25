const TelegramBot = require('node-telegram-bot-api');
const { processMessage } = require('./ai');
const { getChatHistory, addMessage } = require('./db');

let bot;

async function initBot() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
        throw new Error('TELEGRAM_BOT_TOKEN is not set in .env');
    }

    console.log('🤖 Initializing bot...');
    const botOptions = {
        polling: {
            autoStart: false
        },
        request: {
            timeout: 10000,
            family: 4
        }
    };

    bot = new TelegramBot(token, botOptions);
    console.log('📡 Bot instance created');

    // 測試 Bot 連接（10秒超時）
    try {
        const me = await Promise.race([
            bot.getMe(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000))
        ]);
        console.log(`✅ Bot connected: @${me.username} (${me.first_name})`);
    } catch (err) {
        console.error('❌ Failed to connect bot:', err.message);
        throw err;
    }

    // 啟動 polling 前先清除可能殘留的 webhook，避免 409 衝突
    // 使用 setWebhook → deleteWebhook 強制重置狀態
    try {
        await Promise.race([
            bot.setWebHook(''),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000))
        ]);
        await Promise.race([
            bot.deleteWebHook(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000))
        ]);
        
        console.log('⏳ Waiting for Telegram to release polling lock...');
        await new Promise(r => setTimeout(r, 5000));
        
        // 嘗試獲取所有待處理的 updates 並清除
        try {
            const updates = await Promise.race([
                bot.getUpdates({ limit: 100, timeout: 30 }),
                new Promise((resolve) => setTimeout(() => resolve([]), 35000))
            ]);
            if (updates && updates.length > 0) {
                const lastUpdateId = updates[updates.length - 1].update_id;
                await bot.getUpdates({ offset: lastUpdateId + 1, limit: 1 });
                console.log(`✅ Cleared ${updates.length} pending updates (last offset: ${lastUpdateId + 1})`);
            } else {
                console.log('✅ No pending updates');
            }
        } catch (e) {
            console.warn('⚠️ Failed to clear pending updates:', e.message);
        }
        
        console.log('✅ Webhook cleared, starting polling...');
    } catch (err) {
        console.warn('⚠️ Failed to reset webhook:', err.message);
    }

    // 啟動 polling
    bot.startPolling();
    console.log('✅ Polling started, waiting for messages...');

    // 測試命令：模擬 409 錯誤
    bot.onText(/\/test409/, async (msg) => {
        const chatId = msg.chat.id;
        console.log('🧪 Testing 409 recovery...');
        await bot.sendMessage(chatId, '🧪 開始測試 409 錯誤處理...');

        const error = new Error('409 Conflict: terminated by other getUpdates request');
        error.code = 409;

        if (error.code === 409) {
            console.warn('⚠️ 409 Conflict: 嘗試重置 polling 狀態...');
            try {
                await bot.stopPolling();
                await bot.deleteWebHook();
                await bot.startPolling();
                console.log('✅ Polling restarted after 409');
                await bot.sendMessage(chatId, '✅ 409 錯誤處理測試成功！Polling 已重啟。');
            } catch (err) {
                console.error('❌ Failed to recover from 409:', err.message);
                await bot.sendMessage(chatId, '❌ 409 錯誤處理測試失敗: ' + err.message);
            }
            return;
        }
    });

    // 手動重置命令
    bot.onText(/\/reset/, async (msg) => {
        const chatId = msg.chat.id;
        console.log('🔄 Manual reset requested...');
        await bot.sendMessage(chatId, '🔄 正在重置 Bot...');
        
        try {
            await bot.stopPolling();
            await bot.deleteWebHook();
            
            try {
                const updates = await bot.getUpdates({ limit: 1, timeout: 1 });
                if (updates.length > 0) {
                    const lastUpdateId = updates[updates.length - 1].update_id;
                    await bot.getUpdates({ offset: lastUpdateId + 1, limit: 1 });
                }
            } catch (e) {}
            
            await bot.startPolling();
            await bot.sendMessage(chatId, '✅ Bot 重置完成！');
        } catch (err) {
            await bot.sendMessage(chatId, '❌ 重置失敗: ' + err.message);
        }
    });

    bot.on('message', async (msg) => {
        console.log('📨 Raw message received:', JSON.stringify(msg).substring(0, 200));
        const chatId = msg.chat.id;
        const text = msg.text;
        const userId = msg.from.id;

        if (!text) {
            console.log('📭 No text in message, ignoring');
            return;
        }
        if (text.startsWith('/')) {
            console.log('📝 Command detected, ignoring');
            return;
        }

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

    bot.on('polling_error', async (error) => {
        const is409 = error.code === 409 || (error.response && error.response.body && error.response.body.error_code === 409);
        if (is409) {
            console.warn('⚠️ 409 Conflict: 嘗試重置 polling 狀態...');
            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    console.log(`🔄 Recovery attempt ${attempt}/3...`);
                    await bot.stopPolling();
                    await bot.deleteWebHook();
                    
                    await new Promise(r => setTimeout(r, 3000));
                    
                    try {
                        const updates = await bot.getUpdates({ limit: 100, timeout: 30 });
                        if (updates && updates.length > 0) {
                            const lastUpdateId = updates[updates.length - 1].update_id;
                            await bot.getUpdates({ offset: lastUpdateId + 1, limit: 1 });
                        }
                    } catch (e) {}
                    
                    await bot.startPolling();
                    console.log('✅ Polling restarted after 409');
                    return;
                } catch (err) {
                    console.warn(`⚠️ Recovery attempt ${attempt} failed:`, err.message);
                    if (attempt < 3) {
                        await new Promise(r => setTimeout(r, 5000));
                    }
                }
            }
            console.error('❌ All recovery attempts failed');
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
