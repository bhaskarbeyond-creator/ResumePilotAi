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
const { isPubliclyVisibleJob } = require('./jobsData');

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

const plainObject = value => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

function isoOrNull(value) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * One favourite as its owner sees it (P002 C15).
 *  - The saved payload first (older clients read its fields at the top level),
 *    then the stored columns, so a payload can never pose as them. `data` is the
 *    payload exactly as it was saved, which is what Undo saves again.
 *  - `job`: a saved job's current title, company and location, only while
 *    GET /api/jobs-data/:id would show that job to the same caller (open on the
 *    job board, or the caller's own listing). POST accepts any id, so a closed,
 *    draft, expired or missing job all answer `null` alike.
 *  - `document`: a saved resume's or cover letter's title while the caller owns it.
 */
function favouriteView(row = {}, uid, now = Date.now()) {
    const data = plainObject(row.data);
    const job = row.job && typeof row.job === 'object' ? row.job : null;
    const listed = job ? isPubliclyVisibleJob({ status: job.status, expires_at: job.expiresAt }, now) : false;
    const owned = Boolean(job && uid && String(job.employerId || '') === String(uid));
    const document = row.document && typeof row.document === 'object' ? row.document : null;
    return {
        ...data,
        id: String(row.id || ''),
        itemId: String(row.itemId || ''),
        itemType: String(row.itemType || ''),
        createdAt: isoOrNull(row.createdAt),
        data,
        job: job && (listed || owned) ? {
            title: String(job.title || ''),
            company: String(job.company || ''),
            location: String(job.location || ''),
            listed,
        } : null,
        document: document ? { title: String(document.title || '') } : null,
    };
}

// A database outage is reported as one (503), never as an empty or failed list.
function replyFavouritesError(res, err, message) {
    if (Number(err?.status) === 503) {
        return res.status(503).json({ success: false, code: 'DATABASE_UNAVAILABLE', error: 'Saved items are temporarily unavailable' });
    }
    return res.status(500).json({ success: false, error: message });
}

// GET /api/favourites?type=resume|job — list the current user's favourites
router.get('/favourites', requireAuth, async (req, res) => {
    try {
        const itemType = String(req.query.type || '').slice(0, 50);
        const now = Date.now();
        const rows = await req.repository.getFavouritesWithItems(req.user.uid);
        let items = rows.map(row => favouriteView(row, req.user.uid, now));
        if (itemType) items = items.filter(item => item.itemType === itemType);
        return res.json({ success: true, favourites: items });
    } catch (err) {
        return replyFavouritesError(res, err, 'Failed to load favourites');
    }
});

// POST /api/favourites — add a favourite { itemId, itemType, data }. Saving an
// item again updates its payload; the answer is the stored favourite.
router.post('/favourites', requireAuth, express.json({ limit: '512kb' }), async (req, res) => {
    try {
        const itemId = String(req.body.itemId || req.body.item_id || '').trim();
        if (!itemId || itemId.length > 128) {
            return res.status(400).json({ success: false, error: 'itemId is required' });
        }
        const itemType = String(req.body.itemType || req.body.item_type || 'resume').slice(0, 50);
        const data = plainObject(req.body.data);
        const favourite = await req.repository.addFavourite(req.user.uid, itemId, itemType, data);
        return res.json({ success: true, favourite });
    } catch (err) {
        return replyFavouritesError(res, err, 'Failed to save favourite');
    }
});

// DELETE /api/favourites/:itemId — remove a favourite (owner-scoped). `removed`
// says whether one was removed; removing again is not an error.
router.delete('/favourites/:itemId', requireAuth, async (req, res) => {
    try {
        const removed = await req.repository.removeFavourite(req.user.uid, req.params.itemId);
        return res.json({ success: true, isFavourite: false, removed: Boolean(removed) });
    } catch (err) {
        return replyFavouritesError(res, err, 'Failed to remove favourite');
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
// Candidate document metrics (DIR-058)
//
// GET /api/user-stats — owner-scoped, MariaDB-backed counts for the candidate
// dashboard. These are MEASURED document counts, never a code default: a read
// failure returns 503 so the UI can render an honest unavailable state instead
// of a fabricated zero. The uid comes only from the verified token.
//
// NOTE ON LOCATION: the directive named backend/routes/platform.js, but that
// router is mounted at /api/platform, so it could not serve the specified
// /api/user-stats path. This router is mounted at /api (alongside /stats and
// /favourites), which is the correct home for a user-scoped misc endpoint.
// ───────────────────────────────────────────────────────────────────────────
router.get('/user-stats', requireAuth, async (req, res) => {
    const uid = req.user?.uid;
    if (!uid) {
        return res.status(401).json({ success: false, code: 'AUTH_REQUIRED', error: 'Authentication required' });
    }
    try {
        const repo = req.repository;
        const safe = async (fn) => {
            try { const value = await fn(); return value; } catch { return null; }
        };
        const [resumes, covers, portfolios, applications, trackedJobs, profile] = await Promise.all([
            safe(() => repo.getResumes(uid)),
            safe(() => repo.getCovers(uid)),
            safe(() => repo.getPortfolios(uid)),
            safe(() => repo.getApplications({ applicantId: uid })),
            safe(() => repo.getTrackedJobs(uid)),
            safe(() => (typeof repo.getUser === 'function' ? repo.getUser(uid) : null)),
        ]);
        const count = (value) => (Array.isArray(value) ? value.length : 0);
        const profileComplete = Boolean(
            profile
            && String(profile.firstname || '').trim()
            && String(profile.lastname || '').trim()
            && String(profile.email || '').trim()
            && String(profile.phone || '').trim(),
        );
        res.setHeader('Cache-Control', 'no-store');
        return res.json({
            success: true,
            source: 'MARIADB_USER_DOCUMENTS',
            stats: {
                resumes: count(resumes),
                coverLetters: count(covers),
                portfolios: count(portfolios),
                applications: count(applications),
                trackedJobs: count(trackedJobs),
                profileComplete,
            },
        });
    } catch (_error) {
        return res.status(503).json({
            success: false,
            code: 'USER_STATS_UNAVAILABLE',
            error: 'Candidate document metrics could not be read from MariaDB.',
        });
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
