/**
 * Job Tracker data contract: /api/jobs-data/tracker (MariaDB `job_tracker`,
 * owner-scoped). The tracker is the candidate's own list of jobs they follow;
 * submitted applications are a separate resource.
 *
 * Every write carries the row's revision. When the row changed in another tab
 * or device the server answers 409 JOB_TRACKER_CONFLICT with the current
 * revision, so callers can keep the candidate's edits and save on top of it.
 * Field rules mirror normalizeTrackerInput in backend/routes/jobsData.js.
 */
import { del, get, normalizeError, patch, post } from '@/lib/api-client';

export type TrackerStatus = 'wishlist' | 'applied' | 'interview' | 'offer' | 'rejected';

export const TRACKER_STAGES: ReadonlyArray<{ id: TrackerStatus; label: string; hint: string }> = [
  { id: 'wishlist', label: 'Wishlist', hint: 'Saved to apply later.' },
  { id: 'applied', label: 'Applied', hint: 'Sent and waiting for a reply.' },
  { id: 'interview', label: 'Interviewing', hint: 'Screens, interviews and tests.' },
  { id: 'offer', label: 'Offer', hint: 'Offers received.' },
  // The stored status is `rejected`; it covers declined and closed jobs alike.
  { id: 'rejected', label: 'Archived', hint: 'Declined or closed.' },
];

export const WORK_MODES = ['Remote', 'Hybrid', 'On-site'] as const;
export const INTERVIEW_ROUNDS = ['Recruiter Screen', 'Technical', 'System Design', 'Behavioral', 'Hiring Manager'] as const;
export const INTERVIEW_FORMATS = ['Video', 'In-Person', 'Phone'] as const;

export const TRACKER_QUERY_KEY = ['dashboard', 'jobTracker'] as const;

export interface TrackedJob {
  id: string;
  title: string;
  company: string;
  status: TrackerStatus;
  location: string;
  workMode: string;
  salary: string;
  url: string;
  notes: string;
  /** YYYY-MM-DD, or '' */
  dateApplied: string;
  /** YYYY-MM-DD, or '' */
  deadline: string;
  contactPerson: string;
  contactEmail: string;
  interviewRound: string;
  interviewFormat: string;
  /** Wall-clock date and time as entered (YYYY-MM-DDTHH:mm), or '' */
  interviewAt: string;
  interviewLink: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export type TrackerFields = Omit<TrackedJob, 'id' | 'revision' | 'createdAt' | 'updatedAt'>;
export type TrackerFieldName = keyof TrackerFields;

export const FIELD_LIMITS: Partial<Record<TrackerFieldName, number>> = {
  title: 160, company: 160, location: 160, salary: 100, url: 1024, notes: 4000,
  contactPerson: 255, contactEmail: 255, interviewLink: 1024,
};

export const EMPTY_TRACKER_FIELDS: TrackerFields = {
  title: '', company: '', status: 'wishlist', location: '', workMode: '', salary: '', url: '', notes: '',
  dateApplied: '', deadline: '', contactPerson: '', contactEmail: '',
  interviewRound: '', interviewFormat: '', interviewAt: '', interviewLink: '',
};

const STATUSES = new Set<TrackerStatus>(TRACKER_STAGES.map((stage) => stage.id));

export function stageLabel(status: TrackerStatus): string {
  return TRACKER_STAGES.find((stage) => stage.id === status)?.label ?? status;
}

/**
 * The stage a job usually moves to next (legacy DIR-020 AC-2 "advance"), or null.
 * Offers and archived jobs have none: archiving an offer is a decision, not progress.
 */
export function nextStage(status: TrackerStatus): (typeof TRACKER_STAGES)[number] | null {
  const forward: Partial<Record<TrackerStatus, TrackerStatus>> = { wishlist: 'applied', applied: 'interview', interview: 'offer' };
  const target = forward[status];
  return target ? TRACKER_STAGES.find((stage) => stage.id === target) ?? null : null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : value === null || value === undefined ? '' : String(value);
}

/** 'YYYY-MM-DD' from a stored date ('2026-10-02' or '2026-10-02 00:00:00'). */
function dateOnly(value: unknown): string {
  return /^(\d{4}-\d{2}-\d{2})/.exec(text(value).trim())?.[1] ?? '';
}

/** 'YYYY-MM-DDTHH:mm' from a stored wall-clock time ('2026-10-24 10:30:00'). */
function wallClock(value: unknown): string {
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/.exec(text(value).trim());
  return match ? `${match[1]}T${match[2]}` : '';
}

export function toTrackedJob(raw: unknown): TrackedJob {
  const row = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const status = text(row.status).toLowerCase() as TrackerStatus;
  return {
    id: text(row.id),
    title: text(row.title),
    company: text(row.company),
    status: STATUSES.has(status) ? status : 'wishlist',
    location: text(row.location),
    workMode: text(row.workMode),
    salary: text(row.salary),
    url: text(row.url),
    notes: text(row.notes),
    dateApplied: dateOnly(row.dateApplied),
    deadline: dateOnly(row.deadline),
    contactPerson: text(row.contactPerson),
    contactEmail: text(row.contactEmail),
    interviewRound: text(row.interviewRound),
    interviewFormat: text(row.interviewFormat),
    interviewAt: wallClock(row.interviewAt),
    interviewLink: text(row.interviewLink),
    revision: Number(row.revision) > 0 ? Number(row.revision) : 1,
    createdAt: text(row.createdAt),
    updatedAt: text(row.updatedAt),
  };
}

export function fieldsOf(job: TrackedJob): TrackerFields {
  const { id: _id, revision: _revision, createdAt: _created, updatedAt: _updated, ...fields } = job;
  return fields;
}

/** Only the fields that differ from the saved version (an update sends nothing else). */
export function changedFields(saved: TrackerFields, draft: TrackerFields): Partial<TrackerFields> {
  const changes: Partial<TrackerFields> = {};
  for (const key of Object.keys(draft) as TrackerFieldName[]) {
    if (draft[key].trim() !== saved[key].trim()) (changes as Record<string, string>)[key] = draft[key].trim();
  }
  return changes;
}

// ── Validation (mirrors the server rules) ───────────────────────────────────

export type TrackerErrors = Partial<Record<TrackerFieldName, string>>;

function isWebAddress(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function validateTracker(fields: TrackerFields): TrackerErrors {
  const errors: TrackerErrors = {};
  const value = (key: TrackerFieldName) => fields[key].trim();
  if (!value('title')) errors.title = 'Enter the job title.';
  if (!value('company')) errors.company = 'Enter the company.';
  for (const [key, limit] of Object.entries(FIELD_LIMITS) as Array<[TrackerFieldName, number]>) {
    if (!errors[key] && value(key).length > limit) errors[key] = `Use at most ${limit} characters.`;
  }
  if (!errors.url && value('url') && !isWebAddress(value('url'))) errors.url = 'Enter a web address that starts with http:// or https://.';
  if (!errors.interviewLink && value('interviewLink') && !isWebAddress(value('interviewLink'))) {
    errors.interviewLink = 'Enter a meeting link that starts with http:// or https://.';
  }
  if (!errors.contactEmail && value('contactEmail') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value('contactEmail'))) {
    errors.contactEmail = 'Enter an email address like name@example.com.';
  }
  for (const key of ['dateApplied', 'deadline'] as const) {
    if (value(key) && !/^\d{4}-\d{2}-\d{2}$/.test(value(key))) errors[key] = 'Enter a valid date.';
  }
  if (value('interviewAt') && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value('interviewAt'))) errors.interviewAt = 'Enter a valid date and time.';
  if (value('workMode') && !(WORK_MODES as readonly string[]).includes(value('workMode'))) errors.workMode = 'Choose Remote, Hybrid or On-site.';
  if (value('interviewRound') && !(INTERVIEW_ROUNDS as readonly string[]).includes(value('interviewRound'))) errors.interviewRound = 'Choose a round from the list.';
  if (value('interviewFormat') && !(INTERVIEW_FORMATS as readonly string[]).includes(value('interviewFormat'))) errors.interviewFormat = 'Choose a format from the list.';
  return errors;
}

// ── API ─────────────────────────────────────────────────────────────────────

export type TrackerErrorKind = 'validation' | 'conflict' | 'not-found' | 'unavailable';

export class TrackerError extends Error {
  constructor(message: string, readonly kind: TrackerErrorKind, readonly remoteRevision?: number) {
    super(message);
    this.name = 'TrackerError';
  }
}

function toTrackerError(error: unknown): TrackerError {
  const failure = normalizeError(error);
  const details = (failure.details ?? {}) as { remoteRevision?: unknown };
  if (failure.status === 409) {
    const remote = Number(details.remoteRevision);
    return new TrackerError('This job was changed in another tab or device.', 'conflict', Number.isInteger(remote) && remote > 0 ? remote : undefined);
  }
  if (failure.status === 404) return new TrackerError('This job is no longer in your tracker.', 'not-found');
  if (failure.status === 400) return new TrackerError(failure.message || 'Check the highlighted details.', 'validation');
  return new TrackerError('The job tracker could not be reached, so nothing was changed. Try again.', 'unavailable');
}

function payload(fields: Partial<TrackerFields>): Record<string, string> {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, String(value ?? '').trim()]));
}

export async function listTrackedJobs(): Promise<TrackedJob[]> {
  const data = await get<{ jobs?: unknown[] }>('/jobs-data/tracker');
  return (data.jobs ?? []).map(toTrackedJob).filter((job) => job.id);
}

export async function createTrackedJob(fields: TrackerFields): Promise<TrackedJob> {
  try {
    const data = await post<{ job?: unknown }>('/jobs-data/tracker', payload(fields));
    return toTrackedJob(data.job);
  } catch (error) {
    throw toTrackerError(error);
  }
}

/** Sends only `changes`; the response lacks timestamps, so `saved` supplies them. */
export async function updateTrackedJob(saved: TrackedJob, changes: Partial<TrackerFields>, expectedRevision = saved.revision): Promise<TrackedJob> {
  try {
    const data = await patch<{ job?: unknown }>(`/jobs-data/tracker/${encodeURIComponent(saved.id)}`, { ...payload(changes), expectedRevision });
    const updated = toTrackedJob(data.job);
    return { ...updated, createdAt: saved.createdAt, updatedAt: new Date().toISOString() };
  } catch (error) {
    throw toTrackerError(error);
  }
}

export async function deleteTrackedJob(job: TrackedJob, expectedRevision = job.revision): Promise<void> {
  try {
    await del(`/jobs-data/tracker/${encodeURIComponent(job.id)}`, { expectedRevision });
  } catch (error) {
    throw toTrackerError(error);
  }
}
