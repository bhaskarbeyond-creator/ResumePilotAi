import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { get, post } from '@/lib/api-client';
import {
  Layers,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Play,
  RotateCcw,
  Zap,
  Mail,
  FileText,
  Clock,
  Eye,
  Trash2,
  Copy,
  Check,
  X,
  AlertTriangle,
  Terminal,
  ShieldAlert,
} from 'lucide-react';

interface QueueStatus {
  name: string;
  description: string;
  active: number;
  waiting: number;
  completed: number;
  failed: number;
  status: 'IDLE' | 'PROCESSING' | 'ALERT';
}

interface QueueJob {
  id: string;
  queue: string;
  channel: string;
  recipient: string;
  templateType: string;
  state: 'DEAD_LETTER' | 'DELIVERY_ATTEMPTED' | 'QUEUED' | 'PROCESSING';
  attemptCount: number;
  maxAttempts: number;
  createdAt: string;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  payload?: Record<string, unknown>;
}

const DEFAULT_QUEUES: QueueStatus[] = [
  { name: 'email-outbox', description: 'Outbound transactional SMTP mail queue', active: 0, waiting: 0, completed: 1845, failed: 0, status: 'IDLE' },
  { name: 'ai-synthesis', description: 'Asynchronous LLM executive summary & interview worker', active: 2, waiting: 1, completed: 4290, failed: 0, status: 'PROCESSING' },
  { name: 'pdf-renderer', description: 'DOCX-to-PDF high fidelity headless Chromium rendering pool', active: 0, waiting: 0, completed: 890, failed: 0, status: 'IDLE' },
  { name: 'dead-letter-queue', description: 'Dead-Letter Queue (DLQ) for unrecoverable third-party failures', active: 0, waiting: 0, completed: 12, failed: 1, status: 'ALERT' },
];

const INITIAL_JOBS: QueueJob[] = [
  {
    id: 'job_dlq_99182',
    queue: 'dead-letter-queue',
    channel: 'SMTP / SES',
    recipient: 'candidate.lead.991@example.com',
    templateType: 'INTERVIEW_INVITATION_CONFIRMATION',
    state: 'DEAD_LETTER',
    attemptCount: 5,
    maxAttempts: 5,
    createdAt: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
    error: {
      name: 'SES_RATE_LIMIT_EXCEEDED',
      message: 'Maximum send rate 14 msgs/sec exceeded for transactional outbound tier.',
      stack: `SES_RATE_LIMIT_EXCEEDED: Maximum send rate exceeded\n  at SESClient.sendTransactional (/backend/services/mailTransport.js:142:19)\n  at Worker.processJob (/backend/services/queues/emailWorker.js:88:24)\n  at JobPool.drain (/backend/services/queues/pool.js:204:11)`,
    },
    payload: {
      candidateId: 'cand_882910',
      jobListingId: 'job_senior_fullstack_2026',
      interviewDate: '2026-10-22T14:00:00.000Z',
      organizerEmail: 'talent-acquisitions@ime365.ai',
      urgency: 'HIGH',
    },
  },
  {
    id: 'job_ai_100293',
    queue: 'ai-synthesis',
    channel: 'NVIDIA NIM Worker',
    recipient: 'user_cand_9941',
    templateType: 'EXECUTIVE_BIO_SYNTHESIS',
    state: 'PROCESSING',
    attemptCount: 1,
    maxAttempts: 3,
    createdAt: new Date(Date.now() - 1000 * 45).toISOString(),
    payload: {
      model: 'meta/llama-3.2-11b-vision-instruct',
      targetLength: '3_PARAGRAPHS',
      industry: 'Artificial Intelligence',
    },
  },
  {
    id: 'job_pdf_771822',
    queue: 'pdf-renderer',
    channel: 'Chromium Headless',
    recipient: 'user_cand_1044',
    templateType: 'DOCX_HIGH_FIDELITY_EXPORT',
    state: 'DELIVERY_ATTEMPTED',
    attemptCount: 1,
    maxAttempts: 3,
    createdAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    payload: {
      template: 'cuba-executive-sapphire',
      pageSize: 'A4',
      atsOptimized: true,
    },
  },
];

export function AdminQueuesTab() {
  const [queues, setQueues] = useState<QueueStatus[]>(DEFAULT_QUEUES);
  const [jobs, setJobs] = useState<QueueJob[]>(INITIAL_JOBS);
  const [selectedJob, setSelectedJob] = useState<QueueJob | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    id: 'replay-all' | 'purge-dlq';
    title: string;
    message: string;
    confirmText: string;
    danger?: boolean;
    action: () => Promise<void>;
  } | null>(null);

  const [retrying, setRetrying] = useState<string | null>(null);
  const [retryFeedback, setRetryFeedback] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadQueueStatus = async () => {
    try {
      type QueueResponse = {
        queues?: QueueStatus[];
        jobs?: QueueJob[];
        summary?: { deadLetterCount?: number; pendingCount?: number; successCount?: number };
      };
      const res = await get<QueueResponse>('/platform/queues').catch(() => get<QueueResponse>('/admin/queues'));

      if (res?.jobs && Array.isArray(res.jobs)) {
        setJobs(res.jobs);
        if (res.summary) {
          setQueues((prev) =>
            prev.map((q) => {
              if (q.name === 'dead-letter-queue') {
                return { ...q, failed: res.summary?.deadLetterCount ?? q.failed };
              }
              if (q.name === 'email-outbox') {
                return { ...q, waiting: res.summary?.pendingCount ?? q.waiting, completed: res.summary?.successCount ?? q.completed };
              }
              return q;
            })
          );
        }
      } else if (res?.queues && Array.isArray(res.queues)) {
        setQueues(res.queues);
      }
    } catch {
      // Keep baseline
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQueueStatus();
  }, []);

  const handleRetryQueue = async (queueName: string) => {
    setRetrying(queueName);
    setRetryFeedback(null);
    try {
      await post('/platform/queues/retry', { queue: queueName }).catch(() => post(`/admin/queues/${queueName}/retry`, {}));
      setRetryFeedback(`Queued jobs in ${queueName} successfully re-dispatched.`);
      setTimeout(() => setRetryFeedback(null), 3000);
      loadQueueStatus();
    } finally {
      setRetrying(null);
    }
  };

  const handleRetrySingleJob = async (jobId: string) => {
    setRetrying(jobId);
    try {
      await post('/platform/queues/retry', { jobId, queue: 'notification' }).catch(() =>
        post('/admin/queues/dead-letter-queue/retry', { jobId })
      );
      setJobs((prev) =>
        prev.map((j) => (j.id === jobId ? { ...j, state: 'QUEUED', attemptCount: 0 } : j))
      );
      if (selectedJob?.id === jobId) {
        setSelectedJob((prev) => (prev ? { ...prev, state: 'QUEUED', attemptCount: 0 } : null));
      }
      setRetryFeedback(`Job ${jobId} successfully re-dispatched for immediate delivery.`);
      setTimeout(() => setRetryFeedback(null), 3000);
    } finally {
      setRetrying(null);
    }
  };

  const handlePurgeJob = async (jobId: string) => {
    setRetrying(jobId);
    try {
      await post('/admin/queues/dead-letter-queue/purge', { jobId }).catch(() => {});
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
      if (selectedJob?.id === jobId) {
        setSelectedJob(null);
      }
      setRetryFeedback(`Job ${jobId} purged from outbox records.`);
      setTimeout(() => setRetryFeedback(null), 3000);
    } finally {
      setRetrying(null);
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Keyboard navigation: Escape key closes active modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (confirmModal) setConfirmModal(null);
        else if (selectedJob) setSelectedJob(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [confirmModal, selectedJob]);

  const deadLetterCount = queues.find((q) => q.name === 'dead-letter-queue')?.failed || 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-ink flex items-center gap-2">
            <Layers className="size-5 text-brand-600" />
            Background Queues & Dead-Letter Queue (DLQ)
          </h2>
          <p className="text-xs text-ink-muted">
            Inspect operational background workers, worker concurrency, and manually re-dispatch failed tasks from DLQ.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {deadLetterCount > 0 && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setConfirmModal({
                    id: 'replay-all',
                    title: 'Replay All Dead-Letter Jobs',
                    message: `Are you sure you want to replay all ${deadLetterCount} dead-letter jobs? This will queue them for immediate delivery attempt across worker pools.`,
                    confirmText: 'Replay All Jobs',
                    danger: false,
                    action: async () => {
                      await post('/admin/queues/dead-letter-queue/retry', { all: true }).catch(() => {});
                      setRetryFeedback(`Re-dispatched all dead-letter jobs.`);
                      loadQueueStatus();
                    },
                  })
                }
                className="border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
              >
                <RotateCcw className="size-3.5 mr-1 text-amber-700" />
                Replay All DLQ ({deadLetterCount})
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setConfirmModal({
                    id: 'purge-dlq',
                    title: 'Purge Dead-Letter Queue',
                    message:
                      'Are you sure you want to permanently purge all dead-letter jobs from the transactional outbox? This operation is irreversible.',
                    confirmText: 'Purge DLQ',
                    danger: true,
                    action: async () => {
                      await post('/admin/queues/dead-letter-queue/purge', { all: true }).catch(() => {});
                      setJobs((prev) => prev.filter((j) => j.state !== 'DEAD_LETTER'));
                      setRetryFeedback('Dead-letter queue purged successfully.');
                      loadQueueStatus();
                    },
                  })
                }
                className="border-rose-300 bg-rose-50 text-rose-900 hover:bg-rose-100"
              >
                <Trash2 className="size-3.5 mr-1 text-rose-600" />
                Purge DLQ
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" onClick={loadQueueStatus} loading={loading}>
            <RefreshCw className="size-3.5 mr-1" />
            Refresh Queues
          </Button>
        </div>
      </div>

      {retryFeedback && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 flex items-center gap-2 animate-[fade-in_150ms_ease-out]">
          <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
          <span>{retryFeedback}</span>
        </div>
      )}

      {/* Queue Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {queues.map((q) => (
          <Card key={q.name} className="border border-border/80">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-bold font-mono text-ink">{q.name}</CardTitle>
                  <p className="text-[11px] text-ink-muted mt-0.5">{q.description}</p>
                </div>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider',
                    q.failed > 0
                      ? 'bg-rose-100 text-rose-800 border border-rose-300'
                      : q.status === 'PROCESSING'
                      ? 'bg-brand-100 text-brand-800 border border-brand-300'
                      : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  )}
                >
                  {q.failed > 0 ? `${q.failed} FAILED` : q.status}
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-2 text-center border-y border-border/50 py-3 my-2 text-xs">
                <div>
                  <span className="text-[10px] text-ink-muted block">Active</span>
                  <span className="font-bold text-ink text-sm">{q.active}</span>
                </div>
                <div>
                  <span className="text-[10px] text-ink-muted block">Waiting</span>
                  <span className="font-bold text-ink text-sm">{q.waiting}</span>
                </div>
                <div>
                  <span className="text-[10px] text-ink-muted block">Completed</span>
                  <span className="font-bold text-emerald-600 text-sm">{q.completed}</span>
                </div>
                <div>
                  <span className="text-[10px] text-ink-muted block">Failed</span>
                  <span className={cn('font-bold text-sm', q.failed > 0 ? 'text-rose-600' : 'text-ink-muted')}>
                    {q.failed}
                  </span>
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => handleRetryQueue(q.name)}
                  loading={retrying === q.name}
                >
                  <RotateCcw className="size-3 mr-1" />
                  Re-Dispatch / Drain
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Outbox & Worker Events Ledger */}
      <Card className="border border-border/80">
        <CardHeader className="pb-3 border-b border-border/50">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-bold text-ink flex items-center gap-2">
                <Terminal className="size-4 text-brand-600" />
                Recent Outbox & Worker Events
              </CardTitle>
              <CardDescription className="text-xs text-ink-muted">
                Inspect raw payloads, failure stack traces, and trigger surgical retries.
              </CardDescription>
            </div>
            <span className="text-xs text-ink-muted font-mono">{jobs.length} jobs inspected</span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-neutral-50/60 border-b border-border text-[11px] font-bold text-ink-muted uppercase tracking-wider">
                <tr>
                  <th className="py-2.5 px-4">Event ID</th>
                  <th className="py-2.5 px-4">Queue / Channel</th>
                  <th className="py-2.5 px-4">Recipient</th>
                  <th className="py-2.5 px-4">Template / Action</th>
                  <th className="py-2.5 px-4">State</th>
                  <th className="py-2.5 px-4">Attempts</th>
                  <th className="py-2.5 px-4">Time</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {jobs.map((job) => (
                  <tr key={job.id} className="hover:bg-neutral-50/50 transition-colors">
                    <td className="py-2.5 px-4 font-mono text-[11px] text-ink-muted">
                      {job.id}
                    </td>
                    <td className="py-2.5 px-4 font-semibold text-ink">
                      <span className="text-[10px] font-mono text-ink-muted block uppercase">{job.queue}</span>
                      <span>{job.channel}</span>
                    </td>
                    <td className="py-2.5 px-4 font-mono text-ink">
                      {job.recipient}
                    </td>
                    <td className="py-2.5 px-4 font-medium text-ink-secondary">
                      {job.templateType}
                    </td>
                    <td className="py-2.5 px-4">
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase',
                          job.state === 'DEAD_LETTER' && 'bg-rose-100 text-rose-800 border border-rose-300',
                          job.state === 'PROCESSING' && 'bg-brand-100 text-brand-800 border border-brand-300',
                          job.state === 'DELIVERY_ATTEMPTED' && 'bg-emerald-100 text-emerald-800 border border-emerald-300',
                          job.state === 'QUEUED' && 'bg-amber-100 text-amber-800 border border-amber-300'
                        )}
                      >
                        {job.state}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 font-mono font-bold">
                      {job.attemptCount} / {job.maxAttempts}
                    </td>
                    <td className="py-2.5 px-4 text-ink-muted text-[11px] whitespace-nowrap">
                      {new Date(job.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => setSelectedJob(job)}
                          className="h-7 px-2 text-xs font-semibold text-brand-600 hover:text-brand-700"
                        >
                          <Eye className="size-3.5 mr-1" />
                          Inspect
                        </Button>
                        {job.state === 'DEAD_LETTER' && (
                          <Button
                            variant="outline"
                            size="xs"
                            onClick={() => handleRetrySingleJob(job.id)}
                            loading={retrying === job.id}
                            className="h-7 px-2 text-xs border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
                          >
                            <RotateCcw className="size-3 mr-1" />
                            Retry
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ─── Centered Job Telemetry & Stack Trace Inspector Modal ─── */}
      {selectedJob && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/70 backdrop-blur-xs animate-[fade-in_150ms_ease-out]"
          onClick={() => setSelectedJob(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="job-inspector-title"
        >
          <div
            className="w-full max-w-2xl bg-surface rounded-2xl shadow-2xl border border-border overflow-hidden flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-neutral-950 px-6 py-4 text-white flex items-center justify-between shrink-0 border-b border-neutral-800">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={cn(
                    'size-10 rounded-xl flex items-center justify-center font-bold text-sm shadow-md shrink-0',
                    selectedJob.state === 'DEAD_LETTER' ? 'bg-rose-600 text-white' : 'bg-brand-600 text-white'
                  )}
                >
                  <Layers className="size-5" />
                </div>
                <div className="min-w-0">
                  <h3 id="job-inspector-title" className="text-base font-extrabold text-white truncate font-mono">
                    {selectedJob.id}
                  </h3>
                  <p className="text-xs text-neutral-400 font-mono mt-0.5">
                    Queue: {selectedJob.queue} · Channel: {selectedJob.channel}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedJob(null)}
                className="p-2 text-neutral-400 hover:text-white rounded-xl hover:bg-neutral-800 transition cursor-pointer"
                aria-label="Close inspector"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-neutral-50 p-3 rounded-xl border border-border">
                  <span className="text-[10px] font-bold uppercase text-ink-muted">State</span>
                  <p className="font-extrabold text-ink mt-0.5">{selectedJob.state}</p>
                </div>
                <div className="bg-neutral-50 p-3 rounded-xl border border-border">
                  <span className="text-[10px] font-bold uppercase text-ink-muted">Attempts</span>
                  <p className="font-extrabold text-ink mt-0.5">
                    {selectedJob.attemptCount} / {selectedJob.maxAttempts}
                  </p>
                </div>
                <div className="bg-neutral-50 p-3 rounded-xl border border-border">
                  <span className="text-[10px] font-bold uppercase text-ink-muted">Template</span>
                  <p className="font-extrabold text-ink mt-0.5 truncate">{selectedJob.templateType}</p>
                </div>
                <div className="bg-neutral-50 p-3 rounded-xl border border-border">
                  <span className="text-[10px] font-bold uppercase text-ink-muted">Created</span>
                  <p className="font-extrabold text-ink mt-0.5">
                    {new Date(selectedJob.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>

              {/* Error Stack Trace if Present */}
              {selectedJob.error && (
                <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-rose-800 uppercase tracking-wide flex items-center gap-1.5">
                      <AlertTriangle className="size-3.5 text-rose-600" />
                      Failure Stack Trace & Root Cause
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        copyToClipboard(
                          `${selectedJob.error?.name}: ${selectedJob.error?.message}\n${selectedJob.error?.stack || ''}`,
                          'stack'
                        )
                      }
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 hover:text-rose-900 cursor-pointer"
                    >
                      {copiedKey === 'stack' ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3" />}
                      <span>{copiedKey === 'stack' ? 'Copied Stack!' : 'Copy Stack'}</span>
                    </button>
                  </div>
                  <p className="text-xs font-semibold text-rose-950 font-mono">
                    {selectedJob.error.name}: {selectedJob.error.message}
                  </p>
                  {selectedJob.error.stack && (
                    <pre className="text-[10px] bg-neutral-950 text-rose-300 rounded-lg p-3 overflow-x-auto font-mono max-h-40 leading-relaxed border border-neutral-800">
                      {selectedJob.error.stack}
                    </pre>
                  )}
                </div>
              )}

              {/* Payload JSON */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-ink uppercase tracking-wide">
                    Transactional Job Payload
                  </span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(JSON.stringify(selectedJob.payload || {}, null, 2), 'payload')}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-600 hover:text-brand-800 cursor-pointer"
                  >
                    {copiedKey === 'payload' ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3" />}
                    <span>{copiedKey === 'payload' ? 'Copied JSON!' : 'Copy JSON'}</span>
                  </button>
                </div>
                <pre className="text-[11px] bg-neutral-950 text-emerald-400 rounded-xl p-4 overflow-x-auto font-mono max-h-52 border border-neutral-800 leading-relaxed shadow-inner">
                  {JSON.stringify(selectedJob.payload || {}, null, 2)}
                </pre>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 bg-neutral-50 border-t border-border flex items-center justify-between">
              <div>
                {selectedJob.state === 'DEAD_LETTER' && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handlePurgeJob(selectedJob.id)}
                    loading={retrying === selectedJob.id}
                    className="text-xs"
                  >
                    <Trash2 className="size-3 mr-1" />
                    Purge from DLQ
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setSelectedJob(null)} className="text-xs">
                  Close Inspector
                </Button>
                {selectedJob.state === 'DEAD_LETTER' && (
                  <Button
                    size="sm"
                    onClick={() => handleRetrySingleJob(selectedJob.id)}
                    loading={retrying === selectedJob.id}
                    className="text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white"
                  >
                    <RotateCcw className="size-3 mr-1" />
                    Re-Dispatch Job
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Confirmation Modal ─── */}
      {confirmModal && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-neutral-950/70 backdrop-blur-xs animate-[fade-in_150ms_ease-out]"
          onClick={() => setConfirmModal(null)}
          role="alertdialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-sm bg-surface rounded-2xl shadow-2xl border border-border overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className={cn(
                'p-4 border-b flex items-center gap-3',
                confirmModal.danger ? 'bg-rose-50 border-rose-100 text-rose-900' : 'bg-amber-50 border-amber-100 text-amber-900'
              )}
            >
              {confirmModal.danger ? (
                <AlertTriangle className="size-5 text-rose-600" />
              ) : (
                <RotateCcw className="size-5 text-amber-600" />
              )}
              <h3 className="font-bold text-sm">{confirmModal.title}</h3>
            </div>
            <div className="p-5 text-xs text-ink-muted leading-relaxed">
              {confirmModal.message}
            </div>
            <div className="p-4 pt-2 flex justify-end gap-2 bg-neutral-50/50 border-t border-border">
              <Button variant="outline" size="sm" onClick={() => setConfirmModal(null)} className="text-xs">
                Cancel
              </Button>
              <Button
                variant={confirmModal.danger ? 'destructive' : 'primary'}
                size="sm"
                onClick={async () => {
                  const act = confirmModal.action;
                  setConfirmModal(null);
                  await act();
                }}
                className={cn('text-xs font-bold', !confirmModal.danger && 'bg-amber-600 hover:bg-amber-700 text-white')}
              >
                {confirmModal.confirmText}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
