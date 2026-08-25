const express = require('express');
const { getRepository } = require('../repositories');
const router = express.Router();

router.use((req, res, next) => {
    try {
        req.repository = getRepository(req.app.get('db'));
        next();
    } catch (err) {
        return res.status(500).json({ error: 'Database layer unavailable' });
    }
});

// GET /api/blog-data - List blog posts
router.get('/', async (req, res) => {
    try {
        const posts = await req.repository.getBlogPosts({
            publishedOnly: req.query.publishedOnly === 'true',
            limit: req.query.limit,
        });
        return res.json({ success: true, posts });
    } catch (err) {
        return res.status(500).json({ success: false, error: 'Failed to fetch blog posts' });
    }
});

// GET /api/blog-data/slug/:slug - Post by slug
router.get('/slug/:slug', async (req, res) => {
    try {
        const post = await req.repository.getBlogPostBySlug(req.params.slug);
        if (!post) return res.status(404).json({ success: false, error: 'Post not found' });
        return res.json({ success: true, post });
    } catch (err) {
        return res.status(500).json({ success: false, error: 'Failed to fetch blog post' });
    }
});

// POST /api/blog-data/:id - Save post
router.post('/:id', async (req, res) => {
    try {
        const saved = await req.repository.saveBlogPost(req.params.id, req.body);
        return res.json({ success: true, post: saved });
    } catch (err) {
        return res.status(500).json({ success: false, error: 'Failed to save blog post' });
    }
});

// DELETE /api/blog-data/:id - Delete post
router.delete('/:id', async (req, res) => {
    try {
        await req.repository.deleteBlogPost(req.params.id);
        return res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ success: false, error: 'Failed to delete blog post' });
    }
});

module.exports = { blogDataRouter: router };
