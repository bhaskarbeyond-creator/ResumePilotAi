import { AlertCircle, CheckCircle2, Clock, RefreshCw, ShieldAlert, Users } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/loading';
import { cn } from '@/lib/utils';
import { computeSeatUtilization, type SeatQuota } from '@/lib/enterprise-seats';

export interface WorkspaceSeatQuotaCardProps {
  quota: SeatQuota | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  actionSlot?: React.ReactNode;
}

export function WorkspaceSeatQuotaCard({
  quota,
  loading,
  error,
  onRetry,
  actionSlot,
}: WorkspaceSeatQuotaCardProps) {
  if (loading && !quota) {
    return (
      <Card
        className="p-5 space-y-3"
        role="status"
        aria-label="Loading workspace seat quota"
      >
        <div className="flex items-center justify-between gap-4">
          <Skeleton className="h-5 w-48 rounded-md" />
          <Skeleton className="h-8 w-36 rounded-lg" />
        </div>
        <Skeleton className="h-3 w-full rounded-full" />
        <div className="grid grid-cols-3 gap-3">
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
        </div>
      </Card>
    );
  }

  if (error && !quota) {
    return (
      <Card className="p-5">
        <div
          role="alert"
          className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-sm text-error-800 dark:text-error-200"
        >
          <div className="flex items-start gap-2.5">
            <AlertCircle className="mt-0.5 size-5 shrink-0 text-error-600" aria-hidden="true" />
            <div>
              <p className="font-semibold text-ink">Workspace seat quota unavailable</p>
              <p className="mt-0.5 text-xs text-ink-muted">{error}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="outline" onClick={onRetry}>
              <RefreshCw className="size-3.5" aria-hidden="true" />
              Retry
            </Button>
            {actionSlot}
          </div>
        </div>
      </Card>
    );
  }

  if (!quota) {
    return (
      <Card className="p-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-ink">No workspace seat allocation reported</p>
          <p className="text-xs text-ink-muted">
            Refresh seat telemetry to view licensed capacity and pending invitations.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={onRetry}>
            <RefreshCw className="size-3.5" aria-hidden="true" />
            Refresh
          </Button>
          {actionSlot}
        </div>
      </Card>
    );
  }

  const metrics = computeSeatUtilization(quota);

  const barFillClass =
    metrics.tone === 'crimson'
      ? 'bg-rose-600'
      : metrics.tone === 'amber'
        ? 'bg-amber-500'
        : 'bg-emerald-600';

  const badgeClass =
    metrics.tone === 'crimson'
      ? 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200'
      : metrics.tone === 'amber'
        ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200'
        : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200';

  const StatusIcon =
    metrics.tone === 'crimson'
      ? ShieldAlert
      : metrics.tone === 'amber'
        ? Clock
        : CheckCircle2;

  const accessibleSummary = `${quota.seatsUsed} of ${quota.seatLimit} workspace seats used (${metrics.percent}%). ${quota.seatsRemaining} seats remaining, ${quota.pendingInvites} pending ${quota.pendingInvites === 1 ? 'invitation' : 'invitations'}. ${metrics.statusLabel}.`;

  return (
    <Card className="p-5 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="flex items-center gap-2 text-base font-bold text-ink">
              <Users className="size-4 text-brand-600 shrink-0" aria-hidden="true" />
              <span>Workspace Seat Quota</span>
            </h2>
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                badgeClass,
              )}
            >
              <StatusIcon className="size-3.5 shrink-0" aria-hidden="true" />
              <span>{metrics.statusLabel}</span>
            </span>
          </div>
          <p id="seat-quota-summary" className="text-xs text-ink-secondary">
            {accessibleSummary}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onRetry}
            disabled={loading}
            aria-busy={loading}
          >
            <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} aria-hidden="true" />
            Refresh Seats
          </Button>
          {actionSlot}
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200"
        >
          Showing last loaded seat count. Refresh failed: {error}
        </div>
      )}

      {/* Accessible Progress Bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs font-semibold text-ink">
          <span>
            {quota.seatsUsed} / {quota.seatLimit} seats used
          </span>
          <span>{metrics.percent}% utilized</span>
        </div>
        <div
          role="progressbar"
          aria-label="Workspace seat utilization"
          aria-describedby="seat-quota-summary"
          aria-valuenow={metrics.barWidthPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuetext={accessibleSummary}
          className="h-3 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800"
        >
          <div
            className={cn('h-full rounded-full transition-all duration-300', barFillClass)}
            style={{ width: `${metrics.barWidthPercent}%` }}
          />
        </div>
      </div>

      {/* Breakdown metrics */}
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3 pt-1">
        <div className="rounded-xl border border-border bg-neutral-50/70 px-3.5 py-2.5 dark:bg-neutral-900/50">
          <dt className="text-xs text-ink-muted">Seats Used</dt>
          <dd className="mt-0.5 text-lg font-bold text-ink">
            {quota.seatsUsed} <span className="text-xs font-normal text-ink-muted">of {quota.seatLimit}</span>
          </dd>
        </div>
        <div className="rounded-xl border border-border bg-neutral-50/70 px-3.5 py-2.5 dark:bg-neutral-900/50">
          <dt className="text-xs text-ink-muted">Remaining Seats</dt>
          <dd className="mt-0.5 text-lg font-bold text-ink">{quota.seatsRemaining}</dd>
        </div>
        <div className="rounded-xl border border-border bg-neutral-50/70 px-3.5 py-2.5 dark:bg-neutral-900/50">
          <dt className="text-xs text-ink-muted">Pending Invitations</dt>
          <dd className="mt-0.5 text-lg font-bold text-ink">{quota.pendingInvites}</dd>
        </div>
      </dl>
    </Card>
  );
}
