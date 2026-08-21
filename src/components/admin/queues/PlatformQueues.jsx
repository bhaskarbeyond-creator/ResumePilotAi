import React, { useState, useEffect, useCallback } from 'react';
import fire from '../../../conf/fire';
import {
  FiActivity, FiRefreshCw, FiAlertTriangle, FiCheckCircle,
  FiRotateCw, FiClock, FiMail, FiLayers, FiAlertCircle
} from 'react-icons/fi';

export default function PlatformQueues() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState(null);
  const [notification, setNotification] = useState(null);

  const fetchQueues = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const user = fire.auth().currentUser;
      if (!user) throw new Error('Authentication required');
      const token = await user.getIdToken();

      const res = await fetch('/api/platform/queues', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error?.message || `HTTP ${res.status}`);
      }

      const result = await res.json();
      setData(result);
    } catch (err) {
      console.error('[PlatformQueues] Error:', err);
      setError(err.message || 'Failed to load queue telemetry');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQueues();
  }, [fetchQueues]);

  const handleRetry = async (jobId = null, all = false) => {
    setRetrying(true);
    setNotification(null);
    try {
      const user = fire.auth().currentUser;
      if (!user) throw new Error('Authentication required');
      const token = await user.getIdToken();

      const res = await fetch('/api/platform/queues/retry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ jobId, all })
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error?.message || 'Retry operation failed');
      }

      setNotification(`Successfully requeued ${result.retriedCount || 1} job(s) for delivery.`);
      fetchQueues();
    } catch (err) {
      alert(err.message || 'Failed to retry jobs');
    } finally {
      setRetrying(false);
    }
  };

  const summary = data?.summary || { totalInspected: 0, deadLetterCount: 0, pendingCount: 0, successCount: 0 };
  const jobs = data?.jobs || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FiActivity className="text-indigo-600" /> Platform Queue & DLQ Monitor
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Real-time async worker telemetry, transactional outbox status, and dead-letter queue (DLQ) controls.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchQueues}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 transition shadow-2xs"
          >
            <FiRefreshCw className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          {summary.deadLetterCount > 0 && (
            <button
              type="button"
              onClick={() => handleRetry(null, true)}
              disabled={retrying}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 transition shadow-xs disabled:opacity-50"
            >
              <FiRotateCw className={retrying ? 'animate-spin' : ''} /> Replay All Dead Letters ({summary.deadLetterCount})
            </button>
          )}
        </div>
      </div>

      {notification && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-800 flex items-center gap-2">
          <FiCheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
          <span>{notification}</span>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FiAlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button type="button" onClick={fetchQueues} className="font-bold underline">Retry</button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Queue Health</p>
          <div className="flex items-center justify-between mt-2">
            <p className={`text-xl font-extrabold ${summary.deadLetterCount === 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
              {summary.deadLetterCount === 0 ? 'HEALTHY' : 'ATTENTION'}
            </p>
            {summary.deadLetterCount === 0 ? <FiCheckCircle className="text-emerald-500 h-6 w-6" /> : <FiAlertTriangle className="text-amber-500 h-6 w-6" />}
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Dead-Letter Queue (DLQ)</p>
          <div className="flex items-center justify-between mt-2">
            <p className={`text-xl font-extrabold ${summary.deadLetterCount > 0 ? 'text-red-600' : 'text-slate-900'}`}>
              {summary.deadLetterCount}
            </p>
            <FiAlertCircle className="text-slate-400 h-6 w-6" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Pending / Queued</p>
          <div className="flex items-center justify-between mt-2">
            <p className="text-xl font-extrabold text-indigo-600">{summary.pendingCount}</p>
            <FiClock className="text-indigo-400 h-6 w-6" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Delivered / Accepted</p>
          <div className="flex items-center justify-between mt-2">
            <p className="text-xl font-extrabold text-slate-900">{summary.successCount}</p>
            <FiMail className="text-slate-400 h-6 w-6" />
          </div>
        </div>
      </div>

      {/* Queue Jobs Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <h3 className="font-bold text-xs uppercase tracking-wider text-slate-700">Recent Outbox Events</h3>
          <span className="text-xs text-slate-500 font-medium">{jobs.length} jobs inspected</span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-sm text-slate-500">
            <FiRefreshCw className="animate-spin h-6 w-6 text-indigo-600 mx-auto mb-2" />
            Inspecting outbox queue…
          </div>
        ) : jobs.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">
            No active or historical outbox events recorded.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50/50 border-b border-slate-200 text-[11px] font-extrabold uppercase text-slate-500 tracking-wider">
                <tr>
                  <th className="py-3 px-4">Event ID</th>
                  <th className="py-3 px-4">Channel</th>
                  <th className="py-3 px-4">Recipient</th>
                  <th className="py-3 px-4">Template</th>
                  <th className="py-3 px-4">State</th>
                  <th className="py-3 px-4">Attempts</th>
                  <th className="py-3 px-4">Time</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
                {jobs.map(job => (
                  <tr key={job.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-500" title={job.id}>
                      {job.id.slice(0, 10)}…
                    </td>
                    <td className="py-3 px-4 uppercase font-bold text-[10px] text-slate-600">
                      {job.channel}
                    </td>
                    <td className="py-3 px-4 font-mono font-medium text-slate-900">
                      {job.recipient}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-700">
                      {job.templateType}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                        job.state === 'DEAD_LETTER' ? 'bg-red-100 text-red-800' :
                        job.state === 'DELIVERY_ATTEMPTED' ? 'bg-emerald-100 text-emerald-800' :
                        'bg-blue-100 text-blue-800'
                      }`}>
                        {job.state}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono font-bold">
                      {job.attemptCount} / 5
                    </td>
                    <td className="py-3 px-4 text-slate-400 text-[11px] whitespace-nowrap">
                      {job.createdAt ? new Date(job.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      {job.state === 'DEAD_LETTER' ? (
                        <button
                          type="button"
                          onClick={() => handleRetry(job.id, false)}
                          disabled={retrying}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 font-bold hover:bg-amber-100 text-[11px] transition"
                        >
                          <FiRotateCw /> Retry
                        </button>
                      ) : (
                        <span className="text-slate-400 text-[11px]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
