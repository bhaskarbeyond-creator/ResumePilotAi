/**
 * AI Interview Coach (/dashboard/interviews) — behavioural coverage at the five
 * directive profiles.
 *
 * "Real stack" tests use the normal dev stack (UI :4000 -> Express :8080 ->
 * MariaDB bridge). The sandbox has no AI provider, so every AI endpoint really
 * answers 503 there, and those tests assert the honest unavailable paths.
 *
 * "Acceptance stack" tests route ONLY the interview AI endpoints to a second
 * backend instance (:8081, same MariaDB and auth configuration) whose provider is
 * the deterministic OpenAI-compatible stub in scripts/dev-ai. They prove the UI
 * -> Express -> service -> MariaDB contract, persistence, reload and isolation
 * with a labelled stub provider; they prove nothing about AI quality. They are
 * skipped with a clear reason when that stack is not running.
 */
import AxeBuilder from '@axe-core/playwright';
import type { Page, Request } from '@playwright/test';
import { expect, expectNoHorizontalOverflow, test, tokenFor } from './fixtures';

const ACCEPTANCE_API = process.env.E2E_ACCEPTANCE_API || 'http://127.0.0.1:8081';
const ACCEPTANCE_STUB = process.env.E2E_ACCEPTANCE_STUB || 'http://127.0.0.1:8790';

async function settleAnimations(page: Page) {
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
    .map((animation) => animation.finished.catch(() => undefined))));
}

/** Dialogs are portaled outside #main-content, so scan them with scope '[role="dialog"]'. */
async function expectNoAxeViolations(page: Page, scope = '#main-content') {
  await settleAnimations(page);
  const results = await new AxeBuilder({ page }).include(scope).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes.slice(0, 5).map((node) => node.target.join(' ')).join(' | ')}`)).toEqual([]);
}

function recordRequests(page: Page, pathname: string) {
  const seen: Request[] = [];
  page.on('request', (request) => { if (new URL(request.url()).pathname === pathname) seen.push(request); });
  return seen;
}

const main = (page: Page) => page.locator('#main-content');

async function openCoach(page: Page) {
  await page.goto('/dashboard/interviews');
  await expect(page.getByRole('heading', { level: 1, name: 'AI Interview Coach' })).toBeVisible();
}

async function chooseMode(page: Page, name: RegExp) {
  await page.getByRole('button', { name }).click();
}

async function pickOption(page: Page, combobox: string, option: string) {
  await page.getByRole('combobox', { name: combobox }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

const examQuestion = (page: Page) => page.locator('#exam-question');
const examOptions = (page: Page) => page.locator('[role="group"][aria-labelledby="exam-question"] button');

test.describe('Interview Coach — real stack', () => {
  test('mode selection is truthful and every mode opens its configuration', async ({ page }) => {
    await openCoach(page);
    const text = await main(page).innerText();
    for (const claim of [/webcam/i, /speech-to-text/i, /avatar/i, /closed captions/i, /instant feedback/i, /session scorecard/i, /1080p/i, /voice synthesi[sz]er/i]) {
      expect(text, `no false claim ${claim}`).not.toMatch(claim);
    }
    for (const [mode, heading] of [[/^Practice/, 'Practice'], [/^Mock interview/, 'Mock interview'], [/^CBT examination/, 'CBT examination'], [/^Live AI interview/, 'Live AI interview']] as const) {
      await chooseMode(page, mode);
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      await page.getByRole('button', { name: 'All modes' }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'AI Interview Coach' })).toBeVisible();
    }
    await expectNoHorizontalOverflow(page);
    await expectNoAxeViolations(page);
  });

  test('practice: free navigation keeps answers and the summary is factual (no score, no old AI calls)', async ({ page }) => {
    const legacyCalls = recordRequests(page, '/api/generate-content');
    await openCoach(page);
    await chooseMode(page, /^Practice/);
    await page.getByRole('button', { name: /^Case Study/ }).click();
    await expect(page.getByRole('button', { name: /^Case Study/ })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('The built-in Case Study set has 5 questions.')).toBeVisible();
    await page.getByRole('combobox', { name: 'Number of questions' }).click();
    await expect(page.getByRole('option')).toHaveText(['3 questions', '5 questions']);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /^Behavioral/ }).click();
    await expectNoAxeViolations(page);
    await page.getByRole('button', { name: 'Start practice' }).click();

    await expect(page.getByText('Built-in question set · Question 1 of 5 · 0 answered · Untimed')).toBeVisible();
    const answer = page.getByLabel('Your answer');
    await answer.fill('I mediated between two teammates by agreeing shared review criteria.');
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByText(/Question 2 of 5/).first()).toBeVisible();
    await expect(answer).toHaveValue('');
    await answer.fill('I took ownership of a delayed release and re-planned it with the team.');
    await page.getByRole('button', { name: 'Previous' }).click();
    await expect(answer).toHaveValue('I mediated between two teammates by agreeing shared review criteria.');
    await expect(page.getByRole('button', { name: 'Question 2, answered' })).toBeVisible();
    await page.getByRole('button', { name: 'Question 5' }).click();
    await expect(page.getByRole('button', { name: 'Question 5' })).toHaveAttribute('aria-current', 'step');
    await expectNoHorizontalOverflow(page);
    await expectNoAxeViolations(page);

    await page.getByRole('button', { name: 'Finish session' }).first().click();
    await expect(page.getByRole('heading', { level: 1, name: 'Session summary' })).toBeFocused();
    await expect(page.getByText('2 of 5')).toBeVisible();
    await expect(page.getByText('Finished by you')).toBeVisible();
    await expect(page.getByText('Practice and mock sessions are not scored.', { exact: false })).toBeVisible();
    await expect(main(page).getByText('I took ownership of a delayed release and re-planned it with the team.')).toBeVisible();
    await expect(main(page).getByText('Not answered')).toHaveCount(3);
    expect(await main(page).innerText()).not.toMatch(/\d+\s*%/);
    await expectNoAxeViolations(page);

    await page.getByRole('button', { name: 'Practise again' }).click();
    await expect(page.getByText('Built-in question set · Question 1 of 5 · 0 answered · Untimed')).toBeVisible();
    await expect(page.getByLabel('Your answer')).toHaveValue('');
    expect(legacyCalls, 'the broken /generate-content interview contract is no longer used').toHaveLength(0);
  });

  test('practice guidance: the real unavailable answer is shown honestly, never invented guidance', async ({ page, guard }) => {
    guard.expectApiStatuses(502, 503);
    const guideCalls = recordRequests(page, '/api/live-interview/guide');
    await openCoach(page);
    await chooseMode(page, /^Practice/);
    await page.getByLabel('Target role (optional)').fill('Data Analyst');
    await page.getByRole('button', { name: /^Behavioral/ }).click();
    await page.getByRole('button', { name: 'Start practice' }).click();
    const question = await page.locator('#practice-question').innerText();
    const response = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/live-interview/guide');
    await page.getByRole('button', { name: 'Get answer guidance' }).click();
    expect((await response).status()).toBe(503);
    expect(guideCalls[0].postDataJSON()).toEqual({ question, role: 'Data Analyst', topic: 'Behavioral', regenerate: false });
    await expect(page.getByRole('alert')).toContainText('AI answer guidance is temporarily unavailable');
    await expect(page.getByRole('alert')).not.toContainText(/session/i);
    await expect(page.getByText('Example answer:')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test('mock: pausing stops the clock and hides the question; a timeout ends with the answers given', async ({ page }) => {
    await page.clock.install();
    await openCoach(page);
    await chooseMode(page, /^Mock interview/);
    await page.getByRole('button', { name: /^Situational/ }).click();
    await pickOption(page, 'Duration', '5 minutes');
    await page.getByRole('button', { name: 'Start mock interview' }).click();
    const timer = page.getByRole('timer', { name: 'Time remaining' });
    await expect(timer).toContainText(/0[45]:\d\d/);
    await page.getByLabel('Your answer').fill('I would roll back first, then investigate with logs.');

    await page.getByRole('button', { name: 'Pause' }).click();
    await expect(page.getByRole('heading', { name: 'Session paused' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Resume interview' })).toBeFocused();
    await expect(page.locator('#practice-question')).toHaveCount(0);
    const frozen = await timer.innerText();
    await page.clock.runFor(30_000);
    await expect(timer).toHaveText(frozen);
    await page.getByRole('button', { name: 'Resume interview' }).click();
    await expect(page.getByRole('button', { name: 'Pause' })).toBeFocused();
    await expect(page.getByLabel('Your answer')).toHaveValue('I would roll back first, then investigate with logs.');

    await page.clock.runFor(5 * 60_000 + 1_000);
    await expect(page.getByRole('heading', { level: 1, name: 'Session summary' })).toBeVisible();
    await expect(page.getByText('Time ran out')).toBeVisible();
    await expect(page.getByText('1 of 5')).toBeVisible();
    await expect(main(page).getByText('I would roll back first, then investigate with logs.')).toBeVisible();
  });

  test('CBT without a role: labelled built-in set, no repeats, scoped shortcuts, confirm dialog, real score', async ({ page }) => {
    await openCoach(page);
    await chooseMode(page, /^CBT examination/);
    await page.getByRole('button', { name: /^General/ }).click();
    await expect(page.getByText('Without a target role the exam uses the built-in General set (3 questions).')).toBeVisible();
    await page.getByRole('button', { name: 'Start exam with built-in questions' }).click();
    await expect(page.getByText(/Built-in question set · 0\/3 answered/)).toBeVisible();
    const exam = page.getByRole('region', { name: 'CBT examination' });
    await expect(exam).toBeFocused();

    const stems: string[] = [];
    for (let i = 0; i < 3; i++) {
      stems.push(await examQuestion(page).innerText());
      await page.keyboard.press('b');
      await expect(examOptions(page).nth(1)).toHaveAttribute('aria-pressed', 'true');
      if (i < 2) await page.keyboard.press('ArrowRight');
    }
    expect(new Set(stems).size, 'every question is distinct').toBe(3);
    await expect(page.getByText(/3\/3 answered/)).toBeVisible();

    // Browser shortcuts pass through untouched; single-key shortcuts only work inside the exam.
    const flag = page.getByRole('button', { name: /Flag/ });
    const notPrevented = await exam.evaluate((element) => element.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true, cancelable: true })));
    expect(notPrevented, 'Ctrl+F is not swallowed').toBe(true);
    await expect(flag).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('f');
    await expect(flag).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('f');
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('c');
    await expect(examOptions(page).nth(2)).toHaveAttribute('aria-pressed', 'false');
    await expectNoHorizontalOverflow(page);
    await expectNoAxeViolations(page);

    const submit = page.getByRole('button', { name: 'Submit exam' }).first();
    await submit.click();
    const dialog = page.getByRole('dialog', { name: 'Submit your exam?' });
    await expect(dialog).toContainText('You answered 3 of 3 questions.');
    await expect(dialog.getByRole('button', { name: 'Keep reviewing' })).toBeFocused();
    await expectNoAxeViolations(page);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(submit).toBeFocused();
    await submit.click();
    await page.getByRole('dialog').getByRole('button', { name: 'Submit exam' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Exam results' })).toBeFocused();
    await expect(page.getByText('100%')).toBeVisible();
    await expect(page.getByText('3 of 3 correct')).toBeVisible();
    await expect(main(page).getByText('(correct)')).toHaveCount(3);
    await expect(main(page).getByText('Built-in General question set', { exact: false })).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test('CBT timeout auto-submits the answers actually given (regression: stale snapshot scored 0)', async ({ page }) => {
    await page.clock.install();
    await openCoach(page);
    await chooseMode(page, /^CBT examination/);
    await page.getByRole('button', { name: /^General/ }).click();
    await pickOption(page, 'Duration', '5 minutes');
    await page.getByRole('button', { name: 'Start exam with built-in questions' }).click();
    await examOptions(page).nth(1).click(); // correct
    await page.getByRole('button', { name: 'Next' }).click();
    await examOptions(page).nth(0).click(); // incorrect
    await page.clock.runFor(5 * 60_000 + 1_000);
    await expect(page.getByRole('heading', { level: 1, name: 'Exam results' })).toBeVisible();
    await expect(page.getByText('Time ran out.', { exact: false })).toBeVisible();
    const stats = page.locator('dl');
    await expect(stats.getByText('Correct', { exact: true }).locator('..')).toContainText('1');
    await expect(stats.getByText('Incorrect', { exact: true }).locator('..')).toContainText('1');
    await expect(stats.getByText('Unanswered', { exact: true }).locator('..')).toContainText('1');
    await expect(page.getByText('33%')).toBeVisible();
  });

  test('CBT with a role: the real unavailable answer is explained and the labelled built-in set is offered', async ({ page, guard }) => {
    guard.expectApiStatuses(502, 503);
    const calls = recordRequests(page, '/api/generate-interview');
    await openCoach(page);
    await chooseMode(page, /^CBT examination/);
    await page.getByLabel('Target role (optional)').fill('Data Analyst');
    await page.getByRole('button', { name: /^General/ }).click();
    await page.getByRole('combobox', { name: 'Number of questions' }).click();
    await expect(page.getByRole('option')).toHaveText(['5 questions', '10 questions', '15 questions', '20 questions']);
    await page.keyboard.press('Escape');
    const response = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/generate-interview');
    await page.getByRole('button', { name: 'Generate exam' }).click();
    expect((await response).status()).toBe(503);
    expect(calls[0].postDataJSON()).toEqual({ occupation: 'Data Analyst', interviewType: 'hr', questionCount: 10, experienceLevel: 'mid', difficulty: 'medium' });
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('AI questions are unavailable');
    await expectNoAxeViolations(page);
    await alert.getByRole('button', { name: 'Use the built-in questions instead' }).click();
    await expect(page.getByText(/Built-in question set · 0\/3 answered/)).toBeVisible();
  });

  test('CBT leave: the exam asks before discarding answers and returns focus on cancel', async ({ page }) => {
    await openCoach(page);
    await chooseMode(page, /^CBT examination/);
    await page.getByRole('button', { name: /^Technical/ }).click();
    await page.getByRole('button', { name: 'Start exam with built-in questions' }).click();
    await examOptions(page).nth(2).click();
    const leave = page.getByRole('button', { name: 'Leave exam' });
    await leave.click();
    const dialog = page.getByRole('dialog', { name: 'Leave the exam?' });
    await expect(dialog.getByRole('button', { name: 'Stay in exam' })).toBeFocused();
    await dialog.getByRole('button', { name: 'Stay in exam' }).click();
    await expect(leave).toBeFocused();
    await expect(examOptions(page).nth(2)).toHaveAttribute('aria-pressed', 'true');
    await leave.click();
    await page.getByRole('dialog').getByRole('button', { name: 'Leave exam' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'AI Interview Coach' })).toBeVisible();
  });

  test('practice leave: asks only when answers would be lost; Stay and Escape keep the session and return focus', async ({ page }) => {
    await openCoach(page);
    await chooseMode(page, /^Practice/);
    await page.getByRole('button', { name: /^Behavioral/ }).click();
    await page.getByRole('button', { name: 'Start practice' }).click();
    const leave = page.getByRole('button', { name: 'Leave session' });
    // Nothing answered yet, so nothing can be lost: no confirmation.
    await leave.click();
    await expect(page.getByRole('heading', { level: 1, name: 'AI Interview Coach' })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await chooseMode(page, /^Practice/);
    await page.getByRole('button', { name: /^Behavioral/ }).click();
    await page.getByRole('button', { name: 'Start practice' }).click();
    const answer = page.getByLabel('Your answer');
    const written = 'I agreed review criteria with both teammates before the next sprint.';
    await answer.fill(written);
    await leave.click();
    const dialog = page.getByRole('dialog', { name: 'Leave this session?' });
    await expect(dialog).toContainText('Your answer will be discarded.');
    await expect(dialog.getByRole('button', { name: 'Stay' })).toBeFocused();
    await expectNoAxeViolations(page, '[role="dialog"]');
    await dialog.getByRole('button', { name: 'Stay' }).click();
    await expect(dialog).toBeHidden();
    await expect(leave).toBeFocused();
    await expect(answer).toHaveValue(written);
    await leave.click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(leave).toBeFocused();
    await expect(answer).toHaveValue(written);
    await leave.click();
    await dialog.getByRole('button', { name: 'Leave session' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'AI Interview Coach' })).toBeVisible();
  });

  test('live: topic and role are required, and the real unavailable answer starts nothing', async ({ page, guard }) => {
    guard.expectApiStatuses(502, 503);
    const calls = recordRequests(page, '/api/live-interview/sessions');
    await openCoach(page);
    await chooseMode(page, /^Live AI interview/);
    await page.getByRole('button', { name: 'Start live interview' }).click();
    await expect(page.getByText('Choose an interview topic.')).toBeVisible();
    await expect(page.getByText('Add a target role before starting the live interview.')).toBeVisible();
    const role = page.getByLabel('Target role');
    await expect(role).toBeFocused();
    await expect(role).toHaveAttribute('aria-invalid', 'true');
    expect(calls).toHaveLength(0);
    await expectNoAxeViolations(page);

    await role.fill('Data Analyst');
    await page.getByRole('button', { name: /^Behavioral/ }).click();
    await expect(page.getByText('About 4 questions.')).toBeVisible();
    const response = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/live-interview/sessions');
    await page.getByRole('button', { name: 'Start live interview' }).click();
    expect((await response).status()).toBe(503);
    expect(calls[0].postDataJSON()).toEqual({ role: 'Data Analyst', interviewType: 'behavioral', experienceLevel: 'mid', difficulty: 'medium', durationMinutes: 15 });
    await expect(page.getByRole('alert')).toContainText('The live interviewer couldn’t start');
    await expect(page.getByRole('alert')).toContainText('No interview was started');
    await expect(page.getByRole('alert')).not.toContainText('still saved');
    expect(await page.evaluate(() => Object.keys(sessionStorage).filter((key) => key.startsWith('ime365.interviewCoach.')))).toEqual([]);
    await expectNoAxeViolations(page);
  });

  test('deep links: legacy paths redirect, nested paths render, refresh and history work', async ({ page }) => {
    await page.goto('/dashboard/interview');
    await expect(page).toHaveURL(/\/dashboard\/interviews$/);
    await expect(page.getByRole('heading', { level: 1, name: 'AI Interview Coach' })).toBeVisible();
    await page.goto('/dashboard/interview/live');
    await expect(page).toHaveURL(/\/dashboard\/interviews$/);
    await page.goto('/dashboard/interviews/history');
    await expect(page.getByRole('heading', { level: 1, name: 'AI Interview Coach' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'AI Interview Coach' })).toBeVisible();
    await page.goto('/dashboard');
    await page.goto('/dashboard/interviews');
    await page.goBack();
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goForward();
    await expect(page.getByRole('heading', { level: 1, name: 'AI Interview Coach' })).toBeVisible();
  });
});

test.describe('Interview Coach — acceptance stack (stub AI provider, real backend + MariaDB)', () => {
  let available = false;
  let reason = '';

  test.beforeAll(async () => {
    try {
      const [api, stub] = await Promise.all([fetch(`${ACCEPTANCE_API}/api/health`), fetch(`${ACCEPTANCE_STUB}/__stub/stats`)]);
      available = api.ok && stub.ok;
      reason = available ? '' : `acceptance stack answered ${api.status}/${stub.status}`;
    } catch (error) {
      reason = `acceptance stack not running (${String(error)}); see scripts/dev-ai/openai-acceptance-stub.mjs`;
    }
  });

  const stubCalls = async (): Promise<Record<string, number>> => (await (await fetch(`${ACCEPTANCE_STUB}/__stub/stats`)).json()).calls;

  async function routeAiToAcceptance(page: Page) {
    await page.route((url) => /^\/api\/(generate-interview$|live-interview\/)/.test(url.pathname), async (route) => {
      const url = new URL(route.request().url());
      await route.continue({ url: `${ACCEPTANCE_API}${url.pathname}${url.search}` });
    });
  }

  /** The fields of the server's live session JSON these tests read. */
  interface LiveSessionJson {
    sessionId: string;
    revision: number;
    interviewer: { turnId: string | null; question: string };
    transcript: Array<{ answer: string }>;
  }
  const authAs = (account: 'a' | 'b') => ({ headers: { Authorization: `Bearer ${tokenFor(account)}` } });
  const livePath = (session: LiveSessionJson) => `${ACCEPTANCE_API}/api/live-interview/sessions/${session.sessionId}`;
  const livePointers = (page: Page) => page.evaluate(() => Object.keys(sessionStorage).filter((key) => key.startsWith('ime365.interviewCoach.')));
  const isTurnResponse = (response: { url(): string }) => new URL(response.url()).pathname.endsWith('/turns');

  async function startLiveInUi(page: Page, role: string): Promise<LiveSessionJson> {
    await openCoach(page);
    await chooseMode(page, /^Live AI interview/);
    await page.getByLabel('Target role').fill(role);
    await page.getByRole('button', { name: /^Behavioral/ }).click();
    const started = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/live-interview/sessions');
    await page.getByRole('button', { name: 'Start live interview' }).click();
    const response = await started;
    expect(response.status()).toBe(201);
    await expect(page.getByRole('heading', { level: 1, name: 'Live AI interview' })).toBeVisible();
    return ((await response.json()) as { session: LiveSessionJson }).session;
  }

  test('CBT with a role renders the AI-generated set and scores it against the server answer key', async ({ page }) => {
    test.skip(!available, reason);
    await routeAiToAcceptance(page);
    await openCoach(page);
    await chooseMode(page, /^CBT examination/);
    await page.getByLabel('Target role (optional)').fill('Data Analyst');
    await page.getByRole('button', { name: /^General/ }).click();
    await pickOption(page, 'Number of questions', '5 questions');
    await pickOption(page, 'Experience level', 'Junior');
    const response = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/generate-interview');
    await page.getByRole('button', { name: 'Generate exam' }).click();
    const served = await (await response).json() as { title: string; questions: Array<{ question: string; options: string[]; correctAnswer: number; explanation: string }> };
    expect(served.questions).toHaveLength(5);
    await expect(page.getByText(`AI-generated · ${served.title}`, { exact: false })).toBeVisible();

    for (const [index, question] of served.questions.entries()) {
      await expect(examQuestion(page)).toHaveText(question.question);
      const choice = index === 4 ? (question.correctAnswer + 1) % question.options.length : question.correctAnswer;
      await examOptions(page).nth(choice).click();
      if (index < 4) await page.getByRole('button', { name: 'Next' }).click();
    }
    await expectNoAxeViolations(page);
    await page.getByRole('button', { name: 'Submit exam' }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Submit exam' }).click();
    await expect(page.getByText('80%')).toBeVisible();
    await expect(page.getByText('4 of 5 correct')).toBeVisible();
    await expect(main(page).getByText(served.questions[0].explanation)).toBeVisible();
    await expect(main(page).getByText(`AI-generated questions for Data Analyst (${served.title})`)).toBeVisible();
  });

  test('live interview: evaluated answers, reload and resume, server-side completion and report', async ({ page }) => {
    test.skip(!available, reason);
    const before = await stubCalls();
    await routeAiToAcceptance(page);
    await openCoach(page);
    await chooseMode(page, /^Live AI interview/);
    await page.getByLabel('Target role').fill('Data Analyst');
    await page.getByRole('button', { name: /^Behavioral/ }).click();
    await pickOption(page, 'Duration', '5 minutes');
    const started = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/live-interview/sessions');
    await page.getByRole('button', { name: 'Start live interview' }).click();
    const startBody = await (await started).json() as { session: { sessionId: string; interviewer: { question: string } } };
    await expect(page.getByRole('heading', { level: 1, name: 'Live AI interview' })).toBeVisible();
    await expect(page.locator('#live-question-heading')).toHaveText(startBody.session.interviewer.question);
    await expect(page.getByText('stub provider', { exact: false }).first()).toBeVisible();
    await expectNoAxeViolations(page);

    await page.getByRole('button', { name: 'Send answer' }).click();
    await expect(page.getByText('Write your answer before sending it.')).toBeVisible();
    await expect(page.getByLabel('Your answer')).toHaveAttribute('aria-invalid', 'true');

    const answerOnce = async (text: string) => {
      const done = page.waitForResponse((r) => new URL(r.url()).pathname.endsWith('/turns'));
      await page.getByLabel('Your answer').fill(text);
      await page.getByRole('button', { name: 'Send answer' }).click();
      expect((await done).status()).toBe(200);
    };
    await answerOnce('I owned the weekly sales report and checked every figure with finance before sharing it.');
    await expect(page.getByText('Score 74/100')).toBeVisible();
    await expect(page.locator('#live-question-heading')).toBeFocused();

    // Persistence: a reload finds the server-side session again.
    await page.reload();
    const banner = page.getByRole('region', { name: 'You have a live interview in progress' });
    await expect(banner).toContainText('Data Analyst · 1 of about 4 questions answered');
    await banner.getByRole('button', { name: 'Resume interview' }).click();
    await expect(page.getByText('1 answered')).toBeVisible();

    await answerOnce('I list every task, agree priorities with my manager and flag risks early.');
    await answerOnce('I listened to the concern, proposed a small experiment and we compared results.');
    await answerOnce('I told the stakeholder early, explained the cause and offered a revised date.');
    await expect(page.getByRole('heading', { name: 'The interview is complete' })).toBeVisible();
    await page.getByRole('button', { name: 'Get my report' }).click();
    await expect(page.getByRole('heading', { name: 'Interview report' })).toBeFocused();
    await expect(page.getByText('Acceptance stub readiness band')).toBeVisible();
    await expect(main(page).getByText('74/100', { exact: true })).toBeVisible();
    await expect(main(page).locator('section', { hasText: 'Transcript' }).locator('li')).toHaveCount(4);
    await expectNoAxeViolations(page);

    await page.reload();
    const ready = page.getByRole('region', { name: 'Your live interview report is ready' });
    await ready.getByRole('button', { name: 'View report' }).click();
    await expect(page.getByRole('heading', { name: 'Interview report' })).toBeVisible();
    await page.getByRole('button', { name: 'New session' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'AI Interview Coach' })).toBeVisible();
    await expect(page.getByRole('region', { name: /live interview/ })).toHaveCount(0);
    expect(await page.evaluate(() => Object.keys(sessionStorage).filter((key) => key.startsWith('ime365.interviewCoach.')))).toEqual([]);

    const after = await stubCalls();
    expect((after['live-interview-open'] ?? 0) - (before['live-interview-open'] ?? 0)).toBe(1);
    expect((after['live-interview-turn'] ?? 0) - (before['live-interview-turn'] ?? 0)).toBe(4);
    expect((after['live-interview-report'] ?? 0) - (before['live-interview-report'] ?? 0)).toBe(1);
  });

  test('live interview: ending asks first and deletes the session; another account can never read it', async ({ page, request }) => {
    test.skip(!available, reason);
    await routeAiToAcceptance(page);
    await openCoach(page);
    await chooseMode(page, /^Live AI interview/);
    await page.getByLabel('Target role').fill('QA Engineer');
    await page.getByRole('button', { name: /^Technical/ }).click();
    const started = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/live-interview/sessions');
    await page.getByRole('button', { name: 'Start live interview' }).click();
    const { session } = await (await started).json() as { session: { sessionId: string } };

    const as = (account: 'a' | 'b') => ({ headers: { Authorization: `Bearer ${tokenFor(account)}` } });
    const path = `${ACCEPTANCE_API}/api/live-interview/sessions/${session.sessionId}`;
    expect((await request.get(path, as('b'))).status()).toBe(404);
    expect((await request.post(`${path}/turns`, { ...as('b'), data: { idempotencyKey: crypto.randomUUID(), expectedRevision: 1, turnId: 'x', answer: 'An answer from the wrong account.' } })).status()).toBe(404);
    expect((await request.delete(path, as('b'))).status()).toBe(404);
    expect((await request.get(path)).status()).toBe(401);
    expect((await request.get(path, as('a'))).status()).toBe(200);

    const end = page.getByRole('button', { name: 'End interview' });
    await end.click();
    const dialog = page.getByRole('dialog', { name: 'End this interview?' });
    await expect(dialog.getByRole('button', { name: 'Keep interviewing' })).toBeFocused();
    await expectNoAxeViolations(page);
    await page.keyboard.press('Escape');
    await expect(end).toBeFocused();
    await end.click();
    const deleted = page.waitForResponse((r) => r.request().method() === 'DELETE');
    await page.getByRole('dialog').getByRole('button', { name: 'End interview' }).click();
    expect((await deleted).status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: 'AI Interview Coach' })).toBeVisible();
    expect((await request.get(path, as('a'))).status()).toBe(404);
  });

  test('live interview: an answer recorded in another tab wins; this tab adopts the latest question and says so', async ({ page, request, guard }) => {
    test.skip(!available, reason);
    guard.expectApiStatuses(409);
    await routeAiToAcceptance(page);
    const session = await startLiveInUi(page, 'Support Engineer');

    // "Another tab" (same account, straight to the API) answers the displayed question first.
    const otherTabAnswer = 'Answered in another tab: I escalated the outage and updated customers every hour.';
    const otherTab = await request.post(`${livePath(session)}/turns`, {
      ...authAs('a'),
      data: { idempotencyKey: crypto.randomUUID(), expectedRevision: session.revision, turnId: session.interviewer.turnId, answer: otherTabAnswer },
    });
    expect(otherTab.status()).toBe(200);
    const latest = ((await otherTab.json()) as { session: LiveSessionJson }).session;
    expect(latest.interviewer.turnId).not.toBe(session.interviewer.turnId);
    await expect(page.locator('#live-question-heading')).toHaveText(session.interviewer.question);

    // This tab still shows the earlier question: the server rejects its answer and the UI adopts the latest state.
    const answer = page.getByLabel('Your answer');
    const conflict = page.waitForResponse(isTurnResponse);
    await answer.fill('Answered in this tab, which was still showing the earlier question.');
    await page.getByRole('button', { name: 'Send answer' }).click();
    expect((await conflict).status()).toBe(409);
    const notice = page.getByRole('status').filter({ hasText: 'changed in another tab' });
    await expect(notice).toHaveText('This interview changed in another tab, so its latest state is shown. Your unsent answer was cleared.');
    // It renders above the adopted question, so it must be brought fully on screen at every profile.
    await expect(notice).toBeInViewport({ ratio: 1 });
    await expect(page.locator('#live-question-heading')).toHaveText(latest.interviewer.question);
    await expect(answer).toHaveValue('');
    await expect(page.getByText('1 answered')).toBeVisible();
    await expect(main(page).getByRole('alert')).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    await expectNoAxeViolations(page);

    // The server kept exactly one answer: the other tab's.
    const stored = ((await (await request.get(livePath(session), authAs('a'))).json()) as { session: LiveSessionJson }).session;
    expect(stored.transcript.map((turn) => turn.answer)).toEqual([otherTabAnswer]);

    // Answering the adopted question works and clears the notice.
    const done = page.waitForResponse(isTurnResponse);
    await answer.fill('Afterwards I wrote a runbook so the next incident was handled faster.');
    await page.getByRole('button', { name: 'Send answer' }).click();
    expect((await done).status()).toBe(200);
    await expect(page.getByText('2 answered')).toBeVisible();
    await expect(notice).toHaveCount(0);
    expect((await request.delete(livePath(session), authAs('a'))).status()).toBe(200);
  });

  test('live interview: a session removed elsewhere is reported as gone, and ending it still returns to the modes', async ({ page, request, guard }) => {
    test.skip(!available, reason);
    guard.expectApiStatuses(404);
    await routeAiToAcceptance(page);

    // Answering after another tab ended the interview: no pointless retry, a clear way forward.
    const first = await startLiveInUi(page, 'Support Engineer');
    expect((await request.delete(livePath(first), authAs('a'))).status()).toBe(200);
    const gone = page.waitForResponse(isTurnResponse);
    await page.getByLabel('Your answer').fill('I escalated the outage and updated customers every hour.');
    await page.getByRole('button', { name: 'Send answer' }).click();
    expect((await gone).status()).toBe(404);
    const alert = main(page).getByRole('alert');
    await expect(alert).toContainText('This interview is no longer available');
    await expect(alert).toContainText('Start a new session to continue.');
    await expect(alert.getByRole('button', { name: 'Try again' })).toHaveCount(0);
    // Send answer sits a screen below the alert on small viewports; the alert must still be seen.
    await expect(alert).toBeInViewport({ ratio: 1 });
    await expectNoAxeViolations(page);
    await alert.getByRole('button', { name: 'Start a new interview' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'AI Interview Coach' })).toBeVisible();
    expect(await livePointers(page)).toEqual([]);

    // Ending after another tab ended it: the server reports it already gone, so the UI simply leaves.
    const second = await startLiveInUi(page, 'Support Engineer');
    expect((await request.delete(livePath(second), authAs('a'))).status()).toBe(200);
    await page.getByRole('button', { name: 'End interview' }).click();
    const ended = page.waitForResponse((r) => r.request().method() === 'DELETE');
    await page.getByRole('dialog').getByRole('button', { name: 'End interview' }).click();
    expect((await ended).status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1, name: 'AI Interview Coach' })).toBeVisible();
    await expect(main(page).getByRole('alert')).toHaveCount(0);
    expect(await livePointers(page)).toEqual([]);
  });

  test('practice guidance renders the guidance the server returned', async ({ page }) => {
    test.skip(!available, reason);
    await routeAiToAcceptance(page);
    await openCoach(page);
    await chooseMode(page, /^Practice/);
    await page.getByRole('button', { name: /^General/ }).click();
    await page.getByRole('button', { name: 'Start practice' }).click();
    const response = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/live-interview/guide');
    await page.getByRole('button', { name: 'Get answer guidance' }).click();
    const guide = await (await response).json() as { goal: string; modelAnswer: string; tip: string };
    await expect(page.getByText(guide.goal)).toBeVisible();
    await expect(page.getByText(guide.tip)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Regenerate guidance' })).toBeVisible();
    await expectNoAxeViolations(page);
  });
});
