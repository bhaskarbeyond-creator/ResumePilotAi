import React, { useMemo, useState } from 'react';
import {
  FiSearch, FiDownload, FiEye, FiX
} from 'react-icons/fi';
import { useTenantApi, useAsyncResource, DataState } from '../useTenantApi';

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export default function EnterpriseAuditTab() {
  const { request } = useTenantApi();
  const [searchQuery, setSearchQuery] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState('ALL');
  const [actionFilter, setActionFilter] = useState('');
  const [sinceDate, setSinceDate] = useState('');
  const [untilDate, setUntilDate] = useState('');
  const [inspectEvent, setInspectEvent] = useState(null);

  // Filters are applied server-side so the view and exports reflect the true
  // tenant history rather than only the page the browser happened to load.
  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set('limit', '250');
    if (outcomeFilter !== 'ALL') params.set('outcome', outcomeFilter);
    if (actionFilter.trim()) params.set('action', actionFilter.trim());
    if (sinceDate) params.set('since', new Date(`${sinceDate}T00:00:00.000Z`).toISOString());
    if (untilDate) params.set('until', new Date(`${untilDate}T23:59:59.999Z`).toISOString());
    return params.toString();
  }, [outcomeFilter, actionFilter, sinceDate, untilDate]);

  const [auditState, refreshAudit] = useAsyncResource(
    () => request(`/api/enterprise/audit?${query}`),
    [request, query],
  );
  const { loading, error, data } = auditState;

  const events = useMemo(() => (Array.isArray(data?.events) ? data.events : []), [data]);

  const filtered = events.filter(event => {
    if (!searchQuery.trim()) return true;
    return `${event.action || ''} ${event.actorSubjectId || event.subjectId || ''} ${event.resourceType || ''} ${event.resourceId || ''}`
      .toLowerCase().includes(searchQuery.toLowerCase());
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

  const handleExportCsv = () => {
    const header = ['occurredAt', 'actor', 'action', 'category', 'severity', 'outcome', 'resourceType', 'resourceId', 'correlationId'];
    const rows = filtered.map(event => [
      event.occurredAt || '', event.actorSubjectId || event.subjectId || event.principalId || '', event.action || '',
      event.category || '', event.severity || '', event.outcome || '', event.resourceType || '', event.resourceId || '',
      event.correlationId || '',
    ].map(csvEscape).join(','));
    const dataStr = 'data:text/csv;charset=utf-8,' + encodeURIComponent([header.join(','), ...rows].join('\n'));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `enterprise-audit-${Date.now()}.csv`);
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
          <div className="enterprise-inline-actions" style={{ gap: '0.5rem' }}>
            <button
              type="button"
              className="enterprise-button enterprise-button-secondary"
              onClick={handleExportCsv}
              disabled={filtered.length === 0}
            >
              <FiDownload aria-hidden="true" /> CSV
            </button>
            <button
              type="button"
              className="enterprise-button enterprise-button-secondary"
              onClick={handleExportJson}
              disabled={filtered.length === 0}
            >
              <FiDownload aria-hidden="true" /> JSON
            </button>
          </div>
        </div>

        <div className="enterprise-filter-bar" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
          <div className="enterprise-search-wrapper">
            <FiSearch className="enterprise-search-icon" aria-hidden="true" />
            <input
              type="text"
              placeholder="Search this result set…"
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
          <input
            type="text"
            placeholder="Action contains… (e.g. TEAM)"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="enterprise-input"
            aria-label="Filter by action"
            style={{ maxWidth: '220px' }}
          />
          <label className="enterprise-inline-actions" style={{ gap: '0.35rem' }}>
            <span className="sr-only">From date</span>
            <input
              type="date"
              value={sinceDate}
              onChange={(e) => setSinceDate(e.target.value)}
              className="enterprise-input"
              aria-label="Events from date (UTC)"
            />
          </label>
          <label className="enterprise-inline-actions" style={{ gap: '0.35rem' }}>
            <span className="sr-only">To date</span>
            <input
              type="date"
              value={untilDate}
              onChange={(e) => setUntilDate(e.target.value)}
              className="enterprise-input"
              aria-label="Events until date (UTC)"
            />
          </label>
        </div>

        <DataState loading={loading} error={error} onRetry={refreshAudit}>
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
                      <td><strong>{event.actorSubjectId || event.subjectId || event.principalId || 'system'}</strong></td>
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
