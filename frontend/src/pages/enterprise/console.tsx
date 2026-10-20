/**
 * Enterprise Multi-Tenant Console (Master Edition)
 *
 * Dedicated administration console for enterprise organizations:
 * - 17-Component Enterprise Suite Parity (Zero Truncation)
 * - Strict multi-tenant isolation via X-Tenant-Id header
 * - Email verification gate handling HTTP 403 EMAIL_VERIFICATION_REQUIRED
 * - Cuba M3 executive glassmorphic styling
 * - Zero phantom hooks; live MariaDB REST API integration
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import {
  Building2,
  Users,
  Shield,
  Key,
  Activity,
  Plus,
  Search,
  CheckCircle2,
  Lock,
  Globe,
  Sliders,
  FileText,
  Zap,
  BarChart2,
  HelpCircle,
  Settings,
  Command,
  Mail,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/providers/auth-provider';
import { auth } from '@/lib/firebase';
import { sendEmailVerification } from 'firebase/auth';
import { EnterpriseProvider, useEnterprise } from '@/components/enterprise/EnterpriseContext';
import { EnterpriseOverviewTab } from '@/components/enterprise/EnterpriseOverviewTab';
import { EnterpriseResumesTab } from '@/components/enterprise/EnterpriseResumesTab';
import { EnterpriseAiTab } from '@/components/enterprise/EnterpriseAiTab';
import { EnterpriseUsersTab } from '@/components/enterprise/EnterpriseUsersTab';
import { EnterpriseRolesTab } from '@/components/enterprise/EnterpriseRolesTab';
import { EnterpriseSecurityTab } from '@/components/enterprise/EnterpriseSecurityTab';
import { EnterpriseWorkspacesTab } from '@/components/enterprise/EnterpriseWorkspacesTab';
import { EnterpriseTeamsTab } from '@/components/enterprise/EnterpriseTeamsTab';
import { EnterpriseUsageTab } from '@/components/enterprise/EnterpriseUsageTab';
import { EnterpriseAuditTab } from '@/components/enterprise/EnterpriseAuditTab';
import { EnterpriseEmailTab } from '@/components/enterprise/EnterpriseEmailTab';
import { EnterpriseSupportTab } from '@/components/enterprise/EnterpriseSupportTab';
import { EnterprisePlatformTab } from '@/components/enterprise/EnterprisePlatformTab';
import { EnterpriseSettingsTab } from '@/components/enterprise/EnterpriseSettingsTab';
import { cn } from '@/lib/utils';

export type EnterpriseTabId =
  | 'overview'
  | 'resumes'
  | 'members'
  | 'teams'
  | 'workspaces'
  | 'access'
  | 'ai'
  | 'security'
  | 'usage'
  | 'email'
  | 'audit'
  | 'support'
  | 'settings'
  | 'platform';

const VALID_ENTERPRISE_TABS: EnterpriseTabId[] = [
  'overview',
  'resumes',
  'members',
  'teams',
  'workspaces',
  'access',
  'ai',
  'security',
  'usage',
  'email',
  'audit',
  'support',
  'settings',
  'platform',
];

interface NavItem {
  id: EnterpriseTabId;
  label: string;
  group: 'Home' | 'Organization' | 'Governance' | 'Administration';
  icon: typeof Activity;
  permission?: string;
  platformOnly?: boolean;
}

const NAVIGATION: NavItem[] = [
  { id: 'overview', label: 'Overview', group: 'Home', icon: Activity },
  { id: 'resumes', label: 'Talent & Resumes', group: 'Organization', icon: FileText },
  { id: 'members', label: 'Users & IAM', group: 'Organization', icon: Users, permission: 'tenant.members.read' },
  { id: 'teams', label: 'Teams', group: 'Organization', icon: Users, permission: 'workspace.read' },
  { id: 'workspaces', label: 'Workspaces', group: 'Organization', icon: Sliders, permission: 'workspace.read' },
  { id: 'access', label: 'Roles & Permissions', group: 'Governance', icon: Shield, permission: 'tenant.roles.manage' },
  { id: 'ai', label: 'AI Workspace', group: 'Governance', icon: Zap, permission: 'tenant.ai.manage' },
  { id: 'security', label: 'Security & M2M', group: 'Governance', icon: Lock, permission: 'tenant.security.read' },
  { id: 'usage', label: 'Usage & Quotas', group: 'Governance', icon: BarChart2, permission: 'tenant.usage.read' },
  { id: 'email', label: 'Email & Notifications', group: 'Governance', icon: Mail, permission: 'tenant.settings.write' },
  { id: 'audit', label: 'Audit Logs', group: 'Governance', icon: FileText, permission: 'tenant.audit.read' },
  { id: 'support', label: 'Support Access', group: 'Administration', icon: HelpCircle, permission: 'tenant.settings.write' },
  { id: 'settings', label: 'Organization Settings', group: 'Administration', icon: Settings, permission: 'tenant.settings.write' },
  { id: 'platform', label: 'Platform Administration', group: 'Administration', icon: Command, platformOnly: true },
];

const NAV_GROUPS: Array<'Home' | 'Organization' | 'Governance' | 'Administration'> = [
  'Home',
  'Organization',
  'Governance',
  'Administration',
];

function EnterpriseConsoleInner() {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const {
    tenant,
    workspace,
    tenants,
    workspaces,
    platformAdmin,
    hasPermission,
    selectTenant,
    selectWorkspace,
    loading,
    error,
    emailVerificationRequired,
    clearEmailVerificationError,
    reload,
  } = useEnterprise();

  // Tab State resolution from query or path
  const resolveTab = useCallback((): EnterpriseTabId => {
    const tabFromQuery = searchParams.get('tab') as EnterpriseTabId;
    if (tabFromQuery && VALID_ENTERPRISE_TABS.includes(tabFromQuery)) {
      return tabFromQuery;
    }

    const segments = location.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
    if (segments[0] === 'org') {
      const candidate1 = segments[1]?.toLowerCase();
      const candidate2 = segments[2]?.toLowerCase();
      if (candidate2 && VALID_ENTERPRISE_TABS.includes(candidate2 as EnterpriseTabId)) {
        return candidate2 as EnterpriseTabId;
      }
      if (candidate1 && VALID_ENTERPRISE_TABS.includes(candidate1 as EnterpriseTabId)) {
        return candidate1 as EnterpriseTabId;
      }
    }

    return 'overview';
  }, [location.pathname, searchParams]);

  const [activeTab, setActiveTab] = useState<EnterpriseTabId>(resolveTab);

  // Email verification action state
  const [verificationSent, setVerificationSent] = useState(false);
  const [verificationSending, setVerificationSending] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);

  // Deep-link initial parameters
  const [tabParams, setTabParams] = useState<Record<string, string>>({});

  useEffect(() => {
    const nextTab = resolveTab();
    if (nextTab !== activeTab) {
      setActiveTab(nextTab);
    }
  }, [resolveTab, activeTab]);

  const handleTabSelect = useCallback((tabId: EnterpriseTabId, params?: Record<string, string>) => {
    setActiveTab(tabId);
    if (params) setTabParams(params);
    else setTabParams({});

    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('tab', tabId);
    if (params) {
      Object.entries(params).forEach(([k, v]) => nextParams.set(k, v));
    }
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams]);

  const handleResendEmailVerification = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    setVerificationSending(true);
    setVerificationError(null);
    try {
      await sendEmailVerification(currentUser);
      setVerificationSent(true);
      setTimeout(() => setVerificationSent(false), 5000);
    } catch (err: unknown) {
      setVerificationError(err instanceof Error ? err.message : 'Failed to send verification link');
    } finally {
      setVerificationSending(false);
    }
  };

  const handleRefreshVerification = async () => {
    const currentUser = auth.currentUser;
    if (currentUser) {
      await currentUser.reload();
      if (currentUser.emailVerified) {
        clearEmailVerificationError();
        await reload();
      }
    }
  };

  const visibleNav = useMemo(() => {
    return NAVIGATION.filter((item) => {
      if (item.platformOnly) return platformAdmin === true;
      if (item.permission && !hasPermission(item.permission)) return false;
      return true;
    });
  }, [platformAdmin, hasPermission]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16 px-4 sm:px-6">
      {/* ─── Email Verification Required High-Contrast Alert Banner ─── */}
      {emailVerificationRequired && (
        <div
          role="alert"
          className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-950 dark:text-amber-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shadow-sm"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="size-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold leading-tight">
                Email Verification Required for Enterprise Governance
              </h4>
              <p className="text-xs text-amber-900/80 dark:text-amber-200/80 mt-1 leading-relaxed">
                Security Policy Contract: Human principal access to multi-tenant enterprise data requires a verified email address.
                Please verify your address ({user?.email}) to unlock all administrative write endpoints.
              </p>
              {verificationSent && (
                <p className="text-xs text-emerald-700 dark:text-emerald-300 font-bold mt-1">
                  ✓ Fresh verification email dispatched. Check your inbox.
                </p>
              )}
              {verificationError && (
                <p className="text-xs text-rose-700 dark:text-rose-300 font-semibold mt-1">
                  ⚠ {verificationError}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="outline"
              onClick={handleRefreshVerification}
              className="text-xs border-amber-500/40 hover:bg-amber-500/20 text-amber-950 dark:text-amber-100"
            >
              <RefreshCw className="size-3.5 mr-1.5" />
              I Verified
            </Button>
            <Button
              size="sm"
              onClick={handleResendEmailVerification}
              disabled={verificationSending}
              className="text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-2xs"
            >
              {verificationSending ? 'Sending…' : 'Resend Link'}
            </Button>
          </div>
        </div>
      )}

      {/* ─── Top Enterprise Header with Context Switchers ─── */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-edge pb-5">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-black tracking-tight text-ink flex items-center gap-2.5">
              <Building2 className="size-7 text-accent" />
              {tenant?.name || 'Enterprise Organization Console'}
            </h1>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-accent-soft text-accent border border-accent/20">
              Enterprise Multi-Tenant Tier
            </span>
          </div>
          <p className="text-xs text-ink-muted mt-1 max-w-2xl leading-relaxed">
            Centralized multi-seat tenant management, departmental workspace partitions,
            fine-grained RBAC matrix, and immutable forensic audit ledger.
          </p>
        </div>

        {/* Organization & Workspace Switchers */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Tenant Switcher */}
          {tenants.length > 1 && (
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-ink-muted font-medium">Org:</span>
              <select
                value={tenant?.id || ''}
                onChange={(e) => selectTenant(e.target.value)}
                className="h-8 px-2.5 rounded-lg bg-surface-raised border border-edge text-xs font-semibold text-ink focus:outline-none focus:ring-1 focus:ring-accent"
              >
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Workspace Switcher */}
          {workspaces.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-ink-muted font-medium">Workspace:</span>
              <select
                value={workspace?.id || ''}
                onChange={(e) => selectWorkspace(e.target.value)}
                className="h-8 px-2.5 rounded-lg bg-surface-raised border border-edge text-xs font-semibold text-ink focus:outline-none focus:ring-1 focus:ring-accent"
              >
                <option value="">All Workspaces</option>
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* ─── Navigation Tabs Strip (Cuba M3 Executive Glassmorphism) ─── */}
      <nav
        className="flex items-center gap-1 overflow-x-auto pb-1 border-b border-edge scrollbar-none"
        aria-label="Enterprise navigation tabs"
      >
        {visibleNav.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleTabSelect(item.id)}
              className={cn(
                'flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0',
                isActive
                  ? 'bg-accent text-white shadow-2xs'
                  : 'text-ink-muted hover:text-ink hover:bg-surface-raised/80',
              )}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon className="size-3.5" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* ─── Tab Content Rendering ─── */}
      <main className="min-h-[500px]">
        {activeTab === 'overview' && (
          <EnterpriseOverviewTab onNavigate={handleTabSelect} />
        )}
        {activeTab === 'resumes' && (
          <EnterpriseResumesTab />
        )}
        {activeTab === 'members' && (
          <EnterpriseUsersTab
            initialStatus={tabParams.status}
            autoOpenInvite={tabParams.invite === '1'}
          />
        )}
        {activeTab === 'teams' && (
          <EnterpriseTeamsTab />
        )}
        {activeTab === 'workspaces' && (
          <EnterpriseWorkspacesTab />
        )}
        {activeTab === 'access' && (
          <EnterpriseRolesTab />
        )}
        {activeTab === 'ai' && (
          <EnterpriseAiTab />
        )}
        {activeTab === 'security' && (
          <EnterpriseSecurityTab initialFocus={tabParams.focus} />
        )}
        {activeTab === 'usage' && (
          <EnterpriseUsageTab />
        )}
        {activeTab === 'email' && (
          <EnterpriseEmailTab />
        )}
        {activeTab === 'audit' && (
          <EnterpriseAuditTab />
        )}
        {activeTab === 'support' && (
          <EnterpriseSupportTab />
        )}
        {activeTab === 'settings' && (
          <EnterpriseSettingsTab />
        )}
        {activeTab === 'platform' && (
          <EnterprisePlatformTab />
        )}
      </main>
    </div>
  );
}

export function EnterpriseConsolePage() {
  return (
    <EnterpriseProvider>
      <EnterpriseConsoleInner />
    </EnterpriseProvider>
  );
}

export default EnterpriseConsolePage;