const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(process.cwd(), 'data', 'conversation.db');
let db;

function initDatabase() {
    const dbDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }

    db = new Database(DB_PATH);
    
    db.exec(`
        CREATE TABLE IF NOT EXISTS conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE INDEX IF NOT EXISTS idx_user_id ON conversations(user_id);
        CREATE INDEX IF NOT EXISTS idx_timestamp ON conversations(timestamp);
    `);

    return db;
}

function getDatabase() {
    return db;
}

function addMessage(userId, role, content) {
    const stmt = db.prepare('INSERT INTO conversations (user_id, role, content) VALUES (?, ?, ?)');
    stmt.run(userId, role, content);
}

function getChatHistory(userId, limit = 20) {
    const stmt = db.prepare(`
        SELECT role, content 
        FROM conversations 
        WHERE user_id = ? 
        ORDER BY timestamp ASC 
        LIMIT ?
    `);
    return stmt.all(userId, limit);
}

function clearChatHistory(userId) {
    const stmt = db.prepare('DELETE FROM conversations WHERE user_id = ?');
    stmt.run(userId);
}

function clearAllConversations() {
    db.exec('DELETE FROM conversations');
}

function closeDatabase() {
    if (db) {
        db.close();
    }
}

module.exports = {
    initDatabase,
    getDatabase,
    addMessage,
    getChatHistory,
    clearChatHistory,
    clearAllConversations,
    closeDatabase
};
