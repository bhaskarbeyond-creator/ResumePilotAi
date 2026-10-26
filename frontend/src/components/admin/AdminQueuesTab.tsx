/**
 * Outbox and dead-letter inspection.
 *
 * Reads `GET /api/platform/queues`, which inspects the two outboxes that actually exist
 * (`notification_outbox`, `enterprise_outbox`) and returns a **sample**: `summary.sampled`
 * and `summary.sampleSize` say so, and the page repeats it rather than implying it holds the
 * full backlog.
 *
 * What it used to be: a hard-coded list of queue cards (`email-outbox` waiting 42, completed
 * 14 820, `dead-letter-queue` failed 2 …) into which the live counts were merged, plus three
 * controls the API does not offer — "retry all", "purge dead-letter queue" (the server
 * answers `410 DEAD_LETTER_PURGE_RETIRED` by design) and a per-job retry that fell back to a
 * second, non-existent endpoint when the first failed. Retrying an *enterprise* job through
 * this route returns `400 INVALID_RETRY_TARGET`; the button is therefore only shown for
 * notification dead letters, where the server accepts it.
 *
 * Contracts: `routes/platform.js:465` (list), `:512` (retry one), `:551` (purge retired).
 */

import { useCallback, useMemo, useState } from 'react';
import { AlertTriangle, Inbox, RefreshCw, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { get, post } from '@/lib/api-client';
import { AdminEmptyPanel, AdminErrorPanel, AdminLoadingPanel } from './AdminDataState';
import { useAdminResource } from './use-admin-resource';
import { describeAdminFailure } from './admin-data-state';

interface QueueJob {
  id: string;
  queue: 'notification' | 'enterprise' | string;
  channel: string;
  /** Already masked by the server (`ab***@domain.tld`); never a full address. */
  recipient: string | null;
  templateType: string | null;
  state: string;
  attemptCount: number;
  lastError: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

interface QueuePayload {
  summary: {
    totalInspected: number;
    deadLetterCount: number;
    pendingCount: number;
    successCount: number;
    source: string;
    sampled: boolean;
    sampleSize: number;
  };
  jobs: QueueJob[];
}

const STATE_PILL: Record<string, string> = {
  DEAD_LETTER: 'bg-error-50 text-error-700 border-error-100',
  NOTIFICATION_QUEUED: 'bg-info-50 text-info-700 border-info-100',
  QUEUED: 'bg-info-50 text-info-700 border-info-100',
  PROCESSING: 'bg-warning-50 text-warning-700 border-warning-100',
  RETRYING: 'bg-warning-50 text-warning-700 border-warning-100',
  DELIVERED: 'bg-success-50 text-success-700 border-success-100',
  COMPLETED: 'bg-success-50 text-success-700 border-success-100',
};

function statePill(state: string): string {
  return STATE_PILL[state] ?? 'bg-neutral-100 text-ink-secondary border-border dark:bg-neutral-800';
}

export function AdminQueuesTab() {
  const load = useCallback(
    (signal: AbortSignal) => get<QueuePayload>('/platform/queues', undefined, { signal }),
    [],
  );
  const resource = useAdminResource(load);
  const jobs = useMemo(() => resource.data?.jobs ?? [], [resource.data]);
  const summary = resource.data?.summary ?? null;

  const [queueFilter, setQueueFilter] = useState<'all' | 'notification' | 'enterprise'>('all');
  const [stateFilter, setStateFilter] = useState<'all' | 'DEAD_LETTER' | 'pending' | 'success'>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const visible = jobs.filter((job) => {
    if (queueFilter !== 'all' && job.queue !== queueFilter) return false;
    if (stateFilter === 'DEAD_LETTER') return job.state === 'DEAD_LETTER';
    if (stateFilter === 'pending') return ['NOTIFICATION_QUEUED', 'QUEUED', 'PROCESSING', 'RETRYING'].includes(job.state);
    if (stateFilter === 'success') return ['DELIVERED', 'COMPLETED', 'REJECTED', 'SKIPPED_NO_RECIPIENT'].includes(job.state);
    return true;
  });

  const retry = async (job: QueueJob) => {
    setBusy(job.id);
    setNotice(null);
    try {
      const response = await post<{ retriedCount?: number }>('/platform/queues/retry', {
        jobId: job.id,
        queue: 'notification',
      });
      setNotice({
        tone: 'success',
        text: `Job ${job.id} re-queued (${response?.retriedCount ?? 0} row updated, recorded in the admin audit trail).`,
      });
      resource.reload();
    } catch (error) {
      const failure = describeAdminFailure(error);
      setNotice({
        tone: 'error',
        text: `${failure.message} (${failure.code}${failure.requestId ? ` · request ${failure.requestId}` : ''})`,
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-ink">Outbox &amp; dead letters</h2>
          <p className="text-xs text-ink-muted">
            A sample of both outboxes, newest first. Dead letters are retained for
            investigation; there is no bulk purge.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={resource.reload} disabled={resource.status === 'loading'}>
          <RefreshCw className={cn('mr-1 size-3.5', resource.status === 'loading' && 'animate-spin')} />
          Reload
        </Button>
      </div>

      {notice && (
        <div
          role={notice.tone === 'success' ? 'status' : 'alert'}
          className={cn(
            'flex items-start gap-2 rounded-xl border p-3 text-xs',
            notice.tone === 'success'
              ? 'border-success-100 bg-success-50 text-success-700'
              : 'border-error-100 bg-error-50 text-error-700',
          )}
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span className="flex-1">{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} className="min-h-11 cursor-pointer px-2 text-2xs font-bold uppercase focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 sm:min-h-9">
            Dismiss
          </button>
        </div>
      )}

      {resource.status === 'loading' && resource.data === null && (
        <AdminLoadingPanel label="Reading the outboxes…" />
      )}
      {resource.status === 'failed' && resource.error && (
        <AdminErrorPanel title="Queue telemetry could not be read" error={resource.error} onRetry={resource.reload} />
      )}

      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryTile label="Inspected" value={String(summary.totalInspected)} />
          <SummaryTile
            label="Dead letters"
            value={String(summary.deadLetterCount)}
            tone={summary.deadLetterCount > 0 ? 'bad' : undefined}
          />
          <SummaryTile label="Pending" value={String(summary.pendingCount)} tone={summary.pendingCount > 0 ? 'warn' : undefined} />
          <SummaryTile label="Settled" value={String(summary.successCount)} />
        </div>
      )}

      {resource.status === 'ready' && jobs.length === 0 && (
        <AdminEmptyPanel
          title="No outbox rows"
          description="Both outboxes answered with no rows in the sample window. Nothing is waiting."
          tone="success"
        />
      )}

      {jobs.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by queue">
              {(['all', 'notification', 'enterprise'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={queueFilter === option}
                  onClick={() => setQueueFilter(option)}
                  className={cn(
                    'min-h-11 cursor-pointer rounded-lg px-3 text-xs font-semibold transition-colors',
                    queueFilter === option ? 'bg-brand-600 text-white' : 'bg-neutral-100 text-ink-muted dark:bg-neutral-800',
                  )}
                >
                  {option === 'all' ? 'All queues' : option}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by state">
              {(
                [
                  { id: 'all', label: 'Any state' },
                  { id: 'DEAD_LETTER', label: 'Dead letter' },
                  { id: 'pending', label: 'Pending' },
                  { id: 'success', label: 'Settled' },
                ] as const
              ).map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={stateFilter === option.id}
                  onClick={() => setStateFilter(option.id)}
                  className={cn(
                    'min-h-11 cursor-pointer rounded-lg px-3 text-xs font-semibold transition-colors',
                    stateFilter === option.id ? 'bg-brand-600 text-white' : 'bg-neutral-100 text-ink-muted dark:bg-neutral-800',
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {visible.length === 0 ? (
            <p className="rounded-xl border border-border bg-surface p-6 text-center text-xs text-ink-muted">
              No job matches this filter. {jobs.length} jobs are in the sample.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border bg-surface">
              <table className="w-full min-w-[880px] text-xs">
                <caption className="sr-only">
                  Outbox jobs, newest first{summary?.sampled ? `, sampled at ${summary.sampleSize} rows per outbox` : ''}
                </caption>
                <thead className="border-b border-border bg-canvas">
                  <tr>
                    <th scope="col" className="px-3 py-2 text-left font-semibold text-ink-secondary">Queue / state</th>
                    <th scope="col" className="px-3 py-2 text-left font-semibold text-ink-secondary">Recipient</th>
                    <th scope="col" className="px-3 py-2 text-left font-semibold text-ink-secondary">Template</th>
                    <th scope="col" className="px-3 py-2 text-left font-semibold text-ink-secondary">Attempts</th>
                    <th scope="col" className="px-3 py-2 text-left font-semibold text-ink-secondary">Created</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold text-ink-secondary">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {visible.map((job) => {
                    const canRetry = job.queue === 'notification' && job.state === 'DEAD_LETTER';
                    const open = expanded === job.id;
                    return (
                      <tr key={job.id} className="align-top hover:bg-neutral-25 dark:hover:bg-neutral-800/30">
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-2xs font-bold uppercase tracking-wide text-ink-muted">{job.queue}</span>
                            <span className={cn('rounded-full border px-2 py-0.5 text-2xs font-bold', statePill(job.state))}>
                              {job.state}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setExpanded(open ? null : job.id)}
                            aria-expanded={open}
                            className="mt-1 min-h-11 cursor-pointer font-mono text-2xs text-brand-700 hover:underline"
                          >
                            {job.id}
                          </button>
                          {open && (
                            <dl className="mt-1 space-y-0.5 rounded-lg bg-canvas p-2 text-2xs text-ink-secondary">
                              <div>channel: <span className="font-mono">{job.channel}</span></div>
                              <div>updated: <span className="font-mono">{job.updatedAt ?? '—'}</span></div>
                              <div className="break-words">
                                last error: <span className="font-mono">{job.lastError ?? 'none recorded'}</span>
                              </div>
                            </dl>
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono text-2xs text-ink-secondary">{job.recipient ?? '—'}</td>
                        <td className="px-3 py-2 text-2xs text-ink-secondary">{job.templateType ?? '—'}</td>
                        <td className="px-3 py-2 text-2xs text-ink-secondary">{job.attemptCount}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-2xs text-ink-muted">{job.createdAt ?? '—'}</td>
                        <td className="px-3 py-2 text-right">
                          {canRetry ? (
                            <Button
                              variant="outline"
                              size="xs"
                              onClick={() => retry(job)}
                              loading={busy === job.id}
                            >
                              <RotateCcw className="mr-1 size-3" />
                              Retry
                            </Button>
                          ) : (
                            <span className="text-2xs text-ink-muted">
                              {job.queue === 'enterprise' ? 'replay from tenant context' : 'no action'}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {summary && (
        <p className="flex items-start gap-2 text-2xs text-ink-muted">
          <Inbox className="mt-0.5 size-3.5 shrink-0" />
          Source {summary.source}
          {summary.sampled ? ` · sampled: the newest ${summary.sampleSize} rows per outbox, not the whole backlog` : ''}
          {summary.deadLetterCount > 0
            ? ' · dead letters stay until they are delivered or investigated; bulk purge is retired by design.'
            : ''}
        </p>
      )}
    </div>
  );
}

function SummaryTile({ label, value, tone }: { label: string; value: string; tone?: 'warn' | 'bad' }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <dt className="text-2xs font-semibold uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd
        className={cn(
          'mt-1 text-sm font-bold',
          tone === 'bad' ? 'text-error-700' : tone === 'warn' ? 'text-warning-700' : 'text-ink',
        )}
      >
        {value}
      </dd>
    </div>
  );
}
