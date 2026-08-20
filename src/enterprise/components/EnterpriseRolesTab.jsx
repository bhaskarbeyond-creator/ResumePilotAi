import React, { useMemo } from 'react';
import { FiCheck, FiX } from 'react-icons/fi';
import { useTenantApi, useAsyncResource, DataState } from '../useTenantApi';

const ROLE_META = {
  TENANT_OWNER: { label: 'Owner', summary: 'Full tenant control, including lifecycle, security, and destructive admin operations.' },
  TENANT_ADMIN: { label: 'Admin', summary: 'Administrative control for memberships, security, AI policy, and audit access.' },
  WORKSPACE_MANAGER: { label: 'Manager', summary: 'Workspace-level management for teams, documents, and collaboration.' },
  MEMBER: { label: 'Member', summary: 'Standard enterprise workspace access for document work and AI-assisted drafting.' },
  VIEWER: { label: 'Viewer', summary: 'Read-only access to workspace resources.' },
  BILLING_ADMIN: { label: 'Billing admin', summary: 'Billing and usage administration without general tenant-management rights.' },
};

const PERMISSION_LABELS = {
  'tenant.read': 'Tenant overview',
  'tenant.settings.write': 'Organization settings and lifecycle',
  'tenant.members.read': 'View tenant memberships',
  'tenant.members.invite': 'Invite tenant members',
  'tenant.members.manage': 'Manage tenant members',
  'tenant.roles.manage': 'Manage role assignments',
  'tenant.workspaces.manage': 'Manage workspaces',
  'tenant.audit.read': 'Read audit logs',
  'tenant.security.read': 'View service accounts and security posture',
  'tenant.security.manage': 'Create or revoke service accounts',
  'tenant.ai.manage': 'Manage AI policy and quotas',
  'tenant.integrations.manage': 'Manage integrations',
  'tenant.usage.read': 'Read usage analytics',
  'tenant.billing.read': 'Read billing information',
  'tenant.billing.manage': 'Manage billing configuration',
  'workspace.read': 'Read workspace metadata',
  'workspace.manage': 'Manage teams and workspaces',
  'workspace.members.manage': 'Manage workspace membership',
  'resource.read': 'Read documents and resumes',
  'resource.create': 'Create documents and resumes',
  'resource.update': 'Update or delete documents',
  'resource.share': 'Share documents',
  'ai.use': 'Use AI generation features',
  '*': 'All enterprise permissions',
};

function roleLabel(role) {
  return ROLE_META[role]?.label || role;
}

function roleSummary(role) {
  return ROLE_META[role]?.summary || 'Enterprise role';
}

function capabilityLabel(permission) {
  return PERMISSION_LABELS[permission] || permission;
}

export default function EnterpriseRolesTab() {
  const { request } = useTenantApi();
  const [rolesState, refreshRoles] = useAsyncResource(() => request('/api/enterprise/roles-matrix'), [request]);
  const { loading, error, data } = rolesState;

  const roleEntries = useMemo(() => {
    const source = data?.roles && typeof data.roles === 'object' ? data.roles : {};
    return Object.entries(source)
      .filter(([, permissions]) => Array.isArray(permissions))
      .map(([id, permissions]) => ({ id, permissions }))
      .sort((left, right) => {
        const order = ['TENANT_OWNER', 'TENANT_ADMIN', 'WORKSPACE_MANAGER', 'MEMBER', 'VIEWER', 'BILLING_ADMIN'];
        return order.indexOf(left.id) - order.indexOf(right.id);
      });
  }, [data]);

  const capabilities = useMemo(() => {
    const union = new Set();
    roleEntries.forEach(role => role.permissions.forEach(permission => union.add(permission)));
    return [...union].sort((left, right) => {
      if (left === '*') return -1;
      if (right === '*') return 1;
      return capabilityLabel(left).localeCompare(capabilityLabel(right));
    });
  }, [roleEntries]);

  return (
    <div className="enterprise-tab-content">
      <div className="enterprise-card">
        <h2 className="enterprise-tab-title">Roles & Access Control Matrix</h2>
        <p className="enterprise-tab-subtitle">
          Live enterprise role definitions returned by the server-side policy layer.
        </p>

        <DataState loading={loading} error={error} onRetry={refreshRoles}>
          <div className="enterprise-roles-summary-grid">
            {roleEntries.map(role => (
              <div key={role.id} className="enterprise-role-card">
                <div className="enterprise-role-header">
                  <span className="enterprise-pill enterprise-pill-secondary">{roleLabel(role.id).toUpperCase()}</span>
                  <strong>{role.id}</strong>
                </div>
                <p>{roleSummary(role.id)}</p>
              </div>
            ))}
          </div>

          <h3 className="enterprise-card-title" style={{ marginTop: '2rem' }}>Detailed Permission Matrix</h3>
          <div className="enterprise-table-wrapper">
            <table className="enterprise-table">
              <thead>
                <tr>
                  <th>Resource Capability</th>
                  {roleEntries.map(role => <th key={role.id} className="text-center">{roleLabel(role.id)}</th>)}
                </tr>
              </thead>
              <tbody>
                {capabilities.map(permission => (
                  <tr key={permission}>
                    <td>
                      <strong>{capabilityLabel(permission)}</strong>
                      <div><small>{permission}</small></div>
                    </td>
                    {roleEntries.map(role => {
                      const allowed = role.permissions.includes('*') || role.permissions.includes(permission);
                      return (
                        <td key={`${permission}:${role.id}`} className="text-center">
                          {allowed ? <FiCheck className="text-success" aria-label={`${role.id} allowed`} /> : <FiX className="text-muted" aria-label={`${role.id} denied`} />}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DataState>
      </div>
    </div>
  );
}
