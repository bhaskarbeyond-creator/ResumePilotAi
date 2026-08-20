import React, { useMemo } from 'react';
import {
  FiUsers, FiSliders, FiZap, FiDatabase, FiShield, FiTrendingUp,
  FiPlus, FiUserPlus, FiFileText, FiCheckCircle
} from 'react-icons/fi';
import { useTenantApi, useAsyncResource, DataState } from '../useTenantApi';

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

export default function EnterpriseOverviewTab({ onNavigate }) {
  const { request, tenant, workspace, workspaceId } = useTenantApi();

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
  const [cache] = useAsyncResource(
    () => request('/api/enterprise/cache/status'),
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

  const cacheOk = cache?.data?.cache?.ok === true;
  const queueOk = queue?.data?.queue?.healthy === true;

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
              Active Workspace: <strong>{workspace?.name || 'Default'}</strong> · Region: <strong>Global (Edge CDN)</strong> · Forced RLS: <strong>Enabled</strong>
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
          <div className="enterprise-metric-value">{tenant?.id ? 'Scoped' : '—'}</div>
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
              <div className={`enterprise-health-status ${cache.loading ? 'checking' : (cacheOk ? 'online' : 'offline')}`} />
              <div className="enterprise-health-copy">
                <strong>Distributed Cache & Rate Limiting</strong>
                <small>{cache.loading ? 'Checking…' : (cacheOk ? 'Cache reachable' : 'Cache unavailable')}</small>
              </div>
              <span className={`enterprise-pill ${cache.loading ? '' : (cacheOk ? 'enterprise-pill-success' : 'enterprise-pill-warning')}`}>
                {cache.loading ? 'Checking' : (cacheOk ? 'Operational' : 'Unavailable')}
              </span>
            </li>
            <li className="enterprise-health-item">
              <div className={`enterprise-health-status ${queue.loading ? 'checking' : (queueOk ? 'online' : 'offline')}`} />
              <div className="enterprise-health-copy">
                <strong>Signed Job Queue & DLQ</strong>
                <small>{queue.loading ? 'Checking…' : (queueOk ? 'Worker healthy' : 'Queue unavailable')}</small>
              </div>
              <span className={`enterprise-pill ${queue.loading ? '' : (queueOk ? 'enterprise-pill-success' : 'enterprise-pill-warning')}`}>
                {queue.loading ? 'Checking' : (queueOk ? 'Operational' : 'Unavailable')}
              </span>
            </li>
            <li className="enterprise-health-item">
              <div className="enterprise-health-status online" />
              <div className="enterprise-health-copy">
                <strong>Cloudflare Edge WAF & HSTS</strong>
                <small>TLS 1.3 · CSP · DDoS & API abuse protection</small>
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
