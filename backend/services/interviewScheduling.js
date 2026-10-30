'use strict';

/**
 * Employer interview scheduling (FP-A15 / DISC-028).
 *
 * PERSISTENCE: MariaDB `interview_slots` (migration 031). Every state change is
 * a single transaction; the correctness arguments are:
 *
 *   create   - the overlap probe (`start_time < :end AND end_time > :start`)
 *              runs under `FOR UPDATE` on the employer's indexed range, and the
 *              unique key `(employer_id, start_time)` is the hard backstop, so a
 *              duplicate slot cannot exist even if two requests race.
 *   book     - one conditional UPDATE (`... WHERE id = ? AND is_booked = 0`).
 *              affectedRows === 1 is the reservation. Exactly one concurrent
 *              caller can observe it; every other caller gets 409.
 *   delete   - one conditional DELETE (`... AND is_booked = 0`), followed by an
 *              existence probe to distinguish 404 from 409 without a race.
 *
 * NOTIFICATION: the calendar invitation is queued in the SAME transaction as the
 * booking (transactional outbox), so a confirmed booking never depends on SMTP
 * availability, and a mail outage cannot roll back or corrupt the booking. The
 * iCalendar payload travels in `metadata.calendar`; the outbox worker attaches it
 * as `text/calendar; method=REQUEST; charset=UTF-8`.
 */

const crypto = require('crypto');
const { getPool } = require('../database/mysql');
const { queueEmailInTransaction } = require('./notificationOutbox');
const { buildInterviewInvite, calendarMimePart, bookingUid } = require('./interviewIcal');

const SLOT_DURATIONS = Object.freeze([15, 30, 45, 60]);
const MAX_SLOT_MINUTES = 8 * 60;
const ELIGIBLE_APPLICATION_STATUSES = Object.freeze(['pending', 'interview']);
const SLOT_ID_PATTERN = /^islot_[A-Za-z0-9_-]{8,56}$/;
const APPLICATION_ID_PATTERN = /^[A-Za-z0-9:_-]{1,300}$/;
// RFC 3339 instant WITH an explicit zone. A naive local timestamp is rejected:
// the server cannot know the employer's zone, and silently assuming one would
// shift every interview by hours.
const ZONED_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

function scheduleError(code, message, status = 400, extra = {}) {
  return Object.assign(new Error(message), { code, status }, extra);
}

function parseInstant(value, field) {
  const text = String(value == null ? '' : value).trim();
  if (!ZONED_INSTANT.test(text)) {
    throw scheduleError('INVALID_TIMESTAMP', `${field} must be an ISO 8601 timestamp with an explicit timezone (for example 2026-11-02T09:00:00Z).`);
  }
  const date = new Date(text);
  if (!Number.isFinite(date.getTime())) {
    throw scheduleError('INVALID_TIMESTAMP', `${field} is not a valid instant.`);
  }
  if (date.getUTCFullYear() < 2000 || date.getUTCFullYear() > 2100) {
    throw scheduleError('INVALID_TIMESTAMP', `${field} is outside the supported scheduling range.`);
  }
  return date;
}

/**
 * Validate a slot request. Pure: no database access, so route/business
 * validation can be tested without a server.
 */
function validateSlotWindow({ startTime, endTime, durationMinutes, now = new Date() } = {}) {
  const start = parseInstant(startTime, 'startTime');
  const end = parseInstant(endTime, 'endTime');
  const duration = Number(durationMinutes);
  if (!Number.isInteger(duration) || !SLOT_DURATIONS.includes(duration)) {
    throw scheduleError('INVALID_DURATION', `durationMinutes must be one of ${SLOT_DURATIONS.join(', ')}.`);
  }
  const spanMinutes = (end.getTime() - start.getTime()) / 60_000;
  if (!(spanMinutes > 0)) {
    throw scheduleError('INVALID_TIME_RANGE', 'endTime must be after startTime.');
  }
  if (spanMinutes > MAX_SLOT_MINUTES) {
    throw scheduleError('INVALID_TIME_RANGE', `A single slot may not exceed ${MAX_SLOT_MINUTES} minutes.`);
  }
  if (Math.abs(spanMinutes - duration) > 1e-9) {
    throw scheduleError('DURATION_MISMATCH', 'durationMinutes must equal the interval between startTime and endTime.');
  }
  if (start.getTime() <= new Date(now).getTime()) {
    throw scheduleError('SLOT_IN_TIME_PAST', 'Interview slots must start in the future.');
  }
  return { start, end, durationMinutes: duration };
}

function normalizeSlotRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    employerId: row.employer_id,
    startTime: new Date(row.start_time).toISOString(),
    endTime: new Date(row.end_time).toISOString(),
    durationMinutes: Number(row.duration_minutes),
    isBooked: row.is_booked === 1 || row.is_booked === true,
    applicationId: row.booked_by_app_id || null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
  };
}

function newSlotId() {
  return `islot_${crypto.randomUUID().replace(/-/g, '').slice(0, 40)}`;
}

/** Parse and bound an optional date window for the list endpoint. */
function parseDateWindow({ startDate, endDate } = {}) {
  const parse = (value, field) => {
    if (value === undefined || value === null || value === '') return null;
    const date = parseInstant(value, field);
    return date;
  };
  const from = parse(startDate, 'startDate');
  const to = parse(endDate, 'endDate');
  if (from && to && to.getTime() <= from.getTime()) {
    throw scheduleError('INVALID_DATE_RANGE', 'endDate must be after startDate.');
  }
  return { from, to };
}

async function createSlot({ employerId, startTime, endTime, durationMinutes, now = new Date(), pool = getPool() }) {
  if (!employerId) throw scheduleError('AUTH_REQUIRED', 'Authentication is required.', 401);
  const window = validateSlotWindow({ startTime, endTime, durationMinutes, now });
  const id = newSlotId();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    // Overlap probe over the employer's indexed slot range. FOR UPDATE makes the
    // probe and the insert atomic with respect to any other slot write for the
    // same employer.
    const [conflicts] = await connection.query(
      `SELECT id, start_time, end_time FROM interview_slots
        WHERE employer_id = ? AND start_time < ? AND end_time > ?
        LIMIT 1 FOR UPDATE`,
      [employerId, window.end, window.start]
    );
    if (conflicts.length) {
      throw scheduleError('SLOT_OVERLAP', 'That time overlaps an existing interview slot.', 409);
    }
    await connection.query(
      `INSERT INTO interview_slots (id, employer_id, start_time, end_time, duration_minutes, is_booked)
       VALUES (?, ?, ?, ?, ?, FALSE)`,
      [id, employerId, window.start, window.end, window.durationMinutes]
    );
    const [rows] = await connection.query('SELECT * FROM interview_slots WHERE id = ?', [id]);
    await connection.commit();
    return normalizeSlotRow(rows[0]);
  } catch (error) {
    await connection.rollback().catch(() => {});
    if (error?.code === 'ER_DUP_ENTRY') {
      throw scheduleError('SLOT_ALREADY_EXISTS', 'A slot already exists at that start time.', 409);
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function listSlots({ employerId, startDate, endDate, pool = getPool() }) {
  if (!employerId) throw scheduleError('AUTH_REQUIRED', 'Authentication is required.', 401);
  const { from, to } = parseDateWindow({ startDate, endDate });
  const predicates = ['employer_id = ?'];
  const params = [employerId];
  if (from) { predicates.push('end_time >= ?'); params.push(from); }
  if (to) { predicates.push('start_time <= ?'); params.push(to); }
  const [rows] = await pool.query(
    `SELECT id, employer_id, start_time, end_time, duration_minutes, is_booked, booked_by_app_id, created_at
       FROM interview_slots
      WHERE ${predicates.join(' AND ')}
      ORDER BY start_time ASC, id ASC
      LIMIT 500`,
    params
  );
  return rows.map(normalizeSlotRow);
}

async function deleteSlot({ employerId, slotId, pool = getPool() }) {
  if (!employerId) throw scheduleError('AUTH_REQUIRED', 'Authentication is required.', 401);
  if (!SLOT_ID_PATTERN.test(String(slotId || ''))) {
    throw scheduleError('SLOT_NOT_FOUND', 'Interview slot not found.', 404);
  }
  const [result] = await pool.query(
    'DELETE FROM interview_slots WHERE id = ? AND employer_id = ? AND is_booked = 0',
    [slotId, employerId]
  );
  if (Number(result?.affectedRows || 0) === 1) return { deleted: true };
  // Distinguish "does not exist / not yours" (404) from "already booked" (409).
  const [rows] = await pool.query(
    'SELECT is_booked FROM interview_slots WHERE id = ? AND employer_id = ? LIMIT 1',
    [slotId, employerId]
  );
  if (!rows.length) throw scheduleError('SLOT_NOT_FOUND', 'Interview slot not found.', 404);
  throw scheduleError('SLOT_BOOKED', 'A booked interview slot cannot be deleted. Cancel the booking first.', 409);
}

function sanitizeHeaderText(value, max) {
  return String(value == null ? '' : value).replace(/[\p{Cc}\r\n]+/gu, ' ').trim().slice(0, max);
}

function candidateEmailFor(application, applicantRow) {
  const stored = String(application?.applicant_email || '').trim().toLowerCase();
  const fromDirectory = String(applicantRow?.email || '').trim().toLowerCase();
  const candidate = /^[^\s@,;<>]{1,64}@[^\s@,;<>]{1,190}$/.test(stored) ? stored : fromDirectory;
  return /^[^\s@,;<>]{1,64}@[^\s@,;<>]{1,190}$/.test(candidate) ? candidate : null;
}

/**
 * Reserve one slot for one application.
 *
 * Authorization is decided here from persisted rows only:
 *   - the caller must be the application's applicant, or the employer who owns
 *     the slot (an employer may schedule on the candidate's behalf);
 *   - the application must belong to the same employer as the slot;
 *   - the application must still be eligible (pending | interview).
 */
async function bookSlot({ slotId, applicationId, actorUid, now = new Date(), pool = getPool() }) {
  if (!actorUid) throw scheduleError('AUTH_REQUIRED', 'Authentication is required.', 401);
  if (!SLOT_ID_PATTERN.test(String(slotId || ''))) {
    throw scheduleError('SLOT_NOT_FOUND', 'Interview slot not found.', 404);
  }
  if (!APPLICATION_ID_PATTERN.test(String(applicationId || ''))) {
    throw scheduleError('APPLICATION_ID_REQUIRED', 'A valid applicationId is required.');
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [slotRows] = await connection.query(
      'SELECT * FROM interview_slots WHERE id = ? FOR UPDATE',
      [slotId]
    );
    const slot = slotRows[0];
    // A slot owned by another employer is indistinguishable from a missing slot.
    if (!slot) throw scheduleError('SLOT_NOT_FOUND', 'Interview slot not found.', 404);

    const [applicationRows] = await connection.query(
      'SELECT id, job_id, employer_id, applicant_id, applicant_name, applicant_email, status FROM applications WHERE id = ? LIMIT 1',
      [applicationId]
    );
    const application = applicationRows[0];
    if (!application || String(application.employer_id) !== String(slot.employer_id)) {
      throw scheduleError('APPLICATION_NOT_FOUND', 'Application not found for this employer.', 404);
    }
    if (new Date(slot.start_time).getTime() <= new Date(now).getTime()) {
      throw scheduleError('SLOT_IN_TIME_PAST', 'A past interview slot cannot be booked.', 409);
    }
    const isApplicant = String(application.applicant_id) === String(actorUid);
    const isSlotOwner = String(slot.employer_id) === String(actorUid);
    if (!isApplicant && !isSlotOwner) {
      throw scheduleError('APPLICATION_FORBIDDEN', 'You are not allowed to book an interview for this application.', 403);
    }
    const status = String(application.status || 'pending').toLowerCase();
    if (!ELIGIBLE_APPLICATION_STATUSES.includes(status)) {
      throw scheduleError('APPLICATION_NOT_ELIGIBLE', 'This application is not eligible for interview scheduling.', 409);
    }
    if (Number(slot.is_booked) === 1 || slot.is_booked === true) {
      throw scheduleError('SLOT_ALREADY_BOOKED', 'That interview slot is already booked.', 409);
    }

    // The reservation: exactly one concurrent caller can flip is_booked 0 -> 1.
    const [reservation] = await connection.query(
      'UPDATE interview_slots SET is_booked = 1, booked_by_app_id = ? WHERE id = ? AND is_booked = 0',
      [applicationId, slotId]
    );
    if (Number(reservation?.affectedRows || 0) !== 1) {
      throw scheduleError('SLOT_ALREADY_BOOKED', 'That interview slot is already booked.', 409);
    }

    const [people] = await connection.query(
      'SELECT id, email, displayName, firstname, lastname FROM users WHERE id IN (?, ?)',
      [application.applicant_id, slot.employer_id]
    );
    const applicantRow = people.find(person => String(person.id) === String(application.applicant_id)) || null;
    const employerRow = people.find(person => String(person.id) === String(slot.employer_id)) || null;
    const candidateEmail = candidateEmailFor(application, applicantRow);
    const employerEmail = String(employerRow?.email || '').trim().toLowerCase();
    if (!candidateEmail) {
      // The booking is still valid, but no calendar invitation can be addressed.
      await connection.commit();
      return {
        booking: {
          slotId,
          applicationId,
          employerId: slot.employer_id,
          startTime: new Date(slot.start_time).toISOString(),
          endTime: new Date(slot.end_time).toISOString(),
          durationMinutes: Number(slot.duration_minutes),
          isBooked: true,
          uid: bookingUid(slotId),
        },
        calendar: null,
        invitations: { candidate: null, employer: null, reason: 'CANDIDATE_EMAIL_UNAVAILABLE' },
      };
    }

    const candidateName = sanitizeHeaderText(
      application.applicant_name || applicantRow?.displayName
        || `${applicantRow?.firstname || ''} ${applicantRow?.lastname || ''}`.trim()
        || candidateEmail,
      120
    );
    const employerName = sanitizeHeaderText(
      employerRow?.displayName || employerEmail || 'IME365 Employer',
      120
    );
    const startIso = new Date(slot.start_time).toISOString();
    const endIso = new Date(slot.end_time).toISOString();
    const calendar = buildInterviewInvite({
      bookingId: slotId,
      startTime: startIso,
      endTime: endIso,
      summary: `Interview: ${candidateName}`,
      description: `Interview booked through IME365.\nCandidate: ${candidateName}\nEmployer: ${employerName}\nApplication: ${applicationId}`,
      location: 'Online',
      organizerEmail: /^[^\s@,;<>]{1,64}@[^\s@,;<>]{1,190}$/.test(employerEmail) ? employerEmail : null,
      attendeeEmail: candidateEmail,
      attendeeName: candidateName,
    });
    const subject = sanitizeHeaderText(`Interview confirmed — ${new Date(startIso).toUTCString()}`, 200);
    const vars = {
      candidate_name: candidateName,
      organization_name: employerName,
      interview_start: startIso,
      interview_end: endIso,
      duration_minutes: String(slot.duration_minutes),
      application_id: applicationId,
    };

    // Both parties are notified in the booking transaction: the outbox row and
    // the reservation commit together, so delivery can be retried durably.
    const candidateNotificationId = await queueEmailInTransaction(connection, {
      eventId: `interview-slot-booked:${slotId}:candidate`,
      idempotencyKey: `interview-slot-booked:${slotId}:candidate`,
      recipient: candidateEmail,
      templateType: 'interview-invitation',
      vars,
      metadata: {
        calendar,
        calendarMethod: 'REQUEST',
        customSubject: subject,
        slotId,
        applicationId,
      },
    });
    let employerNotificationId = null;
    if (/^[^\s@,;<>]{1,64}@[^\s@,;<>]{1,190}$/.test(employerEmail) && employerEmail !== candidateEmail) {
      employerNotificationId = await queueEmailInTransaction(connection, {
        eventId: `interview-slot-booked:${slotId}:employer`,
        idempotencyKey: `interview-slot-booked:${slotId}:employer`,
        recipient: employerEmail,
        templateType: 'interview-invitation',
        vars: { ...vars, candidate_name: employerName },
        metadata: {
          calendar,
          calendarMethod: 'REQUEST',
          customSubject: subject,
          slotId,
          applicationId,
        },
      });
    }

    await connection.commit();
    return {
      booking: {
        slotId,
        applicationId,
        employerId: slot.employer_id,
        startTime: startIso,
        endTime: endIso,
        durationMinutes: Number(slot.duration_minutes),
        isBooked: true,
        uid: bookingUid(slotId),
      },
      calendar,
      mime: calendarMimePart(calendar, 'REQUEST'),
      invitations: {
        candidate: { recipient: candidateEmail, notificationId: candidateNotificationId, deliveryState: 'NOTIFICATION_QUEUED' },
        employer: employerNotificationId
          ? { recipient: employerEmail, notificationId: employerNotificationId, deliveryState: 'NOTIFICATION_QUEUED' }
          : null,
      },
    };
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  ELIGIBLE_APPLICATION_STATUSES,
  MAX_SLOT_MINUTES,
  SLOT_DURATIONS,
  bookSlot,
  createSlot,
  deleteSlot,
  listSlots,
  normalizeSlotRow,
  parseDateWindow,
  parseInstant,
  scheduleError,
  validateSlotWindow,
};
