let reauthHandler = null;

/**
 * Fetch an Admin API using the current Firebase ID token. The application shell
 * also injects same-origin API credentials, but this helper owns the contract
 * so Admin modules remain correct when mounted independently (tests, embeds,
 * or a future shell refactor).
 */
async function authenticatedAdminFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');

  try {
    // Keep this browser-only import lazy: static Node contract tests exercise
    // this helper without Vite's import.meta.env transform.
    const fireModule = await import('../conf/fire.js').catch(() => null);
    const user = fireModule?.default?.auth?.()?.currentUser;
    if (user) {
      const token = await user.getIdToken();
      if (token) headers.set('Authorization', `Bearer ${token}`);
    }
  } catch {
    // The API remains the source of truth and returns a structured 401 when a
    // Firebase session cannot be resolved.
  }

  return fetch(url, { ...options, headers });
}

export function registerAdminReauthHandler(handler) {
  reauthHandler = typeof handler === 'function' ? handler : null;
  return () => { if (reauthHandler === handler) reauthHandler = null; };
}

export async function requestAdminReauthentication() {
  if (!reauthHandler) {
    const error = new Error('Reauthentication is required. Reload the Admin console and try again.');
    error.code = 'RECENT_AUTH_REQUIRED';
    throw error;
  }
  return reauthHandler();
}

export function apiErrorCode(response, result = {}) {
  const nested = result.error && typeof result.error === 'object' ? result.error : null;
  return result.code || nested?.code || (response?.status === 401 ? 'AUTH_REQUIRED' : response?.status === 403 ? 'FORBIDDEN' : null);
}

export async function fetchAdminWithReauth(url, options = {}, { retry = true } = {}) {
  const execute = async () => {
    const response = await authenticatedAdminFetch(url, options);
    const data = await response.json().catch(() => ({}));
    return { response, data };
  };
  let result = await execute();
  const code = apiErrorCode(result.response, result.data);
  if (retry && code === 'RECENT_AUTH_REQUIRED') {
    await requestAdminReauthentication();
    result = await execute();
  } else if (retry && (code === 'AUTH_REQUIRED' || code === 'INVALID_AUTH_TOKEN')) {
    const user = typeof window !== 'undefined' && window.fire?.auth ? window.fire.auth().currentUser : null;
    if (user) {
      await user.getIdToken?.(true).catch(() => null);
      result = await execute();
    }
  }
  return result;
}
