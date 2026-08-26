'use strict';

/**
 * Misc user/public data routes — MySQL authoritative.
 *
 * These domains previously lived only in Firestore (users/{uid}/favourites,
 * data/stats, reviews, phrases). They are now served from MySQL tables:
 *   - favourites          -> favourites table (user-scoped, zero-trust)
 *   - stats               -> stats table (global_stats row)
 *   - reviews (public)    -> reviews table (APPROVED only)
 *   - phrases/categories  -> canonical_documents (entity_type phrases/categories)
 *
 * Firestore is never consulted on these paths.
 */

const express = require('express');
const { getRepository } = require('../repositories');
const { requireAuth, requirePermission } = require('../security/auth');

const router = express.Router();

router.use((req, res, next) => {
    try {
        req.repository = getRepository(req.app.get('db'));
        next();
    } catch (_err) {
        return res.status(500).json({ error: 'Database layer unavailable' });
    }
});

// ───────────────────────────────────────────────────────────────────────────
// Favourites (authenticated, owner-scoped)
// ───────────────────────────────────────────────────────────────────────────

// GET /api/favourites?type=resume|job — list the current user's favourites
router.get('/favourites', requireAuth, async (req, res) => {
    try {
        const itemType = String(req.query.type || '').slice(0, 50);
        let items = await req.repository.getFavourites(req.user.uid);
        if (itemType) items = items.filter(item => item.itemType === itemType);
        return res.json({ success: true, favourites: items });
    } catch (_err) {
        return res.status(500).json({ success: false, error: 'Failed to load favourites' });
    }
});

// POST /api/favourites — add a favourite { itemId, itemType, data }
router.post('/favourites', requireAuth, express.json({ limit: '512kb' }), async (req, res) => {
    try {
        const itemId = String(req.body.itemId || req.body.item_id || '').trim();
        if (!itemId || itemId.length > 128) {
            return res.status(400).json({ success: false, error: 'itemId is required' });
        }
        const itemType = String(req.body.itemType || req.body.item_type || 'resume').slice(0, 50);
        const data = (req.body.data && typeof req.body.data === 'object') ? req.body.data : {};
        const favourite = await req.repository.addFavourite(req.user.uid, itemId, itemType, data);
        return res.json({ success: true, favourite });
    } catch (_err) {
        return res.status(500).json({ success: false, error: 'Failed to save favourite' });
    }
});

// DELETE /api/favourites/:itemId — remove a favourite (owner-scoped)
router.delete('/favourites/:itemId', requireAuth, async (req, res) => {
    try {
        await req.repository.removeFavourite(req.user.uid, req.params.itemId);
        return res.json({ success: true, isFavourite: false });
    } catch (_err) {
        return res.status(500).json({ success: false, error: 'Failed to remove favourite' });
    }
});

// GET /api/favourites/:itemId/check — is this item favourited by the current user?
router.get('/favourites/:itemId/check', requireAuth, async (req, res) => {
    try {
        const isFavourite = await req.repository.isFavourite(req.user.uid, req.params.itemId);
        return res.json({ success: true, isFavourite });
    } catch (_err) {
        return res.status(500).json({ success: false, error: 'Failed to check favourite' });
    }
});

// ───────────────────────────────────────────────────────────────────────────
// Stats (public read; authenticated/admin write)
// ───────────────────────────────────────────────────────────────────────────

// GET /api/stats — public platform stats
router.get('/stats', async (req, res) => {
    try {
        const stats = await req.repository.getStats();
        return res.json({ success: true, stats });
    } catch (_err) {
        return res.status(500).json({ success: false, error: 'Failed to load stats' });
    }
});

// POST /api/stats/increment — authenticated counter increments (downloads, views, users)
router.post('/stats/increment', requireAuth, express.json({ limit: '64kb' }), async (req, res) => {
    try {
        const key = String(req.body.key || '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 64);
        const delta = Math.max(-100000, Math.min(100000, Number(req.body.delta) || 1));
        if (!key) return res.status(400).json({ success: false, error: 'key is required' });
        await req.repository.incrementStat(key, delta);
        return res.json({ success: true });
    } catch (_err) {
        return res.status(500).json({ success: false, error: 'Failed to update stats' });
    }
});

// POST /api/stats — admin-only full stats write
router.post('/stats', requireAuth, requirePermission('system.config.write'), express.json({ limit: '256kb' }), async (req, res) => {
    try {
        const stats = (req.body.stats && typeof req.body.stats === 'object') ? req.body.stats : {};
        const merged = { ...(await req.repository.getStats()), ...stats };
        await req.repository.saveSetting('stats', merged);
        await req.repository.incrementStat('_stats_updated', 0); // ensure row exists
        const pool = require('../database/mysql').getPool();
        await pool.query(
            `INSERT INTO stats (id, data, updated_at) VALUES ('global_stats', ?, CURRENT_TIMESTAMP)
             ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = CURRENT_TIMESTAMP`,
            [JSON.stringify(merged)]
        );
        return res.json({ success: true, stats: merged });
    } catch (_err) {
        return res.status(500).json({ success: false, error: 'Failed to save stats' });
    }
});

// ───────────────────────────────────────────────────────────────────────────
// Public reviews (homepage testimonials)
// ───────────────────────────────────────────────────────────────────────────

// GET /api/reviews?limit=3 — public APPROVED reviews
router.get('/reviews', async (req, res) => {
    try {
        const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 3));
        const docs = await req.repository.listDocuments('reviews', { limit: 500 });
        const approved = (docs || [])
            .filter(doc => String(doc.status || 'APPROVED').toUpperCase() === 'APPROVED')
            .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
            .slice(0, limit);
        return res.json({ success: true, reviews: approved });
    } catch (_err) {
        return res.status(500).json({ success: false, error: 'Failed to load reviews' });
    }
});

// ───────────────────────────────────────────────────────────────────────────
// Phrases / categories (landing page content; canonical_documents)
// ───────────────────────────────────────────────────────────────────────────

// GET /api/phrases — public phrase categories
router.get('/phrases', async (req, res) => {
    try {
        const docs = await req.repository.listDocuments('phrases', { limit: 500 });
        const payloads = (docs || []).map(doc => ({ id: doc.id, ...doc.payload }));
        return res.json({ success: true, categories: payloads });
    } catch (_err) {
        return res.status(500).json({ success: false, error: 'Failed to load phrases' });
    }
});

// POST /api/phrases — admin write (full category tree replace)
router.post('/phrases', requireAuth, requirePermission('system.config.write'), express.json({ limit: '1mb' }), async (req, res) => {
    try {
        const categories = (req.body.categories && typeof req.body.categories === 'object') ? req.body.categories : {};
        for (const [name, phrases] of Object.entries(categories)) {
            await req.repository.saveDocument('phrases', String(name).slice(0, 128), {
                name: String(name).slice(0, 128),
                phrases: Array.isArray(phrases) ? phrases : [],
                updatedAt: new Date().toISOString(),
            });
        }
        return res.json({ success: true });
    } catch (_err) {
        return res.status(500).json({ success: false, error: 'Failed to save phrases' });
    }
});

// GET /api/phrases/:category — single category
router.get('/phrases/:category', async (req, res) => {
    try {
        const doc = await req.repository.getDocument('phrases', req.params.category);
        if (!doc) return res.status(404).json({ success: false, error: 'Category not found' });
        return res.json({ success: true, category: { id: doc.id, ...doc.payload } });
    } catch (_err) {
        return res.status(500).json({ success: false, error: 'Failed to load phrase category' });
    }
});

module.exports = { miscDataRouter: router };
