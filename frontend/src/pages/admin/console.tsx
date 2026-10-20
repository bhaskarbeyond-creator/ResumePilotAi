/**
 * Super Admin Control Plane & Command Center Console
 *
 * Implements the comprehensive 24-module Super Admin control plane
 * organized across Cuba's canonical governance categories:
 * - Observability: Command Center, Platform Health, Queues & DLQ, Operations & Maintenance, Attention Needed
 * - Identity: Users Manager & User 360, Help Desk & Tickets
 * - Moderation: Employer Verifications, Job Postings, Company Registry, Tenants Registry
 * - Content: Blog Management, Marketing CMS (ATS Phrases, Reviews, Trusted By, Landing Pages)
 * - Configuration: AI Multi-Provider Orchestration, Email & SMTP Deliverability, Security & Staff RBAC
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  BarChart3,
  Server,
  Database,
  Activity,
  AlertTriangle,
  Users,
  HelpCircle,
  ShieldCheck,
  Briefcase,
  FileText,
  Brain,
  Mail,
  Sliders,
  Layers,
  Sparkles,
} from 'lucide-react';

// Sub-Module Tabs
import { AdminDashboardTab } from '@/components/admin/AdminDashboardTab';
import { AdminHealthTab } from '@/components/admin/AdminHealthTab';
import { AdminQueuesTab } from '@/components/admin/AdminQueuesTab';
import { AdminOperationsTab } from '@/components/admin/AdminOperationsTab';
import { AdminAttentionTab } from '@/components/admin/AdminAttentionTab';
import { AdminUsersTab } from '@/components/admin/AdminUsersTab';
import { AdminHelpDeskTab } from '@/components/admin/AdminHelpDeskTab';
import { AdminModerationTab } from '@/components/admin/AdminModerationTab';
import { AdminBlogManagementTab } from '@/components/admin/AdminBlogManagementTab';
import { AdminContentMarketingTab } from '@/components/admin/AdminContentMarketingTab';
import { AdminAiSettingsTab } from '@/components/admin/AdminAiSettingsTab';
import { AdminEmailSmtpTab } from '@/components/admin/AdminEmailSmtpTab';
import { AdminSecurityTab } from '@/components/admin/AdminSecurityTab';
import { AdminSettingsTab } from '@/components/admin/AdminSettingsTab';

export type AdminTabId =
  | 'dashboard'
  | 'health'
  | 'queues'
  | 'operations'
  | 'attention'
  | 'users'
  | 'support'
  | 'moderation'
  | 'blog'
  | 'content'
  | 'ai-settings'
  | 'email'
  | 'security'
  | 'settings'
  | 'modules';

const VALID_TABS: AdminTabId[] = [
  'dashboard',
  'health',
  'queues',
  'operations',
  'attention',
  'users',
  'support',
  'moderation',
  'blog',
  'content',
  'ai-settings',
  'email',
  'security',
  'settings',
  'modules',
];

interface NavGroup {
  label: string;
  items: {
    id: AdminTabId;
    label: string;
    icon: typeof BarChart3;
    badge?: string;
  }[];
}

const NAVIGATION_GROUPS: NavGroup[] = [
  {
    label: 'Observability & Core',
    items: [
      { id: 'dashboard', label: 'Command Center', icon: BarChart3 },
      { id: 'health', label: 'Platform Health (28 Services)', icon: Activity, badge: 'Live' },
      { id: 'queues', label: 'Queues & Outbox DLQ', icon: Database },
      { id: 'operations', label: 'Operations & Maintenance', icon: Server },
      { id: 'attention', label: 'Attention Needed', icon: AlertTriangle, badge: '2' },
    ],
  },
  {
    label: 'Identity & Support',
    items: [
      { id: 'users', label: 'Users Manager & 360', icon: Users },
      { id: 'support', label: 'Help Desk & Tickets', icon: HelpCircle },
      { id: 'security', label: 'Security & Staff RBAC', icon: ShieldCheck },
    ],
  },
  {
    label: 'Moderation Hub',
    items: [
      { id: 'moderation', label: 'Employers, Jobs & Tenants', icon: Briefcase },
    ],
  },
  {
    label: 'Content & CMS',
    items: [
      { id: 'blog', label: 'Blog Engine (/blog-editor)', icon: FileText },
      { id: 'content', label: 'ATS Phrases & Reviews', icon: Sparkles },
    ],
  },
  {
    label: 'System Configuration',
    items: [
      { id: 'settings', label: 'Platform Settings & Modules', icon: Sliders },
      { id: 'ai-settings', label: 'AI Multi-Provider Engine', icon: Brain },
      { id: 'email', label: 'Email & SMTP Deliverability', icon: Mail },
    ],
  },
];

import { useAuth } from '@/providers/auth-provider';

export function AdminConsolePage() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { claims, isSuperAdmin } = useAuth();

  const userRole = (claims?.role || '').toUpperCase();
  const isSupport = userRole === 'SUPPORT';
  const isAuditor = userRole === 'AUDITOR';

  const { allowedTabs, defaultTab, roleBadgeText, roleSubtitle } = useMemo(() => {
    if (isSupport) {
      return {
        allowedTabs: ['support', 'users'] as AdminTabId[],
        defaultTab: 'support' as AdminTabId,
        roleBadgeText: 'Customer Support Suite',
        roleSubtitle: 'Help Desk, ticket escalation, and customer account directory.',
      };
    }
    if (isAuditor) {
      return {
        allowedTabs: ['health', 'queues', 'operations', 'users', 'security'] as AdminTabId[],
        defaultTab: 'health' as AdminTabId,
        roleBadgeText: 'Compliance & Auditor Suite',
        roleSubtitle: 'Infrastructure health telemetry, outbox DLQ inspection, and security audit logs.',
      };
    }
    return {
      allowedTabs: VALID_TABS,
      defaultTab: 'dashboard' as AdminTabId,
      roleBadgeText: isSuperAdmin ? 'Root Level' : 'System Admin Suite',
      roleSubtitle: 'Platform governance, 28-service operational telemetry, AI provider orchestration, and CMS control.',
    };
  }, [isSupport, isAuditor, isSuperAdmin]);

  // Resolve active tab from URL path segment (/admin/:tab) or query param (?tab=...)
  const resolveTab = useCallback((): AdminTabId => {
    // 1. Check ?tab= query parameter.
    //
    // `?tab=aiSettings` is the deep link the LEGACY console used for the AI
    // provider panel (`/admin/settings?tab=aiSettings`). It is preserved as a
    // first-class alias so existing bookmarks, runbooks and dashboard links land
    // on the modernised AI Multi-Provider Engine instead of the generic
    // settings surface (deep-link parity, not a redirect to a dead end).
    const rawTab = searchParams.get('tab');
    const tabFromQuery = rawTab && /^ai[-_]?settings$/i.test(rawTab) ? ('ai-settings' as AdminTabId) : (rawTab as AdminTabId);
    if (tabFromQuery && allowedTabs.includes(tabFromQuery)) {
      return tabFromQuery;
    }

    // 2. Check path segment (/admin/:section)
    const segments = location.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
    if (segments[0] === 'admin' && segments[1]) {
      const section = segments[1].toLowerCase();
      // Handle historical and semantic aliases
      let mappedTab: AdminTabId | null = null;
      if (section === 'help-desk') mappedTab = 'support';
      else if (section === 'blog-management') mappedTab = 'blog';
      else if (['employer-applications', 'jobs-manager', 'company-management', 'tenants'].includes(section)) mappedTab = 'moderation';
      else if (['phrases', 'reviews', 'landing-pages', 'trustedby'].includes(section)) mappedTab = 'content';
      else if (section === 'settings') {
        // /admin/settings?tab=aiSettings (legacy deep link) is the AI engine.
        mappedTab = /^ai[-_]?settings$/i.test(searchParams.get('tab') || '') ? 'ai-settings' : 'settings';
      }
      else if (section === 'modules' || section === 'addon-modules') mappedTab = 'modules';
      else if (section === 'command-center' || section === 'dashboard') mappedTab = 'dashboard';
      else if (VALID_TABS.includes(section as AdminTabId)) {
        mappedTab = section as AdminTabId;
      }

      if (mappedTab && allowedTabs.includes(mappedTab)) {
        return mappedTab;
      }
    }

    return defaultTab;
  }, [location.pathname, searchParams, allowedTabs, defaultTab]);

  const [activeTab, setActiveTab] = useState<AdminTabId>(resolveTab);

  useEffect(() => {
    const nextTab = resolveTab();
    if (nextTab !== activeTab) {
      setActiveTab(nextTab);
    }
  }, [resolveTab, activeTab]);

  const handleSelectTab = (tabId: AdminTabId) => {
    setActiveTab(tabId);
    navigate(tabId === 'dashboard' ? '/admin' : `/admin/${tabId}`);
  };

  const navGroups = useMemo(() => {
    return NAVIGATION_GROUPS.map((g) => ({
      ...g,
      items: g.items.filter((item) => allowedTabs.includes(item.id)),
    })).filter((g) => g.items.length > 0);
  }, [allowedTabs]);

  const allNavItems = useMemo(
    () => navGroups.flatMap((g) => g.items),
    [navGroups]
  );

  return (
    // Density-aware canvas: admin surfaces are table-heavy, so the shell uses the
    // full 7xl column on laptops and widens on true desktop displays where a
    // fixed 1280px column would leave a third of the screen empty.
    <div className="p-4 lg:p-6 xl:p-8 space-y-6 max-w-7xl xl:max-w-[1600px] mx-auto" data-testid="admin-console-page">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-extrabold text-ink tracking-tight">Super Admin Control Plane</h1>
            <span className="rounded-full bg-brand-50 dark:bg-brand-950/40 border border-brand-200 dark:border-brand-800 px-2.5 py-0.5 text-xs font-bold text-brand-700 dark:text-brand-300 shrink-0">
              {roleBadgeText}
            </span>
          </div>
          <p className="mt-1 text-sm text-ink-muted">
            {roleSubtitle}
          </p>
        </div>
      </div>

      {/* Horizontal Tabs Strip for Quick Nav / Mobile & Tablet */}
      <nav
        className="flex items-center gap-1.5 overflow-x-auto pb-2 border-b border-border/60 scrollbar-none"
        aria-label="Admin Sub-Module Tabs"
      >
        {allNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelectTab(item.id)}
              data-testid={`admin-tab-${item.id}`}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer',
                isActive
                  ? 'bg-brand-600 text-white shadow-2xs font-extrabold'
                  : 'text-ink-secondary hover:text-ink hover:bg-neutral-100 dark:hover:bg-neutral-800'
              )}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon className="size-3.5 shrink-0" />
              <span>{item.label}</span>
              {item.badge && (
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.2 text-[10px] font-extrabold ml-0.5',
                    isActive ? 'bg-white/20 text-white' : 'bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-brand-300'
                  )}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Tab Content Surface */}
      <main className="min-w-0" aria-label="Admin Control Tab Content">
        {activeTab === 'dashboard' && <AdminDashboardTab onNavigateTab={handleSelectTab} />}
        {activeTab === 'health' && <AdminHealthTab />}
        {activeTab === 'queues' && <AdminQueuesTab />}
        {activeTab === 'operations' && <AdminOperationsTab />}
        {activeTab === 'attention' && <AdminAttentionTab onNavigateTab={handleSelectTab} />}
        {activeTab === 'users' && <AdminUsersTab />}
        {activeTab === 'support' && <AdminHelpDeskTab />}
        {activeTab === 'security' && <AdminSecurityTab />}
        {activeTab === 'moderation' && <AdminModerationTab />}
        {activeTab === 'blog' && <AdminBlogManagementTab />}
        {activeTab === 'content' && <AdminContentMarketingTab />}
        {activeTab === 'ai-settings' && <AdminAiSettingsTab />}
        {activeTab === 'email' && <AdminEmailSmtpTab />}
        {(activeTab === 'settings' || activeTab === 'modules') && (
          <AdminSettingsTab initialSection="modules" />
        )}
      </main>
    </div>
  );
}
export default AdminConsolePage;