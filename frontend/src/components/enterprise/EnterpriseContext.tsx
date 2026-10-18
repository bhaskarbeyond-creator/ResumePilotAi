/**
 * Enterprise Context Provider
 *
 * Provides shared tenant state, active workspace selection, RBAC permissions,
 * and email verification handling across all 17 enterprise sub-components.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/providers/auth-provider';
import {
  enterpriseApi,
  type TenantSummary,
  type WorkspaceSummary,
  type EnterpriseContextResponse,
  type EnterpriseError,
} from '@/lib/enterprise-api';

export interface EnterpriseContextValue {
  tenant: TenantSummary | null;
  workspace: WorkspaceSummary | null;
  tenants: TenantSummary[];
  workspaces: WorkspaceSummary[];
  platformAdmin: boolean;
  permissions: string[];
  roles: string[];
  simulatedRole: string | null;
  loading: boolean;
  error: string | null;
  serverDisabled: boolean;
  emailVerificationRequired: boolean;
  hasPermission: (perm: string) => boolean;
  selectTenant: (tenantId: string) => Promise<void>;
  selectWorkspace: (workspaceId: string) => Promise<void>;
  reload: () => Promise<void>;
  clearEmailVerificationError: () => void;
}

const EnterpriseContext = createContext<EnterpriseContextValue | null>(null);

export function EnterpriseProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [tenant, setTenant] = useState<TenantSummary | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(null);
  const [platformAdmin, setPlatformAdmin] = useState(false);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [simulatedRole, setSimulatedRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [serverDisabled, setServerDisabled] = useState(false);
  const [emailVerificationRequired, setEmailVerificationRequired] = useState(false);

  // Check email verification from user state
  useEffect(() => {
    if (user && user.emailVerified === false) {
      setEmailVerificationRequired(true);
    }
  }, [user]);

  const load = useCallback(async (requestedTenantId?: string, requestedWorkspaceId?: string) => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 1. Check feature flag / status
      const status = await enterpriseApi.getStatus().catch(() => null);
      if (status && status.enabled === false) {
        setServerDisabled(true);
        setLoading(false);
        return;
      }

      // 2. Read tenant list
      const tenantListRes = await enterpriseApi.getTenants().catch(() => ({ tenants: [] }));
      const availableTenants = tenantListRes?.tenants || [];
      setTenants(availableTenants);

      // Determine requested tenant ID (priority: argument -> URL param -> stored -> slug -> first available)
      const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
      const paramTenant = urlParams?.get('tenant') || '';
      const paramWorkspace = urlParams?.get('workspace') || '';

      const storedTenant = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('activeTenantId') || '' : '';
      const targetTenantId = requestedTenantId || paramTenant || storedTenant || (availableTenants[0]?.id ?? '');

      const storedWorkspace = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(`workspace_${targetTenantId}`) || '' : '';
      const targetWorkspaceId = requestedWorkspaceId || paramWorkspace || storedWorkspace;

      // 3. Resolve context
      let activeContext: EnterpriseContextResponse | null = null;
      try {
        activeContext = await enterpriseApi.postContext(targetTenantId || undefined, targetWorkspaceId || undefined);
      } catch (err: unknown) {
        const entErr = err as EnterpriseError;
        if (entErr?.code === 'EMAIL_VERIFICATION_REQUIRED' || entErr?.status === 403) {
          setEmailVerificationRequired(true);
        }
        throw err;
      }

      if (activeContext) {
        const activeTenant = activeContext.tenant || (availableTenants.find(t => t.id === targetTenantId) ?? null);
        setTenant(activeTenant);
        setWorkspace(activeContext.workspace || null);
        setPlatformAdmin(activeContext.platformAdmin === true);
        setPermissions(activeContext.context?.permissions || []);
        setRoles(activeContext.context?.roles || []);
        setSimulatedRole(activeContext.context?.simulatedRole || null);

        if (activeTenant?.id) {
          try {
            sessionStorage.setItem('activeTenantId', activeTenant.id);
            localStorage.setItem('activeTenantId', activeTenant.id);
          } catch {
            // ignore
          }

          // 4. Fetch workspaces for active tenant
          const wsList = await enterpriseApi.getWorkspaces(activeTenant.id, activeContext.workspace?.id).catch(() => ({ workspaces: [] }));
          setWorkspaces(wsList?.workspaces || []);
        }
      }
    } catch (err: unknown) {
      const entErr = err as EnterpriseError;
      if (entErr?.code === 'EMAIL_VERIFICATION_REQUIRED' || entErr?.status === 403) {
        setEmailVerificationRequired(true);
      } else {
        setError(entErr?.message || 'Failed to load enterprise organization context');
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const selectTenant = useCallback(async (tenantId: string) => {
    try {
      sessionStorage.setItem('activeTenantId', tenantId);
    } catch {
      // ignore
    }
    await load(tenantId);
  }, [load]);

  const selectWorkspace = useCallback(async (workspaceId: string) => {
    if (tenant?.id) {
      try {
        sessionStorage.setItem(`workspace_${tenant.id}`, workspaceId);
      } catch {
        // ignore
      }
    }
    await load(tenant?.id, workspaceId);
  }, [load, tenant?.id]);

  const hasPermission = useCallback((perm: string) => {
    if (platformAdmin) return true;
    if (permissions.includes('*')) return true;
    return permissions.includes(perm);
  }, [permissions, platformAdmin]);

  const value = useMemo<EnterpriseContextValue>(() => ({
    tenant,
    workspace,
    tenants,
    workspaces,
    platformAdmin,
    permissions,
    roles,
    simulatedRole,
    loading,
    error,
    serverDisabled,
    emailVerificationRequired,
    hasPermission,
    selectTenant,
    selectWorkspace,
    reload: () => load(tenant?.id, workspace?.id),
    clearEmailVerificationError: () => setEmailVerificationRequired(false),
  }), [
    tenant,
    workspace,
    tenants,
    workspaces,
    platformAdmin,
    permissions,
    roles,
    simulatedRole,
    loading,
    error,
    serverDisabled,
    emailVerificationRequired,
    hasPermission,
    selectTenant,
    selectWorkspace,
    load,
  ]);

  return (
    <EnterpriseContext.Provider value={value}>
      {children}
    </EnterpriseContext.Provider>
  );
}

export function useEnterprise(): EnterpriseContextValue {
  const ctx = useContext(EnterpriseContext);
  if (!ctx) {
    throw new Error('useEnterprise must be used within an EnterpriseProvider');
  }
  return ctx;
}
