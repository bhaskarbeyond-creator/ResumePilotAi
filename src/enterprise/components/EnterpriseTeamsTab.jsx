import React, { useMemo, useState } from 'react';
import {
  FiUsers, FiPlus, FiCheck, FiX, FiEdit2, FiArchive, FiRotateCcw, FiUserPlus, FiSearch, FiAward, FiTrash2
} from 'react-icons/fi';
import { useTenantApi, useAsyncResource, DataState } from '../useTenantApi';

function TeamMembersDrawer({ team, onClose }) {
  const { request, hasPermission } = useTenantApi();
  const canManage = hasPermission('workspace.members.manage') || hasPermission('tenant.members.manage');
  const [membersState, refreshMembers] = useAsyncResource(
    () => request(`/api/enterprise/teams/${encodeURIComponent(team.id)}/members`),
    [request, team.id],
  );
  const [tenantMembersState] = useAsyncResource(() => request('/api/enterprise/memberships'), [request]);
  const [selectedPrincipal, setSelectedPrincipal] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);

  const members = useMemo(() => (Array.isArray(membersState.data?.members) ? membersState.data.members : []), [membersState]);
  const candidates = useMemo(() => {
    const existing = new Set(members.map(member => member.principalId));
    const all = Array.isArray(tenantMembersState.data?.memberships) ? tenantMembersState.data.memberships : [];
    return all.filter(member => member.status === 'ACTIVE' && !existing.has(member.principalId));
  }, [members, tenantMembersState]);

  const handleAdd = async (event) => {
    event.preventDefault();
    if (!selectedPrincipal || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await request(`/api/enterprise/teams/${encodeURIComponent(team.id)}/members`, {
        method: 'POST',
        body: { principalId: selectedPrincipal },
      });
      setSelectedPrincipal('');
      refreshMembers();
    } catch (err) {
      setActionError(err?.message || 'Team member could not be added.');
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (principalId) => {
    if (!window.confirm(`Remove ${principalId} from team "${team.name}"?`)) return;
    setActionError(null);
    try {
      await request(`/api/enterprise/teams/${encodeURIComponent(team.id)}/members/${encodeURIComponent(principalId)}`, { method: 'DELETE' });
      refreshMembers();
    } catch (err) {
      setActionError(err?.message || 'Team member could not be removed.');
    }
  };

  return (
    <div className="enterprise-modal-backdrop" role="presentation" onClick={onClose}>
      <div className="enterprise-modal enterprise-modal-lg" role="dialog" aria-modal="true" aria-label={`Members of team ${team.name}`} onClick={(e) => e.stopPropagation()}>
        <div className="enterprise-modal-header">
          <h3><FiUsers aria-hidden="true" /> Team Members — {team.name}</h3>
          <button type="button" className="enterprise-button-icon" onClick={onClose} aria-label="Close team members panel">
            <FiX />
          </button>
        </div>
        <div className="enterprise-modal-body">
          {actionError && (
            <div role="alert" className="enterprise-error-row" style={{ marginBottom: '0.75rem' }}>
              <span className="enterprise-error-icon" aria-hidden="true">⚠</span>
              <span className="text-muted">{actionError}</span>
            </div>
          )}
          {canManage && (
            <form onSubmit={handleAdd} className="enterprise-inline-actions" style={{ marginBottom: '1rem', gap: '0.5rem', flexWrap: 'wrap' }}>
              <select
                className="enterprise-select"
                value={selectedPrincipal}
                onChange={(e) => setSelectedPrincipal(e.target.value)}
                aria-label="Select tenant member to add to the team"
                style={{ minWidth: '260px' }}
              >
                <option value="">Select a tenant member to add…</option>
                {candidates.map(candidate => (
                  <option key={candidate.principalId} value={candidate.principalId}>
                    {candidate.principalId} ({(candidate.roles || []).join(', ')})
                  </option>
                ))}
              </select>
              <button type="submit" className="enterprise-button enterprise-button-primary enterprise-button-sm" disabled={!selectedPrincipal || busy}>
                <FiUserPlus aria-hidden="true" /> {busy ? 'Adding…' : 'Add to Team'}
              </button>
            </form>
          )}
          <DataState loading={membersState.loading} error={membersState.error} onRetry={refreshMembers}>
            {members.length === 0 ? (
              <p className="enterprise-empty">No members are assigned to this team yet.</p>
            ) : (
              <div className="enterprise-table-wrapper">
                <table className="enterprise-table">
                  <thead>
                    <tr>
                      <th>Principal</th>
                      <th>Status</th>
                      {canManage && <th className="text-right">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {members.map(member => (
                      <tr key={member.id}>
                        <td>
                          <strong>{member.principalId}</strong>
                          {team.leadPrincipalId && team.leadPrincipalId === member.principalId && (
                            <span className="enterprise-pill enterprise-pill-template" style={{ marginLeft: '0.5rem' }}>Lead</span>
                          )}
                        </td>
                        <td><span className="enterprise-pill enterprise-pill-success">{member.status}</span></td>
                        {canManage && (
                          <td className="text-right">
                            <button
                              type="button"
                              className="enterprise-button-icon text-danger"
                              title={`Remove ${member.principalId} from team`}
                              onClick={() => handleRemove(member.principalId)}
                            >
                              <FiTrash2 />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </DataState>
        </div>
        <div className="enterprise-modal-footer">
          <button type="button" className="enterprise-button enterprise-button-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

export default function EnterpriseTeamsTab() {
  const { request, workspaceId, hasPermission } = useTenantApi();
  const [teamsState, refreshTeams] = useAsyncResource(() => request('/api/enterprise/teams'), [request]);
  const { loading, error, data } = teamsState;
  const [showModal, setShowModal] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [leadTarget, setLeadTarget] = useState(null);
  const [leadValue, setLeadValue] = useState('');
  const [membersTarget, setMembersTarget] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [notification, setNotification] = useState(null);

  const canManageTeams = hasPermission('workspace.manage') || hasPermission('tenant.workspaces.manage');

  // Archived teams are served only to workspace administrators so they can be
  // inspected and restored — the same lifecycle contract as workspaces.
  const [archivedState, refreshArchived] = useAsyncResource(
    () => (canManageTeams ? request('/api/enterprise/teams?includeArchived=1') : Promise.resolve({ teams: [] })),
    [request, canManageTeams],
  );
  const archivedTeams = useMemo(
    () => (Array.isArray(archivedState.data?.teams) ? archivedState.data.teams.filter(team => String(team.status || '').toUpperCase() === 'ARCHIVED') : []),
    [archivedState],
  );

  const [tenantMembersState] = useAsyncResource(() => request('/api/enterprise/memberships'), [request]);
  const activeMemberOptions = useMemo(
    () => (Array.isArray(tenantMembersState.data?.memberships) ? tenantMembersState.data.memberships.filter(member => member.status === 'ACTIVE') : []),
    [tenantMembersState],
  );

  const teams = useMemo(() => {
    const active = Array.isArray(data?.teams) ? data.teams : [];
    const query = searchQuery.trim().toLowerCase();
    if (!query) return active;
    return active.filter(team => `${team.name} ${team.leadPrincipalId || ''}`.toLowerCase().includes(query));
  }, [data, searchQuery]);

  const notify = (message) => {
    setNotification(message);
    setTimeout(() => setNotification(null), 3500);
  };

  const handleCreateTeam = async (e) => {
    e.preventDefault();
    if (!teamName.trim() || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await request('/api/enterprise/teams', { method: 'POST', body: { name: teamName.trim(), workspaceId } });
      notify(`Team "${teamName.trim()}" created.`);
      setShowModal(false);
      setTeamName('');
      refreshTeams();
      refreshArchived();
    } catch (err) {
      setActionError(err?.message || 'Team could not be created.');
    } finally {
      setBusy(false);
    }
  };

  const handleRename = async (e) => {
    e.preventDefault();
    const name = renameValue.trim();
    if (!name || !renameTarget || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await request(`/api/enterprise/teams/${encodeURIComponent(renameTarget.id)}`, { method: 'PATCH', body: { name } });
      notify(`Team renamed to "${name}".`);
      setRenameTarget(null);
      setRenameValue('');
      refreshTeams();
    } catch (err) {
      setActionError(err?.message || 'Team could not be renamed.');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveLead = async (e) => {
    e.preventDefault();
    if (!leadTarget || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await request(`/api/enterprise/teams/${encodeURIComponent(leadTarget.id)}`, {
        method: 'PATCH',
        body: { leadPrincipalId: leadValue },
      });
      notify(leadValue ? `Team lead set to ${leadValue}.` : 'Team lead cleared.');
      setLeadTarget(null);
      setLeadValue('');
      refreshTeams();
    } catch (err) {
      setActionError(err?.message || 'Team lead could not be updated.');
    } finally {
      setBusy(false);
    }
  };

  const handleArchive = async (team) => {
    if (!window.confirm(`Archive team "${team.name}"? The team is removed from the active roster and can be restored later; its history stays in the audit log.`)) return;
    setActionError(null);
    try {
      await request(`/api/enterprise/teams/${encodeURIComponent(team.id)}/archive`, { method: 'POST' });
      notify(`Team "${team.name}" archived.`);
      refreshTeams();
      refreshArchived();
    } catch (err) {
      setActionError(err?.message || 'Team could not be archived.');
    }
  };

  const handleRestore = async (team) => {
    setActionError(null);
    try {
      await request(`/api/enterprise/teams/${encodeURIComponent(team.id)}/restore`, { method: 'POST' });
      notify(`Team "${team.name}" restored to the active roster.`);
      refreshTeams();
      refreshArchived();
    } catch (err) {
      setActionError(err?.message || 'Team could not be restored.');
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
            <div><strong>Team action failed</strong><p className="text-muted">{actionError}</p></div>
          </div>
        </div>
      )}

      <div className="enterprise-card">
        <div className="enterprise-card-header-flex">
          <div>
            <h2 className="enterprise-tab-title">Teams Management</h2>
            <p className="enterprise-tab-subtitle">
              Organize members into functional units scoped to specific workspaces and collaboration groups
            </p>
          </div>
          {canManageTeams && (
            <button
              type="button"
              className="enterprise-button enterprise-button-primary"
              onClick={() => setShowModal(true)}
            >
              <FiPlus aria-hidden="true" /> Create Team
            </button>
          )}
        </div>

        <div className="enterprise-filter-bar">
          <div className="enterprise-search-wrapper">
            <FiSearch className="enterprise-search-icon" aria-hidden="true" />
            <input
              type="text"
              placeholder="Search teams by name or lead…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="enterprise-input"
              aria-label="Search teams"
            />
          </div>
        </div>

        <DataState loading={loading} error={error} onRetry={refreshTeams}>
          {teams.length === 0 ? (
            <p className="enterprise-empty">{searchQuery ? 'No teams match this search.' : 'No teams exist in this workspace yet. Create a team to group members.'}</p>
          ) : (
            <div className="enterprise-teams-grid">
              {teams.map(team => (
                <div key={team.id} className="enterprise-team-card">
                  <div className="enterprise-team-header">
                    <div>
                      <h3 className="enterprise-team-name">{team.name}</h3>
                      <span className="enterprise-pill enterprise-pill-secondary">
                        {team.workspaceId ? `ws ${String(team.workspaceId).slice(0, 8)}` : 'Tenant-wide'}
                      </span>
                      {team.leadPrincipalId && (
                        <span className="enterprise-pill enterprise-pill-template" style={{ marginLeft: '0.35rem' }} title={`Team lead: ${team.leadPrincipalId}`}>
                          <FiAward aria-hidden="true" /> {String(team.leadPrincipalId).slice(0, 10)}…
                        </span>
                      )}
                    </div>
                    {canManageTeams && (
                      <div className="enterprise-inline-actions" style={{ gap: '0.25rem' }}>
                        <button
                          type="button"
                          className="enterprise-button-icon"
                          title="Set team lead"
                          onClick={() => { setLeadTarget(team); setLeadValue(team.leadPrincipalId || ''); }}
                        >
                          <FiAward />
                        </button>
                        <button
                          type="button"
                          className="enterprise-button-icon"
                          title={`Rename ${team.name}`}
                          onClick={() => { setRenameTarget(team); setRenameValue(team.name); }}
                        >
                          <FiEdit2 />
                        </button>
                        <button
                          type="button"
                          className="enterprise-button-icon text-danger"
                          title={`Archive ${team.name}`}
                          onClick={() => handleArchive(team)}
                        >
                          <FiArchive />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="enterprise-team-footer">
                    <div className="enterprise-team-meta">
                      <FiUsers aria-hidden="true" /> Scoped workspace team
                    </div>
                    <button
                      type="button"
                      className="enterprise-button enterprise-button-secondary enterprise-button-sm"
                      onClick={() => setMembersTarget(team)}
                    >
                      <FiUsers aria-hidden="true" /> Manage Members
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DataState>
      </div>

      {canManageTeams && (
        <div className="enterprise-card" style={{ marginTop: '1.5rem' }}>
          <div className="enterprise-card-header-flex">
            <div>
              <h3 className="enterprise-card-title"><FiArchive aria-hidden="true" /> Archived Teams</h3>
              <p className="enterprise-card-subtitle">Archived teams are hidden from the roster until restored. Data and history are preserved.</p>
            </div>
          </div>
          <DataState loading={archivedState.loading} error={archivedState.error} onRetry={refreshArchived}>
            {archivedTeams.length === 0 ? (
              <p className="enterprise-empty">No archived teams.</p>
            ) : (
              <div className="enterprise-teams-grid">
                {archivedTeams.map(team => (
                  <div key={team.id} className="enterprise-team-card">
                    <div className="enterprise-team-header">
                      <div>
                        <h3 className="enterprise-team-name">{team.name}</h3>
                        <span className="enterprise-pill enterprise-pill-warning">Archived</span>
                      </div>
                      <div className="enterprise-inline-actions" style={{ gap: '0.25rem' }}>
                        <button
                          type="button"
                          className="enterprise-button enterprise-button-secondary enterprise-button-sm"
                          onClick={() => handleRestore(team)}
                        >
                          <FiRotateCcw aria-hidden="true" /> Restore
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </DataState>
        </div>
      )}

      {showModal && (
        <div className="enterprise-modal-backdrop" role="presentation" onClick={() => !busy && setShowModal(false)}>
          <div className="enterprise-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="enterprise-modal-header">
              <h3>Create Enterprise Team</h3>
              <button type="button" className="enterprise-button-icon" onClick={() => setShowModal(false)} disabled={busy}>
                <FiX />
              </button>
            </div>
            <form onSubmit={handleCreateTeam}>
              <div className="enterprise-modal-body">
                <div className="enterprise-form-group">
                  <label htmlFor="team-name">Team Name</label>
                  <input
                    id="team-name"
                    type="text"
                    required
                    placeholder="e.g. Executive Search Team"
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    className="enterprise-input"
                    autoFocus
                  />
                </div>
              </div>
              <div className="enterprise-modal-footer">
                <button
                  type="button"
                  className="enterprise-button enterprise-button-secondary"
                  onClick={() => setShowModal(false)}
                  disabled={busy}
                >
                  Cancel
                </button>
                <button type="submit" className="enterprise-button enterprise-button-primary" disabled={busy}>
                  {busy ? 'Creating…' : 'Create Team'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {renameTarget && (
        <div className="enterprise-modal-backdrop" role="presentation" onClick={() => !busy && setRenameTarget(null)}>
          <div className="enterprise-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="enterprise-modal-header">
              <h3>Rename Team</h3>
              <button type="button" className="enterprise-button-icon" onClick={() => setRenameTarget(null)} disabled={busy}>
                <FiX />
              </button>
            </div>
            <form onSubmit={handleRename}>
              <div className="enterprise-modal-body">
                <div className="enterprise-form-group">
                  <label htmlFor="team-rename">Team Name</label>
                  <input
                    id="team-rename"
                    type="text"
                    required
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    className="enterprise-input"
                    autoFocus
                  />
                </div>
              </div>
              <div className="enterprise-modal-footer">
                <button type="button" className="enterprise-button enterprise-button-secondary" onClick={() => setRenameTarget(null)} disabled={busy}>Cancel</button>
                <button type="submit" className="enterprise-button enterprise-button-primary" disabled={busy}>
                  {busy ? 'Saving…' : 'Save Name'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {leadTarget && (
        <div className="enterprise-modal-backdrop" role="presentation" onClick={() => !busy && setLeadTarget(null)}>
          <div className="enterprise-modal" role="dialog" aria-modal="true" aria-label="Set team lead" onClick={(e) => e.stopPropagation()}>
            <div className="enterprise-modal-header">
              <h3>Team Lead — {leadTarget.name}</h3>
              <button type="button" className="enterprise-button-icon" onClick={() => setLeadTarget(null)} disabled={busy}>
                <FiX />
              </button>
            </div>
            <form onSubmit={handleSaveLead}>
              <div className="enterprise-modal-body">
                <div className="enterprise-form-group">
                  <label htmlFor="team-lead">Lead Principal</label>
                  <select
                    id="team-lead"
                    className="enterprise-select"
                    value={leadValue}
                    onChange={(e) => setLeadValue(e.target.value)}
                  >
                    <option value="">No lead</option>
                    {activeMemberOptions.map(member => (
                      <option key={member.principalId} value={member.principalId}>
                        {member.principalId} ({(member.roles || []).join(', ')})
                      </option>
                    ))}
                  </select>
                  <small className="text-muted">The lead must be an active member of the team&apos;s workspace. The change is audited.</small>
                </div>
              </div>
              <div className="enterprise-modal-footer">
                <button type="button" className="enterprise-button enterprise-button-secondary" onClick={() => setLeadTarget(null)} disabled={busy}>Cancel</button>
                <button type="submit" className="enterprise-button enterprise-button-primary" disabled={busy}>
                  {busy ? 'Saving…' : 'Save Lead'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {membersTarget && (
        <TeamMembersDrawer team={membersTarget} onClose={() => setMembersTarget(null)} />
      )}
    </div>
  );
}
