/**
 * Presentation helpers for Saved Favorites: what each favourite shows, where it
 * can be opened, the type filter and search. Pure functions; no network.
 *
 * Live details come first: a job's current listing, a document's current
 * title. When those are not available, the details saved with the favourite
 * are shown and labelled as such; nothing is invented.
 */
import type { Favourite } from '@/lib/favourites';
import { formatDay } from '@/lib/job-tracker-display';

export type FavouriteKind = 'job' | 'resume' | 'cover' | 'other';

const COVER_TYPES = ['cover', 'coverletter', 'cover-letter', 'cover_letter'];

export function favouriteKind(item: Pick<Favourite, 'itemType'>): FavouriteKind {
  const type = item.itemType.toLowerCase();
  if (type === 'job') return 'job';
  if (type === 'resume') return 'resume';
  if (COVER_TYPES.includes(type)) return 'cover';
  return 'other';
}

export type FavouriteFilter = 'all' | 'jobs' | 'documents';

export const FAVOURITE_FILTERS: ReadonlyArray<{ value: FavouriteFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'jobs', label: 'Jobs' },
  { value: 'documents', label: 'Documents' },
];

export function parseFilter(value: string | null): FavouriteFilter {
  return FAVOURITE_FILTERS.some((option) => option.value === value) ? (value as FavouriteFilter) : 'all';
}

export type FavouriteState =
  | { tone: 'listed'; label: string }
  | { tone: 'unlisted' | 'unavailable'; label: string; detail: string }
  | null;

export interface FavouriteView {
  kind: FavouriteKind;
  kindLabel: string;
  title: string;
  company: string;
  location: string;
  /** The details shown are the ones saved with the favourite, not current ones. */
  asSaved: boolean;
  state: FavouriteState;
  /** Where it opens, when there is a real place to go. */
  open: { href: string; label: string } | null;
}

const firstText = (...values: unknown[]): string =>
  values.map((value) => (typeof value === 'string' ? value.trim() : '')).find(Boolean) ?? '';

function capitalised(value: string): string {
  const words = value.replace(/[_-]+/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : 'Saved item';
}

export function describeFavourite(item: Favourite): FavouriteView {
  const kind = favouriteKind(item);
  const { data } = item;

  if (kind === 'job') {
    if (item.job) {
      const { title, company, location, listed } = item.job;
      return {
        kind, kindLabel: 'Job', title: title || 'Untitled job', company, location, asSaved: false,
        state: listed
          ? { tone: 'listed', label: 'Open on the job board' }
          : { tone: 'unlisted', label: 'Not open on the job board', detail: 'This is your own listing, and it isn’t open on the job board.' },
        open: null,
      };
    }
    const title = firstText(data.title, data.jobTitle);
    const company = firstText(data.company, data.companyName);
    const location = firstText(data.location);
    const asSaved = Boolean(title || company || location);
    return {
      kind, kindLabel: 'Job', title: title || 'Saved job', company, location, asSaved,
      state: {
        tone: 'unavailable',
        label: 'No longer listed',
        detail: asSaved
          ? 'This job isn’t open on the job board now. The details shown are the ones saved with it.'
          : 'This job isn’t open on the job board now, so its details can’t be shown.',
      },
      open: null,
    };
  }

  if (kind === 'resume' || kind === 'cover') {
    const isResume = kind === 'resume';
    const kindLabel = isResume ? 'Resume' : 'Cover letter';
    if (item.document) {
      return {
        kind, kindLabel, title: item.document.title || (isResume ? 'Untitled resume' : 'Untitled cover letter'), company: '', location: '',
        asSaved: false, state: null,
        open: isResume
          ? { href: `/build-resume/${encodeURIComponent(item.itemId)}`, label: 'Open in Resume Builder' }
          : { href: `/cover-letter/${encodeURIComponent(item.itemId)}`, label: 'Open in Cover Letter Builder' },
      };
    }
    const title = firstText(data.title, isResume ? data.resumeTitle : data.coverTitle);
    const noun = isResume ? 'resume' : 'cover letter';
    return {
      kind, kindLabel, title: title || kindLabel, company: '', location: '', asSaved: Boolean(title),
      state: {
        tone: 'unavailable',
        label: 'Not in your account',
        detail: title
          ? `This ${noun} isn’t in your account, so it can’t be opened. The title shown is the one saved with it.`
          : `This ${noun} isn’t in your account, so it can’t be opened.`,
      },
      open: null,
    };
  }

  const title = firstText(data.title, data.name);
  return { kind, kindLabel: capitalised(item.itemType), title: title || 'Saved item', company: '', location: '', asSaved: Boolean(title), state: null, open: null };
}

/** "Platform Engineer at Example Test Co" for a job, otherwise the title. */
export function favouriteName(view: FavouriteView): string {
  return view.kind === 'job' && view.company ? `${view.title} at ${view.company}` : view.title;
}

export function matchesFilter(view: FavouriteView, filter: FavouriteFilter): boolean {
  if (filter === 'jobs') return view.kind === 'job';
  if (filter === 'documents') return view.kind === 'resume' || view.kind === 'cover';
  return true;
}

/** Case-insensitive match on what an entry shows: title, company, location and type. */
export function matchesQuery(view: FavouriteView, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  return [view.title, view.company, view.location, view.kindLabel].some((value) => value.toLocaleLowerCase().includes(needle));
}

export function filterCounts(views: readonly FavouriteView[]): Record<FavouriteFilter, number> {
  return {
    all: views.length,
    jobs: views.filter((view) => matchesFilter(view, 'jobs')).length,
    documents: views.filter((view) => matchesFilter(view, 'documents')).length,
  };
}

/** "Saved 21 Oct" from the server's timestamp; null when it has none. */
export function savedDate(item: Pick<Favourite, 'createdAt'>, now = new Date()): { label: string; dateTime: string } | null {
  const time = new Date(item.createdAt).getTime();
  if (!item.createdAt || Number.isNaN(time)) return null;
  return { label: `Saved ${formatDay(new Date(time), now)}`, dateTime: item.createdAt };
}
