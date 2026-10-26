'use strict';

/**
 * Durable account-deletion saga.
 *
 * Personal application data is removed/anonymized in one MariaDB transaction.
 * The retained Firebase Authentication identity is then deleted. A durable
 * IDENTITY_PENDING ledger state makes an interrupted identity step retryable;
 * no alternate application-data store exists.
 */

const crypto = require('crypto');
const { createMutationId } = require('../database/canonical');
const { getPool } = require('../database/mysql');
const { emitAlert, ALERT_TYPES } = require('../database/alerts');

const STATES = Object.freeze({
  REQUESTED: 'REQUESTED',
  IN_PROGRESS: 'IN_PROGRESS',
  IDENTITY_PENDING: 'IDENTITY_PENDING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
});

function fail(code, status, message) {
  return Object.assign(new Error(message || code), { code, status });
}
function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

async function loadRequest(_repository, uid) {
  const [rows] = await getPool().query(
    "SELECT payload FROM canonical_documents WHERE entity_type = 'deletion_requests' AND entity_id = ? AND deleted_at IS NULL LIMIT 1",
    [uid]
  );
  return rows.length ? parseJson(rows[0].payload, null) : null;
}

async function saveRequest(_repository, uid, data) {
  await getPool().query(
    `INSERT INTO canonical_documents (entity_type, entity_id, payload, revision, deleted_at, created_at, updated_at)
     VALUES ('deletion_requests', ?, ?, ?, NULL, NOW(), NOW())
     ON DUPLICATE KEY UPDATE payload = VALUES(payload), revision = VALUES(revision), deleted_at = NULL, updated_at = NOW()`,
    [uid, JSON.stringify(data), Number(data.revision || 1)]
  );
  return data;
}

async function persistLedger(connection, uid, data) {
  await connection.query(
    `INSERT INTO canonical_documents (entity_type, entity_id, payload, revision, deleted_at, created_at, updated_at)
     VALUES ('deletion_requests', ?, ?, ?, NULL, NOW(), NOW())
     ON DUPLICATE KEY UPDATE payload = VALUES(payload), revision = VALUES(revision), deleted_at = NULL, updated_at = NOW()`,
    [uid, JSON.stringify(data), Number(data.revision || 1)]
  );
}

async function applicationDataCleanup({ uid, actorUid, requestId, mutationId, existing }) {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [users] = await connection.query('SELECT id, revision, deleted_at FROM users WHERE id = ? FOR UPDATE', [uid]);
    if (!users.length && existing?.status !== STATES.IDENTITY_PENDING) {
      throw fail('USER_NOT_FOUND', 404, 'User application profile was not found.');
    }
    const revision = Number(existing?.revision || 0) + 1;
    const inProgress = {
      id: uid, uid, status: STATES.IN_PROGRESS, mutationId, revision,
      actorUid: actorUid || uid, requestId: requestId || null, failures: [],
      createdAt: existing?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    await persistLedger(connection, uid, inProgress);

    if (users.length && !users[0].deleted_at) {
      // Remove user-owned content and credentials. Financial and security
      // records remain under statutory/security retention but the profile is
      // pseudonymized and no longer authenticatable after the identity step.
      await connection.query('DELETE FROM notification_outbox WHERE metadata IS NOT NULL AND JSON_UNQUOTE(JSON_EXTRACT(metadata, \'$.uid\')) = ?', [uid]);
      await connection.query('DELETE FROM notifications WHERE user_id = ?', [uid]);
      await connection.query(
        'DELETE m FROM support_ticket_messages m INNER JOIN support_tickets t ON t.id = m.ticket_id WHERE t.user_id = ?',
        [uid]
      );
      await connection.query('DELETE FROM support_tickets WHERE user_id = ?', [uid]);
      await connection.query('DELETE FROM favourites WHERE user_id = ?', [uid]);
      await connection.query('DELETE FROM job_tracker WHERE user_id = ?', [uid]);
      await connection.query('DELETE FROM public_resumes WHERE owner_uid = ?', [uid]);
      await connection.query('DELETE FROM covers WHERE user_id = ?', [uid]);
      await connection.query('DELETE FROM portfolios WHERE user_id = ?', [uid]);
      await connection.query('DELETE FROM resumes WHERE user_id = ?', [uid]);
      // The deleting applicant's own submissions contain their personal data and
      // are removed. Applications submitted by other people remain their records:
      // when an employer account is deleted, preserve those rows and their job
      // reference while tombstoning the employer-owned listing.
      await connection.query('DELETE FROM applications WHERE applicant_id = ?', [uid]);
      await connection.query(
        `UPDATE applications SET notes = '', rating = 0, revision = revision + 1, updated_at = NOW()
         WHERE employer_id = ? AND applicant_id <> ?`,
        [uid, uid]
      );
      await connection.query(
        `UPDATE jobs SET status = 'DELETED', featured = 0, description = '', requirements = JSON_ARRAY(),
         company_logo = NULL, skills = JSON_ARRAY(), extra_json = NULL, revision = revision + 1, updated_at = NOW()
         WHERE employer_id = ?`,
        [uid]
      );
      await connection.query('DELETE FROM companies WHERE owner_id = ?', [uid]);
      await connection.query("UPDATE blog SET author_id = NULL, author = 'Deleted user' WHERE author_id = ?", [uid]);
      await connection.query('DELETE FROM conversation_messages WHERE sender_id = ?', [uid]);
      await connection.query('DELETE FROM conversation_participants WHERE user_id = ?', [uid]);
      await connection.query('DELETE c FROM conversations c LEFT JOIN conversation_participants p ON p.conversation_id = c.id WHERE p.conversation_id IS NULL');
      await connection.query('DELETE FROM oauth_exchange_codes WHERE uid = ?', [uid]);
      await connection.query('DELETE FROM password_reset_tokens WHERE uid = ?', [uid]);
      await connection.query('DELETE FROM password_reset_state WHERE uid = ?', [uid]);
      await connection.query('DELETE FROM email_verification_tokens WHERE uid = ?', [uid]);
      await connection.query('DELETE FROM email_verification_state WHERE uid = ?', [uid]);
      await connection.query('DELETE FROM ai_usage WHERE uid = ?', [uid]);
      await connection.query('DELETE FROM subscriptions WHERE user_id = ?', [uid]);
      await connection.query('DELETE FROM enterprise_team_members WHERE principalId = ?', [uid]);
      await connection.query('DELETE FROM enterprise_workspace_memberships WHERE principalId = ?', [uid]);
      await connection.query('DELETE FROM enterprise_memberships WHERE principalId = ?', [uid]);
      await connection.query('DELETE FROM enterprise_principal_tenants WHERE principalId = ?', [uid]);

      const pseudonym = crypto.createHash('sha256').update(`deleted-account:${uid}`).digest('hex').slice(0, 24);
      await connection.query(
        `UPDATE users SET email = ?, firstname = NULL, lastname = NULL, displayName = 'Deleted user',
         photoUrl = NULL, avatarUrl = NULL, phone = NULL, jobTitle = NULL, bio = NULL, city = NULL,
         country = NULL, website = NULL, membership = 'Basic', membershipEnds = NULL,
         paymentStatus = 'INACTIVE', cancellationRequested = 1, suspended = 1, role = 'USER',
         extra_data = ?, deleted_at = NOW(), revision = revision + 1, updated_at = NOW() WHERE id = ?`,
        [`deleted+${pseudonym}@invalid.local`, JSON.stringify({ deletionMutationId: mutationId }), uid]
      );
    }

    const pending = { ...inProgress, status: STATES.IDENTITY_PENDING, revision: revision + 1, applicationDataDeletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    await persistLedger(connection, uid, pending);
    await connection.query(
      `INSERT INTO security_audit_logs
       (id, action, actor_uid, target_uid, category, severity, target_type, target_id, metadata, request_id, created_at)
       VALUES (?, 'ACCOUNT_APPLICATION_DATA_DELETED', ?, ?, 'privacy.account_deletion', 'HIGH', 'USER', ?, ?, ?, NOW())`,
      [crypto.randomUUID(), actorUid || uid, uid, uid, JSON.stringify({ mutationId, retainedRecordTypes: ['payment_orders', 'transactions', 'invoices', 'security_audit_logs', 'deletion_requests'] }), requestId || null]
    );
    await connection.commit();
    return pending;
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}

async function updateFinalState({ uid, record, status, identityError = null, actorUid, requestId }) {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [ledgerRows] = await connection.query(
      "SELECT payload FROM canonical_documents WHERE entity_type = 'deletion_requests' AND entity_id = ? FOR UPDATE", [uid]
    );
    const current = ledgerRows.length ? parseJson(ledgerRows[0].payload, record) : record;
    const next = {
      ...current, status, identityError,
      identityDeleted: status === STATES.COMPLETED,
      completedAt: status === STATES.COMPLETED ? new Date().toISOString() : null,
      updatedAt: new Date().toISOString(), revision: Number(current.revision || 0) + 1,
    };
    await persistLedger(connection, uid, next);
    await connection.query(
      `INSERT INTO security_audit_logs
       (id, action, actor_uid, target_uid, category, severity, target_type, target_id, metadata, request_id, created_at)
       VALUES (?, ?, ?, ?, 'privacy.account_deletion', 'HIGH', 'USER', ?, ?, ?, NOW())`,
      [crypto.randomUUID(), status === STATES.COMPLETED ? 'ACCOUNT_SELF_DELETED' : 'ACCOUNT_IDENTITY_DELETION_PENDING',
        actorUid || uid, uid, uid, JSON.stringify({ mutationId: current.mutationId, identityErrorCategory: identityError ? 'IDENTITY_PROVIDER_ERROR' : null }), requestId || null]
    );
    await connection.commit();
    return next;
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}

async function requestDeletion({ uid, actorUid, requestId, identityAdmin }) {
  if (!uid) throw fail('USER_ID_REQUIRED', 400, 'User id is required.');
  const existing = await loadRequest(null, uid);
  if (existing?.status === STATES.COMPLETED) return { success: true, duplicate: true, status: STATES.COMPLETED };
  const mutationId = existing?.mutationId || createMutationId('del');
  const pending = existing?.status === STATES.IDENTITY_PENDING
    ? existing
    : await applicationDataCleanup({ uid, actorUid, requestId, mutationId, existing });

  if (!identityAdmin?.auth) {
    await updateFinalState({ uid, record: pending, status: STATES.IDENTITY_PENDING, identityError: 'IDENTITY_ADMIN_UNAVAILABLE', actorUid, requestId });
    throw fail('ACCOUNT_IDENTITY_DELETE_FAILED', 503, 'Application data was removed, but identity deletion is pending because the identity service is unavailable.');
  }
  try {
    await identityAdmin.auth().deleteUser(uid);
  } catch (error) {
    if (error.code !== 'auth/user-not-found') {
      await updateFinalState({ uid, record: pending, status: STATES.IDENTITY_PENDING, identityError: String(error.code || error.message || 'IDENTITY_PROVIDER_ERROR').slice(0, 120), actorUid, requestId });
      emitAlert(ALERT_TYPES.ACCOUNT_IDENTITY_PENDING, { severity: 'HIGH', message: 'Account application data deleted while identity deletion remains pending', uid });
      const failure = fail('ACCOUNT_IDENTITY_DELETE_FAILED', 503, 'Application data was removed, but the Firebase Authentication identity deletion is pending. Retry immediately.');
      failure.identityPending = true;
      throw failure;
    }
  }
  const completed = await updateFinalState({ uid, record: pending, status: STATES.COMPLETED, actorUid, requestId });
  return {
    success: true, status: STATES.COMPLETED, identityDeleted: true, mutationId: completed.mutationId,
    retainedRecordTypes: ['payment_orders', 'transactions', 'invoices', 'security_audit_logs', 'deletion_requests'],
  };
}

module.exports = { STATES, requestDeletion, loadRequest, saveRequest };
