import fire from '../conf/fire';

// In-flight GET request deduplication cache to eliminate redundant parallel calls
const inFlightRequests = new Map();

// Single-flight token refresh lock for enterprise API
let singleFlightRefreshPromise = null;

async function refreshEnterpriseTokenSingleFlight() {
  if (singleFlightRefreshPromise) return singleFlightRefreshPromise;
  const user = fire?.auth?.().currentUser;
  if (!user) return null;
  singleFlightRefreshPromise = (async () => {
    try {
      return await user.getIdToken(true);
    } catch {
      return null;
    } finally {
      singleFlightRefreshPromise = null;
    }
  })();
  return singleFlightRefreshPromise;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function serializeRequestBody(body) {
  if (!body) return undefined;
  if (typeof body === 'string') return body;
  return JSON.stringify(body);
}

async function getAuthBearerToken() {
  try {
    const currentUser = fire?.auth?.().currentUser;
    if (currentUser) {
      const token = await currentUser.getIdToken();
      if (token) return token;
    }
  } catch {
    // Proceed; backend will respond with 401 if auth is strictly required
  }
  return null;
}

function getSimulatedRole() {
  try {
    const simulatedRole = sessionStorage.getItem('superadmin_role_view');
    if (simulatedRole?.startsWith('ENTERPRISE_')) {
      return simulatedRole;
    }
  } catch {
    // SessionStorage access may be restricted or throw in sandboxed environments; ignore safely.
  }
  return null;
}

async function buildEnterpriseHeaders({ headers, body, tenantId, workspaceId, tokenOverride }) {
  const reqHeaders = {
    Accept: 'application/json',
    ...headers,
  };

  if (body && typeof body === 'object' && !(body instanceof FormData)) {
    reqHeaders['Content-Type'] = 'application/json';
  }

  const token = tokenOverride || (await getAuthBearerToken());
  if (token) {
    reqHeaders['Authorization'] = `Bearer ${token}`;
  }

  if (tenantId) reqHeaders['X-Tenant-Id'] = tenantId;
  if (workspaceId) reqHeaders['X-Workspace-Id'] = workspaceId;

  const simulatedRole = getSimulatedRole();
  if (simulatedRole) {
    reqHeaders['X-Simulated-Enterprise-Role'] = simulatedRole;
  }

  return reqHeaders;
}

function computeRetryDelay(response, attempt) {
  const retryAfterHeader = response.headers.get('Retry-After');
  if (retryAfterHeader) {
    const parsedSeconds = Number.parseInt(retryAfterHeader, 10);
    if (!Number.isNaN(parsedSeconds)) {
      return Math.min(parsedSeconds * 1000, 4000);
    }
  }
  return attempt * 800;
}

function isTransientStatusCode(status) {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

function parseEnterpriseError(data, status) {
  const error = new Error(data?.error?.message || `Enterprise service error (${status})`);
  error.code = data?.error?.code || (status === 429 ? 'RATE_LIMITED' : 'TENANT_SERVICE_ERROR');
  error.status = status;
  error.requestId = data?.error?.requestId;
  return error;
}

function isRetryableNetworkError(err) {
  const isClientAuthOrPermissionError = Boolean(err?.status && [400, 401, 403, 404].includes(err.status));
  return !isClientAuthOrPermissionError && err?.code !== 'TENANT_SESSION_REAUTH_REQUIRED';
}

function shouldRetryTransientStatus(status, isGet, attempt, maxAttempts) {
  return isGet && isTransientStatusCode(status) && attempt <= maxAttempts;
}

function shouldRetryNetworkError(err, isGet, attempt, maxAttempts, signal) {
  return isGet && attempt <= maxAttempts && !signal?.aborted && isRetryableNetworkError(err);
}

async function handleResponseFailure(response, data, context) {
  if (response.status === 401 && data?.error?.code !== 'TENANT_SESSION_REAUTH_REQUIRED' && context.attempt <= context.maxAttempts) {
    const freshToken = await refreshEnterpriseTokenSingleFlight();
    if (freshToken) {
      return executeAttempt({ ...context, attempt: context.attempt + 1, tokenOverride: freshToken });
    }
  }
  throw parseEnterpriseError(data, response.status);
}

async function executeAttempt(context) {
  const { path, method, isGet, serializedBody, signal, maxAttempts, attempt } = context;
  const reqHeaders = await buildEnterpriseHeaders(context);

  try {
    const response = await fetch(path, {
      method,
      headers: reqHeaders,
      body: serializedBody,
      cache: 'no-store',
      signal,
    });

    if (shouldRetryTransientStatus(response.status, isGet, attempt, maxAttempts)) {
      await sleep(computeRetryDelay(response, attempt));
      return executeAttempt({ ...context, attempt: attempt + 1 });
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return await handleResponseFailure(response, data, context);
    }

    return data;
  } catch (err) {
    if (shouldRetryNetworkError(err, isGet, attempt, maxAttempts, signal)) {
      await sleep(attempt * 600);
      return executeAttempt({ ...context, attempt: attempt + 1 });
    }
    throw err;
  }
}

export async function enterpriseFetch(path, { method = 'GET', tenantId = '', workspaceId = '', body = null, signal = null, headers = {}, retries = 2 } = {}) {
  const isGet = String(method).toUpperCase() === 'GET';
  const cacheKey = isGet && !body ? `${path}::${tenantId}::${workspaceId}` : null;

  if (cacheKey && inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey);
  }

  const executionPromise = executeAttempt({
    path,
    method,
    isGet,
    tenantId,
    workspaceId,
    body,
    serializedBody: serializeRequestBody(body),
    headers,
    signal,
    maxAttempts: isGet ? retries : 0,
    attempt: 1,
    tokenOverride: null,
  });

  if (cacheKey) {
    inFlightRequests.set(cacheKey, executionPromise);
    executionPromise
      .finally(() => inFlightRequests.delete(cacheKey))
      .catch(() => {});
  }

  return executionPromise;
}
