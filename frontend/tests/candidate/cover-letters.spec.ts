/**
 * Cover Letters & Builder — behavioural suite (directive P002, surface 1).
 *
 * Runs at all five viewport profiles against the real stack:
 * UI -> api-client (Bearer token) -> Express -> MariaDB -> UI.
 * Data is arranged and cleaned up through the same public endpoints the UI
 * uses. Tests marked FAULT INJECTION abort a browser request to exercise a
 * failure path; no response is ever fabricated.
 */
import fs from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';
import {
  ACCOUNTS,
  expect,
  expectNoHorizontalOverflow,
  isCompact,
  storageStatePath,
  test,
  type AccountKey,
  type ApiClient,
} from './fixtures';

const createdLetters: Array<{ account: AccountKey; id: string }> = [];

test.afterEach(async ({ apiAs }) => {
  while (createdLetters.length) {
    const { account, id } = createdLetters.pop()!;
    await apiAs(account).del(`/covers/${encodeURIComponent(id)}`);
  }
});

/** Lower-case alphanumeric marker that keeps each test's data identifiable. */
const uniqueTag = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 46656).toString(36)}`;

async function seedLetter(api: ApiClient, account: AccountKey, fields: Record<string, string>): Promise<string> {
  const id = `cl_e2e_${uniqueTag()}`;
  const response = await api.post(`/covers/${id}`, { id, templateId: 'Cover1', ...fields });
  expect(response.status, `seeding ${id}`).toBe(200);
  createdLetters.push({ account, id });
  return id;
}

const statusRegion = (page: Page) => page.locator('#main-content').getByRole('status');
const saveState = (page: Page) => page.getByTestId('cover-letter-save-state');
const field = (page: Page, label: string) => page.getByLabel(label, { exact: true });
const saveButton = (page: Page) => page.getByRole('button', { name: 'Save', exact: true });
const idFromUrl = (page: Page) => decodeURIComponent(new URL(page.url()).pathname.split('/').pop() ?? '');

function countRequests(page: Page, pattern: RegExp, method = 'POST') {
  const urls: string[] = [];
  page.on('request', (request) => {
    if (request.method() === method && pattern.test(request.url())) urls.push(request.url());
  });
  return urls;
}

async function expectNoAxeViolations(page: Page, selector: string) {
  const results = await new AxeBuilder({ page })
    .include(selector)
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const summary = results.violations.map(
    (violation) => `${violation.id} (${violation.impact}): ${violation.nodes.slice(0, 5).map((node) => node.target.join(' ')).join(' | ')}`,
  );
  expect(summary, `axe WCAG 2.1 A/AA violations in ${selector}`).toEqual([]);
}

async function settleAnimations(locator: Locator) {
  await locator.evaluate((element) => Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished)));
}

async function expectWithinViewport(page: Page, locator: Locator) {
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  expect(box && viewport, 'dialog must be rendered').toBeTruthy();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height);
}

test.describe('Cover letters (account A)', () => {
  test('list: real letters with search, sort, URL state, refresh and back/forward', async ({ page, apiAs }) => {
    const tag = uniqueTag();
    const api = apiAs('a');
    await seedLetter(api, 'a', { jobTitle: `Data Analyst ${tag}`, companyName: 'Contoso Test', letterBody: 'Older letter.' });
    // updated_at has one-second resolution; space the writes so date order is deterministic.
    await page.waitForTimeout(1100);
    const newer = await seedLetter(api, 'a', { jobTitle: `Platform Engineer ${tag}`, companyName: 'Northwind Test', recipientName: 'Jordan Rivera', letterBody: 'Newer letter.' });
    const older = `Data Analyst ${tag} at Contoso Test`;
    const newest = `Platform Engineer ${tag} at Northwind Test`;

    await page.goto('/dashboard/cover-letters');
    await expect(page.getByRole('heading', { level: 1, name: 'Cover Letters' })).toBeVisible();
    await expect(page.getByText(/^\d+ saved cover letters?$/)).toBeVisible();

    const search = page.getByRole('searchbox', { name: 'Search cover letters' });
    await search.fill(tag);
    await expect(page).toHaveURL(new RegExp(`[?&]q=${tag}`));
    const titles = page.getByRole('list', { name: 'Saved cover letters' }).getByRole('listitem');
    await expect(titles).toHaveCount(2);
    await expect(titles.nth(0)).toContainText(newest);
    await expect(titles.nth(1)).toContainText(older);
    await expect(titles.nth(0)).toContainText('To Jordan Rivera');

    const sort = page.getByLabel('Sort');
    await sort.selectOption('title-asc');
    await expect(page).toHaveURL(/sort=title-asc/);
    await expect(titles.nth(0)).toContainText(older);

    await page.reload();
    await expect(search).toHaveValue(tag);
    await expect(sort).toHaveValue('title-asc');
    await expect(titles).toHaveCount(2);
    await expect(titles.nth(0)).toContainText(older);
    await expectNoHorizontalOverflow(page);

    await page.getByRole('link', { name: `Open ${newest}` }).click();
    await expect(page).toHaveURL(new RegExp(`/cover-letter/${newer}$`));
    await expect(field(page, 'Job title')).toHaveValue(`Platform Engineer ${tag}`);
    await page.goBack();
    await expect(page).toHaveURL(/sort=title-asc/);
    await expect(search).toHaveValue(tag);
    await expect(titles.nth(0)).toContainText(older);
    await page.goForward();
    await expect(field(page, 'Job title')).toHaveValue(`Platform Engineer ${tag}`);
    await page.goBack();

    await search.fill(`no-match-${tag}`);
    await expect(page.getByText(`No cover letters match “no-match-${tag}”.`)).toBeVisible();
    await page.getByRole('button', { name: 'Clear search' }).click();
    await expect(search).toHaveValue('');
    await expect(page).not.toHaveURL(/[?&]q=/);
    await expect(page.getByRole('link', { name: newest, exact: true })).toBeVisible();
  });

  test('create: validation blocks empty and invalid input, then the letter saves and persists after reload', async ({ page, apiAs }) => {
    const tag = uniqueTag();
    const posts = countRequests(page, /\/api\/covers\//);
    await page.goto('/cover-letter/new');
    await expect(page.getByRole('heading', { level: 1, name: 'New cover letter' })).toBeVisible();
    await expect(saveState(page)).toHaveText('Not saved yet');
    // Contact details come from account A's real profile; nothing else is pre-written.
    await expect(field(page, 'First name')).toHaveValue('Avery');
    await expect(field(page, 'Email')).toHaveValue(ACCOUNTS.a.email);
    await expect(field(page, 'Letter text')).toHaveValue('');
    await expect(field(page, 'Job title')).toHaveValue('');

    // Failure path 1: nothing to save.
    await saveButton(page).click();
    const jobTitle = field(page, 'Job title');
    await expect(jobTitle).toHaveAttribute('aria-invalid', 'true');
    await expect(jobTitle).toBeFocused();
    await expect(page.getByText('Add a job title, company or letter text before saving.')).toBeVisible();
    await expect(statusRegion(page)).toContainText('The letter was not saved');

    // Failure path 2: malformed email.
    await jobTitle.fill(`Site Reliability Engineer ${tag}`);
    await expect(jobTitle).not.toHaveAttribute('aria-invalid', 'true');
    const email = field(page, 'Email');
    await email.fill('not-an-email');
    await saveButton(page).click();
    await expect(email).toHaveAttribute('aria-invalid', 'true');
    await expect(email).toBeFocused();
    expect(posts, 'invalid input must not reach the API').toEqual([]);

    // Success path.
    await email.fill(ACCOUNTS.a.email);
    await field(page, 'Company').fill('Fabrikam Test Labs');
    await field(page, 'Letter text').fill('Dear Hiring Team,\n\nParagraph one.\n\nKind regards,\nAvery Tester');
    await expect(saveState(page)).toHaveText('Unsaved changes');
    const saved = page.waitForResponse((response) => response.request().method() === 'POST' && /\/api\/covers\/cl_/.test(response.url()));
    await saveButton(page).click();
    expect((await saved).status()).toBe(200);
    await expect(page).toHaveURL(/\/cover-letter\/cl_[a-z0-9_]+$/);
    const id = idFromUrl(page);
    createdLetters.push({ account: 'a', id });
    await expect(statusRegion(page)).toContainText('Cover letter saved.');
    await expect(saveState(page)).toContainText('All changes saved');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Site Reliability Engineer ${tag} at Fabrikam Test Labs`);

    await page.reload();
    await expect(field(page, 'Job title')).toHaveValue(`Site Reliability Engineer ${tag}`);
    await expect(field(page, 'Letter text')).toHaveValue(/Paragraph one\./);
    await expect(saveState(page)).toContainText('All changes saved');
    const stored = await apiAs('a').get<{ cover: Record<string, string> }>(`/covers/${id}`);
    expect(stored.status).toBe(200);
    expect(stored.body.cover.companyName).toBe('Fabrikam Test Labs');
    expect(stored.body.cover.templateId).toBe('Cover1');
    expect(stored.body.cover.candidateFirstname).toBe('Avery');
    await expectNoHorizontalOverflow(page);
  });

  test('edit: direct link and legacy alias load the letter; keyboard edits save with Ctrl+S and persist', async ({ page, apiAs }) => {
    const tag = uniqueTag();
    const id = await seedLetter(apiAs('a'), 'a', {
      jobTitle: `Backend Engineer ${tag}`, companyName: 'Northwind Test', recipientName: 'Jordan Rivera', letterBody: 'Original paragraph.', aiTone: 'modern',
    });
    await page.goto(`/cover-letter/${id}`);
    await expect(field(page, 'Job title')).toHaveValue(`Backend Engineer ${tag}`);
    await expect(saveState(page)).toContainText('All changes saved');

    const preview = page.locator('#cover-letter-preview');
    if (isCompact(page)) {
      await expect(preview).toBeHidden();
      await page.getByRole('button', { name: 'Preview', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Preview', exact: true })).toHaveAttribute('aria-pressed', 'true');
    }
    await expect(preview).toBeVisible();
    await expect(preview).toContainText('Original paragraph.');
    await expect(preview).toContainText('Jordan Rivera');
    await expect(preview).toContainText(`Re: Backend Engineer ${tag}`);
    await expectNoHorizontalOverflow(page);
    if (isCompact(page)) await page.getByRole('button', { name: 'Edit', exact: true }).click();

    // Native radio group: arrow keys move the selection.
    await page.getByRole('radio', { name: /^Plain & confident/ }).focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('radio', { name: /^Formal/ })).toBeChecked();

    const body = field(page, 'Letter text');
    await body.fill('Original paragraph.\n\nAdded a second paragraph.');
    await expect(saveState(page)).toHaveText('Unsaved changes');
    const saved = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().includes(`/api/covers/${id}`));
    await body.press('Control+s');
    expect((await saved).status()).toBe(200);
    await expect(saveState(page)).toContainText('All changes saved');
    await expect(body).toBeFocused();

    await page.reload();
    await expect(body).toHaveValue(/Added a second paragraph\./);
    await expect(page.getByRole('radio', { name: /^Formal/ })).toBeChecked();
    const stored = await apiAs('a').get<{ cover: Record<string, string> }>(`/covers/${id}`);
    expect(stored.body.cover.aiTone).toBe('formal');

    await page.goto(`/coverletter/${id}`);
    await expect(field(page, 'Job title')).toHaveValue(`Backend Engineer ${tag}`);
  });

  test('duplicate: creates an independent saved copy', async ({ page, apiAs }) => {
    const tag = uniqueTag();
    const id = await seedLetter(apiAs('a'), 'a', { jobTitle: `Duplicate Source ${tag}`, companyName: 'Contoso Test', letterBody: 'Body to copy.' });
    const source = `Duplicate Source ${tag} at Contoso Test`;
    const copy = `Duplicate Source ${tag} (Copy) at Contoso Test`;
    await page.goto(`/dashboard/cover-letters?q=${tag}`);
    await expect(page.getByRole('link', { name: source, exact: true })).toBeVisible();

    const created = page.waitForResponse((response) => response.request().method() === 'POST' && /\/api\/covers\/cl_/.test(response.url()) && !response.url().includes(id));
    await page.getByRole('button', { name: `Duplicate ${source}` }).click();
    expect((await created).status()).toBe(200);
    await expect(statusRegion(page)).toContainText(`Duplicated “${source}”`);
    await expect(page.getByRole('link', { name: copy, exact: true })).toBeVisible();

    const list = await apiAs('a').get<{ covers: Array<{ id: string; jobTitle: string; letterBody: string }> }>('/covers');
    const copies = list.body.covers.filter((cover) => cover.jobTitle === `Duplicate Source ${tag} (Copy)`);
    expect(copies).toHaveLength(1);
    createdLetters.push({ account: 'a', id: copies[0].id });
    expect(copies[0].id).not.toBe(id);
    expect(copies[0].letterBody).toBe('Body to copy.');
    const original = await apiAs('a').get<{ cover: { jobTitle: string } }>(`/covers/${id}`);
    expect(original.body.cover.jobTitle).toBe(`Duplicate Source ${tag}`);
  });

  test('delete dialog: confirmation, Escape, focus entry/return/containment, scroll lock, cancel, confirm, fresh reopen', async ({ page, apiAs }) => {
    const tag = uniqueTag();
    const first = await seedLetter(apiAs('a'), 'a', { jobTitle: `Delete First ${tag}`, companyName: 'Tailspin Test' });
    await seedLetter(apiAs('a'), 'a', { jobTitle: `Delete Second ${tag}`, companyName: 'Tailspin Test' });
    const firstTitle = `Delete First ${tag} at Tailspin Test`;
    const secondTitle = `Delete Second ${tag} at Tailspin Test`;
    await page.goto(`/dashboard/cover-letters?q=${tag}`);
    await expect(page.getByRole('link', { name: firstTitle, exact: true })).toBeVisible();

    const trigger = page.getByRole('button', { name: `Delete ${firstTitle}` });
    const dialog = page.getByRole('dialog', { name: 'Delete this cover letter?' });

    // (1) trigger opens it, (2) visible within the viewport, (3) real data, (8) focus enters on the safe action.
    await trigger.click();
    await expect(dialog).toBeVisible();
    await settleAnimations(dialog);
    await expectWithinViewport(page, dialog);
    await expect(dialog).toContainText(firstTitle);
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
    // (10) background scroll is locked while open.
    expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).toBe('hidden');
    // (9) focus stays inside the dialog in both directions.
    for (const key of ['Tab', 'Tab', 'Tab', 'Tab', 'Shift+Tab', 'Shift+Tab', 'Shift+Tab']) {
      await page.keyboard.press(key);
      expect(await dialog.evaluate((element) => element.contains(document.activeElement)), `focus after ${key}`).toBe(true);
    }
    // (7) Escape closes, (8) focus returns to the trigger, scrolling is restored.
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).not.toBe('hidden');

    // (6) Cancel and the close button dismiss without deleting.
    await trigger.click();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toBeHidden();
    expect((await apiAs('a').get(`/covers/${first}`)).status).toBe(200);

    // (14) reopening for another letter shows that letter only.
    await page.getByRole('button', { name: `Delete ${secondTitle}` }).click();
    await expect(dialog).toContainText(secondTitle);
    await expect(dialog).not.toContainText(firstTitle);
    await page.keyboard.press('Escape');

    // (5, 13) the destructive action runs only after explicit confirmation.
    await trigger.click();
    const deleted = page.waitForResponse((response) => response.request().method() === 'DELETE' && response.url().includes(`/api/covers/${first}`));
    await dialog.getByRole('button', { name: 'Delete permanently' }).click();
    expect((await deleted).status()).toBe(200);
    await expect(dialog).toBeHidden();
    await expect(statusRegion(page)).toContainText(`Deleted “${firstTitle}”.`);
    await expect(page.getByRole('link', { name: firstTitle, exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: 'Cover Letters' })).toBeFocused();
    expect((await apiAs('a').get(`/covers/${first}`)).status).toBe(404);

    await page.reload();
    await expect(page.getByRole('link', { name: secondTitle, exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: firstTitle, exact: true })).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });

  test('delete failure (FAULT INJECTION: request aborted) keeps the letter and never reports success', async ({ page, apiAs, guard }) => {
    guard.allowConsole(/net::ERR_FAILED/);
    const tag = uniqueTag();
    const id = await seedLetter(apiAs('a'), 'a', { jobTitle: `Keep Me ${tag}`, companyName: 'Fault Test' });
    const title = `Keep Me ${tag} at Fault Test`;
    await page.goto(`/dashboard/cover-letters?q=${tag}`);
    await page.route(`**/api/covers/${id}`, (route) => (route.request().method() === 'DELETE' ? route.abort('failed') : route.continue()));

    const trigger = page.getByRole('button', { name: `Delete ${title}` });
    const dialog = page.getByRole('dialog', { name: 'Delete this cover letter?' });
    await trigger.click();
    await dialog.getByRole('button', { name: 'Delete permanently' }).click();
    await expect(dialog.getByRole('alert')).toContainText('The cover letter was not deleted');
    await expect(dialog).toBeVisible();
    await expect(statusRegion(page)).not.toContainText('Deleted');

    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await trigger.click();
    await expect(dialog.getByRole('alert'), 'a reopened dialog must not show the previous error').toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('link', { name: title, exact: true })).toBeVisible();
    expect((await apiAs('a').get(`/covers/${id}`)).status).toBe(200);
  });

  test('deep links: ?role=&company= opens a prefilled unsaved letter; /dashboard/cv redirects to the list', async ({ page }) => {
    const posts = countRequests(page, /\/api\/covers\//);
    await page.goto('/dashboard/cover-letters?role=Backend%20Developer&company=Acme%20Labs');
    await expect(page).toHaveURL(/\/cover-letter\/new\?role=Backend\+Developer&company=Acme\+Labs$/);
    await expect(field(page, 'Job title')).toHaveValue('Backend Developer');
    await expect(field(page, 'Company')).toHaveValue('Acme Labs');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Backend Developer at Acme Labs');
    await expect(saveState(page)).toHaveText('Not saved yet');

    await page.reload();
    await expect(field(page, 'Job title')).toHaveValue('Backend Developer');
    expect(posts, 'opening a deep link must not save anything').toEqual([]);

    await page.goto('/dashboard/cv');
    await expect(page).toHaveURL(/\/dashboard\/cover-letters$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Cover Letters' })).toBeVisible();
  });

  test('a missing letter id shows a not-found state (HTTP 404), never a blank or invented letter', async ({ page, guard }) => {
    guard.expectApiStatuses(404);
    const missing = `cl_e2e_missing_${uniqueTag()}`;
    const response = page.waitForResponse((candidate) => candidate.url().includes(`/api/covers/${missing}`));
    await page.goto(`/cover-letter/${missing}`);
    expect((await response).status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1, name: 'Cover letter not found' })).toBeVisible();
    await expect(field(page, 'Job title')).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    await page.getByRole('link', { name: 'Back to cover letters' }).click();
    await expect(page).toHaveURL(/\/dashboard\/cover-letters$/);
  });

  test('AI draft: input check, replace confirmation, and the unavailable path never changes the letter', async ({ page, guard }) => {
    test.setTimeout(180_000);
    const aiCalls = countRequests(page, /\/api\/generate-ai-cover-letter/);
    await page.goto('/cover-letter/new');
    const generate = page.getByRole('button', { name: 'Generate draft' });
    const jobTitle = field(page, 'Job title');
    const body = field(page, 'Letter text');

    await generate.click();
    await expect(statusRegion(page)).toContainText('Add the job title or the job description before generating a draft.');
    await expect(jobTitle).toHaveAttribute('aria-invalid', 'true');
    await expect(jobTitle).toBeFocused();
    expect(aiCalls).toHaveLength(0);

    await jobTitle.fill('Quality Engineer');
    await field(page, 'Company').fill('Example Test Co');
    await body.fill('My own opening paragraph.');
    await generate.click();
    const dialog = page.getByRole('dialog', { name: 'Replace your letter text?' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Keep my text' })).toBeFocused();
    await settleAnimations(dialog);
    await expectWithinViewport(page, dialog);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(generate).toBeFocused();
    expect(aiCalls, 'dismissing the confirmation must not call the AI').toHaveLength(0);

    guard.expectApiStatuses(503);
    await generate.click();
    await expect(dialog).toBeVisible();
    const ai = page.waitForResponse((response) => response.url().includes('/api/generate-ai-cover-letter'), { timeout: 120_000 });
    await dialog.getByRole('button', { name: 'Replace with AI draft' }).click();
    const response = await ai;
    if (response.status() === 503) {
      test.info().annotations.push({ type: 'environment', description: 'No AI provider is configured: the explicit unavailable path (HTTP 503) was exercised.' });
      await expect(statusRegion(page)).toContainText('AI cover letter generation is unavailable right now.');
      await expect(statusRegion(page)).toContainText('Your letter text was not changed.');
      await expect(body).toHaveValue('My own opening paragraph.');
    } else {
      expect(response.status()).toBe(200);
      const json = (await response.json()) as { coverLetter: string };
      await expect(body).toHaveValue(json.coverLetter.trim());
    }
    await expect(generate).toBeEnabled();
    await expect(generate).toBeFocused();
  });

  test('list load failure (FAULT INJECTION: request aborted) shows an error with a working retry', async ({ page, guard }) => {
    guard.allowConsole(/net::ERR_FAILED/);
    await page.route('**/api/covers', (route) => route.abort('failed'));
    await page.goto('/dashboard/cover-letters');
    const alert = page.locator('#main-content').getByRole('alert');
    await expect(alert).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'No cover letters yet' }), 'a failed load must not look like an empty account').toHaveCount(0);
    await page.unroute('**/api/covers');
    await alert.getByRole('button', { name: 'Retry' }).click();
    await expect(alert).toHaveCount(0);
    await expect(page.getByText(/^\d+ saved cover letters?$/)).toBeVisible();
  });

  test('save failure (FAULT INJECTION: request aborted) keeps the edits and does not report success', async ({ page, guard }) => {
    guard.allowConsole(/net::ERR_FAILED/);
    const tag = uniqueTag();
    await page.goto('/cover-letter/new');
    await field(page, 'Job title').fill(`Unsaved Draft ${tag}`);
    await page.route('**/api/covers/*', (route) => (route.request().method() === 'POST' ? route.abort('failed') : route.continue()));
    await saveButton(page).click();
    await expect(statusRegion(page)).toContainText('Your changes were not saved');
    await expect(saveState(page)).toHaveText('Unsaved changes');
    await expect(page).toHaveURL(/\/cover-letter\/new$/);
    await expect(field(page, 'Job title')).toHaveValue(`Unsaved Draft ${tag}`);

    await page.unroute('**/api/covers/*');
    const saved = page.waitForResponse((response) => response.request().method() === 'POST' && /\/api\/covers\/cl_/.test(response.url()));
    // Keyboard path: Enter in a field submits the editor form.
    await field(page, 'Job title').press('Enter');
    expect((await saved).status()).toBe(200);
    await expect(page).toHaveURL(/\/cover-letter\/cl_/);
    createdLetters.push({ account: 'a', id: idFromUrl(page) });
    await expect(saveState(page)).toContainText('All changes saved');
  });

  test('export: download, clipboard and print layout carry the real letter as plain text', async ({ page, context, apiAs }) => {
    const tag = uniqueTag();
    await page.goto('/cover-letter/new');
    await page.getByRole('button', { name: 'Download .txt' }).click();
    await expect(statusRegion(page)).toContainText('Add letter text first.');
    await expect(field(page, 'Letter text')).toBeFocused();

    const id = await seedLetter(apiAs('a'), 'a', {
      jobTitle: `Export Check ${tag}`, companyName: 'Litware Test', recipientName: 'Sam Lee',
      candidateFirstname: 'Avery', candidateLastname: 'Tester',
      letterBody: 'First export paragraph with <b>markup-like</b> text.\n\nSecond export paragraph.',
    });
    await page.goto(`/cover-letter/${id}`);
    await expect(field(page, 'Job title')).toHaveValue(`Export Check ${tag}`);

    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download .txt' }).click();
    const download = await downloadEvent;
    expect(download.suggestedFilename()).toBe(`cover-letter-export-check-${tag}-at-litware-test.txt`);
    const text = fs.readFileSync(await download.path(), 'utf8');
    expect(text).toContain('Avery Tester');
    expect(text).toContain('Sam Lee\nLitware Test');
    expect(text).toContain(`Re: Export Check ${tag}`);
    expect(text).toContain('First export paragraph with <b>markup-like</b> text.\n\nSecond export paragraph.');

    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(page.url()).origin });
    await page.getByRole('button', { name: 'Copy text' }).click();
    await expect(statusRegion(page)).toContainText('Letter copied to the clipboard.');
    const clipboardText = (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n').trim();
    expect(clipboardText).toBe(text.replace(/\r\n/g, '\n').trim());

    await page.getByRole('button', { name: 'Print / Save as PDF' }).click();
    const printed = await page.locator('#cover-letter-print-frame').evaluate((frame: HTMLIFrameElement) => ({
      text: frame.contentDocument?.body.textContent ?? '',
      injected: frame.contentDocument?.querySelectorAll('b, script, img').length ?? -1,
      title: frame.contentDocument?.title ?? '',
    }));
    expect(printed.text).toContain('Second export paragraph.');
    expect(printed.text).toContain('<b>markup-like</b>');
    expect(printed.injected, 'letter text must never become markup').toBe(0);
    expect(printed.title).toBe(`Export Check ${tag} at Litware Test`);
    await expectNoHorizontalOverflow(page);
  });

  test('accessibility: no axe WCAG 2.1 A/AA violations on the list, delete dialog and builder', async ({ page, apiAs }) => {
    const tag = uniqueTag();
    const id = await seedLetter(apiAs('a'), 'a', {
      jobTitle: `Accessible Letter ${tag}`, companyName: 'Axe Test', letterBody: 'Accessibility check paragraph.',
      jobDescription: 'We need a Kubernetes engineer with Terraform and observability experience. Kubernetes and Terraform daily.',
    });
    const title = `Accessible Letter ${tag} at Axe Test`;
    await page.goto(`/dashboard/cover-letters?q=${tag}`);
    await expect(page.getByRole('link', { name: title, exact: true })).toBeVisible();
    await expectNoAxeViolations(page, '#main-content');

    await page.getByRole('button', { name: `Delete ${title}` }).click();
    const dialog = page.getByRole('dialog', { name: 'Delete this cover letter?' });
    await expect(dialog).toBeVisible();
    await settleAnimations(dialog);
    await expectNoAxeViolations(page, '[role="dialog"]');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    await page.goto(`/cover-letter/${id}`);
    await expect(field(page, 'Job title')).toHaveValue(`Accessible Letter ${tag}`);
    await expect(page.getByRole('heading', { name: /Job description keywords mentioned: \d+ of \d+/ })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Keywords not mentioned yet' })).toContainText('kubernetes');
    await expectNoAxeViolations(page, '#main-content');
    if (isCompact(page)) {
      await page.getByRole('button', { name: 'Preview', exact: true }).click();
      await expect(page.locator('#cover-letter-preview')).toBeVisible();
      // Scan the settled colours, not the 150 ms colour transition of the toggle buttons.
      await settleAnimations(page.getByRole('group', { name: 'Builder view' }));
      await expectNoAxeViolations(page, '#main-content');
    }
  });

  test('templates & live A4 letterhead: selecting templates switches layout, updates badge, and persists', async ({ page, apiAs }) => {
    const tag = uniqueTag();
    const id = await seedLetter(apiAs('a'), 'a', {
      jobTitle: `Template Test ${tag}`,
      companyName: 'Acme Corp',
      candidateFirstname: 'Avery',
      candidateLastname: 'Tester',
      letterBody: 'Demonstrating dynamic template switching with executive letterhead styling.',
    });
    await page.goto(`/cover-letter/${id}`);
    await expect(field(page, 'Job title')).toHaveValue(`Template Test ${tag}`);

    // Initial state: Executive Classic (Cover1)
    const preview = page.locator('#cover-letter-preview');
    if (isCompact(page)) {
      await page.getByRole('button', { name: 'Preview', exact: true }).click();
    }
    await expect(preview.getByText('Executive Classic')).toBeVisible();

    if (isCompact(page)) {
      await page.getByRole('button', { name: 'Edit', exact: true }).click();
    }

    // Switch to Cover2 (Modern Minimalist)
    const templateCover2 = page.getByRole('radio', { name: /Modern Minimalist/ });
    await templateCover2.click();
    if (isCompact(page)) {
      await page.getByRole('button', { name: 'Preview', exact: true }).click();
    }
    await expect(preview.getByText('Modern Minimalist')).toBeVisible();

    // Switch to Cover3 (Split Sidebar)
    if (isCompact(page)) {
      await page.getByRole('button', { name: 'Edit', exact: true }).click();
    }
    const templateCover3 = page.getByRole('radio', { name: /Split Sidebar/ });
    await templateCover3.click();
    if (isCompact(page)) {
      await page.getByRole('button', { name: 'Preview', exact: true }).click();
    }
    await expect(preview.getByText('Split Sidebar')).toBeVisible();

    // Switch to Cover4 (Creative Accent)
    if (isCompact(page)) {
      await page.getByRole('button', { name: 'Edit', exact: true }).click();
    }
    const templateCover4 = page.getByRole('radio', { name: /Creative Accent/ });
    await templateCover4.click();
    if (isCompact(page)) {
      await page.getByRole('button', { name: 'Preview', exact: true }).click();
    }
    await expect(preview.getByText('Creative Accent')).toBeVisible();

    // Save with Cover4
    if (isCompact(page)) {
      await page.getByRole('button', { name: 'Edit', exact: true }).click();
    }
    const saved = page.waitForResponse((response) => response.request().method() === 'POST' && /\/api\/covers\//.test(response.url()));
    await saveButton(page).click();
    expect((await saved).status()).toBe(200);
    await expect(saveState(page)).toContainText('All changes saved');

    // Reload and verify Cover4 is persisted
    await page.reload();
    if (isCompact(page)) {
      await page.getByRole('button', { name: 'Preview', exact: true }).click();
    }
    await expect(preview.getByText('Creative Accent')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('zoom ladder & fullscreen modal: preview zoom ladder and fullscreen modal preview', async ({ page, apiAs }) => {
    const tag = uniqueTag();
    const id = await seedLetter(apiAs('a'), 'a', {
      jobTitle: `Zoom Test ${tag}`,
      companyName: 'Zoom Corp',
      candidateFirstname: 'Avery',
      candidateLastname: 'Tester',
      letterBody: 'Testing zoom controls and fullscreen modal preview.',
    });
    await page.goto(`/cover-letter/${id}`);
    if (isCompact(page)) {
      await page.getByRole('button', { name: 'Preview', exact: true }).click();
    }

    const preview = page.locator('#cover-letter-preview');
    const zoomGroup = preview.getByRole('group', { name: 'Preview zoom' });
    const zoom100 = zoomGroup.getByRole('button', { name: '1x' });
    const zoom75 = zoomGroup.getByRole('button', { name: '0.75x' });
    const zoom125 = zoomGroup.getByRole('button', { name: '1.25x' });

    await expect(zoom100).toHaveAttribute('aria-pressed', 'true');
    await zoom125.click();
    await expect(zoom125).toHaveAttribute('aria-pressed', 'true');
    await expect(zoom100).toHaveAttribute('aria-pressed', 'false');
    await zoom75.click();
    await expect(zoom75).toHaveAttribute('aria-pressed', 'true');

    // Fullscreen modal
    await preview.getByRole('button', { name: 'Fullscreen' }).click();
    const modal = page.getByRole('dialog');
    await expect(modal).toBeVisible();
    await expect(modal.getByText(/A4 Executive Print Canvas/)).toBeVisible();

    // Verify modal actions are available
    await expect(modal.getByRole('button', { name: 'Copy' })).toBeVisible();
    await expect(modal.getByRole('button', { name: 'Download .txt' })).toBeVisible();
    await expect(modal.getByRole('button', { name: 'Print / PDF' })).toBeVisible();

    // Close modal via Escape
    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden();
    await expectNoHorizontalOverflow(page);
  });

  test('ATS match score & missing keyword chips: visual gauge and interactive copy chips', async ({ page, context, apiAs }) => {
    const tag = uniqueTag();
    const id = await seedLetter(apiAs('a'), 'a', {
      jobTitle: `ATS Score Test ${tag}`,
      companyName: 'Cloud Systems',
      candidateFirstname: 'Avery',
      candidateLastname: 'Tester',
      jobDescription: 'Senior Kubernetes engineer needed with extensive Terraform, Docker, Python and Prometheus observability.',
      letterBody: 'I am applying with experience in Kubernetes and Python.',
    });
    await page.goto(`/cover-letter/${id}`);

    // Verify ATS keyword section exists with progress bar and tier badge
    const keywordsSection = page.locator('section[aria-labelledby="cover-letter-keywords"]');
    await expect(keywordsSection).toBeVisible();
    await expect(keywordsSection.getByRole('progressbar')).toBeVisible();
    await expect(keywordsSection.getByText(/ATS Match/)).toBeVisible();

    // Missing keywords include terraform, docker, prometheus
    const missingChips = keywordsSection.getByRole('list', { name: 'Keywords not mentioned yet' });
    await expect(missingChips).toBeVisible();
    const terraformChip = missingChips.getByRole('button', { name: /Copy missing keyword terraform to clipboard/i });
    await expect(terraformChip).toBeVisible();

    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(page.url()).origin });
    await terraformChip.click();
    await expect(statusRegion(page)).toContainText('Copied keyword “terraform” to clipboard.');
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText.toLowerCase()).toContain('terraform');
    await expectNoHorizontalOverflow(page);
  });

  test('Job Tracker sync: 1-click tracking from builder and from cover letters list', async ({ page, apiAs }) => {
    const tag = uniqueTag();
    const id = await seedLetter(apiAs('a'), 'a', {
      jobTitle: `Lead Architect ${tag}`,
      companyName: 'Global Corp',
      candidateFirstname: 'Avery',
      candidateLastname: 'Tester',
      letterBody: 'Seeking to lead enterprise architecture and cloud engineering.',
    });

    // 1. Sync from Builder header action
    await page.goto(`/cover-letter/${id}`);
    const trackBtn = page.getByRole('button', { name: 'Track in Job Tracker' });
    await expect(trackBtn).toBeVisible();
    await trackBtn.click();
    await expect(statusRegion(page)).toContainText('Application linked to Job Tracker as “Lead Architect');

    // 2. Sync from Cover Letters list page item card
    await page.goto('/dashboard/cover-letters');
    const search = page.getByRole('searchbox', { name: 'Search cover letters' });
    await search.fill(tag);
    const card = page.getByRole('list', { name: 'Saved cover letters' }).getByRole('listitem');
    await expect(card).toHaveCount(1);
    await expect(card.getByText('Executive Classic')).toBeVisible();

    const listTrackBtn = card.getByRole('button', { name: `Track Lead Architect ${tag} at Global Corp in Job Tracker` });
    await expect(listTrackBtn).toBeVisible();
    await listTrackBtn.click();
    await expect(statusRegion(page)).toContainText('Linked “Lead Architect');
    await expectNoHorizontalOverflow(page);
  });
});

test.describe('Cover letters (account B)', () => {
  test.use({ storageState: storageStatePath('b') });

  test('empty state: guidance and a working create action, with B’s own profile details', async ({ page, apiAs }) => {
    const api = apiAs('b');
    const existing = await api.get<{ covers: Array<{ id: string }> }>('/covers');
    // Remove only leftovers created by this suite (cl_e2e_ prefix) on the disposable test account.
    for (const cover of existing.body.covers.filter((item) => item.id.startsWith('cl_e2e_'))) await api.del(`/covers/${cover.id}`);
    const remaining = await api.get<{ covers: unknown[] }>('/covers');
    expect(remaining.body.covers, 'account B must start without cover letters').toHaveLength(0);

    await page.goto('/dashboard/cover-letters');
    await expect(page.getByRole('heading', { level: 2, name: 'No cover letters yet' })).toBeVisible();
    await expect(page.getByText('0 saved cover letters')).toBeVisible();
    await expect(page.getByRole('searchbox', { name: 'Search cover letters' })).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    await page.getByRole('link', { name: 'Write your first cover letter' }).click();
    await expect(page).toHaveURL(/\/cover-letter\/new$/);
    await expect(field(page, 'First name')).toHaveValue('Blake');
    await expect(field(page, 'Email')).toHaveValue(ACCOUNTS.b.email);
  });

  test('isolation: account A’s letter is not listed and cannot be opened, overwritten or deleted by B', async ({ page, apiAs, guard }) => {
    guard.expectApiStatuses(404);
    const tag = uniqueTag();
    const title = `Private To A ${tag}`;
    const id = await seedLetter(apiAs('a'), 'a', { jobTitle: title, companyName: 'Isolation Test', letterBody: 'Account A only.' });

    await page.goto('/dashboard/cover-letters');
    await expect(page.getByText(/^\d+ saved cover letters?$/)).toBeVisible();
    await expect(page.getByText(title)).toHaveCount(0);

    const response = page.waitForResponse((candidate) => candidate.url().includes(`/api/covers/${id}`));
    await page.goto(`/cover-letter/${id}`);
    expect((await response).status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1, name: 'Cover letter not found' })).toBeVisible();
    await expect(page.getByText('Account A only.')).toHaveCount(0);

    const b = apiAs('b');
    expect((await b.get(`/covers/${id}`)).status).toBe(404);
    const overwrite = await b.post(`/covers/${id}`, { id, jobTitle: 'Overwritten by B', letterBody: 'B wrote this' });
    expect(overwrite.status, 'the ownership guard must refuse another account').toBe(404);
    await b.del(`/covers/${id}`);
    const stillThere = await apiAs('a').get<{ cover: { jobTitle: string; letterBody: string } }>(`/covers/${id}`);
    expect(stillThere.status).toBe(200);
    expect(stillThere.body.cover.jobTitle).toBe(title);
    expect(stillThere.body.cover.letterBody).toBe('Account A only.');
  });
});
