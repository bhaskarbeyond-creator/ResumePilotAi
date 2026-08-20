import React, { useMemo, useState } from 'react';
import {
  FiFileText, FiSearch, FiDownload, FiCheckCircle, FiEye, FiX
} from 'react-icons/fi';
import { useTenantApi, useAsyncResource, DataState } from '../useTenantApi';

export default function EnterpriseAuditTab() {
  const { request } = useTenantApi();
  const [auditState] = useAsyncResource(() => request('/api/enterprise/audit'), [request]);
  const { loading, error, data } = auditState;
  const [searchQuery, setSearchQuery] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState('ALL');
  const [inspectEvent, setInspectEvent] = useState(null);

  const events = useMemo(() => (Array.isArray(data?.events) ? data.events : []), [data]);

  const filtered = events.filter(event => {
    const matchesSearch = `${event.action || ''} ${event.actorSubjectId || ''} ${event.resourceType || ''} ${event.resourceId || ''}`.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesOutcome = outcomeFilter === 'ALL' || event.outcome === outcomeFilter;
    return matchesSearch && matchesOutcome;
  });

  const handleExportJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(filtered, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `enterprise-audit-${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="enterprise-tab-content">
      <div className="enterprise-card">
        <div className="enterprise-card-header-flex">
          <div>
            <h2 className="enterprise-tab-title">Immutable Audit Trail</h2>
            <p className="enterprise-tab-subtitle">
              Server-recorded events of user actions, AI generations, security modifications, and exports
            </p>
          </div>
          <button
            type="button"
            className="enterprise-button enterprise-button-secondary"
            onClick={handleExportJson}
            disabled={filtered.length === 0}
          >
            <FiDownload aria-hidden="true" /> Export Audit Log
          </button>
        </div>

        <div className="enterprise-filter-bar">
          <div className="enterprise-search-wrapper">
            <FiSearch className="enterprise-search-icon" aria-hidden="true" />
            <input
              type="text"
              placeholder="Search audit logs by action, actor, or resource…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="enterprise-input"
            />
          </div>
          <div className="enterprise-select-group">
            <select
              value={outcomeFilter}
              onChange={(e) => setOutcomeFilter(e.target.value)}
              className="enterprise-select"
              aria-label="Filter by outcome"
            >
              <option value="ALL">All Outcomes</option>
              <option value="SUCCESS">Success Only</option>
              <option value="DENIED">Denied / Blocked</option>
              <option value="FAILURE">Failure</option>
            </select>
          </div>
        </div>

        <DataState loading={loading} error={error}>
          {filtered.length === 0 ? (
            <p className="enterprise-empty">No audit events match this view for the active tenant.</p>
          ) : (
            <div className="enterprise-table-wrapper">
              <table className="enterprise-table">
                <thead>
                  <tr>
                    <th>Timestamp (UTC)</th>
                    <th>Actor</th>
                    <th>Action</th>
                    <th>Resource</th>
                    <th>Outcome</th>
                    <th className="text-right">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(event => (
                    <tr key={event.id}>
                      <td><small className="text-muted">{new Date(event.occurredAt || event.createdAt || Date.now()).toISOString()}</small></td>
                      <td><strong>{event.actorSubjectId || event.principalId || 'system'}</strong></td>
                      <td><code>{event.action}</code></td>
                      <td><small>{event.resourceType ? `${event.resourceType}:${String(event.resourceId || '').slice(0, 8)}` : '—'}</small></td>
                      <td>
                        <span className={`enterprise-pill enterprise-pill-${event.outcome === 'SUCCESS' ? 'success' : (event.outcome === 'DENIED' ? 'warning' : 'danger')}`}>
                          {event.outcome || '—'}
                        </span>
                      </td>
                      <td className="text-right">
                        <button
                          type="button"
                          className="enterprise-button-icon"
                          title="Inspect Event Payload"
                          onClick={() => setInspectEvent(event)}
                        >
                          <FiEye />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DataState>
      </div>

      {inspectEvent && (
        <div className="enterprise-modal-backdrop" role="presentation" onClick={() => setInspectEvent(null)}>
          <div className="enterprise-modal enterprise-modal-lg" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="enterprise-modal-header">
              <h3>Audit Event Record: {inspectEvent.id}</h3>
              <button type="button" className="enterprise-button-icon" onClick={() => setInspectEvent(null)}>
                <FiX />
              </button>
            </div>
            <div className="enterprise-modal-body">
              <pre className="enterprise-json-preview">
                {JSON.stringify(inspectEvent, null, 2)}
              </pre>
            </div>
            <div className="enterprise-modal-footer">
              <button type="button" className="enterprise-button enterprise-button-secondary" onClick={() => setInspectEvent(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
