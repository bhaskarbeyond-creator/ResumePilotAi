import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isCurrencyRevisionConflict,
  saveCurrencySettingsWithRecovery,
} from '../src/components/admin/settings/currencySettingsController.js';

const config = (revision, code = 'INR') => ({ success: true, currency: { revision, code } });

test('currency save accepts a valid revisioned server response without reloading', async () => {
  let reloads = 0;
  const outcome = await saveCurrencySettingsWithRecovery({
    payload: { currency: 'USD', expectedRevision: 4 },
    update: async payload => {
      assert.equal(payload.expectedRevision, 4);
      return config(5, 'USD');
    },
    reload: async () => { reloads += 1; return config(5, 'USD'); },
  });
  assert.equal(outcome.kind, 'saved');
  assert.equal(outcome.currency.revision, 5);
  assert.equal(outcome.currency.code, 'USD');
  assert.equal(reloads, 0);
});

test('currency 409 reloads MariaDB-owned state exactly once and never reports stale save as success', async () => {
  let reloads = 0;
  const conflict = Object.assign(new Error('stale'), { status: 409, code: 'CURRENCY_CONFLICT' });
  const outcome = await saveCurrencySettingsWithRecovery({
    payload: { currency: 'USD', expectedRevision: 4 },
    update: async () => { throw conflict; },
    reload: async () => { reloads += 1; return config(7, 'EUR'); },
  });
  assert.equal(outcome.kind, 'conflict');
  assert.equal(outcome.conflict, conflict);
  assert.equal(outcome.currency.revision, 7);
  assert.equal(outcome.currency.code, 'EUR');
  assert.equal(reloads, 1);
});

test('currency conflict classification supports HTTP status and explicit conflict codes', () => {
  assert.equal(isCurrencyRevisionConflict({ status: 409 }), true);
  assert.equal(isCurrencyRevisionConflict({ code: 'CURRENCY_CONFLICT' }), true);
  assert.equal(isCurrencyRevisionConflict({ code: 'ADMIN_TARGET_CHANGED' }), true);
  assert.equal(isCurrencyRevisionConflict({ status: 503, code: 'CURRENCY_STORAGE_UNAVAILABLE' }), false);
});

test('currency non-conflict failures propagate without reloading', async () => {
  let reloads = 0;
  const outage = Object.assign(new Error('offline'), { status: 503, code: 'CURRENCY_STORAGE_UNAVAILABLE' });
  await assert.rejects(
    saveCurrencySettingsWithRecovery({
      payload: { currency: 'USD', expectedRevision: 4 },
      update: async () => { throw outage; },
      reload: async () => { reloads += 1; return config(5); },
    }),
    error => error === outage,
  );
  assert.equal(reloads, 0);
});

test('currency conflict fails explicitly when authoritative refresh fails', async () => {
  await assert.rejects(
    saveCurrencySettingsWithRecovery({
      payload: { currency: 'USD', expectedRevision: 4 },
      update: async () => { throw Object.assign(new Error('stale'), { status: 409 }); },
      reload: async () => { throw Object.assign(new Error('database offline'), { status: 503 }); },
    }),
    error => error.code === 'CURRENCY_CONFLICT_RELOAD_FAILED' && error.status === 503,
  );
});
