'use strict';

/**
 * Employer interview scheduling (FP-A15 / DISC-028).
 *
 * DATABASE-BACKED: slots, bookings and the transactional outbox are asserted
 * against the real MariaDB schema (migration 031), including its CHECK
 * constraints and `uq_interview_slot_employer_start` unique key. The API is
 * exercised over HTTP with supertest against the real router and service.
 *
 * The ONLY test double is the SMTP transport (`services/mailer.js`
 * `setSendMailForTests`), which is the genuine external boundary. The delivery
 * pipeline itself — outbox claim, template rendering, iCalendar MIME part,
 * DELIVERED acknowledgement — runs unmodified.
 */

process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');

const fixtures = require('./helpers/mandate11a');
const { mariaTest, bearer, IDENTITIES, newId } = fixtures;

if (fixtures.isMariaEnabled()) fixtures.requireDisposableTarget();

const request = require('supertest');
const app = require('../index');
const { getPool } = require('../database/mysql');
const mailer = require('../services/mailer');
const outbox = require('../services/notificationOutbox');

fixtures.installIdentities();

const SLOT_PREFIX = 'interview-slot-booked:';

let pool;
const sent = [];

const applications = {
  primary: newId('app'),
  second: newId('app'),
  foreign: newId('app'),
  ineligible: newId('app'),
  noemail: newId('app'),
  noEmailsApplicant: 'm11a-interview-noemail-1',
};

const slots = { base: null, overlap: null, booked: null, deletable: null };

function iso(hoursFromBase, minutes = 0) {
  // Fixed future window so the suite never depends on "now" being early.
  const base = Date.UTC(2031, 2, 3, 8, 0, 0);
  return new Date(base + hoursFromBase * 3_600_000 + minutes * 60_000).toISOString();
}

function createSlot(token, body) {
  return request(app).post('/api/employer/interviews/slots').set(bearer(token)).send(body);
}

function listSlots(token, query = '') {
  return request(app).get(`/api/employer/interviews/slots${query}`).set(bearer(token));
}

function bookSlot(token, slotId, applicationId) {
  return request(app).post(`/api/employer/interviews/slots/${slotId}/book`).set(bearer(token)).send({ applicationId });
}

function deleteSlot(token, slotId) {
  return request(app).delete(`/api/employer/interviews/slots/${slotId}`).set(bearer(token));
}

/** Park every other suite's due rows so a batch only sees this suite's messages. */
async function isolateOutbox() {
  await pool.query(
    `UPDATE notification_outbox
        SET next_attempt_at = ?
      WHERE event_id NOT LIKE ?
        AND state IN ('NOTIFICATION_QUEUED', 'RETRYING', 'DELIVERY_ATTEMPTED')
        AND next_attempt_at <= ?`,
    [Date.now() + 24 * 3_600_000, `${SLOT_PREFIX}%`, Date.now()]
  );
}

test.before(async () => {
  if (!fixtures.isMariaEnabled()) return;
  pool = getPool();
  await fixtures.seedUsers(pool);
  // A user with no usable address: proves an invitation is only ever sent to a
  // persisted, valid address (never to a request-supplied one).
  await fixtures.seedUsers(pool, [{ uid: applications.noEmailsApplicant, email: '', role: 'USER' }]);

  mailer.setSendMailForTests(async message => {
    sent.push(message);
    return { accepted: [message.to], rejected: [], response: '250 2.0.0 queued as m11a-interview' };
  });

  await pool.query(`DELETE FROM interview_slots WHERE employer_id IN (?, ?)`, [IDENTITIES.employer.uid, IDENTITIES.employer2.uid]);
  await pool.query('DELETE FROM applications WHERE id IN (?, ?, ?, ?, ?)', Object.values(applications).filter(value => value.startsWith('app_')));
  await pool.query('DELETE FROM notification_outbox WHERE event_id LIKE ?', [`${SLOT_PREFIX}%`]);

  await fixtures.seedApplication(pool, {
    applicationId: applications.primary, employerId: IDENTITIES.employer.uid,
    applicantId: IDENTITIES.candidate.uid, applicantEmail: IDENTITIES.candidate.email, status: 'pending',
  });
  await fixtures.seedApplication(pool, {
    applicationId: applications.second, employerId: IDENTITIES.employer.uid,
    applicantId: IDENTITIES.candidate.uid, applicantEmail: IDENTITIES.candidate.email, status: 'interview',
  });
  await fixtures.seedApplication(pool, {
    applicationId: applications.foreign, employerId: IDENTITIES.employer2.uid,
    applicantId: IDENTITIES.candidate.uid, applicantEmail: IDENTITIES.candidate.email, status: 'pending',
  });
  await fixtures.seedApplication(pool, {
    applicationId: applications.ineligible, employerId: IDENTITIES.employer.uid,
    applicantId: IDENTITIES.candidate.uid, applicantEmail: IDENTITIES.candidate.email, status: 'hired',
  });
  await fixtures.seedApplication(pool, {
    applicationId: applications.noemail, employerId: IDENTITIES.employer.uid,
    applicantId: applications.noEmailsApplicant, applicantEmail: null, status: 'pending',
  });
});

test.after(async () => {
  mailer.resetSendMailForTests();
  if (!fixtures.isMariaEnabled()) return;
  await pool.query('DELETE FROM notification_outbox WHERE event_id LIKE ?', [`${SLOT_PREFIX}%`]).catch(() => {});
  await pool.query('DELETE FROM applications WHERE id IN (?, ?, ?, ?, ?)', Object.values(applications).filter(value => value.startsWith('app_'))).catch(() => {});
  await pool.query('DELETE FROM interview_slots WHERE employer_id IN (?, ?)', [IDENTITIES.employer.uid, IDENTITIES.employer2.uid]).catch(() => {});
  await pool.query('DELETE FROM users WHERE id = ?', [applications.noEmailsApplicant]).catch(() => {});
  await pool.end().catch(() => {});
});

// ─── Authentication / authorization ────────────────────────────────────────
mariaTest('slot management requires an approved employer with a verified email', async () => {
  const anonymous = await request(app).get('/api/employer/interviews/slots');
  assert.equal(anonymous.status, 401);

  const candidate = await listSlots('candidate');
  assert.equal(candidate.status, 403);
  assert.equal(candidate.body.error.code, 'EMPLOYER_ACCESS_REQUIRED');

  const candidateCreate = await createSlot('candidate', {
    startTime: iso(100), endTime: iso(100, 30), durationMinutes: 30,
  });
  assert.equal(candidateCreate.status, 403);
  assert.equal(candidateCreate.body.error.code, 'EMPLOYER_ACCESS_REQUIRED');
});

// ─── Slot creation validation ──────────────────────────────────────────────
mariaTest('slot creation validates duration, interval, timezone awareness and future start', async () => {
  const cases = [
    [{ startTime: iso(200), endTime: iso(200, 20), durationMinutes: 20 }, 'INVALID_DURATION'],
    [{ startTime: iso(200), endTime: iso(200, 20), durationMinutes: 30 }, 'DURATION_MISMATCH'],
    [{ startTime: iso(200), endTime: iso(200, 30), durationMinutes: 15 }, 'DURATION_MISMATCH'],
    [{ startTime: '2031-03-03T08:00:00', endTime: '2031-03-03T08:30:00', durationMinutes: 30 }, 'INVALID_TIMESTAMP'],
    [{ startTime: iso(200), endTime: iso(200), durationMinutes: 30 }, 'INVALID_TIME_RANGE'],
    [{ startTime: '2020-01-01T09:00:00Z', endTime: '2020-01-01T09:30:00Z', durationMinutes: 30 }, 'SLOT_IN_TIME_PAST'],
    [{ startTime: iso(200), endTime: iso(200, 600), durationMinutes: 60 }, 'INVALID_TIME_RANGE'],
  ];
  for (const [body, code] of cases) {
    const response = await createSlot('employer', body);
    assert.equal(response.status, 400, `${JSON.stringify(body)} -> ${response.status}`);
    assert.equal(response.body.error.code, code, `${JSON.stringify(body)} -> ${response.body.error.code}`);
  }

  const created = await createSlot('employer', { startTime: iso(0), endTime: iso(0, 45), durationMinutes: 45 });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.success, true);
  assert.equal(created.body.slot.durationMinutes, 45);
  assert.equal(created.body.slot.isBooked, false);
  assert.equal(created.body.slot.employerId, IDENTITIES.employer.uid);
  slots.base = created.body.slot.id;

  const [rows] = await pool.query('SELECT * FROM interview_slots WHERE id = ?', [slots.base]);
  assert.equal(rows.length, 1, 'the slot must be persisted');
  assert.equal(Number(rows[0].duration_minutes), 45);
  assert.equal(Number(rows[0].is_booked), 0);
  assert.equal(new Date(rows[0].start_time).toISOString(), iso(0));
});

mariaTest('overlapping slots are refused while adjacent slots are allowed', async () => {
  const overlapping = await createSlot('employer', { startTime: iso(0, 15), endTime: iso(0, 45), durationMinutes: 30 });
  assert.equal(overlapping.status, 409, JSON.stringify(overlapping.body));
  assert.equal(overlapping.body.error.code, 'SLOT_OVERLAP');

  const contained = await createSlot('employer', { startTime: iso(0, 5), endTime: iso(0, 20), durationMinutes: 15 });
  assert.equal(contained.status, 409);
  assert.equal(contained.body.error.code, 'SLOT_OVERLAP');

  const adjacent = await createSlot('employer', { startTime: iso(0, 45), endTime: iso(1, 15), durationMinutes: 30 });
  assert.equal(adjacent.status, 201, JSON.stringify(adjacent.body));

  // Another employer may use the same wall-clock time: overlap is per employer.
  const other = await createSlot('employer2', { startTime: iso(0), endTime: iso(0, 30), durationMinutes: 30 });
  assert.equal(other.status, 201, JSON.stringify(other.body));

  // The database, not just the application check, refuses impossible rows.
  await assert.rejects(
    () => pool.query(
      `INSERT INTO interview_slots (id, employer_id, start_time, end_time, duration_minutes, is_booked)
       VALUES (?, ?, ?, ?, 20, FALSE)`,
      [newId('islot'), IDENTITIES.employer.uid, new Date(iso(300)), new Date(iso(300, 20))]
    ),
    /chk_interview_slot_duration|Check constraint/i
  );
  await assert.rejects(
    () => pool.query(
      `INSERT INTO interview_slots (id, employer_id, start_time, end_time, duration_minutes, is_booked)
       VALUES (?, ?, ?, ?, 30, FALSE)`,
      [newId('islot'), IDENTITIES.employer.uid, new Date(iso(400, 30)), new Date(iso(400))]
    ),
    /chk_interview_slot_interval|Check constraint/i
  );
  await assert.rejects(
    () => pool.query(
      `INSERT INTO interview_slots (id, employer_id, start_time, end_time, duration_minutes, is_booked)
       VALUES (?, ?, ?, ?, 30, FALSE)`,
      [newId('islot'), IDENTITIES.employer.uid, new Date(iso(0)), new Date(iso(0, 30))]
    ),
    /ER_DUP_ENTRY|Duplicate entry/i
  );
});

// ─── Listing and date windows ──────────────────────────────────────────────
mariaTest('GET /slots is scoped to the caller and honours a bounded date window', async () => {
  const own = await listSlots('employer');
  assert.equal(own.status, 200);
  assert.equal(own.body.success, true);
  assert.ok(own.body.slots.length >= 2);
  assert.equal(own.body.slots.every(slot => slot.employerId === IDENTITIES.employer.uid), true);

  const scoped = await listSlots('employer2');
  assert.equal(scoped.status, 200);
  assert.equal(scoped.body.slots.every(slot => slot.employerId === IDENTITIES.employer2.uid), true);
  assert.equal(scoped.body.slots.some(slot => slot.id === slots.base), false, "another employer's slot must not appear");

  const windowed = await listSlots('employer', `?startDate=${encodeURIComponent(iso(0, 30))}&endDate=${encodeURIComponent(iso(2))}`);
  assert.equal(windowed.status, 200);
  assert.ok(windowed.body.slots.length >= 1);
  const outside = await listSlots('employer', `?startDate=${encodeURIComponent(iso(500))}&endDate=${encodeURIComponent(iso(600))}`);
  assert.equal(outside.status, 200);
  assert.deepEqual(outside.body.slots, []);

  const invalid = await listSlots('employer', `?startDate=${encodeURIComponent(iso(3))}&endDate=${encodeURIComponent(iso(2))}`);
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.error.code, 'INVALID_DATE_RANGE');
});

// ─── Deletion semantics ────────────────────────────────────────────────────
mariaTest('an unbooked slot can be deleted and is unreachable to another employer', async () => {
  const created = await createSlot('employer', { startTime: iso(10), endTime: iso(10, 15), durationMinutes: 15 });
  assert.equal(created.status, 201);
  const slotId = created.body.slot.id;

  const foreign = await deleteSlot('employer2', slotId);
  assert.equal(foreign.status, 404, 'another employer must not be able to delete the slot');

  const removed = await deleteSlot('employer', slotId);
  assert.equal(removed.status, 200, JSON.stringify(removed.body));
  assert.equal(removed.body.deleted, true);

  const [rows] = await pool.query('SELECT id FROM interview_slots WHERE id = ?', [slotId]);
  assert.equal(rows.length, 0);

  const again = await deleteSlot('employer', slotId);
  assert.equal(again.status, 404);
  assert.equal(again.body.error.code, 'SLOT_NOT_FOUND');
});

// ─── Booking rules ────────────────────────────────────────────────────────
mariaTest('booking requires a slot, an owned application and an eligible status', async () => {
  const created = await createSlot('employer', { startTime: iso(20), endTime: iso(20, 30), durationMinutes: 30 });
  const slotId = created.body.slot.id;
  slots.deletable = slotId;

  const missing = await bookSlot('candidate', slotId, '');
  assert.equal(missing.status, 400);
  assert.equal(missing.body.error.code, 'APPLICATION_ID_REQUIRED');

  const unknownSlot = await bookSlot('candidate', 'islot_doesnotexist1234', applications.primary);
  assert.equal(unknownSlot.status, 404);
  assert.equal(unknownSlot.body.error.code, 'SLOT_NOT_FOUND');

  const foreignApplication = await bookSlot('candidate', slotId, applications.foreign);
  assert.equal(foreignApplication.status, 404);
  assert.equal(foreignApplication.body.error.code, 'APPLICATION_NOT_FOUND');

  const ineligible = await bookSlot('candidate', slotId, applications.ineligible);
  assert.equal(ineligible.status, 409);
  assert.equal(ineligible.body.error.code, 'APPLICATION_NOT_ELIGIBLE');

  const outsider = await bookSlot('other', slotId, applications.primary);
  assert.equal(outsider.status, 403);
  assert.equal(outsider.body.error.code, 'APPLICATION_FORBIDDEN');

  const [rows] = await pool.query('SELECT is_booked FROM interview_slots WHERE id = ?', [slotId]);
  assert.equal(Number(rows[0].is_booked), 0, 'failed bookings must not reserve the slot');
});

mariaTest('booking is atomic: exactly one concurrent caller can win the slot', async () => {
  const created = await createSlot('employer', { startTime: iso(30), endTime: iso(30, 60), durationMinutes: 60 });
  const slotId = created.body.slot.id;
  slots.booked = slotId;

  const [first, second] = await Promise.all([
    bookSlot('candidate', slotId, applications.primary),
    bookSlot('employer', slotId, applications.second),
  ]);
  const statuses = [first.status, second.status].sort();
  assert.deepEqual(statuses, [201, 409], `expected one winner and one conflict, got ${statuses.join(',')}`);
  const loser = first.status === 409 ? first : second;
  assert.equal(loser.body.error.code, 'SLOT_ALREADY_BOOKED');

  const winner = first.status === 201 ? applications.primary : applications.second;
  const [rows] = await pool.query('SELECT is_booked, booked_by_app_id FROM interview_slots WHERE id = ?', [slotId]);
  assert.equal(Number(rows[0].is_booked), 1);
  assert.equal(rows[0].booked_by_app_id, winner);

  const bookedDelete = await deleteSlot('employer', slotId);
  assert.equal(bookedDelete.status, 409, 'a booked slot must not be deletable');
  assert.equal(bookedDelete.body.error.code, 'SLOT_BOOKED');
  const [afterDelete] = await pool.query('SELECT is_booked FROM interview_slots WHERE id = ?', [slotId]);
  assert.equal(Number(afterDelete[0].is_booked), 1, 'the refused delete must not remove the booking');
});

// ─── Invitation delivery ──────────────────────────────────────────────────
mariaTest('the booking queues an RFC 5545 invitation and the outbox delivers it via the mailer', async () => {
  const created = await createSlot('employer', { startTime: iso(40), endTime: iso(40, 30), durationMinutes: 30 });
  const slotId = created.body.slot.id;

  const booked = await bookSlot('candidate', slotId, applications.primary);
  assert.equal(booked.status, 201, JSON.stringify(booked.body));
  assert.equal(booked.body.booking.isBooked, true);
  assert.equal(booked.body.booking.applicationId, applications.primary);
  assert.equal(booked.body.invitations.candidate.recipient, IDENTITIES.candidate.email);
  assert.equal(booked.body.mime.contentType, 'text/calendar; method=REQUEST; charset=UTF-8');
  assert.equal(booked.body.mime.content.includes('\r\n'), true);
  assert.match(booked.body.mime.content, /^BEGIN:VCALENDAR\r\n/);
  assert.match(booked.body.mime.content, /METHOD:REQUEST\r\n/);
  assert.match(booked.body.mime.content, /DTSTART:2031\d{4}T\d{6}Z\r\n/);
  assert.match(booked.body.mime.content, new RegExp(`UID:${slotId}@ime365\\.com`));
  assert.equal(booked.body.mime.content.includes('\n\n'), false, 'iCalendar lines use CRLF only');

  const [queued] = await pool.query(
    `SELECT id, recipient, state, template_type, metadata FROM notification_outbox
      WHERE event_id = ?`,
    [`${SLOT_PREFIX}${slotId}:candidate`]
  );
  assert.equal(queued.length, 1, 'the invitation must be queued in the same transaction as the booking');
  assert.equal(queued[0].recipient, IDENTITIES.candidate.email);
  assert.equal(queued[0].template_type, 'interview-invitation');
  const metadata = typeof queued[0].metadata === 'string' ? JSON.parse(queued[0].metadata) : queued[0].metadata;
  assert.match(metadata.calendar, /^BEGIN:VCALENDAR\r\n/);
  assert.equal(metadata.calendarMethod, 'REQUEST');

  await isolateOutbox();
  sent.length = 0;
  const batch = await outbox.processPendingOutboxMessages({ pool, batchSize: 25 });
  assert.ok(batch.processed >= 1, 'the worker must claim the queued invitation');

  const candidateMail = sent.find(message => message.to === IDENTITIES.candidate.email);
  assert.ok(candidateMail, `the candidate must receive mail, got ${sent.map(message => message.to).join(',')}`);
  assert.equal(Array.isArray(candidateMail.alternatives), true);
  assert.equal(candidateMail.alternatives[0].contentType, 'text/calendar; method=REQUEST; charset=UTF-8');
  assert.match(candidateMail.alternatives[0].content, /^BEGIN:VCALENDAR\r\n/);
  assert.match(candidateMail.alternatives[0].content, /ATTENDEE;ROLE=REQ-PARTICIPANT/);
  assert.match(candidateMail.alternatives[0].content, new RegExp(`mailto:${IDENTITIES.candidate.email}`));
  assert.ok(candidateMail.subject.length > 0);
  assert.ok(candidateMail.text.length > 0, 'every message carries a plain-text alternative');

  const [delivered] = await pool.query(
    'SELECT state, attempt_count, provider_accepted FROM notification_outbox WHERE event_id = ?',
    [`${SLOT_PREFIX}${slotId}:candidate`]
  );
  assert.equal(delivered[0].state, 'DELIVERED');
  assert.equal(Number(delivered[0].attempt_count), 1);
  assert.equal(Number(delivered[0].provider_accepted), 1);
});

mariaTest('invitations are addressed from persisted data only, never from the request', async () => {
  const created = await createSlot('employer', { startTime: iso(50), endTime: iso(50, 30), durationMinutes: 30 });
  const slotId = created.body.slot.id;

  // A request-supplied recipient must be ignored; the persisted application and
  // directory records decide the address.
  const spoofed = await request(app)
    .post(`/api/employer/interviews/slots/${slotId}/book`)
    .set(bearer('employer'))
    .send({ applicationId: applications.primary, email: 'attacker@evil.test', recipient: 'attacker@evil.test', to: 'attacker@evil.test' });
  assert.equal(spoofed.status, 201, JSON.stringify(spoofed.body));
  assert.equal(spoofed.body.invitations.candidate.recipient, IDENTITIES.candidate.email);

  await isolateOutbox();
  sent.length = 0;
  await outbox.processPendingOutboxMessages({ pool, batchSize: 25 });
  assert.equal(sent.some(message => JSON.stringify(message).includes('attacker@evil.test')), false);

  // An application with no persisted, valid address still books, but no calendar
  // invitation is invented for it.
  const noEmailSlot = await createSlot('employer', { startTime: iso(60), endTime: iso(60, 15), durationMinutes: 15 });
  const booked = await bookSlot('employer', noEmailSlot.body.slot.id, applications.noemail);
  assert.equal(booked.status, 201, JSON.stringify(booked.body));
  assert.equal(booked.body.invitations.candidate, null);
  assert.equal(booked.body.invitations.reason, 'CANDIDATE_EMAIL_UNAVAILABLE');
  assert.equal(booked.body.calendar, null);
  const [queued] = await pool.query('SELECT id FROM notification_outbox WHERE event_id = ?', [`${SLOT_PREFIX}${noEmailSlot.body.slot.id}:candidate`]);
  assert.equal(queued.length, 0, 'no invitation may be queued without a persisted address');
});

mariaTest('the calendar download is a text/calendar attachment for the owning employer', async () => {
  const created = await createSlot('employer', { startTime: iso(70), endTime: iso(70, 30), durationMinutes: 30 });
  const slotId = created.body.slot.id;

  const notBooked = await request(app).get(`/api/employer/interviews/slots/${slotId}/calendar`).set(bearer('employer'));
  assert.equal(notBooked.status, 409);
  assert.equal(notBooked.body.error.code, 'SLOT_NOT_BOOKED');

  const booked = await bookSlot('candidate', slotId, applications.second);
  assert.equal(booked.status, 201, JSON.stringify(booked.body));

  const foreign = await request(app).get(`/api/employer/interviews/slots/${slotId}/calendar`).set(bearer('employer2'));
  assert.equal(foreign.status, 404);

  const calendar = await request(app).get(`/api/employer/interviews/slots/${slotId}/calendar`).set(bearer('employer'));
  assert.equal(calendar.status, 200);
  assert.match(String(calendar.headers['content-type']), /^text\/calendar/);
  assert.match(String(calendar.headers['content-disposition']), /attachment/);
  assert.match(calendar.text, /^BEGIN:VCALENDAR\r\n/);
  assert.match(calendar.text, /METHOD:REQUEST/);
  assert.match(calendar.text, new RegExp(`X-IME365-BOOKING-ID:${slotId}`));
});
