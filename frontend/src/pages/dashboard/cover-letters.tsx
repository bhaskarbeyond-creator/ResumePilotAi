/**
 * Cover Letters — list, search, sort, duplicate and delete.
 *
 * Route: /dashboard/cover-letters (canonical). `?q=` and `?sort=` keep search
 * and order in the URL so refresh and back/forward restore them. The legacy
 * Job Tracker deep link `?role=&company=` (DIR-020 AC-11) opens a new letter
 * in the builder with that role context.
 *
 * Data comes only from the authenticated covers API (MariaDB). Nothing is
 * shown that the server did not return.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Briefcase, Copy, FileText, FolderOpen, Plus, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { normalizeError } from '@/lib/api-client';
import { TRACKER_QUERY_KEY } from '@/lib/job-tracker';
import {
  COVER_TEMPLATES,
  deleteCoverLetter,
  duplicateCoverLetter,
  formatUpdated,
  listCoverLetters,
  syncToJobTracker,
  trackerSyncMessage,
  type CoverLetterSummary,
} from '@/lib/cover-letters';

type SortKey = 'updated-desc' | 'updated-asc' | 'title-asc';
const SORT_OPTIONS: ReadonlyArray<{ value: SortKey; label: string }> = [
  { value: 'updated-desc', label: 'Last updated (newest)' },
  { value: 'updated-asc', label: 'Last updated (oldest)' },
  { value: 'title-asc', label: 'Title (A–Z)' },
];

const timeOf = (value: string | null) => {
  const ms = value ? new Date(value).getTime() : Number.NaN;
  return Number.isFinite(ms) ? ms : 0;
};

export function CoverLettersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const role = searchParams.get('role');
  const company = searchParams.get('company');

  const [letters, setLetters] = useState<CoverLetterSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<CoverLetterSummary | null>(null);
  const deleteTriggerRef = useRef<HTMLElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const query = searchParams.get('q') ?? '';
  const sortParam = searchParams.get('sort');
  const sort: SortKey = SORT_OPTIONS.some((option) => option.value === sortParam) ? (sortParam as SortKey) : 'updated-desc';

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setLetters(await listCoverLetters());
    } catch (error) {
      setLoadError(normalizeError(error).message || 'Cover letters could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!role && !company) void load();
  }, [load, role, company]);

  const updateParam = (key: 'q' | 'sort', value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value && !(key === 'sort' && value === 'updated-desc')) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
  };

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle
      ? letters.filter((letter) => [letter.title, letter.companyName, letter.recipientName, letter.excerpt].some((field) => field.toLowerCase().includes(needle)))
      : letters;
    const sorted = [...filtered];
    if (sort === 'title-asc') sorted.sort((a, b) => a.title.localeCompare(b.title));
    else sorted.sort((a, b) => (sort === 'updated-asc' ? timeOf(a.updatedAt) - timeOf(b.updatedAt) : timeOf(b.updatedAt) - timeOf(a.updatedAt)));
    return sorted;
  }, [letters, query, sort]);

  const handleDuplicate = async (letter: CoverLetterSummary) => {
    setBusyId(letter.id);
    setStatus(null);
    try {
      const copy = await duplicateCoverLetter(letter.id);
      await load();
      setStatus({ tone: 'success', text: `Duplicated “${letter.title}”. The copy is saved as “${copy.jobTitle}”.` });
    } catch (error) {
      setStatus({ tone: 'error', text: `Could not duplicate “${letter.title}”: ${normalizeError(error).message}` });
    } finally {
      setBusyId(null);
    }
  };

  const handleSyncTracker = async (letter: CoverLetterSummary) => {
    setSyncingId(letter.id);
    setStatus(null);
    try {
      const result = await syncToJobTracker(letter);
      if (result.outcome === 'added') void queryClient.invalidateQueries({ queryKey: TRACKER_QUERY_KEY });
      setStatus({ tone: 'success', text: trackerSyncMessage(result) });
    } catch (error) {
      setStatus({
        tone: 'error',
        text: `“${letter.title}” wasn’t added to the Job Tracker. ${normalizeError(error).message}`,
      });
    } finally {
      setSyncingId(null);
    }
  };

  // The Job Tracker's "linked cover letter" deep link opens a new draft with role context.
  if (role || company) {
    const next = new URLSearchParams();
    if (role) next.set('role', role);
    if (company) next.set('company', company);
    return <Navigate to={`/cover-letter/new?${next.toString()}`} replace />;
  }

  return (
    <div className="mx-auto w-full max-w-5xl p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-bold text-ink">Cover Letters</h1>
          <p className="mt-1 text-sm text-ink-muted" aria-live="polite">
            {loading ? 'Loading your cover letters…' : `${letters.length} saved cover letter${letters.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <Button asChild>
          <Link to="/cover-letter/new">
            <Plus aria-hidden="true" />
            New cover letter
          </Link>
        </Button>
      </div>

      <div role="status" aria-live="polite">
        {status && (
          <p className={`mb-4 flex items-start gap-2 rounded-xl border p-3 text-sm ${status.tone === 'success' ? 'border-success-200 bg-success-50 text-success-800' : 'border-error-200 bg-error-50 text-error-800'}`}>
            <span className="flex-1">{status.text}</span>
            <button type="button" onClick={() => setStatus(null)} className="rounded p-0.5 hover:bg-black/5" aria-label="Dismiss message">
              <X className="size-4" aria-hidden="true" />
            </button>
          </p>
        )}
      </div>

      {loading ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading cover letters">
          {[0, 1, 2].map((key) => (
            <div key={key} className="h-20 animate-pulse rounded-xl border border-border bg-surface" />
          ))}
        </div>
      ) : loadError ? (
        <div role="alert" className="flex flex-col gap-3 rounded-xl border border-error-200 bg-error-50 p-4 text-sm text-error-800 sm:flex-row sm:items-center">
          <AlertCircle className="size-5 shrink-0" aria-hidden="true" />
          <span className="flex-1">{loadError}</span>
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw aria-hidden="true" /> Retry
          </Button>
        </div>
      ) : letters.length === 0 ? (
        <section className="flex flex-col items-center rounded-2xl border border-border bg-surface px-6 py-14 text-center" aria-labelledby="cover-letters-empty">
          <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-brand-50">
            <FolderOpen className="size-7 text-brand-600" aria-hidden="true" />
          </div>
          <h2 id="cover-letters-empty" className="text-lg font-semibold text-ink">No cover letters yet</h2>
          <p className="mt-2 max-w-sm text-sm text-ink-muted">
            Write a letter for each application. Your contact details are filled in from your profile.
          </p>
          <Button asChild className="mt-6">
            <Link to="/cover-letter/new">
              <Plus aria-hidden="true" /> Write your first cover letter
            </Link>
          </Button>
        </section>
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <label htmlFor="cover-letter-search" className="sr-only">Search cover letters</label>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
              <Input
                id="cover-letter-search"
                type="search"
                value={query}
                onChange={(event) => updateParam('q', event.target.value)}
                placeholder="Search by role or company"
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="cover-letter-sort" className="shrink-0 text-sm text-ink-muted">Sort</label>
              <select
                id="cover-letter-sort"
                value={sort}
                onChange={(event) => updateParam('sort', event.target.value)}
                className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-brand-500 sm:flex-none"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>

          {visible.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-ink-muted">
              <p>No cover letters match “{query}”.</p>
              <Button variant="link" className="mt-2" onClick={() => updateParam('q', '')}>Clear search</Button>
            </div>
          ) : (
            <ul className="space-y-3" aria-label="Saved cover letters">
              {visible.map((letter) => (
                <li key={letter.id} className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-50">
                      <FileText className="size-5 text-brand-600" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link to={`/cover-letter/${encodeURIComponent(letter.id)}`} className="truncate text-sm font-semibold text-ink hover:text-brand-700 hover:underline">
                          {letter.title}
                        </Link>
                        <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                          {COVER_TEMPLATES.find((t) => t.id === letter.templateId)?.name || 'Executive Classic'}
                        </span>
                      </div>
                      <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-ink-muted">
                        {letter.recipientName && <span>To {letter.recipientName}</span>}
                        <span>Updated {formatUpdated(letter.updatedAt)}</span>
                      </p>
                      {letter.excerpt && <p className="mt-1 line-clamp-2 text-xs text-ink-secondary">{letter.excerpt}</p>}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 sm:gap-1">
                    <Button asChild variant="outline" size="sm">
                      <Link to={`/cover-letter/${encodeURIComponent(letter.id)}`} aria-label={`Open ${letter.title}`}>Open</Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => void handleSyncTracker(letter)}
                      loading={syncingId === letter.id}
                      aria-label={`Track ${letter.title} in Job Tracker`}
                      title="Track in Job Tracker"
                    >
                      <Briefcase className="size-4 text-brand-600" aria-hidden="true" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" onClick={() => void handleDuplicate(letter)} loading={busyId === letter.id} aria-label={`Duplicate ${letter.title}`} title="Duplicate">
                      <Copy aria-hidden="true" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" onClick={(event) => { deleteTriggerRef.current = event.currentTarget; setDeleteTarget(letter); }} aria-label={`Delete ${letter.title}`} title="Delete">
                      <Trash2 className="text-error-600" aria-hidden="true" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <DeleteCoverLetterDialog
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        restoreFocus={() => {
          // The row's Delete button is gone after a successful delete; fall back to the heading.
          const trigger = deleteTriggerRef.current;
          if (trigger?.isConnected) trigger.focus();
          else headingRef.current?.focus();
        }}
        onDeleted={(letter) => {
          setLetters((previous) => previous.filter((item) => item.id !== letter.id));
          setStatus({ tone: 'success', text: `Deleted “${letter.title}”.` });
        }}
      />
    </div>
  );
}

function DeleteCoverLetterDialog({ target, onClose, restoreFocus, onDeleted }: {
  target: CoverLetterSummary | null;
  onClose: () => void;
  restoreFocus: () => void;
  onDeleted: (letter: CoverLetterSummary) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Reset per target so reopening never shows a previous letter's error.
  useEffect(() => {
    setError(null);
    setDeleting(false);
  }, [target?.id]);

  const confirm = async () => {
    if (!target) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteCoverLetter(target.id);
      onDeleted(target);
      onClose();
    } catch (failure) {
      setError(`The cover letter was not deleted: ${normalizeError(failure).message}`);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={target !== null} onOpenChange={(open) => { if (!open && !deleting) onClose(); }}>
      <DialogContent
        className="w-[calc(100%-2rem)] max-w-md rounded-2xl"
        onOpenAutoFocus={(event) => { event.preventDefault(); cancelRef.current?.focus(); }}
        onCloseAutoFocus={(event) => { event.preventDefault(); restoreFocus(); }}
      >
        <DialogHeader>
          <DialogTitle>Delete this cover letter?</DialogTitle>
          <DialogDescription>
            “{target?.title}” will be permanently removed from your account. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {error && <p role="alert" className="rounded-lg border border-error-200 bg-error-50 p-3 text-sm text-error-800">{error}</p>}
        <DialogFooter className="gap-2">
          <Button ref={cancelRef} variant="outline" onClick={onClose} disabled={deleting}>Cancel</Button>
          <Button variant="destructive" onClick={() => void confirm()} loading={deleting}>Delete permanently</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
