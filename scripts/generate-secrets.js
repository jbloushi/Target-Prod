const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function generateSecret(length = 32) {
    return crypto.randomBytes(length).toString('hex');
}

function updateEnvFile(envPath, secrets) {
    if (!fs.existsSync(envPath)) {
        console.log(`[WARN] .env file not found at ${envPath}. Creating new one...`);
        fs.writeFileSync(envPath, '');
    }

    let content = fs.readFileSync(envPath, 'utf8');
    let updated = false;

    for (const [key, value] of Object.entries(secrets)) {
        const regex = new RegExp(`^${key}=.*`, 'm');
        if (regex.test(content)) {
            // Only update if it contains 'changeme' or is empty
            if (content.match(new RegExp(`^${key}=.*(changeme|placeholder|TODO).*`, 'm'))) {
                content = content.replace(regex, `${key}=${value}`);
                console.log(`[INFO] Updated ${key} with a secure random value.`);
                updated = true;
            } else {
                console.log(`[SKIP] ${key} already has a custom value. Skipping.`);
            }
        } else {
            content += `\n${key}=${value}`;
            console.log(`[INFO] Added ${key} with a secure random value.`);
            updated = true;
        }
    }

    if (updated) {
        fs.writeFileSync(envPath, content.trim() + '\n');
        console.log(`[SUCCESS] .env file updated at ${envPath}`);
    } else {
        console.log(`[OK] No changes needed for .env`);
    }
}

const rootEnv = path.join(__dirname, '../.env');
const backendEnv = path.join(__dirname, '../backend/.env');

const secrets = {
    JWT_SECRET: generateSecret(32),
    ENCRYPTION_KEY: generateSecret(32),
    DB_PASSWORD: generateSecret(16)
};

console.log('--- Secure Secret Generator ---');
updateEnvFile(rootEnv, secrets);
updateEnvFile(backendEnv, secrets);
console.log('-------------------------------');
