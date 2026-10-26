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
        req.repository = getRepository();
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

// GET /api/stats — public, measured operational counters only. Marketing
// display content has a separate revisioned owner under public configuration.
router.get('/stats', async (req, res) => {
    try {
        const stats = await req.repository.getStats();
        res.setHeader('Cache-Control', 'no-store');
        return res.json({ success: true, stats, source: 'MARIADB_OPERATIONAL_COUNTERS' });
    } catch (error) {
        return res.status(error.status || 503).json({
            success: false,
            code: error.code || 'STATS_UNAVAILABLE',
            error: 'Operational statistics are unavailable.',
            requestId: res.locals.requestId,
        });
    }
});

// POST /api/stats/increment — authenticated, atomic counter increments.
router.post('/stats/increment', requireAuth, express.json({ limit: '64kb' }), async (req, res) => {
    const key = String(req.body.key || '');
    const delta = req.body.delta === undefined ? 1 : Number(req.body.delta);
    if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key) || !Number.isSafeInteger(delta) || Math.abs(delta) > 100000) {
        return res.status(400).json({ success: false, code: 'INVALID_STAT_INCREMENT', error: 'A valid counter key and integer delta are required.' });
    }
    try {
        const counter = await req.repository.incrementStat(key, delta);
        return res.json({ success: true, counter });
    } catch (error) {
        return res.status(error.status || 503).json({
            success: false,
            code: error.code || 'STATS_UNAVAILABLE',
            error: error.status && error.status < 500 ? error.message : 'Operational statistics are unavailable.',
            requestId: res.locals.requestId,
        });
    }
});

// ───────────────────────────────────────────────────────────────────────────
// Public reviews (homepage testimonials)
// ───────────────────────────────────────────────────────────────────────────

// GET /api/reviews?limit=3 — public APPROVED reviews from the relational
// reviews owner. An outage is not represented as a valid empty testimonial set.
router.get('/reviews', async (req, res) => {
    try {
        const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 3));
        const reviews = await req.repository.getReviews({ approvedOnly: true, limit });
        res.setHeader('Cache-Control', 'no-store');
        return res.json({ success: true, reviews, source: 'MARIADB_REVIEWS' });
    } catch (_error) {
        return res.status(503).json({
            success: false,
            code: 'REVIEWS_UNAVAILABLE',
            error: 'Reviews are temporarily unavailable.',
            requestId: res.locals.requestId,
        });
    }
});

// ───────────────────────────────────────────────────────────────────────────
// Phrases / categories (landing page content; canonical_documents)
// ───────────────────────────────────────────────────────────────────────────

// GET /api/phrases — public phrase categories
router.get('/phrases', async (req, res) => {
    try {
        const docs = await req.repository.listDocuments('phrases', { limit: 500 });
        const categories = (docs || []).map(doc => ({ ...doc, id: doc.id }));
        return res.json({ success: true, categories });
    } catch (_err) {
        return res.status(500).json({ success: false, error: 'Failed to load phrases' });
    }
});

// POST /api/phrases — admin write (full category tree replace)
router.post('/phrases', requireAuth, requirePermission('system.config.write'), express.json({ limit: '1mb' }), async (req, res) => {
    try {
        const categories = (req.body.categories && typeof req.body.categories === 'object') ? req.body.categories : {};
        for (const [name, phrases] of Object.entries(categories)) {
            const id = String(name).slice(0, 128);
            const current = await req.repository.getDocument('phrases', id);
            await req.repository.saveDocument('phrases', id, {
                name: id,
                phrases: Array.isArray(phrases) ? phrases : [],
                revision: Number(current?.revision || 0) + 1,
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
        if (!doc) return res.json({ success: true, category: { id: req.params.category, name: req.params.category, phrases: [] } });
        return res.json({ success: true, category: { ...doc, id: doc.id } });
    } catch (_err) {
        return res.status(500).json({ success: false, error: 'Failed to load phrase category' });
    }
});

// DELETE /api/phrases/:category — delete a phrase category (Admin)
router.delete('/phrases/:category', requireAuth, requirePermission('system.config.write'), async (req, res) => {
    try {
        const categoryId = String(req.params.category || '').slice(0, 128);
        const current = await req.repository.getDocument('phrases', categoryId);
        if (!current) return res.status(404).json({ success: false, error: 'Phrase category not found' });
        const expectedRevisionRaw = req.body?.expectedRevision ?? req.query?.expectedRevision;
        const expectedRevision = expectedRevisionRaw !== undefined && expectedRevisionRaw !== null && expectedRevisionRaw !== '' ? Number(expectedRevisionRaw) : Number(current.revision || 1);
        await req.repository.deleteDocument('phrases', categoryId, expectedRevision);
        return res.json({ success: true, message: 'Phrase category deleted successfully.' });
    } catch (err) {
        const status = err.status || (err.code === 'CAS_CONFLICT' ? 409 : 500);
        return res.status(status).json({ success: false, error: err.message || 'Failed to delete phrase category' });
    }
});

module.exports = { miscDataRouter: router };
