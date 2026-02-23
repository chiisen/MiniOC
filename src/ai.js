const { spawn } = require('child_process');

function buildPrompt(userId, message, history) {
    return `User: ${message}\nPlease provide a short response:`;
}

async function processMessage(userId, message, history) {
    const prompt = buildPrompt(userId, message, history);

    return new Promise((resolve, reject) => {
        console.log(`🚀 Running opencode...`);

        const args = ['run', '--format', 'json', '--', prompt];

        const customEnv = {
            ...process.env,
            ANTHROPIC_BASE_URL: process.env.MINIOC_BASE_URL,
            ANTHROPIC_AUTH_TOKEN: process.env.MINIOC_API_KEY,
            OPENCODE_MODEL: process.env.MINIOC_MODEL
        };

        console.log(`📝 ENV - API_KEY: ${customEnv.ANTHROPIC_AUTH_TOKEN ? 'set' : 'MISSING'}`);
        console.log(`📝 ENV - BASE_URL: ${customEnv.ANTHROPIC_BASE_URL || 'NOT SET'}`);
        console.log(`📝 ENV - MODEL: ${customEnv.OPENCODE_MODEL || 'NOT SET'}`);

        const child = spawn('opencode', args, { env: customEnv });
        
        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        child.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        child.on('close', (code) => {
            if (code !== 0 && stdout.includes('Positionals:')) {
                console.error('❌ stdout:', stdout);
                console.error('❌ stderr:', stderr);
                reject(new Error(stderr || 'opencode failed'));
                return;
            }
            
            const cleanOutput = stdout.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '').trim();
            resolve(cleanOutput);
        });

        setTimeout(() => {
            child.kill();
            reject(new Error('opencode timed out after 60 seconds'));
        }, 60000);
    });
}

module.exports = { processMessage, buildPrompt };
