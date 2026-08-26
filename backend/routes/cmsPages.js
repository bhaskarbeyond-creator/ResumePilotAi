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

// GET /api/cms-pages - List custom pages
router.get('/', async (req, res) => {
    try {
        const pages = await req.repository.getCustomPages({
            publishedOnly: req.query.publishedOnly === 'true'
        });
        return res.json({ success: true, pages });
    } catch (_err) {
        return res.status(500).json({ success: false, error: 'Failed to fetch pages' });
    }
});

// GET /api/cms-pages/slug/:slug - Page by slug
router.get('/slug/:slug', async (req, res) => {
    try {
        const page = await req.repository.getCustomPageBySlug(req.params.slug);
        if (!page) return res.status(404).json({ success: false, error: 'Page not found' });
        return res.json({ success: true, page });
    } catch (_err) {
        return res.status(500).json({ success: false, error: 'Failed to fetch page' });
    }
});

// POST /api/cms-pages/:id - Save page
router.post('/:id', async (req, res) => {
    try {
        const saved = await req.repository.saveCustomPage(req.params.id, req.body);
        return res.json({ success: true, page: saved });
    } catch (_err) {
        return res.status(500).json({ success: false, error: 'Failed to save page' });
    }
});

// DELETE /api/cms-pages/:id - Delete page
router.delete('/:id', async (req, res) => {
    try {
        await req.repository.deleteCustomPage(req.params.id);
        return res.json({ success: true });
    } catch (_err) {
        return res.status(500).json({ success: false, error: 'Failed to delete page' });
    }
});

// GET /api/cms-pages/trusted-by/list - Trusted by
router.get('/trusted-by/list', async (req, res) => {
    try {
        const list = await req.repository.getTrustedBy();
        return res.json({ success: true, trustedBy: list });
    } catch (_err) {
        return res.status(500).json({ success: false, error: 'Failed to fetch trusted by' });
    }
});

module.exports = { cmsPagesRouter: router };
