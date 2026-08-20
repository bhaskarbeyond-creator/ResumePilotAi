import React, { useMemo, useState } from 'react';
import {
  FiUsers, FiUserPlus, FiSearch, FiShield, FiCheck, FiX, FiTrash2, FiEye, FiDownload,
  FiMail, FiRefreshCw, FiActivity, FiShieldOff
} from 'react-icons/fi';
import { useTenantApi, useAsyncResource, DataState } from '../useTenantApi';
import { useEnterpriseTenant } from '../EnterpriseContext';

const BUILTIN_ROLE_ORDER = ['MEMBER', 'VIEWER', 'WORKSPACE_MANAGER', 'TENANT_ADMIN', 'TENANT_OWNER'];
const STATUS_FILTERS = ['ALL', 'ACTIVE', 'SUSPENDED', 'INVITED'];

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export default function EnterpriseUsersTab({ currentPrincipalId, onInspectActivity = null }) {
  const { request, hasPermission } = useTenantApi();
  const { workspaces } = useEnterpriseTenant();
  const [membersState, refreshMembers] = useAsyncResource(() => request('/api/enterprise/memberships'), [request]);
  const [rolesState] = useAsyncResource(() => request('/api/enterprise/roles-matrix'), [request]);
  const { loading, error, data } = membersState;
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [detailMember, setDetailMember] = useState(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteMode, setInviteMode] = useState('INVITE');
  const [invitePrincipalId, setInvitePrincipalId] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('MEMBER');
  const [inviteWorkspaceId, setInviteWorkspaceId] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyAction, setBusyAction] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [notification, setNotification] = useState(null);

  const members = useMemo(() => (Array.isArray(data?.memberships) ? data.memberships : []), [data]);

  // Live role catalogue: platform roles plus tenant-defined custom roles.
  const roleEntries = useMemo(() => {
    const builtin = Object.entries(rolesState.data?.roles || {});
    const custom = Object.entries(rolesState.data?.customRoles || {}).map(([id, definition]) => [id, definition.permissions]);
    return { builtin, custom, all: [...builtin, ...custom] };
  }, [rolesState]);

  const roleOptions = useMemo(() => {
    const builtin = BUILTIN_ROLE_ORDER.filter(role => roleEntries.builtin.some(([id]) => id === role));
    return [...builtin, ...roleEntries.custom.map(([id]) => id)];
  }, [roleEntries]);

  const filtered = members.filter(member => {
    if (statusFilter !== 'ALL' && String(member.status || '').toUpperCase() !== statusFilter) return false;
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return `${member.principalId} ${(member.roles || []).join(' ')} ${member.status} ${member.invitationEmail || ''}`.toLowerCase().includes(query);
  });
  const canManageMembers = hasPermission('tenant.members.manage');

  const notify = (message) => {
    setNotification(message);
    setTimeout(() => setNotification(null), 3500);
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    if (busy) return;
    const wantsInvitation = inviteMode === 'INVITE';
    if (wantsInvitation && !inviteEmail.trim()) return;
    if (!wantsInvitation && !invitePrincipalId.trim()) return;
    setBusy(true);
    setActionError(null);
    try {
      const result = await request('/api/enterprise/memberships', {
        method: 'POST',
        body: {
          principalId: wantsInvitation ? '' : invitePrincipalId.trim(),
          ...(wantsInvitation ? { invitationEmail: inviteEmail.trim() } : {}),
          status: wantsInvitation ? 'INVITED' : 'ACTIVE',
          roles: [inviteRole],
          ...(inviteWorkspaceId ? { workspaceId: inviteWorkspaceId } : {}),
        },
      });
      setShowInviteModal(false);
      setInvitePrincipalId('');
      setInviteEmail('');
      setInviteRole('MEMBER');
      setInviteWorkspaceId('');
      notify(wantsInvitation
        ? `Invitation issued to ${result?.membership?.invitationEmail || inviteEmail.trim()}. It is accepted when they next sign in.`
        : `Enterprise access granted to ${result?.membership?.principalId || invitePrincipalId.trim()}.`);
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
    setBusyAction(`ws:${member.principalId}`);
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
    } finally {
      setBusyAction(null);
    }
  };

  const handleRoleChange = async (principalId, newRole) => {
    setActionError(null);
    setBusyAction(`role:${principalId}`);
    try {
      await request(`/api/enterprise/memberships/${encodeURIComponent(principalId)}`, {
        method: 'PATCH',
        body: { roles: [newRole] },
      });
      notify(`Updated ${principalId} to ${newRole}.`);
      refreshMembers();
    } catch (err) {
      setActionError(err?.message || 'Role could not be updated.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleToggleStatus = async (member) => {
    const next = member.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    setActionError(null);
    setBusyAction(`status:${member.principalId}`);
    try {
      await request(`/api/enterprise/memberships/${encodeURIComponent(member.principalId)}`, {
        method: 'PATCH',
        body: { status: next },
      });
      notify(`${member.principalId} ${next.toLowerCase()}.`);
      refreshMembers();
    } catch (err) {
      setActionError(err?.message || 'Membership status could not be updated.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleRemove = async (principalId) => {
    if (!window.confirm(`Remove ${principalId} from this enterprise? This revokes all enterprise access.`)) return;
    setActionError(null);
    setBusyAction(`remove:${principalId}`);
    try {
      await request(`/api/enterprise/memberships/${encodeURIComponent(principalId)}`, { method: 'DELETE' });
      notify(`Removed ${principalId} from the enterprise.`);
      refreshMembers();
    } catch (err) {
      setActionError(err?.message || 'Membership could not be removed.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleResendInvitation = async (member) => {
    setActionError(null);
    setBusyAction(`resend:${member.principalId}`);
    try {
      const result = await request(`/api/enterprise/memberships/${encodeURIComponent(member.principalId)}/invitation-resend`, { method: 'POST' });
      const delivery = result?.membership?.lastDeliveryState || 'unknown';
      notify(`Invitation re-sent to ${member.invitationEmail || member.principalId} (${delivery.toLowerCase().replace(/_/g, ' ')}).`);
      refreshMembers();
    } catch (err) {
      setActionError(err?.message || 'Invitation could not be resent.');
    } finally {
      setBusyAction(null);
    }
  };

  const handleExport = (format) => {
    const rows = filtered.map(member => ({
      principalId: member.principalId,
      roles: (member.roles || []).join('|'),
      status: member.status,
      workspaceId: member.workspaceId || '',
      invitationEmail: member.invitationEmail || '',
      invitedAt: member.invitedAt || '',
      acceptedAt: member.acceptedAt || '',
      createdAt: member.createdAt || '',
    }));
    if (!rows.length) return;
    let href;
    let name;
    if (format === 'csv') {
      const header = Object.keys(rows[0]);
      const csv = [header.join(','), ...rows.map(row => header.map(key => csvEscape(row[key])).join(','))].join('\n');
      href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
      name = `enterprise-members-${Date.now()}.csv`;
    } else {
      href = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(rows, null, 2));
      name = `enterprise-members-${Date.now()}.json`;
    }
    const anchor = document.createElement('a');
    anchor.setAttribute('href', href);
    anchor.setAttribute('download', name);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  // Effective permissions for a member: union across assigned roles resolved
  // from the live server roles matrix (builtin + tenant custom roles).
  const effectivePermissions = (member) => {
    const granted = new Set();
    for (const role of member.roles || []) {
      const definition = roleEntries.all.find(([id]) => id === role);
      if (!definition) continue;
      for (const permission of definition[1]) granted.add(permission === '*' ? 'ALL_PERMISSIONS' : permission);
    }
    return [...granted].sort();
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
              Server-verified enterprise memberships, invitations, roles, and workspace access
            </p>
          </div>
          <div className="enterprise-inline-actions" style={{ gap: '0.5rem' }}>
            <button
              type="button"
              className="enterprise-button enterprise-button-secondary"
              onClick={() => handleExport('csv')}
              disabled={filtered.length === 0}
              title="Export the current filtered member list"
            >
              <FiDownload aria-hidden="true" /> CSV
            </button>
            <button
              type="button"
              className="enterprise-button enterprise-button-secondary"
              onClick={() => handleExport('json')}
              disabled={filtered.length === 0}
            >
              <FiDownload aria-hidden="true" /> JSON
            </button>
            {canManageMembers && (
              <button
                type="button"
                className="enterprise-button enterprise-button-primary"
                onClick={() => setShowInviteModal(true)}
              >
                <FiUserPlus aria-hidden="true" /> Invite / Grant Access
              </button>
            )}
          </div>
        </div>

        <div className="enterprise-filter-bar">
          <div className="enterprise-search-wrapper">
            <FiSearch className="enterprise-search-icon" aria-hidden="true" />
            <input
              type="text"
              placeholder="Search members by principal, email, role, or status…"
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
            <p className="enterprise-empty">No enterprise members match this view. Invite a teammate to begin.</p>
          ) : (
            <div className="enterprise-table-wrapper">
              <table className="enterprise-table">
                <thead>
                  <tr>
                    <th>Principal</th>
                    <th>Roles</th>
                    <th>Status</th>
                    <th>Invitation</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(member => {
                    const invited = String(member.status || '').toUpperCase() === 'INVITED';
                    return (
                      <tr key={`${member.tenantId}:${member.principalId}`}>
                        <td>
                          <div className="enterprise-user-cell">
                            <div className="enterprise-avatar"><FiUsers /></div>
                            <div>
                              <strong>{member.principalId}</strong>
                              <small>{member.invitationEmail || member.id}</small>
                            </div>
                          </div>
                        </td>
                        <td>
                          <select
                            className="enterprise-select"
                            value={(member.roles && member.roles[0]) || 'MEMBER'}
                            disabled={!canManageMembers || busyAction === `role:${member.principalId}` || (member.principalId === currentPrincipalId && (member.roles || []).includes('TENANT_OWNER'))}
                            onChange={(e) => handleRoleChange(member.principalId, e.target.value)}
                            aria-label={`Role for ${member.principalId}`}
                          >
                            {roleOptions.map(role => <option key={role} value={role}>{role}</option>)}
                          </select>
                        </td>
                        <td>
                          <span className={`enterprise-pill enterprise-pill-${member.status === 'ACTIVE' ? 'success' : (member.status === 'SUSPENDED' ? 'warning' : 'secondary')}`}>
                            {member.status}
                          </span>
                        </td>
                        <td>
                          {invited ? (
                            <small className="text-muted">
                              <FiMail aria-hidden="true" /> {member.invitationEmail || 'no address'}
                              {member.invitationDeliveryState ? ` · ${String(member.invitationDeliveryState).toLowerCase().replace(/_/g, ' ')}` : ''}
                            </small>
                          ) : (
                            <small className="text-muted">{member.acceptedAt ? 'accepted' : '—'}</small>
                          )}
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
                            {onInspectActivity && (
                              <button
                                type="button"
                                className="enterprise-button-icon"
                                title={`View audit activity for ${member.principalId}`}
                                onClick={() => onInspectActivity(member.principalId)}
                              >
                                <FiActivity />
                              </button>
                            )}
                            {canManageMembers && invited && (
                              <button
                                type="button"
                                className="enterprise-button-icon"
                                title="Resend invitation"
                                disabled={busyAction === `resend:${member.principalId}`}
                                onClick={() => handleResendInvitation(member)}
                              >
                                <FiRefreshCw />
                              </button>
                            )}
                            {canManageMembers && member.principalId !== currentPrincipalId && !invited && (
                              <button
                                type="button"
                                className="enterprise-button-icon"
                                title={member.status === 'ACTIVE' ? 'Suspend member' : 'Reactivate member'}
                                disabled={busyAction === `status:${member.principalId}`}
                                onClick={() => handleToggleStatus(member)}
                              >
                                {member.status === 'ACTIVE' ? <FiShield /> : <FiShieldOff />}
                              </button>
                            )}
                            {canManageMembers && member.principalId !== currentPrincipalId && (
                              <button
                                type="button"
                                className="enterprise-button-icon text-danger"
                                title={invited ? 'Cancel invitation' : 'Remove member'}
                                disabled={busyAction === `remove:${member.principalId}`}
                                onClick={() => handleRemove(member.principalId)}
                              >
                                <FiTrash2 />
                              </button>
                            )}
                            {member.principalId === currentPrincipalId && <small className="text-muted" title="You cannot remove yourself">you</small>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
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
              <h3>Invite to Enterprise</h3>
              <button type="button" className="enterprise-button-icon" onClick={() => setShowInviteModal(false)} disabled={busy}>
                <FiX />
              </button>
            </div>
            <form onSubmit={handleInvite}>
              <div className="enterprise-modal-body">
                <div className="enterprise-form-group">
                  <label>Access mode</label>
                  <div className="enterprise-checkbox-list">
                    <label className="enterprise-checkbox">
                      <input
                        type="radio"
                        name="invite-mode"
                        checked={inviteMode === 'INVITE'}
                        onChange={() => setInviteMode('INVITE')}
                      />
                      <span><strong>Invitation</strong> — the member activates access the first time they sign in. Delivered by email.</span>
                    </label>
                    <label className="enterprise-checkbox">
                      <input
                        type="radio"
                        name="invite-mode"
                        checked={inviteMode === 'DIRECT'}
                        onChange={() => setInviteMode('DIRECT')}
                      />
                      <span><strong>Direct grant</strong> — immediate access for an already-verified identity.</span>
                    </label>
                  </div>
                </div>
                {inviteMode === 'INVITE' ? (
                  <div className="enterprise-form-group">
                    <label htmlFor="member-email">Invitation Email</label>
                    <input
                      id="member-email"
                      type="email"
                      required
                      placeholder="teammate@company.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className="enterprise-input"
                      autoFocus
                    />
                    <small className="text-muted">
                      The backend resolves the address to the registered identity server-side. Unregistered addresses are refused.
                    </small>
                  </div>
                ) : (
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
                      Access is granted only to an already-verified identity.
                    </small>
                  </div>
                )}
                <div className="enterprise-form-group">
                  <label htmlFor="member-role">Role</label>
                  <select
                    id="member-role"
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    className="enterprise-select"
                  >
                    {roleOptions.filter(role => role !== 'TENANT_OWNER').map(role => <option key={role} value={role}>{role}</option>)}
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
                  {busy ? 'Working…' : inviteMode === 'INVITE' ? 'Send Invitation' : 'Grant Access'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {detailMember && (
        <div className="enterprise-modal-backdrop" role="presentation" onClick={() => setDetailMember(null)}>
          <div className="enterprise-modal enterprise-modal-lg" role="dialog" aria-modal="true" aria-label={`Membership details for ${detailMember.principalId}`} onClick={(e) => e.stopPropagation()}>
            <div className="enterprise-modal-header">
              <h3>Membership Details</h3>
              <button type="button" className="enterprise-button-icon" onClick={() => setDetailMember(null)} aria-label="Close membership details">
                <FiX />
              </button>
            </div>
            <div className="enterprise-modal-body">
              <div className="enterprise-two-column-grid">
                <div className="enterprise-form-group">
                  <label>Principal</label>
                  <input type="text" value={detailMember.principalId} disabled className="enterprise-input enterprise-input-disabled" />
                </div>
                <div className="enterprise-form-group">
                  <label>Membership Record</label>
                  <input type="text" value={detailMember.id} disabled className="enterprise-input enterprise-input-disabled" />
                </div>
              </div>
              <div className="enterprise-form-group">
                <label>Roles</label>
                <div className="enterprise-inline-actions" style={{ flexWrap: 'wrap', gap: '0.35rem' }}>
                  {(detailMember.roles || []).map(role => (
                    <span key={role} className={`enterprise-pill ${role.startsWith('CUSTOM_') ? 'enterprise-pill-template' : 'enterprise-pill-secondary'}`}>{role}</span>
                  ))}
                </div>
              </div>
              <div className="enterprise-two-column-grid">
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
              </div>
              {detailMember.invitationEmail && (
                <div className="enterprise-two-column-grid">
                  <div className="enterprise-form-group">
                    <label>Invitation Email</label>
                    <input type="text" value={detailMember.invitationEmail} disabled className="enterprise-input enterprise-input-disabled" />
                  </div>
                  <div className="enterprise-form-group">
                    <label>Invitation State</label>
                    <input
                      type="text"
                      value={`${detailMember.status || ''}${detailMember.acceptedAt ? ` · accepted ${String(detailMember.acceptedAt).slice(0, 10)}` : ''}${detailMember.invitationDeliveryState ? ` · ${String(detailMember.invitationDeliveryState).toLowerCase().replace(/_/g, ' ')}` : ''}`}
                      disabled
                      className="enterprise-input enterprise-input-disabled"
                    />
                  </div>
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
              <div className="enterprise-form-group">
                <label>Effective Permissions <small className="text-muted">(resolved from the live server role definitions)</small></label>
                <div className="enterprise-inline-actions" style={{ flexWrap: 'wrap', gap: '0.35rem' }} aria-label="Effective permissions">
                  {effectivePermissions(detailMember).map(permission => (
                    <span key={permission} className="enterprise-pill enterprise-pill-secondary">{permission}</span>
                  ))}
                  {effectivePermissions(detailMember).length === 0 && (
                    <small className="text-muted">No permissions are granted by the assigned roles.</small>
                  )}
                </div>
              </div>
            </div>
            <div className="enterprise-modal-footer">
              {onInspectActivity && (
                <button
                  type="button"
                  className="enterprise-button enterprise-button-secondary"
                  onClick={() => { const id = detailMember.principalId; setDetailMember(null); onInspectActivity(id); }}
                >
                  <FiActivity aria-hidden="true" /> View Audit Activity
                </button>
              )}
              <button type="button" className="enterprise-button enterprise-button-primary" onClick={() => setDetailMember(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
