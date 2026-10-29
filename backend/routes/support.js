'use strict';

const express = require('express');
const { requirePermission } = require('../security/auth');
const { replyRepoError } = require('./errorResponder');
const supportTickets = require('../services/supportTickets');

const userRouter = express.Router();
const adminRouter = express.Router();

const TICKET_CATEGORIES = new Set(['technical', 'billing', 'general']);
const TICKET_STATUSES = new Set(['open', 'in_progress', 'resolved', 'closed']);
const TICKET_PRIORITIES = new Set(['low', 'medium', 'high']);

function actorRole(req) {
  return String(req.user?.claims?.role || 'USER').toUpperCase();
}

function normalizeStatus(value) {
  return String(value || '').toLowerCase();
}

function normalizePriority(value) {
  return String(value || '').toUpperCase();
}

userRouter.post('/tickets', async (req, res) => {
  try {
    const { subject, category, priority, description } = req.body || {};
    if (category !== undefined && category !== null && !TICKET_CATEGORIES.has(String(category).toLowerCase())) {
      return res.status(400).json({ error: { code: 'INVALID_TICKET_CATEGORY', message: 'Category must be technical, billing or general.', requestId: res.locals?.requestId } });
    }
    const ticket = await supportTickets.createTicket({
      uid: req.user.uid,
      email: req.user.email,
      subject: req.body?.subject,
      body: req.body?.description || req.body?.body || req.body?.message,
      priority: req.body?.priority,
      category: category === undefined || category === null ? undefined : String(category).toLowerCase(),
    });
    return res.status(201).json({ success: true, ticket });
  } catch (error) {
    return replyRepoError(res, error, 'Unable to create support ticket.');
  }
});

userRouter.get('/tickets', async (req, res) => {
  try {
    const tickets = await supportTickets.listTicketsForUser({ uid: req.user.uid });
    res.setHeader('Cache-Control', 'no-store, private');
    return res.json({ success: true, tickets });
  } catch (error) {
    return replyRepoError(res, error, 'Unable to load support tickets.');
  }
});

userRouter.get('/tickets/:ticketId', async (req, res) => {
  try {
    const ticket = await supportTickets.getTicket({
      ticketId: req.params.ticketId,
      uid: req.user.uid,
      staff: false,
    });
    res.setHeader('Cache-Control', 'no-store, private');
    return res.json({ success: true, ticket });
  } catch (error) {
    return replyRepoError(res, error, 'Unable to load support ticket.');
  }
});

userRouter.post('/tickets/:ticketId/messages', async (req, res) => {
  try {
    const ticket = await supportTickets.addMessage({
      ticketId: req.params.ticketId,
      uid: req.user.uid,
      role: 'USER',
      body: req.body?.body || req.body?.message,
      staff: false,
    });
    return res.status(201).json({ success: true, ticket });
  } catch (error) {
    return replyRepoError(res, error, 'Unable to add ticket message.');
  }
});

userRouter.post('/tickets/:ticketId/reply', async (req, res) => {
  try {
    const { message } = req.body || {};
    const ticket = await supportTickets.addMessage({
      ticketId: req.params.ticketId,
      uid: req.user.uid,
      role: 'USER',
      body: message,
      staff: false,
    });
    const reply = latestMessage(ticket);
    return res.status(200).json({ success: true, reply });
  } catch (error) {
    return replyRepoError(res, error, 'Unable to reply to ticket.');
  }
});

adminRouter.use(requirePermission('tickets.manage'));

adminRouter.get('/tickets', async (req, res) => {
  try {
    const tickets = await supportTickets.listTicketsForStaff({
      status: req.query?.status,
      priority: req.query?.priority,
      limit: req.query?.limit,
      offset: req.query?.offset,
    });
    res.setHeader('Cache-Control', 'no-store, private');
    return res.json({ success: true, tickets });
  } catch (error) {
    return replyRepoError(res, error, 'Unable to load support tickets.');
  }
});

adminRouter.get('/tickets/:ticketId', async (req, res) => {
  try {
    const ticket = await supportTickets.getTicket({
      ticketId: req.params.ticketId,
      uid: req.user.uid,
      staff: true,
    });
    res.setHeader('Cache-Control', 'no-store, private');
    return res.json({ success: true, ticket });
  } catch (error) {
    return replyRepoError(res, error, 'Unable to load support ticket.');
  }
});

adminRouter.post('/tickets/:ticketId/messages', async (req, res) => {
  try {
    const ticket = await supportTickets.addMessage({
      ticketId: req.params.ticketId,
      uid: req.user.uid,
      role: actorRole(req),
      body: req.body?.body || req.body?.message,
      staff: true,
    });
    return res.status(201).json({ success: true, ticket });
  } catch (error) {
    return replyRepoError(res, error, 'Unable to add ticket message.');
  }
});

adminRouter.post('/tickets/:ticketId/reply', async (req, res) => {
  try {
    const { message } = req.body || {};
    const ticket = await supportTickets.addMessage({
      ticketId: req.params.ticketId,
      uid: req.user.uid,
      role: actorRole(req),
      body: message,
      staff: true,
    });
    const reply = latestMessage(ticket);
    return res.status(200).json({ success: true, reply });
  } catch (error) {
    return replyRepoError(res, error, 'Unable to reply to ticket.');
  }
});

adminRouter.patch('/tickets/:ticketId/status', async (req, res) => {
  try {
    const ticket = await supportTickets.updateTicketStatus({
      ticketId: req.params.ticketId,
      status: req.body?.status,
      resolutionNote: req.body?.resolutionNote,
    });
    return res.json({ success: true, ticket });
  } catch (error) {
    return replyRepoError(res, error, 'Unable to update ticket.');
  }
});

function latestMessage(ticket) {
  const messages = Array.isArray(ticket?.messages) ? ticket.messages : [];
  const latest = messages[messages.length - 1] || {};
  return {
    id: latest.id,
    senderUid: latest.authorUid,
    message: latest.body,
    createdAt: latest.createdAt,
  };
}

module.exports = { supportUserRouter: userRouter, supportAdminRouter: adminRouter };
