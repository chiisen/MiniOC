const { buildPrompt } = require('./src/ai');

describe('ai.js - buildPrompt', () => {
    test('buildPrompt should format user message correctly', () => {
        const prompt = buildPrompt(123, 'Hello', []);
        expect(prompt).toBe('User: Hello\nPlease provide a short response:');
    });

    test('buildPrompt should handle empty message', () => {
        const prompt = buildPrompt(123, '', []);
        expect(prompt).toBe('User: \nPlease provide a short response:');
    });

    test('buildPrompt should include history count', () => {
        const history = [
            { role: 'user', content: 'Hi' },
            { role: 'assistant', content: 'Hello!' }
        ];
        const prompt = buildPrompt(123, 'How are you?', history);
        expect(prompt).toContain('User: How are you?');
        expect(prompt).toContain('Please provide a short response:');
    });

    test('buildPrompt should handle special characters in message', () => {
        const prompt = buildPrompt(123, 'Hello <world> & "test"', []);
        expect(prompt).toContain('User: Hello <world> & "test"');
    });

    test('buildPrompt should handle multiline message', () => {
        const prompt = buildPrompt(123, 'Line 1\nLine 2\nLine 3', []);
        expect(prompt).toContain('Line 1');
        expect(prompt).toContain('Line 2');
        expect(prompt).toContain('Line 3');
    });
});
