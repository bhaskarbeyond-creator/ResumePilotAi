'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { issueCreditNoteInTransaction } = require('../services/invoiceService');

function sourceInvoice() {
  return {
    invoiceNumber: 'RPA/26-27/000001',
    invoiceSeq: 1,
    invoiceTitle: 'Tax Invoice & Payment Receipt',
    financialYear: '26-27',
    invoiceDate: '2026-08-01T00:00:00.000Z',
    formattedDate: '1 Aug 2026',
    userId: 'user-1',
    paymentOrderId: 'order-1',
    paymentMethod: 'razorpay',
    paymentReference: 'pay_1',
    paymentStatus: 'PAID',
    currency: 'INR',
    subtotal: 100,
    taxableAmount: 100,
    gstRate: 18,
    isIntraState: true,
    cgstRate: 9,
    sgstRate: 9,
    igstRate: 0,
    cgstAmount: 9,
    sgstAmount: 9,
    igstAmount: 0,
    totalTax: 18,
    grandTotal: 118,
    amountInWords: 'One Hundred Eighteen Rupees Only',
    placeOfSupply: 'Andhra Pradesh (37)',
    reverseCharge: 'No',
    sacCode: '998313',
    supplierSnapshot: {
      legalName: 'Supplier Private Limited', tradeName: 'Supplier', gstin: '37ABCDE1234F1Z5',
      pan: 'ABCDE1234F', address: 'Supplier Address', city: 'Visakhapatnam', state: 'Andhra Pradesh',
      stateCode: '37', pincode: '530001', sacCode: '998313',
    },
    customerSnapshot: {
      name: 'Customer', email: 'customer@example.test', address: 'Customer Address', city: 'Visakhapatnam',
      state: 'Andhra Pradesh', stateCode: '37', gstin: '',
    },
    lineItems: [{ description: 'Fixed-term plan', sacCode: '998313', quantity: 1, unitPrice: 100, taxableValue: 100, gstRate: 18, total: 118 }],
    created_at: '2026-08-01T00:00:00.000Z',
  };
}

test('completed full refund issues one immutable credit note from the source invoice snapshot', async () => {
  const invoice = sourceInvoice();
  let insertedCreditNote = null;
  const connection = {
    async query(sql, params = []) {
      if (/FROM invoices WHERE payment_order_id/.test(sql)) {
        return [[{
          id: 'invoice-id', invoice_number: invoice.invoiceNumber, payment_order_id: invoice.paymentOrderId,
          user_id: invoice.userId, financial_year: invoice.financialYear, currency: invoice.currency,
          taxable_amount: '100.00', tax_amount: '18.00', total_amount: '118.00', payload: JSON.stringify(invoice),
        }]];
      }
      if (/FROM credit_notes WHERE invoice_id/.test(sql)) return [[]];
      if (/SELECT next_sequence FROM credit_note_counters/.test(sql)) return [[{ next_sequence: 7 }]];
      if (/INSERT INTO credit_notes/.test(sql)) {
        insertedCreditNote = JSON.parse(params[14]);
        return [{ affectedRows: 1 }];
      }
      return [{ affectedRows: 1 }];
    },
  };

  const result = await issueCreditNoteInTransaction(connection, {
    order: { id: 'order-1', uid: 'user-1' },
    providerRefundId: 'rfnd_1',
    reason: 'Customer requested refund',
    actorUid: 'admin-1',
  });

  assert.equal(result.duplicate, false);
  assert.equal(result.creditNote.creditNoteNumber, 'CN/26-27/000007');
  assert.equal(result.creditNote.originalInvoiceNumber, invoice.invoiceNumber);
  assert.equal(result.creditNote.providerRefundId, 'rfnd_1');
  assert.equal(result.creditNote.grandTotal, 118);
  assert.deepEqual(insertedCreditNote, result.creditNote);
});

test('aggregate refund credit note distinguishes reconciliation reference from child provider ids', async () => {
  const invoice = sourceInvoice();
  const aggregate = `stripe_aggregate_${'d'.repeat(64)}`;
  const providerRefunds = [
    { id: 're_partial_000001', provider: 'stripe', status: 'succeeded', amount: 40, currency: 'INR' },
    { id: 're_partial_000002', provider: 'stripe', status: 'succeeded', amount: 78, currency: 'INR' },
  ];
  let insertParams;
  let auditMetadata;
  const connection = {
    async query(sql, params = []) {
      if (/FROM invoices WHERE payment_order_id/.test(sql)) {
        return [[{
          id: 'invoice-id', invoice_number: invoice.invoiceNumber, payment_order_id: invoice.paymentOrderId,
          user_id: invoice.userId, financial_year: invoice.financialYear, currency: invoice.currency,
          taxable_amount: '100.00', tax_amount: '18.00', total_amount: '118.00', payload: JSON.stringify(invoice),
        }]];
      }
      if (/FROM credit_notes WHERE invoice_id/.test(sql)) return [[]];
      if (/SELECT next_sequence FROM credit_note_counters/.test(sql)) return [[{ next_sequence: 8 }]];
      if (/INSERT INTO credit_notes/.test(sql)) {
        insertParams = params;
        return [{ affectedRows: 1 }];
      }
      if (/CREDIT_NOTE_ISSUED/.test(sql)) auditMetadata = JSON.parse(params[4]);
      return [{ affectedRows: 1 }];
    },
  };

  const result = await issueCreditNoteInTransaction(connection, {
    order: { id: 'order-1', uid: 'user-1', provider: 'stripe' },
    providerRefundId: aggregate,
    providerRefundReferenceType: 'AGGREGATE',
    providerRefunds,
    reason: 'Multiple provider refunds completed the reversal',
    actorUid: 'payment-provider',
  });

  assert.equal(result.creditNote.refundReference, aggregate);
  assert.equal(result.creditNote.refundReferenceType, 'AGGREGATE');
  assert.equal(result.creditNote.providerRefundId, null);
  assert.deepEqual(result.creditNote.providerRefunds.map(item => item.id), ['re_partial_000001', 're_partial_000002']);
  assert.equal(insertParams[7], aggregate);
  assert.equal(insertParams[8], 'AGGREGATE');
  assert.deepEqual(auditMetadata.providerRefundIds, ['re_partial_000001', 're_partial_000002']);
});

test('refund without an issued invoice does not fabricate a credit note', async () => {
  const connection = { query: async () => [[]] };
  const result = await issueCreditNoteInTransaction(connection, {
    order: { id: 'order-without-invoice', uid: 'user-1' },
    providerRefundId: 'rfnd_2',
    reason: 'Customer requested refund',
  });
  assert.equal(result, null);
});
