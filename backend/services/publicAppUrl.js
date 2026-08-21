'use strict';

/**
 * Canonical public application URL.
 *
 * Architectural source of truth (in order):
 *   1. PUBLIC_APP_URL / APP_PUBLIC_URL / CANONICAL_PUBLIC_URL (explicit origin)
 *   2. PROTOCOL + WEBSITE_NAME (the same pair used by OAuth, payments, and
 *      password-reset links in backend/index.js)
 *
 * Never hardcode a production, staging, or development hostname. Production
 * must generate production links; development must generate development links.
 * Placeholder / example / loopback hosts are rejected in production so we
 * fail closed instead of mailing broken CTAs.
 */

const PLACEHOLDER_HOST_EXACT = new Set([
  'localhost',
  'resumepilot.example',
  'example.com',
  'example.org',
  'example.net',
  'invalid',
  'local',
]);

function isProduction(env = process.env) {
  return String(env.NODE_ENV || '').toLowerCase() === 'production';
}

function hostnameOf(host) {
  return String(host || '').trim().toLowerCase().split(':')[0];
}

function isLoopbackHost(host) {
  const h = hostnameOf(host);
  return h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' || h === '::1' || h.endsWith('.localhost');
}

function isPlaceholderHost(host) {
  const h = hostnameOf(host);
  if (!h) return true;
  if (PLACEHOLDER_HOST_EXACT.has(h)) return true;
  if (h.endsWith('.example') || h.endsWith('.invalid') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  return isLoopbackHost(h);
}

function parseOrigin(raw, fallbackProtocol = 'https') {
  const value = String(raw || '').trim();
  if (!value) return null;
  try {
    const parsed = new URL(value.includes('://') ? value : `${fallbackProtocol}://${value}`);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    if (parsed.username || parsed.password) return null;
    if (!parsed.hostname) return null;
    return parsed;
  } catch {
    return null;
  }
}

function assertUsableOrigin(parsed, { production, source }) {
  if (!parsed) {
    throw Object.assign(new Error(`${source} is not a valid absolute HTTP(S) origin`), { code: 'PUBLIC_APP_URL_INVALID', status: 500 });
  }
  if (production && parsed.protocol !== 'https:') {
    throw Object.assign(new Error(`${source} must use https in production`), { code: 'PUBLIC_APP_URL_INVALID', status: 500 });
  }
  if (production && isPlaceholderHost(parsed.hostname)) {
    throw Object.assign(new Error(`${source} must be a real public hostname in production (not a placeholder, example, or loopback host)`), { code: 'PUBLIC_APP_URL_INVALID', status: 500 });
  }
  return parsed;
}

function resolvePublicAppOrigin(env = process.env) {
  const production = isProduction(env);
  const explicit = String(env.PUBLIC_APP_URL || env.APP_PUBLIC_URL || env.CANONICAL_PUBLIC_URL || '').trim();
  if (explicit) {
    const parsed = parseOrigin(explicit, production ? 'https' : 'http');
    assertUsableOrigin(parsed, { production, source: 'PUBLIC_APP_URL' });
    return parsed.origin;
  }

  const protocol = String(env.PROTOCOL || (production ? 'https' : 'http')).toLowerCase();
  const host = String(env.WEBSITE_NAME || '').trim().toLowerCase();
  if (host) {
    const parsed = parseOrigin(`${protocol}://${host}`, protocol);
    assertUsableOrigin(parsed, { production, source: 'WEBSITE_NAME' });
    return parsed.origin;
  }

  if (production) {
    throw Object.assign(new Error('WEBSITE_NAME or PUBLIC_APP_URL must be configured to generate public links'), { code: 'PUBLIC_APP_URL_UNCONFIGURED', status: 500 });
  }

  const port = String(env.VITE_DEV_PORT || '5173').replace(/[^0-9]/g, '') || '5173';
  return `http://localhost:${port}`;
}

function publicAppUrl(pathname = '/', query = null, env = process.env) {
  const origin = resolvePublicAppOrigin(env);
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const url = new URL(path, `${origin}/`);
  if (query && typeof query === 'object' && !Array.isArray(query)) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.href;
}

function enterpriseConsoleUrl({ tab = 'overview', tenantId = '', workspaceId = '', extra = {} } = {}, env = process.env) {
  return publicAppUrl('/enterprise', {
    tab,
    ...(tenantId ? { tenant: tenantId } : {}),
    ...(workspaceId ? { workspace: workspaceId } : {}),
    ...extra,
  }, env);
}

function sanitizeAbsoluteHttpUrl(value) {
  const parsed = parseOrigin(value);
  if (!parsed) return '';
  if (!['http:', 'https:'].includes(parsed.protocol)) return '';
  return parsed.href;
}

function assertNoForbiddenEmailHost(url, env = process.env) {
  const parsed = parseOrigin(url);
  if (!parsed) {
    throw Object.assign(new Error('Email action URL is not a valid HTTP(S) URL'), { code: 'EMAIL_ACTION_URL_INVALID', status: 500 });
  }
  const production = isProduction(env);
  if (production && parsed.protocol !== 'https:') {
    throw Object.assign(new Error('Email action URL must use https in production'), { code: 'EMAIL_ACTION_URL_INVALID', status: 500 });
  }
  if (isProduction(env) && isPlaceholderHost(parsed.hostname)) {
    throw Object.assign(new Error('Email action URL must not use a placeholder or loopback host'), { code: 'EMAIL_ACTION_URL_INVALID', status: 500 });
  }
  if (isLoopbackHost(parsed.hostname) && production) {
    throw Object.assign(new Error('Email action URL must not use localhost in production'), { code: 'EMAIL_ACTION_URL_INVALID', status: 500 });
  }
  return parsed.href;
}

module.exports = {
  assertNoForbiddenEmailHost,
  enterpriseConsoleUrl,
  isPlaceholderHost,
  isLoopbackHost,
  publicAppUrl,
  resolvePublicAppOrigin,
  sanitizeAbsoluteHttpUrl,
};
