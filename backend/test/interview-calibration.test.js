'use strict';

/**
 * Interview calibration unit tests: the deterministic constraint layer that
 * makes seniority and difficulty authoritative for every interview prompt.
 */
process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
    SENIORITY_LEVELS,
    DIFFICULTIES,
    INTERVIEW_TRACKS,
    DIFFICULTY_ORDER,
    SENIORITY_BANDS,
    normalizeSeniority,
    normalizeDifficulty,
    normalizeTrack,
    clampAdaptiveDifficulty,
    difficultyGuidanceFor,
    seniorityCeilingDirective,
    seniorityCeilingCompact,
    trackCategoryGuidance,
    adaptiveDifficultyPolicy,
    adaptiveDifficultyPolicyCompact,
    assessQuestionFit,
} = require('../services/interviewCalibration');

test('supported enums match the product configuration surface exactly', () => {
    assert.deepEqual([...SENIORITY_LEVELS], ['fresher', 'junior', 'mid', 'senior', 'lead', 'executive']);
    assert.deepEqual([...DIFFICULTIES], ['easy', 'medium', 'hard', 'expert']);
    assert.deepEqual([...INTERVIEW_TRACKS], ['technical', 'behavioral', 'hr', 'managerial', 'case', 'mixed']);
});

test('normalizeSeniority maps aliases and free text to canonical bands; garbage falls back deterministically', () => {
    assert.equal(normalizeSeniority('fresher'), 'fresher');
    assert.equal(normalizeSeniority('Mid-level'), 'mid');
    assert.equal(normalizeSeniority('entry-level'), 'fresher');
    assert.equal(normalizeSeniority('new graduate'), 'fresher');
    assert.equal(normalizeSeniority('Junior'), 'junior');
    assert.equal(normalizeSeniority('senior'), 'senior');
    assert.equal(normalizeSeniority('Staff / Principal'), 'senior');
    assert.equal(normalizeSeniority('Engineering Lead'), 'lead');
    assert.equal(normalizeSeniority('Director of Engineering'), 'executive');
    assert.equal(normalizeSeniority('Solution Architect'), 'lead', 'architect titles map to the lead band');
    assert.equal(normalizeSeniority('xyzzy-plugh-42'), 'mid', 'unknown values fall back deterministically');
    assert.equal(normalizeSeniority(''), 'mid');
    assert.equal(normalizeSeniority(undefined), 'mid');
});

test('normalizeDifficulty and normalizeTrack only accept supported values', () => {
    assert.equal(normalizeDifficulty('hard'), 'hard');
    assert.equal(normalizeDifficulty('Expert'), 'expert');
    assert.equal(normalizeDifficulty('ultra'), 'medium');
    assert.equal(normalizeDifficulty(''), 'medium');
    assert.equal(normalizeTrack('technical'), 'technical');
    assert.equal(normalizeTrack('Case Study'), 'mixed', 'labels are not silently coerced to a wrong track');
    assert.equal(normalizeTrack('case'), 'case');
});

test('clampAdaptiveDifficulty: model-reported difficulty can never exceed the configured ceiling', () => {
    assert.equal(clampAdaptiveDifficulty('expert', 'medium'), 'medium', 'drift is clamped down to the ceiling');
    assert.equal(clampAdaptiveDifficulty('hard', 'medium'), 'medium');
    assert.equal(clampAdaptiveDifficulty('medium', 'medium'), 'medium');
    assert.equal(clampAdaptiveDifficulty('easy', 'hard'), 'easy', 'adaptation can move down');
    assert.equal(clampAdaptiveDifficulty('hard', 'hard'), 'hard');
    assert.equal(clampAdaptiveDifficulty('garbage-value', 'hard'), 'hard', 'invalid values fall back to the ceiling');
    assert.equal(clampAdaptiveDifficulty('expert', 'expert'), 'expert', 'configured expert keeps expert');
    // Monotonic: order never exceeds the ceiling's order.
    for (const configured of DIFFICULTIES) {
        for (const reported of DIFFICULTIES) {
            const clamped = clampAdaptiveDifficulty(reported, configured);
            assert.ok(DIFFICULTY_ORDER[clamped] <= DIFFICULTY_ORDER[configured]);
        }
    }
});

test('difficulty guidance is seniority-conditional: hard never means "senior-level content" for early bands', () => {
    for (const seniority of ['fresher', 'junior', 'mid']) {
        for (const difficulty of ['hard', 'expert']) {
            const guidance = difficultyGuidanceFor(seniority, difficulty);
            assert.doesNotMatch(guidance, /senior-level decision making/i, `${seniority}+${difficulty} must not demand senior-level content`);
            assert.doesNotMatch(guidance, /enterprise-scale architecture/i, `${seniority}+${difficulty} must not demand enterprise-scale content`);
            assert.match(guidance, /seniority ceiling/i, `${seniority}+${difficulty} guidance must reference the ceiling`);
        }
    }
    // Every pairing is defined and mentions its band.
    for (const seniority of SENIORITY_LEVELS) {
        for (const difficulty of DIFFICULTIES) {
            const guidance = difficultyGuidanceFor(seniority, difficulty);
            assert.ok(guidance.length > 40);
            assert.ok(guidance.includes(SENIORITY_BANDS[seniority].label));
        }
    }
});

test('seniorityCeilingDirective is binding, defines the band, and locks precedence against untrusted context', () => {
    for (const seniority of SENIORITY_LEVELS) {
        const directive = seniorityCeilingDirective(seniority);
        assert.match(directive, /SENIORITY CEILING \(APPLICATION POLICY — IMMUTABLE\)/);
        assert.ok(directive.includes(SENIORITY_BANDS[seniority].label));
        assert.match(directive, /PRECEDENCE/);
        assert.match(directive, /can NEVER change the seniority band/);
        assert.match(directive, /technology mentions are not evidence of senior professional experience/i);
        assert.match(directive, /never a question from a higher band/);
    }
    const fresher = seniorityCeilingDirective('fresher');
    assert.match(fresher, /never require multi-year production ownership/i, 'fresher ceiling forbids production-scale ownership asks');
    const compact = seniorityCeilingCompact('fresher', 'medium');
    assert.match(compact, /IMMUTABLE/);
    assert.match(compact, /Fresher/);
    assert.match(compact, /≤ "medium"|≤ "medium"/);
    assert.match(compact, /harder in-band/);
});

test('track category guidance is track-conditional and scale-bounded per seniority', () => {
    const technical = trackCategoryGuidance('technical', 'mid');
    const behavioral = trackCategoryGuidance('behavioral', 'fresher');
    const hr = trackCategoryGuidance('hr', 'fresher');
    const mixed = trackCategoryGuidance('mixed', 'senior');
    assert.match(technical, /Debugging/i);
    assert.match(technical, /only for senior and above/i, 'systems trade-offs stay gated on seniority');
    assert.match(behavioral, /STAR/);
    assert.match(behavioral, /academic\/internship\/team-scale at fresher/);
    assert.doesNotMatch(hr, /Systems Trade-offs/i);
    assert.ok(technical !== behavioral && behavioral !== mixed, 'tracks must not collapse into one another');
    assert.match(trackCategoryGuidance('technical', 'fresher'), /Scale every scenario to the "Fresher/);
});

test('adaptive policy declares start, trigger, ceiling, floor and seniority boundary', () => {
    const policy = adaptiveDifficultyPolicy({ difficulty: 'medium', experienceLevel: 'fresher' });
    assert.match(policy, /Starting difficulty is "medium"/);
    assert.match(policy, /MAXIMUM difficulty for the whole interview is "medium"/);
    assert.match(policy, /Trigger: adapt only to the depth/);
    assert.match(policy, /minimum "easy"/);
    assert.match(policy, /never leave the "Fresher/);
    assert.match(policy, /A strong answer never upgrades the configured seniority/);
    const compact = adaptiveDifficultyPolicyCompact({ difficulty: 'hard' });
    assert.match(compact, /≤ "hard"/);
    assert.match(compact, /floor easy/);
});

test('assessQuestionFit deterministically flags over-band questions per seniority', () => {
    const overBandFresher = [
        'As a principal architect, how would you redesign a planet-scale event platform?',
        'Walk me through a system you designed for millions of users.',
        'This role requires 10 years of hands-on Kubernetes experience. Where would you start?',
        'Describe how you led an organization-wide reorg of 200+ engineers.',
        'How did you present the P&L impact to the board of directors?',
    ];
    for (const question of overBandFresher) {
        const fit = assessQuestionFit(question, { seniority: 'fresher', track: 'technical' });
        assert.equal(fit.ok, false, `fresher must reject: ${question}`);
        assert.ok(fit.violations.length >= 1);
    }

    // Same content is in-band for senior/executive where the rules allow it.
    assert.equal(assessQuestionFit('How would you architect a service handling millions of requests per day, and what trade-offs matter?', { seniority: 'senior' }).ok, true);
    assert.equal(assessQuestionFit('Walk me through designing an idempotent checkout API and how you would test it.', { seniority: 'fresher' }).ok, true);
    assert.equal(assessQuestionFit('How did your coursework project use a queue, and what would you improve?', { seniority: 'fresher' }).ok, true);

    // Resume-cited experience details are not requirement asks.
    assert.equal(assessQuestionFit('You mentioned using React for 2 years in your projects. Which hook behavior confused you first?', { seniority: 'fresher' }).ok, true);

    // Assistant filler is rejected at every band.
    assert.equal(assessQuestionFit("Certainly! Let's dive into your debugging skills.", { seniority: 'executive' }).ok, false);

    // Staff/lead premises are fine at lead.
    assert.equal(assessQuestionFit('As a staff engineer, how do you drive alignment across teams?', { seniority: 'lead' }).ok, true);
    assert.equal(assessQuestionFit('As a staff engineer, how do you drive alignment across teams?', { seniority: 'mid' }).ok, false);
});
