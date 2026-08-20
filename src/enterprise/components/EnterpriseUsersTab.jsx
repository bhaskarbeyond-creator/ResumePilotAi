import React, { useMemo, useState } from 'react';
import {
  FiUsers, FiUserPlus, FiSearch, FiShield, FiCheck, FiX, FiTrash2, FiEdit2
} from 'react-icons/fi';
import { useTenantApi, useAsyncResource, DataState } from '../useTenantApi';

const ROLE_OPTIONS = ['MEMBER', 'VIEWER', 'WORKSPACE_MANAGER', 'TENANT_ADMIN', 'TENANT_OWNER'];

export default function EnterpriseUsersTab({ currentPrincipalId }) {
  const { request, hasPermission } = useTenantApi();
  const [membersState, refreshMembers] = useAsyncResource(() => request('/api/enterprise/memberships'), [request]);
  const { loading, error, data } = membersState;
  const [searchQuery, setSearchQuery] = useState('');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [invitePrincipalId, setInvitePrincipalId] = useState('');
  const [inviteRole, setInviteRole] = useState('MEMBER');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [notification, setNotification] = useState(null);

  const members = useMemo(() => (Array.isArray(data?.memberships) ? data.memberships : []), [data]);

  const filtered = members.filter(member => {
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
        body: { principalId: invitePrincipalId.trim(), roles: [inviteRole] },
      });
      setShowInviteModal(false);
      setInvitePrincipalId('');
      setInviteRole('MEMBER');
      notify(`Enterprise access granted to ${invitePrincipalId.trim()}.`);
      refreshMembers();
    } catch (err) {
      setActionError(err?.message || 'Membership could not be granted.');
    } finally {
      setBusy(false);
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
    </div>
  );
}
