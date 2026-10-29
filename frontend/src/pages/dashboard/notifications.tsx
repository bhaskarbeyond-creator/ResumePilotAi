/**
 * Notifications — /dashboard/notifications.
 *
 * The signed-in user's notification feed, read from MariaDB through
 * GET /api/notifications-data (@/lib/notifications). Backend workflows create the
 * rows (job applications and their status changes, payments, moderation). Here a
 * row can be read, searched, filtered, marked read or unread
 * (PATCH /api/notifications-data/:id) or all marked read at once
 * (POST /api/notifications-data/mark-all-read); writes are optimistic and roll
 * back on failure. The Unread filter lives in the URL (?filter=unread), so it
 * survives a reload and Back. Nothing on this page is sample data.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { AlertCircle, Bell, CheckCheck, Loader2, RotateCcw, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { queryKeys, useMarkAllNotificationsRead, useNotifications, useSetNotificationRead } from '@/hooks/use-api-hooks';
import { apiClient } from '@/lib/api-client';
import {
  NotificationsApiError,
  toNotification,
  toNotificationsError,
  type NotificationItem,
} from '@/lib/notifications';
import { matchesSearch } from '@/lib/notification-display';
import { NotificationRow } from '@/components/notifications/notification-row';

const PAGE_SIZE = 20;
type Filter = 'all' | 'unread';

/* ═══════════════════════════════════════════════════════════════════════════
 * DISC-053 — one coalesced unread-notification poller for the whole app.
 *
 * The feed is polled by exactly ONE loop, owned by this module and shared by
 * every surface that subscribes to it (the notifications page and the shell's
 * bell read the same React Query cache entry, so one poll keeps both honest).
 *
 * Timing policy (documented, and enforced by the tests):
 *  - healthy: every 15 s;
 *  - after a failure: 15 s, 30 s, 60 s, then 60 s (the ladder below);
 *  - a valid 429/503 `Retry-After` (delta-seconds or HTTP-date) replaces the
 *    ladder for that attempt, and is never shortened — waiting longer than the
 *    server asked is allowed, retrying sooner is not. A floor of 1 s keeps a
 *    `Retry-After: 0` from becoming a tight loop;
 *  - the timer is dropped while the document is hidden and one catch-up read
 *    runs when the tab becomes visible again;
 *  - a request is never issued while another is in flight.
 * ══════════════════════════════════════════════════════════════════════════ */

/** Cadence while the endpoint is healthy. */
export const POLL_INTERVAL_MS = 15_000;
/** Documented backoff ladder for consecutive failures. */
export const POLL_BACKOFF_LADDER_MS: readonly number[] = [15_000, 30_000, 60_000];
/** Floor for any scheduled delay, so no server instruction can spin the loop. */
export const POLL_MIN_DELAY_MS = 1_000;

/**
 * Parse a `Retry-After` header into milliseconds from `nowMs`.
 * Returns null when the header is absent or not a valid delta-seconds/HTTP-date,
 * so the caller falls back to the exponential ladder.
 */
export function parseRetryAfterMs(header: string | null | undefined, nowMs: number = Date.now()): number | null {
  if (typeof header !== 'string') return null;
  const raw = header.trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) {
    const seconds = Number(raw);
    return Number.isFinite(seconds) ? seconds * 1000 : null;
  }
  const at = Date.parse(raw);
  if (!Number.isFinite(at)) return null;
  return Math.max(0, at - nowMs);
}

/** Delay before the next attempt: honour `Retry-After`, else walk the ladder. */
export function pollDelayMs(failures: number, retryAfterMs: number | null): number {
  const safe = (ms: number) => Math.max(POLL_MIN_DELAY_MS, ms);
  if (retryAfterMs !== null && Number.isFinite(retryAfterMs)) return safe(retryAfterMs);
  if (failures <= 0) return safe(POLL_INTERVAL_MS);
  const step = POLL_BACKOFF_LADDER_MS[Math.min(failures - 1, POLL_BACKOFF_LADDER_MS.length - 1)];
  return safe(step);
}

export interface NotificationPollerSnapshot {
  /** A loop is scheduled (the page is mounted and the tab is visible). */
  running: boolean;
  /** Consecutive failed attempts; reset by the first success. */
  failures: number;
  /** Delay that was used for the pending attempt. */
  nextDelayMs: number;
  /** Epoch ms of the last successful read, or null before the first one. */
  lastSuccessAt: number | null;
  /** Message of the last failed attempt, or null after a success. */
  lastError: string | null;
  /** No timer is armed because the document is hidden. */
  paused: boolean;
}

function retryAfterHeader(error: unknown): string | null {
  if (!axios.isAxiosError(error)) return null;
  const headers = error.response?.headers as unknown;
  if (!headers) return null;
  const raw = typeof (headers as { get?: unknown }).get === 'function'
    ? (headers as { get: (name: string) => unknown }).get('retry-after')
    : (headers as Record<string, unknown>)['retry-after'];
  if (raw === undefined || raw === null) return null;
  return typeof raw === 'string' ? raw : String(raw);
}

type PollerListener = (snapshot: NotificationPollerSnapshot) => void;

class UnreadNotificationPoller {
  private listeners = new Set<PollerListener>();
  private client: QueryClient | null = null;
  private timer: number | null = null;
  private abort: AbortController | null = null;
  private inFlight = false;
  private running = false;
  private visibilityBound = false;
  private failures = 0;
  private nextDelayMs = POLL_INTERVAL_MS;
  private lastSuccessAt: number | null = null;
  private lastError: string | null = null;
  private paused = false;

  public snapshot(): NotificationPollerSnapshot {
    return {
      running: this.running,
      failures: this.failures,
      nextDelayMs: this.nextDelayMs,
      lastSuccessAt: this.lastSuccessAt,
      lastError: this.lastError,
      paused: this.paused,
    };
  }

  /**
   * Attach a consumer. The first subscriber starts the single loop; the last
   * unsubscribe stops it, so nothing polls after the page goes away.
   */
  public subscribe(client: QueryClient, listener: PollerListener): () => void {
    this.client = client;
    this.listeners.add(listener);
    listener(this.snapshot());
    if (!this.running) this.start();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.stop();
    };
  }

  /** Read now (used by "Try again"); the pending timer is replaced, not doubled. */
  public refreshNow(): void {
    if (!this.running) {
      if (this.listeners.size > 0) this.start();
      return;
    }
    this.clearTimer();
    void this.tick();
  }

  /** Stop the loop, abort a pending request and drop the visibility listener. */
  public stop(): void {
    this.running = false;
    this.clearTimer();
    const controller = this.abort;
    this.abort = null;
    this.inFlight = false;
    controller?.abort();
    this.unbindVisibility();
    this.paused = false;
    this.emit();
  }

  private start(): void {
    if (this.running) return;
    this.running = true;
    this.bindVisibility();
    this.paused = typeof document !== 'undefined' && document.visibilityState === 'hidden';
    this.emit();
    if (this.paused) return;
    this.schedule(this.nextDelayMs);
  }

  private emit(): void {
    const snapshot = this.snapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }

  private schedule(delayMs: number): void {
    if (!this.running || typeof window === 'undefined') return;
    this.clearTimer();
    this.nextDelayMs = Math.max(POLL_MIN_DELAY_MS, delayMs);
    this.timer = window.setTimeout(() => {
      this.timer = null;
      void this.tick();
    }, this.nextDelayMs);
  }

  private clearTimer(): void {
    if (this.timer === null) return;
    window.clearTimeout(this.timer);
    this.timer = null;
  }

  private async tick(): Promise<void> {
    if (!this.running) return;
    // Overlapping requests are never issued: a tick that finds a request in
    // flight simply reschedules after it (the `finally` below reschedules).
    if (this.inFlight) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      this.paused = true;
      this.clearTimer();
      this.emit();
      return;
    }
    this.inFlight = true;
    const controller = new AbortController();
    this.abort = controller;
    try {
      const response = await apiClient.get<{ notifications?: unknown }>('/notifications-data', { signal: controller.signal });
      const payload = response.data?.notifications;
      if (!Array.isArray(payload)) {
        throw new NotificationsApiError(0, 'CONTRACT', 'The server returned notifications in a form this page cannot read.');
      }
      const rows = payload.map(toNotification);
      this.client?.setQueryData(queryKeys.dashboard.notifications, rows);
      this.failures = 0;
      this.lastError = null;
      this.lastSuccessAt = Date.now();
      this.nextDelayMs = pollDelayMs(0, null);
    } catch (error) {
      if (controller.signal.aborted) return; // stopped on purpose; nothing to report
      this.failures += 1;
      this.lastError = toNotificationsError(error).message;
      // parseRetryAfterMs returns null for a missing/invalid header, which is
      // exactly when the exponential ladder applies.
      this.nextDelayMs = pollDelayMs(this.failures, parseRetryAfterMs(retryAfterHeader(error)));
    } finally {
      if (this.abort === controller) this.abort = null;
      this.inFlight = false;
      if (this.running) {
        this.emit();
        this.schedule(this.nextDelayMs);
      }
    }
  }

  private readonly onVisibilityChange = (): void => {
    if (typeof document === 'undefined' || !this.running) return;
    if (document.visibilityState === 'visible') {
      if (!this.paused) return;
      this.paused = false;
      // One catch-up read instead of replaying every missed interval.
      this.clearTimer();
      void this.tick();
      return;
    }
    this.paused = true;
    this.clearTimer();
    this.emit();
  };

  private bindVisibility(): void {
    if (this.visibilityBound || typeof document === 'undefined') return;
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.visibilityBound = true;
  }

  private unbindVisibility(): void {
    if (!this.visibilityBound || typeof document === 'undefined') return;
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.visibilityBound = false;
  }
}

const notificationPoller = new UnreadNotificationPoller();

/** The single, module-wide poller. Every surface shares this instance. */
export function getNotificationPoller(): UnreadNotificationPoller {
  return notificationPoller;
}

const linkClass = 'inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 underline-offset-4 hover:underline dark:text-brand-300';
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

function ListSkeleton() {
  return (
    <div aria-busy="true" className="rounded-2xl border border-border bg-surface">
      <p className="sr-only">Loading notifications…</p>
      <ul aria-hidden="true" className="divide-y divide-border">
        {Array.from({ length: 4 }, (_, index) => (
          <li key={index} className="flex items-start gap-3 px-4 py-4">
            <span className="size-9 shrink-0 animate-pulse rounded-full bg-neutral-200 dark:bg-neutral-700" />
            <span className="flex-1 space-y-2">
              <span className="block h-3.5 w-1/3 animate-pulse rounded bg-neutral-200 dark:bg-neutral-700" />
              <span className="block h-3 w-3/4 animate-pulse rounded bg-neutral-200 dark:bg-neutral-700" />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LoadError({ error, onRetry, retrying }: { error: NotificationsApiError; onRetry: () => void; retrying: boolean }) {
  return (
    <div className="rounded-xl border border-error-200 bg-error-50 p-4 text-sm text-error-800 dark:border-error-800 dark:bg-error-950/40 dark:text-error-200">
      <p className="flex items-center gap-2 font-semibold">
        <AlertCircle className="size-4 shrink-0" aria-hidden="true" /> Notifications could not be loaded
      </p>
      <p className="mt-1 break-words">{error.message}</p>
      <Button className="mt-3" size="sm" variant="outline" onClick={onRetry} aria-busy={retrying || undefined}>
        {retrying ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RotateCcw aria-hidden="true" />} Try again
      </Button>
    </div>
  );
}

function EmptyFeed() {
  return (
    <section aria-labelledby="notifications-empty-heading" className="rounded-2xl border border-border bg-surface px-6 py-10 text-center">
      <Bell className="mx-auto size-10 text-ink-muted" aria-hidden="true" />
      <h2 id="notifications-empty-heading" className="mt-3 text-base font-semibold text-ink">No notifications yet</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-ink-secondary">
        Updates about your job applications, interviews and account will appear here.
      </p>
      <Link to="/dashboard/jobs" className={cn(linkClass, 'mt-4')}>Browse jobs</Link>
    </section>
  );
}

function NoMatches({ title, body, action, onAction }: { title: string; body: string; action: string; onAction: () => void }) {
  return (
    <section aria-labelledby="notifications-none-heading" className="rounded-2xl border border-border bg-surface px-6 py-10 text-center">
      <h2 id="notifications-none-heading" className="text-base font-semibold text-ink [overflow-wrap:anywhere]">{title}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-ink-secondary">{body}</p>
      <Button className="mt-4" size="sm" variant="outline" onClick={onAction}>{action}</Button>
    </section>
  );
}

const EMPTY: ReadonlySet<string> = new Set();

export function NotificationsPage() {
  const { data, error, isPending, isFetching, refetch } = useNotifications();
  const items = useMemo(() => data ?? [], [data]);
  const queryClient = useQueryClient();
  const poller = getNotificationPoller();
  const [pollerState, setPollerState] = useState<NotificationPollerSnapshot>(() => poller.snapshot());
  // One subscription per mounted page; the module-wide loop starts with the
  // first subscriber and is cleaned up with the last one.
  useEffect(() => poller.subscribe(queryClient, setPollerState), [poller, queryClient]);
  const { mutateAsync: saveRead } = useSetNotificationRead();
  const { mutateAsync: saveAllRead } = useMarkAllNotificationsRead();
  const [searchParams, setSearchParams] = useSearchParams();
  const filter: Filter = searchParams.get('filter') === 'unread' ? 'unread' : 'all';
  const [query, setQuery] = useState('');
  const trimmedQuery = query.trim();
  const viewKey = `${filter}\u0000${trimmedQuery.toLocaleLowerCase()}`;

  // Paging, and rows kept in place in the Unread view, belong to one view: they
  // start over whenever the filter or the search changes, Back/Forward included.
  const [view, setView] = useState<{ key: string; count: number; kept: ReadonlySet<string> }>(
    () => ({ key: viewKey, count: PAGE_SIZE, kept: EMPTY }),
  );
  if (view.key !== viewKey) setView({ key: viewKey, count: PAGE_SIZE, kept: EMPTY });
  const visibleCount = view.key === viewKey ? view.count : PAGE_SIZE;
  const keptIds = view.key === viewKey ? view.kept : EMPTY;

  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(EMPTY);
  const pendingRef = useRef(new Set<string>());
  const markingAllRef = useRef(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [actionError, setActionError] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const focusRowIndex = useRef<number | null>(null);

  const unreadCount = useMemo(() => items.filter((item) => !item.read).length, [items]);
  const filtered = useMemo(
    () => items.filter((item) => (filter === 'all' || !item.read || keptIds.has(item.id)) && matchesSearch(item, trimmedQuery)),
    [items, filter, keptIds, trimmedQuery],
  );
  const visible = filtered.slice(0, visibleCount);
  const remaining = filtered.length - visible.length;

  useEffect(() => {
    // After "Show more", focus moves to the first newly shown row.
    if (focusRowIndex.current === null) return;
    const row = listRef.current?.children[focusRowIndex.current] as HTMLElement | undefined;
    focusRowIndex.current = null;
    row?.querySelector<HTMLElement>('a, button')?.focus();
  }, [visibleCount]);

  const setFilter = useCallback((next: Filter) => {
    setSearchParams((previous) => {
      const params = new URLSearchParams(previous);
      if (next === 'unread') params.set('filter', 'unread');
      else params.delete('filter');
      return params;
    }, { replace: true });
  }, [setSearchParams]);

  const toggleRead = useCallback(async (item: NotificationItem) => {
    if (markingAllRef.current || pendingRef.current.has(item.id)) return;
    pendingRef.current.add(item.id);
    setPendingIds(new Set(pendingRef.current));
    setActionError('');
    // In the Unread view a row marked read stays where it is until the view
    // changes, so the focused toggle never disappears from under the user.
    if (filter === 'unread') {
      setView((current) => (current.key === viewKey ? { ...current, kept: new Set([...current.kept, item.id]) } : current));
    }
    const read = !item.read;
    try {
      await saveRead({ id: item.id, read });
      setAnnouncement(`Marked “${item.title}” as ${read ? 'read' : 'unread'}.`);
    } catch (caught) {
      const failure = toNotificationsError(caught);
      setActionError(failure.notFound
        ? `“${item.title}” no longer exists, so it was removed from the list.`
        : `Couldn’t mark “${item.title}” as ${read ? 'read' : 'unread'}. ${failure.message}`);
    } finally {
      pendingRef.current.delete(item.id);
      setPendingIds(new Set(pendingRef.current));
    }
  }, [filter, viewKey, saveRead]);

  const followRow = useCallback((item: NotificationItem) => {
    if (item.read || pendingRef.current.has(item.id) || markingAllRef.current) return;
    // Opening the page a row points to counts as reading it. The write outlives
    // this page; the hook restores the row to unread if it fails, and the
    // failure is reported here instead of being swallowed.
    void saveRead({ id: item.id, read: true }).catch((caught: unknown) => {
      const failure = toNotificationsError(caught);
      setActionError(failure.notFound
        ? `“${item.title}” no longer exists, so it was removed from the list.`
        : `Couldn’t mark “${item.title}” as read. ${failure.message}`);
    });
  }, [saveRead]);

  const markAllRead = useCallback(async () => {
    if (markingAllRef.current || pendingRef.current.size > 0 || unreadCount === 0) return;
    markingAllRef.current = true;
    setMarkingAll(true);
    setActionError('');
    setView((current) => ({ ...current, kept: EMPTY }));
    try {
      const updated = await saveAllRead();
      setAnnouncement(updated > 0 ? `Marked ${plural(updated, 'notification')} as read.` : 'Everything was already read.');
    } catch (caught) {
      setActionError(`Couldn’t mark all notifications as read. ${toNotificationsError(caught).message}`);
    } finally {
      markingAllRef.current = false;
      setMarkingAll(false);
    }
  }, [unreadCount, saveAllRead]);

  const retry = useCallback(async () => {
    if (isFetching) return;
    const result = await refetch();
    // A failed read also resets/re-arms the poller immediately rather than
    // leaving the user waiting out a backoff step they did not ask for.
    if (result.isSuccess) {
      poller.refreshNow();
      headingRef.current?.focus();
    }
  }, [isFetching, refetch, poller]);

  const showMore = () => {
    const next = Math.min(filtered.length, visibleCount + PAGE_SIZE);
    focusRowIndex.current = visible.length;
    setView((current) => (current.key === viewKey ? { ...current, count: current.count + PAGE_SIZE } : current));
    setAnnouncement(`Showing ${next} of ${plural(filtered.length, 'notification')}.`);
  };

  const clearSearch = () => {
    setQuery('');
    searchRef.current?.focus();
  };

  const loadError = error && !data ? error : null;
  const refreshError = error && data ? error : null;
  // A failed background poll is reported only when the list itself rendered;
  // otherwise the load error above already explains the empty page.
  const pollFailure = data && pollerState.lastError && !loadError ? pollerState.lastError : null;
  const markAllUnavailable = unreadCount === 0 || markingAll || pendingIds.size > 0;

  let content: React.ReactNode;
  if (isPending) content = <ListSkeleton />;
  else if (loadError) content = <LoadError error={loadError} onRetry={retry} retrying={isFetching} />;
  else if (items.length === 0) content = <EmptyFeed />;
  else if (filtered.length === 0) {
    content = trimmedQuery
      ? <NoMatches title={`No notifications match “${trimmedQuery}”`} body="Try a different word, or clear the search." action="Clear search" onAction={clearSearch} />
      : <NoMatches title="You’re all caught up" body="You have no unread notifications." action="Show all notifications" onAction={() => setFilter('all')} />;
  } else {
    content = (
      <>
        <ul ref={listRef} aria-label="Notifications" className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
          {visible.map((item) => (
            <NotificationRow
              key={item.id}
              item={item}
              pending={pendingIds.has(item.id)}
              locked={markingAll}
              onToggleRead={toggleRead}
              onFollow={followRow}
            />
          ))}
        </ul>
        <div className="flex flex-col items-center gap-2">
          <p className="text-xs text-ink-muted">Showing {visible.length} of {plural(filtered.length, 'notification')}</p>
          {remaining > 0 && (
            <Button variant="outline" size="sm" onClick={showMore}>Show {Math.min(PAGE_SIZE, remaining)} more</Button>
          )}
        </div>
      </>
    );
  }

  return (
    // `relative` contains the screen-reader-only spans: without a positioned
    // ancestor inside the scroll container they made the whole document scroll.
    <div className="relative p-4 lg:p-6 xl:p-8">
      <div className="mx-auto max-w-4xl space-y-4">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 ref={headingRef} tabIndex={-1} className="text-xl font-bold text-ink focus:outline-none sm:text-2xl">Notifications</h1>
              {unreadCount > 0 && (
                <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700 dark:bg-brand-950/50 dark:text-brand-200">
                  {unreadCount} unread
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm text-ink-secondary">Updates about your job applications, interviews and account.</p>
          </div>
          {items.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={markAllRead}
              aria-disabled={markAllUnavailable || undefined}
              aria-busy={markingAll || undefined}
              className="shrink-0 self-start aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
            >
              {markingAll ? <Loader2 className="animate-spin" aria-hidden="true" /> : <CheckCheck aria-hidden="true" />}
              Mark all as read
            </Button>
          )}
        </header>

        <p role="status" aria-live="polite" className="sr-only">{announcement}</p>
        <p aria-live="polite" className="sr-only">
          {trimmedQuery && !isPending && !loadError ? `${plural(filtered.length, 'notification')} match “${trimmedQuery}”.` : ''}
        </p>
        <div role="alert" className="empty:mb-0">
          {actionError && (
            <div className="flex items-start gap-2 rounded-xl border border-error-200 bg-error-50 p-3 text-sm text-error-800 dark:border-error-800 dark:bg-error-950/40 dark:text-error-200">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <p className="min-w-0 flex-1 break-words">{actionError}</p>
              <button
                type="button"
                onClick={() => setActionError('')}
                aria-label="Dismiss"
                className="rounded p-0.5 hover:bg-error-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-error-500 dark:hover:bg-error-900/40"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>

        {pollFailure && (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-warning-200 bg-warning-50 p-3 text-sm text-warning-800 dark:border-warning-800 dark:bg-warning-950/40 dark:text-warning-200"
            data-testid="notifications-poll-error"
          >
            <p className="min-w-0 flex-1 break-words">
              Couldn’t check for new notifications, so this list may be out of date. {pollFailure}
            </p>
            <Button size="sm" variant="outline" onClick={() => poller.refreshNow()}>
              <RotateCcw aria-hidden="true" /> Check now
            </Button>
          </div>
        )}

        {refreshError && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-warning-200 bg-warning-50 p-3 text-sm text-warning-800 dark:border-warning-800 dark:bg-warning-950/40 dark:text-warning-200">
            <p className="min-w-0 flex-1 break-words">Couldn’t refresh notifications, so this list may be out of date. {refreshError.message}</p>
            <Button size="sm" variant="outline" onClick={retry} aria-busy={isFetching || undefined}>
              {isFetching ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RotateCcw aria-hidden="true" />} Try again
            </Button>
          </div>
        )}

        {items.length > 0 && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div role="group" aria-label="Filter notifications" className="flex gap-2">
              {(['all', 'unread'] as const).map((value) => {
                const active = filter === value;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setFilter(value)}
                    className={cn(
                      'inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2',
                      active
                        ? 'border-brand-600 bg-brand-600 text-white'
                        : 'border-border bg-surface text-ink-secondary hover:bg-neutral-50 dark:hover:bg-neutral-800',
                    )}
                  >
                    {value === 'all' ? 'All' : 'Unread'}{' '}
                    <span className={cn('rounded-full px-1.5 text-xs font-semibold', active ? 'bg-white/20 text-white' : 'bg-neutral-100 text-ink-secondary dark:bg-neutral-800')}>
                      {value === 'all' ? items.length : unreadCount}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="relative w-full sm:w-72">
              <label htmlFor="notifications-search" className="sr-only">Search notifications</label>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
              <Input
                ref={searchRef}
                id="notifications-search"
                type="search"
                autoComplete="off"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search notifications"
                className="pl-9 pr-9 [&::-webkit-search-cancel-button]:appearance-none"
              />
              {query && (
                <button
                  type="button"
                  onClick={clearSearch}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        )}

        {content}
      </div>
    </div>
  );
}
