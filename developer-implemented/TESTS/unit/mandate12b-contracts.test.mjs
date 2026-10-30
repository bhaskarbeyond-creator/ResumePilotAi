import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = path.resolve(import.meta.dirname, '../../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const require = createRequire(import.meta.url);
const ical = require(path.join(root, 'backend/services/interviewIcal.js'));
const interviewService = require(path.join(root, 'backend/services/interviewScheduling.js'));
const portal = read('frontend/src/pages/employer/portal.tsx');
const drawer = read('frontend/src/components/employer/CandidateReviewDrawer.tsx');
const jobsData = read('backend/routes/jobsData.js');
const scheduling = read('backend/services/interviewScheduling.js');
const interviewRoutes = read('backend/routes/interviews.js');
const messages = read('backend/index.js');
const migration = read('backend/database/migrations/031_interview_slots.sql');

test('employer portal mock eradication and request wiring', () => {
  for (const name of ['Sarah Jenkins', 'David Chen', 'Emily Watson']) assert.equal(portal.includes(name), false, `${name} must not be present in production portal`);
  assert.equal(portal.includes('candidateThreads'), false);
  assert.equal(portal.includes('Yesterday'), false);
  assert.equal(portal.includes('10:14 AM'), false);
  assert.equal(portal.includes('https://calendly.com/talent-team/interview'), false);
  assert.match(portal, /\/messages\/conversations/);
  assert.match(portal, /\/messages\/send/);
  assert.match(portal, /lastReadMessageId:\s*newest\.id/);
  assert.match(portal, /No Active Candidate Conversations/);
  assert.match(portal, /setConversations\(\(previous/);
  assert.match(portal, /setMessagesByConversation/);
  assert.match(portal, /aria-busy=\{messageSending\}/);
  assert.match(portal, /No settings were saved/);
  assert.match(portal, /Values below are unsaved/);
});

test('read cursor backend reality is explicitly characterized', () => {
  const readRoute = messages.slice(messages.indexOf("app.post('/api/messages/conversations/:conversationId/read'"), messages.indexOf("app.post('/api/messages/conversations',"));
  assert.match(readRoute, /conversation_participants WHERE conversation_id = \? AND user_id = \?/);
  assert.match(readRoute, /GREATEST\(COALESCE\(last_read_message_id, ''\), \?\)/);
  // The shared backend route is outside this implementation's authorized boundary.
  // This assertion documents the identified defect: it does not validate that the
  // supplied message ID belongs to this conversation before moving the cursor.
  assert.equal(/SELECT\s+1\s+FROM\s+conversation_messages\s+WHERE\s+id\s*=\s*\?\s+AND\s+conversation_id\s*=\s*\?/i.test(readRoute), false);
});

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

test('scorecard route is relational, validated and employer-scoped', () => {
  assert.match(jobsData, /router\.get\('\/applications\/:id\/evaluate', requireEmployer/);
  assert.match(jobsData, /router\.put\('\/applications\/:id\/evaluate', requireEmployer/);
  assert.match(jobsData, /WHERE id = \? AND employer_id = \?/);
  assert.match(jobsData, /rating < 1 \|\| rating > 5/);
  assert.match(jobsData, /if \(!notes \|\| notes\.length > 1000\)/);
  assert.match(jobsData, /\['Move to Offer', 'Reject', 'Hold'\]/);
  assert.match(jobsData, /FOR UPDATE/);
  assert.match(jobsData, /SET rating = \?, notes = \?, extra_json = \?/);
  assert.match(jobsData, /evaluationRecommendation/);
  assert.match(drawer, /\/jobs-data\/applications\//);
  assert.match(drawer, /Save Evaluation/);
  assert.match(drawer, /Evaluation could not be saved/);
  assert.equal(/88%/.test(drawer), false);
  // Existing baseline schema has no application_evaluations table; this is a
  // deliberate scope/schema limitation and evaluation fields remain on applications.
  assert.equal(/CREATE TABLE[^;]*application_evaluations/i.test(read('backend/database/migrations/001_baseline.sql')), false);
});

test('settings and shared read route scope blockers are not disguised as success', () => {
  assert.equal(/app\.patch\('\/api\/employer\/settings'/.test(messages), false);
  assert.equal(/No settings were saved/.test(portal), true);
  assert.equal(/setTimeout\(\(\) => setSettingsSaved/.test(portal), false);
  assert.equal(/https:\/\/calendly\.com/.test(portal), false);
  assert.equal(/setTimeout\(\(\) => setSettingsSaved/.test(portal), false);
  assert.equal(/88%/.test(drawer), false);
});
