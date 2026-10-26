'use strict';

const { queueEmail } = require('./notificationOutbox');

const EMAIL_RE = /^[^\s@,;<>]{1,64}@[^\s@,;<>]{1,190}$/;
const FAILURE_THRESHOLD = 2;

let consecutiveFailures = 0;

function resetReadyzAlertStateForTests() {
  consecutiveFailures = 0;
}

function maybeQueueReadyzAlert({
  healthy,
  pool,
  now = Date.now(),
  env = process.env,
  queue = queueEmail,
} = {}) {
  if (healthy) {
    consecutiveFailures = 0;
    return { queued: false, consecutiveFailures };
  }
  consecutiveFailures += 1;
  if (consecutiveFailures < FAILURE_THRESHOLD) {
    return { queued: false, consecutiveFailures };
  }
  const recipient = String(env.ADMIN_EMAIL || '').trim().toLowerCase();
  if (!recipient || recipient.length > 254 || !EMAIL_RE.test(recipient)) {
    return { queued: false, consecutiveFailures, skipped: 'ADMIN_EMAIL' };
  }
  const hourBucket = Math.floor(Number(now) / 3_600_000);
  Promise.resolve(queue(pool, {
    eventId: `admin_system_alert:readyz:${hourBucket}`,
    recipient,
    templateType: 'admin_system_alert',
    vars: {
      alert_title: 'Readiness probe consecutive failures',
      alert_message: `MariaDB readiness failed ${consecutiveFailures} consecutive times. /readyz is returning 503 until the database recovers.`,
    },
    metadata: { source: 'readyz', consecutiveFailures },
  })).catch(error => {
    console.error('[readyz] admin alert enqueue failed:', error.code || error.message);
  });
  return { queued: true, consecutiveFailures };
}

module.exports = {
  maybeQueueReadyzAlert,
  resetReadyzAlertStateForTests,
  FAILURE_THRESHOLD,
};
