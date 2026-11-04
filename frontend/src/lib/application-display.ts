/** Pure Applied Jobs presentation and URL contracts. No API calls or array mutation. */
import { lifecycleStatusFor, statusLabel, type Application, type ApplicationLifecycle } from '@/lib/applications';
import { formatDay } from '@/lib/job-tracker-display';

export type ApplicationSort = 'newest' | 'date' | 'company' | 'oldest' | 'updated';
export type StatusFilter = 'all' | 'pending' | 'interview' | 'accepted' | 'rejected' | 'applied' | 'reviewing' | 'offered';
export const SORT_OPTIONS: ReadonlyArray<{ value: ApplicationSort; label: string }> = [
  { value: 'newest', label: 'Date applied, newest first' },
  { value: 'oldest', label: 'Date applied, oldest first' },
  { value: 'updated', label: 'Last updated' },
  { value: 'company', label: 'Company, A to Z' },
];
export const STATUS_FILTERS: ReadonlyArray<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'All statuses' },
  { value: 'pending', label: 'Submitted' },
  { value: 'interview', label: 'Interview' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Not selected' },
  { value: 'applied', label: 'Applied' },
  { value: 'reviewing', label: 'Reviewing' },
  { value: 'offered', label: 'Offered' },
];
const FILTER_LIFECYCLE: Record<string, ApplicationLifecycle> = {
  pending: 'APPLIED', applied: 'APPLIED', reviewing: 'REVIEWING', interview: 'INTERVIEW_SCHEDULED', accepted: 'OFFERED', offered: 'OFFERED', rejected: 'REJECTED',
};
export function parseSort(value: string | null): ApplicationSort {
  if (value === 'date' || value === 'newest') return 'newest';
  return SORT_OPTIONS.some((option) => option.value === value) ? value as ApplicationSort : 'newest';
}
export function parseStatusFilter(value: string | null): StatusFilter {
  return STATUS_FILTERS.some((option) => option.value === value) ? value as StatusFilter : 'all';
}
export interface ApplicationURLState { status: StatusFilter; q: string; sort: ApplicationSort }
export function parseApplicationURL(params: URLSearchParams): ApplicationURLState {
  return { status: parseStatusFilter(params.get('status')), q: (params.get('q') ?? '').trim(), sort: parseSort(params.get('sort')) };
}
/** Keep unrelated parameters and represent defaults without needless clutter. */
export function applicationURLParameters(current: URLSearchParams, state: ApplicationURLState): URLSearchParams {
  const next = new URLSearchParams(current);
  for (const [key, value, fallback] of [['status', state.status, 'all'], ['q', state.q.trim(), ''], ['sort', state.sort, 'newest']] as const) {
    if (value === fallback) next.delete(key); else next.set(key, value);
  }
  return next;
}
export function applicationName(application: Application): string {
  const { title, company } = application.job;
  return title && company ? `${title} at ${company}` : title || company || 'this job';
}
export function matchesFilter(application: Application, filter: StatusFilter): boolean {
  if (filter === 'all') return true;
  const s = application.status.trim().toLowerCase();
  if (filter === 'pending' || filter === 'applied') return s === 'pending' || s === 'applied' || s === 'submitted';
  if (filter === 'interview') return s === 'interview' || s === 'interview_scheduled';
  if (filter === 'accepted' || filter === 'offered') return s === 'accepted' || s === 'offered';
  if (filter === 'rejected') return s === 'rejected' || s === 'declined';
  if (filter === 'reviewing') return s === 'reviewing' || s === 'in_review';
  return lifecycleStatusFor(application.status) === FILTER_LIFECYCLE[filter];
}
export function matchesQuery(application: Application, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  return !needle || [application.job.title, application.job.company, application.job.location, statusLabel(application.status)].some((value) => value.toLocaleLowerCase().includes(needle));
}
function timestamp(value: string): number | null {
  if (!value.trim()) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}
const byText = (left: string, right: string) => left.localeCompare(right, undefined, { sensitivity: 'base', numeric: true });
function compareDates(left: string, right: string, direction: 1 | -1): number {
  const a = timestamp(left), b = timestamp(right);
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return (a - b) * direction;
}
/** Decorate with the original index so equal values retain their input order. */
export function sortApplications(applications: readonly Application[], sort: ApplicationSort): Application[] {
  return applications.map((application, index) => ({ application, index })).sort((a, b) => {
    let order = 0;
    if (sort === 'company') {
      const left = a.application.job.company.trim(), right = b.application.job.company.trim();
      order = !left && !right ? 0 : !left ? 1 : !right ? -1 : byText(left, right);
    } else if (sort === 'oldest') order = compareDates(a.application.createdAt, b.application.createdAt, 1);
    else if (sort === 'updated') order = compareDates(a.application.updatedAt || a.application.createdAt, b.application.updatedAt || b.application.createdAt, -1);
    else order = compareDates(a.application.createdAt, b.application.createdAt, -1);
    return order || a.index - b.index;
  }).map(({ application }) => application);
}
export interface StatusSummary { counts: Record<string, number> & Record<ApplicationLifecycle, number> }
export function statusSummary(applications: readonly Application[]): StatusSummary {
  const counts: Record<string, number> & Record<ApplicationLifecycle, number> = {
    pending: 0, interview: 0, accepted: 0, rejected: 0, other: 0,
    APPLIED: 0, REVIEWING: 0, INTERVIEW_SCHEDULED: 0, OFFERED: 0, REJECTED: 0, UNKNOWN: 0,
  };
  for (const application of applications) {
    const lc = lifecycleStatusFor(application.status);
    counts[lc] += 1;
    const s = application.status.trim().toLowerCase();
    if (s === 'pending' || s === 'applied' || s === 'submitted') counts.pending += 1;
    else if (s === 'interview' || s === 'interview_scheduled') counts.interview += 1;
    else if (s === 'accepted' || s === 'offered') counts.accepted += 1;
    else if (s === 'rejected' || s === 'declined') counts.rejected += 1;
    else counts.other += 1;
  }
  return { counts };
}
function validDate(value: string): Date | null {
  const time = timestamp(value);
  return time === null ? null : new Date(time);
}
export function appliedDate(application: Application, now = new Date()): { label: string; dateTime: string } | null {
  const date = validDate(application.createdAt);
  return date ? { label: `Applied ${formatDay(date, now)}`, dateTime: application.createdAt } : null;
}
export function updatedDate(application: Application, now = new Date()): { label: string; dateTime: string } | null {
  const updated = validDate(application.updatedAt), created = validDate(application.createdAt);
  return updated && created && updated.getTime() - created.getTime() >= 60_000
    ? { label: `Updated ${formatDay(updated, now)}`, dateTime: application.updatedAt } : null;
}
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ' };
/** Display submitted legacy markup as plain text, never inject it as HTML. */
export function coverLetterText(value: string): string {
  return value.replace(/\r\n?/g, '\n').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '').replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (_match, name: string) => ENTITIES[name] ?? '')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
export { statusLabel };
