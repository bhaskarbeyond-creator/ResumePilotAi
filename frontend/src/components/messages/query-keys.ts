/** React Query keys and retry policy shared by the Messages page and its parts. */
import { toMessagesError } from '@/lib/messages';

export const MESSAGES_LIST_KEY = ['messages', 'conversations'] as const;
export const threadKey = (conversationId: string) => ['messages', 'thread', conversationId] as const;
export const profileKey = (conversationId: string) => ['messages', 'profile', conversationId] as const;

/**
 * One retry for a transient failure (network, 5xx). Never for an answer the
 * server has decided: bad request, signed out, module off, not a participant,
 * or rate limited (retrying would only spend more of the read budget).
 */
export function messagesRetry(failureCount: number, error: unknown): boolean {
  const failure = toMessagesError(error);
  if (failure.cancelled || [400, 401, 403, 404, 429].includes(failure.status)) return false;
  return failureCount < 1;
}
