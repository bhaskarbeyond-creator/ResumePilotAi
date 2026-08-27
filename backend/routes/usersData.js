const express = require('express');
const { getRepository } = require('../repositories');
const { requireAuth, permissionsFor } = require('../security/auth');
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

// GET /api/users-data/profile - Current user profile
router.get('/profile', requireAuth, async (req, res) => {
    try {
        const user = await req.repository.getUser(req.user.uid);
        return res.json({ success: true, user });
    } catch (err) {
        return replyRepoError(res, err, 'Failed to fetch user profile');
    }
});

// POST /api/users-data/profile - Update current user profile
// Supports optimistic-concurrency via `expectedRevision`: when provided the
// save fails with 409 PROFILE_CONFLICT if the stored revision differs, so
// concurrent tabs/devices cannot silently overwrite each other (MySQL FOR
// UPDATE inside the repository transaction).
router.post('/profile', requireAuth, express.json({ limit: '2mb' }), async (req, res) => {
    try {
        const expectedRevision = req.body.expectedRevision !== undefined && req.body.expectedRevision !== null
            ? Number(req.body.expectedRevision)
            : null;
        // The revision guard is a protocol field, never profile data.
        const payload = { ...req.body };
        delete payload.expectedRevision;
        const saved = typeof req.repository.saveUserWithRevisionGuard === 'function' && expectedRevision !== null
            ? await req.repository.saveUserWithRevisionGuard(req.user.uid, payload, expectedRevision)
            : await req.repository.saveUser(req.user.uid, payload);
        return res.json({ success: true, user: saved });
    } catch (err) {
        if (err && err.code === 'PROFILE_CONFLICT') {
            return res.status(409).json({
                success: false,
                code: 'PROFILE_CONFLICT',
                error: err.message,
                remoteRevision: err.remoteRevision,
            });
        }
        return replyRepoError(res, err, 'Failed to save user profile');
    }
});

// GET /api/users-data/:id - Get a user profile.
// Privacy: the FULL record (email, payment status, revision, profile blob) is
// only returned to the account owner or to an operator holding users.read
// (Admin+). Every other authenticated caller receives a minimal public
// projection (display name + avatar) so a uid can never be used to enumerate
// another account's PII.
router.get('/:id', requireAuth, async (req, res) => {
    try {
        const targetId = String(req.params.id || '');
        const user = await req.repository.getUser(targetId);
        if (!user) return res.status(404).json({ success: false, error: 'User not found' });

        const isOwner = req.user?.uid === targetId;
        const isOperator = permissionsFor(req.user).has('users.read') || permissionsFor(req.user).has('*');
        if (isOwner || isOperator) {
            return res.json({ success: true, user });
        }

        const displayName = String(user.displayName || `${user.firstname || ''} ${user.lastname || ''}`.trim() || 'User');
        return res.json({
            success: true,
            user: {
                id: user.id,
                displayName,
                photoURL: user.photoURL || user.photoUrl || null,
            },
        });
    } catch (err) {
        return replyRepoError(res, err, 'Failed to fetch user');
    }
});

module.exports = { usersDataRouter: router };
