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

export async function enterpriseFetch(path, { method = 'GET', tenantId = '', workspaceId = '', body = null, signal = null, headers = {}, retries = 2 } = {}) {
  const isGet = String(method).toUpperCase() === 'GET';
  const cacheKey = isGet && !body ? `${path}::${tenantId}::${workspaceId}` : null;

  if (cacheKey && inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey);
  }

  const executionPromise = (async () => {
    let attempt = 0;
    const maxAttempts = isGet ? retries : 0; // Only retry idempotent GETs automatically

    while (attempt <= maxAttempts) {
      attempt++;
      const reqHeaders = {
        Accept: 'application/json',
        ...headers,
      };

      if (body && typeof body === 'object' && !(body instanceof FormData)) {
        reqHeaders['Content-Type'] = 'application/json';
      }

      // Attach fresh Firebase ID Token
      try {
        const currentUser = fire?.auth?.().currentUser;
        if (currentUser) {
          const token = await currentUser.getIdToken();
          if (token) {
            reqHeaders['Authorization'] = `Bearer ${token}`;
          }
        }
      } catch (_e) {
        // Proceed; backend will respond with 401 if auth is strictly required
      }

      if (tenantId) reqHeaders['X-Tenant-Id'] = tenantId;
      if (workspaceId) reqHeaders['X-Workspace-Id'] = workspaceId;

      try {
        const simulatedRole = sessionStorage.getItem('superadmin_role_view');
        if (simulatedRole && simulatedRole.startsWith('ENTERPRISE_')) {
          reqHeaders['X-Simulated-Enterprise-Role'] = simulatedRole;
        }
      } catch (_) {}

      try {
        const response = await fetch(path, {
          method,
          headers: reqHeaders,
          body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
          cache: 'no-store',
          signal,
        });

        // If rate-limited (429) or transient server error (502, 503, 504), retry with backoff
        if (isGet && (response.status === 429 || response.status === 502 || response.status === 503 || response.status === 504) && attempt <= maxAttempts) {
          const retryAfterHeader = response.headers.get('Retry-After');
          const delayMs = retryAfterHeader ? Math.min(parseInt(retryAfterHeader, 10) * 1000, 4000) : (attempt * 800);
          await new Promise(r => setTimeout(r, delayMs));
          continue;
        }

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          // Token expired during active session: refresh single-flight and retry once if not a true max-session violation
          if (response.status === 401 && data?.error?.code !== 'TENANT_SESSION_REAUTH_REQUIRED' && attempt <= maxAttempts) {
            const freshToken = await refreshEnterpriseTokenSingleFlight();
            if (freshToken) {
              reqHeaders['Authorization'] = `Bearer ${freshToken}`;
              continue; // Retry with freshly renewed ID token
            }
          }

          const error = new Error(data?.error?.message || `Enterprise service error (${response.status})`);
          error.code = data?.error?.code || (response.status === 429 ? 'RATE_LIMITED' : 'TENANT_SERVICE_ERROR');
          error.status = response.status;
          error.requestId = data?.error?.requestId;
          throw error;
        }

        return data;
      } catch (err) {
        if (isGet && attempt <= maxAttempts && !signal?.aborted && err?.code !== 'TENANT_SESSION_REAUTH_REQUIRED') {
          await new Promise(r => setTimeout(r, attempt * 600));
          continue;
        }
        throw err;
      }
    }
  })();

  if (cacheKey) {
    inFlightRequests.set(cacheKey, executionPromise);
    executionPromise.finally(() => inFlightRequests.delete(cacheKey));
  }

  return executionPromise;
}
