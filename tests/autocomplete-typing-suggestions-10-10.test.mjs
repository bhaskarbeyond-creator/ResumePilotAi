import test from 'node:test';
import assert from 'node:assert/strict';
import {
    matchUniversalDirectory,
    UNIVERSAL_COMPANIES,
    UNIVERSAL_SCHOOLS,
    UNIVERSAL_DEGREES,
    UNIVERSAL_CERTIFICATIONS,
    UNIVERSAL_LANGUAGES,
    UNIVERSAL_SKILLS,
    UNIVERSAL_CITIES,
    UNIVERSAL_JOB_TITLES,
} from '../src/utils/autocompleteDirectories.js';
import { executeContentOperation } from '../backend/services/aiRuntime.js';

// =========================================================================
// 1. UNIVERSAL DIRECTORIES INTEGRITY & COVERAGE
// =========================================================================

test('1.1 Company directory has comprehensive global coverage', () => {
    assert.ok(UNIVERSAL_COMPANIES.length >= 80, `Expected at least 80 companies, got ${UNIVERSAL_COMPANIES.length}`);
    const expected = ['Google', 'Microsoft', 'Amazon', 'Apple', 'Meta', 'Deloitte', 'Accenture', 'JPMorgan Chase', 'Pfizer', 'Tesla'];
    for (const company of expected) {
        assert.ok(UNIVERSAL_COMPANIES.includes(company), `Company directory must contain ${company}`);
    }
});

test('1.2 School directory has comprehensive global university coverage', () => {
    assert.ok(UNIVERSAL_SCHOOLS.length >= 60, `Expected at least 60 schools, got ${UNIVERSAL_SCHOOLS.length}`);
    const expected = ['Harvard University', 'Stanford University', 'Massachusetts Institute of Technology (MIT)', 'University of Oxford', 'University of Cambridge', 'University of Toronto'];
    for (const school of expected) {
        assert.ok(UNIVERSAL_SCHOOLS.includes(school), `School directory must contain ${school}`);
    }
});

test('1.3 Degree directory has standard global qualifications', () => {
    assert.ok(UNIVERSAL_DEGREES.length >= 25, `Expected at least 25 degrees, got ${UNIVERSAL_DEGREES.length}`);
    assert.ok(UNIVERSAL_DEGREES.some(d => /bachelor of science/i.test(d)), 'Must include Bachelor of Science');
    assert.ok(UNIVERSAL_DEGREES.some(d => /master of business administration/i.test(d)), 'Must include MBA');
    assert.ok(UNIVERSAL_DEGREES.some(d => /doctor of philosophy/i.test(d)), 'Must include Ph.D.');
});

test('1.4 Certification directory contains top industry credentials', () => {
    assert.ok(UNIVERSAL_CERTIFICATIONS.length >= 25, `Expected at least 25 certs, got ${UNIVERSAL_CERTIFICATIONS.length}`);
    assert.ok(UNIVERSAL_CERTIFICATIONS.some(c => /aws certified/i.test(c)), 'Must include AWS');
    assert.ok(UNIVERSAL_CERTIFICATIONS.some(c => /pmp/i.test(c)), 'Must include PMP');
    assert.ok(UNIVERSAL_CERTIFICATIONS.some(c => /scrum/i.test(c)), 'Must include Scrum');
});

test('1.5 Language directory contains major world languages', () => {
    assert.ok(UNIVERSAL_LANGUAGES.length >= 30, `Expected at least 30 languages, got ${UNIVERSAL_LANGUAGES.length}`);
    const expected = ['English', 'German', 'Mandarin Chinese', 'Hindi', 'Spanish', 'Telugu'];
    for (const lang of expected) {
        assert.ok(UNIVERSAL_LANGUAGES.includes(lang), `Language directory must contain ${lang}`);
    }
});

// =========================================================================
// 2. 0MS INSTANT KEYSTROKE MATCHING (matchUniversalDirectory)
// =========================================================================

test('2.1 Company typing suggestions match instantly on keystroke', () => {
    const gooMatches = matchUniversalDirectory('company', 'goo');
    assert.ok(gooMatches.length > 0, 'Typing "goo" must return companies');
    assert.ok(gooMatches.includes('Google'), 'Must match Google for "goo"');

    const micMatches = matchUniversalDirectory('company', 'mic');
    assert.ok(micMatches.includes('Microsoft'), 'Must match Microsoft for "mic"');

    const delMatches = matchUniversalDirectory('company', 'del');
    assert.ok(delMatches.includes('Deloitte') || delMatches.includes('Dell Technologies'), 'Must match Deloitte or Dell for "del"');
});

test('2.2 School typing suggestions match instantly on keystroke', () => {
    const harMatches = matchUniversalDirectory('school', 'har');
    assert.ok(harMatches.length > 0, 'Typing "har" must return universities');
    assert.ok(harMatches.includes('Harvard University'), 'Must match Harvard for "har"');

    const stanMatches = matchUniversalDirectory('school', 'stan');
    assert.ok(stanMatches.includes('Stanford University'), 'Must match Stanford for "stan"');

    const mitMatches = matchUniversalDirectory('school', 'mit');
    assert.ok(mitMatches.some(s => /mit/i.test(s)), 'Must match MIT for "mit"');
});

test('2.3 Degree typing suggestions match instantly on keystroke', () => {
    const bacMatches = matchUniversalDirectory('degree', 'bac');
    assert.ok(bacMatches.length > 0, 'Typing "bac" must return bachelor degrees');
    assert.ok(bacMatches.some(d => d.startsWith('Bachelor')), 'Must start with Bachelor');

    const mbaMatches = matchUniversalDirectory('degree', 'mba');
    assert.ok(mbaMatches.some(d => /mba/i.test(d)), 'Must match MBA for "mba"');
});

test('2.4 Certification typing suggestions match instantly on keystroke', () => {
    const awsMatches = matchUniversalDirectory('certification', 'aws');
    assert.ok(awsMatches.length > 0, 'Typing "aws" must return AWS certifications');
    assert.ok(awsMatches.some(c => /aws certified/i.test(c)), 'Must match AWS Certified');

    const pmpMatches = matchUniversalDirectory('certification', 'pmp');
    assert.ok(pmpMatches.some(c => /pmp/i.test(c)), 'Must match PMP for "pmp"');
});

test('2.5 Language typing suggestions match instantly on keystroke', () => {
    const engMatches = matchUniversalDirectory('language', 'eng');
    assert.ok(engMatches.includes('English'), 'Must match English for "eng"');

    const spanMatches = matchUniversalDirectory('language', 'span');
    assert.ok(spanMatches.some(l => /spanish/i.test(l)), 'Must match Spanish for "span"');

    const gerMatches = matchUniversalDirectory('language', 'ger');
    assert.ok(gerMatches.some(l => /german/i.test(l)), 'Must match German for "ger"');
});

test('2.6 Edge cases: empty query, unknown directory, special characters', () => {
    assert.deepEqual(matchUniversalDirectory('company', ''), [], 'Empty query returns empty array');
    assert.deepEqual(matchUniversalDirectory('company', '   '), [], 'Whitespace query returns empty array');
    assert.deepEqual(matchUniversalDirectory('nonexistent_type', 'test'), [], 'Unknown type returns empty array');
    assert.deepEqual(matchUniversalDirectory(null, 'test'), [], 'Null type returns empty array');
});

// =========================================================================
// 3. BACKEND AI RUNTIME AUTOCOMPLETE VALIDATION
// =========================================================================

test('3.1 Backend aiRuntime accepts company, school, certification autocomplete types without 400 error', async () => {
    // Should NOT throw 'Unsupported autocomplete field'
    const companyRes = await executeContentOperation({
        operation: 'autocomplete',
        payload: { type: 'company', query: 'Micro' }
    });
    assert.ok(companyRes, 'Company autocomplete must return response');
    assert.ok(Array.isArray(companyRes.data.suggestions), 'Suggestions must be an array');

    const schoolRes = await executeContentOperation({
        operation: 'autocomplete',
        payload: { type: 'school', query: 'Stan' }
    });
    assert.ok(schoolRes, 'School autocomplete must return response');
    assert.ok(Array.isArray(schoolRes.data.suggestions), 'Suggestions must be an array');

    const certRes = await executeContentOperation({
        operation: 'autocomplete',
        payload: { type: 'certification', query: 'Azure' }
    });
    assert.ok(certRes, 'Certification autocomplete must return response');
    assert.ok(Array.isArray(certRes.data.suggestions), 'Suggestions must be an array');
});

test('2.7 Typing "chaitanya" matches strictly Chaitanya institutions and rejects irrelevant universities', () => {
    const chaitanyaMatches = matchUniversalDirectory('school', 'chaitanya');
    assert.ok(chaitanyaMatches.length > 0, 'Must return Chaitanya institutions');
    assert.ok(chaitanyaMatches.some(s => s.includes('Chaitanya Bharathi Institute of Technology')), 'Must match CBIT');
    assert.ok(chaitanyaMatches.some(s => s.includes('Sri Chaitanya')), 'Must match Sri Chaitanya');

    // Strict invariant: Must NOT return unrelated universities
    for (const match of chaitanyaMatches) {
        assert.match(match.toLowerCase(), /chaitanya/i, `All matches for "chaitanya" must contain "chaitanya", got: ${match}`);
    }
    assert.ok(!chaitanyaMatches.includes('Vellore Institute of Technology'), 'Must not include Vellore');
    assert.ok(!chaitanyaMatches.includes('Sri Venkateswara University'), 'Must not include Sri Venkateswara');
});

test('2.8 Abbreviation and punctuation-flexible matching works for cbit, btech, and b.tech', () => {
    const cbitMatches = matchUniversalDirectory('school', 'cbit');
    assert.ok(cbitMatches.some(s => s.includes('CBIT')), 'Must match CBIT for "cbit"');

    const btechMatches = matchUniversalDirectory('degree', 'btech');
    assert.ok(btechMatches.some(d => /b\.?tech/i.test(d)), 'Must match B.Tech for "btech"');

    const bDotTechMatches = matchUniversalDirectory('degree', 'b.tech');
    assert.ok(bDotTechMatches.some(d => /b\.?tech/i.test(d)), 'Must match B.Tech for "b.tech"');
});

