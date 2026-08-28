'use strict';
process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const http = require('node:http');
const { once } = require('node:events');
const ai = require('../routes/ai');
require('../repositories').setRepositoryForTests({
    async getSetting() { return null; },
});
require('../services/aiRuntime').clearProviderConfigurationCache();

// ── Helpers: run a real Express app on an ephemeral port and POST JSON ───────
function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/api', ai);
    return app;
}

async function startServer(app) {
    const server = http.createServer(app);
    server.listen(0);
    await once(server, 'listening');
    return { server, base: `http://127.0.0.1:${server.address().port}` };
}

function postJSON(base, path, body) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const req = http.request(`${base}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
        }, (res) => {
            let buf = '';
            res.on('data', c => { buf += c; });
            res.on('end', () => {
                let parsed = buf;
                try { parsed = JSON.parse(buf); } catch { /* keep raw */ }
                resolve({ status: res.statusCode, headers: res.headers, body: parsed });
            });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

// Build a plausible interview JSON from the prompt so we can observe what the model
// was asked (occupation, distribution, session nonce) and prove the pipeline wires them.
function questionsFromPrompt(prompt, count) {
    const occupation = (prompt.match(/for a ([^\n]+?) position in English/) || [])[1] || 'role';
    const distributionMatch = prompt.match(/Difficulty distribution for this run: (\d+) Easy, (\d+) Intermediate, (\d+) Advanced/) || [];
    const easy = Number(distributionMatch[1]) || 0;
    const inter = Number(distributionMatch[2]) || 0;
    const nonce = (prompt.match(/unique run token: ([0-9a-f]+)/) || [])[1] || 'none';
    const questions = [];
    for (let i = 0; i < count; i++) {
        const diff = i < easy ? 'Easy' : i < easy + inter ? 'Intermediate' : 'Advanced';
        questions.push({
            id: i + 1,
            question: `Question ${i + 1} for ${occupation} (${diff}) [${nonce}]`,
            options: ['Option A', 'Option B', 'Option C', 'Option D'],
            correctAnswer: 0,
            category: `Category ${diff}`,
            difficulty: diff,
            explanation: 'A short explanation.',
            estimatedTime: 90,
        });
    }
    return questions;
}

// Mock Gemini provider: returns valid JSON, echoes prompt-derived content.
function installMockProvider() {
    const calls = [];
    global.fetch = async (url, options) => {
        const body = JSON.parse(options.body);
        calls.push(body);
        const prompt = body.contents[0].parts[0].text;
        const count = Number((prompt.match(/exactly (\d+) realistic/) || [])[1]) || 10;
        const text = JSON.stringify({
            title: 't', company: 'c', department: 'd', duration: '30 minutes',
            totalQuestions: count, passingScore: 70, categories: [],
            questions: questionsFromPrompt(prompt, count),
        });
        return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }) };
    };
    return calls;
}

function mockProviderFailure() {
    global.fetch = async () => { throw Object.assign(new Error('provider down'), { status: 503 }); };
}

const BASE_PAYLOAD = {
    occupation: 'Senior React Developer',
    interviewType: 'technical',
    questionCount: 10,
    language: 'en',
    experienceLevel: 'senior',
    difficulty: 'medium',
    jobDescription: 'Build accessible React/TypeScript SPAs with a focus on performance.',
    resumeFacts: 'Name: Asha Rao\nOccupation: Senior React Developer\nWork: Principal Engineer at Acme Corp\nSkills: React, TypeScript, Node.js',
};

test('interview generation helper exports exist', () => {
    assert.equal(typeof ai.buildInterviewPrompt, 'function');
    assert.equal(typeof ai.generateDefaultInterview, 'function');
    assert.equal(typeof ai.dedupeQuestions, 'function');
    assert.equal(typeof ai.questionKey, 'function');
    assert.equal(typeof ai.interviewDifficultyDistribution, 'function');
});

test('difficulty distribution is exact and meaningfully changes with difficulty', () => {
    const medium = ai.interviewDifficultyDistribution(10, 'medium', 'mid');
    const easy = ai.interviewDifficultyDistribution(10, 'easy', 'mid');
    const hard = ai.interviewDifficultyDistribution(10, 'hard', 'mid');
    const expert = ai.interviewDifficultyDistribution(10, 'expert', 'mid');
    for (const d of [medium, easy, hard, expert]) {
        assert.equal(d.easy + d.intermediate + d.advanced, 10, 'distribution must sum to count');
    }
    // Easy skews Easy-heavy; expert skews Advanced-heavy.
    assert.ok(easy.easy >= medium.easy, 'easy difficulty should have >= Easy questions than medium');
    assert.ok(expert.advanced >= hard.advanced, 'expert difficulty should have >= Advanced questions than hard');
});

test('prompt builder injects a fresh per-request nonce and a difficulty distribution', () => {
    const a = ai.buildInterviewPrompt({ ...BASE_PAYLOAD, sessionNonce: 'aaaa' });
    const b = ai.buildInterviewPrompt({ ...BASE_PAYLOAD, sessionNonce: 'bbbb' });
    assert.match(a.prompt, /unique run token: aaaa/);
    assert.match(b.prompt, /unique run token: bbbb/);
    assert.match(a.prompt, /Difficulty distribution for this run:/);
    assert.match(a.prompt, /Use ONLY these candidate facts/);
    assert.match(a.prompt, /Align some questions to this job description/);
    assert.equal(a.validQuestionCount, 10);

    // Previous-question exclusion block is added when present.
    const c = ai.buildInterviewPrompt({ ...BASE_PAYLOAD, previousQuestions: ['What is React?'], sessionNonce: 'cccc' });
    assert.match(c.prompt, /already answered these questions/);
    assert.match(c.prompt, /What is React\?/);
});

test('dedupeQuestions removes within-set duplicates and recent-history exact matches', () => {
    const raw = [
        { question: 'What is a closure?' },
        { question: '  What is a closure?  ' },
        { question: 'Explain closures.' },
        { question: 'How do hooks work?' },
    ];
    const result = ai.dedupeQuestions(raw, ['What is a closure?']);
    const texts = result.map(q => q.question);
    assert.ok(!texts.includes('What is a closure?'));
    assert.ok(!texts.includes('  What is a closure?  '), 'near-identical normalized duplicate removed');
    assert.ok(texts.includes('Explain closures.'));
    assert.ok(texts.includes('How do hooks work?'));
});

test('AI path is invoked and returns distinct sets across identical-input attempts', async () => {
    const oldKey = process.env.GEMINI_API_KEY;
    const oldFetch = global.fetch;
    process.env.GEMINI_API_KEY = 'test-key';
    const calls = installMockProvider();
    const app = buildApp();
    const { server, base } = await startServer(app);
    try {
        const r1 = await postJSON(base, '/api/generate-interview', BASE_PAYLOAD);
        const r2 = await postJSON(base, '/api/generate-interview', BASE_PAYLOAD);
        assert.equal(r1.status, 200);
        assert.equal(r1.headers['x-ai-source'], 'ai', 'AI path must be marked');
        assert.equal(r1.body.totalQuestions, 10);
        assert.ok(Array.isArray(r1.body.questions) && r1.body.questions.length === 10);
        assert.equal(calls.length, 2, 'a real model call is made for each interview');
        // The prompt carries a different session nonce each attempt, so the model is asked for
        // a fresh set even for identical inputs.
        const nonce1 = (calls[0].contents[0].parts[0].text.match(/unique run token: ([0-9a-f]+)/) || [])[1];
        const nonce2 = (calls[1].contents[0].parts[0].text.match(/unique run token: ([0-9a-f]+)/) || [])[1];
        assert.ok(nonce1 && nonce2 && nonce1 !== nonce2, 'each attempt must get a fresh run token');
        const q1 = r1.body.questions.map(q => q.question);
        const q2 = r2.body.questions.map(q => q.question);
        assert.notDeepEqual(q1, q2, 'repeated attempts should produce distinct question sets');
    } finally {
        server.close();
        if (oldKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = oldKey;
        global.fetch = oldFetch;
    }
});

test('fallback is used only when the AI path fails and is count/difficulty/role aware', async () => {
    const oldKey = process.env.GEMINI_API_KEY;
    const oldFetch = global.fetch;
    process.env.GEMINI_API_KEY = 'test-key';
    mockProviderFailure();
    const app = buildApp();
    const { server, base } = await startServer(app);
    try {
        const r1 = await postJSON(base, '/api/generate-interview', { ...BASE_PAYLOAD, questionCount: 8, difficulty: 'hard' });
        assert.equal(r1.status, 200);
        assert.equal(r1.headers['x-ai-source'], 'fallback', 'fallback must be observable');
        assert.equal(r1.body._source, 'fallback');
        assert.equal(r1.body.totalQuestions, 8, 'fallback honors the requested question count');
        assert.equal(r1.body.questions.length, 8);

        const easy = await postJSON(base, '/api/generate-interview', { ...BASE_PAYLOAD, questionCount: 8, difficulty: 'easy' });
        const hard2 = await postJSON(base, '/api/generate-interview', { ...BASE_PAYLOAD, questionCount: 8, difficulty: 'hard' });
        const easyAdv = easy.body.questions.filter(q => q.difficulty === 'Advanced').length;
        const hardAdv = hard2.body.questions.filter(q => q.difficulty === 'Advanced').length;
        assert.ok(hardAdv >= easyAdv, 'hard difficulty should yield no fewer Advanced questions than easy');

        // Different role => different grounded question set.
        const backend = await postJSON(base, '/api/generate-interview', { ...BASE_PAYLOAD, occupation: 'Python Backend Engineer' });
        const reactQ = r1.body.questions.map(q => q.question).join(' ');
        const backendQ = backend.body.questions.map(q => q.question).join(' ');
        assert.notEqual(reactQ, backendQ, 'role must shape the fallback questions');
    } finally {
        server.close();
        if (oldKey === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = oldKey;
        global.fetch = oldFetch;
    }
});

test('fallback never repeats a question already asked recently', async () => {
    const oldFetch = global.fetch;
    mockProviderFailure();
    const app = buildApp();
    const { server, base } = await startServer(app);
    try {
        const first = await postJSON(base, '/api/generate-interview', { ...BASE_PAYLOAD, questionCount: 8 });
        const previous = first.body.questions.map(q => q.question);
        const second = await postJSON(base, '/api/generate-interview', { ...BASE_PAYLOAD, questionCount: 8, previousQuestions: previous });
        const secondTexts = second.body.questions.map(q => q.question);
        for (const prev of previous) {
            assert.ok(!secondTexts.includes(prev), `must not repeat previously asked question: ${prev}`);
        }
    } finally {
        server.close();
        global.fetch = oldFetch;
    }
});
