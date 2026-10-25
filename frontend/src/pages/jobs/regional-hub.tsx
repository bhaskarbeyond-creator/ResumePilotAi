/**
 * Regional SEO Job Hubs
 *
 * Routes: /jobs/city/:slug and /jobs/in/:slug
 * Dedicated pages for city-level and state-level job listings with regional data.
 * Fetches from GET /api/public/geo/regions/:kind/:slug
 */

import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
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
  Clock,
  Briefcase,
  DollarSign,
  ExternalLink,
  AlertCircle,
  RefreshCw,
  ChevronLeft,
  Bookmark,
} from 'lucide-react';

interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  type: 'full-time' | 'part-time' | 'contract' | 'internship' | 'remote';
  salary?: string;
  description: string;
  skills: string[];
  postedAt: string;
  featured?: boolean;
  logo?: string;
}

interface RegionalData {
  kind: 'city' | 'state';
  slug: string;
  name: string;
  displayName: string;
  jobCount: number;
  topCompanies: string[];
  topSkills: string[];
  avgSalary?: string;
  jobs: Job[];
}

const JOB_TYPES = ['All', 'Full-time', 'Part-time', 'Contract', 'Internship', 'Remote'] as const;

export function RegionalJobsPage() {
  const { kind, slug } = useParams<{ kind: 'city' | 'state'; slug: string }>();
  const [data, setData] = useState<RegionalData | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('All');

  const fetchRegionalData = async () => {
    if (!kind || !slug) {
      setError('Invalid regional parameters');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await get<{ region: RegionalData }>(`/api/public/geo/regions/${kind}/${slug}`);
      setData(result.region ?? null);
      setJobs(result.region?.jobs ?? []);
    } catch (err) {
      setError(normalizeError(err).message);
      setJobs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchRegionalData();
  }, [kind, slug]);

  const filteredJobs = jobs.filter((job) => {
    const matchesSearch = !searchQuery ||
      job.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.company.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.skills.some((s) => s.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesType = typeFilter === 'All' || job.type === typeFilter.toLowerCase();
    return matchesSearch && matchesType;
  });

  const typeColors: Record<string, string> = {
    'full-time': 'bg-success-100 text-success-700',
    'part-time': 'bg-info-100 text-info-700',
    contract: 'bg-warning-100 text-warning-700',
    internship: 'bg-purple-100 text-purple-700',
    remote: 'bg-brand-100 text-brand-700',
  };

  const kindLabel = kind === 'city' ? 'City' : 'State';
  const locationName = data?.displayName || slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  if (loading) {
    return (
      <div className="min-h-screen bg-canvas">
        <header className="bg-gradient-to-b from-brand-600 to-brand-700 px-4 py-12 pt-8 lg:pt-12">
          <div className="mx-auto max-w-5xl">
            <Skeleton className="h-10 w-3/4 mx-auto mb-4 rounded" />
            <Skeleton className="h-6 w-1/2 mx-auto mb-8 rounded" />
            <div className="flex flex-col gap-3 sm:flex-row max-w-2xl mx-auto">
              <Skeleton className="h-12 flex-1 rounded-lg" />
              <Skeleton className="h-12 flex-1 rounded-lg" />
              <Skeleton className="h-12 w-32 rounded-lg" />
            </div>
          </div>
        </header>
        <div className="mx-auto max-w-6xl px-4 py-8">
          <Skeleton className="h-8 w-48 mb-6" />
          <div className="space-y-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-36" />)}
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <MapPin className="mx-auto mb-4 size-12 text-ink-subtle" />
          <h1 className="text-2xl font-bold text-ink">Unable to Load {kindLabel} Data</h1>
          <p className="mt-2 text-ink-muted">
            {error ? `Error: ${error}` : `No job data found for ${locationName}.`}
          </p>
          <Button variant="outline" className="mt-4" onClick={() => void fetchRegionalData()}>
            <RefreshCw className="size-3.5 mr-1.5" /> Retry
          </Button>
          <Button variant="ghost" className="mt-2 ml-2" asChild>
            <Link to="/jobs">
              <ChevronLeft className="size-3.5 mr-1.5" />
              Browse All Jobs
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas">
      {/* Hero Section */}
      <header className="bg-gradient-to-b from-brand-600 to-brand-700 px-4 pb-12 pt-8 lg:pt-12">
        <div className="mx-auto max-w-5xl">
          <div className="mb-4 flex items-center gap-2 text-brand-200">
            <ChevronLeft className="size-5" />
            <Link to="/jobs" className="text-sm hover:text-white transition-colors">
              All Jobs
            </Link>
            <span className="text-ink-muted">/</span>
            <span className="text-sm capitalize">{kindLabel}</span>
          </div>

          <h1 className="text-center text-3xl font-bold text-white lg:text-4xl">
            Jobs in {locationName}
          </h1>
          <p className="mt-2 text-center text-brand-200">
            {data.jobCount} {data.jobCount === 1 ? 'opportunity' : 'opportunities'} from top companies
          </p>

          {/* Search bar */}
          <form className="mt-8 flex flex-col gap-3 sm:flex-row" onSubmit={(e) => { e.preventDefault(); }}>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-ink-muted" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`Search jobs in ${locationName}…`}
                className="h-12 border-0 pl-10 text-base shadow-lg"
              />
            </div>
            <Button type="submit" size="lg" className="h-12 px-8 shadow-lg">
              <Search className="size-5" />
              Search
            </Button>
          </form>

          {/* Stats bar */}
          <div className="mt-6 flex flex-wrap justify-center gap-6 text-sm text-brand-200">
            <span className="flex items-center gap-1.5">
              <Briefcase className="size-4" />
              <strong className="text-white">{data.jobCount}+</strong> Active Jobs
            </span>
            <span className="flex items-center gap-1.5">
              <Building2 className="size-4" />
              <strong className="text-white">{data.topCompanies.length}+</strong> Companies
            </span>
            {data.avgSalary && (
              <span className="flex items-center gap-1.5">
                <DollarSign className="size-4" />
                <strong className="text-white">Avg {data.avgSalary}</strong>
              </span>
            )}
          </div>

          {/* Top Companies */}
          {data.topCompanies.length > 0 && (
            <div className="mt-6 flex flex-wrap justify-center gap-2 text-sm">
              {data.topCompanies.slice(0, 5).map((company) => (
                <span key={company} className="rounded-full bg-white/10 px-3 py-1 text-brand-100 border border-white/20">
                  {company}
                </span>
              ))}
              {data.topCompanies.length > 5 && (
                <span className="rounded-full bg-white/10 px-3 py-1 text-brand-200 border border-white/20">
                  +{data.topCompanies.length - 5} more
                </span>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <div className="mx-auto max-w-6xl px-4 py-8">
        {/* Filters */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-2 overflow-x-auto">
            {JOB_TYPES.map((type) => (
              <button
                key={type}
                onClick={() => setTypeFilter(type)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors whitespace-nowrap',
                  typeFilter === type
                    ? 'bg-brand-600 text-white'
                    : 'bg-neutral-100 text-ink-secondary hover:bg-neutral-200',
                )}
              >
                {type}
              </button>
            ))}
          </div>

          {/* Top Skills Pills */}
          {data.topSkills.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
              <span className="font-medium text-ink">Top Skills:</span>
              {data.topSkills.slice(0, 6).map((skill) => (
                <span key={skill} className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-600 border border-brand-100">
                  {skill}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 flex items-center gap-3 rounded-xl border border-error-200 bg-error-50 p-4 text-sm text-error-700">
            <AlertCircle className="size-5 shrink-0" />
            <span className="flex-1">{error}</span>
            <Button variant="outline" size="sm" onClick={() => void fetchRegionalData()}>
              <RefreshCw className="size-3.5" /> Retry
            </Button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="space-y-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-36" />
            ))}
          </div>
        )}

        {/* Jobs List */}
        {!loading && !error && (
          <>
            <p className="mb-4 text-sm text-ink-muted">
              {filteredJobs.length} job{filteredJobs.length !== 1 ? 's' : ''} found
              {searchQuery ? ` for "${searchQuery}"` : ''}
              {typeFilter !== 'All' ? ` (${typeFilter})` : ''}
            </p>

            {filteredJobs.length === 0 && (
              <Card>
                <CardContent className="flex flex-col items-center py-16 text-center">
                  <Briefcase className="mb-4 size-12 text-ink-subtle" />
                  <h3 className="text-lg font-semibold text-ink">No jobs found</h3>
                  <p className="mt-2 max-w-sm text-sm text-ink-muted">
                    Try adjusting your search criteria or browse all available positions in {locationName}.
                  </p>
                  <div className="mt-4 flex gap-2">
                    <Button variant="outline" onClick={() => { setSearchQuery(''); setTypeFilter('All'); }}>
                      Clear Filters
                    </Button>
                    <Button variant="ghost" asChild>
                      <Link to="/jobs">Browse All Jobs</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="space-y-4">
              {filteredJobs.map((job) => (
                <JobListingCard key={job.id} job={job} typeColors={typeColors} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function JobListingCard({
  job,
  typeColors,
}: {
  job: Job;
  typeColors: Record<string, string>;
}) {
  return (
    <Card className={cn('transition-all hover:shadow-md', job.featured && 'border-brand-200 ring-1 ring-brand-100')}>
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          {/* Company logo */}
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-neutral-100 text-lg font-bold text-neutral-400">
            {job.company.charAt(0).toUpperCase()}
          </div>

          {/* Job info */}
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold text-ink hover:text-brand-600 transition-colors cursor-pointer">
                  {job.title}
                </h3>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-ink-muted">
                  <span className="flex items-center gap-1"><Building2 className="size-3.5" />{job.company}</span>
                  <span className="flex items-center gap-1"><MapPin className="size-3.5" />{job.location}</span>
                  {job.salary && <span className="flex items-center gap-1"><DollarSign className="size-3.5" />{job.salary}</span>}
                </div>
              </div>
              {job.featured && (
                <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-600">Featured</span>
              )}
            </div>

            {/* Description snippet */}
            <p className="mt-2 line-clamp-2 text-sm text-ink-secondary">{job.description}</p>

            {/* Skills + meta */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', typeColors[job.type] ?? 'bg-neutral-100 text-neutral-600')}>
                {job.type.replace('-', ' ')}
              </span>
              {job.skills.slice(0, 4).map((skill) => (
                <span key={skill} className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-ink-secondary">
                  {skill}
                </span>
              ))}
              {job.skills.length > 4 && (
                <span className="text-xs text-ink-muted">+{job.skills.length - 4} more</span>
              )}
              <span className="ml-auto flex items-center gap-1 text-xs text-ink-muted">
                <Clock className="size-3" />
                {formatRelativeTime(job.postedAt)}
              </span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-4 flex items-center justify-end gap-2 border-t border-border pt-3">
          <Button variant="ghost" size="sm">
            <Bookmark className="size-3.5" /> Save
          </Button>
          <Button size="sm">
            Apply Now
            <ExternalLink className="size-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function formatRelativeTime(dateString: string): string {
  try {
    const diff = Date.now() - new Date(dateString).getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
    return `${Math.floor(days / 30)} months ago`;
  } catch {
    return '';
  }
}