import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiAlertTriangle, FiRefreshCw, FiShield, FiUser } from 'react-icons/fi';
import { getSecurityEvents } from '../../../services/platformApi';

export default function PlatformSecurity() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [degradedInfo, setDegradedInfo] = useState(null);
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState('');
  const [severity, setSeverity] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getSecurityEvents('limit=100');
      if (result.degraded) {
        setDegradedInfo(result.message || 'Security events query is currently degraded.');
      } else {
        setDegradedInfo(null);
      }
      setEvents(result.events || []);
    } catch (err) {
      setError(err.message || 'Failed to load security events');
      setDegradedInfo(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const highCount = error ? null : events.filter(event => ['HIGH', 'CRITICAL'].includes(String(event.severity || '').toUpperCase())).length;
  const visible = events.filter(event => {
    const hay = `${event.action || ''} ${event.actorEmail || ''} ${event.actorUid || ''} ${event.tenantId || ''}`.toLowerCase();
    if (query && !hay.includes(query.trim().toLowerCase())) return false;
    if (severity && String(event.severity || '').toUpperCase() !== severity) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FiShield className="text-indigo-600" /> Security Events
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Live `security_audit_logs` stream. This is not a simulated SOC feed.
          </p>
        </div>
        <button type="button" onClick={load} disabled={loading} className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50">
          <FiRefreshCw className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200">
          <p className="text-xs font-bold uppercase text-slate-500">Inspected events</p>
          <p className="text-2xl font-extrabold mt-1">{error ? 'Unavailable' : events.length}</p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200">
          <p className="text-xs font-bold uppercase text-slate-500">High / critical</p>
          <p className={`text-2xl font-extrabold mt-1 ${highCount === null ? 'text-slate-500' : highCount ? 'text-red-600' : 'text-emerald-600'}`}>{highCount === null ? 'Unavailable' : highCount}</p>
        </div>
        <Link to="/adm/audit-logs" className="bg-white p-4 rounded-2xl border border-slate-200 hover:border-indigo-300">
          <p className="text-xs font-bold uppercase text-slate-500">Related</p>
          <p className="text-sm font-bold mt-2 text-indigo-700">Open admin audit trail →</p>
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        <input className="flex-1 min-w-[200px] rounded-xl border border-slate-200 px-3 py-2 text-xs" placeholder="Filter inspected events by action, actor, or tenant…" value={query} onChange={e => setQuery(e.target.value)} />
        <select className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold" value={severity} onChange={e => setSeverity(e.target.value)}>
          <option value="">All severities</option>
          <option value="HIGH">High / Critical</option>
          <option value="MEDIUM">Medium</option>
          <option value="INFO">Info</option>
        </select>
      </div>

      {/* Degraded State Banner */}
      {degradedInfo && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 flex items-start gap-3">
          <FiAlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-bold text-amber-950">Security Events Stream Notice</p>
            <p className="mt-0.5 text-amber-800">{degradedInfo}</p>
          </div>
          <button type="button" onClick={load} disabled={loading} className="px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold rounded-lg border border-amber-300 transition">
            Retry Query
          </button>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-800 flex items-center justify-between" role="alert">
          <span className="flex items-center gap-2"><FiAlertTriangle /> {error}</span>
          <button type="button" onClick={load} className="font-bold underline">Retry</button>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-sm text-slate-500">Loading security events…</div>
        ) : error ? (
          <div className="p-12 text-center text-sm text-amber-800">Security events are unavailable. No empty result is inferred from the failed source request.</div>
        ) : visible.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">No security audit records match this inspected sample.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[11px] uppercase font-extrabold text-slate-500">
                <tr>
                  <th className="py-3 px-4">Time</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Actor</th>
                  <th className="py-3 px-4">Tenant / target</th>
                  <th className="py-3 px-4">Severity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map(event => (
                  <tr key={event.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setSelected(event)}>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-500 whitespace-nowrap">{event.createdAt ? new Date(event.createdAt).toLocaleString() : '—'}</td>
                    <td className="py-3 px-4 font-mono font-bold text-slate-800">{event.action}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1 font-semibold"><FiUser className="text-slate-400" />{event.actorEmail || event.actorUid || 'system'}</div>
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-600">
                      {event.tenantId ? <Link className="text-indigo-700 font-bold" to={`/adm/tenants?focus=${encodeURIComponent(event.tenantId)}`} onClick={e => e.stopPropagation()}>{event.tenantId.slice(0, 8)}…</Link> : event.targetUid || '—'}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${['HIGH', 'CRITICAL'].includes(String(event.severity).toUpperCase()) ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-700'}`}>{event.severity || 'INFO'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60" onClick={() => setSelected(null)}>
          <div className="w-full max-w-lg bg-white rounded-2xl p-5" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-slate-900">{selected.action}</h3>
            <pre className="mt-3 text-[11px] bg-slate-900 text-slate-100 rounded-xl p-3 overflow-x-auto">{JSON.stringify(selected, null, 2)}</pre>
            <div className="mt-4 flex justify-end"><button type="button" onClick={() => setSelected(null)} className="px-3 py-1.5 rounded-xl bg-slate-200 text-xs font-bold">Close</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
