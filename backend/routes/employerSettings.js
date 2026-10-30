'use strict';

const express = require('express');
const router = express.Router();

/**
 * Persistent employer preferences (Mandate 12 workstream 2).
 *
 * STORAGE AUTHORITY: `employer_settings` (migration 035), one row per verified
 * employer uid. This is the single source of truth for these five fields; the
 * employer's `companies` row remains the authority for branding and is only read
 * once, to seed `company_name` when the settings row is first created.
 *
 * AUTHORIZATION: an authenticated identity holding the `employer` claim — the same
 * gate the rest of the employer portal uses (`isEmployerAccount` in index.js,
 * `requireEmployer` in jobsData/interviews). An `ENTERPRISE_ADMIN` is a *tenant*
 * role; it has its own tenant settings surface and is deliberately NOT granted
 * access to an employer account's preferences, because that would cross a tenant
 * boundary. Tenant isolation here is the row key itself: every statement is
 * scoped by `owner_id = req.user.uid`, so one employer can never read or write
 * another employer's row.
 *
 * VALIDATION: every field is validated individually and rejected with a
 * field-level reason. Nothing is ever coerced into a default: a PATCH either
 * persists exactly what was asked for or writes nothing and returns 400. A PATCH
 * only touches the fields it names, so unspecified settings are preserved.
 */

const SUPPORTED_INTERVIEW_DURATIONS = Object.freeze([15, 30, 45, 60]);
const MAX_AUTO_ARCHIVE_DAYS = 3650;
const SETTING_FIELDS = Object.freeze([
  'companyName',
  'timezone',
  'notificationEmail',
  'defaultInterviewDuration',
  'autoArchiveDays',
]);

/**
 * IANA timezone validation.
 *
 * Deliberately NOT `Intl.supportedValuesOf('timeZone')`: that list is
 * CLDR-canonicalised and locale dependent (a supported IANA alias such as
 * `Asia/Kolkata` is reported as `Asia/Calcutta`), so using it as an allow-list
 * rejects real, valid zones. The engine's own resolver is the authority, and it
 * accepts every alias the runtime can actually compute with.
 */
function isValidTimeZone(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 64) return false;
  // An IANA name is a slash-delimited identifier; `UTC` is the single-segment
  // form this product also accepts.
  if (!/^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)*$/.test(value)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch (_error) {
    return false;
  }
}

function validationError(message, details = []) {
  const error = new Error(message);
  error.status = 400;
  error.code = 'SETTINGS_VALIDATION_FAILED';
  error.details = details;
  return error;
}

function cleanText(value) {
  return String(value).replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Validate one named field. Returns `{ value }` for persistence, or throws.
 * `null` is only meaningful for notificationEmail, where it explicitly clears
 * the address; every other field is required to be present and well-typed.
 */
function validateField(field, raw) {
  switch (field) {
    case 'companyName': {
      if (raw === null || raw === undefined) throw validationError('Company name is required.', [{ field, message: 'Provide a company name.' }]);
      const value = cleanText(raw);
      if (value.length < 2 || value.length > 160) {
        throw validationError('Company name must be between 2 and 160 characters.', [{ field, message: 'Company name must be between 2 and 160 characters.' }]);
      }
      return value;
    }
    case 'timezone': {
      if (raw === null || raw === undefined) throw validationError('A timezone is required.', [{ field, message: 'Provide an IANA timezone, for example Europe/London.' }]);
      const value = String(raw).trim();
      if (!isValidTimeZone(value)) {
        throw validationError('A valid IANA timezone is required.', [{ field, message: 'Provide a valid IANA timezone, for example Europe/London.' }]);
      }
      return value;
    }
    case 'notificationEmail': {
      if (raw === null) return null;
      const value = String(raw).trim().toLowerCase();
      if (value === '') return null;
      if (value.length > 254 || !/^[^\s@,;<>]{1,64}@[^\s@,;<>]{1,189}\.[A-Za-z]{2,}$/.test(value)) {
        throw validationError('A valid notification email address is required.', [{ field, message: 'Provide a valid email address.' }]);
      }
      return value;
    }
    case 'defaultInterviewDuration': {
      const value = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
      if (!Number.isInteger(value) || !SUPPORTED_INTERVIEW_DURATIONS.includes(value)) {
        throw validationError('Interview duration must be 15, 30, 45 or 60 minutes.', [{ field, message: 'Choose 15, 30, 45 or 60 minutes.' }]);
      }
      return value;
    }
    case 'autoArchiveDays': {
      const value = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
      if (!Number.isInteger(value) || value < 0 || value > MAX_AUTO_ARCHIVE_DAYS) {
        throw validationError(`Auto-archive must be a whole number of days from 0 to ${MAX_AUTO_ARCHIVE_DAYS}.`, [{ field, message: `Choose 0–${MAX_AUTO_ARCHIVE_DAYS} days.` }]);
      }
      return value;
    }
    default:
      throw validationError(`Unknown setting: ${field}`, [{ field, message: 'This setting cannot be changed.' }]);
  }
}

/** Validate a PATCH body into an ordered list of column writes. */
function validatePatch(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw validationError('A settings object is required.', [{ field: 'body', message: 'Send a JSON object of settings.' }]);
  }
  const keys = Object.keys(body);
  const unknown = keys.filter(key => !SETTING_FIELDS.includes(key));
  if (unknown.length) {
    throw validationError('Unknown settings field.', unknown.map(field => ({ field, message: 'This setting cannot be changed.' })));
  }
  const updates = [];
  // Validation order is deterministic so the reported field is stable.
  for (const field of SETTING_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(body, field)) continue;
    updates.push({ field, value: validateField(field, body[field]) });
  }
  return updates;
}

const COLUMN_FOR_FIELD = Object.freeze({
  companyName: 'company_name',
  timezone: 'timezone',
  notificationEmail: 'notification_email',
  defaultInterviewDuration: 'default_interview_duration',
  autoArchiveDays: 'auto_archive_days',
});

function isoFrom(value) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

/** Canonical API projection. Never generated from the request body. */
function presentSettings(row) {
  if (!row) return null;
  const duration = Number(row.default_interview_duration);
  const archiveDays = Number(row.auto_archive_days);
  return {
    companyName: String(row.company_name || ''),
    timezone: String(row.timezone || 'UTC'),
    notificationEmail: row.notification_email ? String(row.notification_email) : null,
    defaultInterviewDuration: SUPPORTED_INTERVIEW_DURATIONS.includes(duration) ? duration : 30,
    autoArchiveDays: Number.isInteger(archiveDays) && archiveDays >= 0 ? archiveDays : 0,
    updatedAt: isoFrom(row.updated_at),
  };
}

function pool() {
  // Resolved per request so the connection pool is created lazily exactly as the
  // rest of the backend does, and so tests can substitute the module seam.
  return require('../database/mysql').getPool();
}

function isEmployer(req) {
  return req.user?.claims?.employer === true;
}

function refuseNonEmployer(req, res) {
  if (!req.user?.uid) {
    return res.status(401).json({ success: false, code: 'AUTH_REQUIRED', error: 'Authentication required.' });
  }
  return res.status(403).json({
    success: false,
    code: 'EMPLOYER_ACCESS_REQUIRED',
    error: 'Approved employer access is required.',
  });
}

/** Seed value for a brand-new settings row: the employer's primary company name. */
async function seedCompanyName(db, uid) {
  try {
    const [rows] = await db.query(
      'SELECT name FROM companies WHERE owner_id = ? ORDER BY created_at ASC LIMIT 1',
      [uid]
    );
    const name = rows && rows[0] ? cleanText(rows[0].name || '') : '';
    return name.slice(0, 160);
  } catch (_error) {
    // A missing branding row must not block the settings surface; the field
    // simply starts empty and is then owned by this table.
    return '';
  }
}

async function readRow(db, uid) {
  const [rows] = await db.query(
    `SELECT owner_id, company_name, timezone, notification_email,
            default_interview_duration, auto_archive_days, updated_at
       FROM employer_settings WHERE owner_id = ? LIMIT 1`,
    [uid]
  );
  return rows && rows[0] ? rows[0] : null;
}

/** GET /api/employer/settings — persisted preferences, initialized on first read. */
router.get('/settings', async (req, res) => {
  if (!isEmployer(req)) return refuseNonEmployer(req, res);
  const uid = String(req.user.uid);
  try {
    const db = pool();
    let row = await readRow(db, uid);
    if (!row) {
      const companyName = await seedCompanyName(db, uid);
      // Concurrent first reads collapse onto the same row instead of racing.
      await db.query(
        'INSERT INTO employer_settings (owner_id, company_name) VALUES (?, ?) ON DUPLICATE KEY UPDATE owner_id = owner_id',
        [uid, companyName]
      );
      row = await readRow(db, uid);
    }
    if (!row) throw Object.assign(new Error('Employer settings could not be initialized'), { code: 'SETTINGS_INIT_FAILED' });
    res.setHeader('Cache-Control', 'no-store, private');
    return res.json({ success: true, settings: presentSettings(row) });
  } catch (error) {
    console.error('[Employer settings read]', error?.code || error?.message);
    return res.status(503).json({ success: false, code: 'SETTINGS_UNAVAILABLE', error: 'Employer settings are temporarily unavailable.' });
  }
});

/** PATCH /api/employer/settings — partial update, persisted and re-read. */
router.patch('/settings', async (req, res) => {
  if (!isEmployer(req)) return refuseNonEmployer(req, res);
  const uid = String(req.user.uid);

  let updates;
  try {
    updates = validatePatch(req.body);
  } catch (error) {
    return res.status(400).json({
      success: false,
      code: error.code || 'SETTINGS_VALIDATION_FAILED',
      error: error.message,
      details: error.details || [],
    });
  }

  const db = pool();
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [locked] = await connection.query(
      `SELECT owner_id, company_name, timezone, notification_email,
              default_interview_duration, auto_archive_days, updated_at
         FROM employer_settings WHERE owner_id = ? FOR UPDATE`,
      [uid]
    );

    if (!locked.length) {
      // Initialize inside the same transaction so the row is never visible in a
      // half-built state (and a concurrent PATCH cannot interleave).
      const seededName = updates.find(update => update.field === 'companyName')?.value
        ?? await seedCompanyName(connection, uid);
      await connection.query(
        'INSERT INTO employer_settings (owner_id, company_name) VALUES (?, ?) ON DUPLICATE KEY UPDATE owner_id = owner_id',
        [uid, seededName]
      );
      await connection.query('SELECT owner_id FROM employer_settings WHERE owner_id = ? FOR UPDATE', [uid]);
    }

    if (updates.length) {
      const assignments = updates.map(update => `${COLUMN_FOR_FIELD[update.field]} = ?`);
      const params = updates.map(update => update.value);
      const [result] = await connection.query(
        `UPDATE employer_settings SET ${assignments.join(', ')} WHERE owner_id = ?`,
        [...params, uid]
      );
      if (Number(result?.affectedRows || 0) === 0) {
        // `affectedRows` is 0 both for "row missing" and for "values unchanged";
        // the row lock above proves the row exists, so a missing row is the only
        // state that must fail loudly.
        const [confirm] = await connection.query('SELECT owner_id FROM employer_settings WHERE owner_id = ? LIMIT 1', [uid]);
        if (!confirm.length) throw Object.assign(new Error('Employer settings row disappeared during update'), { code: 'SETTINGS_PERSIST_FAILED' });
      }
    }

    const [saved] = await connection.query(
      `SELECT owner_id, company_name, timezone, notification_email,
              default_interview_duration, auto_archive_days, updated_at
         FROM employer_settings WHERE owner_id = ? LIMIT 1`,
      [uid]
    );
    if (!saved.length) throw Object.assign(new Error('Employer settings could not be persisted'), { code: 'SETTINGS_PERSIST_FAILED' });
    await connection.commit();
    res.setHeader('Cache-Control', 'no-store, private');
    return res.json({
      success: true,
      updated: updates.map(update => update.field),
      settings: presentSettings(saved[0]),
    });
  } catch (error) {
    await connection.rollback().catch(() => {});
    console.error('[Employer settings write]', error?.code || error?.message);
    return res.status(503).json({ success: false, code: 'SETTINGS_WRITE_FAILED', error: 'Employer settings could not be saved.' });
  } finally {
    connection.release();
  }
});

module.exports = {
  default: router,
  router,
  SETTING_FIELDS,
  SUPPORTED_INTERVIEW_DURATIONS,
  MAX_AUTO_ARCHIVE_DAYS,
  validateField,
  validatePatch,
  presentSettings,
  isValidTimeZone,
  isEmployer,
};
