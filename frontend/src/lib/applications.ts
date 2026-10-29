/**
 * Candidate applications. Verified contract: GET /api/jobs-data/applications/list
 * returns {success, applications}; the shorter /applications path in the mandate
 * is not mounted. This endpoint has no pagination. DELETE withdraws (removes) the
 * owner's application. Employer status and the personal tracker remain separate.
 */
import { apiClient, del, normalizeError } from '@/lib/api-client';
import { createTrackedJob, EMPTY_TRACKER_FIELDS, listTrackedJobs, TrackerError, type TrackedJob, type TrackerStatus } from '@/lib/job-tracker';

export const APPLICATIONS_QUERY_KEY = ['dashboard', 'applications'] as const;
export const APPLICATION_LIFECYCLE = Object.freeze({
  pending: 'APPLIED', applied: 'APPLIED', submitted: 'APPLIED',
  reviewing: 'REVIEWING', in_review: 'REVIEWING',
  interview: 'INTERVIEW_SCHEDULED', interview_scheduled: 'INTERVIEW_SCHEDULED',
  accepted: 'OFFERED', offered: 'OFFERED', rejected: 'REJECTED', declined: 'REJECTED',
} as const);
export type ApplicationLifecycle = typeof APPLICATION_LIFECYCLE[keyof typeof APPLICATION_LIFECYCLE] | 'UNKNOWN';
export type KnownApplicationStatus = keyof typeof APPLICATION_LIFECYCLE;
export const LIFECYCLE_LABELS: Record<ApplicationLifecycle, string> = {
  APPLIED: 'Applied', REVIEWING: 'Reviewing', INTERVIEW_SCHEDULED: 'Interview scheduled',
  OFFERED: 'Offered', REJECTED: 'Rejected', UNKNOWN: 'Unknown status',
};
export function lifecycleStatusFor(status: unknown): ApplicationLifecycle {
  if (typeof status !== 'string') return 'UNKNOWN';
  const key = status.trim().toLowerCase();
  return Object.hasOwn(APPLICATION_LIFECYCLE, key) ? APPLICATION_LIFECYCLE[key as KnownApplicationStatus] : 'UNKNOWN';
}
export function isKnownStatus(status: string): status is KnownApplicationStatus {
  return lifecycleStatusFor(status) !== 'UNKNOWN';
}
export function statusLabel(status: string): string { return LIFECYCLE_LABELS[lifecycleStatusFor(status)]; }

export interface ApplicationJob { title: string; company: string; location: string; listed: boolean; url?: string }
export interface Application {
  id: string; jobId: string; /** Raw employer value, retained for diagnostics. */ status: string;
  createdAt: string; updatedAt: string; applicantName: string; applicantEmail: string; applicantPhone: string;
  resumeId: string | null; coverLetter: string; job: ApplicationJob;
}
const text = (value: unknown): string => typeof value === 'string' ? value : value == null ? '' : String(value);
export function toApplication(raw: unknown): Application {
  const row = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const job = (row.job && typeof row.job === 'object' ? row.job : {}) as Record<string, unknown>;
  return {
    id: text(row.id), jobId: text(row.jobId), status: text(row.status).trim(),
    createdAt: text(row.createdAt), updatedAt: text(row.updatedAt), applicantName: text(row.applicantName),
    applicantEmail: text(row.applicantEmail), applicantPhone: text(row.applicantPhone),
    resumeId: text(row.resumeId) || null, coverLetter: text(row.coverLetter),
    job: { title: text(job.title), company: text(job.company), location: text(job.location), listed: job.listed === true,
      ...(typeof job.url === 'string' && job.url ? { url: job.url } : {}) },
  };
}
export async function listApplications(signal?: AbortSignal): Promise<Application[]> {
  const response = await apiClient.get<{ success?: boolean; applications?: unknown }>('/jobs-data/applications/list', { signal });
  if (response.data?.success !== true || !Array.isArray(response.data.applications)) {
    throw new Error('The applications service returned an unexpected response. Your previous list has been kept.');
  }
  const applications = response.data.applications.map(toApplication);
  if (applications.some((application) => !application.id.trim())) {
    throw new Error('The applications service returned a record without an identifier. Refresh before taking action.');
  }
  return applications;
}
export type WithdrawOutcome = 'withdrawn' | 'already-gone';
export async function withdrawApplication(application: Pick<Application, 'id'>): Promise<WithdrawOutcome> {
  try {
    const data = await del<{ success?: boolean }>(`/jobs-data/applications/${encodeURIComponent(application.id)}`);
    if (data.success !== true) throw new Error('The server did not confirm withdrawal.');
    return 'withdrawn';
  } catch (error) {
    const failure = normalizeError(error);
    if (failure.status === 404) return 'already-gone';
    if (failure.status === 403 || failure.status === 401) throw new Error('This application is not available to your account. It has not been removed from this list.');
    throw new Error('Withdrawal could not be confirmed. Your application is still shown; check your connection and retry.');
  }
}

/** New personal tracker entries start at Applied; later personal moves never change the employer decision. */
export function trackerStageFor(_status: string): TrackerStatus { return 'applied'; }
const normalizedText = (value: string) => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
const sameText = (left: string, right: string) => Boolean(normalizedText(left)) && normalizedText(left) === normalizedText(right);
/** Preserve path case and meaningful query identifiers; only remove fragments and known tracking parameters. */
export function canonicalJobURL(value: string): string {
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) return '';
    url.protocol = url.protocol.toLowerCase(); url.hostname = url.hostname.toLowerCase(); url.hash = '';
    if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80')) url.port = '';
    for (const key of Array.from(url.searchParams.keys())) {
      if (/^utm_/i.test(key) || ['gclid', 'fbclid', 'mc_cid', 'mc_eid'].includes(key.toLowerCase())) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    return url.href;
  } catch { return ''; }
}
/** Optional identity fields are read only when supplied; the current backend does not persist them. */
type TrackerIdentity = TrackedJob & { applicationId?: string; jobId?: string };
export function findTrackedJob(application: Application, trackedJobs: readonly TrackerIdentity[]): TrackedJob | undefined {
  const appUrl = canonicalJobURL(application.job.url ?? '');
  const strongMatch = (job: TrackerIdentity) => Boolean(
    (application.id && job.applicationId === application.id) ||
    (application.jobId && job.jobId === application.jobId) ||
    (appUrl && canonicalJobURL(job.url) === appUrl),
  );
  const strong = trackedJobs.find(strongMatch);
  if (strong) return strong;
  return trackedJobs.find((job) => {
    // Conflicting known identities are authoritative, even when titles match.
    if (job.applicationId && job.applicationId !== application.id) return false;
    if (job.jobId && application.jobId && job.jobId !== application.jobId) return false;
    const sourceUrl = canonicalJobURL(application.job.url ?? '');
    const targetUrl = canonicalJobURL(job.url);
    if (sourceUrl && targetUrl && sourceUrl !== targetUrl) return false;
    return sameText(job.title, application.job.title) && sameText(job.company, application.job.company);
  });
}
export function appliedOn(application: Pick<Application, 'createdAt'>, timeZone?: string): string {
  const date = new Date(application.createdAt);
  if (!application.createdAt || Number.isNaN(date.getTime())) return '';
  if (timeZone) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
    return `${part('year')}-${part('month')}-${part('day')}`;
  }
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
export interface TrackResult { outcome: 'added' | 'existing'; job: TrackedJob }
const inFlight = new Map<string, Promise<TrackResult>>();
async function trackOnce(application: Application): Promise<TrackResult> {
  const { title, company, location } = application.job;
  if (!title.trim() || !company.trim()) throw new Error('This application is missing its job title or company, so it cannot be tracked.');
  const existing = findTrackedJob(application, await listTrackedJobs());
  if (existing) return { outcome: 'existing', job: existing };
  try {
    const job = await createTrackedJob({
      ...EMPTY_TRACKER_FIELDS, title: title.trim(), company: company.trim(), location: location.trim(),
      status: 'applied', dateApplied: appliedOn(application),
      // No applicationId/jobId is sent: the backend has no such fields.
    });
    return { outcome: 'added', job };
  } catch (error) {
    // The verified backend has no create-duplicate code. If a future/edge proxy
    // supplies 409, reconcile rather than pretending the creation succeeded.
    if (error instanceof TrackerError && error.kind === 'conflict') {
      const match = findTrackedJob(application, await listTrackedJobs());
      if (match) return { outcome: 'existing', job: match };
    }
    throw error;
  }
}
/** Coalesce concurrent actions across component instances in this browser session.
 * This is NOT a cross-tab uniqueness guarantee: the server lacks a uniqueness key.
 */
export function trackApplication(application: Application): Promise<TrackResult> {
  const key = application.id ? `application:${application.id}` : `job:${application.jobId || `${normalizedText(application.job.title)}\0${normalizedText(application.job.company)}`}`;
  const current = inFlight.get(key);
  if (current) return current;
  const request = trackOnce(application).finally(() => { if (inFlight.get(key) === request) inFlight.delete(key); });
  inFlight.set(key, request);
  return request;
}
