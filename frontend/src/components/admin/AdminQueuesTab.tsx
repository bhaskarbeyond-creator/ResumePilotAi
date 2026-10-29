import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCw,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/loading';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { apiClient, normalizeError } from '@/lib/api-client';
import { useAuth } from '@/providers/auth-provider';
import { cn } from '@/lib/utils';
import {
  type OutboxStats,
  type QueueSnapshot,
  formatOutboxProcessSummary,
  parseOutboxProcessResult,
  parseOutboxStats,
  parseQueueSnapshot,
} from './queue-contract';

interface ProcessFeedback {
  tone: 'success' | 'warning' | 'error';
  message: string;
}

export function AdminQueuesTab() {
  const { claims } = useAuth();
  const zeroPendingHintId = useId();

  const isReadOnlyAuditor =
    claims?.role === 'AUDITOR' ||
    (typeof window !== 'undefined' && sessionStorage.getItem('superadmin_role_view') === 'AUDITOR');

  // Authoritative Outbox Stats (`GET /api/admin/system/outbox/stats`)
  const [outboxStats, setOutboxStats] = useState<OutboxStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [statsFetchedAt, setStatsFetchedAt] = useState<string | null>(null);

  // Batch processing state (`POST /api/admin/system/outbox/process`)
  const [confirmProcessOpen, setConfirmProcessOpen] = useState(false);
  const [processingOutbox, setProcessingOutbox] = useState(false);
  const [processFeedback, setProcessFeedback] = useState<ProcessFeedback | null>(null);

  // Existing sampled queue snapshot (`GET /api/platform/queues`)
  const [snapshot, setSnapshot] = useState<QueueSnapshot | null>(null);
  const [queueLoading, setQueueLoading] = useState(true);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [retryNotice, setRetryNotice] = useState<string | null>(null);

  const statsAbortRef = useRef<AbortController | null>(null);
  const queuesAbortRef = useRef<AbortController | null>(null);

  const loadOutboxStats = useCallback(async () => {
    statsAbortRef.current?.abort();
    const controller = new AbortController();
    statsAbortRef.current = controller;

    setStatsLoading(true);
    setStatsError(null);
    try {
      const response = await apiClient.get<unknown>('/admin/system/outbox/stats', {
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      const parsed = parseOutboxStats(response.data);
      setOutboxStats(parsed);
      setStatsFetchedAt(new Date().toLocaleTimeString());
    } catch (err) {
      if (controller.signal.aborted) return;
      setStatsError(normalizeError(err).message);
    } finally {
      if (!controller.signal.aborted) {
        setStatsLoading(false);
      }
    }
  }, []);

  const loadSampledQueues = useCallback(async () => {
    queuesAbortRef.current?.abort();
    const controller = new AbortController();
    queuesAbortRef.current = controller;

    setQueueLoading(true);
    setQueueError(null);
    try {
      const response = await apiClient.get<unknown>('/platform/queues', {
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setSnapshot(parseQueueSnapshot(response.data));
    } catch (err) {
      if (controller.signal.aborted) return;
      setQueueError(normalizeError(err).message);
    } finally {
      if (!controller.signal.aborted) {
        setQueueLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadOutboxStats();
    void loadSampledQueues();
    return () => {
      statsAbortRef.current?.abort();
      queuesAbortRef.current?.abort();
    };
  }, [loadOutboxStats, loadSampledQueues]);

  const handleRefreshAll = () => {
    void loadOutboxStats();
    void loadSampledQueues();
  };

  // Only treat PENDING === 0 as authoritative when stats loaded cleanly without stale errors.
  const statsAreFreshZero =
    outboxStats !== null && statsError === null && !statsLoading && outboxStats.PENDING === 0;

  const processDisabled = processingOutbox || isReadOnlyAuditor || statsAreFreshZero;

  const processDisabledReason = isReadOnlyAuditor
    ? 'Read-only auditor sessions cannot trigger outbox batch processing.'
    : statsAreFreshZero
      ? 'No pending messages in outbox'
      : null;

  const handleExecuteProcessOutbox = async () => {
    if (processingOutbox || isReadOnlyAuditor) return;
    setProcessingOutbox(true);
    setProcessFeedback(null);

    try {
      const response = await apiClient.post<unknown>('/admin/system/outbox/process', {});
      const result = parseOutboxProcessResult(response.data);
      const summaryText = formatOutboxProcessSummary(result);

      setConfirmProcessOpen(false);
      setProcessFeedback({
        tone: result.failed > 0 ? 'warning' : 'success',
        message:
          result.failed > 0
            ? `${summaryText} Inspect dead-letter or failed events below before retrying.`
            : summaryText,
      });

      await Promise.all([loadOutboxStats(), loadSampledQueues()]);
    } catch (err) {
      const normalized = normalizeError(err);
      setConfirmProcessOpen(false);
      const isUncertainTimeout =
        normalized.code === 'ECONNABORTED' ||
        normalized.status === 504 ||
        /timeout|timed out/i.test(normalized.message);

      if (isUncertainTimeout) {
        setProcessFeedback({
          tone: 'warning',
          message:
            'Outbox batch request timed out and its completion status is uncertain. Refresh telemetry before running batch processing again to avoid duplicate dispatch.',
        });
      } else {
        setProcessFeedback({
          tone: 'error',
          message: normalized.message,
        });
      }
    } finally {
      setProcessingOutbox(false);
    }
  };

  const retryDeadLetterJob = async (id: string) => {
    if (retrying || isReadOnlyAuditor) return;
    setRetrying(id);
    setRetryNotice(null);
    setQueueError(null);
    try {
      await apiClient.post<unknown>('/platform/queues/retry', { id, queue: 'notification' });
      setRetryNotice(`Re-queued notification ${id}.`);
      await Promise.all([loadSampledQueues(), loadOutboxStats()]);
    } catch (err) {
      setQueueError(normalizeError(err).message);
    } finally {
      setRetrying(null);
    }
  };

  return (
    <div className="space-y-6" data-testid="admin-queues-tab">
      {/* ─── Outbox Telemetry & Batch Processing Header ─── */}
      <Card className="p-5 space-y-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-ink">Transactional Outbox Telemetry</h2>
            <p className="text-xs text-ink-muted">
              Point-in-time counts from the notification outbox ledger. Refresh manually to inspect current queue state.
              {statsFetchedAt ? ` Last fetched at ${statsFetchedAt}.` : ''}
            </p>
          </div>

          <div className="flex flex-col items-start gap-1.5 sm:items-end">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleRefreshAll}
                disabled={statsLoading || processingOutbox}
                aria-busy={statsLoading}
              >
                <RefreshCw
                  className={cn('size-3.5', statsLoading && 'animate-spin')}
                  aria-hidden="true"
                />
                Refresh Telemetry
              </Button>

              <span title={processDisabledReason ?? undefined} className="inline-flex">
                <Button
                  type="button"
                  size="sm"
                  disabled={processDisabled}
                  aria-busy={processingOutbox}
                  aria-describedby={processDisabledReason ? zeroPendingHintId : undefined}
                  onClick={() => setConfirmProcessOpen(true)}
                >
                  <RefreshCw
                    className={cn('size-3.5', processingOutbox && 'animate-spin')}
                    aria-hidden="true"
                  />
                  {processingOutbox ? 'Processing Outbox…' : 'Process Pending Outbox'}
                </Button>
              </span>
            </div>

            {processDisabledReason && (
              <p id={zeroPendingHintId} className="text-xs text-ink-muted">
                {processDisabledReason}
              </p>
            )}
          </div>
        </div>

        {/* Batch processing outcome feedback */}
        {processFeedback && (
          <div
            role={processFeedback.tone === 'error' ? 'alert' : 'status'}
            aria-live="polite"
            className={cn(
              'flex items-start justify-between gap-3 rounded-xl border p-3.5 text-xs font-medium',
              processFeedback.tone === 'success' &&
                'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200',
              processFeedback.tone === 'warning' &&
                'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200',
              processFeedback.tone === 'error' &&
                'border-error-200 bg-error-50 text-error-800 dark:border-error-900 dark:bg-error-950/50 dark:text-error-200',
            )}
          >
            <div className="flex items-start gap-2">
              {processFeedback.tone === 'success' ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              ) : (
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              )}
              <span>{processFeedback.message}</span>
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setProcessFeedback(null)}
            >
              Dismiss
            </Button>
          </div>
        )}

        {/* Recoverable stats error when previous stats exist */}
        {statsError && outboxStats && (
          <div
            role="alert"
            className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900 sm:flex-row sm:items-center sm:justify-between dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200"
          >
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>Showing stale outbox counts. Latest stats fetch failed: {statsError}</span>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={() => void loadOutboxStats()}>
              <RefreshCw className="size-3.5" aria-hidden="true" />
              Retry Stats
            </Button>
          </div>
        )}

        {/* KPI Cards */}
        {statsLoading && !outboxStats ? (
          <div
            className="grid grid-cols-1 gap-4 sm:grid-cols-3"
            role="status"
            aria-label="Loading outbox telemetry metrics"
          >
            <Skeleton className="h-28 w-full rounded-2xl" />
            <Skeleton className="h-28 w-full rounded-2xl" />
            <Skeleton className="h-28 w-full rounded-2xl" />
          </div>
        ) : statsError && !outboxStats ? (
          <div
            role="alert"
            className="rounded-2xl border border-error-200 bg-error-50 p-5 text-sm text-error-800 dark:border-error-900 dark:bg-error-950/40 dark:text-error-200"
          >
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
              <div className="space-y-3">
                <div>
                  <p className="font-semibold">Outbox telemetry could not be loaded</p>
                  <p className="mt-1 text-xs">{statsError}</p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void loadOutboxStats()}
                >
                  <RefreshCw className="size-3.5" aria-hidden="true" />
                  Retry
                </Button>
              </div>
            </div>
          </div>
        ) : outboxStats ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {/* KPI 1: Pending Dispatch */}
            <div className="rounded-2xl border border-border bg-neutral-50/70 p-4 dark:bg-neutral-900/50">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                  Pending Dispatch
                </p>
                <Clock className="size-4 text-amber-600 shrink-0" aria-hidden="true" />
              </div>
              <p className="mt-2 text-3xl font-extrabold tracking-tight text-ink">
                {outboxStats.PENDING.toLocaleString()}
              </p>
              <p className="mt-1 text-xs text-ink-secondary">
                {outboxStats.PENDING === 0
                  ? 'Queue clear — no events awaiting dispatch'
                  : 'Queued events awaiting worker lease'}
              </p>
            </div>

            {/* KPI 2: Successfully Delivered */}
            <div className="rounded-2xl border border-border bg-neutral-50/70 p-4 dark:bg-neutral-900/50">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                  Successfully Delivered
                </p>
                <CheckCircle2 className="size-4 text-emerald-600 shrink-0" aria-hidden="true" />
              </div>
              <p className="mt-2 text-3xl font-extrabold tracking-tight text-ink">
                {outboxStats.DELIVERED.toLocaleString()}
              </p>
              <p className="mt-1 text-xs text-ink-secondary">
                Confirmed dispatches recorded by transport workers
              </p>
            </div>

            {/* KPI 3: Dead-Letter / Terminal Failures */}
            <div
              className={cn(
                'rounded-2xl border p-4',
                outboxStats.DEAD_LETTER > 0
                  ? 'border-rose-200 bg-rose-50/60 dark:border-rose-800 dark:bg-rose-950/30'
                  : 'border-border bg-neutral-50/70 dark:bg-neutral-900/50',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                  Dead-Letter / Terminal Failures
                </p>
                <AlertTriangle
                  className={cn(
                    'size-4 shrink-0',
                    outboxStats.DEAD_LETTER > 0 ? 'text-rose-600' : 'text-ink-muted',
                  )}
                  aria-hidden="true"
                />
              </div>
              <p className="mt-2 text-3xl font-extrabold tracking-tight text-ink">
                {outboxStats.DEAD_LETTER.toLocaleString()}
              </p>
              <p className="mt-1 text-xs text-ink-secondary">
                {outboxStats.DEAD_LETTER > 0
                  ? 'Requires operator inspection or manual retry'
                  : 'Zero terminal delivery failures'}
              </p>
            </div>
          </div>
        ) : null}
      </Card>

      {/* ─── Sampled Notification & Enterprise Queue Jobs ─── */}
      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base font-bold text-ink">
              Sampled Queue Jobs &amp; Dead-Letter Recovery
            </CardTitle>
            <p className="mt-0.5 text-xs text-ink-muted">
              Recent sampled records from notification and enterprise outbox tables.
            </p>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {retryNotice && (
            <div
              role="status"
              className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200"
            >
              {retryNotice}
            </div>
          )}

          {queueLoading && !snapshot ? (
            <div className="space-y-2.5" role="status" aria-label="Loading sampled queue jobs">
              <Skeleton className="h-10 w-full rounded-lg" />
              <Skeleton className="h-12 w-full rounded-lg" />
            </div>
          ) : queueError && !snapshot ? (
            <div
              role="alert"
              className="flex flex-col gap-3 rounded-xl border border-error-200 bg-error-50 p-4 text-xs text-error-800 sm:flex-row sm:items-center sm:justify-between dark:border-error-900 dark:bg-error-950/40 dark:text-error-200"
            >
              <span>{queueError}</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void loadSampledQueues()}
              >
                Retry
              </Button>
            </div>
          ) : snapshot ? (
            snapshot.jobs.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-ink-muted">
                No queued or dead-letter jobs are recorded.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-left text-xs" aria-label="Sampled outbox jobs">
                  <thead className="border-b border-border bg-neutral-50/70 text-[11px] font-semibold uppercase tracking-wider text-ink-muted dark:bg-neutral-900/50">
                    <tr>
                      <th scope="col" className="px-3.5 py-2.5">Job</th>
                      <th scope="col" className="px-3.5 py-2.5">Queue</th>
                      <th scope="col" className="px-3.5 py-2.5">Recipient</th>
                      <th scope="col" className="px-3.5 py-2.5">State</th>
                      <th scope="col" className="px-3.5 py-2.5">Attempts</th>
                      <th scope="col" className="px-3.5 py-2.5">Last Error</th>
                      <th scope="col" className="px-3.5 py-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {snapshot.jobs.map((job) => (
                      <tr key={`${job.queue}:${job.id}`}>
                        <td className="px-3.5 py-2.5">
                          <span className="font-mono font-semibold text-ink break-all">{job.id}</span>
                          <span className="block text-[11px] text-ink-muted">{job.templateType}</span>
                        </td>
                        <td className="px-3.5 py-2.5 text-ink-secondary">
                          {job.queue} / {job.channel}
                        </td>
                        <td className="px-3.5 py-2.5 text-ink-secondary break-all">
                          {job.recipient || 'Unavailable'}
                        </td>
                        <td className="px-3.5 py-2.5 font-semibold text-ink">{job.state}</td>
                        <td className="px-3.5 py-2.5 text-ink-secondary">{job.attemptCount}</td>
                        <td className="px-3.5 py-2.5 text-ink-muted max-w-[240px] break-words">
                          {job.lastError || '—'}
                        </td>
                        <td className="px-3.5 py-2.5 text-right">
                          {job.queue === 'notification' && job.state === 'DEAD_LETTER' && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={retrying !== null || isReadOnlyAuditor}
                              onClick={() => void retryDeadLetterJob(job.id)}
                            >
                              {retrying === job.id ? 'Retrying…' : 'Retry'}
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : null}
        </CardContent>
      </Card>

      {/* ─── Confirmation Dialog for Batch Processing ─── */}
      <Dialog
        open={confirmProcessOpen}
        onOpenChange={(open) => {
          if (!processingOutbox) setConfirmProcessOpen(open);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-ink">
              <RefreshCw className="size-4 text-brand-600 shrink-0" aria-hidden="true" />
              <span>Process Pending Outbox Batch?</span>
            </DialogTitle>
            <DialogDescription className="text-xs leading-relaxed text-ink-muted">
              This administrative action immediately leases and dispatches pending transactional outbox events on the server.
              {outboxStats ? ` Currently ${outboxStats.PENDING} pending ${outboxStats.PENDING === 1 ? 'event is' : 'events are'} queued.` : ''}
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            Delivery is at-least-once. If this request times out, refresh outbox telemetry first before triggering another batch run.
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={processingOutbox}
              onClick={() => setConfirmProcessOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={processingOutbox}
              aria-busy={processingOutbox}
              onClick={() => void handleExecuteProcessOutbox()}
            >
              <RefreshCw
                className={cn('size-3.5', processingOutbox && 'animate-spin')}
                aria-hidden="true"
              />
              {processingOutbox ? 'Processing…' : 'Confirm & Process'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
