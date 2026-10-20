/**
 * Messages: the candidate's direct conversations with employers about job
 * applications, on the real messaging API (lib/messages.ts).
 *
 * - Conversations, unread counts and threads come from /api/messages/*. A sent
 *   message appears only after it is read back from the server; nothing on this
 *   page is invented, and there is no star, delete or archive because the API
 *   has none.
 * - The list re-reads every 15 s and an open thread every 10 s while the tab is
 *   visible (the legacy cadence, inside the DIR-054 read budget).
 * - Opening a thread advances the signed-in user's read cursor.
 * - While an administrator has messaging turned off (403 MODULE_DISABLED, the
 *   shipped default) the page says so instead of showing an inbox.
 * - Deep link: /dashboard/messages?conversationId=<id> (the legacy contract).
 *   Opening a conversation adds a history entry, so Back returns to the list.
 * - System notifications are on /dashboard/notifications, not here.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueries, useQuery } from '@tanstack/react-query';
import { AlertCircle, Bell, MessageSquare, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';
import {
  getParticipantProfile,
  isConversationId,
  listConversations,
  toMessagesError,
  type MessagesApiError,
} from '@/lib/messages';
import { ConversationList } from '@/components/messages/conversation-list';
import { ConversationThread } from '@/components/messages/conversation-thread';
import type { ParticipantView } from '@/components/messages/participant-avatar';
import { MESSAGES_LIST_KEY, messagesRetry, profileKey } from '@/components/messages/query-keys';

const TWO_PANE_QUERY = '(min-width: 1280px)';
const subscribeTwoPane = (onChange: () => void) => {
  const media = window.matchMedia(TWO_PANE_QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
};
const twoPaneSnapshot = () => window.matchMedia(TWO_PANE_QUERY).matches;
const twoPaneServerSnapshot = () => true;

/** List and thread side by side from 1280 px; one pane at a time below. */
function useTwoPane(): boolean {
  return useSyncExternalStore(subscribeTwoPane, twoPaneSnapshot, twoPaneServerSnapshot);
}

const linkClass = 'inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 underline-offset-4 hover:underline dark:text-brand-300';

function ModuleDisabled({ onCheckAgain, checking }: { onCheckAgain: () => void; checking: boolean }) {
  return (
    <section aria-labelledby="messages-disabled-heading" className="rounded-2xl border border-border bg-surface p-6">
      <h2 id="messages-disabled-heading" className="text-base font-semibold text-ink">Messages are turned off</h2>
      <p className="mt-2 max-w-2xl text-sm text-ink-secondary">
        An administrator has turned off messaging for this site, so conversations with employers can’t be shown or sent right now.
        Notifications about your applications are still available.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
        <Button size="sm" variant="outline" onClick={onCheckAgain} loading={checking}>
          <RotateCcw aria-hidden="true" /> Check again
        </Button>
        <Link to="/dashboard/notifications" className={linkClass}>
          <Bell className="size-4" aria-hidden="true" /> Go to notifications
        </Link>
      </div>
    </section>
  );
}

function LoadError({ error, onRetry, retrying }: { error: MessagesApiError; onRetry: () => void; retrying: boolean }) {
  return (
    <div role="alert" className="rounded-xl border border-error-200 bg-error-50 p-4 text-sm text-error-800">
      <p className="flex items-center gap-2 font-semibold"><AlertCircle className="size-4 shrink-0" aria-hidden="true" /> Conversations could not be loaded</p>
      <p className="mt-1 break-words">{error.message}</p>
      <Button className="mt-3" size="sm" variant="outline" onClick={onRetry} loading={retrying}>
        <RotateCcw aria-hidden="true" /> Try again
      </Button>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div aria-busy="true" className="rounded-2xl border border-border bg-surface">
      <p className="sr-only">Loading conversations…</p>
      <ul aria-hidden="true" className="divide-y divide-border">
        {Array.from({ length: 4 }, (_, index) => (
          <li key={index} className="flex items-center gap-3 px-4 py-3">
            <span className="size-10 shrink-0 animate-pulse rounded-full bg-neutral-200 dark:bg-neutral-700" />
            <span className="flex-1 space-y-2">
              <span className="block h-3.5 w-1/3 animate-pulse rounded bg-neutral-200 dark:bg-neutral-700" />
              <span className="block h-3 w-2/3 animate-pulse rounded bg-neutral-200 dark:bg-neutral-700" />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EmptyInbox() {
  return (
    <section aria-labelledby="messages-empty-heading" className="rounded-2xl border border-border bg-surface px-6 py-10 text-center">
      <MessageSquare className="mx-auto size-10 text-ink-muted" aria-hidden="true" />
      <h2 id="messages-empty-heading" className="mt-3 text-base font-semibold text-ink">No conversations yet</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-ink-secondary">
        When an employer messages you about one of your job applications, the conversation appears here.
      </p>
      <Link to="/dashboard/jobs" className={cn(linkClass, 'mt-4')}>Browse jobs</Link>
    </section>
  );
}

function NotAvailable({ onBack, headingRef }: { onBack: () => void; headingRef: React.Ref<HTMLHeadingElement> }) {
  return (
    <section aria-labelledby="conversation-missing-heading" className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <h2 id="conversation-missing-heading" ref={headingRef} tabIndex={-1} className="text-base font-semibold text-ink focus:outline-none">
        This conversation isn’t available
      </h2>
      <p className="max-w-sm text-sm text-ink-secondary">It may have been removed, or the link belongs to a different account.</p>
      <Button className="mt-2" variant="outline" size="sm" onClick={onBack}>Back to conversations</Button>
    </section>
  );
}

export function MessagesPage() {
  const { user } = useAuth();
  const myUid = user?.uid ?? '';
  const twoPane = useTwoPane();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedId = searchParams.get('conversationId');

  /* Set when a thread, profile or send request reports the module off mid-session. */
  const [moduleOff, setModuleOff] = useState(false);
  const onModuleDisabled = useCallback(() => setModuleOff(true), []);

  const list = useQuery({
    queryKey: MESSAGES_LIST_KEY,
    queryFn: ({ signal }) => listConversations(signal),
    enabled: !moduleOff,
    refetchInterval: (query) => (query.state.status === 'error' ? false : 15_000),
    staleTime: 0,
    retry: messagesRetry,
  });
  const listError = list.error ? toMessagesError(list.error) : null;
  const disabled = moduleOff || Boolean(listError?.moduleDisabled);
  const conversations = useMemo(() => (disabled ? [] : list.data?.conversations ?? []), [disabled, list.data]);
  const totalUnread = disabled ? 0 : list.data?.totalUnread ?? 0;

  const profiles = useQueries({
    queries: conversations.map((conversation) => ({
      queryKey: profileKey(conversation.id),
      queryFn: ({ signal }: { signal: AbortSignal }) => getParticipantProfile(conversation.id, signal),
      staleTime: 10 * 60_000,
      retry: messagesRetry,
    })),
  });
  const participants = useMemo(() => {
    const map = new Map<string, ParticipantView>();
    conversations.forEach((conversation, index) => {
      const result = profiles[index];
      if (result?.data) map.set(conversation.id, result.data);
      else if (result?.isError) map.set(conversation.id, { name: 'Name unavailable', avatar: '' });
    });
    return map;
  }, [conversations, profiles]);
  const profileModuleOff = profiles.some((result) => result.error && toMessagesError(result.error).moduleDisabled);
  useEffect(() => {
    if (profileModuleOff) setModuleOff(true);
  }, [profileModuleOff]);

  const selected = isConversationId(requestedId) ? conversations.find((item) => item.id === requestedId) ?? null : null;
  const missing = requestedId !== null && !disabled && list.isSuccess && !selected;
  const threadOpen = Boolean(selected || missing);

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [announcement, setAnnouncement] = useState('');
  const announceTimer = useRef<number | undefined>(undefined);
  const announce = useCallback((text: string) => {
    // Clear first so a repeated message ("Message sent.") is announced again.
    setAnnouncement('');
    window.clearTimeout(announceTimer.current);
    announceTimer.current = window.setTimeout(() => setAnnouncement(text), 120);
  }, []);
  useEffect(() => () => window.clearTimeout(announceTimer.current), []);

  const openConversation = useCallback((id: string) => {
    if (id === requestedId) return;
    setSearchParams({ conversationId: id }, { state: { fromList: true } });
  }, [requestedId, setSearchParams]);
  const closeConversation = useCallback(() => {
    if ((location.state as { fromList?: boolean } | null)?.fromList) navigate(-1);
    else setSearchParams({}, { replace: true });
  }, [location.state, navigate, setSearchParams]);

  /* Focus: single pane moves to the opened thread; closing returns to the row it came from. */
  const listRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const missingHeadingRef = useRef<HTMLHeadingElement>(null);
  const previousIdRef = useRef(requestedId);
  useEffect(() => {
    const previous = previousIdRef.current;
    previousIdRef.current = requestedId;
    if (previous === requestedId) return;
    if (requestedId) {
      if (!twoPane) (headingRef.current ?? missingHeadingRef.current)?.focus();
      return;
    }
    const container = listRef.current;
    if (!previous || !container || container.contains(document.activeElement)) return;
    const row = container.querySelector<HTMLElement>(`[data-conversation-id="${CSS.escape(previous)}"]`);
    (row ?? container.querySelector<HTMLElement>('input'))?.focus();
  }, [requestedId, twoPane, selected, missing]);

  const checkAgain = () => {
    setModuleOff(false);
    void list.refetch();
  };

  let content: React.ReactNode;
  if (disabled) {
    content = <ModuleDisabled onCheckAgain={checkAgain} checking={list.isFetching} />;
  } else if (list.isPending) {
    content = <ListSkeleton />;
  } else if (listError && !list.data) {
    content = <LoadError error={listError} onRetry={() => void list.refetch()} retrying={list.isFetching} />;
  } else if (conversations.length === 0 && !missing) {
    content = <EmptyInbox />;
  } else {
    content = (
      <>
        {listError && (
          <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-error-200 bg-error-50 px-3 py-2 text-sm text-error-800">
            <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1 break-words">Conversations could not be refreshed. {listError.message}</span>
            <Button size="xs" variant="outline" onClick={() => void list.refetch()} loading={list.isFetching}>
              <RotateCcw aria-hidden="true" /> Try again
            </Button>
          </div>
        )}
        <div className="overflow-hidden rounded-2xl border border-border bg-surface xl:grid xl:h-[calc(100dvh-15rem)] xl:min-h-[30rem] xl:grid-cols-[minmax(17rem,21rem)_minmax(0,1fr)]">
          <div ref={listRef} className={cn('min-h-0 flex-col xl:flex xl:border-r xl:border-border', threadOpen ? 'hidden' : 'flex')}>
            {conversations.length > 0 ? (
              <ConversationList
                conversations={conversations}
                participants={participants}
                selectedId={selected?.id ?? null}
                myUid={myUid}
                onOpen={openConversation}
              />
            ) : (
              <p className="p-6 text-sm text-ink-secondary">No conversations yet.</p>
            )}
          </div>
          <div className={cn('min-h-0 min-w-0 flex-col xl:flex', threadOpen ? 'flex' : 'hidden')}>
            {selected ? (
              <ConversationThread
                key={selected.id}
                conversation={selected}
                participant={participants.get(selected.id)}
                myUid={myUid}
                draft={drafts[selected.id] ?? ''}
                onDraftChange={(text) => setDrafts((current) => ({ ...current, [selected.id]: text }))}
                onBack={closeConversation}
                onModuleDisabled={onModuleDisabled}
                onAnnounce={announce}
                headingRef={headingRef}
              />
            ) : missing ? (
              <NotAvailable onBack={closeConversation} headingRef={missingHeadingRef} />
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
                <MessageSquare className="size-8 text-ink-muted" aria-hidden="true" />
                <p className="text-sm text-ink-secondary">Select a conversation to read and reply.</p>
              </div>
            )}
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="p-4 lg:p-6 xl:p-8">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-xl font-bold text-ink sm:text-2xl">Messages</h1>
            {totalUnread > 0 && (
              <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700 dark:bg-brand-950/50 dark:text-brand-200">
                {totalUnread} unread
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-ink-secondary">Conversations with employers about your job applications.</p>
        </header>
        <p role="status" aria-live="polite" className="sr-only">{announcement}</p>
        {content}
      </div>
    </div>
  );
}
