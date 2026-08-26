import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseSafeDate, toCanonicalDate, formatSafeDate, isUserPremium, toEpochMs } from '../src/utils/subscriptionUtils.js';

describe('Frontend canonical date + membership contract', () => {
    it('parses every supported representation without throwing', () => {
        const iso = '2026-09-25T00:00:00.000Z';
        const ms = Date.parse(iso);
        const sec = Math.floor(ms / 1000);
        assert.equal(toCanonicalDate(iso), iso);
        assert.equal(toCanonicalDate(new Date(iso)), iso);
        assert.equal(toCanonicalDate(ms), iso);
        assert.equal(toCanonicalDate(sec), iso);
        assert.equal(toCanonicalDate({ seconds: sec, nanoseconds: 0 }), iso);
        assert.equal(toCanonicalDate({ _seconds: sec, _nanoseconds: 0 }), iso);
        assert.equal(toCanonicalDate({ toDate: () => new Date(iso) }), iso);
        assert.equal(toCanonicalDate({ toMillis: () => ms }), iso);
        assert.equal(parseSafeDate(null), null);
        assert.equal(parseSafeDate(undefined), null);
        assert.equal(parseSafeDate('not-a-date'), null);
        assert.equal(toEpochMs(0), null);
        assert.equal(formatSafeDate('bogus'), '');
        assert.equal(formatSafeDate(iso).length > 0, true);
    });

    it('isUserPremium accepts Premium/Pro/Enterprise and never requires toDate()', () => {
        assert.equal(isUserPremium('Premium', '2026-09-25T00:00:00.000Z'), true);
        assert.equal(isUserPremium('Pro', { seconds: 1789920000 }), true);
        assert.equal(isUserPremium('Enterprise', { _seconds: 1789920000 }), true);
        assert.equal(isUserPremium('Premium', '2019-01-01T00:00:00.000Z'), false);
        assert.equal(isUserPremium('Basic', '2026-09-25T00:00:00.000Z'), false);
        assert.doesNotThrow(() => isUserPremium('Premium', '2026-09-25T00:00:00.000Z'));
    });
});
