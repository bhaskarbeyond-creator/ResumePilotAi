import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

const dom = new JSDOM('<!doctype html><html><body><div id="test-root"></div></body></html>', { url: 'https://app.example.test/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.sessionStorage = dom.window.sessionStorage;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Element = dom.window.Element;
globalThis.Event = dom.window.Event;
globalThis.MouseEvent = dom.window.MouseEvent;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const React = (await import('react')).default;
const { act } = await import('react');
const { createRoot } = await import('react-dom/client');

const stubPlugin = {
    name: 'live-interview-ui-test-stubs',
    load(id) {
        if (/\/src\/context\/AuthContext(\.jsx)?(\?.*)?$/.test(id) || /\/src\/main\.jsx(\?.*)?$/.test(id)) {
            return "import { createContext } from 'react'; export const AuthContext = createContext(null);";
        }
        if (/\/src\/services\/api\/platform(\.js)?(\?.*)?$/.test(id)) {
            return 'export const getResumes = async () => ({ resumes: [] });';
        }
        if (/\/src\/services\/liveInterviewApi(\.js)?(\?.*)?$/.test(id)) {
            return `
              export const startLiveInterviewSession = (...args) => globalThis.__liveApi.start(...args);
              export const getLiveInterviewSession = (...args) => globalThis.__liveApi.get(...args);
              export const submitLiveInterviewTurn = (...args) => globalThis.__liveApi.turn(...args);
              export const completeLiveInterviewSession = (...args) => globalThis.__liveApi.complete(...args);
              export const abandonLiveInterviewSession = (...args) => globalThis.__liveApi.abandon(...args);
            `;
        }
        if (/\/src\/conf\/fire(\.\w+)?(\?.*)?$/.test(id)) return 'export default { auth: () => ({ currentUser: null }) };';
        return null;
    },
};

const firstSession = {
    sessionId: 'live_ui_session_abcdef123456',
    revision: 1,
    status: 'active',
    configuration: { role: 'Frontend Developer', interviewType: 'technical', experienceLevel: 'mid', difficulty: 'medium', durationMinutes: 20 },
    interviewer: {
        turnId: 'turn_ui_opening_123456',
        message: 'Welcome. I will adapt the conversation to the evidence you share.',
        question: 'Tell me about a frontend delivery decision you owned and how you evaluated its outcome.',
        responseType: 'opening_question',
    },
    progress: { stage: 'opening', topic: 'Delivery judgment', difficulty: 'medium', completedTurns: 0, targetTurns: 5, percent: 0, interviewComplete: false },
    transcript: [],
    latestEvaluation: null,
    report: null,
};

function nextSession(answer) {
    return {
        ...firstSession,
        revision: 2,
        interviewer: {
            turnId: 'turn_ui_followup_123456',
            message: 'Thank you. Let us examine the evidence behind that choice.',
            question: 'Which signal changed your approach, and what trade-off did you make?',
            responseType: 'follow_up',
        },
        progress: { ...firstSession.progress, stage: 'deep_dive', topic: 'Evidence', completedTurns: 1, percent: 20 },
        transcript: [{ turnId: firstSession.interviewer.turnId, question: firstSession.interviewer.question, answer, topic: 'Delivery judgment', stage: 'opening', evaluation: { score: 76, observations: ['Named a delivery decision.'], coachingTip: 'State the outcome.', evidence: ['Owned the decision.'] } }],
        latestEvaluation: { score: 76, observations: ['Named a delivery decision.'], coachingTip: 'State the outcome.', evidence: ['Owned the decision.'] },
    };
}

function completedSession(answer) {
    const current = nextSession(answer);
    return {
        ...current,
        revision: 3,
        status: 'completed',
        interviewer: { turnId: null, message: 'Thank you for the conversation.', question: '', responseType: 'closing' },
        progress: { ...current.progress, stage: 'closing', interviewComplete: true, percent: 100 },
        report: {
            overallScore: 81,
            readiness: 'Strong foundation',
            summary: 'You described a delivery decision with clear ownership and useful evidence.',
            strengths: ['Clear ownership of the delivery decision.'],
            focusAreas: [{ area: 'Outcome framing', detail: 'Quantify impact where evidence is available.' }],
            practicePlan: ['Practice concise impact statements.'],
            evidence: ['Explained the trade-off and the signal used.'],
        },
    };
}

function click(node) {
    assert.ok(node, 'expected interactive control');
    act(() => node.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })));
}

function setValue(node, value) {
    const descriptor = Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value');
    descriptor.set.call(node, value);
    act(() => node.dispatchEvent(new dom.window.Event('input', { bubbles: true })));
}

function text(root) { return root.textContent || ''; }

async function wait(ms = 15) {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, ms)); });
}

async function createLiveTestApp() {
    const vite = await createServer({
        configFile: false,
        root: process.cwd(),
        plugins: [react(), stubPlugin],
        logLevel: 'error',
        server: { middlewareMode: true, hmr: false },
        appType: 'custom',
        optimizeDeps: { noDiscovery: true },
    });
    const rootNode = document.getElementById('test-root');
    const reactRoot = createRoot(rootNode);
    const Component = (await vite.ssrLoadModule('/src/components/Dashboard/DashboardInterviews/DashboardInterviews.jsx')).default;
    const { AuthContext } = await vite.ssrLoadModule('/src/context/AuthContext.jsx');
    return { vite, rootNode, reactRoot, Component, AuthContext };
}

async function closeLiveTestApp({ vite, reactRoot }) {
    await act(async () => {
        reactRoot.render(React.createElement('div'));
        reactRoot.unmount();
    });
    await vite.close();
}

test('live face-to-face UI preserves a failed answer, supports text-only fallback, then completes through server state', { timeout: 120_000 }, async () => {
    localStorage.clear();
    const calls = [];
    const priorMediaDevices = Object.getOwnPropertyDescriptor(globalThis.navigator, 'mediaDevices');
    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
        configurable: true,
        value: { getUserMedia: async () => { throw Object.assign(new Error('permission denied'), { name: 'NotAllowedError' }); } },
    });
    let failFirstTurn = true;
    globalThis.__liveApi = {
        start: async payload => { calls.push(['start', payload]); return structuredClone(firstSession); },
        get: async () => { throw new Error('No recovery expected in this test'); },
        turn: async (_sessionId, payload) => {
            calls.push(['turn', payload]);
            if (failFirstTurn) {
                failFirstTurn = false;
                throw Object.assign(new TypeError('Failed to fetch'), { code: 'REQUEST_FAILED' });
            }
            return nextSession(payload.answer);
        },
        complete: async (_sessionId, payload) => { calls.push(['complete', payload]); return completedSession(calls.find(item => item[0] === 'turn')?.[1]?.answer || ''); },
        abandon: async () => ({ deleted: true }),
    };

    let app;
    try {
        app = await createLiveTestApp();
        const { rootNode, reactRoot, Component, AuthContext } = app;
        await act(async () => reactRoot.render(React.createElement(AuthContext.Provider, { value: { uid: 'live-ui-user' } }, React.createElement(Component))));

        const liveMode = Array.from(rootNode.querySelectorAll('button')).find(button => text(button).includes('Live Face-to-Face'));
        assert.ok(liveMode, 'live mode is available from preflight');
        click(liveMode);
        const testMedia = Array.from(rootNode.querySelectorAll('button')).find(button => text(button).includes('Test camera & mic'));
        click(testMedia);
        await wait();
        assert.ok(text(rootNode).includes('Camera or microphone access was denied'), 'permission denial keeps text-only practice available');
        const role = Array.from(rootNode.querySelectorAll('button')).find(button => text(button).trim() === 'Frontend Developer');
        click(role);
        const start = Array.from(rootNode.querySelectorAll('button')).find(button => text(button).includes('Start live interview'));
        click(start);
        await wait();

        assert.ok(text(rootNode).includes('Face-to-face interview'));
        assert.ok(text(rootNode).includes('Speech-to-text is unavailable; typing works normally.'), 'text fallback stays usable without browser STT');
        assert.equal(calls[0][0], 'start');
        assert.equal(calls[0][1].role, 'Frontend Developer');
        assert.equal(calls[0][1].question, undefined, 'browser never chooses the opening question');

        const answerBox = rootNode.querySelector('#live-interview-answer');
        const answer = 'I used performance traces and accessibility feedback to make an incremental delivery decision.';
        setValue(answerBox, answer);
        const send = Array.from(rootNode.querySelectorAll('button')).find(button => text(button).includes('Send response'));
        click(send);
        await wait();
        assert.ok(text(rootNode).includes('Network error'), 'temporary failure is explained without losing the answer');
        assert.equal(rootNode.querySelector('#live-interview-answer').value, answer, 'candidate response remains editable after a failed turn');

        click(Array.from(rootNode.querySelectorAll('button')).find(button => text(button).includes('Send response')));
        await wait();
        assert.ok(text(rootNode).includes('Which signal changed your approach'));
        assert.equal(calls.filter(item => item[0] === 'turn').length, 2);
        assert.equal(calls.filter(item => item[0] === 'turn')[1][1].turnId, firstSession.interviewer.turnId);
        assert.equal(calls.filter(item => item[0] === 'turn')[1][1].expectedRevision, 1);
        assert.ok(calls.filter(item => item[0] === 'turn')[1][1].idempotencyKey, 'retry uses a server-verifiable idempotency key');
        assert.equal(calls.filter(item => item[0] === 'turn')[1][1].idempotencyKey, calls.filter(item => item[0] === 'turn')[0][1].idempotencyKey, 'a network retry preserves the same idempotency key');

        const earlyFinish = Array.from(rootNode.querySelectorAll('button')).find(button => text(button).includes('Finish early and get feedback'));
        click(earlyFinish);
        await wait();
        const confirm = Array.from(rootNode.querySelector('[role="dialog"]').querySelectorAll('button')).find(button => text(button).includes('Finish & generate feedback'));
        click(confirm);
        await wait();
        assert.ok(text(rootNode).includes('Practice feedback'));
        assert.ok(text(rootNode).includes('Outcome framing'));
        assert.equal(calls.at(-1)[0], 'complete');
        const saved = JSON.parse(localStorage.getItem('interviewHistory:live-ui-user') || '[]');
        assert.equal(saved.length, 1);
        assert.equal(saved[0].isLiveInterview, true);
        assert.equal(localStorage.getItem('interviewSession:live-ui-user'), null, 'server-session recovery pointer is cleared after completion');
    } finally {
        if (app) await closeLiveTestApp(app);
        if (priorMediaDevices) Object.defineProperty(globalThis.navigator, 'mediaDevices', priorMediaDevices);
        else delete globalThis.navigator.mediaDevices;
        delete globalThis.__liveApi;
    }
});

test('a refresh recovery pointer survives a temporary GET failure and can be retried without starting a new AI session', { timeout: 120_000 }, async () => {
    localStorage.clear();
    const recoveryUid = 'live-ui-recover';
    localStorage.setItem(`interviewSession:${recoveryUid}`, JSON.stringify({
        phase: 'live', ownerUid: recoveryUid, sessionId: firstSession.sessionId, schemaVersion: 3, lastSaved: Date.now(),
    }));
    let getCalls = 0;
    globalThis.__liveApi = {
        start: async () => { throw new Error('A recovery must not create a new interview'); },
        get: async () => {
            getCalls += 1;
            if (getCalls === 1) throw new TypeError('Failed to fetch');
            return structuredClone(firstSession);
        },
        turn: async () => { throw new Error('not used'); },
        complete: async () => { throw new Error('not used'); },
        abandon: async () => ({ deleted: true }),
    };

    let app;
    try {
        app = await createLiveTestApp();
        const { rootNode, reactRoot, Component, AuthContext } = app;
        await act(async () => reactRoot.render(React.createElement(AuthContext.Provider, { value: { uid: recoveryUid } }, React.createElement(Component))));
        await wait(30);
        assert.ok(text(rootNode).includes('Retry recovery'));
        assert.ok(localStorage.getItem(`interviewSession:${recoveryUid}`), 'temporary failure retains the opaque recovery pointer');
        click(Array.from(rootNode.querySelectorAll('button')).find(button => text(button).includes('Retry recovery')));
        await wait();
        assert.equal(getCalls, 2);
        assert.ok(text(rootNode).includes('Face-to-face interview'));
    } finally {
        if (app) await closeLiveTestApp(app);
        delete globalThis.__liveApi;
    }
});
