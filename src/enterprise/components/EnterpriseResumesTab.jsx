import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FiFileText, FiPlus, FiEdit3, FiCopy, FiTrash2, FiSearch, FiCheck
} from 'react-icons/fi';
import { useTenantApi, useAsyncResource, DataState } from '../useTenantApi';

function resourceTitle(resource) {
  const title = resource?.payload?.title || resource?.payload?.positionTitle;
  return title ? String(title).slice(0, 120) : `Resume ${String(resource.id).slice(0, 8)}`;
}

export default function EnterpriseResumesTab() {
  const { request, hasPermission } = useTenantApi();
  const [resumesState, refreshResumes] = useAsyncResource(
    () => request('/api/enterprise/resources?resourceType=resume'),
    [request],
  );
  const { loading, error, data } = resumesState;
  const [searchQuery, setSearchQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [notification, setNotification] = useState(null);

  const resources = useMemo(() => (Array.isArray(data?.resources) ? data.resources : []), [data]);
  const canCreate = hasPermission('resource.create');
  const canUpdate = hasPermission('resource.update');
  const filtered = resources.filter(resource =>
    `${resourceTitle(resource)} ${resource.ownerPrincipalId || ''}`.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const notify = (message) => {
    setNotification(message);
    setTimeout(() => setNotification(null), 3500);
  };

  const handleDuplicate = async (resource) => {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    try {
      await request('/api/enterprise/resources', {
        method: 'POST',
        body: { resourceType: 'resume', payload: { ...(resource.payload || {}), title: `${resourceTitle(resource)} (Copy)` } },
      });
      notify(`Duplicated "${resourceTitle(resource)}" into draft.`);
      refreshResumes();
    } catch (err) {
      setActionError(err?.message || 'Document could not be duplicated.');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (resource) => {
    if (!window.confirm(`Delete "${resourceTitle(resource)}" from the enterprise workspace? This cannot be undone.`)) return;
    setActionError(null);
    try {
      await request(`/api/enterprise/resources/${resource.id}`, { method: 'DELETE' });
      notify('Document removed from enterprise workspace.');
      refreshResumes();
    } catch (err) {
      setActionError(err?.message || 'Document could not be deleted.');
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
            <div><strong>Document action failed</strong><p className="text-muted">{actionError}</p></div>
          </div>
        </div>
      )}

      <div className="enterprise-card">
        <div className="enterprise-card-header-flex">
          <div>
            <h2 className="enterprise-tab-title">Enterprise Document Library</h2>
            <p className="enterprise-tab-subtitle">
              Workspace-scoped resumes and executive CVs backed by the RLS data plane
            </p>
          </div>
          {canCreate && (
            <Link
              to="/build-resume"
              className="enterprise-button enterprise-button-primary"
            >
              <FiPlus aria-hidden="true" /> Create Enterprise Resume
            </Link>
          )}
        </div>

        <div className="enterprise-filter-bar">
          <div className="enterprise-search-wrapper">
            <FiSearch className="enterprise-search-icon" aria-hidden="true" />
            <input
              type="text"
              placeholder="Search resumes by title or owner…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="enterprise-input"
            />
          </div>
        </div>

        <DataState loading={loading} error={error} onRetry={refreshResumes}>
          {filtered.length === 0 ? (
            <p className="enterprise-empty">
              {searchQuery ? 'No documents match this search.' : 'No enterprise documents yet. Create a resume to begin.'}
            </p>
          ) : (
            <div className="enterprise-table-wrapper">
              <table className="enterprise-table">
                <thead>
                  <tr>
                    <th>Document</th>
                    <th>Owner</th>
                    <th>Classification</th>
                    <th>Revision</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(resource => (
                    <tr key={resource.id}>
                      <td>
                        <div className="enterprise-user-cell">
                          <div className="enterprise-avatar enterprise-avatar-doc">
                            <FiFileText />
                          </div>
                          <div>
                            <strong>{resourceTitle(resource)}</strong>
                            <small>{String(resource.id).slice(0, 12)}…</small>
                          </div>
                        </div>
                      </td>
                      <td><small>{resource.ownerPrincipalId || '—'}</small></td>
                      <td><span className="enterprise-pill enterprise-pill-secondary">{resource.classification || 'PRIVATE'}</span></td>
                      <td><small>v{resource.revision || 1}</small></td>
                      <td className="text-right">
                        <div className="enterprise-table-actions">
                          {canUpdate && (
                            <Link
                              to={`/build-resume?id=${resource.id}`}
                              className="enterprise-button-icon"
                              title="Edit in Smart Composer"
                            >
                              <FiEdit3 />
                            </Link>
                          )}
                          {canCreate && (
                            <button
                              type="button"
                              className="enterprise-button-icon"
                              title="Duplicate Document"
                              onClick={() => handleDuplicate(resource)}
                              disabled={busy}
                            >
                              <FiCopy />
                            </button>
                          )}
                          {canUpdate && (
                            <button
                              type="button"
                              className="enterprise-button-icon text-danger"
                              title="Delete Document"
                              onClick={() => handleDelete(resource)}
                              disabled={busy}
                            >
                              <FiTrash2 />
                            </button>
                          )}
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
    </div>
  );
}
