/**
 * Tests for production startup guards and security configuration.
 * These cover the HIGH findings from the security audit.
 */

// Prevent dotenv from reading the real .env file during these tests so we
// can control the environment precisely.
jest.mock('dotenv', () => ({ config: jest.fn() }));

describe('production env validation', () => {
    const validProdEnv = {
        NODE_ENV: 'production',
        DATABASE_URL: 'mysql://u:p@host/db',
        JWT_SECRET: 'a'.repeat(64),
        API_KEY_SECRET: 'secret',
        ENCRYPTION_KEY: 'key',
        DHL_API_KEY: 'dhl-key',
        DHL_API_SECRET: 'dhl-secret',
        CORS_ORIGIN: 'https://app.example.com',
    };

    let savedEnv;

    beforeEach(() => {
        savedEnv = { ...process.env };
        // Strip all keys we control so nothing bleeds through
        Object.keys(validProdEnv).forEach(k => delete process.env[k]);
        jest.resetModules();
    });

    afterEach(() => {
        // Restore original env
        Object.keys(validProdEnv).forEach(k => delete process.env[k]);
        Object.assign(process.env, savedEnv);
        jest.resetModules();
    });

    function loadConfig(envOverrides = {}) {
        Object.assign(process.env, envOverrides);
        return require('../src/config/config');
    }

    it('starts successfully with all required production vars set', () => {
        expect(() => loadConfig(validProdEnv)).not.toThrow();
    });

    it('throws if CORS_ORIGIN is missing in production', () => {
        const env = { ...validProdEnv };
        delete env.CORS_ORIGIN;
        expect(() => loadConfig(env)).toThrow(/CORS_ORIGIN/);
    });

    it('throws if JWT_SECRET is missing in production', () => {
        const env = { ...validProdEnv };
        delete env.JWT_SECRET;
        expect(() => loadConfig(env)).toThrow(/JWT_SECRET/);
    });

    it('throws if JWT_SECRET is shorter than 64 chars in production', () => {
        expect(() => loadConfig({ ...validProdEnv, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
    });

    it('does not throw when NODE_ENV is not production (dev default)', () => {
        expect(() => loadConfig({ NODE_ENV: 'development' })).not.toThrow();
    });

    it('corsOrigin defaults to empty string (not wildcard) when CORS_ORIGIN is unset', () => {
        const config = loadConfig({ NODE_ENV: 'development' });
        expect(config.corsOrigin).toBe('');
        expect(config.corsOrigin).not.toBe('*');
    });
});
