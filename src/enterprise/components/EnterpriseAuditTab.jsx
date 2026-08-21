import React, { useEffect, useMemo, useState } from 'react';
import {
  FiSearch, FiDownload, FiEye, FiX, FiChevronRight, FiLink, FiCheck, FiUser, FiCpu, FiShield
} from 'react-icons/fi';
import fire from '../../conf/fire';
import { useTenantApi, useAsyncResource, DataState } from '../useTenantApi';
import HelpTooltip from './HelpTooltip';

const OUTCOMES = ['ALL', 'SUCCESS', 'DENIED', 'FAILURE'];
const SEVERITIES = ['ALL', 'INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const PAGE_SIZE = 100;

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function SyntaxHighlightedJson({ obj }) {
  if (!obj) return null;
  const json = JSON.stringify(obj, null, 2);
  const lines = json.split('\n');
  return (
    <pre style={{ 
      background: 'var(--enterprise-surface)', 
      border: '1px solid var(--enterprise-border)', 
      borderRadius: 'var(--enterprise-radius-md)', 
      padding: '16px 0', 
      overflow: 'auto', 
      margin: 0, 
      fontFamily: 'monospace', 
      fontSize: '0.875rem', 
      lineHeight: 1.5,
      color: 'var(--enterprise-ink)' 
    }}>
      {lines.map((line, i) => {
        const parts = line.split(/(".*?"\s*:|".*?"|\btrue\b|\bfalse\b|\bnull\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g);
        return (
          <div key={i} style={{ display: 'table-row' }}>
            <span style={{ display: 'table-cell', textAlign: 'right', paddingRight: '12px', userSelect: 'none', color: 'var(--enterprise-text)', opacity: 0.5, borderRight: '1px solid var(--enterprise-border)', width: '40px' }}>{i + 1}</span>
            <span style={{ display: 'table-cell', paddingLeft: '12px' }}>
              {parts.map((part, j) => {
                if (!part) return null;
                if (/^".*?"\s*:$/.test(part)) return <span key={j} style={{ color: 'var(--enterprise-ink)', fontWeight: 600 }}>{part}</span>;
                if (/^".*?"$/.test(part)) return <span key={j} style={{ color: 'var(--enterprise-success)' }}>{part}</span>;
                if (/\b(true|false)\b/.test(part)) return <span key={j} style={{ color: 'var(--enterprise-primary-active)' }}>{part}</span>;
                if (/\bnull\b/.test(part)) return <span key={j} style={{ color: 'var(--enterprise-danger)' }}>{part}</span>;
                if (/^-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?$/.test(part)) return <span key={j} style={{ color: 'var(--enterprise-warning)' }}>{part}</span>;
                return <span key={j} style={{ color: 'var(--enterprise-text)' }}>{part}</span>;
              })}
            </span>
          </div>
        );
      })}
    </pre>
  );
}

export default function EnterpriseAuditTab({ preset = null, onPresetConsumed = null, initialParams = null }) {
  const { request } = useTenantApi();
  // Deep-linkable investigation state: ?actor=…&action=…&outcome=… reproduce
  // an exact server-side filtered view after refresh or link sharing.
  const urlParam = (name) => String(initialParams?.get?.(name) || '').trim();
  const [searchQuery, setSearchQuery] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState(() => (['SUCCESS', 'FAILURE', 'DENIED'].includes(urlParam('outcome').toUpperCase()) ? urlParam('outcome').toUpperCase() : 'ALL'));
  const [severityFilter, setSeverityFilter] = useState(() => (urlParam('severity') ? urlParam('severity').toUpperCase() : 'ALL'));
  const [actionFilter, setActionFilter] = useState(() => urlParam('action'));
  const [actorFilter, setActorFilter] = useState(() => urlParam('actor'));
  const [categoryFilter, setCategoryFilter] = useState(() => urlParam('category'));
  const [sinceDate, setSinceDate] = useState('');
  const [untilDate, setUntilDate] = useState('');
  const [inspectEvent, setInspectEvent] = useState(null);
  const [cursor, setCursor] = useState(null);
  const [accumulated, setAccumulated] = useState([]);
  const [linkCopied, setLinkCopied] = useState(false);

  // Load tenant memberships to resolve raw UIDs into human identities
  const [membersState] = useAsyncResource(() => request('/api/enterprise/memberships'), [request]);

  const memberMap = useMemo(() => {
    const map = new Map();
    const list = Array.isArray(membersState.data?.memberships) ? membersState.data.memberships : [];
    for (const m of list) {
      if (m.subjectId) map.set(m.subjectId, m);
      if (m.principalId) map.set(m.principalId, m);
      if (m.id) map.set(m.id, m);
    }
    return map;
  }, [membersState]);

  const currentUid = fire.auth()?.currentUser?.uid || '';
  const currentDisplayName = fire.auth()?.currentUser?.displayName || fire.auth()?.currentUser?.email?.split('@')[0] || '';

  const formatActor = useMemo(() => {
    return (actorId) => {
      if (!actorId || actorId === 'system' || actorId === 'automated') {
        return { name: 'System Service', sub: 'Internal Automated Worker', isSystem: true, initial: '⚙' };
      }
      if (currentUid && actorId === currentUid) {
        return { name: `${currentDisplayName || 'Babu M'} (You)`, sub: `Principal: ${actorId.slice(0, 8)}…`, isCurrent: true, initial: (currentDisplayName || 'B').charAt(0).toUpperCase() };
      }
      const member = memberMap.get(actorId);
      if (member) {
        const name = member.displayName || member.email?.split('@')[0] || member.email || 'Enterprise Member';
        return { name, sub: member.email || `Principal: ${actorId.slice(0, 8)}…`, isCurrent: false, initial: name.charAt(0).toUpperCase() };
      }
      if (actorId.startsWith('sa_') || actorId.startsWith('svc_')) {
        return { name: `Service Account (${actorId.slice(0, 10)})`, sub: 'M2M API Token', isService: true, initial: '🔑' };
      }
      return { name: `Principal: ${actorId.slice(0, 8)}…`, sub: actorId, isCurrent: false, initial: '👤' };
    };
  }, [currentUid, currentDisplayName, memberMap]);

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

  // Reset the accumulated list AND the pagination cursor whenever the filter
  // set itself changes — otherwise a stale cursor from "Load more" would ask
  // the server for a page beyond the newly-filtered result set (empty view).
  useEffect(() => { setAccumulated([]); setCursor(null); }, [filterSignature]);

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

  // Shareable deep link reproducing this exact server-side filter set.
  const handleCopyDeepLink = async () => {
    const params = new URLSearchParams();
    params.set('tab', 'audit');
    if (outcomeFilter !== 'ALL') params.set('outcome', outcomeFilter);
    if (severityFilter !== 'ALL') params.set('severity', severityFilter);
    if (actionFilter.trim()) params.set('action', actionFilter.trim());
    if (actorFilter.trim()) params.set('actor', actorFilter.trim());
    if (categoryFilter.trim()) params.set('category', categoryFilter.trim());
    const url = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2500);
    } catch {
      window.prompt('Copy this investigation link:', url);
    }
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
      <div className="enterprise-card" style={{ padding: '24px' }}>
        <div className="enterprise-card-header-flex" style={{ marginBottom: '20px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span className="enterprise-pill enterprise-pill-success">
                <FiShield aria-hidden="true" /> Immutable Ledger
              </span>
              <span className="enterprise-pill enterprise-pill-secondary">
                {filtered.length} Events Loaded
              </span>
            </div>
            <h2 className="enterprise-tab-title">
              Immutable Audit Trail
              <HelpTooltip text="Append-only immutable forensic audit trail recording every administrative event, access mutation, and AI generation" />
            </h2>
            <p className="enterprise-tab-subtitle">
              Server-recorded forensic trail of administrator actions, identity mutations, AI generations, and security events.
            </p>
          </div>
          <div className="enterprise-inline-actions" style={{ gap: '0.5rem' }}>
            <button
              type="button"
              className="enterprise-button enterprise-button-secondary"
              onClick={handleExportCsv}
              disabled={filtered.length === 0}
              title="Export filtered audit events as CSV"
              data-tooltip="Export CSV"
            >
              <FiDownload aria-hidden="true" /> CSV
            </button>
            <button
              type="button"
              className="enterprise-button enterprise-button-secondary"
              onClick={handleExportJson}
              disabled={filtered.length === 0}
              title="Export filtered audit events as JSON"
              data-tooltip="Export JSON"
            >
              <FiDownload aria-hidden="true" /> JSON
            </button>
            <button
              type="button"
              className="enterprise-button enterprise-button-secondary"
              onClick={handleCopyDeepLink}
              title="Copy shareable link with current filter parameters"
              data-tooltip={linkCopied ? 'Copied!' : 'Copy Link'}
            >
              {linkCopied ? <FiCheck className="text-success" aria-hidden="true" /> : <FiLink aria-hidden="true" />}
              {linkCopied ? 'Copied!' : 'Copy link'}
            </button>
          </div>
        </div>

        <div className="enterprise-filter-bar" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
          <div className="enterprise-search-wrapper" style={{ flex: '1 1 200px' }}>
            <FiSearch className="enterprise-search-icon" aria-hidden="true" />
            <input
              type="text"
              placeholder="Search actions, resources, categories…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="enterprise-input"
              aria-label="Search within loaded audit events"
              title="Search within loaded audit trail"
            />
          </div>
          <div className="enterprise-select-group" style={{ display: 'flex', gap: '8px' }}>
            <select
              value={outcomeFilter}
              onChange={(e) => setOutcomeFilter(e.target.value)}
              className="enterprise-select"
              aria-label="Filter by outcome"
              title="Filter by event execution outcome"
            >
              {OUTCOMES.map(outcome => (
                <option key={outcome} value={outcome}>{outcome === 'ALL' ? 'All Outcomes' : outcome}</option>
              ))}
            </select>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="enterprise-select"
              aria-label="Filter by severity"
              title="Filter by severity level"
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
            title="Filter audit log by action keyword (e.g. TEAM, MEMBERSHIP, WORKSPACE)"
            style={{ maxWidth: '180px' }}
          />
          <input
            type="text"
            placeholder="Actor contains… (principal)"
            value={actorFilter}
            onChange={(e) => setActorFilter(e.target.value)}
            className="enterprise-input"
            aria-label="Filter by actor principal"
            title="Filter audit log by actor principal ID or email"
            style={{ maxWidth: '180px' }}
          />
          <input
            type="text"
            placeholder="Category… (e.g. tenant.security)"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="enterprise-input"
            aria-label="Filter by category"
            title="Filter audit log by category path (e.g. tenant.security, tenant.roles)"
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
              title="Filter audit events starting from date"
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
              title="Filter audit events up to date"
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
              <div className="enterprise-table-wrapper" style={{ marginTop: '16px', borderRadius: '10px', overflow: 'hidden' }}>
                <table className="enterprise-table">
                  <thead>
                    <tr>
                      <th style={{ minWidth: '150px' }} title="UTC Timestamp of event">Timestamp (UTC)</th>
                      <th style={{ minWidth: '180px' }} title="User, team member, or service performing the action">Actor</th>
                      <th title="System action executed">Action</th>
                      <th title="Domain category">Category</th>
                      <th title="Event severity rating">Severity</th>
                      <th title="Target resource identifier">Resource</th>
                      <th title="Execution outcome">Outcome</th>
                      <th className="text-right" title="Inspect full event JSON payload">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(event => {
                      const actorId = event.actorSubjectId || event.subjectId || event.principalId || '';
                      const actor = formatActor(actorId);

                      return (
                        <tr key={event.id}>
                          <td>
                            <div style={{ fontSize: '0.78rem', color: 'var(--ep-slate-700)', fontWeight: 500 }}>
                              {new Date(event.occurredAt || event.createdAt || Date.now()).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                            </div>
                            <small className="text-muted" style={{ fontFamily: 'monospace', fontSize: '0.7rem' }}>
                              {new Date(event.occurredAt || event.createdAt || Date.now()).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })} UTC
                            </small>
                          </td>

                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div style={{
                                width: '28px',
                                height: '28px',
                                borderRadius: '6px',
                                background: actor.isSystem ? '#f1f5f9' : (actor.isCurrent ? '#eef2ff' : '#f8fafc'),
                                color: actor.isCurrent ? '#4f46e5' : '#475569',
                                border: `1px solid ${actor.isCurrent ? '#c7d2fe' : '#e2e8f0'}`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 700,
                                fontSize: '0.75rem',
                                flexShrink: 0
                              }}>
                                {actor.initial}
                              </div>
                              <div>
                                <strong style={{ fontSize: '0.84rem', color: 'var(--enterprise-ink)', display: 'block' }}>{actor.name}</strong>
                                <small className="text-muted" style={{ fontSize: '0.7rem', display: 'block' }}>{actor.sub}</small>
                              </div>
                            </div>
                          </td>

                          <td>
                            <code style={{ fontSize: '0.75rem', fontWeight: 600, background: 'var(--ep-slate-50)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--ep-slate-200)' }}>
                              {event.action}
                            </code>
                          </td>

                          <td>
                            <span style={{ fontSize: '0.76rem', color: 'var(--ep-slate-600)' }}>
                              {event.category || '—'}
                            </span>
                          </td>

                          <td>
                            <span className={`enterprise-pill ${(event.severity === 'HIGH' || event.severity === 'CRITICAL') ? 'enterprise-pill-danger' : 'enterprise-pill-secondary'}`} style={{ fontSize: '0.7rem' }}>
                              {event.severity || '—'}
                            </span>
                          </td>

                          <td>
                            <small className="text-muted" style={{ fontFamily: 'monospace', fontSize: '0.74rem' }}>
                              {event.resourceType ? `${event.resourceType}:${String(event.resourceId || '').slice(0, 8)}` : '—'}
                            </small>
                          </td>

                          <td>
                            <span className={`enterprise-pill enterprise-pill-${event.outcome === 'SUCCESS' ? 'success' : (event.outcome === 'DENIED' ? 'warning' : 'danger')}`} style={{ fontSize: '0.72rem' }}>
                              {event.outcome || '—'}
                            </span>
                          </td>

                          <td className="text-right">
                            <button
                              type="button"
                              className="enterprise-button-icon"
                              title="Inspect Event Payload"
                              data-tooltip="View Details"
                              onClick={() => setInspectEvent(event)}
                            >
                              <FiEye />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="enterprise-inline-actions" style={{ justifyContent: 'center', marginTop: '1rem' }}>
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
            <div className="enterprise-modal-body" style={{ padding: '0 24px' }}>
              <SyntaxHighlightedJson obj={inspectEvent} />
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
