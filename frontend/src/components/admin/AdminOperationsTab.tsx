/**
 * Platform operations: the maintenance barrier and the service-configuration summary.
 *
 * What it used to be: a "MariaDB Hot Backup" card and a "Purge Node Caches" card whose
 * buttons posted to `/api/admin/operations/backup` and `/api/admin/operations/cache-clear`
 * — routes that do not exist — swallowed the failure with `.catch(() => {})`, then announced
 * success after a `setTimeout` ("MariaDB hot backup snapshot completed successfully", with a
 * fabricated "Last Verified Snapshot: Today, 02:00 UTC"). The sync telemetry beside them
 * (`syncLatencyMs: 2`, `bufferedEvents: 0`) was a local constant wearing a metrics costume.
 * A maintenance console that lies about backups is the single most dangerous lie an admin
 * console can tell, so both cards are gone: backup and cache invalidation are runbook
 * operations with no admin API (`OI-OPS-1`), and the page says exactly that.
 *
 * Endpoints used:
 *   GET  /api/admin/health-summary          revision + maintenance settings + service config summary
 *   POST /api/admin/system-health-settings  revision-guarded, transactional, audited
 *
 * The maintenance write is the same one the backend commits as one MariaDB transaction
 * (`index.js:3502`): settings, public projection and the audit row move together or not at all.
 */

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Database, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { get, post } from '@/lib/api-client';
import { AdminEmptyPanel, AdminErrorPanel, AdminLoadingPanel } from './AdminDataState';
import { useAdminResource } from './use-admin-resource';
import { describeAdminFailure } from './admin-data-state';

interface HealthSummaryPayload {
  success?: boolean;
  checkedAt?: string;
  revision?: number;
  services?: {
    backend?: { reachable?: boolean };
    database?: { engine?: string; authoritative?: boolean };
    firebaseAdmin?: { configured?: boolean };
    aiProviders?: Record<string, { configured?: boolean }>;
    payments?: Record<string, { configured?: boolean }>;
  };
  settings?: { maintenanceMode?: boolean; maintenanceMessage?: string };
}

export function AdminOperationsTab() {
  const load = useCallback(
    (signal: AbortSignal) => get<HealthSummaryPayload>('/admin/health-summary', undefined, { signal }),
    [],
  );
  const resource = useAdminResource(load);

  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  // The form is a local edit buffer of the stored settings; it is filled when a read lands,
  // and every save is guarded by the revision that buffer was filled from.
  const revision = Number(resource.data?.revision || 0);
  useEffect(() => {
    if (resource.status === 'ready' && resource.data) {
      setMaintenanceMode(resource.data.settings?.maintenanceMode === true);
      setMaintenanceMessage(resource.data.settings?.maintenanceMessage ?? '');
    }
  }, [resource.status, resource.data]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      const response = await post<{ success?: boolean; revision?: number }>(
        '/admin/system-health-settings',
        {
          maintenanceMode,
          maintenanceMessage,
          expectedRevision: revision,
        },
      );
      setNotice({
        tone: 'success',
        text: maintenanceMode
          ? `Maintenance barrier is active (revision ${response?.revision ?? revision + 1}). Public traffic is blocked; authenticated administrators bypass it.`
          : `Maintenance barrier lifted (revision ${response?.revision ?? revision + 1}). Full public traffic restored.`,
      });
      resource.reload();
    } catch (error) {
      const failure = describeAdminFailure(error);
      setNotice({
        tone: 'error',
        text: `${failure.message} (${failure.code}${failure.requestId ? ` · request ${failure.requestId}` : ''})`,
      });
    } finally {
      setSaving(false);
    }
  };

  const services = resource.data?.services ?? null;
  const aiConfigured = Object.values(services?.aiProviders ?? {}).filter((entry) => entry?.configured).length;
  const aiTotal = Object.keys(services?.aiProviders ?? {}).length;
  const paymentsConfigured = Object.values(services?.payments ?? {}).filter((entry) => entry?.configured).length;
  const paymentsTotal = Object.keys(services?.payments ?? {}).length;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-ink">Platform operations</h2>
        <p className="text-xs text-ink-muted">
          The maintenance barrier and the service-configuration summary the backend reports.
          Backup and cache invalidation are runbook operations — see below.
        </p>
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
          {notice.tone === 'success' ? (
            <ShieldCheck className="mt-0.5 size-4 shrink-0" />
          ) : (
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          )}
          <span className="flex-1">{notice.text}</span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="min-h-11 cursor-pointer px-2 text-2xs font-bold uppercase focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 sm:min-h-9"
          >
            Dismiss
          </button>
        </div>
      )}

      {resource.status === 'loading' && resource.data === null && (
        <AdminLoadingPanel label="Reading the health summary…" />
      )}
      {resource.status === 'failed' && resource.error && (
        <AdminErrorPanel
          title="The health summary could not be read"
          error={resource.error}
          onRetry={resource.reload}
        />
      )}
      {resource.status === 'ready' && !resource.data?.settings && (
        <AdminEmptyPanel
          title="No stored maintenance configuration"
          description="The health summary returned no settings block. Saving below would create the first one."
        />
      )}

      {resource.data?.settings !== undefined && (
        <Card className={cn('border-2 transition-colors', maintenanceMode ? 'border-warning-100 bg-warning-50/40' : 'border-border')}>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <ShieldAlert className={cn('size-5', maintenanceMode ? 'text-warning-700' : 'text-ink-muted')} />
                <div>
                  <CardTitle className="text-sm">Maintenance barrier</CardTitle>
                  <p className="text-xs text-ink-muted">
                    Stored in <span className="font-mono">system_settings</span> at revision {revision}; writes are
                    transactional and audited by the server.
                  </p>
                </div>
              </div>
              <span
                className={cn(
                  'rounded-full border px-2.5 py-0.5 text-2xs font-bold uppercase tracking-wide',
                  maintenanceMode
                    ? 'border-warning-100 bg-warning-50 text-warning-700'
                    : 'border-success-100 bg-success-50 text-success-700',
                )}
              >
                {maintenanceMode ? 'barrier active' : 'normal traffic'}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={save} className="space-y-4">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="maintenanceToggle"
                  checked={maintenanceMode}
                  onChange={(event) => setMaintenanceMode(event.target.checked)}
                  className="size-5 rounded text-warning-700 focus:ring-warning-500 cursor-pointer"
                />
                <label htmlFor="maintenanceToggle" className="cursor-pointer text-xs font-bold text-ink">
                  Block public traffic until this is switched off
                </label>
              </div>

              <div>
                <label htmlFor="maintenanceMessage" className="text-xs font-semibold text-ink">
                  Public notice
                </label>
                <Input
                  id="maintenanceMessage"
                  value={maintenanceMessage}
                  onChange={(event) => setMaintenanceMessage(event.target.value)}
                  placeholder="What visitors see while the barrier is up"
                  className="mt-1 h-11 text-xs sm:h-9"
                  disabled={!maintenanceMode}
                  required={maintenanceMode}
                  maxLength={500}
                />
                <p className="mt-1 text-2xs text-ink-muted">
                  Required while the barrier is up (the server rejects an empty message with
                  <span className="font-mono"> INVALID_MAINTENANCE_MESSAGE</span>). Authenticated administrators
                  bypass it; every save is recorded in the admin audit trail.
                </p>
              </div>

              <div className="flex justify-end">
                <Button
                  type="submit"
                  variant={maintenanceMode ? 'destructive' : 'primary'}
                  size="sm"
                  loading={saving}
                  disabled={maintenanceMode && maintenanceMessage.trim().length === 0}
                  className="min-h-11 sm:min-h-9"
                >
                  {maintenanceMode ? 'Enforce maintenance barrier' : 'Save maintenance settings'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {services && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Database className="size-4 text-brand-600" />
              Service configuration summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <SummaryRow label="Backend" value={services.backend?.reachable === true ? 'reachable' : 'unknown'} good={services.backend?.reachable === true} />
              <SummaryRow
                label="Configuration store"
                value={`${services.database?.engine ?? 'unknown'}${services.database?.authoritative === true ? ' (authoritative)' : ''}`}
                good={services.database?.authoritative === true}
              />
              <SummaryRow
                label="Identity provider"
                value={services.firebaseAdmin?.configured === true ? 'configured' : 'not configured'}
                good={services.firebaseAdmin?.configured === true}
              />
              <SummaryRow
                label="AI providers"
                value={`${aiConfigured} of ${aiTotal} configured`}
                good={aiTotal > 0 && aiConfigured === aiTotal}
              />
              <SummaryRow
                label="Payment providers"
                value={`${paymentsConfigured} of ${paymentsTotal} configured`}
                good={paymentsTotal > 0 && paymentsConfigured === paymentsTotal}
              />
              <SummaryRow
                label="Checked at"
                value={resource.data?.checkedAt ?? 'unknown'}
                good={Boolean(resource.data?.checkedAt)}
              />
            </dl>
            <p className="mt-3 text-2xs text-ink-muted">
              Provider details, per-service probes and the API matrix live on the{' '}
              <span className="font-semibold">Platform health</span> tab. Outbox and dead-letter
              state lives on <span className="font-semibold">Outbox &amp; dead letters</span>.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Backup &amp; cache invalidation — runbook, not console</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs text-ink-secondary">
          <p>
            This console offers no backup or cache-purge control because the platform exposes no
            such API: the buttons that used to be here posted to
            <span className="font-mono"> /api/admin/operations/backup</span> and
            <span className="font-mono"> /api/admin/operations/cache-clear</span>, neither of which
            is a route, and reported success anyway (<span className="font-mono">OI-OPS-1</span>).
          </p>
          <p>
            Backup and restore are executed from the deployment host following{' '}
            <span className="font-semibold">DEPLOYMENT-RUNBOOK.md</span> §4, and the rollback drill
            in §7 records the restore path end to end. Operational-status staleness is cleared with
            <span className="font-mono"> POST /api/platform/operational-status/refresh</span> from the
            Platform health tab.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryRow({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <div className="rounded-lg border border-border px-2.5 py-1.5">
      <dt className="text-2xs font-semibold uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className={cn('mt-0.5 text-xs font-bold', good ? 'text-success-700' : 'text-ink-secondary')}>{value}</dd>
    </div>
  );
}
