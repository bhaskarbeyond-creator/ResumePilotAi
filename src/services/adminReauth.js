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

/**
 * Second-factor denials are NOT recoverable by reauthentication.
 *
 * Previously nothing in the console recognised SUPER_ADMIN_MFA_REQUIRED, so a
 * blocked Super Admin saw a raw error and — where reauth retry logic ran — was
 * re-prompted for a password that could never satisfy the requirement. These
 * codes must terminate the retry path and surface the backend's remediation.
 */
export const MFA_BLOCKING_CODES = Object.freeze(['SUPER_ADMIN_MFA_REQUIRED', 'MFA_CONFIGURATION_REQUIRED']);

export function mfaDenial(result = {}) {
  const nested = result.error && typeof result.error === 'object' ? result.error : result;
  const code = nested?.code;
  if (!MFA_BLOCKING_CODES.includes(code)) return null;
  return {
    code,
    mfaState: nested.mfaState || (code === 'MFA_CONFIGURATION_REQUIRED' ? 'MFA_CONFIGURATION_REQUIRED' : 'MFA_REQUIRED'),
    message: nested.message || 'A verified second authentication factor is required for this operation.',
    remediation: nested.remediation || null,
    providerCapability: nested.providerCapability || 'UNKNOWN',
    recoverableByReauthentication: false,
  };
}

/**
 * Return a fresh token for an administrative retry. The initial request may
 * already have a token supplied by main.jsx's same-origin interceptor, but a
 * recent-auth retry must replace it after Firebase reauthentication. Keeping
 * this in the shared client prevents settings panels from accidentally retrying
 * a stale token forever.
 */
async function refreshAuthorizationHeader(options = {}) {
  const firebase = typeof window !== 'undefined' ? window.fire : null;
  const user = firebase?.auth?.().currentUser || null;
  if (!user) return options;
  const token = await user.getIdToken(true).catch(() => null);
  if (!token) return options;
  return {
    ...options,
    headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` },
  };
}

/**
 * The canonical return shape is `{ response, data }`. A small compatibility
 * facade also exposes Response-like `ok`, `status`, `headers`, `json()` and
 * `text()` members on the envelope. Older product helpers used the envelope as
 * if it were a Response; supporting that shape while callers migrate avoids a
 * false-success or silent refresh regression without weakening the contract.
 */
function resultEnvelope(response, data) {
  return {
    response,
    data,
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
    url: response.url,
    json: async () => data,
    text: async () => (typeof data === 'string' ? data : JSON.stringify(data)),
  };
}

export async function fetchAdminWithReauth(url, options = {}, { retry = true } = {}) {
  let requestOptions = await refreshAuthorizationHeader(options);
  const execute = async () => {
    const response = await fetch(url, requestOptions);
    const data = await response.json().catch(() => ({}));
    return resultEnvelope(response, data);
  };

  let result = await execute();
  const code = apiErrorCode(result.response, result.data);
  const denial = mfaDenial(result.data);
  if (denial) {
    // Terminate immediately. Retrying or prompting for a password here would
    // present an unsatisfiable loop and imply the boundary is soft. It is not.
    result.mfaDenial = denial;
    return result;
  }
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
