import React, { useMemo, useState } from 'react';
import {
  FiUsers, FiPlus, FiCheck, FiX
} from 'react-icons/fi';
import { useTenantApi, useAsyncResource, DataState } from '../useTenantApi';

export default function EnterpriseTeamsTab() {
  const { request, workspaceId, hasPermission } = useTenantApi();
  const [teamsState, refreshTeams] = useAsyncResource(() => request('/api/enterprise/teams'), [request]);
  const { loading, error, data } = teamsState;
  const [showModal, setShowModal] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [notification, setNotification] = useState(null);

  const teams = useMemo(() => (Array.isArray(data?.teams) ? data.teams : []), [data]);
  const canManageTeams = hasPermission('workspace.manage');

  const handleCreateTeam = async (e) => {
    e.preventDefault();
    if (!teamName.trim() || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await request('/api/enterprise/teams', { method: 'POST', body: { name: teamName.trim(), workspaceId } });
      setNotification(`Team "${teamName.trim()}" created.`);
      setShowModal(false);
      setTeamName('');
      refreshTeams();
    } catch (err) {
      setActionError(err?.message || 'Team could not be created.');
    } finally {
      setBusy(false);
      setTimeout(() => setNotification(null), 3500);
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

        <DataState loading={loading} error={error} onRetry={refreshTeams}>
          {teams.length === 0 ? (
            <p className="enterprise-empty">No teams exist in this workspace yet. Create a team to group members.</p>
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
                    </div>
                  </div>
                  <div className="enterprise-team-footer">
                    <div className="enterprise-team-meta">
                      <FiUsers aria-hidden="true" /> Scoped workspace team
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DataState>
      </div>

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
    </div>
  );
}
