// Source-level guard only: this does not replace browser or provider tests.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('checkout submission stays fail-closed until provider integration is implemented', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../../frontend/src/pages/billing/checkout-modal.tsx'), 'utf8');
  const start = source.indexOf('  const handleExecutePayment =');
  const end = source.indexOf('  const handleDownloadInvoice', start);
  assert.ok(start >= 0 && end > start);
  const handler = source.slice(start, end);
  assert.match(handler, /This attempt did not submit a payment/);
  assert.doesNotMatch(handler, /axios|fetch\s*\(|setCheckoutStep\s*\(\s*3|setCompletedOrder/);
  assert.doesNotMatch(source, /setCompletedOrder\s*\(/);
  assert.doesNotMatch(source, /setCheckoutStep\s*\(\s*2\s*\)/);
  assert.match(source, /if \(validateStep1\(\)\) handleExecutePayment\(\)/);
});
