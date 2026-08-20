import fire from '../conf/fire';

export async function enterpriseFetch(path, { method = 'GET', tenantId = '', workspaceId = '', body = null, signal = null, headers = {} } = {}) {
  const reqHeaders = {
    Accept: 'application/json',
    ...headers,
  };

  if (body && typeof body === 'object' && !(body instanceof FormData)) {
    reqHeaders['Content-Type'] = 'application/json';
  }

  // Attach Firebase ID Token
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

  const response = await fetch(path, {
    method,
    headers: reqHeaders,
    body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
    cache: 'no-store',
    signal,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error?.message || `Enterprise service error (${response.status})`);
    error.code = data?.error?.code || 'TENANT_SERVICE_ERROR';
    error.status = response.status;
    error.requestId = data?.error?.requestId;
    throw error;
  }

  return data;
}
