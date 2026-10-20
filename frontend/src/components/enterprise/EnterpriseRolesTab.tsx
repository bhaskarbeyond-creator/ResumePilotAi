/**
 * Enterprise Roles Tab (RBAC Permission Matrix)
 *
 * Fine-grained RBAC permission matrix (Tenant Owner, Admin, Manager, Member, Viewer),
 * capability breakdowns by domain, and custom role assignments.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Shield,
  Lock,
  Sliders,
  FileText,
  CreditCard,
  Users,
  Check,
  X,
  Search,
  Layers,
  Sparkles,
  Plus,
  Trash2,
  AlertCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useEnterprise } from './EnterpriseContext';
import { HelpTooltip } from './HelpTooltip';
import { enterpriseApi, type EnterpriseRolesMatrixResponse } from '@/lib/enterprise-api';
import { cn } from '@/lib/utils';

interface RoleTheme {
  label: string;
  badgeClass: string;
  color: string;
  summary: string;
  scope: string;
}

const ROLE_THEMES: Record<string, RoleTheme> = {
  TENANT_OWNER: {
    label: 'Tenant Owner',
    badgeClass: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
    color: 'emerald',
    summary: 'Full root authority over tenant lifecycle, security keys, billing, and destructive actions.',
    scope: 'Tenant-wide (Sovereign Root)',
  },
  TENANT_ADMIN: {
    label: 'Administrator',
    badgeClass: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20',
    color: 'indigo',
    summary: 'Administrative control for memberships, workspaces, security policies, AI routing, and audit logs.',
    scope: 'Tenant-wide',
  },
  WORKSPACE_MANAGER: {
    label: 'Workspace Manager',
    badgeClass: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
    color: 'amber',
    summary: 'Department-level management for squads, teams, and shared candidate resources.',
    scope: 'Workspace-scoped',
  },
  BILLING_ADMIN: {
    label: 'Billing Administrator',
    badgeClass: 'bg-cyan-500/10 text-cyan-600 border-cyan-500/20',
    color: 'cyan',
    summary: 'Subscription plans, invoice records, and token quota allocations without IAM rights.',
    scope: 'Billing & Quotas',
  },
  MEMBER: {
    label: 'Enterprise Member',
    badgeClass: 'bg-slate-500/10 text-slate-600 border-slate-500/20',
    color: 'slate',
    summary: 'Standard workspace access to create, optimize, share resumes, and execute AI generations.',
    scope: 'Workspace-scoped',
  },
  VIEWER: {
    label: 'Read-Only Viewer',
    badgeClass: 'bg-slate-500/10 text-slate-500 border-slate-500/20',
    color: 'slate',
    summary: 'Read-only access to inspect published candidate documents and team rosters.',
    scope: 'Read-only',
  },
};

interface DomainCategory {
  id: string;
  name: string;
  description: string;
  permissions: Array<{ id: string; label: string }>;
}

const DOMAINS: DomainCategory[] = [
  {
    id: 'org',
    name: 'Organization & Tenancy',
    description: 'Root tenant administration, lifecycle settings, and integrations',
    permissions: [
      { id: 'tenant.read', label: 'Tenant metadata & overview read' },
      { id: 'tenant.settings.write', label: 'Organization lifecycle & settings write' },
      { id: 'tenant.integrations.manage', label: 'Webhooks & ATS integration management' },
    ],
  },
  {
    id: 'iam',
    name: 'Identity & Access (IAM)',
    description: 'Enterprise member directory, role assignments, and member invitations',
    permissions: [
      { id: 'tenant.members.read', label: 'View members & invitations directory' },
      { id: 'tenant.members.invite', label: 'Issue email invitations to teammates' },
      { id: 'tenant.members.manage', label: 'Manage memberships, roles & status' },
      { id: 'tenant.roles.manage', label: 'Define custom role permissions' },
    ],
  },
  {
    id: 'workspaces',
    name: 'Workspaces & Teams',
    description: 'Workspace partitioning, squad management, and team assignments',
    permissions: [
      { id: 'workspace.read', label: 'Read workspace metadata & member rosters' },
      { id: 'workspace.manage', label: 'Manage teams, squads & settings' },
      { id: 'workspace.members.manage', label: 'Assign & remove workspace members' },
      { id: 'tenant.workspaces.manage', label: 'Create & archive workspace partitions' },
    ],
  },
  {
    id: 'documents',
    name: 'Documents & Resumes',
    description: 'Resume drafting, document sharing, and candidate portfolio management',
    permissions: [
      { id: 'resource.read', label: 'Read enterprise resumes & assets' },
      { id: 'resource.create', label: 'Author new resumes & portfolios' },
      { id: 'resource.update', label: 'Update, clone, or delete documents' },
      { id: 'resource.share', label: 'Export DOCX/PDF & generate share links' },
    ],
  },
  {
    id: 'ai',
    name: 'AI Engine & Quotas',
    description: 'AI-assisted generation, foundation model governance, and token quotas',
    permissions: [
      { id: 'ai.use', label: 'Execute AI summary & interview generations' },
      { id: 'tenant.ai.manage', label: 'Configure model allowlists & quota limits' },
    ],
  },
  {
    id: 'security',
    name: 'Security & Audit Trail',
    description: 'Machine service accounts, secret rotation, DLQ, and audit forensics',
    permissions: [
      { id: 'tenant.security.read', label: 'Inspect service accounts, DLQ & posture' },
      { id: 'tenant.security.manage', label: 'Create, rotate & revoke service account keys' },
      { id: 'tenant.audit.read', label: 'Read immutable forensic audit trails' },
    ],
  },
  {
    id: 'billing',
    name: 'Billing & Subscriptions',
    description: 'Subscription management, plan upgrades, and usage analytics',
    permissions: [
      { id: 'tenant.billing.read', label: 'View subscription tier & active plan' },
      { id: 'tenant.billing.manage', label: 'Manage billing contacts & plan upgrades' },
      { id: 'tenant.usage.read', label: 'Read token consumption & cost analytics' },
    ],
  },
];

export function EnterpriseRolesTab() {
  const { tenant } = useEnterprise();
  const [matrix, setMatrix] = useState<EnterpriseRolesMatrixResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState('TENANT_ADMIN');

  // Custom Role Modal state
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [newRoleId, setNewRoleId] = useState('');
  const [newRoleLabel, setNewRoleLabel] = useState('');
  const [newRoleDesc, setNewRoleDesc] = useState('');
  const [selectedPerms, setSelectedPerms] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchMatrix = useCallback(() => {
    if (!tenant?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    enterpriseApi.getRolesMatrix(tenant.id)
      .then((res) => setMatrix(res))
      .catch(() => setMatrix(null))
      .finally(() => setLoading(false));
  }, [tenant?.id]);

  useEffect(() => {
    fetchMatrix();
  }, [fetchMatrix]);

  const standardRoles = ['TENANT_OWNER', 'TENANT_ADMIN', 'WORKSPACE_MANAGER', 'BILLING_ADMIN', 'MEMBER', 'VIEWER'];
  const customRoleKeys = Object.keys(matrix?.customRoles || {});
  const allRoleKeys = [...standardRoles, ...customRoleKeys];

  const checkHasPermission = (role: string, permId: string): boolean => {
    if (role === 'TENANT_OWNER') return true;
    if (matrix?.customRoles?.[role]) {
      return matrix.customRoles[role].permissions?.includes(permId) ?? false;
    }
    const rolePerms = matrix?.roles?.[role] || [];
    if (rolePerms.includes('*')) return true;
    return rolePerms.includes(permId);
  };

  const togglePermission = (permId: string) => {
    setSelectedPerms((prev) => {
      const next = new Set(prev);
      if (next.has(permId)) next.delete(permId);
      else next.add(permId);
      return next;
    });
  };

  const handleCreateCustomRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant?.id) return;
    const cleanId = (newRoleId.trim() || newRoleLabel.trim().toUpperCase().replace(/[^A-Z0-9]/g, '_'));
    if (!cleanId) {
      setFeedback({ type: 'error', text: 'Please enter a valid role identifier or label.' });
      return;
    }
    if (standardRoles.includes(cleanId)) {
      setFeedback({ type: 'error', text: 'Cannot override built-in standard roles.' });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);
    try {
      const configRes = await enterpriseApi.getConfiguration(tenant.id);
      const currentConfig = configRes.configuration || {};
      const existingCustom = (currentConfig.customRoles && typeof currentConfig.customRoles === 'object' && !Array.isArray(currentConfig.customRoles))
        ? currentConfig.customRoles
        : {};

      const updatedCustom = {
        ...existingCustom,
        [cleanId]: {
          label: newRoleLabel.trim() || cleanId,
          description: newRoleDesc.trim() || 'Custom tenant authorization role',
          permissions: Array.from(selectedPerms),
        },
      };

      await enterpriseApi.updateConfiguration(tenant.id, currentConfig.revision || 1, {
        customRoles: updatedCustom,
      });

      setFeedback({ type: 'success', text: `Role ${cleanId} created successfully!` });
      fetchMatrix();
      setSelectedRole(cleanId);
      setTimeout(() => {
        setShowCustomModal(false);
        setNewRoleId('');
        setNewRoleLabel('');
        setNewRoleDesc('');
        setSelectedPerms(new Set());
        setFeedback(null);
      }, 1200);
    } catch (err: any) {
      setFeedback({ type: 'error', text: err?.message || 'Failed to persist custom role.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteCustomRole = async (roleId: string) => {
    if (!tenant?.id || !confirm(`Are you sure you want to delete custom role ${roleId}?`)) return;
    try {
      const configRes = await enterpriseApi.getConfiguration(tenant.id);
      const currentConfig = configRes.configuration || {};
      const existingCustom = { ...((currentConfig.customRoles as Record<string, any>) || {}) };
      delete existingCustom[roleId];

      await enterpriseApi.updateConfiguration(tenant.id, currentConfig.revision || 1, {
        customRoles: existingCustom,
      });
      fetchMatrix();
      if (selectedRole === roleId) setSelectedRole('TENANT_ADMIN');
    } catch (err: any) {
      alert(err?.message || 'Failed to delete role.');
    }
  };

  const filteredDomains = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return DOMAINS;
    return DOMAINS.map((domain) => {
      const perms = domain.permissions.filter(
        (p) => p.label.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)
      );
      return { ...domain, permissions: perms };
    }).filter((d) => d.permissions.length > 0);
  }, [searchQuery]);

  return (
    <div className="space-y-6">
      {/* ─── Role Hierarchy Cards ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {standardRoles.map((roleId) => {
          const theme = ROLE_THEMES[roleId] || ROLE_THEMES.MEMBER;
          const isSelected = selectedRole === roleId;
          return (
            <div
              key={roleId}
              onClick={() => setSelectedRole(roleId)}
              className={cn(
                'p-4 rounded-xl border text-xs cursor-pointer transition-all select-none',
                isSelected
                  ? 'border-accent bg-accent-soft/30 shadow-xs'
                  : 'border-edge bg-surface-raised/60 hover:bg-surface-raised',
              )}
            >
              <div className="flex items-center justify-between font-bold text-ink">
                <span>{theme.label}</span>
                <span className={cn('px-2 py-0.5 rounded text-[10px] font-bold border', theme.badgeClass)}>
                  {theme.scope}
                </span>
              </div>
              <p className="text-[11px] text-ink-muted mt-2 leading-relaxed">{theme.summary}</p>
            </div>
          );
        })}

        {/* Custom Roles Defined on Tenant */}
        {customRoleKeys.map((cRoleKey) => {
          const def = matrix?.customRoles?.[cRoleKey];
          const isSelected = selectedRole === cRoleKey;
          return (
            <div
              key={cRoleKey}
              onClick={() => setSelectedRole(cRoleKey)}
              className={cn(
                'p-4 rounded-xl border text-xs cursor-pointer transition-all select-none relative group',
                isSelected
                  ? 'border-accent bg-accent-soft/40 shadow-xs ring-1 ring-accent'
                  : 'border-edge bg-surface-raised/60 hover:bg-surface-raised',
              )}
            >
              <div className="flex items-center justify-between font-bold text-ink">
                <span className="truncate pr-2">{def?.label || cRoleKey}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold border bg-purple-500/10 text-purple-600 border-purple-500/20">
                    Custom Role
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteCustomRole(cRoleKey);
                    }}
                    title="Delete custom role"
                    className="p-1 rounded-md text-ink-muted hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-ink-muted mt-2 leading-relaxed line-clamp-2">
                {def?.description || 'Custom organizational role'} ({def?.permissions?.length || 0} permissions)
              </p>
            </div>
          );
        })}
      </div>

      {/* ─── Permission Matrix Table ─── */}
      <Card className="border border-edge bg-surface-raised/60 backdrop-blur-md shadow-xs">
        <CardHeader className="p-5 pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-base font-bold text-ink flex items-center gap-2">
                <Shield className="size-4 text-accent" />
                Fine-Grained Capability & Permission Matrix
                <HelpTooltip text="Live server authorization matrix mapping permissions to standard and custom tenant roles." />
              </CardTitle>
              <CardDescription className="text-xs text-ink-muted mt-0.5">
                Inspect capabilities granted to each administrative tier across system domains.
              </CardDescription>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowCustomModal(true)}
                className="text-xs font-bold gap-1.5 shadow-xs"
              >
                <Plus className="size-3.5" />
                Define Custom Role
              </Button>
              <div className="relative w-full sm:w-56">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-ink-muted" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search capabilities…"
                  className="pl-8 text-xs h-8 bg-surface border-edge"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-5 pt-0">
          {loading ? (
            <div className="py-12 text-center text-xs text-ink-muted">
              Loading enterprise authorization matrix…
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-edge text-ink-muted font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-3 min-w-[260px]">Capability / Scope</th>
                    {allRoleKeys.map((r) => {
                      const isCustom = customRoleKeys.includes(r);
                      const customDef = matrix?.customRoles?.[r];
                      const label = isCustom
                        ? (customDef?.label || r)
                        : (ROLE_THEMES[r]?.label.replace('Enterprise ', '') || r);
                      return (
                        <th
                          key={r}
                          className={cn(
                            'py-3 px-3 text-center whitespace-nowrap',
                            selectedRole === r && 'bg-accent-soft/40 text-accent font-black',
                          )}
                        >
                          <div className="flex flex-col items-center">
                            <span>{label}</span>
                            {isCustom && (
                              <span className="text-[9px] font-normal text-purple-600 dark:text-purple-400">custom</span>
                            )}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-edge">
                  {filteredDomains.map((domain) => (
                    <tr key={domain.id} className="bg-surface/30">
                      <td colSpan={allRoleKeys.length + 1} className="py-2.5 px-3">
                        <div className="font-bold text-ink text-xs uppercase tracking-wider">
                          {domain.name}
                        </div>
                        <div className="text-[11px] text-ink-muted">{domain.description}</div>
                      </td>
                    </tr>
                  ))}
                  {filteredDomains.flatMap((domain) =>
                    domain.permissions.map((perm) => (
                      <tr key={perm.id} className="hover:bg-surface-raised/40 transition-colors">
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-ink">{perm.label}</div>
                          <div className="text-[10px] font-mono text-ink-muted">{perm.id}</div>
                        </td>
                        {allRoleKeys.map((roleId) => {
                          const hasGrant = checkHasPermission(roleId, perm.id);
                          return (
                            <td
                              key={roleId}
                              className={cn(
                                'py-2.5 px-3 text-center',
                                selectedRole === roleId && 'bg-accent-soft/20',
                              )}
                            >
                              {hasGrant ? (
                                <span className="inline-flex size-5 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
                                  <Check className="size-3.5 stroke-[3]" />
                                </span>
                              ) : (
                                <span className="inline-flex size-5 items-center justify-center rounded-full bg-slate-500/10 text-slate-400">
                                  <X className="size-3 stroke-[2]" />
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Define Custom Role Modal ─── */}
      {showCustomModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-surface border border-edge rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-edge bg-surface-raised/40">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-accent-soft text-accent">
                  <Shield className="size-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-ink">Define Custom Role</h3>
                  <p className="text-xs text-ink-muted">Configure fine-grained tenant authorization boundaries</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCustomModal(false)}
                className="p-1 rounded-lg text-ink-muted hover:text-ink hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleCreateCustomRole} className="flex-1 overflow-y-auto p-5 space-y-4">
              {feedback && (
                <div
                  className={cn(
                    'p-3 rounded-xl text-xs font-semibold flex items-center gap-2',
                    feedback.type === 'success'
                      ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200'
                      : 'bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300 border border-rose-200'
                  )}
                >
                  {feedback.type === 'success' ? <Check className="size-4" /> : <AlertCircle className="size-4" />}
                  <span>{feedback.text}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-ink block text-xs">Role Label / Name</label>
                  <Input
                    required
                    value={newRoleLabel}
                    onChange={(e) => {
                      setNewRoleLabel(e.target.value);
                      if (!newRoleId) {
                        setNewRoleId(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '_'));
                      }
                    }}
                    placeholder="e.g. Customer Support Specialist"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-ink block text-xs">Role Identifier (Code)</label>
                  <Input
                    required
                    value={newRoleId}
                    onChange={(e) => setNewRoleId(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
                    placeholder="e.g. SUPPORT_SPECIALIST"
                    className="h-8 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-ink block text-xs">Role Purpose & Description</label>
                <Input
                  value={newRoleDesc}
                  onChange={(e) => setNewRoleDesc(e.target.value)}
                  placeholder="e.g. Help desk operator handling ticket triage and resume review"
                  className="h-8 text-xs"
                />
              </div>

              {/* Permission Checkboxes by Domain */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-ink text-xs uppercase tracking-wider">
                    Assigned Permissions ({selectedPerms.size} selected)
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const allP = DOMAINS.flatMap((d) => d.permissions.map((p) => p.id));
                        setSelectedPerms(new Set(allP));
                      }}
                      className="text-[11px] font-bold text-accent hover:underline"
                    >
                      Select All
                    </button>
                    <span className="text-ink-muted">·</span>
                    <button
                      type="button"
                      onClick={() => setSelectedPerms(new Set())}
                      className="text-[11px] font-bold text-ink-muted hover:underline"
                    >
                      Clear All
                    </button>
                  </div>
                </div>

                <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                  {DOMAINS.map((domain) => (
                    <div key={domain.id} className="p-3 rounded-xl border border-edge bg-canvas/40 space-y-2">
                      <div className="font-bold text-ink text-xs flex items-center justify-between">
                        <span>{domain.name}</span>
                        <span className="text-[10px] text-ink-muted">{domain.permissions.length} perms</span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {domain.permissions.map((perm) => {
                          const isChecked = selectedPerms.has(perm.id);
                          return (
                            <label
                              key={perm.id}
                              onClick={() => togglePermission(perm.id)}
                              className={cn(
                                'flex items-start gap-2 p-2 rounded-lg border text-xs cursor-pointer transition-colors',
                                isChecked
                                  ? 'border-accent bg-accent-soft/40 text-ink'
                                  : 'border-edge bg-surface text-ink-muted hover:text-ink'
                              )}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {}} // handled by parent onClick
                                className="mt-0.5 rounded border-edge text-accent focus:ring-accent"
                              />
                              <div className="min-w-0">
                                <div className="font-semibold text-[11px] leading-tight text-ink">{perm.label}</div>
                                <div className="text-[9px] font-mono text-ink-muted">{perm.id}</div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-edge">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCustomModal(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={isSubmitting || selectedPerms.size === 0}
                  className="gap-1.5"
                >
                  {isSubmitting ? (
                    'Persisting Role…'
                  ) : (
                    <>
                      <Check className="size-3.5" />
                      Save Custom Role
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default EnterpriseRolesTab;
