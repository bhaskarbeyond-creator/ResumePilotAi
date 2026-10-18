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

import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
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

type AdminTabId =
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
  | 'security';

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
      { id: 'ai-settings', label: 'AI Multi-Provider Engine', icon: Brain },
      { id: 'email', label: 'Email & SMTP Deliverability', icon: Mail },
    ],
  },
];

export function AdminConsolePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = (searchParams.get('tab') as AdminTabId) || 'dashboard';
  
  const [activeTab, setActiveTab] = useState<AdminTabId>(requestedTab);

  useEffect(() => {
    const tabFromUrl = searchParams.get('tab') as AdminTabId;
    if (tabFromUrl && tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl);
    }
  }, [searchParams]);

  const handleSelectTab = (tabId: AdminTabId) => {
    setActiveTab(tabId);
    setSearchParams({ tab: tabId });
  };

  return (
    <div className="p-4 lg:p-6 xl:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-extrabold text-ink tracking-tight">Super Admin Control Plane</h1>
            <span className="rounded-full bg-brand-50 border border-brand-200 px-2.5 py-0.5 text-xs font-bold text-brand-700">
              Root Level
            </span>
          </div>
          <p className="mt-1 text-sm text-ink-muted">
            Platform governance, 28-service operational telemetry, AI provider orchestration, and CMS control.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Sidebar Nav Rail */}
        <aside className="lg:w-64 shrink-0 space-y-6">
          <nav className="space-y-5" aria-label="Admin Control Plane Navigation">
            {NAVIGATION_GROUPS.map((group) => (
              <div key={group.label} className="space-y-1.5">
                <h3 className="px-3 text-xs font-bold uppercase tracking-wider text-ink-muted">
                  {group.label}
                </h3>
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => handleSelectTab(item.id)}
                        className={cn(
                          'w-full flex items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold transition-all cursor-pointer text-left',
                          isActive
                            ? 'bg-brand-600 text-white shadow-xs'
                            : 'text-ink-secondary hover:bg-neutral-100 hover:text-ink'
                        )}
                        aria-current={isActive ? 'page' : undefined}
                      >
                        <div className="flex items-center gap-2.5">
                          <Icon className={cn('size-4', isActive ? 'text-white' : 'text-ink-muted')} />
                          <span>{item.label}</span>
                        </div>
                        {item.badge && (
                          <span
                            className={cn(
                              'rounded-full px-1.5 py-0.2 text-[10px] font-extrabold',
                              isActive ? 'bg-white/20 text-white' : 'bg-brand-50 text-brand-700'
                            )}
                          >
                            {item.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        {/* Tab Content Surface */}
        <main className="flex-1 min-w-0" aria-label="Admin Control Tab Content">
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
        </main>
      </div>
    </div>
  );
}
export default AdminConsolePage;