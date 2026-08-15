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

export async function fetchAdminWithReauth(url, options = {}, { retry = true } = {}) {
  const execute = async () => {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    return { response, data };
  };
  let result = await execute();
  if (retry && apiErrorCode(result.response, result.data) === 'RECENT_AUTH_REQUIRED') {
    await requestAdminReauthentication();
    result = await execute();
  }
  return result;
}
