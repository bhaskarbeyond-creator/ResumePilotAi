/**
 * Job Tracker — /dashboard/job-tracker — at the five directive profiles.
 *
 * Real stack only: UI :4000 → Express :8080 → MariaDB bridge
 * (/api/jobs-data/tracker, owner-scoped, revision-checked).
 * - Every test arranges its own jobs through the API with a unique tag in the
 *   title and company, opens the page filtered to that tag (?q=), and removes
 *   its jobs afterwards, so other data in candidate A's tracker is untouched.
 * - "Another tab or device" is the same candidate changing the job through the
 *   API while the page is open.
 * - Failure paths are labelled Playwright routes (FAULT INJECTION).
 */
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { expect, expectNoHorizontalOverflow, isCompact, storageStatePath, test, type ApiClient } from './fixtures';

interface StoredJob {
  id: string;
  title: string;
  company: string;
  status: string;
  location: string;
  workMode: string | null;
  salary: string | null;
  url: string;
  notes: string;
  dateApplied: string | null;
  deadline: string | null;
  contactPerson: string | null;
  contactEmail: string | null;
  interviewRound: string | null;
  interviewFormat: string | null;
  interviewAt: string | null;
  interviewLink: string | null;
  revision: number;
}

let tag = '';
test.beforeEach(() => { tag = `jt${randomUUID().slice(0, 8)}`; });
test.afterEach(async ({ apiAs }) => {
  for (const account of ['a', 'b'] as const) await removeTagged(apiAs(account), tag);
});

async function arrange(api: ApiClient, fields: Record<string, string>): Promise<StoredJob> {
  const { status, body } = await api.post<{ job: StoredJob }>('/jobs-data/tracker', fields);
  expect(status, 'the arranged job was created').toBe(201);
  return body.job;
}

async function stored(api: ApiClient, id: string): Promise<StoredJob | undefined> {
  const { status, body } = await api.get<{ jobs: StoredJob[] }>('/jobs-data/tracker');
  expect(status).toBe(200);
  return body.jobs.find((job) => job.id === id);
}

async function removeTagged(api: ApiClient, value: string) {
  if (!value) return;
  const { body } = await api.get<{ jobs?: StoredJob[] }>('/jobs-data/tracker');
  for (const job of (body.jobs ?? []).filter((item) => `${item.title} ${item.company}`.includes(value))) {
    await api.del(`/jobs-data/tracker/${encodeURIComponent(job.id)}`, { expectedRevision: job.revision });
  }
}

async function openTracker(page: Page, url = `/dashboard/job-tracker?q=${tag}`) {
  await page.goto(url);
  await expect(page.getByRole('heading', { level: 1, name: 'Job Tracker' })).toBeVisible();
  await expect(page.getByText('Loading your tracked jobs…')).toHaveCount(0);
}

const main = (page: Page) => page.locator('#main-content');
const status = (page: Page) => main(page).getByRole('status');
const alert = (page: Page) => main(page).getByRole('alert');
const entry = (page: Page, title: string) => page.getByRole('article', { name: title, exact: true });
const actions = (page: Page, job: { title: string; company: string }) => page.getByRole('button', { name: `Actions for ${job.title} at ${job.company}`, exact: true });
const stageSelect = (page: Page, job: { title: string; company: string }) => page.getByLabel(`Stage for ${job.title} at ${job.company}`, { exact: true });
const column = (page: Page, label: string) => page.getByRole('region', { name: new RegExp(`^${label} \\(\\d+ jobs?\\)$`) });
const inColumn = (page: Page, label: string, title: string) => column(page, label).getByRole('article', { name: title, exact: true });
const menuItem = (page: Page, name: string) => page.getByRole('menuitem', { name, exact: true });
const formDialog = (page: Page, name: string) => page.getByRole('dialog', { name });
const removeDialog = (page: Page) => page.getByRole('dialog', { name: 'Remove this job from your tracker?' });

async function openMenuItem(page: Page, job: { title: string; company: string }, item: string) {
  await actions(page, job).click();
  await menuItem(page, item).click();
}

async function expectNoAxeViolations(page: Page, scope: string) {
  const results = await new AxeBuilder({ page }).include(scope).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`)).toEqual([]);
}

function countRequests(page: Page, method: string, path: RegExp) {
  const seen: string[] = [];
  page.on('request', (request) => {
    if (request.method() === method && path.test(new URL(request.url()).pathname)) seen.push(request.url());
  });
  return seen;
}

// ── Adding and editing ──────────────────────────────────────────────────────

test('adds a job with every detail, checks the form first, and keeps it after a reload', async ({ page, apiAs }) => {
  const job = { title: `Data Analyst ${tag}`, company: `Contoso ${tag}` };
  const posts = countRequests(page, 'POST', /^\/api\/jobs-data\/tracker$/);
  await openTracker(page);
  const add = page.getByRole('button', { name: 'Track a job', exact: true });
  await add.click();
  const dialog = formDialog(page, 'Track a job');
  const field = (label: string) => dialog.getByLabel(label, { exact: true });
  await expect(field('Job title (required)')).toBeFocused();

  await dialog.getByRole('button', { name: 'Add to tracker' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Check the 2 highlighted fields.');
  await expect(field('Job title (required)')).toBeFocused();
  await expect(field('Job title (required)')).toHaveAttribute('aria-invalid', 'true');
  await expect(field('Job title (required)')).toHaveAccessibleDescription('Enter the job title.');
  await expect(field('Company (required)')).toHaveAccessibleDescription('Enter the company.');

  // Escape closes without saving; reopening starts clean (no stale values or errors).
  await field('Job title (required)').fill('Typed then abandoned');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(add).toBeFocused();
  await add.click();
  await expect(field('Job title (required)')).toHaveValue('');
  await expect(field('Job title (required)')).not.toHaveAttribute('aria-invalid', 'true');
  await expect(dialog.getByRole('alert'), 'no error is shown on reopening').toHaveCount(0);
  expect(await page.evaluate(() => getComputedStyle(document.body).overflow), 'the page behind the dialog does not scroll').toBe('hidden');

  await field('Job title (required)').fill(job.title);
  await field('Company (required)').fill(job.company);
  await field('Job posting link').fill('careers.contoso.example/jobs/1');
  await field('Contact email').fill('not-an-email');
  await dialog.getByRole('button', { name: 'Add to tracker' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Check the 2 highlighted fields.');
  await expect(field('Job posting link')).toBeFocused();
  await expect(field('Job posting link')).toHaveAccessibleDescription('Enter a web address that starts with http:// or https://.');
  await expect(field('Contact email')).toHaveAccessibleDescription('Enter an email address like name@example.com.');
  expect(posts, 'nothing is sent while the form is invalid').toEqual([]);

  await field('Job posting link').fill('https://careers.contoso.example/jobs/1');
  await field('Contact email').fill('hiring@contoso.example');
  await field('Location').fill('Chennai');
  await field('Work mode').selectOption('Hybrid');
  await field('Salary or range').fill('₹18–22 LPA');
  await field('Stage').selectOption('applied');
  await field('Date applied').fill('2026-10-05');
  await field('Apply by').fill('2026-11-15');
  await field('Contact name').fill('Meera Iyer');
  await field('Round').selectOption('Hiring Manager');
  await field('Format').selectOption('Phone');
  await field('Date and time').fill('2026-11-03T15:45');
  await field('Meeting link').fill('https://meet.example.com/contoso');
  await field('Notes').fill('Questions to ask:\n- analytics roadmap\n- team size');
  await dialog.getByRole('button', { name: 'Add to tracker' }).click();

  await expect(dialog).toBeHidden();
  await expect(add).toBeFocused();
  await expect(status(page)).toHaveText(`Added ${job.title} at ${job.company} to Applied.`);
  expect(posts).toHaveLength(1);
  const card = inColumn(page, 'Applied', job.title);
  await expect(card).toContainText(job.company);
  await expect(card).toContainText('Chennai · Hybrid');
  await expect(card).toContainText('₹18–22 LPA');
  await expect(card.locator('time[datetime="2026-10-05"]')).toHaveText(/^Applied /);
  await expect(card.locator('time[datetime="2026-11-15"]')).toHaveText(/^Apply by /);
  await expect(card.locator('time[datetime="2026-11-03T15:45"]')).toBeVisible();
  await expect(card).toContainText('Hiring Manager · Phone');
  await expect(card.getByRole('link', { name: /^Join the meeting/ })).toHaveAttribute('href', 'https://meet.example.com/contoso');
  await expect(card.getByRole('link', { name: 'hiring@contoso.example' })).toHaveAttribute('href', 'mailto:hiring@contoso.example');
  await card.getByText('Notes', { exact: true }).click();
  await expect.poll(() => card.locator('details p').evaluate((node) => (node as HTMLElement).innerText), { message: 'notes keep their line breaks' })
    .toBe('Questions to ask:\n- analytics roadmap\n- team size');

  const { body } = await apiAs('a').get<{ jobs: StoredJob[] }>('/jobs-data/tracker');
  const saved = body.jobs.find((item) => item.title === job.title);
  expect(saved).toMatchObject({
    company: job.company, status: 'applied', location: 'Chennai', workMode: 'Hybrid', salary: '₹18–22 LPA',
    url: 'https://careers.contoso.example/jobs/1', dateApplied: '2026-10-05', deadline: '2026-11-15T00:00:00.000Z',
    contactPerson: 'Meera Iyer', contactEmail: 'hiring@contoso.example', interviewRound: 'Hiring Manager',
    interviewFormat: 'Phone', interviewAt: '2026-11-03T15:45:00.000Z', interviewLink: 'https://meet.example.com/contoso',
    notes: 'Questions to ask:\n- analytics roadmap\n- team size', revision: 1,
  });

  await page.reload();
  await expect(inColumn(page, 'Applied', job.title)).toContainText('Chennai · Hybrid');
  await expectNoHorizontalOverflow(page);
});

test('edits a job, clears optional details, and skips a save with no changes', async ({ page, apiAs }) => {
  const api = apiAs('a');
  const job = await arrange(api, {
    title: `Platform Engineer ${tag}`, company: `Fabrikam ${tag}`, status: 'interview', location: 'Pune', workMode: 'Remote',
    dateApplied: '2026-09-20', contactPerson: 'Arjun Rao', contactEmail: 'arjun@fabrikam.example', interviewRound: 'Technical',
    interviewFormat: 'Video', interviewAt: '2026-10-30T11:00', interviewLink: 'https://meet.example.com/fab', notes: 'Bring the system design notes.',
  });
  const patches = countRequests(page, 'PATCH', /^\/api\/jobs-data\/tracker\//);
  await openTracker(page);
  const trigger = actions(page, job);
  const dialog = formDialog(page, `Edit ${job.title} at ${job.company}`);
  const field = (label: string) => dialog.getByLabel(label, { exact: true });

  await openMenuItem(page, job, 'Edit details');
  await expect(field('Job title (required)')).toBeFocused();
  await expect(field('Job title (required)')).toHaveValue(job.title);
  await expect(field('Work mode')).toHaveValue('Remote');
  await expect(field('Date and time')).toHaveValue('2026-10-30T11:00');
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(dialog).toBeHidden();
  await expect(status(page)).toHaveText('No changes to save.');
  await expect(trigger).toBeFocused();
  expect(patches, 'an unchanged form sends nothing').toEqual([]);

  const renamed = { title: `Senior Platform Engineer ${tag}`, company: job.company };
  await openMenuItem(page, job, 'Edit details');
  await field('Job title (required)').fill(renamed.title);
  await field('Work mode').selectOption('');
  await field('Date applied').fill('');
  await field('Contact email').fill('');
  await field('Round').selectOption('');
  await field('Format').selectOption('');
  await field('Meeting link').fill('');
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(dialog).toBeHidden();
  await expect(status(page)).toHaveText(`Saved changes to ${renamed.title} at ${renamed.company}.`);
  await expect(actions(page, renamed)).toBeFocused();
  expect(patches).toHaveLength(1);

  expect(await stored(api, job.id)).toMatchObject({
    title: renamed.title, workMode: null, dateApplied: null, contactEmail: null, interviewRound: null, interviewFormat: null,
    interviewLink: null, contactPerson: 'Arjun Rao', location: 'Pune', interviewAt: '2026-10-30T11:00:00.000Z',
    notes: 'Bring the system design notes.', revision: 2,
  });
  const card = entry(page, renamed.title);
  await expect(card).toContainText('Pune');
  await expect(card).not.toContainText('Remote');
  await expect(card.locator('time').first()).toHaveText(/^Added /);
  await page.reload();
  await expect(entry(page, renamed.title)).not.toContainText('Remote');
});

// ── Stages ──────────────────────────────────────────────────────────────────

test('moves a job between stages on the board and in the list, and keeps it after a reload', async ({ page, apiAs }) => {
  const api = apiAs('a');
  const job = await arrange(api, { title: `QA Lead ${tag}`, company: `Litware ${tag}`, status: 'wishlist' });
  await openTracker(page);
  await expect(inColumn(page, 'Wishlist', job.title)).toBeVisible();

  await stageSelect(page, job).selectOption('interview');
  await expect(inColumn(page, 'Interviewing', job.title)).toBeVisible();
  await expect(inColumn(page, 'Wishlist', job.title)).toHaveCount(0);
  await expect(status(page)).toHaveText(`Moved ${job.title} at ${job.company} to Interviewing.`);
  await expect(stageSelect(page, job)).toBeFocused();
  await expect.poll(async () => (await stored(api, job.id))?.status).toBe('interview');

  await page.reload();
  await expect(inColumn(page, 'Interviewing', job.title)).toBeVisible();

  await page.getByRole('button', { name: 'List', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Tracked jobs' }).getByRole('article', { name: job.title, exact: true })).toBeVisible();
  await stageSelect(page, job).selectOption('offer');
  await expect(status(page)).toHaveText(`Moved ${job.title} at ${job.company} to Offer.`);
  await expect(stageSelect(page, job)).toHaveValue('offer');
  await expect.poll(async () => (await stored(api, job.id))?.status).toBe('offer');
});

test('moves a job to the next stage in one click and keeps focus on that control', async ({ page, apiAs }) => {
  const api = apiAs('a');
  const job = await arrange(api, { title: `Support Analyst ${tag}`, company: `Fabrikam ${tag}`, status: 'wishlist' });
  await openTracker(page);
  const advance = (next: string) => page.getByRole('button', { name: `Move to ${next}: ${job.title} at ${job.company}`, exact: true });

  await advance('Applied').click();
  await expect(inColumn(page, 'Applied', job.title)).toBeVisible();
  await expect(status(page)).toHaveText(`Moved ${job.title} at ${job.company} to Applied.`);
  await expect(advance('Interviewing')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(inColumn(page, 'Interviewing', job.title)).toBeVisible();
  await expect(advance('Offer')).toBeFocused();
  // While a move is being saved the control is marked unavailable and ignores presses.
  await expect(status(page)).toHaveText(`Moved ${job.title} at ${job.company} to Interviewing.`);
  await expect(advance('Offer')).not.toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Space');
  await expect(inColumn(page, 'Offer', job.title)).toBeVisible();
  await expect(entry(page, job.title).getByRole('button', { name: /^Move to / }), 'an offer has no automatic next stage').toHaveCount(0);
  await expect(stageSelect(page, job)).toBeFocused();
  await expect.poll(async () => (await stored(api, job.id))?.status).toBe('offer');
  expect((await stored(api, job.id))?.revision).toBe(4);
});

test('drags a job to another stage on the board with a pointer', async ({ page, apiAs }) => {
  test.skip(isCompact(page), 'Drag and drop is a pointer feature of the wide board; touch and keyboard use the Stage control (tested above).');
  const api = apiAs('a');
  const job = await arrange(api, { title: `Pricing Lead ${tag}`, company: `Contoso ${tag}`, status: 'applied' });
  await openTracker(page);
  await expect(page.getByText('Drag a job to another stage, or use its Stage control.')).toBeVisible();
  await inColumn(page, 'Applied', job.title).dragTo(column(page, 'Offer'));
  await expect(inColumn(page, 'Offer', job.title)).toBeVisible();
  await expect(status(page)).toHaveText(`Moved ${job.title} at ${job.company} to Offer.`);
  await expect.poll(async () => (await stored(api, job.id))?.status).toBe('offer');
  await page.reload();
  await expect(inColumn(page, 'Offer', job.title)).toBeVisible();
});

test('a failed move leaves the job where it was and says so (FAULT INJECTION: request aborted)', async ({ page, apiAs, guard }) => {
  const api = apiAs('a');
  const job = await arrange(api, { title: `SRE ${tag}`, company: `Tailspin ${tag}`, status: 'applied' });
  await openTracker(page);
  guard.allowConsole(/net::ERR_FAILED/);
  await page.route('**/api/jobs-data/tracker/*', (route) => (route.request().method() === 'PATCH' ? route.abort('failed') : route.continue()));

  await stageSelect(page, job).selectOption('offer');
  await expect(alert(page)).toHaveText(`${job.title} at ${job.company} couldn’t be moved, so it stays in Applied. Check your connection and try again.`);
  await expect(inColumn(page, 'Applied', job.title)).toBeVisible();
  await expect(stageSelect(page, job)).toHaveValue('applied');
  await expect(stageSelect(page, job)).toBeFocused();
  expect((await stored(api, job.id))?.status).toBe('applied');
});

test('a move after the job changed in another tab reloads it instead of overwriting', async ({ page, apiAs, guard }) => {
  const api = apiAs('a');
  const job = await arrange(api, { title: `Analytics Lead ${tag}`, company: `Northwind ${tag}`, status: 'wishlist', notes: 'First note.' });
  await openTracker(page);
  const other = await api.patch(`/jobs-data/tracker/${encodeURIComponent(job.id)}`, { notes: 'Updated in another tab.', expectedRevision: 1 });
  expect(other.status).toBe(200);
  guard.expectApiStatuses(409);

  await stageSelect(page, job).selectOption('applied');
  await expect(alert(page)).toHaveText(`${job.title} at ${job.company} was changed in another tab or device, so it wasn’t moved. Its latest version is shown; try again.`);
  await expect(inColumn(page, 'Wishlist', job.title)).toBeVisible();
  const card = entry(page, job.title);
  await card.getByText('Notes', { exact: true }).click();
  await expect(card.locator('details p')).toHaveText('Updated in another tab.');

  await stageSelect(page, job).selectOption('applied');
  await expect(status(page)).toHaveText(`Moved ${job.title} at ${job.company} to Applied.`);
  expect(await stored(api, job.id)).toMatchObject({ status: 'applied', notes: 'Updated in another tab.', revision: 3 });
});

test('an edit saved after another tab changed the job keeps the edits and merges them', async ({ page, apiAs, guard }) => {
  const api = apiAs('a');
  const job = await arrange(api, { title: `Data Scientist ${tag}`, company: `Adatum ${tag}`, status: 'applied', salary: '₹20 LPA' });
  await openTracker(page);
  await openMenuItem(page, job, 'Edit details');
  const dialog = formDialog(page, `Edit ${job.title} at ${job.company}`);
  await dialog.getByLabel('Location', { exact: true }).fill('Mumbai');
  expect((await api.patch(`/jobs-data/tracker/${encodeURIComponent(job.id)}`, { salary: '₹24 LPA', expectedRevision: 1 })).status).toBe(200);
  guard.expectApiStatuses(409);

  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('This job was changed in another tab or device. Your edits are still here: select Save changes to apply them on top of the latest version, or Cancel to discard them.');
  await expect(dialog.getByLabel('Location', { exact: true })).toHaveValue('Mumbai');
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(dialog).toBeHidden();
  await expect(status(page)).toHaveText(`Saved changes to ${job.title} at ${job.company}.`);
  expect(await stored(api, job.id)).toMatchObject({ location: 'Mumbai', salary: '₹24 LPA', revision: 3 });
  await expect(entry(page, job.title)).toContainText('₹24 LPA');
  await expect(entry(page, job.title)).toContainText('Mumbai');
});

// ── Removing ────────────────────────────────────────────────────────────────

test('removes a job only after confirming; Cancel and Escape keep it, and focus moves to the next job', async ({ page, apiAs }) => {
  const api = apiAs('a');
  const first = await arrange(api, { title: `Product Analyst ${tag}`, company: `Alpha ${tag}`, status: 'applied', dateApplied: '2026-10-01' });
  const second = await arrange(api, { title: `Growth Analyst ${tag}`, company: `Beta ${tag}`, status: 'applied' });
  await openTracker(page, `/dashboard/job-tracker?q=${tag}&view=list&sort=company`);
  const dialog = removeDialog(page);

  await openMenuItem(page, first, 'Remove from tracker…');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAccessibleDescription(`${first.title} at ${first.company} will be removed from your tracker. This can’t be undone, and it doesn’t withdraw an application you have sent.`);
  await expect(dialog.getByRole('definition').first()).toHaveText('Applied');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await expect(actions(page, first)).toBeFocused();

  await openMenuItem(page, first, 'Remove from tracker…');
  await expect(dialog).toBeVisible();
  for (let step = 0; step < 4; step += 1) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate((node) => node.contains(document.activeElement)), 'focus stays in the dialog').toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(actions(page, first)).toBeFocused();
  expect(await stored(api, first.id), 'Cancel and Escape remove nothing').toBeDefined();

  await openMenuItem(page, first, 'Remove from tracker…');
  await dialog.getByRole('button', { name: 'Remove job' }).click();
  await expect(dialog).toBeHidden();
  await expect(status(page)).toHaveText(`Removed ${first.title} at ${first.company} from your tracker.`);
  await expect(entry(page, first.title)).toHaveCount(0);
  await expect(actions(page, second)).toBeFocused();
  expect(await stored(api, first.id)).toBeUndefined();
  await page.reload();
  await expect(entry(page, second.title)).toBeVisible();
  await expect(entry(page, first.title)).toHaveCount(0);
});

test('a failed removal keeps the job and says so (FAULT INJECTION: HTTP 503); a job removed elsewhere is reported', async ({ page, apiAs, guard }) => {
  const api = apiAs('a');
  const job = await arrange(api, { title: `BI Analyst ${tag}`, company: `Wingtip ${tag}`, status: 'wishlist' });
  await openTracker(page);
  guard.expectApiStatuses(503, 404);
  await page.route('**/api/jobs-data/tracker/*', (route) => (route.request().method() === 'DELETE'
    ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Service unavailable' }) })
    : route.continue()));
  const dialog = removeDialog(page);

  await openMenuItem(page, job, 'Remove from tracker…');
  await dialog.getByRole('button', { name: 'Remove job' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('The job tracker could not be reached, so nothing was changed. Try again.');
  await expect(dialog).toBeVisible();
  expect(await stored(api, job.id), 'still stored after the failed request').toBeDefined();
  // Closing and reopening shows no stale error.
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).overflow), { message: 'scrolling is restored after the dialog closes' }).not.toBe('hidden');
  await openMenuItem(page, job, 'Remove from tracker…');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('alert'), 'no old error is shown on reopening').toHaveCount(0);

  await page.unroute('**/api/jobs-data/tracker/*');
  expect((await api.del(`/jobs-data/tracker/${encodeURIComponent(job.id)}`, { expectedRevision: 1 })).status, 'removed in another tab').toBe(200);
  await dialog.getByRole('button', { name: 'Remove job' }).click();
  await expect(dialog).toBeHidden();
  await expect(status(page)).toHaveText(`${job.title} at ${job.company} had already been removed in another tab or device.`);
  await expect(entry(page, job.title)).toHaveCount(0);
  await expect(page.locator('#tracker-heading')).toBeFocused();
});

test('removing a job that changed in another tab shows its latest details before removing it', async ({ page, apiAs, guard }) => {
  const api = apiAs('a');
  const job = await arrange(api, { title: `Insights Analyst ${tag}`, company: `Proseware ${tag}`, status: 'applied' });
  await openTracker(page);
  const dialog = removeDialog(page);
  await openMenuItem(page, job, 'Remove from tracker…');
  expect((await api.patch(`/jobs-data/tracker/${encodeURIComponent(job.id)}`, { status: 'offer', expectedRevision: 1 })).status).toBe(200);
  guard.expectApiStatuses(409);

  await dialog.getByRole('button', { name: 'Remove job' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('This job was changed in another tab or device. Its latest details are shown below; remove it again if you still want to.');
  await expect(dialog.getByRole('definition').first()).toHaveText('Offer');
  expect(await stored(api, job.id)).toMatchObject({ status: 'offer', revision: 2 });
  await dialog.getByRole('button', { name: 'Remove job' }).click();
  await expect(dialog).toBeHidden();
  await expect(status(page)).toHaveText(`Removed ${job.title} at ${job.company} from your tracker.`);
  expect(await stored(api, job.id)).toBeUndefined();
});

// ── Search, sort, view and the URL ──────────────────────────────────────────

test('search, sort and view live in the URL and survive a reload and Back/Forward; no results can be cleared', async ({ page, apiAs }) => {
  const api = apiAs('a');
  const gamma = await arrange(api, { title: `Reporting Analyst ${tag}`, company: `Gamma ${tag}`, status: 'applied', deadline: '2026-12-20' });
  const alpha = await arrange(api, { title: `Pricing Analyst ${tag}`, company: `Alpha ${tag}`, status: 'wishlist', deadline: '2026-11-05' });
  const beta = await arrange(api, { title: `Risk Analyst ${tag}`, company: `Beta ${tag}`, status: 'offer', location: 'Hyderabad' });
  await openTracker(page);
  const search = page.getByRole('searchbox', { name: 'Search tracked jobs' });
  await expect(search).toHaveValue(tag);
  await expect(page.getByRole('button', { name: 'Board', exact: true })).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'List', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`\\?q=${tag}&view=list$`));
  await page.getByLabel('Sort by').selectOption('company');
  await expect(page).toHaveURL(new RegExp(`view=list&sort=company$`));
  const titles = page.getByRole('list', { name: 'Tracked jobs' }).getByRole('heading', { level: 3 });
  await expect(titles).toHaveText([alpha.title, beta.title, gamma.title]);
  await page.getByLabel('Sort by').selectOption('deadline');
  await expect(titles).toHaveText([alpha.title, gamma.title, beta.title]);

  await page.reload();
  await expect(page.getByRole('button', { name: 'List', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Sort by')).toHaveValue('deadline');
  await expect(titles).toHaveText([alpha.title, gamma.title, beta.title]);

  await search.fill(`${tag} hyderabad`);
  await expect(titles).toHaveText([beta.title]);
  await expect(page).toHaveURL(/q=jt[0-9a-f]+\+hyderabad/);

  await page.goto('/dashboard');
  await page.goBack();
  await expect(search).toHaveValue(`${tag} hyderabad`);
  await expect(page.getByLabel('Sort by')).toHaveValue('deadline');
  await expect(titles).toHaveText([beta.title]);
  await page.goForward();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goBack();
  await expect(titles).toHaveText([beta.title]);

  await search.fill(`${tag} no-such-job`);
  await expect(page.getByText(`No tracked jobs match “${tag} no-such-job”.`)).toBeVisible();
  const results = page.getByRole('region', { name: 'All tracked jobs' });
  await results.getByRole('button', { name: 'Clear search' }).click();
  await expect(search).toHaveValue('');
  await expect(page).not.toHaveURL(/[?&]q=/);
  await expect(entry(page, alpha.title)).toBeVisible();
  await expect(entry(page, gamma.title)).toBeVisible();
});

// ── Loading, empty and error states ─────────────────────────────────────────

test.describe('an account with no tracked jobs (candidate B)', () => {
  test.use({ storageState: storageStatePath('b') });

  test('shows an honest empty state and adds the first job from it', async ({ page, apiAs }) => {
    const { body } = await apiAs('b').get<{ jobs: StoredJob[] }>('/jobs-data/tracker');
    expect(body.jobs, 'candidate B starts with an empty tracker').toEqual([]);
    await openTracker(page, '/dashboard/job-tracker');
    await expect(page.getByRole('heading', { name: 'No tracked jobs yet' })).toBeVisible();
    await expect(page.getByRole('searchbox')).toHaveCount(0);
    await expect(page.getByRole('list', { name: 'Jobs by stage' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Track your first job' }).click();
    const dialog = formDialog(page, 'Track a job');
    const job = { title: `Junior Analyst ${tag}`, company: `Fourth Coffee ${tag}` };
    await dialog.getByLabel('Job title (required)').fill(job.title);
    await dialog.getByLabel('Company (required)').fill(job.company);
    await dialog.getByRole('button', { name: 'Add to tracker' }).click();
    await expect(dialog).toBeHidden();
    await expect(status(page)).toHaveText(`Added ${job.title} at ${job.company} to Wishlist.`);
    await expect(actions(page, job)).toBeFocused();
    await expect(inColumn(page, 'Wishlist', job.title)).toBeVisible();
    await expect(page.getByText('1 job tracked.')).toBeVisible();
    const after = await apiAs('b').get<{ jobs: StoredJob[] }>('/jobs-data/tracker');
    expect(after.body.jobs.map((item) => item.title)).toEqual([job.title]);
  });
});

test('when the tracker can’t be loaded it says so, never shows an empty tracker, and Try again recovers (FAULT INJECTION: HTTP 503)', async ({ page, apiAs, guard }) => {
  const job = await arrange(apiAs('a'), { title: `Ops Analyst ${tag}`, company: `Margie ${tag}`, status: 'applied' });
  guard.expectApiStatuses(503);
  let failing = true;
  await page.route('**/api/jobs-data/tracker', (route) => (failing && route.request().method() === 'GET'
    ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Service unavailable' }) })
    : route.continue()));
  await page.goto(`/dashboard/job-tracker?q=${tag}`);
  const loadError = alert(page).filter({ hasText: 'Your tracked jobs couldn’t be loaded. Check your connection and try again.' });
  await expect(loadError).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No tracked jobs yet' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Track a job', exact: true })).toBeVisible();

  failing = false;
  await loadError.getByRole('button', { name: 'Try again' }).click();
  await expect(inColumn(page, 'Applied', job.title)).toBeVisible();
  await expect(loadError).toHaveCount(0);
});

// ── Interview calendar file and cover letter ────────────────────────────────

test('adds an interview to a calendar as an .ics file at the time the candidate entered', async ({ page, apiAs }) => {
  const job = await arrange(apiAs('a'), {
    title: `Analytics Manager ${tag}`, company: `Contoso, Ltd ${tag}`, status: 'interview', interviewRound: 'Hiring Manager',
    interviewFormat: 'Video', interviewAt: '2026-11-03T15:45', interviewLink: 'https://meet.example.com/final', contactPerson: 'Priya Nair',
  });
  await openTracker(page);
  // The summary covers the whole tracker, so count every upcoming interview candidate A has.
  const { body } = await apiAs('a').get<{ jobs: StoredJob[] }>('/jobs-data/tracker');
  const upcoming = body.jobs.filter((item) => item.interviewAt && new Date(item.interviewAt.slice(0, 16).replace(' ', 'T')) > new Date()).length;
  expect(upcoming).toBeGreaterThanOrEqual(1);
  await expect(page.getByRole('list', { name: 'Jobs by stage' })).toContainText(upcoming === 1 ? '1 upcoming interview' : `${upcoming} upcoming interviews`);
  const card = inColumn(page, 'Interviewing', job.title);
  await expect(card).toContainText('Upcoming');

  const download = page.waitForEvent('download');
  await openMenuItem(page, job, 'Add interview to calendar (.ics)');
  const file = await download;
  expect(file.suggestedFilename()).toBe(`interview-contoso-ltd-${tag}-2026-11-03.ics`);
  const content = fs.readFileSync(await file.path(), 'utf8');
  expect(content.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
  expect(content).toContain('\r\nDTSTART:20261103T154500\r\n');
  expect(content).toContain('\r\nDTEND:20261103T164500\r\n');
  expect(content).toContain(`\r\nUID:${job.id}-interview@ime365\r\n`);
  expect(content.replace(/\r\n /g, '')).toContain(`SUMMARY:Interview: ${job.title} at Contoso\\, Ltd ${tag}`);
  expect(content.replace(/\r\n /g, '')).toContain('DESCRIPTION:Round: Hiring Manager\\nFormat: Video\\nMeeting link: https://meet.example.com/final\\nContact: Priya Nair');
  expect(content).toContain('\r\nLOCATION:https://meet.example.com/final\r\n');
  expect(content.endsWith('END:VEVENT\r\nEND:VCALENDAR\r\n')).toBe(true);
  for (const line of content.split('\r\n')) expect(Buffer.byteLength(line), `line folded at 75 octets: ${line}`).toBeLessThanOrEqual(75);
  await expect(status(page)).toHaveText(`Downloaded ${file.suggestedFilename()}. Open it to add the interview to your calendar.`);
});

test('Write a cover letter opens a new letter with the job’s title and company, without saving anything', async ({ page, apiAs }) => {
  const job = await arrange(apiAs('a'), { title: `Data Steward ${tag}`, company: `Lucerne ${tag}`, status: 'wishlist' });
  const coverWrites = countRequests(page, 'POST', /^\/api\/covers/);
  await openTracker(page);
  await openMenuItem(page, job, 'Write a cover letter');
  await expect(page).toHaveURL(new RegExp(`/cover-letter/new\\?role=Data\\+Steward\\+${tag}&company=Lucerne\\+${tag}$`));
  await expect(page.getByLabel('Job title', { exact: true })).toHaveValue(job.title);
  await expect(page.getByLabel('Company', { exact: true })).toHaveValue(job.company);
  expect(coverWrites).toEqual([]);
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/dashboard/job-tracker\\?q=${tag}$`));
  await expect(entry(page, job.title)).toBeVisible();
});

// ── Privacy ─────────────────────────────────────────────────────────────────

test('another candidate cannot see, change or remove these jobs, and nothing works without signing in', async ({ page, apiAs, request }) => {
  const job = await arrange(apiAs('a'), { title: `Finance Analyst ${tag}`, company: `Coho ${tag}`, status: 'applied', notes: 'Private note.' });
  const path = `/jobs-data/tracker/${encodeURIComponent(job.id)}`;
  const b = apiAs('b');
  const listed = await b.get<{ jobs: StoredJob[] }>('/jobs-data/tracker');
  expect(listed.body.jobs.some((item) => item.id === job.id)).toBe(false);
  expect((await b.patch(path, { title: 'Taken over', expectedRevision: 1 })).status).toBe(404);
  expect((await b.del(path, { expectedRevision: 1 })).status).toBe(404);
  expect((await request.get('/api/jobs-data/tracker')).status(), 'no token, no list').toBe(401);
  expect((await request.patch(`/api${path}`, { data: { title: 'x', expectedRevision: 1 } })).status()).toBe(401);
  expect((await request.delete(`/api${path}`, { data: { expectedRevision: 1 } })).status()).toBe(401);
  expect(await stored(apiAs('a'), job.id)).toMatchObject({ title: job.title, notes: 'Private note.', revision: 1 });

  await openTracker(page);
  await expect(entry(page, job.title)).toBeVisible();
});

// ── Keyboard, accessibility and layout ──────────────────────────────────────

test('works with the keyboard and has no axe violations on the page, the form and the remove dialog', async ({ page, apiAs }) => {
  const job = await arrange(apiAs('a'), {
    title: `Analytics Engineer ${tag}`, company: `Trey ${tag}`, status: 'interview', location: 'Remote', salary: '₹30 LPA',
    deadline: '2026-01-10', interviewAt: '2026-11-12T10:00', interviewLink: 'https://meet.example.com/trey', contactEmail: 'talent@trey.example',
    notes: 'Panel of three.', url: 'https://trey.example/jobs/9',
  });
  await openTracker(page);
  const trigger = actions(page, job);
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(menuItem(page, 'Edit details')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menuItem(page, 'Change interview')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expectNoAxeViolations(page, '#main-content');

  await page.keyboard.press('Enter');
  await expect(menuItem(page, 'Edit details')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menuItem(page, 'Change interview')).toBeFocused();
  await page.keyboard.press('Enter');
  const dialog = formDialog(page, `Edit ${job.title} at ${job.company}`);
  await expect(dialog.getByLabel('Round', { exact: true })).toBeFocused();
  await expectNoAxeViolations(page, '[role="dialog"]');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();

  await openMenuItem(page, job, 'Remove from tracker…');
  await expect(removeDialog(page)).toBeVisible();
  await expectNoAxeViolations(page, '[role="dialog"]');
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
});

test('the board, the list, the menu and the form fit the screen without sideways scrolling', async ({ page, apiAs }) => {
  const job = await arrange(apiAs('a'), {
    title: `Principal Business Intelligence and Data Visualisation Specialist ${tag}`, company: `Northwind Traders International ${tag}`,
    status: 'applied', location: 'Bengaluru', workMode: 'On-site', salary: '₹40–48 LPA', contactEmail: 'very.long.recruiter.address@northwind-traders.example',
    interviewAt: '2026-11-20T09:30', interviewRound: 'Behavioral', interviewFormat: 'In-Person',
  });
  await openTracker(page);
  const viewport = page.viewportSize()!;
  await expect(inColumn(page, 'Applied', job.title)).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await actions(page, job).click();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  const box = (await menu.boundingBox())!;
  expect(box.x, 'the menu starts inside the screen').toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, 'the menu ends inside the screen').toBeLessThanOrEqual(viewport.width);
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'List', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Tracked jobs' }).getByRole('article', { name: job.title })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  const card = (await entry(page, job.title).boundingBox())!;
  expect(card.x + card.width).toBeLessThanOrEqual(viewport.width);

  await openMenuItem(page, job, 'Edit details');
  const dialog = formDialog(page, `Edit ${job.title} at ${job.company}`);
  const dialogBox = (await dialog.boundingBox())!;
  expect(dialogBox.x).toBeGreaterThanOrEqual(0);
  expect(dialogBox.x + dialogBox.width).toBeLessThanOrEqual(viewport.width);
  await dialog.getByRole('button', { name: 'Save changes' }).scrollIntoViewIfNeeded();
  await expect(dialog.getByRole('button', { name: 'Save changes' })).toBeInViewport();
  await expectNoHorizontalOverflow(page);
});
