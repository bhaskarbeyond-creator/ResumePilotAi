'use strict';

const express = require('express');
const crypto = require('crypto');
const { requireAuth } = require('../security/auth');
const { getRepository } = require('../repositories');
const mailer = require('../services/mailer');

const router = express.Router();

const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const ALLOWED_ROLES = new Set(['EMPLOYER', 'ADMIN', 'SUPER_ADMIN']);
const MAX_SUBJECT_LENGTH = 200;
const MAX_MESSAGE_LENGTH = 5000;
const DEFAULT_TEMPLATE = 'custom_message';

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function fail(res, status, code, message) {
  return res.status(status).json({ error: { code, message, requestId: res.locals?.requestId || null } });
}

function candidateIdsMatch(a, b) {
  return String(a || '').trim() === String(b || '').trim();
}

async function resolveApplication(repository, candidateId) {
  const application = await repository.getApplication(candidateId);
  return application || null;
}

function ownershipPermitted(application, callerUid) {
  if (!application) return false;
  const employerId = String(application.employerId || application.employer_id || '');
  return employerId.length > 0 && employerId === String(callerUid || '');
}

async function recordNotificationAudit(repository, { actorUid, actorEmail, action, outcome, pathname, statusCode, requestId, candidateId, recipientEmail, template, messageId, error }) {
  await repository.recordSecurityAuditLog({
    actorUid: actorUid || 'anonymous',
    actorEmail: actorEmail || null,
    action: 'RECRUITER_CANDIDATE_NOTIFIED',
    category: 'employer.recruitment',
    severity: 'MEDIUM',
    outcome,
    targetType: 'application',
    targetId: candidateId || null,
    method: 'POST',
    pathname: pathname || '',
    statusCode: Number(statusCode) || 200,
    requestId: requestId || null,
    metadata: {
      recipientEmail,
      template: template || DEFAULT_TEMPLATE,
      ...(messageId ? { messageId } : {}),
      ...(error ? { error: String(error) } : {}),
    },
  }).catch(_error => {
    // Audit failures must never turn a successful dispatch into an error, and
    // must never mask a mailer failure either.
  });
}

async function notifyHandler(req, res) {
  const repository = getRepository();
  const role = String(req.user?.claims?.role || '').toUpperCase();
  if (!ALLOWED_ROLES.has(role)) {
    return fail(res, 403, 'FORBIDDEN', 'Only employers and administrators can send candidate notifications.');
  }

  const body = req.body || {};
  const candidateId = String(body.candidateId || '').trim();
  const recipientEmail = String(body.recipientEmail || body.to || '').trim();
  const subject = String(body.subject || '').trim();
  const message = String(body.message || body.body || '').trim();
  const template = typeof body.template === 'string' && body.template.trim().length > 0
    ? body.template.trim()
    : DEFAULT_TEMPLATE;

  const invalid = [];
  if (!candidateId) invalid.push('candidateId');
  if (!recipientEmail || !EMAIL_REGEX.test(recipientEmail)) invalid.push('recipientEmail');
  if (!subject || subject.length > MAX_SUBJECT_LENGTH) invalid.push('subject');
  if (!message || message.length > MAX_MESSAGE_LENGTH) invalid.push('message');
  if (invalid.length > 0) {
    return fail(res, 400, 'INVALID_NOTIFICATION_PAYLOAD', `Missing or invalid fields: ${invalid.join(', ')}`);
  }

  let application;
  try {
    application = await resolveApplication(repository, candidateId);
  } catch (error) {
    return fail(res, 503, 'SERVICE_UNAVAILABLE', 'The candidate application record could not be read.');
  }
  if (!application) {
    return fail(res, 404, 'APPLICATION_NOT_FOUND', 'No candidate application was found for the given candidateId.');
  }
  const isPlatformAdmin = role === 'ADMIN' || role === 'SUPER_ADMIN';
  if (!isPlatformAdmin && !ownershipPermitted(application, req.user.uid)) {
    return fail(res, 403, 'FORBIDDEN', 'You do not own the job posting or candidate application this candidate belongs to.');
  }

  let messageId;
  try {
    const result = await mailer.sendMail({
      to: recipientEmail,
      subject,
      text: message,
      html: `<p>${escapeHtml(message)}</p>`,
    });
    messageId = String(result && result.messageId ? result.messageId : `msg_${crypto.randomUUID()}`);
  } catch (error) {
    await recordNotificationAudit(repository, {
      actorUid: req.user.uid, actorEmail: req.user.email, outcome: 'FAILURE',
      pathname: req.originalUrl || req.path, statusCode: 503, requestId: res.locals?.requestId,
      candidateId, recipientEmail, template, error,
    });
    return fail(res, 503, 'MAILER_GATEWAY_UNAVAILABLE', 'The email gateway is unavailable. The notification was not dispatched and no message was sent.');
  }

  await recordNotificationAudit(repository, {
    actorUid: req.user.uid, actorEmail: req.user.email, outcome: 'SUCCESS',
    pathname: req.originalUrl || req.path, statusCode: 200, requestId: res.locals?.requestId,
    candidateId, recipientEmail, template, messageId,
  });

  return res.status(200).json({
    success: true,
    messageId,
    dispatchedAt: new Date().toISOString(),
  });
}

router.post('/employer/candidates/:id/notify', requireAuth, notifyHandler);
router.post('/notify/email', requireAuth, notifyHandler);

module.exports = { notificationsRouter: router };
