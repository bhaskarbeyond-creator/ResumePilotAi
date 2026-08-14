import test from 'node:test';
import assert from 'node:assert/strict';
import { CONSENT_EVENT, CONSENT_STORAGE_KEY, getAnalyticsConsent, setAnalyticsConsent } from '../src/utils/privacyConsent.js';

test('analytics consent defaults to pending and persists explicit grant or rejection', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
  const events = [];
  const target = { dispatchEvent: event => events.push(event) };
  assert.equal(getAnalyticsConsent(storage), 'pending');
  assert.equal(setAnalyticsConsent('granted', storage, target), 'granted');
  assert.equal(values.get(CONSENT_STORAGE_KEY), 'granted');
  assert.equal(events[0].type, CONSENT_EVENT);
  assert.equal(events[0].detail.analytics, 'granted');
  setAnalyticsConsent('denied', storage, target);
  assert.equal(getAnalyticsConsent(storage), 'denied');
  assert.throws(() => setAnalyticsConsent('implicit', storage, target), /Invalid privacy consent/);
});

test('blocked browser storage fails closed rather than implicitly granting analytics', () => {
  const storage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.equal(getAnalyticsConsent(storage), 'pending');
  assert.equal(setAnalyticsConsent('denied', storage, { dispatchEvent() {} }), 'denied');
});

test('analytics implementation is consent-gated and does not use document IDs or analytics as product truth', async () => {
  const source = await import('node:fs/promises').then(fs => fs.readFile('src/utils/ga4.js', 'utf8'));
  assert.match(source, /analyticsAllowed\(\)/);
  assert.match(source, /resumeId \? 'resume'/);
  assert.match(source, /coverId \? 'cover_letter'/);
  assert.doesNotMatch(source, /membership|entitlement|accountType|paymentStatus/);
});
