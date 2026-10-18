/**
 * Dashboard Overview Page
 *
 * The main authenticated landing page showing key metrics,
 * recent activity, and quick actions.
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/providers/auth-provider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/loading';
import { get, normalizeError } from '@/lib/api-client';
import {
  FileText,
  BarChart3,
  Briefcase,
  GraduationCap,
  Plus,
  ArrowRight,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Award,
} from 'lucide-react';

interface UserStats {
  resumes: number;
  coverLetters: number;
  portfolios: number;
  applications: number;
  trackedJobs: number;
  profileComplete: boolean;
}

interface QuickAction {
  label: string;
  description: string;
  href: string;
  icon: typeof FileText;
  color: string;
  bgColor: string;
}

const quickActions: QuickAction[] = [
  {
    label: 'Create Resume',
    description: 'Build a professional resume',
    href: '/build-resume',
    icon: FileText,
    color: 'text-brand-600',
    bgColor: 'bg-brand-50',
  },
  {
    label: 'Check ATS Score',
    description: 'Analyze resume compatibility',
    href: '/dashboard/ats',
    icon: BarChart3,
    color: 'text-success-600',
    bgColor: 'bg-success-50',
  },
  {
    label: 'Practice Interview',
    description: 'AI-powered mock interview',
    href: '/dashboard/interviews',
    icon: GraduationCap,
    color: 'text-info-600',
    bgColor: 'bg-info-50',
  },
  {
    label: 'Browse Jobs',
    description: 'Find matching opportunities',
    href: '/dashboard/jobs',
    icon: Briefcase,
    color: 'text-warning-600',
    bgColor: 'bg-warning-50',
  },
];

export function DashboardOverview() {
  const { user } = useAuth();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);

  const displayName = user?.displayName || user?.email?.split('@')[0] || 'there';
  const greeting = getGreeting();

  useEffect(() => {
    let cancelled = false;

    async function fetchStats() {
      try {
        const data = await get<{ stats: UserStats }>('/api/user-stats');
        if (!cancelled) {
          setStats(data.stats);
          setStatsError(null);
        }
      } catch (err) {
        if (!cancelled) {
          const apiError = normalizeError(err);
          setStatsError(apiError.message);
        }
      } finally {
        if (!cancelled) setStatsLoading(false);
      }
    }

    fetchStats();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="p-4 lg:p-6 xl:p-8">
      {/* Welcome header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-ink lg:text-3xl">
          {greeting}, {displayName}! 👋
        </h1>
        <p className="mt-1 text-ink-secondary">
          Here's an overview of your career progress.
        </p>
      </div>

      {/* Stats grid */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <StatCard
          label="Resumes"
          value={stats?.resumes}
          icon={FileText}
          loading={statsLoading}
          error={statsError}
          href="/dashboard/resumes"
          iconColor="text-brand-600"
          iconBg="bg-brand-50"
        />
        <StatCard
          label="Cover Letters"
          value={stats?.coverLetters}
          icon={FileText}
          loading={statsLoading}
          error={statsError}
          href="/dashboard/cover-letters"
          iconColor="text-purple-600"
          iconBg="bg-purple-50"
        />
        <StatCard
          label="Portfolios"
          value={stats?.portfolios}
          icon={Award}
          loading={statsLoading}
          error={statsError}
          href="/dashboard/portfolio"
          iconColor="text-amber-600"
          iconBg="bg-amber-50"
        />
        <StatCard
          label="Applications"
          value={stats?.applications}
          icon={Briefcase}
          loading={statsLoading}
          error={statsError}
          href="/dashboard/jobs"
          iconColor="text-info-600"
          iconBg="bg-info-50"
        />
        <StatCard
          label="Tracked Jobs"
          value={stats?.trackedJobs}
          icon={GraduationCap}
          loading={statsLoading}
          error={statsError}
          href="/dashboard/jobs"
          iconColor="text-success-600"
          iconBg="bg-success-50"
        />
        <StatCard
          label="Profile"
          value={stats?.profileComplete ? 100 : 0}
          icon={CheckCircle2}
          loading={statsLoading}
          error={statsError}
          href="/dashboard/settings"
          iconColor="text-emerald-600"
          iconBg="bg-emerald-50"
        />
      </div>

      {/* Quick actions */}
      <div className="mb-8">
        <h2 className="mb-4 text-lg font-semibold text-ink">Quick Actions</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.href}
                to={action.href}
                className="group flex items-center gap-4 rounded-xl border border-border bg-surface p-4 no-underline transition-all duration-200 hover:border-brand-200 hover:shadow-md"
              >
                <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${action.bgColor} transition-colors`}>
                  <Icon className={`size-5 ${action.color}`} />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-ink">{action.label}</div>
                  <div className="text-xs text-ink-muted">{action.description}</div>
                </div>
                <ArrowRight className="ml-auto size-4 text-ink-subtle opacity-0 transition-all group-hover:opacity-100 group-hover:translate-x-0.5" />
              </Link>
            );
          })}
        </div>
      </div>

      {/* Activity & Tips section */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="size-4 text-ink-muted" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-4">
              <EmptyActivity />
            </div>
          </CardContent>
        </Card>

        {/* Getting Started / Tips */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="size-4 text-brand-500" />
              Getting Started
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-3">
              <ChecklistItem
                label="Create your first resume"
                description="Choose from 51+ professional templates"
                href="/build-resume"
                completed={!!stats && stats.resumes > 0}
              />
              <ChecklistItem
                label="Check your ATS score"
                description="See how your resume performs with ATS"
                href="/dashboard/ats"
                completed={!!stats && stats.resumes > 0}
              />
              <ChecklistItem
                label="Practice an interview"
                description="Get AI-powered feedback on your responses"
                href="/dashboard/interviews"
                completed={!!stats && stats.resumes > 0}
              />
              <ChecklistItem
                label="Explore job opportunities"
                description="Find and track jobs that match your profile"
                href="/dashboard/jobs"
                completed={!!stats && stats.applications > 0}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ─── Sub-components ─── */

function StatCard({
  label,
  value,
  icon: Icon,
  loading,
  error,
  href,
  iconColor,
  iconBg,
}: {
  label: string;
  value: number | undefined;
  icon: typeof FileText;
  loading: boolean;
  error: string | null;
  href: string;
  iconColor: string;
  iconBg: string;
}) {
  return (
    <Link to={href} className="no-underline">
      <Card className="transition-all duration-200 hover:border-brand-200 hover:shadow-md">
        <CardContent className="flex items-center gap-4 p-4">
          <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
            <Icon className={`size-5 ${iconColor}`} />
          </div>
          <div>
            {loading ? (
              <Skeleton className="mb-1 h-7 w-12" />
            ) : error ? (
              <div className="flex items-center gap-1 text-sm text-error-500">
                <AlertCircle className="size-3.5" />
                <span>—</span>
              </div>
            ) : (
              <div className="text-2xl font-bold text-ink">{value ?? 0}</div>
            )}
            <div className="text-xs text-ink-muted">{label}</div>
          </div>
          <TrendingUp className="ml-auto size-4 text-ink-subtle" />
        </CardContent>
      </Card>
    </Link>
  );
}

function EmptyActivity() {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <Clock className="mb-3 size-8 text-ink-subtle" />
      <p className="text-sm font-medium text-ink-secondary">No recent activity</p>
      <p className="mt-1 text-xs text-ink-muted">
        Your activity will appear here as you use the platform.
      </p>
      <Button variant="outline" size="sm" className="mt-4" asChild>
        <Link to="/build-resume">
          <Plus className="size-4" />
          Create your first resume
        </Link>
      </Button>
    </div>
  );
}

function ChecklistItem({
  label,
  description,
  href,
  completed,
}: {
  label: string;
  description: string;
  href: string;
  completed: boolean;
}) {
  return (
    <Link
      to={href}
      className={`flex items-start gap-3 rounded-lg p-3 no-underline transition-colors ${
        completed ? 'bg-success-50/50' : 'hover:bg-neutral-50'
      }`}
    >
      <div className="mt-0.5">
        {completed ? (
          <CheckCircle2 className="size-5 text-success-500" />
        ) : (
          <div className="size-5 rounded-full border-2 border-neutral-300" />
        )}
      </div>
      <div>
        <div className={`text-sm font-medium ${completed ? 'text-ink-muted line-through' : 'text-ink'}`}>
          {label}
        </div>
        <div className="text-xs text-ink-muted">{description}</div>
      </div>
    </Link>
  );
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
