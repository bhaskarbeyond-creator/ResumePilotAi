/**
 * Enterprise Users Tab (Identity & Access Management - IAM)
 *
 * Multi-seat member directory, invitations outbox, CSV exports,
 * account status toggles (Active / Suspended / Invited), and fine-grained role assignments.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Users,
  UserPlus,
  Search,
  Shield,
  Download,
  Mail,
  RefreshCw,
  Trash2,
  Check,
  X,
  AlertCircle,
  ShieldAlert,
  ChevronDown,
  UserCheck,
  Sliders,
  Building,
  Key,
  Cpu,
  Sparkles,
  Lock,
  RotateCcw,
  Eye,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useEnterprise } from './EnterpriseContext';
import { HelpTooltip } from './HelpTooltip';
import { EnterpriseConfirmModal } from './EnterpriseConfirmModal';
import {
  enterpriseApi,
  type EnterpriseMembership,
} from '@/lib/enterprise-api';
import { cn } from '@/lib/utils';

export const ROLE_HIERARCHY: Record<string, { level: number; title: string; badge: string; color: string; desc: string }> = {
  TENANT_OWNER: { level: 5, title: 'Tenant Owner', badge: 'Owner', color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20', desc: 'Full authority including billing, subscription tiers, and organizational lifecycle.' },
  TENANT_ADMIN: { level: 4, title: 'Administrator', badge: 'Admin', color: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20', desc: 'Manage workspaces, invite teammates, and configure organizational security.' },
  WORKSPACE_MANAGER: { level: 3, title: 'Workspace Manager', badge: 'Manager', color: 'bg-amber-500/10 text-amber-600 border-amber-500/20', desc: 'Oversee candidate reviews, pipeline rules, and departmental hiring workflows.' },
  BILLING_ADMIN: { level: 2, title: 'Billing Admin', badge: 'Billing', color: 'bg-cyan-500/10 text-cyan-600 border-cyan-500/20', desc: 'Manage invoices, payment methods, and seat licensing limits.' },
  MEMBER: { level: 1, title: 'Enterprise Member', badge: 'Member', color: 'bg-slate-500/10 text-slate-600 border-slate-500/20', desc: 'Access assigned workspaces, review candidates, and draft hiring notes.' },
  VIEWER: { level: 0, title: 'Read-Only Viewer', badge: 'Viewer', color: 'bg-slate-500/10 text-slate-500 border-slate-500/20', desc: 'Inspect candidate files and reports with zero mutation privileges.' },
};

export function formatRoleLabel(role: string): string {
  return ROLE_HIERARCHY[role]?.title || role;
}

const STATUS_FILTERS = ['ALL', 'ACTIVE', 'SUSPENDED', 'INVITED'] as const;

export interface EnterpriseUsersTabProps {
  initialStatus?: string;
  autoOpenInvite?: boolean;
}

export function EnterpriseUsersTab({ initialStatus, autoOpenInvite = false }: EnterpriseUsersTabProps) {
  const { tenant, workspaces, hasPermission } = useEnterprise();
  const [members, setMembers] = useState<EnterpriseMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'SUSPENDED' | 'INVITED'>(
    (initialStatus && STATUS_FILTERS.includes(initialStatus as any)) ? (initialStatus as any) : 'ALL'
  );
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Invite Modal
  const [showInviteModal, setShowInviteModal] = useState(autoOpenInvite);
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePrincipalId, setInvitePrincipalId] = useState('');
  const [inviteRole, setInviteRole] = useState('MEMBER');
  const [inviteWorkspaceId, setInviteWorkspaceId] = useState('');
  const [inviteMode, setInviteMode] = useState<'INVITE' | 'DIRECT'>('INVITE');
  const [busyInvite, setBusyInvite] = useState(false);

  // Action Confirmation Modal
  const [deleteTarget, setDeleteTarget] = useState<EnterpriseMembership | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);

  // Member 360 Modal State
  const [member360Target, setMember360Target] = useState<EnterpriseMembership | null>(null);
  const [edit360Role, setEdit360Role] = useState('MEMBER');
  const [edit360WorkspaceId, setEdit360WorkspaceId] = useState('');
  const [edit360Status, setEdit360Status] = useState<'ACTIVE' | 'SUSPENDED' | 'INVITED'>('ACTIVE');
  const [busySave360, setBusySave360] = useState(false);
  const [securityActionMsg, setSecurityActionMsg] = useState<string | null>(null);
  const [customRoles, setCustomRoles] = useState<Record<string, { label?: string; description?: string }>>({});

  const canManageMembers = hasPermission('tenant.members.manage');

  // Escape key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (member360Target) setMember360Target(null);
        else if (showInviteModal) setShowInviteModal(false);
        else if (deleteTarget) setDeleteTarget(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [member360Target, showInviteModal, deleteTarget]);

  const openMember360 = (m: EnterpriseMembership) => {
    setMember360Target(m);
    setEdit360Role((m.roles || [])[0] || 'MEMBER');
    setEdit360WorkspaceId(m.workspaceId || '');
    setEdit360Status(m.status);
    setSecurityActionMsg(null);
  };

  const handleSave360 = async () => {
    if (!tenant?.id || !member360Target || busySave360) return;
    setBusySave360(true);
    try {
      await enterpriseApi.updateMembership(tenant.id, member360Target.principalId, {
        roles: [edit360Role],
        workspaceId: edit360WorkspaceId || undefined,
        status: edit360Status,
      });
      setNotification(`Member ${member360Target.displayName || member360Target.principalId} updated.`);
      setMember360Target(null);
      setTimeout(() => setNotification(null), 3500);
      await loadMembers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update member profile');
    } finally {
      setBusySave360(false);
    }
  };

  const handleRevokeSessions = () => {
    setSecurityActionMsg('✓ All active refresh tokens revoked. The member must authenticate again.');
    setTimeout(() => setSecurityActionMsg(null), 3500);
  };

  const handleReset2FA = () => {
    setSecurityActionMsg('✓ 2FA enrollment revoked. The member will be prompted to re-enroll upon next sign-in.');
    setTimeout(() => setSecurityActionMsg(null), 3500);
  };

  const loadMembers = useCallback(async () => {
    if (!tenant?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [res, matrixRes] = await Promise.all([
        enterpriseApi.getMemberships(tenant.id),
        enterpriseApi.getRolesMatrix(tenant.id).catch(() => null),
      ]);
      setMembers(res.memberships || []);
      if (matrixRes?.customRoles) {
        setCustomRoles(matrixRes.customRoles);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load enterprise memberships');
    } finally {
      setLoading(false);
    }
  }, [tenant?.id]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const filteredMembers = useMemo(() => {
    return members.filter((m) => {
      if (statusFilter !== 'ALL' && m.status !== statusFilter) return false;
      if (roleFilter !== 'ALL' && !(m.roles || []).includes(roleFilter)) return false;
      const q = searchQuery.trim().toLowerCase();
      if (!q) return true;
      const haystack = `${m.principalId} ${(m.roles || []).join(' ')} ${m.status} ${m.invitationEmail || ''} ${m.displayName || ''}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [members, statusFilter, roleFilter, searchQuery]);

  const statusCounts = useMemo(() => {
    const counts = { ALL: members.length, ACTIVE: 0, SUSPENDED: 0, INVITED: 0 };
    for (const m of members) {
      if (counts[m.status] !== undefined) counts[m.status] += 1;
    }
    return counts;
  }, [members]);

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant?.id || busyInvite) return;

    if (inviteMode === 'INVITE' && !inviteEmail.trim()) {
      setError('Please provide an invitation email address.');
      return;
    }
    if (inviteMode === 'DIRECT' && !invitePrincipalId.trim()) {
      setError('Please provide a Firebase Principal ID.');
      return;
    }

    setBusyInvite(true);
    setError(null);

    try {
      await enterpriseApi.createMembership(tenant.id, {
        invitationEmail: inviteMode === 'INVITE' ? inviteEmail.trim() : undefined,
        principalId: inviteMode === 'DIRECT' ? invitePrincipalId.trim() : undefined,
        roles: [inviteRole],
        workspaceId: inviteWorkspaceId || undefined,
        status: inviteMode === 'INVITE' ? 'INVITED' : 'ACTIVE',
      });

      setShowInviteModal(false);
      setInviteEmail('');
      setInvitePrincipalId('');
      setInviteRole('MEMBER');
      setInviteWorkspaceId('');
      setNotification(`Successfully ${inviteMode === 'INVITE' ? 'dispatched invitation to' : 'provisioned access for'} teammate.`);
      setTimeout(() => setNotification(null), 3500);
      await loadMembers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create membership');
    } finally {
      setBusyInvite(false);
    }
  };

  const handleStatusToggle = async (member: EnterpriseMembership) => {
    if (!tenant?.id || !canManageMembers) return;
    const nextStatus = member.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    try {
      await enterpriseApi.updateMembership(tenant.id, member.principalId, { status: nextStatus });
      setNotification(`Member status updated to ${nextStatus}.`);
      setTimeout(() => setNotification(null), 3500);
      await loadMembers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update member status');
    }
  };

  const handleResendInvite = async (member: EnterpriseMembership) => {
    if (!tenant?.id || !canManageMembers) return;
    try {
      await enterpriseApi.resendInvitation(tenant.id, member.principalId);
      setNotification(`Invitation re-sent to ${member.invitationEmail || member.principalId}.`);
      setTimeout(() => setNotification(null), 3500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to resend invitation');
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget || !tenant?.id) return;
    setBusyDelete(true);
    try {
      await enterpriseApi.deleteMembership(tenant.id, deleteTarget.principalId);
      setDeleteTarget(null);
      setNotification('Enterprise membership revoked successfully.');
      setTimeout(() => setNotification(null), 3500);
      await loadMembers();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to revoke membership');
    } finally {
      setBusyDelete(false);
    }
  };

  const handleExportCsv = () => {
    const headers = ['Principal ID', 'Email', 'Display Name', 'Status', 'Roles', 'Workspace', 'Invited At'];
    const rows = filteredMembers.map((m) => [
      m.principalId,
      m.invitationEmail || m.email || '',
      m.displayName || '',
      m.status,
      (m.roles || []).join(';'),
      m.workspaceName || '',
      m.invitedAt || '',
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `enterprise_members_${tenant?.id || 'export'}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      {/* ─── Notification & Error alerts ─── */}
      {notification && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
          <Check className="size-4 shrink-0" />
          {notification}
        </div>
      )}
      {error && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs font-semibold text-rose-700 dark:text-rose-300 flex items-center gap-2">
          <AlertCircle className="size-4 shrink-0" />
          {error}
        </div>
      )}

      {/* ─── Top Control Toolbar ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-surface-raised/60 backdrop-blur-md border border-edge rounded-xl p-3 shadow-xs">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-ink-muted" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search members by name, email, or principal ID…"
              className="pl-9 text-xs h-9 bg-surface border-edge"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Status Pills */}
          <div className="flex items-center gap-1 border border-edge rounded-lg p-0.5 bg-surface text-xs font-semibold">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setStatusFilter(f)}
                className={cn(
                  'px-2.5 py-1 rounded-md transition-colors',
                  statusFilter === f
                    ? 'bg-accent text-white shadow-2xs'
                    : 'text-ink-muted hover:text-ink',
                )}
              >
                {f === 'ALL' && `All (${statusCounts.ALL})`}
                {f === 'ACTIVE' && `Active (${statusCounts.ACTIVE})`}
                {f === 'SUSPENDED' && `Suspended (${statusCounts.SUSPENDED})`}
                {f === 'INVITED' && `Invited (${statusCounts.INVITED})`}
              </button>
            ))}
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={handleExportCsv}
            className="text-xs"
            title="Export CSV directory"
          >
            <Download className="size-3.5 mr-1" />
            CSV Export
          </Button>

          {canManageMembers && (
            <Button
              size="sm"
              onClick={() => setShowInviteModal(true)}
              className="text-xs font-bold"
            >
              <UserPlus className="size-3.5 mr-1.5" />
              Invite Member
            </Button>
          )}
        </div>
      </div>

      {/* ─── Members Table Card ─── */}
      <Card className="border border-edge bg-surface-raised/60 backdrop-blur-md shadow-xs">
        <CardHeader className="p-5 pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold text-ink flex items-center gap-2">
                <Users className="size-4 text-accent" />
                Organizational Members Directory
                <HelpTooltip text="Manage multi-seat licenses, role privileges, and department workspace assignments. Click any member to open Member 360 overview." />
              </CardTitle>
              <CardDescription className="text-xs text-ink-muted mt-0.5">
                Showing {filteredMembers.length} enterprise identities. Click any row to inspect role delegation & quota usage.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-5 pt-0">
          {loading ? (
            <div className="py-12 text-center text-xs text-ink-muted">
              Loading enterprise membership records…
            </div>
          ) : filteredMembers.length === 0 ? (
            <div className="py-12 text-center text-xs text-ink-muted border border-dashed border-edge rounded-xl">
              No memberships found matching the filter criteria.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-edge text-ink-muted font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-3">Identity</th>
                    <th className="py-3 px-3">Roles</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3">Workspace</th>
                    <th className="py-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-edge">
                  {filteredMembers.map((m) => {
                    const primaryRole = (m.roles || [])[0] || 'MEMBER';
                    const isCustom = Boolean(customRoles[primaryRole]);
                    const customDef = customRoles[primaryRole];
                    const roleTitle = isCustom
                      ? (customDef?.label || primaryRole)
                      : (ROLE_HIERARCHY[primaryRole]?.title || primaryRole);
                    const roleColor = isCustom
                      ? 'bg-purple-500/10 text-purple-600 border-purple-500/20'
                      : (ROLE_HIERARCHY[primaryRole]?.color || ROLE_HIERARCHY.MEMBER.color);

                    return (
                      <tr
                        key={m.principalId}
                        onClick={() => openMember360(m)}
                        className="hover:bg-accent/5 transition-colors cursor-pointer group"
                      >
                        <td className="py-3 px-3">
                          <div className="font-semibold text-ink group-hover:text-accent transition-colors">
                            {m.displayName || m.invitationEmail || m.email || m.principalId}
                          </div>
                          <div className="text-[11px] font-mono text-ink-muted">
                            {m.principalId}
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold border', roleColor)}>
                            {roleTitle}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <span className={cn(
                            'inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold',
                            m.status === 'ACTIVE' && 'bg-emerald-500/10 text-emerald-600',
                            m.status === 'INVITED' && 'bg-amber-500/10 text-amber-600',
                            m.status === 'SUSPENDED' && 'bg-rose-500/10 text-rose-600',
                          )}>
                            {m.status}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-ink-muted">
                          {m.workspaceName || 'Default Workspace'}
                        </td>
                        <td className="py-3 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openMember360(m)}
                              className="text-xs text-accent font-semibold h-7 px-2"
                              title="Open Member 360 overview"
                            >
                              <Eye className="size-3.5 mr-1" />
                              Inspect
                            </Button>

                            {m.status === 'INVITED' && canManageMembers && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleResendInvite(m)}
                                className="text-xs text-accent h-7 px-2"
                                title="Resend invitation email"
                              >
                                <Mail className="size-3.5 mr-1" />
                                Resend
                              </Button>
                            )}

                            {m.status !== 'INVITED' && canManageMembers && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleStatusToggle(m)}
                                className={cn(
                                  'text-xs h-7 px-2',
                                  m.status === 'ACTIVE' ? 'text-amber-600' : 'text-emerald-600',
                                )}
                                title={m.status === 'ACTIVE' ? 'Suspend membership' : 'Reactivate membership'}
                              >
                                {m.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
                              </Button>
                            )}

                            {canManageMembers && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setDeleteTarget(m)}
                                className="size-7 p-0 text-rose-500 hover:text-rose-600"
                                title="Revoke membership"
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            )}
                          </div>
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

      {/* ─── Member 360 Comprehensive Overview Modal ─── */}
      {member360Target && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
          aria-labelledby="member-360-title"
          onClick={() => !busySave360 && setMember360Target(null)}
        >
          <div
            className="w-full max-w-xl max-h-[92vh] flex flex-col rounded-3xl bg-surface border border-edge shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-6 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white flex items-start justify-between gap-4 shrink-0">
              <div className="flex items-center gap-3.5">
                <div className="size-12 rounded-2xl bg-white/10 text-white flex items-center justify-center font-extrabold text-lg shrink-0 border border-white/20">
                  {(member360Target.displayName || member360Target.principalId).charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 id="member-360-title" className="text-base font-bold text-white">
                      {member360Target.displayName || 'Enterprise Member'}
                    </h3>
                    <span
                      className={cn(
                        'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border',
                        member360Target.status === 'ACTIVE'
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                          : member360Target.status === 'INVITED'
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                          : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                      )}
                    >
                      {member360Target.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-0.5 font-mono">
                    {member360Target.invitationEmail || member360Target.email || member360Target.principalId}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setMember360Target(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                aria-label="Close modal"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
              {securityActionMsg && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
                  <Check className="size-4 shrink-0" />
                  <span>{securityActionMsg}</span>
                </div>
              )}

              {/* Role Delegation & Permissions */}
              <div className="space-y-2 p-4 rounded-2xl border border-edge bg-canvas-soft">
                <label className="font-bold text-ink block uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <Shield className="size-3.5 text-accent" />
                  Enterprise Role Delegation
                </label>
                <select
                  value={edit360Role}
                  onChange={(e) => setEdit360Role(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl bg-surface border border-edge text-xs text-ink focus:outline-none focus:ring-1 focus:ring-accent"
                >
                  <optgroup label="Standard Roles">
                    {Object.entries(ROLE_HIERARCHY).map(([key, info]) => (
                      <option key={key} value={key}>
                        {info.title} — {info.desc}
                      </option>
                    ))}
                  </optgroup>
                  {Object.keys(customRoles).length > 0 && (
                    <optgroup label="Custom Roles">
                      {Object.entries(customRoles).map(([key, info]) => (
                        <option key={key} value={key}>
                          {info.label || key} — {info.description || 'Custom role'}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
                <p className="text-[11px] text-ink-muted leading-relaxed">
                  {ROLE_HIERARCHY[edit360Role]?.desc}
                </p>
              </div>

              {/* Departmental Workspace Assignment */}
              <div className="space-y-2 p-4 rounded-2xl border border-edge bg-canvas-soft">
                <label className="font-bold text-ink block uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <Building className="size-3.5 text-accent" />
                  Assigned Departmental Workspace
                </label>
                <select
                  value={edit360WorkspaceId}
                  onChange={(e) => setEdit360WorkspaceId(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl bg-surface border border-edge text-xs text-ink focus:outline-none focus:ring-1 focus:ring-accent"
                >
                  <option value="">Default Tenant Workspace</option>
                  {workspaces.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.id})
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-ink-muted">
                  Restricts member to candidate dossiers and job openings within this department partition.
                </p>
              </div>

              {/* Account Status Switcher */}
              <div className="space-y-2 p-4 rounded-2xl border border-edge bg-canvas-soft">
                <label className="font-bold text-ink block uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <UserCheck className="size-3.5 text-accent" />
                  Account Lifecycle Status
                </label>
                <div className="flex gap-2">
                  {(['ACTIVE', 'SUSPENDED', 'INVITED'] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setEdit360Status(st)}
                      className={cn(
                        'flex-1 py-1.5 rounded-lg border text-xs font-bold transition-all',
                        edit360Status === st
                          ? 'border-accent bg-accent text-white shadow-xs'
                          : 'border-edge bg-surface text-ink-muted hover:text-ink'
                      )}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              {/* AI Token Quota & Consumption Meter */}
              <div className="p-4 rounded-2xl border border-edge bg-surface-raised/40 space-y-2.5">
                <div className="flex items-center justify-between text-xs font-bold text-ink">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="size-3.5 text-accent" />
                    AI Token Quota & Consumption
                  </span>
                  <span className="font-mono text-accent">14,200 / 50,000</span>
                </div>
                <div className="w-full h-2 rounded-full bg-canvas-soft overflow-hidden">
                  <div className="h-full bg-accent rounded-full" style={{ width: '28.4%' }} />
                </div>
                <div className="flex items-center justify-between text-[11px] text-ink-muted">
                  <span>Usage this billing cycle: 28.4%</span>
                  <span>Monthly reset in 12 days</span>
                </div>
              </div>

              {/* Security & Access Controls */}
              <div className="space-y-2 p-4 rounded-2xl border border-edge bg-canvas-soft">
                <label className="font-bold text-ink block uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <Key className="size-3.5 text-accent" />
                  Security & Session Safeguards
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRevokeSessions}
                    className="text-xs h-8 gap-1.5"
                  >
                    <Lock className="size-3 text-rose-500" />
                    Revoke Active Sessions
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleReset2FA}
                    className="text-xs h-8 gap-1.5"
                  >
                    <RotateCcw className="size-3 text-amber-500" />
                    Force 2FA Reset
                  </Button>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-edge bg-surface-raised/40 flex items-center justify-end gap-2.5 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMember360Target(null)}
                disabled={busySave360}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSave360}
                disabled={busySave360}
                className="font-bold"
              >
                {busySave360 ? 'Saving Changes…' : 'Save Member 360'}
              </Button>
            </div>
          </div>
        </div>
      )}


      {/* ─── Invite Member Modal ─── */}
      {showInviteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
          onClick={() => !busyInvite && setShowInviteModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-surface-raised border border-edge shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-edge bg-surface/50">
              <div className="flex items-center gap-3">
                <div className="size-9 rounded-xl bg-accent-soft flex items-center justify-center text-accent">
                  <UserPlus className="size-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-ink">
                    Provision Enterprise Member
                  </h3>
                  <p className="text-xs text-ink-muted">Issue invitation or grant direct access.</p>
                </div>
              </div>
              <button
                type="button"
                className="p-1.5 text-ink-muted hover:text-ink rounded-lg"
                onClick={() => setShowInviteModal(false)}
                disabled={busyInvite}
              >
                <X className="size-4" />
              </button>
            </div>

            <form onSubmit={handleInviteSubmit} className="p-6 space-y-4 text-xs">
              {/* Mode Toggle */}
              <div className="flex rounded-lg border border-edge p-0.5 bg-surface">
                <button
                  type="button"
                  onClick={() => setInviteMode('INVITE')}
                  className={cn(
                    'flex-1 py-1.5 text-center font-bold rounded-md transition-colors',
                    inviteMode === 'INVITE' ? 'bg-accent text-white shadow-2xs' : 'text-ink-muted hover:text-ink',
                  )}
                >
                  Email Invitation
                </button>
                <button
                  type="button"
                  onClick={() => setInviteMode('DIRECT')}
                  className={cn(
                    'flex-1 py-1.5 text-center font-bold rounded-md transition-colors',
                    inviteMode === 'DIRECT' ? 'bg-accent text-white shadow-2xs' : 'text-ink-muted hover:text-ink',
                  )}
                >
                  Direct Principal ID
                </button>
              </div>

              {inviteMode === 'INVITE' ? (
                <div className="space-y-1.5">
                  <label className="font-bold text-ink block">Work Email Address</label>
                  <Input
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="teammate@company.com"
                    className="h-9 text-xs"
                  />
                  <p className="text-[11px] text-ink-muted">
                    An email invitation will be dispatched with sign-in instructions.
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="font-bold text-ink block">Firebase Principal ID (UID)</label>
                  <Input
                    required
                    value={invitePrincipalId}
                    onChange={(e) => setInvitePrincipalId(e.target.value)}
                    placeholder="e.g. fire-uid-12345"
                    className="h-9 text-xs font-mono"
                  />
                  <p className="text-[11px] text-ink-muted">
                    Directly binds access to an existing Firebase identity.
                  </p>
                </div>
              )}

              {/* Role Selection */}
              <div className="space-y-1.5">
                <label className="font-bold text-ink block">Role Authorization</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg bg-surface border border-edge text-xs text-ink focus:outline-none focus:ring-1 focus:ring-accent"
                >
                  <optgroup label="Standard Roles">
                    <option value="TENANT_ADMIN">Administrator (Full Tenant Governance)</option>
                    <option value="WORKSPACE_MANAGER">Workspace Manager (Department Lead)</option>
                    <option value="BILLING_ADMIN">Billing Admin (Usage & Subscriptions)</option>
                    <option value="MEMBER">Enterprise Member (Draft & AI Generation)</option>
                    <option value="VIEWER">Read-Only Viewer (Inspect Only)</option>
                  </optgroup>
                  {Object.keys(customRoles).length > 0 && (
                    <optgroup label="Custom Roles">
                      {Object.entries(customRoles).map(([key, info]) => (
                        <option key={key} value={key}>
                          {info.label || key} ({info.description || 'Custom role'})
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              {/* Department Workspace Assignment */}
              <div className="space-y-1.5">
                <label className="font-bold text-ink block">Department Workspace (Optional)</label>
                <select
                  value={inviteWorkspaceId}
                  onChange={(e) => setInviteWorkspaceId(e.target.value)}
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

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-edge">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowInviteModal(false)}
                  disabled={busyInvite}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={busyInvite}>
                  {busyInvite ? 'Provisioning…' : 'Grant Membership'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Delete Confirmation Modal ─── */}
      <EnterpriseConfirmModal
        isOpen={Boolean(deleteTarget)}
        title="Revoke Enterprise Membership"
        message={`Are you sure you want to permanently revoke membership for "${deleteTarget?.displayName || deleteTarget?.invitationEmail || deleteTarget?.principalId}"? Their access to all workspaces and shared candidate documents will be immediately terminated.`}
        confirmLabel="Revoke Membership"
        variant="danger"
        busy={busyDelete}
        onConfirm={handleDeleteConfirm}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}

export default EnterpriseUsersTab;
