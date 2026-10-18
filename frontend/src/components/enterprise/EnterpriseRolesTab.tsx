/**
 * Enterprise Roles Tab (RBAC Permission Matrix)
 *
 * Fine-grained RBAC permission matrix (Tenant Owner, Admin, Manager, Member, Viewer),
 * capability breakdowns by domain, and custom role assignments.
 */

import { useState, useEffect, useMemo } from 'react';
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
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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

  useEffect(() => {
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

  const standardRoles = ['TENANT_OWNER', 'TENANT_ADMIN', 'WORKSPACE_MANAGER', 'BILLING_ADMIN', 'MEMBER', 'VIEWER'];

  const checkHasPermission = (role: string, permId: string): boolean => {
    if (role === 'TENANT_OWNER') return true;
    const rolePerms = matrix?.roles?.[role] || [];
    if (rolePerms.includes('*')) return true;
    return rolePerms.includes(permId);
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

            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-ink-muted" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search capabilities…"
                className="pl-8 text-xs h-8 bg-surface border-edge"
              />
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
                    {standardRoles.map((r) => (
                      <th
                        key={r}
                        className={cn(
                          'py-3 px-3 text-center whitespace-nowrap',
                          selectedRole === r && 'bg-accent-soft/40 text-accent font-black',
                        )}
                      >
                        {ROLE_THEMES[r]?.label.replace('Enterprise ', '')}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-edge">
                  {filteredDomains.map((domain) => (
                    <tr key={domain.id} className="bg-surface/30">
                      <td colSpan={standardRoles.length + 1} className="py-2.5 px-3">
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
                        {standardRoles.map((roleId) => {
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
    </div>
  );
}

export default EnterpriseRolesTab;
