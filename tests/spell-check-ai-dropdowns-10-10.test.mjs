import test from 'node:test';
import assert from 'node:assert/strict';
import {
    matchUniversalDirectory,
    isTypoMatch,
    levenshteinDistance
} from '../src/utils/autocompleteDirectories.js';

test('1.1 Levenshtein distance calculations are accurate and fast', () => {
    assert.equal(levenshteinDistance('hyderbad', 'hyderabad'), 1);
    assert.equal(levenshteinDistance('oncolgist', 'oncologist'), 1);
    assert.equal(levenshteinDistance('enginer', 'engineer'), 1);
    assert.equal(levenshteinDistance('recat', 'react'), 2);
    assert.equal(levenshteinDistance('acountant', 'accountant'), 1);
    assert.equal(levenshteinDistance('apolo', 'apollo'), 1);
    assert.equal(levenshteinDistance('same', 'same'), 0);
});

test('1.2 isTypoMatch identifies real-world spelling mistakes while rejecting unrelated text', () => {
    // Exact / prefix / substring matches
    assert.ok(isTypoMatch('Software Engineer', 'software'), 'Exact prefix matches');
    assert.ok(isTypoMatch('Senior Software Engineer', 'engineer'), 'Word prefix matches');

    // Typo / spell-check matches
    assert.ok(isTypoMatch('Hyderabad, Telangana', 'hyderbad'), 'Matches missing letter in city');
    assert.ok(isTypoMatch('Medical Oncologist', 'oncolgist'), 'Matches missing letter in medical role');
    assert.ok(isTypoMatch('React.js', 'recat'), 'Matches transposed letters in skill');
    assert.ok(isTypoMatch('Stanford University', 'standford'), 'Matches extra letter in university');
    assert.ok(isTypoMatch('Apollo Hospitals', 'apolo'), 'Matches single consonant typo');
    assert.ok(isTypoMatch('Senior Software Engineer', 'softwre enginer'), 'Matches multi-word typo query');

    // Negative invariant: Completely unrelated text MUST NOT match
    assert.ok(!isTypoMatch('Registered Nurse', 'enginer'), 'Nurse must not match enginer');
    assert.ok(!isTypoMatch('Dentist', 'hyderbad'), 'Dentist must not match hyderbad');
    assert.ok(!isTypoMatch('Vellore Institute of Technology', 'chaitanya'), 'Vellore must not match chaitanya');
});

test('2.1 City autocomplete performs spell check for misspelled cities', () => {
    const hydMatches = matchUniversalDirectory('city', 'hyderbad');
    assert.ok(hydMatches.length > 0, 'Must return matches for "hyderbad"');
    assert.ok(hydMatches.some(c => c.includes('Hyderabad, Telangana')), 'Must suggest correctly spelled Hyderabad');

    const mumbayMatches = matchUniversalDirectory('city', 'mumbay');
    assert.ok(mumbayMatches.some(c => c.includes('Mumbai, Maharashtra')), 'Must suggest correctly spelled Mumbai');

    const bangloreMatches = matchUniversalDirectory('city', 'banglore');
    assert.ok(bangloreMatches.some(c => c.includes('Bangalore')), 'Must suggest correctly spelled Bangalore');

    const sanFransiscoMatches = matchUniversalDirectory('city', 'san fransisco');
    assert.ok(sanFransiscoMatches.some(c => c.includes('San Francisco, CA')), 'Must suggest correctly spelled San Francisco');

    const gaziabadMatches = matchUniversalDirectory('city', 'gaziabad');
    assert.ok(gaziabadMatches.length > 0, 'Must return matches for "gaziabad"');
    assert.ok(gaziabadMatches.some(c => c.includes('Ghaziabad, Uttar Pradesh')), 'Must suggest correctly spelled Ghaziabad for "gaziabad"');

    const ghaziabadMatches = matchUniversalDirectory('city', 'ghaziabad');
    assert.ok(ghaziabadMatches.length > 0, 'Must return matches for "ghaziabad"');
    assert.ok(ghaziabadMatches.some(c => c.includes('Ghaziabad, Uttar Pradesh')), 'Must suggest Ghaziabad for "ghaziabad"');
});

test('2.2 Job Title autocomplete performs spell check for roles with typos', () => {
    const oncolgistMatches = matchUniversalDirectory('jobtitle', 'oncolgist');
    assert.ok(oncolgistMatches.length > 0, 'Must return matches for "oncolgist"');
    assert.ok(oncolgistMatches.some(r => /oncologist/i.test(r)), 'Must suggest correctly spelled Oncologist');

    const enginerMatches = matchUniversalDirectory('jobtitle', 'enginer');
    assert.ok(enginerMatches.some(r => /engineer/i.test(r)), 'Must suggest Engineer for "enginer"');

    const acountantMatches = matchUniversalDirectory('jobtitle', 'acountant');
    assert.ok(acountantMatches.some(r => /accountant/i.test(r)), 'Must suggest Accountant for "acountant"');

    const managrMatches = matchUniversalDirectory('jobtitle', 'managr');
    assert.ok(managrMatches.some(r => /manager/i.test(r)), 'Must suggest Manager for "managr"');

    const multiTypoMatches = matchUniversalDirectory('jobtitle', 'softwre enginer');
    assert.ok(multiTypoMatches.some(r => /software engineer/i.test(r)), 'Must suggest Software Engineer for "softwre enginer"');
});

test('2.3 Skills autocomplete performs spell check for technical skills', () => {
    const recatMatches = matchUniversalDirectory('skill', 'recat');
    assert.ok(recatMatches.length > 0, 'Must return matches for "recat"');
    assert.ok(recatMatches.some(s => /react/i.test(s)), 'Must suggest React for "recat"');

    const pyhonMatches = matchUniversalDirectory('skill', 'pyhon');
    assert.ok(pyhonMatches.some(s => /python/i.test(s)), 'Must suggest Python for "pyhon"');

    const javscriptMatches = matchUniversalDirectory('skill', 'javscript');
    assert.ok(javscriptMatches.some(s => /javascript/i.test(s)), 'Must suggest JavaScript for "javscript"');
});

test('2.4 Company & Healthcare autocomplete handles typos gracefully', () => {
    const apoloMatches = matchUniversalDirectory('company', 'apolo');
    assert.ok(apoloMatches.some(c => /apollo/i.test(c)), 'Must suggest Apollo for "apolo"');

    const momHospitlMatches = matchUniversalDirectory('company', 'mom hospitl');
    assert.ok(momHospitlMatches.length > 0, 'Must return matches for "mom hospitl"');
    assert.ok(momHospitlMatches.some(c => /mom hospital/i.test(c)), 'Must suggest MOM Hospital for "mom hospitl"');
    // Strict invariant: healthcare typos must not produce "Technologies" or "Solutions"
    assert.ok(!momHospitlMatches.some(c => /technologies/i.test(c)), 'Must NOT include Technologies');
    assert.ok(!momHospitlMatches.some(c => /solutions/i.test(c)), 'Must NOT include Solutions');
});

test('2.5 School autocomplete handles typos in university queries', () => {
    const standfordMatches = matchUniversalDirectory('school', 'standford');
    assert.ok(standfordMatches.some(s => /stanford/i.test(s)), 'Must suggest Stanford University for "standford"');
});

test('2.6 Explicit user case: "histitals" autocorrects to "hospitals" and returns genuine hospital networks', () => {
    const histitalsMatches = matchUniversalDirectory('company', 'histitals');
    assert.ok(histitalsMatches.length > 0, 'Must return matches for "histitals"');
    assert.ok(histitalsMatches.some(c => /hospitals?/i.test(c)), 'Must match genuine hospital networks');
    // Strict invariant: "histitals" must NOT produce fake corporate entities
    assert.ok(!histitalsMatches.some(c => /technologies/i.test(c)), 'Must NOT include Technologies');
    assert.ok(!histitalsMatches.some(c => /solutions/i.test(c)), 'Must NOT include Solutions');
});

test('2.7 Explicit user case: "MOM histitals" autocorrects to "MOM Hospitals" without corporate suffixes', () => {
    const momHistitalsMatches = matchUniversalDirectory('company', 'MOM histitals');
    assert.ok(momHistitalsMatches.length > 0, 'Must return matches for "MOM histitals"');
    assert.ok(momHistitalsMatches.some(c => /mom hospitals/i.test(c)), 'Must suggest MOM Hospitals');
    assert.ok(!momHistitalsMatches.some(c => /technologies/i.test(c)), 'Must NOT include Technologies');
    assert.ok(!momHistitalsMatches.some(c => /solutions/i.test(c)), 'Must NOT include Solutions');
});

test('3.1 Typo-tolerant keystroke performance: 100 queries run under 60ms', () => {
    const queries = ['hyderbad', 'oncolgist', 'recat', 'enginer', 'apolo', 'softwre enginer', 'mumbay', 'acountant', 'histitals'];
    const start = performance.now();
    for (let i = 0; i < 100; i++) {
        const q = queries[i % queries.length];
        matchUniversalDirectory('jobtitle', q);
    }
    const duration = performance.now() - start;
    assert.ok(duration < 60, `100 queries took ${duration.toFixed(2)}ms (must be < 60ms, i.e. < 0.6ms per keystroke)`);
});

test('4.1 City Aliases & Metro Codes: instant resolution for colloquial and airport codes', () => {
    // Andhra Pradesh & Telangana
    assert.equal(matchUniversalDirectory('city', 'vizag')[0], 'Visakhapatnam, Andhra Pradesh');
    assert.equal(matchUniversalDirectory('city', 'vzg')[0], 'Visakhapatnam, Andhra Pradesh');
    assert.equal(matchUniversalDirectory('city', 'hyd')[0], 'Hyderabad, Telangana');

    // Maharashtra
    assert.equal(matchUniversalDirectory('city', 'bombay')[0], 'Mumbai, Maharashtra');
    assert.equal(matchUniversalDirectory('city', 'bom')[0], 'Mumbai, Maharashtra');
    assert.equal(matchUniversalDirectory('city', 'poona')[0], 'Pune, Maharashtra');

    // West Bengal & Tamil Nadu
    assert.equal(matchUniversalDirectory('city', 'calcutta')[0], 'Kolkata, West Bengal');
    assert.equal(matchUniversalDirectory('city', 'ccu')[0], 'Kolkata, West Bengal');
    assert.equal(matchUniversalDirectory('city', 'madras')[0], 'Chennai, Tamil Nadu');
    assert.equal(matchUniversalDirectory('city', 'maa')[0], 'Chennai, Tamil Nadu');

    // Gujarat, Kerala, Punjab & Puducherry
    assert.equal(matchUniversalDirectory('city', 'baroda')[0], 'Vadodara, Gujarat');
    assert.equal(matchUniversalDirectory('city', 'trivandrum')[0], 'Thiruvananthapuram, Kerala');
    assert.equal(matchUniversalDirectory('city', 'cochin')[0], 'Kochi (Cochin), Kerala');
    assert.equal(matchUniversalDirectory('city', 'pondicherry')[0], 'Puducherry, Puducherry');

    // North America (US & Canada)
    assert.equal(matchUniversalDirectory('city', 'nyc')[0], 'New York, NY');
    assert.equal(matchUniversalDirectory('city', 'sf')[0], 'San Francisco, CA');
    assert.equal(matchUniversalDirectory('city', 'la')[0], 'Los Angeles, CA');
    assert.equal(matchUniversalDirectory('city', 'dc')[0], 'Washington, DC');
    assert.equal(matchUniversalDirectory('city', 'dfw')[0], 'Dallas, TX');
    assert.equal(matchUniversalDirectory('city', 'gta')[0], 'Toronto, ON');

    // Major Indian Airport Codes
    assert.equal(matchUniversalDirectory('city', 'blr')[0], 'Bangalore (Bengaluru), Karnataka');
    assert.equal(matchUniversalDirectory('city', 'del')[0], 'Delhi / New Delhi, Delhi');
});

test('4.2 Unicode Diacritic & Accent Insensitivity: seamless matches across accented terms', () => {
    // Cities
    const saoPaulo = matchUniversalDirectory('city', 'sao paulo');
    assert.ok(saoPaulo.some(c => c.includes('São Paulo')), 'Matches São Paulo without accent');

    const saoPauloAccented = matchUniversalDirectory('city', 'são paulo');
    assert.ok(saoPauloAccented.some(c => c.includes('São Paulo')), 'Matches São Paulo with accent');

    const zurich = matchUniversalDirectory('city', 'zurich');
    assert.ok(zurich.some(c => c.includes('Zurich')), 'Matches Zurich without accent');

    const zurichAccented = matchUniversalDirectory('city', 'zürich');
    assert.ok(zurichAccented.some(c => c.includes('Zurich')), 'Matches Zürich with umlaut');

    const montreal = matchUniversalDirectory('city', 'montreal');
    assert.ok(montreal.some(c => c.includes('Montreal')), 'Matches Montreal without accent');

    // Languages
    const espanol = matchUniversalDirectory('language', 'espanol');
    assert.ok(espanol.some(l => l.includes('Spanish')), 'Matches Español without tilde');

    const francais = matchUniversalDirectory('language', 'francais');
    assert.ok(francais.some(l => l.includes('French')), 'Matches Français without cedilla');

    const portugues = matchUniversalDirectory('language', 'portugues');
    assert.ok(portugues.some(l => l.includes('Portuguese')), 'Matches Português without accent');

    const cestina = matchUniversalDirectory('language', 'cestina');
    assert.ok(cestina.some(l => l.includes('Czech')), 'Matches Čeština without caron');
});

test('4.3 State & Region Inversion: typing state name returns top metro cities first', () => {
    // Telangana -> Hyderabad #1
    const telangana = matchUniversalDirectory('city', 'telangana');
    assert.equal(telangana[0], 'Hyderabad, Telangana');

    // Karnataka -> Bangalore #1
    const karnataka = matchUniversalDirectory('city', 'karnataka');
    assert.equal(karnataka[0], 'Bangalore (Bengaluru), Karnataka');

    // Maharashtra -> Mumbai & Pune top
    const maharashtra = matchUniversalDirectory('city', 'maharashtra');
    assert.equal(maharashtra[0], 'Mumbai, Maharashtra');
    assert.equal(maharashtra[1], 'Pune, Maharashtra');

    // California -> Top CA tech hubs
    const california = matchUniversalDirectory('city', 'california');
    assert.ok(california.includes('San Francisco, CA'));
    assert.ok(california.includes('San Jose, CA'));
    assert.ok(california.includes('Los Angeles, CA'));

    // Texas -> Austin & Dallas
    const texas = matchUniversalDirectory('city', 'texas');
    assert.ok(texas.includes('Austin, TX'));
    assert.ok(texas.includes('Dallas, TX'));
});

test('4.4 10/10 Comprehensive Keystroke Performance: 150 mixed queries run under 50ms', () => {
    const mixed = [
        'vizag', 'bombay', 'nyc', 'sf', 'sao paulo', 'zürich', 'telangana', 'california',
        'hyderbad', 'oncolgist', 'recat', 'apolo', 'histitals', 'gaziabad', 'blr'
    ];
    const start = performance.now();
    for (let i = 0; i < 150; i++) {
        const q = mixed[i % mixed.length];
        matchUniversalDirectory('city', q);
    }
    const duration = performance.now() - start;
    assert.ok(duration < 50, `150 mixed queries took ${duration.toFixed(2)}ms (must be < 50ms, i.e. < 0.33ms per keystroke)`);
});
