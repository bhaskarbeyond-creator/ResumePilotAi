import React, { useState, useMemo } from 'react';
import {
  FiUsers, FiUserPlus, FiSearch, FiFilter, FiMoreVertical,
  FiShield, FiMail, FiCheck, FiX, FiTrash2, FiEdit2, FiAlertCircle
} from 'react-icons/fi';

const INITIAL_USERS = [
  { id: 'usr-1', name: 'Alexander Wright', email: 'alex.wright@acme.corp', role: 'OWNER', status: 'ACTIVE', workspace: 'All Workspaces', lastActive: '2 mins ago' },
  { id: 'usr-2', name: 'Elena Rostova', email: 'elena.rostova@acme.corp', role: 'ADMIN', status: 'ACTIVE', workspace: 'Engineering', lastActive: '15 mins ago' },
  { id: 'usr-3', name: 'Marcus Chen', email: 'marcus.chen@acme.corp', role: 'MANAGER', status: 'ACTIVE', workspace: 'Product & Design', lastActive: '1 hour ago' },
  { id: 'usr-4', name: 'Sarah Jenkins', email: 'sarah.j@acme.corp', role: 'MEMBER', status: 'ACTIVE', workspace: 'Marketing', lastActive: '3 hours ago' },
  { id: 'usr-5', name: 'David Kim', email: 'david.kim@partner.io', role: 'VIEWER', status: 'INVITED', workspace: 'Recruiting', lastActive: 'Invited yesterday' },
  { id: 'usr-6', name: 'Rachel Green', email: 'rachel.g@acme.corp', role: 'MEMBER', status: 'SUSPENDED', workspace: 'Sales', lastActive: '5 days ago' },
];

export default function EnterpriseUsersTab({
  workspaces,
  _onInviteUser
}) {
  const [users, setUsers] = useState(INITIAL_USERS);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, _setInviteEmail] = useState('');
  const [inviteRole, _setInviteRole] = useState('MEMBER');
  const [inviteWorkspace, _setInviteWorkspace] = useState(workspaces?.[0]?.name || 'Default');
  const [selectedUser, _setSelectedUser] = useState(null);
  const [notification, setNotification] = useState(null);

  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      const matchesSearch = `${user.name} ${user.email}`.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesRole = roleFilter === 'ALL' || user.role === roleFilter;
      const matchesStatus = statusFilter === 'ALL' || user.status === statusFilter;
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, searchQuery, roleFilter, statusFilter]);

  const handleInviteSubmit = (e) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    const newUser = {
      id: `usr-${Date.now()}`,
      name: inviteEmail.split('@')[0].replace('.', ' '),
      email: inviteEmail.trim(),
      role: inviteRole,
      status: 'INVITED',
      workspace: inviteWorkspace,
      lastActive: 'Just invited',
    };
    setUsers(prev => [newUser, ...prev]);
    setShowInviteModal(false);
    setInviteEmail('');
    setNotification(`Invitation successfully sent to ${newUser.email}`);
    setTimeout(() => setNotification(null), 4000);
  };

  const handleToggleStatus = (userId) => {
    setUsers(prev => prev.map(u => {
      if (u.id === userId) {
        const nextStatus = u.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
        return { ...u, status: nextStatus };
      }
      return u;
    }));
  };

  const handleDeleteUser = (userId) => {
    setUsers(prev => prev.filter(u => u.id !== userId));
    setSelectedUser(null);
    setNotification('User access revoked from tenant.');
    setTimeout(() => setNotification(null), 3000);
  };

  const handleRoleChange = (userId, newRole) => {
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
    setNotification(`Updated role to ${newRole}`);
    setTimeout(() => setNotification(null), 3000);
  };

  return (
    <div className="enterprise-tab-content">
      {notification && (
        <div className="enterprise-toast enterprise-toast-success">
          <FiCheck aria-hidden="true" /> {notification}
        </div>
      )}

      {/* Header with Search and Invite Button */}
      <div className="enterprise-card">
        <div className="enterprise-card-header-flex">
          <div>
            <h2 className="enterprise-tab-title">Users & IAM Directory</h2>
            <p className="enterprise-tab-subtitle">Manage organization memberships, seat allocations, and workspace scopes</p>
          </div>
          <button
            type="button"
            className="enterprise-button enterprise-button-primary"
            onClick={() => setShowInviteModal(true)}
          >
            <FiUserPlus aria-hidden="true" /> Invite Member
          </button>
        </div>

        {/* Filter Bar */}
        <div className="enterprise-filter-bar">
          <div className="enterprise-search-wrapper">
            <FiSearch className="enterprise-search-icon" aria-hidden="true" />
            <input
              type="text"
              placeholder="Search members by name or email…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="enterprise-input"
            />
          </div>

          <div className="enterprise-select-group">
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="enterprise-select"
              aria-label="Filter by role"
            >
              <option value="ALL">All Roles</option>
              <option value="OWNER">Owner</option>
              <option value="ADMIN">Admin</option>
              <option value="MANAGER">Manager</option>
              <option value="MEMBER">Member</option>
              <option value="VIEWER">Viewer</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="enterprise-select"
              aria-label="Filter by status"
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="INVITED">Invited</option>
              <option value="SUSPENDED">Suspended</option>
            </select>
          </div>
        </div>

        {/* User Table */}
        <div className="enterprise-table-wrapper">
          <table className="enterprise-table">
            <thead>
              <tr>
                <th>User / Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Assigned Workspace</th>
                <th>Activity</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map(user => (
                <tr key={user.id}>
                  <td>
                    <div className="enterprise-user-cell">
                      <div className="enterprise-avatar">
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <strong>{user.name}</strong>
                        <small>{user.email}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <select
                      value={user.role}
                      onChange={(e) => handleRoleChange(user.id, e.target.value)}
                      disabled={user.role === 'OWNER'}
                      className="enterprise-table-select"
                    >
                      <option value="OWNER" disabled>Owner</option>
                      <option value="ADMIN">Admin</option>
                      <option value="MANAGER">Manager</option>
                      <option value="MEMBER">Member</option>
                      <option value="VIEWER">Viewer</option>
                    </select>
                  </td>
                  <td>
                    <span className={`enterprise-pill enterprise-pill-${user.status === 'ACTIVE' ? 'success' : (user.status === 'INVITED' ? 'warning' : 'danger')}`}>
                      {user.status}
                    </span>
                  </td>
                  <td>{user.workspace}</td>
                  <td><small className="text-muted">{user.lastActive}</small></td>
                  <td className="text-right">
                    <div className="enterprise-table-actions">
                      <button
                        type="button"
                        className="enterprise-button-icon"
                        title={user.status === 'ACTIVE' ? 'Suspend user' : 'Activate user'}
                        onClick={() => handleToggleStatus(user.id)}
                        disabled={user.role === 'OWNER'}
                      >
                        {user.status === 'ACTIVE' ? <FiX /> : <FiCheck />}
                      </button>
                      <button
                        type="button"
                        className="enterprise-button-icon text-danger"
                        title="Remove user"
                        onClick={() => handleDeleteUser(user.id)}
                        disabled={user.role === 'OWNER'}
                      >
                        <FiTrash2 />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan="6" className="enterprise-empty-row">
                    No team members found matching the active filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invite Member Modal */}
      {showInviteModal && (
        <div className="enterprise-modal-backdrop" role="presentation" onClick={() => setShowInviteModal(false)}>
          <div className="enterprise-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="enterprise-modal-header">
              <h3>Invite Enterprise Member</h3>
              <button type="button" className="enterprise-button-icon" onClick={() => setShowInviteModal(false)}>
                <FiX />
              </button>
            </div>
            <form onSubmit={handleInviteSubmit}>
              <div className="enterprise-modal-body">
                <div className="enterprise-form-group">
                  <label htmlFor="invite-email">Work Email Address</label>
                  <input
                    id="invite-email"
                    type="email"
                    required
                    placeholder="colleague@company.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="enterprise-input"
                    autoFocus
                  />
                </div>

                <div className="enterprise-form-group">
                  <label htmlFor="invite-role">Access Role</label>
                  <select
                    id="invite-role"
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    className="enterprise-select"
                  >
                    <option value="ADMIN">Admin (Full administrative & billing control)</option>
                    <option value="MANAGER">Manager (Team, workspace, and resume management)</option>
                    <option value="MEMBER">Member (Standard builder and collaboration access)</option>
                    <option value="VIEWER">Viewer (Read-only document review)</option>
                  </select>
                </div>

                <div className="enterprise-form-group">
                  <label htmlFor="invite-workspace">Assigned Workspace</label>
                  <select
                    id="invite-workspace"
                    value={inviteWorkspace}
                    onChange={(e) => setInviteWorkspace(e.target.value)}
                    className="enterprise-select"
                  >
                    <option value="All Workspaces">All Workspaces (Tenant-Wide)</option>
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
                  onClick={() => setShowInviteModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="enterprise-button enterprise-button-primary"
                >
                  Send Invitation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
