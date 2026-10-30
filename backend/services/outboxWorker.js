'use strict';

/**
 * Bounded outbox batch processor (DISC-022 / FS-M8A-05).
 *
 * This is a THIN ORCHESTRATOR over the existing, already-certified claim and
 * outcome machinery in `services/notificationOutbox.js`:
 *
 *   processPendingOutboxMessages()
 *     └── processOutboxOnce()  -> claimDueEvent()  (lease-based atomic claim)
 *                              -> dispatch()       (this module's mailer adapter)
 *                              -> finishAttempt()  (DELIVERED / RETRYING / DEAD_LETTER)
 *
 * It deliberately does NOT re-implement claiming, leasing, retry backoff or
 * dead-lettering — those semantics are shared with the scheduled worker started
 * in `index.js`, so a message processed by an administrator-triggered batch and
 * a message processed by the interval timer follow exactly the same rules.
 *
 * Schema-faithful naming: the durable column that counts delivery attempts is
 * `attempt_count` with a per-row `max_attempts` ceiling (default 5). That IS the
 * "retry_count < 5" rule the contract describes; the two are not separate
 * counters. A row leaves the claimable set when `state` is DEAD_LETTER, so a
 * dead-lettered message is never retried automatically.
 *
 * AT-LEAST-ONCE, BY DESIGN: SMTP has no idempotency key. A crash between the
 * provider's acceptance and `finishAttempt()` can redeliver one message. The
 * lease (`lease_owner` + `lease_expires_at`) bounds that window and prevents two
 * live workers from processing the same row at the same time.
 */

const crypto = require('crypto');
const { getPool } = require('../database/mysql');
const { sendMail } = require('./mailer');
const { processOutboxOnce, MAX_ATTEMPTS } = require('./notificationOutbox');

const DEFAULT_BATCH_SIZE = 25;
const MAX_BATCH_SIZE = 100;
const MAX_ERROR_BYTES = 500;
const MAX_TEXT_BYTES = 5_000;

/**
 * Template types the delivery adapter can render. Mirrors
 * `defaultEmailConfig().enabledTemplates` in `routes/email.js` plus the
 * enterprise tenant templates. An unknown type is treated as a FAILED delivery
 * (never a silent success), so an unsupported message can never be recorded as
 * delivered.
 */
const DELIVERABLE_TEMPLATE_TYPES = Object.freeze([
  'default', 'tax_invoice', 'welcome', 'password_reset', 'email_verification',
  'payment_failed', 'subscription_renewal', 'subscription_cancelled', 'refund_processed',
  'ai_resume_ready', 'ai_cover_letter_ready', 'portfolio_published',
  'job_application_received', 'job_status_update', 'job_posted_employer',
  'security_alert', 'account_created_admin', 'password_changed_confirm',
  'admin_system_alert', 'broadcast_announcement', 'tenant_notification',
  'enterprise-invitation', 'enterprise_invitation', 'invitation',
  'interview-invitation', 'interview_scorecard_submitted', 'interview-scorecard-submitted',
  'role_change', 'role_update', 'enterprise_role_update',
  'team_assignment', 'workspace_assignment', 'enterprise_security_alert',
  'quota_warning', 'quota_alert', 'enterprise_quota_alert',
]);

const DELIVERABLE_TEMPLATE_SET = new Set(DELIVERABLE_TEMPLATE_TYPES);

function outboxError(code, message, status = 400) {
  return Object.assign(new Error(message), { code, status });
}

/** Validate and bound a requested batch size (never trust an operator payload). */
function normalizeBatchSize(value, { fallback = DEFAULT_BATCH_SIZE, maximum = MAX_BATCH_SIZE } = {}) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw outboxError('INVALID_BATCH_SIZE', `batchSize must be an integer between 1 and ${maximum}.`);
  }
  return parsed;
}

/**
 * Bounded, single-line, secret-free representation of a delivery failure.
 * Stacks, connection strings and credentials never reach `notification_outbox`.
 */
function sanitizeError(error) {
  const raw = String(error?.message || error || 'Delivery attempt failed');
  const flattened = raw
    .replace(/\r?\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/(password|passwd|secret|token|api[_-]?key)\s*[=:]\s*\S+/gi, '$1=[redacted]')
    .replace(/\/\/[^\s/@]+:[^\s/@]+@/g, '//[redacted]@')
    .trim();
  const sliced = flattened.slice(0, MAX_ERROR_BYTES);
  return sliced || 'Delivery attempt failed';
}

function sanitizeSubject(value, fallback) {
  const text = String(value == null ? '' : value).replace(/[\p{Cc}\r\n]+/gu, ' ').trim();
  return (text || fallback).slice(0, 255);
}

function htmlToText(html) {
  const text = String(html || '')
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h1|h2|h3|li)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text.slice(0, MAX_TEXT_BYTES);
}

/**
 * Default delivery adapter: render through the repository's single email
 * template engine and deliver through `services/mailer.js`.
 */
async function defaultDispatch(event) {
  if (!event || event.channel !== 'email') {
    return { success: false, error: `Unsupported outbox channel: ${event?.channel || 'unknown'}` };
  }
  const templateType = String(event.templateType || '');
  if (!DELIVERABLE_TEMPLATE_SET.has(templateType)) {
    return { success: false, error: `Unsupported outbox template type: ${templateType || 'unknown'}` };
  }
  if (!event.recipient) {
    return { success: false, error: 'Outbox event has no recipient' };
  }
  try {
    // Late-bound to avoid a require cycle (routes/email -> database -> services).
    const { renderEmailTemplate } = require('../routes/email');
    const vars = event.vars && typeof event.vars === 'object' ? event.vars : {};
    const rendered = renderEmailTemplate(templateType, vars, {});
    const subject = sanitizeSubject(event.metadata?.customSubject || rendered?.subject, 'IME365 notification');
    const html = String(event.metadata?.customBody || rendered?.html || '');
    if (!html) return { success: false, error: 'Email template produced no content' };
    const message = {
      to: event.recipient,
      subject,
      html,
      text: htmlToText(html),
    };
    const calendar = event.metadata?.calendar;
    if (typeof calendar === 'string' && calendar.startsWith('BEGIN:VCALENDAR')) {
      const method = String(event.metadata?.calendarMethod || 'REQUEST').toUpperCase();
      message.alternatives = [{
        contentType: `text/calendar; method=${method}; charset=UTF-8`,
        content: calendar,
      }];
    }
    const result = await sendMail(message);
    return { success: true, result };
  } catch (error) {
    return { success: false, error: sanitizeError(error) };
  }
}

/**
 * Process at most `batchSize` due messages, oldest due first.
 *
 * @param {object} options
 * @param {object} [options.pool]        MariaDB pool (defaults to the app pool)
 * @param {number} [options.batchSize]   1..100
 * @param {Function} [options.dispatch]  delivery adapter (default: mailer)
 * @param {Function} [options.authorize] tenant reauthorization hook
 * @param {string} [options.workerId]
 * @param {number|Function} [options.now]
 * @returns {Promise<{processed:number, successes:number, failures:number, batchSize:number, outcomes:Array}>}
 */
async function processPendingOutboxMessages({
  pool = getPool(),
  batchSize,
  dispatch = defaultDispatch,
  authorize = null,
  workerId = `admin-batch-${crypto.randomUUID()}`,
  now = Date.now(),
} = {}) {
  if (!pool || typeof pool.query !== 'function') {
    throw outboxError('OUTBOX_POOL_REQUIRED', 'A MariaDB pool is required to process the outbox.', 503);
  }
  const boundedBatch = normalizeBatchSize(batchSize);
  const clock = typeof now === 'function' ? now : () => now;
  const outcomes = [];
  let successes = 0;
  let failures = 0;

  for (let index = 0; index < boundedBatch; index += 1) {
    const outcome = await processOutboxOnce({
      pool,
      workerId,
      now: clock(),
      dispatch,
      authorize,
    });
    if (!outcome?.processed) break;
    outcomes.push(outcome);
    if (outcome.providerAccepted === true) successes += 1;
    else failures += 1;
  }

  return {
    processed: outcomes.length,
    successes,
    failures,
    batchSize: boundedBatch,
    remainingBudget: boundedBatch - outcomes.length,
    outcomes,
  };
}

/**
 * Persisted outbox counts. Only aggregate state counts are returned: message
 * bodies, recipients and error text are never exposed to an operator endpoint.
 *
 * `pending` groups every claimable state (queued, retrying, in-flight) so the
 * number matches what the worker would still pick up.
 */
async function getOutboxStats({ pool = getPool(), maxAttempts = MAX_ATTEMPTS } = {}) {
  if (!pool || typeof pool.query !== 'function') {
    throw outboxError('OUTBOX_POOL_REQUIRED', 'A MariaDB pool is required to read outbox statistics.', 503);
  }
  const [rows] = await pool.query(
    `SELECT state, COUNT(*) AS row_count FROM notification_outbox GROUP BY state`
  );
  const states = Object.create(null);
  for (const row of rows || []) {
    const state = String(row.state || 'UNKNOWN');
    states[state] = Number(row.row_count || 0);
  }
  const pending = (states.NOTIFICATION_QUEUED || 0) + (states.RETRYING || 0) + (states.DELIVERY_ATTEMPTED || 0);
  const delivered = states.DELIVERED || 0;
  const deadLetter = states.DEAD_LETTER || 0;
  return {
    pending,
    delivered,
    deadLetter,
    total: Object.values(states).reduce((sum, value) => sum + value, 0),
    states,
    maxAttempts: Number(maxAttempts),
  };
}

module.exports = {
  DEFAULT_BATCH_SIZE,
  DELIVERABLE_TEMPLATE_TYPES,
  MAX_BATCH_SIZE,
  defaultDispatch,
  getOutboxStats,
  htmlToText,
  normalizeBatchSize,
  outboxError,
  processPendingOutboxMessages,
  sanitizeError,
};
