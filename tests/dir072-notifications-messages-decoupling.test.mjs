import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

/**
 * DIR-072 — Notification vs Message pipeline decoupling.
 *
 * Pins the decoupled contract (chat never touches the bell), the distinct
 * routing, the dedicated workspace, the deep-link plumbing, and the
 * non-destructive data-remediation migration. Mirrors the read-the-source
 * convention of tests/dir055-notifications.test.mjs.
 */

const BACKEND = 'backend/index.js';
const DASHBOARD = 'src/components/Dashboard/DashboardMain/DashboardMain.jsx';
const WORKSPACE = 'src/components/Dashboard/DashboardNotifications/DashboardNotifications.jsx';
const CENTER = 'src/components/cuba/M3NotificationCenter.jsx';
const MESSAGES = 'src/components/Dashboard/DashboardMessages/DashboardMessages.jsx';
const NAV = 'src/components/cuba/candidateNavigation.js';
const MIGRATION = 'backend/database/migrations/025_notification_message_decoupling.sql';
const MIGRATION_DOWN = 'backend/database/migrations/025_notification_message_decoupling.down.sql';

const read = (p) => fs.readFile(p, 'utf8');

/**
 * Strip block + line comments so source assertions test CODE, not prose. Without
 * this, a docblock that EXPLAINS the removed footer (by naming it) would make its
 * own regression test fail — a false positive. Mirrors tests/dir055-notifications.
 */
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

test('S1: the message route no longer mints a system notification', async () => {
  const backend = await read(BACKEND);
  // No producer anywhere in the backend may key a notification off a message id.
  assert.doesNotMatch(backend, /notificationEventId\('message'/);
  const sendRoute = backend.slice(
    backend.indexOf("app.post('/api/messages/send'"),
    backend.indexOf("app.post('/api/contact'"),
  );
  assert.ok(sendRoute.length > 0, 'the message send route must exist');
  assert.match(sendRoute, /INSERT INTO conversation_messages/);
  assert.doesNotMatch(sendRoute, /saveNotification/);
});

test('S1: chat unread stays owned by the conversation pipeline, not the bell', async () => {
  const [badge, hook] = await Promise.all([
    read('src/components/cuba/MessagesNavBadge.jsx'),
    read('src/hooks/useUnreadMessages.js'),
  ]);
  assert.match(badge, /useUnreadMessages/);
  assert.match(hook, /conversation/);
});

test('S2: conversation rows deep-link to the SPECIFIC thread', async () => {
  const mod = await import('../src/components/cuba/resolveNotificationHref.js');
  assert.equal(
    mod.resolveNotificationHref({ type: 'message', data: { conversationId: 'conv_123' } }),
    '/dashboard/messages?conversationId=conv_123',
  );
  // No id => generic inbox, never a broken deep link.
  assert.equal(mod.resolveNotificationHref({ type: 'message' }), '/dashboard/messages');
  // A malformed id is rejected, never interpolated into the URL.
  assert.equal(
    mod.resolveNotificationHref({ type: 'message', data: { conversationId: '../etc' } }),
    '/dashboard/messages',
  );
});

test('S2: system notifications keep distinct functional destinations', async () => {
  const mod = await import('../src/components/cuba/resolveNotificationHref.js');
  assert.equal(mod.resolveNotificationHref({ type: 'application_interview' }), '/dashboard/interview');
  assert.equal(mod.resolveNotificationHref({ type: 'job_application_status' }), '/dashboard/applied-jobs');
  assert.equal(mod.resolveNotificationHref({ type: 'job_match' }), '/dashboard/job-tracker');
  assert.equal(mod.resolveNotificationHref({ type: 'payment_active' }), '/dashboard/plans');
  assert.equal(mod.resolveNotificationHref({ type: 'security_alert' }), '/dashboard/settings');
  assert.equal(mod.resolveNotificationHref({ type: 'portfolio_published' }), '/dashboard/portfolios');
  assert.equal(mod.resolveNotificationHref({ type: 'totally_unknown' }), null);
});

test('S2: the static route map stays query-free', async () => {
  const mod = await import('../src/components/cuba/resolveNotificationHref.js');
  for (const [type, href] of Object.entries(mod.NOTIFICATION_ROUTE_BY_TYPE)) {
    assert.ok(!href.includes('?'), `${type} -> ${href} must not carry a query payload`);
  }
});

test('S3: the dedicated notifications workspace is mounted and wired', async () => {
  const [dashboard, workspace, nav] = await Promise.all([read(DASHBOARD), read(WORKSPACE), read(NAV)]);
  assert.match(
    dashboard,
    /const DashboardNotifications = lazy\(\(\) => import\('\.\.\/DashboardNotifications\/DashboardNotifications'\)\)/,
  );
  assert.match(dashboard, /path="notifications"/);
  assert.match(workspace, /apiJson\('\/api\/notifications-data'\)/);
  assert.match(workspace, /\/api\/notifications-data\/mark-all-read/);
  assert.match(nav, /to: '\/dashboard\/notifications'/);
});

test('S3: the header bell exposes a working View all notifications CTA', async () => {
  const center = await read(CENTER);
  assert.match(center, /View all notifications/);
  assert.match(center, /onNavigate\?\.\('\/dashboard\/notifications'\)/);
  // The DIR-055 dead-footer regression guard must still hold (assert on CODE, not
  // on the docblock that names the removed footer).
  const code = stripComments(center);
  assert.doesNotMatch(code, /onOpenAll/);
  assert.doesNotMatch(code, /View all activity/);
});

test('S2b: the messages surface supports ?conversationId= deep links', async () => {
  const messages = await read(MESSAGES);
  assert.match(messages, /import \{ useSearchParams \} from 'react-router-dom'/);
  assert.match(messages, /searchParams\.get\('conversationId'\)/);
  assert.match(messages, /conversation\.id === deepLinkConversationId/);
});

test('S4: the remediation migration is present and NON-destructive', async () => {
  const [up, down] = await Promise.all([read(MIGRATION), read(MIGRATION_DOWN)]);
  assert.match(up, /UPDATE notifications/);
  assert.match(up, /SET is_read = 1/);
  assert.match(up, /type = 'message'/);
  assert.match(up, /is_read = 0/);
  // Non-destructive: no row may be deleted or dropped.
  assert.doesNotMatch(up, /\bDELETE\b/i);
  assert.doesNotMatch(up, /\bDROP\b/i);
  assert.doesNotMatch(up, /\bTRUNCATE\b/i);
  assert.ok(down.length > 0, 'a down migration must exist');
});
