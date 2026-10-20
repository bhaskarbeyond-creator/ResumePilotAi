/**
 * Job Tracker Page
 *
 * Contract: /api/jobs-data/tracker
 * Track job applications through stages: Wishlist → Applied → Interview → Offer → Rejected.
 * Kanban-style board with list/board toggle, optimistic concurrency locking with expectedRevision.
 * Enhanced with Radix UI accessible modal dialogs, real Cover Letter linkage, and zero native alerts.
 */

import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageSpinner } from '@/components/ui/loading';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { get, post, patch, del, normalizeError } from '@/lib/api-client';
import {
  Plus,
  Building2,
  MapPin,
  Calendar,
  ExternalLink,
  MoreVertical,
  Trash2,
  Search,
  LayoutGrid,
  List,
  CheckCircle2,
  Clock,
  XCircle,
  Star,
  AlertCircle,
  RefreshCw,
  Bookmark,
  FileText,
} from 'lucide-react';

export interface TrackedJob {
  id: string;
  company: string;
  title?: string;
  position?: string;
  location: string;
  status: 'wishlist' | 'applied' | 'interview' | 'offer' | 'rejected';
  url: string;
  notes: string;
  deadline?: string;
  appliedDate?: string;
  dateApplied?: string;
  salary?: string;
  order?: number;
  revision?: number;
}

const statusConfig: Record<
  TrackedJob['status'],
  { label: string; color: string; icon: typeof Clock }
> = {
  wishlist: { label: 'Wishlist', color: 'bg-neutral-100 text-neutral-700', icon: Bookmark },
  applied: { label: 'Applied', color: 'bg-info-100 text-info-700', icon: Clock },
  interview: { label: 'Interview', color: 'bg-warning-100 text-warning-700', icon: Calendar },
  offer: { label: 'Offer', color: 'bg-success-100 text-success-700', icon: Star },
  rejected: { label: 'Rejected', color: 'bg-error-100 text-error-700', icon: XCircle },
};

const boardColumns: Array<TrackedJob['status']> = ['wishlist', 'applied', 'interview', 'offer', 'rejected'];

export function JobTrackerPage() {
  const [jobs, setJobs] = useState<TrackedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'board' | 'list'>('board');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TrackedJob | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showToast = useCallback((type: 'success' | 'error', text: string) => {
    setToastMessage({ type, text });
    setTimeout(() => {
      setToastMessage((cur) => (cur?.text === text ? null : cur));
    }, 4500);
  }, []);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await get<{ jobs: TrackedJob[] }>('/jobs-data/tracker');
      setJobs(data.jobs ?? []);
    } catch (err) {
      setError(normalizeError(err).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const expectedRevision = deleteTarget.revision && deleteTarget.revision > 0 ? deleteTarget.revision : 1;
      await del(`/jobs-data/tracker/${deleteTarget.id}`, { expectedRevision });
      setJobs((prev) => prev.filter((j) => j.id !== deleteTarget.id));
      showToast('success', `Removed tracked job for ${deleteTarget.company}.`);
      setDeleteTarget(null);
    } catch (err) {
      showToast('error', normalizeError(err).message);
    } finally {
      setDeleting(false);
    }
  };

  const handleMoveStatus = async (job: TrackedJob, nextStatus: TrackedJob['status']) => {
    try {
      const expectedRevision = job.revision && job.revision > 0 ? job.revision : 1;
      const res = await patch<{ success: boolean; job: TrackedJob }>(`/jobs-data/tracker/${job.id}`, {
        status: nextStatus,
        expectedRevision,
      });
      if (res?.job) {
        setJobs((prev) => prev.map((j) => (j.id === job.id ? res.job : j)));
      } else {
        setJobs((prev) =>
          prev.map((j) =>
            j.id === job.id ? { ...j, status: nextStatus, revision: (j.revision || 1) + 1 } : j
          )
        );
      }
      setActionMenuId(null);
      showToast('success', `Moved ${job.company} to ${statusConfig[nextStatus].label}.`);
    } catch (err) {
      showToast('error', normalizeError(err).message);
    }
  };

  const filteredJobs = jobs.filter((j) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const pos = (j.title || j.position || '').toLowerCase();
    return (
      (j.company || '').toLowerCase().includes(q) ||
      pos.includes(q) ||
      (j.location || '').toLowerCase().includes(q)
    );
  });

  if (loading) return <PageSpinner />;

  return (
    <div className="p-4 lg:p-6 xl:p-8">
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className={`mb-4 flex items-center justify-between rounded-xl border p-3.5 text-sm shadow-sm transition-all animate-in fade-in-50 ${
            toastMessage.type === 'success'
              ? 'border-success-200 bg-success-50 text-success-800'
              : 'border-error-200 bg-error-50 text-error-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {toastMessage.type === 'success' ? (
              <CheckCircle2 className="size-4 shrink-0 text-success-600" />
            ) : (
              <AlertCircle className="size-4 shrink-0 text-error-600" />
            )}
            <span>{toastMessage.text}</span>
          </div>
          <button
            onClick={() => setToastMessage(null)}
            className="text-xs font-semibold opacity-70 hover:opacity-100"
            aria-label="Dismiss message"
          >
            Dismiss
          </button>
        </div>
      )}

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
              className={`rounded-md px-2.5 py-1 text-sm font-medium transition-colors ${
                view === 'board' ? 'bg-brand-50 text-brand-700' : 'text-ink-muted hover:text-ink'
              }`}
              aria-label="Board view"
            >
              <LayoutGrid className="size-4" />
            </button>
            <button
              onClick={() => setView('list')}
              className={`rounded-md px-2.5 py-1 text-sm font-medium transition-colors ${
                view === 'list' ? 'bg-brand-50 text-brand-700' : 'text-ink-muted hover:text-ink'
              }`}
              aria-label="List view"
            >
              <List className="size-4" />
            </button>
          </div>
          <Button onClick={() => setShowAddForm(true)} data-testid="track-job-button">
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
          aria-label="Search tracked jobs"
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
            <div className="flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 mb-4">
              <Clock className="size-7" />
            </div>
            <h3 className="text-lg font-semibold text-ink">No tracked jobs yet</h3>
            <p className="mt-1 max-w-sm text-sm text-ink-muted">
              Organize your job search by tracking applications, interviews, and offers in one place.
            </p>
            <Button onClick={() => setShowAddForm(true)} className="mt-5">
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
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${config.color}`}
                  >
                    <config.icon className="size-3" />
                    {config.label}
                  </span>
                  <span className="text-xs text-ink-muted">{columnJobs.length}</span>
                </div>

                <div className="space-y-3">
                  {columnJobs.map((job) => (
                    <JobCard
                      key={job.id}
                      job={job}
                      onDelete={() => setDeleteTarget(job)}
                      onMoveStatus={(next) => handleMoveStatus(job, next)}
                      actionMenuId={actionMenuId}
                      setActionMenuId={setActionMenuId}
                    />
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
              data-testid="job-list-row"
              className="flex items-center gap-4 rounded-xl border border-border bg-surface p-4 transition-colors hover:bg-neutral-25"
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-neutral-100 font-bold text-neutral-500 text-sm">
                {(job.company || 'J').charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-ink">{job.title || job.position || 'Position'}</div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-ink-muted">
                  <span className="flex items-center gap-1">
                    <Building2 className="size-3" />
                    {job.company}
                  </span>
                  {job.location && (
                    <span className="flex items-center gap-1">
                      <MapPin className="size-3" />
                      {job.location}
                    </span>
                  )}
                  {job.salary && (
                    <span className="font-medium text-success-700">{job.salary}</span>
                  )}
                </div>
              </div>

              {/* Cover Letter Shortcut */}
              <Link
                to={`/dashboard/cover-letters?role=${encodeURIComponent(job.title || job.position || '')}&company=${encodeURIComponent(job.company || '')}`}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-medium text-ink-muted hover:text-ink hover:bg-neutral-50"
                title="Create or view linked cover letter"
              >
                <FileText className="size-3 text-brand-600" />
                Cover Letter
              </Link>

              <span
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                  statusConfig[job.status]?.color || 'bg-neutral-100 text-neutral-700'
                }`}
              >
                {statusConfig[job.status]?.label || job.status}
              </span>
              <span className="text-xs text-ink-muted">
                {formatDateShort(job.appliedDate || job.dateApplied || '')}
              </span>
              <button
                className="rounded-md p-1.5 text-ink-muted hover:bg-error-50 hover:text-error-600 transition-colors"
                onClick={() => setDeleteTarget(job)}
                aria-label={`Delete ${job.company} application`}
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add Job Radix Dialog */}
      <AddJobDialog
        open={showAddForm}
        onOpenChange={setShowAddForm}
        onAdded={() => {
          fetchJobs();
          showToast('success', 'Job application added to your tracker.');
        }}
      />

      {/* Delete Confirmation Radix Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Tracked Job</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove <strong className="text-ink">{deleteTarget?.title || 'this job'}</strong> at <strong className="text-ink">{deleteTarget?.company}</strong> from your tracker? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={confirmDelete}
              loading={deleting}
              data-testid="confirm-delete-job-button"
            >
              Delete Job
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ─── Sub-components ─── */

function JobCard({
  job,
  onDelete,
  onMoveStatus,
  actionMenuId,
  setActionMenuId,
}: {
  job: TrackedJob;
  onDelete: () => void;
  onMoveStatus: (next: TrackedJob['status']) => void;
  actionMenuId: string | null;
  setActionMenuId: (id: string | null) => void;
}) {
  const isMenuOpen = actionMenuId === job.id;

  return (
    <Card data-testid="job-card" className="transition-all hover:shadow-md">
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h4 className="truncate text-sm font-semibold text-ink">
              {job.title || job.position || 'Position'}
            </h4>
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
              onClick={() => setActionMenuId(isMenuOpen ? null : job.id)}
              aria-label={`Options for ${job.company}`}
              aria-expanded={isMenuOpen}
            >
              <MoreVertical className="size-3.5" />
            </button>
            {isMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setActionMenuId(null)} />
                <div className="absolute right-0 top-7 z-20 w-48 rounded-lg border border-border bg-surface py-1 shadow-lg">
                  <div className="px-3 py-1 text-[11px] font-semibold text-ink-muted uppercase tracking-wider">
                    Move Stage
                  </div>
                  {boardColumns.map((st) => (
                    <button
                      key={st}
                      disabled={st === job.status}
                      className="flex w-full items-center justify-between px-3 py-1.5 text-xs text-ink hover:bg-neutral-50 disabled:opacity-40"
                      onClick={() => onMoveStatus(st)}
                    >
                      <span className="capitalize">{st}</span>
                      {st === job.status && <CheckCircle2 className="size-3 text-brand-600" />}
                    </button>
                  ))}
                  <div className="my-1 border-t border-border" />
                  <Link
                    to={`/dashboard/cover-letters?role=${encodeURIComponent(job.title || job.position || '')}&company=${encodeURIComponent(job.company || '')}`}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-ink hover:bg-neutral-50 no-underline"
                    onClick={() => setActionMenuId(null)}
                  >
                    <FileText className="size-3.5 text-brand-600" />
                    Tailor Cover Letter
                  </Link>
                  {job.url && (
                    <a
                      href={job.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-ink hover:bg-neutral-50 no-underline"
                      onClick={() => setActionMenuId(null)}
                    >
                      <ExternalLink className="size-3.5" />
                      View Posting
                    </a>
                  )}
                  <button
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-error-600 hover:bg-error-50"
                    onClick={() => {
                      setActionMenuId(null);
                      onDelete();
                    }}
                  >
                    <Trash2 className="size-3.5" />
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
        <div className="mt-2.5 flex items-center justify-between border-t border-border/50 pt-2 text-xs">
          <span className="text-ink-muted">
            {formatDateShort(job.appliedDate || job.dateApplied || '')}
          </span>
          {job.salary && <span className="font-medium text-success-600">{job.salary}</span>}
        </div>
      </CardContent>
    </Card>
  );
}

function AddJobDialog({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    company: '',
    title: '',
    location: '',
    url: '',
    status: 'applied' as TrackedJob['status'],
    notes: '',
    salary: '',
  });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await post('/jobs-data/tracker', formData);
      onAdded();
      onOpenChange(false);
      setFormData({
        company: '',
        title: '',
        location: '',
        url: '',
        status: 'applied',
        notes: '',
        salary: '',
      });
    } catch (err) {
      setError(normalizeError(err).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Track a Job Application</DialogTitle>
          <DialogDescription>
            Record application stages, salary expectations, notes, and links in your private career tracker.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-error-200 bg-error-50 p-3 text-xs text-error-700">
            <AlertCircle className="size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="job-company" className="mb-1.5 block text-xs font-semibold text-ink">
                Company *
              </label>
              <Input
                id="job-company"
                value={formData.company}
                onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                required
                placeholder="Acme Inc."
                data-testid="input-job-company"
              />
            </div>
            <div>
              <label htmlFor="job-title" className="mb-1.5 block text-xs font-semibold text-ink">
                Position / Title *
              </label>
              <Input
                id="job-title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
                placeholder="Software Engineer"
                data-testid="input-job-title"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="job-status" className="mb-1.5 block text-xs font-semibold text-ink">
                Initial Stage
              </label>
              <select
                id="job-status"
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as TrackedJob['status'] })}
                className="w-full h-9 rounded-lg border border-border bg-surface px-2.5 text-xs text-ink focus-visible:outline-2 focus-visible:outline-brand-500"
              >
                <option value="wishlist">Wishlist</option>
                <option value="applied">Applied</option>
                <option value="interview">Interview</option>
                <option value="offer">Offer</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
            <div>
              <label htmlFor="job-location" className="mb-1.5 block text-xs font-semibold text-ink">
                Location
              </label>
              <Input
                id="job-location"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder="Remote / City"
              />
            </div>
            <div>
              <label htmlFor="job-salary" className="mb-1.5 block text-xs font-semibold text-ink">
                Salary
              </label>
              <Input
                id="job-salary"
                value={formData.salary}
                onChange={(e) => setFormData({ ...formData, salary: e.target.value })}
                placeholder="$90k - $120k"
              />
            </div>
          </div>

          <div>
            <label htmlFor="job-url" className="mb-1.5 block text-xs font-semibold text-ink">
              Job URL
            </label>
            <Input
              id="job-url"
              type="url"
              value={formData.url}
              onChange={(e) => setFormData({ ...formData, url: e.target.value })}
              placeholder="https://..."
            />
          </div>

          <div>
            <label htmlFor="job-notes" className="mb-1.5 block text-xs font-semibold text-ink">
              Notes
            </label>
            <textarea
              id="job-notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              className="flex w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs text-ink placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-brand-500 hover:border-neutral-400"
              placeholder="Key requirements, recruiter contacts, or referral notes…"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" loading={saving} data-testid="submit-track-job-button">
              <Plus className="size-4" />
              Track Application
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function formatDateShort(dateString: string): string {
  try {
    if (!dateString) return 'Recently';
    return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return 'Recently';
  }
}
