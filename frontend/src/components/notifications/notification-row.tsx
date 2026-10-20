/**
 * One notification in the feed: what happened (title, message), what it is about
 * (kind, time), an optional link to the mounted page it concerns, and a read /
 * unread toggle. The toggle stays focusable while its write is in flight
 * (aria-disabled, not disabled), so keyboard focus never drops to the page.
 */
import { Link } from 'react-router-dom';
import {
  Bell,
  Briefcase,
  CalendarClock,
  Check,
  ChevronRight,
  CreditCard,
  Loader2,
  MessageSquare,
  RotateCcw,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatFullTime, formatListTime, toIsoTime } from '@/lib/messages';
import type { NotificationItem } from '@/lib/notifications';
import { KIND_LABEL, notificationDestination, notificationKind, type NotificationKind } from '@/lib/notification-display';

const KIND_ICON: Record<NotificationKind, LucideIcon> = {
  application: Briefcase,
  interview: CalendarClock,
  message: MessageSquare,
  billing: CreditCard,
  update: Bell,
};

interface NotificationRowProps {
  item: NotificationItem;
  /** This row's read change is being saved. */
  pending: boolean;
  /** Another write (e.g. mark all as read) is in flight. */
  locked: boolean;
  onToggleRead: (item: NotificationItem) => void;
  onFollow: (item: NotificationItem) => void;
}

export function NotificationRow({ item, pending, locked, onToggleRead, onFollow }: NotificationRowProps) {
  const kind = notificationKind(item);
  const Icon = KIND_ICON[kind];
  const destination = notificationDestination(item);
  const unread = !item.read;
  const time = formatListTime(item.createdAt);
  const unavailable = pending || locked;

  return (
    <li
      data-notification-id={item.id}
      data-read={item.read ? 'true' : 'false'}
      className={cn('flex items-start gap-3 px-4 py-3 sm:px-5 sm:py-4', unread && 'bg-brand-50/70 dark:bg-brand-950/25')}
    >
      <span
        aria-hidden="true"
        className={cn(
          'mt-0.5 hidden size-9 shrink-0 items-center justify-center rounded-full sm:flex',
          unread ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/60 dark:text-brand-200' : 'bg-neutral-100 text-ink-muted dark:bg-neutral-800',
        )}
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn('flex items-start gap-2 text-sm', unread ? 'font-semibold text-ink' : 'font-medium text-ink-secondary')}>
          {unread && <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-600" />}
          <span className="min-w-0 [overflow-wrap:anywhere]">
            {unread && <span className="sr-only">Unread: </span>}
            {item.title}
          </span>
        </p>
        {item.message && <p className="mt-0.5 text-sm text-ink-secondary [overflow-wrap:anywhere]">{item.message}</p>}
        <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-ink-muted">
          <span>{KIND_LABEL[kind]}</span>
          {time && (
            <>
              <span aria-hidden="true">·</span>
              <time dateTime={toIsoTime(item.createdAt)} title={formatFullTime(item.createdAt)}>{time}</time>
            </>
          )}
        </p>
        {destination && (
          <Link
            to={destination.href}
            onClick={() => onFollow(item)}
            className="mt-2 inline-flex min-h-6 items-center gap-1 text-sm font-medium text-brand-700 underline-offset-4 hover:underline dark:text-brand-300"
          >
            {destination.label}
            <ChevronRight className="size-4" aria-hidden="true" />
          </Link>
        )}
      </div>
      <button
        type="button"
        onClick={() => onToggleRead(item)}
        aria-disabled={unavailable || undefined}
        aria-busy={pending || undefined}
        aria-label={unread ? `Mark “${item.title}” as read` : `Mark “${item.title}” as unread`}
        title={unread ? 'Mark as read' : 'Mark as unread'}
        className={cn(
          'flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-ink-muted transition-colors',
          'hover:bg-neutral-100 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:hover:bg-neutral-800',
          'aria-disabled:cursor-not-allowed aria-disabled:opacity-60',
        )}
      >
        {pending
          ? <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          : unread
            ? <Check className="size-4" aria-hidden="true" />
            : <RotateCcw className="size-4" aria-hidden="true" />}
      </button>
    </li>
  );
}
