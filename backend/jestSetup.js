// Provide minimal env vars required for module loading in tests.
// These are test-only values — never used in production.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'a'.repeat(64);
process.env.API_KEY_SECRET = process.env.API_KEY_SECRET || 'test-api-key-secret';
process.env.DHL_API_URL = process.env.DHL_API_URL || 'https://express.api.dhl.com/mydhlapi/test';
