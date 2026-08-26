import React, { useEffect, useMemo, useState } from 'react';
import { FiBarChart2, FiZap, FiActivity, FiAlertTriangle, FiCheckCircle, FiCpu, FiHash, FiUser } from 'react-icons/fi';
import { useTenantApi, useAsyncResource, DataState } from '../useTenantApi';
import { useEnterpriseTenant } from '../EnterpriseContext';
import HelpTooltip from './HelpTooltip';

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
    <div className="enterprise-card" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="enterprise-usage-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <div className="enterprise-usage-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--enterprise-ink)' }}>
          <FiZap style={{ color: 'var(--enterprise-primary-active)' }} /> <strong>{label}</strong>
        </div>
        <span style={{ fontSize: '1.25rem', fontWeight: 'bold', color: tone === 'danger' ? 'var(--enterprise-danger)' : tone === 'warning' ? 'var(--enterprise-warning)' : 'var(--enterprise-success)' }}>{percent}%</span>
      </div>
      <div
        role="progressbar"
        aria-label={`${label} consumption`}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        style={{ height: '10px', borderRadius: '5px', background: 'var(--enterprise-surface-hover)', overflow: 'hidden', margin: '12px 0' }}
      >
        <div style={{ height: '100%', width: `${percent}%`, background: tone === 'danger' ? 'var(--enterprise-danger)' : tone === 'warning' ? 'var(--enterprise-warning)' : 'var(--enterprise-success)', transition: 'width 0.5s ease-out' }} />
      </div>
      <small className="text-muted" style={{ marginTop: 'auto' }}>{hint}</small>
    </div>
  );
}

/** Inline SVG trend chart over the durable per-day ledger (no synthesized data). */
function UsageTrendChart({ points = [], width = 720, height = 160 }) {
  if (!Array.isArray(points) || points.length < 2) return null;
  const max = Math.max(...points.map(point => Number(point.requests || 0)), 1);
  const stepX = width / (points.length - 1);
  const coords = points.map((point, index) => [index * stepX, height - (Number(point.requests || 0) / max) * (height - 14) - 4]);
  const line = coords.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${width},${height} L0,${height} Z`;
  const peak = points.reduce((best, point) => (Number(point.requests || 0) > Number(best.requests || 0) ? point : best), points[0]);
  return (
    <div className="enterprise-trend" role="img" aria-label={`AI requests per day; peak ${peak.requests} on ${peak.day}`}>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
        <path d={area} fill="var(--enterprise-primary-soft)" />
        <path d={line} fill="none" stroke="var(--enterprise-primary)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <div className="enterprise-trend-meta">
        <span>{points[0]?.day}</span>
        <span>Peak {Number(peak.requests || 0).toLocaleString()} req · {peak.day}</span>
        <span>{points[points.length - 1]?.day}</span>
      </div>
    </div>
  );
}

export default function EnterpriseUsageTab({ initialParams = null, onNavigate = null }) {
  const { request } = useTenantApi();
  const { workspaces } = useEnterpriseTenant();
  // Deep-linkable window: ?days=7|30|90|365 (Overview trend links here).
  const urlDays = Number(initialParams?.get?.('days') || 0);
  const [daysWindow, setDaysWindow] = useState(DAY_WINDOWS.includes(urlDays) ? urlDays : 30);
  useEffect(() => {
    const next = Number(initialParams?.get?.('days') || 0);
    if (DAY_WINDOWS.includes(next)) setDaysWindow(next);
  }, [initialParams]);
  const workspaceNames = useMemo(() => {
    const map = {};
    for (const workspace of (Array.isArray(workspaces) ? workspaces : [])) map[workspace.id] = workspace.name;
    return map;
  }, [workspaces]);
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
            <h2 className="enterprise-tab-title">
              Usage & Quota Analytics
              <HelpTooltip text="Inspect AI token expenditure, compute latencies, daily quota limits, and per-user generation ledger" />
            </h2>
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
          <div className="enterprise-usage-bars-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
            <div className="enterprise-card" style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="enterprise-usage-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div className="enterprise-usage-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><FiZap className="text-primary" /> <strong>AI Requests</strong></div>
                <span style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>{formatNumber(windowRequests)}</span>
              </div>
              <small className="text-muted" style={{ marginTop: 'auto' }}>Recorded in the durable tenant usage ledger ({formatNumber(todayRequests)} today)</small>
            </div>
            <div className="enterprise-card" style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="enterprise-usage-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div className="enterprise-usage-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><FiHash className="text-primary" /> <strong>Tokens</strong></div>
                <span style={{ fontSize: '1rem', fontWeight: 'bold' }}>{formatNumber(usageData?.inputTokens)} / {formatNumber(usageData?.outputTokens)}</span>
              </div>
              <small className="text-muted" style={{ marginTop: 'auto' }}>Estimated cost {formatCost(usageData?.estimatedCostMicros)}</small>
            </div>
            <div className="enterprise-card" style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="enterprise-usage-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div className="enterprise-usage-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><FiActivity className="text-primary" /> <strong>Latency</strong></div>
                <span style={{ fontSize: '1rem', fontWeight: 'bold' }}>{formatDuration(m.p95)} (p95)</span>
              </div>
              <small className="text-muted" style={{ marginTop: 'auto' }}>p50: {formatDuration(m.p50)} / p99: {formatDuration(m.p99)}</small>
            </div>
            <div className="enterprise-card" style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="enterprise-usage-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div className="enterprise-usage-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><FiAlertTriangle className="text-danger" /> <strong>Errors</strong></div>
                <span style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>{formatNumber((errors.serverErrors || 0) + (errors.clientErrors || 0))}</span>
              </div>
              <small className="text-muted" style={{ marginTop: 'auto' }}>{errors.serverErrors || 0} server · {errors.clientErrors || 0} client</small>
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
            <div className="enterprise-usage-bars-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
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
              <div className="enterprise-card" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div className="enterprise-usage-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div className="enterprise-usage-title" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--enterprise-ink)' }}>
                    <FiZap style={{ color: 'var(--enterprise-primary-active)' }} /> <strong>Rate limit</strong>
                  </div>
                  <span style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>{formatNumber(quotaPolicy.aiRequestsPerMinute)}/min</span>
                </div>
                <div style={{ padding: '8px 0', borderBottom: '1px solid var(--enterprise-border)', marginBottom: '8px' }}>
                  <span className="enterprise-pill enterprise-pill-success">Active</span>
                </div>
                <small className="text-muted" style={{ marginTop: 'auto' }}>Per principal, enforced through durable atomic counters before any provider call.</small>
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
            <>
              {/* Primary visualization: the trend chart. The full per-day
                  ledger table stays available through progressive disclosure. */}
              <UsageTrendChart points={byDay} />
              <details className="enterprise-disclosure" style={{ marginTop: '12px' }}>
                <summary>View the per-day ledger table ({byDay.length} days)</summary>
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
              </details>
            </>
          )}
        </DataState>
      </div>

      <div className="enterprise-usage-bars-grid" style={{ marginTop: '1.5rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
        <div className="enterprise-card">
          <h3 className="enterprise-card-title" style={{ marginBottom: '12px' }}><FiCpu aria-hidden="true" /> By Workspace</h3>
          {workspaceRows.length === 0 ? (
            <p className="enterprise-empty">No workspace usage recorded yet.</p>
          ) : workspaceRows.map(([workspaceId, value]) => (
            <div key={workspaceId} className="enterprise-usage-header" style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '0.5rem 0', borderBottom: '1px solid var(--enterprise-surface-hover)' }}>
              <span className="text-muted" title={workspaceId}>{workspaceNames[workspaceId] || `ws ${String(workspaceId).slice(0, 8)}…`}</span>
              <span style={{ fontSize: '0.875rem' }}><strong>{formatNumber(value.requests)}</strong> req · {formatNumber(value.inputTokens)} in</span>
            </div>
          ))}
        </div>
        <div className="enterprise-card">
          <h3 className="enterprise-card-title" style={{ marginBottom: '12px' }}><FiUser aria-hidden="true" /> By User</h3>
          {userRows.length === 0 ? (
            <p className="enterprise-empty">No per-user usage recorded yet.</p>
          ) : userRows.map(([principalId, value]) => (
            <div key={principalId} className="enterprise-usage-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', padding: '0.5rem 0', borderBottom: '1px solid var(--enterprise-surface-hover)' }}>
              {typeof onNavigate === 'function' ? (
                <button
                  type="button"
                  className="enterprise-link-button"
                  style={{ border: 0, background: 'transparent', padding: 0, cursor: 'pointer', color: 'var(--enterprise-primary)', fontSize: 'inherit' }}
                  title={`Inspect audit activity for ${principalId}`}
                  onClick={() => onNavigate('audit', { actor: principalId })}
                >
                  {String(principalId).length > 14 ? `${String(principalId).slice(0, 14)}…` : principalId}
                </button>
              ) : (
                <span className="text-muted" title={principalId}>{String(principalId).slice(0, 14)}…</span>
              )}
              <span style={{ fontSize: '0.875rem' }}><strong>{formatNumber(value.requests)}</strong> req · {formatNumber(value.inputTokens + value.outputTokens)} tok</span>
            </div>
          ))}
        </div>
        <div className="enterprise-card">
          <h3 className="enterprise-card-title" style={{ marginBottom: '12px' }}>By Provider</h3>
          {providerRows.length === 0 ? (
            <p className="enterprise-empty">No provider usage recorded yet.</p>
          ) : providerRows.map(([provider, count]) => (
            <div key={provider} className="enterprise-usage-header" style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '0.5rem 0', borderBottom: '1px solid var(--enterprise-surface-hover)' }}>
              <span>{provider}</span>
              <span><strong>{formatNumber(count)}</strong> req</span>
            </div>
          ))}
        </div>
        <div className="enterprise-card">
          <h3 className="enterprise-card-title" style={{ marginBottom: '12px' }}>By Model</h3>
          {modelRows.length === 0 ? (
            <p className="enterprise-empty">No model usage recorded yet.</p>
          ) : modelRows.map(([model, count]) => (
            <div key={model} className="enterprise-usage-header" style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '0.5rem 0', borderBottom: '1px solid var(--enterprise-surface-hover)' }}>
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
