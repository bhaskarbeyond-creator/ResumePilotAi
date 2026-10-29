'use strict';

const nodemailer = require('nodemailer');

/**
 * Outbound mail gateway for recruitment/candidate notifications.
 *
 * Delivery is delegated to the configured SMTP transport (SMTP_HOST/SMTP_PORT
 * plus optional SMTP_USER/SMTP_PASSWORD/SMTP_FROM). When no SMTP transport is
 * configured the gateway fails closed: sendMail rejects and callers must NOT
 * report success to the client (a notification that was never sent must never
 * look like it was).
 *
 * Test injection: in NODE_ENV=test (or with ALLOW_TEST_AUTH_VERIFIER=true)
 * `setSendMailForTests` replaces the transport with a caller-supplied function
 * so suites can deterministically exercise both the success and failure paths
 * without an SMTP server.
 */

let transport = null;
let sendOverride = null;

function isTestInjectionAllowed() {
  return process.env.NODE_ENV === 'test' || process.env.ALLOW_TEST_AUTH_VERIFIER === 'true';
}

function buildTransportConfig() {
  const host = String(process.env.SMTP_HOST || '').trim();
  if (!host) return null;
  const config = {
    host,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
  };
  if (process.env.SMTP_USER) {
    config.auth = { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD || '' };
  }
  return config;
}

async function getTransport() {
  if (transport) return transport;
  const config = buildTransportConfig();
  if (!config) return null;
  transport = nodemailer.createTransport(config);
  return transport;
}

/**
 * Send a single email. Resolves with the provider response (which carries
 * `messageId` when the transport accepts the message). Rejects on any
 * transport/configuration/delivery failure.
 */
async function sendMail(options) {
  if (typeof sendOverride === 'function') return sendOverride(options);
  const transporter = await getTransport();
  if (!transporter) {
    const error = new Error('The email gateway is not configured');
    error.code = 'MAILER_NOT_CONFIGURED';
    throw error;
  }
  return transporter.sendMail({
    from: String(process.env.SMTP_FROM || 'no-reply@resumepilot.local'),
    ...options,
  });
}

function setSendMailForTests(fn) {
  if (!isTestInjectionAllowed()) {
    throw Object.assign(new Error('Mailer test injection is disabled outside tests'), { code: 'MAILER_TEST_INJECTION_FORBIDDEN' });
  }
  sendOverride = typeof fn === 'function' ? fn : null;
}

function resetSendMailForTests() {
  if (!isTestInjectionAllowed()) {
    throw Object.assign(new Error('Mailer test injection is disabled outside tests'), { code: 'MAILER_TEST_INJECTION_FORBIDDEN' });
  }
  sendOverride = null;
  transport = null;
}

module.exports = { sendMail, setSendMailForTests, resetSendMailForTests };
