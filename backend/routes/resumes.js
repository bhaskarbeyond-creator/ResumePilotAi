const express = require('express');
const { getRepository } = require('../repositories');
const { replyRepoError } = require('./errorResponder');
const router = express.Router();

router.use((req, res, next) => {
    try {
        req.repository = req.repository || getRepository();
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
        return replyRepoError(res, err, 'Failed to fetch resumes');
    }
});

// GET /api/resumes/public/:id - Get publicly published resume
router.get('/public/:id', async (req, res) => {
    try {
        const published = await req.repository.getPublicResume(req.params.id);
        if (!published || published.isPublished !== true || published.publicationMode !== 'explicit') {
            return res.status(404).json({ success: false, error: 'Resume not found or no longer published' });
        }
        let watermark = null;
        try {
            if (published.ownerUid && typeof req.repository.getUser === 'function') {
                const owner = await req.repository.getUser(published.ownerUid);
                const { isPaidMembershipTier } = require('../security/entitlements');
                const { isMembershipActive } = require('../database/domain');
                const isPaid = isPaidMembershipTier(owner?.membership) || isMembershipActive(owner);
                if (!isPaid) {
                    const publicConfig = (typeof req.repository.getSetting === 'function' ? await req.repository.getSetting('public_config') : null) || {};
                    const watermarkConfig = publicConfig.watermark;
                    if (watermarkConfig && watermarkConfig.enableFreeWatermark !== false) {
                        watermark = {
                            enableFreeWatermark: true,
                            watermarkText: watermarkConfig.watermarkText || 'Created with ResumePilot AI (Free Plan)',
                            opacity: Number(watermarkConfig.opacity) || 0.18,
                            position: watermarkConfig.position || 'diagonal'
                        };
                    }
                }
            }
        } catch (_wmErr) {
            // Graceful non-fatal fallback
        }

        const resumeData = { ...(published.data || {}) };
        if (watermark) {
            resumeData._watermark = watermark;
        }

        return res.json({
            success: true,
            resume: resumeData,
            watermark,
            publication: {
                isPublished: true,
                publishedAt: published.publishedAt,
                publicationRevision: published.publicationRevision,
                sourceRevision: published.sourceRevision,
            }
        });
    } catch (err) {
        console.error('[Resumes API] getPublicResume error:', err.message);
        return replyRepoError(res, err, 'Failed to fetch public resume');
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
        return replyRepoError(res, err, 'Failed to fetch resume');
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
            return res.status(409).json({
                success: false,
                error: err.message,
                code: err.code,
                remoteRevision: err.remoteRevision,
                remoteData: err.remoteData,
            });
        }
        console.error('[Resumes API] saveResume error:', err.message);
        return replyRepoError(res, err, 'Failed to save resume');
    }
});

// DELETE /api/resumes/:id - Delete resume (owner-scoped; 404 when not found/not owned)
router.delete('/:id', async (req, res) => {
    try {
        const result = await req.repository.deleteResume(req.user.uid, req.params.id);
        if (result === 0 || result === false) {
            return res.status(404).json({ success: false, error: 'Resume not found' });
        }
        return res.json({ success: true });
    } catch (err) {
        console.error('[Resumes API] deleteResume error:', err.message);
        return replyRepoError(res, err, 'Failed to delete resume');
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
            return res.status(409).json({
                success: false,
                error: err.message,
                code: err.code,
                remoteRevision: err.remoteRevision,
                remoteData: err.remoteData,
            });
        }
        return replyRepoError(res, err, 'Failed to publish resume');
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
        return replyRepoError(res, err, 'Failed to unpublish resume');
    }
});

// GET /api/resumes/:id/publication - Check publication status
router.get('/:id/publication', async (req, res) => {
    try {
        const result = await req.repository.getResumePublication(req.user.uid, req.params.id);
        return res.json({ success: true, ...result });
    } catch (err) {
        return replyRepoError(res, err, 'Failed to get publication status');
    }
});

module.exports = { resumesRouter: router };
