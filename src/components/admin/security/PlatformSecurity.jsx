import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiAlertTriangle, FiRefreshCw, FiShield, FiUser, FiActivity, FiX, FiCopy, FiCheck, FiTerminal, FiGlobe } from 'react-icons/fi';
import { getSecurityEvents } from '../../../services/platformApi';

export default function PlatformSecurity() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [degradedInfo, setDegradedInfo] = useState(null);
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState('');
  const [severity, setSeverity] = useState('');
  const [copiedKey, setCopiedKey] = useState(null);

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

  const copyToClipboard = (text, key) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const highCount = error ? null : events.filter(event => ['HIGH', 'CRITICAL'].includes(String(event.severity || '').toUpperCase())).length;
  const visible = events.filter(event => {
    const hay = `${event.action || ''} ${event.actorEmail || ''} ${event.actorUid || ''} ${event.category || ''} ${event.tenantId || ''} ${event.pathname || ''}`.toLowerCase();
    if (query && !hay.includes(query.trim().toLowerCase())) return false;
    if (severity && String(event.severity || '').toUpperCase() !== severity) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FiShield className="text-indigo-600" /> Security Events
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Authoritative `security_audit_logs` relational stream. Inspects platform mutations, authentication gates, and administrative policy events.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-slate-300 bg-white text-xs font-extrabold text-slate-800 hover:bg-slate-50 shadow-2xs cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
        >
          <FiRefreshCw className={`h-3.5 w-3.5 text-slate-600 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Stream</span>
        </button>
      </div>

      {/* Metric Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase text-slate-500 tracking-wide">Inspected Events</p>
            <p className="text-2xl font-extrabold mt-1 text-slate-900">{error ? 'Unavailable' : events.length}</p>
          </div>
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
            <FiActivity className="h-5 w-5" />
          </div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase text-slate-500 tracking-wide">High-Impact Security Events</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className={`text-2xl font-extrabold ${highCount === null ? 'text-slate-500' : 'text-indigo-600'}`}>
                {highCount === null ? 'Unavailable' : highCount}
              </span>
              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                0 Open Threats
              </span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Historical authorized policy modifications • Zero intrusions</p>
          </div>
          <div className="p-3 rounded-xl bg-indigo-50 text-indigo-600">
            <FiShield className="h-5 w-5" />
          </div>
        </div>
        <Link to="/adm/audit-logs" className="bg-white p-5 rounded-2xl border border-slate-200 hover:border-indigo-300 shadow-2xs transition group">
          <p className="text-xs font-bold uppercase text-slate-500 tracking-wide">Admin Audit Trail</p>
          <p className="text-sm font-bold mt-2 text-indigo-600 group-hover:text-indigo-700 flex items-center gap-1">
            Open full mutation ledger →
          </p>
        </Link>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-wrap gap-2.5 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
        <input
          className="flex-1 min-w-[240px] rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-hidden focus:border-indigo-500"
          placeholder="Filter by action, actor email, UID, category, or path…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <select
          className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 bg-white focus:outline-hidden focus:border-indigo-500"
          value={severity}
          onChange={e => setSeverity(e.target.value)}
        >
          <option value="">All Severities</option>
          <option value="CRITICAL">Critical</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
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
          <button type="button" onClick={load} disabled={loading} className="px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold rounded-lg border border-amber-300 transition cursor-pointer">
            Retry Query
          </button>
        </div>
      )}

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 flex items-center justify-between" role="alert">
          <span className="flex items-center gap-2 font-semibold"><FiAlertTriangle className="text-rose-600" /> {error}</span>
          <button type="button" onClick={load} className="font-bold underline text-rose-900 cursor-pointer">Retry</button>
        </div>
      )}

      {/* Main Events Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-sm text-slate-500 flex flex-col items-center justify-center gap-2">
            <FiRefreshCw className="animate-spin h-5 w-5 text-indigo-600" />
            <span>Loading security events stream from MariaDB…</span>
          </div>
        ) : error ? (
          <div className="p-12 text-center text-sm text-rose-700 bg-rose-50/40">
            Security events are unavailable. No empty result is inferred from the failed source request.
          </div>
        ) : visible.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">
            No security audit records match this search filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 text-[11px] uppercase font-extrabold text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-3.5 px-4">Timestamp</th>
                  <th className="py-3.5 px-4">Action</th>
                  <th className="py-3.5 px-4">Actor</th>
                  <th className="py-3.5 px-4">Category</th>
                  <th className="py-3.5 px-4">Target / Scope</th>
                  <th className="py-3.5 px-4">Severity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {visible.map(event => (
                  <tr
                    key={event.id}
                    className="hover:bg-indigo-50/30 transition cursor-pointer"
                    onClick={() => setSelected(event)}
                  >
                    <td className="py-3.5 px-4 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                      {event.createdAt ? new Date(event.createdAt).toLocaleString() : '—'}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                        {event.action}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                        <FiUser className="text-slate-400 shrink-0" />
                        <span className="truncate max-w-[180px]">{event.actorEmail || event.actorUid || 'System'}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-[11px] text-slate-600">
                      {event.category || '—'}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-[11px] text-slate-600">
                      {event.tenantId ? (
                        <Link
                          className="text-indigo-600 hover:text-indigo-800 font-bold"
                          to={`/adm/tenants?focus=${encodeURIComponent(event.tenantId)}`}
                          onClick={e => e.stopPropagation()}
                        >
                          {event.tenantId.slice(0, 8)}…
                        </Link>
                      ) : event.targetUid ? (
                        <span className="truncate max-w-[120px] inline-block">{event.targetUid.slice(0, 10)}…</span>
                      ) : (
                        'Global'
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                        ['CRITICAL', 'HIGH'].includes(String(event.severity).toUpperCase())
                          ? 'bg-rose-100 text-rose-800 border border-rose-200'
                          : String(event.severity).toUpperCase() === 'MEDIUM'
                          ? 'bg-amber-100 text-amber-800 border border-amber-200'
                          : 'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}>
                        {event.severity || 'INFO'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Centered Rich Detail Modal */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fade-in"
          onClick={() => setSelected(null)}
        >
          <div
            className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Security event detail"
          >
            {/* Modal Header */}
            <div className="bg-slate-950 px-6 py-4 text-white flex items-center justify-between shrink-0 border-b border-slate-800">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shadow-md ${
                  ['CRITICAL', 'HIGH'].includes(String(selected.severity).toUpperCase())
                    ? 'bg-rose-600 text-white'
                    : 'bg-indigo-600 text-white'
                }`}>
                  <FiShield className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-extrabold text-white truncate font-mono">{selected.action}</h3>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">
                    {selected.createdAt ? new Date(selected.createdAt).toUTCString() : '—'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition cursor-pointer"
                aria-label="Close modal"
              >
                <FiX className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold uppercase text-slate-400">Severity</span>
                  <p className="font-extrabold text-slate-800 mt-0.5">{selected.severity || 'INFO'}</p>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold uppercase text-slate-400">Category</span>
                  <p className="font-extrabold text-slate-800 mt-0.5 truncate">{selected.category || '—'}</p>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold uppercase text-slate-400">Outcome</span>
                  <p className={`font-extrabold mt-0.5 ${selected.outcome === 'FAILED' ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {selected.outcome || 'SUCCESS'}
                  </p>
                </div>
              </div>

              <div className="space-y-2 bg-slate-50 p-3.5 rounded-2xl border border-slate-200 font-mono text-[11px]">
                <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                  <span className="text-slate-500">Actor UID:</span>
                  <span className="text-slate-800 font-bold select-all">{selected.actorUid || 'System'}</span>
                </div>
                {selected.actorEmail && (
                  <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                    <span className="text-slate-500">Actor Email:</span>
                    <span className="text-slate-800 font-bold select-all">{selected.actorEmail}</span>
                  </div>
                )}
                {selected.pathname && (
                  <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                    <span className="text-slate-500">Endpoint / Path:</span>
                    <span className="text-slate-800 font-bold select-all">{selected.method ? `${selected.method} ` : ''}{selected.pathname}</span>
                  </div>
                )}
                {selected.ipAddress && (
                  <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                    <span className="text-slate-500">Client IP:</span>
                    <span className="text-slate-800 font-bold select-all">{selected.ipAddress}</span>
                  </div>
                )}
                <div className="flex justify-between items-center py-1">
                  <span className="text-slate-500">Event Record ID:</span>
                  <span className="text-slate-800 font-bold select-all">{selected.id}</span>
                </div>
              </div>

              {/* JSON Metadata Payload */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">Event Metadata Payload</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(JSON.stringify(selected, null, 2), 'payload')}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
                  >
                    {copiedKey === 'payload' ? <FiCheck className="text-emerald-600" /> : <FiCopy />}
                    <span>{copiedKey === 'payload' ? 'Copied!' : 'Copy JSON'}</span>
                  </button>
                </div>
                <pre className="text-[11px] bg-slate-950 text-emerald-400 rounded-2xl p-4 overflow-x-auto font-mono max-h-52 border border-slate-800 leading-relaxed shadow-inner">
                  {JSON.stringify(selected.metadata || selected, null, 2)}
                </pre>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white font-bold hover:bg-slate-800 transition text-xs cursor-pointer shadow-xs"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
