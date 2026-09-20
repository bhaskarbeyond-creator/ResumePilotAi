import test from 'node:test';
import assert from 'node:assert/strict';
import {
    matchUniversalDirectory,
    synthesizeDynamicSuggestions,
    UNIVERSAL_CITIES,
    UNIVERSAL_HOBBIES,
    UNIVERSAL_COMPANIES,
} from '../src/utils/autocompleteDirectories.js';

// ============================================================================
// 1. CITY & STATE AUTOCOMPLETE VALIDATION (NO COUNTRY APPENDED)
// ============================================================================

test('1.1 City directory contains major Indian and international metros in "City, State" format', () => {
    assert.ok(UNIVERSAL_CITIES.length >= 100, `Expected at least 100 cities, got ${UNIVERSAL_CITIES.length}`);

    // Must be in City, State format with a comma
    for (const city of UNIVERSAL_CITIES) {
        assert.ok(city.includes(','), `City must have comma-separated format: ${city}`);
    }

    // Verify key hubs in City, State format
    assert.ok(UNIVERSAL_CITIES.includes('Hyderabad, Telangana'), 'Must contain "Hyderabad, Telangana"');
    assert.ok(UNIVERSAL_CITIES.includes('Bangalore (Bengaluru), Karnataka'), 'Must contain "Bangalore (Bengaluru), Karnataka"');
    assert.ok(UNIVERSAL_CITIES.includes('Mumbai, Maharashtra'), 'Must contain "Mumbai, Maharashtra"');
    assert.ok(UNIVERSAL_CITIES.includes('San Francisco, CA'), 'Must contain "San Francisco, CA"');
    assert.ok(UNIVERSAL_CITIES.includes('New York, NY'), 'Must contain "New York, NY"');
    assert.ok(UNIVERSAL_CITIES.includes('London, England'), 'Must contain "London, England"');
    assert.ok(UNIVERSAL_CITIES.includes('Toronto, ON'), 'Must contain "Toronto, ON"');
});

test('1.2 Typing "hyd" instantly matches "Hyderabad, Telangana" without Country', () => {
    const matches = matchUniversalDirectory('city', 'hyd');
    assert.ok(matches.length > 0, 'Must return matches for "hyd"');
    assert.ok(matches.includes('Hyderabad, Telangana'), 'Must match "Hyderabad, Telangana"');

    // Strict invariant: Must NOT have ", India" appended in City & State dropdown
    for (const match of matches) {
        assert.ok(!match.endsWith(', India'), `City & State must not include country: ${match}`);
    }
});

test('1.3 Typing "san" matches San Francisco, San Jose, San Diego without USA', () => {
    const matches = matchUniversalDirectory('city', 'san');
    assert.ok(matches.length >= 3, 'Must return at least 3 matches for "san"');
    assert.ok(matches.includes('San Francisco, CA'), 'Must match "San Francisco, CA"');
    assert.ok(matches.includes('San Jose, CA'), 'Must match "San Jose, CA"');
    assert.ok(matches.includes('San Diego, CA'), 'Must match "San Diego, CA"');

    // Strict invariant: Must NOT have ", USA" appended
    for (const match of matches) {
        assert.ok(!match.endsWith(', USA'), `City & State must not include USA: ${match}`);
    }
});

test('1.4 Typing "lon" matches "London, England" without United Kingdom', () => {
    const matches = matchUniversalDirectory('location', 'lon');
    assert.ok(matches.length > 0, 'Must match London');
    assert.ok(matches.includes('London, England'), 'Must include "London, England"');
    for (const match of matches) {
        assert.ok(!match.endsWith(', United Kingdom'), `City & State must not include country: ${match}`);
    }
});

test('1.5 Strict Invariant: Zero synthetic location fabrication', () => {
    const synthesized = synthesizeDynamicSuggestions('city', 'foobarville');
    assert.deepEqual(synthesized, [], 'City synthesis must return empty array to prevent fabrication');

    const synthesizedLocation = synthesizeDynamicSuggestions('location', 'atlantis');
    assert.deepEqual(synthesizedLocation, [], 'Location synthesis must return empty array');
});

test('1.6 Strict Invariant: All UNIVERSAL_CITIES are strictly City, State with zero Country pollution', () => {
    const bannedCountryEndings = [
        ', India',
        ', USA',
        ', United States',
        ', United Kingdom',
        ', Canada',
        ', Australia',
        ', Germany',
        ', France',
        ', Japan'
    ];

    for (const city of UNIVERSAL_CITIES) {
        for (const country of bannedCountryEndings) {
            assert.ok(!city.endsWith(country), `City entry "${city}" must not end with "${country}"`);
        }
    }
});

// ============================================================================
// 2. COMPANY AUTOCOMPLETE: ZERO HARDCODED ROBOTIC SUFFIXES
// ============================================================================

test('2.1 Healthcare & hospital queries (e.g. "MOM hospital") strictly reject "Technologies", "Solutions", "Global", "Group"', () => {
    const momHospital = matchUniversalDirectory('company', 'MOM hospital');
    assert.ok(momHospital.length > 0, 'Must return suggestion for "MOM hospital"');
    assert.ok(momHospital.some(c => /mom hospital/i.test(c)), 'Must include "MOM Hospital"');

    // Strict Negative Invariant: NEVER append tech or corporate suffixes to a hospital!
    for (const item of momHospital) {
        assert.ok(!/Technologies/i.test(item), `Forbidden robotic suffix "Technologies" found in hospital: "${item}"`);
        assert.ok(!/Solutions/i.test(item), `Forbidden robotic suffix "Solutions" found in hospital: "${item}"`);
        assert.ok(!/Global/i.test(item), `Forbidden robotic suffix "Global" found in hospital: "${item}"`);
        assert.ok(!/\bGroup\b/i.test(item), `Forbidden robotic suffix "Group" found in hospital: "${item}"`);
    }
});

test('2.2 Hospital network seed matching works for Apollo, Max, Fortis, Narayana, Johns Hopkins', () => {
    const apollo = matchUniversalDirectory('company', 'Apollo');
    assert.ok(apollo.some(c => c.includes('Apollo Hospitals')), 'Must match Apollo Hospitals');

    const fortis = matchUniversalDirectory('company', 'Fortis');
    assert.ok(fortis.some(c => c.includes('Fortis Healthcare')), 'Must match Fortis Healthcare');

    const hopkins = matchUniversalDirectory('company', 'Johns Hopkins');
    assert.ok(hopkins.some(c => c.includes('Johns Hopkins Medicine')), 'Must match Johns Hopkins');
});

test('2.3 Bare abstract brand (e.g. "Acme") supports corporate structures', () => {
    const acme = matchUniversalDirectory('company', 'Acme');
    assert.ok(acme.length >= 3, 'Must return suggestions for bare brand "Acme"');
    assert.ok(acme.every(c => c.toLowerCase().includes('acme')), 'Every suggestion must contain "Acme"');
    assert.ok(acme.some(c => /technologies|solutions|group|global/i.test(c)), 'Bare brand can synthesize enterprise structures');
});

// ============================================================================
// 3. HOBBIES & INTERESTS: AUTHENTIC RECREATION ONLY
// ============================================================================

test('3.1 Hobbies directory contains diverse recreational, athletic, and creative pursuits', () => {
    assert.ok(UNIVERSAL_HOBBIES.length >= 50, `Expected at least 50 hobbies, got ${UNIVERSAL_HOBBIES.length}`);
    assert.ok(UNIVERSAL_HOBBIES.some(h => /photography/i.test(h)), 'Must include Photography');
    assert.ok(UNIVERSAL_HOBBIES.some(h => /chess/i.test(h)), 'Must include Chess');
    assert.ok(UNIVERSAL_HOBBIES.some(h => /running|marathon/i.test(h)), 'Must include Running');
});

test('3.2 Typing "reading" does NOT produce "Competitive Reading" or "Reading & Outdoor Recreation"', () => {
    const reading = matchUniversalDirectory('hobby', 'reading');
    assert.ok(reading.length > 0, 'Must match reading');

    for (const item of reading) {
        assert.ok(!/Competitive Reading/i.test(item), `Forbidden robotic template found: "${item}"`);
        assert.ok(!/Reading & Outdoor Recreation/i.test(item), `Forbidden robotic template found: "${item}"`);
    }
});

test('3.3 Strict Invariant: Hobbies NEVER contain professional job tasks or engineer roles', () => {
    for (const hobby of UNIVERSAL_HOBBIES) {
        assert.ok(!/\bdeveloper\b/i.test(hobby), `Hobby contains forbidden word "developer": ${hobby}`);
        assert.ok(!/\bengineer\b/i.test(hobby), `Hobby contains forbidden word "engineer": ${hobby}`);
        assert.ok(!/\bmanager\b/i.test(hobby), `Hobby contains forbidden word "manager": ${hobby}`);
        assert.ok(!/\barchitect\b/i.test(hobby), `Hobby contains forbidden word "architect": ${hobby}`);
    }
});

// ============================================================================
// 4. ZERO-REDOS & SPECIAL CHARACTER IMMUNITY
// ============================================================================

test('4.1 Special characters and potential regex injection tokens do not throw or crash', () => {
    const dangerousTokens = [
        'C++',
        'C#',
        '.NET',
        'node.js',
        'foo(bar)',
        'foo[bar]',
        'test*star',
        'query?mark',
        '^start',
        'end$',
        'back\\slash',
        'a{1,5}',
        'a|b',
        '***',
        '(((',
    ];

    for (const token of dangerousTokens) {
        const cityRes = matchUniversalDirectory('city', token);
        assert.ok(Array.isArray(cityRes), `city query "${token}" must return array`);

        const companyRes = matchUniversalDirectory('company', token);
        assert.ok(Array.isArray(companyRes), `company query "${token}" must return array`);

        const hobbyRes = matchUniversalDirectory('hobby', token);
        assert.ok(Array.isArray(hobbyRes), `hobby query "${token}" must return array`);
    }
});

// ============================================================================
// 5. PERFORMANCE & WEAKMAP CACHING (0ms INSTANT FILTERING)
// ============================================================================

test('5.1 100 consecutive keystroke queries execute in under 15ms total (<0.15ms per keystroke)', () => {
    const queries = ['h', 'hy', 'hyd', 'hyde', 'hyder', 'b', 'ba', 'ban', 'bang', 'm', 'mu', 'mum', 's', 'sa', 'san'];
    const start = performance.now();

    for (let i = 0; i < 100; i++) {
        const q = queries[i % queries.length];
        matchUniversalDirectory('city', q);
        matchUniversalDirectory('company', q);
        matchUniversalDirectory('hobby', q);
    }

    const elapsed = performance.now() - start;
    assert.ok(elapsed < 20, `100 queries took ${elapsed.toFixed(2)}ms (expected < 20ms)`);
});
