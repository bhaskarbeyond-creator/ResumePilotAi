import fire from '../../conf/fire';

/**
 * Standard API client helper that attaches Firebase Auth bearer token to requests.
 */
export async function apiFetch(url, options = {}) {
    const user = fire.auth().currentUser;
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
    } catch (e) {
        data = {};
    }

    if (!response.ok) {
        const errorMsg = data.error?.message || data.error || `HTTP ${response.status} Request failed`;
        const err = new Error(errorMsg);
        err.status = response.status;
        err.code = data.error?.code || data.code || `HTTP_${response.status}`;
        err.details = data;
        throw err;
    }

    return data;
}
