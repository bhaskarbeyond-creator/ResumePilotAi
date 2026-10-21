/**
 * Submitted job applications, the candidate's side: /api/jobs-data/applications
 * (MariaDB `applications`, owner-scoped; P002 C14).
 *
 * Candidates apply on the job portal (POST /api/jobs/:jobId/applications) and the
 * employer moves the status (PATCH /api/job-applications/:id/status). Here the
 * candidate reads their own applications, each with the job it was made for, and
 * can withdraw one. The list carries none of the employer's own fields (rating,
 * notes). Status words follow the notifications the candidate receives.
 */
import { del, get, normalizeError } from '@/lib/api-client';
import { createTrackedJob, EMPTY_TRACKER_FIELDS, listTrackedJobs, type TrackedJob, type TrackerStatus } from '@/lib/job-tracker';

export const APPLICATIONS_QUERY_KEY = ['dashboard', 'applications'] as const;

/** The statuses the apply workflow (pending) and the employer workflow write. */
export const APPLICATION_STATUSES = [
  { id: 'pending', label: 'Submitted' },
  { id: 'interview', label: 'Interview' },
  { id: 'accepted', label: 'Accepted' },
  { id: 'rejected', label: 'Not selected' },
] as const;
export type KnownApplicationStatus = (typeof APPLICATION_STATUSES)[number]['id'];

export function isKnownStatus(status: string): status is KnownApplicationStatus {
  return APPLICATION_STATUSES.some((item) => item.id === status);
}

/** A status another workflow wrote is shown as stored, never mapped to a guess. */
export function statusLabel(status: string): string {
  const known = APPLICATION_STATUSES.find((item) => item.id === status);
  if (known) return known.label;
  const words = status.replace(/[_-]+/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Unknown';
}

export interface ApplicationJob {
  title: string;
  company: string;
  location: string;
  /** Open on the public job board now. */
  listed: boolean;
}

export interface Application {
  id: string;
  jobId: string;
  /** Lower-case stored status: pending, interview, accepted, rejected (or another stored value). */
  status: string;
  /** When the application was sent. */
  createdAt: string;
  updatedAt: string;
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string;
  resumeId: string | null;
  coverLetter: string;
  job: ApplicationJob;
}

const text = (value: unknown): string => (typeof value === 'string' ? value : value == null ? '' : String(value));

export function toApplication(raw: unknown): Application {
  const row = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const job = (row.job && typeof row.job === 'object' ? row.job : {}) as Record<string, unknown>;
  return {
    id: text(row.id),
    jobId: text(row.jobId),
    status: text(row.status).trim().toLowerCase() || 'pending',
    createdAt: text(row.createdAt),
    updatedAt: text(row.updatedAt),
    applicantName: text(row.applicantName),
    applicantEmail: text(row.applicantEmail),
    applicantPhone: text(row.applicantPhone),
    resumeId: text(row.resumeId) || null,
    coverLetter: text(row.coverLetter),
    job: { title: text(job.title), company: text(job.company), location: text(job.location), listed: job.listed === true },
  };
}

export async function listApplications(): Promise<Application[]> {
  const data = await get<{ applications?: unknown[] }>('/jobs-data/applications/list');
  return (data.applications ?? []).map(toApplication).filter((application) => application.id);
}

/** `already-gone`: it was withdrawn or removed elsewhere before this request. */
export type WithdrawOutcome = 'withdrawn' | 'already-gone';

/**
 * Withdraws the candidate's own application. The server deletes it, so it leaves
 * the employer's list of applicants too; applying again is a new application.
 */
export async function withdrawApplication(application: Pick<Application, 'id'>): Promise<WithdrawOutcome> {
  try {
    await del(`/jobs-data/applications/${encodeURIComponent(application.id)}`);
    return 'withdrawn';
  } catch (error) {
    const failure = normalizeError(error);
    if (failure.status === 404) return 'already-gone';
    if (failure.status === 403) throw new Error('This application isn’t available to the account you’re signed in with, so it wasn’t withdrawn.');
    throw new Error('Your application couldn’t be withdrawn. Check your connection and try again.');
  }
}

// ── Job Tracker ─────────────────────────────────────────────────────────────

/** The tracker stage that matches where the application stands. */
export function trackerStageFor(status: string): TrackerStatus {
  if (status === 'interview') return 'interview';
  if (status === 'accepted') return 'offer';
  if (status === 'rejected') return 'rejected';
  return 'applied';
}

const sameText = (left: string, right: string) => left.trim().localeCompare(right.trim(), undefined, { sensitivity: 'base' }) === 0;

/** A tracked job with the same title and company (the rule the cover-letter sync uses). */
export function findTrackedJob(jobs: readonly TrackedJob[], application: Application): TrackedJob | undefined {
  const { title, company } = application.job;
  if (!title.trim() || !company.trim()) return undefined;
  return jobs.find((job) => sameText(job.title, title) && sameText(job.company, company));
}

/** YYYY-MM-DD of the day the application was sent, in the candidate's time zone. */
export function appliedOn(application: Pick<Application, 'createdAt'>): string {
  const date = new Date(application.createdAt);
  if (!application.createdAt || Number.isNaN(date.getTime())) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export interface TrackResult {
  /** `existing`: the tracker already had this job, so nothing was added. */
  outcome: 'added' | 'existing';
  job: TrackedJob;
}

/**
 * Adds the application's job to the Job Tracker (POST /api/jobs-data/tracker)
 * at the stage that matches its status, with the date it was sent. A job the
 * tracker already has is not added twice; the list is read again first, so a
 * job tracked in another tab is found too.
 */
export async function trackApplication(application: Application): Promise<TrackResult> {
  const { title, company, location } = application.job;
  if (!title.trim() || !company.trim()) {
    throw new Error('This application has no job title or company, so it can’t be added to your Job Tracker.');
  }
  const existing = findTrackedJob(await listTrackedJobs(), application);
  if (existing) return { outcome: 'existing', job: existing };
  const job = await createTrackedJob({
    ...EMPTY_TRACKER_FIELDS,
    title: title.trim(),
    company: company.trim(),
    location: location.trim(),
    status: trackerStageFor(application.status),
    dateApplied: appliedOn(application),
  });
  return { outcome: 'added', job };
}
