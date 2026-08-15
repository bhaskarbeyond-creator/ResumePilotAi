/**
 * Access rules for the isolated `/export/:template/:resumeId/:language` renderer page.
 *
 * The PDF pipeline renders this page inside a headless Chromium context that has no
 * Firebase session (fresh browser context, empty IndexedDB). Authorization for that
 * render already happened server-side before the browser was launched: the backend
 * verified ownership (or explicit publication) plus subscription entitlement, and only
 * then minted a 256-bit, single-use, 60-second render token that carries the resume
 * payload out-of-band via `/api/export-render-data`.
 *
 * The token is therefore the authorization proof for a headless render, and it never
 * grants access to anything the issuing request was not already entitled to. Any
 * request WITHOUT a render token (i.e. a human opening the export URL directly) still
 * requires an authenticated Firebase session, because that path falls back to reading
 * the resume with the caller's own credentials.
 */

/** Render tokens are 32 random bytes encoded as base64url — exactly 43 characters. */
const RENDER_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/**
 * Extracts a syntactically valid render token from a location hash.
 * Returns null for anything that is not a well-formed token so that malformed,
 * truncated, or injected values fall through to the authenticated code path.
 */
export function readRenderToken(hash) {
    if (typeof hash !== 'string' || !hash) return null;
    let token = null;
    try {
        token = new URLSearchParams(hash.replace(/^#/, '')).get('renderToken');
    } catch {
        return null;
    }
    return token && RENDER_TOKEN_PATTERN.test(token) ? token : null;
}

/** True when the current location carries a well-formed single-use render token. */
export function hasRenderToken(hash) {
    return readRenderToken(hash) !== null;
}

export { RENDER_TOKEN_PATTERN };
