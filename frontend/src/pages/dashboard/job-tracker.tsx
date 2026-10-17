/**
 * Job Tracker Page
 *
 * Track job applications through stages: Applied → Interview → Offer → Accepted/Rejected.
 * Kanban-style board with list/board toggle.
 */

import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageSpinner, Skeleton } from '@/components/ui/loading';
import { get, post, patch, del, normalizeError } from '@/lib/api-client';
import {
  Plus,
  Briefcase,
  Building2,
  MapPin,
  Calendar,
  ExternalLink,
  MoreVertical,
  Edit,
  Trash2,
  Search,
  LayoutGrid,
  List,
  X,
  CheckCircle2,
  Clock,
  XCircle,
  Star,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';

interface TrackedJob {
  id: string;
  company: string;
  position: string;
  location: string;
  status: 'applied' | 'interview' | 'offer' | 'accepted' | 'rejected';
  url: string;
  notes: string;
  appliedDate: string;
  salary?: string;
}

const statusConfig = {
  applied: { label: 'Applied', color: 'bg-info-100 text-info-700', icon: Clock },
  interview: { label: 'Interview', color: 'bg-warning-100 text-warning-700', icon: Calendar },
  offer: { label: 'Offer', color: 'bg-success-100 text-success-700', icon: Star },
  accepted: { label: 'Accepted', color: 'bg-success-100 text-success-700', icon: CheckCircle2 },
  rejected: { label: 'Rejected', color: 'bg-error-100 text-error-700', icon: XCircle },
};

export function JobTrackerPage() {
  const [jobs, setJobs] = useState<TrackedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'board' | 'list'>('board');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await get<{ jobs: TrackedJob[] }>('/jobs/tracker');
      setJobs(data.jobs ?? []);
    } catch (err) {
      setError(normalizeError(err).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this tracked job?')) return;
    try {
      await del(`/jobs/tracker/${id}`);
      setJobs((prev) => prev.filter((j) => j.id !== id));
    } catch (err) {
      alert(normalizeError(err).message);
    }
  };

  const filteredJobs = jobs.filter((j) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return j.company.toLowerCase().includes(q) || j.position.toLowerCase().includes(q) || j.location.toLowerCase().includes(q);
  });

  const boardColumns: Array<TrackedJob['status']> = ['applied', 'interview', 'offer', 'accepted', 'rejected'];

  if (loading) return <PageSpinner />;

  return (
    <div className="p-4 lg:p-6 xl:p-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Job Tracker</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {jobs.length} application{jobs.length !== 1 ? 's' : ''} tracked
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-border bg-surface p-0.5">
            <button
              onClick={() => setView('board')}
              className={`rounded-md px-2.5 py-1 text-sm font-medium transition-colors ${view === 'board' ? 'bg-brand-50 text-brand-700' : 'text-ink-muted hover:text-ink'}`}
              aria-label="Board view"
            >
              <LayoutGrid className="size-4" />
            </button>
            <button
              onClick={() => setView('list')}
              className={`rounded-md px-2.5 py-1 text-sm font-medium transition-colors ${view === 'list' ? 'bg-brand-50 text-brand-700' : 'text-ink-muted hover:text-ink'}`}
              aria-label="List view"
            >
              <List className="size-4" />
            </button>
          </div>
          <Button onClick={() => setShowAddForm(true)}>
            <Plus className="size-4" />
            Track Job
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="mb-6 relative max-w-md">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by company, position, or location…"
          className="pl-9"
        />
      </div>

      {/* Error state */}
      {error && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-error-200 bg-error-50 p-4 text-sm text-error-700">
          <AlertCircle className="size-5 shrink-0" />
          <span className="flex-1">{error}</span>
          <Button variant="outline" size="sm" onClick={fetchJobs}>
            <RefreshCw className="size-3.5" />
            Retry
          </Button>
        </div>
      )}

      {/* Empty state */}
      {!error && jobs.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center py-16 text-center">
            <div className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-info-50">
              <Briefcase className="size-8 text-info-600" />
            </div>
            <h3 className="text-lg font-semibold text-ink">Start tracking your applications</h3>
            <p className="mt-2 max-w-sm text-sm text-ink-muted">
              Keep track of jobs you've applied to, interviews scheduled, and offers received.
            </p>
            <Button className="mt-6" onClick={() => setShowAddForm(true)}>
              <Plus className="size-4" />
              Track Your First Job
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Board View */}
      {view === 'board' && filteredJobs.length > 0 && (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {boardColumns.map((status) => {
            const config = statusConfig[status];
            const columnJobs = filteredJobs.filter((j) => j.status === status);

            return (
              <div key={status} className="w-72 shrink-0">
                <div className="mb-3 flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${config.color}`}>
                    <config.icon className="size-3" />
                    {config.label}
                  </span>
                  <span className="text-xs text-ink-muted">{columnJobs.length}</span>
                </div>

                <div className="space-y-3">
                  {columnJobs.map((job) => (
                    <JobCard key={job.id} job={job} onDelete={handleDelete} actionMenuId={actionMenuId} setActionMenuId={setActionMenuId} />
                  ))}
                  {columnJobs.length === 0 && (
                    <div className="rounded-xl border-2 border-dashed border-border p-6 text-center text-xs text-ink-muted">
                      No jobs in this stage
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* List View */}
      {view === 'list' && filteredJobs.length > 0 && (
        <div className="space-y-2">
          {filteredJobs.map((job) => (
            <div
              key={job.id}
              className="flex items-center gap-4 rounded-xl border border-border bg-surface p-4 transition-colors hover:bg-neutral-25"
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-neutral-100 font-bold text-neutral-500 text-sm">
                {job.company.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-ink">{job.position}</div>
                <div className="flex items-center gap-3 text-xs text-ink-muted">
                  <span className="flex items-center gap-1"><Building2 className="size-3" />{job.company}</span>
                  {job.location && <span className="flex items-center gap-1"><MapPin className="size-3" />{job.location}</span>}
                </div>
              </div>
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${statusConfig[job.status].color}`}>
                {statusConfig[job.status].label}
              </span>
              <span className="text-xs text-ink-muted">{formatDateShort(job.appliedDate)}</span>
              <button
                className="rounded-md p-1 text-ink-muted hover:bg-neutral-100"
                onClick={() => handleDelete(job.id)}
                aria-label="Delete"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add Job Modal */}
      {showAddForm && <AddJobModal onClose={() => setShowAddForm(false)} onAdded={fetchJobs} />}
    </div>
  );
}

/* ─── Sub-components ─── */

function JobCard({
  job,
  onDelete,
  actionMenuId,
  setActionMenuId,
}: {
  job: TrackedJob;
  onDelete: (id: string) => void;
  actionMenuId: string | null;
  setActionMenuId: (id: string | null) => void;
}) {
  return (
    <Card className="transition-all hover:shadow-md">
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h4 className="truncate text-sm font-semibold text-ink">{job.position}</h4>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-ink-muted">
              <Building2 className="size-3 shrink-0" />
              <span className="truncate">{job.company}</span>
            </div>
            {job.location && (
              <div className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-muted">
                <MapPin className="size-3 shrink-0" />
                <span className="truncate">{job.location}</span>
              </div>
            )}
          </div>
          <div className="relative">
            <button
              className="rounded-md p-1 text-ink-muted hover:bg-neutral-100"
              onClick={() => setActionMenuId(actionMenuId === job.id ? null : job.id)}
            >
              <MoreVertical className="size-3.5" />
            </button>
            {actionMenuId === job.id && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setActionMenuId(null)} />
                <div className="absolute right-0 top-7 z-20 w-36 rounded-lg border border-border bg-surface py-1 shadow-lg">
                  {job.url && (
                    <a
                      href={job.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-ink hover:bg-neutral-50 no-underline"
                      onClick={() => setActionMenuId(null)}
                    >
                      <ExternalLink className="size-3.5 text-ink-muted" />
                      Open listing
                    </a>
                  )}
                  <button
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-error-600 hover:bg-error-50"
                    onClick={() => { onDelete(job.id); setActionMenuId(null); }}
                  >
                    <Trash2 className="size-3.5" />
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-ink-muted">{formatDateShort(job.appliedDate)}</span>
          {job.salary && <span className="text-xs font-medium text-success-600">{job.salary}</span>}
        </div>
      </CardContent>
    </Card>
  );
}

function AddJobModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    company: '',
    position: '',
    location: '',
    url: '',
    status: 'applied' as TrackedJob['status'],
    notes: '',
    salary: '',
  });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await post('/jobs/tracker', formData);
      onAdded();
      onClose();
    } catch (err) {
      alert(normalizeError(err).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-neutral-950/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-dialog animate-[scale-in_200ms_ease-out]">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">Track a Job Application</h2>
          <button onClick={onClose} className="rounded-md p-1 text-ink-muted hover:bg-neutral-100">
            <X className="size-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="job-company" className="mb-1.5 block text-sm font-medium text-ink">Company *</label>
              <Input id="job-company" value={formData.company} onChange={(e) => setFormData({ ...formData, company: e.target.value })} required placeholder="Acme Inc." />
            </div>
            <div>
              <label htmlFor="job-position" className="mb-1.5 block text-sm font-medium text-ink">Position *</label>
              <Input id="job-position" value={formData.position} onChange={(e) => setFormData({ ...formData, position: e.target.value })} required placeholder="Software Engineer" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="job-location" className="mb-1.5 block text-sm font-medium text-ink">Location</label>
              <Input id="job-location" value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} placeholder="Remote / City" />
            </div>
            <div>
              <label htmlFor="job-salary" className="mb-1.5 block text-sm font-medium text-ink">Salary Range</label>
              <Input id="job-salary" value={formData.salary} onChange={(e) => setFormData({ ...formData, salary: e.target.value })} placeholder="$80K - $120K" />
            </div>
          </div>
          <div>
            <label htmlFor="job-url" className="mb-1.5 block text-sm font-medium text-ink">Job URL</label>
            <Input id="job-url" type="url" value={formData.url} onChange={(e) => setFormData({ ...formData, url: e.target.value })} placeholder="https://..." />
          </div>
          <div>
            <label htmlFor="job-notes" className="mb-1.5 block text-sm font-medium text-ink">Notes</label>
            <textarea
              id="job-notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={2}
              className="flex w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-brand-500 hover:border-neutral-400"
              placeholder="Any notes about this application…"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={saving}>
              <Plus className="size-4" />
              Track Application
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function formatDateShort(dateString: string): string {
  try {
    return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}
