/**
 * Applied Jobs (/dashboard/applied-jobs), candidate dashboard.
 *
 * The applications the candidate has sent through the job portal, each with the
 * job it was made for and where it stands. The employer moves the status; the
 * candidate can withdraw an application and add its job to the Job Tracker.
 * Data: /api/jobs-data/applications (lib/applications.ts).
 *
 * Status filter, search and sort live in the URL (?status=&q=&sort=), so they
 * survive a reload and Back/Forward. Employers change applications, so the list
 * is read again on every visit and on Refresh.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Loader2, RefreshCw, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NoticeRegions, type Notice } from '@/components/settings/notice-regions';
import { ApplicationEntry, detailsButtonId, trackControlId, withdrawButtonId } from '@/components/applications/application-entry';
import { WithdrawDialog } from '@/components/applications/withdraw-dialog';
import { cn } from '@/lib/utils';
import {
  APPLICATION_STATUSES, APPLICATIONS_QUERY_KEY, findTrackedJob, listApplications, trackApplication,
  type Application, type WithdrawOutcome,
} from '@/lib/applications';
import {
  applicationName, matchesFilter, matchesQuery, parseSort, parseStatusFilter, SORT_OPTIONS, sortApplications,
  STATUS_FILTERS, statusSummary, type ApplicationSort, type StatusFilter,
} from '@/lib/application-display';
import { listTrackedJobs, stageLabel, TRACKER_QUERY_KEY, TrackerError, type TrackedJob } from '@/lib/job-tracker';
import { listResumeChoices } from '@/lib/portfolio';

const HEADING_ID = 'applications-heading';
const RESUME_CHOICES_KEY = ['dashboard', 'resumeChoices'] as const;

const countLabel = (count: number) => (count === 1 ? '1 application' : `${count} applications`);

export function AppliedJobsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const status = parseStatusFilter(searchParams.get('status'));
  const sort = parseSort(searchParams.get('sort'));
  const query = searchParams.get('q') ?? '';
  const filtering = status !== 'all' || query.trim() !== '';

  const queryClient = useQueryClient();
  // Employers change applications, so the list is read on every visit.
  const list = useQuery({ queryKey: APPLICATIONS_QUERY_KEY, queryFn: listApplications, staleTime: 0 });
  const applications = useMemo(() => list.data ?? [], [list.data]);
  const loaded = list.data !== undefined;
  const visible = useMemo(
    () => sortApplications(applications.filter((item) => matchesFilter(item, status) && matchesQuery(item, query)), sort),
    [applications, status, query, sort],
  );
  const summary = statusSummary(applications);

  // Which jobs are already tracked. If this can't be read every job offers "Add"; adding checks again.
  const tracker = useQuery({ queryKey: TRACKER_QUERY_KEY, queryFn: listTrackedJobs, enabled: applications.length > 0 });
  const trackedJobs: TrackedJob[] = tracker.data ?? [];

  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  // Resume names are only needed once a candidate opens the details of an application that has one.
  const needsResumes = applications.some((item) => item.resumeId && expanded.has(item.id));
  const resumes = useQuery({ queryKey: RESUME_CHOICES_KEY, queryFn: ({ signal }) => listResumeChoices(signal), enabled: needsResumes });

  const [notice, setNotice] = useState<Notice | null>(null);
  const [trackingIds, setTrackingIds] = useState<ReadonlySet<string>>(new Set());
  const trackingRef = useRef(new Set<string>());
  const [withdrawal, setWithdrawal] = useState<{ session: number; open: boolean; application: Application } | null>(null);
  const session = useRef(0);
  const returnFocus = useRef<string>(HEADING_ID);
  // Ids to focus after the DOM updates, first existing wins (the heading otherwise).
  const pendingFocus = useRef<string[] | null>(null);
  const focusPending = () => {
    if (!pendingFocus.current) return;
    const target = pendingFocus.current.map((id) => document.getElementById(id)).find(Boolean) ?? document.getElementById(HEADING_ID);
    pendingFocus.current = null;
    target?.focus();
  };
  useEffect(focusPending);

  const setParam = (key: 'status' | 'sort' | 'q', value: string, fallback: string) => {
    // Start from the address bar, not this render's copy: two quick changes in a
    // row (before React re-renders) must not drop the first one.
    const next = new URLSearchParams(window.location.search);
    if (!value || value === fallback) next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
  };
  const clearFilters = () => {
    const next = new URLSearchParams(window.location.search);
    next.delete('status');
    next.delete('q');
    setSearchParams(next, { replace: true });
  };

  const refresh = async () => {
    if (list.isFetching) return;
    const result = await list.refetch();
    // A failure keeps the list shown earlier and is reported by the alert below.
    if (!result.isError) setNotice({ tone: 'info', text: 'Your applications are up to date.' });
  };

  const toggleDetails = (application: Application) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(application.id)) next.delete(application.id);
      else next.add(application.id);
      return next;
    });
  };

  const track = async (application: Application) => {
    if (trackingRef.current.has(application.id)) return;
    trackingRef.current.add(application.id);
    setTrackingIds(new Set(trackingRef.current));
    const name = applicationName(application);
    try {
      const result = await trackApplication(application);
      queryClient.setQueryData<TrackedJob[]>(TRACKER_QUERY_KEY, (current) => {
        const jobs = current ?? [];
        return jobs.some((job) => job.id === result.job.id) ? jobs : [result.job, ...jobs];
      });
      void queryClient.invalidateQueries({ queryKey: TRACKER_QUERY_KEY });
      // The button becomes a link to the tracker: keep focus on that control.
      pendingFocus.current = [trackControlId(application)];
      setNotice(result.outcome === 'added'
        ? { tone: 'success', text: `Added ${name} to your Job Tracker under ${stageLabel(result.job.status)}.` }
        : { tone: 'info', text: `${name} is already in your Job Tracker (${stageLabel(result.job.status)}), so nothing was added.` });
    } catch (error) {
      const reason = error instanceof TrackerError ? error.message : 'The Job Tracker could not be reached. Check your connection and try again.';
      setNotice({ tone: 'error', text: `${name} wasn’t added to your Job Tracker. ${reason}` });
    } finally {
      trackingRef.current.delete(application.id);
      setTrackingIds(new Set(trackingRef.current));
    }
  };

  const openWithdrawal = (application: Application) => {
    returnFocus.current = withdrawButtonId(application);
    session.current += 1;
    setWithdrawal({ session: session.current, open: true, application });
  };
  const closeWithdrawal = () => setWithdrawal((current) => (current ? { ...current, open: false } : current));
  const restoreFocus = (event: Event) => {
    event.preventDefault();
    pendingFocus.current = [returnFocus.current];
    requestAnimationFrame(focusPending);
  };
  const onWithdrawn = (application: Application, outcome: WithdrawOutcome) => {
    const index = visible.findIndex((item) => item.id === application.id);
    const neighbour = visible[index + 1] ?? visible[index - 1];
    returnFocus.current = neighbour && neighbour.id !== application.id ? detailsButtonId(neighbour) : HEADING_ID;
    closeWithdrawal();
    queryClient.setQueryData<Application[]>(APPLICATIONS_QUERY_KEY, (current) => (current ?? []).filter((item) => item.id !== application.id));
    setExpanded((current) => {
      const next = new Set(current);
      next.delete(application.id);
      return next;
    });
    setNotice(outcome === 'withdrawn'
      ? { tone: 'success', text: `Withdrew your application for ${applicationName(application)}.` }
      : { tone: 'info', text: `Your application for ${applicationName(application)} had already been withdrawn or removed.` });
  };

  const resumeTextFor = (application: Application): string => {
    if (!application.resumeId) return 'None attached';
    if (resumes.isError) return 'Attached (its name couldn’t be loaded)';
    if (!resumes.data) return 'Loading…';
    return resumes.data.find((item) => item.id === application.resumeId)?.title ?? 'A resume you have since deleted';
  };

  return (
    <div className="relative p-4 lg:p-6 xl:p-8">
      <header className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 id={HEADING_ID} tabIndex={-1} className="text-2xl font-bold text-ink focus:outline-none">Applied Jobs</h1>
          <p className="mt-1 text-sm text-ink-muted">
            The applications you’ve sent through the job portal, and where each one stands. Employers update the status.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 self-start">
          {loaded && (
            <Button variant="outline" onClick={() => void refresh()} aria-busy={list.isFetching || undefined} aria-disabled={list.isFetching || undefined}>
              <RefreshCw className={cn(list.isFetching && 'animate-spin')} aria-hidden="true" /> Refresh
            </Button>
          )}
          <Button asChild>
            <Link to="/dashboard/jobs"><Search aria-hidden="true" /> Browse jobs</Link>
          </Button>
        </div>
      </header>

      {loaded && applications.length > 0 && (
        <ul aria-label="Applications by status" className="mb-5 flex flex-wrap gap-2">
          {APPLICATION_STATUSES.map((item) => (
            <li key={item.id} className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-ink-secondary">
              <span className="font-semibold text-ink">{summary.counts[item.id]}</span> {item.label}
            </li>
          ))}
          {summary.other > 0 && (
            <li className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-ink-secondary">
              <span className="font-semibold text-ink">{summary.other}</span> Other
            </li>
          )}
        </ul>
      )}

      {loaded && applications.length > 0 && (
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
          <form role="search" className="relative min-w-0 md:max-w-md md:flex-1" onSubmit={(event) => event.preventDefault()}>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
            <Input
              type="search"
              value={query}
              onChange={(event) => setParam('q', event.target.value, '')}
              aria-label="Search applications"
              placeholder="Job, company or location"
              className={cn('pl-9', query ? 'pr-9' : 'pr-3')}
            />
            {query && (
              <button
                type="button"
                onClick={() => setParam('q', '', '')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-brand-500"
                aria-label="Clear search"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            )}
          </form>
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <div className="flex min-w-0 max-w-full items-center gap-2">
              <label htmlFor="applications-status" className="shrink-0 whitespace-nowrap text-sm text-ink-secondary">Status</label>
              <select
                id="applications-status"
                value={status}
                onChange={(event) => setParam('status', event.target.value as StatusFilter, 'all')}
                className="h-9 min-w-0 rounded-lg border border-border bg-surface px-2.5 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-500"
              >
                {STATUS_FILTERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
            <div className="flex min-w-0 max-w-full items-center gap-2">
              <label htmlFor="applications-sort" className="shrink-0 whitespace-nowrap text-sm text-ink-secondary">Sort by</label>
              <select
                id="applications-sort"
                value={sort}
                onChange={(event) => setParam('sort', event.target.value as ApplicationSort, 'newest')}
                className="h-9 min-w-0 rounded-lg border border-border bg-surface px-2.5 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-500"
              >
                {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}

      <NoticeRegions notice={notice} className="mb-4" />

      <section aria-labelledby="applications-results-heading" aria-busy={list.isPending || undefined}>
        <h2 id="applications-results-heading" className="sr-only">Your applications</h2>

        {list.isPending && (
          <p className="flex items-center justify-center gap-2 py-16 text-sm text-ink-muted">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Loading your applications…
          </p>
        )}

        {list.isError && (
          <div role="alert" className="mb-4 flex flex-col items-start gap-3 rounded-xl border border-error-100 bg-error-50 p-4 text-sm text-error-700 sm:flex-row sm:items-center">
            <AlertTriangle className="size-5 shrink-0" aria-hidden="true" />
            <span className="flex-1">
              {loaded
                ? 'The latest version of your applications couldn’t be loaded, so the list below may be out of date.'
                : 'Your applications couldn’t be loaded. Check your connection and try again.'}
            </span>
            <Button variant="outline" size="sm" onClick={() => void list.refetch()} aria-busy={list.isFetching || undefined}>
              <RefreshCw aria-hidden="true" /> Try again
            </Button>
          </div>
        )}

        {loaded && applications.length === 0 && (
          <div className="flex flex-col items-center rounded-2xl border border-dashed border-border bg-surface px-6 py-14 text-center">
            <h3 className="text-lg font-semibold text-ink">No applications yet</h3>
            <p className="mt-1 max-w-sm text-sm text-ink-muted">When you apply for a job on the job portal, it appears here with its status.</p>
            <Button asChild variant="outline" className="mt-5">
              <Link to="/dashboard/jobs">Find jobs to apply for</Link>
            </Button>
          </div>
        )}

        {loaded && applications.length > 0 && (
          <p className="mb-3 text-xs text-ink-muted" role="status">
            {filtering ? `Showing ${visible.length} of ${countLabel(applications.length)}` : countLabel(applications.length)}
          </p>
        )}

        {loaded && applications.length > 0 && visible.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-surface px-6 py-10 text-center">
            <p className="text-sm text-ink">No applications match your filters.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={clearFilters}>Clear filters</Button>
          </div>
        )}

        {loaded && visible.length > 0 && (
          <ul role="list" aria-label="Applications" className="space-y-3">
            {visible.map((application) => (
              <li key={application.id}>
                <ApplicationEntry
                  application={application}
                  expanded={expanded.has(application.id)}
                  onToggleDetails={toggleDetails}
                  tracked={findTrackedJob(trackedJobs, application)}
                  tracking={trackingIds.has(application.id)}
                  onTrack={(item) => void track(item)}
                  onWithdraw={openWithdrawal}
                  resumeText={resumeTextFor(application)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {withdrawal && (
        <WithdrawDialog
          key={withdrawal.session}
          application={withdrawal.application}
          open={withdrawal.open}
          onOpenChange={(open) => { if (!open) closeWithdrawal(); }}
          onCloseAutoFocus={restoreFocus}
          onWithdrawn={onWithdrawn}
        />
      )}
    </div>
  );
}
