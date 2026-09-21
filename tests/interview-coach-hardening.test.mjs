import test from 'node:test';
import assert from 'node:assert/strict';
import { SESSION_SCHEMA_VERSION, appendHistory, buildStarMarkdown, clearAllHistory, copyTextToClipboard, consumesArrowKeys, downloadTextFile, isTextEntryTarget, normalizeQuestions, optionIndexFromKey, purgeStaleOwnerSession, readHistory, readOwnerSession, removeHistoryEntry, resolveStorageConflict, sessionStorageKey, timerAnnouncement, validateInterviewPayload, writeOwnerSession } from '../src/utils/interviewCoach.js';

function installMockStorage() {
    const mockStorage = new Map();
    global.localStorage = {
        getItem: key => mockStorage.get(key) || null,
        setItem: (key, val) => mockStorage.set(key, String(val)),
        removeItem: key => mockStorage.delete(key),
        clear: () => mockStorage.clear(),
    };
    return mockStorage;
}

// ── AI OUTPUT VALIDATION ─────────────────────────────────────────────────────
test('normalizeQuestions keeps well-formed questions and repairs bounded fields', () => {
    const result = normalizeQuestions([
        { id: 7, question: '  What is X? ', options: ['A', 'B', 'C', 'D'], correctAnswer: 2, category: 'Core', difficulty: 'Easy', explanation: 'Because.', estimatedTime: 10000 },
        { id: 'two', question: 'Valid?', options: ['Yes', 'No'], correctAnswer: 0 },
    ]);
    assert.equal(result.length, 2);
    assert.equal(result[0].id, '7');
    assert.equal(result[0].question, 'What is X?');
    assert.equal(result[0].estimatedTime, 600); // clamped to a 30–600s window
    assert.equal(result[1].id, 'two');
    assert.equal(result[1].explanation, '');
});

test('normalizeQuestions drops malformed questions that cannot be rendered or scored', () => {
    const result = normalizeQuestions([
        null,
        { question: '', options: ['A', 'B'], correctAnswer: 0 }, // no question text
        { question: 'Only one option?', options: ['A'], correctAnswer: 0 }, // <2 options
        { question: 'Bad correct index?', options: ['A', 'B', 'C'], correctAnswer: 9 }, // unscoreable
        { question: 'NaN correct?', options: ['A', 'B'], correctAnswer: 'zero' }, // unscoreable
        { question: 'non-string options', options: 'AB', correctAnswer: 0 }, // options not an array
        { question: 'I survive.', options: ['A', 'B'], correctAnswer: 1 },
    ]);
    assert.equal(result.length, 1);
    assert.equal(result[0].question, 'I survive.');
});

test('normalizeQuestions de-duplicates repeated ids and stringifies ids safely', () => {
    const result = normalizeQuestions([
        { id: 5, question: 'First?', options: ['A', 'B'], correctAnswer: 0 },
        { id: 5, question: 'Second?', options: ['A', 'B'], correctAnswer: 0 },
        { question: 'No id?', options: ['A', 'B'], correctAnswer: 0 },
    ]);
    assert.deepEqual(result.map(q => q.id), ['5', '5-2', 'q-3']);
});

test('validateInterviewPayload rejects garbage AI output and bounds metadata', () => {
    assert.equal(validateInterviewPayload(null), null);
    assert.equal(validateInterviewPayload('questions'), null);
    assert.equal(validateInterviewPayload({ questions: [] }), null);
    assert.equal(validateInterviewPayload({ questions: [{ question: 'x', options: ['a'], correctAnswer: 0 }] }), null);

    const valid = validateInterviewPayload({
        title: 'T'.repeat(500),
        questions: [
            { id: 1, question: 'Q1?', options: ['A', 'B', 'C', 'D'], correctAnswer: 3 },
            { id: 2, question: 'Q2?', options: ['A', 'B'], correctAnswer: 0, category: 'Cat', explanation: 'Exp' },
        ],
        extraJunk: { deep: { secret: true } },
    });
    assert.ok(valid);
    assert.equal(valid.title.length, 160);
    assert.equal(valid.totalQuestions, 2);
    assert.equal(valid.questions[0].correctAnswer, 3);
    assert.ok(!('extraJunk' in valid), 'unknown top-level AI fields are not forwarded');
});

// ── SESSION SCHEMA VERSIONING, CORRUPTION, TTL ───────────────────────────────
test('sessions are written with the current schema version and round-trip per owner', () => {
    installMockStorage();
    writeOwnerSession('user-a', { phase: 'exam', currentQuestion: 3, ownerUid: 'user-a', interviewData: { questions: [{ id: 1, question: 'Q?', options: ['A', 'B'], correctAnswer: 0 }] } });
    const raw = JSON.parse(global.localStorage.getItem(sessionStorageKey('user-a')));
    assert.equal(raw.schemaVersion, SESSION_SCHEMA_VERSION);
    const restored = readOwnerSession('user-a');
    assert.equal(restored.currentQuestion, 3);
    assert.equal(restored.interviewData.questions.length, 1);
    // other owners stay isolated
    assert.equal(readOwnerSession('user-b'), null);
});

test('legacy sessions without a schema version remain readable; future schemas are rejected', () => {
    installMockStorage();
    global.localStorage.setItem(sessionStorageKey('user-a'), JSON.stringify({
        phase: 'setup', lastSaved: Date.now(), ownerUid: 'user-a',
    }));
    assert.equal(readOwnerSession('user-a')?.phase, 'setup');

    global.localStorage.setItem(sessionStorageKey('user-a'), JSON.stringify({
        phase: 'exam', lastSaved: Date.now(), ownerUid: 'user-a', schemaVersion: 99,
        interviewData: { questions: [{ id: 1, question: 'Q?', options: ['A', 'B'], correctAnswer: 0 }] },
    }));
    assert.equal(readOwnerSession('user-a'), null, 'unknown future schema must not be restored');
});

test('live session recovery stores only an owner-scoped opaque session pointer', () => {
    installMockStorage();
    const sessionId = 'live_session_recovery_abcdef';
    writeOwnerSession('user-a', { phase: 'live', ownerUid: 'user-a', sessionId, answer: 'must not be read as authority' });
    const restored = readOwnerSession('user-a');
    assert.equal(restored?.phase, 'live');
    assert.equal(restored?.sessionId, sessionId);
    assert.equal(Object.hasOwn(restored || {}, 'answer'), false, 'answer text is never persisted in a live recovery pointer');
    assert.equal(readOwnerSession('user-b'), null, 'a different user cannot recover the pointer');

    global.localStorage.setItem(sessionStorageKey('user-a'), JSON.stringify({
        phase: 'live', lastSaved: Date.now(), ownerUid: 'user-a', sessionId: 'not-valid',
    }));
    assert.equal(readOwnerSession('user-a'), null);
    assert.equal(purgeStaleOwnerSession('user-a'), true);
});

test('expired and corrupt sessions are rejected and purged without touching other owners', () => {
    installMockStorage();
    // TTL-expired
    global.localStorage.setItem(sessionStorageKey('user-a'), JSON.stringify({ phase: 'exam', lastSaved: Date.now() - 25 * 3600 * 1000, ownerUid: 'user-a' }));
    assert.equal(readOwnerSession('user-a'), null);
    assert.equal(purgeStaleOwnerSession('user-a'), true);
    assert.equal(global.localStorage.getItem(sessionStorageKey('user-a')), null);

    // Corrupt JSON
    global.localStorage.setItem(sessionStorageKey('user-a'), '{not json at all');
    assert.equal(readOwnerSession('user-a'), null);
    assert.equal(purgeStaleOwnerSession('user-a'), true);
    assert.equal(global.localStorage.getItem(sessionStorageKey('user-a')), null);

    // Foreign-owner payload: rejected by read, never deleted by purge
    global.localStorage.setItem(sessionStorageKey('user-a'), JSON.stringify({ phase: 'exam', lastSaved: Date.now(), ownerUid: 'someone-else', schemaVersion: 99 }));
    assert.equal(readOwnerSession('user-a'), null);
    assert.equal(purgeStaleOwnerSession('user-a'), false, 'purge must not delete another owner data');
    assert.ok(global.localStorage.getItem(sessionStorageKey('user-a')));

    // Healthy exam session is preserved
    writeOwnerSession('user-a', { phase: 'exam', ownerUid: 'user-a', interviewData: { questions: [{ id: 1, question: 'Q?', options: ['A', 'B'], correctAnswer: 0 }] } });
    assert.equal(purgeStaleOwnerSession('user-a'), false);
    assert.ok(readOwnerSession('user-a'));
});

test('sessions with unrestorable exam payloads are rejected and self-healed', () => {
    installMockStorage();
    global.localStorage.setItem(sessionStorageKey('user-a'), JSON.stringify({
        phase: 'exam', lastSaved: Date.now(), ownerUid: 'user-a',
        interviewData: { questions: [{ question: 'no options', options: ['only-one'], correctAnswer: 0 }] },
    }));
    assert.equal(readOwnerSession('user-a'), null);
    assert.equal(purgeStaleOwnerSession('user-a'), true);
});

// ── HISTORY MANAGEMENT ───────────────────────────────────────────────────────
test('history delete, clear all, sanitize, dedupe and stable ordering work per owner', () => {
    installMockStorage();
    appendHistory('user-a', { id: 'keep-1', role: 'Frontend', score: 80, completedAt: '2026-08-17T10:00:00Z', interviewType: 'technical' });
    appendHistory('user-a', { id: 'drop-1', role: 'Backend', score: 40, completedAt: '2026-08-18T10:00:00Z', interviewType: 'technical' });
    // Upsert: same id replaces instead of duplicating (double-submit resilience)
    appendHistory('user-a', { id: 'keep-1', role: 'Frontend v2', score: 95, completedAt: '2026-08-19T10:00:00Z', interviewType: 'technical' });

    let list = readHistory('user-a');
    assert.equal(list.length, 2);
    assert.deepEqual(list.map(item => item.id), ['keep-1', 'drop-1'], 'newest first');
    assert.equal(list[0].role, 'Frontend v2');

    list = removeHistoryEntry('user-a', 'drop-1');
    assert.equal(list.length, 1);
    assert.equal(readHistory('user-a').length, 1);

    // Owner isolation
    assert.equal(readHistory('user-b').length, 0);

    list = clearAllHistory('user-a');
    assert.deepEqual(list, []);
    assert.equal(readHistory('user-a').length, 0);
});

test('history survives corrupt storage and mends invalid entries', () => {
    installMockStorage();
    global.localStorage.setItem('interviewHistory:user-a', 'not-json');
    assert.deepEqual(readHistory('user-a'), []);

    global.localStorage.setItem('interviewHistory:user-a', JSON.stringify([
        { role: 'No id', score: '88', completedAt: '2026-08-01T09:00:00Z' },
        { id: 'x', role: 'Has id', score: null, completedAt: '2026-08-02T09:00:00Z' },
        { id: 'y', role: 'Foreign', ownerUid: 'user-b', completedAt: '2026-08-03T09:00:00Z' },
        'garbage-entry',
    ]));
    const list = readHistory('user-a');
    assert.equal(list.length, 2); // foreign-owner entry and garbage dropped
    assert.ok(list.every(item => typeof item.id === 'string' && item.id.length > 0));
    assert.ok(list.every(item => Number.isFinite(item.score)));
    assert.deepEqual(list.map(item => item.role), ['Has id', 'No id'], 'sorted newest first');
});

// ── KEYBOARD SHORTCUT SAFETY ─────────────────────────────────────────────────
test('optionIndexFromKey maps letters and digits onto available options only', () => {
    assert.equal(optionIndexFromKey('a', 4), 0);
    assert.equal(optionIndexFromKey('D', 4), 3);
    assert.equal(optionIndexFromKey('1', 4), 0);
    assert.equal(optionIndexFromKey('4', 4), 3);
    assert.equal(optionIndexFromKey('e', 5), 4); // fifth option when it exists
    assert.equal(optionIndexFromKey('e', 4), null); // out of range
    assert.equal(optionIndexFromKey('z', 4), null);
    assert.equal(optionIndexFromKey('5', 4), null);
    assert.equal(optionIndexFromKey('aa', 4), null);
    assert.equal(optionIndexFromKey('', 4), null);
    assert.equal(optionIndexFromKey('b', 0), null);
    assert.equal(optionIndexFromKey('?', 4), null);
});

test('isTextEntryTarget excludes text-entry controls but not radios and buttons', () => {
    assert.equal(isTextEntryTarget({ tagName: 'INPUT', type: 'text' }), true);
    assert.equal(isTextEntryTarget({ tagName: 'INPUT', type: 'search' }), true);
    assert.equal(isTextEntryTarget({ tagName: 'INPUT', type: 'password' }), true);
    assert.equal(isTextEntryTarget({ tagName: 'TEXTAREA' }), true);
    assert.equal(isTextEntryTarget({ tagName: 'DIV', isContentEditable: true }), true);
    assert.equal(isTextEntryTarget({ tagName: 'SELECT' }), true);
    assert.equal(isTextEntryTarget({ tagName: 'INPUT', type: 'radio' }), false);
    assert.equal(isTextEntryTarget({ tagName: 'INPUT', type: 'checkbox' }), false);
    assert.equal(isTextEntryTarget({ tagName: 'BUTTON' }), false);
    assert.equal(isTextEntryTarget(null), false);
    assert.equal(consumesArrowKeys({ tagName: 'INPUT', type: 'radio' }), true, 'radio groups own arrow keys');
    assert.equal(consumesArrowKeys({ tagName: 'BUTTON' }), false);
});

// ── TIMER ANNOUNCEMENTS ──────────────────────────────────────────────────────
test('timerAnnouncement reports only milestone values for screen readers', () => {
    assert.equal(timerAnnouncement(600), '10 minutes remaining');
    assert.equal(timerAnnouncement(300), '5 minutes remaining');
    assert.equal(timerAnnouncement(60), '1 minute remaining');
    assert.equal(timerAnnouncement(30), '30 seconds remaining');
    assert.equal(timerAnnouncement(10), '10 seconds remaining');
    assert.match(timerAnnouncement(0), /Time is up/);
    assert.equal(timerAnnouncement(45), null);
    assert.equal(timerAnnouncement(599), null);
    assert.match(timerAnnouncement(-3), /Time is up/, 'negative values clamp to zero');
});

// ── MULTI-TAB CONFLICT RESOLUTION ────────────────────────────────────────────
test('resolveStorageConflict yields only to newer foreign writes deterministically', () => {
    const ours = { tabId: 'tab-1', lastWriteAt: 1000 };
    assert.equal(resolveStorageConflict({ tabId: 'tab-2', lastSaved: 1200 }, ours), 'yield');
    assert.equal(resolveStorageConflict({ tabId: 'tab-2', lastSaved: 900 }, ours), 'ignore', 'older foreign write loses');
    assert.equal(resolveStorageConflict({ tabId: 'tab-2', lastSaved: 1000 }, ours), 'ignore', 'same-millisecond tie defers instead of double-exiting');
    assert.equal(resolveStorageConflict({ tabId: 'tab-1', lastSaved: 5000 }, ours), 'ignore', 'own echo ignored');
    assert.equal(resolveStorageConflict({ tabId: 'tab-2' }, ours), 'ignore', 'payload without a timestamp cannot claim ownership (stale/legacy write)');
    assert.equal(resolveStorageConflict(null, ours), 'ignore');
    assert.equal(resolveStorageConflict('corrupt', ours), 'ignore');
});

// ── STAR MARKDOWN EXPORT ─────────────────────────────────────────────────────
test('buildStarMarkdown renders a complete, deterministic coaching document', () => {
    const report = {
        overall: 75,
        readiness: 'Nearly ready',
        completionRate: 100,
        timeUsed: 300,
        timeLimit: 900,
        categoryScores: { React: 100, Node: 50 },
        strengths: ['React'],
        weaknesses: [{ area: 'Node', detail: 'Missed middleware ordering.' }],
        questions: [
            { index: 1, question: 'What are hooks?', answered: true, correct: true, userAnswer: 'State in function components', idealAnswer: 'State in function components', whatWasGood: 'Precise.', whatWasMissing: 'Nothing material.', improvement: 'Add a metric.', explanation: 'Hooks rule.' },
            { index: 2, question: 'Event loop?', answered: true, correct: false, userAnswer: 'Wrong', idealAnswer: 'Run-to-completion queue', whatWasGood: 'Attempted.', whatWasMissing: 'Microtask ordering.', improvement: 'Rehearse microtasks.' },
        ],
        missingSkills: [{ requirement: 'React', gap: 'Covered' }],
        plan: { immediate: ['Rewrite weak answers.'], sevenDay: ['Day 1–2: fundamentals'] },
    };
    const md = buildStarMarkdown({ report, meta: { role: 'Senior React Engineer', interviewType: 'technical', mode: 'assessment', completedAt: '2026-08-19T10:00:00Z', submissionReason: 'timeout' } });

    assert.match(md, /^# Interview STAR Summary — Senior React Engineer/);
    assert.match(md, /\*\*Track:\*\* technical/);
    assert.match(md, /\*\*Mode:\*\* assessment/);
    assert.match(md, /\*\*Overall Score:\*\* 75% — Nearly ready/);
    assert.match(md, /\*\*Completion:\*\* 100% \(2\/2 answered\)/);
    assert.match(md, /\*\*Time Used:\*\* 5:00 of 15:00/);
    assert.match(md, /Auto-submitted when the timer expired/);
    assert.match(md, /## Category Breakdown/);
    assert.match(md, /\| React \| 100% \|/);
    assert.match(md, /## Demonstrated Strengths/);
    assert.match(md, /## Focus & Improvement Areas/);
    assert.match(md, /- \*\*Node:\*\* Missed middleware ordering\./);
    assert.match(md, /### Q1\. What are hooks\?/);
    assert.match(md, /\*\*Your answer:\*\* State in function components/);
    assert.match(md, /\*\*Model answer:\*\* Run-to-completion queue/);
    assert.match(md, /\*\*STAR recommendation:\*\* Rehearse microtasks\./);
    assert.match(md, /## 7-Day Action Plan/);
    assert.match(md, /1\. Rewrite weak answers\./);
    assert.match(md, /## Job Description Alignment/);
    assert.match(md, /Generated by ResumePilot AI Interview Coach/);
    assert.ok(!md.includes('undefined'), 'no undefined leaks into the export');
    assert.ok(!md.includes('NaN'), 'no NaN leaks into the export');

    // Degenerate report still renders valid markdown
    const empty = buildStarMarkdown({ report: { overall: 0, readiness: 'Needs rehearsal', completionRate: 0, timeUsed: 0, categoryScores: {}, questions: [], strengths: [], weaknesses: [], plan: {} }, meta: {} });
    assert.match(empty, /None identified yet/);
    assert.match(empty, /No major weaknesses identified/);
    assert.equal(buildStarMarkdown({ report: null, meta: {} }), '');
});

// ── CLIPBOARD ────────────────────────────────────────────────────────────────
test('copyTextToClipboard prefers the async clipboard API and reports failure safely', async () => {
    const setNavigator = value => Object.defineProperty(globalThis, 'navigator', { value, configurable: true });
    let clipboardText = null;
    setNavigator({ clipboard: { writeText: async text => { clipboardText = text; } } });
    const ok = await copyTextToClipboard('# STAR');
    assert.equal(ok.ok, true);
    assert.equal(ok.method, 'async');
    assert.equal(clipboardText, '# STAR');

    // Permission denied -> legacy fallback (execCommand mocked true)
    setNavigator({ clipboard: { writeText: async () => { throw new Error('NotAllowed'); } } });
    globalThis.document = {
        createElement: () => ({
            style: {}, value: '',
            setAttribute() {}, focus() {}, select() {}, setSelectionRange() {}, remove() {},
        }),
        body: { appendChild() {} },
        execCommand: () => true,
    };
    const legacy = await copyTextToClipboard('# STAR');
    assert.equal(legacy.ok, true);
    assert.equal(legacy.method, 'legacy');

    // Everything unavailable -> explicit failure with a reason, never a throw
    setNavigator({});
    globalThis.document = { execCommand: undefined };
    const failed = await copyTextToClipboard('# STAR');
    assert.equal(failed.ok, false);
    assert.ok(failed.reason);

    const empty = await copyTextToClipboard('');
    assert.equal(empty.ok, false);
    delete globalThis.document;
});

test('downloadTextFile is a no-op-safe helper outside the browser', () => {
    assert.equal(downloadTextFile('x.md', '# hi', 'text/markdown'), false, 'no DOM -> clean failure');
});
