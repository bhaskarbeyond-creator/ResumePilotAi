'use strict';

/**
 * Employer interview scheduling API — mounted at `/api/employer/interviews`.
 *
 *   GET    /slots            list the caller's own slots (validated date window)
 *   POST   /slots            create a slot (15/30/45/60 minutes, future only)
 *   DELETE /slots/:id        delete an unbooked slot (409 when booked)
 *   POST   /slots/:id/book   reserve a slot for one application (atomic)
 *   GET    /slots/:id/calendar  the RFC 5545 invitation for a booked slot
 *
 * AUTHENTICATION: the global `/api` boundary already resolved the bearer token
 * (and rejects unauthenticated callers with 401). This router additionally
 * requires a verified email for human principals, matching the rest of
 * `/api/employer/*`, and an approved employer claim for slot management.
 * Candidates never need the employer claim to book their own interview.
 */

const express = require('express');
const scheduling = require('../services/interviewScheduling');
const { buildInterviewInvite } = require('../services/interviewIcal');

const router = express.Router();

const VALID_SLOT_ID = /^islot_[A-Za-z0-9_-]{8,56}$/;

function isEmployerAccount(req) {
  return req.user?.claims?.employer === true;
}

function requestId(res) {
  return res.locals?.requestId;
}

function failure(res, error, fallback) {
  const status = Number(error?.status) >= 400 && Number(error?.status) < 600 ? Number(error.status) : 500;
  if (status >= 500) {
    // Never leak driver/stack detail on an unexpected failure.
    console.error('[interviews]', error?.code || '', error?.message || error);
  }
  const declared = typeof error?.code === 'string' && /^[A-Z][A-Z0-9_]{2,48}$/.test(error.code) ? error.code : null;
  return res.status(status).json({
    success: false,
    error: {
      // A 5xx never echoes a raw driver code such as ER_LOCK_WAIT_TIMEOUT.
      code: status < 500 ? (declared || 'INTERVIEW_REQUEST_REJECTED') : 'INTERVIEW_SCHEDULING_FAILED',
      message: status >= 500 ? fallback || 'Interview scheduling is temporarily unavailable.' : error.message,
      requestId: requestId(res),
    },
  });
}

router.use((req, res, next) => {
  if (!req.user?.uid) {
    return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required', requestId: requestId(res) } });
  }
  if (!req.user.emailVerified) {
    return res.status(403).json({ error: { code: 'EMAIL_VERIFICATION_REQUIRED', message: 'A verified email address is required', requestId: requestId(res) } });
  }
  return next();
});

function requireEmployer(req, res, next) {
  if (!isEmployerAccount(req)) {
    return res.status(403).json({ success: false, error: { code: 'EMPLOYER_ACCESS_REQUIRED', message: 'Approved employer access is required.', requestId: requestId(res) } });
  }
  return next();
}

// GET /slots — the employer's own schedule only. Another employer's slots are
// unreachable: the query is scoped by employer_id = the authenticated uid.
router.get('/slots', requireEmployer, async (req, res) => {
  try {
    const slots = await scheduling.listSlots({
      employerId: req.user.uid,
      startDate: req.query?.startDate,
      endDate: req.query?.endDate,
    });
    return res.json({ success: true, slots });
  } catch (error) {
    return failure(res, error, 'Interview slots are temporarily unavailable.');
  }
});

router.post('/slots', requireEmployer, express.json({ limit: '16kb' }), async (req, res) => {
  try {
    const slot = await scheduling.createSlot({
      employerId: req.user.uid,
      startTime: req.body?.startTime,
      endTime: req.body?.endTime,
      durationMinutes: req.body?.durationMinutes,
    });
    return res.status(201).json({ success: true, slot });
  } catch (error) {
    return failure(res, error, 'The interview slot could not be created.');
  }
});

router.delete('/slots/:id', requireEmployer, async (req, res) => {
  try {
    if (!VALID_SLOT_ID.test(String(req.params.id || ''))) {
      return res.status(404).json({ success: false, error: { code: 'SLOT_NOT_FOUND', message: 'Interview slot not found.', requestId: requestId(res) } });
    }
    await scheduling.deleteSlot({ employerId: req.user.uid, slotId: req.params.id });
    return res.json({ success: true, deleted: true, slotId: req.params.id });
  } catch (error) {
    return failure(res, error, 'The interview slot could not be deleted.');
  }
});

// POST /slots/:id/book — the candidate's applicationId identifies what the
// interview is for. The caller must either own the application or own the slot.
router.post('/slots/:id/book', express.json({ limit: '16kb' }), async (req, res) => {
  try {
    const result = await scheduling.bookSlot({
      slotId: req.params.id,
      applicationId: String(req.body?.applicationId || '').trim(),
      actorUid: req.user.uid,
    });
    return res.status(201).json({
      success: true,
      booking: result.booking,
      invitations: result.invitations,
      // The calendar is returned so the booking client can offer an .ics
      // download; delivery itself is owned by the durable outbox.
      calendar: result.calendar,
      mime: result.mime,
    });
  } catch (error) {
    return failure(res, error, 'The interview slot could not be booked.');
  }
});

// GET /slots/:id/calendar — the same stable event for the employer who owns the
// slot (candidate delivery is handled by the outbox invitation).
router.get('/slots/:id/calendar', requireEmployer, async (req, res) => {
  try {
    const slots = await scheduling.listSlots({ employerId: req.user.uid });
    const slot = slots.find(candidate => candidate.id === String(req.params.id || ''));
    if (!slot) {
      return res.status(404).json({ success: false, error: { code: 'SLOT_NOT_FOUND', message: 'Interview slot not found.', requestId: requestId(res) } });
    }
    if (!slot.isBooked) {
      return res.status(409).json({ success: false, error: { code: 'SLOT_NOT_BOOKED', message: 'That interview slot has no booking yet.', requestId: requestId(res) } });
    }
    const calendar = buildInterviewInvite({
      bookingId: slot.id,
      startTime: slot.startTime,
      endTime: slot.endTime,
      summary: 'Interview',
      description: `Application: ${slot.applicationId || ''}`,
    });
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="interview-${slot.id}.ics"`);
    return res.send(calendar);
  } catch (error) {
    return failure(res, error, 'The calendar invitation could not be produced.');
  }
});

module.exports = { interviewsRouter: router };
