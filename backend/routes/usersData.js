const express = require('express');
const { getRepository } = require('../repositories');
const { requireAuth } = require('../security/auth');
const router = express.Router();

router.use((req, res, next) => {
    try {
        req.repository = getRepository(req.app.get('db'));
        next();
    } catch (err) {
        return res.status(500).json({ error: 'Database layer unavailable' });
    }
});

// GET /api/users-data/profile - Current user profile
router.get('/profile', requireAuth, async (req, res) => {
    try {
        const user = await req.repository.getUser(req.user.uid);
        return res.json({ success: true, user });
    } catch (err) {
        return res.status(500).json({ success: false, error: 'Failed to fetch user profile' });
    }
});

// POST /api/users-data/profile - Update current user profile
router.post('/profile', requireAuth, express.json({ limit: '2mb' }), async (req, res) => {
    try {
        const saved = await req.repository.saveUser(req.user.uid, req.body);
        return res.json({ success: true, user: saved });
    } catch (err) {
        return res.status(500).json({ success: false, error: 'Failed to save user profile' });
    }
});

// GET /api/users-data/:id - Get public or specific user info
router.get('/:id', async (req, res) => {
    try {
        const user = await req.repository.getUser(req.params.id);
        if (!user) return res.status(404).json({ success: false, error: 'User not found' });
        return res.json({ success: true, user });
    } catch (err) {
        return res.status(500).json({ success: false, error: 'Failed to fetch user' });
    }
});

module.exports = { usersDataRouter: router };
