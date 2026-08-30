import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('notification producers are backend-owned, deterministic, and state-labelled', async () => {
  const [backend, operations, routes, migration, notifier, outbox, messaging, employer] = await Promise.all([
    fs.readFile('backend/index.js', 'utf8'),
    fs.readFile('src/services/api/platform.js', 'utf8'),
    fs.readFile('backend/routes/notificationsData.js', 'utf8'),
    fs.readFile('backend/database/migrations/001_baseline.sql', 'utf8'),
    fs.readFile('backend/services/emailNotifier.js', 'utf8'),
    fs.readFile('backend/services/notificationOutbox.js', 'utf8'),
    fs.readFile('backend/routes/messaging.js', 'utf8'),
    fs.readFile('backend/routes/employer.js', 'utf8'),
  ]);
  const allBackend = backend + '\n' + employer;
  assert.match(allBackend, /notificationEventId/);
  // Messaging notification creation is in the extracted messaging router
  assert.match(messaging, /state: 'NOTIFICATION_CREATED'/);
  assert.match(messaging, /deliveryState: 'NOT_REQUESTED'/);
  assert.match(employer, /notificationEventId\('job_application_submitted', applicationId\)/);
  assert.match(employer, /notificationEventId\('job_application_status', applicationId, String\(nextRevision\)\)/);
  // Messaging is MySQL-backed: the deterministic event id is derived from the
  // conversation plus the generated message id (not an RTDB push key).
  assert.match(messaging, /notificationEventId\('message', conversationId, messageId\)/);
  assert.match(allBackend, /notificationEventId\('payment_active', orderRef\.id\)/);
  assert.match(allBackend, /notificationEventId\('payment_refunded', paymentOrderId\)/);
  assert.doesNotMatch(operations, /export async function createNotification/);
  assert.doesNotMatch(routes, /router\.post\('\/:id'/);
  assert.match(routes, /Only the read state can be updated/);
  assert.match(routes, /WHERE id = \? AND user_id = \?/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS notifications/);
  assert.match(notifier, /deliveryState: 'NOTIFICATION_QUEUED'/);
  assert.match(outbox, /state = 'DELIVERY_ATTEMPTED'/);
  assert.match(outbox, /terminal \? 'DEAD_LETTER' : 'RETRYING'/);
  assert.match(backend, /NOTIFICATION_OUTBOX_WORKER_ENABLED/);
  assert.match(messaging, /repo\.saveNotification\(recipientUid/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS notification_outbox/);
  assert.match(migration, /UNIQUE KEY uq_notification_idempotency/);
  assert.doesNotMatch(backend, /notification queued|notifications queued|email delivered/i);
});

test('unread listeners and panel reject stale accounts and confirm read persistence', async () => {
  const [hook, operations, panel] = await Promise.all([
    fs.readFile('src/hooks/useUnreadNotifications.js', 'utf8'),
    fs.readFile('src/services/api/platform.js', 'utf8'),
    fs.readFile('src/components/Dashboard/ProfileDisplay/NotificationPanel.jsx', 'utf8'),
  ]);
  assert.match(hook, /subscribeUnreadNotifications/);
  assert.match(hook, /generation\.current === currentGeneration/);
  assert.doesNotMatch(hook, /setInterval/);
  assert.match(operations, /fire\.auth\(\)\.currentUser\?\.uid !== userId/);
  assert.match(panel, /subscribeUnreadNotifications/);
  assert.match(panel, /results\.some\(result => !result\.success\)/);
  assert.match(panel, /role="dialog"/);
  assert.doesNotMatch(panel, /View all notifications/);
});
