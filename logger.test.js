const path = require('path');
const fs = require('fs');

const TEST_LOG_DIR = path.join(process.cwd(), 'data', 'test_logs');
const TEST_LOG_FILE = path.join(TEST_LOG_DIR, 'test.log');

jest.mock('fs');

describe('logger.js - Logging', () => {
    let logger;
    
    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
        
        fs.existsSync.mockReturnValue(true);
        fs.mkdirSync.mockReturnValue(undefined);
        fs.appendFileSync.mockReturnValue(undefined);
        
        logger = require('./src/logger');
    });

    afterEach(() => {
        if (fs.existsSync.mock.calls.length > 0) {
            try {
                fs.unlinkSync(TEST_LOG_FILE);
                fs.rmdirSync(TEST_LOG_DIR);
            } catch (e) {}
        }
    });

    test('info should log message', () => {
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
        logger.info('Test info message');
        expect(consoleSpy).toHaveBeenCalledWith('Test info message');
        consoleSpy.mockRestore();
    });

    test('success should log success message', () => {
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
        logger.success('Test success message');
        expect(consoleSpy).toHaveBeenCalledWith('Test success message');
        consoleSpy.mockRestore();
    });

    test('debug should log debug message', () => {
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
        logger.debug('Test debug message');
        expect(consoleSpy).toHaveBeenCalledWith('Test debug message');
        consoleSpy.mockRestore();
    });

    test('warn should log warning message', () => {
        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
        logger.warn('Test warn message');
        expect(consoleSpy).toHaveBeenCalledWith('Test warn message');
        consoleSpy.mockRestore();
    });

    test('warn should log warning with error object', () => {
        const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
        const error = new Error('Test error');
        logger.warn('Test warn with error', error);
        expect(consoleSpy).toHaveBeenCalled();
        consoleSpy.mockRestore();
    });

    test('error should log error message', () => {
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
        logger.error('Test error message');
        expect(consoleSpy).toHaveBeenCalledWith('Test error message');
        consoleSpy.mockRestore();
    });

    test('error should log error with error object', () => {
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
        const error = new Error('Test error');
        error.code = 'TEST_CODE';
        error.response = { body: { error_code: 409, description: 'Test description' } };
        
        logger.error('Test error with object', error);
        expect(consoleSpy).toHaveBeenCalled();
        consoleSpy.mockRestore();
    });

    test('error should handle file write failure', () => {
        fs.appendFileSync.mockImplementation(() => {
            throw new Error('Write error');
        });
        
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
        expect(() => logger.error('Test')).not.toThrow();
        consoleSpy.mockRestore();
    });
});
