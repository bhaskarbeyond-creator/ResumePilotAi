/**
 * Quota & usage — the AI usage ledger.
 *
 * Source: GET /api/admin/ai/quota-stats (MariaDB). When the ledger cannot be
 * read the panel says exactly that, with the server's code. It never falls back
 * to assumed tier limits or a zeroed usage table, because "0 requests today"
 * and "we could not read today's requests" are different facts.
 */

import { useEffect, useState } from 'react';
import { BarChart3, RefreshCw, RotateCcw, Save, ShieldAlert, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { QuotaStats } from '@/hooks/use-ai-engine';
import { EmptyState, Field, InlineAlert, Metric, Panel, Spinner, StatusPill, valueOrDash } from './primitives';

export interface UsageSectionProps {
  data?: QuotaStats;
  loading: boolean;
  error?: { code?: string; message: string };
  canEdit: boolean;
  onRetry: () => void;
  savingLimits: boolean;
  resetting: boolean;
  message?: { tone: 'success' | 'error'; text: string } | null;
  onSaveLimits: (limits: { basic: number; premium: number; admin: number }) => void;
  onResetUser: (uid: string, label: string) => void;
  onResetAll: () => void;
}

export function UsageSection({
  data,
  loading,
  error,
  canEdit,
  onRetry,
  savingLimits,
  resetting,
  message,
  onSaveLimits,
  onResetUser,
  onResetAll,
}: UsageSectionProps) {
  const [limits, setLimits] = useState({ basic: 10, premium: 100, admin: 10000 });
  const [uid, setUid] = useState('');

  useEffect(() => {
    if (!data?.limits) return;
    setLimits({
      basic: Number(data.limits.basic ?? 0),
      premium: Number(data.limits.premium ?? 0),
      admin: Number(data.limits.admin ?? 0),
    });
  }, [data?.limits]);

  const records = data?.todayRecords ?? [];
  const usedToday = records.reduce((sum, record) => sum + (Number(record.count) || 0), 0);
  const exhausted = records.filter((record) => record.limit > 0 && record.count >= record.limit).length;

  return (
    <div className="space-y-4" data-testid="ai-engine-section-usage">
      {message && (
        <InlineAlert tone={message.tone} title={message.tone === 'success' ? 'Applied' : 'Not applied'} className="animate-[fade-in_150ms_ease-out]">
          {message.text}
        </InlineAlert>
      )}

      {loading && !data && (
        <Panel title="Usage ledger" description="Reading GET /api/admin/ai/quota-stats…">
          <div className="space-y-2">
            <Spinner label="Reading the ledger…" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-canvas-soft" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-canvas-soft" />
          </div>
        </Panel>
      )}

      {error && !data && (
        <Panel title="Usage ledger unavailable" description="GET /api/admin/ai/quota-stats did not return a usable ledger.">
          <InlineAlert
            tone="error"
            title={`Ledger read failed${error.code ? ` (${error.code})` : ''}`}
            onRetry={onRetry}
            retryLabel="Retry read"
          >
            {error.message}
            <span className="mt-1 block text-[11px] opacity-80">
              Quota figures come from MariaDB’s AI usage ledger. This panel deliberately shows nothing rather than substituting defaults.
            </span>
          </InlineAlert>
        </Panel>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Metric label="Generations today" value={usedToday.toLocaleString()} hint={`Aggregated across ${records.length} ledger row(s).`} />
            <Metric label="Ledger rows today" value={records.length.toLocaleString()} hint={data.today ? `Day key ${data.today}` : 'Day key not reported'} />
            <Metric
              label="Tiers exhausted"
              value={exhausted.toLocaleString()}
              tone={exhausted > 0 ? 'degraded' : 'ready'}
              hint="Users at or above their daily limit."
            />
            <Metric label="Historical records" value={Number(data.totalHistoricalRecords || 0).toLocaleString()} hint="All-time ledger rows." />
          </div>

          <Panel
            title={
              <span className="inline-flex items-center gap-2">
                <ShieldAlert className="size-4 text-brand-600" aria-hidden="true" />
                Daily generation limits per tier
              </span>
            }
            description="Saved through POST /api/admin/ai/quota-limits with the ledger revision. A stale revision is rejected with AI_QUOTA_CONFLICT and the current ledger is re-read."
            actions={<StatusPill tone="neutral" showDot={false}>Revision {valueOrDash(data.quotaRevision)}</StatusPill>}
            testId="ai-engine-quota-limits"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Basic (free)" htmlFor="quota-basic" hint="Generations per day">
                <Input
                  id="quota-basic"
                  type="number"
                  min={1}
                  max={100000}
                  value={limits.basic}
                  disabled={!canEdit || savingLimits}
                  onChange={(event) => setLimits((prev) => ({ ...prev, basic: Number(event.target.value) || 0 }))}
                  className="h-9 tabular-nums"
                />
              </Field>
              <Field label="Premium" htmlFor="quota-premium" hint="Generations per day">
                <Input
                  id="quota-premium"
                  type="number"
                  min={1}
                  max={100000}
                  value={limits.premium}
                  disabled={!canEdit || savingLimits}
                  onChange={(event) => setLimits((prev) => ({ ...prev, premium: Number(event.target.value) || 0 }))}
                  className="h-9 tabular-nums"
                />
              </Field>
              <Field label="Admin" htmlFor="quota-admin" hint="Generations per day">
                <Input
                  id="quota-admin"
                  type="number"
                  min={1}
                  max={1000000}
                  value={limits.admin}
                  disabled={!canEdit || savingLimits}
                  onChange={(event) => setLimits((prev) => ({ ...prev, admin: Number(event.target.value) || 0 }))}
                  className="h-9 tabular-nums"
                />
              </Field>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
              <Button variant="outline" size="sm" onClick={onRetry} disabled={savingLimits}>
                <RefreshCw className="size-3.5" aria-hidden="true" /> Re-read ledger
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={!canEdit || savingLimits}
                loading={savingLimits}
                onClick={() => onSaveLimits(limits)}
                data-testid="ai-engine-save-quota"
              >
                <Save className="size-3.5" aria-hidden="true" /> Save tier limits
              </Button>
            </div>
          </Panel>

          <Panel
            title={
              <span className="inline-flex items-center gap-2">
                <BarChart3 className="size-4 text-brand-600" aria-hidden="true" />
                Today’s ledger
              </span>
            }
            description={data.today ? `Usage recorded for ${data.today}.` : 'Usage recorded in the current UTC day.'}
            actions={
              <Button variant="destructive" size="xs" disabled={!canEdit || resetting} onClick={onResetAll} data-testid="ai-engine-reset-all">
                <RotateCcw className="size-3" aria-hidden="true" /> Reset all users
              </Button>
            }
            testId="ai-engine-quota-ledger"
          >
            {records.length === 0 ? (
              <EmptyState
                icon={<Users className="size-7" />}
                title="No AI usage recorded today"
                description="The ledger answered with zero rows for today. That is a real zero, not a missing read."
              />
            ) : (
              <ul className="space-y-2">
                {records.map((record, index) => {
                  const pct = record.limit > 0 ? Math.min(100, Math.round((record.count / record.limit) * 100)) : 0;
                  const label = record.displayName || (record.email ? record.email.split('@')[0] : `User ${record.uid.slice(0, 8)}`);
                  return (
                    <li
                      key={record.docId || record.uid || index}
                      className="flex flex-col gap-2 rounded-xl border border-border px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                      data-testid={`ai-engine-ledger-row-${record.uid}`}
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-canvas-soft text-xs font-bold text-ink-secondary">
                          {label.charAt(0).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-1.5 text-sm font-bold text-ink">
                            <span className="truncate" title={label}>{label}</span>
                            {record.membership && <StatusPill tone="neutral" showDot={false}>{record.membership}</StatusPill>}
                            {pct >= 100 && <StatusPill tone="unavailable" showDot={false}>limit reached</StatusPill>}
                            {pct >= 80 && pct < 100 && <StatusPill tone="degraded" showDot={false}>{pct}% used</StatusPill>}
                          </p>
                          <p className="truncate font-mono text-[11px] text-ink-muted" title={record.email || record.uid}>
                            {record.email || record.uid}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 pl-10 sm:pl-0">
                        <div className="min-w-[7rem] flex-1">
                          <div className="flex items-center justify-between text-[10px] font-bold tabular-nums text-ink-muted">
                            <span>{record.count}</span>
                            <span>/ {record.limit}</span>
                          </div>
                          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-canvas-soft" role="presentation">
                            <div
                              className={cn('h-full rounded-full transition-[width] duration-300', pct >= 100 ? 'bg-rose-500' : pct >= 80 ? 'bg-amber-500' : 'bg-brand-600')}
                              style={{ width: `${Math.max(2, pct)}%` }}
                            />
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="xs"
                          disabled={!canEdit || resetting}
                          onClick={() => onResetUser(record.uid, label)}
                          data-testid={`ai-engine-reset-${record.uid}`}
                        >
                          Reset
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel title="Reset a specific account" description="Removes the daily usage row for one uid. The action is confirmed before it runs.">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <Field label="Firebase uid" htmlFor="quota-uid" hint="Exactly the uid in the ledger row, not an email." className="flex-1">
                <Input
                  id="quota-uid"
                  value={uid}
                  onChange={(event) => setUid(event.target.value.trim())}
                  placeholder="e.g. local_4f2ab9c8d1e07a6b3c5d9e"
                  disabled={!canEdit || resetting}
                  className="h-9 font-mono text-xs"
                  spellCheck={false}
                  data-testid="ai-engine-reset-uid"
                />
              </Field>
              <Button
                variant="destructive"
                size="sm"
                disabled={!canEdit || resetting || uid.length < 3}
                onClick={() => onResetUser(uid, uid)}
                className="sm:mb-5"
              >
                <RotateCcw className="size-3.5" aria-hidden="true" /> Reset this uid
              </Button>
            </div>
          </Panel>

          <p className="text-center text-[11px] text-ink-muted">
            Quota data is authoritative in MariaDB only; this console never caches a ledger figure.
          </p>
        </>
      )}
    </div>
  );
}

export default UsageSection;
