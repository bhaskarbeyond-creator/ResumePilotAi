import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AuthContext } from '../main';

const EnterpriseTenantContext = createContext(null);

export const enterpriseFeatureEnabled = () => import.meta.env?.VITE_ENTERPRISE_TENANCY_ENABLED === 'true';

function tenantStorageKey(uid) {
  return `enterprise_context_request:${uid}`;
}

function workspaceStorageKey(uid, tenantId) {
  return `enterprise_workspace_request:${uid}:${tenantId}`;
}

function readStorage(key) {
  try { return sessionStorage.getItem(key) || ''; } catch { return ''; }
}

function writeStorage(key, value) {
  try {
    if (value) sessionStorage.setItem(key, value);
    else sessionStorage.removeItem(key);
  } catch { /* optional browser state only; never authorization */ }
}

async function request(path, { tenantId = '', workspaceId = '' } = {}) {
  const headers = { Accept: 'application/json' };
  if (tenantId) headers['X-Tenant-Id'] = tenantId;
  if (workspaceId) headers['X-Workspace-Id'] = workspaceId;
  const response = await fetch(path, { headers, cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error?.message || 'Enterprise tenant service is unavailable.');
    error.code = data?.error?.code || 'TENANT_CONTEXT_UNAVAILABLE';
    error.status = response.status;
    throw error;
  }
  return data;
}

export function EnterpriseTenantProvider({ children }) {
  const user = useContext(AuthContext);
  const enabled = enterpriseFeatureEnabled();
  const [state, setState] = useState({ loading: enabled, error: null, serverDisabled: false, tenants: [], workspaces: [], context: null, tenant: null, workspace: null });

  const load = useCallback(async ({ tenantId = '', workspaceId = '' } = {}) => {
    if (!enabled || !user?.uid) {
      setState({ loading: false, error: null, serverDisabled: false, tenants: [], workspaces: [], context: null, tenant: null, workspace: null });
      return null;
    }
    setState(previous => ({ ...previous, loading: true, error: null, serverDisabled: false }));
    try {
      const status = await request('/api/enterprise/status');
      if (status.enabled !== true) {
        const next = { loading: false, error: null, serverDisabled: true, tenants: [], workspaces: [], context: null, tenant: null, workspace: null };
        setState(next);
        return next;
      }
      const requestedTenantId = tenantId || readStorage(tenantStorageKey(user.uid));
      const requestedWorkspaceId = workspaceId || (requestedTenantId ? readStorage(workspaceStorageKey(user.uid, requestedTenantId)) : '');
      const [tenantList, active] = await Promise.all([
        request('/api/enterprise/tenants'),
        request('/api/enterprise/context', { tenantId: requestedTenantId, workspaceId: requestedWorkspaceId }),
      ]);
      const workspaceList = await request('/api/enterprise/workspaces', { tenantId: active.tenant?.id || '', workspaceId: active.workspace?.id || '' });
      writeStorage(tenantStorageKey(user.uid), active.tenant?.id || '');
      if (active.tenant?.id) writeStorage(workspaceStorageKey(user.uid, active.tenant.id), active.workspace?.id || '');
      const next = {
        loading: false,
        error: null,
        serverDisabled: false,
        tenants: Array.isArray(tenantList.tenants) ? tenantList.tenants : [],
        workspaces: Array.isArray(workspaceList.workspaces) ? workspaceList.workspaces : [],
        context: active.context || null,
        tenant: active.tenant || null,
        workspace: active.workspace || null,
      };
      setState(next);
      return next;
    } catch (error) {
      setState(previous => ({ ...previous, loading: false, error, serverDisabled: false, workspaces: [], context: null, tenant: null, workspace: null }));
      throw error;
    }
  }, [enabled, user?.uid]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const selectTenant = useCallback(async tenantId => {
    if (!enabled || !user?.uid) return null;
    // The server verifies membership. This is only a requested UI context.
    writeStorage(tenantStorageKey(user.uid), tenantId);
    return load({ tenantId });
  }, [enabled, load, user?.uid]);

  const selectWorkspace = useCallback(async workspaceId => {
    if (!enabled || !user?.uid || !state.tenant?.id) return null;
    // The active tenant is retained; the server verifies workspace membership/scope.
    writeStorage(workspaceStorageKey(user.uid, state.tenant.id), workspaceId);
    return load({ tenantId: state.tenant.id, workspaceId });
  }, [enabled, load, state.tenant?.id, user?.uid]);

  const value = useMemo(() => ({
    ...state,
    enabled,
    reload: load,
    selectTenant,
    selectWorkspace,
  }), [enabled, load, selectTenant, selectWorkspace, state]);

  return <EnterpriseTenantContext.Provider value={value}>{children}</EnterpriseTenantContext.Provider>;
}

export function useEnterpriseTenant() {
  const context = useContext(EnterpriseTenantContext);
  if (!context) throw new Error('EnterpriseTenantProvider is required');
  return context;
}
