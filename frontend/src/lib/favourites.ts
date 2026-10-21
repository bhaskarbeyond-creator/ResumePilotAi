/**
 * Saved favourites: /api/favourites (MariaDB `favourites`, owner-scoped; P002 C15).
 *
 * Today the bookmark on the Dashboard's job matches (overview.tsx) is the only
 * control that saves one; older clients also saved resumes and cover letters.
 * The list says what each favourite points at now: a saved job's current title,
 * company and location while the job board shows it (the server applies the
 * rule of GET /api/jobs-data/:id), a saved document's title while it is still
 * the candidate's. `data` is the payload stored with the favourite, exactly as
 * it was saved; Undo saves it again.
 */
import { del, get, post } from '@/lib/api-client';

export const FAVOURITES_QUERY_KEY = ['dashboard', 'favourites'] as const;

export interface FavouriteJob {
  title: string;
  company: string;
  location: string;
  /** Open on the public job board now. */
  listed: boolean;
}

export interface Favourite {
  /** The stored row (`fav_…`). */
  id: string;
  /** What was saved: a job, resume or cover letter id. Removing and saving again use it. */
  itemId: string;
  /** As stored: job, resume, cover, … */
  itemType: string;
  /** When it was saved (server time). */
  createdAt: string;
  /** The payload saved with it, exactly as stored. */
  data: Record<string, unknown>;
  /** The job's current details, only while the job board shows the job to this candidate. */
  job: FavouriteJob | null;
  /** The document's current title, only while it is still the candidate's. */
  document: { title: string } | null;
}

const text = (value: unknown): string => (typeof value === 'string' ? value : value == null ? '' : String(value));
const record = (value: unknown): Record<string, unknown> =>
  (value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

export function toFavourite(raw: unknown): Favourite {
  const row = record(raw);
  const job = row.job && typeof row.job === 'object' ? record(row.job) : null;
  const document = row.document && typeof row.document === 'object' ? record(row.document) : null;
  return {
    id: text(row.id),
    itemId: text(row.itemId),
    itemType: text(row.itemType).trim(),
    createdAt: text(row.createdAt),
    data: { ...record(row.data) },
    job: job ? { title: text(job.title), company: text(job.company), location: text(job.location), listed: job.listed === true } : null,
    document: document ? { title: text(document.title) } : null,
  };
}

/** Newest first (the server's order). A response without a list is an error, never an empty list. */
export async function listFavourites(): Promise<Favourite[]> {
  const data = await get<{ favourites?: unknown }>('/favourites');
  if (!Array.isArray(data?.favourites)) throw new Error('The saved items could not be read.');
  return data.favourites.map(toFavourite).filter((item) => item.itemId);
}

/** `already-removed`: it was removed elsewhere (another tab, the Dashboard) before this request. */
export type RemoveOutcome = 'removed' | 'already-removed';

export async function removeFavourite(item: Pick<Favourite, 'itemId'>): Promise<RemoveOutcome> {
  const data = await del<{ removed?: unknown }>(`/favourites/${encodeURIComponent(item.itemId)}`);
  return data?.removed === false ? 'already-removed' : 'removed';
}

/** Undo: saves the same item again with the payload it had. It counts as saved now. */
export async function restoreFavourite(item: Pick<Favourite, 'itemId' | 'itemType' | 'data'>): Promise<void> {
  await post('/favourites', { itemId: item.itemId, itemType: item.itemType, data: item.data });
}
