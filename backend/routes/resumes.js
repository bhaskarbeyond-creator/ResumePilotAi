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

// GET /api/resumes - List all resumes for current user
router.get('/', async (req, res) => {
    try {
        const resumes = await req.repository.getResumes(req.user.uid);
        return res.json({ success: true, resumes });
    } catch (err) {
        console.error('[Resumes API] getResumes error:', err.message);
        return res.status(500).json({ success: false, error: 'Failed to fetch resumes' });
    }
});

// GET /api/resumes/:id - Get single resume
router.get('/:id', async (req, res) => {
    try {
        const resume = await req.repository.getResume(req.user.uid, req.params.id);
        if (!resume) return res.status(404).json({ success: false, error: 'Resume not found' });
        return res.json({ success: true, resume });
    } catch (err) {
        console.error('[Resumes API] getResume error:', err.message);
        return res.status(500).json({ success: false, error: 'Failed to fetch resume' });
    }
});

// POST /api/resumes/:id - Save or update resume draft
router.post('/:id', express.json({ limit: '5mb' }), async (req, res) => {
    try {
        const { expectedRevision, ...resumeData } = req.body;
        const saved = await req.repository.saveResume(req.user.uid, req.params.id, resumeData, {
            expectedRevision: expectedRevision !== undefined ? expectedRevision : null
        });
        return res.json({ success: true, resume: saved });
    } catch (err) {
        if (err.code === 'RESUME_CONFLICT') {
            return res.status(409).json({ success: false, error: err.message, code: err.code, remoteRevision: err.remoteRevision });
        }
        console.error('[Resumes API] saveResume error:', err.message);
        return res.status(500).json({ success: false, error: 'Failed to save resume' });
    }
});

// DELETE /api/resumes/:id - Delete resume
router.delete('/:id', async (req, res) => {
    try {
        await req.repository.deleteResume(req.user.uid, req.params.id);
        return res.json({ success: true });
    } catch (err) {
        console.error('[Resumes API] deleteResume error:', err.message);
        return res.status(500).json({ success: false, error: 'Failed to delete resume' });
    }
});

// POST /api/resumes/:id/publish - Publish resume to public web link
router.post('/:id/publish', express.json({ limit: '5mb' }), async (req, res) => {
    try {
        const { expectedRevision, expectedPublicationRevision, resumeData } = req.body;
        const result = await req.repository.publishResume(req.user.uid, req.params.id, resumeData, {
            expectedRevision,
            expectedPublicationRevision,
        });
        return res.json({ success: true, ...result });
    } catch (err) {
        if (err.code === 'RESUME_CONFLICT' || err.code === 'RESUME_PUBLICATION_CONFLICT') {
            return res.status(409).json({ success: false, error: err.message, code: err.code });
        }
        return res.status(500).json({ success: false, error: err.message || 'Failed to publish resume' });
    }
});

// POST /api/resumes/:id/unpublish - Unpublish resume
router.post('/:id/unpublish', async (req, res) => {
    try {
        const { expectedPublicationRevision } = req.body || {};
        const result = await req.repository.unpublishResume(req.user.uid, req.params.id, {
            expectedPublicationRevision
        });
        return res.json({ success: true, ...result });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message || 'Failed to unpublish resume' });
    }
});

// GET /api/resumes/:id/publication - Check publication status
router.get('/:id/publication', async (req, res) => {
    try {
        const result = await req.repository.getResumePublication(req.user.uid, req.params.id);
        return res.json({ success: true, ...result });
    } catch (_err) {
        return res.status(500).json({ success: false, error: 'Failed to get publication status' });
    }
});

module.exports = { resumesRouter: router };
