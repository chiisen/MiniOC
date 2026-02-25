const { processMessage, buildPrompt } = require('./src/ai');

jest.mock('child_process', () => ({
    spawn: jest.fn()
}));

const { spawn } = require('child_process');

describe('ai.js - processMessage', () => {
    beforeEach(() => {
        spawn.mockReset();
        process.env.MINIOC_API_KEY = 'test-key';
        process.env.MINIOC_BASE_URL = 'https://test.api';
        process.env.MINIOC_MODEL = 'opencode/test-model';
    });

    test('processMessage should call opencode with correct prompt', async () => {
        const mockChild = {
            stdout: { on: jest.fn((event, cb) => cb('Hello from AI')) },
            stderr: { on: jest.fn() },
            on: jest.fn((event, cb) => {
                if (event === 'close') cb(0);
            })
        };
        spawn.mockReturnValue(mockChild);

        const history = [{ role: 'user', content: 'Hi' }];
        const result = await processMessage(123, 'Hello', history);

        const expectedCommand = `yes | opencode "run" "--format" "json" "--model" "opencode/test-model" "--" "User: Hello\nPlease provide a short response:"`;
        expect(spawn).toHaveBeenCalledWith('sh', ['-c', expectedCommand], { env: expect.any(Object) });
        expect(result).toBe('Hello from AI');
    });

    test('processMessage should set correct environment variables', async () => {
        const mockChild = {
            stdout: { on: jest.fn((event, cb) => cb('response')) },
            stderr: { on: jest.fn() },
            on: jest.fn((event, cb) => {
                if (event === 'close') cb(0);
            })
        };
        spawn.mockReturnValue(mockChild);

        await processMessage(123, 'test', []);

        const callArgs = spawn.mock.calls[0];
        const env = callArgs[2].env;

        expect(env.ANTHROPIC_AUTH_TOKEN).toBe('test-key');
        expect(env.ANTHROPIC_BASE_URL).toBe('https://test.api');
    });

    test('processMessage should handle opencode error', async () => {
        const mockChild = {
            stdout: { on: jest.fn((event, cb) => cb('Positionals: error')) },
            stderr: { on: jest.fn((event, cb) => cb('error message')) },
            on: jest.fn((event, cb) => {
                if (event === 'close') cb(1);
            })
        };
        spawn.mockReturnValue(mockChild);

        await expect(processMessage(123, 'test', [])).rejects.toThrow('error message');
    });

    test('processMessage should clean ANSI escape codes', async () => {
        const mockChild = {
            stdout: { on: jest.fn((event, cb) => cb('\x1b[32mGreen text\x1b[0m')) },
            stderr: { on: jest.fn() },
            on: jest.fn((event, cb) => {
                if (event === 'close') cb(0);
            })
        };
        spawn.mockReturnValue(mockChild);

        const result = await processMessage(123, 'test', []);
        expect(result).toBe('Green text');
    });

    test('processMessage should timeout after 60 seconds', async () => {
        jest.useFakeTimers();

        const mockKill = jest.fn().mockReturnValue(true);
        let closeCallback;
        const mockChild = {
            stdout: { on: jest.fn() },
            stderr: { on: jest.fn() },
            on: jest.fn((event, cb) => {
                if (event === 'close') closeCallback = cb;
            }),
            kill: mockKill
        };
        spawn.mockReturnValue(mockChild);

        const promise = processMessage(123, 'test', []);

        jest.advanceTimersByTime(60001);

        await expect(promise).rejects.toThrow('opencode timed out after 60 seconds');
        expect(mockKill).toHaveBeenCalled();

        jest.useRealTimers();

        if (closeCallback) closeCallback(0);
    });

    test('processMessage should handle authentication error', async () => {
        const mockChild = {
            stdout: { on: jest.fn((event, cb) => cb('')) },
            stderr: { on: jest.fn((event, cb) => cb('authentication failed')) },
            on: jest.fn((event, cb) => {
                if (event === 'close') cb(1);
            })
        };
        spawn.mockReturnValue(mockChild);

        await expect(processMessage(123, 'test', [])).rejects.toThrow('authentication failed');
    });

    test('processMessage should handle rate limit error', async () => {
        const mockChild = {
            stdout: { on: jest.fn((event, cb) => cb('')) },
            stderr: { on: jest.fn((event, cb) => cb('rate limit exceeded')) },
            on: jest.fn((event, cb) => {
                if (event === 'close') cb(1);
            })
        };
        spawn.mockReturnValue(mockChild);

        await expect(processMessage(123, 'test', [])).rejects.toThrow('rate limit exceeded');
    });

    test('processMessage should handle generic error', async () => {
        const mockChild = {
            stdout: { on: jest.fn((event, cb) => cb('')) },
            stderr: { on: jest.fn((event, cb) => cb('some other error')) },
            on: jest.fn((event, cb) => {
                if (event === 'close') cb(1);
            })
        };
        spawn.mockReturnValue(mockChild);

        await expect(processMessage(123, 'test', [])).rejects.toThrow();
    });

    afterAll(() => {
        jest.clearAllTimers();
    });
});
