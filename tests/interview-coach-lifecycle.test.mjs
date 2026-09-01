import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

// ── jsdom browser environment (repo-standard harness) ────────────────────────
const dom = new JSDOM('<!doctype html><html><body><div id="test-root"></div></body></html>', { url: 'https://app.example.com/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.sessionStorage = dom.window.sessionStorage;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Element = dom.window.Element;
globalThis.Event = dom.window.Event;
globalThis.KeyboardEvent = dom.window.KeyboardEvent;
globalThis.MouseEvent = dom.window.MouseEvent;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// IMPORTANT: react-dom must be imported AFTER the jsdom globals exist.
// Static imports would hoist above the assignments above, making react-dom
// evaluate canUseDOM/isInputEventSupported against Node (no DOM) and silently
// fall back to its legacy change-event polyfill, so controlled inputs would
// never fire onChange in this harness.
const React = (await import('react')).default;
const { act } = await import('react');
const { createRoot } = await import('react-dom/client');

// Stub the app-shell dependencies so the Interview Coach renders in isolation
// (production code is untouched; only its surroundings are faked in this lab).
const stubPlugin = {
    name: 'interview-coach-test-stubs',
    load(id) {
        if (/\/src\/context\/AuthContext(\.jsx)?(\?.*)?$/.test(id) || /\/src\/main\.jsx(\?.*)?$/.test(id)) {
            return "import { createContext } from 'react';\nexport const AuthContext = createContext(null);\n";
        }
        if (/\/src\/conf\/fire(\.\w+)?(\?.*)?$/.test(id)) {
            return 'export default { auth: () => ({ currentUser: null }) };';
        }
        if (/\/src\/firestore\/dbOperations(\.js)?(\?.*)?$/.test(id)) {
            return 'export const getResumes = async () => ({ resumes: [] });';
        }
        return null;
    },
};

const MOCK_EXAM = {
    title: 'Senior React Engineer Assessment',
    totalQuestions: 3,
    questions: [
        { id: 1, question: 'What are hooks?', options: ['State in function components', 'Faster DOM', 'No closures', 'Machine code'], correctAnswer: 0, category: 'React', difficulty: 'Easy', explanation: 'Hooks bring state to function components.' },
        { id: 2, question: 'Keys in lists?', options: ['Stable identity', 'Styling', 'Encryption', 'Types'], correctAnswer: 0, category: 'React', difficulty: 'Easy', explanation: 'Keys track elements.' },
        { id: 3, question: 'useLayoutEffect timing?', options: ['Sync after DOM mutations', 'Before render', 'Identical', 'Deprecated'], correctAnswer: 0, category: 'Advanced', difficulty: 'Hard', explanation: 'Runs synchronously after mutations.' },
    ],
};

const TEST_UID = 'candidate-lifecycle-test';

function mockUser() {
    return { uid: TEST_UID, email: 'candidate@test.com', displayName: 'Test' };
}

function keydown(window, key, opts = {}) {
    const event = new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts });
    Object.defineProperty(event, 'target', { value: opts.target || document.body });
    Object.defineProperty(event, 'path', { value: [] });
    window.dispatchEvent(event);
    return event;
}

function click(element) {
    act(() => {
        element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    });
}

function textOf(root) {
    return root.textContent || '';
}

async function renderComponent(vite, _root) {
    const module = await vite.ssrLoadModule('/src/components/Dashboard/DashboardInterviews/DashboardInterviews.jsx');
    const AuthContextMod = await vite.ssrLoadModule('/src/context/AuthContext.jsx');
    const container = document.getElementById('test-root');
    const reactRoot = createRoot(container);
    await act(async () => {
        reactRoot.render(React.createElement(AuthContextMod.AuthContext.Provider, { value: mockUser() },
            React.createElement(module.default)));
    });
    return { component: module.default, AuthContext: AuthContextMod.AuthContext, reactRoot, container };
}

async function startExam(root) {
    const roleInput = root.querySelector('input[placeholder="Software Engineer"]');
    assert.ok(roleInput, 'role input rendered');
    // Use the real quick-pick affordance (click-driven) to set the occupation.
    const pill = Array.from(root.querySelectorAll('button')).find(b => (textOf(b) || '').trim() === 'Frontend Developer');
    assert.ok(pill, 'suggested role pill rendered');
    click(pill);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
    assert.equal(roleInput.value, 'Frontend Developer', 'occupation set via quick-pick');
    const startButton = Array.from(root.querySelectorAll('button')).find(b => textOf(b).includes('Start interview'));
    assert.ok(startButton, 'start button rendered');
    assert.equal(startButton.disabled, false, 'start button enabled');
    click(startButton);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
}

test('interview coach lifecycle: keyboard CBT, exit protection, multi-tab, submission, history', { timeout: 120_000 }, async () => {
    localStorage.clear();
    const originalFetch = globalThis.fetch;
    let fetchCalls = 0;
    globalThis.fetch = async () => {
        fetchCalls += 1;
        return { ok: true, status: 200, json: async () => structuredClone(MOCK_EXAM) };
    };

    const vite = await createServer({
        configFile: false,
        root: process.cwd(),
        plugins: [react(), stubPlugin],
        logLevel: 'error',
        server: { middlewareMode: true, hmr: false },
        appType: 'custom',
        optimizeDeps: { noDiscovery: true },
    });

    const { container, reactRoot } = await renderComponent(vite);
    const root = () => container;

    try {
// 1. Setup phase: no beforeunload protection before the exam starts.
        let unloadEvent = new dom.window.Event('beforeunload', { cancelable: true });
        dom.window.dispatchEvent(unloadEvent);
        assert.equal(unloadEvent.defaultPrevented, false, 'no exit protection during setup');

// 2. Start the exam.
        await startExam(root());
        assert.ok(textOf(root()).includes('Question 1 of 3'), 'exam started');
        assert.ok(root().querySelector('[role="timer"]'), 'timer present');

        // 3. beforeunload is now active and cancels accidental navigation.
        unloadEvent = new dom.window.Event('beforeunload', { cancelable: true });
        dom.window.dispatchEvent(unloadEvent);
        assert.equal(unloadEvent.defaultPrevented, true, 'exit protection active during exam');

        // 4. Answer shortcuts: letters and digits select options safely.
        keydown(dom.window, 'b');
        await act(async () => { await Promise.resolve(); });
        let radios = root().querySelectorAll('input[type="radio"]');
        assert.equal(radios[1].checked, true, 'B key selects option 2');
        keydown(dom.window, '3');
        await act(async () => { await Promise.resolve(); });
        radios = root().querySelectorAll('input[type="radio"]');
        assert.equal(radios[2].checked, true, '3 key selects option 3');
        assert.equal(radios[1].checked, false, 'previous selection replaced');

        // Shortcut keys must be consumed (no page scrolling side effects).
        const consumed = keydown(dom.window, 'c');
        assert.equal(consumed.defaultPrevented, true, 'answer shortcut consumes the key');

        // 5. Text-entry exclusion: shortcuts never fire while typing.
        const fakeInput = document.createElement('input');
        fakeInput.type = 'text';
        const typingEvent = new dom.window.KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true });
        Object.defineProperty(typingEvent, 'target', { value: fakeInput });
        dom.window.dispatchEvent(typingEvent);
        await act(async () => { await Promise.resolve(); });
        radios = root().querySelectorAll('input[type="radio"]');
        assert.equal(radios[0].checked, false, 'typing "a" in a text field does not answer the question');

        // 6. Arrow navigation + focus movement between questions.
        const navEvent = keydown(dom.window, 'ArrowRight');
        await act(async () => { await Promise.resolve(); });
        assert.equal(navEvent.defaultPrevented, true, 'arrow consumed');
        assert.ok(textOf(root()).includes('Question 2 of 3'), 'arrow right navigated');
        assert.equal(document.activeElement?.tagName, 'H2', 'focus moved to the question heading');
        keydown(dom.window, 'ArrowLeft');
        await act(async () => { await Promise.resolve(); });
        assert.ok(textOf(root()).includes('Question 1 of 3'), 'arrow left navigated back');

        // 7. Enter → Save & next; on the last question → submit review.
        keydown(dom.window, 'Enter');
        await act(async () => { await Promise.resolve(); });
        assert.ok(textOf(root()).includes('Question 2 of 3'), 'enter advanced');
        keydown(dom.window, 'ArrowRight');
        await act(async () => { await Promise.resolve(); });
        assert.ok(textOf(root()).includes('Question 3 of 3'), 'on last question');
        keydown(dom.window, 'Enter');
        await act(async () => { await Promise.resolve(); });
        assert.ok(root().querySelector('#submit-title'), 'enter on last question opens submit review');
        assert.ok(textOf(root()).includes('1 of 3'), 'review shows answered count');
        assert.ok(textOf(root()).includes('2 unanswered'), 'review warns about unanswered questions');

        // 8. Escape closes the dialog and returns focus; exam continues.
        const dialog = root().querySelector('[role="dialog"][aria-modal="true"]');
        const escapeEvent = new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
        act(() => { dialog.dispatchEvent(escapeEvent); });
        await act(async () => { await Promise.resolve(); });
        assert.equal(root().querySelector('#submit-title'), null, 'escape closed the submit review');

        // 9. Focus trap inside the keyboard help dialog ("?").
        keydown(dom.window, '?');
        await act(async () => { await Promise.resolve(); });
        assert.ok(root().querySelector('#kbd-help-title'), '? opens the shortcut guide');
        const helpDialog = root().querySelector('[role="dialog"][aria-modal="true"]');
        const helpButtons = () => Array.from(helpDialog.querySelectorAll('button'));
        await act(async () => {
            helpButtons()[0].focus();
            helpDialog.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
        });
        assert.ok(helpDialog.contains(document.activeElement), 'Tab stays trapped in the dialog');
        act(() => { helpDialog.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); });
        await act(async () => { await Promise.resolve(); });
        assert.equal(root().querySelector('#kbd-help-title'), null, 'escape closes help');

        // 10. Persistence: answers are written to UID-scoped storage.
        let savedRaw = null;
        let saved = null;
        for (let attempt = 0; attempt < 30; attempt++) {
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)); });
            savedRaw = localStorage.getItem(`interviewSession:${TEST_UID}`);
            if (savedRaw) {
                try {
                    saved = JSON.parse(savedRaw);
                    if (saved && saved.selectedAnswers && saved.selectedAnswers['1'] !== undefined) {
                        break;
                    }
                } catch {
                    // ignore JSON parse error while writing
                }
            }
        }
        assert.ok(savedRaw, 'session persisted');
        assert.ok(saved, 'session parsed');
        assert.equal(saved.ownerUid, TEST_UID);
        assert.equal(saved.schemaVersion >= 2, true);
        assert.ok(saved.tabId, 'session carries the owning tab id');
        assert.equal(saved.selectedAnswers['1'], 2, 'recorded answer persisted');

// 11. Multi-tab: another tab claiming the session closes this one cleanly.
        const foreignWrite = JSON.stringify({ ...saved, tabId: 'tab-other', lastSaved: Date.now() });
        act(() => {
            const storageEvent = new dom.window.Event('storage');
            Object.defineProperty(storageEvent, 'key', { value: `interviewSession:${TEST_UID}` });
            Object.defineProperty(storageEvent, 'newValue', { value: foreignWrite });
            dom.window.dispatchEvent(storageEvent);
        });
        await act(async () => { await Promise.resolve(); });
        assert.ok(textOf(root()).includes('AI Interview Coach'), 'returned to setup after takeover');
        assert.ok(textOf(root()).includes('continued in another tab'), 'takeover notice shown');
        assert.ok(root().querySelector('input[placeholder="Software Engineer"]'), 'setup screen restored, no corrupt exam state');

        // 12. Multi-tab: session submitted elsewhere also exits cleanly.
        // (restart an exam, then simulate the key being cleared)
        localStorage.removeItem(`interviewSession:${TEST_UID}`);
        await startExam(root());
        act(() => {
            const storageEvent = new dom.window.Event('storage');
            Object.defineProperty(storageEvent, 'key', { value: `interviewSession:${TEST_UID}` });
            Object.defineProperty(storageEvent, 'newValue', { value: null });
            dom.window.dispatchEvent(storageEvent);
        });
        await act(async () => { await Promise.resolve(); });
        assert.ok(textOf(root()).includes('finished in another tab'), 'submitted-elsewhere notice shown');

// 13. Full submission flow: keyboard-driven exam → report → history.
        await startExam(root());
        assert.ok(textOf(root()).includes('Question 1 of 3'), 'third attempt started');
        keydown(dom.window, 'a'); // Q1 correct
        keydown(dom.window, 'ArrowRight');
        await act(async () => { await Promise.resolve(); });
        keydown(dom.window, '2'); // Q2 wrong (correct is 1)
        keydown(dom.window, 'ArrowRight');
        await act(async () => { await Promise.resolve(); });
        keydown(dom.window, 'a'); // Q3 correct
        const submitButtons = Array.from(root().querySelectorAll('button')).filter(b => textOf(b).includes('Submit'));
        assert.ok(submitButtons.length >= 1, 'submit controls available');
        click(submitButtons[0]);
        await act(async () => { await Promise.resolve(); });
        const submitNow = Array.from(root().querySelectorAll('button')).find(b => textOf(b).includes('Submit now'));
        assert.ok(submitNow, 'submit review visible');
        click(submitNow);
        await act(async () => { await Promise.resolve(); });

        assert.ok(textOf(root()).includes('Assessment report'), 'report rendered');
        assert.ok(textOf(root()).includes('Question-Level STAR Analysis'), 'STAR analysis rendered');
        assert.ok(root().querySelector('[data-copy-state]'), 'clipboard export control rendered');
        assert.equal(localStorage.getItem(`interviewSession:${TEST_UID}`), null, 'session cleared after submit');

        // 14. History entry recorded once (idempotent submission).
        const storedHistory = JSON.parse(localStorage.getItem(`interviewHistory:${TEST_UID}`) || '[]');
        assert.equal(storedHistory.length, 1, 'exactly one history entry');
        assert.equal(storedHistory[0].questionCount, 3);
        assert.equal(storedHistory[0].answeredCount, 3);
        assert.equal(storedHistory[0].submissionReason, 'manual');
        assert.ok(typeof storedHistory[0].score === 'number');

// 15. Back to setup → history card → delete with confirmation.
        const back = Array.from(root().querySelectorAll('button')).find(b => textOf(b).includes('Back to Interviews'));
        click(back);
        await act(async () => { await Promise.resolve(); });
        assert.ok(textOf(root()).includes('Frontend Developer'), 'history card visible');
        assert.ok(textOf(root()).includes('3 questions'), 'question count surfaced in history');
        assert.ok(textOf(root()).includes('3 answered'), 'answered count surfaced in history');

        const deleteButton = root().querySelector('button[aria-label^="Delete assessment"]');
        assert.ok(deleteButton, 'per-item delete affordance present');
        click(deleteButton);
        await act(async () => { await Promise.resolve(); });
        assert.ok(root().querySelector('#delete-title'), 'delete confirmation shown');
        const confirmDelete = Array.from(root().querySelector('[role="dialog"]').querySelectorAll('button')).find(b => textOf(b).trim() === 'Delete');
        assert.ok(confirmDelete, 'confirm-delete button inside dialog');
        click(confirmDelete);
        await act(async () => { await Promise.resolve(); });
        assert.ok(textOf(root()).includes('No previous sessions yet'), 'empty history state after delete');
        assert.equal(JSON.parse(localStorage.getItem(`interviewHistory:${TEST_UID}`) || '[]').length, 0, 'storage emptied');

        // 16. Exit protection is gone once the exam is over.
        unloadEvent = new dom.window.Event('beforeunload', { cancelable: true });
        dom.window.dispatchEvent(unloadEvent);
        assert.equal(unloadEvent.defaultPrevented, false, 'no exit protection after submit');

// 17. Expired session on load: finalized as auto-submitted instead of resumed.
        const expiredSnapshot = {
            phase: 'exam',
            mode: 'assessment',
            occupation: 'Timed Out Role',
            interviewType: 'technical',
            ownerUid: TEST_UID,
            schemaVersion: 2,
            lastSaved: Date.now(),
            currentQuestion: 1,
            selectedAnswers: { 1: 0 },
            marked: [],
            visited: [1],
            timePerQuestion: {},
            timeLimit: 900,
            timeRemaining: 0,
            deadlineAt: Date.now() - 5000,
            interviewData: { title: 't', questions: structuredClone(MOCK_EXAM.questions) },
        };
        localStorage.setItem(`interviewSession:${TEST_UID}`, JSON.stringify(expiredSnapshot));
        localStorage.setItem(`interviewHistory:${TEST_UID}`, JSON.stringify([]));

        await act(async () => {
            reactRoot.render(React.createElement('div')); // force full remount path
        });
        const { component: Component2, AuthContext: AuthContext2 } = { component: (await vite.ssrLoadModule('/src/components/Dashboard/DashboardInterviews/DashboardInterviews.jsx')).default, AuthContext: (await vite.ssrLoadModule('/src/context/AuthContext.jsx')).AuthContext };
        await act(async () => {
            reactRoot.render(React.createElement(AuthContext2.Provider, { value: mockUser() }, React.createElement(Component2)));
        });
        await act(async () => { await Promise.resolve(); });
        assert.ok(textOf(root()).includes('Assessment report'), 'expired session finalized into a report');
        assert.ok(textOf(root()).includes('Auto-submitted at time expiry'), 'auto-submission labelled');
        assert.equal(localStorage.getItem(`interviewSession:${TEST_UID}`), null, 'expired session purged');
        const finalizedHistory = JSON.parse(localStorage.getItem(`interviewHistory:${TEST_UID}`) || '[]');
        assert.equal(finalizedHistory.length, 1, 'expired attempt preserved in history');
        assert.equal(finalizedHistory[0].submissionReason, 'timeout');
        assert.equal(finalizedHistory[0].answeredCount, 1, 'recorded answers were not lost');

// 18. Invalid AI output is rejected with a friendly, retryable error.
        globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ questions: [{ question: 'broken' }] }) });
        const fresh = await renderFresh(vite, reactRoot);
        await startExam(fresh.container);
        assert.ok(textOf(fresh.container).includes('unusable question set'), 'friendly invalid-output error');
        assert.ok(Array.from(fresh.container.querySelectorAll('button')).some(b => textOf(b).includes('Try again')), 'retry affordance offered');
        assert.equal(fresh.container.querySelector('[role="timer"]'), null, 'exam did not start on invalid payload');

        assert.ok(fetchCalls >= 3, 'generation endpoint exercised');
    } finally {
        globalThis.fetch = originalFetch;
        await act(async () => {
            reactRoot.render(React.createElement('div'));
        });
        setTimeout(() => { reactRoot.unmount(); }, 0);
        await vite.close();
    }
});

async function renderFresh(vite, reactRoot) {
    const module = await vite.ssrLoadModule('/src/components/Dashboard/DashboardInterviews/DashboardInterviews.jsx');
    const AuthContext = (await vite.ssrLoadModule('/src/main.jsx')).AuthContext;
    // Render a different element type first so the previous DashboardInterviews
    // instance fully unmounts (clearing timers/listeners) before remounting.
    await act(async () => { reactRoot.render(React.createElement('div')); });
    await act(async () => {
        reactRoot.render(React.createElement(AuthContext.Provider, { value: mockUser() }, React.createElement(module.default)));
    });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    return { container: document.getElementById('test-root') };
}
