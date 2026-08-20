import React, { useMemo, useState } from 'react';
import {
  FiBarChart2, FiZap, FiActivity, FiAlertTriangle, FiCheckCircle, FiCpu, FiHash, FiUser
} from 'react-icons/fi';
import { useTenantApi, useAsyncResource, DataState } from '../useTenantApi';

const DAY_WINDOWS = [7, 30, 90, 365];

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

function QuotaBar({ label, used, limit, hint }) {
  const percent = Number(limit) > 0 ? Math.min(100, Math.round((Number(used) / Number(limit)) * 100)) : 0;
  const tone = percent >= 90 ? 'danger' : percent >= 75 ? 'warning' : 'success';
  return (
    <div className="enterprise-usage-card">
      <div className="enterprise-usage-header">
        <div className="enterprise-usage-title"><FiZap /> <strong>{label}</strong></div>
        <span><strong>{percent}%</strong></span>
      </div>
      <div
        role="progressbar"
        aria-label={`${label} consumption`}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        style={{ height: '8px', borderRadius: '4px', background: 'rgba(148,163,184,0.25)', overflow: 'hidden', margin: '0.5rem 0' }}
      >
        <div style={{ height: '100%', width: `${percent}%`, background: tone === 'danger' ? '#ef4444' : tone === 'warning' ? '#f59e0b' : '#10b981' }} />
      </div>
      <small className="text-muted">{hint}</small>
    </div>
  );
}

export default function EnterpriseUsageTab() {
  const { request } = useTenantApi();
  const [daysWindow, setDaysWindow] = useState(30);
  const [metrics, refreshMetrics] = useAsyncResource(() => request('/api/enterprise/observability/metrics'), [request]);
  const [usage, refreshUsage] = useAsyncResource(() => request(`/api/enterprise/usage/ai?days=${daysWindow}`), [request, daysWindow]);
  const [events, refreshEvents] = useAsyncResource(() => request('/api/enterprise/usage/ai/events'), [request]);
  const [configState, refreshConfig] = useAsyncResource(() => request('/api/enterprise/configuration'), [request]);
  const { loading, error, data } = metrics;
  const usageData = useMemo(() => usage?.data?.usage || null, [usage]);
  const recentEvents = useMemo(() => (Array.isArray(events?.data?.events) ? events.data.events : []), [events]);
  const quotaPolicy = useMemo(() => configState.data?.configuration?.quotaPolicy || null, [configState]);

  const m = data?.metrics || {};
  const errors = m.errors || {};
  const byDay = usageData?.byDay || [];
  const maxDayRequests = Math.max(1, ...byDay.map(day => Number(day.requests || 0)));
  const workspaceRows = Object.entries(usageData?.byWorkspace || {});
  const userRows = Object.entries(usageData?.byUser || {});
  const providerRows = Object.entries(usageData?.byProvider || {});
  const modelRows = Object.entries(usageData?.byModel || {});

  const todayKey = new Date().toISOString().slice(0, 10);
  const todayRequests = byDay.find(day => String(day.day).startsWith(todayKey))?.requests || 0;
  const windowRequests = usageData?.requests || 0;
  const dailyLimit = quotaPolicy?.aiRequestsPerDay ?? null;

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
          <div className="enterprise-inline-actions" style={{ gap: '0.5rem' }} role="group" aria-label="Usage window">
            {DAY_WINDOWS.map(window => (
              <button
                key={window}
                type="button"
                className={`enterprise-button enterprise-button-sm ${daysWindow === window ? 'enterprise-button-primary' : 'enterprise-button-secondary'}`}
                aria-pressed={daysWindow === window}
                onClick={() => setDaysWindow(window)}
              >
                {window}d
              </button>
            ))}
          </div>
        </div>

        <DataState loading={loading} error={error} onRetry={() => { refreshMetrics(); refreshUsage(); }}>
          <div className="enterprise-usage-bars-grid">
            <div className="enterprise-usage-card">
              <div className="enterprise-usage-header">
                <div className="enterprise-usage-title"><FiZap /> <strong>AI Requests</strong></div>
                <span><strong>{formatNumber(windowRequests)}</strong></span>
              </div>
              <small className="text-muted">Recorded in the durable tenant usage ledger ({formatNumber(todayRequests)} today)</small>
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
            <h3 className="enterprise-card-title"><FiCheckCircle aria-hidden="true" /> Quota Consumption</h3>
            <p className="enterprise-card-subtitle">
              {quotaPolicy
                ? `Tenant policy: ${formatNumber(quotaPolicy.aiRequestsPerDay)} AI requests/day · ${formatNumber(quotaPolicy.aiRequestsPerMinute)}/minute per principal`
                : 'Quota policy is unavailable for this tenant.'}
            </p>
          </div>
        </div>
        <DataState loading={configState.loading} error={configState.error} onRetry={refreshConfig}>
          {quotaPolicy ? (
            <div className="enterprise-usage-bars-grid">
              <QuotaBar
                label="Daily AI allowance"
                used={todayRequests}
                limit={dailyLimit}
                hint={`${formatNumber(todayRequests)} of ${formatNumber(dailyLimit)} requests today${dailyLimit && (todayRequests / dailyLimit) >= 0.9 ? ' — nearing the tenant limit' : ''}`}
              />
              <QuotaBar
                label="Window consumption (reference)"
                used={windowRequests}
                limit={Number(dailyLimit) * daysWindow}
                hint={`${formatNumber(windowRequests)} requests over ${daysWindow} days vs a ${formatNumber(Number(dailyLimit) * daysWindow)} request allowance`}
              />
              <div className="enterprise-usage-card">
                <div className="enterprise-usage-header">
                  <div className="enterprise-usage-title"><FiZap /> <strong>Rate limit</strong></div>
                  <span><strong>{formatNumber(quotaPolicy.aiRequestsPerMinute)}/min</strong></span>
                </div>
                <small className="text-muted">Per principal, enforced through durable atomic counters before any provider call.</small>
              </div>
            </div>
          ) : (
            <p className="enterprise-empty">No quota policy is recorded for this tenant.</p>
          )}
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
          <h3 className="enterprise-card-title"><FiUser aria-hidden="true" /> By User</h3>
          {userRows.length === 0 ? (
            <p className="enterprise-empty">No per-user usage recorded yet.</p>
          ) : userRows.map(([principalId, value]) => (
            <div key={principalId} className="enterprise-usage-header" style={{ padding: '0.35rem 0' }}>
              <span className="text-muted" title={principalId}>{String(principalId).slice(0, 14)}…</span>
              <span><strong>{formatNumber(value.requests)}</strong> req · {formatNumber(value.inputTokens + value.outputTokens)} tokens</span>
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

      <div className="enterprise-card" style={{ marginTop: '1.5rem' }}>
        <div className="enterprise-card-header-flex">
          <div>
            <h3 className="enterprise-card-title"><FiActivity aria-hidden="true" /> Recent AI Generations</h3>
            <p className="enterprise-card-subtitle">Per-event ledger entries with correlation ids — the auditable AI activity trail</p>
          </div>
        </div>
        <DataState loading={events.loading} error={events.error} onRetry={refreshEvents}>
          {recentEvents.length === 0 ? (
            <p className="enterprise-empty">No AI generations have been metered for this tenant yet.</p>
          ) : (
            <div className="enterprise-table-wrap" role="region" aria-label="Recent AI generations">
              <table className="enterprise-table">
                <thead>
                  <tr>
                    <th scope="col">When (UTC)</th>
                    <th scope="col">Principal</th>
                    <th scope="col">Operation</th>
                    <th scope="col">Provider / Model</th>
                    <th scope="col">Correlation</th>
                  </tr>
                </thead>
                <tbody>
                  {recentEvents.map(event => (
                    <tr key={event.id}>
                      <td><small className="text-muted">{event.createdAt ? String(event.createdAt).slice(0, 19).replace('T', ' ') : '—'}</small></td>
                      <td><small title={event.principalId || ''}>{event.principalId ? `${String(event.principalId).slice(0, 12)}…` : '—'}</small></td>
                      <td><code>{event.operation || '—'}</code></td>
                      <td><small>{event.provider || '—'} · {event.model || '—'}</small></td>
                      <td><small className="text-muted" title={event.correlationId || ''}>{event.correlationId ? `${String(event.correlationId).slice(0, 14)}…` : '—'}</small></td>
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
