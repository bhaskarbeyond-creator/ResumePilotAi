import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AuthContext } from '../context/AuthContext';
import { enterpriseFetch } from './enterpriseApi';

const EnterpriseTenantContext = createContext(null);

// eslint-disable-next-line react-refresh/only-export-components
export const enterpriseFeatureEnabled = () => {
  // Check build-time env var or dynamic window override
  if (typeof window !== 'undefined' && window.__ENTERPRISE_ENABLED__ !== undefined) {
    return window.__ENTERPRISE_ENABLED__ === true;
  }
  return import.meta.env?.VITE_ENTERPRISE_TENANCY_ENABLED === 'true';
};

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

export function EnterpriseTenantProvider({ children }) {
  const user = useContext(AuthContext);
  // The build flag is UX metadata only. A server response is required before
  // the Enterprise shell is enabled; an unknown server state must never open a
  // client surface that is guaranteed to produce an avoidable 404/503.
  const [serverEnabled, setServerEnabled] = useState(null);
  const enabled = serverEnabled === true;
  const [state, setState] = useState({ loading: Boolean(user?.uid), error: null, serverDisabled: false, tenants: [], workspaces: [], context: null, tenant: null, workspace: null, platformAdmin: false });

  const load = useCallback(async ({ tenantId = '', workspaceId = '', _forceRefresh = false } = {}) => {
    if (!user?.uid) {
      setServerEnabled(null);
      setState({ loading: false, error: null, serverDisabled: false, tenants: [], workspaces: [], context: null, tenant: null, workspace: null, platformAdmin: false });
      return null;
    }
    setState(previous => ({ ...previous, loading: true, error: null, serverDisabled: false }));
    try {
      const status = await enterpriseFetch('/api/enterprise/status');
      const serverGate = status.enabled === true;
      setServerEnabled(serverGate);
      if (!serverGate) {
        const next = { loading: false, error: null, serverDisabled: true, tenants: [], workspaces: [], context: null, tenant: null, workspace: null, platformAdmin: false };
        setState(next);
        return next;
      }
      const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
      const paramTenantId = urlParams?.get('tenant') || '';
      const paramWorkspaceId = urlParams?.get('workspace') || '';
      const simulatedTenant = readStorage('superadmin_enterprise_tenant');
      const requestedTenantId = tenantId || paramTenantId || simulatedTenant || readStorage(tenantStorageKey(user.uid));
      const requestedWorkspaceId = workspaceId || paramWorkspaceId || (requestedTenantId ? readStorage(workspaceStorageKey(user.uid, requestedTenantId)) : '');
      const [tenantList, active] = await Promise.all([
        enterpriseFetch('/api/enterprise/tenants').catch(() => ({ tenants: [] })),
        enterpriseFetch('/api/enterprise/context', { method: 'POST', body: { tenantId: requestedTenantId, workspaceId: requestedWorkspaceId } }),
      ]);
      const activeTenantId = active.tenant?.id || '';
      const activeWorkspaceId = active.workspace?.id || '';
      const workspaceList = await enterpriseFetch('/api/enterprise/workspaces', { tenantId: activeTenantId, workspaceId: activeWorkspaceId }).catch(() => ({ workspaces: [] }));
      writeStorage(tenantStorageKey(user.uid), activeTenantId);
      if (activeTenantId) writeStorage(workspaceStorageKey(user.uid, activeTenantId), activeWorkspaceId);
      const rawTenants = Array.isArray(tenantList?.tenants) ? tenantList.tenants : [];
      const tenants = rawTenants.length > 0 ? rawTenants : (active.tenant ? [active.tenant] : []);
      const next = {
        loading: false,
        error: null,
        serverDisabled: false,
        tenants,
        workspaces: Array.isArray(workspaceList?.workspaces) ? workspaceList.workspaces : [],
        context: active.context || null,
        tenant: active.tenant || null,
        workspace: active.workspace || null,
        // Server-derived capability for the platform administration surface.
        platformAdmin: active.platformAdmin === true,
        simulatedRole: active.context?.simulatedRole || null,
        isSimulating: Boolean(active.context?.simulatedRole),
      };
      setState(next);
      return next;
    } catch (error) {
      setState(previous => ({
        ...previous,
        loading: false,
        error,
        serverDisabled: false,
      }));
      throw error;
    }
  }, [user?.uid]);

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
    user,
    enabled,
    reload: load,
    selectTenant,
    selectWorkspace,
  }), [enabled, load, selectTenant, selectWorkspace, state, user]);

  return <EnterpriseTenantContext.Provider value={value}>{children}</EnterpriseTenantContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useEnterpriseTenant() {
  const context = useContext(EnterpriseTenantContext);
  if (!context) throw new Error('EnterpriseTenantProvider is required');
  return context;
}
