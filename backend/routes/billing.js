'use strict';

/**
 * Billing document API.
 *
 *   GET /api/billing/invoices            the caller's own invoices, paged
 *   GET /api/billing/invoices/:id        one authorized invoice breakdown
 *   GET /api/billing/invoices/:id/html   the same invoice as printable HTML
 *   GET /api/admin/billing/invoices      administrative ledger (payments.read)
 *
 * AUTHENTICATION: the global `/api` boundary rejects anonymous callers with 401
 * before this router runs; `requireAuth` is repeated here so the router is also
 * correct when mounted in isolation (route tests, future re-mounts).
 *
 * OWNERSHIP: every owner-facing read is scoped by `user_id = req.user.uid`
 * inside the SQL predicate. A foreign invoice is indistinguishable from a
 * missing one (404), which prevents cross-tenant existence probing.
 */

const express = require('express');
const { requireAuth, requirePermission } = require('../security/auth');
const billing = require('../services/billingDocuments');

const router = express.Router();
const adminRouter = express.Router();

// Codes whose messages are authored for clients and safe to return verbatim,
// including on a 5xx (invoice/credit-note integrity failures).
const SAFE_MESSAGES = new Set([
  'INVOICE_RECORD_INVALID',
  'CREDIT_NOTE_RECORD_INVALID',
  'INVOICE_SUPPLIER_CONFIGURATION_INCOMPLETE',
  'DATABASE_UNAVAILABLE',
]);

function requestId(res) {
  return res.locals?.requestId;
}

function respondError(res, error, fallbackMessage) {
  const status = Number(error?.status) >= 400 && Number(error?.status) < 600 ? Number(error.status) : 500;
  const declared = typeof error?.code === 'string' && /^[A-Z][A-Z0-9_]{2,48}$/.test(error.code)
    ? error.code
    : null;
  // A 5xx must never echo a raw driver/transport code (ECONNREFUSED, ER_*, ...):
  // only the codes this router authors are allowed through.
  const code = status < 500 || (declared && SAFE_MESSAGES.has(declared))
    ? (declared || 'BILLING_REQUEST_REJECTED')
    : 'BILLING_REQUEST_FAILED';
  const safe = status < 500 || SAFE_MESSAGES.has(code);
  if (!safe) console.error('[billing]', code, error?.message || error);
  return res.status(status).json({
    success: false,
    error: {
      code,
      message: safe ? (error?.message || fallbackMessage) : (fallbackMessage || 'Billing is temporarily unavailable.'),
      requestId: requestId(res),
    },
  });
}

function requireAuthenticatedUser(req, res, next) {
  if (!req.user?.uid) {
    return res.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required', requestId: requestId(res) } });
  }
  return next();
}

router.get('/invoices', requireAuth, requireAuthenticatedUser, async (req, res) => {
  try {
    const result = await billing.listUserInvoices({ uid: req.user.uid, query: req.query || {} });
    return res.json({ success: true, invoices: result.invoices, total: result.total, limit: result.limit, offset: result.offset });
  } catch (error) {
    return respondError(res, error, 'Your invoices could not be loaded.');
  }
});

router.get('/invoices/:id', requireAuth, requireAuthenticatedUser, async (req, res) => {
  try {
    const invoice = await billing.getInvoiceDetail({ uid: req.user.uid, invoiceId: req.params.id });
    return res.json({ success: true, invoice });
  } catch (error) {
    return respondError(res, error, 'The invoice could not be loaded.');
  }
});

router.get('/invoices/:id/html', requireAuth, requireAuthenticatedUser, async (req, res) => {
  try {
    const html = await billing.getInvoiceHtml({ uid: req.user.uid, invoiceId: req.params.id });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    // The document is generated from an immutable snapshot and carries no
    // script; it must never be cached by a shared proxy.
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:");
    return res.send(html);
  } catch (error) {
    return respondError(res, error, 'The printable invoice could not be produced.');
  }
});

// Administrative ledger. `payments.read` is the repository's actual permission
// for reading payment/billing records (there is no separate `billing.read`
// permission in `security/auth.js`); the route-level check is repeated by
// `enforceApiPolicy`, so neither layer alone can be bypassed.
adminRouter.get('/invoices', requireAuth, requirePermission('payments.read'), async (req, res) => {
  try {
    const result = await billing.listAdminInvoices({ query: req.query || {} });
    return res.json({ success: true, invoices: result.invoices, total: result.total, limit: result.limit, offset: result.offset });
  } catch (error) {
    return respondError(res, error, 'The billing ledger could not be loaded.');
  }
});

module.exports = { billingRouter: router, adminBillingRouter: adminRouter };
