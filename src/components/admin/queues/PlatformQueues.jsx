import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FiActivity, FiAlertTriangle, FiCheckCircle, FiFilter, FiLoader,
  FiRefreshCw, FiRotateCw, FiSearch,
} from 'react-icons/fi';
import { fetchAdminWithReauth } from '../../../services/adminReauth';
import AdminDialog from '../shared/AdminDialog';

function messageFor(response, data, fallback) {
  const nested = data?.error && typeof data.error === 'object' ? data.error : null;
  return nested?.message || data?.error || data?.message || `${fallback}${response?.status ? ` (HTTP ${response.status})` : ''}`;
}

function jobTone(state) {
  if (state === 'DEAD_LETTER') return 'bg-rose-100 text-rose-800 border-rose-200';
  if (state === 'DELIVERY_ATTEMPTED') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  return 'bg-blue-100 text-blue-800 border-blue-200';
}

export default function PlatformQueues({ isSuperAdmin = false }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [stateFilter, setStateFilter] = useState('ALL');
  const [query, setQuery] = useState('');
  const [retryTarget, setRetryTarget] = useState(null);
  const [confirmation, setConfirmation] = useState('');
  const [replaying, setReplaying] = useState(false);

  const fetchQueues = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { response, data: result } = await fetchAdminWithReauth('/api/platform/queues', { cache: 'no-store' });
      if (!response.ok) throw new Error(messageFor(response, result, 'Queue telemetry is unavailable.'));
      setData(result);
    } catch (err) {
      setData(null);
      setError(err.message || 'Queue telemetry is unavailable.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchQueues(); }, [fetchQueues]);

  const summary = data?.summary || null;
  const jobs = useMemo(() => (data?.jobs || []).filter(job => {
    const matchesState = stateFilter === 'ALL' || job.state === stateFilter;
    const value = query.trim().toLowerCase();
    const matchesSearch = !value || [job.id, job.channel, job.templateType, job.recipient, job.state]
      .some(item => String(item || '').toLowerCase().includes(value));
    return matchesState && matchesSearch;
  }), [data?.jobs, query, stateFilter]);
  const queueHealth = !summary ? 'UNAVAILABLE' : summary.deadLetterCount > 0 ? 'ATTENTION' : 'HEALTHY';
  const confirmationPhrase = retryTarget?.all ? 'REPLAY ALL DEAD LETTERS' : retryTarget?.job ? `REPLAY ${retryTarget.job.id}` : '';

  const openRetry = target => {
    setConfirmation('');
    setRetryTarget(target);
  };

  const replay = async () => {
    if (!retryTarget || confirmation !== confirmationPhrase) return;
    setReplaying(true);
    setNotice(null);
    try {
      const body = retryTarget.all
        ? { all: true, confirmation }
        : { jobId: retryTarget.job.id, confirmation };
      const { response, data: result } = await fetchAdminWithReauth('/api/platform/queues/retry', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(messageFor(response, result, 'Queue replay failed.'));
      setRetryTarget(null);
      setConfirmation('');
      setNotice({ type: 'success', text: `Requeued ${result.retriedCount} dead-letter job${result.retriedCount === 1 ? '' : 's'} for delivery. The action is audited.` });
      await fetchQueues();
    } catch (err) {
      setNotice({ type: 'error', text: err.message || 'Queue replay failed.' });
    } finally {
      setReplaying(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-indigo-600">Operations</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-extrabold text-slate-900"><FiActivity className="text-indigo-600" aria-hidden="true" />Queue &amp; dead-letter monitor</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">Observed notification-outbox telemetry. Counts are only shown after a successful server query; unavailable telemetry is never presented as a healthy zero.</p>
        </div>
        <div className="flex flex-wrap gap-2"><button type="button" onClick={fetchQueues} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><FiRefreshCw className={loading ? 'animate-spin' : ''} aria-hidden="true" />Refresh</button>{isSuperAdmin && summary?.deadLetterCount > 0 && <button type="button" onClick={() => openRetry({ all: true })} className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-amber-700"><FiRotateCw aria-hidden="true" />Replay all DLQ ({summary.deadLetterCount})</button>}</div>
      </header>

      {!isSuperAdmin && <div role="status" className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">Queue telemetry is read-only for your current role. Replay controls require a SUPER_ADMIN server claim and recent authentication.</div>}
      {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"><span>{error}</span><button type="button" onClick={fetchQueues} className="font-bold underline">Retry telemetry</button></div>}
      {notice && <div role={notice.type === 'success' ? 'status' : 'alert'} aria-live="polite" className={`flex gap-2 rounded-2xl border p-4 text-sm ${notice.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-red-200 bg-red-50 text-red-900'}`}>{notice.type === 'success' ? <FiCheckCircle className="mt-0.5 shrink-0 text-emerald-600" aria-hidden="true" /> : <FiAlertTriangle className="mt-0.5 shrink-0 text-red-600" aria-hidden="true" />}<span>{notice.text}</span></div>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Queue health</p><p className={`mt-2 text-xl font-extrabold ${queueHealth === 'HEALTHY' ? 'text-emerald-700' : queueHealth === 'ATTENTION' ? 'text-amber-700' : 'text-slate-600'}`}>{loading ? 'CHECKING' : queueHealth}</p></section>
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Dead-letter jobs</p><p className={`mt-2 text-2xl font-extrabold ${summary?.deadLetterCount > 0 ? 'text-rose-700' : 'text-slate-900'}`}>{loading ? '—' : summary?.deadLetterCount ?? 'UNAVAILABLE'}</p></section>
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Pending / queued</p><p className="mt-2 text-2xl font-extrabold text-indigo-700">{loading ? '—' : summary?.pendingCount ?? 'UNAVAILABLE'}</p></section>
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Provider accepted</p><p className="mt-2 text-2xl font-extrabold text-slate-900">{loading ? '—' : summary?.successCount ?? 'UNAVAILABLE'}</p></section>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs"><div className="flex flex-col gap-3 lg:flex-row lg:items-center"><label className="relative min-w-0 flex-1"><span className="sr-only">Search queue jobs</span><FiSearch className="absolute left-3 top-3 text-slate-400" aria-hidden="true" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search event, channel, template, recipient, or state" className="w-full rounded-xl border border-slate-300 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:bg-white" /></label><label className="flex items-center gap-2 text-xs font-bold text-slate-600"><FiFilter aria-hidden="true" />State<select value={stateFilter} onChange={event => setStateFilter(event.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800"><option value="ALL">All states</option><option value="DEAD_LETTER">Dead letter</option><option value="NOTIFICATION_QUEUED">Queued</option><option value="DELIVERY_ATTEMPTED">Accepted</option></select></label></div></section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs" aria-label="Recent outbox events">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3"><div><h2 className="text-sm font-extrabold text-slate-900">Recent notification outbox events</h2><p className="mt-0.5 text-xs text-slate-500">Recipient identifiers are masked in the platform view.</p></div><span className="text-xs font-semibold text-slate-500">{loading ? 'Checking…' : `${jobs.length} shown`}</span></div>
        {loading ? <div className="flex min-h-56 items-center justify-center gap-2 text-sm text-slate-600" role="status"><FiLoader className="animate-spin text-indigo-600" aria-hidden="true" />Inspecting queue telemetry…</div> : !data ? <div className="p-10 text-center text-sm text-slate-600">Queue telemetry is unavailable. Use the retry action above after service recovery.</div> : jobs.length === 0 ? <div className="p-10 text-center text-sm text-slate-600">No outbox events match the selected filters.</div> : <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b border-slate-200 bg-slate-50/60 text-[11px] font-extrabold uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Event</th><th className="px-4 py-3">Channel</th><th className="px-4 py-3">Recipient</th><th className="px-4 py-3">Template</th><th className="px-4 py-3">State</th><th className="px-4 py-3">Attempts</th><th className="px-4 py-3 text-right">Action</th></tr></thead><tbody className="divide-y divide-slate-100">{jobs.map(job => <tr key={job.id} className="hover:bg-slate-50/70"><td className="px-4 py-3 font-mono text-xs text-slate-600" title={job.id}>{String(job.id).slice(0, 12)}…</td><td className="px-4 py-3 font-semibold uppercase text-xs text-slate-700">{job.channel}</td><td className="px-4 py-3 font-mono text-xs text-slate-700">{job.recipient}</td><td className="px-4 py-3 text-xs text-slate-700">{job.templateType}</td><td className="px-4 py-3"><span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-extrabold ${jobTone(job.state)}`}>{job.state}</span></td><td className="px-4 py-3 font-mono text-xs font-bold text-slate-700">{job.attemptCount} / 5</td><td className="px-4 py-3 text-right">{isSuperAdmin && job.state === 'DEAD_LETTER' ? <button type="button" onClick={() => openRetry({ job })} className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-100"><FiRotateCw aria-hidden="true" />Replay</button> : <span className="text-xs text-slate-400">—</span>}</td></tr>)}</tbody></table></div>}
      </section>

      <AdminDialog open={Boolean(retryTarget)} onClose={() => !replaying && setRetryTarget(null)} dismissible={!replaying} title={retryTarget?.all ? 'Replay all dead-letter jobs' : 'Replay dead-letter job'} description={retryTarget?.all ? 'This bounded operation requeues up to 20 terminal notification events. It does not guarantee provider delivery; normal worker retries and audit logging continue after requeueing.' : 'This requeues one terminal notification event. It does not guarantee provider delivery; normal worker retries and audit logging continue after requeueing.'} className="max-w-lg"><div className="space-y-4 p-5"><div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">{retryTarget?.all ? <p><strong>Impact:</strong> up to {summary?.deadLetterCount ?? 'the observed'} terminal events may be requeued.</p> : <p><strong>Event:</strong> <span className="font-mono text-xs">{retryTarget?.job.id}</span></p>}</div><label className="block text-sm font-bold text-slate-800">Type <span className="font-mono text-amber-800">{confirmationPhrase}</span> to confirm<input autoComplete="off" value={confirmation} onChange={event => setConfirmation(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-sm" /></label><div className="flex justify-end gap-3 border-t border-slate-100 pt-4"><button type="button" disabled={replaying} onClick={() => setRetryTarget(null)} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700">Cancel</button><button type="button" disabled={replaying || confirmation !== confirmationPhrase} onClick={replay} className="inline-flex items-center gap-2 rounded-xl bg-amber-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{replaying && <FiLoader className="animate-spin" />}{replaying ? 'Replaying…' : 'Confirm replay'}</button></div></div></AdminDialog>
    </div>
  );
}
