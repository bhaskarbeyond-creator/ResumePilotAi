/**
 * Regional SEO job hubs — /jobs/city/:slug and /jobs/in/:slug.
 *
 * DISC-051: the two routes are served by the same page but the API takes the
 * *kind* segment (`city` | `in`) from the path: GET /api/public/geo/regions/
 * :kind/:slug (backend/routes/publicDiscovery.js) accepts only `city` and
 * `in`, where `in` means a state hub. The page therefore derives the kind from
 * the address bar instead of a `:kind` route parameter, which the router does
 * not provide.
 *
 * Every number on this page comes from the region response
 * (backend/services/geoRegionalService.js#summarizeRegion): vacancyCount,
 * companyCount, topCompanies[{name, openings}], salaryRanges[] and the
 * vacancies themselves. Nothing is extrapolated: a region with no rows renders
 * an empty state, salary bands are labelled as advertised ranges drawn from
 * current listings (never a "benchmark"), and an unknown slug shows the
 * server's 404 answer rather than a made-up page.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/loading';
import { get, normalizeError } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import {
  Search,
  MapPin,
  Building2,
  Briefcase,
  AlertCircle,
  RefreshCw,
  ChevronLeft,
  ExternalLink,
  Wallet,
} from 'lucide-react';
import { JobApplicationModal } from '@/components/jobs/job-application-modal';

export type RegionalKindSegment = 'city' | 'in';

/** `/jobs/city/bengaluru` → city, `/jobs/in/karnataka` → in (a state hub). */
export function regionalKindFromPathname(pathname: string): RegionalKindSegment | null {
  const match = /^\/jobs\/(city|in)\/([^/?#]+)/.exec(pathname);
  return match ? (match[1] as RegionalKindSegment) : null;
}

export function regionSlugFromPathname(pathname: string): string {
  const match = /^\/jobs\/(?:city|in)\/([^/?#]+)/.exec(pathname);
  if (!match?.[1]) return '';
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export interface SalaryRange {
  currency: string;
  unit: string;
  minAnnual: number | null;
  maxAnnual: number | null;
  averageAnnual: number | null;
  averageLpa: number | null;
}

export interface RegionalVacancy {
  id: string;
  title: string;
  company: string;
  location: string;
  workplaceType: string;
  jobType: string;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
}

export interface RegionalSnapshot {
  kind: 'city' | 'state';
  slug: string;
  name: string;
  stateSlug: string;
  stateName: string;
  vacancyCount: number;
  hasVacancies: boolean;
  companyCount: number;
  topCompanies: Array<{ name: string; openings: number }>;
  salaryRanges: SalaryRange[];
  vacancies: RegionalVacancy[];
}

const record = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
);
const text = (value: unknown): string => (typeof value === 'string' ? value : value == null ? '' : String(value));
const count = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
};
const money = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

/**
 * Validates the region payload. A response that is missing its identity is an
 * error, never an empty region: the page must not claim "0 jobs in X" when it
 * simply did not read X.
 */
export function parseRegionResponse(value: unknown): RegionalSnapshot {
  const payload = record(value);
  const region = record(payload.region ?? value);
  const kind = text(region.kind);
  const slug = text(region.slug);
  const name = text(region.name);
  if (!name || !slug || (kind !== 'city' && kind !== 'state')) {
    throw new Error('The regional hub response was not in the expected shape.');
  }
  const vacancyCount = count(region.vacancyCount);
  const vacancies = Array.isArray(region.vacancies) ? region.vacancies.map((row) => {
    const item = record(row);
    return {
      id: text(item.id),
      title: text(item.title),
      company: text(item.company),
      location: text(item.location),
      workplaceType: text(item.workplaceType),
      jobType: text(item.jobType),
      salaryMin: money(item.salaryMin),
      salaryMax: money(item.salaryMax),
      salaryCurrency: text(item.salaryCurrency) || null,
    };
  }).filter((vacancy) => vacancy.id && vacancy.title) : [];

  return {
    kind,
    slug,
    name,
    stateSlug: text(region.stateSlug),
    stateName: text(region.stateName),
    vacancyCount,
    hasVacancies: region.hasVacancies === true || vacancyCount > 0,
    companyCount: count(region.companyCount),
    topCompanies: Array.isArray(region.topCompanies)
      ? region.topCompanies.map((row) => {
        const company = record(row);
        return { name: text(company.name), openings: count(company.openings) };
      }).filter((company) => company.name)
      : [],
    salaryRanges: Array.isArray(region.salaryRanges)
      ? region.salaryRanges.map((row) => {
        const range = record(row);
        return {
          currency: text(range.currency).toUpperCase(),
          unit: text(range.unit),
          minAnnual: money(range.minAnnual),
          maxAnnual: money(range.maxAnnual),
          averageAnnual: money(range.averageAnnual),
          averageLpa: money(range.averageLpa),
        };
      }).filter((range) => /^[A-Z]{3}$/.test(range.currency))
      : [],
    vacancies,
  };
}

const CURRENCY_SYMBOL: Record<string, string> = { INR: '₹', USD: '$', EUR: '€', GBP: '£' };

const amount = (value: number, currency: string): string => {
  // Group digits the way the currency is normally written: 12,00,000 for INR,
  // 120,000 for USD.
  const locale = currency === 'INR' ? 'en-IN' : 'en-US';
  const formatted = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
  return `${CURRENCY_SYMBOL[currency] ?? `${currency} `}${formatted}`;
};

/**
 * One advertised salary band, in the currency the listing used and with its
 * period stated. INR amounts are also shown in lakhs per annum, which is how
 * the source listings express them.
 */
export function formatSalaryRange(range: SalaryRange): string {
  const { currency } = range;
  if (currency === 'INR' && (range.minAnnual !== null || range.maxAnnual !== null)) {
    const low = range.minAnnual !== null ? Number((range.minAnnual / 100000).toFixed(2)) : null;
    const high = range.maxAnnual !== null ? Number((range.maxAnnual / 100000).toFixed(2)) : null;
    if (low !== null && high !== null) return `₹${low}–${high} LPA`;
    if (low !== null) return `From ₹${low} LPA`;
    if (high !== null) return `Up to ₹${high} LPA`;
  }
  if (range.minAnnual !== null && range.maxAnnual !== null) {
    return `${amount(range.minAnnual, currency)}–${amount(range.maxAnnual, currency)} a year`;
  }
  if (range.minAnnual !== null) return `From ${amount(range.minAnnual, currency)} a year`;
  if (range.maxAnnual !== null) return `Up to ${amount(range.maxAnnual, currency)} a year`;
  return 'Salary not listed';
}

/** Employment types actually present in the returned rows, never a fixed menu. */
export function vacancyTypeOptions(vacancies: readonly RegionalVacancy[]): string[] {
  const seen = new Set<string>();
  for (const vacancy of vacancies) {
    const label = vacancy.jobType.trim().toLowerCase().replace(/\s+/g, '-');
    if (label) seen.add(label);
  }
  return [...seen].sort();
}

export function filterVacancies(
  vacancies: readonly RegionalVacancy[],
  keyword: string,
  type: string,
): RegionalVacancy[] {
  const needle = keyword.trim().toLowerCase();
  return vacancies.filter((vacancy) => {
    const matchesKeyword = !needle
      || [vacancy.title, vacancy.company, vacancy.location]
        .some((value) => value.toLowerCase().includes(needle));
    const matchesType = type === 'all'
      || vacancy.jobType.trim().toLowerCase().replace(/\s+/g, '-') === type;
    return matchesKeyword && matchesType;
  });
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

const titleCase = (value: string) => value
  .split('-')
  .filter(Boolean)
  .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
  .join(' ');

const TYPE_STYLES: Record<string, string> = {
  'full-time': 'bg-success-100 text-success-800',
  'part-time': 'bg-info-100 text-info-800',
  contract: 'bg-warning-100 text-warning-800',
  internship: 'bg-purple-100 text-purple-800',
  remote: 'bg-brand-100 text-brand-800',
};

export function RegionalJobsPage() {
  const location = useLocation();
  const params = useParams<{ slug: string }>();
  const pathname = location.pathname;
  const kind = regionalKindFromPathname(pathname);
  const slug = params.slug ? safeDecode(params.slug) : regionSlugFromPathname(pathname);

  const [region, setRegion] = useState<RegionalSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [selectedJob, setSelectedJob] = useState<RegionalVacancy | null>(null);

  // Keep a truthful document title, and restore the previous one on exit.
  useEffect(() => {
    if (!region) return;
    const previous = document.title;
    document.title = `Jobs in ${region.name} | IME365`;
    return () => { document.title = previous; };
  }, [region]);

  useEffect(() => {
    const timer = window.setTimeout(() => setKeyword(keywordInput), 300);
    return () => window.clearTimeout(timer);
  }, [keywordInput]);

  const requestSequence = useRef(0);
  useEffect(() => {
    if (!kind || !slug) {
      setError(null);
      setNotFound(true);
      setRegion(null);
      setLoading(false);
      return;
    }
    const sequence = ++requestSequence.current;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setNotFound(false);

    void (async () => {
      try {
        const data = await get<unknown>(`/public/geo/regions/${kind}/${encodeURIComponent(slug)}`);
        if (cancelled || sequence !== requestSequence.current) return;
        setRegion(parseRegionResponse(data));
      } catch (failure) {
        if (cancelled || sequence !== requestSequence.current) return;
        const normalized = normalizeError(failure);
        setRegion(null);
        if (normalized.status === 404) setNotFound(true);
        else setError(normalized.message || 'Regional job information could not be loaded.');
      } finally {
        if (!cancelled && sequence === requestSequence.current) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [kind, slug, reloadKey]);

  // A new region starts with clean local filters.
  useEffect(() => {
    setKeywordInput('');
    setKeyword('');
    setTypeFilter('all');
  }, [kind, slug]);

  const typeOptions = useMemo(() => (region ? vacancyTypeOptions(region.vacancies) : []), [region]);
  const visible = useMemo(
    () => (region ? filterVacancies(region.vacancies, keyword, typeFilter) : []),
    [region, keyword, typeFilter],
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-canvas" aria-busy="true">
        <header className="bg-gradient-to-b from-brand-600 to-brand-700 px-4 py-12 pt-8 lg:pt-12">
          <div className="mx-auto max-w-5xl">
            <Skeleton className="mx-auto mb-4 h-10 w-3/4 rounded" />
            <Skeleton className="mx-auto mb-8 h-6 w-1/2 rounded" />
            <Skeleton className="mx-auto h-12 w-full max-w-2xl rounded-lg" />
          </div>
        </header>
        <div className="mx-auto max-w-6xl px-4 py-8">
          <p className="sr-only" role="status">Loading regional job listings…</p>
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-36" />)}
          </div>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-canvas">
        <main className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center">
          <MapPin aria-hidden="true" className="mb-4 size-12 text-ink-subtle" />
          <h1 className="text-2xl font-bold text-ink">This regional job hub isn’t available</h1>
          <p className="mt-2 text-sm text-ink-muted">
            “{slug || 'that location'}” isn’t a published city or state hub. Regional hubs use the canonical
            location names, for example <span className="font-medium">/jobs/city/bengaluru</span> or{' '}
            <span className="font-medium">/jobs/in/karnataka</span>.
          </p>
          <Button className="mt-5" asChild>
            <Link to="/jobs">Browse all open jobs</Link>
          </Button>
        </main>
      </div>
    );
  }

  if (error || !region) {
    return (
      <div className="min-h-screen bg-canvas">
        <main className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center">
          <AlertCircle aria-hidden="true" className="mb-4 size-12 text-error-600" />
          <h1 className="text-2xl font-bold text-ink">Regional jobs couldn’t be loaded</h1>
          <p className="mt-2 text-sm text-ink-muted">{error ?? 'The regional job data is unavailable right now.'}</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button variant="outline" onClick={() => setReloadKey((key) => key + 1)}>
              <RefreshCw aria-hidden="true" className="size-4" /> Retry
            </Button>
            <Button variant="ghost" asChild>
              <Link to="/jobs">
                <ChevronLeft aria-hidden="true" className="size-4" /> All jobs
              </Link>
            </Button>
          </div>
        </main>
      </div>
    );
  }

  const isCity = region.kind === 'city';

  return (
    <div className="min-h-screen bg-canvas">
      <header className="bg-gradient-to-b from-brand-600 to-brand-700 px-4 pb-12 pt-8 lg:pt-12">
        <div className="mx-auto max-w-5xl">
          <nav aria-label="Breadcrumb" className="mb-4">
            <ol className="flex flex-wrap items-center gap-1.5 text-sm text-brand-100">
              <li><Link to="/" className="hover:text-white hover:underline">Home</Link></li>
              <li aria-hidden="true" className="text-brand-200">/</li>
              <li><Link to="/jobs" className="hover:text-white hover:underline">Jobs</Link></li>
              <li aria-hidden="true" className="text-brand-200">/</li>
              {isCity && region.stateSlug ? (
                <>
                  <li>
                    <Link to={`/jobs/in/${encodeURIComponent(region.stateSlug)}`} className="hover:text-white hover:underline">
                      {region.stateName || titleCase(region.stateSlug)}
                    </Link>
                  </li>
                  <li aria-hidden="true" className="text-brand-200">/</li>
                </>
              ) : null}
              <li aria-current="page" className="font-medium text-white">{region.name}</li>
            </ol>
          </nav>

          <h1 className="text-center text-3xl font-bold text-white lg:text-4xl">Jobs in {region.name}</h1>
          <p className="mt-2 text-center text-brand-100">
            {region.hasVacancies
              ? `${region.vacancyCount} open position${region.vacancyCount === 1 ? '' : 's'} published by employers hiring in ${region.name}.`
              : `No open positions in ${region.name} right now.`}
          </p>

          <form className="mt-8 flex flex-col gap-3 sm:flex-row" onSubmit={(event) => { event.preventDefault(); setKeyword(keywordInput); }}>
            <div className="relative flex-1">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-ink-muted" />
              <label htmlFor="regional-keyword" className="sr-only">Search jobs in {region.name}</label>
              <Input
                id="regional-keyword"
                value={keywordInput}
                onChange={(event) => setKeywordInput(event.target.value)}
                placeholder={`Search jobs in ${region.name}…`}
                className="h-12 border-0 pl-10 text-base shadow-lg"
              />
            </div>
            <Button type="submit" size="lg" className="h-12 px-8 shadow-lg">
              <Search aria-hidden="true" className="size-5" /> Search
            </Button>
          </form>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-8">
        <section aria-labelledby="regional-overview-heading" className="mb-6">
          <h2 id="regional-overview-heading" className="sr-only">Hiring overview for {region.name}</h2>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-border bg-surface p-4">
              <dt className="text-xs font-medium text-ink-muted">Open positions</dt>
              <dd className="mt-1 text-2xl font-bold text-ink">{region.vacancyCount}</dd>
            </div>
            <div className="rounded-xl border border-border bg-surface p-4">
              <dt className="text-xs font-medium text-ink-muted">Hiring companies</dt>
              <dd className="mt-1 text-2xl font-bold text-ink">{region.companyCount}</dd>
            </div>
            {region.salaryRanges.map((range) => (
              <div key={range.currency} className="rounded-xl border border-border bg-surface p-4">
                <dt className="flex items-center gap-1 text-xs font-medium text-ink-muted">
                  <Wallet aria-hidden="true" className="size-3.5" />
                  Advertised salary ({range.currency})
                </dt>
                <dd className="mt-1 text-sm font-semibold text-ink">
                  {formatSalaryRange(range)}
                  {range.averageAnnual !== null && (
                    <span className="mt-0.5 block text-xs font-normal text-ink-muted">
                      Average of the amounts listed: {amount(range.averageAnnual, range.currency)} a year
                    </span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
          {region.salaryRanges.length > 0 && (
            <p className="mt-2 text-xs text-ink-muted">
              These bands are calculated from the salary fields of the listings shown here. They are not an
              external salary benchmark.
            </p>
          )}
        </section>

        {region.topCompanies.length > 0 && (
          <section aria-labelledby="regional-companies-heading" className="mb-8">
            <h2 id="regional-companies-heading" className="mb-2 text-sm font-semibold text-ink">
              Companies with open roles in {region.name}
            </h2>
            <ul className="flex flex-wrap gap-2">
              {region.topCompanies.map((company) => (
                <li key={company.name} className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-ink-secondary">
                  {company.name}
                  <span className="ml-1.5 text-ink-muted">({company.openings})</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {typeOptions.length > 0 && (
          <div role="group" aria-label="Employment type" className="mb-5 flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              aria-pressed={typeFilter === 'all'}
              onClick={() => setTypeFilter('all')}
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
                typeFilter === 'all' ? 'bg-brand-600 text-white' : 'bg-neutral-100 text-ink-secondary hover:bg-neutral-200',
              )}
            >
              All
            </button>
            {typeOptions.map((option) => {
              const pressed = typeFilter === option;
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={pressed}
                  onClick={() => setTypeFilter(option)}
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
                    pressed ? 'bg-brand-600 text-white' : 'bg-neutral-100 text-ink-secondary hover:bg-neutral-200',
                  )}
                >
                  {option.replace('-', ' ')}
                </button>
              );
            })}
          </div>
        )}

        <h2 id="regional-listings-heading" className="mb-3 text-sm text-ink-secondary">
          {region.vacancies.length === 0
            ? 'No listings to show'
            : `${visible.length} of ${region.vacancies.length} listing${region.vacancies.length === 1 ? '' : 's'} shown`}
          {keyword ? ` for “${keyword}”` : ''}
        </h2>

        {region.vacancies.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center py-16 text-center">
              <Briefcase aria-hidden="true" className="mb-4 size-12 text-ink-subtle" />
              <h3 className="text-lg font-semibold text-ink">No open roles in {region.name} right now</h3>
              <p className="mt-2 max-w-md text-sm text-ink-muted">
                Employers have no published positions matching this region today. This page is not padded with
                sample listings.
              </p>
              <Button className="mt-4" variant="outline" asChild>
                <Link to="/jobs">Browse all open jobs</Link>
              </Button>
            </CardContent>
          </Card>
        ) : visible.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center py-12 text-center">
              <h3 className="text-base font-semibold text-ink">No listings match those filters</h3>
              <p className="mt-2 max-w-sm text-sm text-ink-muted">
                Try a different keyword or employment type.
              </p>
              <Button
                className="mt-4"
                variant="outline"
                onClick={() => { setKeywordInput(''); setKeyword(''); setTypeFilter('all'); }}
              >
                Clear filters
              </Button>
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-4" aria-labelledby="regional-listings-heading">
            {visible.map((vacancy) => (
              <li key={vacancy.id}>
                <RegionalVacancyCard vacancy={vacancy} onApply={() => setSelectedJob(vacancy)} />
              </li>
            ))}
          </ul>
        )}

        {region.stateSlug && isCity && (
          <p className="mt-8 text-sm text-ink-secondary">
            Looking wider?{' '}
            <Link to={`/jobs/in/${encodeURIComponent(region.stateSlug)}`} className="font-medium text-brand-700 underline underline-offset-2">
              See all jobs in {region.stateName || titleCase(region.stateSlug)}
            </Link>
          </p>
        )}
      </div>

      <JobApplicationModal
        isOpen={Boolean(selectedJob)}
        onClose={() => setSelectedJob(null)}
        job={selectedJob
          ? {
            id: selectedJob.id,
            title: selectedJob.title,
            company: selectedJob.company,
            location: selectedJob.location,
          }
          : null}
        onApplied={() => setReloadKey((key) => key + 1)}
      />
    </div>
  );
}

function RegionalVacancyCard({ vacancy, onApply }: { vacancy: RegionalVacancy; onApply: () => void }) {
  const typeLabel = vacancy.jobType.trim().toLowerCase().replace(/\s+/g, '-');
  const salary = vacancy.salaryCurrency && (vacancy.salaryMin !== null || vacancy.salaryMax !== null)
    ? formatSalaryRange({
      currency: vacancy.salaryCurrency,
      unit: '',
      minAnnual: vacancy.salaryMin,
      maxAnnual: vacancy.salaryMax,
      averageAnnual: null,
      averageLpa: null,
    })
    : '';

  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <div aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-neutral-100 text-lg font-bold text-neutral-600">
            {vacancy.company.charAt(0).toUpperCase() || '•'}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="break-words text-base font-semibold text-ink">{vacancy.title}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-ink-muted">
              <span className="flex items-center gap-1"><Building2 aria-hidden="true" className="size-3.5" />{vacancy.company || 'Company not listed'}</span>
              {vacancy.location && (
                <span className="flex items-center gap-1"><MapPin aria-hidden="true" className="size-3.5" />{vacancy.location}</span>
              )}
              {salary && (
                <span className="flex items-center gap-1"><Wallet aria-hidden="true" className="size-3.5" />{salary}</span>
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {vacancy.jobType && (
                <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium capitalize', TYPE_STYLES[typeLabel] ?? 'bg-neutral-100 text-ink-secondary')}>
                  {vacancy.jobType.replace(/[-_]/g, ' ')}
                </span>
              )}
              {vacancy.workplaceType && (
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-ink-secondary">{vacancy.workplaceType}</span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2 border-t border-border pt-3">
          <Button size="sm" onClick={onApply} aria-label={`Apply to ${vacancy.title} at ${vacancy.company || 'this company'}`}>
            Apply Now
            <ExternalLink aria-hidden="true" className="size-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** Canonical path for a hub, used by the breadcrumb and cross-links. */
export function regionalHubPath(kind: RegionalKindSegment, slug: string): string {
  return `/jobs/${kind}/${encodeURIComponent(slug)}`;
}
