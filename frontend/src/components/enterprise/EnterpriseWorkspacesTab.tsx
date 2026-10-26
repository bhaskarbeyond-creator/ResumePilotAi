/**
 * Enterprise Workspaces Tab (Departmental Isolation & Landing Zones)
 *
 * Workspace management, departmental partitioning, archive & restore lifecycle,
 * and active workspace context switching.
 */

import { useState, useEffect } from 'react';
import {
  Sliders,
  Plus,
  Edit2,
  Archive,
  RotateCcw,
  Users,
  Check,
  AlertCircle,
  X,
  Building,
  Search,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useEnterprise } from './EnterpriseContext';
import { HelpTooltip } from './HelpTooltip';
import { EnterpriseConfirmModal } from './EnterpriseConfirmModal';
import {
  enterpriseApi,
  type WorkspaceSummary,
  type EnterpriseMembership,
} from '@/lib/enterprise-api';
import { cn } from '@/lib/utils';

export function EnterpriseWorkspacesTab() {
  const { tenant, workspace, workspaces, selectWorkspace, reload, hasPermission } = useEnterprise();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editTarget, setEditTarget] = useState<WorkspaceSummary | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<WorkspaceSummary | null>(null);
  const [wsName, setWsName] = useState('');
  const [wsSlug, setWsSlug] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);

  // Workspace Members Modal State
  const [membersModalWs, setMembersModalWs] = useState<WorkspaceSummary | null>(null);
  const [tenantMembers, setTenantMembers] = useState<EnterpriseMembership[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [membersSearch, setMembersSearch] = useState('');
  const [busyMemberId, setBusyMemberId] = useState<string | null>(null);

  const canManageWorkspaces = hasPermission('workspace.manage') || hasPermission('tenant.workspaces.manage');

  // Escape key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (membersModalWs) setMembersModalWs(null);
        else if (showCreateModal) setShowCreateModal(false);
        else if (archiveTarget) setArchiveTarget(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [membersModalWs, showCreateModal, archiveTarget]);

  const openWorkspaceMembers = async (ws: WorkspaceSummary) => {
    if (!tenant?.id) return;
    setMembersModalWs(ws);
    setLoadingMembers(true);
    setMembersSearch('');
    try {
      const res = await enterpriseApi.getMemberships(tenant.id);
      setTenantMembers(res.memberships || []);
    } catch {
      // Keep empty or fallback
    } finally {
      setLoadingMembers(false);
    }
  };

  const handleToggleMemberWorkspace = async (member: EnterpriseMembership) => {
    if (!tenant?.id || !membersModalWs || busyMemberId) return;
    const isCurrentlyAssigned = member.workspaceId === membersModalWs.id;
    const nextWorkspaceId = isCurrentlyAssigned ? undefined : membersModalWs.id;

    setBusyMemberId(member.principalId);
    try {
      await enterpriseApi.updateMembership(tenant.id, member.principalId, {
        workspaceId: nextWorkspaceId,
      });

      // Update local state
      setTenantMembers((prev) =>
        prev.map((m) =>
          m.principalId === member.principalId
            ? { ...m, workspaceId: nextWorkspaceId, workspaceName: isCurrentlyAssigned ? 'Default Workspace' : membersModalWs.name }
            : m
        )
      );

      setNotification(
        isCurrentlyAssigned
          ? `Removed ${member.displayName || member.principalId} from "${membersModalWs.name}".`
          : `Assigned ${member.displayName || member.principalId} to "${membersModalWs.name}".`
      );
      setTimeout(() => setNotification(null), 3500);
      await reload();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update member workspace');
    } finally {
      setBusyMemberId(null);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant?.id || !wsName.trim() || busy) return;

    setBusy(true);
    setError(null);
    try {
      if (editTarget) {
        await enterpriseApi.updateWorkspace(tenant.id, editTarget.id, { name: wsName.trim() });
        setNotification(`Workspace "${wsName.trim()}" updated.`);
      } else {
        await enterpriseApi.createWorkspace(tenant.id, wsName.trim(), wsSlug.trim() || undefined);
        setNotification(`Departmental workspace "${wsName.trim()}" created.`);
      }
      setShowCreateModal(false);
      setEditTarget(null);
      setWsName('');
      setWsSlug('');
      await reload();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save workspace');
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
        await enterpriseApi.restoreWorkspace(tenant.id, archiveTarget.id);
        setNotification(`Workspace "${archiveTarget.name}" restored.`);
      } else {
        await enterpriseApi.archiveWorkspace(tenant.id, archiveTarget.id);
        setNotification(`Workspace "${archiveTarget.name}" archived.`);
      }
      setArchiveTarget(null);
      await reload();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update workspace status');
    } finally {
      setBusy(false);
      setTimeout(() => setNotification(null), 3500);
    }
  };

  const filteredMembers = tenantMembers.filter((m) => {
    if (!membersSearch.trim()) return true;
    const q = membersSearch.toLowerCase();
    return (
      (m.displayName || '').toLowerCase().includes(q) ||
      (m.invitationEmail || '').toLowerCase().includes(q) ||
      m.principalId.toLowerCase().includes(q)
    );
  });

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

      {/* ─── Workspaces Grid ─── */}
      <Card className="border border-edge bg-surface-raised/60 backdrop-blur-md shadow-xs">
        <CardHeader className="p-5 pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-base font-bold text-ink flex items-center gap-2">
                <Sliders className="size-4 text-accent" />
                Departmental Workspaces
                <HelpTooltip text="Isolated workspace partitions for business units, divisions, or regional offices with autonomous candidate assets." />
              </CardTitle>
              <CardDescription className="text-xs text-ink-muted mt-0.5">
                {workspaces.length} workspace partitions currently provisioned in this tenant.
              </CardDescription>
            </div>
            {canManageWorkspaces && (
              <Button
                size="sm"
                onClick={() => {
                  setEditTarget(null);
                  setWsName('');
                  setWsSlug('');
                  setShowCreateModal(true);
                }}
                className="text-xs font-bold"
              >
                <Plus className="size-3.5 mr-1.5" />
                Create Workspace
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-5 pt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {workspaces.map((ws) => {
              const isActive = workspace?.id === ws.id;
              const isArchived = ws.status === 'ARCHIVED';
              return (
                <div
                  key={ws.id}
                  className={cn(
                    'p-5 rounded-2xl border text-xs flex flex-col justify-between transition-all bg-surface/50',
                    isActive ? 'border-accent ring-1 ring-accent bg-accent-soft/20 shadow-xs' : 'border-edge hover:bg-surface-raised/60',
                    isArchived && 'opacity-60 bg-surface/20',
                  )}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="size-8 rounded-xl bg-accent-soft flex items-center justify-center text-accent shrink-0">
                          <Building className="size-4" />
                        </div>
                        <h4 className="text-sm font-bold text-ink truncate">{ws.name}</h4>
                      </div>
                      {ws.isDefault && (
                        <span className="px-2 py-0.5 rounded text-xs font-bold bg-accent text-white">
                          Default
                        </span>
                      )}
                    </div>
                    <div className="mt-2 text-xs font-mono text-ink-muted">
                      ID: {ws.id.slice(0, 14)}…
                    </div>
                    <div
                      onClick={() => openWorkspaceMembers(ws)}
                      className="mt-2 text-xs text-ink-muted flex items-center justify-between p-2 rounded-xl border border-edge/60 bg-surface/60 hover:bg-accent/5 hover:border-accent/40 cursor-pointer transition-colors"
                      title="Inspect and assign members"
                    >
                      <span className="flex items-center gap-1.5 font-semibold text-ink">
                        <Users className="size-3.5 text-accent" />
                        {ws.memberCount || 0} assigned member(s)
                      </span>
                      <span className="text-xs text-accent font-bold">Manage &rarr;</span>
                    </div>
                  </div>

                  <div className="mt-5 pt-3 border-t border-edge flex items-center justify-between gap-2">
                    <Button
                      size="sm"
                      variant={isActive ? 'primary' : 'outline'}
                      onClick={() => selectWorkspace(ws.id)}
                      disabled={isActive || isArchived}
                      className="text-xs h-7"
                    >
                      {isActive ? 'Active Workspace' : 'Switch Context'}
                    </Button>

                    {canManageWorkspaces && !ws.isDefault && (
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditTarget(ws);
                            setWsName(ws.name);
                            setShowCreateModal(true);
                          }}
                          className="size-7 p-0"
                          title="Rename workspace"
                        >
                          <Edit2 className="size-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setArchiveTarget(ws)}
                          className={cn('size-7 p-0', isArchived ? 'text-emerald-600' : 'text-amber-600')}
                          title={isArchived ? 'Restore workspace' : 'Archive workspace'}
                        >
                          {isArchived ? <RotateCcw className="size-3.5" /> : <Archive className="size-3.5" />}
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ─── Workspace Members Assignment Modal ─── */}
      {membersModalWs && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ws-members-modal-title"
          onClick={() => setMembersModalWs(null)}
        >
          <div
            className="w-full max-w-xl max-h-[92vh] flex flex-col rounded-3xl bg-surface border border-edge shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-6 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white flex items-start justify-between gap-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="size-11 rounded-2xl bg-white/10 text-white flex items-center justify-center shrink-0 border border-white/20">
                  <Users className="size-5" />
                </div>
                <div>
                  <h3 id="ws-members-modal-title" className="text-base font-bold text-white">
                    {membersModalWs.name} — Workspace Members
                  </h3>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Assign or unassign organizational teammates to this departmental partition.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMembersModalWs(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                aria-label="Close modal"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
              {/* Search Toolbar */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-ink-muted" />
                <Input
                  value={membersSearch}
                  onChange={(e) => setMembersSearch(e.target.value)}
                  placeholder="Filter teammates by name or email…"
                  className="pl-9 text-xs h-9"
                />
              </div>

              {/* Members List */}
              {loadingMembers ? (
                <div className="py-12 text-center text-ink-muted">
                  Loading enterprise directory…
                </div>
              ) : filteredMembers.length === 0 ? (
                <div className="py-12 text-center text-ink-muted border border-dashed border-edge rounded-2xl">
                  No organizational members match your search.
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredMembers.map((m) => {
                    const isAssigned = m.workspaceId === membersModalWs.id;
                    const isPending = busyMemberId === m.principalId;
                    return (
                      <div
                        key={m.principalId}
                        className={cn(
                          'p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3',
                          isAssigned
                            ? 'border-accent bg-accent/5'
                            : 'border-edge bg-surface hover:bg-surface-raised/40'
                        )}
                      >
                        <div className="min-w-0 flex items-center gap-3">
                          <div
                            className={cn(
                              'size-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0',
                              isAssigned
                                ? 'bg-accent text-white shadow-2xs'
                                : 'bg-canvas-soft text-ink-muted border border-edge'
                            )}
                          >
                            {(m.displayName || m.principalId).charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <h5 className="font-bold text-xs text-ink truncate">
                              {m.displayName || m.invitationEmail || m.email || m.principalId}
                            </h5>
                            <p className="text-xs text-ink-muted truncate font-mono">
                              {(m.roles || []).join(', ') || 'MEMBER'} • Current: {m.workspaceName || 'Default'}
                            </p>
                          </div>
                        </div>

                        <Button
                          size="sm"
                          variant={isAssigned ? 'primary' : 'outline'}
                          onClick={() => handleToggleMemberWorkspace(m)}
                          disabled={isPending}
                          className="h-7 text-xs font-bold shrink-0"
                        >
                          {isPending ? 'Updating…' : isAssigned ? 'Assigned ✓' : '+ Assign'}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-edge bg-surface-raised/40 flex items-center justify-between shrink-0">
              <span className="text-xs text-ink-muted">
                {tenantMembers.filter((m) => m.workspaceId === membersModalWs.id).length} member(s) assigned
              </span>
              <Button size="sm" onClick={() => setMembersModalWs(null)}>
                Done
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Create/Edit Workspace Modal ─── */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
          onClick={() => !busy && setShowCreateModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-surface-raised border border-edge shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-edge bg-surface/50">
              <h3 className="text-base font-bold text-ink">
                {editTarget ? 'Edit Workspace' : 'New Departmental Workspace'}
              </h3>
              <button
                type="button"
                className="p-1.5 text-ink-muted hover:text-ink rounded-lg"
                onClick={() => setShowCreateModal(false)}
              >
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-6 space-y-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-bold text-ink block">Workspace Name</label>
                <Input
                  required
                  value={wsName}
                  onChange={(e) => setWsName(e.target.value)}
                  placeholder="e.g. Engineering & Product or EMEA Recruitment"
                  className="h-9 text-xs"
                />
              </div>

              {!editTarget && (
                <div className="space-y-1.5">
                  <label className="font-bold text-ink block">URL Namespace Slug (Optional)</label>
                  <Input
                    value={wsSlug}
                    onChange={(e) => setWsSlug(e.target.value)}
                    placeholder="e.g. emea-division"
                    className="h-9 text-xs font-mono"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-edge">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowCreateModal(false)} disabled={busy}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={busy}>
                  {busy ? 'Saving…' : editTarget ? 'Save Changes' : 'Create Workspace'}
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
          title={archiveTarget.status === 'ARCHIVED' ? 'Restore Workspace' : 'Archive Workspace'}
          message={
            archiveTarget.status === 'ARCHIVED'
              ? `Restore workspace "${archiveTarget.name}" to active status? Members will regain access to documents in this workspace.`
              : `Archive workspace "${archiveTarget.name}"? Active documents will remain frozen and members will be shifted to the default workspace.`
          }
          confirmLabel={archiveTarget.status === 'ARCHIVED' ? 'Restore Workspace' : 'Archive Workspace'}
          variant={archiveTarget.status === 'ARCHIVED' ? 'primary' : 'warning'}
          busy={busy}
          onConfirm={handleArchiveConfirm}
          onClose={() => setArchiveTarget(null)}
        />
      )}
    </div>
  );
}

export default EnterpriseWorkspacesTab;
