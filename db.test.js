const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const TEST_DB_PATH = path.join(process.cwd(), 'data', 'test_conversation.db');

describe('db.js - Database Operations', () => {
    let db;
    let dbModule;

    beforeAll(() => {
        if (fs.existsSync(TEST_DB_PATH)) {
            fs.unlinkSync(TEST_DB_PATH);
        }
        jest.resetModules();
        jest.doMock('better-sqlite3', () => {
            return jest.fn().mockImplementation(() => {
                const instance = new Database(TEST_DB_PATH);
                return instance;
            });
        });
        dbModule = require('./src/db');
    });

    afterAll(() => {
        if (fs.existsSync(TEST_DB_PATH)) {
            fs.unlinkSync(TEST_DB_PATH);
        }
    });

    test('initDatabase should create database and tables', () => {
        db = dbModule.initDatabase();
        expect(db).toBeDefined();
        
        const stmt = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='conversations'");
        const table = stmt.get();
        expect(table).toBeDefined();
    });

    test('addMessage should insert message into database', () => {
        dbModule.addMessage(123, 'user', 'Hello AI');
        dbModule.addMessage(123, 'assistant', 'Hello User');
        
        const history = dbModule.getChatHistory(123);
        expect(history.length).toBe(2);
        expect(history[0].role).toBe('user');
        expect(history[0].content).toBe('Hello AI');
    });

    test('getChatHistory should return correct messages', () => {
        const history = dbModule.getChatHistory(123, 1);
        expect(history.length).toBe(1);
    });

    test('clearChatHistory should delete user messages', () => {
        dbModule.clearChatHistory(123);
        const history = dbModule.getChatHistory(123);
        expect(history.length).toBe(0);
    });

    test('clearAllConversations should delete all messages', () => {
        dbModule.addMessage(1, 'user', 'Test 1');
        dbModule.addMessage(2, 'user', 'Test 2');
        dbModule.clearAllConversations();
        
        const history1 = dbModule.getChatHistory(1);
        const history2 = dbModule.getChatHistory(2);
        expect(history1.length).toBe(0);
        expect(history2.length).toBe(0);
    });

    test('closeDatabase should close database connection', () => {
        dbModule.closeDatabase();
        const closedDb = dbModule.getDatabase();
        expect(closedDb.open).toBe(false);
    });
});
