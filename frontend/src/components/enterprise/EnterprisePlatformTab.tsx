/**
 * Enterprise Platform Tab (Multi-Tenant Registry & Global Platform Admin)
 *
 * Visible exclusively to platform administrators.
 * Global tenant lifecycle (provisioning, suspension, reactivation),
 * global telemetry, and cross-organization management.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Command,
  ShieldAlert,
  Check,
  AlertCircle,
  Search,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useEnterprise } from './EnterpriseContext';
import { HelpTooltip } from './HelpTooltip';
import { EnterpriseConfirmModal } from './EnterpriseConfirmModal';
import { enterpriseApi, type TenantSummary } from '@/lib/enterprise-api';
import { cn } from '@/lib/utils';

export function EnterprisePlatformTab() {
  const { platformAdmin } = useEnterprise();
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Suspend/Reactivate target
  const [lifecycleTarget, setLifecycleTarget] = useState<TenantSummary | null>(null);
  const [busyLifecycle, setBusyLifecycle] = useState(false);

  const loadPlatformTenants = useCallback(async () => {
    if (!platformAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await enterpriseApi.getPlatformTenants();
      setTenants(res.tenants || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load platform tenant registry');
    } finally {
      setLoading(false);
    }
  }, [platformAdmin]);

  useEffect(() => {
    loadPlatformTenants();
  }, [loadPlatformTenants]);

  const filteredTenants = tenants.filter((t) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return `${t.name} ${t.id} ${t.slug || ''} ${t.status || ''}`.toLowerCase().includes(q);
  });

  const handleLifecycleConfirm = async () => {
    if (!lifecycleTarget) return;
    setBusyLifecycle(true);
    try {
      if (lifecycleTarget.status === 'SUSPENDED') {
        await enterpriseApi.reactivatePlatformTenant(lifecycleTarget.id);
        setNotification(`Tenant "${lifecycleTarget.name}" reactivated.`);
      } else {
        await enterpriseApi.suspendPlatformTenant(lifecycleTarget.id);
        setNotification(`Tenant "${lifecycleTarget.name}" suspended.`);
      }
      setLifecycleTarget(null);
      await loadPlatformTenants();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Lifecycle operation failed');
    } finally {
      setBusyLifecycle(false);
      setTimeout(() => setNotification(null), 3500);
    }
  };

  if (!platformAdmin) {
    return (
      <div className="p-8 text-center text-xs text-ink-muted border border-dashed border-edge rounded-2xl bg-surface-raised/40">
        <ShieldAlert className="size-8 text-amber-500 mx-auto mb-2" />
        <h3 className="font-bold text-sm text-ink">Platform Administrator Privileges Required</h3>
        <p className="mt-1 max-w-md mx-auto">
          The multi-tenant registry is restricted to platform super-administrators. Your account holds standard organizational tenant credentials.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ─── Notifications ─── */}
      {notification && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
          <Check className="size-4 shrink-0" />
          <span>{notification}</span>
        </div>
      )}
      {error && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs font-semibold text-rose-700 dark:text-rose-300 flex items-center gap-2">
          <AlertCircle className="size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ─── Platform Registry Card ─── */}
      <Card className="border border-edge bg-surface-raised/60 backdrop-blur-md shadow-xs">
        <CardHeader className="p-5 pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-base font-bold text-ink flex items-center gap-2">
                <Command className="size-4 text-accent" />
                Global Multi-Tenant Registry & System Admin
                <HelpTooltip text="Authoritative registry of all provisioned organizations in the MariaDB control plane." />
              </CardTitle>
              <CardDescription className="text-xs text-ink-muted mt-0.5">
                Showing {filteredTenants.length} registered organizations across the platform.
              </CardDescription>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-ink-muted" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tenant registry…"
                className="pl-8 text-xs h-8 bg-surface border-edge"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-5 pt-0">
          {loading ? (
            <div className="py-8 text-center text-xs text-ink-muted">
              Loading platform tenant registry…
            </div>
          ) : filteredTenants.length === 0 ? (
            <div className="py-8 text-center text-xs text-ink-muted border border-dashed border-edge rounded-xl">
              No tenants found matching search query.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-edge text-ink-muted font-bold uppercase tracking-wider text-xs">
                    <th className="py-3 px-3">Organization</th>
                    <th className="py-3 px-3">Tenant ID</th>
                    <th className="py-3 px-3">Tier</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3">Created</th>
                    <th className="py-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-edge">
                  {filteredTenants.map((t) => {
                    const isSuspended = t.status === 'SUSPENDED';
                    return (
                      <tr key={t.id} className="hover:bg-surface-raised/40 transition-colors">
                        <td className="py-3 px-3 font-semibold text-ink">
                          {t.name}
                          {t.slug && <span className="ml-1 text-xs font-mono text-ink-muted">({t.slug})</span>}
                        </td>
                        <td className="py-3 px-3 font-mono text-ink-muted">{t.id}</td>
                        <td className="py-3 px-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-accent-soft text-accent">
                            {t.tier || 'Enterprise'}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <span className={cn(
                            'inline-flex items-center px-2 py-0.5 rounded text-xs font-bold',
                            isSuspended ? 'bg-rose-500/10 text-rose-600' : 'bg-emerald-500/10 text-emerald-600',
                          )}>
                            {t.status || 'ACTIVE'}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-ink-muted">
                          {t.createdAt ? new Date(t.createdAt).toLocaleDateString() : '—'}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setLifecycleTarget(t)}
                            className={cn('text-xs font-semibold', isSuspended ? 'text-emerald-600' : 'text-rose-600')}
                          >
                            {isSuspended ? 'Reactivate' : 'Suspend'}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Lifecycle Confirmation ─── */}
      {lifecycleTarget && (
        <EnterpriseConfirmModal
          isOpen={true}
          title={lifecycleTarget.status === 'SUSPENDED' ? 'Reactivate Organization' : 'Suspend Organization'}
          message={
            lifecycleTarget.status === 'SUSPENDED'
              ? `Reactivate organization "${lifecycleTarget.name}"? Members will immediately regain access to their workspaces and AI generation.`
              : `Suspend organization "${lifecycleTarget.name}"? All member sessions, background outbox jobs, and M2M service accounts will be immediately blocked.`
          }
          confirmLabel={lifecycleTarget.status === 'SUSPENDED' ? 'Reactivate' : 'Suspend Tenant'}
          variant={lifecycleTarget.status === 'SUSPENDED' ? 'primary' : 'danger'}
          busy={busyLifecycle}
          onConfirm={handleLifecycleConfirm}
          onClose={() => setLifecycleTarget(null)}
        />
      )}
    </div>
  );
}

export default EnterprisePlatformTab;
