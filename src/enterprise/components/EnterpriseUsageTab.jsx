import React, { useMemo } from 'react';
import {
  FiBarChart2, FiZap, FiActivity, FiAlertTriangle, FiCheckCircle
} from 'react-icons/fi';
import { useTenantApi, useAsyncResource, DataState } from '../useTenantApi';

function formatNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number.toLocaleString() : '—';
}

function formatDuration(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value <= 0) return '—';
  return `${Math.round(value)} ms`;
}

export default function EnterpriseUsageTab() {
  const { request } = useTenantApi();
  const [metrics] = useAsyncResource(() => request('/api/enterprise/observability/metrics'), [request]);
  const [audit] = useAsyncResource(() => request('/api/enterprise/audit'), [request]);
  const { loading, error, data } = metrics;
  const auditEvents = useMemo(() => (Array.isArray(audit?.data?.events) ? audit.data.events : []), [audit]);

  const m = data?.metrics || {};
  const errors = m.errors || {};

  const aiGenerationEvents = useMemo(
    () => auditEvents.filter(event => String(event.action || '').startsWith('AI_')).length,
    [auditEvents],
  );

  return (
    <div className="enterprise-tab-content">
      <div className="enterprise-card">
        <div className="enterprise-card-header-flex">
          <div>
            <h2 className="enterprise-tab-title">Usage & Quota Analytics</h2>
            <p className="enterprise-tab-subtitle">Observed telemetry for the active tenant</p>
          </div>
          <span className="enterprise-pill enterprise-pill-success">
            <FiCheckCircle aria-hidden="true" /> Enterprise Tier Active
          </span>
        </div>

        <DataState loading={loading} error={error}>
          <div className="enterprise-usage-bars-grid">
            <div className="enterprise-usage-card">
              <div className="enterprise-usage-header">
                <div className="enterprise-usage-title"><FiZap /> <strong>Tracked Requests</strong></div>
                <span><strong>{formatNumber(m.sampleCount)}</strong></span>
              </div>
              <small className="text-muted">Request samples in the observability window</small>
            </div>
            <div className="enterprise-usage-card">
              <div className="enterprise-usage-header">
                <div className="enterprise-usage-title"><FiActivity /> <strong>p50 / p95 / p99 Latency</strong></div>
                <span><strong>{formatDuration(m.p50)} / {formatDuration(m.p95)} / {formatDuration(m.p99)}</strong></span>
              </div>
              <small className="text-muted">Enterprise request latency percentiles</small>
            </div>
            <div className="enterprise-usage-card">
              <div className="enterprise-usage-header">
                <div className="enterprise-usage-title"><FiZap /> <strong>AI Generation Events</strong></div>
                <span><strong>{formatNumber(aiGenerationEvents)}</strong></span>
              </div>
              <small className="text-muted">Audit-recorded AI generations in this tenant</small>
            </div>
            <div className="enterprise-usage-card">
              <div className="enterprise-usage-header">
                <div className="enterprise-usage-title"><FiAlertTriangle /> <strong>Observed Errors</strong></div>
                <span><strong>{formatNumber((errors.serverErrors || 0) + (errors.clientErrors || 0))}</strong></span>
              </div>
              <small className="text-muted">{errors.serverErrors || 0} server · {errors.clientErrors || 0} client</small>
            </div>
          </div>

          <p className="enterprise-empty" style={{ marginTop: '1rem' }}>
            Billing-grade token, seat, and storage meters are recorded in the RLS data-plane usage ledger and exposed once the production data plane is connected.
          </p>
        </DataState>
      </div>
    </div>
  );
}
