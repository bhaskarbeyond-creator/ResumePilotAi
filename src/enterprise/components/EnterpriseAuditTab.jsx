import React, { useEffect, useMemo, useState } from 'react';
import {
  FiSearch, FiDownload, FiEye, FiX, FiChevronRight
} from 'react-icons/fi';
import { useTenantApi, useAsyncResource, DataState } from '../useTenantApi';

const OUTCOMES = ['ALL', 'SUCCESS', 'DENIED', 'FAILURE'];
const SEVERITIES = ['ALL', 'INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const PAGE_SIZE = 100;

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export default function EnterpriseAuditTab({ preset = null, onPresetConsumed = null }) {
  const { request } = useTenantApi();
  const [searchQuery, setSearchQuery] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState('ALL');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [actionFilter, setActionFilter] = useState('');
  const [actorFilter, setActorFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [sinceDate, setSinceDate] = useState('');
  const [untilDate, setUntilDate] = useState('');
  const [inspectEvent, setInspectEvent] = useState(null);
  const [cursor, setCursor] = useState(null);
  const [accumulated, setAccumulated] = useState([]);

  // Cross-tab investigation preset (e.g. member activity): applies the actor
  // filter once, then is consumed so manual edits behave normally afterwards.
  useEffect(() => {
    if (preset?.actor) {
      setActorFilter(preset.actor);
      setCursor(null);
      if (typeof onPresetConsumed === 'function') onPresetConsumed();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);

  // Filters are applied server-side so the view and exports reflect the true
  // tenant history rather than only the page the browser happened to load.
  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set('limit', String(PAGE_SIZE));
    if (outcomeFilter !== 'ALL') params.set('outcome', outcomeFilter);
    if (severityFilter !== 'ALL') params.set('severity', severityFilter);
    if (actionFilter.trim()) params.set('action', actionFilter.trim());
    if (actorFilter.trim()) params.set('actor', actorFilter.trim());
    if (categoryFilter.trim()) params.set('category', categoryFilter.trim());
    if (sinceDate) params.set('since', new Date(`${sinceDate}T00:00:00.000Z`).toISOString());
    if (untilDate) params.set('until', new Date(`${untilDate}T23:59:59.999Z`).toISOString());
    if (cursor) params.set('cursor', cursor);
    return params.toString();
  }, [outcomeFilter, severityFilter, actionFilter, actorFilter, categoryFilter, sinceDate, untilDate, cursor]);

  const filterSignature = useMemo(() => query.replace(/&?cursor=[^&]*/, ''), [query]);

  const [auditState, refreshAudit] = useAsyncResource(
    () => request(`/api/enterprise/audit?${query}`),
    [request, query],
  );
  const { loading, error, data } = auditState;

  // Reset the accumulated list whenever the filter set itself changes so
  // pagination never mixes pages from different queries.
  useEffect(() => { setAccumulated([]); }, [filterSignature]);

  useEffect(() => {
    if (data?.events) {
      setAccumulated(previous => (cursor ? [...previous, ...(data.events || [])] : [...(data.events || [])]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const events = useMemo(() => accumulated, [accumulated]);
  const nextCursor = data?.nextCursor || null;

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
              {OUTCOMES.map(outcome => (
                <option key={outcome} value={outcome}>
                  {outcome === 'ALL' ? 'All Outcomes' : outcome === 'DENIED' ? 'Denied / Blocked' : outcome === 'FAILURE' ? 'Failure' : 'Success Only'}
                </option>
              ))}
            </select>
          </div>
          <div className="enterprise-select-group">
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="enterprise-select"
              aria-label="Filter by severity"
            >
              {SEVERITIES.map(severity => (
                <option key={severity} value={severity}>{severity === 'ALL' ? 'All Severities' : severity}</option>
              ))}
            </select>
          </div>
          <input
            type="text"
            placeholder="Action contains… (e.g. TEAM)"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="enterprise-input"
            aria-label="Filter by action"
            style={{ maxWidth: '180px' }}
          />
          <input
            type="text"
            placeholder="Actor contains… (principal)"
            value={actorFilter}
            onChange={(e) => setActorFilter(e.target.value)}
            className="enterprise-input"
            aria-label="Filter by actor principal"
            style={{ maxWidth: '180px' }}
          />
          <input
            type="text"
            placeholder="Category… (e.g. tenant.security)"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="enterprise-input"
            aria-label="Filter by category"
            style={{ maxWidth: '180px' }}
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

        <DataState loading={loading && !cursor} error={error} onRetry={refreshAudit}>
          {filtered.length === 0 ? (
            loading && cursor ? (
              <div className="enterprise-loading-row"><span className="enterprise-spinner" aria-hidden="true" /><span className="text-muted">Loading more events…</span></div>
            ) : (
              <p className="enterprise-empty">No audit events match this view for the active tenant.</p>
            )
          ) : (
            <>
              <div className="enterprise-table-wrapper">
                <table className="enterprise-table">
                  <thead>
                    <tr>
                      <th>Timestamp (UTC)</th>
                      <th>Actor</th>
                      <th>Action</th>
                      <th>Category</th>
                      <th>Severity</th>
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
                        <td><small>{event.category || '—'}</small></td>
                        <td>
                          <span className={`enterprise-pill ${(event.severity === 'HIGH' || event.severity === 'CRITICAL') ? 'enterprise-pill-danger' : 'enterprise-pill-secondary'}`}>
                            {event.severity || '—'}
                          </span>
                        </td>
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
              <div className="enterprise-inline-actions" style={{ justifyContent: 'center', marginTop: '0.75rem' }}>
                {nextCursor && (
                  <button
                    type="button"
                    className="enterprise-button enterprise-button-secondary enterprise-button-sm"
                    onClick={() => setCursor(nextCursor)}
                    disabled={loading}
                  >
                    {loading ? <span className="enterprise-spinner enterprise-spin" aria-hidden="true" /> : <FiChevronRight aria-hidden="true" />} Load more events
                  </button>
                )}
                <small className="text-muted">{filtered.length} event{filtered.length === 1 ? '' : 's'} loaded{nextCursor ? ' · more available' : ' · end of trail'}</small>
              </div>
            </>
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
