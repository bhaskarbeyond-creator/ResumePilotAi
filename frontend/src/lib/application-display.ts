/**
 * Presentation helpers for Applied Jobs: search, status filter, sort, the status
 * summary, dates and the submitted cover letter as plain text. Pure functions;
 * no network. Dates come from the server (sent, last updated), never estimated.
 */
import { APPLICATION_STATUSES, isKnownStatus, statusLabel, type Application, type KnownApplicationStatus } from '@/lib/applications';
import { formatDay } from '@/lib/job-tracker-display';

export type ApplicationSort = 'newest' | 'oldest' | 'updated' | 'company';

export const SORT_OPTIONS: ReadonlyArray<{ value: ApplicationSort; label: string }> = [
  { value: 'newest', label: 'Date applied, newest first' },
  { value: 'oldest', label: 'Date applied, oldest first' },
  { value: 'updated', label: 'Last updated' },
  { value: 'company', label: 'Company, A to Z' },
];

export function parseSort(value: string | null): ApplicationSort {
  return SORT_OPTIONS.some((option) => option.value === value) ? (value as ApplicationSort) : 'newest';
}

export type StatusFilter = 'all' | KnownApplicationStatus;

export const STATUS_FILTERS: ReadonlyArray<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'All statuses' },
  ...APPLICATION_STATUSES.map((status) => ({ value: status.id, label: status.label })),
];

export function parseStatusFilter(value: string | null): StatusFilter {
  return value && isKnownStatus(value) ? value : 'all';
}

/** "Platform Engineer at Example Test Co", or as much of it as is known. */
export function applicationName(application: Application): string {
  const { title, company } = application.job;
  if (title && company) return `${title} at ${company}`;
  return title || company || 'this job';
}

export function matchesFilter(application: Application, filter: StatusFilter): boolean {
  return filter === 'all' || application.status === filter;
}

/** Case-insensitive match on what a row shows: job title, company, location and status. */
export function matchesQuery(application: Application, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  const { title, company, location } = application.job;
  return [title, company, location, statusLabel(application.status)].some((value) => value.toLocaleLowerCase().includes(needle));
}

function timestamp(value: string): number {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

const byText = (left: string, right: string) => left.localeCompare(right, undefined, { sensitivity: 'base' });

export function sortApplications(applications: readonly Application[], sort: ApplicationSort): Application[] {
  const list = [...applications];
  const newestFirst = (left: Application, right: Application) =>
    timestamp(right.createdAt) - timestamp(left.createdAt) || byText(left.id, right.id);
  if (sort === 'oldest') return list.sort((left, right) => -newestFirst(left, right));
  if (sort === 'updated') {
    return list.sort((left, right) =>
      timestamp(right.updatedAt || right.createdAt) - timestamp(left.updatedAt || left.createdAt) || newestFirst(left, right));
  }
  if (sort === 'company') {
    return list.sort((left, right) =>
      byText(left.job.company, right.job.company) || byText(left.job.title, right.job.title) || newestFirst(left, right));
  }
  return list.sort(newestFirst);
}

export interface StatusSummary {
  counts: Record<KnownApplicationStatus, number>;
  /** Applications with a status no workflow here writes. */
  other: number;
}

export function statusSummary(applications: readonly Application[]): StatusSummary {
  const counts = Object.fromEntries(APPLICATION_STATUSES.map((status) => [status.id, 0])) as Record<KnownApplicationStatus, number>;
  let other = 0;
  for (const application of applications) {
    if (isKnownStatus(application.status)) counts[application.status] += 1;
    else other += 1;
  }
  return { counts, other };
}

// ── Dates ───────────────────────────────────────────────────────────────────

export function appliedDate(application: Application, now = new Date()): { label: string; dateTime: string } | null {
  if (!timestamp(application.createdAt)) return null;
  return { label: `Applied ${formatDay(new Date(application.createdAt), now)}`, dateTime: application.createdAt };
}

/** Shown when the application changed after it was sent (by a minute or more). */
export function updatedDate(application: Application, now = new Date()): { label: string; dateTime: string } | null {
  const updated = timestamp(application.updatedAt);
  const created = timestamp(application.createdAt);
  if (!updated || !created || updated - created < 60_000) return null;
  return { label: `Updated ${formatDay(new Date(application.updatedAt), now)}`, dateTime: application.updatedAt };
}

// ── Cover letter ────────────────────────────────────────────────────────────

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ' };

/**
 * The cover letter as plain text. Letters sent from the current form are plain
 * text; older ones may hold markup, which is reduced to its text (line breaks
 * kept). The result is rendered as text, never as HTML.
 */
export function coverLetterText(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (_match, name: string) => ENTITIES[name] ?? '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
