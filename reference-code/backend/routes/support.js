'use strict';

const express = require('express');
const { requirePermission } = require('../security/auth');
const { replyRepoError } = require('./errorResponder');
const supportTickets = require('../services/supportTickets');

const userRouter = express.Router();
const adminRouter = express.Router();

function actorRole(req) {
  return String(req.user?.claims?.role || 'USER').toUpperCase();
}

userRouter.post('/tickets', async (req, res) => {
  try {
    const ticket = await supportTickets.createTicket({
      uid: req.user.uid,
      email: req.user.email,
      subject: req.body?.subject,
      body: req.body?.body || req.body?.message,
      priority: req.body?.priority,
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

adminRouter.use(requirePermission('tickets.manage'));

adminRouter.get('/tickets', async (req, res) => {
  try {
    const tickets = await supportTickets.listTicketsForStaff({ status: req.query?.status });
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

adminRouter.patch('/tickets/:ticketId', async (req, res) => {
  try {
    const ticket = await supportTickets.updateTicketStatus({
      ticketId: req.params.ticketId,
      status: req.body?.status,
    });
    return res.json({ success: true, ticket });
  } catch (error) {
    return replyRepoError(res, error, 'Unable to update ticket.');
  }
});

module.exports = { supportUserRouter: userRouter, supportAdminRouter: adminRouter };
