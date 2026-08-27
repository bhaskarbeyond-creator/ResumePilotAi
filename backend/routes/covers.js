const express = require('express');
const { getRepository } = require('../repositories');
const { replyRepoError } = require('./errorResponder');
const router = express.Router();

router.use((req, res, next) => {
    try {
        req.repository = getRepository(req.app.get('db'));
        next();
    } catch (_err) {
        return res.status(500).json({ error: 'Database layer unavailable' });
    }
});

// GET /api/covers - List user cover letters
router.get('/', async (req, res) => {
    try {
        const covers = await req.repository.getCovers(req.user.uid);
        return res.json({ success: true, covers });
    } catch (_err) {
        return res.status(500).json({ success: false, error: 'Failed to fetch cover letters' });
    }
});

// GET /api/covers/:id - Get single cover letter
router.get('/:id', async (req, res) => {
    try {
        const cover = await req.repository.getCover(req.user.uid, req.params.id);
        if (!cover) return res.status(404).json({ success: false, error: 'Cover letter not found' });
        return res.json({ success: true, cover });
    } catch (_err) {
        return res.status(500).json({ success: false, error: 'Failed to fetch cover letter' });
    }
});

// POST /api/covers/:id - Save cover letter
router.post('/:id', express.json({ limit: '5mb' }), async (req, res) => {
    try {
        const saved = await req.repository.saveCover(req.user.uid, req.params.id, req.body);
        return res.json({ success: true, cover: saved });
    } catch (err) {
        return replyRepoError(res, err, 'Failed to save cover letter');
    }
});

// DELETE /api/covers/:id - Delete cover letter
router.delete('/:id', async (req, res) => {
    try {
        await req.repository.deleteCover(req.user.uid, req.params.id);
        return res.json({ success: true });
    } catch (err) {
        return replyRepoError(res, err, 'Failed to delete cover letter');
    }
});

module.exports = { coversRouter: router };
