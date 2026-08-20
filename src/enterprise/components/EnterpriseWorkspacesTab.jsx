import React, { useState } from 'react';
import { FiSliders, FiPlus, FiCheck, FiX } from 'react-icons/fi';
import { useTenantApi } from '../useTenantApi';
import { useEnterpriseTenant } from '../EnterpriseContext';

export default function EnterpriseWorkspacesTab({
  workspaces,
  activeWorkspace,
  onSelectWorkspace,
}) {
  const { request } = useTenantApi();
  const { reload } = useEnterpriseTenant();
  const [showModal, setShowModal] = useState(false);
  const [workspaceName, setWorkspaceName] = useState('');
  const [busy, setBusy] = useState(false);
  const [notification, setNotification] = useState(null);
  const [error, setError] = useState(null);

  const handleCreate = async (e) => {
    e.preventDefault();
    const name = workspaceName.trim();
    if (!name || busy) return;
    setBusy(true);
    setError(null);
    try {
      await request('/api/enterprise/workspaces', { method: 'POST', body: { name } });
      setNotification(`Workspace "${name}" created.`);
      setShowModal(false);
      setWorkspaceName('');
      await reload();
    } catch (err) {
      setError(err?.message || 'Workspace could not be created.');
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
          <button
            type="button"
            className="enterprise-button enterprise-button-primary"
            onClick={() => setShowModal(true)}
          >
            <FiPlus aria-hidden="true" /> New Workspace
          </button>
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
                </div>
              </div>
            </div>
          ))}
          {!(workspaces || []).length && (
            <p className="enterprise-empty">No workspaces are available. Create one to partition your organization.</p>
          )}
        </div>
      </div>

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
    </div>
  );
}
