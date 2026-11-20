const AUTH_COOKIE_BASE = 'target_session';

const isProduction = () => process.env.NODE_ENV === 'production';

function getAuthCookieName() {
    return isProduction() ? `__Host-${AUTH_COOKIE_BASE}` : AUTH_COOKIE_BASE;
}

function getCookieValue(req, name) {
    const cookieHeader = req.headers?.cookie || '';
    for (const part of cookieHeader.split(';')) {
        const separator = part.indexOf('=');
        if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
        try {
            return decodeURIComponent(part.slice(separator + 1).trim());
        } catch (_) {
            return null;
        }
    }
    return null;
}

function getAuthToken(req) {
    const authorization = req.headers?.authorization || '';
    if (/^Bearer\s+/i.test(authorization)) return authorization.replace(/^Bearer\s+/i, '').trim();
    return getCookieValue(req, getAuthCookieName());
}

function getAuthCookieOptions(token) {
    const decoded = require('jsonwebtoken').decode(token);
    const expiresAt = Number(decoded?.exp) * 1000;
    return {
        httpOnly: true,
        secure: isProduction(),
        sameSite: 'strict',
        path: '/',
        ...(Number.isFinite(expiresAt) && expiresAt > Date.now() ? { maxAge: expiresAt - Date.now() } : {})
    };
}

function setAuthCookie(res, token) {
    res.cookie(getAuthCookieName(), token, getAuthCookieOptions(token));
}

function clearAuthCookie(res) {
    const options = getAuthCookieOptions('');
    delete options.maxAge;
    res.clearCookie(getAuthCookieName(), options);
}

function getTrustedBrowserOrigins() {
    const configured = [process.env.FRONTEND_URL, process.env.PUBLIC_TRACKING_BASE_URL, process.env.CORS_ORIGIN]
        .filter(Boolean)
        .flatMap((value) => value.split(','));
    const canonical = [
        'https://target-kw.com',
        'https://www.target-kw.com',
        'https://target-logistics.com',
        'https://www.target-logistics.com'
    ];
    const local = !isProduction() ? ['http://localhost:5173', 'http://127.0.0.1:5173'] : [];
    return new Set([...configured, ...canonical, ...local].map((value) => {
        try { return new URL(value.trim()).origin.toLowerCase(); } catch (_) { return ''; }
    }).filter(Boolean));
}

function isTrustedBrowserOrigin(origin) {
    if (!origin) return false;
    try {
        const parsed = new URL(origin);
        if (isProduction() && parsed.protocol !== 'https:') return false;
        return getTrustedBrowserOrigins().has(parsed.origin.toLowerCase());
    } catch (_) {
        return false;
    }
}

module.exports = {
    getAuthCookieName,
    getAuthToken,
    getAuthCookieOptions,
    setAuthCookie,
    clearAuthCookie,
    isTrustedBrowserOrigin
};
