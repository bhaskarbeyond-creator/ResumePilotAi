/**
 * Typed client for direct messaging (backend/index.js, /api/messages/*), through
 * the shared apiClient (base URL /api, Bearer token, refresh).
 *
 *   GET  /messages/conversations                          the caller's conversations, unread counts, totalUnread
 *   GET  /messages/conversations/:id/messages?limit=n     the newest n (at most 100) messages, oldest first
 *   GET  /messages/conversations/:id/participant-profile  the other participant's name and avatar
 *   POST /messages/conversations/:id/read                 advance the caller's read cursor (never moves back)
 *   POST /messages/send                                   send { conversationId, text } (1 to 10 000 characters)
 *
 * Every route answers 403 MODULE_DISABLED unless an administrator has turned the
 * messaging module on (it ships off). A conversation the caller is not part of
 * answers 404, exactly like an unknown one. Conversations are opened for a job
 * application by its employer (or applicant); the candidate dashboard has no
 * screen that creates them, and the API has no delete, star or archive route.
 */
import axios from 'axios';
import { apiClient, normalizeError } from '@/lib/api-client';

export const MESSAGE_MAX_LENGTH = 10_000;
/** The thread route returns at most the newest 100 messages and has no cursor for older ones. */
export const THREAD_LIMIT = 100;

const CONVERSATION_ID = /^[A-Za-z0-9_-]{1,128}$/;

export interface ChatMessage {
  id: string;
  senderId: string;
  text: string;
  /** Epoch milliseconds, as stored (BIGINT). */
  timestamp: number;
}

export interface ConversationSummary {
  id: string;
  applicationId: string | null;
  participantIds: string[];
  lastMessage: ChatMessage | null;
  unreadCount: number;
}

export interface ConversationList {
  conversations: ConversationSummary[];
  totalUnread: number;
}

export interface ParticipantProfile {
  name: string;
  avatar: string;
}

export class MessagesApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'MessagesApiError';
    this.status = status;
    this.code = code;
  }

  get moduleDisabled(): boolean {
    return this.status === 403 && this.code === 'MODULE_DISABLED';
  }

  get notFound(): boolean {
    return this.status === 404;
  }

  get cancelled(): boolean {
    return this.code === 'CANCELLED';
  }
}

export function toMessagesError(error: unknown): MessagesApiError {
  if (error instanceof MessagesApiError) return error;
  if (axios.isCancel(error)) return new MessagesApiError(0, 'CANCELLED', 'The request was cancelled.');
  const normalized = normalizeError(error);
  if (normalized.status === 0) {
    const message = normalized.code === 'NETWORK_ERROR'
      ? 'The server could not be reached. Check your connection and try again.'
      : normalized.message;
    return new MessagesApiError(0, normalized.code, message);
  }
  // normalizeError reports NETWORK_ERROR whenever a response carries no code;
  // most messaging errors are { success: false, error: '…' }, so name them by status.
  const code = normalized.code === 'NETWORK_ERROR' ? `HTTP_${normalized.status}` : normalized.code;
  return new MessagesApiError(normalized.status, code, normalized.message);
}

/** /api/messages/* only accepts this id shape; anything else can never be a conversation. */
export function isConversationId(value: string | null | undefined): value is string {
  return typeof value === 'string' && CONVERSATION_ID.test(value);
}

const finiteNumber = (value: unknown): number => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

function toMessage(raw: unknown): ChatMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.id !== 'string' || !row.id) return null;
  return {
    id: row.id,
    senderId: String(row.senderId ?? ''),
    text: String(row.text ?? ''),
    timestamp: finiteNumber(row.timestamp),
  };
}

function toConversation(raw: unknown): ConversationSummary | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  if (!isConversationId(typeof row.id === 'string' ? row.id : '')) return null;
  const participants = row.participants && typeof row.participants === 'object' ? Object.keys(row.participants) : [];
  return {
    id: row.id as string,
    applicationId: typeof row.applicationId === 'string' && row.applicationId ? row.applicationId : null,
    participantIds: participants,
    lastMessage: toMessage(row.lastMessage),
    // The server leaves unreadCount off a conversation that has no messages yet.
    unreadCount: Math.max(0, Math.trunc(finiteNumber(row.unreadCount))),
  };
}

async function call<T>(work: () => Promise<{ data: T }>): Promise<T> {
  try {
    return (await work()).data;
  } catch (error) {
    throw toMessagesError(error);
  }
}

export async function listConversations(signal?: AbortSignal): Promise<ConversationList> {
  const data = await call(() => apiClient.get<{ conversations?: unknown[]; totalUnread?: unknown }>('/messages/conversations', { signal }));
  const conversations = (Array.isArray(data.conversations) ? data.conversations : [])
    .map(toConversation)
    .filter((item): item is ConversationSummary => item !== null);
  return { conversations, totalUnread: Math.max(0, Math.trunc(finiteNumber(data.totalUnread))) };
}

export async function listMessages(conversationId: string, signal?: AbortSignal): Promise<ChatMessage[]> {
  const data = await call(() => apiClient.get<{ messages?: unknown[] }>(`/messages/conversations/${encodeURIComponent(conversationId)}/messages`, {
    params: { limit: THREAD_LIMIT },
    signal,
  }));
  return (Array.isArray(data.messages) ? data.messages : [])
    .map(toMessage)
    .filter((item): item is ChatMessage => item !== null);
}

export async function getParticipantProfile(conversationId: string, signal?: AbortSignal): Promise<ParticipantProfile> {
  const data = await call(() => apiClient.get<{ profile?: { name?: unknown; avatar?: unknown } }>(`/messages/conversations/${encodeURIComponent(conversationId)}/participant-profile`, { signal }));
  return {
    name: typeof data.profile?.name === 'string' && data.profile.name.trim() ? data.profile.name.trim() : 'Unknown participant',
    avatar: typeof data.profile?.avatar === 'string' ? data.profile.avatar : '',
  };
}

/**
 * Marks everything up to and including `message` as read for the signed-in user only.
 *
 * Only the message ID is sent: the read timestamp is the persisted
 * `conversation_messages.timestamp` of that row, resolved server-side. Sending a
 * client timestamp would let a caller claim they had read messages that do not
 * exist yet (Mandate 12, DIR-026).
 */
export async function markConversationRead(conversationId: string, message: ChatMessage): Promise<void> {
  await call(() => apiClient.post(`/messages/conversations/${encodeURIComponent(conversationId)}/read`, {
    lastReadMessageId: message.id,
  }));
}

export async function sendMessage(conversationId: string, text: string): Promise<string> {
  const data = await call(() => apiClient.post<{ messageId?: string }>('/messages/send', { conversationId, text }));
  return String(data.messageId ?? '');
}

/* ─── Time labels ─── */

const clock = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const shortDate = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
const shortDateYear = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const longDay = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
const longDayYear = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const full = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

const startOfDay = (value: number) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};
const dayOffset = (timestamp: number, now: number) => Math.round((startOfDay(now) - startOfDay(timestamp)) / 86_400_000);
const valid = (timestamp: number) => Number.isFinite(timestamp) && timestamp > 0;

export function isSameDay(a: number, b: number): boolean {
  return startOfDay(a) === startOfDay(b);
}

/** Conversation-row label: the time today, "Yesterday", or a date. */
export function formatListTime(timestamp: number, now = Date.now()): string {
  if (!valid(timestamp)) return '';
  const offset = dayOffset(timestamp, now);
  if (offset <= 0) return clock.format(timestamp);
  if (offset === 1) return 'Yesterday';
  return new Date(timestamp).getFullYear() === new Date(now).getFullYear()
    ? shortDate.format(timestamp)
    : shortDateYear.format(timestamp);
}

/** Day divider inside a thread. */
export function formatDayLabel(timestamp: number, now = Date.now()): string {
  if (!valid(timestamp)) return '';
  const offset = dayOffset(timestamp, now);
  if (offset <= 0) return 'Today';
  if (offset === 1) return 'Yesterday';
  return new Date(timestamp).getFullYear() === new Date(now).getFullYear()
    ? longDay.format(timestamp)
    : longDayYear.format(timestamp);
}

export function formatClock(timestamp: number): string {
  return valid(timestamp) ? clock.format(timestamp) : '';
}

export function formatFullTime(timestamp: number): string {
  return valid(timestamp) ? full.format(timestamp) : '';
}

export function toIsoTime(timestamp: number): string | undefined {
  return valid(timestamp) ? new Date(timestamp).toISOString() : undefined;
}
