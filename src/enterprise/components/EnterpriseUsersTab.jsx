import React, { useMemo, useState } from 'react';
import {
  FiUsers, FiUserPlus, FiSearch, FiShield, FiCheck, FiX, FiTrash2, FiEdit2, FiEye
} from 'react-icons/fi';
import { useTenantApi, useAsyncResource, DataState } from '../useTenantApi';
import { useEnterpriseTenant } from '../EnterpriseContext';

const ROLE_OPTIONS = ['MEMBER', 'VIEWER', 'WORKSPACE_MANAGER', 'TENANT_ADMIN', 'TENANT_OWNER'];
const STATUS_FILTERS = ['ALL', 'ACTIVE', 'SUSPENDED', 'INVITED'];

export default function EnterpriseUsersTab({ currentPrincipalId }) {
  const { request, hasPermission } = useTenantApi();
  const { workspaces } = useEnterpriseTenant();
  const [membersState, refreshMembers] = useAsyncResource(() => request('/api/enterprise/memberships'), [request]);
  const { loading, error, data } = membersState;
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [detailMember, setDetailMember] = useState(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [invitePrincipalId, setInvitePrincipalId] = useState('');
  const [inviteRole, setInviteRole] = useState('MEMBER');
  const [inviteWorkspaceId, setInviteWorkspaceId] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [notification, setNotification] = useState(null);

  const members = useMemo(() => (Array.isArray(data?.memberships) ? data.memberships : []), [data]);

  const filtered = members.filter(member => {
    if (statusFilter !== 'ALL' && String(member.status || '').toUpperCase() !== statusFilter) return false;
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return `${member.principalId} ${(member.roles || []).join(' ')} ${member.status}`.toLowerCase().includes(query);
  });
  const canManageMembers = hasPermission('tenant.members.manage');

  const notify = (message) => {
    setNotification(message);
    setTimeout(() => setNotification(null), 3500);
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!invitePrincipalId.trim() || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await request('/api/enterprise/memberships', {
        method: 'POST',
        body: {
          principalId: invitePrincipalId.trim(),
          roles: [inviteRole],
          ...(inviteWorkspaceId ? { workspaceId: inviteWorkspaceId } : {}),
        },
      });
      setShowInviteModal(false);
      setInvitePrincipalId('');
      setInviteRole('MEMBER');
      setInviteWorkspaceId('');
      notify(`Enterprise access granted to ${invitePrincipalId.trim()}.`);
      refreshMembers();
    } catch (err) {
      setActionError(err?.message || 'Membership could not be granted.');
    } finally {
      setBusy(false);
    }
  };

  const handleWorkspaceAssign = async (member, workspaceId) => {
    if (!workspaceId || workspaceId === member.workspaceId) return;
    setActionError(null);
    try {
      await request(`/api/enterprise/memberships/${encodeURIComponent(member.principalId)}`, {
        method: 'PATCH',
        body: { workspaceId },
      });
      notify(`Moved ${member.principalId} to the selected workspace.`);
      setDetailMember(null);
      refreshMembers();
    } catch (err) {
      setActionError(err?.message || 'Workspace assignment could not be updated.');
    }
  };

  const handleRoleChange = async (principalId, newRole) => {
    setActionError(null);
    try {
      await request(`/api/enterprise/memberships/${encodeURIComponent(principalId)}`, {
        method: 'PATCH',
        body: { roles: [newRole] },
      });
      notify(`Updated ${principalId} to ${newRole}.`);
      refreshMembers();
    } catch (err) {
      setActionError(err?.message || 'Role could not be updated.');
    }
  };

  const handleToggleStatus = async (member) => {
    const next = member.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    setActionError(null);
    try {
      await request(`/api/enterprise/memberships/${encodeURIComponent(member.principalId)}`, {
        method: 'PATCH',
        body: { status: next },
      });
      notify(`${member.principalId} ${next.toLowerCase()}.`);
      refreshMembers();
    } catch (err) {
      setActionError(err?.message || 'Membership status could not be updated.');
    }
  };

  const handleRemove = async (principalId) => {
    if (!window.confirm(`Remove ${principalId} from this enterprise? This revokes all enterprise access.`)) return;
    setActionError(null);
    try {
      await request(`/api/enterprise/memberships/${encodeURIComponent(principalId)}`, { method: 'DELETE' });
      notify(`Removed ${principalId} from the enterprise.`);
      refreshMembers();
    } catch (err) {
      setActionError(err?.message || 'Membership could not be removed.');
    }
  };

  return (
    <div className="enterprise-tab-content">
      {notification && (
        <div className="enterprise-toast enterprise-toast-success">
          <FiCheck aria-hidden="true" /> {notification}
        </div>
      )}
      {actionError && (
        <div className="enterprise-card" role="alert">
          <div className="enterprise-error-row">
            <span className="enterprise-error-icon" aria-hidden="true">⚠</span>
            <div><strong>Member action failed</strong><p className="text-muted">{actionError}</p></div>
          </div>
        </div>
      )}

      <div className="enterprise-card">
        <div className="enterprise-card-header-flex">
          <div>
            <h2 className="enterprise-tab-title">Users & IAM</h2>
            <p className="enterprise-tab-subtitle">
              Server-verified enterprise memberships, roles, and workspace access
            </p>
          </div>
          {canManageMembers && (
            <button
              type="button"
              className="enterprise-button enterprise-button-primary"
              onClick={() => setShowInviteModal(true)}
            >
              <FiUserPlus aria-hidden="true" /> Grant Enterprise Access
            </button>
          )}
        </div>

        <div className="enterprise-filter-bar">
          <div className="enterprise-search-wrapper">
            <FiSearch className="enterprise-search-icon" aria-hidden="true" />
            <input
              type="text"
              placeholder="Search members by principal id, role, or status…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="enterprise-input"
            />
          </div>
          <div className="enterprise-select-group">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="enterprise-select"
              aria-label="Filter members by status"
            >
              {STATUS_FILTERS.map(status => (
                <option key={status} value={status}>{status === 'ALL' ? 'All statuses' : status}</option>
              ))}
            </select>
          </div>
        </div>

        <DataState loading={loading} error={error} onRetry={refreshMembers}>
          {filtered.length === 0 ? (
            <p className="enterprise-empty">No enterprise members match this view. Grant access to begin.</p>
          ) : (
            <div className="enterprise-table-wrapper">
              <table className="enterprise-table">
                <thead>
                  <tr>
                    <th>Principal</th>
                    <th>Roles</th>
                    <th>Status</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(member => (
                    <tr key={`${member.tenantId}:${member.principalId}`}>
                      <td>
                        <div className="enterprise-user-cell">
                          <div className="enterprise-avatar"><FiUsers /></div>
                          <div>
                            <strong>{member.principalId}</strong>
                            <small>{member.id}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <select
                          className="enterprise-select"
                          value={(member.roles && member.roles[0]) || 'MEMBER'}
                          disabled={!canManageMembers || (member.principalId === currentPrincipalId && (member.roles || []).includes('TENANT_OWNER'))}
                          onChange={(e) => handleRoleChange(member.principalId, e.target.value)}
                          aria-label={`Role for ${member.principalId}`}
                        >
                          {ROLE_OPTIONS.map(role => <option key={role} value={role}>{role}</option>)}
                        </select>
                      </td>
                      <td>
                        <span className={`enterprise-pill enterprise-pill-${member.status === 'ACTIVE' ? 'success' : (member.status === 'SUSPENDED' ? 'warning' : 'secondary')}`}>
                          {member.status}
                        </span>
                      </td>
                      <td className="text-right">
                        <div className="enterprise-table-actions">
                          <button
                            type="button"
                            className="enterprise-button-icon"
                            title={`View membership details for ${member.principalId}`}
                            onClick={() => setDetailMember(member)}
                          >
                            <FiEye />
                          </button>
                          {canManageMembers && member.principalId !== currentPrincipalId && (
                            <button
                              type="button"
                              className="enterprise-button-icon"
                              title={member.status === 'ACTIVE' ? 'Suspend member' : 'Reactivate member'}
                              onClick={() => handleToggleStatus(member)}
                            >
                              <FiShield />
                            </button>
                          )}
                          {canManageMembers && member.principalId !== currentPrincipalId && (
                            <button
                              type="button"
                              className="enterprise-button-icon text-danger"
                              title="Remove member"
                              onClick={() => handleRemove(member.principalId)}
                            >
                              <FiTrash2 />
                            </button>
                          )}
                          {member.principalId === currentPrincipalId && <FiEdit2 className="text-muted" title="You cannot remove yourself" />}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DataState>
      </div>

      {showInviteModal && (
        <div className="enterprise-modal-backdrop" role="presentation" onClick={() => !busy && setShowInviteModal(false)}>
          <div className="enterprise-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="enterprise-modal-header">
              <h3>Grant Enterprise Access</h3>
              <button type="button" className="enterprise-button-icon" onClick={() => setShowInviteModal(false)} disabled={busy}>
                <FiX />
              </button>
            </div>
            <form onSubmit={handleInvite}>
              <div className="enterprise-modal-body">
                <div className="enterprise-form-group">
                  <label htmlFor="member-principal">Verified User (Principal / Firebase UID)</label>
                  <input
                    id="member-principal"
                    type="text"
                    required
                    placeholder="Enter the verified user principal id"
                    value={invitePrincipalId}
                    onChange={(e) => setInvitePrincipalId(e.target.value)}
                    className="enterprise-input"
                    autoFocus
                  />
                  <small className="text-muted">
                    Access is granted only to an already-verified identity; email invitation/SCIM is a separate lifecycle flow.
                  </small>
                </div>
                <div className="enterprise-form-group">
                  <label htmlFor="member-role">Role</label>
                  <select
                    id="member-role"
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    className="enterprise-select"
                  >
                    {ROLE_OPTIONS.filter(role => role !== 'TENANT_OWNER').map(role => <option key={role} value={role}>{role}</option>)}
                  </select>
                </div>
                <div className="enterprise-form-group">
                  <label htmlFor="member-workspace">Primary Workspace</label>
                  <select
                    id="member-workspace"
                    value={inviteWorkspaceId}
                    onChange={(e) => setInviteWorkspaceId(e.target.value)}
                    className="enterprise-select"
                  >
                    <option value="">Current active workspace</option>
                    {(workspaces || []).map(ws => (
                      <option key={ws.id} value={ws.id}>{ws.name}{ws.isDefault ? ' (Default)' : ''}</option>
                    ))}
                  </select>
                  <small className="text-muted">The workspace this member lands in when they open the enterprise console.</small>
                </div>
              </div>
              <div className="enterprise-modal-footer">
                <button type="button" className="enterprise-button enterprise-button-secondary" onClick={() => setShowInviteModal(false)} disabled={busy}>Cancel</button>
                <button type="submit" className="enterprise-button enterprise-button-primary" disabled={busy}>
                  {busy ? 'Granting…' : 'Grant Access'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {detailMember && (
        <div className="enterprise-modal-backdrop" role="presentation" onClick={() => setDetailMember(null)}>
          <div className="enterprise-modal" role="dialog" aria-modal="true" aria-label={`Membership details for ${detailMember.principalId}`} onClick={(e) => e.stopPropagation()}>
            <div className="enterprise-modal-header">
              <h3>Membership Details</h3>
              <button type="button" className="enterprise-button-icon" onClick={() => setDetailMember(null)} aria-label="Close membership details">
                <FiX />
              </button>
            </div>
            <div className="enterprise-modal-body">
              <div className="enterprise-form-group">
                <label>Principal</label>
                <input type="text" value={detailMember.principalId} disabled className="enterprise-input enterprise-input-disabled" />
              </div>
              <div className="enterprise-form-group">
                <label>Membership Record</label>
                <input type="text" value={detailMember.id} disabled className="enterprise-input enterprise-input-disabled" />
              </div>
              <div className="enterprise-form-group">
                <label>Roles</label>
                <div className="enterprise-inline-actions" style={{ flexWrap: 'wrap', gap: '0.35rem' }}>
                  {(detailMember.roles || []).map(role => (
                    <span key={role} className="enterprise-pill enterprise-pill-secondary">{role}</span>
                  ))}
                </div>
              </div>
              <div className="enterprise-form-group">
                <label>Status</label>
                <span className={`enterprise-pill enterprise-pill-${detailMember.status === 'ACTIVE' ? 'success' : 'warning'}`}>{detailMember.status}</span>
              </div>
              {detailMember.createdAt && (
                <div className="enterprise-form-group">
                  <label>Member Since</label>
                  <input
                    type="text"
                    value={(() => { try { return new Date(detailMember.createdAt._seconds ? detailMember.createdAt._seconds * 1000 : detailMember.createdAt).toISOString(); } catch { return String(detailMember.createdAt); } })()}
                    disabled
                    className="enterprise-input enterprise-input-disabled"
                  />
                </div>
              )}
              <div className="enterprise-form-group">
                <label htmlFor="detail-workspace">Primary Workspace</label>
                <select
                  id="detail-workspace"
                  className="enterprise-select"
                  value={detailMember.workspaceId || ''}
                  disabled={!canManageMembers}
                  onChange={(e) => handleWorkspaceAssign(detailMember, e.target.value)}
                >
                  {!(workspaces || []).some(ws => ws.id === detailMember.workspaceId) && (
                    <option value={detailMember.workspaceId || ''}>{detailMember.workspaceId ? `Workspace ${String(detailMember.workspaceId).slice(0, 8)}…` : 'None'}</option>
                  )}
                  {(workspaces || []).map(ws => (
                    <option key={ws.id} value={ws.id}>{ws.name}{ws.isDefault ? ' (Default)' : ''}</option>
                  ))}
                </select>
                {canManageMembers
                  ? <small className="text-muted">Changing this reassigns the member&apos;s default landing workspace. The change is applied immediately and audited.</small>
                  : <small className="text-muted">Only tenant member managers can reassign workspaces.</small>}
              </div>
            </div>
            <div className="enterprise-modal-footer">
              <button type="button" className="enterprise-button enterprise-button-secondary" onClick={() => setDetailMember(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
