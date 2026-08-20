import React, { useState } from 'react';
import {
  FiUsers, FiPlus, FiEdit2, FiTrash2, FiSliders, FiCheck, FiX
} from 'react-icons/fi';

const INITIAL_TEAMS = [
  { id: 'team-1', name: 'Core Platform Engineering', description: 'Cloud infrastructure, backend microservices, and security systems', memberCount: 6, workspace: 'Engineering', lead: 'Elena Rostova' },
  { id: 'team-2', name: 'Product Experience & Design', description: 'Design tokens, templates, and UI/UX design systems', memberCount: 4, workspace: 'Product & Design', lead: 'Marcus Chen' },
  { id: 'team-3', name: 'Talent Acquisition & Recruiting', description: 'Candidate screening, hiring pipelines, and assessment review', memberCount: 3, workspace: 'Recruiting', lead: 'David Kim' },
];

export default function EnterpriseTeamsTab({ workspaces }) {
  const [teams, setTeams] = useState(INITIAL_TEAMS);
  const [showModal, setShowModal] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [teamDescription, setTeamDescription] = useState('');
  const [teamWorkspace, setTeamWorkspace] = useState(workspaces?.[0]?.name || 'Engineering');
  const [notification, setNotification] = useState(null);

  const handleCreateTeam = (e) => {
    e.preventDefault();
    if (!teamName.trim()) return;
    const newTeam = {
      id: `team-${Date.now()}`,
      name: teamName.trim(),
      description: teamDescription.trim() || 'Workspace team group',
      memberCount: 1,
      workspace: teamWorkspace,
      lead: 'You',
    };
    setTeams(prev => [newTeam, ...prev]);
    setShowModal(false);
    setTeamName('');
    setTeamDescription('');
    setNotification(`Team "${newTeam.name}" created successfully.`);
    setTimeout(() => setNotification(null), 3000);
  };

  const handleDeleteTeam = (teamId) => {
    setTeams(prev => prev.filter(t => t.id !== teamId));
    setNotification('Team deleted.');
    setTimeout(() => setNotification(null), 3000);
  };

  return (
    <div className="enterprise-tab-content">
      {notification && (
        <div className="enterprise-toast enterprise-toast-success">
          <FiCheck aria-hidden="true" /> {notification}
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
          <button
            type="button"
            className="enterprise-button enterprise-button-primary"
            onClick={() => setShowModal(true)}
          >
            <FiPlus aria-hidden="true" /> Create Team
          </button>
        </div>

        <div className="enterprise-teams-grid">
          {teams.map(team => (
            <div key={team.id} className="enterprise-team-card">
              <div className="enterprise-team-header">
                <div>
                  <h3 className="enterprise-team-name">{team.name}</h3>
                  <span className="enterprise-pill enterprise-pill-secondary">{team.workspace}</span>
                </div>
                <button
                  type="button"
                  className="enterprise-button-icon text-danger"
                  title="Delete Team"
                  onClick={() => handleDeleteTeam(team.id)}
                >
                  <FiTrash2 />
                </button>
              </div>
              <p className="enterprise-team-desc">{team.description}</p>
              <div className="enterprise-team-footer">
                <div className="enterprise-team-meta">
                  <FiUsers aria-hidden="true" /> <strong>{team.memberCount}</strong> members · Lead: <em>{team.lead}</em>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {showModal && (
        <div className="enterprise-modal-backdrop" role="presentation" onClick={() => setShowModal(false)}>
          <div className="enterprise-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="enterprise-modal-header">
              <h3>Create Enterprise Team</h3>
              <button type="button" className="enterprise-button-icon" onClick={() => setShowModal(false)}>
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

                <div className="enterprise-form-group">
                  <label htmlFor="team-desc">Description</label>
                  <input
                    id="team-desc"
                    type="text"
                    placeholder="Purpose and focus of this team…"
                    value={teamDescription}
                    onChange={(e) => setTeamDescription(e.target.value)}
                    className="enterprise-input"
                  />
                </div>

                <div className="enterprise-form-group">
                  <label htmlFor="team-workspace">Assigned Workspace</label>
                  <select
                    id="team-workspace"
                    value={teamWorkspace}
                    onChange={(e) => setTeamWorkspace(e.target.value)}
                    className="enterprise-select"
                  >
                    {workspaces?.map(w => (
                      <option key={w.id} value={w.name}>{w.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="enterprise-modal-footer">
                <button
                  type="button"
                  className="enterprise-button enterprise-button-secondary"
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="enterprise-button enterprise-button-primary"
                >
                  Create Team
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
