import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
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

    it('accepts every representation the review surfaces actually receive', () => {
        const iso = '2026-09-25T00:00:00.000Z';
        const ms = Date.parse(iso);
        // Epoch milliseconds and unix seconds (as the API sends both).
        assert.equal(formatSafeDate(ms).length > 0, true);
        assert.equal(formatSafeDate(Math.floor(ms / 1000)).length > 0, true);
        // SQL timestamp strings, e.g. `applied_at` straight from MariaDB.
        assert.ok(parseSafeDate('2026-09-25 00:00:00') instanceof Date);
        // Date instances and timestamp-like objects.
        assert.equal(formatSafeDate(new Date(ms)).length > 0, true);
        assert.equal(formatSafeDate({ toDate: () => new Date(iso) }).length > 0, true);
        assert.equal(formatSafeDate({ seconds: Math.floor(ms / 1000) }).length > 0, true);
        // Sentinel strings that previously produced "Invalid Date".
        assert.equal(formatSafeDate(''), '');
        assert.equal(formatSafeDate('0'), '');
        assert.equal(formatSafeDate('null'), '');
        assert.equal(formatSafeDate('undefined'), '');
        assert.equal(formatSafeDate(NaN), '');
    });

    it('isUserPremium accepts Premium/Pro/Enterprise and never requires toDate()', () => {
        // Fixed instants, not "now + N": anchoring this to the wall clock is
        // what silently rotted the previous 2026-09-25 fixtures once that date
        // passed. A far-future constant cannot expire.
        const farFuture = '2099-09-25T00:00:00.000Z';
        const farFutureSeconds = Math.floor(Date.parse(farFuture) / 1000);
        assert.equal(isUserPremium('Premium', farFuture), true);
        assert.equal(isUserPremium('Pro', { seconds: farFutureSeconds }), true);
        assert.equal(isUserPremium('Enterprise', { _seconds: farFutureSeconds }), true);
        assert.equal(isUserPremium('Premium', '2019-01-01T00:00:00.000Z'), false);
        assert.equal(isUserPremium('Basic', farFuture), false);
        assert.doesNotThrow(() => isUserPremium('Premium', farFuture));
    });
});

describe('DIR-048 review-surface date wiring', () => {
    const root = path.resolve(import.meta.dirname, '..');
    const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
    // Comments are stripped before scanning: the migration is documented in
    // prose ("must not surface as Invalid date") and that prose must not trip
    // the guard.
    const stripComments = (source) => source
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/(^|[^:'"`\\])\/\/[^\n]*/gm, '$1');

    const WIRED_SURFACES = [
        'src/components/Dashboard/EmployerDashboard/JobApplicationsModal.jsx',
        'src/components/Dashboard/EmployerDashboard/EmployerDashboard.jsx',
        'src/components/Dashboard/EmployerDashboard/CompaniesManagement.jsx',
        'src/components/AppliedJobs/AppliedJobs.jsx',
    ];

    it('routes every review-surface date through the shared safe formatter', () => {
        for (const file of WIRED_SURFACES) {
            const source = read(file);
            assert.match(source, /import\s*\{[^}]*formatSafeDate[^}]*\}/, `${file} must import the shared formatter`);
            assert.match(source, /formatDate[\s\S]{0,240}formatSafeDate/, `${file} formatDate must delegate to formatSafeDate`);
        }
    });

    it('can never render an "Invalid date" fallback again', () => {
        for (const file of WIRED_SURFACES) {
            const live = stripComments(read(file));
            assert.doesNotMatch(live, /Invalid date/i, `${file} must not contain an Invalid date fallback`);
            assert.doesNotMatch(live, /new Date\([^)]*\)\.toLocaleDateString/, `${file} must not hand-roll date formatting`);
        }
    });
});
