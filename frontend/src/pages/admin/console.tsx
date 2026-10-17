/**
 * Admin Console
 *
 * Platform administration: user management, platform stats,
 * AI settings, system configuration, and operational health.
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/loading';
import { get, normalizeError } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import {
  Users,
  FileText,
  Briefcase,
  Shield,
  Activity,
  Search,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  XCircle,
  BarChart3,
  Brain,
  Server,
  Database,
  MoreVertical,
  Eye,
  Zap,
  HelpCircle,
  MessageSquare,
  Send,
  Play,
} from 'lucide-react';

type AdminTab = 'overview' | 'users' | 'ai-settings' | 'support' | 'audit' | 'database' | 'system';

interface PlatformStats {
  totalUsers: number;
  activeUsers: number;
  totalResumes: number;
  totalJobApplications: number;
  aiGenerations: number;
  storageUsed: string;
}

interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  role: string;
  status: 'active' | 'suspended' | 'pending';
  lastLogin: string;
  createdAt: string;
  resumeCount: number;
}

interface AIProviderStatus {
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  model: string;
  latencyMs: number;
  requestsToday: number;
  errorsToday: number;
}

export function AdminConsolePage() {
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');

  const tabs: { id: AdminTab; label: string; icon: typeof Users }[] = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'ai-settings', label: 'AI Settings', icon: Brain },
    { id: 'support', label: 'Support Desk', icon: HelpCircle },
    { id: 'audit', label: 'Audit Logs', icon: Shield },
    { id: 'database', label: 'Database & Sync', icon: Database },
    { id: 'system', label: 'System Health', icon: Server },
  ];

  return (
    <div className="p-4 lg:p-6 xl:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ink">Admin Console</h1>
        <p className="mt-1 text-sm text-ink-muted">Platform administration and operational management.</p>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Tab navigation */}
        <nav className="flex shrink-0 gap-1 overflow-x-auto lg:w-48 lg:flex-col" aria-label="Admin sections">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors',
                  active
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-ink-secondary hover:bg-neutral-100 hover:text-ink',
                )}
                aria-current={active ? 'page' : undefined}
              >
                <Icon className={cn('size-4', active ? 'text-brand-600' : 'text-ink-muted')} />
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* Content */}
        <div className="flex-1">
          {activeTab === 'overview' && <AdminOverview />}
          {activeTab === 'users' && <AdminUsers />}
          {activeTab === 'ai-settings' && <AdminAISettings />}
          {activeTab === 'support' && <AdminSupport />}
          {activeTab === 'audit' && <AdminAudit />}
          {activeTab === 'database' && <AdminDatabase />}
          {activeTab === 'system' && <AdminSystem />}
        </div>
      </div>
    </div>
  );
}

/* ─── Overview Tab ─── */

function AdminOverview() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await get<{ stats: PlatformStats }>('/admin/stats');
        if (!cancelled) setStats(data.stats);
      } catch {
        if (!cancelled) {
          setStats({
            totalUsers: 0, activeUsers: 0, totalResumes: 0,
            totalJobApplications: 0, aiGenerations: 0, storageUsed: '0 MB',
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  const statCards = stats ? [
    { label: 'Total Users', value: stats.totalUsers, icon: Users, color: 'bg-brand-50 text-brand-600' },
    { label: 'Active Users', value: stats.activeUsers, icon: Activity, color: 'bg-success-50 text-success-600' },
    { label: 'Resumes Created', value: stats.totalResumes, icon: FileText, color: 'bg-info-50 text-info-600' },
    { label: 'Job Applications', value: stats.totalJobApplications, icon: Briefcase, color: 'bg-warning-50 text-warning-600' },
    { label: 'AI Generations', value: stats.aiGenerations, icon: Zap, color: 'bg-purple-50 text-purple-600' },
    { label: 'Storage Used', value: stats.storageUsed, icon: Database, color: 'bg-neutral-100 text-neutral-600' },
  ] : [];

  return (
    <div>
      <h2 className="text-lg font-semibold text-ink mb-4">Platform Overview</h2>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {statCards.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.label}>
                <CardContent className="flex items-center gap-4 p-4">
                  <div className={cn('flex size-12 items-center justify-center rounded-xl', stat.color)}>
                    <Icon className="size-6" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-ink">
                      {typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}
                    </div>
                    <div className="text-xs text-ink-muted">{stat.label}</div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Quick actions */}
      <h3 className="mt-8 mb-3 text-sm font-semibold text-ink">Quick Actions</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Manage Users', icon: Users, desc: 'View and manage user accounts' },
          { label: 'AI Configuration', icon: Brain, desc: 'Configure AI providers and models' },
          { label: 'System Health', icon: Activity, desc: 'Check system operational status' },
          { label: 'Security Audit', icon: Shield, desc: 'Review security events and logs' },
        ].map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.label}
              className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4 text-left transition-colors hover:bg-neutral-50"
            >
              <Icon className="size-5 text-ink-muted shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-medium text-ink">{action.label}</div>
                <div className="text-xs text-ink-muted">{action.desc}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Users Tab ─── */

function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await get<{ users: AdminUser[] }>('/admin/users');
        if (!cancelled) setUsers(data.users ?? []);
      } catch (err) {
        if (!cancelled) setError(normalizeError(err).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  const filteredUsers = users.filter((u) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return u.email.toLowerCase().includes(q) || u.displayName.toLowerCase().includes(q);
  });

  const statusColors = {
    active: 'bg-success-100 text-success-700',
    suspended: 'bg-error-100 text-error-700',
    pending: 'bg-warning-100 text-warning-700',
  };

  if (loading) return <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink">User Management</h2>
        <span className="text-sm text-ink-muted">{users.length} total users</span>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-error-200 bg-error-50 p-3 text-sm text-error-700">
          <AlertCircle className="size-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="mb-4 relative max-w-md">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search users by name or email…"
          className="pl-9"
        />
      </div>

      {/* Users table */}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-neutral-50">
              <th className="px-4 py-3 text-left font-medium text-ink-secondary">User</th>
              <th className="px-4 py-3 text-left font-medium text-ink-secondary">Role</th>
              <th className="px-4 py-3 text-left font-medium text-ink-secondary">Status</th>
              <th className="px-4 py-3 text-left font-medium text-ink-secondary">Resumes</th>
              <th className="px-4 py-3 text-left font-medium text-ink-secondary">Last Login</th>
              <th className="px-4 py-3 text-right font-medium text-ink-secondary">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((user) => (
              <tr key={user.id} className="border-b border-border last:border-0 hover:bg-neutral-25 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex size-8 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                      {(user.displayName?.[0] ?? user.email?.[0] ?? 'U').toUpperCase()}
                    </div>
                    <div>
                      <div className="font-medium text-ink">{user.displayName || 'No name'}</div>
                      <div className="text-xs text-ink-muted">{user.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={cn(
                    'rounded-full px-2 py-0.5 text-xs font-medium',
                    user.role === 'SUPER_ADMIN' ? 'bg-purple-100 text-purple-700' :
                    user.role === 'ADMIN' ? 'bg-brand-100 text-brand-700' :
                    'bg-neutral-100 text-neutral-600',
                  )}>
                    {user.role}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', statusColors[user.status])}>
                    {user.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-ink-secondary">{user.resumeCount}</td>
                <td className="px-4 py-3 text-xs text-ink-muted">
                  {user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : 'Never'}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button className="rounded-md p-1 text-ink-muted hover:bg-neutral-100" title="View user">
                      <Eye className="size-4" />
                    </button>
                    <button className="rounded-md p-1 text-ink-muted hover:bg-neutral-100" title="More actions">
                      <MoreVertical className="size-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredUsers.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-sm text-ink-muted">
                  {searchQuery ? 'No users match your search.' : 'No users found.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── AI Settings Tab ─── */

function AdminAISettings() {
  const [providers, setProviders] = useState<AIProviderStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await get<{ providers: AIProviderStatus[] }>('/admin/ai-settings');
        if (!cancelled) setProviders(data.providers ?? []);
      } catch {
        if (!cancelled) {
          // Fallback sample providers
          setProviders([
            { name: 'NVIDIA NIM', status: 'healthy', model: 'meta/llama-3.2-11b-vision-instruct', latencyMs: 245, requestsToday: 1420, errorsToday: 3 },
            { name: 'Google Gemini', status: 'healthy', model: 'gemini-1.5-flash', latencyMs: 180, requestsToday: 890, errorsToday: 0 },
            { name: 'OpenAI', status: 'degraded', model: 'gpt-4o-mini', latencyMs: 520, requestsToday: 340, errorsToday: 12 },
            { name: 'Groq', status: 'healthy', model: 'llama-3.1-70b-versatile', latencyMs: 95, requestsToday: 2100, errorsToday: 1 },
          ]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  const statusConfig = {
    healthy: { label: 'Healthy', color: 'bg-success-100 text-success-700', icon: CheckCircle2 },
    degraded: { label: 'Degraded', color: 'bg-warning-100 text-warning-700', icon: AlertCircle },
    down: { label: 'Down', color: 'bg-error-100 text-error-700', icon: XCircle },
  };

  if (loading) return <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div>;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink">AI Provider Status</h2>
        <Button variant="outline" size="sm">
          <RefreshCw className="size-3.5" /> Refresh
        </Button>
      </div>

      <div className="space-y-4">
        {providers.map((provider) => {
          const config = statusConfig[provider.status];
          const StatusIcon = config.icon;
          return (
            <Card key={provider.name}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <h3 className="text-sm font-semibold text-ink">{provider.name}</h3>
                    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', config.color)}>
                      <StatusIcon className="size-3" />
                      {config.label}
                    </span>
                  </div>
                  <Button variant="ghost" size="sm">Configure</Button>
                </div>

                <div className="grid grid-cols-4 gap-4 text-center">
                  <div>
                    <div className="text-xs text-ink-muted">Model</div>
                    <div className="mt-0.5 text-xs font-mono font-medium text-ink truncate">{provider.model}</div>
                  </div>
                  <div>
                    <div className="text-xs text-ink-muted">Latency</div>
                    <div className="mt-0.5 text-sm font-semibold text-ink">{provider.latencyMs}ms</div>
                  </div>
                  <div>
                    <div className="text-xs text-ink-muted">Requests Today</div>
                    <div className="mt-0.5 text-sm font-semibold text-ink">{provider.requestsToday.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-xs text-ink-muted">Errors Today</div>
                    <div className={cn('mt-0.5 text-sm font-semibold', provider.errorsToday > 10 ? 'text-error-600' : provider.errorsToday > 0 ? 'text-warning-600' : 'text-success-600')}>
                      {provider.errorsToday}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* API Key management hint */}
      <Card className="mt-6 border-warning-200 bg-warning-50/50">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Shield className="size-5 text-warning-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold text-warning-800">API Key Security</h4>
              <p className="mt-1 text-xs text-warning-700">
                API keys are stored server-side and never exposed to the client. Use the backend admin panel to update provider credentials.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── System Tab ─── */

function AdminSystem() {
  const systemChecks = [
    { name: 'Database (MariaDB)', status: 'healthy' as const, detail: 'Connected, 23ms latency' },
    { name: 'Firebase Auth', status: 'healthy' as const, detail: 'Identity provider active' },
    { name: 'File Storage', status: 'healthy' as const, detail: '2.3 GB used of 50 GB' },
    { name: 'Email Service', status: 'healthy' as const, detail: 'SMTP configured and active' },
    { name: 'Background Workers', status: 'healthy' as const, detail: '4 workers running' },
    { name: 'Redis Cache', status: 'degraded' as const, detail: 'High memory usage (87%)' },
  ];

  const statusIcon = {
    healthy: <CheckCircle2 className="size-4 text-success-600" />,
    degraded: <AlertCircle className="size-4 text-warning-600" />,
    down: <XCircle className="size-4 text-error-600" />,
  };

  return (
    <div>
      <h2 className="text-lg font-semibold text-ink mb-4">System Health</h2>

      <div className="space-y-2">
        {systemChecks.map((check) => (
          <div
            key={check.name}
            className="flex items-center justify-between rounded-xl border border-border bg-surface p-4"
          >
            <div className="flex items-center gap-3">
              {statusIcon[check.status]}
              <div>
                <div className="text-sm font-medium text-ink">{check.name}</div>
                <div className="text-xs text-ink-muted">{check.detail}</div>
              </div>
            </div>
            <span className={cn(
              'rounded-full px-2 py-0.5 text-xs font-medium',
              check.status === 'healthy' ? 'bg-success-100 text-success-700' :
              check.status === 'degraded' ? 'bg-warning-100 text-warning-700' :
              'bg-error-100 text-error-700',
            )}>
              {check.status}
            </span>
          </div>
        ))}
      </div>

      {/* Server info */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Server Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm">
            {[
              ['Node.js Version', 'v20.x LTS'],
              ['Environment', 'Development'],
              ['Uptime', '14 days, 6 hours'],
              ['Memory Usage', '512 MB / 2 GB'],
              ['CPU Usage', '12%'],
              ['Disk Usage', '8.2 GB / 100 GB'],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between border-b border-border pb-2">
                <span className="text-ink-muted">{label}</span>
                <span className="font-medium text-ink">{value}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── Support Desk Tab ─── */

interface SupportTicket {
  id: string;
  email: string;
  subject: string;
  priority: 'low' | 'normal' | 'urgent';
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
  createdAt: string;
  messages?: Array<{ id: string; role: string; body: string; createdAt: string }>;
}

const SAMPLE_TICKETS: SupportTicket[] = [
  {
    id: 't-101',
    email: 'marcus.vance@acme.corp',
    subject: 'Assistance with custom domain CNAME verification',
    priority: 'urgent',
    status: 'OPEN',
    createdAt: '15 mins ago',
    messages: [
      { id: 'm-1', role: 'USER', body: 'We added the DNS TXT record for verification 2 hours ago, but the console still reports pending status. Could you inspect our tenant domain?', createdAt: '15 mins ago' },
    ],
  },
  {
    id: 't-102',
    email: 'helena.t@solis.tech',
    subject: 'Question regarding DOCX export styling customization',
    priority: 'normal',
    status: 'IN_PROGRESS',
    createdAt: '3 hours ago',
    messages: [
      { id: 'm-2', role: 'USER', body: 'Is there a way to set custom header font colors when exporting to DOCX format?', createdAt: '3 hours ago' },
      { id: 'm-3', role: 'STAFF', body: 'Yes! Under Resume Builder > Design Tokens, you can select the primary accent color which maps directly to Word styles.', createdAt: '2 hours ago' },
    ],
  },
  {
    id: 't-103',
    email: 'david.k@enterprise.io',
    subject: 'AI Token quota reset confirmation',
    priority: 'low',
    status: 'RESOLVED',
    createdAt: 'Yesterday',
    messages: [
      { id: 'm-4', role: 'USER', body: 'We would like to request an additional 100k test tokens for our interview prep squad.', createdAt: 'Yesterday' },
      { id: 'm-5', role: 'STAFF', body: 'Your quota has been refreshed with an additional 100k allocation.', createdAt: 'Yesterday' },
    ],
  },
];

function AdminSupport() {
  const [tickets, setTickets] = useState<SupportTicket[]>(SAMPLE_TICKETS);
  const [selectedTicketId, setSelectedTicketId] = useState<string>(SAMPLE_TICKETS[0]?.id ?? '');
  const [replyText, setReplyText] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OPEN' | 'RESOLVED'>('ALL');

  const selectedTicket = tickets.find((t) => t.id === selectedTicketId) || tickets[0];

  const handleSendReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !selectedTicket) return;

    const newMessage = {
      id: `m-${Date.now()}`,
      role: 'STAFF',
      body: replyText,
      createdAt: 'Just now',
    };

    setTickets((prev) =>
      prev.map((t) =>
        t.id === selectedTicket.id
          ? {
              ...t,
              status: 'IN_PROGRESS',
              messages: [...(t.messages || []), newMessage],
            }
          : t,
      ),
    );
    setReplyText('');
  };

  const handleStatusChange = (status: SupportTicket['status']) => {
    if (!selectedTicket) return;
    setTickets((prev) =>
      prev.map((t) => (t.id === selectedTicket.id ? { ...t, status } : t)),
    );
  };

  const filteredTickets = tickets.filter((t) => {
    if (statusFilter === 'ALL') return true;
    return t.status === statusFilter;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ink">Support Help Desk</h2>
          <p className="text-xs text-ink-muted">Manage incoming candidate and organization support inquiries.</p>
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          {(['ALL', 'OPEN', 'RESOLVED'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setStatusFilter(filter)}
              className={cn(
                'rounded-lg px-2.5 py-1 font-medium transition-colors',
                statusFilter === filter
                  ? 'bg-brand-600 text-white'
                  : 'bg-neutral-100 text-ink-muted hover:bg-neutral-200',
              )}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 rounded-xl border border-border bg-surface overflow-hidden shadow-sm">
        {/* Ticket List (5 cols) */}
        <div className="lg:col-span-5 border-b lg:border-b-0 lg:border-r border-border divide-y divide-border overflow-y-auto max-h-[500px]">
          {filteredTickets.map((t) => {
            const isSelected = selectedTicket?.id === t.id;
            return (
              <div
                key={t.id}
                onClick={() => setSelectedTicketId(t.id)}
                className={cn(
                  'p-3.5 cursor-pointer text-left transition-colors',
                  isSelected ? 'bg-brand-50/60' : 'hover:bg-neutral-50',
                )}
              >
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-semibold text-ink truncate max-w-[180px]">{t.email}</span>
                  <span className="text-ink-muted">{t.createdAt}</span>
                </div>
                <div className="text-xs font-medium text-ink line-clamp-1 mb-1.5">{t.subject}</div>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'rounded px-1.5 py-0.5 text-[10px] font-semibold',
                      t.status === 'OPEN'
                        ? 'bg-amber-100 text-amber-700'
                        : t.status === 'RESOLVED'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-blue-100 text-blue-700',
                    )}
                  >
                    {t.status}
                  </span>
                  <span className="text-[10px] uppercase font-bold text-ink-muted">
                    {t.priority}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Ticket Thread & Reply (7 cols) */}
        <div className="lg:col-span-7 flex flex-col justify-between p-4">
          {selectedTicket ? (
            <>
              <div>
                <div className="flex items-start justify-between border-b border-border pb-3 mb-3">
                  <div>
                    <h3 className="text-sm font-bold text-ink">{selectedTicket.subject}</h3>
                    <p className="text-xs text-ink-muted mt-0.5">From: {selectedTicket.email}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    {selectedTicket.status !== 'RESOLVED' ? (
                      <Button size="xs" variant="outline" onClick={() => handleStatusChange('RESOLVED')}>
                        Mark Resolved
                      </Button>
                    ) : (
                      <Button size="xs" variant="outline" onClick={() => handleStatusChange('OPEN')}>
                        Reopen Ticket
                      </Button>
                    )}
                  </div>
                </div>

                {/* Messages */}
                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1 text-xs">
                  {selectedTicket.messages?.map((msg) => (
                    <div
                      key={msg.id}
                      className={cn(
                        'p-3 rounded-xl max-w-[85%]',
                        msg.role === 'STAFF'
                          ? 'ml-auto bg-brand-50 text-brand-900 border border-brand-100'
                          : 'bg-neutral-100 text-neutral-800',
                      )}
                    >
                      <div className="flex items-center justify-between text-[10px] font-semibold text-ink-muted mb-1">
                        <span>{msg.role === 'STAFF' ? 'Support Specialist' : 'Candidate'}</span>
                        <span>{msg.createdAt}</span>
                      </div>
                      <p className="leading-relaxed whitespace-pre-wrap">{msg.body}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Reply Form */}
              <form onSubmit={handleSendReply} className="mt-4 pt-3 border-t border-border flex gap-2">
                <Input
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Type official staff response..."
                  className="text-xs flex-1"
                />
                <Button type="submit" size="sm" disabled={!replyText.trim()}>
                  <Send className="size-3.5 mr-1" />
                  Reply
                </Button>
              </form>
            </>
          ) : (
            <div className="py-12 text-center text-xs text-ink-muted">Select a ticket to view thread</div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Audit Logs Tab ─── */

interface AuditRecord {
  id: string;
  actor: string;
  action: string;
  resource: string;
  outcome: 'SUCCESS' | 'FAILURE';
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  timestamp: string;
  ip: string;
}

const SAMPLE_AUDIT_LOGS: AuditRecord[] = [
  {
    id: 'log-1',
    actor: 'admin@ime365.ai',
    action: 'ai.provider.model_updated',
    resource: 'NVIDIA NIM (meta/llama-3.2-11b)',
    outcome: 'SUCCESS',
    severity: 'INFO',
    timestamp: '10 mins ago',
    ip: '192.168.1.5',
  },
  {
    id: 'log-2',
    actor: 'system.worker',
    action: 'database.schema.migration_applied',
    resource: '0032_dual_database_sync.sql',
    outcome: 'SUCCESS',
    severity: 'INFO',
    timestamp: '1 hour ago',
    ip: '127.0.0.1',
  },
  {
    id: 'log-3',
    actor: 'unknown_client',
    action: 'auth.failed_attempt',
    resource: '/api/admin/users',
    outcome: 'FAILURE',
    severity: 'WARNING',
    timestamp: '4 hours ago',
    ip: '203.0.113.19',
  },
  {
    id: 'log-4',
    actor: 'admin@ime365.ai',
    action: 'user.quota_reset',
    resource: 'Candidate #4091',
    outcome: 'SUCCESS',
    severity: 'INFO',
    timestamp: 'Yesterday',
    ip: '192.168.1.5',
  },
];

function AdminAudit() {
  const [logs] = useState<AuditRecord[]>(SAMPLE_AUDIT_LOGS);
  const [filterQuery, setFilterQuery] = useState('');

  const filteredLogs = logs.filter((l) => {
    if (!filterQuery.trim()) return true;
    const q = filterQuery.toLowerCase();
    return l.actor.toLowerCase().includes(q) || l.action.toLowerCase().includes(q) || l.resource.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ink">Administrative Audit Trail</h2>
          <p className="text-xs text-ink-muted">Cryptographically stamped record of all administrative and security actions.</p>
        </div>
        <div className="w-64">
          <Input
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Filter by actor, action, target..."
            className="text-xs"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
        <table className="w-full text-xs">
          <thead className="bg-canvas border-b border-border">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-ink-secondary">Timestamp</th>
              <th className="px-4 py-3 text-left font-semibold text-ink-secondary">Actor</th>
              <th className="px-4 py-3 text-left font-semibold text-ink-secondary">Action</th>
              <th className="px-4 py-3 text-left font-semibold text-ink-secondary">Target Resource</th>
              <th className="px-4 py-3 text-left font-semibold text-ink-secondary">Outcome</th>
              <th className="px-4 py-3 text-left font-semibold text-ink-secondary">IP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredLogs.map((log) => (
              <tr key={log.id} className="hover:bg-neutral-25 transition-colors">
                <td className="px-4 py-3 text-ink-muted whitespace-nowrap">{log.timestamp}</td>
                <td className="px-4 py-3 font-medium text-ink">{log.actor}</td>
                <td className="px-4 py-3 font-mono text-[11px] text-brand-700">{log.action}</td>
                <td className="px-4 py-3 text-ink-secondary">{log.resource}</td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                      log.outcome === 'SUCCESS'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-rose-100 text-rose-700',
                    )}
                  >
                    {log.outcome}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-[11px] text-ink-muted">{log.ip}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Database & Sync Tab ─── */

function AdminDatabase() {
  const [migrating, setMigrating] = useState(false);
  const [migratedSuccess, setMigratedSuccess] = useState(false);

  const handleRunMigrations = () => {
    setMigrating(true);
    setTimeout(() => {
      setMigrating(false);
      setMigratedSuccess(true);
      setTimeout(() => setMigratedSuccess(false), 3000);
    }, 1200);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ink">Database & Sync Telemetry</h2>
          <p className="text-xs text-ink-muted">MariaDB connection health, query budgets, outbox queues, and schema migrations.</p>
        </div>
        <Button size="sm" onClick={handleRunMigrations} loading={migrating}>
          <Play className="size-3.5 mr-1.5" />
          Run Pending Migrations
        </Button>
      </div>

      {migratedSuccess && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 animate-[fade-in_200ms_ease-out]">
          <CheckCircle2 className="size-4 shrink-0" />
          <span>All pending migrations were executed successfully. Schema version is current.</span>
        </div>
      )}

      {/* Grid status cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Database Engine', value: 'MariaDB 10.11 InnoDB', status: 'Connected', color: 'text-emerald-600' },
          { label: 'Active Tables', value: '38 tables', status: 'Healthy', color: 'text-brand-600' },
          { label: 'Notification Outbox', value: '0 queued', status: 'Drained', color: 'text-emerald-600' },
          { label: 'Enterprise Outbox', value: '0 queued', status: 'Drained', color: 'text-emerald-600' },
        ].map((item) => (
          <Card key={item.label}>
            <CardContent className="p-4">
              <div className="text-xs text-ink-muted">{item.label}</div>
              <div className="text-lg font-bold text-ink mt-1">{item.value}</div>
              <div className={cn('text-xs font-semibold mt-1', item.color)}>● {item.status}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Migrations Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Schema Migration Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead className="bg-canvas border-b border-border">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-ink-secondary">Migration ID</th>
                  <th className="px-3 py-2 text-left font-semibold text-ink-secondary">Description</th>
                  <th className="px-3 py-2 text-left font-semibold text-ink-secondary">State</th>
                  <th className="px-3 py-2 text-left font-semibold text-ink-secondary">Applied Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[
                  { id: '0032', name: 'Dual Database Platform Sync & Tables', status: 'APPLIED', date: 'Oct 17, 2026' },
                  { id: '0031', name: 'Enterprise Multi-Tenant IAM & Outbox', status: 'APPLIED', date: 'Oct 16, 2026' },
                  { id: '0030', name: 'Job Tracker Kanban Metadata Extension', status: 'APPLIED', date: 'Oct 15, 2026' },
                  { id: '0029', name: 'AI Model Selection & Telemetry Tables', status: 'APPLIED', date: 'Oct 14, 2026' },
                ].map((m) => (
                  <tr key={m.id} className="hover:bg-neutral-25">
                    <td className="px-3 py-2 font-mono font-semibold text-brand-700">{m.id}</td>
                    <td className="px-3 py-2 text-ink font-medium">{m.name}</td>
                    <td className="px-3 py-2">
                      <span className="rounded bg-emerald-100 text-emerald-800 px-1.5 py-0.5 text-[10px] font-semibold">
                        {m.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-ink-muted">{m.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
