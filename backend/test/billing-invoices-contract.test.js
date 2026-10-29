'use strict';

/**
 * Billing document contract suite (DISC-012 / DISC-048).
 *
 * DATABASE-BACKED: invoices are issued through the real invoice business
 * service (`issueInvoiceInTransaction`) and read back through the real Express
 * routes with a real MariaDB connection. Authorization, pagination, filtering,
 * HTML rendering and error handling are asserted over HTTP with supertest.
 */

process.env.NODE_ENV = 'test';
process.env.ENTERPRISE_TENANCY_ENABLED = process.env.ENTERPRISE_TENANCY_ENABLED || 'false';

const test = require('node:test');
const assert = require('node:assert/strict');

const fixtures = require('./helpers/mandate11a');
const { mariaTest, IDENTITIES, bearer, newId } = fixtures;

if (fixtures.isMariaEnabled()) fixtures.requireDisposableTarget();

const request = require('supertest');
const app = require('../index');
const { getPool } = require('../database/mysql');
const billing = require('../services/billingDocuments');

fixtures.installIdentities();

const createdInvoiceOrders = new Set();
let pool;

async function setup() {
  pool = getPool();
  await fixtures.seedUsers(pool);
}

async function invoiceFor(uid, email, overrides = {}) {
  const paymentOrderId = overrides.paymentOrderId || newId('order');
  createdInvoiceOrders.add(paymentOrderId);
  const invoice = await fixtures.issueInvoiceFixture({
    uid,
    email,
    paymentOrderId,
    amountSubunits: overrides.amountSubunits,
    customerOverrides: overrides.customerOverrides,
  });
  return invoice;
}

test.after(async () => {
  if (!fixtures.isMariaEnabled() || !pool) return;
  await fixtures.cleanup(pool, {
    userIds: Object.values(IDENTITIES).map(identity => identity.uid),
    outboxPrefixes: ['invoice-issued:'],
  });
  await pool.end().catch(() => {});
});

// ─── Authentication ─────────────────────────────────────────────────────────

mariaTest('billing endpoints reject anonymous callers with 401', async () => {
  await setup();
  for (const path of ['/api/billing/invoices', '/api/billing/invoices/abc', '/api/billing/invoices/abc/html']) {
    const response = await request(app).get(path);
    assert.equal(response.status, 401, `${path} must require authentication`);
    assert.equal(response.body?.error?.code, 'AUTH_REQUIRED');
  }
});

mariaTest('administrative ledger requires an administrative permission', async () => {
  await setup();
  const anonymous = await request(app).get('/api/admin/billing/invoices');
  assert.equal(anonymous.status, 401);

  const ordinaryUser = await request(app).get('/api/admin/billing/invoices').set(bearer('owner'));
  assert.equal(ordinaryUser.status, 403);
  assert.equal(ordinaryUser.body?.error?.code, 'FORBIDDEN');

  const auditor = await request(app).get('/api/admin/billing/invoices').set(bearer('auditor'));
  assert.equal(auditor.status, 200, 'payments.read is held by AUDITOR and must be sufficient');
});

// ─── Listing and detail ────────────────────────────────────────────────────

mariaTest('owner lists and reads their own invoices with exact financial fields', async () => {
  await setup();
  const invoice = await invoiceFor(IDENTITIES.owner.uid, IDENTITIES.owner.email, { amountSubunits: 118000 });

  const list = await request(app).get('/api/billing/invoices').set(bearer('owner'));
  assert.equal(list.status, 200);
  assert.equal(list.body.success, true);
  assert.ok(Array.isArray(list.body.invoices));
  assert.ok(list.body.total >= 1);
  const summary = list.body.invoices.find(entry => entry.invoiceNumber === invoice.invoiceNumber);
  assert.ok(summary, 'the issued invoice must appear in the owner ledger');
  assert.equal(summary.paymentOrderId, invoice.paymentOrderId);
  assert.equal(summary.status, 'PAID');
  assert.equal(summary.grandTotal, 1180);
  // Intra-state supply: 18% GST splits into 9% CGST + 9% SGST.
  assert.equal(summary.totalTax, 180);

  const detail = await request(app).get(`/api/billing/invoices/${invoice.paymentOrderId}`).set(bearer('owner'));
  assert.equal(detail.status, 200);
  const document = detail.body.invoice;
  assert.equal(document.invoiceNumber, invoice.invoiceNumber);
  assert.equal(document.currency, 'INR');
  assert.equal(document.currencySymbol, '₹');
  assert.equal(document.amounts.grandTotal, 1180);
  assert.equal(document.amounts.taxableAmount, 1000);
  assert.equal(document.amounts.totalTax, 180);
  assert.equal(document.tax.isIntraState, true);
  assert.equal(document.tax.cgstAmount, 90);
  assert.equal(document.tax.sgstAmount, 90);
  assert.equal(document.tax.igstAmount, 0);
  assert.equal(document.supplier.gstin, '37ABCDE1234F1Z5');
  assert.equal(document.customer.stateCode, '37');
  assert.equal(document.lineItems.length, 1);
  assert.equal(document.lineItems[0].taxableValue, 1000);
  assert.ok(document.paymentReference.startsWith('pi_'));

  // The ledger primary key resolves the same authorized document.
  const [ledgerRows] = await getPool().query('SELECT id FROM invoices WHERE payment_order_id = ? LIMIT 1', [invoice.paymentOrderId]);
  assert.equal(ledgerRows.length, 1);
  const byLedgerId = await request(app).get(`/api/billing/invoices/${ledgerRows[0].id}`).set(bearer('owner'));
  assert.equal(byLedgerId.status, 200);
  assert.equal(byLedgerId.body.invoice.invoiceNumber, invoice.invoiceNumber);
});

mariaTest('inter-state supply is taxed with IGST and no CGST/SGST', async () => {
  await setup();
  const invoice = await invoiceFor(IDENTITIES.owner.uid, IDENTITIES.owner.email, {
    amountSubunits: 236000,
    customerOverrides: { state: 'Karnataka', stateCode: '29', city: 'Bengaluru', pincode: '560001' },
  });
  const detail = await request(app).get(`/api/billing/invoices/${invoice.paymentOrderId}`).set(bearer('owner'));
  assert.equal(detail.status, 200);
  assert.equal(detail.body.invoice.tax.isIntraState, false);
  assert.equal(detail.body.invoice.tax.cgstAmount, 0);
  assert.equal(detail.body.invoice.tax.sgstAmount, 0);
  assert.equal(detail.body.invoice.tax.igstAmount, 360);
  assert.equal(detail.body.invoice.amounts.grandTotal, 2360);
});

mariaTest('cross-user isolation: another account can neither list nor read the invoice', async () => {
  await setup();
  const invoice = await invoiceFor(IDENTITIES.owner.uid, IDENTITIES.owner.email);

  const otherList = await request(app).get('/api/billing/invoices').set(bearer('other'));
  assert.equal(otherList.status, 200);
  assert.equal(otherList.body.invoices.some(entry => entry.invoiceNumber === invoice.invoiceNumber), false);
  assert.equal(
    otherList.body.invoices.every(entry => entry.paymentOrderId !== invoice.paymentOrderId),
    true,
    'another account must not see this invoice in its ledger'
  );

  const otherDetail = await request(app).get(`/api/billing/invoices/${invoice.paymentOrderId}`).set(bearer('other'));
  assert.equal(otherDetail.status, 404, 'a foreign invoice must be indistinguishable from a missing one');
  assert.equal(otherDetail.body?.error?.code, 'INVOICE_NOT_FOUND');

  const otherHtml = await request(app).get(`/api/billing/invoices/${invoice.paymentOrderId}/html`).set(bearer('other'));
  assert.equal(otherHtml.status, 404);
});

mariaTest('missing and malformed invoice identifiers return 404 without leaking existence', async () => {
  await setup();
  for (const id of [newId('missing'), 'x'.repeat(200), '%00']) {
    const response = await request(app).get(`/api/billing/invoices/${encodeURIComponent(id)}`).set(bearer('owner'));
    assert.equal(response.status, 404);
  }
});

// ─── Validation ────────────────────────────────────────────────────────────

mariaTest('pagination and status values are validated', async () => {
  await setup();
  const cases = [
    ['limit=0', 400, 'INVALID_PAGINATION'],
    ['limit=101', 400, 'INVALID_PAGINATION'],
    ['limit=abc', 400, 'INVALID_PAGINATION'],
    ['offset=-1', 400, 'INVALID_PAGINATION'],
    ['offset=1.5', 400, 'INVALID_PAGINATION'],
    ['status=DRAFT', 400, 'INVALID_INVOICE_STATUS'],
    ['status=PAID&status=REFUNDED', 400, 'INVALID_INVOICE_STATUS'],
    ['status=paid-refunded', 400, 'INVALID_INVOICE_STATUS'],
  ];
  for (const [query, status, code] of cases) {
    const response = await request(app).get(`/api/billing/invoices?${query}`).set(bearer('owner'));
    assert.equal(response.status, status, `${query} must be rejected`);
    assert.equal(response.body?.error?.code, code, `${query} must report ${code}`);
  }

  const valid = await request(app).get('/api/billing/invoices?limit=5&offset=0&status=PAID').set(bearer('owner'));
  assert.equal(valid.status, 200);
  assert.equal(valid.body.limit, 5);
  assert.equal(valid.body.offset, 0);
});

mariaTest('status filters partition the ledger accurately and totals follow the filter', async () => {
  await setup();
  const paidInvoice = await invoiceFor(IDENTITIES.owner.uid, IDENTITIES.owner.email);
  const refundedOrder = newId('order');
  createdInvoiceOrders.add(refundedOrder);
  const refundedInvoice = await fixtures.issueInvoiceFixture({
    uid: IDENTITIES.owner.uid,
    email: IDENTITIES.owner.email,
    paymentOrderId: refundedOrder,
  });
  await fixtures.creditNoteFixture({
    uid: IDENTITIES.owner.uid,
    email: IDENTITIES.owner.email,
    paymentOrderId: refundedOrder,
    ref: `re_${refundedOrder}`,
  });

  const refunded = await request(app).get('/api/billing/invoices?status=REFUNDED').set(bearer('owner'));
  assert.equal(refunded.status, 200);
  assert.ok(refunded.body.invoices.some(entry => entry.invoiceNumber === refundedInvoice.invoiceNumber));
  assert.equal(refunded.body.invoices.every(entry => entry.status === 'REFUNDED'), true);
  assert.equal(refunded.body.total, refunded.body.invoices.length, 'total must describe the same filter');

  const paid = await request(app).get('/api/billing/invoices?status=PAID').set(bearer('owner'));
  assert.equal(paid.status, 200);
  assert.ok(paid.body.invoices.some(entry => entry.invoiceNumber === paidInvoice.invoiceNumber));
  assert.equal(paid.body.invoices.some(entry => entry.invoiceNumber === refundedInvoice.invoiceNumber), false);
  assert.equal(paid.body.invoices.every(entry => entry.status === 'PAID'), true);

  const paged = await request(app).get('/api/billing/invoices?limit=1&offset=0').set(bearer('owner'));
  assert.equal(paged.body.invoices.length, 1);
  assert.ok(paged.body.total >= 2, 'total counts the whole filtered set, not the page');
});

// ─── Printable HTML ────────────────────────────────────────────────────────

mariaTest('printable invoice is standalone HTML with tax content and escaped payloads', async () => {
  await setup();
  const invoice = await invoiceFor(IDENTITIES.owner.uid, IDENTITIES.owner.email, {
    customerOverrides: {
      name: 'Evil <script>alert("xss")</script> & Co',
      company: '"><img src=x onerror=alert(1)>',
      address: '1 <b>Bold</b> Street',
    },
  });
  const response = await request(app)
    .get(`/api/billing/invoices/${invoice.paymentOrderId}/html`)
    .set(bearer('owner'))
    .buffer(true)
    .parse((res, callback) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => callback(null, data));
    });

  assert.equal(response.status, 200);
  assert.match(String(response.headers['content-type']), /^text\/html; charset=utf-8$/i);
  assert.match(String(response.headers['content-security-policy']), /default-src 'none'/);
  const html = String(response.body);
  assert.match(html, /<!DOCTYPE html>/i);
  assert.match(html, /CGST/);
  assert.match(html, /SGST/);
  assert.match(html, /37ABCDE1234F1Z5/, 'supplier GSTIN must be printed');
  assert.match(html, /IME365 Technologies Private Limited/);
  assert.match(html, /₹1,?180\.00|₹1180\.00/);

  // Neither script execution nor attribute break-out can survive escaping.
  assert.equal(/<script/i.test(html), false, 'no raw <script> may be emitted');
  assert.match(html, /&lt;script&gt;/);
  // The payload survives only as escaped text: there is no live <img> element
  // and no attribute position for it to break out of.
  assert.equal(/<img\s/i.test(html), false, 'injected markup must stay escaped text');
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /&quot;&gt;/);
});

// ─── Administrative ledger ────────────────────────────────────────────────

mariaTest('administrative ledger supports search and date filters before pagination', async () => {
  await setup();
  const invoice = await invoiceFor(IDENTITIES.owner.uid, IDENTITIES.owner.email);

  const byNumber = await request(app)
    .get(`/api/admin/billing/invoices?search=${encodeURIComponent(invoice.invoiceNumber)}`)
    .set(bearer('admin'));
  assert.equal(byNumber.status, 200);
  assert.ok(byNumber.body.invoices.some(entry => entry.invoiceNumber === invoice.invoiceNumber));
  assert.ok(byNumber.body.total >= 1);
  assert.equal(byNumber.body.invoices.every(entry => entry.invoiceNumber === invoice.invoiceNumber), true);

  const byCustomer = await request(app)
    .get(`/api/admin/billing/invoices?search=${encodeURIComponent(IDENTITIES.owner.email)}`)
    .set(bearer('admin'));
  assert.equal(byCustomer.status, 200);
  assert.ok(byCustomer.body.invoices.some(entry => entry.paymentOrderId === invoice.paymentOrderId));

  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const inWindow = await request(app)
    .get(`/api/admin/billing/invoices?startDate=${today}&endDate=${tomorrow}`)
    .set(bearer('admin'));
  assert.equal(inWindow.status, 200);
  assert.ok(inWindow.body.invoices.some(entry => entry.paymentOrderId === invoice.paymentOrderId));

  const beforeWindow = await request(app)
    .get('/api/admin/billing/invoices?startDate=2001-01-01&endDate=2001-02-01')
    .set(bearer('admin'));
  assert.equal(beforeWindow.status, 200);
  assert.equal(beforeWindow.body.invoices.length, 0);
  assert.equal(beforeWindow.body.total, 0);

  for (const [query, code] of [
    ['startDate=not-a-date', 'INVALID_DATE_FILTER'],
    ['endDate=2026-13-45', 'INVALID_DATE_FILTER'],
    [`startDate=${tomorrow}&endDate=${today}`, 'INVALID_DATE_RANGE'],
    [`search=${'x'.repeat(200)}`, 'INVALID_SEARCH'],
    ['limit=500', 'INVALID_PAGINATION'],
  ]) {
    const response = await request(app).get(`/api/admin/billing/invoices?${query}`).set(bearer('admin'));
    assert.equal(response.status, 400, `${query} must be rejected`);
    assert.equal(response.body?.error?.code, code);
  }
});

// ─── Failure handling ─────────────────────────────────────────────────────

mariaTest('database failure is reported without disclosing driver internals', async () => {
  await setup();
  const originalQuery = pool.query;
  pool.query = async () => {
    throw Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:3306 (user=root, password=hunter2)'), { code: 'ECONNREFUSED' });
  };
  try {
    const list = await request(app).get('/api/billing/invoices').set(bearer('owner'));
    assert.equal(list.status, 500);
    const serialized = JSON.stringify(list.body);
    assert.equal(/ECONNREFUSED|hunter2|127\.0\.0\.1/.test(serialized), false, 'no driver/credential detail may be returned');
    assert.equal(list.body?.error?.code, 'BILLING_REQUEST_FAILED');

    const detail = await request(app).get('/api/billing/invoices/anything').set(bearer('owner'));
    assert.equal(detail.status, 500);
    assert.equal(/ECONNREFUSED/.test(JSON.stringify(detail.body)), false);

    const admin = await request(app).get('/api/admin/billing/invoices').set(bearer('admin'));
    assert.equal(admin.status, 500);
    assert.equal(/ECONNREFUSED/.test(JSON.stringify(admin.body)), false);
  } finally {
    pool.query = originalQuery;
  }
});

// ─── Pure rendering/validation (executes without a database) ───────────────

test('html renderer escapes every dynamic field and emits no script', () => {
  const invoice = {
    invoiceNumber: 'IMX/26-27/000001"><script>alert(1)</script>',
    invoiceTitle: 'Tax Invoice',
    invoiceDate: '2026-01-01T00:00:00.000Z',
    formattedDate: '1 Jan 2026',
    financialYear: '26-27',
    paymentOrderId: 'order-1',
    paymentMethod: 'stripe',
    paymentReference: 'pi_1',
    paymentStatus: 'PAID',
    currency: 'INR',
    subtotal: 1000,
    taxableAmount: 1000,
    totalTax: 180,
    grandTotal: 1180,
    amountInWords: 'One Thousand One Hundred Eighty Rupees Only',
    gstRate: 18,
    isIntraState: true,
    cgstRate: 9,
    cgstAmount: 90,
    sgstRate: 9,
    sgstAmount: 90,
    igstRate: 0,
    igstAmount: 0,
    placeOfSupply: 'Andhra Pradesh (37)',
    reverseCharge: 'No',
    sacCode: '998313',
    supplierSnapshot: { legalName: '<b>Supplier</b>', gstin: '37ABCDE1234F1Z5' },
    customerSnapshot: { name: '<i>Customer</i>', email: 'x@y.test' },
    lineItems: [{ description: '</td></tr><script>x</script>', quantity: 1, unitPrice: 1000, taxableValue: 1000, gstRate: 18, total: 1180 }],
  };
  const html = billing.renderInvoiceHtml(invoice);
  assert.equal(/<script/i.test(html), false);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&lt;b&gt;Supplier&lt;\/b&gt;/);
  assert.match(html, /&lt;i&gt;Customer&lt;\/i&gt;/);
  assert.equal(html.includes('IMX/26-27/000001'), true);
  // No external resources, no inline handlers, no JS engine dependency.
  assert.equal(/https?:\/\//.test(html), false);
  assert.equal(/<script|onclick=|onload=/i.test(html), false);
});

test('pagination and status parsers reject unsupported input', () => {
  assert.deepEqual(billing.parsePagination({}), { limit: 20, offset: 0 });
  assert.deepEqual(billing.parsePagination({ limit: '100', offset: '0' }), { limit: 100, offset: 0 });
  assert.throws(() => billing.parsePagination({ limit: '0' }), error => error.code === 'INVALID_PAGINATION');
  assert.throws(() => billing.parsePagination({ offset: '-5' }), error => error.code === 'INVALID_PAGINATION');
  assert.equal(billing.parseStatus('paid'), 'PAID');
  assert.equal(billing.parseStatus(undefined), null);
  assert.throws(() => billing.parseStatus('VOID'), error => error.code === 'INVALID_INVOICE_STATUS');
});
