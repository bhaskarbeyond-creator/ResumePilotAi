/**
 * Dashboard Overview Page
 *
 * Executive Candidate Workspace Overview (Cuba Executive Standard).
 * Shows live metrics, Copilot Hero HUD, Top Job Matches, Recent Career Activity, and Next Steps.
 * NOTE: Strictly zero job_tracker dependencies per executive specification.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/providers/auth-provider';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/loading';
import { get, post, del, normalizeError } from '@/lib/api-client';
import { resumeQualityScore } from '@/lib/resume-score';
import { ATS_READY_THRESHOLD, computeResumeMetrics } from '@/lib/resume-metrics';
import { getTemplateMeta } from '@/lib/template-catalog';
import { JobApplicationModal } from '@/components/jobs/job-application-modal';
import { cn } from '@/lib/utils';
import {
  FileText,
  Briefcase,
  GraduationCap,
  Plus,
  ArrowRight,
  TrendingUp,
  CheckCircle2,
  Sparkles,
  Award,
  ChevronRight,
  MapPin,
  Bookmark,
  Target,
  RefreshCw,
  ExternalLink,
  AlertCircle,
  Clock,
  PenLine,
  UserCheck,
  Shield,
  Zap,
} from 'lucide-react';

interface UserStats {
  resumes: number;
  coverLetters: number;
  portfolios: number;
  applications: number;
  profileComplete: boolean;
}

interface JobListing {
  id: string;
  title: string;
  company?: string;
  company_name?: string;
  location?: string;
  created_at?: string;
  createdAt?: string;
  work_mode?: string;
  salary?: string;
}

interface CareerActivity {
  id: string;
  type: 'resume' | 'cover_letter' | 'favourite' | 'profile';
  title: string;
  action: string;
  timestamp: string;
  href: string;
  badge: string;
  badgeColor: string;
}

const DONUT_SIZE = 44;
const DONUT_STROKE = 4.5;
const DONUT_RADIUS = (DONUT_SIZE - DONUT_STROKE) / 2;
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;

export function DashboardOverview() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // State
  const [stats, setStats] = useState<UserStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);

  const [resumes, setResumes] = useState<any[]>([]);
  /** Real membership from the profile; null hides the plan badge (never a guessed plan). */
  const [membership, setMembership] = useState<string | null>(null);
  const [recentResumesDelta, setRecentResumesDelta] = useState<number>(0);

  const [jobs, setJobs] = useState<JobListing[]>([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  // A failed read is shown, never disguised as "no jobs".
  const [jobsError, setJobsError] = useState<string | null>(null);
  // Bookmarks and the activity stream are secondary: their failures are reported, not swallowed.
  const [secondaryError, setSecondaryError] = useState<string | null>(null);
  // The job whose application dialog is open (the same modal the job board uses).
  const [applyJob, setApplyJob] = useState<JobListing | null>(null);

  const [favourites, setFavourites] = useState<Set<string>>(new Set());
  const [favouritesList, setFavouritesList] = useState<any[]>([]);
  const [coversList, setCoversList] = useState<any[]>([]);
  const [activityFilter, setActivityFilter] = useState<'all' | 'resume' | 'cover_letter' | 'favourite'>('all');

  const displayName = user?.displayName || user?.email?.split('@')[0] || 'Candidate';
  const firstName = displayName.split(/\s+/)[0] || 'Candidate';
  const greeting = getGreeting();

  // Load all authentic MariaDB data
  const loadData = useCallback(async () => {
    setStatsLoading(true);
    setJobsLoading(true);

    // 1. Fetch User Stats (owner-scoped)
    try {
      const statsRes = await get<{ stats: UserStats }>('/user-stats');
      if (statsRes?.stats) {
        setStats(statsRes.stats);
        setStatsError(null);
      }
    } catch (err) {
      setStatsError(normalizeError(err).message);
    } finally {
      setStatsLoading(false);
    }

    // 2. Fetch Saved Resumes (for top ATS score, 30-day trend delta, and activity stream)
    try {
      const resumesRes = await get<{ resumes: any[] }>('/resumes');
      const list = resumesRes?.resumes || [];
      setResumes(list);

      // Compute 30-day creation delta
      const now = Date.now();
      const windowMs = 30 * 24 * 60 * 60 * 1000;
      let recent = 0;
      for (const r of list) {
        const rawDate = r.updated_at || r.updatedAt || r.created_at || r.createdAt;
        if (!rawDate) continue;
        const ms = new Date(rawDate).getTime();
        if (Number.isFinite(ms) && now - ms >= 0 && now - ms <= windowMs) {
          recent += 1;
        }
      }
      setRecentResumesDelta(recent);

    } catch (err) {
      // Resumes drive the ATS readiness figure: a failed read must be visible,
      // never rendered as "not scored".
      setResumes([]);
      setSecondaryError(`Your resumes couldn’t be loaded: ${normalizeError(err).message}`);
    }

    // 3. Fetch Top Jobs from MariaDB
    try {
      const jobsRes = await get<{ jobs: JobListing[] }>('/jobs-data');
      if (jobsRes?.jobs && Array.isArray(jobsRes.jobs)) {
        setJobs(jobsRes.jobs.slice(0, 4));
        setJobsError(null);
      } else {
        setJobs([]);
        setJobsError('The job board returned an unexpected response.');
      }
    } catch (err) {
      setJobs([]);
      setJobsError(normalizeError(err).message || 'Open jobs could not be loaded.');
    } finally {
      setJobsLoading(false);
    }

    // 4. Fetch User Favourites (for bookmark toggling & activity stream)
    try {
      const favRes = await get<{ favourites: any[] }>('/favourites');
      if (favRes?.favourites && Array.isArray(favRes.favourites)) {
        setFavouritesList(favRes.favourites);
        const favIds = new Set<string>();
        favRes.favourites.forEach((item) => {
          const id = item.itemId || item.item_id || item.id;
          if (id) favIds.add(String(id));
        });
        setFavourites(favIds);
      }
    } catch (err) {
      setFavouritesList([]);
      setFavourites(new Set());
      setSecondaryError(`Saved items couldn’t be loaded: ${normalizeError(err).message}`);
    }

    // 5. Fetch Cover Letters (for activity stream)
    try {
      const coversRes = await get<{ covers: any[] }>('/covers');
      if (coversRes?.covers && Array.isArray(coversRes.covers)) {
        setCoversList(coversRes.covers);
      }
    } catch (err) {
      setCoversList([]);
      setSecondaryError((previous) => previous ?? `Cover letters couldn’t be loaded: ${normalizeError(err).message}`);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    let cancelled = false;
    get<{ user?: { membership?: unknown } }>('/users-data/profile')
      .then((response) => {
        const value = response?.user?.membership;
        if (!cancelled) setMembership(typeof value === 'string' && value.trim() ? value.trim() : null);
      })
      .catch(() => {
        if (!cancelled) setMembership(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ATS scores computed from the stored resume rows with the deterministic checker
  // (the same scorer and thresholds as the Resumes page). Unscorable resumes are skipped.
  const atsSummary = useMemo(() => {
    const scores = resumes.map((resume) => resumeQualityScore(resume)).filter((score): score is number => score !== null);
    const metrics = computeResumeMetrics(resumes, (resume) => resumeQualityScore(resume));
    return { average: metrics.averageScore, best: scores.length ? Math.max(...scores) : null };
  }, [resumes]);

  // Toggle Job Bookmark Favorite
  const handleToggleFavourite = async (jobId: string, job: JobListing) => {
    const isFav = favourites.has(jobId);
    try {
      if (isFav) {
        await del(`/favourites/${encodeURIComponent(jobId)}`);
        setFavourites((prev) => {
          const next = new Set(prev);
          next.delete(jobId);
          return next;
        });
      } else {
        // Only what the listing says: a missing company or location is left out, never invented.
        const company = job.company_name || job.company || '';
        await post('/favourites', {
          itemId: jobId,
          itemType: 'job',
          data: {
            title: job.title,
            ...(company ? { company } : {}),
            ...(job.location ? { location: job.location } : {}),
          },
        });
        setFavourites((prev) => new Set(prev).add(jobId));
      }
      // Refresh favourites list for activity stream
      const refreshedFavs = await get<{ favourites: any[] }>('/favourites');
      if (refreshedFavs?.favourites) setFavouritesList(refreshedFavs.favourites);
      setSecondaryError(null);
    } catch (err) {
      // The bookmark did not change: say so instead of leaving the UI out of step.
      setSecondaryError(
        `${isFav ? 'The job wasn’t removed from your saved items' : 'The job wasn’t saved'}: ${normalizeError(err).message}`,
      );
    }
  };

  // Find absolute latest activity timestamp across all genuine candidate records
  const latestActivityTimestamp = useMemo(() => {
    const dates: number[] = [];
    resumes.forEach((r) => {
      const d = r.updated_at || r.updatedAt || r.created_at || r.createdAt;
      if (d) {
        const ms = new Date(d).getTime();
        if (Number.isFinite(ms)) dates.push(ms);
      }
    });
    coversList.forEach((c) => {
      const d = c.updated_at || c.updatedAt || c.created_at || c.createdAt;
      if (d) {
        const ms = new Date(d).getTime();
        if (Number.isFinite(ms)) dates.push(ms);
      }
    });
    favouritesList.forEach((f) => {
      const d = f.created_at || f.createdAt;
      if (d) {
        const ms = new Date(d).getTime();
        if (Number.isFinite(ms)) dates.push(ms);
      }
    });
    if (dates.length === 0) return null;
    return Math.max(...dates);
  }, [resumes, coversList, favouritesList]);

  // Formatted Recent Activity KPI Metric (mirrors old overview's "Recent Activity: Today" card)
  const recentActivityLabel = useMemo(() => {
    if (!latestActivityTimestamp) return 'No activity';
    const now = new Date();
    const actDate = new Date(latestActivityTimestamp);
    const isToday =
      now.getFullYear() === actDate.getFullYear() &&
      now.getMonth() === actDate.getMonth() &&
      now.getDate() === actDate.getDate();
    if (isToday) return 'Today';

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday =
      yesterday.getFullYear() === actDate.getFullYear() &&
      yesterday.getMonth() === actDate.getMonth() &&
      yesterday.getDate() === actDate.getDate();
    if (isYesterday) return 'Yesterday';

    const daysDiff = Math.floor((now.getTime() - actDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysDiff < 7) return `${daysDiff}d ago`;
    return actDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }, [latestActivityTimestamp]);

  const recentActivitySubLabel = useMemo(() => {
    if (!latestActivityTimestamp) return 'No actions recorded';
    const label = postedLabel(new Date(latestActivityTimestamp));
    return label ? `Active ${label.toLowerCase()}` : 'Active recently';
  }, [latestActivityTimestamp]);

  // Primary resume reference
  const primaryResume = useMemo(() => {
    return resumes.length > 0 ? resumes[0] : null;
  }, [resumes]);
  const primaryResumeScore = useMemo(() => (primaryResume ? resumeQualityScore(primaryResume) : null), [primaryResume]);

  // Synthesize Real Career Activity Stream (Newest first, strictly zero job_tracker)
  const recentActivities: CareerActivity[] = useMemo(() => {
    const events: CareerActivity[] = [];

    // Add Resumes
    resumes.forEach((r) => {
      const stamp = r.updated_at || r.updatedAt || r.created_at || r.createdAt;
      events.push({
        id: `resume-${r.id}`,
        type: 'resume',
        title: r.title || r.name || 'Untitled Resume',
        action: 'Resume updated in workspace',
        timestamp: stamp || new Date().toISOString(),
        href: `/build-resume/${r.id}`,
        badge: 'Resume',
        badgeColor: 'bg-brand-50 text-brand-700 border-brand-200 dark:bg-brand-950/40 dark:text-brand-300 dark:border-brand-800',
      });
    });

    // Add Cover Letters
    coversList.forEach((c) => {
      const stamp = c.updated_at || c.updatedAt || c.created_at || c.createdAt;
      events.push({
        id: `cover-${c.id}`,
        type: 'cover_letter',
        title: c.title || c.jobTitle || 'Cover Letter Draft',
        action: 'Cover letter draft saved',
        timestamp: stamp || new Date().toISOString(),
        href: '/dashboard/cover-letters',
        badge: 'Cover Letter',
        badgeColor: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800',
      });
    });

    // Add Favourites / Bookmarks
    favouritesList.forEach((f) => {
      const stamp = f.created_at || f.createdAt;
      // The job's current details when the job board shows it, otherwise what was saved with it (P002 C15).
      const isJob = String(f.itemType || '').toLowerCase() === 'job';
      const savedTitle = f.job?.title || f.document?.title || f.data?.title || (isJob ? 'Saved job' : 'Saved item');
      const company = isJob ? f.job?.company || f.data?.company || '' : '';
      events.push({
        id: `fav-${f.id || f.itemId}`,
        type: 'favourite',
        title: savedTitle,
        action: isJob ? (company ? `Bookmarked a job at ${company}` : 'Bookmarked a job') : 'Saved to your favorites',
        timestamp: stamp || new Date().toISOString(),
        href: '/dashboard/favourites',
        badge: 'Bookmark',
        badgeColor: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
      });
    });

    // Add Profile Activity
    if (stats?.profileComplete) {
      events.push({
        id: 'profile-complete',
        type: 'profile',
        title: 'Master Profile Details',
        action: 'Candidate profile verified and ready',
        timestamp: new Date().toISOString(),
        href: '/dashboard/settings?tab=profile',
        badge: 'Profile',
        badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
      });
    }

    // Sort newest first
    return events
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 8);
  }, [resumes, coversList, favouritesList, stats?.profileComplete]);

  // Filtered Activities
  const filteredActivities = useMemo(() => {
    if (activityFilter === 'all') return recentActivities;
    return recentActivities.filter((act) => act.type === activityFilter);
  }, [recentActivities, activityFilter]);

  // Derived AI Insight
  const copilotInsight = useMemo(() => {
    if (statsLoading) return 'Reading candidate profile…';
    if (!stats || stats.resumes === 0) {
      return 'Create your first resume to unlock ATS scoring and template matching.';
    }
    if (atsSummary.best !== null && atsSummary.best >= ATS_READY_THRESHOLD) {
      return `Your best resume scores ${atsSummary.best}% on the ATS readiness check.`;
    }
    if (atsSummary.best !== null) {
      return `Your best resume scores ${atsSummary.best}%. Aim for ${ATS_READY_THRESHOLD}% or higher.`;
    }
    return 'Run an ATS check to see how your resumes score.';
  }, [stats, statsLoading, atsSummary.best]);

  // Next Steps Checklist (strictly excluding job_tracker)
  const nextSteps = useMemo(() => {
    const hasProfile = Boolean(stats?.profileComplete);
    const hasResumes = Boolean(stats && stats.resumes > 0);
    const hasAtsScored = atsSummary.best !== null && atsSummary.best > 0;

    return [
      {
        id: 'profile',
        title: 'Complete Profile Details',
        description: 'Ensure contact details, headline, and location are up to date',
        href: '/dashboard/settings?tab=profile',
        completed: hasProfile,
      },
      {
        id: 'resume',
        title: 'Build or Polish Master CV',
        description: 'Choose from 100 resume templates',
        href: '/build-resume',
        completed: hasResumes,
      },
      {
        id: 'ats',
        title: 'Analyze Resume ATS Compatibility',
        description: 'Check structure, content and job-description keywords',
        href: '/dashboard/ats-score',
        completed: hasAtsScored,
      },
      {
        id: 'interview',
        title: 'Practice with AI Interview Coach',
        description: 'Sharpen your answers with real-time feedback simulator',
        href: '/dashboard/interviews',
        completed: false,
      },
    ];
  }, [stats, atsSummary.best]);

  const completedStepsCount = nextSteps.filter((s) => s.completed).length;
  const progressPercent = Math.round((completedStepsCount / nextSteps.length) * 100);

  return (
    <div className="p-4 lg:p-6 xl:p-8 space-y-6">
      {statsError && (
        <div role="alert" className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
          <span>Failed to load candidate metrics: {statsError}</span>
          <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => void loadData()}>
            Retry
          </Button>
        </div>
      )}

      {secondaryError && (
        <div role="alert" className="flex flex-col gap-2 rounded-xl border border-warning-200 bg-warning-50 p-3 text-xs text-warning-800 sm:flex-row sm:items-center sm:justify-between">
          <span className="min-w-0 flex-1">{secondaryError}</span>
          <Button size="sm" variant="outline" className="h-7 shrink-0 self-start text-[11px] sm:self-auto" onClick={() => void loadData()}>
            <RefreshCw aria-hidden="true" className="size-3" /> Retry
          </Button>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 1. COPILOT HERO HUD (Executive Header with Tier Badge & Actions) */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <section
        data-testid="cuba-copilot-hud"
        aria-label="AI Copilot Hero"
        className="relative overflow-hidden rounded-2xl border border-edge bg-surface/90 backdrop-blur-md p-5 shadow-xs transition-shadow duration-200 hover:shadow-md"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          {/* Left Greeting, Plan Badge & Derived AI Insight */}
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="flex size-7 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <Sparkles className="size-4" />
              </span>
              <h1 className="text-xl font-bold tracking-tight text-ink sm:text-2xl" data-testid="cuba-welcome-greeting">
                {greeting}, {firstName}! <span aria-hidden="true">👋</span>
              </h1>

              {/* Membership plan badge: the real plan from the profile, hidden if unknown */}
              {membership && (
                <Link
                  to="/pricing"
                  className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50/80 px-2.5 py-0.5 text-[11px] font-bold text-brand-700 hover:bg-brand-100 transition-colors"
                >
                  <Shield className="size-3 text-brand-600" aria-hidden="true" />
                  <span>{membership} plan</span>
                </Link>
              )}
            </div>

            <p className="text-xs sm:text-sm font-medium text-ink-secondary flex items-center gap-1.5">
              <span className="inline-block size-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-ink font-semibold">{copilotInsight}</span>
            </p>
          </div>

          {/* Right Quote & Quick Action Buttons */}
          <div className="flex flex-col items-start lg:items-end gap-2.5 shrink-0">
            <p className="hidden text-xs italic text-ink-muted lg:block">
              &ldquo;Better resumes. Brighter opportunities.&rdquo;
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                className="gap-1.5 bg-accent text-white font-semibold shadow-xs hover:bg-accent/90"
                asChild
              >
                <Link to="/build-resume">
                  <Plus className="size-3.5" />
                  Create Resume
                </Link>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs font-medium"
                asChild
              >
                <Link to="/dashboard/ats-score">
                  <Target className="size-3.5 text-accent" />
                  Check ATS Score
                </Link>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs font-medium"
                asChild
              >
                <Link to="/dashboard/interviews">
                  <GraduationCap className="size-3.5 text-info-600" />
                  Practice Interview
                </Link>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs font-medium"
                asChild
              >
                <Link to="/dashboard/jobs">
                  <Briefcase className="size-3.5 text-warning-600" />
                  Explore Jobs
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 2. HIGH-DENSITY METRIC CARD ROW (6 Balanced KPI Cards, ZERO job_tracker) */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 2. HIGH-DENSITY METRIC CARD ROW (6 Balanced KPI Cards, ZERO job_tracker) */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <section
        data-testid="cuba-metric-cards"
        aria-label="Overview metrics"
        className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-6"
      >
        {/* Metric 1: Total Resumes */}
        <Link to="/dashboard/resumes" className="no-underline group" data-testid="cuba-metric-resumes">
          <Card className="h-full transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-400 hover:shadow-md">
            <CardContent className="p-4 flex flex-col justify-between h-full">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <span className="block text-[11px] font-bold text-ink-muted uppercase tracking-wider">
                    Total Resumes
                  </span>
                  <span className="block text-2xl font-extrabold text-ink leading-tight mt-1">
                    {statsLoading ? <Skeleton className="h-7 w-12 my-0.5" /> : stats?.resumes ?? 0}
                  </span>
                </div>
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-950/40 dark:text-brand-400 shadow-2xs">
                  <FileText className="size-5" />
                </div>
              </div>

              <div className="mt-3 pt-2 border-t border-edge/60 flex items-center justify-between text-xs text-ink-muted">
                {recentResumesDelta > 0 ? (
                  <span className="inline-flex items-center gap-1 font-semibold text-success-700">
                    <TrendingUp className="size-3.5 shrink-0" />
                    +{recentResumesDelta} this month
                  </span>
                ) : (
                  <span>In your workspace</span>
                )}
                <ChevronRight className="size-3.5 text-ink-subtle opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
              </div>
            </CardContent>
          </Card>
        </Link>

        {/* Metric 2: Recent Activity (MIRRORS OLD OVERVIEW RECENT ACTIVITY KPI) */}
        <a href="#recent-activity" className="no-underline group" data-testid="cuba-metric-recent-activity">
          <Card className="h-full transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-400 hover:shadow-md">
            <CardContent className="p-4 flex flex-col justify-between h-full">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <span className="block text-[11px] font-bold text-ink-muted uppercase tracking-wider">
                    Recent Activity
                  </span>
                  <span className="block text-2xl font-extrabold text-ink leading-tight mt-1">
                    {statsLoading ? <Skeleton className="h-7 w-14 my-0.5" /> : recentActivityLabel}
                  </span>
                </div>
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 shadow-2xs">
                  <Clock className="size-5" />
                </div>
              </div>

              <div className="mt-3 pt-2 border-t border-edge/60 flex items-center justify-between text-xs text-ink-muted">
                <span className="inline-flex items-center gap-1.5 font-medium text-ink-secondary">
                  <span className="inline-block size-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                  {recentActivitySubLabel}
                </span>
                <ChevronRight className="size-3.5 text-ink-subtle opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
              </div>
            </CardContent>
          </Card>
        </a>

        {/* Metric 3: Avg. ATS Score with Live SVG Donut */}
        <Link to="/dashboard/ats-score" className="no-underline group" data-testid="cuba-metric-ats">
          <Card className="h-full transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-400 hover:shadow-md">
            <CardContent className="p-4 flex flex-col justify-between h-full">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <span className="block text-[11px] font-bold text-ink-muted uppercase tracking-wider">
                    Avg. ATS Score
                  </span>
                  <span className="block text-2xl font-extrabold text-ink leading-tight mt-1">
                    {atsSummary.average !== null ? `${atsSummary.average}%` : 'Not scored'}
                  </span>
                </div>
                <div className="shrink-0">
                  <AtsDonut score={atsSummary.average} />
                </div>
              </div>

              <div className="mt-3 pt-2 border-t border-edge/60 flex items-center justify-between text-xs text-ink-muted">
                {atsSummary.average !== null && atsSummary.average >= ATS_READY_THRESHOLD ? (
                  <span className="font-semibold text-success-700">Ready to apply</span>
                ) : (
                  <span>Target {ATS_READY_THRESHOLD}%+</span>
                )}
                <ChevronRight className="size-3.5 text-ink-subtle opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
              </div>
            </CardContent>
          </Card>
        </Link>

        {/* Metric 4: Cover Letters */}
        <Link to="/dashboard/cover-letters" className="no-underline group" data-testid="cuba-metric-covers">
          <Card className="h-full transition-all duration-200 hover:-translate-y-0.5 hover:border-purple-300 hover:shadow-md">
            <CardContent className="p-4 flex flex-col justify-between h-full">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <span className="block text-[11px] font-bold text-ink-muted uppercase tracking-wider">
                    Cover Letters
                  </span>
                  <span className="block text-2xl font-extrabold text-ink leading-tight mt-1">
                    {statsLoading ? <Skeleton className="h-7 w-10 my-0.5" /> : stats?.coverLetters ?? 0}
                  </span>
                </div>
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400 shadow-2xs">
                  <FileText className="size-5" />
                </div>
              </div>

              <div className="mt-3 pt-2 border-t border-edge/60 flex items-center justify-between text-xs text-ink-muted">
                <span>Targeted drafts</span>
                <ChevronRight className="size-3.5 text-ink-subtle opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
              </div>
            </CardContent>
          </Card>
        </Link>

        {/* Metric 5: Portfolios & Web CV */}
        <Link to="/dashboard/portfolio" className="no-underline group" data-testid="cuba-metric-portfolios">
          <Card className="h-full transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-md">
            <CardContent className="p-4 flex flex-col justify-between h-full">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <span className="block text-[11px] font-bold text-ink-muted uppercase tracking-wider">
                    Portfolios & Web CV
                  </span>
                  <span className="block text-2xl font-extrabold text-ink leading-tight mt-1">
                    {statsLoading ? <Skeleton className="h-7 w-10 my-0.5" /> : stats?.portfolios ?? 0}
                  </span>
                </div>
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400 shadow-2xs">
                  <Award className="size-5" />
                </div>
              </div>

              <div className="mt-3 pt-2 border-t border-edge/60 flex items-center justify-between text-xs text-ink-muted">
                <span>Live showcase links</span>
                <ChevronRight className="size-3.5 text-ink-subtle opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
              </div>
            </CardContent>
          </Card>
        </Link>

        {/* Metric 6: Profile Readiness */}
        <Link to="/dashboard/settings?tab=profile" className="no-underline group" data-testid="cuba-metric-profile">
          <Card className="h-full transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md">
            <CardContent className="p-4 flex flex-col justify-between h-full">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <span className="block text-[11px] font-bold text-ink-muted uppercase tracking-wider">
                    Profile Status
                  </span>
                  <span className="block text-2xl font-extrabold text-ink leading-tight mt-1">
                    {statsLoading ? (
                      <Skeleton className="h-7 w-10 my-0.5" />
                    ) : stats?.profileComplete ? (
                      'Complete'
                    ) : (
                      'Incomplete'
                    )}
                  </span>
                </div>
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 shadow-2xs">
                  <CheckCircle2 className="size-5" />
                </div>
              </div>

              <div className="mt-3 pt-2 border-t border-edge/60 flex items-center justify-between text-xs text-ink-muted">
                {stats?.profileComplete ? (
                  <span className="font-semibold text-success-700">Fully complete</span>
                ) : (
                  <span className="text-warning-700 font-medium">Action needed</span>
                )}
                <ChevronRight className="size-3.5 text-ink-subtle opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
              </div>
            </CardContent>
          </Card>
        </Link>
      </section>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 3. AI CAREER BRIEFING SURFACE */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <section
        data-testid="cuba-ai-briefing"
        aria-label="AI Career Briefing"
        className="rounded-2xl border border-edge bg-gradient-to-r from-brand-50/60 via-surface to-purple-50/60 p-5 shadow-xs"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2.5 py-0.5 text-[11px] font-bold text-accent">
                <Sparkles className="size-3" />
                Live Career Intelligence
              </span>
              <span className="text-xs text-ink-muted">Updated from your latest CV data</span>
            </div>
            <h3 className="text-sm sm:text-base font-bold text-ink">
              {stats?.resumes ? 'Your CV is grounded in real candidate context' : 'Kickstart your executive portfolio with AI'}
            </h3>
            <p className="text-xs text-ink-muted max-w-2xl leading-relaxed">
              {stats?.resumes
                ? 'Your resume profile is active. Use the deterministic ATS analyzer to test against job listings and get instant bullet-point optimization.'
                : 'Build your primary resume using verified industry templates. Instant export to high-fidelity PDF and DOCX available.'}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs font-semibold"
              onClick={() => void loadData()}
            >
              <RefreshCw className="size-3.5" />
              Refresh
            </Button>
            <Button
              size="sm"
              className="gap-1.5 text-xs font-semibold bg-accent text-white"
              onClick={() => navigate(stats?.resumes ? '/dashboard/ats-score' : '/build-resume')}
            >
              {stats?.resumes ? 'Analyze Compatibility' : 'Create First Resume'}
              <ArrowRight className="size-3.5" />
            </Button>
          </div>
        </div>
      </section>

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* 4. MAIN TWO-COLUMN INTELLIGENCE GRID */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left Column (7 cols): Recent Career Activity + Top Job Matches */}
        <div className="lg:col-span-7 space-y-6 min-w-0">
          {/* ───────────────────────────────────────────────────────────── */}
          {/* RECENT CAREER ACTIVITY (Prominently Placed at the Top, ZERO job_tracker) */}
          {/* ───────────────────────────────────────────────────────────── */}
          <section
            id="recent-activity"
            data-testid="cuba-recent-activity"
            aria-label="Recent Career Activity"
            className="flex flex-col rounded-2xl border border-edge bg-surface p-5 shadow-xs scroll-mt-20 min-w-0"
          >
            <div className="mb-4 flex flex-col gap-3">
              <div>
                <h2 className="text-base font-bold text-ink flex items-center gap-2">
                  <Clock className="size-4 text-emerald-600 shrink-0" />
                  Recent Career Activity
                </h2>
                <p className="text-xs text-ink-muted mt-0.5">Real-time timeline of your master resumes, cover letters, and bookmarks</p>
              </div>

              {/* Activity Filter Tabs (Single-line whitespace-nowrap protection) */}
              <div className="flex items-center gap-1 p-1 rounded-xl bg-canvas border border-edge self-start overflow-x-auto max-w-full">
                {(
                  [
                    { id: 'all', label: 'All', count: recentActivities.length },
                    { id: 'resume', label: 'Resumes', count: resumes.length },
                    { id: 'cover_letter', label: 'Covers', count: coversList.length },
                    { id: 'favourite', label: 'Saved', count: favouritesList.length },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActivityFilter(tab.id)}
                    className={cn(
                      'inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all whitespace-nowrap shrink-0 leading-none select-none',
                      activityFilter === tab.id
                        ? 'bg-surface text-ink shadow-xs border border-edge font-extrabold'
                        : 'text-ink-muted hover:text-ink hover:bg-surface/50'
                    )}
                  >
                    <span>{tab.label}</span>
                    {tab.count > 0 && (
                      <span
                        className={cn(
                          'rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums leading-none',
                          activityFilter === tab.id
                            ? 'bg-ink/10 text-ink dark:bg-white/10 dark:text-white'
                            : 'bg-surface/80 text-ink-muted border border-edge/40'
                        )}
                      >
                        {tab.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Primary Active Resume Spotlight (Redesigned 2-tier layout: full-width title/metadata + dedicated action bar) */}
            {primaryResume && activityFilter !== 'cover_letter' && activityFilter !== 'favourite' && (
              <div className="mb-4 rounded-xl border border-brand-200/80 bg-gradient-to-r from-brand-50/60 via-surface to-brand-50/30 dark:from-brand-950/20 dark:via-surface dark:to-brand-950/10 p-4 space-y-3">
                {/* Top: Icon + Title + Badge + Metadata (Full Width, No Horizontal Contention) */}
                <div className="flex items-start gap-3 min-w-0">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white shadow-xs mt-0.5">
                    <FileText className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-ink truncate">
                        {primaryResume.title || 'Untitled Master Resume'}
                      </span>
                      <span className="rounded-full bg-brand-100 dark:bg-brand-900/60 text-brand-700 dark:text-brand-300 px-2 py-0.5 text-[10px] font-bold shrink-0">
                        Active Draft
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-ink-muted">
                      <span className="whitespace-nowrap">Template: <strong className="text-ink font-semibold">{getTemplateMeta(primaryResume.template || 'Cv1').name}</strong></span>
                      <span className="text-ink-subtle">•</span>
                      <span className="whitespace-nowrap">{postedLabel(primaryResume.updated_at || primaryResume.updatedAt)}</span>
                      {primaryResumeScore !== null && (
                        <>
                          <span className="text-ink-subtle">•</span>
                          <span className="inline-flex items-center gap-1 font-semibold text-success-700 whitespace-nowrap">
                            <Target className="size-3" aria-hidden="true" />
                            {primaryResumeScore}% ATS
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Bottom Action Bar: 2 equal columns on mobile, right-aligned on tablet/desktop */}
                <div className="grid grid-cols-2 sm:flex sm:items-center sm:justify-end gap-2 pt-2 border-t border-brand-100 dark:border-brand-900/40">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs font-semibold gap-1.5 w-full sm:w-auto justify-center"
                    asChild
                  >
                    <Link to={`/dashboard/ats-score?resume=${encodeURIComponent(String(primaryResume.id ?? ''))}`}>
                      <Target className="size-3 text-brand-600" aria-hidden="true" />
                      ATS Score
                    </Link>
                  </Button>
                  <Button
                    size="sm"
                    className="h-8 text-xs font-semibold gap-1.5 bg-brand-600 text-white hover:bg-brand-700 shadow-2xs w-full sm:w-auto justify-center"
                    asChild
                  >
                    <Link to={`/build-resume/${primaryResume.id}`}>
                      <PenLine className="size-3" />
                      Edit in Builder
                    </Link>
                  </Button>
                </div>
              </div>
            )}

            {filteredActivities.length === 0 ? (
              <div className="py-10 text-center text-xs text-ink-muted">
                <Clock className="mx-auto mb-2 size-8 text-ink-subtle" />
                <p className="font-semibold text-ink">No activities found for this filter</p>
                <p className="mt-1">Create or update documents to see real-time updates here.</p>
                <Button variant="outline" size="sm" className="mt-3 text-xs" asChild>
                  <Link to="/build-resume">Create First Resume</Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {filteredActivities.map((act) => (
                  <Link
                    key={act.id}
                    to={act.href}
                    className="group flex items-center justify-between gap-3 rounded-xl border border-edge bg-canvas/40 p-3 no-underline transition-all hover:bg-surface hover:border-brand-300 hover:shadow-xs"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface border border-edge shadow-xs">
                        {act.type === 'resume' ? (
                          <FileText className="size-4 text-brand-600" />
                        ) : act.type === 'cover_letter' ? (
                          <PenLine className="size-4 text-purple-600" />
                        ) : act.type === 'favourite' ? (
                          <Bookmark className="size-4 text-amber-500 fill-amber-500/20" />
                        ) : (
                          <UserCheck className="size-4 text-emerald-600" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-xs font-bold text-ink group-hover:text-brand-600 transition-colors">
                            {act.title}
                          </span>
                          <span className={cn('rounded-full border px-2 py-0.5 text-[10px] font-bold shrink-0', act.badgeColor)}>
                            {act.badge}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-ink-muted truncate">{act.action}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] font-semibold text-ink-muted">
                        {postedLabel(act.timestamp)}
                      </span>
                      <ChevronRight className="size-3.5 text-ink-subtle opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Top Job Matches for You follows right below Recent Activity */}
          <section
            data-testid="cuba-top-job-matches"
            aria-label="Top Job Matches"
            className="flex flex-col rounded-2xl border border-edge bg-surface p-5 shadow-xs"
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-ink flex items-center gap-2">
                  <Briefcase className="size-4 text-accent" />
                  Recently posted jobs
                </h2>
                <p className="text-xs text-ink-muted">
                  Newest listings from the public job board — not personalised to your profile
                </p>
              </div>
              <Link
                to="/dashboard/jobs"
                className="text-xs font-semibold text-accent hover:underline flex items-center gap-1"
              >
                View All
                <ChevronRight className="size-3.5" />
              </Link>
            </div>

            {jobsLoading ? (
              <div className="space-y-3 py-2">
                <Skeleton className="h-16 w-full rounded-xl" />
                <Skeleton className="h-16 w-full rounded-xl" />
                <Skeleton className="h-16 w-full rounded-xl" />
              </div>
            ) : jobsError ? (
              <div role="alert" className="flex flex-col gap-2 rounded-xl border border-error-200 bg-error-50 p-3 text-xs text-error-800 sm:flex-row sm:items-center">
                <AlertCircle aria-hidden="true" className="size-4 shrink-0" />
                <span className="min-w-0 flex-1">Open jobs couldn’t be loaded: {jobsError}</span>
                <Button size="sm" variant="outline" className="h-7 shrink-0 self-start text-[11px] sm:self-auto" onClick={() => void loadData()}>
                  <RefreshCw aria-hidden="true" className="size-3" /> Retry
                </Button>
              </div>
            ) : jobs.length === 0 ? (
              <div className="py-12 text-center text-xs text-ink-muted">
                <Briefcase className="mx-auto mb-2 size-8 text-ink-subtle" />
                <p className="font-semibold text-ink">No active jobs found right now</p>
                <p className="mt-1">Check back soon or explore open positions directly on the job portal.</p>
                <Button variant="outline" size="sm" className="mt-3 text-xs" asChild>
                  <Link to="/dashboard/jobs">Browse Job Portal</Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {jobs.map((job) => {
                  const isFav = favourites.has(job.id);
                  // Only what the listing carries: a missing company is shown as missing.
                  const companyName = job.company_name || job.company || 'Company not listed';
                  const postTime = postedLabel(job.created_at || job.createdAt);

                  return (
                    <div
                      key={job.id}
                      className="group flex items-center justify-between gap-3 rounded-xl border border-edge bg-canvas/60 p-3.5 transition-all hover:border-accent/40 hover:bg-surface hover:shadow-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Link
                            to={`/dashboard/jobs?id=${job.id}`}
                            className="truncate text-sm font-bold text-ink hover:text-accent transition-colors"
                          >
                            {job.title}
                          </Link>
                          {job.work_mode && (
                            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-ink-muted">
                              {job.work_mode}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-ink-muted">
                          <span className="font-medium text-ink-secondary">{companyName}</span>
                          {job.location && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="size-3 text-ink-subtle" />
                              {job.location}
                            </span>
                          )}
                          {postTime && <span>{postTime}</span>}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => void handleToggleFavourite(job.id, job)}
                          className={cn(
                            'rounded-lg p-2 transition-colors hover:bg-neutral-100',
                            isFav ? 'text-amber-500' : 'text-ink-subtle hover:text-ink'
                          )}
                          // A toggle named after its job, so each one is distinct for assistive technology.
                          aria-label={`Save ${job.title}`}
                          aria-pressed={isFav}
                          title={isFav ? 'Saved' : 'Save job'}
                        >
                          <Bookmark className={cn('size-4', isFav && 'fill-current')} />
                        </button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs font-semibold gap-1 text-accent hover:text-accent hover:bg-accent/10"
                          onClick={() => setApplyJob(job)}
                          aria-label={`Apply to ${job.title}${companyName ? ` at ${companyName}` : ''}`}
                        >
                          Apply
                          <ExternalLink aria-hidden="true" className="size-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* Right Column (5 cols): Your Next Steps & Career Studio Tools */}
        <div className="lg:col-span-5 space-y-6 min-w-0">
          {/* Your Next Steps Onboarding Progress */}
          <section
            data-testid="cuba-next-steps"
            aria-label="Your Next Steps"
            className="flex flex-col rounded-2xl border border-edge bg-surface p-5 shadow-xs"
          >
            <div className="mb-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-ink flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-emerald-500" />
                  Your Next Steps
                </h2>
                <span className="text-xs font-bold text-accent">
                  {completedStepsCount} of {nextSteps.length} complete
                </span>
              </div>
              <p className="text-xs text-ink-muted mt-0.5">Recommended milestones for candidate readiness</p>

              {/* Visual Setup Progress Bar */}
              <div
                className="mt-3 h-2 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progressPercent}
                aria-label="Candidate setup progress"
              >
                <div
                  className="h-full rounded-full bg-accent transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            <div className="space-y-2 flex-1">
              {nextSteps.map((step) => {
                const done = step.completed;

                return (
                  <Link
                    key={step.id}
                    to={step.href}
                    className={cn(
                      'group flex items-start gap-3 rounded-xl border p-3 no-underline transition-all',
                      done
                        ? 'border-edge bg-canvas/40'
                        : 'border-edge bg-surface hover:border-accent/40 hover:shadow-xs'
                    )}
                  >
                    <div className="mt-0.5 shrink-0">
                      {done ? (
                        <span className="flex size-5 items-center justify-center rounded-full bg-emerald-500 text-white">
                          <CheckCircle2 className="size-3.5 fill-current" />
                        </span>
                      ) : (
                        <div className="size-5 rounded-full border-2 border-neutral-300 dark:border-neutral-700 group-hover:border-accent" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className={cn('text-xs font-bold', done ? 'text-ink-muted line-through' : 'text-ink group-hover:text-accent transition-colors')}>
                        {step.title}
                      </div>
                      <div className="text-[11px] text-ink-muted line-clamp-1 mt-0.5">{step.description}</div>
                    </div>

                    <ChevronRight className="mt-0.5 size-4 text-ink-subtle opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                  </Link>
                );
              })}
            </div>
          </section>

          {/* Quick Career Studio Tools Palette */}
          <section
            aria-label="Career Studio Shortcuts"
            className="rounded-2xl border border-edge bg-surface p-5 shadow-xs"
          >
            <h3 className="text-sm font-bold text-ink mb-1 flex items-center gap-2">
              <Zap className="size-4 text-amber-500" />
              Career Studio Tools
            </h3>
            <p className="text-xs text-ink-muted mb-3.5">Specialized accelerators to boost your applications</p>

            <div className="grid grid-cols-2 gap-2.5">
              <Link
                to="/dashboard/ats-score"
                className="flex flex-col gap-1 rounded-xl border border-edge bg-canvas/50 p-3 no-underline transition-all hover:bg-surface hover:border-accent/40 hover:shadow-xs"
              >
                <Target className="size-4 text-brand-600" />
                <span className="text-xs font-bold text-ink">ATS Scanner</span>
                <span className="text-[10px] text-ink-muted">Keyword gap audit</span>
              </Link>

              <Link
                to="/dashboard/interviews"
                className="flex flex-col gap-1 rounded-xl border border-edge bg-canvas/50 p-3 no-underline transition-all hover:bg-surface hover:border-accent/40 hover:shadow-xs"
              >
                <GraduationCap className="size-4 text-info-600" />
                <span className="text-xs font-bold text-ink">Mock Interview</span>
                <span className="text-[10px] text-ink-muted">Real-time simulator</span>
              </Link>

              <Link
                to="/dashboard/cover-letters"
                className="flex flex-col gap-1 rounded-xl border border-edge bg-canvas/50 p-3 no-underline transition-all hover:bg-surface hover:border-accent/40 hover:shadow-xs"
              >
                <PenLine className="size-4 text-purple-600" />
                <span className="text-xs font-bold text-ink">Cover Studio</span>
                <span className="text-[10px] text-ink-muted">Role-tailored letters</span>
              </Link>

              <Link
                to="/dashboard/portfolio"
                className="flex flex-col gap-1 rounded-xl border border-edge bg-canvas/50 p-3 no-underline transition-all hover:bg-surface hover:border-accent/40 hover:shadow-xs"
              >
                <Award className="size-4 text-amber-600" />
                <span className="text-xs font-bold text-ink">Public Web CV</span>
                <span className="text-[10px] text-ink-muted">Shareable web link</span>
              </Link>
            </div>
          </section>
        </div>
      </div>

      {/* The same accessible application dialog the public job board uses. */}
      <JobApplicationModal
        isOpen={Boolean(applyJob)}
        onClose={() => setApplyJob(null)}
        job={applyJob ? {
          id: applyJob.id,
          title: applyJob.title,
          company: applyJob.company_name || applyJob.company || 'Company not listed',
          location: applyJob.location ?? '',
        } : null}
        onApplied={() => { setApplyJob(null); void loadData(); }}
      />
    </div>
  );
}

/* ─── Helper Functions ─── */

function AtsDonut({ score }: { score: number | null }) {
  const hasScore = typeof score === 'number' && Number.isFinite(score);
  const clamped = hasScore ? Math.max(0, Math.min(100, score)) : 0;
  const offset = DONUT_CIRCUMFERENCE * (1 - clamped / 100);
  const ringColor = !hasScore
    ? 'text-neutral-300 dark:text-neutral-700'
    : clamped >= 75
    ? 'text-emerald-500'
    : clamped >= 50
    ? 'text-amber-500'
    : 'text-rose-500';

  return (
    <div className="relative inline-flex size-11 shrink-0 items-center justify-center" aria-hidden="true">
      <svg width={DONUT_SIZE} height={DONUT_SIZE} viewBox={`0 0 ${DONUT_SIZE} ${DONUT_SIZE}`} className="-rotate-90">
        <circle
          cx={DONUT_SIZE / 2}
          cy={DONUT_SIZE / 2}
          r={DONUT_RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth={DONUT_STROKE}
          className="text-neutral-200 dark:text-neutral-800"
        />
        {hasScore && (
          <circle
            cx={DONUT_SIZE / 2}
            cy={DONUT_SIZE / 2}
            r={DONUT_RADIUS}
            fill="none"
            stroke="currentColor"
            strokeWidth={DONUT_STROKE}
            strokeLinecap="round"
            strokeDasharray={DONUT_CIRCUMFERENCE}
            strokeDashoffset={offset}
            className={cn('transition-all duration-700 motion-reduce:transition-none', ringColor)}
          />
        )}
      </svg>
      <span className="absolute text-[11px] font-bold text-ink">
        {hasScore ? `${clamped}%` : '—'}
      </span>
    </div>
  );
}

function postedLabel(value?: string | Date | null): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return '';
  const elapsed = Date.now() - date.getTime();
  if (elapsed < 0) return '';
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 60) return minutes <= 1 ? 'Just posted' : `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return days === 1 ? '1 day ago' : `${days} days ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
