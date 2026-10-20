/**
 * Tenant Context Resolution
 *
 * Centralised tenant identity management for the new frontend.
 * Mirrors the tenant resolution logic from the legacy aiService.js
 * (resolveActiveTenantId / setActiveTenantId / autoResolveTenantFromFailure)
 * so that the axios-based api-client.ts can inject X-Tenant-Id headers
 * into every AI and general API request.
 *
 * INVARIANTS:
 * 1. X-Tenant-Id is ONLY attached to requests when a tenant is resolved.
 *    It is never fabricated or guessed.
 * 2. Auto-resolution on TENANT_CONTEXT_REQUIRED uses the backend's own
 *    `primaryTenantId` or `availableTenants[0].tenantId` hint, then falls
 *    back to fetching `/api/enterprise/tenants` and selecting the first
 *    non-personal organization.
 * 3. Once resolved, the tenant ID is persisted to sessionStorage + localStorage
 *    so subsequent requests and page reloads use it consistently.
 * 4. The enterprise-api.ts client is NOT affected — it has its own dedicated
 *    X-Tenant-Id injection via explicit `tenantId` parameter.
 */

// ─── In-memory active tenant ────────────────────────────────────────────────

let activeTenantId: string | null = null;

/**
 * Set the active tenant ID. Persists to sessionStorage + localStorage
 * for cross-tab consistency and page reload survival.
 */
export function setActiveTenantId(tenantId: string | null | undefined): void {
  if (typeof tenantId === 'string' && tenantId.trim()) {
    activeTenantId = tenantId.trim();
    try { sessionStorage?.setItem('activeTenantId', activeTenantId); } catch { /* ignore */ }
    try { localStorage?.setItem('activeTenantId', activeTenantId); } catch { /* ignore */ }
  } else {
    activeTenantId = null;
    try { sessionStorage?.removeItem('activeTenantId'); } catch { /* ignore */ }
    try { localStorage?.removeItem('activeTenantId'); } catch { /* ignore */ }
  }
}

/**
 * Resolve the current active tenant ID from multiple sources in priority order:
 *   1. In-memory cache (fastest, set by setActiveTenantId)
 *   2. URL query params (?tenant= or ?tenantId=)
 *   3. sessionStorage keys (activeTenantId, selectedTenantId, superadmin_enterprise_tenant, enterprise_context_request:*)
 *   4. localStorage keys (activeTenantId, selectedTenantId, enterprise_context_request:*)
 *
 * Returns null when no tenant context exists (personal / individual user).
 */
export function resolveActiveTenantId(): string | null {
  try {
    if (activeTenantId) return activeTenantId;

    // URL params (enterprise deep links)
    if (typeof window !== 'undefined' && window.location?.search) {
      const urlParams = new URLSearchParams(window.location.search);
      const paramTenant = urlParams.get('tenant') || urlParams.get('tenantId');
      if (paramTenant && typeof paramTenant === 'string') {
        setActiveTenantId(paramTenant);
        return paramTenant;
      }
    }

    // sessionStorage (highest priority persistent source)
    if (typeof sessionStorage !== 'undefined') {
      const explicit = sessionStorage.getItem('activeTenantId') || sessionStorage.getItem('selectedTenantId');
      if (explicit) return explicit;
      const simulated = sessionStorage.getItem('superadmin_enterprise_tenant');
      if (simulated) return simulated;
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key?.startsWith('enterprise_context_request:')) {
          const val = sessionStorage.getItem(key);
          if (val) return val;
        }
      }
    }

    // localStorage fallback
    if (typeof localStorage !== 'undefined') {
      const explicit = localStorage.getItem('activeTenantId') || localStorage.getItem('selectedTenantId');
      if (explicit) return explicit;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('enterprise_context_request:')) {
          const val = localStorage.getItem(key);
          if (val) return val;
        }
      }
    }

    return null;
  } catch {
    return activeTenantId;
  }
}

/**
 * Auto-resolve tenant from a TENANT_CONTEXT_REQUIRED error payload.
 * The backend helpfully includes `primaryTenantId` and `availableTenants`
 * in its error response. If those are missing, we query `/api/enterprise/tenants`
 * as a last resort.
 *
 * @returns The resolved tenant ID, or null if resolution failed.
 */
export async function autoResolveTenantFromError(
  errorData?: {
    primaryTenantId?: string;
    availableTenants?: Array<{ tenantId?: string }>;
  },
  getAuthHeader?: () => Promise<string | null>,
): Promise<string | null> {
  // Try the hint from the error payload first
  let candidate = errorData?.primaryTenantId
    || (Array.isArray(errorData?.availableTenants) ? errorData.availableTenants[0]?.tenantId : null)
    || null;

  // If no hint, query the enterprise tenants endpoint
  if (!candidate && typeof fetch !== 'undefined') {
    try {
      const headers: Record<string, string> = { 'Accept': 'application/json' };
      if (getAuthHeader) {
        const auth = await getAuthHeader();
        if (auth) headers['Authorization'] = auth;
      }
      const res = await fetch('/api/enterprise/tenants', {
        method: 'GET',
        headers,
        credentials: 'same-origin',
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const list = Array.isArray(data?.tenants) ? data.tenants : [];
        // Prefer non-personal organization tenants
        const orgTenants = list.filter((t: Record<string, unknown>) => t && !t.personalTenant);
        if (orgTenants.length > 0) {
          candidate = (orgTenants[0].id || orgTenants[0].tenantId) as string;
        } else if (list.length > 0) {
          candidate = (list[0].id || list[0].tenantId) as string;
        }
      }
    } catch {
      // Silent failure — will return null
    }
  }

  if (candidate && typeof candidate === 'string') {
    setActiveTenantId(candidate);
    return candidate;
  }

  return null;
}
