/**
 * Standard API client helper that attaches Firebase Auth bearer token to requests.
 */

// Firebase is imported lazily so this module stays loadable in plain Node
// (tests, SSR probes) where import.meta.env does not exist. In the browser
// the dynamic import resolves immediately from the module cache.
let fireModulePromise = null;
async function getFire() {
    if (!fireModulePromise) {
        fireModulePromise = import('../../conf/fire.js').catch(() => null);
    }
    return fireModulePromise;
}

export async function apiFetch(url, options = {}) {
    const fireMod = await getFire();
    const fireInstance = fireMod?.default || fireMod || (typeof window !== 'undefined' ? window.fire : null);
    let user = null;
    try {
        if (fireInstance?.auth) {
            user = typeof fireInstance.auth === 'function' ? fireInstance.auth().currentUser : fireInstance.auth.currentUser;
        }
    } catch (_) {}

    let headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {})
    };

    if (user) {
        try {
            const token = await user.getIdToken();
            headers['Authorization'] = `Bearer ${token}`;
        } catch (e) {
            console.warn('[ApiClient] Could not get user token:', e.message);
        }
    }

    const response = await fetch(url, { ...options, headers });
    let data = null;
    try {
        data = await response.json();
    } catch (_e) {
        data = {};
    }

    if (!response.ok) {
        const errorMsg = data.error?.message || data.error || `HTTP ${response.status} Request failed`;
        const err = new Error(errorMsg);
        err.status = response.status;
        err.code = data.error?.code || data.code || `HTTP_${response.status}`;
        err.details = data;
        // Promote only the standardized conflict-recovery fields. Callers can
        // recover without understanding each endpoint's response envelope, while
        // arbitrary server fields are never copied onto Error instances.
        err.remoteRevision = data.remoteRevision ?? data.error?.remoteRevision;
        err.remoteData = data.remoteData ?? data.error?.remoteData;
        throw err;
    }

    return data;
}
