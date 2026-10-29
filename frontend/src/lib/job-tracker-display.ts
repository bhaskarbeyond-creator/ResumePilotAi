/** Pure tracker presentation, URL state, snapshot reconciliation and RFC 5545 output. */
import { isCalendarDate, isWallClock, isWebAddress, TRACKER_STAGES, type TrackedJob, type TrackerStatus } from '@/lib/job-tracker';

export type TrackerSort = 'stage' | 'company' | 'deadline' | 'updated' | 'applied' | 'interview';
export type TrackerView = 'board' | 'list';
export const SORT_OPTIONS: ReadonlyArray<{ value: TrackerSort; label: string }> = [
  { value: 'stage', label: 'Stage' }, { value: 'company', label: 'Company, A to Z' },
  { value: 'deadline', label: 'Apply-by date, soonest first' }, { value: 'updated', label: 'Recently updated' },
  { value: 'applied', label: 'Date applied, newest first' }, { value: 'interview', label: 'Interview date, soonest first' },
];
export function parseSort(value: string | null): TrackerSort {
  return SORT_OPTIONS.some((option) => option.value === value) ? value as TrackerSort : 'stage';
}
export function parseView(value: string | null): TrackerView { return value === 'list' ? 'list' : 'board'; }
export interface TrackerURLState { view: TrackerView; q: string; sort: TrackerSort }
export function parseTrackerURL(params: URLSearchParams): TrackerURLState {
  return { view: parseView(params.get('view')), q: (params.get('q') ?? '').trim(), sort: parseSort(params.get('sort')) };
}
export function trackerURLParameters(current: URLSearchParams, state: TrackerURLState): URLSearchParams {
  const next = new URLSearchParams(current);
  // Explicit view makes shared board/list links unambiguous.
  next.set('view', state.view);
  if (state.q.trim()) next.set('q', state.q.trim()); else next.delete('q');
  if (state.sort === 'stage') next.delete('sort'); else next.set('sort', state.sort);
  return next;
}
export function localDate(value: string): Date | null {
  if (!isCalendarDate(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year!, month! - 1, day!);
}
export function localDateTime(value: string): Date | null {
  if (!isWallClock(value)) return null;
  const [date, time] = value.split('T');
  const [year, month, day] = date!.split('-').map(Number);
  const [hour, minute] = time!.split(':').map(Number);
  return new Date(year!, month! - 1, day!, hour!, minute!);
}
function timestamp(value: string): number | null {
  if (!value?.trim()) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}
export function formatDay(date: Date, now = new Date()): string {
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }) });
}
export function formatDateTime(date: Date): string {
  return date.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
}
export function progressDate(job: TrackedJob): { label: string; dateTime: string } | null {
  const applied = localDate(job.dateApplied);
  if (applied) return { label: `Applied ${formatDay(applied)}`, dateTime: job.dateApplied };
  const created = timestamp(job.createdAt);
  return created === null ? null : { label: `Added ${formatDay(new Date(created))}`, dateTime: job.createdAt };
}
export function startOfToday(now = new Date()): Date { return new Date(now.getFullYear(), now.getMonth(), now.getDate()); }
export function deadlineInfo(job: TrackedJob, now = new Date()): { label: string; dateTime: string; passed: boolean } | null {
  const deadline = localDate(job.deadline);
  if (!deadline) return null;
  return { label: `Apply by ${formatDay(deadline, now)}`, dateTime: job.deadline, passed: job.status === 'wishlist' && deadline < startOfToday(now) };
}
export function interviewInfo(job: TrackedJob, now = new Date()): { label: string; dateTime: string; upcoming: boolean } | null {
  const at = localDateTime(job.interviewAt);
  return at ? { label: formatDateTime(at), dateTime: job.interviewAt, upcoming: at.getTime() > now.getTime() } : null;
}
export function matchesQuery(job: TrackedJob, query: string): boolean {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const haystack = [job.title, job.company, job.location, job.notes, job.contactPerson, job.contactEmail, job.salary].join(' ').toLocaleLowerCase();
  return words.every((word) => haystack.includes(word));
}
function compareOptional(a: string, b: string, compare: (x: string, y: string) => number): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return compare(a, b);
}
const byText = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
export function sortJobs(jobs: readonly TrackedJob[], sort: TrackerSort): TrackedJob[] {
  const stageIndex = (status: TrackerStatus) => TRACKER_STAGES.findIndex((stage) => stage.id === status);
  return jobs.map((job, index) => ({ job, index })).sort((a, b) => {
    let order = 0;
    if (sort === 'stage') order = stageIndex(a.job.status) - stageIndex(b.job.status);
    if (sort === 'company') order = byText(a.job.company, b.job.company) || byText(a.job.title, b.job.title);
    if (sort === 'deadline') order = compareOptional(a.job.deadline, b.job.deadline, (x, y) => x.localeCompare(y));
    if (sort === 'applied') order = compareOptional(a.job.dateApplied, b.job.dateApplied, (x, y) => y.localeCompare(x));
    if (sort === 'interview') order = compareOptional(a.job.interviewAt, b.job.interviewAt, (x, y) => x.localeCompare(y));
    if (sort === 'updated') order = (timestamp(b.job.updatedAt || b.job.createdAt) ?? 0) - (timestamp(a.job.updatedAt || a.job.createdAt) ?? 0);
    return order || a.index - b.index;
  }).map(({ job }) => job);
}
export function pipelineSummary(jobs: readonly TrackedJob[], now = new Date()): { counts: Record<TrackerStatus, number>; upcomingInterviews: number } {
  const counts = Object.fromEntries(TRACKER_STAGES.map((stage) => [stage.id, 0])) as Record<TrackerStatus, number>;
  let upcomingInterviews = 0;
  for (const job of jobs) {
    counts[job.status] += 1;
    if (job.status === 'interview' && interviewInfo(job, now)?.upcoming) upcomingInterviews += 1;
  }
  return { counts, upcomingInterviews };
}
/** Keep in-flight records and newer revisions when an overlapping GET completes. */
export function reconcileTrackerSnapshot(authoritative: readonly TrackedJob[], current: readonly TrackedJob[], pendingIds: ReadonlySet<string>): TrackedJob[] {
  const local = new Map(current.map((job) => [job.id, job]));
  const merged = authoritative.map((job) => {
    const candidate = local.get(job.id);
    return candidate && (pendingIds.has(job.id) || candidate.revision > job.revision) ? candidate : job;
  });
  const seen = new Set(merged.map((job) => job.id));
  for (const job of current) if (pendingIds.has(job.id) && !seen.has(job.id)) merged.push(job);
  return merged;
}

// ── RFC 5545. The schema has no offset: deliberately export floating local time. ──
export function icsEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
}
/** Fold at 75 UTF-8 octets, never through a code point; continuation space counts. */
export function icsFold(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = '', size = 0;
  for (const character of line) {
    const bytes = encoder.encode(character).length;
    const limit = parts.length ? 74 : 75;
    if (size + bytes > limit) { parts.push(current); current = ''; size = 0; }
    current += character; size += bytes;
  }
  parts.push(current);
  return parts.join('\r\n ');
}
const pad = (value: number) => String(value).padStart(2, '0');
const floatingTime = (date: Date) => `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}00`;
const utcTime = (date: Date) => `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
export const INTERVIEW_CALENDAR_MINUTES = 60;
export const CALENDAR_MIME_TYPE = 'text/calendar;charset=utf-8';
/**
 * The existing product contract exports a one-hour event. The server has no end
 * time or zone. Floating DTSTART/DTEND preserve the saved wall clock in the
 * importing calendar; the UI explicitly discloses both limitations.
 */
export function interviewCalendarFile(job: TrackedJob, now = new Date()): { filename: string; content: string } | null {
  const start = localDateTime(job.interviewAt);
  if (!start || !job.id || !job.title.trim() || !job.company.trim() || Number.isNaN(now.getTime())) return null;
  // Add a wall-clock hour without a DST-induced two-hour jump in floating time.
  const end = new Date(start.getTime()); end.setHours(end.getHours() + 1);
  const details = [
    `Round: ${job.interviewRound || 'Not specified'}`, `Format: ${job.interviewFormat || 'Not specified'}`,
    'Duration: 60 minutes (calendar default; not stored by the tracker).',
    'Time: saved wall-clock time; confirm the time zone with your contact.',
    job.interviewLink && `Meeting link: ${job.interviewLink}`,
    job.contactPerson && `Contact: ${job.contactPerson}${job.contactEmail ? ` (${job.contactEmail})` : ''}`,
    job.url && `Job posting: ${job.url}`, job.notes && `Notes: ${job.notes}`,
  ].filter(Boolean).join('\n');
  const where = job.interviewFormat === 'In-Person' ? job.location : job.interviewLink || job.location;
  const uid = `${encodeURIComponent(job.id)}-${job.interviewAt.replace(/[-:]/g, '')}@ime365`;
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//IME365//Job Tracker//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${utcTime(now)}`, `DTSTART:${floatingTime(start)}`, `DTEND:${floatingTime(end)}`,
    `SUMMARY:${icsEscape(`Interview: ${job.title} at ${job.company}`)}`, `DESCRIPTION:${icsEscape(details)}`,
    ...(where ? [`LOCATION:${icsEscape(where)}`] : []),
    ...(isWebAddress(job.interviewLink) ? [`URL:${new URL(job.interviewLink).href}`] : []),
    'END:VEVENT', 'END:VCALENDAR',
  ];
  const slug = job.company.toLocaleLowerCase('en-US').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'job';
  return { filename: `interview-${slug}-${job.interviewAt.slice(0, 10)}.ics`, content: `${lines.map(icsFold).join('\r\n')}\r\n` };
}
