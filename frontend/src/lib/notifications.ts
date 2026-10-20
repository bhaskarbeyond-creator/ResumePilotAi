/**
 * Typed client for the signed-in user's notification feed
 * (backend/routes/notificationsData.js), through the shared apiClient
 * (base URL /api, Bearer token, refresh).
 *
 *   GET   /notifications-data                the caller's rows, newest first (no paging, no cap)
 *   PATCH /notifications-data/:id { read }   set one row read or unread; 404 unless it is the caller's
 *   POST  /notifications-data/mark-all-read  mark every unread row of the caller read
 *
 * A row is a MariaDB `notifications` record: id, type, title, message, data
 * (JSON), read, created_at and delivery bookkeeping. Rows are written by backend
 * workflows (job applications and their status changes, payments, moderation).
 * The API has no create, delete, star or archive route, and the table has no
 * sender, priority or category column, so this client offers none of them.
 */
import axios from 'axios';
import { apiClient, normalizeError } from '@/lib/api-client';

const ROW_ID = /^[A-Za-z0-9_-]{1,128}$/;

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  /** Epoch milliseconds; 0 when the row carries no parseable time. */
  createdAt: number;
  data: Record<string, unknown>;
}

export class NotificationsApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'NotificationsApiError';
    this.status = status;
    this.code = code;
  }

  get notFound(): boolean {
    return this.status === 404;
  }
}

export function toNotificationsError(error: unknown): NotificationsApiError {
  if (error instanceof NotificationsApiError) return error;
  if (axios.isCancel(error)) return new NotificationsApiError(0, 'CANCELLED', 'The request was cancelled.');
  const normalized = normalizeError(error);
  if (normalized.status === 0) {
    const message = normalized.code === 'NETWORK_ERROR'
      ? 'The server could not be reached. Check your connection and try again.'
      : normalized.message;
    return new NotificationsApiError(0, normalized.code, message);
  }
  // normalizeError reports NETWORK_ERROR whenever a response carries no code;
  // this route answers { success: false, error: '…' }, so name failures by status.
  const code = normalized.code === 'NETWORK_ERROR' ? `HTTP_${normalized.status}` : normalized.code;
  return new NotificationsApiError(normalized.status, code, normalized.message);
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const toTime = (value: unknown): number => {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : 0;
  const time = Date.parse(typeof value === 'string' ? value : '');
  return Number.isFinite(time) && time > 0 ? time : 0;
};

/**
 * One API row → NotificationItem. Every row of the `notifications` table has an
 * id (its primary key), so a row without a usable id means the response is not
 * the documented contract: that is reported as an error, never skipped quietly.
 */
export function toNotification(raw: unknown): NotificationItem {
  const row = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  const id = row ? text(row.id) : '';
  if (!row || !ROW_ID.test(id)) {
    throw new NotificationsApiError(0, 'CONTRACT', 'The server returned a notification this page cannot read.');
  }
  const data = row.data && typeof row.data === 'object' && !Array.isArray(row.data) ? (row.data as Record<string, unknown>) : {};
  return {
    id,
    type: text(row.type).toLowerCase(),
    title: text(row.title) || 'Notification',
    message: text(row.message),
    // The repository adds `read`; `is_read` is the column it is derived from.
    read: row.read === true || (row.read === undefined && (row.is_read === 1 || row.is_read === true)),
    createdAt: toTime(row.created_at ?? row.createdAt),
    data,
  };
}

async function call<T>(work: () => Promise<{ data: T }>): Promise<T> {
  try {
    return (await work()).data;
  } catch (error) {
    throw toNotificationsError(error);
  }
}

export async function fetchNotifications(signal?: AbortSignal): Promise<NotificationItem[]> {
  const data = await call(() => apiClient.get<{ notifications?: unknown }>('/notifications-data', { signal }));
  if (!Array.isArray(data?.notifications)) {
    throw new NotificationsApiError(0, 'CONTRACT', 'The server returned notifications in a form this page cannot read.');
  }
  return data.notifications.map(toNotification);
}

export async function setNotificationRead(id: string, read: boolean): Promise<void> {
  await call(() => apiClient.patch(`/notifications-data/${encodeURIComponent(id)}`, { read }));
}

/** Resolves to the number of rows the server changed. */
export async function markAllNotificationsRead(): Promise<number> {
  const data = await call(() => apiClient.post<{ updated?: unknown }>('/notifications-data/mark-all-read', {}));
  const updated = Number(data?.updated);
  return Number.isFinite(updated) && updated > 0 ? Math.trunc(updated) : 0;
}
