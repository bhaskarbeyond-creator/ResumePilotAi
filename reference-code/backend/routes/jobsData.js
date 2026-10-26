'use strict';

const express = require('express');
const crypto = require('crypto');
const { getRepository } = require('../repositories');
const router = express.Router();

function normalizeTrackerInput(input = {}, { partial = false } = {}) {
    const text = (value, maximum) => String(value || '').replace(/\p{Cc}/gu, ' ').trim().slice(0, maximum);
    const has = key => Object.prototype.hasOwnProperty.call(input, key);
    const statuses = new Set(['wishlist', 'applied', 'interview', 'offer', 'rejected']);
    const normalized = {};

    if (!partial || has('title')) normalized.title = text(input.title, 160);
    if (!partial || has('company')) normalized.company = text(input.company, 160);
    if (!partial || has('location')) normalized.location = text(input.location, 160);
    if (!partial || has('notes')) normalized.notes = text(input.notes, 4000);
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

// GET /api/jobs-data/applications/list - My applications (owner-scoped; zero-trust)
router.get('/applications/list', async (req, res) => {
    try {
        // The current user's own applications; applicantId is never client-controlled.
        const apps = await req.repository.getApplications({ applicantId: req.user.uid });
        return res.json({ success: true, applications: apps });
    } catch (_err) {
        return res.status(500).json({ success: false, error: 'Failed to fetch applications' });
    }
});

// POST /api/jobs-data/applications/:id - Apply or update application (owner-scoped)
router.post('/applications/:id', async (req, res) => {
    try {
        const appData = { ...req.body, applicantId: req.user.uid, applicant_id: req.user.uid };
        delete appData.userId;
        const saved = await req.repository.saveApplication(req.params.id, appData);
        return res.json({ success: true, application: saved });
    } catch (_err) {
        return res.status(500).json({ success: false, error: 'Failed to save application' });
    }
});

// PATCH /api/jobs-data/applications/:id - Update my application (owner-scoped)
router.patch('/applications/:id', async (req, res) => {
    try {
        const existing = await req.repository.getApplication(req.params.id);
        if (!existing) return res.status(404).json({ success: false, error: 'Application not found' });
        if (String(existing.applicant_id || existing.applicantId || '') !== req.user.uid) {
            return res.status(403).json({ success: false, error: 'Access denied' });
        }
        const patch = { ...req.body };
        delete patch.applicantId;
        delete patch.applicant_id;
        delete patch.userId;
        const saved = await req.repository.saveApplication(req.params.id, { ...existing, ...patch, applicantId: req.user.uid });
        return res.json({ success: true, application: saved });
    } catch (_err) {
        return res.status(500).json({ success: false, error: 'Failed to update application' });
    }
});

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

module.exports = { jobsDataRouter: router };
