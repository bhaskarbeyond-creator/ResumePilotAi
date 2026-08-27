const express = require('express');
const { getRepository } = require('../repositories');
const { requireAuth, requirePermission, requireAdmin } = require('../security/auth');
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

// PATCH /api/notifications-data/:id - Update the current user's notification
// (read/seen state). Owner-scoped: the id is looked up under the current uid.
router.patch('/:id', async (req, res) => {
    try {
        const pool = require('../database/mysql').getPool();
        const notificationId = String(req.params.id || '');
        if (!/^[A-Za-z0-9_-]{1,128}$/.test(notificationId)) return res.status(400).json({ success: false, error: 'Invalid notification id.' });
        const fields = [];
        const values = [];
        if (req.body.read !== undefined) { fields.push('is_read = ?'); values.push(req.body.read ? 1 : 0); }
        if (req.body.title !== undefined) { fields.push('title = ?'); values.push(String(req.body.title).slice(0, 255)); }
        if (req.body.message !== undefined) { fields.push('message = ?'); values.push(String(req.body.message).slice(0, 2000)); }
        if (!fields.length) return res.status(400).json({ success: false, error: 'No update fields supplied.' });
        values.push(notificationId, req.user.uid);
        const [result] = await pool.query(
            `UPDATE notifications SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`,
            values
        );
        if (!Number(result.affectedRows)) return res.status(404).json({ success: false, error: 'Notification not found' });
        return res.json({ success: true });
    } catch (_err) {
        return res.status(500).json({ success: false, error: 'Failed to update notification' });
    }
});

// GET /api/notifications-data/contact/list - List contact submissions (Admin / messages.read permission required)
router.get('/contact/list', requirePermission('messages.read'), async (req, res) => {
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
