'use strict';

/**
 * RFC 5545 (iCalendar) invitation builder for employer interview bookings.
 *
 * This module is intentionally pure: it performs no I/O and no persistence, so
 * the exact bytes that a candidate receives can be asserted in tests and are
 * reproducible for the same booking (stable UID + sequence).
 *
 * What it guarantees (each point is covered by the interview test suite):
 *   - CRLF line endings only, as RFC 5545 §3.1 requires.
 *   - Content lines folded at 75 octets WITHOUT splitting a UTF-8 sequence
 *     (§3.1: a fold may only occur between characters, never inside one).
 *   - TEXT escaping for backslash, semicolon, comma and newline (§3.3.11), so a
 *     candidate-supplied name or a job title cannot inject calendar properties.
 *   - UTC instants in the basic `YYYYMMDDTHHMMSSZ` form, so no VTIMEZONE block
 *     (and therefore no DST ambiguity) is needed.
 *   - A stable UID derived from the booking identity, and a monotonically
 *     increasing SEQUENCE for updates/cancellations of the same booking.
 */

const CRLF = '\r\n';
const MAX_LINE_OCTETS = 75;

/** Escape a value for use inside an iCalendar TEXT property (RFC 5545 §3.3.11). */
function escapeIcalText(value) {
  return String(value == null ? '' : value)
    // Escape existing backslashes before turning physical newlines into the
    // single RFC 5545 TEXT newline escape; reversing these operations doubles
    // the escape and changes a line break into literal backslash-plus-n text.
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

/** Assert-safe single-line token (UID, PRODID fragments, property params). */
function safeToken(value, field, pattern) {
  const text = String(value == null ? '' : value);
  if (!pattern.test(text)) {
    throw Object.assign(new Error(`${field} is not a valid calendar token`), {
      code: 'INVALID_CALENDAR_INPUT',
      status: 400,
    });
  }
  return text;
}

const UID_PATTERN = /^[A-Za-z0-9._:@-]{1,120}$/;
const EMAIL_PATTERN = /^[^\s@,;:<>"]{1,64}@[^\s@,;:<>"]{1,190}$/;

/**
 * Fold one logical content line into <=75 octet physical lines.
 * Continuation lines start with a single space and count that space in their
 * own 75 octet budget.
 */
function foldIcalLine(line) {
  const text = String(line);
  if (Buffer.byteLength(text, 'utf8') <= MAX_LINE_OCTETS) return text;
  const out = [];
  let current = '';
  let currentBytes = 0;
  let limit = MAX_LINE_OCTETS;
  for (const char of text) {
    const charBytes = Buffer.byteLength(char, 'utf8');
    if (currentBytes + charBytes > limit) {
      out.push(current);
      current = ` ${char}`;
      currentBytes = 1 + charBytes;
      limit = MAX_LINE_OCTETS;
    } else {
      current += char;
      currentBytes += charBytes;
    }
  }
  if (current) out.push(current);
  return out.join(CRLF);
}

/** Format an instant as a UTC DATE-TIME value (`20260131T093000Z`). */
function formatIcalUtc(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw Object.assign(new Error('A valid instant is required for a calendar event'), {
      code: 'INVALID_CALENDAR_INPUT',
      status: 400,
    });
  }
  const pad = number => String(number).padStart(2, '0');
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`
    + `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

/**
 * Build a METHOD:REQUEST calendar for one interview booking.
 *
 * @param {object} params
 * @param {string} params.bookingId  stable booking identity (slot id)
 * @param {Date|string} params.startTime
 * @param {Date|string} params.endTime
 * @param {Date|string} [params.stamp]   DTSTAMP (defaults to now)
 * @param {string} params.summary
 * @param {string} [params.description]
 * @param {string} [params.location]
 * @param {string} [params.organizerEmail]
 * @param {string} [params.attendeeEmail]
 * @param {string} [params.attendeeName]
 * @param {number} [params.sequence]
 * @param {string} [params.method]  REQUEST (default), CANCEL or PUBLISH
 * @returns {string} the full VCALENDAR payload with CRLF line endings
 */
function buildInterviewInvite({
  bookingId,
  startTime,
  endTime,
  stamp = new Date(),
  summary = 'Interview',
  description = '',
  location = '',
  organizerEmail = null,
  attendeeEmail = null,
  attendeeName = '',
  sequence = 0,
  method = 'REQUEST',
  domain = 'ime365.com',
} = {}) {
  const uid = `${safeToken(bookingId, 'Booking identifier', UID_PATTERN)}@${safeToken(domain, 'Calendar domain', /^[A-Za-z0-9.-]{3,120}$/)}`;
  const start = formatIcalUtc(startTime);
  const end = formatIcalUtc(endTime);
  if (Date.parse(endTime instanceof Date ? endTime.toISOString() : endTime) <= Date.parse(startTime instanceof Date ? startTime.toISOString() : startTime)) {
    throw Object.assign(new Error('A calendar event must end after it starts'), {
      code: 'INVALID_CALENDAR_INPUT',
      status: 400,
    });
  }
  const normalizedMethod = String(method || 'REQUEST').toUpperCase();
  if (!['REQUEST', 'CANCEL', 'PUBLISH'].includes(normalizedMethod)) {
    throw Object.assign(new Error('Unsupported calendar method'), { code: 'INVALID_CALENDAR_INPUT', status: 400 });
  }
  const normalizedSequence = Math.max(0, Number.isSafeInteger(Number(sequence)) ? Number(sequence) : 0);
  const organizer = organizerEmail && EMAIL_PATTERN.test(String(organizerEmail).trim())
    ? String(organizerEmail).trim().toLowerCase()
    : null;
  const attendee = attendeeEmail && EMAIL_PATTERN.test(String(attendeeEmail).trim())
    ? String(attendeeEmail).trim().toLowerCase()
    : null;
  if (organizerEmail && !organizer) {
    throw Object.assign(new Error('Organizer address is not a valid email'), { code: 'INVALID_CALENDAR_INPUT', status: 400 });
  }
  if (attendeeEmail && !attendee) {
    throw Object.assign(new Error('Attendee address is not a valid email'), { code: 'INVALID_CALENDAR_INPUT', status: 400 });
  }

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//IME365//Interview Scheduling//EN',
    'CALSCALE:GREGORIAN',
    `METHOD:${normalizedMethod}`,
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${formatIcalUtc(stamp)}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SEQUENCE:${normalizedSequence}`,
    'STATUS:CONFIRMED',
    `SUMMARY:${escapeIcalText(summary)}`,
  ];
  if (description) lines.push(`DESCRIPTION:${escapeIcalText(description)}`);
  if (location) lines.push(`LOCATION:${escapeIcalText(location)}`);
  if (organizer) lines.push(`ORGANIZER;CN=${escapeIcalText('IME365 Employer')}:mailto:${organizer}`);
  if (attendee) {
    lines.push(`ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=FALSE;CN=${escapeIcalText(attendeeName || attendee)}:mailto:${attendee}`);
  }
  lines.push(`X-IME365-BOOKING-ID:${safeToken(bookingId, 'Booking identifier', UID_PATTERN)}`);
  if (normalizedMethod === 'CANCEL') lines.push('STATUS:CANCELLED');
  lines.push('END:VEVENT', 'END:VCALENDAR');

  return lines.map(foldIcalLine).join(CRLF) + CRLF;
}

/** MIME part for a calendar invitation (method parameter must be present). */
function calendarMimePart(ics, method = 'REQUEST') {
  return {
    contentType: `text/calendar; method=${String(method).toUpperCase()}; charset=UTF-8`,
    content: ics,
  };
}

/** Stable UID for one booking, so an update/cancel targets the original event. */
function bookingUid(bookingId, domain = 'ime365.com') {
  return `${safeToken(bookingId, 'Booking identifier', UID_PATTERN)}@${domain}`;
}

module.exports = {
  CRLF,
  MAX_LINE_OCTETS,
  bookingUid,
  buildInterviewInvite,
  calendarMimePart,
  escapeIcalText,
  foldIcalLine,
  formatIcalUtc,
};
