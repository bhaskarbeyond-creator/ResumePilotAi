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
import { ShieldCheck } from 'lucide-react';

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
import { AdminEnterpriseSsoTab } from '@/components/admin/AdminEnterpriseSsoTab';
import { AdminSettingsTab } from '@/components/admin/AdminSettingsTab';
import { AdminBillingTab } from '@/components/admin/AdminBillingTab';

export type AdminTabId =
  | 'dashboard'
  | 'health'
  | 'queues'
  | 'operations'
  | 'attention'
  | 'users'
  | 'billing'
  | 'support'
  | 'moderation'
  | 'blog'
  | 'content'
  | 'ai-settings'
  | 'email'
  | 'security'
  | 'sso'
  | 'settings'
  | 'modules';

const VALID_TABS: AdminTabId[] = [
  'dashboard',
  'health',
  'queues',
  'operations',
  'attention',
  'users',
  'billing',
  'support',
  'moderation',
  'blog',
  'content',
  'ai-settings',
  'email',
  'security',
  'sso',
  'settings',
  'modules',
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
      // The SSO trust store is super-admin-only on the server, so a plain System
      // Admin must not be shown a tab whose every action would be refused.
      allowedTabs: isSuperAdmin ? VALID_TABS : VALID_TABS.filter(tab => tab !== 'sso'),
      defaultTab: 'dashboard' as AdminTabId,
      roleBadgeText: isSuperAdmin ? 'Root Level' : 'System Admin Suite',
      roleSubtitle: 'Platform governance, 28-service operational telemetry, AI provider orchestration, and CMS control.',
    };
  }, [isSupport, isAuditor, isSuperAdmin]);

  // Resolve explicitly requested tab from URL path segment (/admin/:tab) or query param (?tab=...)
  const requestedTab = useMemo((): AdminTabId | null => {
    const rawQueryTab = (searchParams.get('tab') || '').toLowerCase().trim();
    if (rawQueryTab) {
      if (['ai', 'aisettings', 'ai-settings', 'ai_settings', 'aimodels'].includes(rawQueryTab)) {
        return 'ai-settings';
      }
      if (VALID_TABS.includes(rawQueryTab as AdminTabId)) {
        return rawQueryTab as AdminTabId;
      }
    }

    const segments = location.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
    if (segments[0] === 'admin' && segments[1]) {
      const section = segments[1].toLowerCase();
      if (section === 'help-desk') return 'support';
      if (section === 'billing' || section === 'orders' || section === 'subscriptions') return 'billing';
      if (section === 'blog-management') return 'blog';
      if (['employer-applications', 'jobs-manager', 'company-management', 'tenants'].includes(section)) return 'moderation';
      if (['phrases', 'reviews', 'landing-pages', 'trustedby'].includes(section)) return 'content';
      if (section === 'settings') return 'settings';
      if (section === 'modules' || section === 'addon-modules') return 'modules';
      if (section === 'command-center' || section === 'dashboard') return 'dashboard';
      if (['ai', 'ai-settings', 'aisettings', 'ai_settings'].includes(section)) return 'ai-settings';
      if (VALID_TABS.includes(section as AdminTabId)) {
        return section as AdminTabId;
      }
    }

    return null;
  }, [location.pathname, searchParams]);

  const isForbiddenTab = Boolean(requestedTab && !allowedTabs.includes(requestedTab));

  const resolveTab = useCallback((): AdminTabId => {
    if (requestedTab && allowedTabs.includes(requestedTab)) {
      return requestedTab;
    }
    return defaultTab;
  }, [requestedTab, allowedTabs, defaultTab]);

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

  return (
    <div className="p-4 lg:p-6 xl:p-8 space-y-6 max-w-7xl mx-auto" data-testid="admin-console-page">
      <nav aria-label="Workspace command hub" className="rounded-2xl border border-border bg-surface/95 p-4 space-y-3">
        <h2 className="font-bold">Workspace Command Hub <span className="text-xs text-ink-muted">Current: Admin Console</span></h2>
        <p className="text-xs text-ink-muted">Safe View Mode uses your existing identity and permissions, not impersonation. Other workspace guards still apply.</p>
        <div className="flex flex-wrap gap-3">{[['Employer Portal', '/employer/portal?adminView=1'], ['Candidate Workspace', '/dashboard'], ['Public Portfolio Gallery', '/portfolios'], ['Public Marketing', '/']].map(([label, route]) => <button key={route} className="rounded-xl border border-border px-4 py-2 text-sm focus-visible:ring-2 focus-visible:ring-brand-500" onClick={() => navigate(route)}>{label}</button>)}</div>
      </nav>
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

      {/* Tab Content Surface */}
      <main className="min-w-0" aria-label="Admin Control Tab Content">
        {isForbiddenTab ? (
          <div
            role="alert"
            data-testid="admin-tab-forbidden"
            className="rounded-2xl border border-error-100 bg-error-50 p-6 text-ink space-y-3"
          >
            <div className="flex items-center gap-2 text-error-700 font-bold text-base">
              <ShieldCheck className="size-5 shrink-0" />
              <h2>403 — Access Restricted</h2>
            </div>
            <p className="text-sm text-ink-secondary">
              Your staff role ({userRole || 'STAFF'}) is not authorized to access the{' '}
              <span className="font-semibold text-ink">{requestedTab}</span> control-plane module.
              AI Multi-Provider Engine configuration requires System Admin or Super-Admin authorization.
            </p>
            <div>
              <button
                type="button"
                onClick={() => navigate(`/admin/${defaultTab}`, { replace: true })}
                className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-xs font-bold text-white hover:bg-brand-700 cursor-pointer"
              >
                Return to Allowed Workspace
              </button>
            </div>
          </div>
        ) : (
          <>
            {activeTab === 'dashboard' && <AdminDashboardTab onNavigateTab={handleSelectTab} />}
            {activeTab === 'health' && <AdminHealthTab />}
            {activeTab === 'queues' && <AdminQueuesTab />}
            {activeTab === 'operations' && <AdminOperationsTab />}
            {activeTab === 'attention' && <AdminAttentionTab onNavigateTab={handleSelectTab} />}
            {activeTab === 'users' && <AdminUsersTab />}
            {activeTab === 'billing' && <AdminBillingTab />}
            {activeTab === 'support' && <AdminHelpDeskTab />}
            {activeTab === 'security' && <AdminSecurityTab />}
            {activeTab === 'sso' && <AdminEnterpriseSsoTab />}
            {activeTab === 'moderation' && <AdminModerationTab />}
            {activeTab === 'blog' && <AdminBlogManagementTab />}
            {activeTab === 'content' && <AdminContentMarketingTab />}
            {activeTab === 'ai-settings' && (
              <AdminAiSettingsTab viewerRole={userRole || (isSuperAdmin ? 'SUPER_ADMIN' : 'ADMIN')} />
            )}
            {activeTab === 'email' && <AdminEmailSmtpTab />}
            {(activeTab === 'settings' || activeTab === 'modules') && (
              <AdminSettingsTab initialSection="modules" />
            )}
          </>
        )}
      </main>
    </div>
  );
}
export default AdminConsolePage;