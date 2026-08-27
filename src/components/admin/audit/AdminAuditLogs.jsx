import React, { useState, useEffect, useCallback } from 'react';
import fire from '../../../conf/fire';
import { FiShield, FiFilter, FiRefreshCw, FiSearch, FiCheckCircle, FiAlertTriangle, FiXCircle, FiDownload, FiEye, FiClock, FiUser, FiActivity } from 'react-icons/fi';

export default function AdminAuditLogs() {
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedLog, setSelectedLog] = useState(null);
  const [searchWindow, setSearchWindow] = useState(null);

  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState('');
  const [degradedInfo, setDegradedInfo] = useState(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const user = fire.auth().currentUser;
      if (!user) throw new Error('Authentication required');
      const token = await user.getIdToken();

      const params = new URLSearchParams();
      params.set('limit', '100');
      if (categoryFilter) params.set('category', categoryFilter);
      if (severityFilter) params.set('severity', severityFilter);
      if (outcomeFilter) params.set('outcome', outcomeFilter);
      if (searchQuery.trim()) params.set('search', searchQuery.trim());

      const [logsRes, statsRes] = await Promise.all([
        fetch(`/api/admin/audit-logs?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch('/api/admin/audit-logs/stats', {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      if (!logsRes.ok) {
        const data = await logsRes.json().catch(() => ({}));
        const errMsg = data.error?.message || `HTTP ${logsRes.status}`;
        throw new Error(errMsg);
      }

      const logsData = await logsRes.json();
      const statsData = statsRes.ok ? await statsRes.json() : null;

      if (logsData.degraded) {
        setDegradedInfo(logsData.message || 'Audit log query is currently degraded.');
      } else {
        setDegradedInfo(null);
      }

      setLogs(logsData.logs || []);
      setSearchWindow(logsData.searchTruncated ? { size: logsData.searchWindow } : null);
      setStats(statsData);
    } catch (err) {
      console.error('[AdminAuditLogs] Error fetching logs:', err);
      setError(err.message || 'Failed to load audit logs');
      setDegradedInfo(null);
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, severityFilter, outcomeFilter, searchQuery]);

  useEffect(() => {
    const timer = window.setTimeout(() => fetchLogs(), searchQuery.trim() ? 350 : 0);
    return () => window.clearTimeout(timer);
  }, [fetchLogs, searchQuery]);

  const filteredLogs = logs.filter(log => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (log.action || '').toLowerCase().includes(q) ||
      (log.actorEmail || '').toLowerCase().includes(q) ||
      (log.pathname || '').toLowerCase().includes(q) ||
      (log.ipAddress || '').includes(q)
    );
  });

  const exportCsv = () => {
    if (!filteredLogs.length) return;
    const headers = ['Timestamp', 'Actor', 'Action', 'Category', 'Severity', 'Outcome', 'HTTP Method', 'Path', 'Status', 'IP'];
    const csvCell = value => {
      let text = String(value ?? '').replaceAll('"', '""');
      if (/^[=+\-@]/.test(text)) text = `'${text}`;
      return `"${text}"`;
    };
    const rows = filteredLogs.map(l => [
      l.createdAt || l.occurredAt || '',
      l.actorEmail || l.actorUid || '',
      l.action || '',
      l.category || '',
      l.severity || '',
      l.outcome || '',
      l.method || '',
      l.pathname || '',
      l.statusCode || '',
      l.ipAddress || '',
    ].map(csvCell));

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `admin_audit_logs_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getSeverityBadge = (severity) => {
    const s = String(severity || 'INFO').toUpperCase();
    if (s === 'CRITICAL' || s === 'HIGH') {
      return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-red-100 text-red-800 border border-red-200">HIGH</span>;
    }
    if (s === 'MEDIUM') {
      return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800 border border-amber-200">MED</span>;
    }
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-100 text-slate-700 border border-slate-200">INFO</span>;
  };

  const getOutcomeBadge = (outcome, status) => {
    const o = String(outcome || '').toUpperCase();
    if (o === 'SUCCESS' || (status >= 200 && status < 400)) {
      return <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700"><FiCheckCircle className="h-3 w-3" /> {status || 200}</span>;
    }
    if (o === 'DENIED' || status === 403) {
      return <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700"><FiAlertTriangle className="h-3 w-3" /> 403</span>;
    }
    return <span className="inline-flex items-center gap-1 text-xs font-bold text-red-700"><FiXCircle className="h-3 w-3" /> {status || 'ERR'}</span>;
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FiShield className="text-indigo-600" /> Admin Audit Logs
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Immutable security event trail and administrative operations records.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchLogs}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 transition shadow-2xs"
          >
            <FiRefreshCw className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button
            type="button"
            onClick={exportCsv}
            disabled={!filteredLogs.length}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition shadow-xs disabled:opacity-50"
          >
            <FiDownload /> Export CSV
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Sample Records</p>
              <p className="text-2xl font-extrabold text-slate-900 mt-1">{stats.sampleSize}</p>
            </div>
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
              <FiActivity className="h-5 w-5" />
            </div>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Success Rate</p>
              <p className="text-2xl font-extrabold text-emerald-600 mt-1">{stats.successRate == null ? 'Data unavailable' : `${stats.successRate}%`}</p>
            </div>
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
              <FiCheckCircle className="h-5 w-5" />
            </div>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">High Risk Events</p>
              <p className="text-2xl font-extrabold text-red-600 mt-1">{stats.highSeverityCount}</p>
            </div>
            <div className="p-3 bg-red-50 text-red-600 rounded-xl">
              <FiAlertTriangle className="h-5 w-5" />
            </div>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <FiSearch className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <input
            type="text"
            className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:border-indigo-500 transition"
            placeholder="Search by action, email, path, IP…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>

        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
          className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-700 font-semibold focus:outline-hidden"
        >
          <option value="">All Categories</option>
          <option value="ai.governance">AI Governance</option>
          <option value="billing.payments">Payments & Billing</option>
          <option value="iam.users">Users & IAM</option>
          <option value="platform.health">System Health</option>
          <option value="platform.security">Security</option>
          <option value="content.media">Content & Media</option>
          <option value="enterprise.tenancy">Tenancy</option>
        </select>

        <select
          value={severityFilter}
          onChange={e => setSeverityFilter(e.target.value)}
          className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-700 font-semibold focus:outline-hidden"
        >
          <option value="">All Severities</option>
          <option value="INFO">Info</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High / Critical</option>
        </select>

        <select
          value={outcomeFilter}
          onChange={e => setOutcomeFilter(e.target.value)}
          className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-700 font-semibold focus:outline-hidden"
        >
          <option value="">All Outcomes</option>
          <option value="SUCCESS">Success</option>
          <option value="FAILURE">Failure</option>
          <option value="DENIED">Denied</option>
        </select>
      </div>

      {searchWindow && <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">Search examined the newest {searchWindow.size} records. Older matching records may require a narrower server filter or an audited export.</div>}

      {/* Degraded Standby State Banner */}
      {degradedInfo && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 flex items-start gap-3">
          <FiAlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-bold text-amber-950">Standby Audit Store Quota Limited</p>
            <p className="mt-0.5 text-amber-800">{degradedInfo}</p>
            <p className="mt-1 text-[11px] text-amber-700">Primary business database (MariaDB) is 100% active. Historical audit queries will resume automatically once the daily standby quota window resets.</p>
          </div>
          <button type="button" onClick={fetchLogs} disabled={loading} className="px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold rounded-lg border border-amber-300 transition">
            Check Status
          </button>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FiAlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button type="button" onClick={fetchLogs} className="font-bold underline">Retry</button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-sm text-slate-500 font-medium">
            <FiRefreshCw className="animate-spin h-6 w-6 text-indigo-600 mx-auto mb-2" />
            Loading admin audit logs…
          </div>
        ) : error ? (
          <div className="p-12 text-center text-sm text-amber-800 font-medium">Audit log data is unavailable. No empty result is inferred from the failed request.</div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500 font-medium">
            No audit log records match the selected filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-extrabold uppercase text-slate-500 tracking-wider">
                <tr>
                  <th className="py-3 px-4">Time</th>
                  <th className="py-3 px-4">Actor</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Severity</th>
                  <th className="py-3 px-4">Outcome</th>
                  <th className="py-3 px-4 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                {filteredLogs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 whitespace-nowrap text-slate-500 font-mono text-[11px]">
                      {log.createdAt ? new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="font-bold text-slate-900 truncate max-w-[180px]" title={log.actorEmail || log.actorUid}>
                        {log.actorEmail || log.actorUid}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">{log.ipAddress || 'internal'}</div>
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-slate-800">
                      {log.action}
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-extrabold">
                        {log.category}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {getSeverityBadge(log.severity)}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {getOutcomeBadge(log.outcome, log.statusCode)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedLog(log)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition"
                        title="View payload"
                      >
                        <FiEye className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedLog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
          onClick={() => setSelectedLog(null)}
        >
          <div
            className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="font-bold text-slate-900 flex items-center gap-2">
                  <FiShield className="text-indigo-600" /> {selectedLog.action}
                </h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">{selectedLog.id}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200"
              >
                ✕
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div><span className="text-slate-400 font-bold uppercase text-[10px]">Actor:</span> <span className="font-semibold text-slate-800">{selectedLog.actorEmail || selectedLog.actorUid}</span></div>
                <div><span className="text-slate-400 font-bold uppercase text-[10px]">Role:</span> <span className="font-semibold text-slate-800">{selectedLog.actorRole || 'ADMIN'}</span></div>
                <div><span className="text-slate-400 font-bold uppercase text-[10px]">Method:</span> <span className="font-mono font-bold text-slate-800">{selectedLog.method}</span></div>
                <div><span className="text-slate-400 font-bold uppercase text-[10px]">Path:</span> <span className="font-mono text-slate-800">{selectedLog.pathname}</span></div>
                <div><span className="text-slate-400 font-bold uppercase text-[10px]">Duration:</span> <span className="font-semibold text-slate-800">{selectedLog.durationMs} ms</span></div>
                <div><span className="text-slate-400 font-bold uppercase text-[10px]">IP:</span> <span className="font-mono text-slate-800">{selectedLog.ipAddress || 'internal'}</span></div>
                <div><span className="text-slate-400 font-bold uppercase text-[10px]">Status:</span> <span className="font-semibold text-slate-800">{selectedLog.statusCode}</span></div>
                <div><span className="text-slate-400 font-bold uppercase text-[10px]">Time:</span> <span className="font-semibold text-slate-800">{selectedLog.createdAt ? new Date(selectedLog.createdAt).toLocaleString() : '—'}</span></div>
              </div>

              <div>
                <p className="font-bold text-slate-700 uppercase tracking-wider text-[10px] mb-1">Sanitized Metadata & Parameters</p>
                <pre className="p-3 bg-slate-900 text-slate-100 rounded-xl overflow-x-auto text-[11px] font-mono">
                  {JSON.stringify(selectedLog.metadata || {}, null, 2)}
                </pre>
              </div>
            </div>

            <div className="p-3 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="px-4 py-1.5 rounded-xl bg-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-300 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
