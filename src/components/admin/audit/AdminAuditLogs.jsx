import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchAdminWithReauth } from '../../../services/adminReauth';
import AdminDialog from '../shared/AdminDialog';
import {
  FiShield, FiRefreshCw, FiSearch, FiCheckCircle,
  FiAlertTriangle, FiXCircle, FiDownload, FiEye, FiActivity
} from 'react-icons/fi';

export default function AdminAuditLogs() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedLog, setSelectedLog] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Filter state is URL-backed so an investigation can be refreshed/shared.
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('q') || '');
  const [categoryFilter, setCategoryFilter] = useState(() => searchParams.get('category') || '');
  const [severityFilter, setSeverityFilter] = useState(() => searchParams.get('severity') || '');
  const [outcomeFilter, setOutcomeFilter] = useState(() => searchParams.get('outcome') || '');

  const fetchLogs = useCallback(async ({ append = false, startAfterDocId = '' } = {}) => {
    if (append) setLoadingMore(true); else setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('limit', '100');
      if (categoryFilter) params.set('category', categoryFilter);
      if (severityFilter) params.set('severity', severityFilter);
      if (outcomeFilter) params.set('outcome', outcomeFilter);
      if (startAfterDocId) params.set('startAfterDocId', startAfterDocId);
      const logsRequest = fetchAdminWithReauth(`/api/admin/audit-logs?${params.toString()}`, { cache: 'no-store' });
      const statsRequest = append ? null : fetchAdminWithReauth('/api/admin/audit-logs/stats', { cache: 'no-store' });
      const [{ response: logsRes, data: logsData }, statsResult] = await Promise.all([logsRequest, statsRequest]);
      if (!logsRes.ok) throw new Error(logsData.error?.message || logsData.error || `HTTP ${logsRes.status}`);
      const nextLogs = Array.isArray(logsData.logs) ? logsData.logs : [];
      setLogs(current => append ? [...current, ...nextLogs.filter(log => !current.some(existing => existing.id === log.id))] : nextLogs);
      setHasMore(logsData.hasMore === true);
      if (statsResult?.response?.ok) setStats(statsResult.data);
    } catch (err) {
      console.error('[AdminAuditLogs] Error fetching logs:', err);
      setError(err.message || 'Failed to load audit logs');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [categoryFilter, severityFilter, outcomeFilter]);

  useEffect(() => {
    setHasMore(false);
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    const next = new URLSearchParams();
    if (searchQuery) next.set('q', searchQuery);
    if (categoryFilter) next.set('category', categoryFilter);
    if (severityFilter) next.set('severity', severityFilter);
    if (outcomeFilter) next.set('outcome', outcomeFilter);
    setSearchParams(next, { replace: true });
  }, [categoryFilter, outcomeFilter, searchQuery, setSearchParams, severityFilter]);

  const loadMore = () => {
    const cursor = logs[logs.length - 1]?.id;
    if (cursor && !loadingMore) fetchLogs({ append: true, startAfterDocId: cursor });
  };

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
    const rows = filteredLogs.map(l => [
      `"${l.createdAt || l.occurredAt || ''}"`,
      `"${l.actorEmail || l.actorUid || ''}"`,
      `"${l.action || ''}"`,
      `"${l.category || ''}"`,
      `"${l.severity || ''}"`,
      `"${l.outcome || ''}"`,
      `"${l.method || ''}"`,
      `"${l.pathname || ''}"`,
      `"${l.statusCode || ''}"`,
      `"${l.ipAddress || ''}"`,
    ]);

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
              <p className="text-2xl font-extrabold text-emerald-600 mt-1">{stats.successRate === null || stats.successRate === undefined ? '—' : `${stats.successRate}%`}</p>
              {(stats.successRate === null || stats.successRate === undefined) && <p className="mt-1 text-[10px] font-medium text-slate-500">No observed sample</p>}
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
        {!loading && logs.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50 px-4 py-3 text-xs text-slate-600">
            <span>{logs.length} loaded record{logs.length === 1 ? '' : 's'}{hasMore ? '; more records are available.' : '; end of available result set.'}</span>
            {hasMore && <button type="button" onClick={loadMore} disabled={loadingMore} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50">{loadingMore && <FiRefreshCw className="animate-spin" />} {loadingMore ? 'Loading…' : 'Load more'}</button>}
          </div>
        )}
      </div>

      {/* Detail modal: shared primitive retains focus and restores it on close. */}
      <AdminDialog open={Boolean(selectedLog)} onClose={() => setSelectedLog(null)} title={selectedLog ? `${selectedLog.action} audit detail` : ''} description={selectedLog ? `Audit record ${selectedLog.id}` : ''} className="max-w-2xl">
        {selectedLog && <div className="space-y-4 p-5 text-xs">
          <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2">
            <div><span className="font-bold uppercase text-[10px] text-slate-400">Actor:</span> <span className="font-semibold text-slate-800">{selectedLog.actorEmail || selectedLog.actorUid}</span></div>
            <div><span className="font-bold uppercase text-[10px] text-slate-400">Role:</span> <span className="font-semibold text-slate-800">{selectedLog.actorRole || 'ADMIN'}</span></div>
            <div><span className="font-bold uppercase text-[10px] text-slate-400">Method:</span> <span className="font-mono font-bold text-slate-800">{selectedLog.method}</span></div>
            <div><span className="font-bold uppercase text-[10px] text-slate-400">Path:</span> <span className="break-all font-mono text-slate-800">{selectedLog.pathname}</span></div>
            <div><span className="font-bold uppercase text-[10px] text-slate-400">Duration:</span> <span className="font-semibold text-slate-800">{selectedLog.durationMs} ms</span></div>
            <div><span className="font-bold uppercase text-[10px] text-slate-400">IP:</span> <span className="font-mono text-slate-800">{selectedLog.ipAddress || 'internal'}</span></div>
            <div><span className="font-bold uppercase text-[10px] text-slate-400">Status:</span> <span className="font-semibold text-slate-800">{selectedLog.statusCode}</span></div>
            <div><span className="font-bold uppercase text-[10px] text-slate-400">Time:</span> <span className="font-semibold text-slate-800">{selectedLog.createdAt ? new Date(selectedLog.createdAt).toLocaleString() : '—'}</span></div>
          </div>
          <div><p className="mb-1 font-bold uppercase tracking-wider text-[10px] text-slate-700">Sanitized metadata & parameters</p><pre className="max-h-72 overflow-auto rounded-xl bg-slate-900 p-3 font-mono text-[11px] text-slate-100">{JSON.stringify(selectedLog.metadata || {}, null, 2)}</pre></div>
          <div className="flex justify-end border-t border-slate-100 pt-4"><button type="button" onClick={() => setSelectedLog(null)} className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-200">Close</button></div>
        </div>}
      </AdminDialog>
    </div>
  );
}
