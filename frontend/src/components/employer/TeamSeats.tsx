import { Dialog, DialogClose, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  RefreshCw,
  Shield,
  ShieldCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/loading';
import { useAuth } from '@/providers/auth-provider';
import { resolveActiveTenantId } from '@/lib/tenant-context';
import type { EnterpriseMembership } from '@/lib/enterprise-api';
import {
  type InviteMemberResult,
  type SeatQuota,
  canCallerAssignOwnerRole,
  fetchEnterpriseRoster,
  fetchSeatQuota,
  normalizeError,
} from '@/lib/enterprise-seats';
import { WorkspaceSeatQuotaCard } from '@/components/enterprise/WorkspaceSeatQuotaCard';
import { InviteTeammateDialog } from '@/components/enterprise/InviteTeammateDialog';
import { cn } from '@/lib/utils';

type StatusFilter = 'ALL' | 'ACTIVE' | 'INVITED' | 'SUSPENDED';

export function TeamSeats() {
  const { claims } = useAuth();
  const activeTenantId = resolveActiveTenantId();

  const canAssignOwner = useMemo(() => {
    const roleList = [claims?.role].filter(
      (r): r is string => typeof r === 'string',
    );
    return canCallerAssignOwnerRole(roleList);
  }, [claims]);

  // Seat quota state
  const [seatQuota, setSeatQuota] = useState<SeatQuota | null>(null);
  const [seatLoading, setSeatLoading] = useState(true);
  const [seatError, setSeatError] = useState<string | null>(null);

  // Member roster state
  const [members, setMembers] = useState<EnterpriseMembership[]>([]);
  const [rosterLoadedOnce, setRosterLoadedOnce] = useState(false);
  const [rosterLoading, setRosterLoading] = useState(true);
  const [rosterError, setRosterError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [quotaOpen, setQuotaOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const loadSeatQuota = useCallback(
    async (signal?: AbortSignal) => {
      setSeatLoading(true);
      setSeatError(null);
      try {
        const quota = await fetchSeatQuota(activeTenantId, signal);
        if (!signal?.aborted) {
          setSeatQuota(quota);
        }
      } catch (err) {
        if (signal?.aborted) return;
        setSeatError(normalizeError(err).message);
      } finally {
        if (!signal?.aborted) {
          setSeatLoading(false);
        }
      }
    },
    [activeTenantId],
  );

  const loadRoster = useCallback(
    async (signal?: AbortSignal) => {
      setRosterLoading(true);
      setRosterError(null);
      try {
        const list = await fetchEnterpriseRoster(activeTenantId, signal);
        if (!signal?.aborted) {
          setMembers(list);
          setRosterLoadedOnce(true);
        }
      } catch (err) {
        if (signal?.aborted) return;
        setRosterError(normalizeError(err).message);
      } finally {
        if (!signal?.aborted) {
          setRosterLoading(false);
        }
      }
    },
    [activeTenantId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadSeatQuota(controller.signal);
    void loadRoster(controller.signal);
    return () => controller.abort();
  }, [loadSeatQuota, loadRoster]);

  const handleInvited = useCallback(
    async (result: InviteMemberResult) => {
      setNotice(
        result.deliveryQueued
          ? `Invitation request accepted for ${result.email} (${result.role}). Email delivery has been queued.`
          : `Invitation sent to ${result.email} (${result.role}).`,
      );
      await Promise.all([loadSeatQuota(), loadRoster()]);
    },
    [loadSeatQuota, loadRoster],
  );

  const filteredMembers = useMemo(() => {
    if (statusFilter === 'ALL') return members;
    return members.filter((m) => String(m.status || '').toUpperCase() === statusFilter);
  }, [members, statusFilter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink flex items-center gap-2">
            <Users className="size-5 text-brand-600 shrink-0" aria-hidden="true" />
            <span>Workspace Team &amp; Seat Management</span>
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            Monitor workspace seat capacity, invite recruiting teammates, and audit assigned roles.
          </p>
        </div>
        <Button type="button" size="sm" onClick={() => setInviteOpen(true)}>
          <UserPlus className="size-4" aria-hidden="true" />
          Invite Teammate
        </Button>
      </div>

      {notice && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-sm font-medium text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
            <span>{notice}</span>
          </div>
          <Button type="button" size="sm" variant="ghost" onClick={() => setNotice(null)}>
            Dismiss
          </Button>
        </div>
      )}

      <Button variant="outline" onClick={() => setQuotaOpen(true)}>Inspect Seat Allocation</Button>
      <Dialog open={quotaOpen} onOpenChange={setQuotaOpen}>
        <DialogContent className="flex w-[calc(100%-2rem)] max-w-lg max-h-[90vh] flex-col gap-0 overflow-hidden rounded-2xl border-border bg-surface/95 p-0 backdrop-blur-xl motion-reduce:animate-none md:rounded-3xl">
          <div className="flex min-w-0 shrink-0 items-start justify-between gap-3 border-b border-border bg-neutral-50/50 p-5">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-brand-200 bg-brand-50 text-brand-600">
                <Users className="size-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="break-words text-base font-bold text-ink">Workspace Seat Allocation</DialogTitle>
                <DialogDescription className="break-words text-xs text-ink-muted">
                  Authoritative seat usage for the active tenant. Contract changes require platform commercial administration; this view cannot change allocation.
                </DialogDescription>
              </div>
            </div>
          </div>
          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-5">
            <WorkspaceSeatQuotaCard quota={seatQuota} loading={seatLoading} error={seatError} onRetry={() => void loadSeatQuota()} />
          </div>
          <div className="flex min-w-0 shrink-0 items-center justify-end border-t border-border bg-neutral-50/50 p-4">
            <DialogClose asChild>
              <Button variant="outline" size="sm">Close</Button>
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>
      {/* Authoritative Workspace Seat Quota Gauge */}
      <WorkspaceSeatQuotaCard
        quota={seatQuota}
        loading={seatLoading}
        error={seatError}
        onRetry={() => void loadSeatQuota()}
        actionSlot={
          <Button type="button" size="sm" onClick={() => setInviteOpen(true)}>
            <UserPlus className="size-4" aria-hidden="true" />
            Invite Teammate
          </Button>
        }
      />

      {/* Workspace Member Directory */}
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base font-bold text-ink">
              <ShieldCheck className="size-4 text-brand-600 shrink-0" aria-hidden="true" />
              <span>Workspace Member Roster</span>
            </CardTitle>
            <p className="mt-0.5 text-xs text-ink-muted">
              Persisted active members and pending invitations in your organization.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div
              role="group"
              aria-label="Filter team members by status"
              className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-border bg-surface p-1"
            >
              {(['ALL', 'ACTIVE', 'INVITED', 'SUSPENDED'] as const).map((st) => {
                const isSelected = statusFilter === st;
                return (
                  <button
                    key={st}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => setStatusFilter(st)}
                    className={cn(
                      'rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
                      isSelected
                        ? 'bg-brand-600 text-white'
                        : 'text-ink-muted hover:bg-neutral-100 hover:text-ink dark:hover:bg-neutral-800',
                    )}
                  >
                    {st === 'ALL' ? 'All' : st.charAt(0) + st.slice(1).toLowerCase()}
                  </button>
                );
              })}
            </div>

            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void loadRoster()}
              disabled={rosterLoading}
              aria-busy={rosterLoading}
            >
              <RefreshCw className={cn('size-3.5', rosterLoading && 'animate-spin')} aria-hidden="true" />
              Refresh Roster
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {rosterError && rosterLoadedOnce && (
            <div
              role="alert"
              className="flex flex-col gap-2 rounded-xl border border-error-200 bg-error-50 p-3.5 text-xs text-error-800 sm:flex-row sm:items-center sm:justify-between dark:border-error-900 dark:bg-error-950/40 dark:text-error-200"
            >
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>Could not refresh member roster: {rosterError}</span>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={() => void loadRoster()}>
                <RefreshCw className="size-3.5" aria-hidden="true" />
                Retry
              </Button>
            </div>
          )}

          {rosterLoading && !rosterLoadedOnce ? (
            <div className="space-y-3" role="status" aria-label="Loading workspace roster">
              <Skeleton className="h-14 w-full rounded-xl" />
              <Skeleton className="h-14 w-full rounded-xl" />
              <Skeleton className="h-14 w-full rounded-xl" />
            </div>
          ) : rosterError && !rosterLoadedOnce ? (
            <div
              role="alert"
              className="rounded-xl border border-error-200 bg-error-50 p-5 text-sm text-error-800 dark:border-error-900 dark:bg-error-950/40 dark:text-error-200"
            >
              <div className="flex items-start gap-2.5">
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <div className="space-y-2.5">
                  <p className="font-semibold">Unable to load workspace members</p>
                  <p className="text-xs">{rosterError}</p>
                  <Button type="button" size="sm" variant="outline" onClick={() => void loadRoster()}>
                    <RefreshCw className="size-3.5" aria-hidden="true" />
                    Retry
                  </Button>
                </div>
              </div>
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-8 text-center">
              <Users className="mx-auto size-8 text-ink-muted" aria-hidden="true" />
              <p className="mt-2 text-sm font-semibold text-ink">
                {statusFilter === 'ALL'
                  ? 'No workspace members found yet'
                  : `No ${statusFilter.toLowerCase()} members in this workspace`}
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                {statusFilter === 'ALL'
                  ? 'Invite your hiring managers and recruiters to collaborate on candidate pipelines.'
                  : 'Switch back to All to inspect active members and pending invitations.'}
              </p>
              <div className="mt-4 flex justify-center gap-2">
                {statusFilter !== 'ALL' ? (
                  <Button type="button" size="sm" variant="outline" onClick={() => setStatusFilter('ALL')}>
                    Show All Members
                  </Button>
                ) : (
                  <Button type="button" size="sm" onClick={() => setInviteOpen(true)}>
                    <UserPlus className="size-4" aria-hidden="true" />
                    Invite Teammate
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* Desktop semantic table */}
              <div className="hidden overflow-x-auto rounded-xl border border-border md:block">
                <table className="w-full text-left text-xs" aria-label="Workspace members">
                  <thead className="border-b border-border bg-neutral-50/70 text-[11px] font-semibold uppercase tracking-wider text-ink-muted dark:bg-neutral-900/50">
                    <tr>
                      <th scope="col" className="px-4 py-3">Member</th>
                      <th scope="col" className="px-4 py-3">Role</th>
                      <th scope="col" className="px-4 py-3">Status</th>
                      <th scope="col" className="px-4 py-3">Workspace</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredMembers.map((member) => {
                      const primaryRole = (member.roles && member.roles[0]) || 'MEMBER';
                      const statusUpper = String(member.status || 'ACTIVE').toUpperCase();
                      return (
                        <tr key={member.principalId || member.invitationEmail}>
                          <td className="px-4 py-3.5">
                            <p className="font-semibold text-ink break-words">
                              {member.displayName || member.invitationEmail || member.email || member.principalId}
                            </p>
                            {(member.invitationEmail || member.email) && (
                              <p className="text-[11px] text-ink-muted break-all">
                                {member.invitationEmail || member.email}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3.5">
                            <span className="inline-flex items-center gap-1 rounded-md border border-border bg-neutral-50 px-2 py-0.5 font-semibold text-ink dark:bg-neutral-800">
                              <Shield className="size-3 text-brand-600" aria-hidden="true" />
                              <span>{primaryRole}</span>
                            </span>
                          </td>
                          <td className="px-4 py-3.5">
                            <MemberStatusBadge status={statusUpper} />
                          </td>
                          <td className="px-4 py-3.5 text-ink-muted">
                            {member.workspaceName || 'Default Workspace'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile stacked cards */}
              <ul className="space-y-3 md:hidden" aria-label="Workspace members">
                {filteredMembers.map((member) => {
                  const primaryRole = (member.roles && member.roles[0]) || 'MEMBER';
                  const statusUpper = String(member.status || 'ACTIVE').toUpperCase();
                  return (
                    <li
                      key={member.principalId || member.invitationEmail}
                      className="rounded-xl border border-border bg-surface p-3.5 space-y-2 text-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-ink break-words">
                            {member.displayName || member.invitationEmail || member.email || member.principalId}
                          </p>
                          {(member.invitationEmail || member.email) && (
                            <p className="text-[11px] text-ink-muted break-all">
                              {member.invitationEmail || member.email}
                            </p>
                          )}
                        </div>
                        <MemberStatusBadge status={statusUpper} />
                      </div>
                      <div className="flex items-center justify-between border-t border-border pt-2">
                        <span className="inline-flex items-center gap-1 font-semibold text-ink">
                          <Shield className="size-3 text-brand-600" aria-hidden="true" />
                          <span>{primaryRole}</span>
                        </span>
                        <span className="text-ink-muted">{member.workspaceName || 'Default Workspace'}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      <InviteTeammateDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        tenantId={activeTenantId}
        canAssignOwner={canAssignOwner}
        onInvited={handleInvited}
        onSeatLimitConflict={() => void loadSeatQuota()}
        onReviewInvites={() => setStatusFilter('INVITED')}
      />
    </div>
  );
}

function MemberStatusBadge({ status }: { status: string }) {
  if (status === 'INVITED') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
        <Clock className="size-3 shrink-0" aria-hidden="true" />
        <span>INVITED</span>
      </span>
    );
  }
  if (status === 'SUSPENDED') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-800 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200">
        <AlertCircle className="size-3 shrink-0" aria-hidden="true" />
        <span>SUSPENDED</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200">
      <CheckCircle2 className="size-3 shrink-0" aria-hidden="true" />
      <span>{status}</span>
    </span>
  );
}
