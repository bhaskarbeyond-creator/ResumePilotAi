import test from 'node:test';
import assert from 'node:assert/strict';
import {
    matchUniversalDirectory,
    isDomainCompatible,
    autocorrectQuery,
    isTypoMatch,
    UNIVERSAL_SCHOOLS
} from '../src/utils/autocompleteDirectories.js';
import { executeContentOperation } from '../backend/services/aiRuntime.js';

// =========================================================================
// 1. SCHOOL / INSTITUTION DOMAIN BOUNDARY & AIIMS / AIMMS RESOLUTION
// =========================================================================

test('1.1 "AIMMS" in school field resolves to AIIMS institutions and rejects software job roles', () => {
    const results = matchUniversalDirectory('school', 'AIMMS');
    assert.ok(Array.isArray(results), 'Expected results to be an array');
    assert.ok(results.length > 0, 'Expected matches for "AIMMS"');

    // Must resolve to AIIMS (All India Institute of Medical Sciences)
    const hasAiims = results.some(r => /aiims|all india institute of medical sciences/i.test(r));
    assert.ok(hasAiims, `Expected AIIMS institution matches for "AIMMS", got: ${JSON.stringify(results)}`);

    // Strict negative invariant: NEVER return software / career job titles
    for (const item of results) {
        assert.ok(!/AIMMS Consultant/i.test(item), `Forbidden job title returned: ${item}`);
        assert.ok(!/AIMMS Developer/i.test(item), `Forbidden job title returned: ${item}`);
        assert.ok(!/AIMMS Modeler/i.test(item), `Forbidden job title returned: ${item}`);
        assert.ok(!/AIMMS Analyst/i.test(item), `Forbidden job title returned: ${item}`);
        assert.ok(!/AIMMS Business Analyst/i.test(item), `Forbidden job title returned: ${item}`);
        assert.ok(isDomainCompatible('school', item), `Item must be domain compatible: ${item}`);
    }
});

test('1.2 isDomainCompatible strictly validates school domain and rejects job titles', () => {
    // Valid educational institutions
    assert.ok(isDomainCompatible('school', 'AIIMS (All India Institute of Medical Sciences)'));
    assert.ok(isDomainCompatible('school', 'Stanford University'));
    assert.ok(isDomainCompatible('school', 'Harvard Medical School'));
    assert.ok(isDomainCompatible('school', 'AIMMS University'));
    assert.ok(isDomainCompatible('school', 'AIMMS College of Technology'));

    // Strictly forbidden job titles in school field
    assert.equal(isDomainCompatible('school', 'AIMMS Consultant'), false);
    assert.equal(isDomainCompatible('school', 'AIMMS Developer'), false);
    assert.equal(isDomainCompatible('school', 'AIMMS Modeler'), false);
    assert.equal(isDomainCompatible('school', 'AIMMS Analyst'), false);
    assert.equal(isDomainCompatible('school', 'AIMMS Business Analyst'), false);
    assert.equal(isDomainCompatible('school', 'Software Engineer'), false);
    assert.equal(isDomainCompatible('school', 'Project Manager'), false);
    assert.equal(isDomainCompatible('school', 'Registered Nurse'), false);

    // Forbidden degrees in school field
    assert.equal(isDomainCompatible('school', 'Bachelor of Science in Computer Science'), false);
    assert.equal(isDomainCompatible('school', 'Master of Business Administration'), false);
});

test('1.3 UNIVERSAL_SCHOOLS contains accredited medical institutes', () => {
    assert.ok(UNIVERSAL_SCHOOLS.includes('AIIMS (All India Institute of Medical Sciences)'));
    assert.ok(UNIVERSAL_SCHOOLS.some(s => s.includes('PGIMER Chandigarh')));
    assert.ok(UNIVERSAL_SCHOOLS.some(s => s.includes('CMC Vellore')));
    assert.ok(UNIVERSAL_SCHOOLS.some(s => s.includes('JIPMER')));
    assert.ok(UNIVERSAL_SCHOOLS.some(s => s.includes('NIMHANS')));
});

// =========================================================================
// 2. DEGREE DOMAIN INTEGRITY
// =========================================================================

test('2.1 Degree domain accepts accredited degrees and rejects job titles', () => {
    // Valid degrees
    assert.ok(isDomainCompatible('degree', 'Bachelor of Science (B.S.)'));
    assert.ok(isDomainCompatible('degree', 'Master of Science in Computer Science (M.S. CS)'));
    assert.ok(isDomainCompatible('degree', 'Doctor of Philosophy (Ph.D.)'));
    assert.ok(isDomainCompatible('degree', 'Master of Business Administration (MBA)'));
    assert.ok(isDomainCompatible('degree', 'Bachelor of Technology (B.Tech)'));
    assert.ok(isDomainCompatible('degree', 'Diploma in Mechanical Engineering'));

    // Reject bare job titles in degree field
    assert.equal(isDomainCompatible('degree', 'Software Engineer'), false);
    assert.equal(isDomainCompatible('degree', 'Frontend Developer'), false);
    assert.equal(isDomainCompatible('degree', 'Data Analyst'), false);
    assert.equal(isDomainCompatible('degree', 'Project Manager'), false);

    // Reject standalone universities in degree field
    assert.equal(isDomainCompatible('degree', 'Stanford University'), false);
});

// =========================================================================
// 3. COMPANY DOMAIN INTEGRITY
// =========================================================================

test('3.1 Company domain accepts real employers and rejects person job titles', () => {
    // Valid companies
    assert.ok(isDomainCompatible('company', 'Google'));
    assert.ok(isDomainCompatible('company', 'Apollo Hospitals'));
    assert.ok(isDomainCompatible('company', 'Microsoft'));
    assert.ok(isDomainCompatible('company', 'Mayo Clinic'));

    // Reject person job titles in company field
    assert.equal(isDomainCompatible('company', 'Software Engineer'), false);
    assert.equal(isDomainCompatible('company', 'Senior Frontend Developer'), false);
    assert.equal(isDomainCompatible('company', 'Registered Nurse'), false);
    assert.equal(isDomainCompatible('company', 'General Surgeon'), false);
});

// =========================================================================
// 4. LANGUAGE DOMAIN INTEGRITY (NO PROGRAMMING LANGUAGES IN SPOKEN LANGUAGES)
// =========================================================================

test('4.1 Language domain accepts natural human languages and rejects programming languages', () => {
    // Valid natural languages
    assert.ok(isDomainCompatible('language', 'English'));
    assert.ok(isDomainCompatible('language', 'Spanish (Español)'));
    assert.ok(isDomainCompatible('language', 'Hindi (हिन्दी)'));
    assert.ok(isDomainCompatible('language', 'German (Deutsch)'));
    assert.ok(isDomainCompatible('language', 'Mandarin Chinese (中文)'));

    // Strictly forbidden programming languages in spoken language field
    assert.equal(isDomainCompatible('language', 'Python'), false);
    assert.equal(isDomainCompatible('language', 'JavaScript'), false);
    assert.equal(isDomainCompatible('language', 'Java'), false);
    assert.equal(isDomainCompatible('language', 'C++'), false);
    assert.equal(isDomainCompatible('language', 'React'), false);
    assert.equal(isDomainCompatible('language', 'Software Developer'), false);
});

// =========================================================================
// 5. CITY DOMAIN INTEGRITY
// =========================================================================

test('5.1 City domain rejects job titles and companies', () => {
    assert.ok(isDomainCompatible('city', 'San Francisco, CA'));
    assert.ok(isDomainCompatible('city', 'Hyderabad, Telangana'));
    assert.ok(isDomainCompatible('city', 'London, England'));

    assert.equal(isDomainCompatible('city', 'Software Engineer'), false);
    assert.equal(isDomainCompatible('city', 'Google Technologies'), false);
    assert.equal(isDomainCompatible('city', 'Apollo Hospital'), false);
});

// =========================================================================
// 6. HOBBY DOMAIN INTEGRITY
// =========================================================================

test('6.1 Hobby domain rejects corporate employment and engineering tasks', () => {
    assert.ok(isDomainCompatible('hobby', 'Marathon Running'));
    assert.ok(isDomainCompatible('hobby', 'Digital Photography & Editing'));
    assert.ok(isDomainCompatible('hobby', 'Playing Piano'));

    assert.equal(isDomainCompatible('hobby', 'Software Engineering'), false);
    assert.equal(isDomainCompatible('hobby', 'Deploying Microservices'), false);
    assert.equal(isDomainCompatible('hobby', 'Sprint Planning'), false);
    assert.equal(isDomainCompatible('hobby', 'Bug Fixing'), false);
});

// =========================================================================
// 7. ISSUER & CERTIFICATION DOMAIN INTEGRITY
// =========================================================================

test('7.1 Issuer domain rejects generic job titles', () => {
    assert.ok(isDomainCompatible('issuer', 'Amazon Web Services (AWS)'));
    assert.ok(isDomainCompatible('issuer', 'Project Management Institute (PMI)'));
    assert.ok(isDomainCompatible('issuer', 'Microsoft'));
    assert.ok(isDomainCompatible('certificationIssuer', 'CompTIA'));

    assert.equal(isDomainCompatible('issuer', 'Software Developer'), false);
    assert.equal(isDomainCompatible('issuer', 'Consultant'), false);
});

// =========================================================================
// 8. BACKEND AI RUNTIME AUTOCOMPLETE INTEGRATION
// =========================================================================

test('8.1 Backend aiRuntime autocomplete for "school" with "AIMMS" filters out all job roles', async () => {
    const result = await executeContentOperation({
        operation: 'autocomplete',
        payload: {
            type: 'school',
            query: 'AIMMS',
        },
    });

    assert.ok(result && result.data, 'Expected result.data to exist');
    assert.ok(Array.isArray(result.data.suggestions), 'Expected suggestions array');

    // Every suggestion must pass the domain integrity filter
    for (const item of result.data.suggestions) {
        assert.ok(isDomainCompatible('school', item), `AI returned non-school item: ${item}`);
        assert.ok(!/consultant|developer|modeler|analyst/i.test(item), `AI returned software role for school: ${item}`);
    }
    setTimeout(() => process.exit(0), 100);
});

