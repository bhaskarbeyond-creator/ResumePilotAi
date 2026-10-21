'use strict';

const express = require('express');
const crypto = require('crypto');
const { getRepository } = require('../repositories');
const router = express.Router();

// DIR-020: shared allow-lists for the Kanban card metadata and interview
// scheduler. Kept in sync with MySQLRepository so a value rejected at the edge
// can never reach the typed columns.
const WORK_MODES = new Set(['Remote', 'Hybrid', 'On-site']);
const INTERVIEW_ROUNDS = new Set([
    'Recruiter Screen', 'Technical', 'System Design', 'Behavioral', 'Hiring Manager',
]);
const INTERVIEW_FORMATS = new Set(['Video', 'In-Person', 'Phone']);

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
router.get('/tracker', async (req, res) => {
    try {
        const jobs = await req.repository.getTrackedJobs(req.user.uid);
        return res.json({ success: true, jobs });
    } catch (error) { return replyTrackerError(res, error); }
});

router.post('/tracker', async (req, res) => {
    try {
        const job = await req.repository.createTrackedJob(
            req.user.uid,
            `tracker_${crypto.randomUUID()}`,
            normalizeTrackerInput(req.body)
        );
        return res.status(201).json({ success: true, job });
    } catch (error) { return replyTrackerError(res, error); }
});

router.patch('/tracker/:id', async (req, res) => {
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

router.delete('/tracker/:id', async (req, res) => {
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

// GET /api/jobs-data/applications/list - My applications (owner-scoped; zero-trust)
router.get('/applications/list', async (req, res) => {
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
router.post('/applications/:id', updateOwnApplication);

// PATCH /api/jobs-data/applications/:id - Update my application (owner-scoped)
router.patch('/applications/:id', updateOwnApplication);

// DELETE /api/jobs-data/applications/:id - Remove my application (owner-scoped)
router.delete('/applications/:id', async (req, res) => {
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
module.exports = { jobsDataRouter: router, isPubliclyVisibleJob };
