/**
 * Marketplace & Hiring Moderation Tab
 *
 * Covers:
 * - Employer Applications Verification Workflow
 * - Jobs Moderation & Anti-Spam Gating
 * - Company Registry & Domain Badging
 * - Enterprise Tenants Registry & Quota Overrides
 */

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { post, get, normalizeError } from '@/lib/api-client';
import {
  CheckCircle2,
  Building2,
  ShieldCheck,
  ExternalLink,
  Check,
  X,
  Eye,
  FileText,
  Mail,
  MapPin,
  Globe,
  AlertTriangle,
} from 'lucide-react';

interface EmployerApplication {
  id: string;
  source?: 'COMPANY_PROFILE' | 'APPLICATION_SUBMISSION';
  companyName: string;
  contactEmail: string;
  contactPerson?: string;
  contactPersonTitle?: string;
  contactPhone?: string;
  taxId: string;
  website: string;
  location?: string;
  companySize?: string;
  companyDescription?: string;
  linkedinProfile?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  submittedAt: string;
}

interface JobModerationItem {
  id: string;
  title: string;
  company: string;
  location: string;
  status: string;
  isSpam: boolean;
  publiclyVisible?: boolean;
  postedAt: string;
}

interface AdminFeedback {
  type: 'success' | 'error';
  text: string;
}

/**
 * Both moderation queues are populated exclusively from the administrative API.
 * If a read fails the panel shows an error with a Retry action — it never seeds
 * itself with sample employers or sample jobs, because an operator cannot tell a
 * fabricated row from a real one, and an approval click would then act on data
 * that does not exist.
 */

export function AdminModerationTab() {
  const [subSection, setSubSection] = useState<'applications' | 'jobs' | 'companies' | 'tenants'>('applications');
  const [applications, setApplications] = useState<EmployerApplication[]>([]);
  const [jobs, setJobs] = useState<JobModerationItem[]>([]);
  const [feedback, setFeedback] = useState<AdminFeedback | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // One in-flight decision at a time, keyed by record id, so a double click can
  // never submit two conflicting administrative decisions.
  const [pendingApplicationId, setPendingApplicationId] = useState<string | null>(null);
  const [pendingJobId, setPendingJobId] = useState<string | null>(null);

  // Modals state
  const [inspectApplication, setInspectApplication] = useState<EmployerApplication | null>(null);
  const [reviewConfirmation, setReviewConfirmation] = useState<{
    app: EmployerApplication;
    action: 'approve' | 'reject';
  } | null>(null);
  const [reviewReason, setReviewReason] = useState('');
  const [jobSpamModal, setJobSpamModal] = useState<{
    job: JobModerationItem;
    action: 'flag' | 'clear';
  } | null>(null);

  // Escape key handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (reviewConfirmation) {
          setReviewConfirmation(null);
          setReviewReason('');
        } else if (jobSpamModal) {
          setJobSpamModal(null);
        } else if (inspectApplication) {
          setInspectApplication(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [reviewConfirmation, jobSpamModal, inspectApplication]);

  const loadApplicationsAndJobs = async () => {
    setLoading(true);
    setLoadError(null);
    const failures: string[] = [];
    try {
      try {
        const appRes = await get<{ applications?: any[] }>('/admin/employer-applications');
        const list = Array.isArray(appRes?.applications) ? appRes.applications : [];
        setApplications(
          list.map((a: any) => ({
            id: String(a.id ?? a.uid ?? ''),
            source: a.source === 'APPLICATION_SUBMISSION' ? 'APPLICATION_SUBMISSION' : 'COMPANY_PROFILE',
            companyName: a.companyName || a.company || a.name || 'Unnamed organization',
            contactEmail: a.contactEmail || a.email || '',
            contactPerson: a.contactPerson || a.contactName || '',
            contactPersonTitle: a.contactPersonTitle || '',
            contactPhone: a.contactPhone || a.phone || '',
            // The server omits tax/contact data for read-only roles; never invent it.
            taxId: a.taxId || a.gstin || '',
            website: a.website || '',
            location: a.location || '',
            companySize: a.companySize || a.size || '',
            companyDescription: a.companyDescription || a.description || '',
            linkedinProfile: a.linkedinProfile || '',
            status: String(a.status || 'PENDING').toUpperCase() as 'PENDING' | 'APPROVED' | 'REJECTED',
            submittedAt: a.submittedAt || a.createdAt || '',
          }))
        );
      } catch (err) {
        failures.push(`employer applications (${normalizeError(err).message})`);
      }

      try {
        const jobRes = await get<{ jobs?: any[]; allJobs?: any[] }>('/admin/jobs?limit=100');
        const list = Array.isArray(jobRes?.jobs) ? jobRes.jobs : Array.isArray(jobRes?.allJobs) ? jobRes.allJobs : [];
        setJobs(
          list.map((j: any) => {
            const status = String(j.status || 'pending').toLowerCase();
            return {
              id: String(j.id ?? ''),
              title: j.title || 'Untitled role',
              company: j.company || j.companyName || j.company_name || '',
              location: j.location || '',
              status,
              isSpam: j.isSpam === true || status === 'flagged',
              publiclyVisible: status === 'active',
              postedAt: j.postedAt || j.postedDate || j.createdAt || '',
            };
          })
        );
      } catch (err) {
        failures.push(`job listings (${normalizeError(err).message})`);
      }

      if (failures.length) {
        setLoadError(`Failed to load ${failures.join(' and ')}.`);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadApplicationsAndJobs();
  }, []);

  const showError = (text: string) => {
    setFeedback({ type: 'error', text });
    setTimeout(() => setFeedback((current) => (current?.text === text ? null : current)), 6000);
  };

  const showSuccess = (text: string) => {
    setFeedback({ type: 'success', text });
    setTimeout(() => setFeedback((current) => (current?.text === text ? null : current)), 4000);
  };

  const reviewApplication = async (
    application: EmployerApplication,
    decision: 'APPROVED' | 'REJECTED',
    reason?: string
  ) => {
    if (pendingApplicationId) return;
    if (decision === 'REJECTED' && !reason?.trim()) {
      showError('A rejection reason is required before the decision can be submitted.');
      return;
    }
    setPendingApplicationId(application.id);
    try {
      const res = await post<{
        success?: boolean;
        decision?: string;
        status?: string;
        application?: { status?: string };
        notification?: { state?: string };
        warnings?: string[];
      }>(`/admin/employer-applications/${application.id}/verify`, {
        decision,
        reason: decision === 'REJECTED' ? reason?.trim() : undefined,
      });

      // The served handler may confirm through `decision` or `application.status`.
      const confirmed = String(
        res?.decision || res?.application?.status || res?.status || decision
      ).toUpperCase() as 'APPROVED' | 'REJECTED';
      // Only a server-confirmed decision is reflected locally.
      setApplications((prev) =>
        prev.map((a) => (a.id === application.id ? { ...a, status: confirmed } : a))
      );
      setReviewConfirmation(null);
      setInspectApplication(null);
      setReviewReason('');

      // Only describe the applicant notification when the server reports it.
      const notificationState = res?.notification?.state;
      const notificationNote = notificationState
        ? notificationState === 'QUEUED'
          ? ' Applicant notification queued for delivery.'
          : ` Applicant notification: ${notificationState.replace(/_/g, ' ').toLowerCase()}.`
        : '';
      showSuccess(
        `${application.companyName} was ${confirmed === 'APPROVED' ? 'approved and verified' : 'rejected'}.${notificationNote}`
      );
      if (Array.isArray(res?.warnings) && res.warnings.length) {
        showError(res.warnings.join(' '));
      }
      // Reconcile the queue with the server rather than trusting local edits.
      await loadApplicationsAndJobs();
    } catch (err) {
      showError(`Failed to ${decision === 'APPROVED' ? 'approve' : 'reject'} ${application.companyName}: ${normalizeError(err).message}`);
    } finally {
      setPendingApplicationId(null);
    }
  };

  const handleApproveApplication = (appId: string) => {
    const application = applications.find((a) => a.id === appId);
    if (!application) {
      showError('That application is no longer in the queue. Reload the queue before deciding.');
      return;
    }
    void reviewApplication(application, 'APPROVED');
  };

  const handleRejectApplication = (appId: string, reason: string) => {
    const application = applications.find((a) => a.id === appId);
    if (!application) {
      showError('That application is no longer in the queue. Reload the queue before deciding.');
      return;
    }
    void reviewApplication(application, 'REJECTED', reason);
  };

  const handleToggleJobSpam = async (jobId: string, isSpam: boolean) => {
    if (pendingJobId) return;
    setPendingJobId(jobId);
    try {
      const requestedStatus = isSpam ? 'flagged' : 'active';
      const res = await post<{
        success?: boolean;
        job?: { status?: string; isSpam?: boolean; publiclyVisible?: boolean };
        status?: string;
        isSpam?: boolean;
        warnings?: string[];
      }>(`/admin/jobs/${jobId}/moderate`, { status: requestedStatus, isSpam });

      // Prefer the nested record the moderation router returns, then the flat
      // status/isSpam pair other handlers confirm with, then the request.
      const confirmedStatus = String(res?.job?.status || res?.status || requestedStatus).toLowerCase();
      const confirmedSpam = res?.job?.isSpam ?? res?.isSpam ?? isSpam;
      setJobs((prev) =>
        prev.map((j) =>
          j.id === jobId
            ? { ...j, status: confirmedStatus, isSpam: confirmedSpam, publiclyVisible: confirmedStatus === 'active' }
            : j
        )
      );
      setJobSpamModal(null);
      showSuccess(
        `Job ${jobId} is now ${confirmedStatus.toUpperCase()}${confirmedSpam ? ' (flagged as spam)' : ''}.`
      );
      if (Array.isArray(res?.warnings) && res.warnings.length) showError(res.warnings.join(' '));
      await loadApplicationsAndJobs();
    } catch (err) {
      showError(`Failed to update job status: ${normalizeError(err).message}`);
    } finally {
      setPendingJobId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* ─── Header & Sub-Navigation ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-ink flex items-center gap-2">
            <ShieldCheck className="size-5 text-brand-600" />
            Marketplace & Hiring Moderation
          </h2>
          <p className="text-xs text-ink-muted">
            Employer company document verifications, global job postings anti-spam moderation, and tenant quota controls.
          </p>
        </div>

        <div className="flex items-center gap-1.5 text-xs">
          {[
            { id: 'applications', label: 'Employer Verifications' },
            { id: 'jobs', label: 'Job Moderation' },
            { id: 'companies', label: 'Company Badges' },
            { id: 'tenants', label: 'Tenants Registry' },
          ].map((sec) => (
            <button
              key={sec.id}
              onClick={() => setSubSection(sec.id as any)}
              className={cn(
                'rounded-lg px-3 py-1 font-semibold transition-colors cursor-pointer',
                subSection === sec.id
                  ? 'bg-brand-600 text-white'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-ink-muted hover:bg-neutral-200'
              )}
            >
              {sec.label}
            </button>
          ))}
        </div>
      </div>

      {feedback && (
        <div
          role={feedback.type === 'error' ? 'alert' : 'status'}
          className={cn(
            'rounded-xl border p-3 text-xs flex items-center gap-2 animate-[fade-in_150ms_ease-out]',
            feedback.type === 'error'
              ? 'border-rose-200 bg-rose-50 text-rose-800'
              : 'border-emerald-200 bg-emerald-50 text-emerald-800'
          )}
        >
          {feedback.type === 'error' ? (
            <AlertTriangle className="size-4 text-rose-600 shrink-0" />
          ) : (
            <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {loadError && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 flex flex-wrap items-center justify-between gap-2"
        >
          <span className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-rose-600 shrink-0" />
            <span>{loadError}</span>
          </span>
          <Button variant="outline" size="xs" onClick={() => void loadApplicationsAndJobs()} loading={loading}>
            Retry
          </Button>
        </div>
      )}

      {/* ─── Sub-Section 1: Employer Applications ─── */}
      {subSection === 'applications' && (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
            <table className="w-full text-xs min-w-[700px]">
              <thead className="bg-canvas border-b border-border">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-ink-secondary">Company Name & Tax ID</th>
                  <th className="px-4 py-3 text-left font-semibold text-ink-secondary">Contact Email</th>
                  <th className="px-4 py-3 text-left font-semibold text-ink-secondary">Official Domain</th>
                  <th className="px-4 py-3 text-left font-semibold text-ink-secondary">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-ink-secondary">Submitted</th>
                  <th className="px-4 py-3 text-right font-semibold text-ink-secondary">Verification Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-ink-muted">
                      Loading the employer verification queue…
                    </td>
                  </tr>
                )}
                {!loading && applications.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-ink-muted">
                      No employer applications are awaiting review.
                    </td>
                  </tr>
                )}
                {!loading && applications.map((app) => (
                  <tr key={app.id} className="hover:bg-neutral-25 dark:hover:bg-neutral-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-bold text-ink">{app.companyName}</div>
                      <div className="text-[11px] text-ink-muted font-mono">
                        Tax ID: {app.taxId || 'Not disclosed to this role'}
                      </div>
                      <div className="text-[10px] uppercase tracking-wide text-ink-muted">
                        {app.source === 'APPLICATION_SUBMISSION' ? 'Submitted application' : 'Company profile'}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-ink-secondary">{app.contactEmail || '—'}</td>
                    <td className="px-4 py-3">
                      {app.website ? (
                        <a href={app.website} target="_blank" rel="noreferrer" className="text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1">
                          {app.website.replace('https://', '')}
                          <ExternalLink className="size-3" />
                        </a>
                      ) : (
                        <span className="text-ink-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase',
                          app.status === 'APPROVED'
                            ? 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50'
                            : app.status === 'REJECTED'
                            ? 'bg-rose-100 dark:bg-rose-950/50 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800/50'
                            : 'bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50'
                        )}
                      >
                        {app.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-ink-muted">{app.submittedAt}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => setInspectApplication(app)}
                          className="h-7 px-2 text-xs font-semibold text-brand-600 hover:text-brand-700"
                        >
                          <Eye className="size-3.5 mr-1" />
                          Dossier
                        </Button>
                        {app.status === 'PENDING' ? (
                          <>
                            <Button
                              variant="success"
                              size="xs"
                              onClick={() => setReviewConfirmation({ app, action: 'approve' })}
                              disabled={pendingApplicationId === app.id}
                              loading={pendingApplicationId === app.id}
                              className="h-7 px-2 text-xs"
                            >
                              <Check className="size-3 mr-1" />
                              Verify
                            </Button>
                            <Button
                              variant="destructive"
                              size="xs"
                              onClick={() => setReviewConfirmation({ app, action: 'reject' })}
                              disabled={pendingApplicationId === app.id}
                              loading={pendingApplicationId === app.id}
                              className="h-7 px-2 text-xs"
                            >
                              <X className="size-3 mr-1" />
                              Reject
                            </Button>
                          </>
                        ) : (
                          <span className="text-ink-muted text-[11px] font-mono">Audited</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── Sub-Section 2: Job Postings Moderation ─── */}
      {subSection === 'jobs' && (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
            <table className="w-full text-xs min-w-[700px]">
              <thead className="bg-canvas border-b border-border">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-ink-secondary">Job Title & Employer</th>
                  <th className="px-4 py-3 text-left font-semibold text-ink-secondary">Location</th>
                  <th className="px-4 py-3 text-left font-semibold text-ink-secondary">Spam Filter</th>
                  <th className="px-4 py-3 text-left font-semibold text-ink-secondary">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-ink-secondary">Posted</th>
                  <th className="px-4 py-3 text-right font-semibold text-ink-secondary">Moderation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-ink-muted">
                      Loading the job moderation queue…
                    </td>
                  </tr>
                )}
                {!loading && jobs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-ink-muted">
                      No job listings were returned by the marketplace.
                    </td>
                  </tr>
                )}
                {!loading && jobs.map((job) => (
                  <tr key={job.id} className="hover:bg-neutral-25 dark:hover:bg-neutral-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-bold text-ink">{job.title}</div>
                      <div className="text-[11px] text-ink-muted">{job.company}</div>
                    </td>
                    <td className="px-4 py-3 text-ink-secondary">{job.location}</td>
                    <td className="px-4 py-3">
                      {job.isSpam ? (
                        <span className="rounded bg-rose-100 dark:bg-rose-950/50 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800/50 px-2 py-0.5 text-[10px] font-bold">
                          SPAM FLAGGED
                        </span>
                      ) : (
                        <span className="rounded bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50 px-2 py-0.5 text-[10px] font-bold">
                          CLEAN
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase', job.status === 'active' ? 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50' : 'bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50')}>
                        {job.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-ink-muted">{job.postedAt}</td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant={job.isSpam ? 'outline' : 'destructive'}
                        size="xs"
                        onClick={() => setJobSpamModal({ job, action: job.isSpam ? 'clear' : 'flag' })}
                        disabled={pendingJobId === job.id}
                        loading={pendingJobId === job.id}
                      >
                        {job.isSpam ? 'Clear Spam Flag' : 'Flag as Spam'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── Sub-Section 3 & 4: Companies & Tenants ─── */}
      {(subSection === 'companies' || subSection === 'tenants') && (
        <Card>
          <CardContent className="p-6 text-center space-y-2">
            <Building2 className="size-8 text-brand-600 mx-auto" />
            <h3 className="text-sm font-bold text-ink">
              {subSection === 'companies' ? 'Enterprise Company Verification Registry' : 'Multi-Tenant Organizations Directory'}
            </h3>
            <p className="text-xs text-ink-muted max-w-md mx-auto">
              Company badges and tenant registries are managed by their own administrative surfaces. This panel does not
              render them, so it makes no claim about their state.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ─── Modal 1: Employer Verification Dossier Modal ─── */}
      {inspectApplication && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/70 backdrop-blur-xs animate-[fade-in_150ms_ease-out]"
          onClick={() => setInspectApplication(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="employer-dossier-title"
        >
          <div
            className="w-full max-w-2xl bg-surface rounded-2xl shadow-2xl border border-border overflow-hidden flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-neutral-950 px-6 py-4 text-white flex items-center justify-between shrink-0 border-b border-neutral-800">
              <div className="flex items-center gap-3 min-w-0">
                <div className="size-10 rounded-xl bg-brand-600 text-white flex items-center justify-center font-bold text-sm shadow-md shrink-0">
                  <Building2 className="size-5" />
                </div>
                <div className="min-w-0">
                  <h3 id="employer-dossier-title" className="text-base font-extrabold text-white truncate font-mono">
                    {inspectApplication.companyName}
                  </h3>
                  <p className="text-xs text-neutral-400 font-mono mt-0.5">
                    Application ID: {inspectApplication.id} · Submitted: {inspectApplication.submittedAt}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectApplication(null)}
                className="p-2 text-neutral-400 hover:text-white rounded-xl hover:bg-neutral-800 transition cursor-pointer"
                aria-label="Close dossier"
              >
                <X className="size-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-neutral-50 p-3 rounded-xl border border-border">
                  <span className="text-[10px] font-bold uppercase text-ink-muted">Verification Status</span>
                  <p className="font-extrabold text-ink mt-0.5">{inspectApplication.status}</p>
                </div>
                <div className="bg-neutral-50 p-3 rounded-xl border border-border">
                  <span className="text-[10px] font-bold uppercase text-ink-muted">Tax ID / VAT</span>
                  <p className="font-extrabold text-ink mt-0.5 font-mono">{inspectApplication.taxId}</p>
                </div>
                <div className="bg-neutral-50 p-3 rounded-xl border border-border">
                  <span className="text-[10px] font-bold uppercase text-ink-muted">Company Size</span>
                  <p className="font-extrabold text-ink mt-0.5">{inspectApplication.companySize || 'N/A'}</p>
                </div>
              </div>

              {/* Organization Profile Details */}
              <div className="space-y-2 bg-neutral-50 p-3.5 rounded-xl border border-border text-xs">
                <h4 className="font-bold text-ink flex items-center gap-1.5 pb-1 border-b border-border">
                  <FileText className="size-3.5 text-brand-600" /> Organization Profile & Identity
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] pt-1">
                  <div>
                    <span className="text-ink-muted block font-semibold">Official Website</span>
                    <a
                      href={inspectApplication.website}
                      target="_blank"
                      rel="noreferrer"
                      className="text-brand-600 font-medium hover:underline flex items-center gap-1 mt-0.5"
                    >
                      <Globe className="size-3" /> {inspectApplication.website}
                    </a>
                  </div>
                  <div>
                    <span className="text-ink-muted block font-semibold">Operating Headquarters</span>
                    <span className="text-ink font-medium flex items-center gap-1 mt-0.5">
                      <MapPin className="size-3 text-ink-muted" /> {inspectApplication.location || 'Not Specified'}
                    </span>
                  </div>
                </div>
                {inspectApplication.companyDescription && (
                  <div className="pt-2 border-t border-border/60">
                    <span className="text-ink-muted block font-semibold">Company Overview</span>
                    <p className="text-ink-secondary mt-0.5 leading-relaxed">{inspectApplication.companyDescription}</p>
                  </div>
                )}
              </div>

              {/* Authorized Contact Person */}
              <div className="space-y-2 bg-neutral-50 p-3.5 rounded-xl border border-border text-xs">
                <h4 className="font-bold text-ink flex items-center gap-1.5 pb-1 border-b border-border">
                  <Mail className="size-3.5 text-brand-600" /> Authorized Representative
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] pt-1">
                  <div>
                    <span className="text-ink-muted block font-semibold">Representative Name</span>
                    <span className="text-ink font-semibold mt-0.5 block">{inspectApplication.contactPerson || 'Official Representative'}</span>
                    <span className="text-ink-muted text-[10px]">{inspectApplication.contactPersonTitle || 'Authorized Signatory'}</span>
                  </div>
                  <div>
                    <span className="text-ink-muted block font-semibold">Contact Channels</span>
                    <span className="text-ink font-mono text-[11px] block mt-0.5">{inspectApplication.contactEmail}</span>
                    <span className="text-ink-muted font-mono text-[10px]">{inspectApplication.contactPhone || '—'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="p-4 bg-neutral-50 border-t border-border flex items-center justify-between">
              <Button variant="outline" size="sm" onClick={() => setInspectApplication(null)} className="text-xs">
                Close Dossier
              </Button>
              {inspectApplication.status === 'PENDING' && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      const app = inspectApplication;
                      setInspectApplication(null);
                      setReviewConfirmation({ app, action: 'reject' });
                    }}
                    className="text-xs"
                  >
                    <X className="size-3 mr-1" />
                    Reject Application
                  </Button>
                  <Button
                    variant="success"
                    size="sm"
                    onClick={() => {
                      const app = inspectApplication;
                      setInspectApplication(null);
                      setReviewConfirmation({ app, action: 'approve' });
                    }}
                    className="text-xs font-semibold"
                  >
                    <Check className="size-3 mr-1" />
                    Approve & Verify Organization
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal 2: Audited Approval/Rejection Reason Confirmation Modal ─── */}
      {reviewConfirmation && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-neutral-950/70 backdrop-blur-xs animate-[fade-in_150ms_ease-out]"
          onClick={() => setReviewConfirmation(null)}
          role="alertdialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-md bg-surface rounded-2xl shadow-2xl border border-border overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className={cn(
                'p-4 border-b flex items-center gap-3',
                reviewConfirmation.action === 'reject' ? 'bg-rose-50 border-rose-100 text-rose-900' : 'bg-emerald-50 border-emerald-100 text-emerald-900'
              )}
            >
              {reviewConfirmation.action === 'reject' ? (
                <AlertTriangle className="size-5 text-rose-600" />
              ) : (
                <Check className="size-5 text-emerald-600" />
              )}
              <h3 className="font-bold text-sm">
                {reviewConfirmation.action === 'reject' ? 'Reject Employer Application?' : 'Approve & Verify Employer?'}
              </h3>
            </div>
            <div className="p-5 space-y-3 text-xs">
              <p className="text-ink-muted leading-relaxed">
                Target organization: <strong className="text-ink">{reviewConfirmation.app.companyName}</strong> (Tax ID: {reviewConfirmation.app.taxId}).
                {reviewConfirmation.action === 'approve'
                  ? ' This will award the verified employer badge and grant full access to candidate resumes and hiring tools.'
                  : ' Please specify the mandatory audited rejection reason for the applicant and platform audit logs.'}
              </p>

              {reviewConfirmation.action === 'reject' && (
                <div>
                  <label className="font-semibold text-ink block mb-1">
                    Audited Rejection Justification <span className="text-rose-600">*</span>
                  </label>
                  <textarea
                    rows={3}
                    autoFocus
                    required
                    placeholder="e.g. Invalid commercial Tax ID, unverified domain, or failed background check..."
                    value={reviewReason}
                    onChange={(e) => setReviewReason(e.target.value)}
                    className="w-full rounded-lg border border-border p-2.5 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
              )}
            </div>
            <div className="p-4 pt-2 flex justify-end gap-2 bg-neutral-50/50 border-t border-border">
              <Button variant="outline" size="sm" onClick={() => setReviewConfirmation(null)} className="text-xs">
                Cancel
              </Button>
              <Button
                variant={reviewConfirmation.action === 'reject' ? 'destructive' : 'primary'}
                size="sm"
                loading={pendingApplicationId !== null}
                onClick={() => {
                  if (pendingApplicationId) return;
                  if (reviewConfirmation.action === 'reject') {
                    if (!reviewReason.trim()) {
                      showError('A rejection reason is required and is recorded in the audit trail.');
                      return;
                    }
                    handleRejectApplication(reviewConfirmation.app.id, reviewReason.trim());
                  } else {
                    handleApproveApplication(reviewConfirmation.app.id);
                  }
                }}
                disabled={pendingApplicationId !== null || (reviewConfirmation.action === 'reject' && !reviewReason.trim())}
                className={cn('text-xs font-bold', reviewConfirmation.action === 'approve' && 'bg-emerald-600 hover:bg-emerald-700 text-white')}
              >
                {reviewConfirmation.action === 'reject' ? 'Confirm Rejection' : 'Confirm Verification'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal 3: Job Spam Moderation Confirmation Dialog ─── */}
      {jobSpamModal && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-neutral-950/70 backdrop-blur-xs animate-[fade-in_150ms_ease-out]"
          onClick={() => setJobSpamModal(null)}
          role="alertdialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-sm bg-surface rounded-2xl shadow-2xl border border-border overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className={cn(
                'p-4 border-b flex items-center gap-3',
                jobSpamModal.action === 'flag' ? 'bg-rose-50 border-rose-100 text-rose-900' : 'bg-emerald-50 border-emerald-100 text-emerald-900'
              )}
            >
              <AlertTriangle className={cn('size-5', jobSpamModal.action === 'flag' ? 'text-rose-600' : 'text-emerald-600')} />
              <h3 className="font-bold text-sm">
                {jobSpamModal.action === 'flag' ? 'Flag Job Listing as Spam?' : 'Clear Spam Flag & Restore Job?'}
              </h3>
            </div>
            <div className="p-5 text-xs text-ink-muted leading-relaxed">
              Job listing: <strong className="text-ink">{jobSpamModal.job.title}</strong> by {jobSpamModal.job.company}.
              {jobSpamModal.action === 'flag'
                ? ' This listing will be immediately suppressed from the candidate job board.'
                : ' This listing will be restored to active visibility across candidate searches.'}
            </div>
            <div className="p-4 pt-2 flex justify-end gap-2 bg-neutral-50/50 border-t border-border">
              <Button variant="outline" size="sm" onClick={() => setJobSpamModal(null)} className="text-xs">
                Cancel
              </Button>
              <Button
                variant={jobSpamModal.action === 'flag' ? 'destructive' : 'primary'}
                size="sm"
                onClick={() => void handleToggleJobSpam(jobSpamModal.job.id, jobSpamModal.action === 'flag')}
                disabled={pendingJobId !== null}
                loading={pendingJobId !== null}
                className="text-xs font-bold"
              >
                {jobSpamModal.action === 'flag' ? 'Flag as Spam' : 'Restore Listing'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
