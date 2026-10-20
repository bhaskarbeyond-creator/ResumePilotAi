/**
 * Conversation list for the Messages page: participant, newest message, time and
 * the server's unread count for the signed-in user, with a client-side search
 * over what the API returned (the list is capped at 100 conversations).
 */
import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatFullTime, formatListTime, toIsoTime, type ConversationSummary } from '@/lib/messages';
import { ParticipantAvatar, type ParticipantView } from '@/components/messages/participant-avatar';

interface ConversationListProps {
  conversations: ConversationSummary[];
  participants: Map<string, ParticipantView>;
  selectedId: string | null;
  myUid: string;
  onOpen: (conversationId: string) => void;
}

export function ConversationList({ conversations, participants, selectedId, myUid, onOpen }: ConversationListProps) {
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();

  const visible = useMemo(() => {
    if (!needle) return conversations;
    return conversations.filter((conversation) => {
      const name = participants.get(conversation.id)?.name ?? '';
      const text = conversation.lastMessage?.text ?? '';
      return name.toLowerCase().includes(needle) || text.toLowerCase().includes(needle);
    });
  }, [conversations, participants, needle]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border p-3">
        <label htmlFor="conversation-search" className="sr-only">Search conversations</label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
          <Input
            id="conversation-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search conversations"
            autoComplete="off"
            className="pl-9"
          />
        </div>
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {needle ? `${visible.length} of ${conversations.length} conversations match.` : ''}
      </p>
      {visible.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 p-6 text-center">
          <p className="text-sm font-semibold text-ink">No conversations match “{query.trim()}”</p>
          <p className="text-sm text-ink-secondary">Search looks at names and the newest message.</p>
          <Button variant="link" size="sm" className="mt-1" onClick={() => setQuery('')}>Clear search</Button>
        </div>
      ) : (
        <ul aria-label="Conversations" className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
          {visible.map((conversation) => (
            <li key={conversation.id}>
              <ConversationRow
                conversation={conversation}
                participant={participants.get(conversation.id)}
                selected={conversation.id === selectedId}
                myUid={myUid}
                onOpen={onOpen}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ConversationRow({ conversation, participant, selected, myUid, onOpen }: {
  conversation: ConversationSummary;
  participant: ParticipantView | undefined;
  selected: boolean;
  myUid: string;
  onOpen: (conversationId: string) => void;
}) {
  const last = conversation.lastMessage;
  const unread = conversation.unreadCount;
  const name = participant?.name ?? 'Loading name…';
  const preview = last ? `${last.senderId === myUid ? 'You: ' : ''}${last.text}` : 'No messages yet';
  return (
    <button
      type="button"
      data-conversation-id={conversation.id}
      aria-current={selected ? 'true' : undefined}
      onClick={() => onOpen(conversation.id)}
      className={cn(
        'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500',
        selected ? 'bg-brand-50 dark:bg-brand-950/40' : 'hover:bg-canvas',
      )}
    >
      <ParticipantAvatar participant={participant} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className={cn('truncate text-sm text-ink', unread > 0 ? 'font-semibold' : 'font-medium')}>{name}</span>
          {last && (
            <time dateTime={toIsoTime(last.timestamp)} title={formatFullTime(last.timestamp)} className="shrink-0 text-xs text-ink-muted">
              {formatListTime(last.timestamp)}
            </time>
          )}
        </span>
        <span className="mt-0.5 flex items-center justify-between gap-2">
          <span className={cn('truncate text-sm', unread > 0 ? 'font-medium text-ink' : 'text-ink-secondary')}>{preview}</span>
          {unread > 0 && (
            <span className="inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-brand-600 px-1.5 text-xs font-semibold leading-5 text-white">
              {unread}<span className="sr-only">{unread === 1 ? ' unread message' : ' unread messages'}</span>
            </span>
          )}
        </span>
      </span>
    </button>
  );
}
