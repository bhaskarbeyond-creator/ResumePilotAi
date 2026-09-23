import test from 'node:test';
import assert from 'node:assert/strict';
import {
    matchUniversalDirectory,
    synthesizeDynamicSuggestions,
    UNIVERSAL_COMPANIES,
    UNIVERSAL_SCHOOLS,
    UNIVERSAL_DEGREES,
    UNIVERSAL_CERTIFICATIONS,
    UNIVERSAL_LANGUAGES,
    UNIVERSAL_SKILLS,
    UNIVERSAL_CITIES,
    UNIVERSAL_JOB_TITLES,
} from '../src/utils/autocompleteDirectories.js';
import {
    generateRoleInterviewQuestions,
    generateEducationInterviewQuestions,
} from '../src/utils/roleInterviewGenerator.js';

// =========================================================================
// 1. OPEN-ENDED DYNAMIC ROLE AUTOCOMPLETE (NEVER HARDCODED / NEVER EMPTY)
// =========================================================================

test('1.1 Medical & Healthcare role prefixes synthesize rich professional suggestions', () => {
    const cardio = matchUniversalDirectory('jobTitle', 'cardio');
    assert.ok(cardio.length >= 3, 'Must return multiple suggestions for "cardio"');
    assert.ok(cardio.some(r => /cardiolog/i.test(r) || /cardiovascular/i.test(r)), 'Must contain cardiology roles');

    const neuro = matchUniversalDirectory('jobTitle', 'neuro');
    assert.ok(neuro.length >= 3, 'Must return multiple suggestions for "neuro"');
    assert.ok(neuro.some(r => /neurolog/i.test(r) || /neurosurgeon/i.test(r)), 'Must contain neurology roles');

    const dent = matchUniversalDirectory('jobTitle', 'dent');
    assert.ok(dent.length >= 3, 'Must return multiple suggestions for "dent"');
    assert.ok(dent.some(r => /dentist/i.test(r) || /dental/i.test(r)), 'Must contain dental roles');

    const pharm = matchUniversalDirectory('jobTitle', 'pharm');
    assert.ok(pharm.length >= 3, 'Must return multiple suggestions for "pharm"');
    assert.ok(pharm.some(r => /pharmac/i.test(r)), 'Must contain pharmacy roles');
});

test('1.2 Aviation & Aerospace role prefixes synthesize rich professional suggestions', () => {
    const pilot = matchUniversalDirectory('jobTitle', 'pilot');
    assert.ok(pilot.length >= 3, 'Must return multiple suggestions for "pilot"');
    assert.ok(pilot.some(r => /commercial pilot/i.test(r) || /airline transport pilot/i.test(r)), 'Must contain pilot certifications/roles');

    const flight = matchUniversalDirectory('jobTitle', 'flight');
    assert.ok(flight.length >= 3, 'Must return multiple suggestions for "flight"');
    assert.ok(flight.some(r => /flight attendant/i.test(r) || /flight instructor/i.test(r)), 'Must contain flight roles');

    const aero = matchUniversalDirectory('jobTitle', 'aero');
    assert.ok(aero.length >= 3, 'Must return multiple suggestions for "aero"');
    assert.ok(aero.some(r => /aerospace/i.test(r) || /aeronautical/i.test(r)), 'Must contain aerospace roles');
});

test('1.3 Skilled Trades & Craftsmanship role prefixes synthesize rich professional suggestions', () => {
    const weld = matchUniversalDirectory('jobTitle', 'weld');
    assert.ok(weld.length >= 3, 'Must return multiple suggestions for "weld"');
    assert.ok(weld.some(r => /welder/i.test(r)), 'Must contain welder roles');

    const plumb = matchUniversalDirectory('jobTitle', 'plumb');
    assert.ok(plumb.length >= 3, 'Must return multiple suggestions for "plumb"');
    assert.ok(plumb.some(r => /plumber/i.test(r)), 'Must contain plumber roles');

    const elec = matchUniversalDirectory('jobTitle', 'elec');
    assert.ok(elec.length >= 3, 'Must return multiple suggestions for "elec"');
    assert.ok(elec.some(r => /electrician/i.test(r)), 'Must contain electrician roles');

    const hvac = matchUniversalDirectory('jobTitle', 'hvac');
    assert.ok(hvac.length >= 3, 'Must return multiple suggestions for "hvac"');
    assert.ok(hvac.some(r => /hvac/i.test(r)), 'Must contain HVAC roles');
});

test('1.4 Legal, Culinary, Engineering & Creative role prefixes synthesize rich suggestions', () => {
    const paral = matchUniversalDirectory('jobTitle', 'paral');
    assert.ok(paral.length >= 2, 'Must return paralegal roles');
    assert.ok(paral.some(r => /paralegal/i.test(r)), 'Must contain Paralegal');

    const chef = matchUniversalDirectory('jobTitle', 'chef');
    assert.ok(chef.length >= 3, 'Must return chef roles');
    assert.ok(chef.some(r => /executive chef/i.test(r) || /sous chef/i.test(r)), 'Must contain Executive or Sous Chef');

    const civil = matchUniversalDirectory('jobTitle', 'civil');
    assert.ok(civil.length >= 3, 'Must return civil engineering roles');
    assert.ok(civil.some(r => /civil engineer/i.test(r)), 'Must contain Civil Engineer');

    const anim = matchUniversalDirectory('jobTitle', 'anim');
    assert.ok(anim.length >= 2, 'Must return animator roles');
    assert.ok(anim.some(r => /animator/i.test(r)), 'Must contain Animator');
});

test('1.5 Arbitrary or emerging profession query synthesizes hierarchical seniority roles', () => {
    const custom = matchUniversalDirectory('jobTitle', 'Robotics');
    assert.ok(custom.length >= 3, 'Must return suggestions for "Robotics"');
    assert.ok(custom.some(r => r.includes('Robotics')), 'Must contain "Robotics"');
    assert.ok(custom.some(r => /senior|lead|specialist|manager|engineer/i.test(r)), 'Must synthesize seniority ladders');
});

// =========================================================================
// 2. OPEN-ENDED DYNAMIC COMPANY, SCHOOL & DEGREE AUTOCOMPLETE
// =========================================================================

test('2.1 Company autocomplete synthesizes organization structures for any typed prefix', () => {
    const acme = matchUniversalDirectory('company', 'Acme');
    assert.ok(acme.length >= 3, 'Must return suggestions for "Acme"');
    assert.ok(acme.every(c => c.toLowerCase().includes('acme')), 'Every suggestion must contain "Acme"');
    assert.ok(acme.some(c => /technologies|solutions|group|global/i.test(c)), 'Must include realistic corporate suffixes');
});

test('2.2 School autocomplete synthesizes valid universities for arbitrary institution names', () => {
    const oxford = matchUniversalDirectory('school', 'Oxford');
    assert.ok(oxford.some(s => s.includes('Oxford')), 'Must match Oxford');

    const customSchool = matchUniversalDirectory('school', 'Valencia');
    assert.ok(customSchool.length >= 2, 'Must return suggestions for "Valencia"');
    assert.ok(customSchool.some(s => /valencia university|university of valencia|valencia college/i.test(s)), 'Must synthesize university names');
});

test('2.3 Degree autocomplete synthesizes accredited qualification tiers for any field', () => {
    const aeroDeg = matchUniversalDirectory('degree', 'Aerospace');
    assert.ok(aeroDeg.length >= 3, 'Must return degree options for "Aerospace"');
    assert.ok(aeroDeg.some(d => /bachelor of science/i.test(d) && /aerospace/i.test(d)), 'Must include Bachelor of Science in Aerospace');
    assert.ok(aeroDeg.some(d => /master of science/i.test(d) && /aerospace/i.test(d)), 'Must include Master of Science in Aerospace');

    const nursDeg = matchUniversalDirectory('degree', 'Nursing');
    assert.ok(nursDeg.some(d => /nursing/i.test(d)), 'Must include Nursing degrees');
});

test('2.4 Certification autocomplete synthesizes credentials across tech, finance, and trades', () => {
    const aws = matchUniversalDirectory('certification', 'AWS');
    assert.ok(aws.some(c => /aws certified/i.test(c)), 'Must contain AWS certs');

    const cpa = matchUniversalDirectory('certification', 'CPA');
    assert.ok(cpa.some(c => /cpa|certified public accountant/i.test(c)), 'Must contain CPA credentials');

    const faa = matchUniversalDirectory('certification', 'FAA');
    assert.ok(faa.some(c => /faa/i.test(c)), 'Must contain FAA pilot certifications');

    const osha = matchUniversalDirectory('certification', 'OSHA');
    assert.ok(osha.length >= 1, 'Must contain OSHA credentials');
});

// =========================================================================
// 3. ROLE INTERVIEW GENERATOR DOMAIN COMPREHENSIVENESS
// =========================================================================

test('3.1 Generates domain-tailored questions and starter chips for Aviation (Commercial Pilot)', () => {
    const q = generateRoleInterviewQuestions('Commercial Pilot', 'Skyline Airlines');
    assert.equal(q.length, 3, 'Must return 3 interview questions');
    assert.ok(q[0].question.includes('Commercial Pilot'), 'Q1 mentions Commercial Pilot');
    assert.ok(q[0].starterChips.some(c => /flight operations|pre-flight/i.test(c)), 'Q1 chips tailored to flight');
    assert.ok(q[1].starterChips.some(c => /garmin|fmc|autopilot|faa/i.test(c)), 'Q2 chips tailored to avionics');
    assert.deepEqual(q[2].starterChips, [], 'No canned outcome chips (would insert invented metrics into the answer)');
});

test('3.2 Generates domain-tailored questions and starter chips for Skilled Trades (Master Electrician)', () => {
    const q = generateRoleInterviewQuestions('Master Electrician', 'Volt Contracting');
    assert.ok(q[0].starterChips.some(c => /troubleshooting|installation|code compliance/i.test(c)), 'Q1 chips tailored to electrical trades');
    assert.ok(q[1].starterChips.some(c => /multimeter|osha|schematic/i.test(c)), 'Q2 chips tailored to trade tools');
    assert.deepEqual(q[2].starterChips, [], 'No canned outcome chips (would insert invented metrics into the answer)');
});

test('3.3 Generates domain-tailored questions and starter chips for Education (High School Teacher)', () => {
    const q = generateRoleInterviewQuestions('High School Teacher', 'Lincoln High School');
    assert.ok(q[0].starterChips.some(c => /lesson planning|instruction|curriculum/i.test(c)), 'Q1 chips tailored to education');
    assert.ok(q[1].starterChips.some(c => /canvas|blackboard|classroom/i.test(c)), 'Q2 chips tailored to LMS & ed-tech');
    assert.deepEqual(q[2].starterChips, [], 'No canned outcome chips (would insert invented metrics into the answer)');
});

test('3.4 Generates domain-tailored questions and starter chips for Legal (Litigation Paralegal)', () => {
    const q = generateRoleInterviewQuestions('Litigation Paralegal', 'Baker & Daniels LLP');
    assert.ok(q[0].starterChips.some(c => /brief drafting|discovery|filings/i.test(c)), 'Q1 chips tailored to legal');
    assert.ok(q[1].starterChips.some(c => /westlaw|lexisnexis|relativity/i.test(c)), 'Q2 chips tailored to legal databases');
});

test('3.5 Generates domain-tailored questions and starter chips for Supply Chain & Logistics', () => {
    const q = generateRoleInterviewQuestions('Supply Chain Manager', 'Global Logistics Co');
    assert.ok(q[0].starterChips.some(c => /inventory|freight|procurement/i.test(c)), 'Q1 chips tailored to supply chain');
    assert.ok(q[1].starterChips.some(c => /sap|wms|six sigma/i.test(c)), 'Q2 chips tailored to ERP & WMS');
    assert.deepEqual(q[2].starterChips, [], 'No canned outcome chips (would insert invented metrics into the answer)');
});

test('3.6 Education interview questions adapt to Humanities, Science, and Social Work', () => {
    const art = generateEducationInterviewQuestions('Bachelor of Fine Arts', 'Rhode Island School of Design');
    assert.ok(art[0].starterChips.some(c => /studio|art history|critical theory/i.test(c)), 'Coursework chips tailored to art');

    const bio = generateEducationInterviewQuestions('B.S. in Molecular Biology', 'UC Berkeley');
    assert.ok(bio[0].starterChips.some(c => /organic chemistry|molecular biology/i.test(c)), 'Coursework chips tailored to science');

    const psych = generateEducationInterviewQuestions('Master of Social Work', 'Columbia University');
    assert.ok(psych[0].starterChips.some(c => /psychology|curriculum|development/i.test(c)), 'Coursework chips tailored to social work');
});
