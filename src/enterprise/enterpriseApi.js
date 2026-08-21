import fire from '../conf/fire';

// In-flight GET request deduplication cache to eliminate redundant parallel calls
const inFlightRequests = new Map();

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
      } catch (e) {
        // Proceed; backend will respond with 401 if auth is strictly required
      }

      if (tenantId) reqHeaders['X-Tenant-Id'] = tenantId;
      if (workspaceId) reqHeaders['X-Workspace-Id'] = workspaceId;

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
          const error = new Error(data?.error?.message || `Enterprise service error (${response.status})`);
          error.code = data?.error?.code || (response.status === 429 ? 'RATE_LIMITED' : 'TENANT_SERVICE_ERROR');
          error.status = response.status;
          error.requestId = data?.error?.requestId;
          throw error;
        }

        return data;
      } catch (err) {
        if (isGet && attempt <= maxAttempts && !signal?.aborted) {
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
