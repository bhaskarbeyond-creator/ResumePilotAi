import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('notification producers are backend-owned, deterministic, and state-labelled', async () => {
  const [backend, operations, routes, migration, notifier, outbox, mutations] = await Promise.all([
    fs.readFile('backend/index.js', 'utf8'),
    fs.readFile('src/services/api/platform.js', 'utf8'),
    fs.readFile('backend/routes/notificationsData.js', 'utf8'),
    fs.readFile('backend/database/migrations/001_baseline.sql', 'utf8'),
    fs.readFile('backend/services/emailNotifier.js', 'utf8'),
    fs.readFile('backend/services/notificationOutbox.js', 'utf8'),
    fs.readFile('backend/services/resilientMutations.js', 'utf8'),
  ]);
  assert.match(backend, /notificationEventId/);
  // DIR-072: the message route no longer mints a notification, so the
  // state-labelled producer contract is pinned on the shared mutation notifier
  // (which the job-application and payment producers route through).
  assert.match(mutations, /state: 'NOTIFICATION_CREATED'/);
  assert.match(mutations, /deliveryState: 'NOT_REQUESTED'/);
  assert.doesNotMatch(operations, /export async function createNotification/);
  assert.doesNotMatch(routes, /router\.post\('\/:id'/);
  assert.match(routes, /Only the read state can be updated/);
  assert.match(routes, /WHERE id = \? AND user_id = \?/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS notifications/);
  assert.match(notifier, /deliveryState: 'NOTIFICATION_QUEUED'/);
  assert.match(outbox, /state = 'DELIVERY_ATTEMPTED'/);
  assert.match(outbox, /terminal \? 'DEAD_LETTER' : 'RETRYING'/);
  assert.match(backend, /NOTIFICATION_OUTBOX_WORKER_ENABLED/);
  // DIR-072: direct chat is DECOUPLED from the notification feed. The message
  // route must never mint a notification row; its unread state is tracked by the
  // per-participant conversation read cursor instead.
  assert.doesNotMatch(backend, /notificationEventId\('message'/);
  const sendRoute = backend.slice(
    backend.indexOf("app.post('/api/messages/send'"),
    backend.indexOf("app.post('/api/contact'"),
  );
  assert.ok(sendRoute.length > 0, 'the message send route must exist');
  assert.match(sendRoute, /INSERT INTO conversation_messages/);
  assert.doesNotMatch(sendRoute, /saveNotification/);
  assert.match(mutations, /repo\.saveNotification\(uid, eventId/);
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
