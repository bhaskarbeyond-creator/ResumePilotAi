import test from 'node:test';
import assert from 'node:assert/strict';

import {
    generateRoleInterviewQuestions,
    extractCandidateNotes,
    entryNoteLength,
    sectionQuestions,
    buildEvidencePayload,
} from '../backend/services/candidateContext.js';

import { executeContentOperation } from '../backend/services/aiRuntime.js';

// =========================================================================
// TEST SUITE 1: DYNAMIC ZERO-HARDCODED QUESTIONS & STARTER CHIPS
// =========================================================================

test('1.1 Generates role-specific questions and starter chips dynamically for Account Manager Display (Marketing/Ad Tech)', () => {
    const qSet = generateRoleInterviewQuestions('Account Manager Display', 'Dentsu International', '');
    assert.equal(qSet.length, 3, 'Should generate 3 structured questions');
    
    // Q1 should reflect the exact role and employer
    assert.match(qSet[0].question, /Account Manager Display/i);
    assert.match(qSet[0].question, /Dentsu International/i);
    assert.ok(Array.isArray(qSet[0].starterChips) && qSet[0].starterChips.length >= 3);
    assert.ok(qSet[0].starterChips.some(c => /campaign|client/i.test(c)), 'Should contain marketing starter chips');

    // Q2 should ask about ad platforms / tools
    assert.match(qSet[1].question, /ad platforms|tools/i);
    assert.ok(qSet[1].starterChips.some(c => /ad manager|dsp|crm/i.test(c)), 'Should contain ad tech chips');

    // Q3 should ask about measurable metrics like ROAS/revenue
    assert.match(qSet[2].question, /measurable results|roas|revenue/i);
    assert.ok(qSet[2].starterChips.some(c => /roas|revenue|kpi/i.test(c)), 'Should contain metrics chips');
});

test('1.2 Generates completely different questions and starter chips dynamically for Software Engineer (Tech)', () => {
    const qSet = generateRoleInterviewQuestions('Software Engineer', 'Google', '');
    assert.equal(qSet.length, 3);
    assert.match(qSet[0].question, /Software Engineer/i);
    assert.match(qSet[0].question, /Google/i);
    assert.ok(qSet[0].starterChips.some(c => /architecture|api|microservices/i.test(c)), 'Tech Q1 chips');
    assert.ok(qSet[1].starterChips.some(c => /node|sql|docker|aws/i.test(c)), 'Tech Q2 chips');
    assert.ok(qSet[2].starterChips.some(c => /latency|uptime|scale/i.test(c)), 'Tech Q3 chips');

    // Must NOT contain marketing chips!
    assert.ok(!qSet[0].starterChips.some(c => /ad tech|dsp|roas/i.test(c)), 'Must not leak advertising chips into engineering');
});

test('1.3 Generates completely different questions and starter chips dynamically for Pediatric Nurse (Healthcare)', () => {
    const qSet = generateRoleInterviewQuestions('Pediatric Nurse', 'Mayo Clinic', '');
    assert.equal(qSet.length, 3);
    assert.match(qSet[0].question, /Pediatric Nurse/i);
    assert.match(qSet[0].question, /Mayo Clinic/i);
    assert.ok(qSet[0].starterChips.some(c => /patient care|triage/i.test(c)), 'Clinical Q1 chips');
    assert.ok(qSet[1].starterChips.some(c => /ehr|medication|monitoring/i.test(c)), 'Clinical Q2 chips');
    assert.ok(qSet[2].starterChips.some(c => /patients\/shift|safety/i.test(c)), 'Clinical Q3 chips');
});

// =========================================================================
// TEST SUITE 2: CANDIDATE ANSWERS EVIDENCE EXTRACTION & BULLET SYNTHESIS
// =========================================================================

test('2.1 extractCandidateNotes extracts notes from nested entry.description and candidateAnswers', () => {
    const payloadFromModal = {
        entry: {
            jobTitle: 'Account Manager Display',
            employer: 'Dentsu International',
            description: 'Managed display advertising accounts and media spend.',
        },
        candidateAnswers: {
            q1: 'Led digital media campaigns and managed client relationships.',
            q2: 'Used Google Ad Manager and DV360 for programmatic display.',
            q3: 'Achieved 25% revenue growth and 3.2x average ROAS.',
        },
        targetRole: 'Account Manager Display',
    };

    const extracted = extractCandidateNotes(payloadFromModal);
    assert.match(extracted, /Google Ad Manager/i);
    assert.match(extracted, /3\.2x average ROAS/i);

    const noteLen = entryNoteLength('generate-work-description', payloadFromModal);
    assert.ok(noteLen > 50, `Note length must exceed 50 chars, got: ${noteLen}`);
});

test('2.2 Bullet synthesis with candidateAnswers returns suggestions and does not fail with ungrounded error', async () => {
    const payloadFromModal = {
        entry: {
            jobTitle: 'Account Manager Display',
            employer: 'Dentsu International',
            description: 'Led digital display campaigns across client accounts.',
        },
        candidateAnswers: {
            q1: 'Spearheaded digital display advertising campaigns across major retail clients.',
            q2: 'Managed programmatic ad spend using Google Ad Manager and Salesforce CRM.',
            q3: 'Delivered 25% year-over-year revenue growth and 3.5x average ROAS.',
        },
        targetRole: 'Account Manager Display',
    };

    const res = await executeContentOperation({
        operation: 'generate-work-description',
        payload: payloadFromModal,
    });

    assert.ok(res.data, 'Must return response data');
    const suggestions = res.data.suggestions || [];
    assert.ok(suggestions.length > 0, 'Must synthesize bullets from candidate answers');
    assert.ok(
        suggestions.some(s => /display|retail|ad manager|roas|revenue/i.test(typeof s === 'string' ? s : s?.text || '')),
        'Synthesized bullets must reflect candidate answers'
    );
});

test('2.3 Multi-bullet handling: returns multiple distinct bullets when multiple responsibilities or lines are provided', async () => {
    const multiBulletPayload = {
        entry: {
            jobTitle: 'Senior Frontend Engineer',
            employer: 'TechCorp',
            description: '• Architected design system and unified 40+ UI components.\n• Improved page load time by 45% using code splitting.\n• Mentored 4 junior engineers on React best practices.',
        },
        targetRole: 'Senior Frontend Engineer',
    };

    const res = await executeContentOperation({
        operation: 'generate-work-description',
        payload: multiBulletPayload,
    });

    assert.ok(res.data, 'Must return response data');
    const suggestions = res.data.suggestions || [];
    assert.ok(suggestions.length >= 2, `Expected at least 2 distinct bullets for multi-bullet input, got ${suggestions.length}`);
});
