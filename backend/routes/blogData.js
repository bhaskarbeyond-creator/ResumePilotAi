const express = require('express');
const { getRepository } = require('../repositories');
const { requirePermission } = require('../security/auth');
const router = express.Router();

router.use((req, res, next) => {
    try {
        req.repository = getRepository();
        next();
    } catch (_err) {
        return res.status(500).json({ error: 'Database layer unavailable' });
    }
});

// GET /api/blog-data - List blog posts (Public read)
router.get('/', async (req, res) => {
    try {
        const posts = await req.repository.getBlogPosts({
            publishedOnly: req.query.publishedOnly === 'true',
            limit: req.query.limit,
        });
        return res.json({ success: true, posts });
    } catch (_err) {
        return res.status(500).json({ success: false, error: 'Failed to fetch blog posts' });
    }
});

// GET /api/blog-data/slug/:slug - Post by slug (Public read)
router.get('/slug/:slug', async (req, res) => {
    try {
        const post = await req.repository.getBlogPostBySlug(req.params.slug);
        if (!post) return res.status(404).json({ success: false, error: 'Post not found' });
        return res.json({ success: true, post });
    } catch (_err) {
        return res.status(500).json({ success: false, error: 'Failed to fetch blog post' });
    }
});

// GET /api/blog-data/:id - Post by ID (Public read / Author read)
router.get('/:id', async (req, res) => {
    try {
        const post = await req.repository.getBlogPostById(req.params.id);
        if (!post) return res.status(404).json({ success: false, error: 'Post not found' });
        return res.json({ success: true, post });
    } catch (_err) {
        return res.status(500).json({ success: false, error: 'Failed to fetch blog post' });
    }
});

// POST /api/blog-data/:id - Save post (Admin only)
router.post('/:id', requirePermission('system.config.write'), async (req, res) => {
    try {
        const saved = await req.repository.saveBlogPost(req.params.id, req.body);
        return res.json({ success: true, post: saved });
    } catch (_err) {
        return res.status(500).json({ success: false, error: 'Failed to save blog post' });
    }
});

// DELETE /api/blog-data/:id - Delete post (Admin only)
router.delete('/:id', requirePermission('system.config.write'), async (req, res) => {
    try {
        const expectedRevision = req.body?.expectedRevision ?? req.query?.expectedRevision;
        await req.repository.deleteBlogPost(req.params.id, expectedRevision);
        return res.json({ success: true });
    } catch (err) {
        const status = err.status || (err.code === 'REVISION_REQUIRED' ? 400 : err.code === 'CAS_CONFLICT' ? 409 : 500);
        return res.status(status).json({ success: false, error: err.message || 'Failed to delete blog post' });
    }
});

module.exports = { blogDataRouter: router };

