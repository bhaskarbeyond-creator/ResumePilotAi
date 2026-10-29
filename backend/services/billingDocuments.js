'use strict';

/**
 * Billing document engine (DISC-012 / DISC-048).
 *
 * This module is the ONLY place the billing API shapes its responses. It reuses
 * the existing invoice business service (`services/invoiceService.js`) for every
 * read and every mapping decision — it never recalculates a stored invoice, and
 * it never invents tax data that the invoice payload does not contain:
 *
 *   - amounts, tax splits, GSTINs and party details come from the persisted
 *     `invoices.payload` snapshot that was frozen at issuance time;
 *   - a historical invoice therefore keeps the tax rate and supplier identity it
 *     was issued with, even after the platform's tax configuration changes.
 *
 * The HTML renderer produces a standalone, printable document with no external
 * scripts, no remote assets and no inline event handlers. Every dynamic value is
 * HTML-escaped on the way in.
 */

const invoices = require('./invoiceService');

const CURRENCY_SYMBOLS = Object.freeze({ INR: '₹', USD: '$', EUR: '€', GBP: '£' });
const MAX_SEARCH_LENGTH = 120;

function billingError(code, message, status = 400) {
  return Object.assign(new Error(message), { code, status });
}

/** Strict pagination for the API surface (the service clamps; routes do not). */
function parsePagination(query = {}) {
  const rawLimit = query.limit;
  const rawOffset = query.offset;
  const limit = rawLimit === undefined ? 20 : Number(rawLimit);
  const offset = rawOffset === undefined ? 0 : Number(rawOffset);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw billingError('INVALID_PAGINATION', 'limit must be an integer between 1 and 100.');
  }
  if (!Number.isInteger(offset) || offset < 0 || offset > 1_000_000) {
    throw billingError('INVALID_PAGINATION', 'offset must be a non-negative integer.');
  }
  return { limit, offset };
}

function parseStatus(value) {
  if (value === undefined || value === null || value === '') return null;
  const status = String(value).trim().toUpperCase();
  if (!invoices.INVOICE_STATUSES.includes(status)) {
    throw billingError('INVALID_INVOICE_STATUS', `status must be one of ${invoices.INVOICE_STATUSES.join(', ')}.`);
  }
  return status;
}

/** Derived, documented status for one invoice (see invoiceService). */
function invoiceStatus(invoice) {
  return invoice?.creditNote ? 'REFUNDED' : 'PAID';
}

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Compact list projection: no line items, no party addresses. */
function toInvoiceSummary(invoice) {
  return {
    id: invoice.invoiceNumber,
    invoiceNumber: invoice.invoiceNumber,
    paymentOrderId: invoice.paymentOrderId,
    status: invoiceStatus(invoice),
    invoiceDate: invoice.invoiceDate,
    currency: invoice.currency,
    taxableAmount: numberOrNull(invoice.taxableAmount),
    totalTax: numberOrNull(invoice.totalTax),
    grandTotal: numberOrNull(invoice.grandTotal),
    creditNoteNumber: invoice.creditNote?.creditNoteNumber || null,
  };
}

/** Full authorized breakdown for the detail endpoint. */
function toInvoiceDetail(invoice) {
  const supplier = invoice.supplierSnapshot || {};
  const customer = invoice.customerSnapshot || {};
  return {
    id: invoice.invoiceNumber,
    invoiceNumber: invoice.invoiceNumber,
    invoiceTitle: invoice.invoiceTitle || 'Tax Invoice',
    status: invoiceStatus(invoice),
    invoiceDate: invoice.invoiceDate,
    formattedDate: invoice.formattedDate,
    financialYear: invoice.financialYear,
    paymentOrderId: invoice.paymentOrderId,
    paymentMethod: invoice.paymentMethod,
    paymentReference: invoice.paymentReference,
    paymentStatus: invoice.paymentStatus,
    currency: invoice.currency,
    currencySymbol: CURRENCY_SYMBOLS[String(invoice.currency || '').toUpperCase()] || invoice.currency,
    amounts: {
      taxableAmount: numberOrNull(invoice.taxableAmount),
      subtotal: numberOrNull(invoice.subtotal),
      totalTax: numberOrNull(invoice.totalTax),
      grandTotal: numberOrNull(invoice.grandTotal),
      amountInWords: invoice.amountInWords || null,
    },
    tax: {
      isIntraState: invoice.isIntraState === true,
      gstRate: numberOrNull(invoice.gstRate),
      cgstRate: numberOrNull(invoice.cgstRate),
      cgstAmount: numberOrNull(invoice.cgstAmount),
      sgstRate: numberOrNull(invoice.sgstRate),
      sgstAmount: numberOrNull(invoice.sgstAmount),
      igstRate: numberOrNull(invoice.igstRate),
      igstAmount: numberOrNull(invoice.igstAmount),
      placeOfSupply: invoice.placeOfSupply || null,
      reverseCharge: invoice.reverseCharge || 'No',
      sacCode: invoice.sacCode || null,
    },
    supplier: {
      legalName: supplier.legalName || null,
      tradeName: supplier.tradeName || null,
      gstin: supplier.gstin || null,
      pan: supplier.pan || null,
      address: supplier.address || null,
      city: supplier.city || null,
      state: supplier.state || null,
      stateCode: supplier.stateCode || null,
      pincode: supplier.pincode || null,
      country: supplier.country || null,
      email: supplier.email || null,
      phone: supplier.phone || null,
      website: supplier.website || null,
    },
    customer: {
      name: customer.name || null,
      company: customer.company || null,
      email: customer.email || null,
      gstin: customer.gstin || null,
      type: customer.type || null,
      address: customer.address || null,
      city: customer.city || null,
      state: customer.state || null,
      stateCode: customer.stateCode || null,
      pincode: customer.pincode || null,
      country: customer.country || null,
    },
    lineItems: Array.isArray(invoice.lineItems)
      ? invoice.lineItems.map(item => ({
        description: item.description || null,
        sacCode: item.sacCode || null,
        quantity: numberOrNull(item.quantity),
        unitPrice: numberOrNull(item.unitPrice),
        taxableValue: numberOrNull(item.taxableValue),
        gstRate: numberOrNull(item.gstRate),
        total: numberOrNull(item.total),
      }))
      : [],
    creditNote: invoice.creditNote
      ? {
        creditNoteNumber: invoice.creditNote.creditNoteNumber,
        totalAmount: numberOrNull(invoice.creditNote.grandTotal),
        providerRefundId: invoice.creditNote.providerRefundIds?.[0] || null,
        issuedAt: invoice.creditNote.issuedAt || null,
      }
      : null,
  };
}

// ─── HTML rendering ──────────────────────────────────────────────────────────

const HTML_ESCAPES = Object.freeze({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' });

/** Escape every dynamic value used in HTML text AND attribute positions. */
function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, char => HTML_ESCAPES[char]);
}

function money(amount, currency) {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) return '—';
  const symbol = CURRENCY_SYMBOLS[String(currency || '').toUpperCase()] || `${currency || ''} `;
  return `${symbol}${numeric.toFixed(2)}`;
}

function percent(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${numeric}%` : '—';
}

/**
 * Render a standalone printable tax invoice.
 *
 * Security properties asserted by the billing suite:
 *   - `<script` never appears in the output, even when a stored field contains it;
 *   - attribute values are escaped (title/alt), so a `"` cannot break out;
 *   - no remote URL, CSS import or inline handler is emitted.
 */
function renderInvoiceHtml(invoice) {
  const detail = toInvoiceDetail(invoice);
  const currency = detail.currency;
  const lineRows = detail.lineItems.map(item => `
        <tr>
          <td>${escapeHtml(item.description)}</td>
          <td class="num">${escapeHtml(item.sacCode)}</td>
          <td class="num">${item.quantity === null ? '—' : escapeHtml(item.quantity)}</td>
          <td class="num">${escapeHtml(money(item.unitPrice, currency))}</td>
          <td class="num">${escapeHtml(money(item.taxableValue, currency))}</td>
          <td class="num">${escapeHtml(percent(item.gstRate))}</td>
          <td class="num">${escapeHtml(money(item.total, currency))}</td>
        </tr>`).join('');
  const taxRows = detail.tax.isIntraState
    ? `<tr><td>CGST (${escapeHtml(percent(detail.tax.cgstRate))})</td><td class="num">${escapeHtml(money(detail.tax.cgstAmount, currency))}</td></tr>
       <tr><td>SGST (${escapeHtml(percent(detail.tax.sgstRate))})</td><td class="num">${escapeHtml(money(detail.tax.sgstAmount, currency))}</td></tr>`
    : `<tr><td>IGST (${escapeHtml(percent(detail.tax.igstRate))})</td><td class="num">${escapeHtml(money(detail.tax.igstAmount, currency))}</td></tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(detail.invoiceTitle)} ${escapeHtml(detail.invoiceNumber)}</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body { font-family: "Helvetica Neue", Arial, sans-serif; color: #111827; margin: 0; padding: 32px; background: #f3f4f6; }
    .sheet { max-width: 820px; margin: 0 auto; background: #ffffff; padding: 40px; border: 1px solid #e5e7eb; }
    h1 { font-size: 22px; margin: 0 0 4px; letter-spacing: 0.02em; }
    h2 { font-size: 14px; margin: 24px 0 8px; text-transform: uppercase; letter-spacing: 0.08em; color: #374151; }
    .muted { color: #6b7280; font-size: 12px; }
    .row { display: flex; gap: 24px; justify-content: space-between; flex-wrap: wrap; }
    .parties { display: flex; gap: 24px; margin-top: 20px; flex-wrap: wrap; }
    .party { flex: 1 1 300px; border: 1px solid #e5e7eb; padding: 14px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { text-align: left; padding: 8px 6px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
    th { background: #f9fafb; font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; }
    .num { text-align: right; white-space: nowrap; }
    .totals { margin-left: auto; width: 320px; }
    .totals td { border-bottom: 1px solid #eef0f3; }
    .totals tr.grand td { font-weight: 700; font-size: 15px; border-top: 2px solid #111827; }
    .words { margin-top: 12px; font-size: 13px; }
    footer { margin-top: 28px; font-size: 11px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 12px; }
    @media print {
      body { background: #ffffff; padding: 0; }
      .sheet { border: 0; padding: 0; max-width: none; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <main class="sheet">
    <div class="row">
      <div>
        <h1>${escapeHtml(detail.supplier.legalName || detail.invoiceTitle)}</h1>
        <div class="muted">${escapeHtml(detail.supplier.address)}${detail.supplier.city ? `, ${escapeHtml(detail.supplier.city)}` : ''}${detail.supplier.state ? `, ${escapeHtml(detail.supplier.state)}` : ''}${detail.supplier.pincode ? ` - ${escapeHtml(detail.supplier.pincode)}` : ''}</div>
        ${detail.supplier.gstin ? `<div class="muted">GSTIN: ${escapeHtml(detail.supplier.gstin)}</div>` : ''}
        ${detail.supplier.email ? `<div class="muted">${escapeHtml(detail.supplier.email)}</div>` : ''}
      </div>
      <div>
        <h1>${escapeHtml(detail.invoiceTitle)}</h1>
        <div class="muted">Invoice No: ${escapeHtml(detail.invoiceNumber)}</div>
        <div class="muted">Date: ${escapeHtml(detail.formattedDate || detail.invoiceDate)}</div>
        <div class="muted">Status: ${escapeHtml(detail.status)}</div>
        <div class="muted">Financial Year: ${escapeHtml(detail.financialYear)}</div>
      </div>
    </div>

    <div class="parties">
      <section class="party">
        <h2>Billed To</h2>
        <div>${escapeHtml(detail.customer.name)}</div>
        ${detail.customer.company ? `<div class="muted">${escapeHtml(detail.customer.company)}</div>` : ''}
        <div class="muted">${escapeHtml(detail.customer.address)}${detail.customer.city ? `, ${escapeHtml(detail.customer.city)}` : ''}${detail.customer.state ? `, ${escapeHtml(detail.customer.state)}` : ''}${detail.customer.pincode ? ` - ${escapeHtml(detail.customer.pincode)}` : ''}</div>
        <div class="muted">${escapeHtml(detail.customer.email)}</div>
        ${detail.customer.gstin ? `<div class="muted">GSTIN: ${escapeHtml(detail.customer.gstin)}</div>` : ''}
        ${detail.customer.type ? `<div class="muted">${escapeHtml(detail.customer.type)}</div>` : ''}
      </section>
      <section class="party">
        <h2>Supply Details</h2>
        <div class="muted">Place of Supply: ${escapeHtml(detail.tax.placeOfSupply || '—')}</div>
        <div class="muted">Reverse Charge: ${escapeHtml(detail.tax.reverseCharge)}</div>
        <div class="muted">SAC: ${escapeHtml(detail.tax.sacCode || '—')}</div>
        <div class="muted">Payment Method: ${escapeHtml(detail.paymentMethod || '—')}</div>
        <div class="muted">Payment Reference: ${escapeHtml(detail.paymentReference || '—')}</div>
        <div class="muted">Payment Order: ${escapeHtml(detail.paymentOrderId)}</div>
      </section>
    </div>

    <h2>Line Items</h2>
    <table>
      <thead>
        <tr>
          <th>Description</th><th class="num">SAC</th><th class="num">Qty</th>
          <th class="num">Unit Price</th><th class="num">Taxable Value</th>
          <th class="num">GST</th><th class="num">Amount</th>
        </tr>
      </thead>
      <tbody>${lineRows || '<tr><td colspan="7" class="muted">No line items recorded.</td></tr>'}</tbody>
    </table>

    <table class="totals">
      <tbody>
        <tr><td>Taxable Value</td><td class="num">${escapeHtml(money(detail.amounts.taxableAmount, currency))}</td></tr>
        ${taxRows}
        <tr><td>Total Tax</td><td class="num">${escapeHtml(money(detail.amounts.totalTax, currency))}</td></tr>
        <tr class="grand"><td>Grand Total</td><td class="num">${escapeHtml(money(detail.amounts.grandTotal, currency))}</td></tr>
      </tbody>
    </table>
    ${detail.amounts.amountInWords ? `<p class="words"><strong>Amount in words:</strong> ${escapeHtml(detail.amounts.amountInWords)}</p>` : ''}
    ${detail.creditNote ? `<p class="words"><strong>Cancelled by credit note</strong> ${escapeHtml(detail.creditNote.creditNoteNumber)} (${escapeHtml(money(detail.creditNote.totalAmount, currency))})${detail.creditNote.providerRefundId ? ` — refund reference ${escapeHtml(detail.creditNote.providerRefundId)}` : ''}</p>` : ''}
    <footer>
      ${escapeHtml(detail.supplier.legalName || '')}${detail.supplier.tradeName && detail.supplier.tradeName !== detail.supplier.legalName ? ` (${escapeHtml(detail.supplier.tradeName)})` : ''}
      — computer-generated ${escapeHtml(detail.invoiceTitle)}. This document is reproducible from the immutable billing snapshot stored at issuance.
    </footer>
  </main>
</body>
</html>`;
}

// ─── Service entry points used by the routers ────────────────────────────────

async function listUserInvoices({ uid, query = {} }) {
  const { limit, offset } = parsePagination(query);
  const status = parseStatus(query.status);
  const rows = await invoices.listInvoicesForUser({ uid, limit, offset, status });
  const total = await invoices.countInvoicesForUser({ uid, status });
  return { invoices: rows.map(toInvoiceSummary), total, limit, offset };
}

async function getInvoiceDetail({ uid, invoiceId }) {
  const invoice = await invoices.getInvoiceForUserByIdentity({ uid, invoiceId });
  return toInvoiceDetail(invoice);
}

async function getInvoiceHtml({ uid, invoiceId }) {
  const invoice = await invoices.getInvoiceForUserByIdentity({ uid, invoiceId });
  return renderInvoiceHtml(invoice);
}

async function listAdminInvoices({ query = {} }) {
  const { limit, offset } = parsePagination(query);
  const status = parseStatus(query.status);
  const search = typeof query.search === 'string' ? query.search.trim() : '';
  if (search.length > MAX_SEARCH_LENGTH) {
    throw billingError('INVALID_SEARCH', `search must be ${MAX_SEARCH_LENGTH} characters or fewer.`);
  }
  const result = await invoices.listInvoicesForAdmin({
    limit,
    offset,
    status,
    startDate: query.startDate,
    endDate: query.endDate,
    search: search || null,
  });
  return {
    invoices: result.invoices.map(toInvoiceSummary),
    total: result.total,
    limit: result.limit,
    offset: result.offset,
  };
}

module.exports = {
  CURRENCY_SYMBOLS,
  billingError,
  escapeHtml,
  getInvoiceDetail,
  getInvoiceHtml,
  invoiceStatus,
  listAdminInvoices,
  listUserInvoices,
  money,
  parsePagination,
  parseStatus,
  renderInvoiceHtml,
  toInvoiceDetail,
  toInvoiceSummary,
};
