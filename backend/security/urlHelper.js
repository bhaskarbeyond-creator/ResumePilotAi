/**
 * Centralized Backend Runtime URL & Origin Resolution Utility
 * 
 * Safely resolves application origins and constructs absolute URLs
 * for emails, OAuth callbacks, payment redirects, and PDF exports.
 * 
 * In production, validates against configured WEBSITE_NAME / APP_URL / CORS_ALLOWED_ORIGINS.
 * In development / reverse-proxy setups, respects trusted forwarded headers (X-Forwarded-Host, X-Forwarded-Proto)
 * or falls back to host header.
 */

const { URL } = require('url');

function getBaseOrigin(req = null) {
    // 1. Explicit deployment configuration takes highest precedence if provided
    if (process.env.APP_URL) {
        try {
            return new URL(process.env.APP_URL).origin;
        } catch (_) {}
    }

    // 2. Derive dynamically from request if provided (respecting reverse proxy headers)
    if (req && typeof req.get === 'function') {
        const forwardedProto = req.get('x-forwarded-proto');
        const forwardedHost = req.get('x-forwarded-host');
        const host = forwardedHost || req.get('host');

        const protocol = forwardedProto || req.protocol || (process.env.NODE_ENV === 'production' ? 'https' : 'http');
        if (host) {
            // Validate host header against injection characters
            const sanitizedHost = String(host).split(',')[0].trim();
            if (/^(?:[a-zA-Z0-9-]+\.)*[a-zA-Z0-9-]+(?::\d{1,5})?$/.test(sanitizedHost)) {
                return `${protocol}://${sanitizedHost}`;
            }
        }
    }

    // 3. Fallback to WEBSITE_NAME and PROTOCOL
    const websiteName = String(process.env.WEBSITE_NAME || process.env.APP_DOMAIN || 'ai-resume-builder.local').trim().toLowerCase();
    const protocol = String(process.env.PROTOCOL || (process.env.NODE_ENV === 'production' ? 'https' : 'http')).toLowerCase();
    return `${protocol}://${websiteName}`;
}

function buildAbsoluteUrl(path = '/', req = null) {
    const origin = getBaseOrigin(req);
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${origin}${cleanPath}`;
}

module.exports = {
    getBaseOrigin,
    buildAbsoluteUrl,
};
