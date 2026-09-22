require('dotenv').config();
const logger = require('../utils/logger');

/**
 * Validates environment variables and secrets on server bootstrap with fail-fast diagnostics.
 * @param {Object} [options]
 * @param {boolean} [options.exitOnError=true] - Whether to call process.exit(1) on failure.
 * @returns {{ isValid: boolean, errors: Array<{ field: string, reason: string }> }}
 */
function validateEnv(options = {}) {
    const isProduction = process.env.NODE_ENV === 'production';
    const isTest = process.env.NODE_ENV === 'test';
    const exitOnError = options.exitOnError !== undefined 
        ? options.exitOnError 
        : (isProduction || (!isTest && require.main === module));

    const errors = [];

    // 1. DATABASE_URL
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
        errors.push({
            field: 'DATABASE_URL',
            reason: 'Missing required database connection string'
        });
    } else if (!dbUrl.startsWith('mysql://') && !dbUrl.startsWith('mysqlx://')) {
        errors.push({
            field: 'DATABASE_URL',
            reason: "Must be a valid MySQL connection URI (starts with 'mysql://')"
        });
    }

    // 2. PORT
    if (process.env.PORT) {
        const port = parseInt(process.env.PORT, 10);
        if (isNaN(port) || port < 1 || port > 65535) {
            errors.push({
                field: 'PORT',
                reason: 'Must be an integer between 1 and 65535'
            });
        }
    }

    // 3. Production-specific strict security checks
    if (isProduction) {
        // JWT_SECRET
        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
            errors.push({
                field: 'JWT_SECRET',
                reason: 'Missing required secret in production'
            });
        } else if (jwtSecret.length < 64) {
            errors.push({
                field: 'JWT_SECRET',
                reason: 'Must be at least 64 characters long in production'
            });
        }

        // API_KEY_SECRET
        if (!process.env.API_KEY_SECRET) {
            errors.push({
                field: 'API_KEY_SECRET',
                reason: 'Missing required API key hashing secret in production'
            });
        }

        // ENCRYPTION_KEY (AES-256-GCM requires 32 bytes = 64 hex chars)
        const encKey = process.env.ENCRYPTION_KEY;
        if (!encKey) {
            errors.push({
                field: 'ENCRYPTION_KEY',
                reason: 'Missing required encryption key in production'
            });
        } else if (encKey.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(encKey)) {
            errors.push({
                field: 'ENCRYPTION_KEY',
                reason: 'Must be a 64-character hex string (32 bytes, e.g. via `openssl rand -hex 32`)'
            });
        }

        // CORS_ORIGIN
        if (!process.env.CORS_ORIGIN || process.env.CORS_ORIGIN.trim() === '') {
            errors.push({
                field: 'CORS_ORIGIN',
                reason: 'Missing required CORS origin list in production'
            });
        }
    } else {
        // In non-production, if ENCRYPTION_KEY is supplied, ensure format is valid
        const encKey = process.env.ENCRYPTION_KEY;
        if (encKey && (encKey.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(encKey))) {
            logger.warn('[envValidator] ENCRYPTION_KEY is present but not a 64-hex char string; runtime field encryption will fail.');
        }
    }

    // 4. Chatwoot conditional dependencies
    if (process.env.CHATWOOT_ENABLED === 'true') {
        const requiredChatwoot = [
            { key: 'CHATWOOT_BASE_URL', desc: 'Chatwoot base URL' },
            { key: 'CHATWOOT_ACCOUNT_ID', desc: 'Chatwoot account ID' },
            { key: 'CHATWOOT_INBOX_ID', desc: 'Chatwoot inbox ID' },
            { key: 'CHATWOOT_API_ACCESS_TOKEN', desc: 'Chatwoot API access token' }
        ];
        for (const item of requiredChatwoot) {
            if (!process.env[item.key]) {
                errors.push({
                    field: item.key,
                    reason: `Required when CHATWOOT_ENABLED is 'true' (${item.desc})`
                });
            }
        }
    }

    // Handle results
    if (errors.length > 0) {
        const diagnosticMessage = formatDiagnosticTable(errors);
        console.error(diagnosticMessage);
        logger.error(`[envValidator] Bootstrap validation failed with ${errors.length} error(s).`);

        if (exitOnError) {
            process.exit(1);
        } else {
            const errSummary = errors.map(e => `${e.field}: ${e.reason}`).join('; ');
            throw new Error(`Environment validation failed: ${errSummary}`);
        }

        return { isValid: false, errors };
    }

    logger.info('[envValidator] Environment validation passed successfully.');
    return { isValid: true, errors: [] };
}

/**
 * Formats an ASCII diagnostic table for bootstrap errors
 */
function formatDiagnosticTable(errors) {
    const pad = (str, len) => (str + ' '.repeat(len)).slice(0, len);
    const border = '='.repeat(70);
    const divider = '-'.repeat(70);

    const lines = [
        border,
        '[CONFIG VALIDATION ERROR] Server failed to bootstrap',
        border,
        'The following environment variables are invalid or missing:',
        '',
        `${pad('Field:', 25)} ${pad('Reason:', 44)}`,
        divider
    ];

    for (const err of errors) {
        lines.push(`${pad(err.field, 25)} ${err.reason}`);
    }

    lines.push(divider);
    lines.push('Remediation: Fix the issues above in your .env file or server environment.');
    lines.push(border);

    return lines.join('\n');
}

module.exports = {
    validateEnv,
    formatDiagnosticTable
};
