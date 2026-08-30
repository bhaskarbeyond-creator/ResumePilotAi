'use strict';

/**
 * Messaging Routes — extracted from backend/index.js
 * 
 * EXACT implementation preserved from index.js.
 * Dependencies: getPool, getRepository, crypto, logger, safePublicUrl
 */

const express = require('express');
const crypto = require('crypto');
const { createLogger } = require('../services/logger');
const { getPool } = require('../database/mysql');
const { getRepository } = require('../repositories');
const { contactAccountLimiter } = require('../security/abuse');

const logger = createLogger({ module: 'messaging-routes' });
const router = express.Router();

// Helper — safe public URL (same as index.js)
function safePublicUrl(value) {
    if (typeof value !== 'string') return '';
    try {
        const url = new URL(value);
        if (url.protocol === 'https:' || url.protocol === 'http:') return value;
    } catch {}
    return '';
}

// Helper — notification event ID (same as index.js)
function notificationEventId(type, ...parts) {
    return crypto.createHash('sha256').update([type, ...parts].join('\0')).digest('hex').slice(0, 64);
}

// GET /api/messages/conversations — List conversations
router.get('/messages/conversations', async (req, res) => {
    try {
        const pool = getPool();
        const uid = req.user.uid;
        const [convRows] = await pool.query(
            `SELECT c.id, c.application_id AS applicationId
             FROM conversations c
             JOIN conversation_participants cp ON cp.conversation_id = c.id
             WHERE cp.user_id = ? AND c.deleted_at IS NULL
             ORDER BY c.created_at DESC
             LIMIT 100`,
            [uid]
        );
        const conversations = (convRows || []).map(row => ({
            id: row.id,
            applicationId: row.applicationId || null,
            participants: {},
            lastMessage: null,
        }));
        if (conversations.length) {
            const conversationIds = conversations.map(row => row.id);
            const placeholders = conversationIds.map(() => '?').join(',');
            const [partRows, lastRows] = await Promise.all([
                pool.query(
                    `SELECT conversation_id, user_id FROM conversation_participants
                     WHERE conversation_id IN (${placeholders})`,
                    conversationIds
                ),
                pool.query(
                    `SELECT conversationId, id, senderId, text, timestamp FROM (
                       SELECT m.conversation_id AS conversationId, m.id, m.sender_id AS senderId,
                              m.text, m.timestamp,
                              ROW_NUMBER() OVER (
                                  PARTITION BY m.conversation_id
                                  ORDER BY m.timestamp DESC, m.id DESC
                              ) AS rn
                       FROM conversation_messages m
                       WHERE m.conversation_id IN (${placeholders})
                     ) ranked WHERE ranked.rn = 1`,
                    conversationIds
                ),
            ]);
            const byId = new Map(conversations.map(row => [row.id, row]));
            for (const partRow of partRows[0] || []) {
                const conversation = byId.get(partRow.conversation_id);
                if (conversation) conversation.participants[partRow.user_id] = true;
            }
            for (const messageRow of lastRows[0] || []) {
                const conversation = byId.get(messageRow.conversationId);
                if (conversation && !conversation.lastMessage) {
                    conversation.lastMessage = {
                        id: messageRow.id,
                        senderId: messageRow.senderId,
                        text: messageRow.text,
                        timestamp: messageRow.timestamp,
                    };
                }
            }
        }
        conversations.sort((a, b) => (b.lastMessage?.timestamp || 0) - (a.lastMessage?.timestamp || 0));
        return res.json({ success: true, conversations });
    } catch (error) {
        logger.error('[List conversations]', { error: error.message, requestId: res.locals.requestId });
        return res.status(503).json({ success: false, error: 'Messaging is temporarily unavailable.' });
    }
});

// GET /api/messages/conversations/:conversationId/messages — List messages
router.get('/messages/conversations/:conversationId/messages', async (req, res) => {
    const conversationId = String(req.params.conversationId || '');
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(conversationId)) {
        return res.status(404).json({ success: false, error: 'Conversation not found.' });
    }
    try {
        const pool = getPool();
        const [membership] = await pool.query(
            'SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ?',
            [conversationId, req.user.uid]
        );
        if (!membership.length) {
            return res.status(404).json({ success: false, error: 'Conversation not found.' });
        }
        const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
        const [rows] = await pool.query(
            `SELECT id, sender_id AS senderId, text, timestamp
             FROM conversation_messages WHERE conversation_id = ?
             ORDER BY timestamp DESC, id DESC LIMIT ?`,
            [conversationId, limit]
        );
        const messages = rows.reverse();
        res.setHeader('Cache-Control', 'no-store, private');
        return res.json({ success: true, messages });
    } catch (error) {
        logger.error('[List messages]', { error: error.message, requestId: res.locals.requestId });
        return res.status(503).json({ success: false, error: 'Messages are temporarily unavailable.' });
    }
});

// POST /api/messages/conversations — Create conversation
router.post('/messages/conversations', async (req, res) => {
    const applicationId = String(req.body.applicationId || '');
    if (!/^[A-Za-z0-9:_-]{1,300}$/.test(applicationId)) {
        return res.status(400).json({ success: false, error: 'Valid job application is required.' });
    }
    try {
        const repo = getRepository();
        const application = await repo.getApplication(applicationId);
        if (!application) return res.status(404).json({ success: false, error: 'Job application not found.' });
        const applicationData = application;
        const job = await repo.getJob(applicationData.jobId || applicationData.job_id);
        const applicantUid = applicationData.userId || applicationData.applicant_id;
        const employerUid = job?.employerId || job?.employer_id;
        if (!applicantUid || !employerUid || ![applicantUid, employerUid].includes(req.user.uid)) {
            return res.status(403).json({ success: false, error: 'Conversation is not available to this account.' });
        }
        const participants = [String(applicantUid), String(employerUid)].sort();
        const conversationId = crypto.createHash('sha256').update(participants.join('\0')).digest('hex');
        const pool = getPool();
        const conn = await pool.getConnection();
        let created = false;
        try {
            await conn.beginTransaction();
            const [inserted] = await conn.query(
                'INSERT IGNORE INTO conversations (id, application_id) VALUES (?, ?)',
                [conversationId, applicationId]
            );
            created = inserted.affectedRows > 0;
            await conn.query(
                'INSERT IGNORE INTO conversation_participants (conversation_id, user_id) VALUES (?, ?), (?, ?)',
                [conversationId, participants[0], conversationId, participants[1]]
            );
            await conn.commit();
        } catch (txErr) {
            await conn.rollback().catch(() => {});
            throw txErr;
        } finally {
            conn.release();
        }
        return res.status(created ? 201 : 200).json({ success: true, conversationId, existing: !created });
    } catch (error) {
        logger.error('[Create conversation]', { error: error.message, requestId: res.locals.requestId });
        return res.status(503).json({ success: false, error: 'Messaging service unavailable.' });
    }
});

// GET /api/messages/conversations/:conversationId/participant-profile — Get participant profile
router.get('/messages/conversations/:conversationId/participant-profile', async (req, res) => {
    const conversationId = String(req.params.conversationId || '');
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(conversationId)) {
        return res.status(404).json({ success: false, error: 'Conversation not found.' });
    }
    try {
        const pool = getPool();
        const [membership] = await pool.query(
            'SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ?',
            [conversationId, req.user.uid]
        );
        if (!membership.length) {
            return res.status(404).json({ success: false, error: 'Conversation not found.' });
        }
        const [partRows] = await pool.query(
            'SELECT user_id FROM conversation_participants WHERE conversation_id = ?',
            [conversationId]
        );
        const participantIds = partRows.map(r => r.user_id);
        const otherUserId = participantIds.find(uid => uid !== req.user.uid);
        if (!otherUserId) return res.status(404).json({ success: false, error: 'Participant not found.' });
        if (otherUserId.startsWith('deleted_')) {
            res.setHeader('Cache-Control', 'no-store, private');
            return res.json({ success: true, profile: { name: 'Deleted account', avatar: '' } });
        }
        const repo = getRepository();
        const user = (await repo.getUser(otherUserId)) || {};
        const profile = user.profile || {};
        const name = String(profile.name || user.displayName || `${user.firstname || ''} ${user.lastname || ''}`.trim() || 'User').replace(/\p{Cc}/gu, ' ').trim().slice(0, 100);
        const avatar = safePublicUrl(profile.image || user.photoURL || '');
        res.setHeader('Cache-Control', 'no-store, private');
        return res.json({ success: true, profile: { name, avatar } });
    } catch (error) {
        logger.error('[Message participant profile]', { error: error.message, requestId: res.locals.requestId });
        return res.status(503).json({ success: false, error: 'Participant profile is unavailable.' });
    }
});

// POST /api/messages/send — Send message
router.post('/messages/send', async (req, res) => {
    const conversationId = String(req.body.conversationId || '');
    const text = String(req.body.text || '').trim();
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(conversationId) || !text || text.length > 10_000) {
        return res.status(400).json({ success: false, error: 'Valid conversation and message are required.' });
    }
    try {
        const pool = getPool();
        const [membership] = await pool.query(
            'SELECT 1 FROM conversation_participants WHERE conversation_id = ? AND user_id = ?',
            [conversationId, req.user.uid]
        );
        if (!membership.length) {
            return res.status(404).json({ success: false, error: 'Conversation not found.' });
        }
        const messageId = `msg_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
        const timestamp = Date.now();
        await pool.query(
            'INSERT INTO conversation_messages (id, conversation_id, sender_id, text, timestamp) VALUES (?, ?, ?, ?, ?)',
            [messageId, conversationId, req.user.uid, text, timestamp]
        );
        let notificationState = 'NOTIFICATION_CREATED';
        const [partRows] = await pool.query(
            'SELECT user_id FROM conversation_participants WHERE conversation_id = ?',
            [conversationId]
        );
        const recipientUid = partRows.map(r => r.user_id).find(uid => uid !== req.user.uid && !uid.startsWith('deleted_'));
        if (recipientUid) {
            try {
                const eventId = notificationEventId('message', conversationId, messageId);
                const repo = getRepository();
                await repo.saveNotification(recipientUid, eventId, {
                    eventId, state: 'NOTIFICATION_CREATED', deliveryState: 'NOT_REQUESTED', type: 'message', title: 'New message', message: 'You have a new message.',
                    data: { conversationId }, read: false,
                    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
                });
            } catch { notificationState = 'NOTIFICATION_CREATION_FAILED'; }
        } else notificationState = 'NOTIFICATION_CREATION_FAILED';
        return res.status(201).json({ success: true, messageId, notificationState });
    } catch (error) {
        logger.error('[Send message]', { error: error.message, requestId: res.locals.requestId });
        return res.status(503).json({ success: false, error: 'Messaging service unavailable.' });
    }
});

// POST /api/contact — Contact form
router.post('/contact', contactAccountLimiter, async (req, res) => {
    // Hidden honeypot field: bots that populate every field receive a generic success.
    if (req.body.website) return res.status(202).json({ success: true, message: 'Message accepted.' });
    const email = String(req.body.email || '').trim().toLowerCase();
    const name = String(req.body.name || '').trim();
    const message = String(req.body.message || '').trim();
    if (!/^[^\s@,;<>]{1,64}@[^\s@,;<>]{1,190}$/.test(email) || email.length > 254
        || name.length < 2 || name.length > 100 || message.length < 10 || message.length > 5000) {
        return res.status(400).json({ success: false, error: 'Valid name, email, and message are required.' });
    }
    try {
        const repo = getRepository();
        const msgId = `contact_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        await repo.saveContactMessage(msgId, {
            email, name, message, status: 'new',
            ip: String(req.ip || req.connection?.remoteAddress || '').slice(0, 45),
            userAgent: String(req.get('user-agent') || '').slice(0, 300),
        });
        return res.status(202).json({ success: true, message: 'Message accepted.' });
    } catch (err) {
        logger.error('[Contact message error]', { error: err.message, requestId: res.locals.requestId });
        return res.status(500).json({ success: false, error: 'Failed to submit contact message.' });
    }
});

module.exports = { messagingRouter: router };
