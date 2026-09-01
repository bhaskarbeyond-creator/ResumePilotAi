import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiAlertTriangle, FiRefreshCw, FiCheckCircle, FiInfo, FiActivity } from 'react-icons/fi';
import { getAttention, getCommandCenter } from '../../../services/platformApi';
import { describeOverall, formatCheckedAt } from '../../../utils/healthPresentation';

export default function PlatformAttention() {
  const [items, setItems] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [status, setStatus] = useState(null);
  const [operational, setOperational] = useState(null);
  const [operationalSource, setOperationalSource] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [attention, center] = await Promise.all([getAttention(), getCommandCenter()]);
      setItems(attention.items || []);
      setStatus(attention.status || center.status);
      setOperational(attention.operationalStatus || center.operationalStatus || null);
      setOperationalSource(attention.operationalSource || null);
      setRecommendations(center.recommendations || []);
    } catch (err) {
      setError(err.message || 'Attention feed unavailable');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const rows = [...items.map(item => ({ ...item, source: 'signal' })), ...recommendations.map(item => ({ ...item, source: 'recommendation' }))];
  const unique = [];
  const seen = new Set();
  for (const row of rows) {
    const key = `${row.id}:${row.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(row);
  }
  const severityRank = { HIGH: 0, MEDIUM: 1, INFO: 2 };
  unique.sort((a, b) => (severityRank[a.severity] ?? 3) - (severityRank[b.severity] ?? 3));

  const overall = operational ? describeOverall(operational.overall) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><FiAlertTriangle className="text-amber-600" aria-hidden="true" /> Attention</h1>
          <p className="mt-1 text-sm text-slate-500">Derived from inspected platform signals and live operational health. This is not a fabricated incident desk.</p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-extrabold text-slate-800 hover:bg-slate-50 shadow-2xs cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
        >
          <FiRefreshCw className={`h-3.5 w-3.5 text-slate-600 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          <span>Refresh</span>
        </button>
      </div>

      {operational ? (
        <Link to="/adm/health" className="block rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-indigo-300">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span aria-hidden="true" className={`h-3 w-3 flex-none rounded-full ${overall.dot}`} />
              <div>
                <p className="text-sm font-extrabold text-slate-900">{overall.label}</p>
                <p className="text-xs text-slate-500">
                  Last checked {formatCheckedAt(operational.checkedAt)} · {operational.counts?.DEGRADED ?? 0} degraded · {operational.counts?.UNAVAILABLE ?? 0} unavailable · {operational.counts?.DISABLED ?? 0} disabled
                </p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-700"><FiActivity className="h-3.5 w-3.5" aria-hidden="true" /> Open Platform Health</span>
          </div>
        </Link>
      ) : operationalSource === 'unavailable' ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
          Operational health data unavailable — the collector did not respond. No status is inferred.
        </div>
      ) : null}

      {status && <p className="text-xs font-extrabold uppercase text-slate-500">Platform status: {status}</p>}
      {error && <div role="alert" className="flex justify-between rounded-2xl border border-red-200 bg-red-50 p-4 text-xs text-red-800"><span>{error}</span><button type="button" className="font-bold underline" onClick={load}>Retry</button></div>}

      {loading ? (
        <div className="space-y-2" aria-busy="true">
          {Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-20 animate-pulse rounded-2xl bg-slate-200" />)}
          <p className="sr-only" role="status">Loading attention items…</p>
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-10 text-center">
          <FiInfo className="mx-auto h-6 w-6 text-amber-500" aria-hidden="true" />
          <p className="mt-2 text-sm font-bold text-amber-900">Attention data unavailable</p>
          <p className="mt-1 text-xs text-amber-800">No empty or healthy conclusion is inferred while the source request is failing.</p>
        </div>
      ) : unique.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
          <FiCheckCircle className="mx-auto h-6 w-6 text-emerald-500" aria-hidden="true" />
          <p className="mt-2 text-sm font-bold text-slate-800">Nothing needs your attention</p>
          <p className="mt-1 text-xs text-slate-500">No attention items from inspected sources.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {unique.map(item => (
            <Link key={`${item.source}-${item.id}`} to={item.href || '/adm/dashboard'} className="block rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-indigo-300">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-2">
                  {item.severity === 'INFO'
                    ? <FiInfo className="mt-0.5 h-3.5 w-3.5 flex-none text-slate-400" aria-hidden="true" />
                    : <FiAlertTriangle className={`mt-0.5 h-3.5 w-3.5 flex-none ${item.severity === 'HIGH' ? 'text-red-500' : 'text-amber-500'}`} aria-hidden="true" />}
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900">{item.title}</p>
                    {item.detail && <p className="mt-1 text-xs text-slate-500">{item.detail}</p>}
                  </div>
                </div>
                <span className={`flex-none rounded-full px-2 py-0.5 text-[10px] font-extrabold ${item.severity === 'HIGH' ? 'bg-red-100 text-red-800' : item.severity === 'MEDIUM' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>{item.severity || 'INFO'}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
