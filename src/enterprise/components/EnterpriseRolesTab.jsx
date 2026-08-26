import React, { useMemo, useState } from 'react';
import { FiCheck, FiX, FiPlus, FiEdit2, FiTrash2, FiUsers, FiShield, FiLock, FiSliders, FiFileText, FiZap, FiCreditCard, FiSearch, FiInfo, FiLayers, FiCheckSquare, FiSquare, FiExternalLink } from 'react-icons/fi';
import { useTenantApi, useAsyncResource, DataState } from '../useTenantApi';
import HelpTooltip from './HelpTooltip';

const ROLE_THEMES = {
  TENANT_OWNER: {
    label: 'Owner',
    theme: 'owner',
    badgeClass: 'enterprise-role-badge-owner',
    icon: FiShield,
    summary: 'Full tenant control, including lifecycle, security, billing, and destructive administrative operations.',
    scope: 'Tenant-wide (Immutable Owner)',
  },
  TENANT_ADMIN: {
    label: 'Administrator',
    theme: 'admin',
    badgeClass: 'enterprise-role-badge-admin',
    icon: FiLock,
    summary: 'Administrative authority for memberships, security policies, AI governance, and forensic audit logs.',
    scope: 'Tenant-wide',
  },
  WORKSPACE_MANAGER: {
    label: 'Workspace Manager',
    theme: 'manager',
    badgeClass: 'enterprise-role-badge-manager',
    icon: FiSliders,
    summary: 'Workspace-level administrative control for team structures, document libraries, and member assignments.',
    scope: 'Workspace-scoped',
  },
  MEMBER: {
    label: 'Enterprise Member',
    theme: 'member',
    badgeClass: 'enterprise-role-badge-member',
    icon: FiFileText,
    summary: 'Standard enterprise access for document drafting, resume sharing, and AI-assisted generation.',
    scope: 'Workspace-scoped',
  },
  VIEWER: {
    label: 'Read-Only Viewer',
    theme: 'viewer',
    badgeClass: 'enterprise-role-badge-viewer',
    icon: FiUsers,
    summary: 'Read-only visibility into shared workspace resumes, team artifacts, and document templates.',
    scope: 'Read-only',
  },
  BILLING_ADMIN: {
    label: 'Billing Administrator',
    theme: 'billing',
    badgeClass: 'enterprise-role-badge-billing',
    icon: FiCreditCard,
    summary: 'Subscription management, plan allowances, and token consumption analytics without general IAM rights.',
    scope: 'Billing & Usage',
  },
};

const PERMISSION_LABELS = {
  'tenant.read': 'Tenant overview and metadata access',
  'tenant.settings.write': 'Organization settings, lifecycle, and policy changes',
  'tenant.members.read': 'View tenant members and invitations directory',
  'tenant.members.invite': 'Send email invitations to new teammates',
  'tenant.members.manage': 'Manage memberships, roles, and status',
  'tenant.roles.manage': 'Define and manage custom role assignments',
  'tenant.workspaces.manage': 'Create, archive, and manage workspace partitions',
  'tenant.audit.read': 'Read immutable forensic audit logs and actor trails',
  'tenant.security.read': 'Inspect service accounts, DLQ, and security posture',
  'tenant.security.manage': 'Create, rotate, and revoke service account keys',
  'tenant.ai.manage': 'Manage AI provider models, routing, and token quotas',
  'tenant.integrations.manage': 'Manage enterprise webhooks and third-party integrations',
  'tenant.usage.read': 'Read consumption telemetry, token ledgers, and cost analytics',
  'tenant.billing.read': 'View subscription tier and active billing plans',
  'tenant.billing.manage': 'Manage payment methods, invoice details, and plan tiers',
  'workspace.read': 'Read workspace metadata and member rosters',
  'workspace.manage': 'Manage squads, teams, and workspace settings',
  'workspace.members.manage': 'Assign and remove members within workspaces',
  'resource.read': 'Read enterprise resumes, portfolios, and cover letters',
  'resource.create': 'Create and author new resumes and portfolios',
  'resource.update': 'Update, archive, or delete enterprise documents',
  'resource.share': 'Generate public sharing links and export documents',
  'ai.use': 'Execute AI summary and description generations',
  '*': 'All enterprise system capabilities (Universal Admin)',
};

const DOMAIN_CATEGORIES = [
  {
    id: 'org',
    name: 'Organization & Tenancy',
    icon: '🏢',
    description: 'Root tenant administration, lifecycle settings, and integrations',
    permissions: ['tenant.read', 'tenant.settings.write', 'tenant.integrations.manage']
  },
  {
    id: 'iam',
    name: 'Identity & Access (IAM)',
    icon: '👥',
    description: 'Enterprise directory, role assignments, and member invitations',
    permissions: ['tenant.members.read', 'tenant.members.invite', 'tenant.members.manage', 'tenant.roles.manage']
  },
  {
    id: 'workspaces',
    name: 'Workspaces & Teams',
    icon: '🗂️',
    description: 'Workspace partitioning, squad management, and team assignments',
    permissions: ['workspace.read', 'workspace.manage', 'workspace.members.manage', 'tenant.workspaces.manage']
  },
  {
    id: 'documents',
    name: 'Documents & Resumes',
    icon: '📄',
    description: 'Resume drafting, document sharing, and portfolio management',
    permissions: ['resource.read', 'resource.create', 'resource.update', 'resource.share']
  },
  {
    id: 'ai',
    name: 'AI Engine & Quotas',
    icon: '⚡',
    description: 'AI-assisted generation, model governance, and token quotas',
    permissions: ['ai.use', 'tenant.ai.manage']
  },
  {
    id: 'security',
    name: 'Security & Audit Trail',
    icon: '🛡️',
    description: 'Machine-to-machine service accounts, key rotation, and audit forensics',
    permissions: ['tenant.security.read', 'tenant.security.manage', 'tenant.audit.read']
  },
  {
    id: 'billing',
    name: 'Billing & Subscriptions',
    icon: '💳',
    description: 'Subscription management, plan upgrades, and usage analytics',
    permissions: ['tenant.billing.read', 'tenant.billing.manage', 'tenant.usage.read']
  }
];

const ASSIGNABLE_PERMISSIONS = Object.keys(PERMISSION_LABELS).filter(permission => permission !== '*');

function roleLabel(role) {
  return ROLE_THEMES[role]?.label || role;
}

function _roleSummary(role) {
  return ROLE_THEMES[role]?.summary || 'Enterprise role definition';
}

function capabilityLabel(permission) {
  return PERMISSION_LABELS[permission] || permission;
}

function CustomRoleModal({ initial, existingIds, busy, onClose, onSubmit }) {
  const [roleId, setRoleId] = useState(initial?.id ? initial.id.replace(/^CUSTOM_/, '') : '');
  const [label, setLabel] = useState(initial?.label || '');
  const [permissions, setPermissions] = useState(initial?.permissions || ['resource.read']);
  const idCandidate = `CUSTOM_${String(roleId || '').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_')}`;
  const idValid = /^CUSTOM_[A-Z0-9_]{2,28}$/.test(idCandidate) && (!existingIds.includes(idCandidate) || initial?.id === idCandidate);
  const changedId = Boolean(initial?.id) && idCandidate !== initial.id;

  const toggle = (permission) => {
    setPermissions(prev => prev.includes(permission) ? prev.filter(p => p !== permission) : [...prev, permission]);
  };

  const toggleCategory = (categoryPermissions) => {
    const allSelected = categoryPermissions.every(p => permissions.includes(p));
    if (allSelected) {
      setPermissions(prev => prev.filter(p => !categoryPermissions.includes(p)));
    } else {
      setPermissions(prev => [...new Set([...prev, ...categoryPermissions])]);
    }
  };

  return (
    <div className="enterprise-modal-backdrop" role="presentation" onClick={() => !busy && onClose()}>
      <div className="enterprise-modal enterprise-modal-lg" role="dialog" aria-modal="true" aria-label="Define custom role" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '680px' }}>
        <div className="enterprise-modal-header">
          <div>
            <h3>{initial?.id ? `Edit custom role ${initial.id}` : 'Define Custom Role'}</h3>
            <p className="text-muted" style={{ fontSize: '0.8rem', margin: '4px 0 0' }}>Create a scoped, least-privilege permission bundle tailored for specific team functions.</p>
          </div>
          <button type="button" className="enterprise-button-icon" onClick={onClose} disabled={busy}>
            <FiX />
          </button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); onSubmit({ id: idCandidate, label: label.trim() || idCandidate, permissions }); }}>
          <div className="enterprise-modal-body" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
            <div className="enterprise-two-column-grid">
              <div className="enterprise-form-group">
                <label htmlFor="custom-role-id">Role Identifier</label>
                <div className="enterprise-input-affix">
                  <span className="text-muted" style={{ fontWeight: 700 }}>CUSTOM_</span>
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
                  System ID: <code>{idValid || changedId ? idCandidate : 'CUSTOM_…'}</code>
                </small>
              </div>
              <div className="enterprise-form-group">
                <label htmlFor="custom-role-label">Display Name</label>
                <input
                  id="custom-role-label"
                  type="text"
                  required
                  maxLength={60}
                  placeholder="e.g. Technical Recruiter"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  className="enterprise-input"
                />
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '16px 0 8px' }}>
              <label style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--enterprise-ink)' }}>
                Granted Capabilities <span className="enterprise-pill enterprise-pill-template" style={{ marginLeft: '8px' }}>{permissions.length} selected</span>
              </label>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {DOMAIN_CATEGORIES.map(cat => {
                const catAssignables = cat.permissions.filter(p => ASSIGNABLE_PERMISSIONS.includes(p));
                const allSelected = catAssignables.every(p => permissions.includes(p));
                return (
                  <div key={cat.id} style={{ border: '1px solid var(--enterprise-border)', borderRadius: '8px', padding: '12px 14px', background: '#fafbfc' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <strong style={{ fontSize: '0.82rem', color: 'var(--ep-slate-900)' }}>{cat.icon} {cat.name}</strong>
                      <button
                        type="button"
                        onClick={() => toggleCategory(catAssignables)}
                        className="enterprise-button-link"
                        style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--ep-brand-600)', background: 'none', border: 'none', cursor: 'pointer' }}
                      >
                        {allSelected ? 'Deselect All' : 'Select All'}
                      </button>
                    </div>
                    <div className="enterprise-checkbox-list" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '6px' }}>
                      {catAssignables.map(permission => (
                        <label key={permission} className="enterprise-checkbox" style={{ background: '#fff', padding: '6px 10px', borderRadius: '6px', border: '1px solid #edf2f7' }}>
                          <input
                            type="checkbox"
                            checked={permissions.includes(permission)}
                            onChange={() => toggle(permission)}
                          />
                          <span style={{ fontSize: '0.8rem' }}>
                            <strong>{capabilityLabel(permission)}</strong> <code style={{ fontSize: '0.72rem', color: 'var(--ep-slate-500)' }}>({permission})</code>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="enterprise-modal-footer">
            <button type="button" className="enterprise-button enterprise-button-secondary" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="enterprise-button enterprise-button-primary" disabled={busy || permissions.length === 0 || (!idValid && !(initial?.id && !changedId))}>
              {busy ? 'Saving…' : initial?.id ? 'Save Changes' : 'Create Role'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function EnterpriseRolesTab({ onNavigate = null }) {
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

  // Search & Category Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [highlightedRoleId, setHighlightedRoleId] = useState(null);

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

  // Filtered categories based on search query and category selector
  const displayedCategories = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return DOMAIN_CATEGORIES.map(cat => {
      if (selectedCategory !== 'ALL' && cat.id !== selectedCategory) return null;
      const matchingPermissions = cat.permissions.filter(perm => {
        if (!query) return true;
        const label = capabilityLabel(perm).toLowerCase();
        return label.includes(query) || perm.toLowerCase().includes(query) || cat.name.toLowerCase().includes(query);
      });
      if (matchingPermissions.length === 0) return null;
      return { ...cat, matchingPermissions };
    }).filter(Boolean);
  }, [searchQuery, selectedCategory]);

  const totalMatchingPermissions = useMemo(() => {
    return displayedCategories.reduce((acc, cat) => acc + cat.matchingPermissions.length, 0);
  }, [displayedCategories]);

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

      {/* Top Banner Card */}
      <div className="enterprise-card">
        <div className="enterprise-card-header-flex">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span className="enterprise-pill enterprise-pill-success">
                <FiShield aria-hidden="true" /> Server Policy Engine Active
              </span>
              <span className="enterprise-pill enterprise-pill-secondary">
                {roleEntries.length} Total Roles
              </span>
            </div>
            <h2 className="enterprise-tab-title">
              Roles & Access Control Matrix
              <HelpTooltip text="Inspect server-enforced role permissions, fine-grained capability grants, and define custom tenant roles" />
            </h2>
            <p className="enterprise-tab-subtitle">
              Granular role-based access control (RBAC), capability matrix, and tenant-defined custom roles with least-privilege enforcement.
            </p>
          </div>
          {canManageRoles && (
            <button
              type="button"
              className="enterprise-button enterprise-button-primary"
              onClick={() => setEditor({ custom: true })}
              title="Define a new tenant custom role with specific capability permissions"
            >
              <FiPlus aria-hidden="true" /> Define Custom Role
            </button>
          )}
        </div>

        <DataState loading={loading} error={error} onRetry={refreshRoles}>
          {/* 6 Elevated Role Cards */}
          <div className="enterprise-roles-summary-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '18px', marginBottom: '32px' }}>
            {roleEntries.map(role => {
              const meta = ROLE_THEMES[role.id] || {
                label: role.label || role.id,
                theme: 'custom',
                badgeClass: 'enterprise-role-badge-custom',
                icon: FiLayers,
                summary: 'Custom tenant-defined capability bundle.',
                scope: 'Custom Tenant Role',
              };
              const Icon = meta.icon;
              role.id === 'TENANT_OWNER';
              const isSelected = highlightedRoleId === role.id;
              const memberCount = memberCountByRole[role.id] || 0;
              const permCount = role.permissions.includes('*') ? 24 : role.permissions.length;

              return (
                <div
                  key={role.id}
                  className={`enterprise-role-card ${role.custom ? 'enterprise-role-card-custom' : ''} ${isSelected ? 'highlighted' : ''}`}
                  onClick={() => setHighlightedRoleId(isSelected ? null : role.id)}
                  style={{ cursor: 'pointer' }}
                  title={`Click to highlight ${role.id} column in the matrix`}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div
                        className={meta.badgeClass}
                        style={{ width: '40px', height: '40px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', flexShrink: 0 }}
                      >
                        <Icon aria-hidden="true" />
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <strong style={{ fontSize: '1rem', color: 'var(--enterprise-ink)' }}>{meta.label}</strong>
                          <span className={`enterprise-pill ${role.custom ? 'enterprise-pill-template' : 'enterprise-pill-secondary'}`} style={{ fontSize: '0.68rem', padding: '1px 6px' }}>
                            {role.custom ? 'CUSTOM' : 'SYSTEM'}
                          </span>
                        </div>
                        <small className="text-muted" style={{ fontFamily: 'monospace', fontSize: '0.72rem' }}>{role.id}</small>
                      </div>
                    </div>

                    {canManageRoles && role.custom && (
                      <div className="enterprise-inline-actions" style={{ gap: '4px' }} onClick={e => e.stopPropagation()}>
                        <button
                          type="button"
                          className="enterprise-button-icon"
                          title={`Edit custom role ${role.id}`}
                          onClick={() => setEditor({ custom: true, initial: { id: role.id, label: customRoles[role.id]?.label || role.id, permissions: role.permissions } })}
                        >
                          <FiEdit2 />
                        </button>
                        <button
                          type="button"
                          className="enterprise-button-icon text-danger"
                          title={`Delete custom role ${role.id}`}
                          onClick={() => setDeleteTarget(role.id)}
                        >
                          <FiTrash2 />
                        </button>
                      </div>
                    )}
                  </div>

                  <p style={{ color: 'var(--ep-slate-600)', fontSize: '0.84rem', lineHeight: 1.45, marginBottom: '16px', flex: 1 }}>
                    {role.custom
                      ? `Tenant-defined bundle granting ${permCount} system capability permissions.`
                      : meta.summary}
                  </p>

                  <div style={{ borderTop: '1px solid var(--enterprise-border)', paddingTop: '12px', marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <button
                      type="button"
                      className="enterprise-role-member-link"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onNavigate) onNavigate('members', { role: role.id });
                      }}
                      title={`View ${memberCount} member(s) assigned to ${role.id} in Users & IAM`}
                    >
                      <FiUsers aria-hidden="true" />
                      <span>{memberCount} assigned member{memberCount === 1 ? '' : 's'}</span>
                      <FiExternalLink style={{ fontSize: '0.7rem', opacity: 0.6 }} />
                    </button>

                    <span className="enterprise-pill enterprise-pill-secondary" style={{ fontSize: '0.72rem', fontWeight: 600 }}>
                      {role.permissions.includes('*') ? 'All 24 Permissions' : `${permCount} Permissions`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Matrix Controls: Domain Filter Pills + Live Search Bar */}
          <div style={{ borderTop: '1px solid var(--enterprise-border)', paddingTop: '24px', marginBottom: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
              <div>
                <h3 className="enterprise-card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>Detailed Capability Matrix</span>
                  <span className="enterprise-pill enterprise-pill-secondary" style={{ fontSize: '0.75rem' }}>
                    {totalMatchingPermissions} Capabilities
                  </span>
                  {highlightedRoleId && (
                    <span className="enterprise-pill enterprise-pill-template" style={{ fontSize: '0.75rem', cursor: 'pointer' }} onClick={() => setHighlightedRoleId(null)}>
                      Highlighting {highlightedRoleId} ✕
                    </span>
                  )}
                </h3>
                <p className="enterprise-tab-subtitle" style={{ fontSize: '0.8rem' }}>
                  Examine granted access levels across each functional domain. Hover over columns to inspect specific role coverage.
                </p>
              </div>

              {/* Search Bar */}
              <div className="enterprise-search-wrapper" style={{ maxWidth: '320px', width: '100%' }}>
                <FiSearch className="enterprise-search-icon" aria-hidden="true" />
                <input
                  type="text"
                  placeholder="Search capability or permission code…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="enterprise-input"
                  title="Search capabilities by name, keyword, or permission code"
                />
              </div>
            </div>

            {/* Category Filter Pills */}
            <div className="enterprise-chip-row" role="group" aria-label="Filter matrix by domain category" style={{ marginBottom: '16px' }}>
              <button
                type="button"
                className={`enterprise-chip ${selectedCategory === 'ALL' ? 'active' : ''}`}
                onClick={() => setSelectedCategory('ALL')}
                title="Show all functional domain categories"
              >
                All Domains <span className="enterprise-chip-count">24</span>
              </button>
              {DOMAIN_CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  type="button"
                  className={`enterprise-chip ${selectedCategory === cat.id ? 'active' : ''}`}
                  onClick={() => setSelectedCategory(cat.id)}
                  title={`Filter by ${cat.name}`}
                >
                  {cat.icon} {cat.name.split(' ')[0]} <span className="enterprise-chip-count">{cat.permissions.length}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Grouped Permission Table */}
          <div className="enterprise-table-wrapper" style={{ borderRadius: '12px', overflow: 'hidden' }}>
            <table className="enterprise-table">
              <thead>
                <tr>
                  <th style={{ minWidth: '300px' }}>Resource Capability</th>
                  {roleEntries.map(role => {
                    const isSelected = highlightedRoleId === role.id;
                    ROLE_THEMES[role.id];
                    return (
                      <th
                        key={role.id}
                        className={`text-center ${isSelected ? 'enterprise-matrix-highlight-col' : ''}`}
                        style={{ cursor: 'pointer', transition: 'background 0.15s ease' }}
                        onClick={() => setHighlightedRoleId(isSelected ? null : role.id)}
                        title={`Click to highlight ${role.id}`}
                      >
                        <div style={{ fontWeight: 700, color: isSelected ? 'var(--ep-brand-600)' : 'var(--ep-slate-900)' }}>
                          {role.custom ? role.id.replace('CUSTOM_', '') : roleLabel(role.id)}
                        </div>
                        <small className="text-muted" style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          {role.custom ? 'Custom' : role.id.replace('TENANT_', '').replace('_', ' ')}
                        </small>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {displayedCategories.length === 0 ? (
                  <tr>
                    <td colSpan={roleEntries.length + 1} className="enterprise-empty-row">
                      No capabilities match your search query “{searchQuery}”.
                    </td>
                  </tr>
                ) : (
                  displayedCategories.map(cat => (
                    <React.Fragment key={cat.id}>
                      {/* Domain Header Row */}
                      <tr className="enterprise-matrix-category-header">
                        <td colSpan={roleEntries.length + 1}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '1rem' }}>{cat.icon}</span>
                            <span>{cat.name}</span>
                            <span className="text-muted" style={{ fontWeight: 500, fontSize: '0.78rem', marginLeft: '6px' }}>— {cat.description}</span>
                          </div>
                        </td>
                      </tr>

                      {/* Capabilities in this domain */}
                      {cat.matchingPermissions.map(permission => (
                        <tr key={permission}>
                          <td>
                            <strong style={{ fontSize: '0.84rem', color: 'var(--ep-slate-900)' }}>{capabilityLabel(permission)}</strong>
                            <div style={{ marginTop: '2px' }}>
                              <code style={{ fontSize: '0.72rem', color: 'var(--ep-slate-500)', background: 'var(--ep-slate-50)', padding: '1px 6px', borderRadius: '4px', border: '1px solid var(--ep-slate-200)' }}>
                                {permission}
                              </code>
                            </div>
                          </td>

                          {roleEntries.map(role => {
                            const isUniversal = role.permissions.includes('*');
                            const allowed = isUniversal || role.permissions.includes(permission);
                            const isSelectedCol = highlightedRoleId === role.id;

                            return (
                              <td
                                key={`${permission}:${role.id}`}
                                className={`text-center ${isSelectedCol ? 'enterprise-matrix-highlight-col' : ''}`}
                                style={{ verticalAlign: 'middle' }}
                              >
                                {isUniversal ? (
                                  <span className="enterprise-matrix-all-grant" title="Universal administrative wildcard (*)">
                                    ✓ ALL
                                  </span>
                                ) : allowed ? (
                                  <span className="enterprise-matrix-grant" title={`Granted to ${role.id}`}>
                                    <FiCheck /> Allowed
                                  </span>
                                ) : (
                                  <span className="enterprise-matrix-deny" title={`Denied for ${role.id}`}>
                                    —
                                  </span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </React.Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
            <p className="enterprise-card-subtitle" style={{ fontSize: '0.78rem' }}>
              ℹ️ Custom roles are scoped permission bundles from the platform whitelist. They never receive the wildcard (<code>*</code>) and never grant cross-workspace tenant authority.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '0.76rem', color: 'var(--ep-slate-500)' }}>
              <span><strong style={{ color: 'var(--ep-brand-600)' }}>✓ ALL</strong>: Universal Wildcard</span>
              <span><strong style={{ color: '#047857' }}>✓ Allowed</strong>: Explicit Capability</span>
              <span><strong>—</strong>: Access Denied</span>
            </div>
          </div>
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
        <div className="enterprise-modal-backdrop enterprise-modal-overlay" role="presentation" onClick={() => setDeleteTarget(null)}>
          <div className="enterprise-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="enterprise-modal-header">
              <h3>Delete custom role &quot;{customRoles[deleteTarget]?.label || deleteTarget.replace(/^CUSTOM_/, '').replace(/_/g, ' ')}&quot;?</h3>
              <button type="button" className="enterprise-button-icon" onClick={() => setDeleteTarget(null)}>
                <FiX />
              </button>
            </div>
            <div className="enterprise-modal-body">
              <p className="text-muted">
                Members currently assigned this role will lose its permissions. The role can only be deleted when no member holds it.
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
