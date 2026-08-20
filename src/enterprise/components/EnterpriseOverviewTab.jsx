import React, { useMemo } from 'react';
import {
  FiUsers, FiSliders, FiZap, FiDatabase, FiShield, FiTrendingUp,
  FiPlus, FiUserPlus, FiFileText, FiCheckCircle, FiAlertTriangle
} from 'react-icons/fi';
import { useTenantApi, useAsyncResource } from '../useTenantApi';

function formatNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number.toLocaleString() : '—';
}

function formatDuration(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value <= 0) return '—';
  if (value < 1) return `${Math.round(value * 100) / 100} ms`;
  return `${Math.round(value)} ms`;
}

export default function EnterpriseOverviewTab({ onNavigate, workspaces = [] }) {
  const { request, tenant, workspace, workspaceId, context } = useTenantApi();

  const [members] = useAsyncResource(
    () => request('/api/enterprise/memberships'),
    [request],
  );
  const [audit] = useAsyncResource(
    () => request('/api/enterprise/audit'),
    [request],
  );
  const [metrics] = useAsyncResource(
    () => request('/api/enterprise/observability/metrics'),
    [request],
  );
  const [dataPlane] = useAsyncResource(
    () => request('/api/enterprise/data-plane/status'),
    [request],
  );
  const [queue] = useAsyncResource(
    () => request('/api/enterprise/queue/status'),
    [request],
  );

  const metricsData = useMemo(() => metrics?.data?.metrics || null, [metrics]);
  const activity = useMemo(() => (Array.isArray(audit?.data?.events) ? audit.data.events.slice(0, 4) : []), [audit]);

  const memberCount = Array.isArray(members?.data?.memberships) ? members.data.memberships.length : 0;
  const sampleCount = metricsData?.sampleCount || 0;
  const requestP95 = metricsData?.p95 || 0;
  const errorTotal = metricsData?.errors
    ? (metricsData.errors.serverErrors || 0) + (metricsData.errors.clientErrors || 0)
    : 0;

  const planeState = dataPlane?.data?.dataPlane || null;
  const planeOk = planeState?.configured === true && planeState?.durable === true;
  const queueState = queue?.data?.queue || null;
  const queueOk = queueState?.healthy === true;
  const queueDlq = queueState?.deadLetterCount || 0;

  // Actionable recommendations derived exclusively from real, already-loaded
  // application state. Nothing here is synthesized or predicted.
  const recommendations = useMemo(() => {
    const items = [];
    const membershipRows = Array.isArray(members?.data?.memberships) ? members.data.memberships : [];
    const suspendedCount = membershipRows.filter(member => member.status === 'SUSPENDED').length;
    if (queueDlq > 0) {
      items.push({ id: 'dlq', tone: 'warning', label: `${queueDlq} dead-letter job${queueDlq === 1 ? '' : 's'} awaiting replay`, hint: 'Inspect and replay failed jobs from the Security & M2M console.', target: 'security' });
    }
    if (!queue.loading && queueState && queueState.configured === false) {
      items.push({ id: 'queue-config', tone: 'warning', label: 'Durable job queue is not configured', hint: 'Background jobs cannot be processed until the Firestore outbox is configured.', target: 'security' });
    }
    if (!dataPlane.loading && planeState && !planeOk) {
      items.push({ id: 'plane', tone: 'danger', label: 'Data plane is reporting unavailable', hint: 'Enterprise documents and audit writes will fail until Firestore connectivity is restored.', target: 'overview' });
    }
    if (!dataPlane.loading && planeState && planeOk && (!planeState.encryption || planeState.encryption === 'none')) {
      items.push({ id: 'encryption', tone: 'warning', label: 'Payload encryption is not active', hint: 'Configure the server-key encryption provider so confidential payloads are sealed at rest.', target: 'settings' });
    }
    if (suspendedCount > 0) {
      items.push({ id: 'suspended', tone: 'warning', label: `${suspendedCount} suspended member${suspendedCount === 1 ? '' : 's'} in this tenant`, hint: 'Review whether these members should be reactivated or removed.', target: 'members' });
    }
    if (!members.loading && membershipRows.length <= 1) {
      items.push({ id: 'invite', tone: 'info', label: 'You are the only member of this organization', hint: 'Grant enterprise access to teammates from Users & IAM.', target: 'members' });
    }
    if (!metrics.loading && errorTotal > 0) {
      items.push({ id: 'errors', tone: 'info', label: `${errorTotal} API error${errorTotal === 1 ? '' : 's'} observed in the current window`, hint: 'Check the audit trail for denied or failed operations.', target: 'audit' });
    }
    return items;
  }, [members, metrics.loading, dataPlane.loading, queue.loading, queueState, planeState, planeOk, queueDlq, errorTotal]);

  return (
    <div className="enterprise-tab-content">
      <div className="enterprise-card enterprise-banner-card">
        <div className="enterprise-banner-header">
          <div>
            <span className="enterprise-pill enterprise-pill-success">
              <FiCheckCircle aria-hidden="true" /> Enterprise Active · {tenant?.isolationTier || 'STANDARD'}
            </span>
            <h2 className="enterprise-tab-title" style={{ marginTop: '0.75rem' }}>
              {tenant?.displayName || 'Enterprise Workspace'}
            </h2>
            <p className="enterprise-tab-subtitle">
              Active Workspace: <strong>{workspace?.name || 'Default'}</strong> · Region: <strong>{context?.dataPlane?.region || 'default'}</strong> · Routing Version: <strong>{context?.dataPlane?.routingVersion || 1}</strong>
            </p>
          </div>
          <div className="enterprise-actions-row">
            <button
              type="button"
              className="enterprise-button enterprise-button-secondary"
              onClick={() => onNavigate('members')}
            >
              <FiUserPlus aria-hidden="true" /> Manage Members
            </button>
            <button
              type="button"
              className="enterprise-button enterprise-button-primary"
              onClick={() => onNavigate('resumes')}
            >
              <FiPlus aria-hidden="true" /> New Resume
            </button>
          </div>
        </div>
      </div>

      <div className="enterprise-metrics-grid">
        <div className="enterprise-card enterprise-metric-box">
          <div className="enterprise-metric-header">
            <span>Enterprise Members</span>
            <FiUsers className="enterprise-metric-icon" aria-hidden="true" />
          </div>
          <div className="enterprise-metric-value">{members.loading ? '…' : formatNumber(memberCount)}</div>
          <div className="enterprise-metric-footer text-success">
            <FiTrendingUp aria-hidden="true" /> Memberships in active tenant
          </div>
        </div>

        <div className="enterprise-card enterprise-metric-box">
          <div className="enterprise-metric-header">
            <span>Workspaces</span>
            <FiSliders className="enterprise-metric-icon" aria-hidden="true" />
          </div>
          <div className="enterprise-metric-value">{tenant?.id ? formatNumber(workspaces.length) : '—'}</div>
          <div className="enterprise-metric-footer">
            {workspaceId ? `Active: ${workspace?.name || 'Default'}` : 'No active workspace'}
          </div>
        </div>

        <div className="enterprise-card enterprise-metric-box">
          <div className="enterprise-metric-header">
            <span>Request Latency (p95)</span>
            <FiZap className="enterprise-metric-icon" aria-hidden="true" />
          </div>
          <div className="enterprise-metric-value">{metrics.loading ? '…' : formatDuration(requestP95)}</div>
          <div className="enterprise-metric-footer text-success">
            {formatNumber(sampleCount)} sampled requests
          </div>
        </div>

        <div className="enterprise-card enterprise-metric-box">
          <div className="enterprise-metric-header">
            <span>Observed Errors</span>
            <FiDatabase className="enterprise-metric-icon" aria-hidden="true" />
          </div>
          <div className="enterprise-metric-value">{metrics.loading ? '…' : formatNumber(errorTotal)}</div>
          <div className="enterprise-metric-footer text-success">
            Client + server errors in window
          </div>
        </div>
      </div>

      {recommendations.length > 0 && (
        <div className="enterprise-card" style={{ marginTop: '1.5rem' }}>
          <h3 className="enterprise-card-title"><FiAlertTriangle aria-hidden="true" /> Recommended Actions</h3>
          <p className="enterprise-card-subtitle">Derived from the live state of this tenant — never synthesized</p>
          <ul className="enterprise-health-list">
            {recommendations.map(item => (
              <li className="enterprise-health-item" key={item.id}>
                <div className={`enterprise-health-status ${item.tone === 'danger' ? 'offline' : item.tone === 'warning' ? 'checking' : 'online'}`} />
                <div className="enterprise-health-copy">
                  <strong>{item.label}</strong>
                  <small>{item.hint}</small>
                </div>
                <button
                  type="button"
                  className="enterprise-button enterprise-button-secondary enterprise-button-sm"
                  onClick={() => onNavigate(item.target)}
                >
                  Review
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="enterprise-two-column-grid">
        <div className="enterprise-card">
          <h3 className="enterprise-card-title">Management Shortcuts</h3>
          <p className="enterprise-card-subtitle">Common enterprise administrative workflows</p>
          <div className="enterprise-shortcuts-list">
            {[
              { id: 'members', label: 'Manage Team & User Access', icon: FiUsers },
              { id: 'ai', label: 'Configure Enterprise AI Policy', icon: FiZap },
              { id: 'security', label: 'Service Accounts & API Keys', icon: FiShield },
              { id: 'audit', label: 'Inspect Audit Logs', icon: FiFileText },
            ].map(shortcut => {
              const Icon = shortcut.icon;
              return (
                <button
                  key={shortcut.id}
                  type="button"
                  className="enterprise-shortcut-item"
                  onClick={() => onNavigate(shortcut.id)}
                >
                  <div className="enterprise-shortcut-icon">
                    <Icon aria-hidden="true" />
                  </div>
                  <div className="enterprise-shortcut-copy">
                    <strong>{shortcut.label}</strong>
                  </div>
                  <span>→</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="enterprise-card">
          <h3 className="enterprise-card-title">Infrastructure & Security Posture</h3>
          <p className="enterprise-card-subtitle">Live subsystem status</p>
          <ul className="enterprise-health-list">
            <li className="enterprise-health-item">
              <div className={`enterprise-health-status ${metrics.loading ? 'checking' : 'online'}`} />
              <div className="enterprise-health-copy">
                <strong>Observability & Metrics</strong>
                <small>{sampleCount > 0 ? `${formatNumber(sampleCount)} requests tracked` : 'No requests tracked yet'}</small>
              </div>
              <span className="enterprise-pill enterprise-pill-success">Online</span>
            </li>
            <li className="enterprise-health-item">
              <div className={`enterprise-health-status ${dataPlane.loading ? 'checking' : (planeOk ? 'online' : 'offline')}`} />
              <div className="enterprise-health-copy">
                <strong>Firestore Data Plane</strong>
                <small>
                  {dataPlane.loading ? 'Checking…' : planeState
                    ? `Canonical durable store · encryption: ${planeState.encryption === 'server-key' ? 'ServerKey AES-256-GCM' : planeState.encryption || 'none'} · quotas: ${planeState.quotaStore || 'unavailable'}`
                    : 'Data-plane status unavailable'}
                </small>
              </div>
              <span className={`enterprise-pill ${dataPlane.loading ? '' : (planeOk ? 'enterprise-pill-success' : 'enterprise-pill-warning')}`}>
                {dataPlane.loading ? 'Checking' : planeOk ? 'Operational' : 'Unavailable'}
              </span>
            </li>
            <li className="enterprise-health-item">
              <div className={`enterprise-health-status ${queue.loading ? 'checking' : (queueOk ? 'online' : 'offline')}`} />
              <div className="enterprise-health-copy">
                <strong>Durable Job Outbox</strong>
                <small>
                  {queue.loading ? 'Checking…' : queueState
                    ? `Firestore-backed · ${formatNumber(queueState.activeQueued || 0)} active · ${formatNumber(queueDlq)} dead-lettered`
                    : 'Queue status unavailable'}
                </small>
              </div>
              <span className={`enterprise-pill ${queue.loading ? '' : (queueOk ? 'enterprise-pill-success' : 'enterprise-pill-warning')}`}>
                {queue.loading ? 'Checking' : queueOk ? (queueDlq > 0 ? 'Operational · DLQ' : 'Operational') : 'Unavailable'}
              </span>
            </li>
            <li className="enterprise-health-item">
              <div className="enterprise-health-status online" />
              <div className="enterprise-health-copy">
                <strong>Server-side Tenant Authorization</strong>
                <small>Tenant and workspace context are resolved server-side on each request.</small>
              </div>
              <span className="enterprise-pill enterprise-pill-success">Enforced</span>
            </li>
          </ul>
        </div>
      </div>

      <div className="enterprise-card" style={{ marginTop: '1.5rem' }}>
        <div className="enterprise-card-header-flex">
          <div>
            <h3 className="enterprise-card-title">Recent Activity</h3>
            <p className="enterprise-card-subtitle">Audit stream of verified actions in active context</p>
          </div>
          <button
            type="button"
            className="enterprise-button enterprise-button-secondary enterprise-button-sm"
            onClick={() => onNavigate('audit')}
          >
            View Full Audit Log
          </button>
        </div>
        {audit.loading ? (
          <div className="enterprise-loading-row"><span className="enterprise-spinner" aria-hidden="true" /><span className="text-muted">Loading activity…</span></div>
        ) : activity.length === 0 ? (
          <div className="enterprise-loading-row"><span className="text-muted">No audit events recorded for the active tenant yet.</span></div>
        ) : (
          <div className="enterprise-activity-feed">
            {activity.map(event => (
              <div className="enterprise-activity-row" key={event.id}>
                <div className="enterprise-activity-icon"><FiCheckCircle aria-hidden="true" /></div>
                <div className="enterprise-activity-copy">
                  <strong>{event.action || 'EVENT'}</strong>
                  <small>{event.actorSubjectId || event.principalId || 'system'} · {event.workspaceId ? `ws ${String(event.workspaceId).slice(0, 8)}` : 'tenant-wide'}</small>
                </div>
                <time className="enterprise-activity-time">{new Date(event.occurredAt || event.createdAt || Date.now()).toLocaleString()}</time>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
