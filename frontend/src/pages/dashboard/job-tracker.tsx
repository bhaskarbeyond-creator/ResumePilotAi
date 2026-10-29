/** Five-stage Job Tracker: real persistence, accessible movement, revision-safe optimistic UI. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, LayoutGrid, List, Plus, RefreshCw, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NoticeRegions, type Notice } from '@/components/settings/notice-regions';
import { TrackerDeleteDialog } from '@/components/job-tracker/tracker-delete-dialog';
import { actionsTriggerId, advanceButtonId, dragHandleId, stageSelectId, TrackerEntry } from '@/components/job-tracker/tracker-entry';
import { TrackerFormDialog, type TrackerFormRequest } from '@/components/job-tracker/tracker-form-dialog';
import { LoadingSkeleton } from '@/pages/dashboard/applied-jobs';
import { cn } from '@/lib/utils';
import { listTrackedJobs, reconcileTrackedJob, rollbackTrackedJob, moveTrackedJobStage, stageLabel, TRACKER_QUERY_KEY, TRACKER_STAGES, type TrackedJob, type TrackerStatus } from '@/lib/job-tracker';
import { CALENDAR_MIME_TYPE, interviewCalendarFile, matchesQuery, parseTrackerURL, pipelineSummary, reconcileTrackerSnapshot, SORT_OPTIONS, sortJobs, type TrackerView } from '@/lib/job-tracker-display';

const HEADING_ID = 'tracker-heading';
const ADD_BUTTON_ID = 'tracker-add';
const describe = (job: TrackedJob) => `${job.title} at ${job.company}`;
export function JobTrackerPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { view, sort } = parseTrackerURL(searchParams);
  const urlQuery = searchParams.get('q') ?? '';
  const [draftQuery, setDraftQuery] = useState(urlQuery);
  const lastWritten = useRef(urlQuery);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryClient = useQueryClient();
  const pendingMoves = useRef(new Set<string>());
  const mutationEpoch = useRef(0);
  const tracker = useQuery({
    queryKey: TRACKER_QUERY_KEY,
    queryFn: async ({ signal }) => {
      const epoch = mutationEpoch.current;
      const authoritative = await listTrackedJobs(signal);
      const current = queryClient.getQueryData<TrackedJob[]>(TRACKER_QUERY_KEY) ?? [];
      // A GET begun before a local mutation must not undo that mutation.
      if (epoch !== mutationEpoch.current) return current;
      return reconcileTrackerSnapshot(authoritative, current, pendingMoves.current);
    },
    refetchOnMount: 'always', staleTime: 0,
  });
  const jobs = useMemo(() => tracker.data ?? [], [tracker.data]);
  const visible = useMemo(() => sortJobs(jobs.filter((job) => matchesQuery(job, draftQuery)), sort), [jobs, draftQuery, sort]);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [movingIds, setMovingIds] = useState<ReadonlySet<string>>(new Set());
  const movingRef = useRef(new Set<string>());
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropStage, setDropStage] = useState<TrackerStatus | null>(null);
  const [form, setForm] = useState<{ session: number; open: boolean; request: TrackerFormRequest } | null>(null);
  const [removal, setRemoval] = useState<{ session: number; open: boolean; job: TrackedJob } | null>(null);
  const session = useRef(0);
  const returnFocus = useRef(ADD_BUTTON_ID);
  const pendingFocus = useRef<string[] | null>(null);
  const mounted = useRef(true);
  const focusPending = useCallback(() => {
    if (!pendingFocus.current) return;
    const target = pendingFocus.current.map((id) => document.getElementById(id)).find((element) => element && !element.hasAttribute('disabled')) ?? document.getElementById(HEADING_ID);
    pendingFocus.current = null; target?.focus();
  }, []);
  useEffect(focusPending);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; if (searchTimer.current) clearTimeout(searchTimer.current); }; }, []);
  const setJobs = (update: (current: TrackedJob[]) => TrackedJob[]) => {
    mutationEpoch.current += 1;
    queryClient.setQueryData<TrackedJob[]>(TRACKER_QUERY_KEY, (current) => update(current ?? []));
  };
  const reload = async () => {
    await queryClient.cancelQueries({ queryKey: TRACKER_QUERY_KEY });
    return queryClient.fetchQuery({ queryKey: TRACKER_QUERY_KEY, queryFn: async ({ signal }) => {
      const authoritative = await listTrackedJobs(signal);
      return reconcileTrackerSnapshot(authoritative, queryClient.getQueryData<TrackedJob[]>(TRACKER_QUERY_KEY) ?? [], pendingMoves.current);
    }, staleTime: 0 });
  };
  const refreshInBackground = () => { void queryClient.invalidateQueries({ queryKey: TRACKER_QUERY_KEY }); };
  const setParam = (key: 'view' | 'sort' | 'q', value: string, fallback: string, replace = false) => {
    const next = new URLSearchParams(window.location.search);
    if (key === 'view') next.set(key, value);
    else if (!value || value === fallback) next.delete(key); else next.set(key, value);
    if (next.toString() !== new URLSearchParams(window.location.search).toString()) setSearchParams(next, { replace });
  };
  useEffect(() => {
    if (urlQuery !== lastWritten.current) {
      if (searchTimer.current) clearTimeout(searchTimer.current);
      lastWritten.current = urlQuery; setDraftQuery(urlQuery);
    }
  }, [urlQuery]);
  const commitQuery = (value: string, replace = false) => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const trimmed = value.trim(); lastWritten.current = trimmed; setParam('q', trimmed, '', replace);
  };
  const changeQuery = (value: string) => {
    setDraftQuery(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => commitQuery(value), 250);
  };
  const restoreFocus = (event: Event) => { event.preventDefault(); pendingFocus.current = [returnFocus.current]; requestAnimationFrame(focusPending); };
  const openForm = (request: TrackerFormRequest, returnTo: string) => {
    returnFocus.current = returnTo; session.current += 1; setForm({ session: session.current, open: true, request });
  };
  const closeForm = () => setForm((current) => current ? { ...current, open: false } : current);
  const openRemoval = (job: TrackedJob) => {
    returnFocus.current = actionsTriggerId(job); session.current += 1; setRemoval({ session: session.current, open: true, job });
  };
  const moveJob = async (job: TrackedJob, status: TrackerStatus, via: 'stage' | 'advance' | 'drag' = 'stage') => {
    if (status === job.status || movingRef.current.has(job.id)) return;
    movingRef.current.add(job.id); pendingMoves.current.add(job.id);
    setMovingIds(new Set(movingRef.current)); setNotice(null);
    const focusAfterMove = via === 'advance' ? [advanceButtonId(job), stageSelectId(job)] : via === 'drag' ? [dragHandleId(job), stageSelectId(job)] : [stageSelectId(job)];
    // Do not restore focus while the optimistic render disables the control;
    // wait until the request settles and the control is enabled again.
    try {
      const result = await moveTrackedJobStage(job, status, {
        read: () => queryClient.getQueryData<TrackedJob[]>(TRACKER_QUERY_KEY)?.find((item) => item.id === job.id),
        write: (saved) => setJobs((current) => reconcileTrackedJob(current, saved)),
        rollback: (plan) => setJobs((current) => rollbackTrackedJob(current, plan)),
        remove: (id) => setJobs((current) => current.filter((item) => item.id !== id)),
        refresh: async () => { pendingMoves.current.delete(job.id); return reload(); },
      });
      if (!mounted.current) return;
      if (result.kind === 'moved') {
        pendingFocus.current = focusAfterMove;
        setNotice({ tone: 'success', text: `Moved ${describe(result.previous)} to ${stageLabel(result.job.status)}.` });
        refreshInBackground();
      } else if (result.kind === 'missing') {
        pendingFocus.current = [HEADING_ID];
        setNotice({ tone: 'error', text: `${describe(job)} is no longer in your tracker. It may have been removed elsewhere.` });
      } else if (result.kind === 'failed') {
        pendingFocus.current = focusAfterMove;
        const suffix = result.error.kind === 'conflict'
          ? result.refreshed ? ' Its latest version is shown. Review it before trying again.' : ' The latest version could not be loaded. Refresh before trying again.'
          : ` It stays in ${stageLabel(job.status)}. Check your connection and retry.`;
        setNotice({ tone: 'error', text: `${describe(job)} could not be moved.${suffix}` });
      }
    } finally {
      pendingMoves.current.delete(job.id); movingRef.current.delete(job.id);
      if (mounted.current) setMovingIds(new Set(movingRef.current));
    }
  };
  const exportInterview = (job: TrackedJob) => {
    let url: string | null = null;
    try {
      const file = interviewCalendarFile(job);
      if (!file) { setNotice({ tone: 'error', text: 'Save a valid interview date and time before downloading a calendar invitation.' }); return; }
      url = URL.createObjectURL(new Blob([file.content], { type: CALENDAR_MIME_TYPE }));
      const link = document.createElement('a'); link.href = url; link.download = file.filename;
      document.body.appendChild(link); link.click(); link.remove();
      setNotice({ tone: 'success', text: `Calendar download initiated: ${file.filename}. Open it to add the interview.` });
    } catch { setNotice({ tone: 'error', text: 'The calendar download could not be started. Your interview details are unchanged.' }); }
    finally { if (url) { const objectURL = url; setTimeout(() => URL.revokeObjectURL(objectURL), 1000); } }
  };
  const summary = pipelineSummary(jobs);
  const loaded = tracker.data !== undefined;
  const entryProps = {
    onMove: (job: TrackedJob, status: TrackerStatus, via?: 'stage' | 'advance') => void moveJob(job, status, via),
    onEdit: (job: TrackedJob, focus?: 'interview') => openForm({ mode: 'edit', job, focus }, actionsTriggerId(job)),
    onDelete: openRemoval, onExportInterview: exportInterview,
  };
  return <div className="relative min-w-0 p-4 lg:p-6 xl:p-8">
    <header className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0"><h1 id={HEADING_ID} tabIndex={-1} className="text-2xl font-bold text-ink focus:outline-none">Job Tracker</h1><p className="mt-1 text-sm text-ink-muted">Your private pipeline, from Saved to Offer. Tracker changes never change an employer’s application decision.{loaded && <> {jobs.length} {jobs.length === 1 ? 'job' : 'jobs'} tracked.</>}</p></div>
      <div className="flex shrink-0 flex-wrap gap-2 self-start">
        {loaded && <Button variant="outline" disabled={tracker.isFetching} onClick={() => void reload().then(() => { if (mounted.current) setNotice({ tone: 'info', text: 'Your tracker is up to date.' }); }).catch(() => { if (mounted.current) setNotice({ tone: 'error', text: 'The latest tracker could not be loaded. The previous list is preserved.' }); })}><RefreshCw aria-hidden="true" /> Refresh</Button>}
        <Button id={ADD_BUTTON_ID} onClick={() => openForm({ mode: 'create', job: null }, ADD_BUTTON_ID)}><Plus aria-hidden="true" /> Track a job</Button>
      </div>
    </header>
    {loaded && jobs.length > 0 && <>
      <ul aria-label="Jobs by stage" className="mb-5 flex flex-wrap gap-2">{TRACKER_STAGES.map((stage) => <li key={stage.id} className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-ink-secondary"><span className="font-semibold text-ink">{summary.counts[stage.id]}</span> {stage.label}</li>)}{summary.upcomingInterviews > 0 && <li className="rounded-full border border-warning-100 bg-warning-50 px-3 py-1 text-xs font-medium text-warning-700">{summary.upcomingInterviews} upcoming {summary.upcomingInterviews === 1 ? 'interview' : 'interviews'}</li>}</ul>
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <form role="search" className="relative min-w-0 lg:max-w-md lg:flex-1" onSubmit={(event) => { event.preventDefault(); commitQuery(draftQuery); }}>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
          <Input type="search" value={draftQuery} onChange={(event) => changeQuery(event.target.value)} onBlur={() => { if (draftQuery.trim() !== urlQuery) commitQuery(draftQuery, true); }} aria-label="Search tracked jobs" placeholder="Job, company, location, notes" className={cn('pl-9', draftQuery ? 'pr-9' : 'pr-3')} />
          {draftQuery && <button type="button" onClick={() => { setDraftQuery(''); commitQuery(''); }} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-brand-500" aria-label="Clear search"><X className="size-4" aria-hidden="true" /></button>}
        </form>
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <div className="flex items-center gap-2"><label htmlFor="tracker-sort" className="shrink-0 text-sm text-ink-secondary">Sort by</label><select id="tracker-sort" value={sort} onChange={(event) => setParam('sort', event.target.value, 'stage')} className="h-10 min-w-0 max-w-48 rounded-lg border border-border bg-surface px-2.5 text-sm text-ink focus-visible:outline-2 focus-visible:outline-brand-500">{SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
          <div role="group" aria-label="View" className="flex rounded-lg border border-border bg-surface p-0.5">{([['board', 'Board', LayoutGrid], ['list', 'List', List]] as Array<[TrackerView, string, typeof List]>).map(([value, label, Icon]) => <button key={value} type="button" aria-pressed={view === value} onClick={() => setParam('view', value, 'board')} className={cn('inline-flex min-h-9 items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium focus-visible:outline-2 focus-visible:outline-brand-500', view === value ? 'bg-brand-50 text-brand-700' : 'text-ink-muted hover:text-ink')}><Icon className="size-4" aria-hidden="true" />{label}</button>)}</div>
        </div>
      </div>
    </>}
    <NoticeRegions notice={notice} className="mb-4" />
    <section aria-labelledby="tracker-results-heading" aria-busy={tracker.isPending || undefined}>
      <h2 id="tracker-results-heading" className="sr-only">{view === 'list' ? 'All tracked jobs' : 'Tracked jobs by stage'}</h2>
      {tracker.isPending && <LoadingSkeleton label="Loading your tracked jobs" />}
      {tracker.isError && <div role="alert" className="mb-4 flex flex-col items-start gap-3 rounded-xl border border-error-100 bg-error-50 p-4 text-sm text-error-700 sm:flex-row sm:items-center"><AlertTriangle className="size-5 shrink-0" aria-hidden="true" /><span className="flex-1">The latest tracker could not be loaded.{loaded ? ' The previous list is preserved below.' : ' Check your connection and try again.'}</span><Button variant="outline" size="sm" disabled={tracker.isFetching} onClick={() => void tracker.refetch()}><RefreshCw aria-hidden="true" /> Try again</Button></div>}
      {loaded && jobs.length === 0 && <div className="mb-5 flex flex-col items-center rounded-2xl border border-dashed border-border bg-surface px-6 py-10 text-center"><h3 className="text-lg font-semibold text-ink">No tracked jobs yet</h3><p className="mt-1 max-w-sm text-sm text-ink-muted">Save a job, then move it through the funnel as you apply, interview and hear back.</p><Button id="tracker-add-first" className="mt-5" onClick={() => openForm({ mode: 'create', job: null }, 'tracker-add-first')}><Plus aria-hidden="true" /> Track your first job</Button></div>}
      {loaded && jobs.length > 0 && visible.length === 0 && <div className="mb-4 rounded-2xl border border-dashed border-border bg-surface px-6 py-6 text-center"><p className="text-sm text-ink">No tracked jobs match “{draftQuery.trim()}”.</p><Button variant="outline" size="sm" className="mt-3" onClick={() => { setDraftQuery(''); commitQuery(''); }}>Clear search</Button></div>}
      {loaded && view === 'board' && <>
        <p className="mb-3 text-xs text-ink-muted">Drag using the handle, or use each card’s Stage selector and Advance button. On small screens, scroll the board horizontally.</p>
        <div role="region" aria-label="Five-stage Kanban board, horizontally scrollable" tabIndex={0} className="overflow-x-auto rounded-sm pb-3 focus-visible:outline-2 focus-visible:outline-brand-500">
          <div className="grid min-w-[1380px] grid-cols-5 gap-4">
            {TRACKER_STAGES.map((stage) => {
              const items = visible.filter((job) => job.status === stage.id);
              const headingId = `tracker-stage-heading-${stage.id}`;
              return <section key={stage.id} aria-labelledby={headingId} data-stage={stage.id} data-drop-target={stage.id}
                onDragOver={(event) => { if (!dragId) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; if (dropStage !== stage.id) setDropStage(stage.id); }}
                onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropStage((current) => current === stage.id ? null : current); }}
                onDrop={(event) => { event.preventDefault(); const id = event.dataTransfer.getData('application/x-ime365-tracker') || dragId; const job = jobs.find((item) => item.id === id); setDragId(null); setDropStage(null); if (job) void moveJob(job, stage.id, 'drag'); }}
                className={cn('min-w-0 rounded-2xl bg-canvas-soft p-3', dropStage === stage.id && 'outline-2 outline-offset-2 outline-brand-500')}>
                <div className="flex items-baseline justify-between gap-2 px-1"><h2 id={headingId} className="text-sm font-semibold text-ink">{stage.label}<span className="sr-only"> ({items.length} {items.length === 1 ? 'job' : 'jobs'})</span></h2><span aria-hidden="true" data-testid={`count-${stage.id}`} className="rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-ink-secondary">{items.length}</span></div>
                <p className="mb-3 mt-0.5 px-1 text-xs text-ink-muted">{stage.hint}</p>
                {items.length ? <ul role="list" aria-label={`${stage.label} jobs`} className="space-y-3">{items.map((job) => <li key={job.id}><TrackerEntry job={job} moving={movingIds.has(job.id)} {...entryProps} dragging={dragId === job.id}
                  onDragStart={(dragged, event) => { event.dataTransfer.setData('application/x-ime365-tracker', dragged.id); event.dataTransfer.setData('text/plain', describe(dragged)); event.dataTransfer.effectAllowed = 'move'; const card = event.currentTarget.closest('article'); if (card) event.dataTransfer.setDragImage(card, 30, 30); setDragId(dragged.id); }}
                  onDragEnd={() => { setDragId(null); setDropStage(null); }} /></li>)}</ul>
                  : <p className="rounded-xl border border-dashed border-border px-3 py-5 text-center text-xs text-ink-muted">{draftQuery.trim() ? 'No matching jobs in this stage.' : 'No jobs in this stage.'}</p>}
              </section>;
            })}
          </div>
        </div>
      </>}
      {loaded && view === 'list' && visible.length > 0 && <ul role="list" aria-label="Tracked jobs" className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">{visible.map((job) => <li key={job.id}><TrackerEntry job={job} moving={movingIds.has(job.id)} {...entryProps} /></li>)}</ul>}
    </section>
    {form && <TrackerFormDialog key={form.session} open={form.open} request={form.request} onOpenChange={(open) => { if (!open) closeForm(); }} onCloseAutoFocus={restoreFocus}
      onSaved={(saved, mode) => {
        closeForm();
        if (mode === 'create') {
          setJobs((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
          if (returnFocus.current === 'tracker-add-first') returnFocus.current = actionsTriggerId(saved);
          setNotice({ tone: 'success', text: `Added ${describe(saved)} to ${stageLabel(saved.status)}.${matchesQuery(saved, draftQuery) ? '' : ' Clear your search to see it.'}` });
        } else {
          setJobs((current) => reconcileTrackedJob(current, saved)); returnFocus.current = actionsTriggerId(saved);
          setNotice({ tone: 'success', text: `Saved changes to ${describe(saved)}.` });
        }
        refreshInBackground();
      }}
      onUnchanged={() => { closeForm(); setNotice({ tone: 'info', text: 'No changes to save.' }); }}
      onMissing={(job) => { setJobs((current) => current.filter((item) => item.id !== job.id)); returnFocus.current = HEADING_ID; }}
      onConflict={async (job) => { const latest = await reload(); return latest.find((item) => item.id === job.id) ?? null; }} />}
    {removal && <TrackerDeleteDialog key={removal.session} job={removal.job} open={removal.open} onOpenChange={(open) => { if (!open) setRemoval((current) => current ? { ...current, open: false } : current); }} onCloseAutoFocus={restoreFocus}
      onConflict={async (job) => { const latest = await reload(); return latest.find((item) => item.id === job.id) ?? null; }}
      onDeleted={(job, alreadyGone) => {
        const index = visible.findIndex((item) => item.id === job.id); const neighbour = visible[index + 1] ?? visible[index - 1];
        returnFocus.current = neighbour && neighbour.id !== job.id ? actionsTriggerId(neighbour) : jobs.length > 1 ? HEADING_ID : ADD_BUTTON_ID;
        setRemoval((current) => current ? { ...current, open: false } : current);
        setJobs((current) => current.filter((item) => item.id !== job.id));
        setNotice(alreadyGone ? { tone: 'info', text: `${describe(job)} was already removed elsewhere.` } : { tone: 'success', text: `Removed ${describe(job)} from your tracker.` });
      }} />}
  </div>;
}
