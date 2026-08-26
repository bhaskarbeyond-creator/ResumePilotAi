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

// GET /api/notifications-data - List user notifications
router.get('/', async (req, res) => {
    try {
        const notifications = await req.repository.getNotifications(req.user.uid);
        return res.json({ success: true, notifications });
    } catch (_err) {
        return res.status(500).json({ success: false, error: 'Failed to fetch notifications' });
    }
});

// POST /api/notifications-data/:id - Save notification
router.post('/:id', async (req, res) => {
    try {
        const saved = await req.repository.saveNotification(req.user.uid, req.params.id, req.body);
        return res.json({ success: true, notification: saved });
    } catch (_err) {
        return res.status(500).json({ success: false, error: 'Failed to save notification' });
    }
});

// GET /api/notifications-data/contact/list - List contact submissions
router.get('/contact/list', async (req, res) => {
    try {
        const messages = await req.repository.getContactMessages();
        return res.json({ success: true, messages });
    } catch (_err) {
        return res.status(500).json({ success: false, error: 'Failed to fetch contact messages' });
    }
});

// POST /api/notifications-data/contact/:id - Save contact message
router.post('/contact/:id', async (req, res) => {
    try {
        const saved = await req.repository.saveContactMessage(req.params.id, req.body);
        return res.json({ success: true, message: saved });
    } catch (_err) {
        return res.status(500).json({ success: false, error: 'Failed to save contact message' });
    }
});

module.exports = { notificationsDataRouter: router };
