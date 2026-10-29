/**
 * Platform Operations & Maintenance Controller Tab
 *
 * Binds to:
 * - GET  /api/admin/health-summary            (maintenance mode & revision)
 * - POST /api/admin/system-health-settings    (atomic maintenance toggle commit)
 * - POST /api/admin/operations/backup         (verified database backup run)
 * - POST /api/admin/operations/cache-clear    (real cache invalidation)
 * - GET  /api/admin/operations/system-status  (live process/database telemetry)
 *
 * INVARIANTS
 * 1. NO FABRICATED TELEMETRY. Every value rendered here comes from a server
 *    response. There is no hardcoded "engine version", "sync latency", or
 *    "last backup" placeholder: an operation that has not run shows as not
 *    measured instead of borrowing a plausible-looking default.
 * 2. NO SWALLOWED FAILURES. Every request is wrapped in try/catch/finally, a
 *    failure keeps the operation visibly failed, and the operator is offered a
 *    retry. A success message is only ever shown for a server-confirmed result.
 */

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { get, post, normalizeError } from '@/lib/api-client';
import {
  Wrench,
  AlertTriangle,
  CheckCircle2,
  Database,
  RefreshCw,
  ShieldAlert,
  Download,
  Trash2,
  Activity,
} from 'lucide-react';

interface SystemStatus {
  status?: 'HEALTHY' | 'DEGRADED';
  timestamp?: string;
  process?: {
    pid?: number;
    nodeVersion?: string;
    uptimeSeconds?: number;
    memoryBytes?: { rss?: number; heapTotal?: number; heapUsed?: number; external?: number };
  };
  database?: { reachable?: boolean; latencyMs?: number; timedOut?: boolean; errorCode?: string | null };
  pool?: { connectionLimit?: number | null; openConnections?: number | null; idleConnections?: number | null; queuedRequests?: number | null } | null;
  caches?: { aiPromptCacheEntries?: number | null };
  limitations?: string[];
}

interface BackupResult {
  backupId?: string;
  timestamp?: string;
  startedAt?: string;
  sizeBytes?: number;
  artifact?: { name?: string; sizeBytes?: number; sha256?: string; encrypted?: boolean; compressed?: boolean };
  subsystem?: { status?: string; verification?: string; recoveryPoints?: number | null };
  warnings?: string[];
}

interface CacheLayerResult {
  layer: string;
  status: 'CLEARED' | 'FAILED';
  entriesCleared: number | null;
  note?: string;
  errorCode?: string;
}

interface CacheClearResult {
  clearedEntries?: number;
  timestamp?: string;
  layers?: CacheLayerResult[];
  unsupported?: Array<{ layer: string; reason: string }>;
  result?: string;
}

interface Feedback {
  type: 'success' | 'error';
  text: string;
  details?: string[];
}

type RetryableOperation = 'health' | 'status' | 'backup' | 'cache';

function formatBytes(value?: number | null): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 'not measured';
  if (value < 1024) return `${value} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let scaled = value / 1024;
  let unitIndex = 0;
  while (scaled >= 1024 && unitIndex < units.length - 1) {
    scaled /= 1024;
    unitIndex += 1;
  }
  return `${scaled.toFixed(1)} ${units[unitIndex]}`;
}

function formatDuration(seconds?: number): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return 'not measured';
  const total = Math.floor(seconds);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${total % 60}s`;
}

export function AdminOperationsTab() {
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState(
    'System is under scheduled maintenance. Please check back shortly.'
  );
  const [expectedRevision, setExpectedRevision] = useState(0);
  const [savingMaintenance, setSavingMaintenance] = useState(false);
  const [maintenanceFeedback, setMaintenanceFeedback] = useState<Feedback | null>(null);

  const [backingUp, setBackingUp] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(false);

  const [backupResult, setBackupResult] = useState<BackupResult | null>(null);
  const [cacheResult, setCacheResult] = useState<CacheClearResult | null>(null);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [failedOperation, setFailedOperation] = useState<RetryableOperation | null>(null);

  const reportFailure = (text: string, operation: RetryableOperation, details?: string[]) => {
    setFeedback({ type: 'error', text, details });
    setFailedOperation(operation);
  };

  const reportSuccess = (text: string) => {
    setFeedback({ type: 'success', text });
    setFailedOperation(null);
  };

  const loadHealthSummary = useCallback(async () => {
    try {
      const res = await get<{
        revision?: number;
        settings?: { maintenanceMode?: boolean; maintenanceMessage?: string };
      }>('/admin/health-summary');

      if (!res) {
        throw new Error('The server returned no maintenance configuration.');
      }
      setExpectedRevision(Number(res.revision) || 0);
      if (res.settings) {
        setMaintenanceMode(res.settings.maintenanceMode === true);
        if (res.settings.maintenanceMessage) {
          setMaintenanceMessage(res.settings.maintenanceMessage);
        }
      }
      if (failedOperation === 'health') setFailedOperation(null);
    } catch (err) {
      reportFailure(
        `Failed to load the maintenance configuration: ${normalizeError(err).message}`,
        'health'
      );
    }
  }, [failedOperation]);

  const loadSystemStatus = useCallback(async () => {
    setLoadingStatus(true);
    setStatusError(null);
    try {
      const res = await get<SystemStatus>('/admin/operations/system-status');
      if (!res) throw new Error('The server returned no telemetry.');
      setSystemStatus(res);
      if (failedOperation === 'status') setFailedOperation(null);
    } catch (err) {
      // Keep the previous reading visible but mark it stale: silently falling
      // back to placeholder values is what this tab used to do.
      setStatusError(normalizeError(err).message);
      reportFailure(`Failed to load live system status: ${normalizeError(err).message}`, 'status');
    } finally {
      setLoadingStatus(false);
    }
  }, [failedOperation]);

  useEffect(() => {
    void loadHealthSummary();
    void loadSystemStatus();
    // Intentionally runs once on mount; the loaders are retried explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSaveMaintenance = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingMaintenance(true);
    setMaintenanceFeedback(null);
    try {
      const res = await post<{ success?: boolean; settings?: unknown; revision?: number }>(
        '/admin/system-health-settings',
        {
          maintenanceMode,
          maintenanceMessage,
          expectedRevision,
        }
      );

      if (typeof res?.revision === 'number') {
        setExpectedRevision(res.revision);
      } else {
        // The revision is server-owned; refresh instead of guessing a value
        // that would make the next optimistic-concurrency check fail.
        await loadHealthSummary();
      }

      setMaintenanceFeedback({
        type: 'success',
        text: maintenanceMode
          ? 'Platform Maintenance Mode is now ACTIVE. Public routes blocked; Super Admins retain bypass.'
          : 'Platform Maintenance Mode DEACTIVATED. Full public traffic restored.',
      });
    } catch (err) {
      setMaintenanceFeedback({
        type: 'error',
        text: `Failed to update maintenance configuration: ${normalizeError(err).message}`,
      });
    } finally {
      setSavingMaintenance(false);
    }
  };

  const handleTriggerBackup = async () => {
    if (backingUp) return;
    setBackingUp(true);
    setFeedback(null);
    try {
      const res = await post<BackupResult & { success?: boolean; warnings?: string[] }>(
        '/admin/operations/backup',
        {}
      );
      if (!res?.backupId) {
        throw new Error('The server did not confirm a backup artifact identifier.');
      }
      setBackupResult(res);
      reportSuccess(
        `Verified backup ${res.backupId} completed (${formatBytes(res.sizeBytes)}).`
      );
      if (Array.isArray(res.warnings) && res.warnings.length) {
        setFeedback({ type: 'error', text: 'The backup completed with warnings.', details: res.warnings });
      }
      await loadSystemStatus();
    } catch (err) {
      reportFailure(`Backup did not complete: ${normalizeError(err).message}`, 'backup');
    } finally {
      setBackingUp(false);
    }
  };

  const handleClearCache = async () => {
    if (clearingCache) return;
    setClearingCache(true);
    setFeedback(null);
    try {
      const res = await post<CacheClearResult & { success?: boolean }>('/admin/operations/cache-clear', {});
      setCacheResult(res);
      const cleared = res?.layers?.filter(layer => layer.status === 'CLEARED').length ?? 0;
      if (res?.success === false) {
        throw new Error(
          `Only ${cleared} of ${res?.layers?.length ?? 0} cache layers were cleared.`
        );
      }
      reportSuccess(
        `Cache invalidation completed: ${cleared} layer(s) cleared, ${res?.clearedEntries ?? 0} cached entr${
          (res?.clearedEntries ?? 0) === 1 ? 'y' : 'ies'
        } purged.`
      );
      await loadSystemStatus();
    } catch (err) {
      reportFailure(`Cache clearing did not fully succeed: ${normalizeError(err).message}`, 'cache');
    } finally {
      setClearingCache(false);
    }
  };

  const retryFailedOperation = () => {
    const operation = failedOperation;
    setFailedOperation(null);
    setFeedback(null);
    if (operation === 'health') void loadHealthSummary();
    else if (operation === 'status') void loadSystemStatus();
    else if (operation === 'backup') void handleTriggerBackup();
    else if (operation === 'cache') void handleClearCache();
  };

  const memory = systemStatus?.process?.memoryBytes;
  const database = systemStatus?.database;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-ink flex items-center gap-2">
          <Wrench className="size-5 text-brand-600" />
          Platform Operations &amp; Maintenance Controller
        </h2>
        <p className="text-xs text-ink-muted">
          Maintenance barrier, verified MariaDB backup runs, cache invalidation and live infrastructure telemetry.
        </p>
      </div>

      {feedback && (
        <div
          role={feedback.type === 'error' ? 'alert' : 'status'}
          aria-live="polite"
          className={cn(
            'rounded-xl p-3 text-xs border flex items-start justify-between gap-3 animate-[fade-in_150ms_ease-out]',
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          )}
        >
          <div className="flex items-start gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="size-4 text-emerald-600 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="size-4 text-rose-600 shrink-0 mt-0.5" />
            )}
            <div className="space-y-1">
              <p>{feedback.text}</p>
              {feedback.details?.length ? (
                <ul className="list-disc pl-4 space-y-0.5">
                  {feedback.details.map(detail => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {failedOperation && (
              <button
                type="button"
                onClick={retryFailedOperation}
                className="font-bold underline underline-offset-2 hover:opacity-80"
              >
                Retry
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setFeedback(null);
                setFailedOperation(null);
              }}
              className="font-bold opacity-70 hover:opacity-100"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* ─── Global Maintenance Controller ─── */}
      <Card className={cn('border-2 transition-colors', maintenanceMode ? 'border-amber-500 bg-amber-50/20' : 'border-border')}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <ShieldAlert className={cn('size-5', maintenanceMode ? 'text-amber-600' : 'text-ink-muted')} />
              <div>
                <CardTitle className="text-sm">Platform Maintenance Mode Barrier</CardTitle>
                <p className="text-xs text-ink-muted">Blocks public traffic with custom splash while granting verified admin bypass.</p>
              </div>
            </div>
            <span
              className={cn(
                'rounded-full px-2.5 py-0.5 text-xs font-black uppercase tracking-wider',
                maintenanceMode ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
              )}
            >
              {maintenanceMode ? 'BARRIER ACTIVE' : 'NORMAL TRAFFIC'}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveMaintenance} className="space-y-4">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="maintenanceToggle"
                checked={maintenanceMode}
                onChange={(e) => setMaintenanceMode(e.target.checked)}
                className="size-5 rounded text-amber-600 focus:ring-amber-500 cursor-pointer"
              />
              <label htmlFor="maintenanceToggle" className="text-xs font-bold text-ink cursor-pointer">
                Enable Scheduled Platform Maintenance Barrier
              </label>
            </div>

            <div>
              <label htmlFor="maintenanceMessage" className="text-xs font-semibold text-ink">Public Notice Message</label>
              <Input
                id="maintenanceMessage"
                value={maintenanceMessage}
                onChange={(e) => setMaintenanceMessage(e.target.value)}
                placeholder="Enter message to display to visitors during maintenance..."
                className="mt-1 text-xs"
                disabled={!maintenanceMode}
              />
              <p className="mt-1 text-[11px] text-ink-muted">
                Visitors will see this announcement. Authenticated administrators automatically bypass this barrier.
              </p>
            </div>

            {maintenanceFeedback && (
              <p
                role={maintenanceFeedback.type === 'error' ? 'alert' : 'status'}
                className={cn(
                  'rounded-lg p-2 text-xs',
                  maintenanceFeedback.type === 'error'
                    ? 'bg-rose-50 text-rose-800 border border-rose-200'
                    : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                )}
              >
                {maintenanceFeedback.text}
              </p>
            )}

            <div className="flex justify-end">
              <Button
                type="submit"
                variant={maintenanceMode ? 'destructive' : 'primary'}
                size="sm"
                loading={savingMaintenance}
              >
                {maintenanceMode ? 'Enforce Maintenance Barrier' : 'Save Maintenance Settings'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* ─── Live telemetry ─── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="size-4 text-brand-600" />
              Live System Status
              {systemStatus?.status && (
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] font-black uppercase',
                    systemStatus.status === 'HEALTHY'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  )}
                >
                  {systemStatus.status}
                </span>
              )}
            </CardTitle>
            <Button variant="outline" size="xs" onClick={() => void loadSystemStatus()} loading={loadingStatus}>
              <RefreshCw className="size-3 mr-1" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="text-xs space-y-2">
          {statusError && (
            <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-rose-800">
              {statusError} {systemStatus ? 'The reading below is the last successful measurement.' : ''}
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono text-[11px]">
            <div className="rounded-lg bg-neutral-50 dark:bg-neutral-800 p-3 space-y-1">
              <div>Process uptime: {formatDuration(systemStatus?.process?.uptimeSeconds)}</div>
              <div>Resident memory (RSS): {formatBytes(memory?.rss)}</div>
              <div>Heap used / total: {formatBytes(memory?.heapUsed)} / {formatBytes(memory?.heapTotal)}</div>
              <div>Node runtime: {systemStatus?.process?.nodeVersion || 'not measured'}</div>
            </div>
            <div className="rounded-lg bg-neutral-50 dark:bg-neutral-800 p-3 space-y-1">
              <div>
                Database: {typeof database?.reachable === 'boolean'
                  ? database.reachable ? 'reachable' : 'UNREACHABLE'
                  : 'not measured'}
              </div>
              <div>Database probe latency: {typeof database?.latencyMs === 'number' ? `${database.latencyMs} ms` : 'not measured'}</div>
              <div>
                Pool: {systemStatus?.pool
                  ? `${systemStatus.pool.openConnections ?? '—'} open / ${systemStatus.pool.connectionLimit ?? '—'} limit`
                  : 'not measured'}
              </div>
              <div>AI prompt cache entries: {systemStatus?.caches?.aiPromptCacheEntries ?? 'not measured'}</div>
            </div>
          </div>
          {systemStatus?.timestamp && (
            <p className="text-[10px] text-ink-muted">
              Measured at {new Date(systemStatus.timestamp).toLocaleString()}
            </p>
          )}
          {systemStatus?.limitations?.length ? (
            <ul className="list-disc pl-4 text-[11px] text-amber-800">
              {systemStatus.limitations.map(limitation => (
                <li key={limitation}>{limitation}</li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>

      {/* ─── Backup & cache operations ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Database className="size-4 text-emerald-600" />
              Verified Database Backup
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <p className="text-ink-muted">
              Runs the deployment&apos;s DR backup pipeline (encrypted dump, structural verification and checksum
              sidecar) and verifies the artifact on disk before reporting success.
            </p>
            <div className="rounded-lg bg-neutral-50 dark:bg-neutral-800 p-3 space-y-1 font-mono text-[11px]">
              {backupResult ? (
                <>
                  <div>Artifact: {backupResult.artifact?.name || backupResult.backupId}</div>
                  <div>Size: {formatBytes(backupResult.sizeBytes)}</div>
                  <div>SHA-256: {backupResult.artifact?.sha256 ? `${backupResult.artifact.sha256.slice(0, 24)}…` : 'not reported'}</div>
                  <div>Encrypted: {backupResult.artifact?.encrypted ? 'yes' : 'no'}</div>
                  <div>Verification: {backupResult.subsystem?.verification || 'not reported'}</div>
                  <div>Completed: {backupResult.timestamp ? new Date(backupResult.timestamp).toLocaleString() : 'not reported'}</div>
                </>
              ) : (
                <div>No backup has been run in this session.</div>
              )}
            </div>
            <div className="pt-2 flex justify-end">
              <Button variant="outline" size="sm" onClick={handleTriggerBackup} loading={backingUp} disabled={backingUp}>
                <Download className="size-3.5 mr-1" />
                Run Verified Backup
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <RefreshCw className="size-4 text-brand-600" />
              Application Cache Invalidation
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <p className="text-ink-muted">
              Invalidates the process-local caches that actually exist (health snapshots and the AI engine prompt
              cache) and reports unsupported layers instead of claiming they were cleared.
            </p>
            <div className="rounded-lg bg-neutral-50 dark:bg-neutral-800 p-3 space-y-1 font-mono text-[11px]">
              {cacheResult ? (
                <>
                  <div>Cleared at: {cacheResult.timestamp ? new Date(cacheResult.timestamp).toLocaleString() : 'not reported'}</div>
                  <div>Entries purged: {cacheResult.clearedEntries ?? 'not measurable'}</div>
                  {(cacheResult.layers || []).map(layer => (
                    <div key={layer.layer}>
                      {layer.layer}: {layer.status}
                      {typeof layer.entriesCleared === 'number' ? ` (${layer.entriesCleared})` : ''}
                    </div>
                  ))}
                  {(cacheResult.unsupported || []).map(layer => (
                    <div key={layer.layer} className="text-ink-muted">{layer.layer}: not cached</div>
                  ))}
                </>
              ) : (
                <div>Cache invalidation has not been run in this session.</div>
              )}
            </div>
            <div className="pt-2 flex justify-end">
              <Button variant="outline" size="sm" onClick={handleClearCache} loading={clearingCache} disabled={clearingCache}>
                <Trash2 className="size-3.5 mr-1" />
                Purge Process Caches
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
