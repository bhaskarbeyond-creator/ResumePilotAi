import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FiActivity, FiRefreshCw, FiAlertTriangle, FiList, FiGrid } from 'react-icons/fi';
import { useAdminSession } from '../AdminContext';
import { getOperationalStatus, refreshOperationalStatus, getOperationalService, testOperationalService } from '../../../services/platformApi';
import { describeState, describeOverall, describePosture, needsAttention, formatCheckedAt, GROUP_LABEL, HEALTH_STATES } from '../../../utils/healthPresentation';
import ServiceDetailPanel from './ServiceDetailPanel';
import ApiHealthMatrix from './ApiHealthMatrix';

const AUTO_REFRESH_MS = 60_000;

const GROUP_ORDER = ['core', 'integrations', 'workers'];

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'attention', label: 'Needs attention' },
  { id: HEALTH_STATES.OPERATIONAL, label: 'Operational' },
  { id: HEALTH_STATES.DEGRADED, label: 'Degraded' },
  { id: HEALTH_STATES.UNAVAILABLE, label: 'Unavailable' },
  { id: HEALTH_STATES.DISABLED, label: 'Disabled' },
  { id: HEALTH_STATES.NOT_CONFIGURED, label: 'Not configured' },
  { id: HEALTH_STATES.NOT_SUPPORTED, label: 'Not supported' },
  { id: HEALTH_STATES.UNKNOWN, label: 'Unknown' },
];

function StatusDot({ state, className = '' }) {
  const tone = describeState(state);
  return <span aria-hidden="true" className={`inline-block h-2 w-2 flex-none rounded-full ${tone.dot} ${className}`} />;
}

export function StatusBadge({ state }) {
  const tone = describeState(state);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${tone.badge}`}>
      <StatusDot state={state} />
      {tone.label}
    </span>
  );
}

function SummaryTile({ label, value, state, active, onClick }) {
  const tone = describeState(state);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-testid="health-summary-tile"
      data-state={state}
      className={`rounded-2xl border bg-white p-3 text-left transition hover:border-indigo-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${active ? 'border-indigo-400 ring-1 ring-indigo-200' : 'border-slate-200'}`}
    >
      <div className="flex items-center gap-1.5">
        <StatusDot state={state} />
        <span className="truncate text-[10px] font-extrabold uppercase tracking-wide text-slate-500">{label}</span>
      </div>
      <p className={`mt-1 text-xl font-black ${tone.tone === 'critical' ? 'text-red-700' : tone.tone === 'warn' ? 'text-amber-700' : 'text-slate-900'}`}>{value}</p>
    </button>
  );
}

function ServiceRow({ service, onSelect, selected }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(service.id)}
        data-testid="health-service-row"
        data-service-id={service.id}
        data-service-state={service.state}
        aria-label={`${service.name}: ${describeState(service.state).label}. Open details`}
        className={`flex w-full items-start gap-3 border-b border-slate-100 px-3 py-3 text-left transition last:border-b-0 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 ${selected ? 'bg-indigo-50/60' : ''}`}
      >
        <StatusDot state={service.state} className="mt-1.5" />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-slate-900">{service.name}</span>
            {service.critical && <span className="rounded bg-slate-100 px-1.5 text-[9px] font-extrabold uppercase tracking-wide text-slate-600">Critical</span>}
          </span>
          <span className="mt-0.5 block truncate text-xs text-slate-500" title={service.reason}>{service.reason}</span>
          <span className="mt-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">{describePosture(service)}</span>
        </span>
        <span className="hidden flex-none sm:block"><StatusBadge state={service.state} /></span>
      </button>
    </li>
  );
}

export default function PlatformHealth() {
  const { isSuperAdmin } = useAdminSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [view, setView] = useState('services');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);
  const mounted = useRef(true);

  const selectedId = searchParams.get('service');

  useEffect(() => () => { mounted.current = false; }, []);

  const load = useCallback(async ({ manual = false } = {}) => {
    if (manual) setRefreshing(true);
    setError(null);
    try {
      const data = manual ? await refreshOperationalStatus() : await getOperationalStatus();
      if (!mounted.current) return;
      setSnapshot(data);
    } catch (err) {
      if (!mounted.current) return;
      setError(err.message || 'Operational status is unavailable.');
    } finally {
      if (mounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!autoRefresh) return undefined;
    const timer = setInterval(() => load(), AUTO_REFRESH_MS);
    return () => clearInterval(timer);
  }, [autoRefresh, load]);

  const selectService = useCallback((serviceId) => {
    const next = new URLSearchParams(searchParams);
    if (serviceId) next.set('service', serviceId); else next.delete('service');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!selectedId) { setDetail(null); setDetailError(null); setTestResult(null); return; }
    let cancelled = false;
    setDetailLoading(true);
    setDetailError(null);
    setTestResult(null);
    getOperationalService(selectedId)
      .then(data => { if (!cancelled) setDetail(data); })
      .catch(err => { if (!cancelled) setDetailError(err.message || 'Service detail is unavailable.'); })
      .finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
  }, [selectedId]);

  const runTest = useCallback(async (serviceId) => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testOperationalService(serviceId);
      setTestResult(result);
      await load();
    } catch (err) {
      setTestResult({ passed: false, detail: err.message || 'The provider test could not be executed.', errorCategory: err.code || null });
    } finally {
      setTesting(false);
    }
  }, [load]);

  const services = useMemo(() => snapshot?.services || [], [snapshot]);
  const summary = snapshot?.summary || null;

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return services.filter(service => {
      if (filter === 'attention' && !needsAttention(service.state)) return false;
      if (filter !== 'all' && filter !== 'attention' && service.state !== filter) return false;
      if (!needle) return true;
      return `${service.name} ${service.id} ${service.reason}`.toLowerCase().includes(needle);
    });
  }, [services, filter, query]);

  const grouped = useMemo(() => GROUP_ORDER
    .map(group => ({ group, items: filtered.filter(service => service.group === group) }))
    .filter(entry => entry.items.length > 0), [filtered]);

  const overall = describeOverall(summary?.overall);
  const counts = summary?.counts || {};

  if (loading && !snapshot) {
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="h-8 w-64 animate-pulse rounded-lg bg-slate-200" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {Array.from({ length: 7 }).map((_, index) => <div key={index} className="h-20 animate-pulse rounded-2xl bg-slate-200" />)}
        </div>
        <div className="h-64 animate-pulse rounded-2xl bg-slate-200" />
        <p className="sr-only" role="status">Collecting live platform health…</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <FiActivity className="text-indigo-600" aria-hidden="true" /> Platform Health
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Live operational state of the platform and every production integration. Every status below comes from a backend
            check performed at the time shown — nothing is assumed, defaulted, or cached beyond the interval.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold text-slate-500">
            Last checked: <span className="font-mono font-bold text-slate-700">{formatCheckedAt(snapshot?.checkedAt)}</span>
          </span>
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 accent-indigo-600"
              checked={autoRefresh}
              onChange={event => setAutoRefresh(event.target.checked)}
            />
            Auto-refresh (60s)
          </label>
          <button
            type="button"
            onClick={() => load({ manual: true })}
            disabled={refreshing}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-extrabold text-slate-800 shadow-2xs transition hover:bg-slate-50 cursor-pointer disabled:opacity-50 whitespace-nowrap"
          >
            <FiRefreshCw className={`h-3.5 w-3.5 text-slate-600 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>Refresh</span>
          </button>
        </div>
      </header>

      {error && (
        <div role="alert" className="flex flex-wrap items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-xs text-red-900">
          <FiAlertTriangle className="mt-0.5 flex-none" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="font-bold">Operational status could not be collected.</p>
            <p className="mt-0.5 break-words">{error}</p>
            <p className="mt-1 text-red-700">No status is inferred while the collector is unreachable. Existing values are not treated as current.</p>
          </div>
          <button type="button" onClick={() => load({ manual: true })} className="font-bold underline">Retry</button>
        </div>
      )}

      {summary && (
        <section aria-label="Overall platform status" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span aria-hidden="true" className={`h-3 w-3 flex-none rounded-full ${overall.dot}`} />
              <div>
                <p className="text-base font-extrabold text-slate-900">{overall.label}</p>
                <p className="text-xs text-slate-500">
                  {summary.total} monitored services · {snapshot?.apiMatrix?.total ?? 'Data unavailable'} endpoints in the routing table
                </p>
              </div>
            </div>
            <span className={`inline-flex items-center gap-1.5 self-start rounded-full border px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide ${overall.badge}`}>
              {summary.overall}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            <SummaryTile label="Operational" value={counts.OPERATIONAL ?? 0} state={HEALTH_STATES.OPERATIONAL} active={filter === HEALTH_STATES.OPERATIONAL} onClick={() => setFilter(filter === HEALTH_STATES.OPERATIONAL ? 'all' : HEALTH_STATES.OPERATIONAL)} />
            <SummaryTile label="Degraded" value={counts.DEGRADED ?? 0} state={HEALTH_STATES.DEGRADED} active={filter === HEALTH_STATES.DEGRADED} onClick={() => setFilter(filter === HEALTH_STATES.DEGRADED ? 'all' : HEALTH_STATES.DEGRADED)} />
            <SummaryTile label="Unavailable" value={counts.UNAVAILABLE ?? 0} state={HEALTH_STATES.UNAVAILABLE} active={filter === HEALTH_STATES.UNAVAILABLE} onClick={() => setFilter(filter === HEALTH_STATES.UNAVAILABLE ? 'all' : HEALTH_STATES.UNAVAILABLE)} />
            <SummaryTile label="Disabled" value={counts.DISABLED ?? 0} state={HEALTH_STATES.DISABLED} active={filter === HEALTH_STATES.DISABLED} onClick={() => setFilter(filter === HEALTH_STATES.DISABLED ? 'all' : HEALTH_STATES.DISABLED)} />
            <SummaryTile label="Not configured" value={counts.NOT_CONFIGURED ?? 0} state={HEALTH_STATES.NOT_CONFIGURED} active={filter === HEALTH_STATES.NOT_CONFIGURED} onClick={() => setFilter(filter === HEALTH_STATES.NOT_CONFIGURED ? 'all' : HEALTH_STATES.NOT_CONFIGURED)} />
            <SummaryTile label="Not supported" value={counts.NOT_SUPPORTED ?? 0} state={HEALTH_STATES.NOT_SUPPORTED} active={filter === HEALTH_STATES.NOT_SUPPORTED} onClick={() => setFilter(filter === HEALTH_STATES.NOT_SUPPORTED ? 'all' : HEALTH_STATES.NOT_SUPPORTED)} />
            <SummaryTile label="Unknown" value={counts.UNKNOWN ?? 0} state={HEALTH_STATES.UNKNOWN} active={filter === HEALTH_STATES.UNKNOWN} onClick={() => setFilter(filter === HEALTH_STATES.UNKNOWN ? 'all' : HEALTH_STATES.UNKNOWN)} />
          </div>

          <p className="mt-3 text-[11px] text-slate-400">
            Disabled and Not configured are deliberate configuration states, not faults. They are counted separately from Degraded and Unavailable.
          </p>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setView('services')}
          aria-current={view === 'services' ? 'page' : undefined}
          className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-bold transition ${view === 'services' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
        >
          <FiGrid className="h-3.5 w-3.5" aria-hidden="true" /> Services
        </button>
        <button
          type="button"
          onClick={() => setView('matrix')}
          aria-current={view === 'matrix' ? 'page' : undefined}
          className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-bold transition ${view === 'matrix' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
        >
          <FiList className="h-3.5 w-3.5" aria-hidden="true" /> View API Matrix
        </button>
      </div>

      {view === 'services' ? (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter services by state">
              {FILTERS.map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFilter(item.id)}
                  aria-pressed={filter === item.id}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-bold transition ${filter === item.id ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <label className="sm:w-64">
              <span className="sr-only">Search services</span>
              <input
                type="search"
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search services…"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-200"
              />
            </label>
          </div>

          {grouped.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
              <p className="text-sm font-bold text-slate-800">No services match this filter</p>
              <p className="mt-1 text-xs text-slate-500">Clear the filter or search term to see the full service inventory.</p>
              <button type="button" onClick={() => { setFilter('all'); setQuery(''); }} className="mt-3 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50">Clear filters</button>
            </div>
          ) : (
            <div className="space-y-4">
              {grouped.map(({ group, items }) => (
                <section key={group} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs">
                  <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/70 px-4 py-2.5">
                    <h2 className="text-[11px] font-extrabold uppercase tracking-widest text-slate-500">{GROUP_LABEL[group] || group}</h2>
                    <span className="text-[11px] font-semibold text-slate-400">{items.length} service{items.length === 1 ? '' : 's'}</span>
                  </div>
                  <ul>
                    {items.map(service => (
                      <ServiceRow key={service.id} service={service} onSelect={selectService} selected={selectedId === service.id} />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </>
      ) : (
        <ApiHealthMatrix summary={snapshot?.apiMatrix} onSelectService={selectService} />
      )}

      <ServiceDetailPanel
        open={Boolean(selectedId)}
        loading={detailLoading}
        error={detailError}
        detail={detail}
        onClose={() => selectService(null)}
        onTest={runTest}
        testing={testing}
        testResult={testResult}
        canTest={isSuperAdmin}
      />
    </div>
  );
}
