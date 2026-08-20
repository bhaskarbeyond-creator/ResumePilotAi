import React, { useState } from 'react';
import {
  FiFileText, FiSearch, FiFilter, FiDownload, FiCheckCircle,
  FiXCircle, FiAlertCircle, FiEye, FiX
} from 'react-icons/fi';

const SAMPLE_AUDIT_LOGS = [
  { id: 'evt-1', timestamp: '2026-08-20 04:39:25 UTC', actor: 'alex.wright@acme.corp', action: 'TENANT_AUTH_SUCCESS', resource: 'tenant:acme-corp', outcome: 'SUCCESS', ip: '82.112.232.112', details: { method: 'BEARER_JWT', issuer: 'firebase', role: 'OWNER' } },
  { id: 'evt-2', timestamp: '2026-08-20 04:35:10 UTC', actor: 'elena.rostova@acme.corp', action: 'AI_CONTENT_GENERATE', resource: 'res-ent-2', outcome: 'SUCCESS', ip: '194.26.29.11', details: { provider: 'nvidia', model: 'meta/llama-3.2-11b-vision-instruct', tokens: 420 } },
  { id: 'evt-3', timestamp: '2026-08-20 04:20:00 UTC', actor: 'marcus.chen@acme.corp', action: 'RESUME_DOCX_EXPORT', resource: 'res-ent-3', outcome: 'SUCCESS', ip: '185.191.171.1', details: { template: 'Cv1', format: 'OOXML_DOCX' } },
  { id: 'evt-4', timestamp: '2026-08-20 03:50:12 UTC', actor: 'anonymous@attacker.com', action: 'CROSS_TENANT_INJECTION', resource: 'tenant:other-corp', outcome: 'DENIED', ip: '45.154.255.8', details: { reason: 'UNAUTHORIZED_CROSS_TENANT_ACCESS_BLOCKED' } },
  { id: 'evt-5', timestamp: '2026-08-20 03:12:44 UTC', actor: 'sarah.j@acme.corp', action: 'USER_INVITE_SENT', resource: 'usr-david-kim', outcome: 'SUCCESS', ip: '185.191.171.1', details: { email: 'david.kim@partner.io', role: 'VIEWER' } },
];

export default function EnterpriseAuditTab() {
  const [logs, setLogs] = useState(SAMPLE_AUDIT_LOGS);
  const [searchQuery, setSearchQuery] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState('ALL');
  const [inspectEvent, setInspectEvent] = useState(null);

  const filteredLogs = logs.filter(l => {
    const matchesSearch = `${l.actor} ${l.action} ${l.resource} ${l.ip}`.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesOutcome = outcomeFilter === 'ALL' || l.outcome === outcomeFilter;
    return matchesSearch && matchesOutcome;
  });

  const handleExportJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(filteredLogs, null, 2));
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
              Cryptographically verified event logs of all user actions, AI generations, security modifications, and exports
            </p>
          </div>
          <button
            type="button"
            className="enterprise-button enterprise-button-secondary"
            onClick={handleExportJson}
          >
            <FiDownload aria-hidden="true" /> Export Audit Log
          </button>
        </div>

        {/* Filters */}
        <div className="enterprise-filter-bar">
          <div className="enterprise-search-wrapper">
            <FiSearch className="enterprise-search-icon" aria-hidden="true" />
            <input
              type="text"
              placeholder="Search audit logs by actor, action, resource, or IP address…"
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
            </select>
          </div>
        </div>

        {/* Audit Log Table */}
        <div className="enterprise-table-wrapper">
          <table className="enterprise-table">
            <thead>
              <tr>
                <th>Timestamp (UTC)</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Resource Target</th>
                <th>IP Address</th>
                <th>Outcome</th>
                <th className="text-right">Details</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map(log => (
                <tr key={log.id}>
                  <td><small className="text-muted">{log.timestamp}</small></td>
                  <td><strong>{log.actor}</strong></td>
                  <td><code>{log.action}</code></td>
                  <td><small>{log.resource}</small></td>
                  <td><small className="text-muted">{log.ip}</small></td>
                  <td>
                    <span className={`enterprise-pill enterprise-pill-${log.outcome === 'SUCCESS' ? 'success' : 'danger'}`}>
                      {log.outcome}
                    </span>
                  </td>
                  <td className="text-right">
                    <button
                      type="button"
                      className="enterprise-button-icon"
                      title="Inspect Event Payload"
                      onClick={() => setInspectEvent(log)}
                    >
                      <FiEye />
                    </button>
                  </td>
                </tr>
              ))}
              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan="7" className="enterprise-empty-row">
                    No audit records match the selected query.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* JSON Payload Inspector Drawer/Modal */}
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
              <button
                type="button"
                className="enterprise-button enterprise-button-secondary"
                onClick={() => setInspectEvent(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
