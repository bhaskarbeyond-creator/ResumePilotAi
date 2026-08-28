'use strict';

const crypto = require('crypto');
const { getPool } = require('../database/mysql');
const { queueEmailInTransaction } = require('./notificationOutbox');

const INDIAN_STATES = Object.freeze({
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh',
  '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
  '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur',
  '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal',
  '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh',
  '24': 'Gujarat', '26': 'Dadra and Nagar Haveli and Daman and Diu', '27': 'Maharashtra',
  '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu',
  '34': 'Puducherry', '35': 'Andaman and Nicobar Islands', '36': 'Telangana',
  '37': 'Andhra Pradesh', '38': 'Ladakh',
});

const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/;

function invoiceError(code, message, status = 400) {
  return Object.assign(new Error(message), { code, status });
}

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function boundedText(value, field, max, { required = false } = {}) {
  const normalized = String(value || '').replace(/\p{Cc}/gu, ' ').trim();
  if ((required && !normalized) || Buffer.byteLength(normalized, 'utf8') > max) {
    throw invoiceError('INVALID_INVOICE_DETAILS', `${field} is ${required ? 'required and ' : ''}limited to ${max} bytes.`);
  }
  return normalized;
}

function stateCodeForName(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '';
  return Object.entries(INDIAN_STATES)
    .find(([, state]) => state.toLowerCase() === normalized)?.[0] || '';
}

function amountToIndianWords(amount, currency = 'INR') {
  const numeric = Math.abs(Number(amount) || 0);
  const whole = Math.floor(numeric);
  const fraction = Math.round((numeric - whole) * 100);
  const units = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const group = number => {
    if (number === 0) return '';
    if (number < 20) return units[number];
    if (number < 100) return `${tens[Math.floor(number / 10)]}${number % 10 ? ` ${units[number % 10]}` : ''}`;
    return `${units[Math.floor(number / 100)]} Hundred${number % 100 ? ` ${group(number % 100)}` : ''}`;
  };
  const integer = number => {
    if (number === 0) return 'Zero';
    const parts = [];
    const crore = Math.floor(number / 10_000_000); number %= 10_000_000;
    const lakh = Math.floor(number / 100_000); number %= 100_000;
    const thousand = Math.floor(number / 1_000); number %= 1_000;
    if (crore) parts.push(`${group(crore)} Crore`);
    if (lakh) parts.push(`${group(lakh)} Lakh`);
    if (thousand) parts.push(`${group(thousand)} Thousand`);
    if (number) parts.push(group(number));
    return parts.join(' ');
  };
  const mainUnit = currency === 'INR' ? 'Rupees' : currency === 'USD' ? 'Dollars' : 'Units';
  const subUnit = currency === 'INR' ? 'Paise' : 'Cents';
  return `${integer(whole)} ${mainUnit}${fraction ? ` and ${group(fraction)} ${subUnit}` : ''} Only`;
}

function supplierFromPublicConfig(data) {
  const subscriptions = parseJson(data, {}).subscriptions || {};
  const configText = (value, field, max, options) => {
    try { return boundedText(value, field, max, options); }
    catch (_error) {
      throw invoiceError(
        'INVOICE_SUPPLIER_CONFIGURATION_INCOMPLETE',
        'The legal supplier, GST, state, SAC, tax rate, invoice prefix, or financial-year configuration is incomplete.',
        503
      );
    }
  };
  const supplier = {
    legalName: configText(subscriptions.supplierLegalName, 'Supplier legal name', 150, { required: true }),
    tradeName: configText(subscriptions.supplierTradeName || subscriptions.supplierLegalName, 'Supplier trade name', 150, { required: true }),
    gstin: configText(subscriptions.supplierGstin || subscriptions.companyTaxId, 'Supplier GSTIN', 15, { required: true }).toUpperCase(),
    pan: configText(subscriptions.supplierPan, 'Supplier PAN', 10),
    address: configText(subscriptions.supplierAddress, 'Supplier address', 500, { required: true }),
    city: configText(subscriptions.supplierCity, 'Supplier city', 100, { required: true }),
    state: configText(subscriptions.supplierState, 'Supplier state', 100, { required: true }),
    stateCode: configText(subscriptions.supplierStateCode, 'Supplier state code', 2, { required: true }).padStart(2, '0'),
    pincode: configText(subscriptions.supplierPincode, 'Supplier pincode', 10, { required: true }),
    country: 'India',
    sacCode: configText(subscriptions.sacCode, 'SAC code', 6, { required: true }),
    gstRate: Number(subscriptions.taxRate),
    invoicePrefix: configText(subscriptions.invoicePrefix, 'Invoice prefix', 3, { required: true }).toUpperCase(),
    financialYear: configText(subscriptions.financialYear, 'Financial year', 5, { required: true }),
    email: configText(subscriptions.supplierEmail, 'Supplier email', 254),
    phone: configText(subscriptions.supplierPhone, 'Supplier phone', 30),
    website: configText(subscriptions.supplierWebsite, 'Supplier website', 255),
  };
  if (!GSTIN_PATTERN.test(supplier.gstin) || supplier.gstin.slice(0, 2) !== supplier.stateCode
      || !INDIAN_STATES[supplier.stateCode] || !/^\d{6}$/.test(supplier.pincode)
      || !/^\d{6}$/.test(supplier.sacCode) || !/^[A-Z0-9_-]{1,20}$/.test(supplier.invoicePrefix)
      || !/^\d{2}-\d{2}$/.test(supplier.financialYear)
      || !Number.isFinite(supplier.gstRate) || supplier.gstRate < 0 || supplier.gstRate > 100) {
    throw invoiceError(
      'INVOICE_SUPPLIER_CONFIGURATION_INCOMPLETE',
      'The legal supplier, GST, state, SAC, tax rate, invoice prefix, or financial-year configuration is incomplete.',
      503
    );
  }
  return supplier;
}

async function queueInvoiceEmail(connection, invoice) {
  const recipient = invoice?.customerSnapshot?.email;
  if (!recipient) throw invoiceError('INVOICE_CUSTOMER_EMAIL_MISSING', 'Customer email is required for invoice delivery.', 503);
  return queueEmailInTransaction(connection, {
    eventId: `invoice-issued:${invoice.paymentOrderId}`,
    idempotencyKey: `invoice-email:${invoice.paymentOrderId}`,
    recipient,
    templateType: 'tax_invoice',
    vars: {
      candidate_name: invoice.customerSnapshot.name,
      invoice_number: invoice.invoiceNumber,
      amount: `${invoice.currency} ${Number(invoice.grandTotal).toFixed(2)}`,
      plan_name: invoice.lineItems?.[0]?.description || 'ResumePilot AI Subscription',
      date: invoice.formattedDate,
      gstin: invoice.customerSnapshot.gstin || '',
    },
    metadata: { paymentOrderId: invoice.paymentOrderId, invoiceNumber: invoice.invoiceNumber },
  });
}

function normalizeCustomerDetails(input = {}, customer = {}) {
  const gstin = boundedText(input.customerGstin, 'Customer GSTIN', 15).toUpperCase();
  if (gstin && !GSTIN_PATTERN.test(gstin)) {
    throw invoiceError('INVALID_CUSTOMER_GSTIN', 'Customer GSTIN is invalid.');
  }

  const submittedCodeRaw = boundedText(input.customerStateCode, 'Customer state code', 2);
  const submittedCode = submittedCodeRaw ? submittedCodeRaw.padStart(2, '0') : '';
  const submittedState = boundedText(input.customerState, 'Customer state', 100);
  const codeFromName = stateCodeForName(submittedState);
  const gstinCode = gstin.slice(0, 2);
  const stateCode = gstinCode || (INDIAN_STATES[submittedCode] ? submittedCode : codeFromName);
  if (!INDIAN_STATES[stateCode]) {
    throw invoiceError('CUSTOMER_STATE_REQUIRED', 'A valid Indian customer state or GSTIN is required for a GST invoice.');
  }
  if ((gstinCode && submittedCode && submittedCode !== gstinCode)
      || (gstinCode && codeFromName && codeFromName !== gstinCode)
      || (submittedCode && codeFromName && submittedCode !== codeFromName)) {
    throw invoiceError('CUSTOMER_STATE_MISMATCH', 'Customer GSTIN, state, and state code do not match.');
  }

  const country = boundedText(input.customerCountry || 'India', 'Customer country', 80, { required: true });
  if (country.toLowerCase() !== 'india') {
    throw invoiceError('CUSTOMER_COUNTRY_UNSUPPORTED', 'INR GST invoices require an Indian billing address.');
  }
  const pincode = boundedText(input.customerPincode || input.customerPostalCode, 'Customer pincode', 6, { required: true });
  if (!/^\d{6}$/.test(pincode)) {
    throw invoiceError('INVALID_CUSTOMER_PINCODE', 'Customer pincode must contain exactly six digits.');
  }

  const profileName = customer.displayName || `${customer.firstname || ''} ${customer.lastname || ''}`.trim();
  const email = boundedText(customer.email, 'Customer email', 254, { required: true }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw invoiceError('INVALID_CUSTOMER_EMAIL', 'The authenticated customer email is invalid.');
  }
  return {
    name: boundedText(input.customerName || profileName, 'Customer name', 150, { required: true }),
    company: boundedText(input.customerCompany, 'Customer company', 150),
    email,
    gstin,
    type: gstin ? 'B2B' : 'B2C / Individual',
    address: boundedText(input.customerAddress, 'Customer address', 500, { required: true }),
    city: boundedText(input.customerCity, 'Customer city', 100, { required: true }),
    state: INDIAN_STATES[stateCode],
    stateCode,
    pincode,
    country: 'India',
  };
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function billingSnapshotHash(customerSnapshot, supplierSnapshot) {
  return crypto.createHash('sha256')
    .update(stableJson({ customerSnapshot, supplierSnapshot }))
    .digest('hex');
}

function validateSupplierSnapshot(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw invoiceError('BILLING_SNAPSHOT_INVALID', 'The supplier billing snapshot is invalid.', 503);
  }
  const supplier = {
    legalName: boundedText(input.legalName, 'Supplier legal name', 150, { required: true }),
    tradeName: boundedText(input.tradeName, 'Supplier trade name', 150, { required: true }),
    gstin: boundedText(input.gstin, 'Supplier GSTIN', 15, { required: true }).toUpperCase(),
    pan: boundedText(input.pan, 'Supplier PAN', 10),
    address: boundedText(input.address, 'Supplier address', 500, { required: true }),
    city: boundedText(input.city, 'Supplier city', 100, { required: true }),
    state: boundedText(input.state, 'Supplier state', 100, { required: true }),
    stateCode: boundedText(input.stateCode, 'Supplier state code', 2, { required: true }).padStart(2, '0'),
    pincode: boundedText(input.pincode, 'Supplier pincode', 10, { required: true }),
    country: 'India',
    sacCode: boundedText(input.sacCode, 'SAC code', 6, { required: true }),
    gstRate: Number(input.gstRate),
    invoicePrefix: boundedText(input.invoicePrefix, 'Invoice prefix', 3, { required: true }).toUpperCase(),
    financialYear: boundedText(input.financialYear, 'Financial year', 5, { required: true }),
    email: boundedText(input.email, 'Supplier email', 254),
    phone: boundedText(input.phone, 'Supplier phone', 30),
    website: boundedText(input.website, 'Supplier website', 255),
  };
  if (!GSTIN_PATTERN.test(supplier.gstin) || supplier.gstin.slice(0, 2) !== supplier.stateCode
      || !INDIAN_STATES[supplier.stateCode] || !/^\d{6}$/.test(supplier.pincode)
      || !/^\d{6}$/.test(supplier.sacCode) || !/^[A-Z0-9_-]{1,3}$/.test(supplier.invoicePrefix)
      || !/^\d{2}-\d{2}$/.test(supplier.financialYear)
      || !Number.isFinite(supplier.gstRate) || supplier.gstRate < 0 || supplier.gstRate > 100) {
    throw invoiceError('BILLING_SNAPSHOT_INVALID', 'The supplier billing snapshot failed validation.', 503);
  }
  return supplier;
}

function validateCustomerSnapshot(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw invoiceError('BILLING_SNAPSHOT_INVALID', 'The customer billing snapshot is invalid.', 503);
  }
  return normalizeCustomerDetails({
    customerName: input.name,
    customerCompany: input.company,
    customerGstin: input.gstin,
    customerAddress: input.address,
    customerCity: input.city,
    customerState: input.state,
    customerStateCode: input.stateCode,
    customerPincode: input.pincode,
    customerCountry: input.country,
  }, { email: input.email });
}

function createBillingSnapshots({ details, customer, publicConfig }) {
  const customerSnapshot = normalizeCustomerDetails(details, customer);
  const supplierSnapshot = supplierFromPublicConfig(publicConfig);
  return {
    customerSnapshot,
    supplierSnapshot,
    billingSnapshotHash: billingSnapshotHash(customerSnapshot, supplierSnapshot),
    billingSnapshotVersion: 1,
  };
}

function creditNoteFromRow(row, expectedUid, expectedPaymentOrderId, expectedInvoiceNumber) {
  if (!row?.credit_note_payload) return null;
  const creditNote = parseJson(row.credit_note_payload, null);
  if (!creditNote || typeof creditNote !== 'object'
      || creditNote.documentType !== 'CREDIT_NOTE'
      || creditNote.userId !== expectedUid
      || creditNote.paymentOrderId !== expectedPaymentOrderId
      || creditNote.originalInvoiceNumber !== expectedInvoiceNumber
      || creditNote.creditNoteNumber !== row.credit_note_number
      || (creditNote.refundReference || creditNote.providerRefundId) !== row.credit_note_provider_refund_id
      || String(creditNote.refundReferenceType || 'PROVIDER') !== String(row.credit_note_provider_refund_reference_type || 'PROVIDER')
      || !creditNote.supplierSnapshot?.legalName
      || !creditNote.customerSnapshot?.name
      || !Array.isArray(creditNote.lineItems)
      || !Number.isFinite(Number(creditNote.grandTotal))) {
    throw invoiceError('CREDIT_NOTE_RECORD_INVALID', 'The stored credit-note record failed its integrity projection.', 503);
  }
  const relationalAmounts = [
    row.credit_note_taxable_amount,
    row.credit_note_tax_amount,
    row.credit_note_total_amount,
  ];
  if (relationalAmounts.some(value => value !== undefined && value !== null)
      && relationalAmounts.map(Number).some((value, index) => !Number.isFinite(value)
        || Math.abs(value - [creditNote.taxableAmount, creditNote.totalTax, creditNote.grandTotal].map(Number)[index]) > 0.005)) {
    throw invoiceError('CREDIT_NOTE_RECORD_INVALID', 'The stored credit-note totals failed their integrity projection.', 503);
  }
  return creditNote;
}

function invoiceFromRow(row, expectedUid) {
  const invoice = parseJson(row?.payload, null);
  if (!invoice || typeof invoice !== 'object'
      || invoice.userId !== expectedUid
      || invoice.paymentOrderId !== row.payment_order_id
      || invoice.invoiceNumber !== row.invoice_number
      || !invoice.supplierSnapshot?.legalName
      || !invoice.customerSnapshot?.name
      || !Array.isArray(invoice.lineItems)
      || !Number.isFinite(Number(invoice.grandTotal))) {
    throw invoiceError('INVOICE_RECORD_INVALID', 'The stored invoice record failed its integrity projection.', 503);
  }
  const creditNote = creditNoteFromRow(
    row,
    expectedUid,
    row.payment_order_id,
    row.invoice_number
  );
  if (creditNote && (creditNote.currency !== invoice.currency
      || Math.abs(Number(creditNote.grandTotal) - Number(invoice.grandTotal)) > 0.005
      || Math.abs(Number(creditNote.totalTax) - Number(invoice.totalTax)) > 0.005
      || Math.abs(Number(creditNote.taxableAmount) - Number(invoice.taxableAmount)) > 0.005)) {
    throw invoiceError('CREDIT_NOTE_RECORD_INVALID', 'The credit note does not fully reverse its source invoice.', 503);
  }
  return creditNote ? { ...invoice, creditNote } : invoice;
}

async function listInvoicesForUser({ uid, limit = 50 }) {
  if (!uid) throw invoiceError('AUTH_REQUIRED', 'Authentication is required.', 401);
  const boundedLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const [rows] = await getPool().query(
    `SELECT i.invoice_number, i.payment_order_id, i.payload,
            cn.credit_note_number, cn.provider_refund_id AS credit_note_provider_refund_id,
            cn.provider_refund_reference_type AS credit_note_provider_refund_reference_type,
            cn.taxable_amount AS credit_note_taxable_amount,
            cn.tax_amount AS credit_note_tax_amount,
            cn.total_amount AS credit_note_total_amount,
            cn.payload AS credit_note_payload
     FROM invoices i
     LEFT JOIN credit_notes cn ON cn.invoice_id = i.id
     WHERE i.user_id = ?
     ORDER BY i.issued_at DESC
     LIMIT ?`,
    [uid, boundedLimit]
  );
  return rows.map(row => invoiceFromRow(row, uid));
}

async function getInvoiceForUser({ uid, paymentOrderId }) {
  if (!uid) throw invoiceError('AUTH_REQUIRED', 'Authentication is required.', 401);
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(String(paymentOrderId || ''))) {
    throw invoiceError('INVOICE_NOT_FOUND', 'Invoice not found.', 404);
  }
  const [rows] = await getPool().query(
    `SELECT i.invoice_number, i.payment_order_id, i.payload,
            cn.credit_note_number, cn.provider_refund_id AS credit_note_provider_refund_id,
            cn.provider_refund_reference_type AS credit_note_provider_refund_reference_type,
            cn.taxable_amount AS credit_note_taxable_amount,
            cn.tax_amount AS credit_note_tax_amount,
            cn.total_amount AS credit_note_total_amount,
            cn.payload AS credit_note_payload
     FROM invoices i
     LEFT JOIN credit_notes cn ON cn.invoice_id = i.id
     WHERE i.user_id = ? AND i.payment_order_id = ?
     LIMIT 1`,
    [uid, paymentOrderId]
  );
  if (!rows.length) throw invoiceError('INVOICE_NOT_FOUND', 'Invoice not found.', 404);
  return invoiceFromRow(rows[0], uid);
}

async function issueCreditNoteInTransaction(connection, {
  order,
  providerRefundId,
  providerRefundReferenceType = 'PROVIDER',
  providerRefunds = [],
  reason,
  actorUid = 'payment-provider',
} = {}) {
  if (!connection || typeof connection.query !== 'function') {
    throw invoiceError('CREDIT_NOTE_TRANSACTION_REQUIRED', 'Credit-note issuance requires an active database transaction.', 503);
  }
  const paymentOrderId = String(order?.id || '');
  const uid = String(order?.uid || '');
  const normalizedRefundId = boundedText(providerRefundId, 'Refund reconciliation reference', 255, { required: true });
  const referenceType = String(providerRefundReferenceType || 'PROVIDER').trim().toUpperCase();
  if (!['PROVIDER', 'AGGREGATE'].includes(referenceType)) {
    throw invoiceError('REFUND_REFERENCE_TYPE_INVALID', 'Refund reconciliation reference type is invalid.', 409);
  }
  const normalizedProviderRefunds = (Array.isArray(providerRefunds) ? providerRefunds : []).map(refund => ({
    id: boundedText(refund?.id || refund?.providerRefundId, 'Provider refund id', 255, { required: true }),
    provider: boundedText(refund?.provider || order?.provider, 'Refund provider', 32, { required: true }).toLowerCase(),
    status: boundedText(refund?.status, 'Provider refund status', 32, { required: true }).toUpperCase(),
    amount: Number(refund?.amount ?? refund?.amountMinor),
    currency: boundedText(refund?.currency, 'Provider refund currency', 3, { required: true }).toUpperCase(),
  }));
  if (referenceType === 'AGGREGATE' && normalizedProviderRefunds.length < 2) {
    throw invoiceError('REFUND_AGGREGATE_INVALID', 'Aggregate refund evidence is incomplete.', 409);
  }
  const normalizedReason = boundedText(reason, 'Refund reason', 500, { required: true });
  if (!paymentOrderId || !uid) {
    throw invoiceError('CREDIT_NOTE_PAYMENT_INVALID', 'Credit-note payment identity is incomplete.', 503);
  }

  const [invoiceRows] = await connection.query(
    `SELECT id, invoice_number, payment_order_id, user_id, financial_year,
            currency, taxable_amount, tax_amount, total_amount, payload
     FROM invoices WHERE payment_order_id = ? FOR UPDATE`,
    [paymentOrderId]
  );
  // A credit note reverses an issued tax invoice. Payments refunded before any
  // invoice was issued have no invoice document to adjust and therefore no
  // synthetic credit note is invented.
  if (!invoiceRows.length) return null;
  const invoiceRow = invoiceRows[0];
  if (invoiceRow.user_id !== uid) {
    throw invoiceError('INVOICE_RECORD_INVALID', 'The stored invoice owner does not match the refunded payment.', 503);
  }
  const invoice = invoiceFromRow(invoiceRow, uid);
  const relationalAmounts = [invoiceRow.taxable_amount, invoiceRow.tax_amount, invoiceRow.total_amount].map(Number);
  const payloadAmounts = [invoice.taxableAmount, invoice.totalTax, invoice.grandTotal].map(Number);
  if (relationalAmounts.some(value => !Number.isFinite(value) || value < 0)
      || payloadAmounts.some(value => !Number.isFinite(value) || value < 0)
      || relationalAmounts.some((value, index) => Math.abs(value - payloadAmounts[index]) > 0.005)) {
    throw invoiceError('INVOICE_RECORD_INVALID', 'The stored invoice totals failed their integrity projection.', 503);
  }

  const [existingRows] = await connection.query(
    `SELECT credit_note_number, provider_refund_id AS credit_note_provider_refund_id,
            provider_refund_reference_type AS credit_note_provider_refund_reference_type,
            taxable_amount AS credit_note_taxable_amount,
            tax_amount AS credit_note_tax_amount,
            total_amount AS credit_note_total_amount,
            payload AS credit_note_payload
     FROM credit_notes WHERE invoice_id = ? FOR UPDATE`,
    [invoiceRow.id]
  );
  if (existingRows.length) {
    const existing = creditNoteFromRow(
      existingRows[0], uid, paymentOrderId, invoiceRow.invoice_number
    );
    if ((existing.refundReference || existing.providerRefundId) !== normalizedRefundId
        || String(existing.refundReferenceType || 'PROVIDER') !== referenceType) {
      throw invoiceError('REFUND_ID_CONFLICT', 'The issued credit note references different refund evidence.', 409);
    }
    return { creditNote: existing, duplicate: true };
  }

  const financialYear = String(invoiceRow.financial_year || invoice.financialYear || '');
  if (!/^\d{2}-\d{2}$/.test(financialYear)) {
    throw invoiceError('CREDIT_NOTE_FINANCIAL_YEAR_INVALID', 'The source invoice financial year is invalid.', 503);
  }
  await connection.query(
    `INSERT INTO credit_note_counters (financial_year, next_sequence, revision)
     VALUES (?, 1, 1)
     ON DUPLICATE KEY UPDATE financial_year = VALUES(financial_year)`,
    [financialYear]
  );
  const [[counter]] = await connection.query(
    'SELECT next_sequence FROM credit_note_counters WHERE financial_year = ? FOR UPDATE',
    [financialYear]
  );
  const sequence = Number(counter?.next_sequence);
  if (!Number.isSafeInteger(sequence) || sequence < 1 || sequence > 999999) {
    throw invoiceError('CREDIT_NOTE_SEQUENCE_EXHAUSTED', 'The credit-note sequence is unavailable.', 503);
  }
  const creditNoteNumber = `CN/${financialYear}/${String(sequence).padStart(6, '0')}`;
  if (creditNoteNumber.length > 16) {
    throw invoiceError('CREDIT_NOTE_NUMBER_INVALID', 'The generated credit-note number exceeds the statutory limit.', 503);
  }
  await connection.query(
    `UPDATE credit_note_counters
     SET next_sequence = next_sequence + 1, revision = revision + 1, updated_at = NOW(3)
     WHERE financial_year = ?`,
    [financialYear]
  );

  const issuedAtDate = new Date();
  const issuedAt = issuedAtDate.toISOString();
  const creditNote = {
    documentType: 'CREDIT_NOTE',
    creditNoteNumber,
    creditNoteSeq: sequence,
    creditNoteTitle: 'GST Credit Note',
    originalInvoiceNumber: invoice.invoiceNumber,
    originalInvoiceDate: invoice.invoiceDate,
    financialYear,
    creditNoteDate: issuedAt,
    formattedDate: new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'UTC' }).format(issuedAtDate),
    userId: uid,
    paymentOrderId,
    paymentMethod: invoice.paymentMethod,
    paymentReference: invoice.paymentReference,
    refundReference: normalizedRefundId,
    refundReferenceType: referenceType,
    providerRefundId: referenceType === 'PROVIDER' ? normalizedRefundId : null,
    providerRefunds: normalizedProviderRefunds,
    refundStatus: 'REFUNDED',
    refundReason: normalizedReason,
    currency: invoice.currency,
    subtotal: Number(invoice.subtotal),
    taxableAmount: Number(invoice.taxableAmount),
    gstRate: Number(invoice.gstRate),
    isIntraState: invoice.isIntraState === true,
    cgstRate: Number(invoice.cgstRate || 0),
    sgstRate: Number(invoice.sgstRate || 0),
    igstRate: Number(invoice.igstRate || 0),
    cgstAmount: Number(invoice.cgstAmount || 0),
    sgstAmount: Number(invoice.sgstAmount || 0),
    igstAmount: Number(invoice.igstAmount || 0),
    totalTax: Number(invoice.totalTax),
    grandTotal: Number(invoice.grandTotal),
    amountInWords: amountToIndianWords(invoice.grandTotal, invoice.currency),
    placeOfSupply: invoice.placeOfSupply,
    reverseCharge: invoice.reverseCharge,
    sacCode: invoice.sacCode,
    customerSnapshot: invoice.customerSnapshot,
    supplierSnapshot: invoice.supplierSnapshot,
    lineItems: invoice.lineItems.map(item => ({ ...item })),
    created_at: issuedAt,
  };
  const creditNoteId = crypto.createHash('sha256').update(`credit-note\0${paymentOrderId}`).digest('hex');
  await connection.query(
    `INSERT INTO credit_notes
       (id, credit_note_number, credit_note_sequence, financial_year, invoice_id,
        payment_order_id, user_id, provider_refund_id, provider_refund_reference_type,
        currency, taxable_amount, tax_amount, total_amount, reason, payload, issued_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [creditNoteId, creditNoteNumber, sequence, financialYear, invoiceRow.id,
      paymentOrderId, uid, normalizedRefundId, referenceType, invoice.currency,
      creditNote.taxableAmount, creditNote.totalTax, creditNote.grandTotal,
      normalizedReason, JSON.stringify(creditNote), issuedAtDate]
  );
  await queueEmailInTransaction(connection, {
    eventId: `payment-refunded:${paymentOrderId}`,
    idempotencyKey: `refund-email:${paymentOrderId}`,
    recipient: invoice.customerSnapshot.email,
    templateType: 'refund_processed',
    vars: {
      invoice_number: invoice.invoiceNumber,
      credit_note_number: creditNoteNumber,
      amount: `${invoice.currency} ${Number(invoice.grandTotal).toFixed(2)}`,
    },
    metadata: {
      paymentOrderId,
      invoiceNumber: invoice.invoiceNumber,
      creditNoteNumber,
      refundReference: normalizedRefundId,
      refundReferenceType: referenceType,
      providerRefundCount: normalizedProviderRefunds.length || 1,
    },
  });
  await connection.query(
    `INSERT INTO security_audit_logs
       (id, action, actor_uid, target_uid, category, severity, target_type, target_id, metadata, created_at)
     VALUES (?, 'CREDIT_NOTE_ISSUED', ?, ?, 'billing.credit_note', 'HIGH', 'CREDIT_NOTE', ?, ?, NOW())`,
    [crypto.randomUUID(), String(actorUid || 'payment-provider').slice(0, 128), uid, creditNoteId,
      JSON.stringify({
        paymentOrderId,
        invoiceNumber: invoice.invoiceNumber,
        creditNoteNumber,
        refundReference: normalizedRefundId,
        refundReferenceType: referenceType,
        providerRefundIds: normalizedProviderRefunds.map(refund => refund.id),
      })]
  );
  return { creditNote, duplicate: false };
}

async function issueInvoiceInTransaction(connection, {
  order,
  actorUid = 'payment-provider',
} = {}) {
  if (!connection || typeof connection.query !== 'function') {
    throw invoiceError('INVOICE_TRANSACTION_REQUIRED', 'Invoice issuance requires an active database transaction.', 503);
  }
  const paymentOrderId = String(order?.id || '');
  const uid = String(order?.uid || '');
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(paymentOrderId) || !uid) {
    throw invoiceError('INVALID_PAYMENT_ORDER', 'A valid owner-bound payment order is required.', 503);
  }

  const [existingRows] = await connection.query(
    `SELECT i.invoice_number, i.payment_order_id, i.payload,
            cn.credit_note_number, cn.provider_refund_id AS credit_note_provider_refund_id,
            cn.provider_refund_reference_type AS credit_note_provider_refund_reference_type,
            cn.taxable_amount AS credit_note_taxable_amount,
            cn.tax_amount AS credit_note_tax_amount,
            cn.total_amount AS credit_note_total_amount,
            cn.payload AS credit_note_payload
     FROM invoices i
     LEFT JOIN credit_notes cn ON cn.invoice_id = i.id
     WHERE i.payment_order_id = ? LIMIT 1 FOR UPDATE`,
    [paymentOrderId]
  );
  if (existingRows.length) {
    const invoice = invoiceFromRow(existingRows[0], uid);
    await queueInvoiceEmail(connection, invoice);
    return { invoice, duplicate: true };
  }

  if (String(order.status || '') !== 'ACTIVE') {
    throw invoiceError('INVOICE_PAYMENT_NOT_ACTIVE', 'An invoice can only be issued with an active verified payment.', 409);
  }
  if (Number(order.billing_snapshot_version ?? order.billingSnapshotVersion) !== 1) {
    throw invoiceError(
      'BILLING_SNAPSHOT_MISSING',
      'The payment predates immutable billing capture and cannot be used to reconstruct a tax invoice.',
      409
    );
  }

  const rawCustomer = parseJson(order.billing_snapshot ?? order.billingSnapshot, null);
  const rawSupplier = parseJson(order.supplier_snapshot ?? order.supplierSnapshot, null);
  const customerSnapshot = validateCustomerSnapshot(rawCustomer);
  const supplier = validateSupplierSnapshot(rawSupplier);
  const storedHash = String(order.billing_snapshot_hash ?? order.billingSnapshotHash ?? '');
  const calculatedHash = billingSnapshotHash(customerSnapshot, supplier);
  if (!/^[a-f0-9]{64}$/.test(storedHash)
      || !crypto.timingSafeEqual(Buffer.from(storedHash), Buffer.from(calculatedHash))) {
    throw invoiceError('BILLING_SNAPSHOT_INTEGRITY_FAILED', 'The immutable billing snapshot failed its integrity check.', 503);
  }

  const currency = String(order.currency || '').toUpperCase();
  if (currency !== 'INR') {
    throw invoiceError('INVOICE_CURRENCY_UNSUPPORTED', 'GST invoice generation currently requires an INR payment order.', 409);
  }
  const amountSubunits = Number(order.amount);
  if (!Number.isSafeInteger(amountSubunits) || amountSubunits <= 0) {
    throw invoiceError('INVALID_PAYMENT_AMOUNT', 'The verified payment amount is invalid.', 409);
  }
  const paymentReference = order.provider_payment_id || order.providerPaymentId
    || order.provider_order_id || order.providerOrderId
    || order.provider_payment_intent_id || order.providerPaymentIntentId;
  if (!paymentReference) {
    throw invoiceError('PAYMENT_REFERENCE_MISSING', 'The verified provider payment reference is missing.', 503);
  }

  const totalAmount = amountSubunits / 100;
  const isIntraState = supplier.stateCode === customerSnapshot.stateCode;
  const taxableAmount = Number((totalAmount / (1 + supplier.gstRate / 100)).toFixed(2));
  const totalTax = Number((totalAmount - taxableAmount).toFixed(2));
  const cgstAmount = isIntraState ? Number((totalTax / 2).toFixed(2)) : 0;
  const sgstAmount = isIntraState ? Number((totalTax - cgstAmount).toFixed(2)) : 0;
  const igstAmount = isIntraState ? 0 : totalTax;

  await connection.query(
    `INSERT IGNORE INTO invoice_counters (financial_year, next_sequence, revision)
     VALUES (?, 1, 1)`,
    [supplier.financialYear]
  );
  const [[counter]] = await connection.query(
    'SELECT next_sequence FROM invoice_counters WHERE financial_year = ? FOR UPDATE',
    [supplier.financialYear]
  );
  const invoiceSequence = Number(counter?.next_sequence);
  if (!Number.isSafeInteger(invoiceSequence) || invoiceSequence < 1 || invoiceSequence > 999999) {
    throw invoiceError('INVOICE_SEQUENCE_EXHAUSTED', 'The invoice sequence is unavailable.', 503);
  }
  await connection.query(
    `UPDATE invoice_counters SET next_sequence = next_sequence + 1,
     revision = revision + 1, updated_at = NOW(3) WHERE financial_year = ?`,
    [supplier.financialYear]
  );

  const invoiceNumber = `${supplier.invoicePrefix}/${supplier.financialYear}/${String(invoiceSequence).padStart(6, '0')}`;
  if (invoiceNumber.length > 16) {
    throw invoiceError('INVOICE_NUMBER_INVALID', 'The generated invoice number exceeds the statutory limit.', 503);
  }
  const issuedAtDate = new Date();
  const issuedAt = issuedAtDate.toISOString();
  const planTitles = {
    monthly: 'Monthly ResumePilot AI fixed-term access',
    halfYear: 'Six-month ResumePilot AI fixed-term access',
    yearly: 'Annual ResumePilot AI fixed-term access',
  };
  const planTitle = planTitles[String(order.plan_id || order.planId || '')];
  if (!planTitle) {
    throw invoiceError('INVALID_PLAN_DURATION', 'The payment order plan cannot be invoiced.', 409);
  }
  const invoice = {
    invoiceNumber,
    invoiceSeq: invoiceSequence,
    invoiceTitle: customerSnapshot.gstin ? 'B2B GST Tax Invoice & Payment Receipt' : 'Tax Invoice & Payment Receipt',
    financialYear: supplier.financialYear,
    invoiceDate: issuedAt,
    formattedDate: new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'UTC' }).format(issuedAtDate),
    userId: uid,
    paymentOrderId,
    paymentMethod: String(order.provider || ''),
    paymentReference: String(paymentReference),
    paymentStatus: 'PAID',
    currency,
    subtotal: taxableAmount,
    taxableAmount,
    gstRate: supplier.gstRate,
    isIntraState,
    cgstRate: isIntraState ? supplier.gstRate / 2 : 0,
    sgstRate: isIntraState ? supplier.gstRate / 2 : 0,
    igstRate: isIntraState ? 0 : supplier.gstRate,
    cgstAmount,
    sgstAmount,
    igstAmount,
    totalTax,
    grandTotal: totalAmount,
    amountInWords: amountToIndianWords(totalAmount, currency),
    placeOfSupply: `${customerSnapshot.state} (${customerSnapshot.stateCode})`,
    reverseCharge: 'No',
    sacCode: supplier.sacCode,
    customerSnapshot,
    supplierSnapshot: supplier,
    billingSnapshotHash: storedHash,
    lineItems: [{
      description: planTitle,
      sacCode: supplier.sacCode,
      quantity: 1,
      unitPrice: taxableAmount,
      taxableValue: taxableAmount,
      gstRate: supplier.gstRate,
      total: totalAmount,
    }],
    created_at: issuedAt,
  };
  const invoiceId = crypto.createHash('sha256').update(`invoice\0${paymentOrderId}`).digest('hex');
  await connection.query(
    `INSERT INTO invoices
       (id, invoice_number, invoice_sequence, financial_year, payment_order_id, user_id,
        payment_reference, payment_status, currency, taxable_amount, tax_amount, total_amount, payload, issued_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [invoiceId, invoiceNumber, invoiceSequence, supplier.financialYear, paymentOrderId, uid,
      String(paymentReference).slice(0, 255), 'PAID', currency,
      taxableAmount, totalTax, totalAmount, JSON.stringify(invoice), issuedAtDate]
  );
  await queueInvoiceEmail(connection, invoice);
  await connection.query(
    `INSERT INTO security_audit_logs
       (id, action, actor_uid, target_uid, category, severity, target_type, target_id, metadata, created_at)
     VALUES (?, 'INVOICE_ISSUED', ?, ?, 'billing.invoice', 'HIGH', 'INVOICE', ?, ?, NOW())`,
    [crypto.randomUUID(), String(actorUid || 'payment-provider').slice(0, 128), uid, invoiceId,
      JSON.stringify({ paymentOrderId, invoiceNumber, totalAmount, currency, billingSnapshotHash: storedHash })]
  );
  return { invoice, duplicate: false };
}

async function generateInvoice({ uid, paymentOrderId, details = {} }) {
  if (!uid) throw invoiceError('AUTH_REQUIRED', 'Authentication is required.', 401);
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(String(paymentOrderId || ''))) {
    throw invoiceError('INVALID_PAYMENT_ORDER', 'A valid payment order is required.');
  }
  if (details && Object.keys(details).length) {
    throw invoiceError(
      'CLIENT_BILLING_DETAILS_RETIRED',
      'Billing details must be captured before provider payment and cannot be supplied during invoice issuance.',
      409
    );
  }

  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const [orders] = await connection.query(
      'SELECT * FROM payment_orders WHERE id = ? FOR UPDATE',
      [paymentOrderId]
    );
    const payment = orders[0];
    if (!payment || payment.uid !== uid || !['ACTIVE', 'REFUNDED'].includes(payment.status)) {
      throw invoiceError('PAYMENT_ORDER_NOT_FOUND', 'Verified payment order not found.', 404);
    }
    const result = await issueInvoiceInTransaction(connection, { order: payment, actorUid: uid });
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  GSTIN_PATTERN,
  INDIAN_STATES,
  amountToIndianWords,
  billingSnapshotHash,
  createBillingSnapshots,
  creditNoteFromRow,
  generateInvoice,
  getInvoiceForUser,
  invoiceFromRow,
  issueCreditNoteInTransaction,
  issueInvoiceInTransaction,
  listInvoicesForUser,
  normalizeCustomerDetails,
  supplierFromPublicConfig,
  validateCustomerSnapshot,
  validateSupplierSnapshot,
};
