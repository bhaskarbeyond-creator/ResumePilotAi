'use strict';

const express = require('express');
const { getRepository } = require('../repositories');
const router = express.Router();

router.use((req, res, next) => {
    try {
        req.repository = getRepository(req.app.get('db'));
        next();
    } catch (_err) {
        return res.status(500).json({ error: 'Database layer unavailable' });
    }
});

// GET /api/jobs-data - List jobs (public read of active jobs; filters applied server-side)
router.get('/', async (req, res) => {
    try {
        const filters = { ...req.query };
        // Public job listing: only active jobs are exposed unless an
        // authenticated employer asks for their own jobs.
        if (!req.user) {
            filters.status = 'active';
        } else if (req.query.employerId && String(req.query.employerId) !== req.user.uid) {
            return res.status(403).json({ success: false, error: 'Access denied' });
        }
        const jobs = await req.repository.getJobs(filters);
        return res.json({ success: true, jobs });
    } catch (_err) {
        return res.status(500).json({ success: false, error: 'Failed to fetch jobs' });
    }
});

// GET /api/jobs-data/:id - Single job
router.get('/:id', async (req, res) => {
    try {
        const job = await req.repository.getJob(req.params.id);
        if (!job) return res.status(404).json({ success: false, error: 'Job not found' });
        return res.json({ success: true, job });
    } catch (_err) {
        return res.status(500).json({ success: false, error: 'Failed to fetch job' });
    }
});

// POST /api/jobs-data/:id - Save job (owner-scoped via authenticated employer)
router.post('/:id', async (req, res) => {
    try {
        const jobData = { ...req.body, employerId: req.user.uid, employer_id: req.user.uid };
        const saved = await req.repository.saveJob(req.params.id, jobData);
        return res.json({ success: true, job: saved });
    } catch (_err) {
        return res.status(500).json({ success: false, error: 'Failed to save job' });
    }
});

// DELETE /api/jobs-data/:id - Delete job (owner-scoped)
router.delete('/:id', async (req, res) => {
    try {
        const job = await req.repository.getJob(req.params.id);
        if (!job) return res.status(404).json({ success: false, error: 'Job not found' });
        if (String(job.employerId || job.employer_id || '') !== req.user.uid) {
            return res.status(403).json({ success: false, error: 'Access denied' });
        }
        await req.repository.deleteJob(req.params.id);
        return res.json({ success: true });
    } catch (_err) {
        return res.status(500).json({ success: false, error: 'Failed to delete job' });
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
