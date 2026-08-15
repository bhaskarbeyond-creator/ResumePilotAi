const crypto = require('crypto');

const MAX_ATTEMPTS = 5;
const BASE_RETRY_MS = 60_000;
const MAX_RETRY_MS = 60 * 60_000;
const LEASE_MS = 2 * 60_000;
const ACTIVE_STATES = new Set(['NOTIFICATION_QUEUED', 'RETRYING', 'DELIVERY_ATTEMPTED']);

function outboxId(eventId, channel = 'email') {
  return crypto.createHash('sha256').update(`${channel}\0${eventId}`).digest('hex');
}

function validEmail(value) {
  return /^[^\s@,;<>]{1,64}@[^\s@,;<>]{1,190}$/.test(String(value || '').trim());
}

function queueEmailInTransaction(transaction, db, admin, { eventId, recipient, templateType, vars = {}, metadata = {} }) {
  if (!eventId || !validEmail(recipient) || !/^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(String(templateType || ''))) throw new Error('Invalid notification outbox event');
  const id = outboxId(eventId);
  transaction.set(db.collection('notification_outbox').doc(id), {
    eventId: String(eventId).slice(0, 300), channel: 'email', recipient: String(recipient).trim().toLowerCase(),
    templateType, vars, metadata, state: 'NOTIFICATION_QUEUED', attemptCount: 0,
    nextAttemptAt: admin.firestore.Timestamp.fromMillis(Date.now()), createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: false });
  return id;
}

async function claimDueEvent(db, admin, workerId, now = Date.now()) {
  const due = await db.collection('notification_outbox').where('nextAttemptAt', '<=', admin.firestore.Timestamp.fromMillis(now)).orderBy('nextAttemptAt').limit(10).get();
  for (const candidate of due.docs) {
    let claimed = null;
    await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(candidate.ref);
      const value = snapshot.data() || {};
      const leaseUntil = value.leaseExpiresAt?.toMillis?.() || 0;
      if (!ACTIVE_STATES.has(value.state) || value.providerAccepted === true || leaseUntil > now || Number(value.attemptCount || 0) >= MAX_ATTEMPTS) return;
      transaction.update(candidate.ref, {
        leaseOwner: workerId, leaseExpiresAt: admin.firestore.Timestamp.fromMillis(now + LEASE_MS),
        state: 'DELIVERY_ATTEMPTED', lastAttemptAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      claimed = { id: candidate.id, ref: candidate.ref, ...value };
    });
    if (claimed) return claimed;
  }
  return null;
}

function retryDelay(attemptCount) {
  return Math.min(MAX_RETRY_MS, BASE_RETRY_MS * (2 ** Math.max(0, attemptCount - 1)));
}

async function finishAttempt(db, admin, event, workerId, result, now = Date.now()) {
  await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(event.ref);
    const value = snapshot.data() || {};
    if (value.leaseOwner !== workerId) return;
    const attemptCount = Number(value.attemptCount || 0) + 1;
    if (result?.success) {
      transaction.update(event.ref, {
        state: 'DELIVERY_ATTEMPTED', providerAccepted: true, attemptCount,
        providerAcceptedAt: admin.firestore.FieldValue.serverTimestamp(), leaseOwner: admin.firestore.FieldValue.delete(),
        leaseExpiresAt: admin.firestore.FieldValue.delete(), nextAttemptAt: admin.firestore.FieldValue.delete(), lastError: admin.firestore.FieldValue.delete(), updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return;
    }
    const terminal = attemptCount >= MAX_ATTEMPTS;
    transaction.update(event.ref, {
      state: terminal ? 'DEAD_LETTER' : 'RETRYING', attemptCount,
      nextAttemptAt: terminal ? admin.firestore.FieldValue.delete() : admin.firestore.Timestamp.fromMillis(now + retryDelay(attemptCount)),
      lastError: String(result?.error || 'Provider attempt failed').slice(0, 500),
      leaseOwner: admin.firestore.FieldValue.delete(), leaseExpiresAt: admin.firestore.FieldValue.delete(), updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
}

async function processOutboxOnce({ db, admin, dispatch, workerId = crypto.randomUUID(), now = Date.now() }) {
  const event = await claimDueEvent(db, admin, workerId, now);
  if (!event) return { processed: false };
  let result;
  try { result = await dispatch(event); }
  catch (error) { result = { success: false, error: error.message }; }
  await finishAttempt(db, admin, event, workerId, result, now);
  return { processed: true, eventId: event.eventId, providerAccepted: result?.success === true };
}

module.exports = { MAX_ATTEMPTS, outboxId, queueEmailInTransaction, claimDueEvent, finishAttempt, processOutboxOnce, retryDelay };
