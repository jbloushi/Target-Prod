const {
    getAuthCookieName,
    getAuthToken,
    getAuthCookieOptions,
    isTrustedBrowserOrigin
} = require('../src/utils/authCookies');
const jwt = require('jsonwebtoken');

describe('browser session cookie security', () => {
    const originalEnv = process.env.NODE_ENV;
    const originalFrontendUrl = process.env.FRONTEND_URL;
    const originalCorsOrigin = process.env.CORS_ORIGIN;

    afterEach(() => {
        process.env.NODE_ENV = originalEnv;
        if (originalFrontendUrl === undefined) delete process.env.FRONTEND_URL;
        else process.env.FRONTEND_URL = originalFrontendUrl;
        if (originalCorsOrigin === undefined) delete process.env.CORS_ORIGIN;
        else process.env.CORS_ORIGIN = originalCorsOrigin;
    });

    it('uses host-only, Secure, HttpOnly, Strict cookies in production', () => {
        process.env.NODE_ENV = 'production';
        const cookie = getAuthCookieOptions(jwt.sign({ id: 'user' }, 'test-secret', { expiresIn: '1h' }));
        expect(getAuthCookieName()).toBe('__Host-target_session');
        expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: 'strict', path: '/' });
        expect(cookie.domain).toBeUndefined();
    });

    it('reads the session from the HttpOnly cookie and retains header compatibility', () => {
        process.env.NODE_ENV = 'test';
        expect(getAuthToken({ headers: { cookie: 'theme=dark; target_session=cookie%2Etoken' } })).toBe('cookie.token');
        expect(getAuthToken({ headers: { authorization: 'Bearer header.token', cookie: 'target_session=cookie.token' } })).toBe('header.token');
    });

    it('allows only configured/canonical trusted origins in production', () => {
        process.env.NODE_ENV = 'production';
        process.env.FRONTEND_URL = 'https://portal.example.test';
        expect(isTrustedBrowserOrigin('https://portal.example.test')).toBe(true);
        expect(isTrustedBrowserOrigin('https://evil.target-kw.com')).toBe(false);
        expect(isTrustedBrowserOrigin('http://target-kw.com')).toBe(false);
    });
});
