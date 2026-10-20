/**
 * AI Writing Assistant — behavioural suite (directive P002, surface 2).
 *
 * Runs at all five profiles against the real backend: the page calls
 * POST /api/generate-content and must never present anything the server did not
 * generate. This sandbox has no AI provider, so the server answers with its
 * documented unavailable contract (source text echoed with aiUnavailable=true,
 * or 5xx); each test asserts whichever real answer arrives and records it.
 * The FAULT INJECTION test aborts the browser request; nothing is fabricated.
 */
import AxeBuilder from '@axe-core/playwright';
import type { Page, Request } from '@playwright/test';
import { expect, expectNoHorizontalOverflow, test } from './fixtures';

const statusRegion = (page: Page) => page.locator('#main-content').getByRole('status');
const generateButton = (page: Page) => page.getByRole('button', { name: 'Generate', exact: true });
const resultText = (page: Page) => page.getByTestId('ai-result-text');
const INVENTED_METRICS = ['38%', '$45,000', '99.98%', '42% to 91%', '$120k'];

function recordAiRequests(page: Page): Request[] {
  const requests: Request[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/generate-content') requests.push(request);
  });
  return requests;
}

const aiResponse = (page: Page) => page.waitForResponse((response) => new URL(response.url()).pathname === '/api/generate-content');

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).include('#main-content').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes.slice(0, 5).map((node) => node.target.join(' ')).join(' | ')}`)).toEqual([]);
}

test.describe('AI Writing Assistant', () => {
  test('offers only backend-supported tools; ?tool= survives refresh; arrow keys switch tools', async ({ page }) => {
    await page.goto('/dashboard/ai?tool=summary');
    await expect(page.getByRole('heading', { level: 1, name: 'AI Writing Assistant' })).toBeVisible();
    const tools = page.getByRole('group', { name: 'What do you want to write?' }).getByRole('radio');
    await expect(tools).toHaveCount(3);
    const summary = page.getByRole('radio', { name: /^Professional summary/ });
    await expect(summary).toBeChecked();
    await expect(page.getByLabel('Your notes or current summary')).toBeVisible();
    // Retired claims and tools that have no backend operation are gone.
    for (const text of ['Interview Answer Polisher', 'LinkedIn Headline', 'Llama 3.2', 'Nemotron', 'Ready for ATS screening']) {
      await expect(page.getByText(text)).toHaveCount(0);
    }

    await page.reload();
    await expect(summary).toBeChecked();

    await summary.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('radio', { name: /^Skill suggestions/ })).toBeChecked();
    await expect(page).toHaveURL(/[?&]tool=skills/);
    await expect(page.getByLabel('Target role', { exact: true })).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('radio', { name: /^Improve a resume bullet/ })).toBeChecked();
    await expect(page).not.toHaveURL(/tool=/);
    await expect(page.getByLabel('Bullet to improve')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('bullet: empty input is blocked locally; an unavailable answer is never shown as a result', async ({ page, guard }) => {
    guard.expectApiStatuses(502, 503);
    const requests = recordAiRequests(page);
    await page.goto('/dashboard/ai');
    const bullet = page.getByLabel('Bullet to improve');

    await generateButton(page).click();
    await expect(bullet).toHaveAttribute('aria-invalid', 'true');
    await expect(bullet).toBeFocused();
    await expect(page.getByText('Enter the bullet you want to improve.')).toBeVisible();
    expect(requests, 'invalid input must not reach the API').toHaveLength(0);

    const original = 'Managed the cloud database and fixed bugs when things broke.';
    await bullet.fill(original);
    await expect(bullet).not.toHaveAttribute('aria-invalid', 'true');
    await page.getByLabel('Target role (optional)').fill('Site Reliability Engineer');
    await page.getByRole('radio', { name: /^Concise/ }).check();
    const pending = aiResponse(page);
    await generateButton(page).click();
    const response = await pending;
    expect(requests[0].postDataJSON()).toEqual({
      operation: 'enhance-single-bullet',
      payload: { bullet: original, jobTitle: 'Site Reliability Engineer', tone: 'concise' },
    });
    const body = (await response.json().catch(() => ({}))) as { aiUnavailable?: boolean; enhancedBullet?: string };

    if (response.status() >= 500 || body.aiUnavailable) {
      test.info().annotations.push({
        type: 'environment',
        description: `No AI provider: HTTP ${response.status()}${body.aiUnavailable ? ', aiUnavailable=true with the source text echoed' : ''}. Unavailable path exercised.`,
      });
      await expect(statusRegion(page)).toContainText('AI generation is unavailable right now. Nothing was generated');
      await expect(resultText(page)).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Copy' })).toHaveCount(0);
      await expect(page.getByText('No results yet.')).toBeVisible();
    } else {
      expect(response.status()).toBe(200);
      await expect(resultText(page)).toHaveText(String(body.enhancedBullet).trim());
      await expect(page.getByText('No results yet.')).toHaveCount(0);
    }
    for (const metric of INVENTED_METRICS) await expect(page.getByText(metric)).toHaveCount(0);
    await expect(bullet).toHaveValue(original);
    await expect(generateButton(page)).toBeEnabled();
    await expect(generateButton(page)).toBeFocused();
  });

  test('summary: thin input gets the server’s clarifying questions instead of invented text', async ({ page }) => {
    const requests = recordAiRequests(page);
    await page.goto('/dashboard/ai?tool=summary');
    const notes = page.getByLabel('Your notes or current summary');

    await generateButton(page).click();
    await expect(notes).toHaveAttribute('aria-invalid', 'true');
    await expect(notes).toBeFocused();
    expect(requests).toHaveLength(0);

    await notes.fill('QA');
    const pending = aiResponse(page);
    await generateButton(page).click();
    const response = await pending;
    expect(response.status()).toBe(200);
    expect(requests[0].postDataJSON()).toMatchObject({ operation: 'generate-summary', payload: { existingText: 'QA', skills: [], tone: 'balanced' } });
    const body = (await response.json()) as { requiresAnswer?: boolean; questions?: Array<{ question: string }> };
    expect(body.requiresAnswer, 'the server asks for more facts when the input is too thin').toBe(true);

    await expect(statusRegion(page)).toContainText('More detail is needed before a summary can be written.');
    const questions = page.getByRole('list', { name: 'Questions to answer in your notes' }).getByRole('listitem');
    await expect(questions).toHaveCount(body.questions!.length);
    await expect(questions.first()).toHaveText(body.questions![0].question);
    await expect(resultText(page)).toHaveCount(0);
    await expect(page.getByText('No results yet.')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('skills: a target role is required; an unavailable answer shows no suggestions', async ({ page, guard }) => {
    guard.expectApiStatuses(502, 503);
    const requests = recordAiRequests(page);
    await page.goto('/dashboard/ai?tool=skills');
    const role = page.getByLabel('Target role', { exact: true });

    await generateButton(page).click();
    await expect(role).toHaveAttribute('aria-invalid', 'true');
    await expect(role).toBeFocused();
    await expect(page.getByText('Enter the target role.')).toBeVisible();
    expect(requests).toHaveLength(0);

    await role.fill('Data Analyst');
    await page.getByLabel('Skills you already have (optional)').fill('SQL, Excel');
    const pending = aiResponse(page);
    await generateButton(page).click();
    const response = await pending;
    expect(requests[0].postDataJSON()).toEqual({
      operation: 'generate-skills',
      payload: { jobTitle: 'Data Analyst', context: { facts: { skills: ['SQL', 'Excel'] } } },
    });
    const body = (await response.json().catch(() => ({}))) as { aiUnavailable?: boolean; skills?: unknown[] };
    if (response.status() >= 500 || body.aiUnavailable) {
      await expect(statusRegion(page)).toContainText('AI generation is unavailable right now');
      await expect(page.getByRole('list', { name: 'Suggested skills' })).toHaveCount(0);
    } else {
      await expect(page.getByRole('list', { name: 'Suggested skills' }).getByRole('listitem')).toHaveCount(body.skills!.length);
    }
  });

  test('network failure (FAULT INJECTION: request aborted) reports that nothing was generated', async ({ page, guard }) => {
    guard.allowConsole(/net::ERR_FAILED/);
    await page.route('**/api/generate-content', (route) => route.abort('failed'));
    await page.goto('/dashboard/ai');
    await page.getByLabel('Bullet to improve').fill('Wrote integration tests for the payments service.');
    await generateButton(page).click();
    await expect(statusRegion(page)).toContainText('The request did not reach the server');
    await expect(statusRegion(page)).toContainText('Nothing was generated.');
    await expect(resultText(page)).toHaveCount(0);
    await expect(page.getByText('No results yet.')).toBeVisible();
    await expect(generateButton(page)).toBeEnabled();
  });

  test('accessibility: no axe WCAG 2.1 A/AA violations for each tool and the validation state', async ({ page }) => {
    for (const query of ['', '?tool=summary', '?tool=skills']) {
      await page.goto(`/dashboard/ai${query}`);
      await expect(page.getByRole('heading', { level: 1, name: 'AI Writing Assistant' })).toBeVisible();
      await expectNoAxeViolations(page);
      await expectNoHorizontalOverflow(page);
    }
    await page.goto('/dashboard/ai');
    await generateButton(page).click();
    await expect(page.getByLabel('Bullet to improve')).toHaveAttribute('aria-invalid', 'true');
    await expectNoAxeViolations(page);
  });
});
