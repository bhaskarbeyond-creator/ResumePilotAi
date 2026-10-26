/**
 * Super Admin Control Plane & Command Center Console
 *
 * Two rules govern this file:
 *
 *  1. **Visibility is derived from authority, never from a role name.** The tab set
 *     comes from `GET /api/me/capabilities`, which the backend computes from
 *     persisted role bundles. There is no `if (role === 'AUDITOR')` here, because
 *     that pattern is how a granted permission stayed invisible and how a tab came
 *     to be shown whose endpoint answered 403.
 *  2. **Every tab is reachable at every width.** The tab strip is a real
 *     `role="tablist"` with roving focus and arrow-key navigation, and on narrow
 *     viewports it scrolls inside itself rather than pushing the page sideways.
 *
 * @module pages/admin/console
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useLocation, useNavigate } from 'react-router-dom';
import { ShieldCheck, RefreshCw, ServerCrash } from 'lucide-react';

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
import { AdminRbacTab } from '@/components/admin/AdminRbacTab';
import { AdminAuditTab } from '@/components/admin/AdminAuditTab';
import { AdminConfigTab } from '@/components/admin/AdminConfigTab';
import { useCapabilities } from '@/hooks/use-capabilities';
import { AdminTabBar } from '@/components/admin/AdminTabBar';
import type { AdminTabId } from '@/components/admin/admin-tab-id';

// Re-exported so the tab components keep importing one identifier from the page they
// belong to, while the union itself lives in a module the tab bar can own and test.
export type { AdminTabId };

/** Aliases accepted in `?tab=` so old links keep working after the rename. */
const TAB_ALIASES: Record<string, AdminTabId> = {
  ai: 'ai-settings',
  aisettings: 'ai-settings',
  ai_settings: 'ai-settings',
  aimodels: 'ai-settings',
  roles: 'rbac',
  access: 'rbac',
  'audit-logs': 'audit',
  trail: 'audit',
  modules: 'settings',
  configuration: 'config',
  configs: 'config',
};

/**
 * Human-readable subtitles per tab, shown under the title. Content, not policy —
 * whether the tab appears at all is decided by the server.
 */
const TAB_SUBTITLES: Record<AdminTabId, string> = {
  dashboard: 'Platform governance, operational telemetry and the actions that need attention.',
  health: 'Service health, dependency status and readiness of every subsystem.',
  queues: 'Outbox, dead-letter inspection and replay controls.',
  operations: 'Maintenance windows, backup status and operational actions.',
  attention: 'Anything currently failing, degraded or awaiting a human decision.',
  users: 'Directory lookup, account 360 and staff-gated account actions.',
  support: 'Help desk: tickets, replies and escalation.',
  moderation: 'Employer verification, job postings and company registry.',
  blog: 'Editorial workflow: drafts, scheduling and publication.',
  content: 'Marketing surfaces: pages, discount codes and social proof.',
  'ai-settings': 'Provider orchestration, routing and quota governance.',
  email: 'Transport configuration, deliverability and template catalogue.',
  security: 'Security telemetry, encryption state and the audit trail.',
  config: 'Every business value the platform reads, where it comes from and who last changed it.',
  settings: 'Configuration by category, with revision control.',
  modules: 'Published module configuration.',
  rbac: 'Roles, permission bundles and time-boxed grants.',
  audit: 'Every administrative action, with actor, scope and before/after.',
};

export function AdminConsolePage() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { tabs, allowedTabs, defaultTab, canOpenTab, status, refetch, isLoading, degraded } = useCapabilities();

  /**
   * Resolve an explicitly requested tab from the query string or the path.
   * Returns `null` when nothing was asked for, so the caller can fall back to the
   * server's `defaultTab` rather than to a hard-coded one.
   */
  const requestedTab = useMemo((): AdminTabId | null => {
    const rawQueryTab = (searchParams.get('tab') || '').toLowerCase().trim();
    const candidate = TAB_ALIASES[rawQueryTab] ?? rawQueryTab;
    if (candidate && tabs.some((tab) => tab.id === candidate)) return candidate as AdminTabId;

    const segments = location.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
    if (segments[0] === 'admin' && segments[1]) {
      const section = (TAB_ALIASES[segments[1].toLowerCase()] ?? segments[1].toLowerCase()) as AdminTabId;
      if (tabs.some((tab) => tab.id === section)) return section;
    }
    return null;
  }, [location.pathname, searchParams, tabs]);

  const isForbiddenTab = Boolean(requestedTab && !canOpenTab(requestedTab));

  const [activeTab, setActiveTab] = useState<AdminTabId | null>(null);

  // The active tab is always something the server says is allowed. When the answer
  // changes (a grant, a revocation, a fresh sign-in) the tab is re-derived instead
  // of being remembered past its authority.
  useEffect(() => {
    if (isForbiddenTab) return;
    if (requestedTab && canOpenTab(requestedTab)) {
      setActiveTab(requestedTab);
      return;
    }
    if (activeTab && canOpenTab(activeTab)) return;
    setActiveTab((defaultTab as AdminTabId | null) ?? null);
  }, [requestedTab, canOpenTab, defaultTab, activeTab, isForbiddenTab]);

  const handleSelectTab = useCallback(
    (tabId: AdminTabId) => {
      if (!canOpenTab(tabId)) return;
      setActiveTab(tabId);
      navigate(tabId === 'dashboard' ? '/admin' : `/admin/${tabId}`);
    },
    [canOpenTab, navigate],
  );

  const activeLabel = activeTab ? (tabs.find((tab) => tab.id === activeTab)?.label ?? activeTab) : 'Control plane';

  /* ── states ─────────────────────────────────────────────────────────── */

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl p-4 lg:p-6 xl:p-8" data-testid="admin-console-loading">
        <div role="status" aria-live="polite" className="flex items-center gap-3 rounded-2xl border border-border p-6">
          <RefreshCw className="size-5 animate-spin text-ink-muted motion-reduce:animate-none" aria-hidden="true" />
          <span className="text-sm text-ink-muted">Resolving your authority…</span>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="mx-auto max-w-7xl p-4 lg:p-6 xl:p-8" data-testid="admin-console-error">
        <div role="alert" className="space-y-4 rounded-2xl border border-error-100 bg-error-50 p-6">
          <div className="flex items-center gap-2 text-error-700">
            <ServerCrash className="size-5 shrink-0" aria-hidden="true" />
            <h1 className="text-lg font-bold">Authority could not be resolved</h1>
          </div>
          <p className="text-sm text-ink-secondary">
            The console will not guess your permissions. Reload once the API is reachable —
            a guess in this state would show you surfaces your account may not use.
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-bold text-white hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (allowedTabs.length === 0) {
    return (
      <div className="mx-auto max-w-7xl p-4 lg:p-6 xl:p-8" data-testid="admin-console-empty">
        <div role="alert" className="space-y-2 rounded-2xl border border-border p-6">
          <h1 className="text-lg font-bold text-ink">No administrative surfaces</h1>
          <p className="text-sm text-ink-secondary">
            Your account is authenticated but holds no permission that maps to a console tab.
            Ask a super-admin to grant a role; the change takes effect on your next page load.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:p-6 xl:p-8" data-testid="admin-console-page">
      <header className="flex flex-col gap-4 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl font-extrabold tracking-tight text-ink sm:text-2xl">Control plane</h1>
            {/* The dark fill is opaque on purpose: at 40% alpha the composited background depends on whatever scrolls behind it, and axe measured 1.19:1 for the 12px bold count. Opaque brand-950 gives 7.42:1 against brand-300 and does not move when the page behind changes. */}
            <span className="shrink-0 rounded-full border border-brand-200 bg-brand-50 px-2.5 py-0.5 text-xs font-bold text-brand-700 dark:border-brand-800 dark:bg-brand-950 dark:text-brand-300">
              {allowedTabs.length} of {tabs.length} surfaces
            </span>
          </div>
          <p className="mt-1 text-sm text-ink-muted">{activeTab ? TAB_SUBTITLES[activeTab] : 'Select a surface.'}</p>
        </div>
      </header>

      {degraded && (
        <p
          role="status"
          className="rounded-xl border border-warning-100 bg-warning-50 px-3 py-2 text-xs text-warning-700"
          data-testid="admin-authority-degraded"
        >
          Authority is being served from the built-in fallback because the role store is unreachable.
          Permissions shown here may be stale; changes will be rejected until it recovers.
        </p>
      )}

      <AdminTabBar
        tabs={tabs}
        activeTab={isForbiddenTab ? null : activeTab}
        onSelect={handleSelectTab}
      />

      <main className="min-w-0" aria-label={`${activeLabel} content`}>
        {isForbiddenTab && requestedTab ? (
          <ForbiddenSurface tabId={requestedTab} tabs={tabs} onReturn={() => handleSelectTab((defaultTab as AdminTabId) ?? 'dashboard')} />
        ) : (
          <TabSurface tabId={activeTab} onSelectTab={handleSelectTab} />
        )}
      </main>
    </div>
  );
}

/* ── tab bar ──────────────────────────────────────────────────────────── */

/* ── surfaces ─────────────────────────────────────────────────────────── */

/**
 * Render exactly one tab. `null` renders nothing rather than defaulting to a tab
 * the caller may not open.
 */
function TabSurface({ tabId, onSelectTab }: { tabId: AdminTabId | null; onSelectTab: (tab: AdminTabId) => void }) {
  const panel = (id: AdminTabId) => ({
    id: `admin-panel-${id}`,
    role: 'tabpanel' as const,
    'aria-labelledby': `admin-tab-${id}`,
    tabIndex: -1 as const,
  });

  switch (tabId) {
    case 'dashboard':
      return <div {...panel('dashboard')}><AdminDashboardTab onNavigateTab={(tab) => onSelectTab(tab as AdminTabId)} /></div>;
    case 'health':
      return <div {...panel('health')}><AdminHealthTab /></div>;
    case 'queues':
      return <div {...panel('queues')}><AdminQueuesTab /></div>;
    case 'operations':
      return <div {...panel('operations')}><AdminOperationsTab /></div>;
    case 'attention':
      return <div {...panel('attention')}><AdminAttentionTab onNavigateTab={(tab) => onSelectTab(tab as AdminTabId)} /></div>;
    case 'users':
      return <div {...panel('users')}><AdminUsersTab /></div>;
    case 'support':
      return <div {...panel('support')}><AdminHelpDeskTab /></div>;
    case 'security':
      return <div {...panel('security')}><AdminSecurityTab /></div>;
    case 'moderation':
      return <div {...panel('moderation')}><AdminModerationTab /></div>;
    case 'blog':
      return <div {...panel('blog')}><AdminBlogManagementTab /></div>;
    case 'content':
      return <div {...panel('content')}><AdminContentMarketingTab /></div>;
    case 'ai-settings':
      return <div {...panel('ai-settings')}><AdminAiSettingsTab viewerRole="SUPER_ADMIN" /></div>;
    case 'email':
      return <div {...panel('email')}><AdminEmailSmtpTab /></div>;
    case 'settings':
    case 'modules':
      return <div {...panel(tabId)}><AdminSettingsTab initialSection="modules" /></div>;
    case 'config':
      return <div {...panel('config')}><AdminConfigTab /></div>;
    case 'rbac':
      return <div {...panel('rbac')}><AdminRbacTab /></div>;
    case 'audit':
      return <div {...panel('audit')}><AdminAuditTab /></div>;
    default:
      return null;
  }
}

/**
 * The refusal a person sees when they type a URL for a surface they do not hold.
 *
 * Names the missing permissions when the server said they are grantable, and says
 * plainly when the answer is "become a super-admin" instead — a distinction that
 * decides who the reader asks for help.
 */
function ForbiddenSurface({
  tabId,
  tabs,
  onReturn,
}: {
  tabId: AdminTabId;
  tabs: { id: string; label: string; allowed: boolean; reason?: string | null; missing?: string[] }[];
  onReturn: () => void;
}) {
  const tab = tabs.find((candidate) => candidate.id === tabId);
  const superAdminOnly = tab?.reason === 'super-admin-only';
  return (
    <div role="alert" data-testid="admin-tab-forbidden" className="space-y-3 rounded-2xl border border-error-100 bg-error-50 p-6">
      <div className="flex items-center gap-2 text-base font-bold text-error-700">
        <ShieldCheck className="size-5 shrink-0" aria-hidden="true" />
        <h2>Access restricted</h2>
      </div>
      <p className="text-sm text-ink-secondary">
        {superAdminOnly
          ? `“${tab?.label ?? tabId}” is restricted to super-admins. It cannot be granted as a permission.`
          : `Your account lacks ${tab?.missing?.length ? tab.missing.join(', ') : 'the permission this surface requires'}.`}
      </p>
      <button
        type="button"
        onClick={onReturn}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-bold text-white hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
      >
        Return to a permitted surface
      </button>
    </div>
  );
}

export default AdminConsolePage;
