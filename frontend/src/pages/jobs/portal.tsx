/**
 * Jobs Portal — public job discovery (GET /api/jobs-data).
 *
 * DISC-043: the discovery page keeps working when the endpoint returns an
 * unpaginated array. `GET /api/jobs-data` is verified against
 * backend/routes/jobsData.js and backend/repositories/MySQLRepository.js:
 * the route forwards the query string, but the repository only honours
 * `limit` (and the owner-scoped `status`/`employerId`, which the public route
 * strips again). It does not implement `q`, `location`, `type`, `salary_min`,
 * `remote` or `page` filtering.
 *
 * Therefore:
 *  - the request sends NO parameters the server would silently ignore
 *    (`jobsRequestParams`),
 *  - keyword/location/employment-type filters and pagination are applied to
 *    the authoritative rows the server returned, without refetching,
 *  - salary and pay-period filters are not offered at all, because the public
 *    projection carries no salary field. The filter panel states that instead
 *    of showing a control that cannot work.
 *
 * Nothing on this page is invented: no placeholder listings, no benchmark
 * salaries and no artificial delays.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/loading';
import { get, normalizeError } from '@/lib/api-client';
import { parseJobListings, type Listing } from './jobs-contract';
import { cn } from '@/lib/utils';
import {
  Search,
  MapPin,
  Building2,
  Clock,
  Briefcase,
  Bookmark,
  ExternalLink,
  SlidersHorizontal,
  RefreshCw,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';
import { JobApplicationModal } from '@/components/jobs/job-application-modal';

/** Employment types the discovery contract can express (`job_type`). */
export const JOB_TYPE_FILTERS = [
  { value: 'all', label: 'All types' },
  { value: 'full-time', label: 'Full-time' },
  { value: 'part-time', label: 'Part-time' },
  { value: 'contract', label: 'Contract' },
  { value: 'internship', label: 'Internship' },
  { value: 'remote', label: 'Remote' },
] as const;

export type JobTypeFilter = (typeof JOB_TYPE_FILTERS)[number]['value'];

/** One page of local results. The API returns every visible row at once. */
export const JOBS_PAGE_SIZE = 8;

/** Waiting time before typed input is applied, so a fast typist filters once. */
export const SEARCH_DEBOUNCE_MS = 300;

export interface JobDiscoveryQuery {
  q: string;
  location: string;
  type: JobTypeFilter;
  page: number;
}

const MAX_QUERY_LENGTH = 120;

const textParam = (value: string | null) => (value ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY_LENGTH);

/** 1-based page; anything non-numeric, negative or absurd falls back to 1. */
export function parsePageParam(value: string | null | undefined): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.min(parsed, 10_000) : 1;
}

export function normalizeEmploymentType(value: string | null | undefined): JobTypeFilter {
  const normalized = String(value ?? '').trim().toLowerCase();
  return (JOB_TYPE_FILTERS.some((option) => option.value === normalized)
    ? normalized
    : 'all') as JobTypeFilter;
}

/** The discovery query as the address bar describes it. */
export function normalizeDiscoveryQuery(params: URLSearchParams): JobDiscoveryQuery {
  return {
    q: textParam(params.get('q')),
    location: textParam(params.get('location')),
    type: normalizeEmploymentType(params.get('type')),
    page: parsePageParam(params.get('page')),
  };
}

/** The address bar representation. Defaults are omitted so URLs stay short. */
export function discoverySearchParams(query: JobDiscoveryQuery, base?: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(base);
  for (const key of ['q', 'location', 'type', 'page']) next.delete(key);
  if (query.q.trim()) next.set('q', query.q.trim().slice(0, MAX_QUERY_LENGTH));
  if (query.location.trim()) next.set('location', query.location.trim().slice(0, MAX_QUERY_LENGTH));
  if (query.type !== 'all') next.set('type', query.type);
  if (query.page > 1) next.set('page', String(query.page));
  return next;
}

/**
 * Parameters sent to GET /api/jobs-data.
 *
 * Verified: the route forwards the query string but the MariaDB repository
 * implements none of q/location/type/salary_min/remote/page. Sending them
 * would look like server-side filtering while doing nothing, so the request
 * stays parameter-free and every facet is applied to the returned rows.
 */
export function jobsRequestParams(_query: JobDiscoveryQuery): Record<string, string> {
  return {};
}

/** Keyword, location and employment-type filtering over authoritative rows. */
export function applyJobFilters(jobs: readonly Listing[], query: JobDiscoveryQuery): Listing[] {
  const needle = query.q.trim().toLowerCase();
  const place = query.location.trim().toLowerCase();
  return jobs.filter((job) => {
    const matchesKeyword = !needle
      || [job.title, job.company, job.description, ...job.skills]
        .some((value) => value.toLowerCase().includes(needle));
    const matchesLocation = !place
      || job.location.toLowerCase().includes(place)
      || (job.workplace ?? '').toLowerCase().includes(place);
    const matchesType = query.type === 'all'
      || job.type === query.type
      || (query.type === 'remote' && (job.workplace ?? '').toLowerCase() === 'remote');
    return matchesKeyword && matchesLocation && matchesType;
  });
}

export interface JobPage {
  items: Listing[];
  page: number;
  pageCount: number;
  total: number;
  /** 1-based index of the first row on this page, 0 when there are no rows. */
  from: number;
  to: number;
}

/** Local pagination; the page is clamped to the available range. */
export function paginateJobs(jobs: readonly Listing[], page: number, pageSize = JOBS_PAGE_SIZE): JobPage {
  const size = Number.isFinite(pageSize) && pageSize >= 1 ? Math.floor(pageSize) : JOBS_PAGE_SIZE;
  const pageCount = Math.max(1, Math.ceil(jobs.length / size));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pageCount);
  const start = (current - 1) * size;
  const items = jobs.slice(start, start + size);
  return {
    items,
    page: current,
    pageCount,
    total: jobs.length,
    from: items.length ? start + 1 : 0,
    to: items.length ? start + items.length : 0,
  };
}

interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  type: Listing['type'];
  description: string;
  skills: string[];
  postedAt: string;
  featured?: boolean;
  workplace?: string;
}

const toJob = (listing: Listing): Job => ({
  id: listing.id,
  title: listing.title,
  company: listing.company,
  location: listing.location,
  type: listing.type,
  description: listing.description,
  skills: listing.skills,
  postedAt: listing.postedAt,
  featured: listing.featured,
  workplace: listing.workplace,
});

export function JobsPortalPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // The typed values; `query` is the debounced value actually applied.
  const [keywordInput, setKeywordInput] = useState('');
  const [locationInput, setLocationInput] = useState('');
  const [query, setQuery] = useState<JobDiscoveryQuery>({ q: '', location: '', type: 'all', page: 1 });

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedJobForApply, setSelectedJobForApply] = useState<Job | null>(null);
  const [announcement, setAnnouncement] = useState('');

  const filtersButtonRef = useRef<HTMLButtonElement>(null);
  const keywordRef = useRef<HTMLInputElement>(null);

  // Initial filters from the URL, and Back/Forward support.
  useEffect(() => {
    const read = () => {
      const next = normalizeDiscoveryQuery(new URLSearchParams(window.location.search));
      setQuery(next);
      setKeywordInput(next.q);
      setLocationInput(next.location);
    };
    read();
    window.addEventListener('popstate', read);
    return () => window.removeEventListener('popstate', read);
  }, []);

  // Debounce the text inputs into the applied query.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery((previous) => (
        previous.q === keywordInput.trim() && previous.location === locationInput.trim()
          ? previous
          : { ...previous, q: keywordInput.trim(), location: locationInput.trim(), page: 1 }
      ));
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [keywordInput, locationInput]);

  // Keep the address bar in step with the applied query.
  useEffect(() => {
    const next = discoverySearchParams(query, new URLSearchParams(window.location.search));
    const current = new URLSearchParams(window.location.search);
    if (next.toString() === current.toString()) return;
    window.history.replaceState(null, '', `${window.location.pathname}?${next.toString()}`.replace(/\?$/, ''));
  }, [query]);

  // One authoritative fetch per attempt; stale responses are discarded.
  const requestSequence = useRef(0);
  useEffect(() => {
    const sequence = ++requestSequence.current;
    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const data = await get<unknown>('/jobs-data', jobsRequestParams(query));
        if (cancelled || sequence !== requestSequence.current) return;
        setJobs(parseJobListings(data).map(toJob));
      } catch (failure) {
        if (cancelled || sequence !== requestSequence.current) return;
        setJobs([]);
        setError(normalizeError(failure).message || 'Job listings could not be loaded.');
      } finally {
        if (!cancelled && sequence === requestSequence.current) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
    // `query` filters are applied locally, so only an explicit reload refetches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  const filtered = useMemo(() => applyJobFilters(jobs, query), [jobs, query]);
  const page = useMemo(() => paginateJobs(filtered, query.page), [filtered, query.page]);

  const hasFilters = query.q !== '' || query.location !== '' || query.type !== 'all';

  const updateQuery = useCallback((patch: Partial<JobDiscoveryQuery>) => {
    setQuery((previous) => ({ ...previous, ...patch }));
  }, []);

  const clearFilters = useCallback(() => {
    setKeywordInput('');
    setLocationInput('');
    setQuery({ q: '', location: '', type: 'all', page: 1 });
    setAnnouncement('Filters cleared. Showing all open jobs.');
    keywordRef.current?.focus();
  }, []);

  const goToPage = (next: number) => {
    updateQuery({ page: next });
    setAnnouncement(`Page ${next} of ${page.pageCount}.`);
    document.getElementById('job-results-heading')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const retry = () => {
    setReloadKey((key) => key + 1);
    setAnnouncement('Reloading job listings.');
  };

  return (
    <div className="min-h-screen bg-canvas">
      <header className="bg-gradient-to-b from-brand-600 to-brand-700 px-4 pb-12 pt-8 lg:pt-12">
        <div className="mx-auto max-w-5xl">
          <h1 className="text-center text-3xl font-bold text-white lg:text-4xl">Find Your Next Role</h1>
          <p className="mt-2 text-center text-brand-100">
            Browse every open position on IME365. No account needed to look.
          </p>

          <form
            className="mt-8 flex flex-col gap-3 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              setQuery((previous) => ({ ...previous, q: keywordInput.trim(), location: locationInput.trim(), page: 1 }));
            }}
          >
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
              <label htmlFor="job-keyword" className="sr-only">Job title, keyword or company</label>
              <Input
                id="job-keyword"
                ref={keywordRef}
                value={keywordInput}
                onChange={(event) => setKeywordInput(event.target.value)}
                placeholder="Job title, keyword, or company…"
                className="h-12 border-0 pl-10 text-base shadow-lg"
              />
            </div>
            <div className="relative flex-1 sm:max-w-xs">
              <MapPin className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
              <label htmlFor="job-location" className="sr-only">City, state or remote</label>
              <Input
                id="job-location"
                value={locationInput}
                onChange={(event) => setLocationInput(event.target.value)}
                placeholder="City, state, or remote…"
                className="h-12 border-0 pl-10 text-base shadow-lg"
              />
            </div>
            <Button type="submit" size="lg" className="h-12 px-8 shadow-lg">
              <Search aria-hidden="true" className="size-5" />
              Search
            </Button>
          </form>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Employment type">
            {JOB_TYPE_FILTERS.map((option) => {
              const pressed = query.type === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={pressed}
                  onClick={() => updateQuery({ type: option.value, page: 1 })}
                  className={cn(
                    'whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
                    pressed ? 'bg-brand-600 text-white' : 'bg-neutral-100 text-ink-secondary hover:bg-neutral-200',
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <button
            ref={filtersButtonRef}
            type="button"
            aria-expanded={filtersOpen}
            aria-controls="job-filter-panel"
            onClick={() => setFiltersOpen((open) => !open)}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-ink-secondary hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
          >
            <SlidersHorizontal aria-hidden="true" className="size-4" />
            {hasFilters ? 'Filters (active)' : 'Filters'}
          </button>
        </div>

        {filtersOpen && (
          <section
            id="job-filter-panel"
            aria-label="Job filters"
            className="mb-6 rounded-xl border border-border bg-surface p-4"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setFiltersOpen(false);
                filtersButtonRef.current?.focus();
              }
            }}
          >
            <div className="flex flex-wrap items-end gap-4">
              <div className="min-w-0 flex-1">
                <label htmlFor="job-filter-location" className="mb-1 block text-xs font-medium text-ink">Location</label>
                <Input
                  id="job-filter-location"
                  value={locationInput}
                  onChange={(event) => setLocationInput(event.target.value)}
                  placeholder="e.g. Bengaluru"
                />
              </div>
              {hasFilters && (
                <Button type="button" variant="outline" onClick={clearFilters}>
                  <X aria-hidden="true" className="size-4" />
                  Clear all filters
                </Button>
              )}
            </div>
            <p className="mt-3 text-xs text-ink-muted">
              Salary and pay-period filters aren’t available: the job discovery endpoint doesn’t return salary data,
              so matching on it would be guesswork.
            </p>
          </section>
        )}

        <div aria-live="polite" className="sr-only">{announcement}</div>

        {error && (
          <div role="alert" className="mb-6 flex flex-col gap-3 rounded-xl border border-error-200 bg-error-50 p-4 text-sm text-error-800 sm:flex-row sm:items-center">
            <AlertCircle aria-hidden="true" className="size-5 shrink-0" />
            <span className="flex-1">Job listings couldn’t be loaded: {error}</span>
            <Button variant="outline" size="sm" onClick={retry}>
              <RefreshCw aria-hidden="true" className="size-3.5" /> Retry
            </Button>
          </div>
        )}

        {loading && (
          <div className="space-y-4" aria-busy="true" aria-label="Loading job listings">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-36" />
            ))}
          </div>
        )}

        {!loading && !error && (
          <>
            <h2 id="job-results-heading" tabIndex={-1} className="mb-3 text-sm text-ink-secondary focus:outline-none">
              {page.total === 0
                ? 'No open jobs match these filters'
                : `Showing ${page.from}–${page.to} of ${page.total} open job${page.total === 1 ? '' : 's'}`}
              {query.q ? ` for “${query.q}”` : ''}
              {query.location ? ` in “${query.location}”` : ''}
            </h2>

            {page.total === 0 && (
              <Card>
                <CardContent className="flex flex-col items-center py-16 text-center">
                  <Briefcase aria-hidden="true" className="mb-4 size-12 text-ink-subtle" />
                  <h3 className="text-lg font-semibold text-ink">
                    {jobs.length === 0 ? 'No open positions right now' : 'No jobs match your search'}
                  </h3>
                  <p className="mt-2 max-w-sm text-sm text-ink-muted">
                    {jobs.length === 0
                      ? 'Employers haven’t published any open roles yet. Check back later.'
                      : 'Try a different keyword, city or employment type.'}
                  </p>
                  {hasFilters && (
                    <Button className="mt-4" variant="outline" onClick={clearFilters}>
                      Clear all filters
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}

            <ul className="space-y-4" aria-label="Open jobs">
              {page.items.map((job) => (
                <li key={job.id}>
                  <JobListingCard job={job} onApply={() => setSelectedJobForApply(job)} />
                </li>
              ))}
            </ul>

            {page.pageCount > 1 && (
              <nav className="mt-8 flex items-center justify-center gap-3" aria-label="Job results pages">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page.page <= 1}
                  onClick={() => goToPage(page.page - 1)}
                >
                  <ChevronLeft aria-hidden="true" className="size-4" /> Previous
                </Button>
                <span className="text-sm text-ink-secondary" aria-current="page">
                  Page {page.page} of {page.pageCount}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page.page >= page.pageCount}
                  onClick={() => goToPage(page.page + 1)}
                >
                  Next <ChevronRight aria-hidden="true" className="size-4" />
                </Button>
              </nav>
            )}
          </>
        )}
      </div>

      <JobApplicationModal
        isOpen={Boolean(selectedJobForApply)}
        onClose={() => setSelectedJobForApply(null)}
        job={selectedJobForApply}
        onApplied={() => setReloadKey((key) => key + 1)}
      />
    </div>
  );
}

/** Types whose badge colours are part of the existing design tokens. */
const TYPE_STYLES: Record<string, string> = {
  'full-time': 'bg-success-100 text-success-800',
  'part-time': 'bg-info-100 text-info-800',
  contract: 'bg-warning-100 text-warning-800',
  internship: 'bg-purple-100 text-purple-800',
  remote: 'bg-brand-100 text-brand-800',
};

function JobListingCard({ job, onApply }: { job: Job; onApply: () => void }) {
  return (
    <Card className={cn('transition-shadow hover:shadow-md', job.featured && 'border-brand-200 ring-1 ring-brand-100')}>
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <div aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-neutral-100 text-lg font-bold text-neutral-600">
            {job.company.charAt(0).toUpperCase()}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="break-words text-base font-semibold text-ink">{job.title}</h3>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-ink-muted">
                  <span className="flex items-center gap-1"><Building2 aria-hidden="true" className="size-3.5" />{job.company}</span>
                  {job.location && (
                    <span className="flex items-center gap-1"><MapPin aria-hidden="true" className="size-3.5" />{job.location}</span>
                  )}
                </div>
              </div>
              {job.featured && (
                <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700">Featured</span>
              )}
            </div>

            {job.description && <p className="mt-2 line-clamp-2 text-sm text-ink-secondary">{job.description}</p>}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', TYPE_STYLES[job.type] ?? 'bg-neutral-100 text-ink-secondary')}>
                {job.type === 'unknown' ? 'Type not listed' : job.type.replace('-', ' ')}
              </span>
              {job.workplace && (
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-ink-secondary">{job.workplace}</span>
              )}
              {job.skills.slice(0, 4).map((skill) => (
                <span key={skill} className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-ink-secondary">{skill}</span>
              ))}
              {job.skills.length > 4 && <span className="text-xs text-ink-muted">+{job.skills.length - 4} more</span>}
              <span className="ml-auto flex items-center gap-1 text-xs text-ink-muted">
                <Clock aria-hidden="true" className="size-3" />
                {formatRelativeTime(job.postedAt)}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2 border-t border-border pt-3">
          <Button variant="ghost" size="sm" asChild>
            <a href={`/jobs?q=${encodeURIComponent(job.title)}`} aria-label={`See similar roles to ${job.title}`}>
              <Bookmark aria-hidden="true" className="size-3.5" /> Similar
            </a>
          </Button>
          <Button size="sm" onClick={onApply} aria-label={`Apply to ${job.title} at ${job.company}`}>
            Apply Now
            <ExternalLink aria-hidden="true" className="size-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** Relative label from the row's own timestamp; never a guessed date. */
export function formatRelativeTime(dateString: string, now = Date.now()): string {
  if (!dateString) return 'Date not listed';
  const time = new Date(dateString).getTime();
  if (!Number.isFinite(time)) return 'Date not listed';
  const diff = now - time;
  if (diff < 0) return 'Date not listed';
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}
