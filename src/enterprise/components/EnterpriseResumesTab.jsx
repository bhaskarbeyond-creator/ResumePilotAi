import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FiFileText, FiPlus, FiEdit3, FiCopy, FiTrash2, FiSearch, FiCheck
} from 'react-icons/fi';
import { useTenantApi, useAsyncResource, DataState } from '../useTenantApi';
import HelpTooltip from './HelpTooltip';

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
  const [selectedRows, setSelectedRows] = useState(new Set());

  const resources = useMemo(() => (Array.isArray(data?.resources) ? data.resources : []), [data]);
  const canCreate = hasPermission('resource.create');
  const canUpdate = hasPermission('resource.update');
  const filtered = resources.filter(resource =>
    `${resourceTitle(resource)} ${resource.ownerPrincipalId || ''}`.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleSelectAll = () => {
    if (selectedRows.size === filtered.length && filtered.length > 0) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(filtered.map(r => r.id)));
    }
  };

  const toggleSelectRow = (id) => {
    const next = new Set(selectedRows);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedRows(next);
  };

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
      setSelectedRows(prev => { const next = new Set(prev); next.delete(resource.id); return next; });
      refreshResumes();
    } catch (err) {
      setActionError(err?.message || 'Document could not be deleted.');
    }
  };

  const handleBulkAction = async (action) => {
    if (!selectedRows.size) return;
    if (action === 'delete' && !window.confirm(`Delete ${selectedRows.size} document(s)? This cannot be undone.`)) return;
    
    setActionError(null);
    setBusy(true);
    let successCount = 0;
    
    try {
      if (action === 'export') {
        const selectedDocs = filtered.filter(r => selectedRows.has(r.id));
        const json = JSON.stringify(selectedDocs, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `enterprise-documents-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        notify(`Exported ${selectedDocs.length} document(s).`);
        return;
      }
      
      // Execute serially to respect limits/quotas
      for (const id of selectedRows) {
        if (action === 'delete') {
          await request(`/api/enterprise/resources/${id}`, { method: 'DELETE' });
        }
        successCount++;
      }
      notify(`Successfully applied bulk action to ${successCount} document(s).`);
      setSelectedRows(new Set());
      refreshResumes();
    } catch (err) {
      setActionError(err?.message || `Bulk action failed after processing ${successCount} document(s).`);
      refreshResumes(); // Refresh to show partial success
    } finally {
      setBusy(false);
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
            <h2 className="enterprise-tab-title">
              Enterprise Document Library
              <HelpTooltip text="Workspace-scoped resumes, CVs, and executive career documents protected by tenant RLS isolation" />
            </h2>
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

        {selectedRows.size > 0 && (
          <div className="enterprise-bulk-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--enterprise-primary-soft)', borderRadius: 'var(--enterprise-radius-sm)', marginBottom: '16px' }}>
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--enterprise-primary-active)' }}>
              {selectedRows.size} document{selectedRows.size === 1 ? '' : 's'} selected
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" className="enterprise-button enterprise-button-secondary enterprise-button-sm" onClick={() => handleBulkAction('export')} disabled={busy}>
                <FiFileText aria-hidden="true" /> Export JSON
              </button>
              {canUpdate && (
                <button type="button" className="enterprise-button enterprise-button-danger enterprise-button-sm" onClick={() => handleBulkAction('delete')} disabled={busy}>
                  <FiTrash2 aria-hidden="true" /> Delete
                </button>
              )}
            </div>
          </div>
        )}

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
                    <th style={{ width: '40px' }}>
                      <input
                        type="checkbox"
                        checked={selectedRows.size === filtered.length && filtered.length > 0}
                        ref={input => { if (input) input.indeterminate = selectedRows.size > 0 && selectedRows.size < filtered.length; }}
                        onChange={toggleSelectAll}
                        aria-label="Select all documents"
                      />
                    </th>
                    <th>Document</th>
                    <th>Owner</th>
                    <th>Classification</th>
                    <th>Revision</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(resource => (
                    <tr key={resource.id} className={selectedRows.has(resource.id) ? 'selected' : ''}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedRows.has(resource.id)}
                          onChange={() => toggleSelectRow(resource.id)}
                          aria-label={`Select ${resourceTitle(resource)}`}
                        />
                      </td>
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
