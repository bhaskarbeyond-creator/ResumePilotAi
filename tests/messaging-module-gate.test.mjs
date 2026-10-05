/**
 * DIR-026 regression guards: module-gate polarity, read-state isolation,
 * unread-badging wiring, and the admin toggle contract.
 *
 * These are SOURCE assertions plus pure-function executions. They are the
 * cheapest place to catch the specific defects this directive closed, and they
 * run in `npm test` without needing a live database.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const routeBlock = (source, signature) => {
    const start = source.indexOf(signature);
    assert.notEqual(start, -1, `${signature} must exist`);
    const next = source.indexOf('\n});', start);
    return source.slice(start, next + 4);
};

/**
 * Strip SQL line comments before asserting on migration content. The migration
 * files deliberately NAME the tables they must not touch (`conversation_messages`
 * is referenced in prose to explain why it is untouched), so a naive substring
 * check would flag the documentation as if it were destructive DDL.
 */
const stripSqlComments = (sql) => sql.replace(/^\s*--.*$/gm, '');

test('AC-4: the /api/messages module gate fails closed on anything but an explicit true', async () => {
    const source = await fs.readFile('backend/index.js', 'utf8');
    const gate = routeBlock(source, "app.use('/api/messages', async (req, res, next)");

    // Strict `=== true` polarity. The admin panel ships this module OFF by
    // default, so `!== false` (the portfolios precedent) would silently enable
    // messaging for every deployment that never explicitly turned it on.
    assert.match(gate, /config\?\.modules\?\.enableMessagesModule === true/);
    assert.doesNotMatch(gate, /enableMessagesModule !== false/);

    // The exact AC-4 contract.
    assert.match(gate, /status\(403\)/);
    assert.match(gate, /code: 'MODULE_DISABLED'/);
    assert.match(gate, /error: 'Messaging module is disabled by administrator\.'/);
    assert.match(gate, /success: false/);

    // A settings read failure must NOT fall through to the routes.
    assert.match(gate, /APPLICATION_DATABASE_UNAVAILABLE/);
test('AC-2: the conversations projection is participant-scoped and returns a server total', async () => {
    const source = await fs.readFile('backend/index.js', 'utf8');
    const list = routeBlock(source, "app.get('/api/messages/conversations'");

    // INV-3: the membership join that scopes the whole list is unchanged.
    assert.match(list, /JOIN conversation_participants cp ON cp\.conversation_id = c\.id/);
    assert.match(list, /cp\.user_id = \?/);
    assert.match(list, /\[uid\]/);

    // The unread projection joins the CALLER's own participant row, so a
    // neighbouring user's read cursor can never be surfaced, and the caller's
    // own messages never count as unread.
    assert.match(list, /cp\.user_id = \?/);
    assert.match(list, /m\.sender_id <> \?/);
    assert.match(list, /unreadCount/);

    // The badge total is computed server-side from those same rows.
    assert.match(list, /const totalUnread = conversations\.reduce/);
    assert.match(list, /Cache-Control', 'no-store, private/);
});

test('AC-2/INV-3: the read-cursor endpoint is membership-bound and monotonic', async () => {
    const source = await fs.readFile('backend/index.js', 'utf8');
    const mark = routeBlock(source, "app.post('/api/messages/conversations/:conversationId/read'");

    // A non-participant gets the same 404 as an unknown conversation, so the
    // endpoint never confirms a conversation exists to an outsider.
    assert.match(mark, /SELECT 1 FROM conversation_participants WHERE conversation_id = \? AND user_id = \?/);
    assert.match(mark, /status\(404\)/);
    // The UPDATE is scoped to the caller's own participant row.
    assert.match(mark, /WHERE conversation_id = \? AND user_id = \?/);
    // GREATEST() makes a replayed or stale advance idempotent and forward-only.
    assert.match(mark, /GREATEST\(COALESCE\(last_read_at, 0\)/);
    // An empty id must not erase a real cursor.
    assert.match(mark, /WHEN \? <> '' THEN GREATEST/);
    // The message id is validated against the real `msg_<epoch>_<hex>` shape.
    assert.match(mark, /\^msg_/);
    assert.match(mark, /lastReadMessageId/);
});

    // The gate must sit after the global requireAuth middleware so an anonymous
test('AC-2: the unread hook returns the object shape its consumers destructure', async () => {
    const hook = await fs.readFile('src/hooks/useUnreadMessages.js', 'utf8');

    // THE REGRESSION THIS DIRECTIVE CLOSED: the hook used to `return
    // unreadCount` (a number) while every caller did `{ unreadCount }`, which
    // destructures `undefined` — so the badge could never render.
    assert.match(hook, /return \{ unreadCount, error, status, enabled, refresh \};/);
    assert.doesNotMatch(hook, /return unreadCount;/);

    // The count is the SERVER total, never a client-side guess.
    assert.match(hook, /data\?\.totalUnread/);

    // Fail-visible: an error is surfaced, never coerced to a silent zero.
    assert.match(hook, /setError\(loadError\?\.message/);
    assert.match(hook, /setStatus\('error'\)/);

    // AC-2 requires a bounded poll cadence plus a route-focus refresh.
    assert.match(hook, /POLL_INTERVAL_MS = 15000/);
    assert.match(hook, /addEventListener\('focus', refresh\)/);

    // The module flag is resolved before any messaging traffic is issued.
    assert.match(hook, /resolveMessagesVisibility/);
    assert.match(hook, /if \(!enabled\)/);

    // A failed settings read must fail CLOSED, not enable the module.
    assert.match(hook, /setModuleEnabled\(false\)/);

    // The legacy Firebase auth listener is gone: read state is server-owned.
    assert.doesNotMatch(hook, /conf\/fire/);
});
    // caller cannot even learn whether the module exists.
    assert.ok(
        source.indexOf("app.use('/api/messages', async") > source.indexOf('return requireAuth(req, res, next);'),
        'module gate must be mounted after requireAuth',
    );
});
test('AC-2: the header badge and both sidebars are wired to the live hook', async () => {
    const [appShell, candidate, employer] = await Promise.all([
        fs.readFile('src/components/cuba/CubaAppShell.jsx', 'utf8'),
        fs.readFile('src/components/Candidate/CubaCandidateShell.jsx', 'utf8'),
        fs.readFile('src/components/EmployerPortal/EmployerSidebar.jsx', 'utf8'),
    ]);

    // Header (AC-2).
    assert.match(appShell, /import MessagesNavBadge from '\.\/MessagesNavBadge'/);
    assert.match(appShell, /<MessagesNavBadge/);
    // Portal-agnostic: the caller supplies the real role-scoped destination.
    assert.match(appShell, /messagesHref = '\/dashboard\/messages'/);

    // Candidate sidebar: gated nav item + server-sourced badge.
    assert.match(candidate, /useUnreadMessages/);
    assert.match(candidate, /item\.id !== 'messages' \|\| messagesNavAllowed !== false/);
    assert.match(candidate, /resolveMessagesVisibility/);
    // A failed read shows '!', never a silent zero.
    assert.match(candidate, /unreadStatus === 'error'/);

    // Recruiter sidebar: same total, same gate, same honest error state.
    assert.match(employer, /buildEmployerNavGroups/);
    assert.match(employer, /resolveMessagesVisibility/);
    assert.match(employer, /unreadStatus === 'error'/);
    // The frozen navigation constant is never mutated.
    assert.doesNotMatch(employer, /EMPLOYER_NAV\.(push|splice|pop|shift)/);
});

test('AC-3: both messages routes are wrapped in the module gate', async () => {
    const [main, employerLegacy, employerCuba] = await Promise.all([
        fs.readFile('src/components/Dashboard/DashboardMain/DashboardMain.jsx', 'utf8'),
        fs.readFile('src/components/EmployerPortal/EmployerPortal.jsx', 'utf8'),
        fs.readFile('src/components/EmployerPortal/EmployerPortalCuba.jsx', 'utf8'),
    ]);

    // Both route blocks in DashboardMain (Cuba + legacy) must be gated, or one
    // of the two candidate shells would still expose the surface.
    const candidateRoutes = main.match(/path="messages" element=\{<MessagesModuleGate/g) || [];
    assert.equal(candidateRoutes.length, 2, 'both candidate messages routes must be gated');

    for (const [name, source] of [['EmployerPortal', employerLegacy], ['EmployerPortalCuba', employerCuba]]) {
        assert.match(source, /import MessagesModuleGate from '\.\.\/cuba\/MessagesModuleGate'/, `${name} must import the gate`);
        assert.match(source, /<MessagesModuleGate home="\/employer"/, `${name} must gate /employer/messages`);
    }
});

test('AC-3: the gate fails closed and redirects with a toast', async () => {
    const gate = await fs.readFile('src/components/cuba/MessagesModuleGate.jsx', 'utf8');

    // Fail-closed polarity, matching the AC-4 backend guard exactly.
    assert.match(gate, /resolveMessagesVisibility\(settings\) === true \? 'enabled' : 'disabled'/);
    // An unreadable settings document is NOT authorization to render the surface.
test('INV-4: the chat surface uses Cuba tokens and no hardcoded ramp', async () => {
    const source = await fs.readFile('src/components/Dashboard/DashboardMessages/DashboardMessages.jsx', 'utf8');
    // Strip comments so the documentation of the old colours is not mistaken
    // for live usage.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

    for (const token of ['--cuba-card', '--cuba-line', '--cuba-ink', '--cuba-primary-fill']) {
        assert.ok(code.includes(token), `expected Cuba token ${token}`);
    }
    // The pre-existing hardcoded ramp is gone from live markup.
    assert.doesNotMatch(code, /text-gray-\d|bg-gray-\d|border-gray-\d/);
    assert.doesNotMatch(code, /text-blue-\d|bg-blue-\d|border-blue-\d/);
    // Badge fills use the audited token pair (AA in light and dark).
    assert.match(code, /--cuba-header-badge-fill/);
    assert.match(code, /--cuba-header-badge-ink/);

    // Zero-fabrication: the pulsing presence indicator asserted a real-time
    // fact no table records.
    assert.doesNotMatch(code, /animate-pulse/);

    // The hardcoded `unread: 0` that made every thread look read is replaced by
    // the real server-side count.
    assert.match(code, /unread: Number\(conversation\.unreadCount\) \|\| 0/);
    assert.doesNotMatch(code, /unread: 0,/);
});

test('AC-2: the unread pill is exposed to assistive tech, not colour-only', async () => {
    const badge = await fs.readFile('src/components/cuba/MessagesNavBadge.jsx', 'utf8');
    // The count is announced as text, and a failed read is a distinct state
    // rather than an absent badge.
    assert.match(badge, /Messages, \$\{unreadCount\} unread/);
    assert.match(badge, /cuba-sr-only/);
    assert.match(badge, /data-state=\{unavailable \? 'unavailable' : 'unread'\}/);
    // Renders nothing at all when the administrator disabled the module.
    assert.match(badge, /if \(!enabled\) return null;/);
    // Zero unread renders no pill (no empty chrome), but an ERROR does.
    assert.match(badge, /if \(!unavailable && count <= 0\) return null;/);
});

test('migration 024 declares the read cursor with a matching down migration', async () => {
    const [up, down] = await Promise.all([
        fs.readFile('backend/database/migrations/024_messaging_read_state.sql', 'utf8'),
        fs.readFile('backend/database/migrations/024_messaging_read_state.down.sql', 'utf8'),
    ]);

    // Read state belongs to the (participant, conversation) pair, never to the
    // shared message log.
    assert.match(up, /ALTER TABLE conversation_participants/);
    assert.match(up, /ADD COLUMN IF NOT EXISTS last_read_message_id VARCHAR\(128\) NULL/);
    assert.match(up, /ADD COLUMN IF NOT EXISTS last_read_at BIGINT NULL/);
    assert.match(up, /CREATE INDEX IF NOT EXISTS idx_conv_participants_read/);

    // Reversible, and it discards read state ONLY — never messages.
    assert.match(down, /DROP INDEX IF EXISTS idx_conv_participants_read/);
    assert.match(down, /DROP COLUMN IF EXISTS last_read_at/);
    assert.match(down, /DROP COLUMN IF EXISTS last_read_message_id/);
    assert.doesNotMatch(stripSqlComments(down), /conversation_messages|DELETE FROM|DROP TABLE/i);

    // The enable flag is never touched by a schema migration.
    assert.doesNotMatch(stripSqlComments(up), /enableMessagesModule/);
});
    assert.match(gate, /setDecision\('disabled'\)/);
    // Nothing renders until the authoritative flag is known.
    assert.match(gate, /if \(decision !== 'enabled'\) return null;/);
    // Redirect home, once, with an informational (not error) notification.
    assert.match(gate, /notify\(message, 'info'\)/);
    assert.match(gate, /navigate\(home, \{ replace: true \}\)/);
    assert.match(gate, /notifiedRef/);
});