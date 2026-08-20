import React, { useMemo, useState } from 'react';
import {
  FiPlus, FiCheck, FiX, FiEdit2, FiArchive, FiRotateCcw, FiUsers, FiTrash2, FiUserPlus
} from 'react-icons/fi';
import { useTenantApi, useAsyncResource, DataState } from '../useTenantApi';
import { useEnterpriseTenant } from '../EnterpriseContext';

function WorkspaceMembersDrawer({ workspace, onClose }) {
  const { request, hasPermission } = useTenantApi();
  const canManage = hasPermission('workspace.members.manage') || hasPermission('tenant.members.manage');
  const [membersState, refreshMembers] = useAsyncResource(
    () => request(`/api/enterprise/workspaces/${encodeURIComponent(workspace.id)}/members`),
    [request, workspace.id],
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
      await request(`/api/enterprise/workspaces/${encodeURIComponent(workspace.id)}/members`, {
        method: 'POST',
        body: { principalId: selectedPrincipal },
      });
      setSelectedPrincipal('');
      refreshMembers();
    } catch (err) {
      setActionError(err?.message || 'Workspace member could not be added.');
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (principalId) => {
    if (!window.confirm(`Remove ${principalId} from workspace "${workspace.name}"?`)) return;
    setActionError(null);
    try {
      await request(`/api/enterprise/workspaces/${encodeURIComponent(workspace.id)}/members/${encodeURIComponent(principalId)}`, { method: 'DELETE' });
      refreshMembers();
    } catch (err) {
      setActionError(err?.message || 'Workspace member could not be removed.');
    }
  };

  return (
    <div className="enterprise-modal-backdrop" role="presentation" onClick={onClose}>
      <div className="enterprise-modal enterprise-modal-lg" role="dialog" aria-modal="true" aria-label={`Members of ${workspace.name}`} onClick={(e) => e.stopPropagation()}>
        <div className="enterprise-modal-header">
          <h3><FiUsers aria-hidden="true" /> Workspace Members — {workspace.name}</h3>
          <button type="button" className="enterprise-button-icon" onClick={onClose} aria-label="Close members panel">
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
                aria-label="Select tenant member to add"
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
                <FiUserPlus aria-hidden="true" /> {busy ? 'Adding…' : 'Add to Workspace'}
              </button>
            </form>
          )}
          <DataState loading={membersState.loading} error={membersState.error} onRetry={refreshMembers}>
            {members.length === 0 ? (
              <p className="enterprise-empty">No members are assigned to this workspace yet. Tenant owners and admins always retain tenant-wide access.</p>
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
                        <td><strong>{member.principalId}</strong></td>
                        <td><span className="enterprise-pill enterprise-pill-success">{member.status}</span></td>
                        {canManage && (
                          <td className="text-right">
                            <button
                              type="button"
                              className="enterprise-button-icon text-danger"
                              title={`Remove ${member.principalId} from workspace`}
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

export default function EnterpriseWorkspacesTab({
  workspaces,
  activeWorkspace,
  onSelectWorkspace,
}) {
  const { request, hasPermission } = useTenantApi();
  const { reload } = useEnterpriseTenant();
  const canManageWorkspaces = hasPermission('workspace.manage') || hasPermission('tenant.workspaces.manage');
  const canAdministerLifecycle = hasPermission('tenant.workspaces.manage');
  const canSeeMembers = hasPermission('workspace.members.manage') || hasPermission('tenant.members.read');

  const [showModal, setShowModal] = useState(false);
  const [workspaceName, setWorkspaceName] = useState('');
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [membersTarget, setMembersTarget] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notification, setNotification] = useState(null);
  const [error, setError] = useState(null);

  // Archived workspaces are served only to workspace administrators.
  const [archivedState, refreshArchived] = useAsyncResource(
    () => (canAdministerLifecycle ? request('/api/enterprise/workspaces?includeArchived=1') : Promise.resolve({ workspaces: [] })),
    [request, canAdministerLifecycle],
  );
  const archivedWorkspaces = useMemo(
    () => (Array.isArray(archivedState.data?.workspaces) ? archivedState.data.workspaces.filter(ws => ws.lifecycleState === 'ARCHIVED') : []),
    [archivedState],
  );

  const notify = (message) => {
    setNotification(message);
    setTimeout(() => setNotification(null), 3500);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    const name = workspaceName.trim();
    if (!name || busy) return;
    setBusy(true);
    setError(null);
    try {
      await request('/api/enterprise/workspaces', { method: 'POST', body: { name } });
      notify(`Workspace "${name}" created.`);
      setShowModal(false);
      setWorkspaceName('');
      await reload();
      refreshArchived();
    } catch (err) {
      setError(err?.message || 'Workspace could not be created.');
    } finally {
      setBusy(false);
    }
  };

  const handleRename = async (e) => {
    e.preventDefault();
    const name = renameValue.trim();
    if (!name || !renameTarget || busy) return;
    setBusy(true);
    setError(null);
    try {
      await request(`/api/enterprise/workspaces/${encodeURIComponent(renameTarget.id)}`, { method: 'PATCH', body: { name } });
      notify(`Workspace renamed to "${name}".`);
      setRenameTarget(null);
      setRenameValue('');
      await reload();
      refreshArchived();
    } catch (err) {
      setError(err?.message || 'Workspace could not be renamed.');
    } finally {
      setBusy(false);
    }
  };

  const handleArchive = async (workspace) => {
    if (!window.confirm(`Archive workspace "${workspace.name}"? Members lose access until it is restored. The default workspace cannot be archived.`)) return;
    setError(null);
    try {
      await request(`/api/enterprise/workspaces/${encodeURIComponent(workspace.id)}/archive`, { method: 'POST' });
      notify(`Workspace "${workspace.name}" archived.`);
      await reload();
      refreshArchived();
    } catch (err) {
      setError(err?.message || 'Workspace could not be archived.');
    }
  };

  const handleRestore = async (workspace) => {
    setError(null);
    try {
      await request(`/api/enterprise/workspaces/${encodeURIComponent(workspace.id)}/restore`, { method: 'POST' });
      notify(`Workspace "${workspace.name}" restored.`);
      await reload();
      refreshArchived();
    } catch (err) {
      setError(err?.message || 'Workspace could not be restored.');
    }
  };

  return (
    <div className="enterprise-tab-content">
      {notification && (
        <div className="enterprise-toast enterprise-toast-success">
          <FiCheck aria-hidden="true" /> {notification}
        </div>
      )}
      {error && (
        <div className="enterprise-card" role="alert">
          <div className="enterprise-error-row">
            <span className="enterprise-error-icon" aria-hidden="true">⚠</span>
            <div><strong>Workspace action failed</strong><p className="text-muted">{error}</p></div>
          </div>
        </div>
      )}

      <div className="enterprise-card">
        <div className="enterprise-card-header-flex">
          <div>
            <h2 className="enterprise-tab-title">Workspaces</h2>
            <p className="enterprise-tab-subtitle">
              Logical sub-divisions for separate business units, departments, or geographical offices within this tenant
            </p>
          </div>
          {canManageWorkspaces && (
            <button
              type="button"
              className="enterprise-button enterprise-button-primary"
              onClick={() => setShowModal(true)}
            >
              <FiPlus aria-hidden="true" /> New Workspace
            </button>
          )}
        </div>

        <div className="enterprise-workspaces-list">
          {(workspaces || []).map(ws => (
            <div
              key={ws.id}
              className={`enterprise-workspace-card ${ws.id === activeWorkspace?.id ? 'active' : ''}`}
            >
              <div className="enterprise-workspace-card-header">
                <div>
                  <div className="enterprise-workspace-title-row">
                    <h3>{ws.name}</h3>
                    {ws.isDefault && (
                      <span className="enterprise-pill enterprise-pill-template">Default</span>
                    )}
                    {ws.id === activeWorkspace?.id && (
                      <span className="enterprise-pill enterprise-pill-success">Active Context</span>
                    )}
                  </div>
                  <p className="enterprise-workspace-desc">
                    Scoped access boundary for documents, team members, and templates
                  </p>
                </div>
                <div className="enterprise-workspace-actions">
                  {ws.id !== activeWorkspace?.id && (
                    <button
                      type="button"
                      className="enterprise-button enterprise-button-secondary enterprise-button-sm"
                      onClick={() => onSelectWorkspace(ws.id)}
                    >
                      Switch to Workspace
                    </button>
                  )}
                  {canSeeMembers && (
                    <button
                      type="button"
                      className="enterprise-button enterprise-button-secondary enterprise-button-sm"
                      onClick={() => setMembersTarget(ws)}
                    >
                      <FiUsers aria-hidden="true" /> Members
                    </button>
                  )}
                  {canManageWorkspaces && (
                    <button
                      type="button"
                      className="enterprise-button-icon"
                      title={`Rename ${ws.name}`}
                      onClick={() => { setRenameTarget(ws); setRenameValue(ws.name); }}
                    >
                      <FiEdit2 />
                    </button>
                  )}
                  {canAdministerLifecycle && !ws.isDefault && (
                    <button
                      type="button"
                      className="enterprise-button-icon text-danger"
                      title={`Archive ${ws.name}`}
                      onClick={() => handleArchive(ws)}
                    >
                      <FiArchive />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
          {!(workspaces || []).length && (
            <p className="enterprise-empty">No workspaces are available. Create one to partition your organization.</p>
          )}
        </div>
      </div>

      {canAdministerLifecycle && (
        <div className="enterprise-card" style={{ marginTop: '1.5rem' }}>
          <div className="enterprise-card-header-flex">
            <div>
              <h3 className="enterprise-card-title"><FiArchive aria-hidden="true" /> Archived Workspaces</h3>
              <p className="enterprise-card-subtitle">Archived workspaces are inaccessible to members until restored. Data is preserved.</p>
            </div>
          </div>
          <DataState loading={archivedState.loading} error={archivedState.error} onRetry={refreshArchived}>
            {archivedWorkspaces.length === 0 ? (
              <p className="enterprise-empty">No archived workspaces.</p>
            ) : (
              <div className="enterprise-workspaces-list">
                {archivedWorkspaces.map(ws => (
                  <div key={ws.id} className="enterprise-workspace-card">
                    <div className="enterprise-workspace-card-header">
                      <div>
                        <div className="enterprise-workspace-title-row">
                          <h3>{ws.name}</h3>
                          <span className="enterprise-pill enterprise-pill-warning">Archived</span>
                        </div>
                      </div>
                      <div className="enterprise-workspace-actions">
                        <button
                          type="button"
                          className="enterprise-button enterprise-button-secondary enterprise-button-sm"
                          onClick={() => handleRestore(ws)}
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
              <h3>Create New Workspace</h3>
              <button type="button" className="enterprise-button-icon" onClick={() => setShowModal(false)} disabled={busy}>
                <FiX />
              </button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="enterprise-modal-body">
                <div className="enterprise-form-group">
                  <label htmlFor="ws-name">Workspace Name</label>
                  <input
                    id="ws-name"
                    type="text"
                    required
                    placeholder="e.g. Europe Operations"
                    value={workspaceName}
                    onChange={(e) => setWorkspaceName(e.target.value)}
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
                  {busy ? 'Creating…' : 'Create Workspace'}
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
              <h3>Rename Workspace</h3>
              <button type="button" className="enterprise-button-icon" onClick={() => setRenameTarget(null)} disabled={busy}>
                <FiX />
              </button>
            </div>
            <form onSubmit={handleRename}>
              <div className="enterprise-modal-body">
                <div className="enterprise-form-group">
                  <label htmlFor="ws-rename">Workspace Name</label>
                  <input
                    id="ws-rename"
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

      {membersTarget && (
        <WorkspaceMembersDrawer workspace={membersTarget} onClose={() => setMembersTarget(null)} />
      )}
    </div>
  );
}
