'use strict';

/**
 * DIR-026 / Mandate 12 workstream 1 — server-authoritative, monotonic message read
 * cursors.
 *
 * The previous implementation trusted the client twice:
 *   * `lastReadAt` from the request body was written straight into the cursor, and
 *   * `lastReadMessageId` was shape-checked but never verified to exist, to belong
 *     to the conversation, or to be newer than the stored cursor.
 *
 * This module owns the whole decision so it can be exercised without an HTTP
 * server. The HTTP route in `backend/index.js` only maps the returned outcome to
 * a status code.
 *
 * ORDERING: the messaging read path projects history with
 * `ORDER BY timestamp DESC, id DESC`, so "newer" is the composite
 * (timestamp, id) — compared timestamp-first, then by id. Using timestamp alone
 * would let two messages written inside the same millisecond reorder, and using
 * the id alone would depend on an implementation detail of id minting.
 *
 * CONCURRENCY: the participant row is read `FOR UPDATE` inside the caller's
 * transaction. Every cursor write for a (conversation, user) pair therefore
 * serializes on that row, so two simultaneous advances cannot interleave a
 * read-compare-write and cannot move the cursor backwards. The SQL additionally
 * uses `GREATEST(...)` on the timestamp as defence in depth, but the composite
 * comparison is what actually decides the winner.
 *
 * TIMESTAMPS: only the persisted `conversation_messages.timestamp` is ever
 * written. `Date.now()` and `req.body.lastReadAt` are never consulted.
 */

const CONVERSATION_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const MESSAGE_ID_PATTERN = /^msg_\d{10,20}_[a-f0-9]{8,64}$/;

const OUTCOME = Object.freeze({
  OK: 'OK',
  INVALID_CONVERSATION_ID: 'INVALID_CONVERSATION_ID',
  INVALID_MESSAGE_ID: 'INVALID_MESSAGE_ID',
  CONVERSATION_NOT_FOUND: 'CONVERSATION_NOT_FOUND',
  FORBIDDEN_CONVERSATION_PARTICIPANT: 'FORBIDDEN_CONVERSATION_PARTICIPANT',
  MESSAGE_NOT_IN_CONVERSATION: 'MESSAGE_NOT_IN_CONVERSATION',
  MESSAGE_TIMESTAMP_INVALID: 'MESSAGE_TIMESTAMP_INVALID',
});

function isValidConversationId(value) {
  return typeof value === 'string' && CONVERSATION_ID_PATTERN.test(value);
}

function isValidMessageId(value) {
  return typeof value === 'string' && MESSAGE_ID_PATTERN.test(value);
}

/**
 * Normalize the raw body field. An omitted, null or empty value means "no new
 * cursor supplied" and must never regress or fabricate read state.
 */
function normalizeRequestedMessageId(raw) {
  if (raw === undefined || raw === null) return { supplied: false, value: '' };
  const value = String(raw);
  if (value === '') return { supplied: false, value: '' };
  return { supplied: true, value };
}

function isPersistableTimestamp(value) {
  // `conversation_messages.timestamp` is a BIGINT of epoch milliseconds. A
  // negative, zero, fractional or unsafe value is corrupt data, not a cursor.
  return Number.isSafeInteger(value) && value > 0;
}

/** Compare two {timestamp, id} positions. Returns <0, 0 or >0. */
function compareOrder(left, right) {
  const leftTimestamp = Number(left?.timestamp || 0);
  const rightTimestamp = Number(right?.timestamp || 0);
  if (leftTimestamp !== rightTimestamp) return leftTimestamp - rightTimestamp;
  const leftId = String(left?.id || '');
  const rightId = String(right?.id || '');
  if (leftId === rightId) return 0;
  return leftId > rightId ? 1 : -1;
}

function isNewerThan(candidate, current) {
  return compareOrder(candidate, current) > 0;
}

async function readMessagePosition(connection, conversationId, messageId) {
  const [rows] = await connection.query(
    'SELECT id, timestamp FROM conversation_messages WHERE id = ? AND conversation_id = ? LIMIT 1',
    [messageId, conversationId]
  );
  return rows && rows.length ? rows[0] : null;
}

/**
 * Advance one participant's read cursor.
 *
 * The caller MUST own the transaction and MUST roll back for every non-OK
 * outcome (this function never commits, so a rejection cannot leave a partial
 * write behind).
 *
 * @returns {Promise<{outcome: string, cursor: {lastReadMessageId: string|null, lastReadAt: number|null}, advanced: boolean}>}
 */
async function markConversationRead({ connection, conversationId, uid, requestedMessageId }) {
  if (!isValidConversationId(conversationId)) {
    return { outcome: OUTCOME.INVALID_CONVERSATION_ID, cursor: emptyCursor(), advanced: false };
  }
  if (typeof uid !== 'string' || uid.length === 0) {
    // Authentication is enforced upstream; this is defence in depth so a bug in a
    // future caller can never write a cursor for an anonymous principal.
    return { outcome: OUTCOME.FORBIDDEN_CONVERSATION_PARTICIPANT, cursor: emptyCursor(), advanced: false };
  }

  const requested = normalizeRequestedMessageId(requestedMessageId);
  if (requested.supplied && !isValidMessageId(requested.value)) {
    return { outcome: OUTCOME.INVALID_MESSAGE_ID, cursor: emptyCursor(), advanced: false };
  }

  // A. Conversation existence. A soft-deleted conversation is gone, not merely
  //    inaccessible, so it must not accept cursor writes.
  const [conversations] = await connection.query(
    'SELECT id FROM conversations WHERE id = ? AND deleted_at IS NULL LIMIT 1',
    [conversationId]
  );
  if (!conversations || conversations.length === 0) {
    return { outcome: OUTCOME.CONVERSATION_NOT_FOUND, cursor: emptyCursor(), advanced: false };
  }

  // B. Participant authorization over the authoritative relationship, with the
  //    row locked as the serialization point for concurrent advances.
  const [participants] = await connection.query(
    `SELECT last_read_message_id, last_read_at
       FROM conversation_participants
      WHERE conversation_id = ? AND user_id = ?
      FOR UPDATE`,
    [conversationId, uid]
  );
  if (!participants || participants.length === 0) {
    return { outcome: OUTCOME.FORBIDDEN_CONVERSATION_PARTICIPANT, cursor: emptyCursor(), advanced: false };
  }

  const row = participants[0];
  const storedMessageId = row.last_read_message_id ? String(row.last_read_message_id) : '';
  const storedReadAt = Number(row.last_read_at);
  const storedTimestamp = isPersistableTimestamp(storedReadAt) ? storedReadAt : 0;

  // The stored cursor may point at a message that no longer exists (retention or
  // deletion). In that case its persisted timestamp is the only trustworthy
  // position, and it is used without ever moving the cursor backwards.
  let currentPosition = { timestamp: storedTimestamp, id: storedMessageId };
  if (storedMessageId) {
    const storedMessage = await readMessagePosition(connection, conversationId, storedMessageId);
    if (storedMessage) {
      const storedMessageTimestamp = Number(storedMessage.timestamp);
      currentPosition = {
        timestamp: isPersistableTimestamp(storedMessageTimestamp) ? storedMessageTimestamp : storedTimestamp,
        id: String(storedMessage.id),
      };
    }
  }

  const currentCursor = {
    lastReadMessageId: storedMessageId || null,
    lastReadAt: storedTimestamp > 0 ? storedTimestamp : null,
  };

  // No message supplied: preserve the existing cursor exactly. A client can never
  // advance read state by inventing a timestamp.
  if (!requested.supplied) {
    return { outcome: OUTCOME.OK, cursor: currentCursor, advanced: false };
  }

  // C. Message integrity: it must exist, belong to THIS conversation, and carry a
  //    usable persisted timestamp.
  const message = await readMessagePosition(connection, conversationId, requested.value);
  if (!message) {
    return { outcome: OUTCOME.MESSAGE_NOT_IN_CONVERSATION, cursor: currentCursor, advanced: false };
  }
  const messageTimestamp = Number(message.timestamp);
  if (!isPersistableTimestamp(messageTimestamp)) {
    return { outcome: OUTCOME.MESSAGE_TIMESTAMP_INVALID, cursor: currentCursor, advanced: false };
  }

  const candidatePosition = { timestamp: messageTimestamp, id: String(message.id) };
  // D/E. Monotonic: a stale or replayed advance is a no-op, never a rewind.
  if (!isNewerThan(candidatePosition, currentPosition)) {
    return { outcome: OUTCOME.OK, cursor: currentCursor, advanced: false };
  }

  await connection.query(
    `UPDATE conversation_participants
        SET last_read_message_id = ?,
            last_read_at = GREATEST(COALESCE(last_read_at, 0), ?)
      WHERE conversation_id = ? AND user_id = ?`,
    [candidatePosition.id, messageTimestamp, conversationId, uid]
  );

  return {
    outcome: OUTCOME.OK,
    cursor: { lastReadMessageId: candidatePosition.id, lastReadAt: messageTimestamp },
    advanced: true,
  };
}

function emptyCursor() {
  return { lastReadMessageId: null, lastReadAt: null };
}

/** Map an outcome to the HTTP contract the route must honour. */
function httpStatusFor(outcome) {
  switch (outcome) {
    case OUTCOME.OK: return 200;
    case OUTCOME.CONVERSATION_NOT_FOUND: return 404;
    case OUTCOME.FORBIDDEN_CONVERSATION_PARTICIPANT: return 403;
    case OUTCOME.MESSAGE_NOT_IN_CONVERSATION:
    case OUTCOME.MESSAGE_TIMESTAMP_INVALID:
    case OUTCOME.INVALID_CONVERSATION_ID:
    case OUTCOME.INVALID_MESSAGE_ID:
      return 400;
    default: return 400;
  }
}

const MESSAGES = Object.freeze({
  [OUTCOME.INVALID_CONVERSATION_ID]: 'A valid conversation identifier is required.',
  [OUTCOME.INVALID_MESSAGE_ID]: 'A valid message identifier is required.',
  [OUTCOME.CONVERSATION_NOT_FOUND]: 'Conversation not found.',
  [OUTCOME.FORBIDDEN_CONVERSATION_PARTICIPANT]: 'You are not a participant in this conversation.',
  [OUTCOME.MESSAGE_NOT_IN_CONVERSATION]: 'That message does not belong to this conversation.',
  [OUTCOME.MESSAGE_TIMESTAMP_INVALID]: 'That message has no valid recorded timestamp.',
});

module.exports = {
  CONVERSATION_ID_PATTERN,
  MESSAGE_ID_PATTERN,
  MESSAGES,
  OUTCOME,
  compareOrder,
  emptyCursor,
  httpStatusFor,
  isNewerThan,
  isPersistableTimestamp,
  isValidConversationId,
  isValidMessageId,
  markConversationRead,
  normalizeRequestedMessageId,
};
