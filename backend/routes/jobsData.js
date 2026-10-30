'use strict';

const express = require('express');
const crypto = require('crypto');
const { getRepository } = require('../repositories');
const { getPool } = require('../database/mysql');
const router = express.Router();

// DIR-020: shared allow-lists for the Kanban card metadata and interview
// scheduler. Kept in sync with MySQLRepository so a value rejected at the edge
// can never reach the typed columns.
const WORK_MODES = new Set(['Remote', 'Hybrid', 'On-site']);
const INTERVIEW_ROUNDS = new Set([
    'Recruiter Screen', 'Technical', 'System Design', 'Behavioral', 'Hiring Manager',
]);
const INTERVIEW_FORMATS = new Set(['Video', 'In-Person', 'Phone']);

// The five candidate tracker columns. These are the candidate's personal
// workflow and are never written back to the employer's application decision.
const TRACKER_COLUMNS = Object.freeze(['wishlist', 'applied', 'interview', 'offer', 'rejected']);

/**
 * The employer-owned application lifecycle the candidate sees, mapped from the
 * values the apply workflow and the employer console actually store in
 * `applications.status` (a free-form VARCHAR; the workflow writes pending,
 * interview, accepted, rejected). Unknown stored values are reported as UNKNOWN
 * rather than being guessed into a lifecycle stage.
 */
const APPLICATION_LIFECYCLE = Object.freeze({
    pending: 'APPLIED',
    applied: 'APPLIED',
    submitted: 'APPLIED',
    reviewing: 'REVIEWING',
    in_review: 'REVIEWING',
    interview: 'INTERVIEW_SCHEDULED',
    interview_scheduled: 'INTERVIEW_SCHEDULED',
    rejected: 'REJECTED',
    declined: 'REJECTED',
    accepted: 'OFFERED',
    offered: 'OFFERED',
});

function lifecycleStatusFor(status) {
    const key = String(status || '').trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(APPLICATION_LIFECYCLE, key)
        ? APPLICATION_LIFECYCLE[key]
        : 'UNKNOWN';
}

/**
 * Every candidate-owned resource below is owner-scoped and requires a verified
 * identity. backend/index.js already authenticates /api/jobs-data, but the
 * owner-scoped routes must fail closed if they are ever mounted elsewhere.
 */
function requireCandidate(req, res, next) {
    if (!req.user?.uid) {
        return res.status(401).json({ success: false, code: 'AUTH_REQUIRED', error: 'Authentication required' });
    }
    return next();
}

function normalizeTrackerInput(input = {}, { partial = false } = {}) {
    const text = (value, maximum) => String(value || '').replace(/\p{Cc}/gu, ' ').trim().slice(0, maximum);
    // Notes may span lines: line breaks are kept, other control characters removed.
    const multiline = (value, maximum) => String(value || '').replace(/\r\n?/g, '\n')
        .replace(/\p{Cc}/gu, character => (character === '\n' ? '\n' : ' ')).trim().slice(0, maximum);
    const has = key => Object.prototype.hasOwnProperty.call(input, key);
    const statuses = new Set(['wishlist', 'applied', 'interview', 'offer', 'rejected']);
    const workModes = WORK_MODES;
    const interviewRounds = INTERVIEW_ROUNDS;
    const interviewFormats = INTERVIEW_FORMATS;
    const normalized = {};

    if (!partial || has('title')) normalized.title = text(input.title, 160);
    if (!partial || has('company')) normalized.company = text(input.company, 160);
    if (!partial || has('location')) normalized.location = text(input.location, 160);
    if (!partial || has('notes')) normalized.notes = multiline(input.notes, 4000);
    if (!partial || has('deadline')) normalized.deadline = text(input.deadline, 10);
    if (!partial || has('status')) {
        const status = String(input.status || (partial ? '' : 'wishlist')).toLowerCase();
        if (!statuses.has(status)) {
            throw Object.assign(new Error('Use a valid job tracker status.'), { code: 'JOB_TRACKER_VALIDATION_ERROR', status: 400 });
        }
        normalized.status = status;
    }
    if (!partial || has('order')) {
        normalized.order = Math.max(0, Math.min(Number.parseInt(input.order, 10) || 0, 1_000_000));
    }
    if (!partial || has('url')) {
        let url = text(input.url, 1024);
        if (url) {
            try {
                const parsed = new URL(url);
                if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('unsupported scheme');
                url = parsed.href;
            } catch {
                throw Object.assign(new Error('Use a valid HTTP or HTTPS web address.'), { code: 'JOB_TRACKER_VALIDATION_ERROR', status: 400 });
            }
        }
        normalized.url = url;
    }

    // ---- DIR-020: executive Kanban card metadata + interview scheduling ----
    if (!partial || has('salary')) normalized.salary = text(input.salary, 100);
    if (!partial || has('dateApplied')) {
        const dateApplied = text(input.dateApplied, 32);
        if (dateApplied && !/^\d{4}-\d{2}-\d{2}/.test(dateApplied)) {
            throw Object.assign(new Error('Use a valid applied date.'), { code: 'JOB_TRACKER_VALIDATION_ERROR', status: 400 });
        }
        normalized.dateApplied = dateApplied;
    }
    if (!partial || has('contactPerson')) normalized.contactPerson = text(input.contactPerson, 255);
    if (!partial || has('contactEmail')) {
        const email = text(input.contactEmail, 255);
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            throw Object.assign(new Error('Use a valid contact email address.'), { code: 'JOB_TRACKER_VALIDATION_ERROR', status: 400 });
        }
        normalized.contactEmail = email;
    }
    if (!partial || has('workMode')) {
        const workMode = text(input.workMode, 32);
        if (workMode && !workModes.has(workMode)) {
            throw Object.assign(new Error('Use Remote, Hybrid or On-site.'), { code: 'JOB_TRACKER_VALIDATION_ERROR', status: 400 });
        }
        normalized.workMode = workMode;
    }
    if (!partial || has('interviewRound')) {
        const round = text(input.interviewRound, 64);
        if (round && !interviewRounds.has(round)) {
            throw Object.assign(new Error('Use a valid interview round.'), { code: 'JOB_TRACKER_VALIDATION_ERROR', status: 400 });
        }
        normalized.interviewRound = round;
    }
    if (!partial || has('interviewFormat')) {
        const format = text(input.interviewFormat, 32);
        if (format && !interviewFormats.has(format)) {
            throw Object.assign(new Error('Use Video, In-Person or Phone.'), { code: 'JOB_TRACKER_VALIDATION_ERROR', status: 400 });
        }
        normalized.interviewFormat = format;
    }
    if (!partial || has('interviewAt')) {
        const at = text(input.interviewAt, 32);
        if (at && Number.isNaN(new Date(at).getTime())) {
            throw Object.assign(new Error('Use a valid interview date and time.'), { code: 'JOB_TRACKER_VALIDATION_ERROR', status: 400 });
        }
        normalized.interviewAt = at;
    }
    if (!partial || has('interviewLink')) {
        let link = text(input.interviewLink, 1024);
        if (link) {
            try {
                const parsed = new URL(link);
                if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('unsupported scheme');
                link = parsed.href;
            } catch {
                throw Object.assign(new Error('Use a valid HTTP or HTTPS meeting link.'), { code: 'JOB_TRACKER_VALIDATION_ERROR', status: 400 });
            }
        }
        normalized.interviewLink = link;
    }

    if ((!partial && (!normalized.title || !normalized.company))
        || (has('title') && !normalized.title)
        || (has('company') && !normalized.company)
        || (normalized.deadline && !/^\d{4}-\d{2}-\d{2}$/.test(normalized.deadline))) {
        throw Object.assign(new Error('Job title, company, and date must be valid.'), { code: 'JOB_TRACKER_VALIDATION_ERROR', status: 400 });
    }
    return normalized;
}

function replyTrackerError(res, error) {
    const status = Number(error?.status || 500);
    return res.status(status >= 400 && status < 600 ? status : 500).json({
        success: false,
        code: error?.code || 'JOB_TRACKER_ERROR',
        error: status >= 500 ? 'The job tracker is temporarily unavailable.' : error.message,
        remoteRevision: error?.remoteRevision,
    });
}

function isPubliclyVisibleJob(job = {}, now = Date.now()) {
    const status = String(job.status || '').trim().toLowerCase();
    const tombstoned = Boolean(job.deleted_at || job.deletedAt || job.tombstoned || job.is_deleted || job.isDeleted);
    const expiry = job.expires_at || job.expiresAt;
    const expired = expiry ? Number.isFinite(new Date(expiry).getTime()) && new Date(expiry).getTime() <= now : false;
    return status === 'active' && !tombstoned && !expired;
}

router.use((req, res, next) => {
    try {
        // Tests may supply a scoped provider through app.locals; production never
        // sets it and always resolves the canonical MariaDB repository factory.
        const repositoryProvider = req.app.locals.jobsRepositoryProvider || getRepository;
        req.repository = repositoryProvider();
        next();
    } catch (_err) {
        return res.status(503).json({ success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'Job data is temporarily unavailable.' } });
    }
});

// GET /api/jobs-data - Public discovery is always active-only. An authenticated
// owner may explicitly request their own inventory; a caller can never select a
// different employer's drafts, paused records, or deletion markers.
router.get('/', async (req, res) => {
    try {
        const filters = { ...req.query };
        const requestedEmployer = filters.employerId ? String(filters.employerId) : '';
        const ownerInventory = Boolean(req.user?.uid && requestedEmployer === String(req.user.uid));
        if (requestedEmployer && !ownerInventory) {
            return res.status(403).json({ success: false, error: 'Access denied' });
        }
        if (!ownerInventory) {
            delete filters.employerId;
            delete filters.status;
            filters.publicOnly = true;
        }
        const jobs = await req.repository.getJobs(filters);
        const visibleJobs = ownerInventory ? jobs : jobs.filter(job => isPubliclyVisibleJob(job));
        return res.json({ success: true, jobs: visibleJobs });
    } catch (_err) {
        return res.status(503).json({ success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'Job listings are temporarily unavailable.' } });
    }
});

// Job tracker is a distinct owner-scoped MariaDB resource. It must never be
// conflated with submitted job applications.
router.get('/tracker', requireCandidate, async (req, res) => {
    try {
        const jobs = await req.repository.getTrackedJobs(req.user.uid);
        return res.json({ success: true, jobs, columns: TRACKER_COLUMNS });
    } catch (error) { return replyTrackerError(res, error); }
});

router.post('/tracker', requireCandidate, async (req, res) => {
    try {
        const job = await req.repository.createTrackedJob(
            req.user.uid,
            `tracker_${crypto.randomUUID()}`,
            normalizeTrackerInput(req.body)
        );
        return res.status(201).json({ success: true, job });
    } catch (error) { return replyTrackerError(res, error); }
});

router.patch('/tracker/:id', requireCandidate, async (req, res) => {
    try {
        const expectedRevision = Number(req.body?.expectedRevision);
        if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
            return res.status(400).json({ success: false, code: 'JOB_TRACKER_REVISION_REQUIRED', error: 'A valid expected revision is required.' });
        }
        const job = await req.repository.updateTrackedJob(
            req.user.uid,
            req.params.id,
            normalizeTrackerInput(req.body, { partial: true }),
            { expectedRevision }
        );
        return res.json({ success: true, job });
    } catch (error) { return replyTrackerError(res, error); }
});

router.delete('/tracker/:id', requireCandidate, async (req, res) => {
    try {
        const expectedRevision = Number(req.body?.expectedRevision);
        if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
            return res.status(400).json({ success: false, code: 'JOB_TRACKER_REVISION_REQUIRED', error: 'A valid expected revision is required.' });
        }
        await req.repository.deleteTrackedJob(req.user.uid, req.params.id, { expectedRevision });
        return res.json({ success: true });
    } catch (error) { return replyTrackerError(res, error); }
});

// GET /api/jobs-data/:id - Owners may inspect their own non-active records;
// every other caller receives only a currently active, non-tombstoned record.
router.get('/:id', async (req, res) => {
    try {
        const job = await req.repository.getJob(req.params.id);
        if (!job) return res.status(404).json({ success: false, error: 'Job not found' });
        const ownerId = String(job.employerId || job.employer_id || '');
        const ownsJob = Boolean(req.user?.uid && ownerId === String(req.user.uid));
        if (!ownsJob && !isPubliclyVisibleJob(job)) {
            return res.status(404).json({ success: false, error: 'Job not found' });
        }
        return res.json({ success: true, job });
    } catch (_err) {
        return res.status(503).json({ success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'Job data is temporarily unavailable.' } });
    }
});

// POST /api/jobs-data/:id - Save job without permitting primary-key takeover.
router.post('/:id', async (req, res) => {
    try {
        const existing = await req.repository.getJob(req.params.id);
        const existingOwner = String(existing?.employerId || existing?.employer_id || '');
        if (existing && existingOwner !== String(req.user.uid)) {
            return res.status(404).json({ success: false, error: 'Job not found' });
        }
        const jobData = { ...req.body, employerId: req.user.uid, employer_id: req.user.uid };
        const saved = await req.repository.saveJob(req.params.id, jobData);
        return res.json({ success: true, job: saved });
    } catch (error) {
        if (error?.status === 404 || error?.code === 'JOB_NOT_FOUND') {
            return res.status(404).json({ success: false, error: 'Job not found' });
        }
        return res.status(503).json({ success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'Job data is temporarily unavailable.' } });
    }
});

// DELETE /api/jobs-data/:id - Delete job (owner-scoped in both route and SQL).
router.delete('/:id', async (req, res) => {
    try {
        const job = await req.repository.getJob(req.params.id);
        if (!job) return res.status(404).json({ success: false, error: 'Job not found' });
        if (String(job.employerId || job.employer_id || '') !== String(req.user.uid)) {
            return res.status(404).json({ success: false, error: 'Job not found' });
        }
        const deleted = await req.repository.deleteJob(req.params.id, req.user.uid);
        if (!deleted) return res.status(404).json({ success: false, error: 'Job not found' });
        return res.json({ success: true });
    } catch (_err) {
        return res.status(503).json({ success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'Job data is temporarily unavailable.' } });
    }
});

// ——— Submitted applications: the applicant's side (P002 C14) ———
// Applying goes through POST /api/jobs/:jobId/applications (an open job, one
// application per job, the employer notified), and the employer moves the
// status through PATCH /api/job-applications/:id/status. Here applicants list
// their own applications, withdraw one, and may correct the contact details
// they gave. Status, rating and notes are the employer's; the job and the
// employer are fixed when the application is made.

function isoOrNull(value) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** One application as its applicant sees it: their submission and the job applied to. */
function applicantApplicationView(row = {}, now = Date.now()) {
    const job = row.job && typeof row.job === 'object' ? row.job : null;
    return {
        id: String(row.id || ''),
        jobId: String(row.jobId || ''),
        status: String(row.status || 'pending').trim().toLowerCase(),
        createdAt: isoOrNull(row.createdAt),
        updatedAt: isoOrNull(row.updatedAt),
        applicantName: String(row.applicantName || ''),
        applicantEmail: String(row.applicantEmail || ''),
        applicantPhone: String(row.applicantPhone || ''),
        resumeId: row.resumeId ? String(row.resumeId) : null,
        coverLetter: String(row.coverLetter || ''),
        job: {
            title: String(job?.title || ''),
            company: String(job?.company || ''),
            location: String(job?.location || ''),
            // Listed: open on the public job board now (the rule GET /:id applies to everyone else).
            listed: job ? isPubliclyVisibleJob({ status: job.status, expires_at: job.expiresAt }, now) : false,
        },
    };
}

/** The same view of a single record from getApplication(), without the job summary. */
function applicantRecordView(record = {}) {
    const { job: _job, ...view } = applicantApplicationView({ ...record, job: null });
    return view;
}

// The contact details an applicant gave, under the names the apply form and the
// stored record use. Nothing else on a sent application is theirs to change.
const APPLICANT_CONTACT_FIELDS = Object.freeze({
    applicantName: 'applicantName', fullName: 'applicantName',
    applicantPhone: 'applicantPhone', phone: 'applicantPhone',
});

function applicationRequestError(code, message, field) {
    return Object.assign(new Error(message), { status: 400, code, ...(field ? { field } : {}) });
}

/** Validated like POST /api/jobs/:jobId/applications validates the apply form. */
function applicantContactUpdate(body) {
    const entries = Object.entries(body && typeof body === 'object' && !Array.isArray(body) ? body : {});
    const refused = entries.find(([key]) => !Object.hasOwn(APPLICANT_CONTACT_FIELDS, key));
    if (refused) {
        throw applicationRequestError('APPLICATION_FIELD_NOT_EDITABLE',
            'Only your name and phone number can be changed on an application you have sent.', refused[0]);
    }
    const fields = {};
    for (const [key, value] of entries) {
        if (APPLICANT_CONTACT_FIELDS[key] === 'applicantName') {
            const name = String(value ?? '').replace(/\p{Cc}/gu, ' ').trim().slice(0, 120);
            if (!name) throw applicationRequestError('APPLICATION_VALIDATION_ERROR', 'Enter your name.', key);
            fields.applicantName = name;
        } else {
            const phone = String(value ?? '').replace(/\p{Cc}/gu, '').trim().slice(0, 30);
            if (!/^\+?[0-9 ()-]{7,30}$/.test(phone)) {
                throw applicationRequestError('APPLICATION_VALIDATION_ERROR', 'Enter a valid phone number.', key);
            }
            fields.applicantPhone = phone;
        }
    }
    if (!Object.keys(fields).length) {
        throw applicationRequestError('APPLICATION_VALIDATION_ERROR', 'Send applicantName or applicantPhone to update.');
    }
    return fields;
}

function requireEmployer(req, res, next) {
    if (!req.user?.uid) return res.status(401).json({ success: false, code: 'AUTH_REQUIRED', error: 'Authentication required.' });
    if (req.user?.claims?.employer !== true) return res.status(403).json({ success: false, code: 'EMPLOYER_ACCESS_REQUIRED', error: 'Approved employer access is required.' });
    return next();
}

function parseApplicationExtra(value) {
    if (!value) return {};
    if (typeof value === 'object' && !Array.isArray(value)) return value;
    try { const parsed = JSON.parse(String(value)); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}; }
    catch { return {}; }
}

/**
 * Interview scorecard vocabulary (Mandate 12 workstream 3).
 *
 * The relational authority is `application_evaluations` (migration 036), one row
 * per (application, reviewer). The five canonical recommendations below are the
 * stored vocabulary. The three labels the pre-existing UI shipped
 * ('Move to Offer', 'Reject', 'Hold') are still ACCEPTED and are mapped onto the
 * canonical values, so an older client keeps working without writing an
 * out-of-contract row.
 */
const EVALUATION_RECOMMENDATIONS = Object.freeze(['STRONG_YES', 'YES', 'NEUTRAL', 'NO', 'STRONG_NO']);
const LEGACY_RECOMMENDATION_ALIASES = Object.freeze({
    MOVE_TO_OFFER: 'STRONG_YES',
    OFFER: 'STRONG_YES',
    STRONG_YES: 'STRONG_YES',
    YES: 'YES',
    HOLD: 'NEUTRAL',
    NEUTRAL: 'NEUTRAL',
    NO: 'NO',
    REJECT: 'NO',
    STRONG_NO: 'STRONG_NO',
});

function normalizeRecommendation(raw) {
    const key = String(raw ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');
    return LEGACY_RECOMMENDATION_ALIASES[key] || null;
}

/** Deterministic evaluation id: one row per (application, reviewer) by construction. */
function evaluationId(applicationId, reviewerId) {
    const digest = crypto.createHash('sha256').update(`${applicationId}\u0000${reviewerId}`).digest('hex');
    return `ael_${digest.slice(0, 60)}`;
}

function scorecardView(row) {
    if (!row) return null;
    const extra = parseApplicationExtra(row.extra_json);
    const recommendation = extra.evaluationRecommendation;
    if ((Number(row.rating) < 1 || Number(row.rating) > 5) && !String(row.notes || '').trim() && !recommendation) return null;
    return {
        applicationId: row.id,
        rating: Number(row.rating) || null,
        notes: row.notes || '',
        recommendation: normalizeRecommendation(recommendation),
        updatedAt: row.updated_at || null,
        source: 'LEGACY_APPLICATION',
    };
}

/** Projection of one relational evaluation row. */
function evaluationView(row) {
    if (!row) return null;
    const recommendation = normalizeRecommendation(row.recommendation);
    if (!recommendation) return null;
    const rating = Number(row.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return null;
    return {
        id: row.id,
        applicationId: row.application_id,
        reviewerId: row.reviewer_id,
        rating,
        notes: row.notes || '',
        recommendation,
        createdAt: row.created_at || null,
        updatedAt: row.updated_at || null,
        source: 'APPLICATION_EVALUATIONS',
    };
}

/**
 * GET /api/jobs-data/applications/:id/evaluate
 *
 * Reviewer-isolated read: the caller must own the application
 * (`applications.employer_id = req.user.uid`) and the relational row is looked up
 * for the CALLER as reviewer, so one reviewer can never read another's scorecard.
 * When the caller has no relational row yet, the legacy single-slot projection on
 * the application row is returned so pre-migration evaluations stay visible.
 */
router.get('/applications/:id/evaluate', requireEmployer, async (req, res) => {
    const applicationId = String(req.params.id || '');
    if (!/^[A-Za-z0-9:_-]{1,300}$/.test(applicationId)) return res.status(400).json({ success: false, code: 'INVALID_APPLICATION_ID', error: 'Invalid application ID.' });
    try {
        const pool = getPool();
        const [applications] = await pool.query(
            'SELECT id, rating, notes, extra_json, updated_at FROM applications WHERE id = ? AND employer_id = ? LIMIT 1',
            [applicationId, req.user.uid]
        );
        if (!applications.length) return res.status(404).json({ success: false, code: 'APPLICATION_NOT_FOUND', error: 'Application not found.' });
        const [evaluations] = await pool.query(
            `SELECT id, application_id, reviewer_id, rating, recommendation, notes, created_at, updated_at
               FROM application_evaluations
              WHERE application_id = ? AND reviewer_id = ?
              LIMIT 1`,
            [applicationId, req.user.uid]
        );
        const relational = evaluationView(evaluations[0]);
        const legacy = scorecardView(applications[0]);
        return res.json({
            success: true,
            evaluation: relational || legacy,
            // Both projections are returned so a caller can tell a relational
            // scorecard from a legacy row without guessing.
            relational: relational || null,
            legacy: legacy || null,
        });
    } catch (error) {
        console.error('[Application evaluation read]', error?.code || error?.message || error);
        return res.status(503).json({ success: false, code: 'EVALUATION_UNAVAILABLE', error: 'Evaluation is temporarily unavailable.' });
    }
});

/**
 * PUT /api/jobs-data/applications/:id/evaluate
 *
 * One transaction writes:
 *   1. the caller's relational scorecard (upsert on the unique
 *      (application_id, reviewer_id) key, so a second reviewer cannot overwrite
 *      the first and a repeated save by the same reviewer updates in place), and
 *   2. the legacy compatibility columns `applications.rating` / `notes` /
 *      `extra_json.evaluationRecommendation`, which existing exports and the
 *      candidate drawer still read.
 * The application row is locked FOR UPDATE first, so concurrent saves for one
 * application serialize and cannot leave the relational row and the legacy
 * columns disagreeing. Any failure rolls both writes back.
 */
router.put('/applications/:id/evaluate', requireEmployer, async (req, res) => {
    const applicationId = String(req.params.id || '');
    const rating = Number(req.body?.rating);
    const notes = String(req.body?.notes ?? '').replace(/\r\n?/g, '\n').trim();
    const recommendation = normalizeRecommendation(req.body?.recommendation);
    if (!/^[A-Za-z0-9:_-]{1,300}$/.test(applicationId)) return res.status(400).json({ success: false, code: 'INVALID_APPLICATION_ID', error: 'Invalid application ID.' });
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ success: false, code: 'INVALID_RATING', error: 'Rating must be an integer from 1 to 5.' });
    if (!notes || notes.length > 1000) return res.status(400).json({ success: false, code: 'INVALID_NOTES', error: 'Hiring notes are required and must be 1,000 characters or fewer.' });
    if (!recommendation) return res.status(400).json({ success: false, code: 'INVALID_RECOMMENDATION', error: 'Choose a stage recommendation: STRONG_YES, YES, NEUTRAL, NO or STRONG_NO.' });
    const pool = getPool();
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [rows] = await connection.query('SELECT id, extra_json FROM applications WHERE id = ? AND employer_id = ? FOR UPDATE', [applicationId, req.user.uid]);
        if (!rows.length) {
            await connection.rollback();
            return res.status(404).json({ success: false, code: 'APPLICATION_NOT_FOUND', error: 'Application not found.' });
        }
        const extra = parseApplicationExtra(rows[0].extra_json);
        extra.evaluationRecommendation = recommendation;
        const [result] = await connection.query(
            'UPDATE applications SET rating = ?, notes = ?, extra_json = ? WHERE id = ? AND employer_id = ?',
            [rating, notes, JSON.stringify(extra), applicationId, req.user.uid]
        );
        if (Number(result?.affectedRows || 0) !== 1) throw new Error('Evaluation persistence did not update one application.');

        const reviewerId = String(req.user.uid);
        const [upsert] = await connection.query(
            `INSERT INTO application_evaluations (id, application_id, reviewer_id, rating, recommendation, notes)
             VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               rating = VALUES(rating),
               recommendation = VALUES(recommendation),
               notes = VALUES(notes),
               updated_at = CURRENT_TIMESTAMP`,
            [evaluationId(applicationId, reviewerId), applicationId, reviewerId, rating, recommendation, notes]
        );
        // MariaDB reports 1 for insert, 2 for a duplicate-key update and 0 when the
        // update is a no-op; anything else means the relational write did not land.
        const affected = Number(upsert?.affectedRows);
        if (![0, 1, 2].includes(affected)) throw new Error('Relational evaluation persistence failed.');

        const [saved] = await connection.query(
            `SELECT id, application_id, reviewer_id, rating, recommendation, notes, created_at, updated_at
               FROM application_evaluations WHERE application_id = ? AND reviewer_id = ? LIMIT 1`,
            [applicationId, reviewerId]
        );
        const evaluation = evaluationView(saved[0]);
        if (!evaluation) throw new Error('Relational evaluation could not be read back after write.');
        const [savedApplication] = await connection.query('SELECT id, rating, notes, extra_json, updated_at FROM applications WHERE id = ? AND employer_id = ? LIMIT 1', [applicationId, req.user.uid]);
        await connection.commit();
        return res.json({
            success: true,
            evaluation,
            legacy: scorecardView(savedApplication[0]),
        });
    } catch (error) {
        await connection.rollback().catch(() => {});
        console.error('[Application evaluation write]', error?.code || error?.message || error);
        return res.status(503).json({ success: false, code: 'EVALUATION_WRITE_FAILED', error: 'Evaluation could not be saved.' });
    } finally {
        connection.release();
    }
});

// GET /api/jobs-data/applications/list - My applications (owner-scoped; zero-trust)
router.get('/applications/list', requireCandidate, async (req, res) => {
    try {
        // The current user's own applications; applicantId is never client-controlled.
        const rows = await req.repository.getApplicantApplications({ applicantId: req.user.uid });
        const now = Date.now();
        return res.json({ success: true, applications: rows.map(row => applicantApplicationView(row, now)) });
    } catch (_err) {
        return res.status(500).json({ success: false, error: 'Failed to fetch applications' });
    }
});

/** Owner-only correction of the applicant's own contact details. */
async function updateOwnApplication(req, res) {
    try {
        const existing = await req.repository.getApplication(req.params.id);
        if (!existing) {
            return res.status(404).json({
                success: false, code: 'APPLICATION_NOT_FOUND',
                error: 'Application not found. Apply to a job through POST /api/jobs/:jobId/applications.',
            });
        }
        if (String(existing.applicant_id || existing.applicantId || '') !== req.user.uid) {
            return res.status(403).json({ success: false, error: 'Access denied' });
        }
        const fields = applicantContactUpdate(req.body);
        const updated = await req.repository.updateApplicantContact(req.params.id, req.user.uid, fields);
        if (!updated) return res.status(404).json({ success: false, code: 'APPLICATION_NOT_FOUND', error: 'Application not found.' });
        const saved = await req.repository.getApplication(req.params.id);
        return res.json({ success: true, application: applicantRecordView(saved || { ...existing, ...fields }) });
    } catch (error) {
        if (error?.status === 400) {
            return res.status(400).json({ success: false, code: error.code, error: error.message, ...(error.field ? { field: error.field } : {}) });
        }
        return res.status(500).json({ success: false, error: 'Failed to update application' });
    }
}

// POST /api/jobs-data/applications/:id - Update my application (owner-scoped). It
// no longer creates one: a missing id is 404, another applicant's is 403.
router.post('/applications/:id', requireCandidate, updateOwnApplication);

// PATCH /api/jobs-data/applications/:id - Update my application (owner-scoped)
router.patch('/applications/:id', requireCandidate, updateOwnApplication);

// DELETE /api/jobs-data/applications/:id - Remove my application (owner-scoped)
router.delete('/applications/:id', requireCandidate, async (req, res) => {
    try {
        const existing = await req.repository.getApplication(req.params.id);
        if (!existing) return res.status(404).json({ success: false, error: 'Application not found' });
        if (String(existing.applicant_id || existing.applicantId || '') !== req.user.uid) {
            return res.status(403).json({ success: false, error: 'Access denied' });
        }
        await req.repository.deleteApplication(req.params.id);
        return res.json({ success: true });
    } catch (_err) {
        return res.status(500).json({ success: false, error: 'Failed to delete application' });
    }
});

// isPubliclyVisibleJob: the favourites list (routes/miscData.js) applies the same rule as GET /:id.
module.exports = {
    jobsDataRouter: router,
    isPubliclyVisibleJob,
    lifecycleStatusFor,
    TRACKER_COLUMNS,
    APPLICATION_LIFECYCLE,
    // Mandate 12 workstream 3 contract surface (consumed by the contract tests).
    EVALUATION_RECOMMENDATIONS,
    LEGACY_RECOMMENDATION_ALIASES,
    evaluationId,
    evaluationView,
    normalizeRecommendation,
    scorecardView,
};
