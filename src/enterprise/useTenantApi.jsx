import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEnterpriseTenant } from './EnterpriseContext';
import { enterpriseFetch } from './enterpriseApi';

/**
 * Binds enterprise API calls to the currently active tenant + workspace context.
 * All data is server-derived; the tenant/workspace ids are only requested context
 * and the backend re-verifies membership on every request.
 */
export function useTenantApi() {
  const { tenant, workspace, context } = useEnterpriseTenant();
  const tenantId = tenant?.id || '';
  const workspaceId = workspace?.id || '';
  const permissions = useMemo(() => (Array.isArray(context?.permissions) ? context.permissions : []), [context?.permissions]);
  const roles = useMemo(() => (Array.isArray(context?.roles) ? context.roles : []), [context?.roles]);

  const request = useCallback((path, options = {}) => {
    const opts = { ...options };
    if (tenantId) opts.tenantId = tenantId;
    if (workspaceId) opts.workspaceId = workspaceId;
    return enterpriseFetch(path, opts);
  }, [tenantId, workspaceId]);

  const hasPermission = useCallback((permission) => permissions.includes('*') || permissions.includes(permission), [permissions]);

  return { request, tenant, workspace, context, tenantId, workspaceId, permissions, roles, hasPermission };
}

/** Simple promise-state hook so every tab shares the same loading/error/data contract. */
export function useAsyncResource(loader, deps = []) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const run = useRef(0);

  useEffect(() => {
    run.current += 1;
    const thisRun = run.current;
    setState({ loading: true, error: null, data: null });
    loader()
      .then(data => {
        if (run.current === thisRun) setState({ loading: false, error: null, data });
      })
      .catch(error => {
        if (run.current === thisRun) setState({ loading: false, error, data: null });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, refreshKey]);

  const refresh = useCallback(() => setRefreshKey(key => key + 1), []);

  return [state, refresh];
}

/** Uniform truthful data-plane state rendering. */
export function DataState({ loading, error, onRetry = null, children }) {
  if (loading) {
    return (
      <div className="enterprise-card" role="status" aria-live="polite">
        <div className="enterprise-loading-row">
          <span className="enterprise-spinner" aria-hidden="true" />
          <span className="text-muted">Loading enterprise data…</span>
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="enterprise-card" role="alert">
        <div className="enterprise-error-row">
          <span className="enterprise-error-icon" aria-hidden="true">⚠</span>
          <div>
            <strong>Data unavailable</strong>
            <p className="text-muted">{error?.message || 'The enterprise service did not respond as expected.'}</p>
            {typeof onRetry === 'function' && (
              <button type="button" className="enterprise-button enterprise-button-secondary enterprise-button-sm" onClick={onRetry} style={{ marginTop: '0.75rem' }}>
                Retry
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
  return children;
}
