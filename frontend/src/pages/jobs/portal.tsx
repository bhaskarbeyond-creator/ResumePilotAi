/**
 * Jobs Portal — Public Job Listings
 *
 * Browse, search, and filter job openings. Public-facing page with
 * optional auth for saving/applying.
 */

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/loading';
import { get, normalizeError } from '@/lib/api-client';
import { parseJobListings, filterJobListings } from './jobs-contract';
import { cn } from '@/lib/utils';
import {
  Search,
  MapPin,
  Building2,
  Clock,
  Briefcase,
  DollarSign,
  Bookmark,
  ExternalLink,
  Filter,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { JobApplicationModal } from '@/components/jobs/job-application-modal';

interface Job {
  id: string;
  title: string;
  company: string;
  location: string;
  type: 'full-time' | 'part-time' | 'contract' | 'internship' | 'remote' | 'unknown';
  salary?: string;
  description: string;
  skills: string[];
  postedAt: string;
  featured?: boolean;
  logo?: string;
}

const JOB_TYPES = ['All', 'Full-time', 'Part-time', 'Contract', 'Internship', 'Remote'] as const;

export function JobsPortalPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('All');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedJobForApply, setSelectedJobForApply] = useState<Job | null>(null);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // The public endpoint enforces visibility; search filters are applied
      // locally because this repository does not implement q/location/type.
      const data = await get<unknown>('/jobs-data');
      setJobs(filterJobListings(parseJobListings(data), searchQuery, locationFilter, typeFilter));
    } catch (err) {
      setError(normalizeError(err).message);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, locationFilter, typeFilter]);

  useEffect(() => { void fetchJobs(); }, [fetchJobs]);



  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    void fetchJobs();
  };

  return (
    <div className="min-h-screen bg-canvas">
      {/* Hero search section */}
      <div className="bg-gradient-to-b from-brand-600 to-brand-700 px-4 pb-12 pt-8 lg:pt-12">
        <div className="mx-auto max-w-5xl">
          <h1 className="text-center text-3xl font-bold text-white lg:text-4xl">
            Find Your Dream Job
          </h1>
          <p className="mt-2 text-center text-brand-200">
            Browse available job opportunities
          </p>

          {/* Search bar */}
          <form onSubmit={handleSearch} className="mt-8 flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-ink-muted" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Job title, keyword, or company…"
                className="h-12 border-0 pl-10 text-base shadow-lg"
              />
            </div>
            <div className="relative flex-1 sm:max-w-xs">
              <MapPin className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-ink-muted" />
              <Input
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                placeholder="City, state, or remote…"
                className="h-12 border-0 pl-10 text-base shadow-lg"
              />
            </div>
            <Button type="submit" size="lg" className="h-12 px-8 shadow-lg">
              <Search className="size-5" />
              Search
            </Button>
          </form>


        </div>
      </div>

      {/* Main content */}
      <div className="mx-auto max-w-6xl px-4 py-8">
        {/* Filters bar */}
        <div className="mb-6 flex items-center justify-between">
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
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-ink-secondary hover:bg-neutral-50"
          >
            <Filter className="size-4" />
            Filters
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 flex items-center gap-3 rounded-xl border border-error-200 bg-error-50 p-4 text-sm text-error-700">
            <AlertCircle className="size-5 shrink-0" />
            <span className="flex-1">{error}</span>
            <Button variant="outline" size="sm" onClick={() => void fetchJobs()}>
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

        {/* Jobs list */}
        {!loading && !error && (
          <>
            <p className="mb-4 text-sm text-ink-muted">
              {jobs.length} job{jobs.length !== 1 ? 's' : ''} found
              {searchQuery ? ` for "${searchQuery}"` : ''}
              {locationFilter ? ` in "${locationFilter}"` : ''}
            </p>

            {jobs.length === 0 && (
              <Card>
                <CardContent className="flex flex-col items-center py-16 text-center">
                  <Briefcase className="mb-4 size-12 text-ink-subtle" />
                  <h3 className="text-lg font-semibold text-ink">No jobs found</h3>
                  <p className="mt-2 max-w-sm text-sm text-ink-muted">
                    Try adjusting your search criteria or browse all available positions.
                  </p>
                  <Button className="mt-4" variant="outline" onClick={() => { setSearchQuery(''); setLocationFilter(''); setTypeFilter('All'); }}>
                    Clear Filters
                  </Button>
                </CardContent>
              </Card>
            )}

            <div className="space-y-4">
              {jobs.map((job) => (
                <JobListingCard
                  key={job.id}
                  job={job}
                  onApply={() => setSelectedJobForApply(job)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <JobApplicationModal
        isOpen={Boolean(selectedJobForApply)}
        onClose={() => setSelectedJobForApply(null)}
        job={selectedJobForApply}
      />
    </div>
  );
}

function JobListingCard({ job, onApply }: { job: Job; onApply: () => void }) {
  const typeColors: Record<string, string> = {
    'full-time': 'bg-success-100 text-success-700',
    'part-time': 'bg-info-100 text-info-700',
    contract: 'bg-warning-100 text-warning-700',
    internship: 'bg-purple-100 text-purple-700',
    remote: 'bg-brand-100 text-brand-700',
  };

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
          <Button size="sm" onClick={onApply}>
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
    if (!Number.isFinite(diff) || diff < 0) return 'Date unavailable';
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
