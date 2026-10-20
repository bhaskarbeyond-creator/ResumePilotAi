/**
 * Enterprise Teams Tab (Functional Squads & Departmental Hierarchy)
 *
 * Organize enterprise members into squads, assign designated team leads,
 * oversee team document assets, and manage team lifecycle.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Plus,
  Edit2,
  Archive,
  RotateCcw,
  Check,
  AlertCircle,
  X,
  UserCheck,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useEnterprise } from './EnterpriseContext';
import { HelpTooltip } from './HelpTooltip';
import { EnterpriseConfirmModal } from './EnterpriseConfirmModal';
import { enterpriseApi, type EnterpriseTeam } from '@/lib/enterprise-api';
import { cn } from '@/lib/utils';

export function EnterpriseTeamsTab() {
  const { tenant, workspaces, hasPermission } = useEnterprise();
  const [teams, setTeams] = useState<EnterpriseTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);

  // Create / Edit Modal
  const [showModal, setShowModal] = useState(false);
  const [editTeam, setEditTeam] = useState<EnterpriseTeam | null>(null);
  const [teamName, setTeamName] = useState('');
  const [leadPrincipalId, setLeadPrincipalId] = useState('');
  const [teamWorkspaceId, setTeamWorkspaceId] = useState('');
  const [busy, setBusy] = useState(false);

  // Archive Target
  const [archiveTarget, setArchiveTarget] = useState<EnterpriseTeam | null>(null);

  const canManageTeams = hasPermission('workspace.manage');

  const loadTeams = useCallback(async () => {
    if (!tenant?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await enterpriseApi.getTeams(tenant.id);
      setTeams(res.teams || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load teams');
    } finally {
      setLoading(false);
    }
  }, [tenant?.id]);

  useEffect(() => {
    loadTeams();
  }, [loadTeams]);

  useEffect(() => {
    if (!showModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        setShowModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showModal, busy]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant?.id || !teamName.trim() || busy) return;

    setBusy(true);
    setError(null);
    try {
      if (editTeam) {
        await enterpriseApi.updateTeam(tenant.id, editTeam.id, {
          name: teamName.trim(),
          leadPrincipalId: leadPrincipalId.trim() || undefined,
        });
        setNotification(`Team "${teamName.trim()}" updated.`);
      } else {
        await enterpriseApi.createTeam(
          tenant.id,
          teamName.trim(),
          leadPrincipalId.trim() || undefined,
          teamWorkspaceId || undefined
        );
        setNotification(`Functional team "${teamName.trim()}" created.`);
      }
      setShowModal(false);
      setEditTeam(null);
      setTeamName('');
      setLeadPrincipalId('');
      setTeamWorkspaceId('');
      await loadTeams();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save team');
    } finally {
      setBusy(false);
      setTimeout(() => setNotification(null), 3500);
    }
  };

  const handleArchiveConfirm = async () => {
    if (!tenant?.id || !archiveTarget) return;
    setBusy(true);
    try {
      if (archiveTarget.status === 'ARCHIVED') {
        await enterpriseApi.restoreTeam(tenant.id, archiveTarget.id);
        setNotification(`Team "${archiveTarget.name}" restored.`);
      } else {
        await enterpriseApi.archiveTeam(tenant.id, archiveTarget.id);
        setNotification(`Team "${archiveTarget.name}" archived.`);
      }
      setArchiveTarget(null);
      await loadTeams();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update team status');
    } finally {
      setBusy(false);
      setTimeout(() => setNotification(null), 3500);
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

      {/* ─── Teams Card ─── */}
      <Card className="border border-edge bg-surface-raised/60 backdrop-blur-md shadow-xs">
        <CardHeader className="p-5 pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-base font-bold text-ink flex items-center gap-2">
                <Users className="size-4 text-accent" />
                Departmental Teams & Squads
                <HelpTooltip text="Functional groups within workspaces with designated hiring managers and squad leads." />
              </CardTitle>
              <CardDescription className="text-xs text-ink-muted mt-0.5">
                {teams.length} functional teams organized across organizational workspaces.
              </CardDescription>
            </div>
            {canManageTeams && (
              <Button
                size="sm"
                onClick={() => {
                  setEditTeam(null);
                  setTeamName('');
                  setLeadPrincipalId('');
                  setTeamWorkspaceId('');
                  setShowModal(true);
                }}
                className="text-xs font-bold"
              >
                <Plus className="size-3.5 mr-1.5" />
                Create Team
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-5 pt-0">
          {loading ? (
            <div className="py-8 text-center text-xs text-ink-muted">
              Loading departmental teams…
            </div>
          ) : teams.length === 0 ? (
            <div className="py-8 text-center text-xs text-ink-muted border border-dashed border-edge rounded-xl">
              No functional teams configured for this tenant.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {teams.map((t) => {
                const isArchived = t.status === 'ARCHIVED';
                return (
                  <div
                    key={t.id}
                    className={cn(
                      'p-5 rounded-2xl border text-xs flex flex-col justify-between transition-all bg-surface/50',
                      isArchived ? 'opacity-60 bg-surface/20 border-edge' : 'border-edge hover:bg-surface-raised/60',
                    )}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-bold text-ink">{t.name}</h4>
                        <span className={cn(
                          'px-2 py-0.5 rounded text-[10px] font-bold',
                          isArchived ? 'bg-amber-500/10 text-amber-600' : 'bg-emerald-500/10 text-emerald-600',
                        )}>
                          {t.status || 'ACTIVE'}
                        </span>
                      </div>
                      <div className="mt-2 text-xs text-ink-muted flex items-center gap-1.5">
                        <UserCheck className="size-3.5 text-accent" />
                        <span>Lead: {t.leadEmail || t.leadPrincipalId || 'Unassigned'}</span>
                      </div>
                      <div className="mt-1 text-xs text-ink-muted flex items-center gap-1.5">
                        <Users className="size-3.5" />
                        <span>{t.memberCount || 0} assigned member(s)</span>
                      </div>
                    </div>

                    {canManageTeams && (
                      <div className="mt-5 pt-3 border-t border-edge flex items-center justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditTeam(t);
                            setTeamName(t.name);
                            setLeadPrincipalId(t.leadPrincipalId || '');
                            setShowModal(true);
                          }}
                          className="size-7 p-0"
                          title="Edit team"
                        >
                          <Edit2 className="size-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setArchiveTarget(t)}
                          className={cn('size-7 p-0', isArchived ? 'text-emerald-600' : 'text-amber-600')}
                          title={isArchived ? 'Restore team' : 'Archive team'}
                        >
                          {isArchived ? <RotateCcw className="size-3.5" /> : <Archive className="size-3.5" />}
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Create/Edit Team Modal ─── */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
          onClick={() => !busy && setShowModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-surface-raised border border-edge shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-edge bg-surface/50">
              <h3 className="text-base font-bold text-ink">
                {editTeam ? 'Edit Squad / Team' : 'New Functional Team'}
              </h3>
              <button
                type="button"
                className="p-1.5 text-ink-muted hover:text-ink rounded-lg"
                onClick={() => setShowModal(false)}
              >
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-bold text-ink block">Team Name</label>
                <Input
                  required
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="e.g. Core Engineering or Senior Recruiter Squad"
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-bold text-ink block">Team Lead Principal ID / Email</label>
                <Input
                  value={leadPrincipalId}
                  onChange={(e) => setLeadPrincipalId(e.target.value)}
                  placeholder="e.g. hiring.manager@company.com"
                  className="h-9 text-xs"
                />
              </div>

              {!editTeam && (
                <div className="space-y-1.5">
                  <label className="font-bold text-ink block">Workspace Assignment</label>
                  <select
                    value={teamWorkspaceId}
                    onChange={(e) => setTeamWorkspaceId(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg bg-surface border border-edge text-xs text-ink focus:outline-none focus:ring-1 focus:ring-accent"
                  >
                    <option value="">Default Workspace</option>
                    {workspaces.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-edge">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowModal(false)} disabled={busy}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={busy}>
                  {busy ? 'Saving…' : editTeam ? 'Save Changes' : 'Create Team'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Archive/Restore Confirmation ─── */}
      {archiveTarget && (
        <EnterpriseConfirmModal
          isOpen={true}
          title={archiveTarget.status === 'ARCHIVED' ? 'Restore Team' : 'Archive Team'}
          message={`Are you sure you want to ${archiveTarget.status === 'ARCHIVED' ? 'restore' : 'archive'} the team "${archiveTarget.name}"?`}
          confirmLabel={archiveTarget.status === 'ARCHIVED' ? 'Restore Team' : 'Archive Team'}
          variant={archiveTarget.status === 'ARCHIVED' ? 'primary' : 'warning'}
          busy={busy}
          onConfirm={handleArchiveConfirm}
          onClose={() => setArchiveTarget(null)}
        />
      )}
    </div>
  );
}

export default EnterpriseTeamsTab;
