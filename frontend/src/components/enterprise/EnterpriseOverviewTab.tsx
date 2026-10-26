/**
 * Enterprise Overview Tab (Executive Command Center)
 *
 * Real-time operational metrics, hiring velocity, AI consumption sparkline,
 * live MariaDB data plane status, DLQ alerts, and actionable recommendations.
 */

import { useState, useEffect, useMemo } from 'react';
import {
  Users,
  Sliders,
  Zap,
  Shield,
  Database,
  Activity,
  ArrowRight,
  UserPlus,
  Plus,
  FileText,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useEnterprise } from './EnterpriseContext';
import { HelpTooltip } from './HelpTooltip';
import {
  enterpriseApi,
  type EnterpriseMembership,
  type EnterpriseTeam,
  type EnterpriseAuditEvent,
  type EnterpriseObservabilityMetrics,
  type EnterpriseDataPlaneStatus,
  type EnterpriseQueueStatus,
  type EnterpriseAiUsage,
} from '@/lib/enterprise-api';
import { cn } from '@/lib/utils';

interface TrendPoint {
  day: string;
  requests: number;
}

function TrendSparkline({ points = [], width = 560, height = 96 }: { points?: TrendPoint[]; width?: number; height?: number }) {
  if (!Array.isArray(points) || points.length < 2) return null;
  const max = Math.max(...points.map((p) => p.requests), 1);
  const stepX = width / (points.length - 1);
  const coords = points.map((p, i) => [i * stepX, height - (p.requests / max) * (height - 12) - 4]);
  const line = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${width},${height} L0,${height} Z`;
  const peak = points.reduce((best, p) => (p.requests > best.requests ? p : best), points[0]);

  return (
    <div className="relative w-full overflow-hidden" role="img" aria-label={`AI requests per day for last ${points.length} days; peak ${peak.requests} on ${peak.day}`}>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="w-full h-24 overflow-visible">
        <defs>
          <linearGradient id="sparkline-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-accent, #6366f1)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="var(--color-accent, #6366f1)" stopOpacity="0.0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#sparkline-grad)" />
        <path d={line} fill="none" stroke="currentColor" strokeWidth="2.5" className="text-accent" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <div className="flex justify-between items-center text-xs font-mono text-ink-muted mt-2 border-t border-edge/60 pt-1.5">
        <span>{points[0]?.day}</span>
        <span className="font-semibold text-accent">Peak: {peak.requests.toLocaleString()} req ({peak.day})</span>
        <span>{points[points.length - 1]?.day}</span>
      </div>
    </div>
  );
}

export interface EnterpriseOverviewTabProps {
  onNavigate: (tabId: string, params?: Record<string, string>) => void;
}

export function EnterpriseOverviewTab({ onNavigate }: EnterpriseOverviewTabProps) {
  const { tenant, workspaces, hasPermission } = useEnterprise();
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<EnterpriseMembership[]>([]);
  const [teams, setTeams] = useState<EnterpriseTeam[]>([]);
  const [auditEvents, setAuditEvents] = useState<EnterpriseAuditEvent[]>([]);
  const [, setMetrics] = useState<EnterpriseObservabilityMetrics | null>(null);
  const [dataPlane, setDataPlane] = useState<EnterpriseDataPlaneStatus | null>(null);
  const [queue, setQueue] = useState<EnterpriseQueueStatus | null>(null);
  const [usage, setUsage] = useState<EnterpriseAiUsage | null>(null);
  const [dailyAiLimit, setDailyAiLimit] = useState(100);

  useEffect(() => {
    if (!tenant?.id) {
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);

    const loadOverviewData = async () => {
      try {
        const [
          membersRes,
          teamsRes,
          auditRes,
          metricsRes,
          planeRes,
          queueRes,
          usageRes,
          configRes,
        ] = await Promise.all([
          hasPermission('tenant.members.read') ? enterpriseApi.getMemberships(tenant.id).catch(() => ({ memberships: [] })) : Promise.resolve({ memberships: [] }),
          hasPermission('workspace.read') ? enterpriseApi.getTeams(tenant.id).catch(() => ({ teams: [] })) : Promise.resolve({ teams: [] }),
          hasPermission('tenant.audit.read') ? enterpriseApi.getAuditLogs(tenant.id, { limit: 5 }).catch(() => ({ events: [] })) : Promise.resolve({ events: [] }),
          hasPermission('tenant.security.read') ? enterpriseApi.getObservabilityMetrics(tenant.id).catch(() => null) : Promise.resolve(null),
          hasPermission('tenant.security.read') ? enterpriseApi.getDataPlaneStatus(tenant.id).catch(() => null) : Promise.resolve(null),
          hasPermission('tenant.security.read') ? enterpriseApi.getQueueStatus(tenant.id).catch(() => null) : Promise.resolve(null),
          hasPermission('tenant.usage.read') ? enterpriseApi.getAiUsage(tenant.id, 30).catch(() => null) : Promise.resolve(null),
          hasPermission('tenant.read') ? enterpriseApi.getConfiguration(tenant.id).catch(() => null) : Promise.resolve(null),
        ]);

        if (!isMounted) return;

        setMembers(membersRes?.memberships || []);
        setTeams(teamsRes?.teams || []);
        setAuditEvents(auditRes?.events || []);
        setMetrics(metricsRes?.metrics || null);
        setDataPlane(planeRes?.dataPlane || null);
        setQueue(queueRes?.queue || null);
        setUsage(usageRes?.usage || null);
        setDailyAiLimit(Number(configRes?.configuration?.quotaPolicy?.aiRequestsPerDay || 100));
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadOverviewData();
    return () => {
      isMounted = false;
    };
  }, [tenant?.id, hasPermission]);

  const activeMemberCount = members.filter((m) => m.status === 'ACTIVE').length;
  const pendingMemberCount = members.filter((m) => m.status === 'INVITED').length;
  const suspendedMemberCount = members.filter((m) => m.status === 'SUSPENDED').length;

  const usageByDay = useMemo(() => usage?.byDay || [], [usage]);
  const todayRequests = usageByDay.length ? usageByDay[usageByDay.length - 1]?.requests || 0 : usage?.requests || 0;
  const quotaRatio = dailyAiLimit > 0 ? todayRequests / dailyAiLimit : 0;

  const dlqCount = queue?.deadLetterCount || 0;
  const isPlaneHealthy = dataPlane
    ? dataPlane.status === 'ONLINE' || (dataPlane.configured && dataPlane.durable)
    : dlqCount === 0;

  // Real actionable recommendations
  const recommendations = useMemo(() => {
    const list: Array<{
      id: string;
      tone: 'danger' | 'warning' | 'info';
      title: string;
      hint: string;
      target: string;
      params?: Record<string, string>;
    }> = [];

    if (dlqCount > 0) {
      list.push({
        id: 'dlq',
        tone: 'warning',
        title: `${dlqCount} dead-letter job${dlqCount === 1 ? '' : 's'} awaiting replay`,
        hint: 'Inspect failed outbox messages and replay from Security & M2M.',
        target: 'security',
        params: { focus: 'jobs' },
      });
    }

    if (quotaRatio >= 0.8) {
      list.push({
        id: 'quota',
        tone: quotaRatio >= 1 ? 'danger' : 'warning',
        title: quotaRatio >= 1 ? 'Daily AI Request Quota Exhausted' : `AI Quota Nearing Limit (${Math.round(quotaRatio * 100)}% used)`,
        hint: 'Review department token distribution or request an allowance bump.',
        target: 'usage',
      });
    }

    if (suspendedMemberCount > 0) {
      list.push({
        id: 'suspended',
        tone: 'warning',
        title: `${suspendedMemberCount} suspended enterprise member${suspendedMemberCount === 1 ? '' : 's'}`,
        hint: 'Review inactive memberships in Users & IAM.',
        target: 'members',
        params: { status: 'SUSPENDED' },
      });
    }

    if (pendingMemberCount > 0) {
      list.push({
        id: 'pending',
        tone: 'info',
        title: `${pendingMemberCount} pending invitation${pendingMemberCount === 1 ? '' : 's'} awaiting acceptance`,
        hint: 'Resend invitation links from Users & IAM.',
        target: 'members',
        params: { status: 'INVITED' },
      });
    }

    if (members.length <= 1) {
      list.push({
        id: 'invite-first',
        tone: 'info',
        title: 'Only 1 active member in tenant',
        hint: 'Invite your department leads to start collaborating.',
        target: 'members',
        params: { invite: '1' },
      });
    }

    return list;
  }, [dlqCount, quotaRatio, suspendedMemberCount, pendingMemberCount, members.length]);

  return (
    <div className="space-y-6">
      {/* ─── Row 1: Executive KPI Metrics ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Members */}
        <Card className="border border-edge bg-surface-raised/60 backdrop-blur-md shadow-xs">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                Active Members
              </span>
              <div className="size-8 rounded-lg bg-accent-soft flex items-center justify-center text-accent">
                <Users className="size-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-black tracking-tight text-ink">
                {activeMemberCount}
              </span>
              <span className="text-xs text-ink-muted">
                / {members.length} total
              </span>
            </div>
            <div className="mt-2 text-xs text-ink-muted flex items-center gap-1.5">
              <span className="inline-block size-1.5 rounded-full bg-emerald-500" />
              <span>{pendingMemberCount} pending invite{pendingMemberCount === 1 ? '' : 's'}</span>
            </div>
          </CardContent>
        </Card>

        {/* Workspaces & Teams */}
        <Card className="border border-edge bg-surface-raised/60 backdrop-blur-md shadow-xs">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                Departments & Teams
              </span>
              <div className="size-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-500">
                <Sliders className="size-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-black tracking-tight text-ink">
                {workspaces.length}
              </span>
              <span className="text-xs text-ink-muted">
                workspaces · {teams.length} teams
              </span>
            </div>
            <div className="mt-2 text-xs text-ink-muted">
              Partitioned tenant isolation
            </div>
          </CardContent>
        </Card>

        {/* AI Daily Usage */}
        <Card className="border border-edge bg-surface-raised/60 backdrop-blur-md shadow-xs">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                Today's AI Requests
              </span>
              <div className="size-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500">
                <Zap className="size-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl font-black tracking-tight text-ink">
                {todayRequests.toLocaleString()}
              </span>
              <span className="text-xs text-ink-muted">
                / {dailyAiLimit} limit
              </span>
            </div>
            <div className="mt-2 text-xs text-ink-muted">
              {Math.round(quotaRatio * 100)}% daily allowance utilized
            </div>
          </CardContent>
        </Card>

        {/* Security & Data Plane */}
        <Card className="border border-edge bg-surface-raised/60 backdrop-blur-md shadow-xs">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                Data Plane & Outbox
              </span>
              <div className="size-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                <Database className="size-4" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className={cn('text-2xl font-black tracking-tight', isPlaneHealthy ? 'text-ink' : 'text-amber-600 dark:text-amber-400')}>
                {loading ? 'Checking…' : isPlaneHealthy ? 'Operational' : 'Degraded'}
              </span>
            </div>
            <div className="mt-2 text-xs text-ink-muted flex items-center gap-1.5">
              <span className={cn('inline-block size-1.5 rounded-full', dlqCount > 0 ? 'bg-amber-500' : 'bg-emerald-500')} />
              <span>{dlqCount === 0 ? 'Zero dead-letter jobs' : `${dlqCount} failed DLQ job(s)`}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Row 2: AI Consumption Telemetry & Actionable Recommendations ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Trend Sparkline */}
        <Card className="lg:col-span-2 border border-edge bg-surface-raised/60 backdrop-blur-md shadow-xs">
          <CardHeader className="p-5 pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold text-ink flex items-center gap-2">
                  <Activity className="size-4 text-accent" />
                  AI Request Consumption Trend
                  <HelpTooltip text="Durable consumption telemetry recorded directly in MariaDB audit ledger over the last 30 days." />
                </CardTitle>
                <CardDescription className="text-xs text-ink-muted mt-0.5">
                  Daily inference requests generated across all organizational workspaces.
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onNavigate('usage')}
                className="text-xs"
              >
                Full Analytics
                <ArrowRight className="size-3.5 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            {usageByDay.length >= 2 ? (
              <TrendSparkline points={usageByDay} />
            ) : (
              <div className="h-28 flex items-center justify-center text-xs text-ink-muted border border-dashed border-edge rounded-lg">
                Insufficient historical AI data for sparkline visualization.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Actionable Recommendations */}
        <Card className="border border-edge bg-surface-raised/60 backdrop-blur-md shadow-xs">
          <CardHeader className="p-5 pb-3">
            <CardTitle className="text-base font-bold text-ink flex items-center gap-2">
              <CheckCircle2 className="size-4 text-emerald-500" />
              Operational Recommendations
            </CardTitle>
            <CardDescription className="text-xs text-ink-muted mt-0.5">
              Live automated suggestions derived directly from server state.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 pt-0 space-y-3">
            {recommendations.length === 0 ? (
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-700 dark:text-emerald-300">
                ✓ All enterprise operational systems operating within contractual thresholds.
              </div>
            ) : (
              recommendations.map((rec) => (
                <div
                  key={rec.id}
                  onClick={() => onNavigate(rec.target, rec.params)}
                  className={cn(
                    'p-3 rounded-xl border text-xs cursor-pointer transition-all hover:scale-[1.01] hover:shadow-2xs',
                    rec.tone === 'danger' && 'bg-rose-500/10 border-rose-500/30 text-rose-900 dark:text-rose-200',
                    rec.tone === 'warning' && 'bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-200',
                    rec.tone === 'info' && 'bg-accent-soft/40 border-accent/20 text-ink',
                  )}
                >
                  <div className="font-bold flex items-center justify-between">
                    <span>{rec.title}</span>
                    <ArrowRight className="size-3 shrink-0 opacity-70" />
                  </div>
                  <p className="mt-1 text-xs opacity-80 leading-relaxed">{rec.hint}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── Row 3: Quick Command Palette & Audit Trail ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Actions */}
        <Card className="border border-edge bg-surface-raised/60 backdrop-blur-md shadow-xs">
          <CardHeader className="p-5 pb-3">
            <CardTitle className="text-base font-bold text-ink">Quick Administration</CardTitle>
            <CardDescription className="text-xs text-ink-muted">
              Deep-link shortcuts to common administrative workflows.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 pt-0 space-y-2">
            <Button
              variant="outline"
              className="w-full justify-start text-xs font-semibold"
              onClick={() => onNavigate('members', { invite: '1' })}
            >
              <UserPlus className="size-3.5 mr-2 text-accent" />
              Invite or Provision Teammate
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start text-xs font-semibold"
              onClick={() => onNavigate('resumes')}
            >
              <FileText className="size-3.5 mr-2 text-indigo-500" />
              Browse Candidate Talent Pool
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start text-xs font-semibold"
              onClick={() => onNavigate('workspaces')}
            >
              <Plus className="size-3.5 mr-2 text-emerald-500" />
              Create Departmental Workspace
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start text-xs font-semibold"
              onClick={() => onNavigate('security', { focus: 'jobs' })}
            >
              <Lock className="size-3.5 mr-2 text-amber-500" />
              Inspect Dead-Letter Queue & M2M Keys
            </Button>
          </CardContent>
        </Card>

        {/* Forensic Audit Log Preview */}
        <Card className="lg:col-span-2 border border-edge bg-surface-raised/60 backdrop-blur-md shadow-xs">
          <CardHeader className="p-5 pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold text-ink flex items-center gap-2">
                  <Shield className="size-4 text-accent" />
                  Recent Governance & Audit Activity
                </CardTitle>
                <CardDescription className="text-xs text-ink-muted mt-0.5">
                  Immutable forensic audit trail of tenant administrative actions.
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onNavigate('audit')}
                className="text-xs"
              >
                View Full Log
                <ArrowRight className="size-3.5 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-5 pt-0">
            {auditEvents.length === 0 ? (
              <div className="text-xs text-ink-muted text-center py-6 border border-dashed border-edge rounded-lg">
                No recent audit activity recorded for this organization.
              </div>
            ) : (
              <div className="divide-y divide-edge">
                {auditEvents.slice(0, 4).map((evt) => (
                  <div key={evt.id} className="py-2.5 flex items-center justify-between text-xs gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-ink flex items-center gap-2">
                        <span className="font-mono text-accent">{evt.action}</span>
                        {evt.target && (
                          <span className="text-ink-muted font-normal truncate">
                            → {evt.target}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-ink-muted mt-0.5">
                        Actor: {evt.actorEmail || evt.actor} {evt.ip ? `· IP: ${evt.ip}` : ''}
                      </div>
                    </div>
                    <span className="text-xs font-mono text-ink-muted shrink-0">
                      {new Date(evt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default EnterpriseOverviewTab;
