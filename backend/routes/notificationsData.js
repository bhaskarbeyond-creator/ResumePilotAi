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

// GET /api/notifications-data - List user notifications
router.get('/', async (req, res) => {
    try {
        const notifications = await req.repository.getNotifications(req.user.uid);
        return res.json({ success: true, notifications });
    } catch (_err) {
        return res.status(500).json({ success: false, error: 'Failed to fetch notifications' });
    }
});

// PATCH /api/notifications-data/:id - Update the current user's notification
// (read/seen state). Owner-scoped: the id is looked up under the current uid.
router.patch('/:id', async (req, res) => {
    try {
        const pool = require('../database/mysql').getPool();
        const notificationId = String(req.params.id || '');
        if (!/^[A-Za-z0-9_-]{1,128}$/.test(notificationId)) return res.status(400).json({ success: false, error: 'Invalid notification id.' });
        if (typeof req.body?.read !== 'boolean' || Object.keys(req.body).some(key => key !== 'read')) {
            return res.status(400).json({ success: false, code: 'NOTIFICATION_PATCH_INVALID', error: 'Only the read state can be updated.' });
        }
        const [result] = await pool.query(
            'UPDATE notifications SET is_read = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
            [req.body.read ? 1 : 0, notificationId, req.user.uid]
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

module.exports = { notificationsDataRouter: router };
