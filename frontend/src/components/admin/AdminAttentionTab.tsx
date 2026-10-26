/**
 * Attention Needed — everything currently failing, degraded or awaiting a decision.
 *
 * Reads `GET /api/platform/attention`, which derives its items from the live health probes,
 * the operational snapshot and the queue/security counters (backend/routes/platform.js
 * `attentionItemsFromSignals` + `attentionItemsFromOperationalStatus`). Nothing on this page
 * is invented:
 *
 *   - before this rewrite the tab rendered a hard-coded list of five plausible incidents
 *     ("Vertex AI Labs has submitted enterprise employer documents…", "2 failed outbox sync
 *     events routed to DLQ") and a Refresh button that only spun a spinner for 600ms. An
 *     operator reading it could not tell a healthy platform from a broken one, and the
 *     "Acknowledge" control hid a row from a screen without changing anything anywhere.
 *   - "Acknowledge" is gone. These items are *derived*, not stored: the only way to clear one
 *     is to fix the condition it reports, so hiding it locally would be a lie that survives
 *     until the next render.
 *
 * If the endpoint is unavailable the page says so, with the request id, and offers Retry.
 * It never falls back to a sample list.
 */

import { useCallback } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, RefreshCw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { get } from '@/lib/api-client';
import { AdminEmptyPanel, AdminErrorPanel, AdminLoadingPanel } from './AdminDataState';
import { useAdminResource } from './use-admin-resource';
import type { AdminTabId } from '@/pages/admin/console';

/** One derived signal, exactly as `GET /api/platform/attention` returns it. */
interface AttentionItem {
  id: string;
  severity: 'HIGH' | 'MEDIUM' | 'INFO';
  title: string;
  detail?: string;
  /** Legacy route (`/adm/…`) the backend suggests; not used for navigation. */
  href: string;
  kind: string;
}

interface AttentionPayload {
  items: AttentionItem[];
  healthScore: number;
  status: string;
  operationalStatus: {
    overall: string;
    indicator: string;
    counts: Record<string, number>;
    checkedAt: string;
  } | null;
  operationalSource: 'ok' | 'unavailable';
  note: string;
}

/**
 * Where each signal kind is actionable *in this console*. Kinds without an entry have no
 * console surface yet and are rendered read-only rather than pointed at a tab that would
 * not explain them. Tracked as OI-ATTN-1 in developer-review/admin/OPEN-ITEMS.md.
 */
const KIND_TO_TAB: Record<string, AdminTabId> = {
  health: 'health',
  queue: 'queues',
  security: 'security',
  ops: 'operations',
  configuration: 'config',
};

const SEVERITY_STYLES: Record<AttentionItem['severity'], string> = {
  HIGH: 'bg-error-50 text-error-700 border border-error-100',
  MEDIUM: 'bg-warning-50 text-warning-700 border border-warning-100',
  INFO: 'bg-brand-50 text-brand-700 border border-brand-200',
};

export function AdminAttentionTab({
  onNavigateTab,
}: {
  onNavigateTab?: (tabId: string) => void;
}) {
  const load = useCallback(
    (signal: AbortSignal) => get<AttentionPayload>('/platform/attention', undefined, { signal }),
    [],
  );
  const { data, status, error, reload, refreshing } = useAdminResource(load);

  const items = data?.items ?? [];
  const loading = status === 'loading' && data === null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-ink">
            <AlertTriangle className="size-5 text-warning-600" />
            Platform Attention Needed
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            Derived from live health probes, operational telemetry and pending queues. This
            page stores nothing: an item disappears when the condition behind it does.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={reload}
          disabled={status === 'loading'}
          aria-busy={status === 'loading'}
        >
          <RefreshCw className={cn('mr-1.5 size-4', status === 'loading' && 'animate-spin')} />
          {refreshing ? 'Refreshing…' : 'Refresh signals'}
        </Button>
      </div>

      {loading && <AdminLoadingPanel label="Reading platform signals…" />}

      {status === 'failed' && error && (
        <AdminErrorPanel
          title="Platform attention signals could not be read"
          error={error}
          onRetry={reload}
        />
      )}

      {status === 'ready' && data && (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SignalStat label="Platform status" value={data.status} />
            <SignalStat label="Health score" value={`${data.healthScore}/100`} />
            <SignalStat
              label="Operational telemetry"
              value={data.operationalSource === 'ok' ? 'live' : 'unavailable'}
            />
            <SignalStat label="Open signals" value={String(items.length)} />
          </dl>

          {items.length === 0 ? (
            <AdminEmptyPanel
              tone="success"
              title="No signal is firing"
              description="Every probed subsystem is healthy, no queue holds a dead letter, and no security or payment event is outstanding."
            />
          ) : (
            <ul className="space-y-3">
              {items.map((item) => {
                const tab = KIND_TO_TAB[item.kind];
                return (
                  <li key={item.id}>
                    <Card className="border-border transition-colors hover:border-brand-200">
                      <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={cn(
                                'rounded-full px-2 py-0.5 text-xs font-bold uppercase',
                                SEVERITY_STYLES[item.severity],
                              )}
                            >
                              {item.severity}
                            </span>
                            <span className="text-sm font-semibold text-ink">{item.title}</span>
                            <span className="text-xs text-ink-muted">· {item.kind}</span>
                          </div>
                          {item.detail && (
                            <p className="text-sm text-ink-secondary">{item.detail}</p>
                          )}
                          <p className="text-xs text-ink-muted">
                            Signal id <span className="font-mono">{item.id}</span>
                          </p>
                        </div>

                        <div className="flex shrink-0 items-center gap-2">
                          {tab && onNavigateTab ? (
                            <Button variant="primary" size="sm" onClick={() => onNavigateTab(tab)}>
                              Open {tab}
                              <ArrowRight className="ml-1.5 size-3.5" />
                            </Button>
                          ) : (
                            <span className="text-xs text-ink-muted">
                              Listed here; no console tab yet
                            </span>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}

          <p className="flex items-start gap-2 text-xs text-ink-muted">
            <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
            {data.note}
          </p>
        </>
      )}
    </div>
  );
}

function SignalStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <dt className="text-2xs font-semibold uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className="mt-1 text-sm font-bold text-ink">{value}</dd>
    </div>
  );
}
