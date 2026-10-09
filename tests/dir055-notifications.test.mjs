import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

/**
 * DIR-055 S10 — Notifications pipeline unit suite.
 *
 * Pins the pure href resolver to the REAL mounted route tables, proves the
 * "zero dead hrefs" contract, and pins the owner-scoped mark-all-read route.
 * Mirrors the read-the-source convention of tests/cuba-candidate-portal.test.mjs.
 */

const RESOLVER = 'src/components/cuba/resolveNotificationHref.js';
const DASHBOARD = 'src/components/Dashboard/DashboardMain/DashboardMain.jsx';
const EMPLOYER = 'src/components/EmployerPortal/EmployerPortalCuba.jsx';
const ROUTE = 'backend/routes/notificationsData.js';

// The four `type` values actually present in MariaDB (verified by direct query),
// plus the deterministic producer event names pinned by notification-lifecycle.
const REAL_DB_TYPES = ['message', 'job_application_received', 'application_interview', 'application_rejected'];
const PRODUCER_TYPES = ['job_application_submitted', 'job_application_status', 'message', 'payment_active', 'payment_refunded'];

test('S1: the resolver is pure — no React, no I/O, no side effects', async () => {
  const src = await fs.readFile(RESOLVER, 'utf8');
  assert.doesNotMatch(src, /from 'react'/);
  assert.doesNotMatch(src, /require\(/);
  assert.doesNotMatch(src, /fetch\(/);
  assert.doesNotMatch(src, /localStorage|sessionStorage|document\./);
  assert.match(src, /export function resolveNotificationHref/);
  assert.match(src, /export function resolveNotificationKind/);
  assert.match(src, /export const NOTIFICATION_ROUTE_BY_TYPE/);
});

test('S1: every mapped route is a REAL mounted route (candidate + employer)', async () => {
  const [mod, dash, emp] = await Promise.all([
    import('../src/components/cuba/resolveNotificationHref.js'),
    fs.readFile(DASHBOARD, 'utf8'),
    fs.readFile(EMPLOYER, 'utf8'),
  ]);

  const entries = Object.entries(mod.NOTIFICATION_ROUTE_BY_TYPE);
  assert.ok(entries.length >= 20, 'route map must cover the known vocabulary');

  for (const [type, href] of entries) {
    assert.ok(href.startsWith('/'), `${type} -> ${href} must be absolute`);

    if (href === '/dashboard') continue;                       // index route
    if (href.startsWith('/dashboard/')) {
      const sub = href.slice('/dashboard/'.length);
      assert.ok(
        new RegExp(`path="${sub}"`).test(dash),
        `${type} -> ${href} must be mounted in DashboardMain.jsx`,
      );
      continue;
    }
    if (href === '/employer') continue;                        // index route
    if (href.startsWith('/employer/')) {
      const sub = href.slice('/employer/'.length);
      assert.ok(
        new RegExp(`path="${sub}"`).test(emp),
        `${type} -> ${href} must be mounted in EmployerPortalCuba.jsx`,
      );
      continue;
    }
    assert.fail(`${type} -> ${href} is not under a known portal prefix`);
  }
});

test('S1: the candidate interview route is SINGULAR (regression guard)', async () => {
  const mod = await import('../src/components/cuba/resolveNotificationHref.js');
  assert.equal(mod.NOTIFICATION_ROUTE_BY_TYPE.application_interview, '/dashboard/interview');
  assert.notEqual(mod.NOTIFICATION_ROUTE_BY_TYPE.application_interview, '/dashboard/interviews');
});

test('S1: no route carries a query-param payload', async () => {
  const mod = await import('../src/components/cuba/resolveNotificationHref.js');
  for (const [type, href] of Object.entries(mod.NOTIFICATION_ROUTE_BY_TYPE)) {
    assert.ok(!href.includes('?'), `${type} -> ${href} must not carry a query payload`);
  }
});

test('S1: every real DB type resolves to a mounted route (zero dead hrefs)', async () => {
  const mod = await import('../src/components/cuba/resolveNotificationHref.js');
  for (const type of REAL_DB_TYPES) {
    const href = mod.resolveNotificationHref({ type });
    assert.ok(typeof href === 'string' && href.startsWith('/'), `real DB type ${type} must resolve, got ${href}`);
    assert.equal(mod.isNavigableNotification({ type }), true);
  }
});

test('S1: every pinned producer event type resolves', async () => {
  const mod = await import('../src/components/cuba/resolveNotificationHref.js');
  for (const type of PRODUCER_TYPES) {
    assert.ok(mod.resolveNotificationHref({ type }), `producer type ${type} must resolve`);
  }
});

test('S1: unknown/system types return null so the row does NOT navigate', async () => {
  const mod = await import('../src/components/cuba/resolveNotificationHref.js');
  for (const row of [{ type: 'system' }, { type: 'totally_unknown' }, { type: '' }, {}, null, undefined]) {
    assert.equal(mod.resolveNotificationHref(row), null);
    assert.equal(mod.isNavigableNotification(row), false);
  }
  // ...but every row still gets an icon kind, so the UI is never blank.
  assert.equal(mod.resolveNotificationKind({ type: 'system' }), 'system');
  assert.equal(mod.resolveNotificationKind({ type: 'application_interview' }), 'interview');
  assert.equal(mod.resolveNotificationKind({ type: 'job_application_received' }), 'application');
  assert.equal(mod.resolveNotificationKind({ type: 'message' }), 'message');
});

test('S1: type resolution tolerates the JSON `data.type` fallback and casing', async () => {
  const mod = await import('../src/components/cuba/resolveNotificationHref.js');
  assert.equal(mod.notificationType({ type: '  MESSAGE ' }), 'message');
  assert.equal(mod.notificationType({ data: { type: 'application_interview' } }), 'application_interview');
  assert.equal(mod.notificationType({ type: '', data: { type: 'payment_active' } }), 'payment_active');
  assert.equal(mod.resolveNotificationHref({ data: { type: 'payment_refunded' } }), '/dashboard/plans');
});

test('S3: mark-all-read is owner-scoped, additive, and avoids the pinned forbidden pattern', async () => {
  const src = await fs.readFile(ROUTE, 'utf8');
  assert.match(src, /router\.post\('\/mark-all-read'/);
  assert.match(src, /WHERE user_id = \? AND is_read = 0/);
  assert.match(src, /\[req\.user\.uid\]/);
  // The pinned contract forbids this exact pattern; adding a bulk route must not trip it.
  assert.doesNotMatch(src, /router\.post\('\/:id'/);
  // The pre-existing read-state contract must be untouched.
  assert.match(src, /Only the read state can be updated/);
  assert.match(src, /WHERE id = \? AND user_id = \?/);
});

test('S3: mark-all-read never accepts a caller-supplied uid', async () => {
  const src = await fs.readFile(ROUTE, 'utf8');
  const block = src.slice(src.indexOf("router.post('/mark-all-read'"));
  const body = block.slice(0, block.indexOf('});') + 3);
  assert.doesNotMatch(body, /req\.body/, 'the uid must come from the session, never the request body');
  assert.doesNotMatch(body, /req\.query/, 'the uid must come from the session, never the query string');
});

/* ── S2 / S4 / S8: the notification center rebuild ───────────────────────── */

const CENTER = 'src/components/cuba/M3NotificationCenter.jsx';
const SHELL = 'src/components/cuba/CubaAppShell.jsx';
const REMEDIATION = 'scripts/dir055-remediate-notifications.mjs';

/**
 * Strip block + line comments so source assertions test CODE, not prose. Without
 * this, a docblock that *explains* the defect it fixed (by naming the removed
 * string) would make its own regression test fail — a false positive.
 */
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

test('S2: navigation is DERIVED, not read from the non-existent item.href', async () => {
  const src = await fs.readFile(CENTER, 'utf8');
  assert.match(src, /import \{ resolveNotificationHref, resolveNotificationKind \} from '\.\/resolveNotificationHref'/);
  assert.match(src, /resolveNotificationHref\(item\)/);
  // The original defect: the `notifications` table has no `href` column.
  const code = stripComments(src);
  assert.doesNotMatch(code, /onNavigate\?\.\(item\.href\)/, 'row clicks must not use item.href');
  assert.doesNotMatch(code, /item\.href/);
});

test('S2: a row with no honest target is NOT a dead button', async () => {
  const src = await fs.readFile(CENTER, 'utf8');
  assert.match(src, /const RowTag = href \? 'button' : 'div'/);
  assert.match(src, /data-navigable=\{href \? 'true' : 'false'\}/);
});

test('S2/S4: the dead "View all activity" footer and onOpenAll prop are gone', async () => {
  const [center, shell] = await Promise.all([fs.readFile(CENTER, 'utf8'), fs.readFile(SHELL, 'utf8')]);
  const code = stripComments(center);
  assert.doesNotMatch(code, /onOpenAll/);
  assert.doesNotMatch(code, /View all activity/);
  assert.doesNotMatch(stripComments(shell), /onOpenAll/);
});

test('S2/S3: the read toggle and mark-all-read hit the real owner-scoped routes', async () => {
  const src = await fs.readFile(CENTER, 'utf8');
  assert.match(src, /method: 'PATCH'/);
  assert.match(src, /`\/api\/notifications-data\/\$\{encodeURIComponent\(id\)\}`/);
  assert.match(src, /body: JSON\.stringify\(\{ read: nextRead \}\)/);
  assert.match(src, /apiJson\('\/api\/notifications-data\/mark-all-read', \{ method: 'POST' \}\)/);
});

test('S2: contextual kind icons and honest timestamps', async () => {
  const src = await fs.readFile(CENTER, 'utf8');
  assert.match(src, /const KIND_ICON = \{/);
  assert.match(src, /resolveNotificationKind\(item\)/);
  // An unparseable timestamp must render NOTHING rather than "Invalid Date".
  assert.match(src, /if \(Number\.isNaN\(when\.getTime\(\)\)\) return ''/);
  assert.match(src, /\{when && \(/);
});

test('S8: all three Cuba UX primitives are used', async () => {
  const src = await fs.readFile(CENTER, 'utf8');
  assert.match(src, /import CubaSkeleton from '\.\/CubaSkeleton'/);
  assert.match(src, /import CubaEmptyState from '\.\/CubaEmptyState'/);
  assert.match(src, /import CubaErrorState from '\.\/CubaErrorState'/);
  assert.match(src, /<CubaSkeleton /);
  assert.match(src, /<CubaEmptyState/);
  assert.match(src, /<CubaErrorState/);
  // The hard-failure state must offer a real retry.
  assert.match(src, /onRetry=\{load\}/);
});

test('S8: both mutations are optimistic WITH rollback', async () => {
  const src = await fs.readFile(CENTER, 'utf8');
  // Per-row toggle rolls back only the row it touched.
  assert.match(src, /read: !nextRead \} : r\)\)\)/);
  // Mark-all rolls back to the captured snapshot.
  assert.match(src, /const snapshot = rows;/);
  assert.match(src, /setRows\(snapshot\)/);
});

test('S8: a soft failure must not hide rows the user can still read', async () => {
  const src = await fs.readFile(CENTER, 'utf8');
  assert.match(src, /error && rows\.length > 0/);        // inline banner
  assert.match(src, /error && rows\.length === 0 \? \(/); // hard-failure state
});

/* ── S9: the guarded remediation script ─────────────────────────────────── */

test('S9: the remediation script refuses to run without an explicit --uid', async () => {
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(process.execPath, [REMEDIATION], { encoding: 'utf8' });
  assert.equal(r.status, 2, 'must exit 2 when --uid is absent');
  assert.match(String(r.stderr), /--uid <uid> is required/);
});

test('S9: dry-run by default — mutation is gated behind --apply', async () => {
  const src = await fs.readFile(REMEDIATION, 'utf8');
  assert.match(src, /const apply = flag\('--apply'\)/);
  assert.match(src, /if \(apply\) \{/);
  assert.match(src, /DRY-RUN \(nothing was written\)/);
  assert.match(src, /await conn\.beginTransaction\(\)/);
});

test('S9: the script never deletes, and every UPDATE is owner-scoped', async () => {
  const src = await fs.readFile(REMEDIATION, 'utf8');
  const code = stripComments(src);
  assert.doesNotMatch(code, /\bDELETE\b/i, 'no destructive delete anywhere');
  assert.doesNotMatch(code, /\bDROP\b/i);
  assert.doesNotMatch(code, /\bTRUNCATE\b/i);
  const updates = code.match(/UPDATE notifications[^'`]*/g) || [];
  assert.ok(updates.length >= 2, `expected both UPDATE statements, found ${updates.length}`);
  for (const u of updates) assert.match(u, /user_id = \?/, `every UPDATE must be owner-scoped: ${u}`);
});

test('S9: the placeholder predicate is narrow (all three fields must match)', async () => {
  const src = await fs.readFile(REMEDIATION, 'utf8');
  assert.match(src, /type: 'message', title: 'New message', message: 'You have a new message\.'/);
  assert.match(src, /WHERE user_id = \? AND type = \? AND title = \? AND message = \?/);
});

test('S9: unresolvable rows are REPORTED, never fabricated', async () => {
  const src = await fs.readFile(REMEDIATION, 'utf8');
  assert.match(src, /resolvable: false, reason:/);
  assert.match(src, /no fabrication/);
  assert.match(src, /if \(!entry\.next\) continue;/);
  // The sender must come from the conversation participants, not a guess.
  assert.match(src, /FROM conversation_participants WHERE conversation_id = \?/);
  assert.match(src, /FROM users WHERE id = \? LIMIT 1/);
});

