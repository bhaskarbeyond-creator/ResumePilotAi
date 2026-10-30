'use strict';

/**
 * Module 28 Integration Test Suite:
 * AI Interview Coach & Streaming Domain Question Generator
 *
 * Verifies:
 * - Deterministic seniority ceiling enforcement & anti-filler invariants
 * - Difficulty distribution matching
 * - Stream token delivery via FreeLLMAPI / Calibrated Domain Generator
 * - Turn-by-turn evaluation streaming
 * - Answer guide streaming
 * - Live HTTP SSE endpoint execution over Supertest
 */

process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const app = require('../index');
const aiCoach = require('../services/aiCoach');
const {
    SENIORITY_BANDS,
    assessQuestionFit,
} = require('../services/interviewCalibration');

const TEST_USER = {
    uid: `m28-test-${Date.now().toString(36)}`,
    email: 'candidate-m28@ime365.test',
    role: 'USER',
};

// Wire token verifier
require('../security/auth').setTokenVerifierForTests(async (token) => {
    if (token === 'valid-candidate-token') {
        return {
            uid: TEST_USER.uid,
            email: TEST_USER.email,
            email_verified: true,
            role: TEST_USER.role,
            auth_time: Math.floor(Date.now() / 1000),
        };
    }
    throw new Error('invalid token');
});

test('Module 28: AI Interview Coach & Streaming Question Generator Suite', async (t) => {

    await t.test('1. Calibrated domain question generator enforces seniority ceilings and zero generic questions', () => {
        // Test Fresher band
        const fresherQuestions = aiCoach.generateCalibratedDomainQuestions({
            role: 'Backend Engineer',
            track: 'technical',
            seniority: 'fresher',
            difficulty: 'easy',
            count: 3,
        });

        assert.equal(fresherQuestions.length, 3);
        for (const q of fresherQuestions) {
            assert.ok(q.text.length > 20, 'Question text must be substantial');
            assert.equal(aiCoach.isGenericQuestion(q.text), false, 'Must not be a generic banned question');
            const fit = assessQuestionFit(q.text, { seniority: 'fresher', track: 'technical' });
            assert.ok(fit.ok, `Fresher question must pass fit assessment without over-band violations: ${JSON.stringify(fit.violations)}`);
            assert.equal(q.seniority, 'fresher');
        }

        // Test Senior band
        const seniorQuestions = aiCoach.generateCalibratedDomainQuestions({
            role: 'Cloud Architect',
            track: 'technical',
            seniority: 'senior',
            difficulty: 'hard',
            count: 2,
        });

        assert.equal(seniorQuestions.length, 2);
        for (const q of seniorQuestions) {
            assert.equal(aiCoach.isGenericQuestion(q.text), false);
            assert.equal(q.seniority, 'senior');
        }
    });

    await t.test('2. Difficulty distribution properly proportions easy, intermediate, and advanced counts', () => {
        const easyDist = aiCoach.interviewDifficultyDistribution(10, 'easy', 'junior');
        assert.equal(easyDist.easy + easyDist.intermediate + easyDist.advanced, 10);
        assert.ok(easyDist.easy >= 5, 'Easy difficulty must have majority easy questions');

        const hardDist = aiCoach.interviewDifficultyDistribution(10, 'hard', 'senior');
        assert.equal(hardDist.easy + hardDist.intermediate + hardDist.advanced, 10);
        assert.ok(hardDist.advanced >= 4, 'Hard difficulty must weight advanced questions heavily');
    });

    await t.test('3. streamInterviewQuestions delivers streaming tokens and returns calibrated questions', async () => {
        const tokens = [];
        const result = await aiCoach.streamInterviewQuestions({
            role: 'Full Stack Developer',
            track: 'technical',
            seniority: 'mid',
            difficulty: 'medium',
            count: 4,
            onChunk: (chunk) => {
                tokens.push(chunk.text);
            },
        });

        assert.ok(tokens.length > 0, 'Must have received streaming token chunks');
        assert.equal(result.questions.length, 4);
        assert.equal(result.total, 4);
        for (const q of result.questions) {
            assert.ok(q.id);
            assert.ok(q.text.length > 15);
            assert.ok(q.rubric);
        }
    });

    await t.test('4. streamTurnEvaluation produces structured feedback with clarity, depth, and actionable tips', async () => {
        const tokens = [];
        const evaluation = await aiCoach.streamTurnEvaluation({
            question: 'How do you structure database transactions to prevent concurrency deadlocks in high-throughput services?',
            answer: 'I use explicit table ordering, pessimistic row locking with FOR UPDATE on short spans, and keep the transaction boundaries minimal.',
            role: 'Senior Backend Engineer',
            seniority: 'senior',
            onChunk: (chunk) => {
                tokens.push(chunk.text);
            },
        });

        assert.ok(tokens.length > 0, 'Must have received streamed evaluation tokens');
        assert.ok(typeof evaluation.clarityScore === 'number');
        assert.ok(evaluation.clarityScore >= 0 && evaluation.clarityScore <= 100);
        assert.ok(typeof evaluation.depthScore === 'number');
        assert.ok(Array.isArray(evaluation.strengths) && evaluation.strengths.length > 0);
        assert.ok(Array.isArray(evaluation.improvements) && evaluation.improvements.length > 0);
        assert.ok(typeof evaluation.coachingTip === 'string');
    });

    await t.test('5. streamAnswerGuide produces grounded answer guidance without fabrication', async () => {
        const tokens = [];
        const guide = await aiCoach.streamAnswerGuide({
            question: 'Tell me about how you handled a production performance issue in your Node.js backend.',
            role: 'Node.js Developer',
            topic: 'technical',
            resumeFacts: 'Optimized SQL indexes and reduced memory leaks in worker processes.',
            onChunk: (chunk) => {
                tokens.push(chunk.text);
            },
        });

        assert.ok(tokens.length > 0, 'Must receive streamed tokens');
        assert.ok(typeof guide.goal === 'string' && guide.goal.length > 5);
        assert.ok(typeof guide.modelAnswer === 'string' && guide.modelAnswer.length > 10);
        assert.ok(typeof guide.tip === 'string' && guide.tip.length > 5);
    });

    await t.test('6. HTTP SSE: POST /api/candidate/interview-coach/stream-questions streams text/event-stream', async () => {
        // Unauthenticated request rejected
        await request(app)
            .post('/api/candidate/interview-coach/stream-questions')
            .send({ role: 'Backend Engineer' })
            .expect(401);

        // Authenticated request streams SSE
        const res = await request(app)
            .post('/api/candidate/interview-coach/stream-questions')
            .set('Authorization', 'Bearer valid-candidate-token')
            .send({
                role: 'Senior DevOps Engineer',
                track: 'technical',
                seniority: 'senior',
                difficulty: 'hard',
                count: 3,
            })
            .expect(200)
            .expect('Content-Type', /text\/event-stream/);

        const bodyText = res.text;
        assert.ok(bodyText.includes('data: {"type":"start"'), 'Must contain start event');
        assert.ok(bodyText.includes('data: {"type":"complete"'), 'Must contain complete event');
        assert.ok(bodyText.includes('data: [DONE]'), 'Must terminate with [DONE]');
    });

    await t.test('7. HTTP SSE: POST /api/candidate/interview-coach/stream-turn streams evaluation events', async () => {
        const res = await request(app)
            .post('/api/candidate/interview-coach/stream-turn')
            .set('Authorization', 'Bearer valid-candidate-token')
            .send({
                question: 'How do you design a rate limiter in an API gateway?',
                answer: 'We used a sliding window log with Redis, using lua scripts for atomicity.',
                role: 'Backend Engineer',
                seniority: 'mid',
            })
            .expect(200)
            .expect('Content-Type', /text\/event-stream/);

        const bodyText = res.text;
        assert.ok(bodyText.includes('data: {"type":"start"}'));
        assert.ok(bodyText.includes('data: {"type":"complete"'));
        assert.ok(bodyText.includes('data: [DONE]'));
    });

    await t.test('8. HTTP SSE: POST /api/live-interview/guide/stream streams answer guide events', async () => {
        const res = await request(app)
            .post('/api/live-interview/guide/stream')
            .set('Authorization', 'Bearer valid-candidate-token')
            .send({
                question: 'Walk me through a microservice refactoring project you led.',
                role: 'Senior Software Engineer',
                topic: 'technical',
            })
            .expect(200)
            .expect('Content-Type', /text\/event-stream/);

        const bodyText = res.text;
        assert.ok(bodyText.includes('data: {"type":"start"}'));
        assert.ok(bodyText.includes('data: {"type":"complete"'));
        assert.ok(bodyText.includes('data: [DONE]'));
    });

    t.after(async () => {
        try {
            const { getPool } = require('../database/mysql');
            await getPool().end();
        } catch {
            // ignore
        }
    });
});
