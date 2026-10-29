/**
 * Mandate 11F — source-level contract tests.
 *
 * These run without a browser or a database and assert the contracts that the
 * Playwright suite (`frontend/tests/mandate11f.spec.ts`) then exercises in a real
 * page:
 *
 *   1. Interview Coach + voice engine — feature detection, honest messages,
 *      answer-key normalisation, session closure
 *   2. ATS diagnostics — rubric weights, aggregation, status bands, empty resume
 *   3. AI writing — truthful diagnostics, never a fabricated result
 *   4. Notifications — row mapping, error mapping, poller policy constants
 *   5. Messaging — id shape, error mapping (incl. MODULE_DISABLED), formatting
 *
 * Modules are imported directly from `frontend/src`, with a small loader that
 * resolves the `@/` alias and stubs Firebase, exactly like the 11B suite. Run:
 *   node --test developer-implemented/TESTS/unit/mandate11f-contracts.test.mjs
 */
import { register } from 'node:module';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const loaderCode = `
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const frontendSrcDir = ${JSON.stringify(fileURLToPath(new URL('../../../frontend/src/', import.meta.url)))};

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const subPath = specifier.slice(2);
    for (const ext of ['.ts', '.tsx', '.js', '/index.ts']) {
      const candidate = path.join(frontendSrcDir, subPath + ext);
      if (existsSync(candidate)) {
        return nextResolve(pathToFileURL(candidate).href, context);
      }
    }
  }
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL) {
    const parentDir = path.dirname(fileURLToPath(context.parentURL));
    const base = path.resolve(parentDir, specifier);
    if (!existsSync(base)) {
      for (const ext of ['.ts', '.tsx', '.js']) {
        if (existsSync(base + ext)) {
          return nextResolve(pathToFileURL(base + ext).href, context);
        }
      }
    }
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.endsWith('/src/lib/firebase.ts')) {
    return {
      format: 'module',
      shortCircuit: true,
      source: 'export const auth = { currentUser: null }; export const isFirebaseConfigured = false;',
    };
  }
  return nextLoad(url, context);
}
`;

register(`data:text/javascript;base64,${Buffer.from(loaderCode).toString('base64')}`);

const voice = await import('../../../frontend/src/lib/voice-interview.ts');
const coach = await import('../../../frontend/src/lib/interview-coach.ts');
const ats = await import('../../../frontend/src/lib/atsScore.js');
const content = await import('../../../frontend/src/lib/ai-content.ts');
const notifications = await import('../../../frontend/src/lib/notifications.ts');
const messages = await import('../../../frontend/src/lib/messages.ts');

const readSource = (relativePath) => readFileSync(new URL(`../../../frontend/src/${relativePath}`, import.meta.url), 'utf8');

/* ───────────────────────── Task 1: Interview Coach + voice ───────────────────────── */

test('Task 1 (voice): reports every capability as unavailable outside a browser, with a reason', () => {
  const capabilities = voice.getVoiceCapabilities();
  assert.equal(capabilities.speechRecognition, false);
  assert.equal(capabilities.speechSynthesis, false);
  assert.equal(capabilities.audioCapture, false);
  assert.equal(capabilities.audioContext, false);
  assert.equal(capabilities.secureContext, true, 'no window means no insecure-context claim');
  assert.match(capabilities.speechRecognitionReason, /does not support speech recognition/i);
  assert.match(capabilities.speechSynthesisReason, /read questions aloud/i);
  assert.match(capabilities.audioActivityReason, /cannot be measured/i);
});

test('Task 1 (voice): feature detection follows the real APIs, and never claims one it cannot see', () => {
  const previousWindow = globalThis.window;
  const previousNavigator = globalThis.navigator;
  try {
    // A browser with every API the engine uses.
    class FakeRecognition {}
    class FakeAudioContext {}
    globalThis.window = {
      isSecureContext: true,
      SpeechRecognition: FakeRecognition,
      speechSynthesis: {},
      SpeechSynthesisUtterance: class {},
      AudioContext: FakeAudioContext,
    };
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { mediaDevices: { getUserMedia: async () => ({}) } },
    });

    const full = voice.getVoiceCapabilities();
    assert.equal(full.speechRecognition, true);
    assert.equal(full.speechSynthesis, true);
    assert.equal(full.audioCapture, true);
    assert.equal(full.audioContext, true);
    assert.equal(full.speechRecognitionReason, null);
    assert.equal(full.speechSynthesisReason, null);
    assert.equal(full.audioActivityReason, null);

    // A browser without speech synthesis: dictation still works, playback does not.
    globalThis.window = {
      isSecureContext: true,
      webkitSpeechRecognition: FakeRecognition,
      AudioContext: FakeAudioContext,
    };
    const partial = voice.getVoiceCapabilities();
    assert.equal(partial.speechRecognition, true, 'vendor-prefixed recognition counts');
    assert.equal(partial.speechSynthesis, false);
    assert.match(partial.speechSynthesisReason, /cannot read questions aloud/i);
    assert.equal(voice.getSpeechRecognitionConstructor(), FakeRecognition);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousNavigator === undefined) delete globalThis.navigator;
    else Object.defineProperty(globalThis, 'navigator', { configurable: true, value: previousNavigator });
  }
});

test('Task 1 (voice): every recognition error maps to a specific, actionable message', () => {
  assert.deepEqual(voice.describeRecognitionError('not-allowed'), {
    code: 'permission-denied',
    message: 'Microphone permission was denied. Allow microphone access in your browser settings, or type your answer instead.',
  });
  assert.equal(voice.describeRecognitionError('service-not-allowed').code, 'permission-denied');
  assert.equal(voice.describeRecognitionError('audio-capture').code, 'microphone-unavailable');
  assert.match(voice.describeRecognitionError('audio-capture').message, /No microphone was found/);
  assert.equal(voice.describeRecognitionError('network').code, 'network');
  assert.equal(voice.describeRecognitionError('no-speech').code, 'recognition-error');
  assert.match(voice.describeRecognitionError('no-speech').message, /Nothing was heard/);
  assert.match(voice.describeRecognitionError('weird-failure').message, /weird-failure/);
});

test('Task 1 (coach): assessment questions keep the server answer key and never reorder options', () => {
  const normalized = coach.normalizeAssessment({
    title: ' Data Analyst ',
    questions: [
      { question: 'Q1?', options: ['A', 'B', 'C'], correctAnswer: 2, explanation: ' because C ' },
      // No usable answer key: the client cannot score it, so it is dropped.
      { question: 'Q2?', options: ['A', 'B'] },
      { question: 'Q3?', options: ['A', 'B'], correctAnswer: 5 },
      { question: 'Q4?', options: ['A', ''], correctAnswer: 0 },
      { question: 'Q5?', options: ['only'], correctAnswer: 0 },
    ],
  });
  assert.equal(normalized.title, 'Data Analyst');
  assert.deepEqual(normalized.questions.map((item) => item.question), ['Q1?']);
  assert.deepEqual(normalized.questions[0].options, ['A', 'B', 'C']);
  assert.equal(normalized.questions[0].correctIndex, 2);
  assert.equal(normalized.questions[0].explanation, 'because C');
  assert.deepEqual(coach.normalizeAssessment(null), { title: '', questions: [] });
});

test('Task 1 (coach): a live interview is closed only when the server says so', () => {
  const base = {
    sessionId: 's1',
    interviewer: { turnId: 'turn_1', responseType: 'question' },
    progress: { interviewComplete: false },
  };
  assert.equal(coach.liveInterviewClosed(base), false);
  assert.equal(coach.liveInterviewClosed({ ...base, progress: { interviewComplete: true } }), true);
  assert.equal(coach.liveInterviewClosed({ ...base, interviewer: { turnId: 'turn_1', responseType: 'closing' } }), true);
  assert.equal(coach.liveInterviewClosed({ ...base, interviewer: { turnId: '', responseType: 'question' } }), true);
  // The mapping the coach uses for each topic is part of the request contract.
  assert.deepEqual(coach.TOPIC_INTERVIEW_TYPE, {
    behavioral: 'behavioral',
    technical: 'technical',
    situational: 'mixed',
    'case-study': 'case',
    competency: 'mixed',
    general: 'hr',
  });
});

test('Task 1 (coach): the page sends the documented live-interview contracts', () => {
  const source = readSource('lib/interview-coach.ts');
  assert.match(source, /'\/live-interview\/sessions'/);
  assert.match(source, /\/live-interview\/sessions\/\$\{encodeURIComponent\(session\.sessionId\)\}\/turns/);
  assert.match(source, /\/live-interview\/sessions\/\$\{encodeURIComponent\(session\.sessionId\)\}\/complete/);
  assert.match(source, /idempotencyKey,\r?\n\s*expectedRevision: session\.revision,\r?\n\s*turnId: session\.interviewer\.turnId,\r?\n\s*answer,/);
  // No simulated audio: the engine talks to the real browser APIs only.
  const engine = readSource('lib/voice-interview.ts');
  assert.match(engine, /webkitSpeechRecognition/);
  assert.match(engine, /new window\.AudioContext|new AudioContextConstructor|getAudioContextConstructor/);
  assert.doesNotMatch(engine, /Math\.random\(\)\s*\*\s*100/);
});

/* ───────────────────────────── Task 2: ATS diagnostics ───────────────────────────── */

const STRONG_RESUME = {
  firstname: 'Priya',
  lastname: 'Sharma',
  email: 'priya.sharma@example.test',
  phone: '+91 98765 43210',
  city: 'Vijayawada',
  country: 'India',
  summary: 'Data analyst with five years turning messy operational data into decisions. I build SQL pipelines, own the weekly revenue model, and present findings to non-technical leaders without jargon.',
  skills: ['SQL', 'Python', 'Tableau', 'dbt', 'Airflow', 'Excel', 'A/B testing', 'Data modelling', 'Stakeholder communication', 'Git'].map((name) => ({ name })),
  employments: [
    {
      jobTitle: 'Senior Data Analyst',
      employer: 'Northwind Retail',
      begin: '2022-01',
      end: '2026-09',
      description: 'Built a churn model that reduced monthly attrition by 18%.\nAutomated a reporting pipeline that saved 12 engineering hours each week.\nLed a pricing analysis that increased gross margin by 4.5%.',
    },
    {
      jobTitle: 'Data Analyst',
      employer: 'Lumen Logistics',
      begin: '2019-06',
      end: '2021-12',
      description: 'Reduced late deliveries by 23% with a route-optimisation dashboard.\nMigrated 40 legacy reports to a governed warehouse.',
    },
  ],
  educations: [{ school: 'Andhra University', degree: 'B.Tech', field: 'Information Technology', begin: '2015', end: '2019', grade: '8.6 CGPA' }],
};

const EMPTY_RESUME = { firstname: '', lastname: '', email: '', phone: '', summary: '', skills: [], employments: [], educations: [] };

test('Task 2 (ATS): the rubric weights add up to 100 and the score is the rounded section sum', () => {
  assert.deepEqual({ ...ats.ATS_WEIGHTS }, { contact: 10, summary: 10, experience: 28, education: 8, skills: 14, evidence: 14, integrity: 16 });
  assert.equal(ats.ATS_QUALITY_MAX, 100);
  assert.equal(ats.SCORE_ARCHITECTURE, 'separate');

  const result = ats.calculateAtsScore(STRONG_RESUME);
  assert.equal(result.sections.length, 7);
  for (const section of result.sections) {
    assert.ok(Number.isInteger(section.score), `${section.id} score is an integer`);
    assert.ok(section.score >= 0 && section.score <= section.maxScore, `${section.id} stays inside its maximum`);
    assert.equal(section.maxScore, ats.ATS_WEIGHTS[section.id]);
    assert.ok(section.name && Array.isArray(section.findings) && typeof section.action === 'string');
  }
  const sum = result.sections.reduce((total, section) => total + section.score, 0);
  assert.equal(result.qualityScore, Math.max(0, Math.min(100, sum)));
  assert.equal(result.totalScore, Math.round(result.qualityScore));
  assert.equal(result.totalScore, ats.composeDisplayedScore(result.qualityScore));
  // Deterministic: the same resume always scores the same.
  assert.equal(ats.calculateAtsScore(STRONG_RESUME).totalScore, result.totalScore);
});

test('Task 2 (ATS): status bands, strengths and next steps all derive from the same score', () => {
  const strong = ats.calculateAtsScore(STRONG_RESUME);
  const weak = ats.calculateAtsScore({ ...EMPTY_RESUME, firstname: 'Priya', lastname: 'Sharma', email: 'priya.sharma@example.test', employments: [{ jobTitle: '', employer: '', description: 'Helped with reports.' }] });

  assert.ok(strong.totalScore > weak.totalScore, 'a complete resume outscores a sparse one');
  assert.equal(strong.status.id, strong.totalScore >= 85 ? 'excellent' : strong.totalScore >= 70 ? 'strong' : strong.totalScore >= 45 ? 'needs-improvement' : 'getting-started');
  assert.ok(strong.strengths.length > 0);
  assert.ok(strong.strengths.length <= 3, 'the strengths list stays short');
  assert.ok(strong.improvements.length <= 3, 'the next-steps list stays short');
  for (const item of strong.improvements) assert.ok(item.text && item.navigateTo);
  // Findings are what the page renders: each one is a real statement about this resume.
  const contact = strong.sections.find((section) => section.id === 'contact');
  assert.ok(contact.findings.some((finding) => finding.ok && finding.text === 'Full name is present.'));
  const experience = strong.sections.find((section) => section.id === 'experience');
  assert.ok(experience.findings.some((finding) => finding.text === '2 complete roles (title + employer).'));
});

test('Task 2 (ATS): a sparse resume gets specific gaps, and an empty one gets no invented credit', () => {
  const sparse = ats.calculateAtsScore({ ...EMPTY_RESUME, firstname: 'Priya', lastname: 'Sharma', email: 'priya.sharma@example.test', skills: [{ name: 'SQL' }], employments: [{ jobTitle: '', employer: '', description: 'Helped with reports.' }] });
  const findings = sparse.sections.flatMap((section) => section.findings.map((finding) => finding.text));
  assert.ok(findings.includes('Add a phone number with at least 7 digits.'));
  assert.ok(findings.includes('No professional summary yet.'));
  assert.ok(findings.some((text) => /Add measurable results/.test(text)));
  assert.ok(findings.includes('Full name is present.'), 'the name it does have is credited');

  const empty = ats.calculateAtsScore(EMPTY_RESUME);
  assert.equal(empty.totalScore, 0, 'nothing is credited for an empty resume');
  assert.equal(empty.status.id, 'getting-started');
  // No section can claim to be in good shape when there is nothing in it.
  assert.deepEqual(empty.strengths.filter((item) => /healthy|good shape|strong|complete enough/i.test(item)), []);
  assert.equal(empty.improvements.length, 1);
  assert.match(empty.improvements[0].text, /Start with your name/);
});

test('Task 2 (ATS): job-description matching is opt-in and reports what is missing', () => {
  const without = ats.calculateAtsScore(STRONG_RESUME);
  assert.equal(without.hasJobDescription, false);
  assert.equal(without.jdMatch.score, null);
  assert.deepEqual(without.jdMatch.matched, []);

  const jobDescription = 'We need a data analyst with SQL, dbt, Airflow and Tableau experience who can build forecasting models and present to stakeholders. Kubernetes operators preferred.';
  const withJd = ats.calculateAtsScore(STRONG_RESUME, { jobDescription });
  assert.equal(withJd.hasJobDescription, true);
  assert.ok(Number.isInteger(withJd.jdMatch.score) && withJd.jdMatch.score >= 0 && withJd.jdMatch.score <= 100);
  assert.ok(withJd.jdMatch.matched.length + withJd.jdMatch.missing.length > 0);
  // A term nobody has cannot be "matched".
  assert.ok(!withJd.jdMatch.matched.includes('kubernetes'));
});

/* ───────────────────────────── Task 3: AI writing ───────────────────────────── */

test('Task 3 (AI writing): every outcome the studio can show has a truthful message', () => {
  assert.match(content.AI_UNAVAILABLE_MESSAGE, /unavailable/i);
  assert.match(content.AI_UNAVAILABLE_MESSAGE, /Nothing was generated/i);

  const quota = content.resolveTruthfulDiagnostic({ code: 'AI_QUOTA_EXHAUSTED', message: 'quota', status: 429 });
  assert.ok(quota.message.length > 0);
  assert.match(quota.message, /quota|limit|credit/i);

  const unknown = content.resolveTruthfulDiagnostic({ code: 'AI_PROVIDER_UNAVAILABLE', status: 503 });
  assert.ok(unknown.message.length > 0);
  assert.match(unknown.message, /unavailable|unknown|try again/i);
  assert.doesNotMatch(unknown.message, /\{|\}|stack/i, 'no raw payload leaks into the message');
});

test('Task 3 (AI writing): list splitting is bounded, so a pasted paragraph never becomes one skill', () => {
  assert.deepEqual(content.splitList('SQL, dbt ,Airflow,, Tableau'), ['SQL', 'dbt', 'Airflow', 'Tableau']);
  assert.deepEqual(content.splitList('', 3), []);
  assert.deepEqual(content.splitList('a\nb\nc\nd', 2), ['a', 'b']);
});

test('Task 3 (AI writing): the studio only calls the supported operation and endpoints', () => {
  const lib = readSource('lib/ai-content.ts');
  assert.match(lib, /'\/generate-content', \{ operation, payload \}/);
  const page = readSource('pages/dashboard/ai-assistant.tsx');
  assert.match(page, /operation: 'enhance-single-bullet'/);
  assert.match(page, /operation: 'generate-summary'/);
  assert.match(page, /operation: 'generate-skills'/);
  // The unknown ?tool= value is removed from the URL instead of being kept silently.
  assert.match(page, /const unknownTool = toolParam !== null && !isToolId\(toolParam\)/);
  assert.match(page, /next\.delete\('tool'\);\s*\n\s*setSearchParams\(next, \{ replace: true \}\)/);
  // The editable draft — never the model response — is what gets copied.
  assert.match(page, /onClick=\{\(\) => void copy\(draft\)\}/);
  assert.doesNotMatch(page, /copy\(visible\.(text|skills)\)/);
});

/* ───────────────────────────── Task 4: notifications ───────────────────────────── */

const POLLER_SOURCE = readSource('pages/dashboard/notifications.tsx');

test('Task 4 (notifications): the poller policy is 15 s, a 15/30/60 ladder and a 1 s floor', () => {
  assert.match(POLLER_SOURCE, /export const POLL_INTERVAL_MS = 15_000;/);
  assert.match(POLLER_SOURCE, /export const POLL_BACKOFF_LADDER_MS: readonly number\[\] = \[15_000, 30_000, 60_000\];/);
  assert.match(POLLER_SOURCE, /export const POLL_MIN_DELAY_MS = 1_000;/);
  assert.match(POLLER_SOURCE, /export function parseRetryAfterMs/);
  assert.match(POLLER_SOURCE, /export function pollDelayMs/);
  // One loop for the whole app: the loop is owned by the module, not by the page.
  assert.match(POLLER_SOURCE, /const notificationPoller = new UnreadNotificationPoller\(\);/);
  assert.match(POLLER_SOURCE, /export function getNotificationPoller\(\)/);
  // No overlapping requests, and a stop that clears the timer.
  assert.match(POLLER_SOURCE, /if \(this\.inFlight\) return;/);
  assert.match(POLLER_SOURCE, /private clearTimer\(\)/);
  // The tab going away must not leave a timer running.
  assert.match(POLLER_SOURCE, /document\.visibilityState === 'hidden'/);
});

test('Task 4 (notifications): a row with no usable id is an error, never a silently dropped row', () => {
  const mapped = notifications.toNotification({
    id: 'ntf_1',
    type: 'Job_Application',
    title: ' Application received ',
    message: 'Northwind received your application.',
    created_at: '2026-10-28T09:00:00.000Z',
    read: false,
    data: { jobId: 'job_7' },
  });
  assert.deepEqual(mapped, {
    id: 'ntf_1',
    type: 'job_application',
    title: 'Application received',
    message: 'Northwind received your application.',
    read: false,
    createdAt: Date.parse('2026-10-28T09:00:00.000Z'),
    data: { jobId: 'job_7' },
  });

  const unread = notifications.toNotification({ id: 'ntf_2', is_read: 0 });
  assert.equal(unread.read, false, 'the is_read column decides when read is absent');
  assert.equal(notifications.toNotification({ id: 'ntf_3', is_read: 1 }).read, true);
  assert.equal(notifications.toNotification({ id: 'ntf_4' }).title, 'Notification', 'a row always has a title');

  assert.throws(() => notifications.toNotification(null), (error) => error.code === 'CONTRACT');
  assert.throws(() => notifications.toNotification({ id: 'has space' }), (error) => error.code === 'CONTRACT');
  assert.throws(() => notifications.toNotification({}), (error) => error.status === 0);
});

test('Task 4 (notifications): errors keep the status the server sent', () => {
  const notFound = new notifications.NotificationsApiError(404, 'NOT_FOUND', 'Notification not found');
  assert.equal(notifications.toNotificationsError(notFound), notFound);
  assert.equal(notifications.toNotificationsError(notFound).notFound, true);

  const wrapped = notifications.toNotificationsError(new Error('boom'));
  assert.equal(wrapped.name, 'NotificationsApiError');
  assert.ok(Number.isInteger(wrapped.status));
  assert.ok(wrapped.message.length > 0);
});

/* ───────────────────────────── Task 5: messaging ───────────────────────────── */

test('Task 5 (messaging): conversation ids are validated before they reach the API', () => {
  assert.equal(messages.isConversationId('conv_alpha-1'), true);
  assert.equal(messages.isConversationId('msg_9f8b7c6d5e4f3a2b1c0d'), true);
  assert.equal(messages.isConversationId(''), false);
  assert.equal(messages.isConversationId(null), false);
  assert.equal(messages.isConversationId(undefined), false);
  assert.equal(messages.isConversationId('conv alpha'), false);
  assert.equal(messages.isConversationId('a'.repeat(129)), false);
  assert.equal(messages.isConversationId('../../etc/passwd'), false);
});

test('Task 5 (messaging): a disabled module and a missing conversation are different failures', () => {
  const disabled = new messages.MessagesApiError(403, 'MODULE_DISABLED', 'Messaging module is disabled by administrator.');
  assert.equal(disabled.moduleDisabled, true);
  assert.equal(disabled.notFound, false);
  assert.equal(messages.toMessagesError(disabled), disabled);

  const missing = new messages.MessagesApiError(404, 'NOT_FOUND', 'Conversation not found.');
  assert.equal(missing.notFound, true);
  assert.equal(missing.moduleDisabled, false);

  // A 403 that is not the module switch is not treated as one.
  assert.equal(new messages.MessagesApiError(403, 'FORBIDDEN', 'nope').moduleDisabled, false);

  const wrapped = messages.toMessagesError(new Error('offline'));
  assert.equal(wrapped.name, 'MessagesApiError');
  assert.ok(wrapped.message.length > 0);
});

test('Task 5 (messaging): time labels stay readable and never invent a date', () => {
  const now = Date.parse('2026-10-29T12:00:00.000Z');
  const today = Date.parse('2026-10-29T09:30:00.000Z');
  const yesterday = Date.parse('2026-10-28T10:00:00.000Z');
  const older = Date.parse('2026-10-20T08:00:00.000Z');

  assert.equal(messages.isSameDay(today, now), true);
  assert.equal(messages.isSameDay(yesterday, now), false);
  assert.match(messages.formatListTime(today, now), /\d/);
  assert.match(messages.formatDayLabel(today, now), /Today/i);
  assert.match(messages.formatDayLabel(yesterday, now), /Yesterday/i);
  assert.match(messages.formatDayLabel(older, now), /Oct/);
  assert.equal(messages.formatDayLabel(0, now), '');
  assert.equal(messages.toIsoTime(0), undefined);
  assert.match(String(messages.toIsoTime(today)), /^2026-10-29T09:30:00/);
  assert.ok(messages.MESSAGE_MAX_LENGTH >= 1_000);
});

test('Task 5 (messaging): the page uses the documented endpoints and read-cursor fields', () => {
  const lib = readSource('lib/messages.ts');
  assert.match(lib, /'\/messages\/conversations'/);
  assert.match(lib, /`\/messages\/conversations\/\$\{encodeURIComponent\(conversationId\)\}\/messages`/);
  assert.match(lib, /`\/messages\/conversations\/\$\{encodeURIComponent\(conversationId\)\}\/read`/);
  assert.match(lib, /'\/messages\/send', \{ conversationId, text \}/);
  assert.match(lib, /lastReadMessageId: message\.id,\s*\n\s*lastReadAt: message\.timestamp,/);

  // The page never shows an empty inbox when messaging is off, and never claims a
  // message was sent before the server acknowledged it.
  const page = readSource('pages/dashboard/messages.tsx');
  assert.match(page, /Messages are turned off/);
  assert.match(page, /This conversation isn’t available/);
  assert.match(page, /The link does not contain a valid conversation id/);
  const thread = readSource('components/messages/conversation-thread.tsx');
  assert.match(thread, /onSuccess: async \(\) => \{\s*\n\s*onDraftChange\(''\)/);
  assert.match(thread, /Your message was not sent\./);
  assert.doesNotMatch(thread, /optimistic/i);
});
