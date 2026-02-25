const { spawn } = require('child_process');
const logger = require('./logger');

function buildPrompt(userId, message, history) {
    return `User: ${message}\nPlease provide a short response:`;
}

async function processMessage(userId, message, history) {
    const prompt = buildPrompt(userId, message, history);
    
    return new Promise((resolve, reject) => {
        logger.info(`Processing message for user ${userId}`);
        
        const args = ['run', '--format', 'json', '--', prompt];

        const customEnv = {
            ...process.env,
            ANTHROPIC_BASE_URL: process.env.MINIOC_BASE_URL,
            ANTHROPIC_AUTH_TOKEN: process.env.MINIOC_API_KEY,
            OPENCODE_MODEL: process.env.MINIOC_MODEL
        };

        logger.debug(`ENV - API_KEY: ${customEnv.ANTHROPIC_AUTH_TOKEN ? 'set' : 'MISSING'}`);
        logger.debug(`ENV - BASE_URL: ${customEnv.ANTHROPIC_BASE_URL || 'NOT SET'}`);
        logger.debug(`ENV - MODEL: ${customEnv.OPENCODE_MODEL || 'NOT SET'}`);

        if (!customEnv.ANTHROPIC_AUTH_TOKEN && !process.env.NODE_ENV?.includes('test')) {
            reject(new Error('MINIOC_API_KEY is not set in .env'));
            return;
        }

        const child = spawn('opencode', args, { env: customEnv });
        
        let stdout = '';
        let stderr = '';
        let timeoutId;

        child.on('error', (error) => {
            clearTimeout(timeoutId);
            const errorMsg = error?.message || 'Unknown error';
            logger.error(`Failed to spawn opencode process: ${errorMsg}`, error);
            logger.error('Possible causes: opencode not installed or not in PATH');
            logger.error('Solution: Run "curl -fsSL https://opencode.ai/install | bash" to install opencode');
            reject(new Error(`Failed to spawn opencode: ${errorMsg}`));
        });

        child.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        child.stderr.on('data', (data) => {
            stderr += data.toString();
            logger.debug(`opencode stderr: ${data.toString()}`);
        });

        child.on('close', (code) => {
            clearTimeout(timeoutId);
            
            if (code !== 0) {
                logger.error(`opencode exited with code ${code}`);
                
                if (stdout.includes('Positionals:')) {
                    logger.error('opencode command format error');
                    logger.error(`stdout: ${stdout}`);
                    logger.error(`stderr: ${stderr}`);
                    reject(new Error(stderr || `opencode failed with exit code ${code}`));
                    return;
                }
                
                if (stderr.includes('authentication') || stderr.includes('auth')) {
                    logger.error('Authentication failed - check MINIOC_API_KEY');
                    reject(new Error('Authentication failed - please check MINIOC_API_KEY'));
                    return;
                }
                
                if (stderr.includes('rate limit')) {
                    logger.error('Rate limit exceeded - wait before retrying');
                    reject(new Error('Rate limit exceeded - please wait and try again'));
                    return;
                }
                
                reject(new Error(stderr || `opencode failed with exit code ${code}`));
                return;
            }
            
            logger.success(`opencode completed successfully for user ${userId}`);
            const cleanOutput = stdout.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '').trim();
            resolve(cleanOutput);
        });

        timeoutId = setTimeout(() => {
            child.kill();
            logger.error('opencode timed out after 60 seconds');
            logger.error('Possible causes: model is slow to respond or network issues');
            logger.error('Solution: Try again or check network connection');
            reject(new Error('opencode timed out after 60 seconds'));
        }, 60000);
    });
}

module.exports = { processMessage, buildPrompt };
