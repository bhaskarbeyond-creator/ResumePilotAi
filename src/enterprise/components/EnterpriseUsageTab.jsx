import React, { useMemo } from 'react';
import {
  FiBarChart2, FiZap, FiActivity, FiAlertTriangle, FiCheckCircle, FiCpu, FiHash
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

function formatCost(micros) {
  const value = Number(micros || 0);
  if (!Number.isFinite(value) || value <= 0) return '$0.00';
  return `$${(value / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 4 })}`;
}

export default function EnterpriseUsageTab() {
  const { request } = useTenantApi();
  const [metrics, refreshMetrics] = useAsyncResource(() => request('/api/enterprise/observability/metrics'), [request]);
  const [usage, refreshUsage] = useAsyncResource(() => request('/api/enterprise/usage/ai'), [request]);
  const { loading, error, data } = metrics;
  const usageData = useMemo(() => usage?.data?.usage || null, [usage]);

  const m = data?.metrics || {};
  const errors = m.errors || {};
  const byDay = usageData?.byDay || [];
  const maxDayRequests = Math.max(1, ...byDay.map(day => Number(day.requests || 0)));
  const workspaceRows = Object.entries(usageData?.byWorkspace || {});
  const providerRows = Object.entries(usageData?.byProvider || {});
  const modelRows = Object.entries(usageData?.byModel || {});

  return (
    <div className="enterprise-tab-content">
      <div className="enterprise-card">
        <div className="enterprise-card-header-flex">
          <div>
            <h2 className="enterprise-tab-title">Usage & Quota Analytics</h2>
            <p className="enterprise-tab-subtitle">
              Durable AI usage ledger for the active tenant{usageData ? ` · last ${usageData.days} days` : ''}
            </p>
          </div>
          <span className="enterprise-pill enterprise-pill-success">
            <FiCheckCircle aria-hidden="true" /> Enterprise Tier Active
          </span>
        </div>

        <DataState loading={loading} error={error} onRetry={() => { refreshMetrics(); refreshUsage(); }}>
          <div className="enterprise-usage-bars-grid">
            <div className="enterprise-usage-card">
              <div className="enterprise-usage-header">
                <div className="enterprise-usage-title"><FiZap /> <strong>AI Requests</strong></div>
                <span><strong>{formatNumber(usageData?.requests)}</strong></span>
              </div>
              <small className="text-muted">Recorded in the durable tenant usage ledger</small>
            </div>
            <div className="enterprise-usage-card">
              <div className="enterprise-usage-header">
                <div className="enterprise-usage-title"><FiHash /> <strong>Token Accounting</strong></div>
                <span><strong>{formatNumber(usageData?.inputTokens)} in / {formatNumber(usageData?.outputTokens)} out</strong></span>
              </div>
              <small className="text-muted">Estimated cost {formatCost(usageData?.estimatedCostMicros)}</small>
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
                <div className="enterprise-usage-title"><FiAlertTriangle /> <strong>Observed Errors</strong></div>
                <span><strong>{formatNumber((errors.serverErrors || 0) + (errors.clientErrors || 0))}</strong></span>
              </div>
              <small className="text-muted">{errors.serverErrors || 0} server · {errors.clientErrors || 0} client</small>
            </div>
          </div>
        </DataState>
      </div>

      <div className="enterprise-card" style={{ marginTop: '1.5rem' }}>
        <div className="enterprise-card-header-flex">
          <div>
            <h3 className="enterprise-card-title"><FiBarChart2 aria-hidden="true" /> Daily AI Consumption</h3>
            <p className="enterprise-card-subtitle">Atomic per-day rollups from the tenant ledger</p>
          </div>
        </div>
        <DataState loading={usage.loading} error={usage.error} onRetry={refreshUsage}>
          {byDay.length === 0 ? (
            <p className="enterprise-empty">No AI usage recorded for this tenant yet. Generations appear here the moment they are metered.</p>
          ) : (
            <div className="enterprise-table-wrap" role="region" aria-label="Daily AI usage">
              <table className="enterprise-table">
                <thead>
                  <tr>
                    <th scope="col">Day</th>
                    <th scope="col">Requests</th>
                    <th scope="col">Input tokens</th>
                    <th scope="col">Output tokens</th>
                    <th scope="col">Volume</th>
                  </tr>
                </thead>
                <tbody>
                  {byDay.map(day => (
                    <tr key={day.day}>
                      <td>{day.day}</td>
                      <td>{formatNumber(day.requests)}</td>
                      <td>{formatNumber(day.inputTokens)}</td>
                      <td>{formatNumber(day.outputTokens)}</td>
                      <td style={{ minWidth: '140px' }}>
                        <span
                          role="img"
                          aria-label={`${day.requests} requests`}
                          style={{ display: 'inline-block', height: '8px', width: `${Math.max(4, Math.round((Number(day.requests || 0) / maxDayRequests) * 100))}%`, background: 'linear-gradient(90deg,#4f7cff,#7aa2ff)', borderRadius: '4px' }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DataState>
      </div>

      <div className="enterprise-usage-bars-grid" style={{ marginTop: '1.5rem' }}>
        <div className="enterprise-card">
          <h3 className="enterprise-card-title"><FiCpu aria-hidden="true" /> By Workspace</h3>
          {workspaceRows.length === 0 ? (
            <p className="enterprise-empty">No workspace usage recorded yet.</p>
          ) : workspaceRows.map(([workspaceId, value]) => (
            <div key={workspaceId} className="enterprise-usage-header" style={{ padding: '0.35rem 0' }}>
              <span className="text-muted" title={workspaceId}>{`ws ${String(workspaceId).slice(0, 8)}…`}</span>
              <span><strong>{formatNumber(value.requests)}</strong> req · {formatNumber(value.inputTokens)} in</span>
            </div>
          ))}
        </div>
        <div className="enterprise-card">
          <h3 className="enterprise-card-title">By Provider</h3>
          {providerRows.length === 0 ? (
            <p className="enterprise-empty">No provider usage recorded yet.</p>
          ) : providerRows.map(([provider, count]) => (
            <div key={provider} className="enterprise-usage-header" style={{ padding: '0.35rem 0' }}>
              <span>{provider}</span>
              <span><strong>{formatNumber(count)}</strong> req</span>
            </div>
          ))}
        </div>
        <div className="enterprise-card">
          <h3 className="enterprise-card-title">By Model</h3>
          {modelRows.length === 0 ? (
            <p className="enterprise-empty">No model usage recorded yet.</p>
          ) : modelRows.map(([model, count]) => (
            <div key={model} className="enterprise-usage-header" style={{ padding: '0.35rem 0' }}>
              <span>{model}</span>
              <span><strong>{formatNumber(count)}</strong> req</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
