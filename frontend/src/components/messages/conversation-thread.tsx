/**
 * One conversation: the newest messages from the server (oldest first), the
 * caller's read cursor, and a composer that posts to /api/messages/send.
 *
 * - A sent message is shown only after the thread is re-read from the server,
 *   so nothing appears that was not stored. A failed send keeps the text.
 * - The thread re-reads every 10 s while the tab is visible; incoming messages
 *   are announced through the page's polite live region.
 * - Opening the thread (and every later incoming message) advances the read
 *   cursor to the newest message; the list's unread counts follow from the server.
 */
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent, type Ref } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ArrowLeft, RotateCcw, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  MESSAGE_MAX_LENGTH,
  THREAD_LIMIT,
  formatClock,
  formatDayLabel,
  formatFullTime,
  isSameDay,
  listMessages,
  markConversationRead,
  sendMessage,
  toIsoTime,
  toMessagesError,
  type ChatMessage,
  type ConversationSummary,
  type MessagesApiError,
} from '@/lib/messages';
import { ParticipantAvatar, type ParticipantView } from '@/components/messages/participant-avatar';
import { MESSAGES_LIST_KEY, messagesRetry, threadKey } from '@/components/messages/query-keys';

const COUNTER_FROM = MESSAGE_MAX_LENGTH - 1000;

interface ConversationThreadProps {
  conversation: ConversationSummary;
  participant: ParticipantView | undefined;
  myUid: string;
  draft: string;
  onDraftChange: (text: string) => void;
  onBack: () => void;
  onModuleDisabled: () => void;
  onAnnounce: (text: string) => void;
  headingRef?: Ref<HTMLHeadingElement>;
}

function useThread(conversationId: string) {
  return useQuery({
    queryKey: threadKey(conversationId),
    queryFn: ({ signal }) => listMessages(conversationId, signal),
    refetchInterval: (query) => (query.state.status === 'error' ? false : 10_000),
    staleTime: 0,
    retry: messagesRetry,
  });
}

export function ConversationThread(props: ConversationThreadProps) {
  const { conversation, participant, myUid, draft, onDraftChange, onModuleDisabled, onAnnounce } = props;
  const queryClient = useQueryClient();
  const thread = useThread(conversation.id);
  const threadError: MessagesApiError | null = thread.error ? toMessagesError(thread.error) : null;
  const messages = thread.data;
  const name = participant?.name ?? 'this participant';

  const threadModuleOff = Boolean(threadError?.moduleDisabled);
  useEffect(() => {
    if (threadModuleOff) onModuleDisabled();
  }, [threadModuleOff, onModuleDisabled]);

  /* Read cursor: advance once per newest message that needs it. */
  const [readError, setReadError] = useState<string | null>(null);
  const markedRef = useRef('');
  const markRead = useMutation({
    mutationFn: (message: ChatMessage) => markConversationRead(conversation.id, message),
    onSuccess: () => {
      setReadError(null);
      void queryClient.invalidateQueries({ queryKey: MESSAGES_LIST_KEY });
    },
    onError: (error) => {
      const failure = toMessagesError(error);
      if (failure.moduleDisabled) onModuleDisabled();
      else setReadError(`Read status could not be saved. ${failure.message}`);
    },
  });
  const newest = messages && messages.length > 0 ? messages[messages.length - 1] : undefined;
  const needsRead = Boolean(newest && markedRef.current !== newest.id && (conversation.unreadCount > 0 || newest.senderId !== myUid));
  const { mutate: advanceCursor } = markRead;
  useEffect(() => {
    if (!newest || !needsRead) return;
    markedRef.current = newest.id;
    advanceCursor(newest);
  }, [newest, needsRead, advanceCursor]);

  /* Announce messages that arrive while the thread is open. */
  const seenRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!messages) return;
    if (!seenRef.current) {
      seenRef.current = new Set(messages.map((message) => message.id));
      return;
    }
    const seen = seenRef.current;
    const fresh = messages.filter((message) => !seen.has(message.id));
    fresh.forEach((message) => seen.add(message.id));
    const incoming = fresh.filter((message) => message.senderId !== myUid).length;
    if (incoming > 0) onAnnounce(incoming === 1 ? `New message from ${name}.` : `${incoming} new messages from ${name}.`);
  }, [messages, myUid, name, onAnnounce]);

  /* Keep the newest message in view unless the reader scrolled up. */
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (element && stickRef.current) element.scrollTop = element.scrollHeight;
  }, [messages]);
  const onScroll = () => {
    const element = scrollRef.current;
    if (element) stickRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
  };

  /* Composer. */
  const [sendError, setSendError] = useState<string | null>(null);
  const send = useMutation({
    mutationFn: (text: string) => sendMessage(conversation.id, text),
    onSuccess: async () => {
      onDraftChange('');
      setSendError(null);
      stickRef.current = true;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: threadKey(conversation.id) }),
        queryClient.invalidateQueries({ queryKey: MESSAGES_LIST_KEY }),
      ]);
      onAnnounce('Message sent.');
    },
    onError: (error) => {
      const failure = toMessagesError(error);
      if (failure.moduleDisabled) return onModuleDisabled();
      setSendError(failure.notFound
        ? 'This conversation is no longer available, so your message was not sent.'
        : `Your message was not sent. ${failure.message}`);
    },
  });
  const trimmed = draft.trim();
  // isPending reaches the button only after React Query's next notify tick, so a
  // double click or a held Enter key could send twice; this ref closes that gap.
  const inFlightRef = useRef(false);
  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (!trimmed || inFlightRef.current) return;
    inFlightRef.current = true;
    send.mutate(trimmed, { onSettled: () => { inFlightRef.current = false; } });
  };
  const onComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <ThreadView
      {...props}
      name={name}
      thread={thread}
      threadError={threadError}
      readError={readError}
      onRetryRead={() => newest && markRead.mutate(newest)}
      retryingRead={markRead.isPending}
      scrollRef={scrollRef}
      onScroll={onScroll}
      sendError={sendError}
      sending={send.isPending}
      canSend={trimmed.length > 0 && !threadError?.notFound}
      onSubmit={submit}
      onComposerKeyDown={onComposerKeyDown}
    />
  );
}

interface ThreadViewProps extends ConversationThreadProps {
  name: string;
  thread: ReturnType<typeof useThread>;
  threadError: MessagesApiError | null;
  readError: string | null;
  onRetryRead: () => void;
  retryingRead: boolean;
  scrollRef: Ref<HTMLDivElement>;
  onScroll: () => void;
  sendError: string | null;
  sending: boolean;
  canSend: boolean;
  onSubmit: (event?: FormEvent) => void;
  onComposerKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
}

function InlineAlert({ children, onRetry, retrying, id }: { children: React.ReactNode; onRetry?: () => void; retrying?: boolean; id?: string }) {
  return (
    <div id={id} role="alert" className="flex flex-wrap items-start gap-x-3 gap-y-2 rounded-lg border border-error-200 bg-error-50 px-3 py-2 text-sm text-error-800">
      <p className="flex min-w-0 flex-1 items-start gap-2">
        <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 break-words">{children}</span>
      </p>
      {onRetry && (
        <Button size="xs" variant="outline" onClick={onRetry} loading={retrying}>
          <RotateCcw aria-hidden="true" /> Try again
        </Button>
      )}
    </div>
  );
}

function ThreadView(props: ThreadViewProps) {
  const { conversation, participant, myUid, draft, onDraftChange, onBack, headingRef, name, thread, threadError } = props;
  const messages = thread.data ?? [];
  const gone = Boolean(threadError?.notFound);
  const composerId = `composer-${conversation.id}`;
  const showCount = draft.length >= COUNTER_FROM;
  const describedBy = [`${composerId}-hint`, showCount ? `${composerId}-count` : '', props.sendError ? `${composerId}-error` : '']
    .filter(Boolean)
    .join(' ');

  return (
    <section aria-labelledby="thread-heading" aria-busy={thread.isPending || undefined} className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-border px-3 py-3 sm:px-4">
        <Button variant="ghost" size="icon-sm" className="xl:hidden" onClick={onBack} aria-label="Back to conversations">
          <ArrowLeft aria-hidden="true" />
        </Button>
        <ParticipantAvatar participant={participant} className="size-9" />
        <div className="min-w-0">
          <h2 id="thread-heading" ref={headingRef} tabIndex={-1} className="truncate text-base font-semibold text-ink focus:outline-none">
            {participant?.name ?? 'Loading name…'}
          </h2>
          {conversation.applicationId && <p className="truncate text-xs text-ink-muted">About one of your job applications</p>}
        </div>
      </header>

      <div
        ref={props.scrollRef}
        onScroll={props.onScroll}
        role="region"
        aria-label="Message history"
        tabIndex={0}
        className="h-[clamp(14rem,calc(100dvh-22rem),34rem)] overflow-y-auto px-3 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 sm:px-4 xl:h-auto xl:min-h-0 xl:flex-1"
      >
        {thread.isPending ? (
          <p className="py-10 text-center text-sm text-ink-secondary">Loading messages…</p>
        ) : gone ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-sm font-semibold text-ink">This conversation is no longer available.</p>
            <Button variant="outline" size="sm" onClick={onBack}>Back to conversations</Button>
          </div>
        ) : threadError && !thread.data ? (
          <InlineAlert onRetry={() => void thread.refetch()} retrying={thread.isFetching}>
            Messages could not be loaded. {threadError.message}
          </InlineAlert>
        ) : messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-ink-secondary">No messages yet. Write the first message below.</p>
        ) : (
          <>
            {messages.length >= THREAD_LIMIT && (
              <p className="mb-3 text-center text-xs text-ink-muted">
                Showing the latest {THREAD_LIMIT} messages. Older messages can’t be shown here.
              </p>
            )}
            <ol aria-label={`Messages with ${name}`} className="space-y-2">
              {messages.map((message, index) => {
                const previous = messages[index - 1];
                const mine = message.senderId === myUid;
                return (
                  <Fragment key={message.id}>
                    {(!previous || !isSameDay(previous.timestamp, message.timestamp)) && (
                      <li className="py-2 text-center">
                        <span className="rounded-full bg-canvas px-3 py-1 text-xs font-medium text-ink-secondary">{formatDayLabel(message.timestamp)}</span>
                      </li>
                    )}
                    <li data-sender={mine ? 'me' : 'them'} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                      <div className={cn('max-w-[85%] rounded-2xl px-3.5 py-2 text-sm sm:max-w-[75%]', mine ? 'rounded-br-md bg-brand-600 text-white' : 'rounded-bl-md bg-canvas-soft text-ink')}>
                        <span className="sr-only">{mine ? 'You' : name}: </span>
                        <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{message.text}</p>
                        <time
                          dateTime={toIsoTime(message.timestamp)}
                          title={formatFullTime(message.timestamp)}
                          className={cn('mt-1 block text-right text-[0.6875rem]', mine ? 'text-brand-50' : 'text-ink-muted')}
                        >
                          {formatClock(message.timestamp)}
                        </time>
                      </div>
                    </li>
                  </Fragment>
                );
              })}
            </ol>
          </>
        )}
      </div>

      {(props.readError || (threadError && thread.data && !gone)) && (
        <div className="space-y-2 border-t border-border px-3 pt-3 sm:px-4">
          {threadError && thread.data && !gone && (
            <InlineAlert onRetry={() => void thread.refetch()} retrying={thread.isFetching}>
              New messages could not be loaded. {threadError.message}
            </InlineAlert>
          )}
          {props.readError && <InlineAlert onRetry={props.onRetryRead} retrying={props.retryingRead}>{props.readError}</InlineAlert>}
        </div>
      )}

      {!gone && (
        <form onSubmit={props.onSubmit} className="border-t border-border p-3 sm:p-4">
          {props.sendError && <div className="mb-2"><InlineAlert id={`${composerId}-error`}>{props.sendError}</InlineAlert></div>}
          <label htmlFor={composerId} className="sr-only">Message to {name}</label>
          <div className="flex items-end gap-2">
            <textarea
              id={composerId}
              value={draft}
              onChange={(event) => onDraftChange(event.target.value)}
              onKeyDown={props.onComposerKeyDown}
              readOnly={props.sending}
              rows={2}
              maxLength={MESSAGE_MAX_LENGTH}
              placeholder="Write a message"
              aria-describedby={describedBy}
              className="max-h-40 min-h-11 w-full min-w-0 flex-1 resize-y rounded-xl border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
            <Button type="submit" loading={props.sending} disabled={!props.canSend} className="shrink-0">
              {!props.sending && <Send aria-hidden="true" />} Send
            </Button>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-ink-muted">
            <p id={`${composerId}-hint`}>Enter sends. Shift+Enter adds a new line.</p>
            {showCount && (
              <p id={`${composerId}-count`}>
                {draft.length.toLocaleString()} of {MESSAGE_MAX_LENGTH.toLocaleString()} characters
              </p>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
