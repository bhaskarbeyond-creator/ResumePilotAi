const express = require('express');
const { getRepository } = require('../repositories');
const { requireAuth, permissionsFor } = require('../security/auth');
const { replyRepoError } = require('./errorResponder');
const { sanitizeProfilePatch, projectEditableProfile } = require('../services/profileSanitizer');
const router = express.Router();

router.use((req, res, next) => {
    try {
        req.repository = req.repository || getRepository();
        next();
    } catch (_err) {
        return res.status(503).json({ success: false, code: 'APPLICATION_DATABASE_UNAVAILABLE', error: 'Application database unavailable' });
    }
});

function selfUserProjection(user) {
    if (!user) return null;
    const { extra_data: _extraData, role: _legacyRole, suspended: _legacySuspended, ...applicationData } = user;
    return { ...applicationData, profile: projectEditableProfile(user) };
}

// GET /api/users-data/profile - Current user profile
router.get('/profile', requireAuth, async (req, res) => {
    try {
        const user = await req.repository.getUser(req.user.uid);
        if (!user) return res.status(404).json({ success: false, code: 'PROFILE_NOT_FOUND', error: 'Profile not found' });
        return res.json({ success: true, user: selfUserProjection(user) });
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
        const expectedRevision = Number(req.body?.expectedRevision);
        if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
            return res.status(400).json({ success: false, code: 'PROFILE_REVISION_REQUIRED', error: 'A non-negative expectedRevision is required.' });
        }
        if (req.body?.profile && Object.keys(req.body).some(key => !['profile', 'expectedRevision', 'userId'].includes(key))) {
            return res.status(400).json({ success: false, code: 'INVALID_PROFILE_ENVELOPE', error: 'Profile fields must be inside the profile object.' });
        }
        const requestedProfile = req.body?.profile && typeof req.body.profile === 'object'
            ? { ...req.body.profile }
            : Object.fromEntries(Object.entries(req.body || {}).filter(([key]) => key !== 'expectedRevision'));
        const submittedUserId = req.body?.userId || requestedProfile.userId;
        if (submittedUserId && String(submittedUserId) !== req.user.uid) {
            return res.status(403).json({ success: false, code: 'PROFILE_OWNER_MISMATCH', error: 'Cannot update another user profile.' });
        }
        delete requestedProfile.userId;
        const patch = sanitizeProfilePatch(requestedProfile, { identityEmail: req.user.email });
        const current = await req.repository.getUser(req.user.uid);
        const currentRevision = Number(current?.revision || 0);
        if (currentRevision !== expectedRevision) {
            return res.status(409).json({
                success: false, code: 'PROFILE_CONFLICT',
                error: 'Profile changed in another tab or device.',
                remoteRevision: currentRevision,
                remoteProfile: current ? projectEditableProfile(current) : null,
            });
        }
        const currentProfile = current ? projectEditableProfile(current) : {};
        const nextProfile = { ...currentProfile, ...patch };
        const payload = {
            ...nextProfile,
            id: req.user.uid,
            email: String(req.user.email || current?.email || '').trim().toLowerCase(),
            membership: current?.membership || 'Basic',
            membershipEnds: current?.membershipEnds || current?.membership_ends || null,
            paymentStatus: current?.paymentStatus || 'INACTIVE',
            lastPaymentGateway: current?.lastPaymentGateway || null,
            lastPaymentOrderId: current?.lastPaymentOrderId || null,
            extra_data: current?.extra_data || {},
        };
        const saved = await req.repository.saveUserWithRevisionGuard(req.user.uid, payload, expectedRevision);
        const authoritative = await req.repository.getUser(req.user.uid);
        return res.json({ success: true, user: selfUserProjection(authoritative || saved) });
    } catch (err) {
        if (err?.code === 'PROFILE_CONFLICT') {
            let remoteProfile = null;
            try {
                const remote = await req.repository.getUser(req.user.uid);
                remoteProfile = remote ? projectEditableProfile(remote) : null;
            } catch (readError) {
                console.error('[Profile conflict reload failed]', readError.message);
            }
            return res.status(409).json({
                success: false, code: 'PROFILE_CONFLICT', error: err.message,
                remoteRevision: err.remoteRevision,
                remoteProfile,
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
            return res.json({ success: true, user: selfUserProjection(user) });
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

// POST /api/users-data/mfa/disable - Server-assisted MFA unenroll with active authenticated session
router.post('/mfa/disable', requireAuth, async (req, res) => {
    const identityAdmin = req.app.get('firebaseAdmin') || require('../services/firebaseAdmin');
    if (!identityAdmin?.auth) return res.status(503).json({ success: false, code: 'IDENTITY_DIRECTORY_UNAVAILABLE', error: 'Identity service unavailable.' });
    try {
        const identity = await identityAdmin.auth().getUser(req.user.uid);
        const factors = identity.multiFactor?.enrolledFactors || [];
        await req.repository.recordSecurityAuditLog({
            action: 'USER_MFA_UNENROLL_REQUESTED', actorUid: req.user.uid, targetUid: req.user.uid,
            category: 'iam.users', severity: 'HIGH', targetType: 'USER', targetId: req.user.uid,
            metadata: { enrolledFactorCount: factors.length }, requestId: res.locals.requestId,
        });
        await identityAdmin.auth().updateUser(req.user.uid, { multiFactor: { enrolledFactors: [] } });
        await identityAdmin.auth().revokeRefreshTokens(req.user.uid);
        await req.repository.recordSecurityAuditLog({
            action: 'USER_MFA_UNENROLLED', actorUid: req.user.uid, targetUid: req.user.uid,
            category: 'iam.users', severity: 'HIGH', targetType: 'USER', targetId: req.user.uid,
            metadata: { removedFactorCount: factors.length }, requestId: res.locals.requestId,
        });
        return res.json({ success: true, mfaEnabled: false, removedFactorCount: factors.length });
    } catch (err) {
        console.error('[UsersData MFA disable error]:', err.message);
        return replyRepoError(res, err, 'Failed to disable MFA');
    }
});

module.exports = { usersDataRouter: router };
