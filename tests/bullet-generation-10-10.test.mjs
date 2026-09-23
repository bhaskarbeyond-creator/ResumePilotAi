import test from 'node:test';
import assert from 'node:assert/strict';
import {
    ensureAtsOptimizedBullet,
    getRolePlaceholder,
    getRolePillars,
} from '../src/utils/bulletQuality.js';
import * as bulletQuality from '../src/utils/bulletQuality.js';
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

test('3. client role-template bullet generator (invented metrics) no longer exists (Phase 3)', () => {
    assert.equal(bulletQuality.generateClientRoleBullet, undefined);
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

test('6. Backend getContentOperationFallback asks (no template bullet) when draft is empty and only jobTitle is present', () => {
    const result = getContentOperationFallback('enhance-single-bullet', {
        jobTitle: 'Doctor of Medicine',
        company: 'Apollo Hospitals',
    });
    assert.ok(result);
    assert.equal(result.requiresAnswer, true);
    assert.equal(result.enhancedBullet, undefined);
    assert.doesNotMatch(JSON.stringify(result), /98%|Diagnosed and treated/);
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

test('9. ensureAtsOptimizedBullet only formats text — it never adds metrics, outcomes or inflated verbs', () => {
    const clinicalRaw = 'responsible for patient care and daily rounds';
    const clinicalOptimized = ensureAtsOptimizedBullet(clinicalRaw);
    assert.equal(clinicalOptimized, 'Responsible for patient care and daily rounds.');
    assert.doesNotMatch(clinicalOptimized, /\d|%|Spearheaded|improving/);

    const withMetric = ensureAtsOptimizedBullet('Cut claim processing time by 30% using Python automation');
    assert.equal(withMetric, 'Cut claim processing time by 30% using Python automation.');
});
