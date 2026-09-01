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

// Normalization helper for consistent frontend consumption
function normalizePostPayload(p) {
    if (!p || typeof p !== 'object') return p;
    const cover = p.cover_image || p.coverImage || p.featuredImage || p.featured_image || null;
    const category = p.category || p.categoryName || 'General';
    const publishedAt = p.publishedAt || p.published_at || p.created_at || p.createdAt || new Date().toISOString();
    return {
        ...p,
        featuredImage: cover,
        coverImage: cover,
        cover_image: cover,
        category,
        categoryName: category,
        publishedAt,
        createdAt: p.created_at || p.createdAt || publishedAt,
        status: p.status || (p.published ? 'approved' : 'draft'),
    };
}

// GET /api/blog-data - List blog posts (Public read)
router.get('/', async (req, res) => {
    try {
        const posts = await req.repository.getBlogPosts({
            publishedOnly: req.query.publishedOnly === 'true',
            limit: req.query.limit,
        });
        const normalized = (posts || []).map(normalizePostPayload);
        return res.json({ success: true, posts: normalized });
    } catch (_err) {
        return res.status(500).json({ success: false, error: 'Failed to fetch blog posts' });
    }
});

// GET /api/blog-data/categories - List blog categories (Public read)
router.get('/categories', async (req, res) => {
    try {
        const posts = await req.repository.getBlogPosts({});
        const categoryMap = new Map();
        for (const p of posts || []) {
            const catName = p.category || 'General';
            const catSlug = catName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
            if (!categoryMap.has(catSlug)) {
                categoryMap.set(catSlug, {
                    id: catSlug,
                    slug: catSlug,
                    name: catName,
                    color: ['#1a73e8', '#137333', '#7c3aed', '#b06000', '#0284c7'][categoryMap.size % 5],
                    postCount: 0
                });
            }
            categoryMap.get(catSlug).postCount += 1;
        }
        return res.json({ success: true, categories: Array.from(categoryMap.values()) });
    } catch (_err) {
        return res.json({ success: true, categories: [] });
    }
});

// GET /api/blog-data/slug/:slug - Post by slug (Public read)
router.get('/slug/:slug', async (req, res) => {
    try {
        const post = await req.repository.getBlogPostBySlug(req.params.slug);
        if (!post) return res.status(404).json({ success: false, error: 'Post not found' });
        return res.json({ success: true, post: normalizePostPayload(post) });
    } catch (_err) {
        return res.status(500).json({ success: false, error: 'Failed to fetch blog post' });
    }
});

// GET /api/blog-data/:id - Post by ID (Public read / Author read)
router.get('/:id', async (req, res) => {
    try {
        const post = await req.repository.getBlogPostById(req.params.id);
        if (!post) return res.status(404).json({ success: false, error: 'Post not found' });
        return res.json({ success: true, post: normalizePostPayload(post) });
    } catch (_err) {
        return res.status(500).json({ success: false, error: 'Failed to fetch blog post' });
    }
});

// POST /api/blog-data/:id - Save post (Admin only)
router.post('/:id', requirePermission(['system.config.write', 'blog.write', 'blog_management', 'content.manage']), async (req, res) => {
    try {
        const saved = await req.repository.saveBlogPost(req.params.id, req.body);
        return res.json({ success: true, post: saved });
    } catch (_err) {
        return res.status(500).json({ success: false, error: 'Failed to save blog post' });
    }
});

// DELETE /api/blog-data/:id - Delete post (Admin only)
router.delete('/:id', requirePermission(['system.config.write', 'blog.write', 'blog_management', 'content.manage']), async (req, res) => {
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

