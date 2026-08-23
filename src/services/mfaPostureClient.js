/**
 * Reads the backend's authoritative MFA posture.
 *
 * Deliberately kept OUT of `mfaService.js`: that module handles TOTP secrets,
 * and tests/mfa-static.test.mjs enforces that it performs no network I/O at all
 * so an enrollment secret can never be transmitted to a third party. This
 * module carries no secret material — it only reads a server-rendered posture.
 */

/**
 * @returns {Promise<object|null>} the server posture, or null when it cannot be
 * read. A read failure is reported as unknown, never as "verified".
 */
export async function fetchServerMfaPosture(fetchImpl) {
    const doFetch = fetchImpl || (typeof fetch === 'function' ? fetch : null);
    if (!doFetch) return null;
    try {
        const response = await doFetch('/api/platform/security/mfa-posture', { headers: { Accept: 'application/json' } });
        if (!response?.ok) return null;
        const body = await response.json();
        return body?.mfa || null;
    } catch {
        return null;
    }
}

export default fetchServerMfaPosture;
