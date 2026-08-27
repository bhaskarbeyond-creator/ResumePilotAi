import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('notification producers are backend-owned, deterministic, and state-labelled', async () => {
  const [backend, operations, rules, notifier] = await Promise.all([
    fs.readFile('backend/index.js', 'utf8'),
    fs.readFile('src/firestore/dbOperations.js', 'utf8'),
    fs.readFile('SecurityRules.txt', 'utf8'),
    fs.readFile('backend/services/emailNotifier.js', 'utf8'),
  ]);
  assert.match(backend, /notificationEventId/);
  assert.match(backend, /state: 'NOTIFICATION_CREATED'/);
  assert.match(backend, /deliveryState: 'NOT_REQUESTED'/);
  assert.match(backend, /notificationEventId\('job_application_submitted', applicationId\)/);
  assert.match(backend, /notificationEventId\('job_application_status', applicationId, String\(nextRevision\)\)/);
  // Messaging is MySQL-backed: the deterministic event id is derived from the
  // conversation plus the generated message id (not an RTDB push key).
  assert.match(backend, /notificationEventId\('message', conversationId, messageId\)/);
  assert.match(backend, /notificationEventId\('payment_active', orderRef\.id\)/);
  assert.match(backend, /notificationEventId\('payment_refunded', paymentOrderId\)/);
  assert.doesNotMatch(operations, /export async function createNotification/);
  assert.match(rules, /match \/notifications[\s\S]*?allow create: if false/);
  assert.match(notifier, /deliveryState: 'DELIVERY_ATTEMPTED'/);
  assert.match(notifier, /deliveryState: 'DELIVERY_FAILED'/);
  assert.match(backend, /NOTIFICATION_OUTBOX_WORKER_ENABLED/);
  assert.match(backend, /repo\.saveNotification\(recipientUid/);
  assert.match(rules, /match \/notification_outbox\/\{id\} \{ allow read, write: if false; \}/);
  assert.doesNotMatch(backend, /notification queued|notifications queued|email delivered/i);
});

test('unread listeners and panel reject stale accounts and confirm read persistence', async () => {
  const [hook, operations, panel] = await Promise.all([
    fs.readFile('src/hooks/useUnreadNotifications.js', 'utf8'),
    fs.readFile('src/firestore/dbOperations.js', 'utf8'),
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
