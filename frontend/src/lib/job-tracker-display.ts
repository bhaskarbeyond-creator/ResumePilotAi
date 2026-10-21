/**
 * Presentation helpers for the Job Tracker: dates, search, sort, the pipeline
 * summary and the interview calendar file. Pure functions; no network.
 *
 * Dates are shown only when the candidate entered them or the server recorded
 * them (created/updated). Nothing is labelled "recently" without a date.
 */
import { TRACKER_STAGES, type TrackedJob, type TrackerStatus } from '@/lib/job-tracker';

export type TrackerSort = 'updated' | 'applied' | 'deadline' | 'interview' | 'company';

export const SORT_OPTIONS: ReadonlyArray<{ value: TrackerSort; label: string }> = [
  { value: 'updated', label: 'Recently updated' },
  { value: 'applied', label: 'Date applied, newest first' },
  { value: 'deadline', label: 'Apply-by date, soonest first' },
  { value: 'interview', label: 'Interview date, soonest first' },
  { value: 'company', label: 'Company, A to Z' },
];

export function parseSort(value: string | null): TrackerSort {
  return SORT_OPTIONS.some((option) => option.value === value) ? (value as TrackerSort) : 'updated';
}

export type TrackerView = 'board' | 'list';
export function parseView(value: string | null): TrackerView {
  return value === 'list' ? 'list' : 'board';
}

// ── Dates ───────────────────────────────────────────────────────────────────

/** A YYYY-MM-DD value as a local calendar date (no time-zone shift). */
export function localDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** A YYYY-MM-DDTHH:mm wall-clock value as a local date and time. */
export function localDateTime(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function timestamp(value: string): number {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

export function formatDay(date: Date, now = new Date()): string {
  return date.toLocaleDateString(undefined, {
    day: 'numeric', month: 'short', ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  });
}

export function formatDateTime(date: Date): string {
  return date.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** "Applied 2 Oct" when the candidate entered the date, otherwise "Added 20 Oct" from the server. */
export function progressDate(job: TrackedJob): { label: string; dateTime: string } | null {
  const applied = localDate(job.dateApplied);
  if (applied) return { label: `Applied ${formatDay(applied)}`, dateTime: job.dateApplied };
  if (job.createdAt && timestamp(job.createdAt)) return { label: `Added ${formatDay(new Date(job.createdAt))}`, dateTime: job.createdAt };
  return null;
}

export function startOfToday(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** The apply-by date, and whether it has passed while the job is still on the wishlist. */
export function deadlineInfo(job: TrackedJob, now = new Date()): { label: string; dateTime: string; passed: boolean } | null {
  const deadline = localDate(job.deadline);
  if (!deadline) return null;
  const passed = job.status === 'wishlist' && deadline < startOfToday(now);
  return { label: `Apply by ${formatDay(deadline, now)}`, dateTime: job.deadline, passed };
}

export function interviewInfo(job: TrackedJob, now = new Date()): { label: string; dateTime: string; upcoming: boolean } | null {
  const at = localDateTime(job.interviewAt);
  if (!at) return null;
  return { label: formatDateTime(at), dateTime: job.interviewAt, upcoming: at.getTime() > now.getTime() };
}

// ── Search, sort, summary ───────────────────────────────────────────────────

export function matchesQuery(job: TrackedJob, query: string): boolean {
  const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const haystack = [job.title, job.company, job.location, job.notes, job.contactPerson, job.salary].join(' ').toLocaleLowerCase();
  return words.every((word) => haystack.includes(word));
}

function emptyLast(a: string, b: string, compare: (x: string, y: string) => number): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return compare(a, b);
}

const byUpdated = (a: TrackedJob, b: TrackedJob) => timestamp(b.updatedAt || b.createdAt) - timestamp(a.updatedAt || a.createdAt);

export function sortJobs(jobs: TrackedJob[], sort: TrackerSort): TrackedJob[] {
  const sorted = [...jobs];
  sorted.sort((a, b) => {
    let order = 0;
    if (sort === 'applied') order = emptyLast(a.dateApplied, b.dateApplied, (x, y) => y.localeCompare(x));
    if (sort === 'deadline') order = emptyLast(a.deadline, b.deadline, (x, y) => x.localeCompare(y));
    if (sort === 'interview') order = emptyLast(a.interviewAt, b.interviewAt, (x, y) => x.localeCompare(y));
    if (sort === 'company') order = a.company.localeCompare(b.company, undefined, { sensitivity: 'base' }) || a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
    return order || byUpdated(a, b);
  });
  return sorted;
}

export function pipelineSummary(jobs: TrackedJob[], now = new Date()): { counts: Record<TrackerStatus, number>; upcomingInterviews: number } {
  const counts = Object.fromEntries(TRACKER_STAGES.map((stage) => [stage.id, 0])) as Record<TrackerStatus, number>;
  let upcomingInterviews = 0;
  for (const job of jobs) {
    counts[job.status] += 1;
    if (interviewInfo(job, now)?.upcoming) upcomingInterviews += 1;
  }
  return { counts, upcomingInterviews };
}

// ── Interview calendar file (RFC 5545) ──────────────────────────────────────

function icsEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Folds a content line at 75 octets, as RFC 5545 §3.1 requires. */
function icsFold(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = '';
  let size = 0;
  for (const character of line) {
    const bytes = encoder.encode(character).length;
    const limit = parts.length ? 74 : 75;
    if (size + bytes > limit) {
      parts.push(current);
      current = '';
      size = 0;
    }
    current += character;
    size += bytes;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

const pad = (value: number) => String(value).padStart(2, '0');
const floatingTime = (date: Date) => `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}00`;
const utcTime = (date: Date) => `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;

/**
 * A one-hour calendar event at the interview's local wall-clock time (a
 * "floating" time, so it stays at the time the candidate entered), or null when
 * no interview time is set.
 */
export function interviewCalendarFile(job: TrackedJob, now = new Date()): { filename: string; content: string } | null {
  const start = localDateTime(job.interviewAt);
  if (!start) return null;
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const details = [
    job.interviewRound && `Round: ${job.interviewRound}`,
    job.interviewFormat && `Format: ${job.interviewFormat}`,
    job.interviewLink && `Meeting link: ${job.interviewLink}`,
    job.contactPerson && `Contact: ${job.contactPerson}${job.contactEmail ? ` (${job.contactEmail})` : ''}`,
    job.url && `Job posting: ${job.url}`,
  ].filter(Boolean).join('\n');
  const where = job.interviewFormat === 'In-Person' ? job.location : job.interviewLink || job.location;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//IME365//Job Tracker//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${job.id}-interview@ime365`,
    `DTSTAMP:${utcTime(now)}`,
    `DTSTART:${floatingTime(start)}`,
    `DTEND:${floatingTime(end)}`,
    `SUMMARY:${icsEscape(`Interview: ${job.title} at ${job.company}`)}`,
    ...(details ? [`DESCRIPTION:${icsEscape(details)}`] : []),
    ...(where ? [`LOCATION:${icsEscape(where)}`] : []),
    ...(job.interviewLink ? [`URL:${job.interviewLink}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  const slug = job.company.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'job';
  return { filename: `interview-${slug}-${job.interviewAt.slice(0, 10)}.ics`, content: `${lines.map(icsFold).join('\r\n')}\r\n` };
}
