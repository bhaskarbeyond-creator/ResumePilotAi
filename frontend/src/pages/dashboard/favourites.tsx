/**
 * Saved Favorites (/dashboard/favourites, alias /dashboard/favorites), candidate
 * dashboard.
 *
 * The jobs and documents the candidate saved, each with where it stands now: a
 * job's current listing while the job board shows it, a document's current
 * title while it is still theirs (the server decides both). A document opens in
 * its builder. Removing takes effect at once and can be undone (the item is
 * saved again). Data: /api/favourites (lib/favourites.ts).
 *
 * The type filter and the search live in the URL (?type=&q=), so they survive a
 * reload and Back/Forward. Saving happens elsewhere (the Dashboard's job
 * matches), so the list is read again on every visit and on Refresh.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Loader2, RefreshCw, Search, Undo2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NoticeRegions, type Notice } from '@/components/settings/notice-regions';
import { SavedItem, titleId } from '@/components/favourites/saved-item';
import { cn } from '@/lib/utils';
import { FAVOURITES_QUERY_KEY, listFavourites, removeFavourite, restoreFavourite, type Favourite } from '@/lib/favourites';
import {
  describeFavourite, FAVOURITE_FILTERS, favouriteName, filterCounts, matchesFilter, matchesQuery, parseFilter,
  type FavouriteFilter, type FavouriteView,
} from '@/lib/favourite-display';

const HEADING_ID = 'favourites-heading';
const UNDO_ID = 'favourites-undo';

const countLabel = (count: number) => (count === 1 ? '1 saved item' : `${count} saved items`);

const EMPTY_FILTER_COPY: Record<Exclude<FavouriteFilter, 'all'>, string> = {
  jobs: 'You haven’t saved any jobs.',
  documents: 'You haven’t saved any resumes or cover letters.',
};

export function FavouritesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = parseFilter(searchParams.get('type'));
  const query = searchParams.get('q') ?? '';
  const filtering = filter !== 'all' || query.trim() !== '';

  const queryClient = useQueryClient();
  // Favourites are saved from other pages, so the list is read on every visit.
  const list = useQuery({ queryKey: FAVOURITES_QUERY_KEY, queryFn: listFavourites, staleTime: 0 });
  const loaded = list.data !== undefined;
  const entries = useMemo(() => (list.data ?? []).map((item) => ({ item, view: describeFavourite(item) })), [list.data]);
  const visible = useMemo(
    () => entries.filter(({ view }) => matchesFilter(view, filter) && matchesQuery(view, query)),
    [entries, filter, query],
  );
  const counts = filterCounts(entries.map(({ view }) => view));

  const [notice, setNotice] = useState<Notice | null>(null);
  // The last removal, which Undo saves again. It belongs to the notice next to it.
  const [undo, setUndo] = useState<{ item: Favourite; name: string } | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [removingIds, setRemovingIds] = useState<ReadonlySet<string>>(new Set());
  const removingRef = useRef(new Set<string>());
  const announce = (next: Notice, nextUndo: { item: Favourite; name: string } | null = null) => {
    setNotice(next);
    setUndo(nextUndo);
  };

  // Ids to focus after the DOM updates, first existing wins (the heading otherwise).
  const pendingFocus = useRef<string[] | null>(null);
  useEffect(() => {
    if (!pendingFocus.current) return;
    const target = pendingFocus.current.map((id) => document.getElementById(id)).find(Boolean) ?? document.getElementById(HEADING_ID);
    pendingFocus.current = null;
    target?.focus();
  });

  const setParam = (key: 'type' | 'q', value: string, fallback: string) => {
    // Start from the address bar, not this render's copy: two quick changes in a
    // row (before React re-renders) must not drop the first one.
    const next = new URLSearchParams(window.location.search);
    if (!value || value === fallback) next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
  };
  const clearFilters = () => {
    const next = new URLSearchParams(window.location.search);
    next.delete('type');
    next.delete('q');
    setSearchParams(next, { replace: true });
  };

  const refresh = async () => {
    if (list.isFetching) return;
    const result = await list.refetch();
    // A failure keeps the list shown earlier and is reported by the alert below.
    if (!result.isError) announce({ tone: 'info', text: 'Your saved items are up to date.' });
  };

  const remove = async (item: Favourite, view: FavouriteView) => {
    if (removingRef.current.has(item.itemId)) return;
    removingRef.current.add(item.itemId);
    setRemovingIds(new Set(removingRef.current));
    const name = favouriteName(view);
    try {
      const outcome = await removeFavourite(item);
      const index = visible.findIndex((entry) => entry.item.itemId === item.itemId);
      const neighbour = visible[index + 1] ?? visible[index - 1];
      queryClient.setQueryData<Favourite[]>(FAVOURITES_QUERY_KEY, (current) => (current ?? []).filter((row) => row.itemId !== item.itemId));
      if (outcome === 'removed') {
        announce({ tone: 'success', text: `Removed ${name} from your saved items.` }, { item, name });
        pendingFocus.current = [UNDO_ID];
      } else {
        announce({ tone: 'info', text: `${name} had already been removed from your saved items.` });
        pendingFocus.current = neighbour && neighbour.item.itemId !== item.itemId ? [titleId(neighbour.item)] : [HEADING_ID];
      }
    } catch {
      setNotice({ tone: 'error', text: `${name} wasn’t removed. Check your connection and try again.` });
    } finally {
      removingRef.current.delete(item.itemId);
      setRemovingIds(new Set(removingRef.current));
    }
  };

  const restore = async () => {
    if (!undo || restoring) return;
    const { item, name } = undo;
    setRestoring(true);
    try {
      await restoreFavourite(item);
      // It counts as saved now; the list is read again so it shows the stored row.
      await queryClient.invalidateQueries({ queryKey: FAVOURITES_QUERY_KEY });
      announce({ tone: 'success', text: `${name} is back in your saved items.` });
      pendingFocus.current = [titleId(item)];
    } catch {
      // Undo stays available, so the candidate can try again.
      setNotice({ tone: 'error', text: `${name} couldn’t be saved again. Check your connection and try again.` });
    } finally {
      setRestoring(false);
    }
  };

  const emptyFilterText = query.trim()
    ? `No saved items match “${query.trim()}”${filter === 'all' ? '' : ` in ${FAVOURITE_FILTERS.find((option) => option.value === filter)?.label.toLowerCase()}`}.`
    : filter === 'all' ? '' : EMPTY_FILTER_COPY[filter];

  return (
    <div className="relative p-4 lg:p-6 xl:p-8">
      <header className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 id={HEADING_ID} tabIndex={-1} className="text-2xl font-bold text-ink focus:outline-none">Saved Favorites</h1>
          <p className="mt-1 text-sm text-ink-muted">
            The jobs and documents you’ve saved, and where each one stands now.
          </p>
        </div>
        {loaded && (
          <Button
            variant="outline"
            className="shrink-0 self-start"
            onClick={() => void refresh()}
            aria-busy={list.isFetching || undefined}
            aria-disabled={list.isFetching || undefined}
          >
            <RefreshCw className={cn(list.isFetching && 'animate-spin')} aria-hidden="true" /> Refresh
          </Button>
        )}
      </header>

      {loaded && entries.length > 0 && (
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
          <div role="group" aria-label="Show" className="flex flex-wrap gap-2">
            {FAVOURITE_FILTERS.map((option) => {
              const pressed = filter === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={pressed}
                  onClick={() => setParam('type', option.value, 'all')}
                  className={cn(
                    'inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
                    pressed ? 'border-brand-600 bg-brand-600 text-white' : 'border-border bg-surface text-ink-secondary hover:bg-canvas-soft hover:text-ink',
                  )}
                >
                  {/* The name is the visible text, "Jobs 3": the space keeps label and count apart. */}
                  {option.label}{' '}
                  <span className={cn('text-xs', pressed ? 'text-white/85' : 'text-ink-muted')}>{counts[option.value]}</span>
                </button>
              );
            })}
          </div>
          <form role="search" className="relative min-w-0 md:max-w-md md:flex-1" onSubmit={(event) => event.preventDefault()}>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
            <Input
              type="search"
              value={query}
              onChange={(event) => setParam('q', event.target.value, '')}
              aria-label="Search saved items"
              placeholder="Title, company or location"
              className={cn('pl-9', query ? 'pr-9' : 'pr-3')}
            />
            {query && (
              <button
                type="button"
                onClick={() => setParam('q', '', '')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-brand-500"
                aria-label="Clear search"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            )}
          </form>
        </div>
      )}

      {/* The live regions are always rendered, so a message is announced when it appears. */}
      <div className={cn('flex flex-col gap-2 sm:flex-row sm:items-start', (notice || undo) && 'mb-4')}>
        <div className="min-w-0 flex-1">
          <NoticeRegions notice={notice} />
        </div>
        {undo && (
          <Button
            id={UNDO_ID}
            variant="outline"
            className="shrink-0 self-start"
            onClick={() => void restore()}
            aria-label={`Undo: save ${undo.name} again`}
            aria-busy={restoring || undefined}
            aria-disabled={restoring || undefined}
          >
            <Undo2 aria-hidden="true" /> {restoring ? 'Saving…' : 'Undo'}
          </Button>
        )}
      </div>

      <section aria-labelledby="favourites-results-heading" aria-busy={list.isPending || undefined}>
        <h2 id="favourites-results-heading" className="sr-only">Your saved items</h2>

        {list.isPending && (
          <p className="flex items-center justify-center gap-2 py-16 text-sm text-ink-muted">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Loading your saved items…
          </p>
        )}

        {list.isError && (
          <div role="alert" className="mb-4 flex flex-col items-start gap-3 rounded-xl border border-error-100 bg-error-50 p-4 text-sm text-error-700 sm:flex-row sm:items-center">
            <AlertTriangle className="size-5 shrink-0" aria-hidden="true" />
            <span className="flex-1">
              {loaded
                ? 'The latest version of your saved items couldn’t be loaded, so the list below may be out of date.'
                : 'Your saved items couldn’t be loaded. Check your connection and try again.'}
            </span>
            <Button variant="outline" size="sm" onClick={() => void list.refetch()} aria-busy={list.isFetching || undefined}>
              <RefreshCw aria-hidden="true" /> Try again
            </Button>
          </div>
        )}

        {loaded && entries.length === 0 && (
          <div className="flex flex-col items-center rounded-2xl border border-dashed border-border bg-surface px-6 py-14 text-center">
            <h3 className="text-lg font-semibold text-ink">Nothing saved yet</h3>
            <p className="mt-1 max-w-md text-sm text-ink-muted">
              Save a job with the bookmark next to it in Top Job Matches on your Dashboard, and it appears here.
            </p>
            <Button asChild variant="outline" className="mt-5">
              <Link to="/dashboard">Go to your Dashboard</Link>
            </Button>
          </div>
        )}

        {loaded && entries.length > 0 && (
          <p className="mb-3 text-xs text-ink-muted" role="status">
            {filtering ? `Showing ${visible.length} of ${countLabel(entries.length)}` : countLabel(entries.length)}
          </p>
        )}

        {loaded && entries.length > 0 && visible.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-surface px-6 py-10 text-center">
            <p className="text-sm text-ink">{emptyFilterText}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={clearFilters}>Show all saved items</Button>
          </div>
        )}

        {loaded && visible.length > 0 && (
          <ul role="list" aria-label="Saved items" className="space-y-3">
            {visible.map(({ item, view }) => (
              <li key={item.itemId}>
                <SavedItem item={item} view={view} removing={removingIds.has(item.itemId)} onRemove={(target, targetView) => void remove(target, targetView)} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
