import test from 'node:test';
import assert from 'node:assert/strict';
import { matchUniversalDirectory, synthesizeDynamicSuggestions } from '../src/utils/autocompleteDirectories.js';
import { executeContentOperation } from '../backend/services/aiRuntime.js';

test('Pure-AI Autocomplete: "oncologist" returns authentic medical specializations with zero robotic templates', () => {
    const matches = matchUniversalDirectory('jobTitle', 'oncologist');
    assert.ok(Array.isArray(matches), 'Expected matches to be an array');
    assert.ok(matches.length >= 4, `Expected at least 4 matches, got ${matches.length}`);

    // Must include authentic oncology disciplines
    const hasMedicalOnc = matches.some(m => /Medical Oncologist/i.test(m));
    const hasRadiationOnc = matches.some(m => /Radiation Oncologist/i.test(m));
    const hasSurgicalOnc = matches.some(m => /Surgical Oncologist/i.test(m));
    assert.ok(hasMedicalOnc || hasRadiationOnc || hasSurgicalOnc, 'Expected authentic medical oncology specializations');

    // Strict negative invariant: MUST NEVER contain nonsensical template concatenations
    for (const item of matches) {
        assert.ok(!/Oncologist Engineer/i.test(item), `Forbidden robotic concatenation detected: ${item}`);
        assert.ok(!/Oncologist Developer/i.test(item), `Forbidden robotic concatenation detected: ${item}`);
    }
});

test('Pure-AI Autocomplete: Unclassified medical suffixes (-ologist) synthesize authentic clinical roles', () => {
    const synthesized = synthesizeDynamicSuggestions('jobTitle', 'nephrologist');
    assert.ok(Array.isArray(synthesized), 'Expected synthesized to be an array');
    assert.ok(synthesized.length >= 2, `Expected at least 2 synthesized roles, got ${synthesized.length}`);

    // Must contain authentic clinical titles
    const hasClinical = synthesized.some(s => /Nephrologist/i.test(s));
    assert.ok(hasClinical, 'Expected Nephrologist role');

    // Strict negative invariant: NEVER append "Engineer" or "Developer" to medical disciplines
    for (const item of synthesized) {
        assert.ok(!/Nephrologist Engineer/i.test(item), `Forbidden robotic concatenation: ${item}`);
        assert.ok(!/Nephrologist Developer/i.test(item), `Forbidden robotic concatenation: ${item}`);
    }
});

test('Pure-AI Autocomplete: Cross-industry domains produce realistic careers', () => {
    // 1. Aviation / Pilot
    const pilotMatches = matchUniversalDirectory('jobTitle', 'pilot');
    assert.ok(pilotMatches.some(m => /Airline Pilot|Commercial Pilot/i.test(m)), 'Expected pilot roles');

    // 2. Culinary / Chef
    const chefMatches = matchUniversalDirectory('jobTitle', 'chef');
    assert.ok(chefMatches.some(m => /Executive Chef|Sous Chef/i.test(m)), 'Expected chef roles');

    // 3. Trades / Welder
    const welderMatches = matchUniversalDirectory('jobTitle', 'welder');
    assert.ok(welderMatches.some(m => /Welder/i.test(m)), 'Expected welder roles');

    // 4. Tech / Cloud
    const cloudMatches = matchUniversalDirectory('jobTitle', 'cloud');
    assert.ok(cloudMatches.some(m => /Cloud Solutions Architect|Cloud Engineer/i.test(m)), 'Expected cloud roles');
});

test('Backend aiRuntime: Autocomplete operation resolves rich suggestions for "oncologist"', async () => {
    const result = await executeContentOperation({
        operation: 'autocomplete',
        payload: {
            type: 'jobTitle',
            query: 'oncologist',
        },
    });

    assert.ok(result && result.data, 'Expected result.data to exist');
    assert.ok(Array.isArray(result.data.suggestions), 'Expected suggestions array');
    assert.ok(result.data.suggestions.length >= 3, `Expected at least 3 suggestions, got ${result.data.suggestions.length}`);

    // Verify suggestions contain oncology specializations
    const containsOnc = result.data.suggestions.some(s => /oncol/i.test(s));
    assert.ok(containsOnc, `Suggestions should be oncology-related: ${JSON.stringify(result.data.suggestions)}`);

    // Verify zero robotic templates
    for (const item of result.data.suggestions) {
        assert.ok(!/Oncologist Engineer/i.test(item), `Forbidden robotic template: ${item}`);
        assert.ok(!/Oncologist Developer/i.test(item), `Forbidden robotic template: ${item}`);
    }
});

test('Backend aiRuntime: Autocomplete handles company, school, degree, skill, certification dynamically', async () => {
    const types = [
        { type: 'company', query: 'Google' },
        { type: 'school', query: 'Stanford' },
        { type: 'degree', query: 'Computer Science' },
        { type: 'skill', query: 'Python' },
        { type: 'certification', query: 'AWS' },
    ];

    for (const testCase of types) {
        await new Promise(r => setTimeout(r, 600));
        const res = await executeContentOperation({
            operation: 'autocomplete',
            payload: testCase,
        });
        // If provider succeeded, verify suggestions; if rate-limited, verify graceful fallback contract
        if (res?.data?.suggestions?.length > 0) {
            assert.ok(Array.isArray(res.data.suggestions), `Expected suggestions array for ${testCase.type}`);
        } else {
            assert.equal(res?.grounding, 'empty-fallback', 'Expected honest empty fallback on provider rate-limit');
        }
    }
});
