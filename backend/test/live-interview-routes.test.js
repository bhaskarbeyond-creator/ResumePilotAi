'use strict';

process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const { setRepositoryForTests, resetRepositoryCacheForTests } = require('../repositories');
const InMemoryRepository = require('../repositories/InMemoryRepository');
const { clearProviderConfigurationCache } = require('../services/aiRuntime');

function modelResponse(prompt) {
    if (prompt.includes('Craft the ideal 10/10 STAR response guide')) {
        if (prompt.includes('REGENERATION DIRECTIVE')) {
            return {
                goal: 'Regenerated goal evaluating architectural alternatives for the question',
                modelAnswer: 'Alternative 10/10 STAR: In my role as Senior React Developer, I designed an event-driven architecture that dropped p99 latency by 58%.',
                tip: 'State why you preferred this alternative architecture.',
            };
        }
        return {
            goal: 'Evaluating delivery judgment under production pressure',
            modelAnswer: 'In my role as Senior React Developer, I engineered route-level code splitting that improved performance by 40%.',
            tip: 'Focus on measurable outcomes and technical trade-offs.',
        };
    }
    if (prompt.includes('Create a candid, supportive final mock-interview report')) {
        return {
            overall_score: 84,
            readiness: 'Strong foundation',
            summary: 'The candidate gave a concrete, evidence-grounded explanation of their delivery decision.',
            strengths: ['Explained a relevant technical trade-off with clear ownership.'],
            focus_areas: [{ area: 'Impact framing', detail: 'Quantify the outcome of the delivery decision when possible.' }],
            practice_plan: ['Practice concise outcome statements for the next answer.'],
            evidence: ['The candidate described the decision path and its result.'],
        };
    }
    if (prompt.includes('Continue naturally from the candidate')) {
        return {
            interviewer_message: 'Thank you. I would like to understand the decision trade-off more clearly.',
            question: 'What signal told you that your chosen implementation was the right trade-off?',
            response_type: 'follow_up',
            interview_stage: 'deep_dive',
            topic: 'Decision trade-offs',
            difficulty: 'hard',
            question_intent: 'Probe evidence behind the delivery decision',
            evaluation: {
                score: 82,
                observations: ['Connected the decision to a concrete delivery constraint.'],
                coaching_tip: 'Name a measurable outcome when available.',
                evidence: ['Described the implementation decision.'],
            },
            interview_complete: false,
            state_update: {
                topics_covered: ['Implementation ownership'],
                topics_to_probe: ['Impact measurement'],
                strengths: ['Clear trade-off reasoning'],
                growth_areas: ['Quantify outcomes'],
                rolling_summary: 'Candidate described a delivery trade-off and ownership of the implementation.',
            },
        };
    }
    return {
        interviewer_message: 'Welcome. We will keep this practical and adapt as you answer.',
        question: 'Walk me through a recent delivery decision that best shows your React and TypeScript judgment.',
        response_type: 'opening_question',
        interview_stage: 'opening',
        topic: 'Delivery judgment',
        difficulty: 'medium',
        question_intent: 'Ground the opening in supplied candidate evidence',
        state_update: {
            topics_covered: [],
            topics_to_probe: ['Delivery ownership'],
            strengths: [],
            growth_areas: [],
            rolling_summary: 'Opening prompt issued for the target role.',
        },
    };
}

function installProviderMock() {
    const previousFetch = global.fetch;
    global.fetch = async (_url, options) => {
        const prompt = JSON.parse(options.body).contents[0].parts[0].text;
        const text = JSON.stringify(modelResponse(prompt));
        return {
            ok: true,
            status: 200,
            json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
        };
    };
    return () => { global.fetch = previousFetch; };
}

function buildApp() {
    const ai = require('../routes/ai');
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
        const uid = req.get('x-test-user');
        if (uid) req.user = { uid };
        res.locals.requestId = 'live-route-test';
        next();
    });
    app.use('/api', ai);
    return app;
}

const startPayload = {
    role: 'Senior React Developer',
    interviewType: 'technical',
    experienceLevel: 'senior',
    difficulty: 'hard',
    durationMinutes: 20,
    resumeFacts: 'Work: Principal Engineer at Acme\nSkills: React, TypeScript, Node.js',
    jobDescription: 'Build accessible React and TypeScript applications with measurable performance improvements.',
};

test('live interview routes are authenticated, owner-scoped, revision-safe, and never return canned content', async () => {
    const previousKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = 'route-test-key';
    const restoreFetch = installProviderMock();
    resetRepositoryCacheForTests();
    setRepositoryForTests(new InMemoryRepository());
    clearProviderConfigurationCache();
    const app = buildApp();
    try {
        const unauthenticated = await request(app).post('/api/live-interview/sessions').send(startPayload);
        assert.equal(unauthenticated.status, 401);
        assert.equal(unauthenticated.body.error.code, 'AUTH_REQUIRED');

        const start = await request(app)
            .post('/api/live-interview/sessions')
            .set('x-test-user', 'candidate-a')
            .send(startPayload);
        assert.equal(start.status, 201);
        assert.equal(start.headers['cache-control'], 'no-store, private');
        const first = start.body.session;
        assert.match(first.sessionId, /^[A-Za-z0-9_-]{16,}$/);
        assert.equal(first.revision, 1);
        assert.equal(first.configuration.role, startPayload.role);
        assert.match(first.interviewer.question, /delivery decision/i);
        assert.equal(JSON.stringify(first).includes('resumeFacts'), false, 'presentation must not leak saved raw context');

        const otherOwnerRead = await request(app)
            .get(`/api/live-interview/sessions/${first.sessionId}`)
            .set('x-test-user', 'candidate-b');
        assert.equal(otherOwnerRead.status, 404);
        assert.equal(otherOwnerRead.body.error.code, 'SESSION_NOT_FOUND');

        const stale = await request(app)
            .post(`/api/live-interview/sessions/${first.sessionId}/turns`)
            .set('x-test-user', 'candidate-a')
            .send({
                turnId: first.interviewer.turnId,
                expectedRevision: 99,
                answer: 'I evaluated rendering cost and delivery risk before choosing an incremental migration.',
                idempotencyKey: 'stale-turn-key-123',
                question: 'Injected question must never control the next turn.',
                score: 100,
            });
        assert.equal(stale.status, 409);
        assert.equal(stale.body.error.code, 'SESSION_VERSION_CONFLICT');
        assert.equal(stale.body.session.revision, 1);

        const answer = 'I evaluated rendering cost and delivery risk before choosing an incremental migration, then measured the result in production.';
        const submitted = await request(app)
            .post(`/api/live-interview/sessions/${first.sessionId}/turns`)
            .set('x-test-user', 'candidate-a')
            .send({
                turnId: first.interviewer.turnId,
                expectedRevision: first.revision,
                answer,
                idempotencyKey: 'valid-turn-key-123',
            });
        assert.equal(submitted.status, 200);
        assert.equal(submitted.body.session.revision, 2);
        assert.match(submitted.body.session.interviewer.question, /signal told you/i);
        assert.equal(submitted.body.session.transcript[0].answer, answer);

        // Retry after a lost response: service returns the persisted state rather
        // than creating a second model turn or accepting a stale client state.
        const retry = await request(app)
            .post(`/api/live-interview/sessions/${first.sessionId}/turns`)
            .set('x-test-user', 'candidate-a')
            .send({
                turnId: first.interviewer.turnId,
                expectedRevision: first.revision,
                answer,
                idempotencyKey: 'valid-turn-key-123',
            });
        assert.equal(retry.status, 200);
        assert.equal(retry.body.session.idempotent, true);
        assert.equal(retry.body.session.revision, 2);
        assert.equal(retry.body.session.transcript.length, 1);

        const completed = await request(app)
            .post(`/api/live-interview/sessions/${first.sessionId}/complete`)
            .set('x-test-user', 'candidate-a')
            .send({ expectedRevision: 2 });
        assert.equal(completed.status, 200);
        assert.equal(completed.body.session.status, 'completed');
        assert.equal(completed.body.session.report.overallScore, 84);
        assert.match(completed.body.session.report.summary, /evidence-grounded/i);

        const otherOwnerDelete = await request(app)
            .delete(`/api/live-interview/sessions/${first.sessionId}`)
            .set('x-test-user', 'candidate-b');
        assert.equal(otherOwnerDelete.status, 404);

        const abandoned = await request(app)
            .delete(`/api/live-interview/sessions/${first.sessionId}`)
            .set('x-test-user', 'candidate-a');
        assert.equal(abandoned.status, 200);
        assert.equal(abandoned.body.deleted, true);

        // Live Interview Guide (Initial & Regenerate)
        const guideUnauth = await request(app)
            .post('/api/live-interview/guide')
            .send({ question: 'How do you optimize React?' });
        assert.equal(guideUnauth.status, 401);

        const guideAuth = await request(app)
            .post('/api/live-interview/guide')
            .set('x-test-user', 'candidate-a')
            .send({ question: 'How do you optimize React apps for low-bandwidth networks?', role: 'Senior React Developer' });
        assert.equal(guideAuth.status, 200);
        assert.match(guideAuth.body.modelAnswer, /code splitting/i);
        assert.match(guideAuth.body.goal, /delivery judgment/i);

        const guideRegen = await request(app)
            .post('/api/live-interview/guide')
            .set('x-test-user', 'candidate-a')
            .send({ question: 'How do you optimize React apps for low-bandwidth networks?', role: 'Senior React Developer', regenerate: true });
        assert.equal(guideRegen.status, 200);
        assert.match(guideRegen.body.modelAnswer, /Alternative 10\/10 STAR/i);
        assert.match(guideRegen.body.modelAnswer, /dropped p99 latency by 58%/i);
        assert.match(guideRegen.body.goal, /evaluating architectural alternatives/i);
    } finally {
        restoreFetch();
        if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
        else process.env.GEMINI_API_KEY = previousKey;
        clearProviderConfigurationCache();
        resetRepositoryCacheForTests();
    }
});
