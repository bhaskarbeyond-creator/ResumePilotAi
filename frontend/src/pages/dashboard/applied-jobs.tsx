/** Applied Jobs: real employer applications, normalized lifecycle, URL state and tracker integration. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, RefreshCw, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NoticeRegions, type Notice } from '@/components/settings/notice-regions';
import { ApplicationEntry, detailsButtonId, trackControlId, withdrawButtonId } from '@/components/applications/application-entry';
import { WithdrawDialog } from '@/components/applications/withdraw-dialog';
import { cn } from '@/lib/utils';
import { APPLICATIONS_QUERY_KEY, findTrackedJob, LIFECYCLE_LABELS, listApplications, trackApplication, type Application, type WithdrawOutcome } from '@/lib/applications';
import { applicationName, matchesFilter, matchesQuery, parseApplicationURL, SORT_OPTIONS, sortApplications, STATUS_FILTERS, statusSummary } from '@/lib/application-display';
import { listTrackedJobs, stageLabel, TRACKER_QUERY_KEY, TrackerError, type TrackedJob } from '@/lib/job-tracker';
import { listResumeChoices } from '@/lib/portfolio';

const HEADING_ID = 'applications-heading';
const RESUME_CHOICES_KEY = ['dashboard', 'resumeChoices'] as const;
const countLabel = (count: number) => `${count} ${count === 1 ? 'application' : 'applications'}`;
export function LoadingSkeleton({ label }: { label: string }) {
  return <div role="status" aria-label={label} data-testid="loading-skeleton" className="space-y-3 py-2">
    <span className="sr-only">{label}</span>
    {[0, 1, 2].map((item) => <div key={item} aria-hidden="true" className="animate-pulse rounded-xl border border-border bg-surface p-5 motion-reduce:animate-none"><div className="h-4 w-2/3 rounded bg-neutral-200" /><div className="mt-3 h-3 w-1/3 rounded bg-neutral-200" /><div className="mt-5 h-8 w-48 rounded bg-neutral-100" /></div>)}
  </div>;
}
export function AppliedJobsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { status, sort } = parseApplicationURL(searchParams);
  const urlQuery = searchParams.get('q') ?? '';
  const [draftQuery, setDraftQuery] = useState(urlQuery);
  const lastWritten = useRef(urlQuery);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryClient = useQueryClient();
  const list = useQuery({ queryKey: APPLICATIONS_QUERY_KEY, queryFn: ({ signal }) => listApplications(signal), staleTime: 0, refetchOnMount: 'always' });
  const applications = useMemo(() => list.data ?? [], [list.data]);
  const loaded = list.data !== undefined;
  const visible = useMemo(() => sortApplications(applications.filter((item) => matchesFilter(item, status) && matchesQuery(item, draftQuery)), sort), [applications, status, draftQuery, sort]);
  const summary = statusSummary(applications);
  const tracker = useQuery({ queryKey: TRACKER_QUERY_KEY, queryFn: ({ signal }) => listTrackedJobs(signal), enabled: applications.length > 0 });
  const trackedJobs = tracker.data ?? [];
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const needsResumes = applications.some((item) => item.resumeId && expanded.has(item.id));
  const resumes = useQuery({ queryKey: RESUME_CHOICES_KEY, queryFn: ({ signal }) => listResumeChoices(signal), enabled: needsResumes });
  const [notice, setNotice] = useState<Notice | null>(null);
  const [trackingIds, setTrackingIds] = useState<ReadonlySet<string>>(new Set());
  const trackingRef = useRef(new Set<string>());
  const mounted = useRef(true);
  const [withdrawal, setWithdrawal] = useState<{ session: number; open: boolean; application: Application } | null>(null);
  const session = useRef(0);
  const returnFocus = useRef(HEADING_ID);
  const pendingFocus = useRef<string[] | null>(null);
  const focusPending = useCallback(() => {
    if (!pendingFocus.current) return;
    const target = pendingFocus.current.map((id) => document.getElementById(id)).find(Boolean) ?? document.getElementById(HEADING_ID);
    pendingFocus.current = null; target?.focus();
  }, []);
  useEffect(focusPending);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; if (searchTimer.current) clearTimeout(searchTimer.current); }; }, []);
  const setParam = (key: 'status' | 'sort' | 'q', value: string, fallback: string, replace = false) => {
    const next = new URLSearchParams(window.location.search);
    if (!value || value === fallback) next.delete(key); else next.set(key, value);
    if (next.toString() !== new URLSearchParams(window.location.search).toString()) setSearchParams(next, { replace });
  };
  // Navigation, including Back/Forward, cancels an obsolete debounce. A URL
  // update written by this input does not erase newer characters in the input.
  useEffect(() => {
    if (urlQuery !== lastWritten.current) {
      if (searchTimer.current) clearTimeout(searchTimer.current);
      lastWritten.current = urlQuery; setDraftQuery(urlQuery);
    }
  }, [urlQuery]);
  const commitQuery = (value: string, replace = false) => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const trimmed = value.trim(); lastWritten.current = trimmed;
    setParam('q', trimmed, '', replace);
  };
  const changeQuery = (value: string) => {
    setDraftQuery(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => commitQuery(value), 250);
  };
  const clearFilters = () => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const next = new URLSearchParams(window.location.search); next.delete('status'); next.delete('q');
    lastWritten.current = ''; setDraftQuery(''); setSearchParams(next);
  };
  const refresh = async () => {
    if (list.isFetching) return;
    const result = await list.refetch();
    if (mounted.current && !result.isError) setNotice({ tone: 'info', text: 'Your applications are up to date.' });
  };
  const track = async (application: Application) => {
    if (trackingRef.current.has(application.id)) return;
    trackingRef.current.add(application.id); setTrackingIds(new Set(trackingRef.current));
    const name = applicationName(application);
    try {
      const result = await trackApplication(application);
      await queryClient.cancelQueries({ queryKey: TRACKER_QUERY_KEY });
      queryClient.setQueryData<TrackedJob[]>(TRACKER_QUERY_KEY, (current) => {
        const jobs = current ?? [];
        return jobs.some((job) => job.id === result.job.id) ? jobs : [result.job, ...jobs];
      });
      void queryClient.invalidateQueries({ queryKey: TRACKER_QUERY_KEY });
      if (!mounted.current) return;
      pendingFocus.current = [trackControlId(application)];
      setNotice(result.outcome === 'added' ? { tone: 'success', text: `Added ${name} to your Job Tracker under ${stageLabel(result.job.status)}.` }
        : { tone: 'info', text: `${name} is already tracked (${stageLabel(result.job.status)}). No duplicate was added.` });
    } catch (error) {
      if (mounted.current) setNotice({ tone: 'error', text: `${name} was not confirmed as tracked. ${error instanceof TrackerError || error instanceof Error ? error.message : 'Check your connection and retry.'}` });
    } finally {
      trackingRef.current.delete(application.id);
      if (mounted.current) setTrackingIds(new Set(trackingRef.current));
    }
  };
  const openWithdrawal = (application: Application) => {
    returnFocus.current = withdrawButtonId(application); session.current += 1;
    setWithdrawal({ session: session.current, open: true, application });
  };
  const closeWithdrawal = () => setWithdrawal((current) => current ? { ...current, open: false } : current);
  const restoreFocus = (event: Event) => { event.preventDefault(); pendingFocus.current = [returnFocus.current]; requestAnimationFrame(focusPending); };
  const onWithdrawn = (application: Application, outcome: WithdrawOutcome) => {
    const index = visible.findIndex((item) => item.id === application.id);
    const neighbour = visible[index + 1] ?? visible[index - 1];
    returnFocus.current = neighbour && neighbour.id !== application.id ? detailsButtonId(neighbour) : HEADING_ID;
    closeWithdrawal();
    queryClient.setQueryData<Application[]>(APPLICATIONS_QUERY_KEY, (current) => (current ?? []).filter((item) => item.id !== application.id));
    setExpanded((current) => { const next = new Set(current); next.delete(application.id); return next; });
    setNotice(outcome === 'withdrawn' ? { tone: 'success', text: `Withdrew your application for ${applicationName(application)}.` }
      : { tone: 'info', text: `Your application for ${applicationName(application)} was already withdrawn or removed.` });
  };
  const resumeTextFor = (application: Application): string => {
    if (!application.resumeId) return 'None attached';
    if (resumes.isError) return 'Attached (its name could not be loaded)';
    if (!resumes.data) return 'Loading…';
    return resumes.data.find((item) => item.id === application.resumeId)?.title ?? 'A resume you have since deleted';
  };
  return <div className="relative min-w-0 p-4 lg:p-6 xl:p-8">
    <header className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0"><h1 id={HEADING_ID} tabIndex={-1} className="text-2xl font-bold text-ink focus:outline-none">Applied Jobs</h1><p className="mt-1 text-sm text-ink-muted">Your submitted applications and employer decisions. Your personal Job Tracker is separate.</p></div>
      <div className="flex shrink-0 flex-wrap gap-2 self-start">
        {loaded && <Button variant="outline" onClick={() => void refresh()} disabled={list.isFetching} aria-busy={list.isFetching || undefined}><RefreshCw className={cn(list.isFetching && 'animate-spin')} aria-hidden="true" /> Refresh</Button>}
        <Button asChild><Link to="/dashboard/jobs"><Search aria-hidden="true" /> Browse jobs</Link></Button>
      </div>
    </header>
    {loaded && applications.length > 0 && <>
      <ul aria-label="Applications by lifecycle" className="mb-5 flex flex-wrap gap-2">{Object.entries(LIFECYCLE_LABELS).filter(([key]) => key !== 'UNKNOWN' || summary.counts.UNKNOWN > 0).map(([key, label]) => <li key={key} className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-ink-secondary"><span className="font-semibold text-ink">{summary.counts[key as keyof typeof summary.counts]}</span> {label}</li>)}</ul>
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <form role="search" className="relative min-w-0 lg:max-w-md lg:flex-1" onSubmit={(event) => { event.preventDefault(); commitQuery(draftQuery); }}>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
          <Input type="search" value={draftQuery} onChange={(event) => changeQuery(event.target.value)} onBlur={() => { if (draftQuery.trim() !== urlQuery) commitQuery(draftQuery, true); }} aria-label="Search applications" placeholder="Job, company or location" className={cn('pl-9', draftQuery ? 'pr-9' : 'pr-3')} />
          {draftQuery && <button type="button" onClick={() => { setDraftQuery(''); commitQuery(''); }} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-brand-500" aria-label="Clear search"><X className="size-4" aria-hidden="true" /></button>}
        </form>
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <div className="flex items-center gap-2"><label htmlFor="applications-status" className="shrink-0 text-sm text-ink-secondary">Status</label><select id="applications-status" value={status} onChange={(event) => setParam('status', event.target.value, 'all')} className="h-10 min-w-0 max-w-44 rounded-lg border border-border bg-surface px-2.5 text-sm text-ink focus-visible:outline-2 focus-visible:outline-brand-500">{STATUS_FILTERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
          <div className="flex items-center gap-2"><label htmlFor="applications-sort" className="shrink-0 text-sm text-ink-secondary">Sort by</label><select id="applications-sort" value={sort} onChange={(event) => setParam('sort', event.target.value, 'date')} className="h-10 min-w-0 max-w-48 rounded-lg border border-border bg-surface px-2.5 text-sm text-ink focus-visible:outline-2 focus-visible:outline-brand-500">{SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
        </div>
      </div>
    </>}
    <NoticeRegions notice={notice} className="mb-4" />
    {tracker.isError && <p role="status" className="mb-4 rounded-lg border border-warning-100 bg-warning-50 p-3 text-sm text-warning-700">Tracked badges could not be loaded. Track Application checks the server again before creating anything.</p>}
    <section aria-labelledby="applications-results-heading" aria-busy={list.isPending || undefined}>
      <h2 id="applications-results-heading" className="sr-only">Your applications</h2>
      {list.isPending && <LoadingSkeleton label="Loading your applications" />}
      {list.isError && <div role="alert" className="mb-4 flex flex-col items-start gap-3 rounded-xl border border-error-100 bg-error-50 p-4 text-sm text-error-700 sm:flex-row sm:items-center"><AlertTriangle className="size-5 shrink-0" aria-hidden="true" /><span className="flex-1">{loaded ? 'The latest applications could not be loaded. The previous list is preserved below.' : 'Your applications could not be loaded. Check your connection and try again.'}</span><Button variant="outline" size="sm" onClick={() => void list.refetch()} disabled={list.isFetching}><RefreshCw aria-hidden="true" /> Try again</Button></div>}
      {loaded && applications.length === 0 && <div className="flex flex-col items-center rounded-2xl border border-dashed border-border bg-surface px-6 py-14 text-center"><h3 className="text-lg font-semibold text-ink">No applications yet</h3><p className="mt-1 max-w-sm text-sm text-ink-muted">Applications submitted through the job portal appear here.</p><Button asChild variant="outline" className="mt-5"><Link to="/dashboard/jobs">Find jobs to apply for</Link></Button></div>}
      {loaded && applications.length > 0 && <p className="mb-3 text-xs text-ink-muted" role="status">{status !== 'all' || draftQuery.trim() ? `Showing ${visible.length} of ${countLabel(applications.length)}` : countLabel(applications.length)}</p>}
      {loaded && applications.length > 0 && visible.length === 0 && <div className="rounded-2xl border border-dashed border-border bg-surface px-6 py-10 text-center"><p className="text-sm text-ink">No applications match your current search and status criteria.</p><Button variant="outline" size="sm" className="mt-3" onClick={clearFilters}>Clear filters</Button></div>}
      {loaded && visible.length > 0 && <ul role="list" aria-label="Applications" className="space-y-3">{visible.map((application) => <li key={application.id}><ApplicationEntry application={application} expanded={expanded.has(application.id)} onToggleDetails={(item) => setExpanded((current) => { const next = new Set(current); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; })} tracked={findTrackedJob(application, trackedJobs)} tracking={trackingIds.has(application.id)} onTrack={(item) => void track(item)} onWithdraw={openWithdrawal} resumeText={resumeTextFor(application)} /></li>)}</ul>}
    </section>
    {withdrawal && <WithdrawDialog key={withdrawal.session} application={withdrawal.application} open={withdrawal.open} onOpenChange={(open) => { if (!open) closeWithdrawal(); }} onCloseAutoFocus={restoreFocus} onWithdrawn={onWithdrawn} />}
  </div>;
}
