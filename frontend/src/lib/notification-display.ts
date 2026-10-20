/**
 * How a notification is presented: its kind (icon and label), the mounted page it
 * links to when there is an honest one, and search matching. Kept apart from the
 * client in ./notifications so the app shell, which only needs the feed and the
 * read state, does not carry it.
 */
import { isConversationId } from '@/lib/messages';
import type { NotificationItem } from '@/lib/notifications';

export type NotificationKind = 'application' | 'interview' | 'message' | 'billing' | 'update';

/**
 * The `type` values backend producers write: resilientMutations.createApplication,
 * jobApplicationNotification in backend/index.js, the payment transitions in
 * MySQLRepository, plus `message` rows written before DIR-072. Anything else
 * (moderation, employer-side updates, future producers) is a generic update.
 */
const KIND_BY_TYPE: Record<string, NotificationKind> = {
  job_application: 'application',
  job_application_received: 'application',
  application_status_update: 'application',
  application_accepted: 'application',
  application_rejected: 'application',
  application_interview: 'interview',
  message: 'message',
  new_message: 'message',
  conversation: 'message',
  payment_active: 'billing',
  payment_refunded: 'billing',
  payment_chargeback: 'billing',
};

export const KIND_LABEL: Record<NotificationKind, string> = {
  application: 'Application',
  interview: 'Interview',
  message: 'Message',
  billing: 'Billing',
  update: 'Update',
};

export function notificationKind(item: Pick<NotificationItem, 'type'>): NotificationKind {
  return KIND_BY_TYPE[item.type] ?? 'update';
}

export interface NotificationDestination {
  href: string;
  label: string;
}

/**
 * A mounted candidate route that is about this row, or null. Only rows with an
 * honest target link anywhere:
 *  - message rows (written before DIR-072) open their conversation; the Messages
 *    page reads ?conversationId= (pages/dashboard/messages.tsx);
 *  - an interview invitation opens the Interview Coach to prepare.
 * Application rows have no target: /dashboard/applied-jobs renders the Job
 * Tracker, which lists the user's own tracked jobs, not their applications.
 */
export function notificationDestination(item: Pick<NotificationItem, 'type' | 'data'>): NotificationDestination | null {
  if (notificationKind(item) === 'message') {
    const raw = item.data.conversationId ?? item.data.conversation_id;
    const conversationId = typeof raw === 'string' ? raw.trim() : '';
    return isConversationId(conversationId)
      ? { href: `/dashboard/messages?conversationId=${encodeURIComponent(conversationId)}`, label: 'Open conversation' }
      : { href: '/dashboard/messages', label: 'Open messages' };
  }
  if (item.type === 'application_interview') return { href: '/dashboard/interviews', label: 'Prepare with Interview Coach' };
  return null;
}

/** Case-insensitive match on what a row shows: its title, message and kind. */
export function matchesSearch(item: NotificationItem, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  return [item.title, item.message, KIND_LABEL[notificationKind(item)]]
    .some((value) => value.toLocaleLowerCase().includes(needle));
}
