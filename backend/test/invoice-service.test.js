'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  GSTIN_PATTERN,
  INDIAN_STATES,
  amountToIndianWords,
  normalizeCustomerDetails,
  supplierFromPublicConfig,
} = require('../services/invoiceService');

function validSupplier(overrides = {}) {
  return {
    subscriptions: {
      supplierLegalName: 'ResumePilot AI Private Limited',
      supplierTradeName: 'ResumePilot AI',
      supplierGstin: '37ABCDE1234F1Z5',
      supplierPan: 'ABCDE1234F',
      supplierAddress: 'Business Address',
      supplierCity: 'Vijayawada',
      supplierState: 'Andhra Pradesh',
      supplierStateCode: '37',
      supplierPincode: '520001',
      sacCode: '998313',
      taxRate: 18,
      invoicePrefix: 'RPA',
      financialYear: '26-27',
      supplierEmail: 'billing@example.test',
      ...overrides,
    },
  };
}

test('GST state registry uses current Andhra Pradesh and Ladakh codes', () => {
  assert.equal(INDIAN_STATES['37'], 'Andhra Pradesh');
  assert.equal(INDIAN_STATES['38'], 'Ladakh');
  assert.equal(INDIAN_STATES['28'], undefined);
  assert.equal(GSTIN_PATTERN.test('37ABCDE1234F1Z5'), true);
});

test('supplier projection rejects incomplete or mismatched legal configuration', () => {
  const supplier = supplierFromPublicConfig(validSupplier());
  assert.equal(supplier.stateCode, '37');
  assert.equal(supplier.gstin, '37ABCDE1234F1Z5');
  assert.throws(
    () => supplierFromPublicConfig(validSupplier({ supplierStateCode: '36' })),
    error => error.code === 'INVOICE_SUPPLIER_CONFIGURATION_INCOMPLETE' && error.status === 503
  );
  assert.throws(
    () => supplierFromPublicConfig({ subscriptions: {} }),
    error => error.code === 'INVOICE_SUPPLIER_CONFIGURATION_INCOMPLETE' && error.status === 503
  );
  assert.throws(
    () => supplierFromPublicConfig(validSupplier({ invoicePrefix: 'RPAI' })),
    error => error.code === 'INVOICE_SUPPLIER_CONFIGURATION_INCOMPLETE' && error.status === 503
  );
});

test('customer GST state is derived and conflicting state input is rejected', () => {
  const customer = normalizeCustomerDetails({
    customerGstin: '37ABCDE1234F1Z5',
    customerState: 'Andhra Pradesh',
    customerStateCode: '37',
    customerAddress: 'Customer Address',
    customerCity: 'Vijayawada',
    customerPincode: '520001',
  }, { email: 'customer@example.test', displayName: 'Customer' });
  assert.equal(customer.stateCode, '37');
  assert.equal(customer.type, 'B2B');
  assert.throws(
    () => normalizeCustomerDetails({
      customerGstin: '37ABCDE1234F1Z5',
      customerStateCode: '36',
      customerAddress: 'Customer Address',
      customerCity: 'Vijayawada',
    }, { email: 'customer@example.test', displayName: 'Customer' }),
    error => error.code === 'CUSTOMER_STATE_MISMATCH'
  );
});

test('amount words preserve rupees and paise without accepting a client total', () => {
  assert.equal(amountToIndianWords(499.5, 'INR'), 'Four Hundred Ninety Nine Rupees and Fifty Paise Only');
  assert.equal(amountToIndianWords(0, 'INR'), 'Zero Rupees Only');
});
