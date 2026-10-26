/**
 * Marketplace moderation: employer applications, job postings, companies and organizations.
 *
 * Every list is a server read and every decision is a server write:
 *
 *   GET   /api/admin/employer-applications          canonical_documents('employer_applications')
 *   PATCH /api/admin/employer-applications/:uid     status + expectedStatus + reason (409 on drift)
 *   GET   /api/admin/jobs?limit=                    jobs table, filtered and paginated server-side
 *   PATCH /api/admin/jobs/:jobId                    exactly one of {status} | {isFeatured}
 *   GET   /api/admin/companies                      companies table (+ jobs counted server-side)
 *   GET   /api/enterprise/tenants                   organizations this operator can see
 *
 * What this replaced: two hard-coded catalogues (`DEFAULT_APPLICATIONS` with invented
 * companies, tax ids and phone numbers; `DEFAULT_JOBS` with an invented spam posting), an
 * approve/reject flow that posted to a route that does not exist
 * (`/admin/employer-applications/:id/verify`) and then announced success anyway, and a
 * "mark spam" action posting to another non-existent route (`/admin/jobs/:id/moderate`).
 * A moderation console whose approvals do not reach the identity provider is a compliance
 * incident waiting to be discovered, so the decisions now use the endpoints that exist — the
 * application route is the one that sets `employer: true` in custom claims and revokes tokens.
 */

import { useCallback, useMemo, useState } from 'react';
import { Building2, Check, ExternalLink, ShieldCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { get, patch } from '@/lib/api-client';
import { AdminEmptyPanel, AdminErrorPanel, AdminLoadingPanel } from './AdminDataState';
import { useAdminResource } from './use-admin-resource';
import { describeAdminFailure } from './admin-data-state';
import { readTenantOptions, type TenantOption } from './admin-users-model';

interface EmployerApplication {
  id: string;
  companyName?: string;
  name?: string;
  contactEmail?: string;
  email?: string;
  contactPerson?: string;
  website?: string;
  location?: string;
  companySize?: string;
  status?: string;
  submittedAt?: string;
  reviewedAt?: string;
  rejectionReason?: string;
}

interface JobRow {
  id: string;
  title?: string;
  company?: string;
  location?: string;
  status?: string;
  isFeatured?: boolean;
  applicants?: number;
  createdAt?: string;
  updatedAt?: string;
}

interface CompanyRow {
  id: string;
  name?: string;
  displayName?: string;
  domain?: string;
  website?: string;
  verified?: boolean;
  createdAt?: string;
}

type Section = 'applications' | 'jobs' | 'companies' | 'organizations';

const STATUS_PILL: Record<string, string> = {
  pending: 'bg-warning-50 text-warning-700 border-warning-100',
  approved: 'bg-success-50 text-success-700 border-success-100',
  active: 'bg-success-50 text-success-700 border-success-100',
  rejected: 'bg-error-50 text-error-700 border-error-100',
  inactive: 'bg-neutral-100 text-ink-secondary border-border dark:bg-neutral-800',
  archived: 'bg-neutral-100 text-ink-muted border-border dark:bg-neutral-800',
};

function statusPill(status: string | undefined): string {
  return STATUS_PILL[String(status ?? '').toLowerCase()] ?? 'bg-neutral-100 text-ink-secondary border-border dark:bg-neutral-800';
}

export function AdminModerationTab() {
  const [section, setSection] = useState<Section>('applications');
  const [flash, setFlash] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const announce = (tone: 'success' | 'error', text: string) => setFlash({ tone, text });
  const report = (error: unknown) => {
    const failure = describeAdminFailure(error);
    announce('error', `${failure.message} (${failure.code}${failure.requestId ? ` · request ${failure.requestId}` : ''})`);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-ink">Marketplace moderation</h2>
        <p className="text-xs text-ink-muted">
          Employer verification, job postings, the company registry and organization access.
          Nothing is approved locally: each decision is a server write with a revision guard.
        </p>
      </div>

      {flash && (
        <div
          role={flash.tone === 'success' ? 'status' : 'alert'}
          className={cn(
            'flex items-start gap-2 rounded-xl border p-3 text-xs',
            flash.tone === 'success'
              ? 'border-success-100 bg-success-50 text-success-700'
              : 'border-error-100 bg-error-50 text-error-700',
          )}
        >
          {flash.tone === 'success' ? <Check className="mt-0.5 size-4 shrink-0" /> : <X className="mt-0.5 size-4 shrink-0" />}
          <span className="flex-1">{flash.text}</span>
          <button type="button" onClick={() => setFlash(null)} className="min-h-11 cursor-pointer px-2 text-2xs font-bold uppercase focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 sm:min-h-9">Dismiss</button>
        </div>
      )}

      <div role="tablist" aria-label="Moderation sections" className="flex gap-1 overflow-x-auto border-b border-border">
        {(
          [
            { id: 'applications', label: 'Employer applications' },
            { id: 'jobs', label: 'Job postings' },
            { id: 'companies', label: 'Company registry' },
            { id: 'organizations', label: 'Organizations' },
          ] as const
        ).map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={section === entry.id}
            aria-controls={`moderation-panel-${entry.id}`}
            onClick={() => setSection(entry.id)}
            className={cn(
              'min-h-11 cursor-pointer whitespace-nowrap border-b-2 px-3 text-xs font-bold transition-colors',
              section === entry.id ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-muted hover:text-ink',
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {section === 'applications' && <ApplicationsPanel announce={announce} report={report} />}
      {section === 'jobs' && <JobsPanel announce={announce} report={report} />}
      {section === 'companies' && <CompaniesPanel />}
      {section === 'organizations' && <OrganizationsPanel />}
    </div>
  );
}

/* ── employer applications ───────────────────────────────────────────── */

function ApplicationsPanel({
  announce,
  report,
}: {
  announce: (tone: 'success' | 'error', text: string) => void;
  report: (error: unknown) => void;
}) {
  const load = useCallback(
    (signal: AbortSignal) =>
      get<{ applications?: EmployerApplication[]; count?: number; source?: string }>(
        '/admin/employer-applications',
        { limit: 200 },
        { signal },
      ),
    [],
  );
  const resource = useAdminResource(load);
  const applications = resource.data?.applications ?? [];
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const decide = async (application: EmployerApplication, status: 'approved' | 'rejected') => {
    setBusy(application.id);
    try {
      await patch(`/admin/employer-applications/${encodeURIComponent(application.id)}`, {
        status,
        expectedStatus: String(application.status ?? 'pending').toLowerCase(),
        ...(status === 'rejected' && reason.trim() ? { reason: reason.trim() } : {}),
      });
      announce(
        'success',
        `${application.companyName || application.name || application.id} ${status}. Employer claim and token revocation were applied by the server.`,
      );
      setRejecting(null);
      setReason('');
      resource.reload();
    } catch (error) {
      report(error);
    } finally {
      setBusy(null);
    }
  };

  if (resource.status === 'loading' && resource.data === null) {
    return <AdminLoadingPanel label="Reading employer applications…" />;
  }
  if (resource.status === 'failed' && resource.error) {
    return <AdminErrorPanel title="Employer applications could not be read" error={resource.error} onRetry={resource.reload} />;
  }
  if (applications.length === 0) {
    return (
      <AdminEmptyPanel
        title="No employer application"
        description="No organization has applied for employer verification. Nothing is awaiting review."
        tone="success"
      />
    );
  }

  return (
    <section id="moderation-panel-applications" role="tabpanel" className="space-y-3">
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
        {applications.map((application) => (
          <li key={application.id} className="space-y-2 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-ink">
                  {application.companyName || application.name || application.id}
                  <span className={cn('rounded-full border px-2 py-0.5 text-2xs font-bold uppercase', statusPill(application.status))}>
                    {application.status ?? 'unknown'}
                  </span>
                </p>
                <p className="text-2xs text-ink-muted">
                  {application.contactEmail || application.email || 'no contact email'}
                  {application.contactPerson ? ` · ${application.contactPerson}` : ''}
                  {application.location ? ` · ${application.location}` : ''}
                  {application.companySize ? ` · ${application.companySize}` : ''}
                </p>
                <p className="text-2xs text-ink-muted">
                  id <span className="font-mono">{application.id}</span>
                  {application.submittedAt ? ` · submitted ${application.submittedAt}` : ''}
                  {application.rejectionReason ? ` · reason: ${application.rejectionReason}` : ''}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {application.website && (
                  <a
                    href={application.website}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-11 items-center gap-1 text-2xs font-bold text-brand-700 hover:underline sm:min-h-9"
                  >
                    Website
                    <ExternalLink className="size-3" />
                  </a>
                )}
                <Button
                  variant="primary"
                  size="sm"
                  loading={busy === application.id}
                  disabled={String(application.status ?? '').toLowerCase() === 'approved'}
                  onClick={() => decide(application, 'approved')}
                  className="min-h-11 sm:min-h-9"
                >
                  <Check className="mr-1 size-3.5" />
                  Approve
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={String(application.status ?? '').toLowerCase() === 'rejected'}
                  onClick={() => setRejecting(rejecting === application.id ? null : application.id)}
                  className="min-h-11 sm:min-h-9"
                >
                  Reject
                </Button>
              </div>
            </div>

            {rejecting === application.id && (
              <div className="space-y-2 rounded-lg border border-error-100 bg-error-50 p-3">
                <label htmlFor={`reason-${application.id}`} className="block text-2xs font-bold text-error-700">
                  Rejection reason (stored on the application and in the audit row)
                </label>
                <Input
                  id={`reason-${application.id}`}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Why this application is refused"
                  className="h-11 border-error-100 bg-surface text-xs sm:h-9"
                />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setRejecting(null)} className="min-h-11 sm:min-h-9">
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    loading={busy === application.id}
                    disabled={reason.trim().length < 3}
                    onClick={() => decide(application, 'rejected')}
                    className="min-h-11 sm:min-h-9"
                  >
                    Confirm rejection
                  </Button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      <p className="text-2xs text-ink-muted">
        {applications.length} applications · source {resource.data?.source ?? 'unknown'}
      </p>
    </section>
  );
}

/* ── jobs ────────────────────────────────────────────────────────────── */

function JobsPanel({
  announce,
  report,
}: {
  announce: (tone: 'success' | 'error', text: string) => void;
  report: (error: unknown) => void;
}) {
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'active' | 'inactive' | 'archived'>('all');
  const load = useCallback(
    (signal: AbortSignal) =>
      get<{ jobs?: JobRow[]; pagination?: { totalItems?: number; totalPages?: number }; allJobs?: JobRow[] }>(
        '/admin/jobs',
        { limit: 100, status: statusFilter },
        { signal },
      ),
    [statusFilter],
  );
  const resource = useAdminResource(load);
  const jobs = useMemo(() => resource.data?.jobs ?? [], [resource.data]);
  const [busy, setBusy] = useState<string | null>(null);

  const changeStatus = async (job: JobRow, status: 'active' | 'inactive' | 'archived') => {
    setBusy(job.id);
    try {
      await patch(`/admin/jobs/${encodeURIComponent(job.id)}`, {
        status,
        expectedStatus: job.status,
      });
      announce('success', `Job ${job.id} set to ${status}.`);
      resource.reload();
    } catch (error) {
      report(error);
    } finally {
      setBusy(null);
    }
  };

  const toggleFeatured = async (job: JobRow) => {
    setBusy(job.id);
    try {
      await patch(`/admin/jobs/${encodeURIComponent(job.id)}`, {
        isFeatured: job.isFeatured !== true,
        expectedFeatured: job.isFeatured === true,
      });
      announce('success', `Job ${job.id} ${job.isFeatured ? 'unfeatured' : 'featured'}.`);
      resource.reload();
    } catch (error) {
      report(error);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section id="moderation-panel-jobs" role="tabpanel" className="space-y-3">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter jobs by status">
        {(['all', 'pending', 'active', 'inactive', 'archived'] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={statusFilter === option}
            onClick={() => {
              setStatusFilter(option);
              // The resource hook refetches on `reload()`, not on loader identity: the
              // filter is a query parameter, so changing it must ask for a new read.
              resource.reload();
            }}
            className={cn(
              'min-h-11 cursor-pointer rounded-lg px-3 text-xs font-semibold transition-colors',
              statusFilter === option ? 'bg-brand-600 text-white' : 'bg-neutral-100 text-ink-muted dark:bg-neutral-800',
            )}
          >
            {option}
          </button>
        ))}
      </div>

      {resource.status === 'loading' && resource.data === null && <AdminLoadingPanel label="Reading job postings…" />}
      {resource.status === 'failed' && resource.error && (
        <AdminErrorPanel title="Job postings could not be read" error={resource.error} onRetry={resource.reload} />
      )}
      {resource.status === 'ready' && jobs.length === 0 && (
        <AdminEmptyPanel title="No job posting" description="No job matches this status filter." />
      )}

      {jobs.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[860px] text-xs">
            <caption className="sr-only">Job postings, newest first</caption>
            <thead className="border-b border-border bg-canvas">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-semibold text-ink-secondary">Job</th>
                <th scope="col" className="px-3 py-2 text-left font-semibold text-ink-secondary">Company</th>
                <th scope="col" className="px-3 py-2 text-left font-semibold text-ink-secondary">Status</th>
                <th scope="col" className="px-3 py-2 text-left font-semibold text-ink-secondary">Applicants</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold text-ink-secondary">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {jobs.map((job) => (
                <tr key={job.id} className="hover:bg-neutral-25 dark:hover:bg-neutral-800/30">
                  <td className="px-3 py-2">
                    <p className="font-bold text-ink">{job.title ?? 'Untitled'}</p>
                    <p className="text-2xs text-ink-muted">
                      <span className="font-mono">{job.id}</span>
                      {job.location ? ` · ${job.location}` : ''}
                      {job.isFeatured ? ' · featured' : ''}
                    </p>
                  </td>
                  <td className="px-3 py-2 text-ink-secondary">{job.company ?? '—'}</td>
                  <td className="px-3 py-2">
                    <span className={cn('rounded-full border px-2 py-0.5 text-2xs font-bold uppercase', statusPill(job.status))}>
                      {job.status ?? 'unknown'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-ink-secondary">{job.applicants ?? '—'}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() => toggleFeatured(job)}
                        loading={busy === job.id}
                        className="min-h-11 sm:min-h-7"
                      >
                        {job.isFeatured ? 'Unfeature' : 'Feature'}
                      </Button>
                      {job.status !== 'archived' ? (
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => changeStatus(job, 'archived')}
                          loading={busy === job.id}
                          className="min-h-11 text-error-700 sm:min-h-7"
                        >
                          Archive
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => changeStatus(job, 'active')}
                          loading={busy === job.id}
                          className="min-h-11 sm:min-h-7"
                        >
                          Restore
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-2xs text-ink-muted">
        {jobs.length} shown
        {resource.data?.pagination?.totalItems !== undefined ? ` · ${resource.data.pagination.totalItems} match` : ''}
        {' · the job route accepts exactly one change per request (status or featured)'}
      </p>
    </section>
  );
}

/* ── companies ───────────────────────────────────────────────────────── */

function CompaniesPanel() {
  const load = useCallback(
    (signal: AbortSignal) =>
      get<{ companies?: CompanyRow[]; source?: string }>('/admin/companies', undefined, { signal }),
    [],
  );
  const resource = useAdminResource(load);
  const companies = resource.data?.companies ?? [];

  if (resource.status === 'loading' && resource.data === null) {
    return <AdminLoadingPanel label="Reading the company registry…" />;
  }
  if (resource.status === 'failed' && resource.error) {
    return <AdminErrorPanel title="The company registry could not be read" error={resource.error} onRetry={resource.reload} />;
  }
  if (companies.length === 0) {
    return <AdminEmptyPanel title="No company registered" description="The companies table returned no rows." />;
  }

  return (
    <section id="moderation-panel-companies" role="tabpanel" className="space-y-3">
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
        {companies.map((company) => (
          <li key={company.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <Building2 className="size-4 shrink-0 text-brand-600" />
              <div className="min-w-0">
                <p className="truncate text-xs font-bold text-ink">
                  {company.displayName || company.name || company.id}
                  {company.verified === true && (
                    <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-success-100 bg-success-50 px-2 py-0.5 text-2xs font-bold text-success-700">
                      <ShieldCheck className="size-3" />
                      verified
                    </span>
                  )}
                </p>
                <p className="truncate text-2xs text-ink-muted">
                  <span className="font-mono">{company.id}</span>
                  {company.domain ? ` · ${company.domain}` : ''}
                  {company.createdAt ? ` · since ${company.createdAt.slice(0, 10)}` : ''}
                </p>
              </div>
            </div>
            {company.website && (
              <a
                href={company.website}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center gap-1 text-2xs font-bold text-brand-700 hover:underline"
              >
                Website
                <ExternalLink className="size-3" />
              </a>
            )}
          </li>
        ))}
      </ul>
      <p className="text-2xs text-ink-muted">{companies.length} companies · source {resource.data?.source ?? 'unknown'}</p>
    </section>
  );
}

/* ── organizations ───────────────────────────────────────────────────── */

function OrganizationsPanel() {
  const load = useCallback(
    (signal: AbortSignal) => get<unknown>('/enterprise/tenants', undefined, { signal }).then(readTenantOptions),
    [],
  );
  const resource = useAdminResource<TenantOption[]>(load);
  const tenants = resource.data ?? [];

  if (resource.status === 'loading' && resource.data === null) {
    return <AdminLoadingPanel label="Reading organizations…" />;
  }
  if (resource.status === 'failed' && resource.error) {
    return <AdminErrorPanel title="Organizations could not be read" error={resource.error} onRetry={resource.reload} />;
  }
  if (tenants.length === 0) {
    return (
      <AdminEmptyPanel
        title="No organization"
        description="This operator is not a member of any organization. Tenant-level administration needs a tenant registry surface (OI-007-1)."
      />
    );
  }

  return (
    <section id="moderation-panel-organizations" role="tabpanel" className="space-y-3">
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
        {tenants.map((tenant) => (
          <li key={tenant.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-ink">{tenant.displayName}</p>
              <p className="truncate text-2xs text-ink-muted">
                {tenant.slug} · <span className="font-mono">{tenant.id}</span>
              </p>
            </div>
            <span className={cn('rounded-full border px-2 py-0.5 text-2xs font-bold uppercase', statusPill(tenant.lifecycleState))}>
              {tenant.lifecycleState}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-2xs text-ink-muted">
        {tenants.length} organizations · scoped to orgs this operator belongs to; a platform-wide
        registry is OI-007-1.
      </p>
    </section>
  );
}
