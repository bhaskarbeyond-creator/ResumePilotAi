const messages = {
  AUTH_REQUIRED: 'Sign in again before managing AI settings.',
  INVALID_AUTH_TOKEN: 'Your session is invalid. Sign in again.',
  FORBIDDEN: 'Your account does not have permission to manage AI settings.',
  EMAIL_VERIFICATION_REQUIRED: 'Verify your administrator email before managing AI settings.',
  RECENT_AUTH_REQUIRED: 'Reauthentication is required before changing or testing provider credentials.',
  AI_SETTINGS_CONFLICT: 'AI settings changed elsewhere. Refresh before saving.',
  AI_PROVIDER_NOT_CONFIGURED: 'This provider has no server-side credential configured.',
  AI_PROVIDER_AUTHENTICATION_FAILED: 'The provider rejected the configured credential.',
  AI_PROVIDER_CONFIGURATION_ERROR: 'The provider rejected the configured model or request.',
  AI_PROVIDER_TIMEOUT: 'The provider test timed out.',
  AI_PROVIDER_UNAVAILABLE: 'The provider is currently unavailable.',
  AI_SETTINGS_VALIDATION_ERROR: 'The AI settings request is invalid.',
};

export function normalizeAdminApiError(response, result = {}, fallback = 'Request failed.') {
  const nested = result?.error && typeof result.error === 'object' ? result.error : null;
  const code = result.code || nested?.code || (response?.status === 401 ? 'AUTH_REQUIRED' : response?.status === 403 ? 'FORBIDDEN' : null);
  const rawMsg = typeof result.error === 'string' && result.error.trim() ? result.error.trim() : nested?.message;
  const serverMessage = rawMsg && rawMsg !== 'internal' ? rawMsg : null;
  const defaultMsg = messages[code];
  
  const statusSuffix = response?.status && response.status !== 200 ? ` (HTTP ${response.status})` : '';
  let message = (code === 'AI_PROVIDER_AUTHENTICATION_FAILED' && defaultMsg ? defaultMsg : serverMessage) || defaultMsg || serverMessage || fallback;

  if (message === fallback && statusSuffix) {
    message = `${fallback}${statusSuffix}`;
  }

  const error = new Error(message);
  error.code = code || 'ADMIN_AI_REQUEST_FAILED';
  error.status = response?.status || 0;
  error.requestId = result.requestId || nested?.requestId || response?.headers?.get?.('x-request-id') || null;
  return error;
}

async function request(url, options, fallback) {
  const response = await fetch(url, options);
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.success === false) throw normalizeAdminApiError(response, result, fallback);
  return result;
}

export const loadAdminAiSettings = () => request('/api/admin/ai-settings', { cache: 'no-store' }, 'Unable to load AI settings.');
export const saveAdminAiSettings = (settings, expectedRevision) => request('/api/admin/ai-settings', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ...settings, expectedRevision }),
}, 'Unable to save AI settings.');
export const testAdminAiProvider = ({ provider, model, apiKey = '' }) => request('/api/admin/ai/test-provider', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ provider, model, ...(apiKey ? { apiKey } : {}) }),
}, 'Provider test failed.');
