/**
 * Enterprise Support Tab (Break-Glass Support Grants & SLA Tracking)
 *
 * Time-bound break-glass support grants, authorization audit,
 * and enterprise priority support access tracking.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  ShieldAlert,
  Plus,
  Trash2,
  Check,
  AlertCircle,
  X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useEnterprise } from './EnterpriseContext';
import { HelpTooltip } from './HelpTooltip';
import { EnterpriseConfirmModal } from './EnterpriseConfirmModal';
import { enterpriseApi, type EnterpriseSupportGrant } from '@/lib/enterprise-api';
import { cn } from '@/lib/utils';

export function EnterpriseSupportTab() {
  const { tenant, hasPermission } = useEnterprise();
  const [grants, setGrants] = useState<EnterpriseSupportGrant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);

  // Grant Modal
  const [showModal, setShowModal] = useState(false);
  const [reason, setReason] = useState('');
  const [durationHours, setDurationHours] = useState<number>(4);
  const [busyGrant, setBusyGrant] = useState(false);

  // Revoke Target
  const [revokeTarget, setRevokeTarget] = useState<EnterpriseSupportGrant | null>(null);
  const [busyRevoke, setBusyRevoke] = useState(false);

  const canManageSupport = hasPermission('tenant.settings.write');

  const loadGrants = useCallback(async () => {
    if (!tenant?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await enterpriseApi.getSupportGrants(tenant.id);
      setGrants(res.grants || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load support grants');
    } finally {
      setLoading(false);
    }
  }, [tenant?.id]);

  useEffect(() => {
    loadGrants();
  }, [loadGrants]);

  const handleCreateGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant?.id || !reason.trim() || busyGrant) return;

    setBusyGrant(true);
    setError(null);
    try {
      await enterpriseApi.createSupportGrant(tenant.id, durationHours, reason.trim());
      setShowModal(false);
      setReason('');
      setNotification(`Time-bound (${durationHours}h) break-glass support grant issued.`);
      setTimeout(() => setNotification(null), 3500);
      await loadGrants();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to issue support grant');
    } finally {
      setBusyGrant(false);
    }
  };

  const handleRevokeConfirm = async () => {
    if (!tenant?.id || !revokeTarget) return;
    setBusyRevoke(true);
    try {
      await enterpriseApi.revokeSupportGrant(tenant.id, revokeTarget.id);
      setRevokeTarget(null);
      setNotification('Support access grant revoked immediately.');
      setTimeout(() => setNotification(null), 3500);
      await loadGrants();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to revoke grant');
    } finally {
      setBusyRevoke(false);
    }
  };

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

      {/* ─── Break-Glass Support Access Card ─── */}
      <Card className="border border-edge bg-surface-raised/60 backdrop-blur-md shadow-xs">
        <CardHeader className="p-5 pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-base font-bold text-ink flex items-center gap-2">
                <ShieldAlert className="size-4 text-accent" />
                Time-Bound Break-Glass Support Grants
                <HelpTooltip text="Issue temporary, audited access tokens allowing IME365 engineering to inspect and diagnose technical issues." />
              </CardTitle>
              <CardDescription className="text-xs text-ink-muted mt-0.5">
                All break-glass support elevations are strictly time-bound and logged to the immutable audit trail.
              </CardDescription>
            </div>
            {canManageSupport && (
              <Button size="sm" onClick={() => setShowModal(true)} className="text-xs font-bold">
                <Plus className="size-3.5 mr-1.5" />
                Grant Support Access
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-5 pt-0">
          {loading ? (
            <div className="py-8 text-center text-xs text-ink-muted">
              Loading active support grants…
            </div>
          ) : grants.length === 0 ? (
            <div className="py-8 text-center text-xs text-ink-muted border border-dashed border-edge rounded-xl">
              No active or historical break-glass support grants recorded.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-edge text-ink-muted font-bold uppercase tracking-wider text-xs">
                    <th className="py-3 px-3">Grant ID</th>
                    <th className="py-3 px-3">Business Justification</th>
                    <th className="py-3 px-3">Duration</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3">Issued At</th>
                    <th className="py-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-edge">
                  {grants.map((g) => (
                    <tr key={g.id} className="hover:bg-surface-raised/40 transition-colors">
                      <td className="py-3 px-3 font-mono text-ink-muted">#{g.id.slice(0, 8)}</td>
                      <td className="py-3 px-3 font-semibold text-ink max-w-sm truncate">{g.reason}</td>
                      <td className="py-3 px-3 text-ink-muted">{g.durationHours} hours</td>
                      <td className="py-3 px-3">
                        <span className={cn(
                          'inline-flex items-center px-2 py-0.5 rounded text-xs font-bold',
                          g.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-rose-500/10 text-rose-600',
                        )}>
                          {g.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-ink-muted">{new Date(g.createdAt).toLocaleString()}</td>
                      <td className="py-3 px-3 text-right">
                        {g.status === 'ACTIVE' && canManageSupport && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setRevokeTarget(g)}
                            className="size-7 p-0 text-rose-500 hover:text-rose-600"
                            title="Revoke support grant immediately"
                          >
                            <Trash2 className="size-3.5" />
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

      {/* ─── Grant Modal ─── */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
          onClick={() => !busyGrant && setShowModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-surface-raised border border-edge shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-edge bg-surface/50">
              <h3 className="text-base font-bold text-ink">Issue Break-Glass Support Access</h3>
              <button type="button" className="p-1.5 text-ink-muted hover:text-ink rounded-lg" onClick={() => setShowModal(false)}>
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={handleCreateGrant} className="p-6 space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-bold text-ink block">Business Justification / Ticket Reference</label>
                <Input
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Diagnosing AI generation latency on European datacenter (Ticket #4891)"
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-ink block">Grant Duration (Automatic Expiry)</label>
                <select
                  value={durationHours}
                  onChange={(e) => setDurationHours(Number(e.target.value))}
                  className="w-full h-9 px-3 rounded-lg bg-surface border border-edge text-xs text-ink focus:outline-none focus:ring-1 focus:ring-accent"
                >
                  <option value={1}>1 Hour (Quick Probe)</option>
                  <option value={4}>4 Hours (Standard Investigation)</option>
                  <option value={12}>12 Hours (Extended Deep-Dive)</option>
                  <option value={24}>24 Hours (Full Emergency Window)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-edge">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowModal(false)} disabled={busyGrant}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={busyGrant}>
                  {busyGrant ? 'Issuing…' : 'Issue Grant'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Revoke Confirmation ─── */}
      {revokeTarget && (
        <EnterpriseConfirmModal
          isOpen={true}
          title="Revoke Support Grant"
          message={`Are you sure you want to immediately revoke support access grant #${revokeTarget.id.slice(0, 8)}? All active engineering support sessions will be terminated.`}
          confirmLabel="Revoke Grant"
          variant="danger"
          busy={busyRevoke}
          onConfirm={handleRevokeConfirm}
          onClose={() => setRevokeTarget(null)}
        />
      )}
    </div>
  );
}

export default EnterpriseSupportTab;
