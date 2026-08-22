
let reauthHandler = null;

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

async function refreshAuthorizationHeader(options = {}) {
  const user = typeof window !== 'undefined' && window.fire?.auth
    ? window.fire.auth().currentUser
    : null;
  if (!user) return options;
  const token = await user.getIdToken(true).catch(() => null);
  if (!token) return options;
  return {
    ...options,
    headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` },
  };
}

export async function fetchAdminWithReauth(url, options = {}, { retry = true } = {}) {
  let requestOptions = await refreshAuthorizationHeader(options);
  const execute = async () => {
    const response = await fetch(url, requestOptions);
    const data = await response.json().catch(() => ({}));
    return { response, data };
  };
  let result = await execute();
  const code = apiErrorCode(result.response, result.data);
  if (retry && code === 'RECENT_AUTH_REQUIRED') {
    await requestAdminReauthentication();
    requestOptions = await refreshAuthorizationHeader(requestOptions);
    result = await execute();
  } else if (retry && (code === 'AUTH_REQUIRED' || code === 'INVALID_AUTH_TOKEN')) {
    requestOptions = await refreshAuthorizationHeader(requestOptions);
    if (requestOptions !== options) result = await execute();
  }
  return result;
}
