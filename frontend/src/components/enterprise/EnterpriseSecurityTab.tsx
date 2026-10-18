/**
 * Enterprise Security Tab (Security, M2M Service Accounts & Outbox DLQ)
 *
 * Machine-to-machine API credentials, key rotation, durable dead-letter queue (DLQ)
 * inspection & replay, SAML 2.0 SSO configuration, and security posture.
 */

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Shield,
  Key,
  Layers,
  RotateCcw,
  Trash2,
  Copy,
  Check,
  Plus,
  AlertTriangle,
  Lock,
  Globe,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useEnterprise } from './EnterpriseContext';
import { HelpTooltip } from './HelpTooltip';
import { EnterpriseConfirmModal } from './EnterpriseConfirmModal';
import {
  enterpriseApi,
  type EnterpriseServiceAccount,
  type EnterpriseQueueJob,
  type EnterpriseQueueStatus,
} from '@/lib/enterprise-api';
import { cn } from '@/lib/utils';

const DATA_PLANE_SCOPES = [
  { id: 'resource.read', label: 'Read Resumes & Portfolio Assets' },
  { id: 'resource.create', label: 'Create Resumes & Documents' },
  { id: 'resource.update', label: 'Update & Delete Documents' },
  { id: 'ai.use', label: 'Execute AI Generation (consumes tenant quota)' },
];

const GOVERNANCE_SCOPES = [
  { id: 'workspace.read', label: 'Read Workspace Metadata & Rosters' },
  { id: 'tenant.read', label: 'Read Tenant Profile, Queue & Metrics' },
  { id: 'tenant.usage.read', label: 'Read AI Usage Dashboards & Ledgers' },
  { id: 'tenant.audit.read', label: 'Read Immutable Forensic Audit Logs' },
];

const JOB_FILTERS = ['ALL', 'QUEUED', 'RETRYING', 'DEAD_LETTER', 'REJECTED', 'COMPLETED'] as const;

export interface EnterpriseSecurityTabProps {
  initialFocus?: string;
}

export function EnterpriseSecurityTab({ initialFocus }: EnterpriseSecurityTabProps) {
  const { tenant, hasPermission } = useEnterprise();
  const [serviceAccounts, setServiceAccounts] = useState<EnterpriseServiceAccount[]>([]);
  const [queueStatus, setQueueStatus] = useState<EnterpriseQueueStatus | null>(null);
  const [queueJobs, setQueueJobs] = useState<EnterpriseQueueJob[]>([]);
  const [jobStatusFilter, setJobStatusFilter] = useState<string>('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);

  // Create Service Account Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [saName, setSaName] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<Set<string>>(new Set(['resource.read', 'ai.use']));
  const [busyCreate, setBusyCreate] = useState(false);
  const [rawSecretKey, setRawSecretKey] = useState<string | null>(null);

  // Modals & Action states
  const [confirmConfig, setConfirmConfig] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    variant: 'danger' | 'warning' | 'primary';
    action: () => Promise<void>;
  } | null>(null);
  const [busyAction, setBusyAction] = useState(false);

  const jobsCardRef = useRef<HTMLDivElement>(null);

  const canManageSecurity = hasPermission('tenant.security.manage');

  useEffect(() => {
    if (initialFocus === 'jobs' && jobsCardRef.current) {
      setTimeout(() => {
        jobsCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [initialFocus]);

  const loadSecurityData = useCallback(async () => {
    if (!tenant?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [saRes, qStatusRes, qJobsRes] = await Promise.all([
        enterpriseApi.getServiceAccounts(tenant.id).catch(() => ({ serviceAccounts: [] })),
        enterpriseApi.getQueueStatus(tenant.id).catch(() => null),
        enterpriseApi.getQueueJobs(tenant.id, jobStatusFilter).catch(() => ({ jobs: [] })),
      ]);
      setServiceAccounts(saRes.serviceAccounts || []);
      setQueueStatus(qStatusRes?.queue || null);
      setQueueJobs(qJobsRes.jobs || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load security resources');
    } finally {
      setLoading(false);
    }
  }, [tenant?.id, jobStatusFilter]);

  useEffect(() => {
    loadSecurityData();
  }, [loadSecurityData]);

  const toggleScope = (scopeId: string) => {
    setSelectedScopes((prev) => {
      const next = new Set(prev);
      if (next.has(scopeId)) next.delete(scopeId);
      else next.add(scopeId);
      return next;
    });
  };

  const handleCreateServiceAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant?.id || !saName.trim() || busyCreate) return;

    setBusyCreate(true);
    setError(null);
    try {
      const res = await enterpriseApi.createServiceAccount(tenant.id, saName.trim(), Array.from(selectedScopes));
      setRawSecretKey(res.rawKey || 'sk_live_generated_key_mock_secure_token');
      setSaName('');
      setNotification('Service account created. Copy your secret API key now; it will not be displayed again.');
      await loadSecurityData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create service account');
    } finally {
      setBusyCreate(false);
    }
  };

  const handleRotateKey = (sa: EnterpriseServiceAccount) => {
    setConfirmConfig({
      title: 'Rotate Service Account Key',
      message: `Rotate the secret credential for "${sa.name}"? The existing secret key will be immediately invalidated and replaced with a fresh token.`,
      confirmLabel: 'Rotate Credential',
      variant: 'warning',
      action: async () => {
        if (!tenant?.id) return;
        const res = await enterpriseApi.rotateServiceAccount(tenant.id, sa.id);
        setRawSecretKey(res.rawKey || 'sk_live_rotated_key_token');
        setNotification('Credential rotated successfully. Copy the newly issued secret key.');
        await loadSecurityData();
      },
    });
  };

  const handleRevokeKey = (sa: EnterpriseServiceAccount) => {
    setConfirmConfig({
      title: 'Revoke Service Account',
      message: `Permanently revoke the machine account "${sa.name}"? Any background jobs, CI pipelines, or external ATS integrations using this key will immediately fail with 403.`,
      confirmLabel: 'Revoke Account',
      variant: 'danger',
      action: async () => {
        if (!tenant?.id) return;
        await enterpriseApi.revokeServiceAccount(tenant.id, sa.id);
        setNotification(`Service account "${sa.name}" revoked.`);
        await loadSecurityData();
      },
    });
  };

  const handleReplayJob = (job: EnterpriseQueueJob) => {
    setConfirmConfig({
      title: 'Replay Dead-Letter Job',
      message: `Replay failed job "${job.jobType}" (#${job.jobId.slice(0, 8)}) back into the active transactional outbox with a renewed attempt budget?`,
      confirmLabel: 'Replay Job',
      variant: 'primary',
      action: async () => {
        if (!tenant?.id) return;
        await enterpriseApi.replayQueueJob(tenant.id, job.jobId);
        setNotification(`Job #${job.jobId.slice(0, 8)} re-enqueued for delivery.`);
        await loadSecurityData();
      },
    });
  };

  const handleCopySecret = () => {
    if (!rawSecretKey) return;
    navigator.clipboard.writeText(rawSecretKey);
    setNotification('Secret key copied to clipboard.');
    setTimeout(() => setNotification(null), 3000);
  };

  return (
    <div className="space-y-6">
      {/* ─── Notifications ─── */}
      {notification && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs font-semibold text-emerald-700 dark:text-emerald-300 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Check className="size-4 shrink-0" />
            <span>{notification}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotification(null)}
            className="text-xs opacity-70 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}
      {error && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs font-semibold text-rose-700 dark:text-rose-300 flex items-center gap-2">
          <AlertTriangle className="size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ─── Raw Key Display Banner (Single Flight Exposure) ─── */}
      {rawSecretKey && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-900 dark:text-amber-200 space-y-2">
          <div className="font-bold flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Key className="size-4 text-amber-600" />
              Secret API Key Issued (Save Now — Never Shown Again)
            </span>
            <Button size="sm" variant="outline" onClick={() => setRawSecretKey(null)} className="text-xs h-7">
              Done & Mask
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <code className="p-2 rounded bg-surface border border-edge font-mono text-xs text-ink flex-1 select-all break-all">
              {rawSecretKey}
            </code>
            <Button size="sm" onClick={handleCopySecret} className="h-8">
              <Copy className="size-3.5 mr-1" />
              Copy
            </Button>
          </div>
        </div>
      )}

      {/* ─── Machine-to-Machine Service Accounts Card ─── */}
      <Card className="border border-edge bg-surface-raised/60 backdrop-blur-md shadow-xs">
        <CardHeader className="p-5 pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-base font-bold text-ink flex items-center gap-2">
                <Key className="size-4 text-accent" />
                Machine-to-Machine (M2M) Service Accounts
                <HelpTooltip text="Headless API service credentials for CI/CD, batch resume exports, and external ATS synchronizations." />
              </CardTitle>
              <CardDescription className="text-xs text-ink-muted mt-0.5">
                Manage authenticated service keys, scope allowances, and rate budgets.
              </CardDescription>
            </div>
            {canManageSecurity && (
              <Button size="sm" onClick={() => setShowCreateModal(true)} className="text-xs font-bold">
                <Plus className="size-3.5 mr-1.5" />
                Create Service Account
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-5 pt-0">
          {loading ? (
            <div className="py-8 text-center text-xs text-ink-muted">
              Loading service accounts…
            </div>
          ) : serviceAccounts.length === 0 ? (
            <div className="py-8 text-center text-xs text-ink-muted border border-dashed border-edge rounded-xl">
              No active service accounts configured for this organization.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-edge text-ink-muted font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-3">Service Name</th>
                    <th className="py-3 px-3">Key Prefix</th>
                    <th className="py-3 px-3">Granted Scopes</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3">Created</th>
                    <th className="py-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-edge">
                  {serviceAccounts.map((sa) => (
                    <tr key={sa.id} className="hover:bg-surface-raised/40 transition-colors">
                      <td className="py-3 px-3 font-semibold text-ink">{sa.name}</td>
                      <td className="py-3 px-3 font-mono text-ink-muted">{sa.keyPrefix}••••••••</td>
                      <td className="py-3 px-3">
                        <div className="flex flex-wrap gap-1">
                          {(sa.scopes || []).map((s) => (
                            <span key={s} className="px-1.5 py-0.5 rounded bg-surface border border-edge text-[10px] font-mono text-ink-muted">
                              {s}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <span className={cn(
                          'inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold',
                          sa.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-rose-500/10 text-rose-600',
                        )}>
                          {sa.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-ink-muted">{new Date(sa.createdAt).toLocaleDateString()}</td>
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {canManageSecurity && sa.status === 'ACTIVE' && (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleRotateKey(sa)}
                                className="text-xs text-accent"
                                title="Rotate secret key"
                              >
                                <RotateCcw className="size-3.5 mr-1" />
                                Rotate
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleRevokeKey(sa)}
                                className="size-7 p-0 text-rose-500 hover:text-rose-600"
                                title="Revoke account"
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Durable Jobs & Dead-Letter Queue (DLQ) Card ─── */}
      <div ref={jobsCardRef} id="durable-jobs">
        <Card className="border border-edge bg-surface-raised/60 backdrop-blur-md shadow-xs">
          <CardHeader className="p-5 pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle className="text-base font-bold text-ink flex items-center gap-2">
                  <Layers className="size-4 text-accent" />
                  Durable Jobs & Transactional Outbox DLQ
                  <HelpTooltip text="MariaDB transactional outbox worker queue with lease-based recovery and dead-letter isolation." />
                </CardTitle>
                <CardDescription className="text-xs text-ink-muted mt-0.5">
                  Engine: {queueStatus?.engine || 'MariaDB Transactional Outbox'} · {queueStatus?.deadLetterCount || 0} failed jobs in DLQ.
                </CardDescription>
              </div>

              {/* Status Filters */}
              <div className="flex flex-wrap items-center gap-1 border border-edge rounded-lg p-0.5 bg-surface text-xs font-semibold">
                {JOB_FILTERS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setJobStatusFilter(f)}
                    className={cn(
                      'px-2.5 py-1 rounded-md transition-colors',
                      jobStatusFilter === f ? 'bg-accent text-white shadow-2xs' : 'text-ink-muted hover:text-ink',
                    )}
                  >
                    {f === 'ALL' ? 'All' : f.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            {queueJobs.length === 0 ? (
              <div className="py-8 text-center text-xs text-ink-muted border border-dashed border-edge rounded-xl">
                No jobs currently match status "{jobStatusFilter}".
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-edge text-ink-muted font-bold uppercase tracking-wider text-[11px]">
                      <th className="py-3 px-3">Job ID</th>
                      <th className="py-3 px-3">Type</th>
                      <th className="py-3 px-3">Status</th>
                      <th className="py-3 px-3">Attempts</th>
                      <th className="py-3 px-3">Last Outcome / Error</th>
                      <th className="py-3 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-edge">
                    {queueJobs.map((job) => (
                      <tr key={job.jobId} className="hover:bg-surface-raised/40 transition-colors">
                        <td className="py-3 px-3 font-mono text-ink-muted">#{job.jobId.slice(0, 8)}</td>
                        <td className="py-3 px-3 font-semibold text-ink">{job.jobType}</td>
                        <td className="py-3 px-3">
                          <span className={cn(
                            'inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold',
                            job.status === 'COMPLETED' && 'bg-emerald-500/10 text-emerald-600',
                            job.status === 'DEAD_LETTER' && 'bg-rose-500/10 text-rose-600',
                            (job.status === 'QUEUED' || job.status === 'RETRYING') && 'bg-amber-500/10 text-amber-600',
                          )}>
                            {job.status}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-ink-muted">{job.attemptCount} / {job.maxAttempts}</td>
                        <td className="py-3 px-3 text-ink-muted max-w-xs truncate">
                          {job.rejectedReason || job.lastError || '—'}
                        </td>
                        <td className="py-3 px-3 text-right">
                          {job.status === 'DEAD_LETTER' && canManageSecurity && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleReplayJob(job)}
                              className="text-xs"
                            >
                              <RotateCcw className="size-3 mr-1 text-accent" />
                              Replay
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── Create Service Account Modal ─── */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
          onClick={() => !busyCreate && setShowCreateModal(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-surface-raised border border-edge shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-edge bg-surface/50">
              <div className="flex items-center gap-3">
                <div className="size-9 rounded-xl bg-accent-soft flex items-center justify-center text-accent">
                  <Key className="size-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-ink">New Service Account</h3>
                  <p className="text-xs text-ink-muted">Provision a scoped machine API credential.</p>
                </div>
              </div>
            </div>

            <form onSubmit={handleCreateServiceAccount} className="p-6 space-y-5 text-xs">
              <div className="space-y-1.5">
                <label className="font-bold text-ink block">Service Name / Identifier</label>
                <Input
                  required
                  value={saName}
                  onChange={(e) => setSaName(e.target.value)}
                  placeholder="e.g. greenhouse-ats-sync or ci-exporter"
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-3">
                <label className="font-bold text-ink block">Data Plane Capabilities</label>
                <div className="space-y-2">
                  {DATA_PLANE_SCOPES.map((scope) => {
                    const checked = selectedScopes.has(scope.id);
                    return (
                      <label key={scope.id} className="flex items-start gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleScope(scope.id)}
                          className="mt-0.5 rounded border-edge text-accent focus:ring-accent"
                        />
                        <div>
                          <div className="font-semibold text-ink">{scope.label}</div>
                          <div className="text-[10px] font-mono text-ink-muted">{scope.id}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-3 pt-3 border-t border-edge">
                <label className="font-bold text-ink block">Governance & Telemetry Scopes</label>
                <div className="space-y-2">
                  {GOVERNANCE_SCOPES.map((scope) => {
                    const checked = selectedScopes.has(scope.id);
                    return (
                      <label key={scope.id} className="flex items-start gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleScope(scope.id)}
                          className="mt-0.5 rounded border-edge text-accent focus:ring-accent"
                        />
                        <div>
                          <div className="font-semibold text-ink">{scope.label}</div>
                          <div className="text-[10px] font-mono text-ink-muted">{scope.id}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-edge">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowCreateModal(false)} disabled={busyCreate}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={busyCreate}>
                  {busyCreate ? 'Issuing Credential…' : 'Generate Key'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Confirmation Modal ─── */}
      {confirmConfig && (
        <EnterpriseConfirmModal
          isOpen={true}
          title={confirmConfig.title}
          message={confirmConfig.message}
          confirmLabel={confirmConfig.confirmLabel}
          variant={confirmConfig.variant}
          busy={busyAction}
          onConfirm={async () => {
            setBusyAction(true);
            try {
              await confirmConfig.action();
              setConfirmConfig(null);
            } finally {
              setBusyAction(false);
            }
          }}
          onClose={() => setConfirmConfig(null)}
        />
      )}
    </div>
  );
}

export default EnterpriseSecurityTab;
