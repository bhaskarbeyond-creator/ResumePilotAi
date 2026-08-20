import React, { useMemo, useState } from 'react';
import { FiCheck, FiX, FiPlus, FiEdit2, FiTrash2, FiUsers } from 'react-icons/fi';
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

// Permissions that a tenant-defined custom role may bundle. Everything in the
// platform whitelist except the universal wildcard.
const ASSIGNABLE_PERMISSIONS = Object.keys(PERMISSION_LABELS).filter(permission => permission !== '*');

function roleLabel(role) {
  return ROLE_META[role]?.label || role;
}

function roleSummary(role) {
  return ROLE_META[role]?.summary || 'Enterprise role';
}

function capabilityLabel(permission) {
  return PERMISSION_LABELS[permission] || permission;
}

function CustomRoleModal({ initial, existingIds, busy, onClose, onSubmit }) {
  const [roleId, setRoleId] = useState(initial?.id || '');
  const [label, setLabel] = useState(initial?.label || '');
  const [permissions, setPermissions] = useState(initial?.permissions || ['resource.read']);
  const idCandidate = `CUSTOM_${String(roleId || '').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_')}`;
  const idValid = /^CUSTOM_[A-Z0-9_]{2,28}$/.test(idCandidate) && !existingIds.includes(idCandidate);
  const changedId = Boolean(initial?.id) && idCandidate !== initial.id;

  const toggle = (permission) => {
    setPermissions(prev => prev.includes(permission) ? prev.filter(p => p !== permission) : [...prev, permission]);
  };

  return (
    <div className="enterprise-modal-backdrop" role="presentation" onClick={() => !busy && onClose()}>
      <div className="enterprise-modal" role="dialog" aria-modal="true" aria-label="Define custom role" onClick={(e) => e.stopPropagation()}>
        <div className="enterprise-modal-header">
          <h3>{initial?.id ? `Edit custom role ${initial.id}` : 'Define Custom Role'}</h3>
          <button type="button" className="enterprise-button-icon" onClick={onClose} disabled={busy}>
            <FiX />
          </button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); onSubmit({ id: idCandidate, label: label.trim() || idCandidate, permissions }); }}>
          <div className="enterprise-modal-body">
            <div className="enterprise-two-column-grid">
              <div className="enterprise-form-group">
                <label htmlFor="custom-role-id">Role identifier</label>
                <div className="enterprise-input-affix">
                  <span className="text-muted">CUSTOM_</span>
                  <input
                    id="custom-role-id"
                    type="text"
                    required
                    placeholder="RECRUITER"
                    value={roleId}
                    onChange={(e) => setRoleId(e.target.value)}
                    disabled={Boolean(initial?.id) && !changedId ? false : Boolean(initial?.id)}
                    className="enterprise-input"
                    autoFocus={!initial?.id}
                  />
                </div>
                <small className="text-muted">
                  Final id: <code>{idValid || changedId ? idCandidate : 'CUSTOM_…'}</code>{idValid || (initial?.id && !changedId) ? '' : ' — must be unique, 2–28 chars (A–Z, 0–9, _)'}
                </small>
              </div>
              <div className="enterprise-form-group">
                <label htmlFor="custom-role-label">Display label</label>
                <input
                  id="custom-role-label"
                  type="text"
                  required
                  maxLength={60}
                  placeholder="e.g. Recruiter"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  className="enterprise-input"
                />
              </div>
            </div>
            <div className="enterprise-form-group">
              <label>Granted permissions <small className="text-muted">(least-privilege bundles; the wildcard is never assignable)</small></label>
              <div className="enterprise-checkbox-list">
                {ASSIGNABLE_PERMISSIONS.map(permission => (
                  <label key={permission} className="enterprise-checkbox">
                    <input
                      type="checkbox"
                      checked={permissions.includes(permission)}
                      onChange={() => toggle(permission)}
                    />
                    <span>{capabilityLabel(permission)} <small className="text-muted">({permission})</small></span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="enterprise-modal-footer">
            <button type="button" className="enterprise-button enterprise-button-secondary" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="enterprise-button enterprise-button-primary" disabled={busy || permissions.length === 0 || (!idValid && !(initial?.id && !changedId))}>
              {busy ? 'Saving…' : initial?.id ? 'Save Custom Role' : 'Create Custom Role'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function EnterpriseRolesTab() {
  const { request, hasPermission } = useTenantApi();
  const [rolesState, refreshRoles] = useAsyncResource(() => request('/api/enterprise/roles-matrix'), [request]);
  const [membersState] = useAsyncResource(() => request('/api/enterprise/memberships'), [request]);
  const [configState, refreshConfig] = useAsyncResource(() => request('/api/enterprise/configuration'), [request]);
  const { loading, error, data } = rolesState;
  const [editor, setEditor] = useState(null); // null | {custom} | {custom, initial}
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [notification, setNotification] = useState(null);

  const customRoles = useMemo(() => (data?.customRoles && typeof data.customRoles === 'object' ? data.customRoles : {}), [data]);
  const canManageRoles = hasPermission('tenant.roles.manage') || hasPermission('*');
  const configuration = configState.data?.configuration || null;

  const notify = (message) => {
    setNotification(message);
    setTimeout(() => setNotification(null), 3500);
  };

  const memberCountByRole = useMemo(() => {
    const counts = {};
    for (const member of (Array.isArray(membersState.data?.memberships) ? membersState.data.memberships : [])) {
      for (const role of member.roles || []) {
        counts[role] = (counts[role] || 0) + 1;
      }
    }
    return counts;
  }, [membersState]);

  const roleEntries = useMemo(() => {
    const source = data?.roles && typeof data.roles === 'object' ? data.roles : {};
    return Object.entries(source)
      .filter(([, permissions]) => Array.isArray(permissions))
      .map(([id, permissions]) => ({ id, permissions, custom: false }))
      .concat(Object.entries(customRoles).map(([id, definition]) => ({ id, permissions: definition.permissions || [], custom: true, label: definition.label })))
      .sort((left, right) => {
        const order = ['TENANT_OWNER', 'TENANT_ADMIN', 'WORKSPACE_MANAGER', 'MEMBER', 'VIEWER', 'BILLING_ADMIN'];
        const leftIndex = order.indexOf(left.id);
        const rightIndex = order.indexOf(right.id);
        if (leftIndex === -1 && rightIndex === -1) return left.id.localeCompare(right.id);
        if (leftIndex === -1) return 1;
        if (rightIndex === -1) return -1;
        return leftIndex - rightIndex;
      });
  }, [data, customRoles]);

  const capabilities = useMemo(() => {
    const union = new Set();
    roleEntries.forEach(role => role.permissions.forEach(permission => union.add(permission)));
    return [...union].sort((left, right) => {
      if (left === '*') return -1;
      if (right === '*') return 1;
      return capabilityLabel(left).localeCompare(capabilityLabel(right));
    });
  }, [roleEntries]);

  const persistCustomRoles = async (nextCustomRoles, message) => {
    if (!configuration) {
      setActionError('The tenant configuration could not be loaded.');
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      await request('/api/enterprise/configuration', {
        method: 'PATCH',
        body: {
          expectedRevision: configuration.revision,
          configuration: { customRoles: nextCustomRoles },
        },
      });
      notify(message);
      setEditor(null);
      setDeleteTarget(null);
      refreshConfig();
      refreshRoles();
    } catch (err) {
      setActionError(err?.message || 'Custom roles could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveRole = async ({ id, label, permissions }) => {
    const next = { ...customRoles };
    next[id] = { label, permissions };
    await persistCustomRoles(Object.entries(next).map(([roleId, definition]) => ({ id: roleId, label: definition.label, permissions: definition.permissions })),
      `Custom role ${id} saved.`);
  };

  const handleDeleteRole = async () => {
    if (!deleteTarget) return;
    const inUse = memberCountByRole[deleteTarget] || 0;
    if (inUse > 0) {
      setActionError(`${deleteTarget} is still assigned to ${inUse} member${inUse === 1 ? '' : 's'}. Reassign those members before deleting the role.`);
      setDeleteTarget(null);
      return;
    }
    const next = Object.fromEntries(Object.entries(customRoles).filter(([roleId]) => roleId !== deleteTarget));
    await persistCustomRoles(Object.entries(next).map(([roleId, definition]) => ({ id: roleId, label: definition.label, permissions: definition.permissions })),
      `Custom role ${deleteTarget} deleted.`);
  };

  return (
    <div className="enterprise-tab-content">
      {notification && (
        <div className="enterprise-toast enterprise-toast-success"><FiCheck aria-hidden="true" /> {notification}</div>
      )}
      {actionError && (
        <div className="enterprise-card" role="alert">
          <div className="enterprise-error-row">
            <span className="enterprise-error-icon" aria-hidden="true">⚠</span>
            <div><strong>Role action failed</strong><p className="text-muted">{actionError}</p></div>
          </div>
        </div>
      )}

      <div className="enterprise-card">
        <div className="enterprise-card-header-flex">
          <div>
            <h2 className="enterprise-tab-title">Roles & Access Control Matrix</h2>
            <p className="enterprise-tab-subtitle">
              Live role definitions returned by the server-side policy layer, including tenant-defined custom roles.
            </p>
          </div>
          {canManageRoles && (
            <button
              type="button"
              className="enterprise-button enterprise-button-primary"
              onClick={() => setEditor({ custom: true })}
            >
              <FiPlus aria-hidden="true" /> Define Custom Role
            </button>
          )}
        </div>

        <DataState loading={loading} error={error} onRetry={refreshRoles}>
          <div className="enterprise-roles-summary-grid">
            {roleEntries.map(role => (
              <div key={role.id} className={`enterprise-role-card ${role.custom ? 'enterprise-role-card-custom' : ''}`}>
                <div className="enterprise-role-header">
                  <span className={`enterprise-pill ${role.custom ? 'enterprise-pill-template' : 'enterprise-pill-secondary'}`}>
                    {(role.custom ? role.label : roleLabel(role.id)).toUpperCase()}
                  </span>
                  <strong>{role.id}</strong>
                  {canManageRoles && role.custom && (
                    <span className="enterprise-inline-actions" style={{ gap: '0.25rem', marginLeft: 'auto' }}>
                      <button
                        type="button"
                        className="enterprise-button-icon"
                        title={`Edit ${role.id}`}
                        onClick={() => setEditor({ custom: true, initial: { id: role.id, label: customRoles[role.id]?.label || role.id, permissions: role.permissions } })}
                      >
                        <FiEdit2 />
                      </button>
                      <button
                        type="button"
                        className="enterprise-button-icon text-danger"
                        title={`Delete ${role.id}`}
                        onClick={() => setDeleteTarget(role.id)}
                      >
                        <FiTrash2 />
                      </button>
                    </span>
                  )}
                </div>
                <p>{role.custom ? `Tenant-defined bundle: ${role.permissions.map(p => capabilityLabel(p)).slice(0, 3).join(', ')}${role.permissions.length > 3 ? ` +${role.permissions.length - 3} more` : ''}` : roleSummary(role.id)}</p>
                <small className="text-muted"><FiUsers aria-hidden="true" /> {memberCountByRole[role.id] || 0} assigned member{(memberCountByRole[role.id] || 0) === 1 ? '' : 's'}</small>
              </div>
            ))}
          </div>

          <h3 className="enterprise-card-title" style={{ marginTop: '2rem' }}>Detailed Permission Matrix</h3>
          <div className="enterprise-table-wrapper">
            <table className="enterprise-table">
              <thead>
                <tr>
                  <th>Resource Capability</th>
                  {roleEntries.map(role => <th key={role.id} className="text-center">{role.custom ? role.id.replace('CUSTOM_', '') : roleLabel(role.id)}</th>)}
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
          <p className="enterprise-card-subtitle" style={{ marginTop: '0.75rem' }}>
            Custom roles are permission bundles from the platform whitelist — they never include the wildcard and never grant tenant-wide workspace scope (that stays bound to Owner/Admin). Assign them from Users &amp; IAM.
          </p>
        </DataState>
      </div>

      {editor?.custom && (
        <CustomRoleModal
          initial={editor.initial}
          existingIds={Object.keys(customRoles)}
          busy={busy}
          onClose={() => setEditor(null)}
          onSubmit={handleSaveRole}
        />
      )}

      {deleteTarget && (
        <div className="enterprise-modal-backdrop" role="presentation" onClick={() => setDeleteTarget(null)}>
          <div className="enterprise-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="enterprise-modal-header">
              <h3>Delete custom role {deleteTarget}?</h3>
              <button type="button" className="enterprise-button-icon" onClick={() => setDeleteTarget(null)}>
                <FiX />
              </button>
            </div>
            <div className="enterprise-modal-body">
              <p className="text-muted">
                Members currently assigned this role would lose its permissions. The role can only be deleted when no member holds it.
              </p>
            </div>
            <div className="enterprise-modal-footer">
              <button type="button" className="enterprise-button enterprise-button-secondary" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button type="button" className="enterprise-button enterprise-button-danger" onClick={handleDeleteRole} disabled={busy}>
                {busy ? 'Deleting…' : 'Delete Role'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
