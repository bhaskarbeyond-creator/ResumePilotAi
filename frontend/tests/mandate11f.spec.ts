/**
 * Mandate 11F — automated browser verification.
 *
 * Five surfaces, exercised through the real components against fixtures that
 * mirror the server contracts in `src/lib`:
 *
 *   1. AI Interview Coach (practice / mock / CBT / live) and the voice engine
 *   2. ATS diagnostics on stored resume data
 *   3. AI career writing (bullet / summary / skills)
 *   4. Notifications: feed, optimistic mutations, coalesced poller, backoff, Retry-After
 *   5. Recruiter messaging: list, deep link, send, read cursor, MODULE_DISABLED
 *
 * Every request is answered by a fixture declared in this file, so the tests run
 * without a database, an AI provider or another developer's data. Nothing is
 * skipped silently: a missing browser fails the run.
 */
import { test, expect, type Page, type Route } from '@playwright/test';

/* ─────────────────────────────── session ─────────────────────────────── */

const ME = {
  uid: 'cand_11f',
  email: 'priya.sharma@example.test',
  displayName: 'Priya Sharma',
  role: 'USER',
};

function encodeBase64Url(json: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(json), 'utf8').toString('base64url');
}

/** Same shape `/api/auth/preview-login` issues: rptest.<payload>.<64 hex>. */
function buildTestToken(identity: { uid: string; email: string; role: string }): string {
  const payload = encodeBase64Url({
    uid: identity.uid,
    email: identity.email,
    role: identity.role,
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  return `rptest.${payload}.${'a'.repeat(64)}`;
}

async function signIn(page: Page, identity = ME): Promise<void> {
  const token = buildTestToken(identity);
  await page.addInitScript(
    ({ record }) => {
      window.localStorage.setItem('ime_dev_user', JSON.stringify(record));
      window.localStorage.setItem('token', record.token);
    },
    {
      record: {
        uid: identity.uid,
        email: identity.email,
        displayName: identity.displayName,
        role: identity.role,
        token,
      },
    },
  );
}

/* ─────────────────────────────── fixtures ─────────────────────────────── */

type ApiCall = { method: string; path: string; body: unknown };
type Json = Record<string, unknown>;

function fulfilJson(route: Route, status: number, body: Json, headers: Record<string, string> = {}) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    headers: { 'Cache-Control': 'no-store', ...headers },
    body: JSON.stringify(body),
  });
}

async function installShell(page: Page, calls: ApiCall[] = []): Promise<ApiCall[]> {
  await page.route('**/api/users-data/profile', (route) =>
    fulfilJson(route, 200, {
      uid: ME.uid,
      email: ME.email,
      displayName: ME.displayName,
      role: ME.role,
      emailVerified: true,
    }),
  );
  await page.route('**/api/ai-usage**', (route) =>
    fulfilJson(route, 200, { used: 0, limit: 20, remaining: 20, plan: 'free' }),
  );
  // Registered first: any later, more specific notifications route wins (Playwright
  // resolves routes last-registered-first).
  await page.route('**/api/notifications**', (route) =>
    fulfilJson(route, 200, { success: true, notifications: [] }),
  );
  await page.route('**/api/notifications-data**', (route) => {
    const request = route.request();
    calls.push({
      method: request.method(),
      path: new URL(request.url()).pathname,
      body: request.postDataJSON?.() ?? null,
    });
    if (request.method() === 'GET') return fulfilJson(route, 200, { success: true, notifications: [] });
    return fulfilJson(route, 200, { success: true, updated: 0 });
  });
  return calls;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 1. AI Interview Coach and Live Voice Studio
 * ═══════════════════════════════════════════════════════════════════════════ */

const LIVE_QUESTION = 'Tell me about a time you had to defend an analysis that was challenged.';

const LIVE_SESSION = {
  sessionId: 'live_session_11f_0001',
  revision: 1,
  status: 'active',
  configuration: {
    role: 'Data Analyst',
    interviewType: 'behavioral',
    experienceLevel: 'mid',
    difficulty: 'medium',
    durationMinutes: 15,
  },
  interviewer: {
    turnId: 'turn_0001',
    question: LIVE_QUESTION,
    message: 'Thanks for joining. Let us start with a behavioural question.',
    tip: 'Focus on what you actually did.',
    talkingPoints: ['Setting the context', 'The action you took'],
    starters: ['At my last role,'],
    modelAnswer: '',
    responseType: 'question',
  },
  progress: { completedTurns: 0, targetTurns: 4, percent: 0, interviewComplete: false },
  latestEvaluation: null,
  transcript: [],
  report: null,
};

const AI_QUESTIONS = [
  { question: 'Which statement best describes a reproducible analysis?', options: ['Run it once', 'Documented inputs and steps', 'A pretty chart', 'A verbal estimate'], correctAnswer: 1, explanation: 'Reproducibility requires documented inputs.' },
  { question: 'What is the first step when a stakeholder challenges a metric?', options: ['Defend the number', 'Reproduce the metric', 'Delete the dashboard', 'Change the definition'], correctAnswer: 1, explanation: 'Reproduce before defending.' },
  { question: 'Which is a leading indicator?', options: ['Revenue last quarter', 'Weekly active analysts', 'Annual churn', 'Last year budget'], correctAnswer: 1, explanation: 'Leading indicators move first.' },
  { question: 'A p-value of 0.04 means…', options: ['The result is important', 'Evidence against the null at 5%', 'The data is clean', 'The sample is random'], correctAnswer: 1, explanation: 'It is a threshold statement.' },
  { question: 'Which query clause filters groups?', options: ['WHERE', 'HAVING', 'ORDER BY', 'LIMIT'], correctAnswer: 1, explanation: 'HAVING filters aggregated groups.' },
];

async function installInterviewApi(page: Page, calls: ApiCall[]): Promise<void> {
  await page.route('**/api/live-interview/guide', (route) => {
    const body = (route.request().postDataJSON?.() ?? {}) as Json;
    calls.push({ method: 'POST', path: '/api/live-interview/guide', body });
    return fulfilJson(route, 200, {
      goal: 'Show how you handle a challenged analysis.',
      modelAnswer: 'I reproduced the metric, then walked the stakeholder through the inputs.',
      tip: 'Name the evidence you used.',
    });
  });
  await page.route('**/api/live-interview/sessions', (route) => {
    const body = (route.request().postDataJSON?.() ?? {}) as Json;
    calls.push({ method: 'POST', path: '/api/live-interview/sessions', body });
    return fulfilJson(route, 201, { session: LIVE_SESSION });
  });
  await page.route('**/api/live-interview/sessions/*/turns', async (route) => {
    const body = (route.request().postDataJSON?.() ?? {}) as Json;
    calls.push({ method: 'POST', path: '/api/live-interview/sessions/turns', body });
    await new Promise((resolve) => setTimeout(resolve, 40));
    return fulfilJson(route, 200, {
      session: {
        ...LIVE_SESSION,
        revision: 2,
        interviewer: {
          ...LIVE_SESSION.interviewer,
          turnId: 'turn_0002',
          question: 'What did you do when the numbers did not match?',
          message: 'Understood, thank you.',
        },
        progress: { completedTurns: 1, targetTurns: 4, percent: 25, interviewComplete: false },
        transcript: [
          { turnId: 'turn_0001', question: LIVE_QUESTION, answer: 'I reproduced the metric first.', evaluation: null },
        ],
      },
    });
  });
  await page.route('**/api/generate-interview', (route) => {
    const body = (route.request().postDataJSON?.() ?? {}) as Json;
    calls.push({ method: 'POST', path: '/api/generate-interview', body });
    return fulfilJson(route, 200, { title: 'Data Analyst - Behavioral Assessment', questions: AI_QUESTIONS });
  });
}

test.describe('Task 1 — AI Interview Coach and live voice studio', () => {
  test('renders all four modes, switches between them, and starts a real practice session', async ({ page }) => {
    const calls: ApiCall[] = [];
    await signIn(page);
    await installShell(page, calls);
    await installInterviewApi(page, calls);

    await page.goto('/dashboard/interviews');
    await expect(page.getByRole('heading', { name: 'AI Interview Coach', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Choose a mode' })).toBeVisible();

    // Four distinct modes, each named and reachable.
    for (const label of ['Practice', 'Mock interview', 'CBT examination', 'Live AI interview']) {
      await expect(page.getByRole('button', { name: new RegExp(`^${label}`) }).first()).toBeVisible();
    }

    // Practice: the configuration is mode-specific and no network call is needed.
    await page.getByRole('button', { name: /^Practice/ }).first().click();
    await expect(page.getByRole('heading', { name: 'Practice', level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start practice' })).toBeVisible();
    expect(calls.some((call) => call.path.startsWith('/api/live-interview'))).toBe(false);

    // Back to the mode list, then the exam mode.
    await page.getByRole('button', { name: 'All modes' }).click();
    await expect(page.getByRole('heading', { name: 'Choose a mode' })).toBeVisible();
    await page.getByRole('button', { name: /^CBT examination/ }).first().click();
    await expect(page.getByRole('heading', { name: 'CBT examination', level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start exam with built-in questions' })).toBeVisible();

    // Practice for real: a topic is required, then the labelled built-in set runs.
    await page.getByRole('button', { name: 'All modes' }).click();
    await page.getByRole('button', { name: /^Practice/ }).first().click();
    await page.getByRole('button', { name: /^Behavioral/ }).click();
    await page.getByRole('button', { name: 'Start practice' }).click();
    await expect(page.getByRole('heading', { name: 'Practice: Behavioral' })).toBeVisible();
    await expect(page.getByText(/Built-in question set · Question 1 of 5/)).toBeVisible();

    // Starting without a topic is refused with an explained error, not a dead button.
    await page.reload();
    await page.getByRole('button', { name: /^Practice/ }).first().click();
    await page.getByRole('button', { name: 'Start practice' }).click();
    await expect(page.getByText('Choose an interview topic.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Practice: Behavioral' })).toHaveCount(0);
  });

  test('practice guidance calls the supported endpoint, keeps the answer on failure, and never fabricates a critique', async ({ page }) => {
    const calls: ApiCall[] = [];
    await signIn(page);
    await installShell(page, calls);
    await installInterviewApi(page, calls);

    await page.goto('/dashboard/interviews');
    await page.getByRole('button', { name: /^Practice/ }).first().click();
    await page.getByRole('button', { name: /^Behavioral/ }).click();
    await page.getByRole('button', { name: 'Start practice' }).click();

    const answer = page.getByLabel('Your answer');
    await answer.fill('During a sprint I reorganised the backlog with the team.');

    await page.getByRole('button', { name: 'Get answer guidance' }).click();
    await expect(page.getByText('What they want to learn:')).toBeVisible();
    const guide = calls.find((call) => call.path === '/api/live-interview/guide');
    expect(guide, 'practice guidance must call POST /api/live-interview/guide').toBeTruthy();
    expect(String((guide?.body as Json)?.question)).toContain('difficult team member');

    // A provider failure is reported as unavailable; the answer is untouched and no
    // invented guidance replaces the real one.
    await page.route('**/api/live-interview/guide', (route) =>
      fulfilJson(route, 502, {
        aiUnavailable: true,
        error: { code: 'AI_OUTPUT_REJECTED', message: 'AI answer guidance is unavailable right now. Please try again.' },
      }),
    );
    await page.getByRole('button', { name: 'Regenerate guidance' }).click();
    await expect(page.getByRole('alert').filter({ hasText: /unavailable/i })).toBeVisible();
    await expect(answer).toHaveValue('During a sprint I reorganised the backlog with the team.');
    await expect(page.getByText('What they want to learn:')).toHaveCount(0);
  });

  test('timed mock interview keeps real time, pauses, resumes and shows no hints', async ({ page }) => {
    const calls: ApiCall[] = [];
    await signIn(page);
    await installShell(page, calls);
    await installInterviewApi(page, calls);

    await page.goto('/dashboard/interviews');
    await page.getByRole('button', { name: /^Mock interview/ }).first().click();
    await page.getByRole('button', { name: /^Behavioral/ }).click();
    await page.getByRole('button', { name: 'Start mock interview' }).click();

    const timer = page.getByRole('timer', { name: 'Time remaining' });
    await expect(timer).toBeVisible();
    await expect(timer).toHaveText('15:00');

    // Hints are switched off in a timed mock session.
    await expect(page.getByText('Hints are off in mock interviews.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'AI answer guidance' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Get answer guidance' })).toHaveCount(0);

    // The countdown follows the wall clock.
    await expect(timer).not.toHaveText('15:00', { timeout: 5_000 });

    // Pause freezes it, resume unfreezes it.
    await page.getByRole('button', { name: 'Pause' }).click();
    await expect(page.getByRole('heading', { name: 'Session paused' })).toBeVisible();
    const frozen = (await timer.textContent()) ?? '';
    await page.waitForTimeout(1_600);
    await expect(timer).toHaveText(frozen);
    await page.getByRole('button', { name: 'Resume', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Session paused' })).toHaveCount(0);
    await expect(timer).not.toHaveText(frozen, { timeout: 5_000 });

    // Finishing produces a factual summary, not an AI grade.
    await page.getByRole('button', { name: 'Finish session' }).first().click();
    await expect(page.getByRole('heading', { name: 'Session summary' })).toBeVisible();
    await expect(page.getByText('Mock interview · Behavioral')).toBeVisible();
    await expect(page.getByText(/Practice and mock sessions are not scored/)).toBeVisible();
  });

  test('CBT exam uses the built-in bank offline and the AI contract when a role is given', async ({ page }) => {
    const calls: ApiCall[] = [];
    await signIn(page);
    await installShell(page, calls);
    await installInterviewApi(page, calls);

    await page.goto('/dashboard/interviews');
    await page.getByRole('button', { name: /^CBT examination/ }).first().click();
    await page.getByRole('button', { name: /^Behavioral/ }).click();

    // No target role: the labelled built-in set, and no AI call is made.
    await page.getByRole('button', { name: 'Start exam with built-in questions' }).click();
    await expect(page.getByRole('heading', { name: 'CBT examination: Behavioral' })).toBeVisible();
    await expect(page.getByText(/Built-in question set · 0\/5 answered/)).toBeVisible();
    await expect(page.getByText('Which interview technique structures responses around Situation, Task, Action, and Result?')).toBeVisible();
    expect(calls.some((call) => call.path === '/api/generate-interview')).toBe(false);

    // Answer the first question, then submit through the confirmation dialog.
    const options = page.getByRole('group', { name: 'Which interview technique structures responses around Situation, Task, Action, and Result?' });
    await options.getByRole('button').nth(1).click();
    await expect(page.getByText(/Built-in question set · 1\/5 answered/)).toBeVisible();
    await page.getByRole('button', { name: 'Submit exam' }).first().click();
    await expect(page.getByRole('heading', { name: 'Submit your exam?' })).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Submit exam' }).click();

    await expect(page.getByRole('heading', { name: 'Exam results' })).toBeVisible();
    await expect(page.getByText('Built-in Behavioral question set')).toBeVisible();

    // With a target role the questions come from the AI contract, not the bank.
    await page.getByRole('button', { name: 'New session' }).click();
    await page.getByRole('button', { name: /^CBT examination/ }).first().click();
    await page.getByLabel(/Target role/).fill('Data Analyst');
    await page.getByRole('button', { name: /^Behavioral/ }).click();
    await expect(page.getByText(/Without a target role the exam uses the built-in/)).toHaveCount(0);
    await page.getByRole('button', { name: 'Generate exam' }).click();

    await expect(page.getByRole('heading', { name: 'CBT examination: Behavioral' })).toBeVisible();
    await expect(page.getByText(/AI-generated/)).toBeVisible();
    const generated = calls.find((call) => call.path === '/api/generate-interview');
    expect(generated, 'a CBT exam with a role must call POST /api/generate-interview').toBeTruthy();
    expect(generated?.body).toMatchObject({ occupation: 'Data Analyst', interviewType: 'behavioral' });
    await expect(page.getByText('Which statement best describes a reproducible analysis?')).toBeVisible();
  });

  test('live interview: text-only fallback when the speech APIs are missing, with a working text box', async ({ page }) => {
    const calls: ApiCall[] = [];
    await signIn(page);
    // No speech recognition and no synthesis: the honest degraded state.
    await page.addInitScript(() => {
      Object.defineProperty(window, 'SpeechRecognition', { value: undefined, configurable: true });
      Object.defineProperty(window, 'webkitSpeechRecognition', { value: undefined, configurable: true });
      Object.defineProperty(window, 'speechSynthesis', { value: undefined, configurable: true });
    });
    await installShell(page, calls);
    await installInterviewApi(page, calls);

    await page.goto('/dashboard/interviews');
    await page.getByRole('button', { name: /^Live AI interview/ }).first().click();
    await page.getByLabel(/Target role/).fill('Data Analyst');
    await page.getByRole('button', { name: /^Behavioral/ }).click();
    await page.getByRole('button', { name: 'Start live interview' }).click();

    await expect(page.getByRole('heading', { name: 'Live AI interview', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: LIVE_QUESTION })).toBeVisible();
    // No dictation and no playback controls, but a truthful explanation instead.
    await expect(page.getByRole('button', { name: 'Voice answer' })).toHaveCount(0);
    await expect(page.getByText(/does not support speech recognition/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Listen to question' })).toHaveCount(0);

    // The text path still completes a real turn.
    await page.getByLabel('Your answer').fill('I reproduced the metric and walked the stakeholder through the inputs.');
    await page.getByRole('button', { name: 'Send answer' }).click();
    await expect(page.getByRole('heading', { name: 'What did you do when the numbers did not match?' })).toBeVisible();
    await expect(page.getByLabel('Your answer')).toHaveValue('');

    const turn = calls.filter((call) => call.path === '/api/live-interview/sessions/turns').pop();
    expect(turn?.body).toMatchObject({
      expectedRevision: 1,
      turnId: 'turn_0001',
      answer: 'I reproduced the metric and walked the stakeholder through the inputs.',
    });
    expect(String((turn?.body as Json)?.idempotencyKey ?? '')).toHaveLength(36);
  });

  test('live interview: microphone denial is surfaced and the text path keeps working', async ({ page }) => {
    const calls: ApiCall[] = [];
    await signIn(page);
    await page.addInitScript(() => {
      // A recognition implementation that fails the way a denied permission does.
      class DeniedRecognition {
        lang = 'en-US';
        continuous = true;
        interimResults = true;
        onstart: null | (() => void) = null;
        onend: null | (() => void) = null;
        onresult: null | ((event: unknown) => void) = null;
        onerror: null | ((event: { error: string }) => void) = null;
        start() {
          window.setTimeout(() => this.onerror?.({ error: 'not-allowed' }), 0);
        }
        stop() { /* no-op */ }
        abort() { /* no-op */ }
      }
      Object.defineProperty(window, 'webkitSpeechRecognition', { value: DeniedRecognition, configurable: true });
      Object.defineProperty(window, 'SpeechRecognition', { value: DeniedRecognition, configurable: true });
      // And a microphone the browser refuses to open.
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: { getUserMedia: () => Promise.reject(new DOMException('denied', 'NotAllowedError')) },
      });
    });
    await installShell(page, calls);
    await installInterviewApi(page, calls);

    await page.goto('/dashboard/interviews');
    await page.getByRole('button', { name: /^Live AI interview/ }).first().click();
    await page.getByLabel(/Target role/).fill('Data Analyst');
    await page.getByRole('button', { name: /^Behavioral/ }).click();
    await page.getByRole('button', { name: 'Start live interview' }).click();

    await page.getByRole('button', { name: 'Voice answer' }).click();
    await expect(page.getByText(/microphone permission was denied|no microphone/i).first()).toBeVisible();

    // Dictation failed, but the interview is still usable.
    await page.getByLabel('Your answer').fill('Typed instead of dictated.');
    await expect(page.getByRole('button', { name: 'Send answer' })).toBeEnabled();
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 2. ATS diagnostics
 * ═══════════════════════════════════════════════════════════════════════════ */

const STRONG_RESUME = {
  id: 'res_strong',
  title: 'Data Analyst — strong',
  template: 'Cv1',
  updated_at: '2026-10-01T10:00:00.000Z',
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
      startDate: '2022-01',
      endDate: '2026-09',
      description: 'Built a churn model that reduced monthly attrition by 18%.\nAutomated a reporting pipeline that saved 12 engineering hours each week.\nLed a pricing analysis that increased gross margin by 4.5%.',
    },
    {
      jobTitle: 'Data Analyst',
      employer: 'Lumen Logistics',
      startDate: '2019-06',
      endDate: '2021-12',
      description: 'Reduced late deliveries by 23% with a route-optimisation dashboard.\nMigrated 40 legacy reports to a governed warehouse.',
    },
  ],
  educations: [{ school: 'Andhra University', degree: 'B.Tech', field: 'Information Technology', startDate: '2015', endDate: '2019', grade: '8.6 CGPA' }],
};

const WEAK_RESUME = {
  id: 'res_weak',
  title: 'Data Analyst — draft',
  template: 'Cv1',
  updated_at: '2026-09-01T10:00:00.000Z',
  firstname: 'Priya',
  lastname: 'Sharma',
  email: 'priya.sharma@example.test',
  phone: '',
  city: '',
  country: '',
  summary: '',
  skills: [{ name: 'SQL' }],
  employments: [{ jobTitle: '', employer: '', description: 'Helped with reports.' }],
  educations: [],
};

const EMPTY_RESUME = { id: 'res_empty', title: 'Untitled resume', template: 'Cv1', updated_at: null };

async function installResumeApi(page: Page, calls: ApiCall[]): Promise<void> {
  await page.route('**/api/resumes/*', (route) => {
    const url = new URL(route.request().url());
    const id = decodeURIComponent(url.pathname.split('/').pop() ?? '');
    calls.push({ method: route.request().method(), path: `/api/resumes/${id}`, body: null });
    if (route.request().method() !== 'GET') return fulfilJson(route, 405, { success: false, error: 'read-only fixture' });
    if (id === STRONG_RESUME.id) return fulfilJson(route, 200, { success: true, resume: STRONG_RESUME });
    if (id === WEAK_RESUME.id) return fulfilJson(route, 200, { success: true, resume: WEAK_RESUME });
    if (id === EMPTY_RESUME.id) return fulfilJson(route, 200, { success: true, resume: EMPTY_RESUME });
    if (id === 'res_broken') return fulfilJson(route, 500, { success: false, error: 'Failed to fetch resume' });
    return fulfilJson(route, 404, { success: false, error: 'Resume not found' });
  });
  await page.route('**/api/resumes', (route) => {
    calls.push({ method: 'GET', path: '/api/resumes', body: null });
    return fulfilJson(route, 200, {
      success: true,
      resumes: [
        ...[STRONG_RESUME, WEAK_RESUME, EMPTY_RESUME].map(({ id, title, template, updated_at }) => ({ id, title, template, updated_at })),
        { id: 'res_broken', title: 'Broken resume', template: 'Cv1', updated_at: '2026-08-01T10:00:00.000Z' },
      ],
    });
  });
}

/** The rendered score is exposed as an accessible label: read it, never guess. */
async function readTotalScore(page: Page): Promise<number> {
  const label = await page.getByTestId('ats-total-score').getAttribute('aria-label');
  const match = /score: (\d+) out of 100/.exec(label ?? '');
  expect(match, `the score label must state the score, got: ${label}`).toBeTruthy();
  return Number(match?.[1]);
}

test.describe('Task 2 — ATS resume diagnostics', () => {
  test('scores the resume named by ?resume and shows its real section breakdown', async ({ page }) => {
    const calls: ApiCall[] = [];
    await signIn(page);
    await installShell(page, calls);
    await installResumeApi(page, calls);

    await page.goto('/dashboard/ats-score?resume=res_strong');
    await expect(page.getByRole('heading', { name: 'ATS Score', level: 1 })).toBeVisible();
    await expect(page.getByLabel('Resume to check')).toHaveValue('res_strong');

    await page.getByRole('button', { name: 'Check resume' }).click();
    await expect(page.getByTestId('ats-total-score')).toBeVisible();

    // The breakdown is real content, not a placeholder.
    await expect(page.getByRole('heading', { name: 'Results for “Data Analyst — strong”' })).toBeVisible();
    const sections = page.getByRole('list', { name: 'Section scores' });
    for (const section of ['Contact', 'Summary', 'Experience', 'Education', 'Skills']) {
      await expect(sections.getByText(section, { exact: true })).toBeVisible();
    }
    await expect(page.getByText('Full name is present.').first()).toBeVisible();
    await expect(page.getByText('2 complete roles (title + employer).').first()).toBeVisible();

    // The overall score is the rounded sum of the sections (documented aggregation).
    const shown = await readTotalScore(page);
    const sectionScores = await sections.locator('span.tabular-nums').allTextContents();
    const sum = sectionScores.reduce((total, text) => total + Number(text.split('/')[0].trim()), 0);
    // Seven weighted sections, whose scores add up to the headline number.
    expect(sectionScores.length).toBe(7);
    expect(shown).toBe(Math.min(100, Math.round(sum)));

    // The `resume` parameter selected the requested record, not the newest one.
    expect(calls.some((call) => call.path === '/api/resumes/res_strong')).toBe(true);
    expect(calls.some((call) => call.path === '/api/resumes/res_weak')).toBe(false);
  });

  test('recommendations follow the issues actually detected, and a stronger resume scores higher', async ({ page }) => {
    const calls: ApiCall[] = [];
    await signIn(page);
    await installShell(page, calls);
    await installResumeApi(page, calls);

    await page.goto('/dashboard/ats-score?resume=res_weak');
    await page.getByRole('button', { name: 'Check resume' }).click();
    await expect(page.getByTestId('ats-total-score')).toBeVisible();

    await expect(page.getByText('Add a phone number with at least 7 digits.').first()).toBeVisible();
    await expect(page.getByText('No professional summary yet.').first()).toBeVisible();
    await expect(page.getByText(/Add measurable results/).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Most useful next steps' })).toBeVisible();
    const weak = await readTotalScore(page);

    // Same page, stronger resume: a materially higher score from its real content.
    await page.getByLabel('Resume to check').selectOption('res_strong');
    await page.getByRole('button', { name: 'Check again' }).click();
    await expect(page.getByRole('heading', { name: 'Results for “Data Analyst — strong”' })).toBeVisible();
    const strong = await readTotalScore(page);
    expect(strong).toBeGreaterThan(weak + 20);
    expect(strong).toBeGreaterThanOrEqual(80);
  });

  test('an empty resume says so instead of inventing content, and unusable links are explained', async ({ page }) => {
    const calls: ApiCall[] = [];
    await signIn(page);
    await installShell(page, calls);
    await installResumeApi(page, calls);

    await page.goto('/dashboard/ats-score?resume=res_empty');
    await page.getByRole('button', { name: 'Check resume' }).click();
    await expect(page.getByText(/This resume has no content yet/)).toBeVisible();
    await expect(page.getByTestId('ats-total-score')).toBeVisible();

    // A resume that is not in this account: explained, and the closest one is shown.
    await page.goto('/dashboard/ats-score?resume=res_unknown');
    await expect(page.getByText(/The requested resume is not in your account/)).toBeVisible();
    await expect(page.getByLabel('Resume to check')).toHaveValue('res_strong');

    // A listed resume that fails to load is an error, never a silent score.
    await page.getByLabel('Resume to check').selectOption('res_broken');
    await expect(page.getByText(/This resume could not be loaded/)).toBeVisible();
    await expect(page.getByTestId('ats-total-score')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  });

  test('an invalid resume identifier is rejected and the URL is corrected to the resume on screen', async ({ page }) => {
    const calls: ApiCall[] = [];
    await signIn(page);
    await installShell(page, calls);
    await installResumeApi(page, calls);

    await page.goto('/dashboard/ats-score?resume=not%20a%20resume%20id');
    await expect(page.getByLabel('Resume to check')).toHaveValue('res_strong');
    await expect(page.getByRole('heading', { name: 'ATS Score', level: 1 })).toBeVisible();
    // The bogus id is corrected in the address bar, and never requested.
    await expect.poll(() => new URL(page.url()).searchParams.get('resume')).toBe('res_strong');
    expect(calls.some((call) => decodeURIComponent(call.path).includes('not a resume id'))).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 3. AI career writing
 * ═══════════════════════════════════════════════════════════════════════════ */

async function installContentApi(
  page: Page,
  calls: ApiCall[],
  responder?: (body: Json) => { status: number; body: Json },
): Promise<void> {
  await page.route('**/api/generate-content', (route) => {
    const body = (route.request().postDataJSON?.() ?? {}) as Json;
    calls.push({ method: 'POST', path: '/api/generate-content', body });
    if (responder) {
      const reply = responder(body);
      return fulfilJson(route, reply.status, reply.body);
    }
    if (body.operation === 'enhance-single-bullet') {
      return fulfilJson(route, 200, { enhancedBullet: 'Reduced onboarding time by 30% by rewriting the setup guide.' });
    }
    if (body.operation === 'generate-summary') {
      return fulfilJson(route, 200, { summary: 'Data analyst with five years of experience in SQL and dashboarding.' });
    }
    return fulfilJson(route, 200, {
      skills: [
        { name: 'dbt', basis: 'used in your notes' },
        { name: 'Looker', basis: 'common in the target role' },
      ],
    });
  });
}

const SUMMARY_TEXT = 'Data analyst with five years of experience in SQL and dashboarding.';

test.describe('Task 3 — AI career writing studio', () => {
  test('every tool is selectable, ?tool= wins, and the request uses the supported operation', async ({ page }) => {
    const calls: ApiCall[] = [];
    await signIn(page);
    await installShell(page, calls);
    await installContentApi(page, calls);

    await page.goto('/dashboard/ai?tool=skills');
    await expect(page.getByRole('radio', { name: /Skill suggestions/ })).toBeChecked();

    await page.getByRole('textbox', { name: 'Target role' }).fill('Data Analyst');
    await page.getByRole('button', { name: 'Generate' }).click();

    const skillsRequest = calls.find((call) => call.path === '/api/generate-content');
    expect(skillsRequest?.body).toMatchObject({ operation: 'generate-skills' });
    await expect(page.getByRole('list', { name: 'Suggested skills' })).toBeVisible();
    await expect(page.getByText('Suggestions are checked against them.')).toBeVisible();

    // Switching tools keeps the URL and the form in step, with no reload.
    await page.getByText('Improve a resume bullet', { exact: true }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get('tool')).toBe(null);
    await page.getByLabel('Bullet to improve').fill('Worked on reports for the team.');
    await page.getByRole('button', { name: 'Generate' }).click();
    await expect(page.getByTestId('ai-result-text')).toHaveValue(/Reduced onboarding time by 30%/);
    const bullet = calls.filter((call) => call.path === '/api/generate-content').pop();
    expect(bullet?.body).toMatchObject({ operation: 'enhance-single-bullet' });

    // Summaries use their own operation and their own field.
    await page.getByText('Professional summary', { exact: true }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get('tool')).toBe('summary');
    await page.getByLabel(/Your notes or current summary/).fill('Five years of SQL and dashboarding work.');
    await page.getByRole('button', { name: 'Generate' }).click();
    await expect(page.getByTestId('ai-result-text')).toHaveValue(SUMMARY_TEXT);
    const summary = calls.filter((call) => call.path === '/api/generate-content').pop();
    expect(summary?.body).toMatchObject({ operation: 'generate-summary' });
  });

  test('an unknown ?tool= value falls back to the first tool and is removed from the URL', async ({ page }) => {
    const calls: ApiCall[] = [];
    await signIn(page);
    await installShell(page, calls);
    await installContentApi(page, calls);

    await page.goto('/dashboard/ai?tool=linkedin-pitch');
    await expect(page.getByRole('radio', { name: /Improve a resume bullet/ })).toBeChecked();
    await expect.poll(() => new URL(page.url()).searchParams.get('tool')).toBe(null);
  });

  test('results stay editable, copy takes the edited text, and a clipboard failure is reported', async ({ page, context }) => {
    const calls: ApiCall[] = [];
    await signIn(page);
    await installShell(page, calls);
    await installContentApi(page, calls);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    await page.goto('/dashboard/ai?tool=summary');
    await page.getByLabel(/Your notes or current summary/).fill('Five years of SQL and dashboarding work.');
    await page.getByRole('button', { name: 'Generate' }).click();

    const result = page.getByTestId('ai-result-text');
    await expect(result).toHaveValue(SUMMARY_TEXT);

    // The candidate can rewrite the suggestion before using it.
    const edited = 'Five years of SQL and dashboarding, focused on retail analytics.';
    await result.fill(edited);
    await page.getByRole('button', { name: 'Copy' }).click();
    await expect(page.getByText('Copied to the clipboard.')).toBeVisible();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(edited);

    // A blocked clipboard is never reported as success.
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: () => Promise.reject(new Error('denied')) },
      });
    });
    await page.getByRole('button', { name: 'Copy' }).click();
    await expect(page.getByText(/Copy failed/)).toBeVisible();
    await expect(page.getByTestId('ai-result-text')).toHaveValue(edited);
  });

  test('an unavailable provider is reported truthfully and the previous result is preserved', async ({ page }) => {
    const calls: ApiCall[] = [];
    await signIn(page);
    await installShell(page, calls);
    let unavailable = false;
    await installContentApi(page, calls, () =>
      unavailable
        ? { status: 200, body: { aiUnavailable: true, diagnosticCode: 'AI_PROVIDER_UNAVAILABLE', note: 'AI generation is temporarily unavailable' } }
        : { status: 200, body: { summary: SUMMARY_TEXT } },
    );

    await page.goto('/dashboard/ai?tool=summary');
    await page.getByLabel(/Your notes or current summary/).fill('Five years of SQL and dashboarding work.');
    await page.getByRole('button', { name: 'Generate' }).click();
    await expect(page.getByTestId('ai-result-text')).toHaveValue(SUMMARY_TEXT);

    unavailable = true;
    await page.getByRole('button', { name: 'Generate' }).click();
    await expect(page.getByText(/temporarily unavailable/i).first()).toBeVisible();
    // The input and the previous, genuinely generated result are untouched.
    await expect(page.getByLabel(/Your notes or current summary/)).toHaveValue('Five years of SQL and dashboarding work.');
    await expect(page.getByTestId('ai-result-text')).toHaveValue(SUMMARY_TEXT);
    await expect(page.getByText('The result below is your previous one and has not changed.')).toBeVisible();
  });

  test('a provider outage returns a visible, retryable error and never invents text', async ({ page }) => {
    const calls: ApiCall[] = [];
    await signIn(page);
    await installShell(page, calls);
    await installContentApi(page, calls, () => ({
      status: 503,
      body: { error: { code: 'AI_PROVIDER_UNAVAILABLE', message: 'AI generation is temporarily unavailable' } },
    }));

    await page.goto('/dashboard/ai?tool=bullet');
    await page.getByLabel('Bullet to improve').fill('Worked on reports for the team.');
    await page.getByRole('button', { name: 'Generate' }).click();

    await expect(page.getByRole('status').filter({ hasText: /AI generation was unavailable/i })).toBeVisible();
    await expect(page.getByTestId('ai-result-text')).toHaveCount(0);
    await expect(page.getByLabel('Bullet to improve')).toHaveValue('Worked on reports for the team.');
    await expect(page.getByRole('button', { name: 'Generate' })).toBeEnabled();
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 4. Notifications and the coalesced poller
 * ═══════════════════════════════════════════════════════════════════════════ */

type NotificationRowFixture = { id: string; type: string; title: string; message: string; created_at: string; read: boolean };

const NOTIFICATIONS: NotificationRowFixture[] = [
  { id: 'ntf_1', type: 'job_application', title: 'Application received', message: 'Northwind received your application.', created_at: '2026-10-28T09:00:00.000Z', read: false },
  { id: 'ntf_2', type: 'application_interview', title: 'Interview scheduled', message: 'Your interview is on Thursday.', created_at: '2026-10-27T09:00:00.000Z', read: false },
  { id: 'ntf_3', type: 'payment_active', title: 'Plan active', message: 'Your plan is active.', created_at: '2026-10-26T09:00:00.000Z', read: true },
];

type NotificationStore = { rows: NotificationRowFixture[]; patchFailure: boolean; allFailure: boolean; getFailure: number | null };

const freshStore = (): NotificationStore => ({
  rows: NOTIFICATIONS.map((row) => ({ ...row })),
  patchFailure: false,
  allFailure: false,
  getFailure: null,
});

/**
 * Stand-in for the feed endpoint: honours the documented contract, records every
 * request, and measures how many GETs were ever in flight at once.
 */
async function installNotifications(
  page: Page,
  store: NotificationStore,
  calls: ApiCall[],
  latencies = { inFlight: 0, max: 0 },
) {
  await page.route('**/api/notifications-data**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const body = (request.postDataJSON?.() ?? null) as Json | null;
    calls.push({ method: request.method(), path: url.pathname, body });

    if (url.pathname.endsWith('/mark-all-read')) {
      if (store.allFailure) return fulfilJson(route, 500, { success: false, error: 'Failed to mark notifications as read' });
      const unread = store.rows.filter((row) => !row.read);
      unread.forEach((row) => { row.read = true; });
      return fulfilJson(route, 200, { success: true, updated: unread.length });
    }
    if (request.method() === 'PATCH') {
      if (store.patchFailure) return fulfilJson(route, 500, { success: false, error: 'Failed to update notification' });
      const id = decodeURIComponent(url.pathname.split('/').pop() ?? '');
      const row = store.rows.find((item) => item.id === id);
      if (!row) return fulfilJson(route, 404, { success: false, error: 'Notification not found' });
      row.read = Boolean(body?.read);
      return fulfilJson(route, 200, { success: true, notification: { id: row.id, read: row.read } });
    }
    if (request.method() === 'GET') {
      if (store.getFailure) return fulfilJson(route, store.getFailure, { success: false, error: 'Failed to fetch notifications' });
      latencies.inFlight += 1;
      latencies.max = Math.max(latencies.max, latencies.inFlight);
      await new Promise((resolve) => setTimeout(resolve, 30));
      latencies.inFlight -= 1;
      return fulfilJson(route, 200, { success: true, notifications: store.rows.map((row) => ({ ...row })) });
    }
    return fulfilJson(route, 405, { success: false, error: 'read-only fixture' });
  });
  return latencies;
}

const FEED_GET = (calls: ApiCall[]) => calls.filter((call) => call.method === 'GET' && call.path === '/api/notifications-data').length;

test.describe('Task 4 — notification feed, mutations and the coalesced poller', () => {
  test('loads the authenticated feed, filters unread, and persists both mutations', async ({ page }) => {
    const calls: ApiCall[] = [];
    const store = freshStore();
    await signIn(page);
    await installShell(page, calls);
    await installNotifications(page, store, calls);

    await page.goto('/dashboard/notifications');
    const list = page.getByRole('list', { name: 'Notifications' });
    await expect(list.getByRole('listitem')).toHaveCount(3);
    await expect(page.getByText('2 unread')).toBeVisible();

    // ?filter=unread is URL state and survives a reload.
    await page.getByRole('button', { name: /^Unread/ }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get('filter')).toBe('unread');
    await expect(list.getByRole('listitem')).toHaveCount(2);
    await page.reload();
    await expect(page.getByRole('list', { name: 'Notifications' }).getByRole('listitem')).toHaveCount(2);

    // Mark one read: the PATCH is owner-scoped and the row stays visible here.
    const patch = page.waitForRequest((request) => request.method() === 'PATCH' && request.url().endsWith('/api/notifications-data/ntf_1'));
    await page.getByRole('button', { name: 'Mark “Application received” as read' }).click();
    expect((await patch).postDataJSON()).toEqual({ read: true });
    await expect.poll(() => store.rows.find((row) => row.id === 'ntf_1')?.read).toBe(true);
    await expect(page.getByRole('button', { name: 'Mark “Application received” as unread' })).toBeVisible();

    // Mark all read: the server's changed count is reported, not invented.
    await page.getByRole('button', { name: 'Mark all as read' }).click();
    await expect.poll(() => store.rows.every((row) => row.read)).toBe(true);
    await expect(page.getByText('Marked 1 notification as read.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mark all as read' })).toHaveAttribute('aria-disabled', 'true');
  });

  test('an optimistic read rolls back when the server rejects the write', async ({ page }) => {
    const calls: ApiCall[] = [];
    const store = { ...freshStore(), patchFailure: true };
    await signIn(page);
    await installShell(page, calls);
    await installNotifications(page, store, calls);

    await page.goto('/dashboard/notifications');
    await expect(page.getByRole('list', { name: 'Notifications' }).getByRole('listitem')).toHaveCount(3);

    await page.getByRole('button', { name: 'Mark “Application received” as read' }).click();
    await expect(page.getByText(/Couldn’t mark “Application received” as read/)).toBeVisible();
    // The row is unread again: the optimistic change was rolled back.
    await expect(page.getByRole('button', { name: 'Mark “Application received” as read' })).toBeVisible();
    await expect(page.getByText('2 unread')).toBeVisible();
    expect(store.rows.find((row) => row.id === 'ntf_1')?.read).toBe(false);
  });

  test('a failed mark-all-read rolls back every row and explains the failure', async ({ page }) => {
    const calls: ApiCall[] = [];
    const store = { ...freshStore(), allFailure: true };
    await signIn(page);
    await installShell(page, calls);
    await installNotifications(page, store, calls);

    await page.goto('/dashboard/notifications');
    await page.getByRole('button', { name: 'Mark all as read' }).click();
    await expect(page.getByText(/Couldn’t mark all notifications as read/)).toBeVisible();
    await expect(page.getByText('2 unread')).toBeVisible();
    expect(store.rows.filter((row) => !row.read)).toHaveLength(2);
  });

  test('polling is coalesced, backs off, recovers, and stops when the page unmounts', async ({ page }) => {
    const calls: ApiCall[] = [];
    const store = freshStore();
    await signIn(page);
    await installShell(page, calls);
    const latencies = await installNotifications(page, store, calls);
    await page.clock.install();

    // Advancing the fake clock and then letting the fixture's response settle
    // makes each due point deterministic before the next advance.
    const advance = async (ms: number) => {
      await page.clock.runFor(ms);
      await page.waitForTimeout(150);
    };

    await page.goto('/dashboard/notifications');
    await expect(page.getByRole('list', { name: 'Notifications' }).getByRole('listitem')).toHaveCount(3);
    const initial = FEED_GET(calls);
    expect(initial).toBeGreaterThanOrEqual(1);

    // Nothing extra before the 15 s cadence elapses.
    await advance(14_000);
    expect(FEED_GET(calls)).toBe(initial);

    // Exactly one scheduled read per interval.
    await advance(1_500);
    expect(FEED_GET(calls)).toBe(initial + 1);
    await advance(15_500);
    expect(FEED_GET(calls)).toBe(initial + 2);
    expect(latencies.max, 'polled reads must never overlap').toBeLessThanOrEqual(1);

    // Failures walk the documented ladder: 15 s, 30 s, 60 s, then 60 s.
    store.getFailure = 500;
    await advance(15_500);
    expect(FEED_GET(calls), 'the first failed read').toBe(initial + 3);
    await expect(page.getByTestId('notifications-poll-error')).toBeVisible();

    await advance(14_000);
    expect(FEED_GET(calls), 'a failed read must not retry before 15 s').toBe(initial + 3);
    await advance(1_500);
    expect(FEED_GET(calls), 'the second attempt').toBe(initial + 4);

    await advance(29_000);
    expect(FEED_GET(calls), 'the second failure waits 30 s').toBe(initial + 4);
    await advance(1_500);
    expect(FEED_GET(calls), 'the third attempt').toBe(initial + 5);

    await advance(59_000);
    expect(FEED_GET(calls), 'the third failure waits 60 s').toBe(initial + 5);
    await advance(1_500);
    expect(FEED_GET(calls), 'the fourth attempt').toBe(initial + 6);

    // Recovery resets the ladder and clears the warning.
    store.getFailure = null;
    await advance(59_000);
    expect(FEED_GET(calls), 'the fourth failure waits 60 s too').toBe(initial + 6);
    await advance(1_500);
    expect(FEED_GET(calls), 'the recovery read').toBe(initial + 7);
    await expect(page.getByTestId('notifications-poll-error')).toHaveCount(0);
    await advance(15_500);
    expect(FEED_GET(calls), 'a healthy read returns to the 15 s cadence').toBe(initial + 8);

    // Cleanup: nothing polls after the page is gone. The next page may read the
    // feed once as it mounts; what must not happen is a repeating loop.
    const beforeLeave = FEED_GET(calls);
    await page.goto('/dashboard/settings');
    await page.waitForTimeout(1_200);
    const left = FEED_GET(calls);
    expect(left - beforeLeave, 'the page it moves to may read the feed once').toBeLessThanOrEqual(1);
    await page.clock.runFor(120_000);
    await page.waitForTimeout(500);
    expect(FEED_GET(calls), 'the poller must stop with the page').toBe(left);
  });

  test('a 429 Retry-After delay is honoured instead of the backoff ladder', async ({ page }) => {
    const calls: ApiCall[] = [];
    const store = freshStore();
    await signIn(page);
    await installShell(page, calls);
    let throttled = false;
    await page.route('**/api/notifications-data**', (route) => {
      const request = route.request();
      const url = new URL(request.url());
      calls.push({ method: request.method(), path: url.pathname, body: request.postDataJSON?.() ?? null });
      if (request.method() !== 'GET') return fulfilJson(route, 200, { success: true, updated: 0 });
      if (throttled) {
        return route.fulfill({
          status: 429,
          contentType: 'application/json',
          headers: { 'Retry-After': '90' },
          body: JSON.stringify({ success: false, error: 'Too many requests' }),
        });
      }
      return fulfilJson(route, 200, { success: true, notifications: store.rows.map((row) => ({ ...row })) });
    });
    await page.clock.install();

    await page.goto('/dashboard/notifications');
    await expect(page.getByRole('list', { name: 'Notifications' }).getByRole('listitem')).toHaveCount(3);
    const initial = FEED_GET(calls);

    throttled = true;
    await page.clock.runFor(15_500);
    await expect.poll(() => FEED_GET(calls)).toBe(initial + 1);

    // Nothing at 15 s, 30 s or 60 s: the server asked for 90 s.
    await page.clock.runFor(60_000);
    expect(FEED_GET(calls)).toBe(initial + 1);
    await page.clock.runFor(31_000);
    await expect.poll(() => FEED_GET(calls)).toBe(initial + 2);
    await expect(page.getByTestId('notifications-poll-error')).toBeVisible();
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * 5. Recruiter messaging
 * ═══════════════════════════════════════════════════════════════════════════ */

const CONVERSATIONS = [
  {
    id: 'conv_alpha',
    applicationId: 'app_1',
    participants: { [ME.uid]: true, emp_9: true },
    lastMessage: { id: 'msg_1', senderId: 'emp_9', text: 'Are you free on Thursday?', timestamp: 1_760_000_000_000 },
    unreadCount: 1,
  },
  {
    id: 'conv_beta',
    applicationId: 'app_2',
    participants: { [ME.uid]: true, emp_7: true },
    lastMessage: { id: 'msg_9', senderId: ME.uid, text: 'Thanks for the update.', timestamp: 1_759_900_000_000 },
    unreadCount: 0,
  },
];

type ChatRow = { id: string; senderId: string; text: string; timestamp: number };

const THREADS: Record<string, ChatRow[]> = {
  conv_alpha: [
    { id: 'msg_1', senderId: 'emp_9', text: 'Are you free on Thursday?', timestamp: 1_760_000_000_000 },
    { id: 'msg_2', senderId: 'emp_9', text: 'We would like to meet at 3pm.', timestamp: 1_760_000_100_000 },
  ],
  conv_beta: [{ id: 'msg_9', senderId: ME.uid, text: 'Thanks for the update.', timestamp: 1_759_900_000_000 }],
};

async function installMessages(page: Page, calls: ApiCall[], options: { disabled?: boolean } = {}) {
  const store = { threads: JSON.parse(JSON.stringify(THREADS)) as Record<string, ChatRow[]> };
  await page.route('**/api/messages/**', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const body = (request.postDataJSON?.() ?? null) as Json | null;
    calls.push({ method: request.method(), path: url.pathname, body });

    if (options.disabled) {
      return fulfilJson(route, 403, { success: false, code: 'MODULE_DISABLED', error: 'Messaging module is disabled by administrator.' });
    }
    if (url.pathname === '/api/messages/conversations') {
      return fulfilJson(route, 200, { success: true, conversations: CONVERSATIONS, totalUnread: 1 });
    }
    const profileMatch = /\/api\/messages\/conversations\/([^/]+)\/participant-profile$/.exec(url.pathname);
    if (profileMatch) {
      const id = decodeURIComponent(profileMatch[1]);
      const name = id === 'conv_alpha' ? 'Nadia (Northwind)' : 'Ravi (Lumen)';
      return fulfilJson(route, 200, { success: true, profile: { name, avatar: '' } });
    }
    const readMatch = /\/api\/messages\/conversations\/([^/]+)\/read$/.exec(url.pathname);
    if (readMatch && request.method() === 'POST') return fulfilJson(route, 200, { success: true });
    const threadMatch = /\/api\/messages\/conversations\/([^/]+)\/messages$/.exec(url.pathname);
    if (threadMatch) {
      const id = decodeURIComponent(threadMatch[1]);
      if (!store.threads[id]) return fulfilJson(route, 404, { success: false, error: 'Conversation not found.' });
      return fulfilJson(route, 200, { success: true, messages: store.threads[id] });
    }
    if (url.pathname === '/api/messages/send') {
      const conversationId = String(body?.conversationId ?? '');
      const text = String(body?.text ?? '');
      if (!store.threads[conversationId]) return fulfilJson(route, 404, { success: false, error: 'Conversation not found.' });
      const messageId = 'msg_sent_fixture_1';
      store.threads[conversationId] = [...store.threads[conversationId], { id: messageId, senderId: ME.uid, text, timestamp: 1_760_000_200_000 }];
      return fulfilJson(route, 201, { success: true, messageId });
    }
    return fulfilJson(route, 404, { success: false, error: 'Conversation not found.' });
  });
  return store;
}

test.describe('Task 5 — recruiter messaging', () => {
  test('lists conversations, opens one by deep link, advances the read cursor', async ({ page }) => {
    const calls: ApiCall[] = [];
    await signIn(page);
    await installShell(page, calls);
    await installMessages(page, calls);

    await page.goto('/dashboard/messages');
    const conversations = page.getByRole('list', { name: 'Conversations' });
    await expect(conversations.getByRole('button')).toHaveCount(2);
    await expect(conversations.getByText('Nadia (Northwind)')).toBeVisible();

    await page.goto('/dashboard/messages?conversationId=conv_alpha');
    const history = page.getByRole('list', { name: 'Messages with Nadia (Northwind)' });
    await expect(history).toBeVisible();
    await expect(history).toContainText('Are you free on Thursday?');
    await expect(history).toContainText('We would like to meet at 3pm.');

    // Opening the thread advanced this user's read cursor to the newest message.
    await expect
      .poll(() => calls.filter((call) => call.path === '/api/messages/conversations/conv_alpha/read').length)
      .toBeGreaterThanOrEqual(1);
    const read = calls.filter((call) => call.path === '/api/messages/conversations/conv_alpha/read');
    expect(read[0].body).toMatchObject({ lastReadMessageId: 'msg_2' });

    // Selecting another conversation keeps the URL in step; Back returns to the first.
    await page.getByRole('button', { name: /Ravi \(Lumen\)/ }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get('conversationId')).toBe('conv_beta');
    await page.goBack();
    await expect.poll(() => new URL(page.url()).searchParams.get('conversationId')).toBe('conv_alpha');
  });

  test('a sent message appears only after the server acknowledges it', async ({ page }) => {
    const calls: ApiCall[] = [];
    await signIn(page);
    await installShell(page, calls);
    const store = await installMessages(page, calls);

    await page.goto('/dashboard/messages?conversationId=conv_alpha');
    const history = page.getByRole('list', { name: 'Messages with Nadia (Northwind)' });
    await expect(history).toContainText('We would like to meet at 3pm.');

    const text = 'Thursday at 3pm works for me.';
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    await page.route('**/api/messages/send', async (route) => {
      const body = route.request().postDataJSON() as Json;
      await gate;
      const conversationId = String(body.conversationId);
      store.threads[conversationId] = [...store.threads[conversationId], { id: 'msg_sent_fixture_2', senderId: ME.uid, text: String(body.text), timestamp: 1_760_000_200_000 }];
      return fulfilJson(route, 201, { success: true, messageId: 'msg_sent_fixture_2' });
    });

    await page.getByLabel('Message to Nadia (Northwind)').fill(text);
    await page.getByRole('button', { name: 'Send' }).click();

    // Nothing is claimed before the server answers: no bubble, no cleared draft.
    await page.waitForTimeout(300);
    await expect(history).not.toContainText(text);
    await expect(page.getByLabel('Message to Nadia (Northwind)')).toHaveValue(text);

    release();
    await expect.poll(() => history.textContent()).toContain(text);
    await expect(page.getByLabel('Message to Nadia (Northwind)')).toHaveValue('');
  });

  test('a failed send keeps the draft and reports the error', async ({ page }) => {
    const calls: ApiCall[] = [];
    await signIn(page);
    await installShell(page, calls);
    await installMessages(page, calls);
    await page.route('**/api/messages/send', (route) =>
      fulfilJson(route, 503, { success: false, error: 'Messaging service unavailable.' }),
    );

    await page.goto('/dashboard/messages?conversationId=conv_alpha');
    await page.getByLabel('Message to Nadia (Northwind)').fill('Please keep this draft.');
    await page.getByRole('button', { name: 'Send' }).click();

    await expect(page.getByText(/Your message was not sent/)).toBeVisible();
    await expect(page.getByLabel('Message to Nadia (Northwind)')).toHaveValue('Please keep this draft.');
  });

  test('MODULE_DISABLED explains the outage instead of showing an empty inbox', async ({ page }) => {
    const calls: ApiCall[] = [];
    await signIn(page);
    await installShell(page, calls);
    await installMessages(page, calls, { disabled: true });

    await page.goto('/dashboard/messages');
    await expect(page.getByRole('heading', { name: 'Messages are turned off' })).toBeVisible();
    await expect(page.getByText(/turned off messaging/i)).toBeVisible();
    await expect(page.getByRole('list', { name: 'Conversations' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'No conversations yet' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Go to notifications/ })).toBeVisible();
  });

  test('an unknown conversation id shows an unavailable state, not a broken thread', async ({ page }) => {
    const calls: ApiCall[] = [];
    await signIn(page);
    await installShell(page, calls);
    await installMessages(page, calls);

    await page.goto('/dashboard/messages?conversationId=conv_missing');
    await expect(page.getByRole('heading', { name: 'This conversation isn’t available' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Back to conversations' })).toBeVisible();
  });

  test('mobile is single-pane with a back control; desktop shows both panes at 1280px', async ({ page }) => {
    const calls: ApiCall[] = [];
    await signIn(page);
    await installShell(page, calls);
    await installMessages(page, calls);

    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/dashboard/messages?conversationId=conv_alpha');
    await expect(page.getByRole('list', { name: 'Messages with Nadia (Northwind)' })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Conversations' })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);

    await page.getByRole('button', { name: 'Back to conversations' }).click();
    await expect(page.getByRole('list', { name: 'Conversations' })).toBeVisible();

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/dashboard/messages?conversationId=conv_alpha');
    await expect(page.getByRole('list', { name: 'Conversations' })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Messages with Nadia (Northwind)' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  });
});
