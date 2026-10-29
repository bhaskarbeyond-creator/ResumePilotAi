/**
 * Job Tracker (/dashboard/job-tracker), candidate dashboard.
 *
 * The candidate's own list of jobs they follow, from saved to offer, stored in
 * MariaDB through /api/jobs-data/tracker. The board groups jobs by stage; the
 * list shows them all in the chosen order. View, search and sort live in the
 * URL (?view=list&q=&sort=), so they survive a reload and Back/Forward.
 *
 * Stage moves are shown at once and rolled back if the server refuses them.
 * Every write is revision-checked: a job changed in another tab or device is
 * reloaded, never silently overwritten. Submitted applications are a different
 * resource (/dashboard/applied-jobs).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, LayoutGrid, List, Loader2, Plus, RefreshCw, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NoticeRegions, type Notice } from '@/components/settings/notice-regions';
import { TrackerDeleteDialog } from '@/components/job-tracker/tracker-delete-dialog';
import { TrackerEntry, actionsTriggerId, advanceButtonId, stageSelectId } from '@/components/job-tracker/tracker-entry';
import { TrackerFormDialog, type TrackerFormRequest } from '@/components/job-tracker/tracker-form-dialog';
import { cn } from '@/lib/utils';
import {
  listTrackedJobs, stageLabel, TRACKER_QUERY_KEY, TRACKER_STAGES, TrackerError, updateTrackedJob,
  type TrackedJob, type TrackerStatus,
} from '@/lib/job-tracker';
import {
  interviewCalendarFile, matchesQuery, parseSort, parseView, pipelineSummary, SORT_OPTIONS, sortJobs,
  type TrackerSort, type TrackerView,
} from '@/lib/job-tracker-display';

const HEADING_ID = 'tracker-heading';
const ADD_BUTTON_ID = 'tracker-add';

const describe = (job: TrackedJob) => `${job.title} at ${job.company}`;

export function JobTrackerPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const view = parseView(searchParams.get('view'));
  const sort = parseSort(searchParams.get('sort'));
  const query = searchParams.get('q') ?? '';

  const queryClient = useQueryClient();
  const tracker = useQuery({ queryKey: TRACKER_QUERY_KEY, queryFn: listTrackedJobs });
  const jobs = useMemo(() => tracker.data ?? [], [tracker.data]);
  const visible = useMemo(() => sortJobs(jobs.filter((job) => matchesQuery(job, query)), sort), [jobs, query, sort]);

  const [notice, setNotice] = useState<Notice | null>(null);
  const [movingIds, setMovingIds] = useState<ReadonlySet<string>>(new Set());
  // Board drag and drop (pointer only; the Stage control is the keyboard and touch path).
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropStage, setDropStage] = useState<TrackerStatus | null>(null);
  const movingRef = useRef(new Set<string>());
  const [form, setForm] = useState<{ session: number; open: boolean; request: TrackerFormRequest } | null>(null);
  const [removal, setRemoval] = useState<{ session: number; open: boolean; job: TrackedJob } | null>(null);
  const session = useRef(0);
  const returnFocus = useRef<string>(ADD_BUTTON_ID);
  // Ids to focus after the DOM updates, first existing wins (the heading otherwise).
  const pendingFocus = useRef<string[] | null>(null);
  const focusPending = () => {
    if (!pendingFocus.current) return;
    const target = pendingFocus.current.map((id) => document.getElementById(id)).find(Boolean) ?? document.getElementById(HEADING_ID);
    pendingFocus.current = null;
    target?.focus();
  };

  // Focus requested by an action whose element re-renders elsewhere (a job
  // moving to another stage column) is applied after the DOM updates.
  useEffect(focusPending);

  const setJobs = (update: (current: TrackedJob[]) => TrackedJob[]) => {
    queryClient.setQueryData<TrackedJob[]>(TRACKER_QUERY_KEY, (current) => update(current ?? []));
  };
  const reload = () => queryClient.fetchQuery({ queryKey: TRACKER_QUERY_KEY, queryFn: listTrackedJobs, staleTime: 0 });
  const refreshInBackground = () => { void queryClient.invalidateQueries({ queryKey: TRACKER_QUERY_KEY }); };

  const setParam = (key: 'view' | 'sort' | 'q', value: string, fallback: string) => {
    // Start from the address bar, not this render's copy: two quick changes in
    // a row (before React re-renders) must not drop the first one.
    const next = new URLSearchParams(window.location.search);
    if (!value || value === fallback) next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
  };

  const restoreFocus = (event: Event) => {
    event.preventDefault();
    pendingFocus.current = [returnFocus.current];
    requestAnimationFrame(focusPending);
  };

  const openForm = (request: TrackerFormRequest, returnTo: string) => {
    returnFocus.current = returnTo;
    session.current += 1;
    setForm({ session: session.current, open: true, request });
  };
  const closeForm = () => setForm((current) => (current ? { ...current, open: false } : current));

  const openRemoval = (job: TrackedJob) => {
    returnFocus.current = actionsTriggerId(job);
    session.current += 1;
    setRemoval({ session: session.current, open: true, job });
  };

  const moveJob = async (job: TrackedJob, status: TrackerStatus, via: 'stage' | 'advance' = 'stage') => {
    if (status === job.status || movingRef.current.has(job.id)) return;
    // Keep focus on the control that was used, wherever the job is shown next.
    const focusAfterMove = via === 'advance' ? [advanceButtonId(job), stageSelectId(job)] : [stageSelectId(job)];
    movingRef.current.add(job.id);
    setMovingIds(new Set(movingRef.current));
    setJobs((current) => current.map((item) => (item.id === job.id ? { ...item, status } : item)));
    pendingFocus.current = focusAfterMove;
    try {
      const saved = await updateTrackedJob(job, { status });
      setJobs((current) => current.map((item) => (item.id === job.id ? saved : item)));
      setNotice({ tone: 'success', text: `Moved ${describe(job)} to ${stageLabel(status)}.` });
    } catch (error) {
      const kind = error instanceof TrackerError ? error.kind : 'unavailable';
      if (kind === 'not-found') {
        setJobs((current) => current.filter((item) => item.id !== job.id));
        pendingFocus.current = [HEADING_ID];
        setNotice({ tone: 'error', text: `${describe(job)} is no longer in your tracker. It may have been removed in another tab or device.` });
      } else if (kind === 'conflict') {
        setJobs((current) => current.map((item) => (item.id === job.id ? job : item)));
        pendingFocus.current = focusAfterMove;
        // Reloading the conflicting row is the only way to show its real state.
        // If that reload also fails the candidate is told the board is stale —
        // the failure is never swallowed.
        try {
          await reload();
          setNotice({ tone: 'error', text: `${describe(job)} was changed in another tab or device, so it wasn’t moved. Its latest version is shown; try again.` });
        } catch {
          setNotice({
            tone: 'error',
            text: `${describe(job)} was changed in another tab or device, so it wasn’t moved, and the latest version could not be loaded. Refresh the page to see the current state.`,
          });
        }
      } else {
        setJobs((current) => current.map((item) => (item.id === job.id ? job : item)));
        pendingFocus.current = focusAfterMove;
        setNotice({ tone: 'error', text: `${describe(job)} couldn’t be moved, so it stays in ${stageLabel(job.status)}. Check your connection and try again.` });
      }
    } finally {
      movingRef.current.delete(job.id);
      setMovingIds(new Set(movingRef.current));
    }
  };

  const exportInterview = (job: TrackedJob) => {
    const file = interviewCalendarFile(job);
    if (!file) return;
    const url = URL.createObjectURL(new Blob([file.content], { type: 'text/calendar;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = file.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    setNotice({ tone: 'success', text: `Downloaded ${file.filename}. Open it to add the interview to your calendar.` });
  };

  const summary = pipelineSummary(jobs);
  const loaded = tracker.data !== undefined;
  const entryProps = {
    onMove: (job: TrackedJob, status: TrackerStatus, via?: 'stage' | 'advance') => void moveJob(job, status, via),
    onEdit: (job: TrackedJob, focus?: 'interview') => openForm({ mode: 'edit', job, focus }, actionsTriggerId(job)),
    onDelete: openRemoval,
    onExportInterview: exportInterview,
  };

  return (
    <div className="relative p-4 lg:p-6 xl:p-8">
      <header className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 id={HEADING_ID} tabIndex={-1} className="text-2xl font-bold text-ink focus:outline-none">Job Tracker</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Follow the jobs you’re interested in, from saved to offer. Only you can see this list.
            {loaded && jobs.length > 0 && <> {jobs.length === 1 ? '1 job tracked.' : `${jobs.length} jobs tracked.`}</>}
          </p>
        </div>
        <Button id={ADD_BUTTON_ID} className="shrink-0 self-start" onClick={() => openForm({ mode: 'create', job: null }, ADD_BUTTON_ID)}>
          <Plus aria-hidden="true" /> Track a job
        </Button>
      </header>

      {loaded && jobs.length > 0 && (
        <ul aria-label="Jobs by stage" className="mb-5 flex flex-wrap gap-2">
          {TRACKER_STAGES.map((stage) => (
            <li key={stage.id} className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-ink-secondary">
              <span className="font-semibold text-ink">{summary.counts[stage.id]}</span> {stage.label}
            </li>
          ))}
          {summary.upcomingInterviews > 0 && (
            <li className="rounded-full border border-warning-100 bg-warning-50 px-3 py-1 text-xs font-medium text-warning-700">
              {summary.upcomingInterviews === 1 ? '1 upcoming interview' : `${summary.upcomingInterviews} upcoming interviews`}
            </li>
          )}
        </ul>
      )}

      {loaded && jobs.length > 0 && (
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
          <form role="search" className="relative min-w-0 md:max-w-md md:flex-1" onSubmit={(event) => event.preventDefault()}>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
            <Input
              type="search"
              value={query}
              onChange={(event) => setParam('q', event.target.value, '')}
              aria-label="Search tracked jobs"
              placeholder="Job, company, location, notes"
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
              <label htmlFor="tracker-sort" className="shrink-0 whitespace-nowrap text-sm text-ink-secondary">Sort by</label>
              <select
                id="tracker-sort"
                value={sort}
                onChange={(event) => setParam('sort', event.target.value as TrackerSort, 'updated')}
                className="h-9 min-w-0 rounded-lg border border-border bg-surface px-2.5 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-500"
              >
                {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
            <div role="group" aria-label="View" className="flex rounded-lg border border-border bg-surface p-0.5">
              {([['board', 'Board', LayoutGrid], ['list', 'List', List]] as Array<[TrackerView, string, typeof List]>).map(([value, label, Icon]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={view === value}
                  onClick={() => setParam('view', value, 'board')}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-brand-500',
                    view === value ? 'bg-brand-50 text-brand-700' : 'text-ink-muted hover:text-ink',
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" /> {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <NoticeRegions notice={notice} className="mb-4" />

      <section aria-labelledby="tracker-results-heading" aria-busy={tracker.isPending || undefined}>
        <h2 id="tracker-results-heading" className="sr-only">{view === 'list' ? 'All tracked jobs' : 'Tracked jobs by stage'}</h2>

        {tracker.isPending && (
          <p className="flex items-center justify-center gap-2 py-16 text-sm text-ink-muted">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Loading your tracked jobs…
          </p>
        )}

        {!loaded && tracker.isError && (
          <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-error-100 bg-error-50 p-4 text-sm text-error-700 sm:flex-row sm:items-center">
            <AlertTriangle className="size-5 shrink-0" aria-hidden="true" />
            <span className="flex-1">Your tracked jobs couldn’t be loaded. Check your connection and try again.</span>
            <Button variant="outline" size="sm" onClick={() => void tracker.refetch()}>
              <RefreshCw aria-hidden="true" /> Try again
            </Button>
          </div>
        )}

        {loaded && jobs.length === 0 && (
          <div className="flex flex-col items-center rounded-2xl border border-dashed border-border bg-surface px-6 py-14 text-center">
            <h3 className="text-lg font-semibold text-ink">No tracked jobs yet</h3>
            <p className="mt-1 max-w-sm text-sm text-ink-muted">Save the jobs you’re interested in, then move them through each stage as you apply, interview and hear back.</p>
            <Button id="tracker-add-first" className="mt-5" onClick={() => openForm({ mode: 'create', job: null }, 'tracker-add-first')}>
              <Plus aria-hidden="true" /> Track your first job
            </Button>
          </div>
        )}

        {loaded && jobs.length > 0 && visible.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-surface px-6 py-10 text-center">
            <p className="text-sm text-ink">No tracked jobs match “{query}”.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => setParam('q', '', '')}>Clear search</Button>
          </div>
        )}

        {loaded && visible.length > 0 && view === 'board' && (
          <div className="@container">
            <p className="mb-3 hidden text-xs text-ink-muted pointer-fine:block">Drag a job to another stage, or use its Stage control.</p>
            <div className="grid gap-4 @xl:grid-cols-2 @4xl:grid-cols-3 @6xl:grid-cols-5">
              {TRACKER_STAGES.map((stage) => {
                const items = visible.filter((job) => job.status === stage.id);
                const headingId = `tracker-stage-heading-${stage.id}`;
                return (
                  <section
                    key={stage.id}
                    aria-labelledby={headingId}
                    onDragOver={(event) => {
                      if (!dragId) return;
                      event.preventDefault();
                      event.dataTransfer.dropEffect = 'move';
                      if (dropStage !== stage.id) setDropStage(stage.id);
                    }}
                    onDragLeave={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropStage((current) => (current === stage.id ? null : current));
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      const job = dragId ? jobs.find((item) => item.id === dragId) : undefined;
                      setDragId(null);
                      setDropStage(null);
                      if (job) void moveJob(job, stage.id);
                    }}
                    className={cn('min-w-0 rounded-2xl bg-canvas-soft p-3', dropStage === stage.id && 'outline-2 outline-offset-2 outline-brand-500')}
                  >
                    <div className="flex items-baseline justify-between gap-2 px-1">
                      <h2 id={headingId} className="text-sm font-semibold text-ink">
                        {stage.label}<span className="sr-only"> ({items.length === 1 ? '1 job' : `${items.length} jobs`})</span>
                      </h2>
                      <span aria-hidden="true" className="rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-ink-secondary">{items.length}</span>
                    </div>
                    <p className="mb-3 mt-0.5 px-1 text-xs text-ink-muted">{stage.hint}</p>
                    {items.length > 0 ? (
                      <ul role="list" className="space-y-3">
                        {items.map((job) => (
                          <li key={job.id}>
                            <TrackerEntry
                              job={job}
                              moving={movingIds.has(job.id)}
                              {...entryProps}
                              dragging={dragId === job.id}
                              onDragStart={(dragged, event) => {
                                event.dataTransfer.setData('text/plain', `${dragged.title} at ${dragged.company}`);
                                event.dataTransfer.effectAllowed = 'move';
                                setDragId(dragged.id);
                              }}
                              onDragEnd={() => { setDragId(null); setDropStage(null); }}
                            />
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="rounded-xl border border-dashed border-border px-3 py-5 text-center text-xs text-ink-muted">
                        {query ? 'No matching jobs in this stage.' : 'No jobs in this stage.'}
                      </p>
                    )}
                  </section>
                );
              })}
            </div>
          </div>
        )}

        {loaded && visible.length > 0 && view === 'list' && (
          <div className="@container">
            <ul role="list" aria-label="Tracked jobs" className="grid gap-3 @3xl:grid-cols-2 @6xl:grid-cols-3">
              {visible.map((job) => <li key={job.id}><TrackerEntry job={job} moving={movingIds.has(job.id)} {...entryProps} /></li>)}
            </ul>
          </div>
        )}
      </section>

      {form && (
        <TrackerFormDialog
          key={form.session}
          open={form.open}
          request={form.request}
          onOpenChange={(open) => { if (!open) closeForm(); }}
          onCloseAutoFocus={restoreFocus}
          onSaved={(saved, mode) => {
            closeForm();
            if (mode === 'create') {
              setJobs((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
              // The empty-state button disappears once a job exists; focus the new job instead.
              if (returnFocus.current === 'tracker-add-first') returnFocus.current = actionsTriggerId(saved);
              const hidden = !matchesQuery(saved, query);
              setNotice({ tone: 'success', text: `Added ${describe(saved)} to ${stageLabel(saved.status)}.${hidden ? ' It doesn’t match your search, so clear the search to see it.' : ''}` });
            } else {
              setJobs((current) => current.map((item) => (item.id === saved.id ? saved : item)));
              returnFocus.current = actionsTriggerId(saved);
              setNotice({ tone: 'success', text: `Saved changes to ${describe(saved)}.` });
            }
            refreshInBackground();
          }}
          onUnchanged={() => {
            closeForm();
            setNotice({ tone: 'info', text: 'No changes to save.' });
          }}
          onMissing={(job) => {
            setJobs((current) => current.filter((item) => item.id !== job.id));
            returnFocus.current = HEADING_ID;
          }}
          onConflict={refreshInBackground}
        />
      )}

      {removal && (
        <TrackerDeleteDialog
          key={removal.session}
          job={removal.job}
          open={removal.open}
          onOpenChange={(open) => { if (!open) setRemoval((current) => (current ? { ...current, open: false } : current)); }}
          onCloseAutoFocus={restoreFocus}
          onConflict={async (job) => {
            // Returning null tells the dialog the job is already gone, which must
            // only be claimed when the reload actually succeeded. A failed reload
            // returns the card unchanged, so nothing is reported as deleted.
            try {
              const latest = await reload();
              return latest.find((item) => item.id === job.id) ?? null;
            } catch {
              setNotice({
                tone: 'error',
                text: `${describe(job)} was changed in another tab or device, and its latest version could not be loaded. Refresh the page before removing it.`,
              });
              return job;
            }
          }}
          onDeleted={(job, alreadyGone) => {
            const index = visible.findIndex((item) => item.id === job.id);
            const neighbour = visible[index + 1] ?? visible[index - 1];
            returnFocus.current = neighbour && neighbour.id !== job.id ? actionsTriggerId(neighbour) : (jobs.length > 1 ? HEADING_ID : ADD_BUTTON_ID);
            setRemoval((current) => (current ? { ...current, open: false } : current));
            setJobs((current) => current.filter((item) => item.id !== job.id));
            setNotice(alreadyGone
              ? { tone: 'info', text: `${describe(job)} had already been removed in another tab or device.` }
              : { tone: 'success', text: `Removed ${describe(job)} from your tracker.` });
          }}
        />
      )}
    </div>
  );
}
