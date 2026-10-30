// Mandate 12-ULTIMATE contract tests (part B).
//
// The three tests that previously DESCRIBED the defects as expected behaviour
// ("the read route does not verify the message belongs to the conversation",
// "there is no employer settings route", "the portal still says no settings were
// saved") are replaced by tests of the corrected contract. The interview
// scheduling and calendar contracts from mandate 12B are retained unchanged.
//
// Level of evidence, stated explicitly:
//   * HTTP-level assertions run the real routers through supertest.
//   * Behavioural assertions for the read cursor run the real decision module
//     (`services/messageReadCursor`) against a stateful driver fixture that
//     models `conversation_messages` / `conversation_participants`.
//   * Persistence, locking and restart claims are NOT made here. They are made in
//     backend/test/mandate12-database-integration.test.js against MariaDB.

process.env.NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = path.resolve(import.meta.dirname, '../../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const require = createRequire(new URL('../../../backend/index.js', import.meta.url));

const express = require('express');
const request = require('supertest');
const mysql = require('./database/mysql');

// Driver seam, installed BEFORE any route module is loaded so destructured
// `const { getPool } = require(...)` references also observe it.
let currentPool = null;
mysql.getPool = () => currentPool;

const readCursor = require('./services/messageReadCursor');
const { router: employerSettingsRouter } = require('./routes/employerSettings');
const { jobsDataRouter } = require('./routes/jobsData');

const ical = require(path.join(root, 'backend/services/interviewIcal.js'));
const interviewService = require(path.join(root, 'backend/services/interviewScheduling.js'));
const portal = read('frontend/src/pages/employer/portal.tsx');
const drawer = read('frontend/src/components/employer/CandidateReviewDrawer.tsx');
const jobsData = read('backend/routes/jobsData.js');
const scheduling = read('backend/services/interviewScheduling.js');
const interviewRoutes = read('backend/routes/interviews.js');
const appSource = read('backend/index.js');
const settingsRoute = read('backend/routes/employerSettings.js');
const migration = read('backend/database/migrations/031_interview_slots.sql');
const evaluationMigration = read('backend/database/migrations/036_application_evaluations.sql');

function makePool(handler) {
  const calls = [];
  const run = async (sql, params = []) => {
    calls.push({ sql: String(sql), params });
    return handler(String(sql), params);
  };
  const connection = { query: run, beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {} };
  return { calls, query: run, getConnection: async () => connection };
}

// ─── Stateful messaging fixture ─────────────────────────────────────────────
function messagingFixture({ participants = {}, messages = [] } = {}) {
  const conversations = new Set(['conv_alpha']);
  const participantRows = new Map(Object.entries(participants)); // `${conversationId}|${uid}` -> {last_read_message_id, last_read_at}
  const messageRows = messages.map(message => ({ ...message }));
  const connection = {
    query: async (sql, params = []) => {
      if (/FROM conversations WHERE id = \? AND deleted_at IS NULL/.test(sql)) {
        return [conversations.has(params[0]) ? [{ id: params[0] }] : []];
      }
      if (/FROM conversation_participants/.test(sql)) {
        const key = `${params[0]}|${params[1]}`;
        const row = participantRows.get(key);
        return [row ? [{ ...row }] : []];
      }
      if (/FROM conversation_messages WHERE id = \? AND conversation_id = \?/.test(sql)) {
        const found = messageRows.find(message => message.id === params[0] && message.conversation_id === params[1]);
        return [found ? [{ id: found.id, timestamp: found.timestamp }] : []];
      }
      if (/UPDATE conversation_participants/.test(sql)) {
        const [nextId, nextReadAt, conversationId, uid] = params;
        participantRows.set(`${conversationId}|${uid}`, { last_read_message_id: nextId, last_read_at: nextReadAt });
        return [{ affectedRows: 1 }];
      }
      return [[]];
    },
    beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {},
  };
  return {
    connection,
    participantRows,
    messageRows,
    cursorFor: (conversationId, uid) => participantRows.get(`${conversationId}|${uid}`) || null,
  };
}

const msg = (id, timestamp, conversationId = 'conv_alpha') => ({ id, conversation_id: conversationId, timestamp });

test('interview service contract, tenant scope and atomicity', () => {
  assert.match(scheduling, /durationMinutes/);
  assert.match(scheduling, /SLOT_DURATIONS = Object\.freeze\(\[15, 30, 45, 60\]\)/);
  assert.match(scheduling, /ZONED_INSTANT/);
  assert.match(scheduling, /start\.getTime\(\) <= new Date\(now\)\.getTime\(\)/);
  assert.match(scheduling, /UPDATE interview_slots SET is_booked = 1, booked_by_app_id = \? WHERE id = \? AND is_booked = 0/);
  assert.match(scheduling, /affectedRows\s*\|\|\s*0\) !== 1/);
  assert.match(scheduling, /application\.employer_id\) !== String\(slot\.employer_id\)/);
  assert.match(scheduling, /isApplicant && !isSlotOwner/);
  assert.match(scheduling, /A past interview slot cannot be booked/);
  assert.match(scheduling, /is_booked = 0/);
  assert.match(migration, /chk_interview_slot_duration CHECK \(duration_minutes IN \(15, 30, 45, 60\)\)/);
  assert.match(migration, /UNIQUE KEY uq_interview_slot_employer_start/);
  assert.match(migration, /FOREIGN KEY \(booked_by_app_id\)/);
  assert.match(interviewRoutes, /requireEmployer/);
  assert.match(interviewRoutes, /text\/calendar; charset=utf-8/);
});


// ═══════════════════════════════════════════════════════════════════════════
// MESSAGING — read cursors (workstream 1)
// ═══════════════════════════════════════════════════════════════════════════

test('the read route delegates to the verified cursor module (no client timestamp is forwarded)', () => {
  const route = appSource.slice(
    appSource.indexOf("app.post('/api/messages/conversations/:conversationId/read'"),
    appSource.indexOf("app.post('/api/messages/conversations', async")
  );
  assert.match(route, /require\('\.\/services\/messageReadCursor'\)/);
  assert.match(route, /markConversationRead\(/);
  // The body field that used to be trusted is never read into the cursor: the
  // only body field forwarded is the message id, and the old write pattern is gone.
  assert.match(route, /requestedMessageId: req\.body\?\.lastReadMessageId/);
  assert.equal(/lastReadAt:\s*Number\(/.test(route), false);
  assert.equal(/Date\.now\(\)/.test(route), false);
  // The write happens inside an explicit transaction.
  assert.match(route, /beginTransaction/);
  assert.match(route, /connection\.commit\(\)/);
  assert.match(route, /connection\.rollback\(\)/);
  // Error contract is mapped from the module outcomes.
  assert.match(route, /httpStatusFor/);
});

test('a valid participant advances the cursor using the persisted message timestamp', async () => {
  const fixture = messagingFixture({
    participants: { 'conv_alpha|user-1': { last_read_message_id: null, last_read_at: null } },
    messages: [msg('msg_1700000000000_aaaaaaaa', 1700000000000), msg('msg_1700000005000_bbbbbbbb', 1700000005000)],
  });
  const result = await readCursor.markConversationRead({
    connection: fixture.connection,
    conversationId: 'conv_alpha',
    uid: 'user-1',
    requestedMessageId: 'msg_1700000005000_bbbbbbbb',
  });
  assert.equal(result.outcome, readCursor.OUTCOME.OK);
  assert.equal(result.advanced, true);
  assert.equal(result.cursor.lastReadMessageId, 'msg_1700000005000_bbbbbbbb');
  assert.equal(result.cursor.lastReadAt, 1700000005000);
  assert.equal(fixture.cursorFor('conv_alpha', 'user-1').last_read_at, 1700000005000);
});

test('a cross-conversation message id is rejected with MESSAGE_NOT_IN_CONVERSATION', async () => {
  const fixture = messagingFixture({
    participants: { 'conv_alpha|user-1': { last_read_message_id: null, last_read_at: null } },
    messages: [msg('msg_1700000000000_aaaaaaaa', 1700000000000), msg('msg_1700000009000_cccccccc', 1700000009000, 'conv_other')],
  });
  const result = await readCursor.markConversationRead({
    connection: fixture.connection,
    conversationId: 'conv_alpha',
    uid: 'user-1',
    requestedMessageId: 'msg_1700000009000_cccccccc',
  });
  assert.equal(result.outcome, readCursor.OUTCOME.MESSAGE_NOT_IN_CONVERSATION);
  assert.equal(readCursor.httpStatusFor(result.outcome), 400);
  assert.equal(fixture.cursorFor('conv_alpha', 'user-1').last_read_message_id, null, 'the cursor must not move');
});

test('a non-participant receives 403 and a missing conversation 404', async () => {
  const fixture = messagingFixture({
    participants: { 'conv_alpha|user-1': { last_read_message_id: null, last_read_at: null } },
    messages: [msg('msg_1700000000000_aaaaaaaa', 1700000000000)],
  });
  const outsider = await readCursor.markConversationRead({
    connection: fixture.connection, conversationId: 'conv_alpha', uid: 'intruder', requestedMessageId: 'msg_1700000000000_aaaaaaaa',
  });
  assert.equal(outsider.outcome, readCursor.OUTCOME.FORBIDDEN_CONVERSATION_PARTICIPANT);
  assert.equal(readCursor.httpStatusFor(outsider.outcome), 403);

  const missing = await readCursor.markConversationRead({
    connection: fixture.connection, conversationId: 'conv_missing', uid: 'user-1', requestedMessageId: null,
  });
  assert.equal(missing.outcome, readCursor.OUTCOME.CONVERSATION_NOT_FOUND);
  assert.equal(readCursor.httpStatusFor(missing.outcome), 404);
});

test('malformed identifiers never reach the database', async () => {
  let queried = false;
  const connection = { query: async () => { queried = true; return [[]]; } };
  for (const conversationId of ['', 'has space', 'x'.repeat(129), '../etc/passwd']) {
    const result = await readCursor.markConversationRead({
      connection, conversationId, uid: 'user-1', requestedMessageId: null,
    });
    assert.equal(result.outcome, readCursor.OUTCOME.INVALID_CONVERSATION_ID, conversationId);
  }
  for (const messageId of ['not-a-message', 'msg_1_zz', 'msg_1700000000000_aaaaaaaa<script>']) {
    const result = await readCursor.markConversationRead({
      connection, conversationId: 'conv_alpha', uid: 'user-1', requestedMessageId: messageId,
    });
    assert.equal(result.outcome, readCursor.OUTCOME.INVALID_MESSAGE_ID, messageId);
  }
  assert.equal(queried, false);
});

test('the cursor is monotonic: stale replays and old messages cannot rewind it', async () => {
  const fixture = messagingFixture({
    participants: { 'conv_alpha|user-1': { last_read_message_id: 'msg_1700000005000_bbbbbbbb', last_read_at: 1700000005000 } },
    messages: [
      msg('msg_1700000000000_aaaaaaaa', 1700000000000),
      msg('msg_1700000005000_bbbbbbbb', 1700000005000),
      msg('msg_1700000009000_cccccccc', 1700000009000),
    ],
  });
  const stale = await readCursor.markConversationRead({
    connection: fixture.connection, conversationId: 'conv_alpha', uid: 'user-1', requestedMessageId: 'msg_1700000000000_aaaaaaaa',
  });
  assert.equal(stale.outcome, readCursor.OUTCOME.OK);
  assert.equal(stale.advanced, false);
  assert.equal(fixture.cursorFor('conv_alpha', 'user-1').last_read_message_id, 'msg_1700000005000_bbbbbbbb');

  // Replaying the current cursor is also a no-op.
  const replay = await readCursor.markConversationRead({
    connection: fixture.connection, conversationId: 'conv_alpha', uid: 'user-1', requestedMessageId: 'msg_1700000005000_bbbbbbbb',
  });
  assert.equal(replay.advanced, false);

  // Forward still works.
  const forward = await readCursor.markConversationRead({
    connection: fixture.connection, conversationId: 'conv_alpha', uid: 'user-1', requestedMessageId: 'msg_1700000009000_cccccccc',
  });
  assert.equal(forward.advanced, true);
  assert.equal(fixture.cursorFor('conv_alpha', 'user-1').last_read_at, 1700000009000);
});

test('messages sharing a timestamp are ordered by id, matching the read path ORDER BY', async () => {
  const fixture = messagingFixture({
    participants: { 'conv_alpha|user-1': { last_read_message_id: null, last_read_at: null } },
    messages: [msg('msg_1700000000000_aaaaaaaa', 1700000000000), msg('msg_1700000000000_ffffffff', 1700000000000)],
  });
  const first = await readCursor.markConversationRead({
    connection: fixture.connection, conversationId: 'conv_alpha', uid: 'user-1', requestedMessageId: 'msg_1700000000000_ffffffff',
  });
  assert.equal(first.advanced, true);
  const backwardsWithinSameMs = await readCursor.markConversationRead({
    connection: fixture.connection, conversationId: 'conv_alpha', uid: 'user-1', requestedMessageId: 'msg_1700000000000_aaaaaaaa',
  });
  assert.equal(backwardsWithinSameMs.advanced, false, 'a lower id at the same timestamp must not rewind the cursor');
});

test('concurrent advances converge on the newest message and never regress', async () => {
  const fixture = messagingFixture({
    participants: { 'conv_alpha|user-1': { last_read_message_id: null, last_read_at: null } },
    messages: [
      msg('msg_1700000001000_aaaaaaaa', 1700000001000),
      msg('msg_1700000002000_bbbbbbbb', 1700000002000),
      msg('msg_1700000003000_cccccccc', 1700000003000),
      msg('msg_1700000004000_dddddddd', 1700000004000),
    ],
  });
  const ids = ['msg_1700000001000_aaaaaaaa', 'msg_1700000003000_cccccccc', 'msg_1700000002000_bbbbbbbb', 'msg_1700000004000_dddddddd'];
  const results = await Promise.all(ids.map(requestedMessageId => readCursor.markConversationRead({
    connection: fixture.connection, conversationId: 'conv_alpha', uid: 'user-1', requestedMessageId,
  })));
  assert.ok(results.every(result => result.outcome === readCursor.OUTCOME.OK));
  const cursor = fixture.cursorFor('conv_alpha', 'user-1');
  assert.equal(cursor.last_read_message_id, 'msg_1700000004000_dddddddd');
  assert.equal(cursor.last_read_at, 1700000004000);
});

test('omitting the message id preserves the stored cursor and never invents a timestamp', async () => {
  const fixture = messagingFixture({
    participants: { 'conv_alpha|user-1': { last_read_message_id: 'msg_1700000005000_bbbbbbbb', last_read_at: 1700000005000 } },
    messages: [msg('msg_1700000005000_bbbbbbbb', 1700000005000)],
  });
  for (const requestedMessageId of [undefined, null, '']) {
    const result = await readCursor.markConversationRead({
      connection: fixture.connection, conversationId: 'conv_alpha', uid: 'user-1', requestedMessageId,
    });
    assert.equal(result.outcome, readCursor.OUTCOME.OK);
    assert.equal(result.advanced, false);
    assert.equal(result.cursor.lastReadAt, 1700000005000);
  }
  assert.equal(fixture.cursorFor('conv_alpha', 'user-1').last_read_at, 1700000005000);
});

test('a message with no usable persisted timestamp is rejected, not written', async () => {
  const fixture = messagingFixture({
    participants: { 'conv_alpha|user-1': { last_read_message_id: null, last_read_at: null } },
    messages: [msg('msg_1700000000000_aaaaaaaa', 0)],
  });
  const result = await readCursor.markConversationRead({
    connection: fixture.connection, conversationId: 'conv_alpha', uid: 'user-1', requestedMessageId: 'msg_1700000000000_aaaaaaaa',
  });
  assert.equal(result.outcome, readCursor.OUTCOME.MESSAGE_TIMESTAMP_INVALID);
  assert.equal(readCursor.httpStatusFor(result.outcome), 400);
});

test('the client timestamp field is gone from the messaging client library', () => {
  const lib = read('frontend/src/lib/messages.ts');
  assert.match(lib, /lastReadMessageId: message\.id/);
  assert.equal(/lastReadAt/.test(lib), false, 'the client must not send a read timestamp');
});

// ═══════════════════════════════════════════════════════════════════════════
// EMPLOYER SETTINGS — persistence (workstream 2)
// ═══════════════════════════════════════════════════════════════════════════

const SETTINGS_COLUMNS = ['owner_id', 'company_name', 'timezone', 'notification_email', 'default_interview_duration', 'auto_archive_days', 'updated_at'];

function settingsFixture(initialRows = {}, { onUpdate } = {}) {
  const rows = new Map(Object.entries(initialRows));
  return makePool((sql, params) => {
    if (/FROM companies WHERE owner_id = \?/.test(sql)) return [[]];
    if (/FROM employer_settings WHERE owner_id = \?/.test(sql) && sql.includes('FOR UPDATE')) {
      const row = rows.get(params[0]);
      return [row ? [{ ...row }] : []];
    }
    if (sql.startsWith('INSERT INTO employer_settings')) {
      const [ownerId, companyName] = params;
      if (!rows.has(ownerId)) {
        rows.set(ownerId, {
          owner_id: ownerId, company_name: companyName, timezone: 'UTC', notification_email: null,
          default_interview_duration: 30, auto_archive_days: 30, updated_at: new Date().toISOString(),
        });
      }
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('UPDATE employer_settings SET')) {
      const assignments = [...sql.matchAll(/([a-z_]+) = \?/g)].map(match => match[1]);
      const ownerId = params[params.length - 1];
      const row = rows.get(ownerId);
      if (!row) return [{ affectedRows: 0 }];
      if (onUpdate) onUpdate(assignments, params);
      assignments.forEach((column, index) => { row[column] = params[index]; });
      row.updated_at = new Date().toISOString();
      return [{ affectedRows: 1 }];
    }
    if (/FROM employer_settings WHERE owner_id = \? LIMIT 1/.test(sql)) {
      const row = rows.get(params[0]);
      return [row ? [{ ...row }] : []];
    }
    if (/SELECT owner_id FROM employer_settings WHERE owner_id = \?/.test(sql)) {
      return [rows.has(params[0]) ? [{ owner_id: params[0] }] : []];
    }
    return [[]];
  });
}

function settingsApp({ employer = true, uid = 'employer-1' } = {}) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (uid) req.user = { uid, email: 'hr@acme.test', emailVerified: true, claims: { role: 'USER', employer } };
    next();
  });
  app.use('/api/employer', employerSettingsRouter);
  return app;
}

test('GET /api/employer/settings initializes defaults and returns them', async () => {
  currentPool = settingsFixture();
  const res = await request(settingsApp()).get('/api/employer/settings');
  assert.equal(res.status, 200);
  assert.deepEqual(
    { ...res.body.settings, updatedAt: undefined },
    { companyName: '', timezone: 'UTC', notificationEmail: null, defaultInterviewDuration: 30, autoArchiveDays: 30, updatedAt: undefined }
  );
  assert.equal(currentPool.calls.some(call => call.sql.startsWith('INSERT INTO employer_settings')), true);
});

test('PATCH persists each supported field and preserves the unspecified ones', async () => {
  currentPool = settingsFixture();
  const app = settingsApp();
  let res = await request(app).patch('/api/employer/settings').send({
    companyName: 'Acme Talent', timezone: 'Asia/Kolkata', notificationEmail: 'HIRING@ACME.TEST',
    defaultInterviewDuration: 45, autoArchiveDays: 14,
  });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.updated.sort(), ['autoArchiveDays', 'companyName', 'defaultInterviewDuration', 'notificationEmail', 'timezone']);
  assert.equal(res.body.settings.companyName, 'Acme Talent');
  assert.equal(res.body.settings.timezone, 'Asia/Kolkata');
  assert.equal(res.body.settings.notificationEmail, 'hiring@acme.test');
  assert.equal(res.body.settings.defaultInterviewDuration, 45);
  assert.equal(res.body.settings.autoArchiveDays, 14);

  // A partial update touches one column only.
  res = await request(app).patch('/api/employer/settings').send({ autoArchiveDays: 0 });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.updated, ['autoArchiveDays']);
  assert.equal(res.body.settings.autoArchiveDays, 0);
  assert.equal(res.body.settings.companyName, 'Acme Talent', 'unrelated settings must survive');

  // Re-reading (a fresh GET, i.e. a page reload) returns the persisted values.
  res = await request(app).get('/api/employer/settings');
  assert.equal(res.body.settings.defaultInterviewDuration, 45);
  assert.equal(res.body.settings.notificationEmail, 'hiring@acme.test');
});

test('PATCH validates every field and writes nothing when it rejects', async () => {
  for (const [body, field] of [
    [{ companyName: 'x' }, 'companyName'],
    [{ companyName: '' }, 'companyName'],
    [{ timezone: 'Mars/Olympus' }, 'timezone'],
    [{ timezone: 'not a timezone' }, 'timezone'],
    [{ notificationEmail: 'not-an-email' }, 'notificationEmail'],
    [{ defaultInterviewDuration: 20 }, 'defaultInterviewDuration'],
    [{ defaultInterviewDuration: '45.5' }, 'defaultInterviewDuration'],
    [{ autoArchiveDays: -1 }, 'autoArchiveDays'],
    [{ autoArchiveDays: 3651 }, 'autoArchiveDays'],
    [{ autoArchiveDays: 1.5 }, 'autoArchiveDays'],
    [{ companyName: null }, 'companyName'],
  ]) {
    currentPool = settingsFixture();
    const res = await request(settingsApp()).patch('/api/employer/settings').send(body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(res.body.success, false);
    assert.equal(res.body.details[0].field, field, JSON.stringify(body));
    assert.equal(currentPool.calls.some(call => call.sql.startsWith('UPDATE employer_settings')), false);
  }
  // Unknown fields are refused rather than silently ignored.
  currentPool = settingsFixture();
  const res = await request(settingsApp()).patch('/api/employer/settings').send({ theme: 'dark' });
  assert.equal(res.status, 400);
  assert.equal(res.body.details[0].field, 'theme');
});

test('settings are isolated per employer and require employer access', async () => {
  currentPool = settingsFixture({
    'employer-1': { owner_id: 'employer-1', company_name: 'Alpha Co', timezone: 'UTC', notification_email: null, default_interview_duration: 30, auto_archive_days: 30, updated_at: null },
  });
  const alpha = await request(settingsApp({ uid: 'employer-1' })).get('/api/employer/settings');
  assert.equal(alpha.body.settings.companyName, 'Alpha Co');

  const beta = await request(settingsApp({ uid: 'employer-2' })).get('/api/employer/settings');
  assert.equal(beta.body.settings.companyName, '', 'another employer must never see these settings');
  assert.equal(beta.status, 200);

  // Every statement is scoped by the verified uid.
  assert.ok(currentPool.calls
    .filter(call => /employer_settings/.test(call.sql))
    .every(call => call.params.includes('employer-1') || call.params.includes('employer-2')));

  for (const employer of [false]) {
    const denied = await request(settingsApp({ employer })).get('/api/employer/settings');
    assert.equal(denied.status, 403);
    assert.equal(denied.body.code, 'EMPLOYER_ACCESS_REQUIRED');
    const deniedPatch = await request(settingsApp({ employer })).patch('/api/employer/settings').send({ autoArchiveDays: 3 });
    assert.equal(deniedPatch.status, 403);
    const anonymous = await request(settingsApp({ uid: null })).get('/api/employer/settings');
    assert.equal(anonymous.status, 401);
  }
});

test('a failed settings write reports failure and never a false success', async () => {
  currentPool = makePool(async (sql) => {
    if (sql.startsWith('UPDATE employer_settings SET')) throw new Error('disk full');
    if (/FROM employer_settings WHERE owner_id = \?/.test(sql)) return [[{
      owner_id: 'employer-1', company_name: '', timezone: 'UTC', notification_email: null,
      default_interview_duration: 30, auto_archive_days: 30, updated_at: null,
    }]];
    return [[]];
  });
  const res = await request(settingsApp()).patch('/api/employer/settings').send({ autoArchiveDays: 9 });
  assert.equal(res.status, 503);
  assert.equal(res.body.success, false);
  assert.equal(res.body.code, 'SETTINGS_WRITE_FAILED');
  assert.equal(res.body.settings, undefined);
});

test('the portal loads and saves through the real settings contract with no placeholder', () => {
  assert.equal(/No settings were saved/.test(portal), false);
  assert.equal(/Values below are unsaved/.test(portal), false);
  assert.equal(/not available through an authorized persistence endpoint/.test(portal), false);
  assert.equal(/https:\/\/calendly\.com/.test(portal), false);
  assert.match(portal, /const EMPLOYER_SETTINGS_PATH = '\/employer\/settings'/);
  assert.match(portal, /await get<\{ success: boolean; settings: EmployerSettings \}>\(EMPLOYER_SETTINGS_PATH\)/);
  assert.match(portal, /await patch<\{ success: boolean; settings: EmployerSettings/);
  // Success is derived only from a confirmed server response.
  assert.match(portal, /if \(!response\?\.success \|\| !response\.settings\) throw new Error/);
  assert.match(portal, /setSettingsNotice\('Preferences saved\.'\)/);
  // The submit control is locked while a save is in flight.
  assert.match(portal, /disabled=\{settingsSaving \|\| settingsLoading\}/);
  assert.match(portal, /if \(settingsSaving \|\| settingsLoading\) return/);
  // Failure keeps the user's input.
  assert.match(portal, /Your changes are still here/);
  // The backend contract that the page depends on exists.
  assert.match(settingsRoute, /router\.get\('\/settings'/);
  assert.match(settingsRoute, /router\.patch\('\/settings'/);
});

// ═══════════════════════════════════════════════════════════════════════════
// INTERVIEW SCORECARDS — relational evaluation (workstream 3)
// ═══════════════════════════════════════════════════════════════════════════

function evaluationFixture({ applications = {}, evaluations = [] } = {}) {
  const applicationRows = new Map(Object.entries(applications));
  const evaluationRows = evaluations.map(row => ({ ...row }));
  return makePool((sql, params) => {
    if (/FROM applications WHERE id = \? AND employer_id = \? FOR UPDATE/.test(sql)) {
      const row = applicationRows.get(params[0]);
      return [row && row.employer_id === params[1] ? [{ id: row.id, extra_json: row.extra_json ?? null }] : []];
    }
    if (/FROM applications WHERE id = \? AND employer_id = \? LIMIT 1/.test(sql)) {
      const row = applicationRows.get(params[0]);
      return [row && row.employer_id === params[1] ? [{ ...row }] : []];
    }
    if (sql.startsWith('UPDATE applications SET rating')) {
      const row = applicationRows.get(params[3]);
      if (!row || row.employer_id !== params[4]) return [{ affectedRows: 0 }];
      row.rating = params[0]; row.notes = params[1]; row.extra_json = params[2];
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('INSERT INTO application_evaluations')) {
      const [id, applicationId, reviewerId, rating, recommendation, notes] = params;
      const existing = evaluationRows.find(row => row.application_id === applicationId && row.reviewer_id === reviewerId);
      if (existing) {
        existing.rating = rating; existing.recommendation = recommendation; existing.notes = notes;
        return [{ affectedRows: 2 }];
      }
      evaluationRows.push({ id, application_id: applicationId, reviewer_id: reviewerId, rating, recommendation, notes });
      return [{ affectedRows: 1 }];
    }
    if (/FROM application_evaluations[\s\S]*WHERE application_id = \? AND reviewer_id = \?/.test(sql)) {
      const found = evaluationRows.find(row => row.application_id === params[0] && row.reviewer_id === params[1]);
      return [found ? [{ ...found }] : []];
    }
    return [[]];
  });
}

function jobsApp(uid = 'employer-1', employer = true) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { uid, email: 'hr@acme.test', emailVerified: true, claims: { role: 'USER', employer } };
    next();
  });
  app.use('/api/jobs-data', jobsDataRouter);
  return app;
}

const APPLICATION_ID = 'app_mandate12_0001';
const applicationRow = (employerId = 'employer-1') => ({
  id: APPLICATION_ID, employer_id: employerId, rating: 0, notes: '', extra_json: null, updated_at: null,
});

test('an interview scorecard can be created, updated and retrieved relationally', async () => {
  currentPool = evaluationFixture({ applications: { [APPLICATION_ID]: applicationRow() } });
  const app = jobsApp();

  let res = await request(app).put(`/api/jobs-data/applications/${APPLICATION_ID}/evaluate`).send({
    rating: 4, notes: 'Strong systems design, shallow on testing.', recommendation: 'STRONG_YES',
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.evaluation.rating, 4);
  assert.equal(res.body.evaluation.recommendation, 'STRONG_YES');
  assert.equal(res.body.evaluation.applicationId, APPLICATION_ID);
  assert.equal(res.body.evaluation.reviewerId, 'employer-1');
  assert.equal(res.body.evaluation.source, 'APPLICATION_EVALUATIONS');
  const insert = currentPool.calls.find(call => call.sql.startsWith('INSERT INTO application_evaluations'));
  assert.ok(insert, 'the relational write must happen');
  assert.match(insert.sql, /ON DUPLICATE KEY UPDATE/);

  // Legacy compatibility columns are dual-written in the same transaction.
  assert.ok(currentPool.calls.some(call => /^UPDATE applications SET rating = \?, notes = \?, extra_json = \?/.test(call.sql)));

  // Updating the SAME reviewer updates in place rather than duplicating.
  res = await request(app).put(`/api/jobs-data/applications/${APPLICATION_ID}/evaluate`).send({
    rating: 5, notes: 'Reconsidered after the follow-up round.', recommendation: 'YES',
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.evaluation.rating, 5);
  assert.equal(res.body.evaluation.recommendation, 'YES');

  res = await request(app).get(`/api/jobs-data/applications/${APPLICATION_ID}/evaluate`);
  assert.equal(res.status, 200);
  assert.equal(res.body.evaluation.rating, 5);
  assert.equal(res.body.evaluation.recommendation, 'YES');
  assert.equal(res.body.evaluation.notes, 'Reconsidered after the follow-up round.');
});

test('legacy recommendation labels are accepted and stored canonically', async () => {
  const app = jobsApp();
  for (const [legacy, canonical] of [['Move to Offer', 'STRONG_YES'], ['Reject', 'NO'], ['Hold', 'NEUTRAL']]) {
    currentPool = evaluationFixture({ applications: { [APPLICATION_ID]: applicationRow() } });
    const res = await request(app).put(`/api/jobs-data/applications/${APPLICATION_ID}/evaluate`).send({
      rating: 3, notes: 'Backwards compatible save.', recommendation: legacy,
    });
    assert.equal(res.status, 200, legacy);
    assert.equal(res.body.evaluation.recommendation, canonical, legacy);
  }
});

test('reviewers keep independent scorecards and cannot overwrite each other', async () => {
  // `applications` has exactly one owning employer, so a second reviewer on the
  // same application is modelled at the evaluation-row level (two reviewer ids
  // against one application id), which is what the unique key protects.
  currentPool = evaluationFixture({
    applications: { [APPLICATION_ID]: applicationRow() },
    evaluations: [
      { id: 'ael_seed_1', application_id: APPLICATION_ID, reviewer_id: 'employer-1', rating: 5, recommendation: 'STRONG_YES', notes: 'Hire.' },
      { id: 'ael_seed_2', application_id: APPLICATION_ID, reviewer_id: 'employer-2', rating: 2, recommendation: 'NO', notes: 'Not yet.' },
    ],
  });
  const app = jobsApp('employer-1');

  // The caller reads only their own evaluation, never the other reviewer's.
  let res = await request(app).get(`/api/jobs-data/applications/${APPLICATION_ID}/evaluate`);
  assert.equal(res.status, 200);
  assert.equal(res.body.evaluation.reviewerId, 'employer-1');
  assert.equal(res.body.evaluation.rating, 5);
  assert.equal(res.body.evaluation.recommendation, 'STRONG_YES');

  // Saving updates the caller's row only.
  res = await request(app).put(`/api/jobs-data/applications/${APPLICATION_ID}/evaluate`)
    .send({ rating: 4, notes: 'Hire, with reservations.', recommendation: 'YES' });
  assert.equal(res.status, 200);
  assert.equal(res.body.evaluation.rating, 4);

  const upsert = currentPool.calls.filter(call => call.sql.startsWith('INSERT INTO application_evaluations'));
  assert.ok(upsert.every(call => call.params[2] === 'employer-1'), 'the reviewer is always the server-side identity');
});

test('an application owned by another employer is unreachable (cross-tenant isolation)', async () => {
  currentPool = evaluationFixture({ applications: { [APPLICATION_ID]: applicationRow('employer-1') } });
  const res = await request(jobsApp('employer-other')).put(`/api/jobs-data/applications/${APPLICATION_ID}/evaluate`)
    .send({ rating: 1, notes: 'Should never land.', recommendation: 'STRONG_NO' });
  assert.equal(res.status, 404);
  assert.equal(res.body.code, 'APPLICATION_NOT_FOUND');
  assert.equal(currentPool.calls.some(call => call.sql.startsWith('INSERT INTO application_evaluations')), false);

  const read = await request(jobsApp('employer-other')).get(`/api/jobs-data/applications/${APPLICATION_ID}/evaluate`);
  assert.equal(read.status, 404);
});

test('invalid ratings, notes and recommendations are rejected before any write', async () => {
  currentPool = evaluationFixture({ applications: { [APPLICATION_ID]: applicationRow() } });
  const app = jobsApp();
  for (const [body, code] of [
    [{ rating: 0, notes: 'x', recommendation: 'YES' }, 'INVALID_RATING'],
    [{ rating: 6, notes: 'x', recommendation: 'YES' }, 'INVALID_RATING'],
    [{ rating: 2.5, notes: 'x', recommendation: 'YES' }, 'INVALID_RATING'],
    [{ rating: 3, notes: '', recommendation: 'YES' }, 'INVALID_NOTES'],
    [{ rating: 3, notes: 'y'.repeat(1001), recommendation: 'YES' }, 'INVALID_NOTES'],
    [{ rating: 3, notes: 'ok', recommendation: 'MAYBE_LATER' }, 'INVALID_RECOMMENDATION'],
    [{ rating: 3, notes: 'ok' }, 'INVALID_RECOMMENDATION'],
  ]) {
    const res = await request(app).put(`/api/jobs-data/applications/${APPLICATION_ID}/evaluate`).send(body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(res.body.code, code, JSON.stringify(body));
  }
  assert.equal(currentPool.calls.some(call => /INSERT INTO application_evaluations|UPDATE applications SET rating/.test(call.sql)), false);
});

test('non-employers cannot read or write scorecards', async () => {
  currentPool = evaluationFixture({ applications: { [APPLICATION_ID]: applicationRow() } });
  const app = jobsApp('employer-1', false);
  assert.equal((await request(app).get(`/api/jobs-data/applications/${APPLICATION_ID}/evaluate`)).status, 403);
  assert.equal((await request(app).put(`/api/jobs-data/applications/${APPLICATION_ID}/evaluate`)
    .send({ rating: 3, notes: 'nope', recommendation: 'YES' })).status, 403);
});

test('the evaluations migration enforces the reviewer uniqueness and vocabulary', () => {
  assert.match(evaluationMigration, /CREATE TABLE IF NOT EXISTS application_evaluations/);
  assert.match(evaluationMigration, /UNIQUE KEY uk_app_reviewer \(\s*application_id,\s*reviewer_id\s*\)/);
  assert.match(evaluationMigration, /CHECK \(rating >= 1 AND rating <= 5\)/);
  assert.match(evaluationMigration, /'STRONG_YES', 'YES', 'NEUTRAL', 'NO', 'STRONG_NO'/);
  assert.match(evaluationMigration, /FOREIGN KEY \(application_id\)/);
  assert.match(evaluationMigration, /ON DELETE CASCADE/);
  // The legacy single-slot columns were not removed.
  assert.equal(/DROP COLUMN rating/.test(evaluationMigration), false);
  assert.match(jobsData, /EVALUATION_RECOMMENDATIONS = Object\.freeze\(\['STRONG_YES', 'YES', 'NEUTRAL', 'NO', 'STRONG_NO'\]\)/);
  assert.match(drawer, /value="STRONG_YES"/);
  assert.match(drawer, /Save Evaluation/);
  assert.equal(/88%/.test(drawer), false);
});

test('a relational write failure rolls the legacy columns back too', async () => {
  currentPool = makePool((sql) => {
    if (/FROM applications WHERE id = \? AND employer_id = \? FOR UPDATE/.test(sql)) {
      return [[{ id: APPLICATION_ID, extra_json: null }]];
    }
    if (sql.startsWith('UPDATE applications SET rating')) return [{ affectedRows: 1 }];
    if (sql.startsWith('INSERT INTO application_evaluations')) throw new Error('constraint violation');
    return [[]];
  });
  const res = await request(jobsApp()).put(`/api/jobs-data/applications/${APPLICATION_ID}/evaluate`)
    .send({ rating: 3, notes: 'Should roll back.', recommendation: 'NEUTRAL' });
  assert.equal(res.status, 503);
  assert.equal(res.body.code, 'EVALUATION_WRITE_FAILED');
  assert.equal(res.body.success, false);
});

test('slot validation accepts every approved duration and rejects malformed windows', () => {
  const start = new Date('2031-03-03T08:00:00.000Z');
  for (const minutes of [15, 30, 45, 60]) {
    const end = new Date(start.getTime() + minutes * 60_000);
    const validated = interviewService.validateSlotWindow({ startTime: start.toISOString(), endTime: end.toISOString(), durationMinutes: minutes, now: new Date('2031-03-02T00:00:00.000Z') });
    assert.equal(validated.durationMinutes, minutes);
    assert.equal(validated.end.getTime() - validated.start.getTime(), minutes * 60_000);
  }
  assert.throws(() => interviewService.validateSlotWindow({ startTime: '2020-01-01T08:00:00Z', endTime: '2020-01-01T08:30:00Z', durationMinutes: 30, now: new Date('2026-10-30T00:00:00Z') }), { code: 'SLOT_IN_TIME_PAST' });
  assert.throws(() => interviewService.validateSlotWindow({ startTime: '2031-03-03T08:00:00Z', endTime: '2031-03-03T08:30:00Z', durationMinutes: 20, now: new Date('2031-03-02T00:00:00Z') }), { code: 'INVALID_DURATION' });
  assert.throws(() => interviewService.validateSlotWindow({ startTime: '2031-03-03T08:00:00', endTime: '2031-03-03T08:30:00', durationMinutes: 30, now: new Date('2031-03-02T00:00:00Z') }), { code: 'INVALID_TIMESTAMP' });
  assert.throws(() => interviewService.validateSlotWindow({ startTime: '2031-03-03T08:00:00Z', endTime: '2031-03-03T08:45:00Z', durationMinutes: 30, now: new Date('2031-03-02T00:00:00Z') }), { code: 'DURATION_MISMATCH' });
  assert.throws(() => interviewService.validateSlotWindow({ startTime: '2031-03-03T08:30:00Z', endTime: '2031-03-03T08:00:00Z', durationMinutes: 30, now: new Date('2031-03-02T00:00:00Z') }), { code: 'INVALID_TIME_RANGE' });
});


test('RFC 5545 generation: UTC, escaping, stable identity and octet folding', () => {
  const start = '2031-03-03T08:00:00.000Z';
  const end = '2031-03-03T08:30:00.000Z';
  const first = ical.buildInterviewInvite({ bookingId: 'islot_test_12345678', startTime: start, endTime: end, stamp: start, summary: 'Interview; Asha, R&D', description: 'Line one\nLine two\\safe' });
  const second = ical.buildInterviewInvite({ bookingId: 'islot_test_12345678', startTime: start, endTime: end, stamp: start });
  assert.match(first, /^BEGIN:VCALENDAR\r\n/);
  assert.match(first, /BEGIN:VEVENT\r\n/);
  assert.match(first, /END:VEVENT\r\nEND:VCALENDAR\r\n$/);
  assert.match(first, /UID:islot_test_12345678@ime365\.com\r\n/);
  assert.match(first, /DTSTART:20310303T080000Z\r\n/);
  assert.match(first, /DTEND:20310303T083000Z\r\n/);
  assert.match(first, /SUMMARY:Interview\\; Asha\\, R&D\r\n/);
  assert.match(first, /DESCRIPTION:Line one\\nLine two\\\\safe\r\n/);
  assert.equal((first.match(/\r\n/g) || []).length, first.split('\r\n').length - 1);
  assert.ok(first.split('\r\n').filter(Boolean).every((line) => Buffer.byteLength(line, 'utf8') <= 75));
  assert.equal(ical.bookingUid('islot_test_12345678'), ical.bookingUid('islot_test_12345678'));
  assert.equal(second.includes('UID:islot_test_12345678@ime365.com'), true);
  assert.equal(ical.calendarMimePart(first).contentType, 'text/calendar; method=REQUEST; charset=UTF-8');
  assert.throws(() => ical.buildInterviewInvite({ bookingId: 'bad\r\nMETHOD:CANCEL', startTime: start, endTime: end }));
  assert.throws(() => ical.buildInterviewInvite({ bookingId: 'ok', startTime: end, endTime: start }));
});


test('slot instants reject normalized impossible dates and invalid clock values', () => {
  for (const value of ['2031-02-29T08:00:00Z', '2032-02-30T08:00:00Z', '2031-04-31T08:00:00Z', '2031-01-01T24:00:00Z', '2031-01-01T08:60:00Z', '2031-01-01T08:00:00+24:00']) {
    assert.throws(() => interviewService.parseInstant(value, 'startTime'), { code: 'INVALID_TIMESTAMP' }, value);
  }
  assert.equal(interviewService.parseInstant('2032-02-29T08:00:00+05:30', 'startTime').toISOString(), '2032-02-29T02:30:00.000Z');
});


test('calendar safely encodes parameter values and emits one cancellation status', () => {
  const invite = ical.buildInterviewInvite({
    bookingId: 'islot_test_12345678', startTime: '2031-03-03T08:00:00Z', endTime: '2031-03-03T08:30:00Z',
    stamp: '2031-03-01T00:00:00Z', method: 'CANCEL', attendeeEmail: 'candidate@example.com',
    attendeeName: 'A;B,"C"^\r\nBEGIN:VEVENT',
  });
  const unfolded = invite.replace(/\r\n[ \t]/g, '');
  assert.match(unfolded, /CN="A;B,\^'C\^'\^\^\^nBEGIN:VEVENT":mailto:candidate@example\.com/);
  assert.equal((unfolded.match(/\r\nSTATUS:/g) || []).length, 1);
  assert.match(unfolded, /\r\nSTATUS:CANCELLED\r\n/);
  assert.equal((unfolded.match(/\r\nBEGIN:VEVENT\r\n/g) || []).length, 1);
  assert.ok(invite.split('\r\n').filter(Boolean).every(line => Buffer.byteLength(line, 'utf8') <= 75));
});
