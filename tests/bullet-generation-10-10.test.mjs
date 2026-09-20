import test from 'node:test';
import assert from 'node:assert/strict';
import {
    ensureAtsOptimizedBullet,
    getRolePlaceholder,
    getRolePillars,
    generateClientRoleBullet,
} from '../src/utils/bulletQuality.js';
import {
    getContentOperationFallback,
    validateOperation,
} from '../backend/services/aiRuntime.js';
import {
    buildEvidencePayload,
    entryNoteLength,
} from '../backend/services/candidateContext.js';

test('1. getRolePlaceholder produces tailored, domain-accurate placeholders with ZERO IT buzzwords for medical roles', () => {
    const doctorPlaceholder = getRolePlaceholder('Doctor of Medicine');
    assert.match(doctorPlaceholder, /diagnosed|patient|clinical/i);
    assert.doesNotMatch(doctorPlaceholder, /downtime|microservice|latency|api|cloud/i);

    const engineerPlaceholder = getRolePlaceholder('Senior Backend Engineer');
    assert.match(engineerPlaceholder, /microservices|latency|backend|throughput/i);

    const salesPlaceholder = getRolePlaceholder('Enterprise Account Executive');
    assert.match(salesPlaceholder, /quota|revenue|pipeline|contract/i);

    const nursePlaceholder = getRolePlaceholder('Registered Nurse (RN)');
    assert.match(nursePlaceholder, /bedside care|patient|medication/i);
});

test('2. getRolePillars returns authentic functional pillars tailored to the candidate profession', () => {
    const doctorPillars = getRolePillars('Doctor of Medicine');
    assert.ok(doctorPillars.length >= 3);
    const doctorLabels = doctorPillars.map(p => p.label);
    assert.ok(doctorLabels.includes('Clinical Care'));
    assert.ok(doctorLabels.includes('Quality & Protocols'));
    assert.ok(doctorLabels.includes('Inpatient Rounds'));

    const techPillars = getRolePillars('Software Architect');
    const techLabels = techPillars.map(p => p.label);
    assert.ok(techLabels.includes('System Architecture'));
    assert.ok(techLabels.includes('Performance Optimization'));
});

test('3. generateClientRoleBullet produces authentic Google X-Y-Z ATS bullets tailored to the role', () => {
    const doctorBullet = generateClientRoleBullet('Doctor of Medicine', 'Apollo Hospitals');
    assert.match(doctorBullet, /at Apollo Hospitals/);
    assert.match(doctorBullet, /Diagnosed and treated/i);
    assert.match(doctorBullet, /98%/);
    assert.doesNotMatch(doctorBullet, /downtime|cloud|microservice/i);

    // Verifies strong action verb and terminal punctuation
    assert.ok(/^[A-Z][a-z]+/.test(doctorBullet));
    assert.ok(doctorBullet.endsWith('.'));
});

test('4. Anti-Duplication Engine guarantees distinct opening action verbs and topics across successive bullets', () => {
    const existing = [];

    // First bullet for Doctor
    const bullet1 = generateClientRoleBullet('Doctor of Medicine', 'Apollo Hospitals', existing);
    existing.push(bullet1);
    assert.match(bullet1, /Diagnosed/);

    // Second bullet must not reuse opening verb of bullet1
    const bullet2 = generateClientRoleBullet('Doctor of Medicine', 'Apollo Hospitals', existing);
    existing.push(bullet2);
    assert.notEqual(bullet1, bullet2);
    assert.notEqual(bullet2.split(' ')[0], bullet1.split(' ')[0]);

    // Third bullet must not duplicate bullet 1 or bullet 2
    const bullet3 = generateClientRoleBullet('Doctor of Medicine', 'Apollo Hospitals', existing);
    existing.push(bullet3);
    assert.notEqual(bullet2, bullet3);
    assert.notEqual(bullet1, bullet3);

    // Fourth bullet
    const bullet4 = generateClientRoleBullet('Doctor of Medicine', 'Apollo Hospitals', existing);
    existing.push(bullet4);

    // All 4 bullets are 100% unique
    const uniqueBullets = new Set(existing);
    assert.equal(uniqueBullets.size, 4);

    // All 4 opening verbs are unique
    const openingVerbs = existing.map(b => b.split(' ')[0]);
    const uniqueVerbs = new Set(openingVerbs);
    assert.equal(uniqueVerbs.size, 4);
});

test('5. Backend candidateContext attaches role, company, and existingBullets in enhance-single-bullet evidence', () => {
    const evidence = buildEvidencePayload('enhance-single-bullet', {
        jobTitle: 'Doctor of Medicine',
        company: 'Apollo Hospitals',
        location: 'Ghaziabad, Uttar Pradesh',
        existingBullets: ['Diagnosed 25+ daily acute patients.'],
    });

    assert.equal(evidence.entry.jobTitle, 'Doctor of Medicine');
    assert.equal(evidence.entry.employer, 'Apollo Hospitals');
    assert.equal(evidence.entry.city, 'Ghaziabad, Uttar Pradesh');
    assert.deepEqual(evidence.entry.existingBullets, ['Diagnosed 25+ daily acute patients.']);

    // entryNoteLength recognizes jobTitle when bullet draft is empty
    const length = entryNoteLength('enhance-single-bullet', {
        jobTitle: 'Doctor of Medicine',
        company: 'Apollo Hospitals',
    });
    assert.ok(length >= 10);
});

test('6. Backend getContentOperationFallback returns tailored role bullet when draft is empty and jobTitle is present', () => {
    const result = getContentOperationFallback('enhance-single-bullet', {
        jobTitle: 'Doctor of Medicine',
        company: 'Apollo Hospitals',
    });

    assert.ok(result);
    assert.equal(result._source, 'tailored-role-fallback');
    assert.match(result.enhancedBullet, /at Apollo Hospitals/);
    assert.match(result.enhancedBullet, /Diagnosed and treated/);
    assert.doesNotMatch(result.enhancedBullet, /downtime|microservice/i);
});

test('7. Backend getContentOperationFallback preserves original draft when bullet text is provided', () => {
    const result = getContentOperationFallback('enhance-single-bullet', {
        bullet: 'Spearheaded medical oncology research trials',
        jobTitle: 'Doctor of Medicine',
    });

    assert.ok(result);
    assert.equal(result._source, 'source-preserving-fallback');
    assert.equal(result.enhancedBullet, 'Spearheaded medical oncology research trials');
});

test('8. Backend validateOperation rejects empty payload without bullet or role', () => {
    assert.throws(
        () => validateOperation('enhance-single-bullet', {}),
        error => error.status === 400 && /required/i.test(error.message)
    );
});

test('9. ensureAtsOptimizedBullet elevates passive or metric-lacking text into high-impact ATS bullet', () => {
    const clinicalRaw = 'responsible for patient care and daily rounds';
    const clinicalOptimized = ensureAtsOptimizedBullet(clinicalRaw);
    assert.doesNotMatch(clinicalOptimized, /^responsible for/i);
    assert.match(clinicalOptimized, /Spearheaded/);
    assert.match(clinicalOptimized, /improving patient care turnaround by 20%/);
    assert.ok(clinicalOptimized.endsWith('.'));

    const generalRaw = 'responsible for process workflows';
    const generalOptimized = ensureAtsOptimizedBullet(generalRaw);
    assert.match(generalOptimized, /improving operational turnaround by 25%/);
});
