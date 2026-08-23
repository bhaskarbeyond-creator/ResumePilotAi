import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FiRefreshCw, FiAlertTriangle } from 'react-icons/fi';
import { getApiHealthMatrix } from '../../../services/platformApi';
import { describeState, formatCheckedAt, HEALTH_STATES } from '../../../utils/healthPresentation';

const PAGE_SIZE = 40;

const STATE_OPTIONS = [
  { id: 'all', label: 'All states' },
  { id: HEALTH_STATES.OPERATIONAL, label: 'Operational' },
  { id: HEALTH_STATES.DEGRADED, label: 'Degraded' },
  { id: HEALTH_STATES.UNAVAILABLE, label: 'Unavailable' },
  { id: HEALTH_STATES.DISABLED, label: 'Disabled' },
  { id: HEALTH_STATES.NOT_CONFIGURED, label: 'Not configured' },
];

const AUTH_OPTIONS = [
  { id: 'all', label: 'Any authentication' },
  { id: 'PUBLIC', label: 'Public' },
  { id: 'AUTHENTICATED', label: 'Authenticated' },
  { id: 'ADMIN', label: 'Admin' },
  { id: 'TENANT_MEMBER', label: 'Tenant member' },
  { id: 'SERVICE_KEY', label: 'Service key' },
];

function StateChip({ state }) {
  const tone = describeState(state);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${tone.badge}`}>
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
      {tone.label}
    </span>
  );
}

export default function ApiHealthMatrix({ summary, onSelectService }) {
  const [matrix, setMatrix] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [stateFilter, setStateFilter] = useState('all');
  const [authFilter, setAuthFilter] = useState('all');
  const [externalOnly, setExternalOnly] = useState(false);
  const [visible, setVisible] = useState(PAGE_SIZE);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setMatrix(await getApiHealthMatrix());
    } catch (err) {
      setError(err.message || 'The API health matrix is unavailable.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const endpoints = useMemo(() => matrix?.endpoints || [], [matrix]);

  const modules = useMemo(() => ['all', ...Array.from(new Set(endpoints.map(item => item.module))).sort()], [endpoints]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return endpoints.filter(endpoint => {
      if (moduleFilter !== 'all' && endpoint.module !== moduleFilter) return false;
      if (stateFilter !== 'all' && endpoint.state !== stateFilter) return false;
      if (authFilter !== 'all' && endpoint.authentication !== authFilter) return false;
      if (externalOnly && !endpoint.externalDependency) return false;
      if (!needle) return true;
      return `${endpoint.method} ${endpoint.path} ${endpoint.dependency}`.toLowerCase().includes(needle);
    });
  }, [endpoints, query, moduleFilter, stateFilter, authFilter, externalOnly]);

  useEffect(() => { setVisible(PAGE_SIZE); }, [query, moduleFilter, stateFilter, authFilter, externalOnly]);

  const totals = matrix || summary || null;

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900">API Health Matrix</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Every endpoint in the live Express routing table, with the state of the dependency it actually calls.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-slate-500">Last checked: <span className="font-mono font-bold text-slate-700">{formatCheckedAt(matrix?.checkedAt)}</span></span>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <FiRefreshCw className={loading ? 'animate-spin' : ''} aria-hidden="true" /> Refresh
            </button>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
            <dt className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500">Endpoints checked</dt>
            <dd className="mt-0.5 text-xl font-black text-slate-900">{totals?.total ?? 'Data unavailable'}</dd>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
            <dt className="text-[10px] font-extrabold uppercase tracking-wide text-emerald-700">Operational / expected</dt>
            <dd className="mt-0.5 text-xl font-black text-emerald-800">{totals?.operationalOrExpected ?? 'Data unavailable'}</dd>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
            <dt className="text-[10px] font-extrabold uppercase tracking-wide text-amber-800">Degraded</dt>
            <dd className="mt-0.5 text-xl font-black text-amber-900">{totals?.degraded ?? 'Data unavailable'}</dd>
          </div>
          <div className="rounded-xl border border-red-200 bg-red-50/60 p-3">
            <dt className="text-[10px] font-extrabold uppercase tracking-wide text-red-700">Unavailable</dt>
            <dd className="mt-0.5 text-xl font-black text-red-800">{totals?.unavailable ?? 'Data unavailable'}</dd>
          </div>
        </dl>
        <p className="mt-2 text-[11px] text-slate-400">
          “Operational / expected” counts endpoints that respond normally plus endpoints whose provider is intentionally disabled or unconfigured — those are expected states, not failures.
        </p>
      </section>

      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-xs text-red-900">
          <FiAlertTriangle className="mt-0.5 flex-none" aria-hidden="true" />
          <div className="flex-1"><p className="font-bold">The API matrix could not be collected.</p><p className="mt-0.5">{error}</p></div>
          <button type="button" onClick={load} className="font-bold underline">Retry</button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <label className="lg:col-span-2">
          <span className="sr-only">Search endpoints</span>
          <input
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search endpoint path or dependency…"
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-200"
          />
        </label>
        <label>
          <span className="sr-only">Filter by module</span>
          <select value={moduleFilter} onChange={event => setModuleFilter(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 focus:border-indigo-400 focus:outline-none">
            {modules.map(module => <option key={module} value={module}>{module === 'all' ? 'All modules' : module}</option>)}
          </select>
        </label>
        <label>
          <span className="sr-only">Filter by operational state</span>
          <select value={stateFilter} onChange={event => setStateFilter(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 focus:border-indigo-400 focus:outline-none">
            {STATE_OPTIONS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </label>
        <label>
          <span className="sr-only">Filter by authentication</span>
          <select value={authFilter} onChange={event => setAuthFilter(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 focus:border-indigo-400 focus:outline-none">
            {AUTH_OPTIONS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </label>
      </div>

      <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600">
        <input type="checkbox" className="h-3.5 w-3.5 accent-indigo-600" checked={externalOnly} onChange={event => setExternalOnly(event.target.checked)} />
        Only endpoints with an external dependency
      </label>

      {loading && !matrix ? (
        <div className="space-y-2" aria-busy="true">
          {Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-12 animate-pulse rounded-xl bg-slate-200" />)}
          <p className="sr-only" role="status">Loading API health matrix…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
          <p className="text-sm font-bold text-slate-800">No endpoints match these filters</p>
          <p className="mt-1 text-xs text-slate-500">Adjust the search or filters to widen the result set.</p>
        </div>
      ) : (
        <>
          <p className="text-[11px] font-semibold text-slate-500" role="status">
            Showing {Math.min(visible, filtered.length)} of {filtered.length} matching endpoint{filtered.length === 1 ? '' : 's'}
          </p>

          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white md:block">
            <table data-testid="api-matrix-table" className="w-full table-fixed text-left text-xs">
              <caption className="sr-only">API endpoints with their operational state, module, authentication requirement, and dependency</caption>
              <thead className="bg-slate-50/70 text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="w-[42%] px-3 py-2 font-extrabold">Endpoint</th>
                  <th scope="col" className="w-[14%] px-3 py-2 font-extrabold">Module</th>
                  <th scope="col" className="w-[14%] px-3 py-2 font-extrabold">Auth</th>
                  <th scope="col" className="w-[16%] px-3 py-2 font-extrabold">Dependency</th>
                  <th scope="col" className="w-[14%] px-3 py-2 font-extrabold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.slice(0, visible).map(endpoint => (
                  <tr key={`${endpoint.method} ${endpoint.path}`} data-testid="api-matrix-row" className="align-top hover:bg-slate-50">
                    <th scope="row" className="px-3 py-2 font-normal">
                      <span className="mr-1.5 rounded bg-slate-100 px-1 py-0.5 font-mono text-[9px] font-extrabold text-slate-600">{endpoint.method}</span>
                      <span className="break-all font-mono text-[11px] text-slate-800">{endpoint.path}</span>
                    </th>
                    <td className="px-3 py-2 text-slate-600">{endpoint.module}</td>
                    <td className="px-3 py-2 text-slate-600">{endpoint.authentication}</td>
                    <td className="px-3 py-2">
                      {endpoint.dependencyId ? (
                        <button type="button" onClick={() => onSelectService?.(endpoint.dependencyId)} className="truncate text-left font-semibold text-indigo-700 hover:underline">
                          {endpoint.dependency}
                        </button>
                      ) : <span className="text-slate-500">{endpoint.dependency}</span>}
                    </td>
                    <td className="px-3 py-2"><StateChip state={endpoint.state} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards — dense tables become readable stacked records */}
          <ul className="space-y-2 md:hidden">
            {filtered.slice(0, visible).map(endpoint => (
              <li key={`${endpoint.method} ${endpoint.path}`} data-testid="api-matrix-card" className="rounded-2xl border border-slate-200 bg-white p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 break-all font-mono text-[11px] font-bold text-slate-800">
                    <span className="mr-1.5 rounded bg-slate-100 px-1 py-0.5 text-[9px] font-extrabold text-slate-600">{endpoint.method}</span>
                    {endpoint.path}
                  </p>
                  <StateChip state={endpoint.state} />
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-1.5 text-[11px]">
                  <div><dt className="text-slate-400">Module</dt><dd className="font-semibold text-slate-700">{endpoint.module}</dd></div>
                  <div><dt className="text-slate-400">Auth</dt><dd className="font-semibold text-slate-700">{endpoint.authentication}</dd></div>
                  <div className="col-span-2">
                    <dt className="text-slate-400">Dependency</dt>
                    <dd>
                      {endpoint.dependencyId ? (
                        <button type="button" onClick={() => onSelectService?.(endpoint.dependencyId)} className="font-semibold text-indigo-700 underline">{endpoint.dependency}</button>
                      ) : <span className="font-semibold text-slate-700">{endpoint.dependency}</span>}
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>

          {visible < filtered.length && (
            <button
              type="button"
              onClick={() => setVisible(current => current + PAGE_SIZE)}
              className="w-full rounded-xl border border-slate-300 bg-white py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              Show {Math.min(PAGE_SIZE, filtered.length - visible)} more
            </button>
          )}
        </>
      )}
    </div>
  );
}
