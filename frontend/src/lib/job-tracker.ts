/**
 * Owner-scoped Job Tracker contract, verified against routes/jobsData.js and
 * MySQLRepository.js. The real update verb is PATCH (not PUT). Every PATCH/DELETE
 * carries expectedRevision. There is no source-application key, uniqueness
 * constraint, interview history, end time, or interview time-zone column.
 */
import { apiClient, del, normalizeError, patch, post } from '@/lib/api-client';

export type TrackerStatus = 'wishlist' | 'applied' | 'interview' | 'offer' | 'rejected';
export const TRACKER_STAGES: ReadonlyArray<{ id: TrackerStatus; label: string; hint: string }> = [
  { id: 'wishlist', label: 'Saved', hint: 'Saved to apply later.' },
  { id: 'applied', label: 'Applied', hint: 'Sent and waiting for a reply.' },
  { id: 'interview', label: 'Interviewing', hint: 'Screens, interviews and tests.' },
  { id: 'offer', label: 'Offer', hint: 'Offers received.' },
  { id: 'rejected', label: 'Archived / Rejected', hint: 'Declined or closed.' },
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
  dateApplied: string;
  deadline: string;
  contactPerson: string;
  contactEmail: string;
  interviewRound: string;
  interviewFormat: string;
  /** The backend's zone-less wall clock, YYYY-MM-DDTHH:mm. Never guess an offset. */
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
const STATUSES = new Set<string>(TRACKER_STAGES.map((stage) => stage.id));
export function isTrackerStage(value: unknown): value is TrackerStatus {
  return typeof value === 'string' && STATUSES.has(value.trim().toLowerCase());
}
export function stageLabel(status: TrackerStatus): string {
  return TRACKER_STAGES.find((stage) => stage.id === status)?.label ?? 'Unknown stage';
}
export function nextStage(status: TrackerStatus): TrackerStatus | null {
  const forward: Partial<Record<TrackerStatus, TrackerStatus>> = { wishlist: 'applied', applied: 'interview', interview: 'offer' };
  return forward[status] ?? null;
}
const text = (value: unknown): string => typeof value === 'string' ? value : value == null ? '' : String(value);
const dateOnly = (value: unknown): string => /^(\d{4}-\d{2}-\d{2})/.exec(text(value).trim())?.[1] ?? '';
function wallClock(value: unknown): string {
  const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(text(value).trim());
  return match ? `${match[1]}T${match[2]}` : '';
}

export type TrackerErrorKind = 'validation' | 'conflict' | 'not-found' | 'unavailable';
export class TrackerError extends Error {
  constructor(message: string, readonly kind: TrackerErrorKind, readonly remoteRevision?: number) {
    super(message);
    this.name = 'TrackerError';
  }
}
export function isRevisionConflict(error: unknown): boolean {
  return error instanceof TrackerError && error.kind === 'conflict';
}
function toTrackerError(error: unknown): TrackerError {
  if (error instanceof TrackerError) return error;
  const failure = normalizeError(error);
  const details = (failure.details ?? {}) as { remoteRevision?: unknown };
  if (failure.status === 409) {
    const remote = Number(details.remoteRevision);
    return new TrackerError('This job was changed in another tab or device. Your action was not applied.', 'conflict', Number.isSafeInteger(remote) && remote > 0 ? remote : undefined);
  }
  if (failure.status === 404) return new TrackerError('This job is no longer in your tracker.', 'not-found');
  if (failure.status === 400 || failure.status === 422) return new TrackerError(failure.message || 'Check the highlighted details.', 'validation');
  if (failure.status === 401 || failure.status === 403) return new TrackerError('Your account cannot access this tracker. Sign in with the owning account and try again.', 'unavailable');
  return new TrackerError('The job tracker could not be reached. Your saved data has not been replaced. Try again.', 'unavailable');
}

/** Reject malformed records instead of silently dropping them or guessing revision 1. */
export function toTrackedJob(raw: unknown): TrackedJob {
  const row = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const status = text(row.status).trim().toLowerCase();
  const revision = Number(row.revision);
  if (!text(row.id).trim() || !STATUSES.has(status) || !Number.isSafeInteger(revision) || revision < 1) {
    throw new TrackerError('The tracker returned an invalid record. The previous list has been kept; refresh before making changes.', 'unavailable');
  }
  return {
    id: text(row.id), title: text(row.title), company: text(row.company), status: status as TrackerStatus,
    location: text(row.location), workMode: text(row.workMode), salary: text(row.salary), url: text(row.url), notes: text(row.notes),
    dateApplied: dateOnly(row.dateApplied), deadline: dateOnly(row.deadline),
    contactPerson: text(row.contactPerson), contactEmail: text(row.contactEmail),
    interviewRound: text(row.interviewRound), interviewFormat: text(row.interviewFormat),
    interviewAt: wallClock(row.interviewAt), interviewLink: text(row.interviewLink), revision,
    createdAt: text(row.createdAt), updatedAt: text(row.updatedAt),
  };
}
export function fieldsOf(job: TrackedJob): TrackerFields {
  const { id: _id, revision: _revision, createdAt: _created, updatedAt: _updated, ...fields } = job;
  return { ...fields };
}

/** Mirror the server's text normalization without truncating invalid input. */
export function normalizeTrackerFields(fields: TrackerFields): TrackerFields {
  const result: Record<string, string> = { ...fields };
  for (const key of Object.keys(result) as TrackerFieldName[]) {
    const value = text(result[key]);
    result[key] = key === 'notes'
      ? value.replace(/\r\n?/g, '\n').replace(/\p{Cc}/gu, (character) => character === '\n' ? '\n' : ' ').trim()
      : value.replace(/\p{Cc}/gu, ' ').trim();
  }
  return result as TrackerFields;
}
export function changedFields(saved: TrackerFields, draft: TrackerFields): Partial<TrackerFields> {
  const before = normalizeTrackerFields(saved);
  const after = normalizeTrackerFields(draft);
  const changes: Partial<TrackerFields> = {};
  for (const key of Object.keys(after) as TrackerFieldName[]) {
    if (after[key] !== before[key]) (changes as Record<string, string>)[key] = after[key];
  }
  return changes;
}
export type TrackerErrors = Partial<Record<TrackerFieldName, string>>;
export function isWebAddress(value: string): boolean {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && Boolean(url.hostname); }
  catch { return false; }
}
export function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3]);
}
export function isWallClock(value: string): boolean {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(value);
  return Boolean(match && isCalendarDate(match[1]!) && Number(match[2]) < 24 && Number(match[3]) < 60);
}
export function validateTracker(fields: TrackerFields): TrackerErrors {
  const value = normalizeTrackerFields(fields);
  const errors: TrackerErrors = {};
  if (!value.title) errors.title = 'Enter the job title.';
  if (!value.company) errors.company = 'Enter the company.';
  for (const [key, limit] of Object.entries(FIELD_LIMITS) as Array<[TrackerFieldName, number]>) {
    if (!errors[key] && value[key].length > limit) errors[key] = `Use at most ${limit} characters. Shorten this value before saving.`;
  }
  if (!isTrackerStage(value.status)) errors.status = 'Choose one of the five tracker stages.';
  for (const key of ['url', 'interviewLink'] as const) {
    if (!errors[key] && value[key] && !isWebAddress(value[key])) errors[key] = 'Enter a complete http:// or https:// web address.';
  }
  if (!errors.contactEmail && value.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.contactEmail)) errors.contactEmail = 'Enter an email address like name@example.com.';
  for (const key of ['dateApplied', 'deadline'] as const) {
    if (value[key] && !isCalendarDate(value[key])) errors[key] = 'Enter a valid calendar date.';
  }
  if (value.interviewAt && !isWallClock(value.interviewAt)) errors.interviewAt = 'Enter a valid interview date and time.';
  if (value.workMode && !(WORK_MODES as readonly string[]).includes(value.workMode)) errors.workMode = 'Choose Remote, Hybrid or On-site.';
  if (value.interviewRound && !(INTERVIEW_ROUNDS as readonly string[]).includes(value.interviewRound)) errors.interviewRound = 'Choose a round from the list.';
  if (value.interviewFormat && !(INTERVIEW_FORMATS as readonly string[]).includes(value.interviewFormat)) errors.interviewFormat = 'Choose a format from the list.';
  // Entering Interviewing alone does not mean an interview has been scheduled.
  // Once any scheduling detail is supplied, require a complete round/format/time.
  if (value.interviewRound || value.interviewFormat || value.interviewAt || value.interviewLink) {
    if (!value.interviewRound) errors.interviewRound = 'Choose the interview round.';
    if (!value.interviewFormat) errors.interviewFormat = 'Choose the interview format.';
    if (!value.interviewAt) errors.interviewAt = 'Enter the interview date and time.';
  }
  return errors;
}

// ── Verified HTTP contract. GET returns the complete owner-scoped list; no pagination. ──
function payload(fields: Partial<TrackerFields>): Record<string, string> {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, String(value ?? '').trim()]));
}
export async function listTrackedJobs(signal?: AbortSignal): Promise<TrackedJob[]> {
  const response = await apiClient.get<{ success?: boolean; jobs?: unknown }>('/jobs-data/tracker', { signal });
  if (response.data?.success !== true || !Array.isArray(response.data.jobs)) {
    throw new TrackerError('The tracker returned an unexpected response. Your previous list has been kept.', 'unavailable');
  }
  return response.data.jobs.map(toTrackedJob);
}
export async function createTrackedJob(fields: TrackerFields): Promise<TrackedJob> {
  const normalized = normalizeTrackerFields(fields);
  const errors = validateTracker(normalized);
  if (Object.keys(errors).length) throw new TrackerError(Object.values(errors)[0]!, 'validation');
  try {
    const data = await post<{ success?: boolean; job?: unknown }>('/jobs-data/tracker', payload(normalized));
    if (data.success !== true) throw new TrackerError('The server did not confirm creation. Refresh your tracker before retrying.', 'unavailable');
    return toTrackedJob(data.job);
  } catch (error) { throw toTrackerError(error); }
}
async function patchTrackedJob(saved: TrackedJob, changes: Partial<TrackerFields>, expectedRevision: number): Promise<TrackedJob> {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) throw new TrackerError('A valid saved revision is required.', 'validation');
  try {
    const data = await patch<{ success?: boolean; job?: unknown }>(`/jobs-data/tracker/${encodeURIComponent(saved.id)}`, { ...payload(changes), expectedRevision });
    if (data.success !== true) throw new TrackerError('The server did not confirm this change. Refresh before retrying.', 'unavailable');
    const updated = toTrackedJob(data.job);
    if (updated.id !== saved.id || updated.revision <= expectedRevision) throw new TrackerError('The server returned an inconsistent revision. Refresh before retrying.', 'unavailable');
    // PATCH omits timestamps. Preserve known real timestamps until the next GET;
    // never substitute a browser-generated "server" timestamp.
    return { ...updated, createdAt: updated.createdAt || saved.createdAt, updatedAt: updated.updatedAt || saved.updatedAt };
  } catch (error) { throw toTrackerError(error); }
}
async function deleteRequest(job: TrackedJob): Promise<void> {
  try { await del(`/jobs-data/tracker/${encodeURIComponent(job.id)}`, { expectedRevision: job.revision }); }
  catch (error) { throw toTrackerError(error); }
}

/** Per-record serialization, shared by stage moves, edits and deletes in this session. */
export function createRecordQueue() {
  const tails = new Map<string, Promise<void>>();
  return {
    run<T>(id: string, task: () => Promise<T>): Promise<T> {
      const previous = tails.get(id) ?? Promise.resolve();
      const result = previous.then(task);
      const tail = result.then(() => undefined, () => undefined);
      tails.set(id, tail);
      void tail.then(() => { if (tails.get(id) === tail) tails.delete(id); });
      return result;
    },
  };
}
const recordQueue = createRecordQueue();
export async function updateTrackedJob(saved: TrackedJob, changes: Partial<TrackerFields>, expectedRevision = saved.revision): Promise<TrackedJob> {
  return recordQueue.run(saved.id, () => patchTrackedJob(saved, changes, expectedRevision));
}
export async function deleteTrackedJob(job: TrackedJob, expectedRevision = job.revision): Promise<void> {
  return recordQueue.run(job.id, () => deleteRequest({ ...job, revision: expectedRevision }));
}

export interface StageMovePlan { previous: TrackedJob; optimistic: TrackedJob; expectedRevision: number }
export function planStageMove(previous: TrackedJob, status: TrackerStatus): StageMovePlan {
  if (!isTrackerStage(status)) throw new TrackerError('Choose a supported stage.', 'validation');
  return { previous, optimistic: { ...previous, status }, expectedRevision: previous.revision };
}
/** A delayed success must not replace a newer revision already in the cache. */
export function reconcileTrackedJob(jobs: readonly TrackedJob[], saved: TrackedJob): TrackedJob[] {
  return jobs.map((job) => job.id === saved.id && job.revision <= saved.revision ? saved : job);
}
/** Restore the complete captured record, not just a guessed stage. */
export function rollbackTrackedJob(jobs: readonly TrackedJob[], plan: StageMovePlan): TrackedJob[] {
  return jobs.map((job) => job.id === plan.previous.id && job.revision === plan.expectedRevision ? plan.previous : job);
}
export type StageMoveResult =
  | { kind: 'moved'; job: TrackedJob; previous: TrackedJob }
  | { kind: 'unchanged' | 'missing' }
  | { kind: 'failed'; error: TrackerError; refreshed: boolean; previous?: TrackedJob };
interface StageMoveCallbacks {
  read: () => TrackedJob | undefined;
  write: (job: TrackedJob) => void;
  rollback: (plan: StageMovePlan) => void;
  remove: (id: string) => void;
  refresh: () => Promise<unknown>;
}
/** Serialize every stage action for a record. A conflict is never automatically retried. */
export async function moveTrackedJobStage(job: TrackedJob, status: TrackerStatus, callbacks: StageMoveCallbacks): Promise<StageMoveResult> {
  return recordQueue.run(job.id, async () => {
    const previous = callbacks.read();
    if (!previous) return { kind: 'missing' };
    if (previous.status === status) return { kind: 'unchanged' };
    const plan = planStageMove(previous, status);
    callbacks.write(plan.optimistic);
    try {
      const saved = await patchTrackedJob(previous, { status }, plan.expectedRevision);
      callbacks.write(saved);
      return { kind: 'moved', job: saved, previous };
    } catch (error) {
      const failure = toTrackerError(error);
      callbacks.rollback(plan);
      if (failure.kind === 'not-found') { callbacks.remove(previous.id); return { kind: 'missing' }; }
      let refreshed = false;
      if (failure.kind === 'conflict') {
        try { await callbacks.refresh(); refreshed = true; } catch { /* Caller reports the failed refresh. */ }
      }
      return { kind: 'failed', error: failure, refreshed, previous };
    }
  });
}
