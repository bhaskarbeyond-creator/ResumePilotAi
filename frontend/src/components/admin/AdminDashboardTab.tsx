/**
 * Super Admin Command Center Dashboard Tab
 *
 * Real-time operational overview, Super Admin Role View banner,
 * quick action dispatchers, and system metrics.
 */

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/loading';
import { cn } from '@/lib/utils';
import { get } from '@/lib/api-client';
import { ServiceDegradedBanner } from './ServiceDegradedBanner';
import { Link } from 'react-router-dom';
import {
  Users,
  FileText,
  Server,
  Activity,
  Shield,
  Brain,
  Edit3,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';

interface AdminDashboardTabProps {
  onNavigateTab: (tabId: string) => void;
}

export function AdminDashboardTab({ onNavigateTab }: AdminDashboardTabProps) {
  const [stats, setStats] = useState<{ users: number; resumes: number; tenants: number } | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [roleView, setRoleView] = useState<'super_admin' | 'candidate' | 'employer' | 'enterprise'>('super_admin');
  const loadStats = async () => {
    setLoading(true);
    setError(false);
    setStats(null);
    try {
      const data = await get<unknown>('/platform/stats');
      if (!data || typeof data !== 'object') throw new Error('Invalid statistics');
      const candidate = data as Record<string, unknown>;
      if (!['users', 'resumes', 'tenants'].every(key => typeof candidate[key] === 'number' && Number.isSafeInteger(candidate[key]) && (candidate[key] as number) >= 0)) throw new Error('Invalid statistics');
      setStats(candidate as unknown as { users: number; resumes: number; tenants: number });
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void loadStats(); }, []);
  const statCards = stats ? [
    { label: 'Total Platform Users', value: stats.users, icon: Users, color: 'bg-brand-50 text-brand-600' },
    { label: 'Resumes Created', value: stats.resumes, icon: FileText, color: 'bg-info-50 text-info-600' },
    { label: 'Enterprise Tenants', value: stats.tenants, icon: Shield, color: 'bg-purple-50 text-purple-600' },
  ] : [];

  return (
    <div className="space-y-6">
      {/* ─── Super Admin Role View Mode Banner ─── */}
      <div className="rounded-2xl border border-brand-200 dark:border-brand-800/40 bg-gradient-to-r from-brand-50 via-white to-purple-50 dark:from-brand-950/40 dark:via-surface dark:to-purple-950/30 p-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-brand-600 text-white shadow-xs shrink-0">
              <Shield className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-ink">Super Admin Role View Mode</h3>
                <span className="rounded-full bg-brand-100 dark:bg-brand-900/50 px-2 py-0.5 text-xs font-extrabold text-brand-800 dark:text-brand-300 uppercase">
                  Active
                </span>
              </div>
              <p className="text-xs text-ink-muted">
                Inspect UI projections across personas while preserving authoritative root policy permissions.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-semibold text-ink-secondary">Perspective:</span>
            <select
              value={roleView}
              onChange={(e) => setRoleView(e.target.value as any)}
              className="rounded-lg border border-border bg-white dark:bg-canvas-soft px-2.5 py-1.5 text-xs font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="super_admin">Root Platform Admin (*)</option>
              <option value="candidate">Candidate Perspective</option>
              <option value="employer">Recruiter / Employer Hub</option>
              <option value="enterprise">Enterprise Organization</option>
            </select>
          </div>
        </div>
      </div>

      {/* ─── Operational KPI Matrix ─── */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-3">
          <h2 className="text-base font-bold text-ink">Command Center Telemetry & Metrics</h2>
          <span className="text-xs text-ink-muted">Source: /api/platform/stats</span>
        </div>

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        ) : error ? (
          <ServiceDegradedBanner message="Platform statistics are unavailable." onRetry={() => void loadStats()} />
        ) : stats && statCards.every(card => card.value === 0) ? (
          <p role="status">No users, resumes, or enterprise tenants found.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {statCards.map((stat) => {
              const Icon = stat.icon;
              return (
                <Card key={stat.label} className="border-border">
                  <CardContent className="flex items-center gap-4 p-4">
                    <div className={cn('flex size-12 items-center justify-center rounded-xl shrink-0', stat.color)}>
                      <Icon className="size-6" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-ink-muted">{stat.label}</p>
                      <p className="text-xl font-bold text-ink">
                        {typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── Quick Administrative Action Launchers ─── */}
      <div>
        <h2 className="text-base font-bold text-ink mb-3">Executive Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          <button
            onClick={() => onNavigateTab('ai-settings')}
            className="rounded-xl border border-border bg-surface p-4 text-left hover:border-brand-300 dark:hover:border-brand-700 hover:shadow-xs transition-all group cursor-pointer"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex size-9 items-center justify-center rounded-lg bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 group-hover:bg-purple-100 dark:group-hover:bg-purple-900/60">
                <Brain className="size-5" />
              </div>
              <ArrowRight className="size-4 text-ink-muted group-hover:text-brand-600 transition-colors" />
            </div>
            <h4 className="text-sm font-bold text-ink">AI Provider Orchestrator</h4>
            <p className="text-xs text-ink-muted mt-1">Configure NVIDIA, Gemini, OpenAI, custom models & failover.</p>
          </button>

          <button
            onClick={() => onNavigateTab('health')}
            className="rounded-xl border border-border bg-surface p-4 text-left hover:border-brand-300 dark:hover:border-brand-700 hover:shadow-xs transition-all group cursor-pointer"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex size-9 items-center justify-center rounded-lg bg-success-50 dark:bg-emerald-950/50 text-success-600 dark:text-emerald-400 group-hover:bg-success-100 dark:group-hover:bg-emerald-900/60">
                <Activity className="size-5" />
              </div>
              <ArrowRight className="size-4 text-ink-muted group-hover:text-brand-600 transition-colors" />
            </div>
            <h4 className="text-sm font-bold text-ink">Service Health Probes</h4>
            <p className="text-xs text-ink-muted mt-1">View available live dependency checks.</p>
          </button>

          <button
            onClick={() => onNavigateTab('operations')}
            className="rounded-xl border border-border bg-surface p-4 text-left hover:border-brand-300 dark:hover:border-brand-700 hover:shadow-xs transition-all group cursor-pointer"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex size-9 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 group-hover:bg-amber-100 dark:group-hover:bg-amber-900/60">
                <Server className="size-5" />
              </div>
              <ArrowRight className="size-4 text-ink-muted group-hover:text-brand-600 transition-colors" />
            </div>
            <h4 className="text-sm font-bold text-ink">Maintenance Controller</h4>
            <p className="text-xs text-ink-muted mt-1">Platform maintenance toggle, hot backup & cache clearing.</p>
          </button>

          <Link
            to="/blog-editor"
            className="rounded-xl border border-border bg-surface p-4 text-left hover:border-brand-300 dark:hover:border-brand-700 hover:shadow-xs transition-all group cursor-pointer block"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex size-9 items-center justify-center rounded-lg bg-brand-50 dark:bg-brand-950/50 text-brand-600 dark:text-brand-400 group-hover:bg-brand-100 dark:group-hover:bg-brand-900/60">
                <Edit3 className="size-5" />
              </div>
              <ExternalLink className="size-4 text-ink-muted group-hover:text-brand-600 transition-colors" />
            </div>
            <h4 className="text-sm font-bold text-ink">In-App Blog Editor</h4>
            <p className="text-xs text-ink-muted mt-1">Launch rich Markdown & HTML article editor at /blog-editor.</p>
          </Link>
        </div>
      </div>

    </div>
  );
}
