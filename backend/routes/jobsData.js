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

// GET /api/jobs-data - List jobs
router.get('/', async (req, res) => {
    try {
        const jobs = await req.repository.getJobs(req.query);
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

// POST /api/jobs-data/:id - Save job
router.post('/:id', async (req, res) => {
    try {
        const jobData = { ...req.body, employerId: req.user.uid };
        const saved = await req.repository.saveJob(req.params.id, jobData);
        return res.json({ success: true, job: saved });
    } catch (_err) {
        return res.status(500).json({ success: false, error: 'Failed to save job' });
    }
});

// DELETE /api/jobs-data/:id - Delete job
router.delete('/:id', async (req, res) => {
    try {
        await req.repository.deleteJob(req.params.id);
        return res.json({ success: true });
    } catch (_err) {
        return res.status(500).json({ success: false, error: 'Failed to delete job' });
    }
});

// GET /api/jobs-data/applications/list - Get applications
router.get('/applications/list', async (req, res) => {
    try {
        const apps = await req.repository.getApplications(req.query);
        return res.json({ success: true, applications: apps });
    } catch (_err) {
        return res.status(500).json({ success: false, error: 'Failed to fetch applications' });
    }
});

// POST /api/jobs-data/applications/:id - Apply or update application
router.post('/applications/:id', async (req, res) => {
    try {
        const appData = { ...req.body, applicantId: req.user.uid };
        const saved = await req.repository.saveApplication(req.params.id, appData);
        return res.json({ success: true, application: saved });
    } catch (_err) {
        return res.status(500).json({ success: false, error: 'Failed to save application' });
    }
});

module.exports = { jobsDataRouter: router };
