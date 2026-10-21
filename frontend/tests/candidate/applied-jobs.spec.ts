/**
 * Applied Jobs — /dashboard/applied-jobs — at the five directive profiles (P002 C14).
 *
 * Real stack: UI :4000 → Express :8080 → MariaDB bridge.
 * - Applications are made the way candidates make them: candidate A (and B)
 *   apply through POST /api/jobs/:jobId/applications to jobs owned by the test
 *   employer, who changes their status (PATCH /api/job-applications/:id/status)
 *   and closes one job, all through the API (tests/candidate/arrange-applications.ts).
 *   Only the job rows are inserted directly: preview identities cannot hold the
 *   employer claim that job creation requires.
 * - The page reads /api/jobs-data/applications/list and withdraws through
 *   DELETE /api/jobs-data/applications/:id; "Add to Job Tracker" writes
 *   /api/jobs-data/tracker. Every test cleans up what it made.
 * - Failure paths are labelled Playwright routes (FAULT INJECTION); one test
 *   replays row shapes the current workflows cannot produce (LABELLED MOCK).
 */
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, expectNoHorizontalOverflow, isCompact, storageStatePath, test, type ApiClient } from './fixtures';
import {
  APPLIED_JOBS, applyAs, arrangeAppliedJobs, coverLetterFor, removeArranged, type ArrangedJob,
} from './arrange-applications';

interface ListedApplication {
  id: string;
  jobId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  applicantPhone: string;
  resumeId: string | null;
  job: { title: string; company: string; location: string; listed: boolean };
  [key: string]: unknown;
}
interface TrackedRow { id: string; title: string; company: string; status: string; location: string; dateApplied: string | null; revision: number }

const { platform, analyst, designer } = APPLIED_JOBS;
const name = (job: ArrangedJob) => `${job.title} at ${job.company}`;
const seededResumes: string[] = [];

test.afterEach(async ({ apiAs }) => {
  const api = apiAs('a');
  const ours = Object.values(APPLIED_JOBS);
  const { body } = await api.get<{ jobs?: TrackedRow[] }>('/jobs-data/tracker');
  for (const row of body.jobs ?? []) {
    const same = (left: string, right: string) => left.trim().toLocaleLowerCase() === right.trim().toLocaleLowerCase();
    if (ours.some((job) => same(row.title, job.title) && same(row.company, job.company))) {
      await api.del(`/jobs-data/tracker/${encodeURIComponent(row.id)}`, { expectedRevision: row.revision });
    }
  }
  while (seededResumes.length) await api.del(`/resumes/${encodeURIComponent(seededResumes.pop()!)}`);
});
test.afterAll(() => { removeArranged(); });

async function listOf(api: ApiClient): Promise<ListedApplication[]> {
  const { status, body } = await api.get<{ applications: ListedApplication[] }>('/jobs-data/applications/list');
  expect(status).toBe(200);
  return body.applications;
}

async function trackedOf(api: ApiClient): Promise<TrackedRow[]> {
  const { status, body } = await api.get<{ jobs: TrackedRow[] }>('/jobs-data/tracker');
  expect(status).toBe(200);
  return body.jobs;
}

async function openPage(page: Page, url = '/dashboard/applied-jobs') {
  await page.goto(url);
  await expect(page.getByRole('heading', { level: 1, name: 'Applied Jobs' })).toBeVisible();
  await expect(page.getByText('Loading your applications…')).toHaveCount(0);
}

const main = (page: Page) => page.locator('#main-content');
const statusRegion = (page: Page, text: string | RegExp) => main(page).getByRole('status').filter({ hasText: text });
const alertRegion = (page: Page, text: string | RegExp) => main(page).getByRole('alert').filter({ hasText: text });
const entry = (page: Page, job: ArrangedJob) => page.getByRole('article', { name: job.title, exact: true });
// Auto-retrying: the list re-renders after a filter, sort or reload.
const titles = (page: Page) => page.getByRole('list', { name: 'Applications', exact: true }).getByRole('heading', { level: 3 });
const summaryItems = (page: Page) => page.getByRole('list', { name: 'Applications by status' }).getByRole('listitem');
const details = (page: Page, job: ArrangedJob) => page.getByRole('button', { name: `Details for ${name(job)}`, exact: true });
const hideDetails = (page: Page, job: ArrangedJob) => page.getByRole('button', { name: `Hide details for ${name(job)}`, exact: true });
const withdrawButton = (page: Page, job: ArrangedJob) => page.getByRole('button', { name: `Withdraw application for ${name(job)}`, exact: true });
const addButton = (page: Page, job: ArrangedJob) => page.getByRole('button', { name: `Add to Job Tracker: ${name(job)}`, exact: true });
const trackerLink = (page: Page, job: ArrangedJob) => page.getByRole('link', { name: `Open in Job Tracker: ${name(job)}`, exact: true });
const withdrawDialog = (page: Page) => page.getByRole('dialog', { name: 'Withdraw your application?' });
const search = (page: Page) => page.getByRole('searchbox', { name: 'Search applications' });
const statusFilter = (page: Page) => page.getByRole('combobox', { name: 'Status', exact: true });
const sortSelect = (page: Page) => page.getByRole('combobox', { name: 'Sort by', exact: true });

async function openNavigation(page: Page) {
  if (isCompact(page)) await page.getByRole('button', { name: 'Open menu' }).click();
}

async function expectNoAxeViolations(page: Page, scope: string) {
  const results = await new AxeBuilder({ page }).include(scope).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`)).toEqual([]);
}

/** YYYY-MM-DD of an instant in the browser's time zone (what the page computes). */
const localDay = (page: Page, iso: string) => page.evaluate((value) => {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}, iso);

// ── Reading ─────────────────────────────────────────────────────────────────

test('lists candidate A’s own applications with the job, status and date, and nothing of candidate B’s', async ({ page, request, apiAs }) => {
  const arranged = await arrangeAppliedJobs(request);
  await openPage(page);

  await expect(page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Applied Jobs' })).toHaveAttribute('aria-current', 'page');
  await expect(summaryItems(page)).toHaveText(['1 Submitted', '1 Interview', '0 Accepted', '1 Not selected']);
  await expect(page.getByText('3 applications', { exact: true })).toBeVisible();
  // Newest first: the designer application was sent last.
  await expect(titles(page)).toHaveText([designer.title, analyst.title, platform.title]);

  const rows = await listOf(apiAs('a'));
  expect(rows.map((row) => row.id).sort()).toEqual(Object.values(arranged.ids).sort());
  for (const [job, label] of [[designer, 'Interview'], [analyst, 'Not selected'], [platform, 'Submitted']] as const) {
    const card = entry(page, job);
    await expect(card).toContainText(job.company);
    await expect(card).toContainText('Remote');
    await expect(card).toContainText(`Status: ${label}`);
    const sent = rows.find((row) => row.jobId === job.id)!;
    await expect(card.locator('time').first()).toHaveAttribute('datetime', sent.createdAt);
    await expect(card.locator('time').first()).toHaveText(/^Applied \S/);
  }
  // The employer closed the analyst job: the application still names it.
  await expect(entry(page, analyst)).toContainText('Not currently listed on the job board');
  await expect(entry(page, designer)).not.toContainText('Not currently listed');
  // Candidate B applied to the platform job too; only A's application is listed.
  await expect(page.getByRole('article', { name: platform.title, exact: true })).toHaveCount(1);
  // What the API gives the candidate: none of the employer's own fields.
  for (const row of rows) {
    for (const key of ['rating', 'notes', 'employer_id', 'employerId', 'extra_json', 'revision', 'applicant_id']) expect(row, key).not.toHaveProperty(key);
  }
  expect(rows.map((row) => row.id)).not.toContain(arranged.blake);
  await expectNoHorizontalOverflow(page);
});

test('search, status filter and sort live in the URL: reload, direct links and Back/Forward keep them', async ({ page, request }) => {
  await arrangeAppliedJobs(request);
  await openPage(page);

  await search(page).fill('northwind');
  await expect(page).toHaveURL(/[?&]q=northwind(&|$)/);
  await expect(titles(page)).toHaveText([analyst.title]);
  await expect(page.getByText('Showing 1 of 3 applications', { exact: true })).toBeVisible();

  await statusFilter(page).selectOption({ label: 'Interview' });
  await expect(page).toHaveURL(/[?&]status=interview(&|$)/);
  await expect(page.getByText('No applications match your filters.')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/applied-jobs$/);
  await expect(search(page)).toHaveValue('');
  await expect(statusFilter(page)).toHaveValue('all');
  await expect(titles(page)).toHaveText([designer.title, analyst.title, platform.title]);

  await sortSelect(page).selectOption({ label: 'Company, A to Z' });
  await expect(page).toHaveURL(/[?&]sort=company(&|$)/);
  // Contoso, Example, Northwind.
  await expect(titles(page)).toHaveText([designer.title, platform.title, analyst.title]);
  await sortSelect(page).selectOption({ label: 'Last updated' });
  // The employer changed the analyst application last, then the designer one; the platform one never.
  await expect(titles(page)).toHaveText([analyst.title, designer.title, platform.title]);
  await sortSelect(page).selectOption({ label: 'Date applied, oldest first' });
  await expect(titles(page)).toHaveText([platform.title, analyst.title, designer.title]);
  await statusFilter(page).selectOption({ label: 'Not selected' });
  await expect(page).toHaveURL(/status=rejected/);
  await expect(page).toHaveURL(/sort=oldest/);
  await expect(titles(page)).toHaveText([analyst.title]);

  await page.reload();
  await expect(statusFilter(page)).toHaveValue('rejected');
  await expect(sortSelect(page)).toHaveValue('oldest');
  await expect(titles(page)).toHaveText([analyst.title]);

  // Leave through the navigation, come Back, then Forward again.
  await openNavigation(page);
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Job Tracker', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Job Tracker' })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/dashboard\/applied-jobs\?/);
  await expect(statusFilter(page)).toHaveValue('rejected');
  await expect(titles(page)).toHaveText([analyst.title]);
  await page.goForward();
  await expect(page.getByRole('heading', { level: 1, name: 'Job Tracker' })).toBeVisible();

  // A direct link opens with its filters applied.
  await openPage(page, '/dashboard/applied-jobs?status=pending&sort=oldest&q=engineer');
  await expect(search(page)).toHaveValue('engineer');
  await expect(statusFilter(page)).toHaveValue('pending');
  await expect(titles(page)).toHaveText([platform.title]);
  // Values the page does not know fall back to the defaults.
  await openPage(page, '/dashboard/applied-jobs?status=hired&sort=random');
  await expect(statusFilter(page)).toHaveValue('all');
  await expect(sortSelect(page)).toHaveValue('newest');
  await expect(titles(page)).toHaveText([designer.title, analyst.title, platform.title]);
  await expectNoHorizontalOverflow(page);
});

test('details show exactly what was sent, including the resume by name, and say so once that resume is deleted', async ({ page, request, apiAs }) => {
  const api = apiAs('a');
  const resumeId = `res_e2e_c14_${Date.now().toString(36)}`;
  const resumeTitle = `Applied Jobs Check ${resumeId.slice(-6)}`;
  const seeded = await api.post(`/resumes/${resumeId}`, { title: resumeTitle, template: 'Cv1' });
  expect(seeded.status, 'the resume was seeded').toBe(200);
  seededResumes.push(resumeId);
  await arrangeAppliedJobs(request, { resumeId });
  await openPage(page);

  await details(page, platform).click();
  const toggle = hideDetails(page, platform);
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const panel = page.locator(`#${await toggle.getAttribute('aria-controls')}`);
  await expect(panel.getByRole('heading', { name: 'What you sent' })).toBeVisible();
  const field = (label: string) => panel.locator('dt', { hasText: label }).locator('xpath=following-sibling::dd[1]');
  await expect(field('Name')).toHaveText('Avery Tester');
  await expect(field('Email')).toHaveText('p002.candidate.a@example.test');
  await expect(field('Phone')).toHaveText('+1 555 0100');
  await expect(field('Resume')).toHaveText(resumeTitle);
  const letter = await panel.locator('p.whitespace-pre-wrap').evaluate((element) => (element as HTMLElement).innerText);
  expect(letter, 'the line break the candidate typed is kept').toBe(coverLetterFor(platform));

  await details(page, analyst).click();
  const analystPanel = page.locator(`#${await hideDetails(page, analyst).getAttribute('aria-controls')}`);
  await expect(analystPanel.locator('dt', { hasText: 'Resume' }).locator('xpath=following-sibling::dd[1]')).toHaveText('None attached');

  // The disclosure works from the keyboard and keeps focus on its button.
  await hideDetails(page, analyst).focus();
  await page.keyboard.press('Enter');
  await expect(details(page, analyst)).toHaveAttribute('aria-expanded', 'false');
  await expect(details(page, analyst)).toBeFocused();
  await expect(analystPanel).toBeHidden();
  await page.keyboard.press('Space');
  await expect(hideDetails(page, analyst)).toHaveAttribute('aria-expanded', 'true');

  // Delete the resume elsewhere: the application still points to it, and the page says what happened.
  expect((await api.del(`/resumes/${resumeId}`)).status).toBe(200);
  seededResumes.pop();
  await page.reload();
  await details(page, platform).click();
  await expect(page.locator(`#${await hideDetails(page, platform).getAttribute('aria-controls')}`)
    .locator('dt', { hasText: 'Resume' }).locator('xpath=following-sibling::dd[1]')).toHaveText('A resume you have since deleted');
  await expectNoHorizontalOverflow(page);
});

// ── Withdrawing ─────────────────────────────────────────────────────────────

test('withdrawing asks first; Escape and Keep application change nothing and return focus', async ({ page, request, apiAs }) => {
  await arrangeAppliedJobs(request);
  await openPage(page);

  await withdrawButton(page, analyst).click();
  const dialog = withdrawDialog(page);
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(`Your application for ${analyst.title} at ${analyst.company} will be removed from the employer’s list of applicants.`);
  await expect(dialog).toContainText('Not selected');
  await expect(dialog).toContainText('The job is no longer listed, so you won’t be able to apply again.');
  await expect(dialog).toContainText('Your Job Tracker isn’t changed.');
  // It fits the viewport, and the page behind it does not scroll.
  const viewport = page.viewportSize()!;
  const box = (await dialog.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  await expect(dialog.getByRole('button', { name: 'Withdraw application', exact: true })).toBeInViewport();
  expect(await page.evaluate(() => getComputedStyle(document.body).overflow), 'the page behind the dialog does not scroll').toBe('hidden');
  // Focus moves into the dialog and Tab stays there.
  for (let step = 0; step < 4; step += 1) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(withdrawButton(page, analyst)).toBeFocused();
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).overflow), { message: 'scrolling is restored after the dialog closes' }).not.toBe('hidden');

  // From the keyboard, then Keep application.
  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Keep application', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(withdrawButton(page, analyst)).toBeFocused();

  // A job that is still listed says the candidate can apply again.
  await withdrawButton(page, designer).click();
  await expect(dialog).toContainText('You can apply again while the job is listed.');
  await expect(dialog).toContainText('Interview');
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(withdrawButton(page, designer)).toBeFocused();

  expect((await listOf(apiAs('a'))).length, 'nothing was withdrawn').toBe(3);
});

test('a withdrawal that fails keeps the application and says so; the retry withdraws it for good', async ({ page, request, apiAs, guard }) => {
  const arranged = await arrangeAppliedJobs(request);
  await openPage(page);

  // FAULT INJECTION: the server is unavailable for the first attempt.
  guard.expectApiStatuses(503);
  await page.route('**/api/jobs-data/applications/*', (route) => (route.request().method() === 'DELETE'
    ? route.fulfill({ status: 503, json: { success: false, error: 'Service unavailable (fault injection)' } })
    : route.fallback()));
  await withdrawButton(page, platform).click();
  const dialog = withdrawDialog(page);
  const confirm = dialog.getByRole('button', { name: 'Withdraw application', exact: true });
  await confirm.click();
  await expect(dialog.getByRole('alert')).toHaveText('Your application couldn’t be withdrawn. Check your connection and try again.');
  await expect(dialog).toBeVisible();
  expect((await listOf(apiAs('a'))).map((row) => row.id)).toContain(arranged.ids.platform);

  // Closed (the application is still listed) and reopened, the dialog starts afresh: the old error is gone.
  await dialog.getByRole('button', { name: 'Keep application', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(entry(page, platform)).toBeVisible();
  await withdrawButton(page, platform).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('alert')).toHaveCount(0);

  await page.unroute('**/api/jobs-data/applications/*');
  await confirm.click();
  await expect(dialog).toHaveCount(0);
  await expect(statusRegion(page, `Withdrew your application for ${name(platform)}.`)).toBeVisible();
  await expect(entry(page, platform)).toHaveCount(0);
  await expect(summaryItems(page)).toHaveText(['0 Submitted', '1 Interview', '0 Accepted', '1 Not selected']);
  await expect(page.getByText('2 applications', { exact: true })).toBeVisible();
  // The platform application was last in the list; focus goes to the one before it.
  await expect(details(page, analyst)).toBeFocused();

  // Gone for good: after a reload, for the candidate, and from the employer's list of applicants.
  await page.reload();
  await expect(titles(page)).toHaveText([designer.title, analyst.title]);
  expect((await listOf(apiAs('a'))).map((row) => row.id)).not.toContain(arranged.ids.platform);
  const employerView = await request.get(`/api/jobs/${platform.id}/applications`, { headers: { Authorization: `Bearer ${arranged.owner.token}` } });
  expect(employerView.status()).toBe(200);
  const applicants = ((await employerView.json()) as { applications: Array<{ id: string }> }).applications.map((row) => row.id);
  expect(applicants).toEqual([arranged.blake]);
  // As the dialog said, the job is still listed, so the candidate can apply again.
  const again = await applyAs(request, 'a', platform);
  expect(again).toBe(arranged.ids.platform);
});

test('withdrawing an application already removed in another tab reports that and removes it here', async ({ page, request, apiAs, guard }) => {
  const arranged = await arrangeAppliedJobs(request);
  await openPage(page);
  await withdrawButton(page, designer).click();
  // Another tab withdraws it first.
  expect((await apiAs('a').del(`/jobs-data/applications/${encodeURIComponent(arranged.ids.designer)}`)).status).toBe(200);
  guard.expectApiStatuses(404);
  await withdrawDialog(page).getByRole('button', { name: 'Withdraw application', exact: true }).click();
  await expect(withdrawDialog(page)).toHaveCount(0);
  await expect(statusRegion(page, `Your application for ${name(designer)} had already been withdrawn or removed.`)).toBeVisible();
  await expect(entry(page, designer)).toHaveCount(0);
  // The designer application was first; focus goes to the next one.
  await expect(details(page, analyst)).toBeFocused();
});

// ── Job Tracker ─────────────────────────────────────────────────────────────

test('adds an application’s job to the Job Tracker at its stage with the date it was sent, once, and links to it', async ({ page, request, apiAs }) => {
  await arrangeAppliedJobs(request);
  const api = apiAs('a');
  await openPage(page);

  await addButton(page, designer).click();
  await expect(statusRegion(page, `Added ${name(designer)} to your Job Tracker under Interviewing.`)).toBeVisible();
  await expect(trackerLink(page, designer)).toBeFocused();
  await expect(entry(page, designer)).toContainText('Tracked under Interviewing');
  const sent = (await listOf(api)).find((row) => row.jobId === designer.id)!;
  const tracked = (await trackedOf(api)).filter((row) => row.title === designer.title && row.company === designer.company);
  expect(tracked).toHaveLength(1);
  expect(tracked[0]).toMatchObject({ status: 'interview', location: 'Remote' });
  expect(String(tracked[0].dateApplied).slice(0, 10), 'the tracker records the day the application was sent').toBe(await localDay(page, sent.createdAt));

  // Reloaded, the page knows from the tracker itself that the job is tracked.
  await page.reload();
  await expect(trackerLink(page, designer)).toBeVisible();
  await expect(addButton(page, designer)).toHaveCount(0);

  // A matching job added in another tab (any letter case) is found, not duplicated.
  const created = await api.post<{ job: TrackedRow }>('/jobs-data/tracker', { title: 'data analyst', company: 'NORTHWIND TEST LABS', status: 'wishlist' });
  expect(created.status).toBe(201);
  await addButton(page, analyst).click();
  await expect(statusRegion(page, `${name(analyst)} is already in your Job Tracker (Wishlist), so nothing was added.`)).toBeVisible();
  await expect(trackerLink(page, analyst)).toBeFocused();
  expect((await trackedOf(api)).filter((row) => row.title.toLocaleLowerCase() === 'data analyst')).toHaveLength(1);

  // The link opens the tracker on that job.
  await trackerLink(page, designer).click();
  await expect(page).toHaveURL(/\/dashboard\/job-tracker\?q=Product\+Designer$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Job Tracker' })).toBeVisible();
  await expect(page.getByRole('article', { name: designer.title, exact: true })).toBeVisible();
});

test('a Job Tracker that cannot be reached adds nothing and says so; the job can be added afterwards', async ({ page, request, apiAs, guard }) => {
  await arrangeAppliedJobs(request);
  await openPage(page);
  // FAULT INJECTION: the tracker refuses the write.
  guard.expectApiStatuses(503);
  await page.route('**/api/jobs-data/tracker', (route) => (route.request().method() === 'POST'
    ? route.fulfill({ status: 503, json: { success: false, error: 'Service unavailable (fault injection)' } })
    : route.fallback()));
  await addButton(page, platform).click();
  await expect(alertRegion(page, `${name(platform)} wasn’t added to your Job Tracker.`)).toBeVisible();
  await expect(addButton(page, platform)).toBeEnabled();
  await expect(addButton(page, platform)).not.toHaveAttribute('aria-disabled', 'true');
  expect((await trackedOf(apiAs('a'))).some((row) => row.title === platform.title && row.company === platform.company)).toBe(false);

  await page.unroute('**/api/jobs-data/tracker');
  await addButton(page, platform).click();
  await expect(statusRegion(page, `Added ${name(platform)} to your Job Tracker under Applied.`)).toBeVisible();
  expect((await trackedOf(apiAs('a'))).filter((row) => row.title === platform.title && row.company === platform.company)).toHaveLength(1);
});

// ── States ──────────────────────────────────────────────────────────────────

test('loading, a failed load with a working Try again, and a failed refresh that keeps the list', async ({ page, request, guard }) => {
  await arrangeAppliedJobs(request);
  guard.expectApiStatuses(500);
  // Slowed down (not mocked) so the loading state can be seen.
  await page.route('**/api/jobs-data/applications/list', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1_200));
    await route.fallback();
  });
  await page.goto('/dashboard/applied-jobs');
  await expect(page.getByText('Loading your applications…')).toBeVisible();
  await expect(page.getByText('3 applications', { exact: true })).toBeVisible();
  await page.unroute('**/api/jobs-data/applications/list');

  // FAULT INJECTION: every read fails until the route is removed.
  const failReads = (route: Parameters<Parameters<Page['route']>[1]>[0]) => route.fulfill({ status: 500, json: { success: false, error: 'Failed to fetch applications (fault injection)' } });
  await page.route('**/api/jobs-data/applications/list', failReads);
  await page.reload();
  const loadError = alertRegion(page, 'Your applications couldn’t be loaded. Check your connection and try again.');
  await expect(loadError).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('list', { name: 'Applications', exact: true })).toHaveCount(0);
  await page.unroute('**/api/jobs-data/applications/list');
  await loadError.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText('3 applications', { exact: true })).toBeVisible();
  await expect(loadError).toHaveCount(0);

  // A refresh that fails keeps what is on screen and says it may be out of date.
  await page.route('**/api/jobs-data/applications/list', failReads);
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  const stale = alertRegion(page, 'may be out of date');
  await expect(stale).toBeVisible({ timeout: 15_000 });
  await expect(titles(page)).toHaveText([designer.title, analyst.title, platform.title]);
  await page.unroute('**/api/jobs-data/applications/list');
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(statusRegion(page, 'Your applications are up to date.')).toBeVisible();
  await expect(stale).toHaveCount(0);
});

test('with no applications, says so and points to the job portal', async ({ page, apiAs }) => {
  removeArranged();
  expect(await listOf(apiAs('a')), 'precondition: candidate A has no applications').toEqual([]);
  await openPage(page);
  await expect(page.getByRole('heading', { name: 'No applications yet' })).toBeVisible();
  await expect(page.getByText('When you apply for a job on the job portal, it appears here with its status.')).toBeVisible();
  await expect(search(page)).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Applications by status' })).toHaveCount(0);
  const portal = page.getByRole('link', { name: 'Find jobs to apply for', exact: true });
  await expect(portal).toHaveAttribute('href', '/dashboard/jobs');
  await expect(page.getByRole('link', { name: 'Browse jobs', exact: true })).toHaveAttribute('href', '/dashboard/jobs');
  await expectNoHorizontalOverflow(page);
  await portal.click();
  await expect(page).toHaveURL(/\/dashboard\/jobs$/);
});

// ── Around the page ─────────────────────────────────────────────────────────

test('the navigation and breadcrumb lead to Applied Jobs, and notifications about an application open it', async ({ page, request }) => {
  await arrangeAppliedJobs(request);
  const sidebar = page.getByRole('navigation', { name: 'Main navigation' });
  await page.goto('/dashboard');
  await openNavigation(page);
  await sidebar.getByRole('link', { name: 'Applied Jobs', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/applied-jobs$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Applied Jobs' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Applied Jobs' })).toHaveAttribute('aria-current', 'page');
  await openNavigation(page);
  await expect(sidebar.getByRole('link', { name: 'Applied Jobs', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(sidebar.getByRole('link', { name: 'Job Tracker', exact: true })).not.toHaveAttribute('aria-current', 'page');
  if (isCompact(page)) await page.keyboard.press('Escape');

  // The "Application submitted" notification opens this page; the interview invitation keeps its coach link.
  await page.goto('/dashboard/notifications');
  const feed = page.getByRole('list', { name: 'Notifications', exact: true });
  const submitted = feed.getByRole('listitem').filter({ hasText: `Your application for ${designer.title} at ${designer.company} was submitted.` });
  await expect(submitted.getByRole('link', { name: 'View your applications' })).toHaveAttribute('href', '/dashboard/applied-jobs');
  const invitation = feed.getByRole('listitem').filter({ hasText: 'Interview invitation' });
  await expect(invitation.getByRole('link', { name: 'Prepare with Interview Coach' })).toBeVisible();
  await submitted.getByRole('link', { name: 'View your applications' }).click();
  await expect(page).toHaveURL(/\/dashboard\/applied-jobs$/);
  await expect(entry(page, designer)).toBeVisible();
});

test('rows that the current workflows cannot produce are shown as stored, never guessed (labelled mock)', async ({ page }) => {
  // LABELLED MOCK: shapes older or other producers can leave in MariaDB: a status
  // no workflow here writes, an application whose job row is gone, a cover letter
  // saved as HTML, and a status change days after the application. Nothing is written.
  const replayed = [
    {
      id: 'mock_app_html', jobId: 'mock_job_1', status: 'shortlisted', createdAt: '2026-09-01T09:00:00.000Z', updatedAt: '2026-09-04T15:30:00.000Z',
      applicantName: 'Avery Tester', applicantEmail: 'p002.candidate.a@example.test', applicantPhone: '', resumeId: null,
      coverLetter: '<p>Dear hiring team,</p><p>I build &amp; ship reliable systems.<br>Thank you.</p>',
      job: { title: 'Site Reliability Engineer', company: 'Replayed Test Co', location: 'Pune', listed: true },
    },
    {
      id: 'mock_app_orphan', jobId: 'mock_job_gone', status: 'PENDING', createdAt: '2026-08-15T09:00:00.000Z', updatedAt: '2026-08-15T09:00:00.000Z',
      applicantName: 'Avery Tester', applicantEmail: 'p002.candidate.a@example.test', applicantPhone: '+1 555 0100', resumeId: null, coverLetter: '',
      job: { title: '', company: '', location: '', listed: false },
    },
  ];
  await page.route('**/api/jobs-data/applications/list', (route) => route.fulfill({ json: { success: true, applications: replayed } }));
  await openPage(page);

  await expect(summaryItems(page)).toHaveText(['1 Submitted', '0 Interview', '0 Accepted', '0 Not selected', '1 Other']);
  const reliability = page.getByRole('article', { name: 'Site Reliability Engineer', exact: true });
  await expect(reliability).toContainText('Status: Shortlisted');
  await expect(reliability.locator('time').nth(1)).toHaveAttribute('datetime', '2026-09-04T15:30:00.000Z');
  await expect(reliability.locator('time').nth(1)).toHaveText(/^Updated \S/);
  await reliability.getByRole('button', { name: 'Details for Site Reliability Engineer at Replayed Test Co' }).click();
  const letter = await reliability.locator('p.whitespace-pre-wrap').evaluate((element) => (element as HTMLElement).innerText);
  expect(letter).toBe('Dear hiring team,\nI build & ship reliable systems.\nThank you.');
  await expect(reliability.locator('dt', { hasText: 'Phone' }).locator('xpath=following-sibling::dd[1]')).toHaveText('Not recorded');

  const orphan = page.getByRole('article', { name: 'Job details unavailable', exact: true });
  await expect(orphan).toContainText('Status: Submitted');
  await expect(orphan).toContainText('Not currently listed on the job board');
  await expect(orphan.getByRole('button', { name: /^Add to Job Tracker/ })).toHaveCount(0);
  await expect(orphan.getByRole('button', { name: 'Withdraw application for this job', exact: true })).toBeVisible();
  await orphan.getByRole('button', { name: 'Details for this job', exact: true }).click();
  await expect(orphan).toContainText('No cover letter was recorded.');
});

test('works with the keyboard and has no axe violations on the list, the details and the dialog', async ({ page, request }) => {
  await arrangeAppliedJobs(request);
  await openPage(page);
  await expectNoAxeViolations(page, '#main-content');

  // Tab order follows the page: search, filters, then each application's controls.
  await search(page).focus();
  const order: string[] = [];
  for (let step = 0; step < 6; step += 1) {
    await page.keyboard.press('Tab');
    order.push(await page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null;
      return element?.getAttribute('aria-label') || element?.id || element?.textContent?.trim() || '';
    }));
  }
  expect(order).toEqual([
    'applications-status',
    'applications-sort',
    `Details for ${name(designer)}`,
    `Add to Job Tracker: ${name(designer)}`,
    `Withdraw application for ${name(designer)}`,
    `Details for ${name(analyst)}`,
  ]);

  await page.keyboard.press('Enter');
  await expect(hideDetails(page, analyst)).toHaveAttribute('aria-expanded', 'true');
  await expectNoAxeViolations(page, '#main-content');

  await withdrawButton(page, analyst).focus();
  await page.keyboard.press('Enter');
  await expect(withdrawDialog(page)).toBeVisible();
  await expectNoAxeViolations(page, '[role="dialog"]');
  await page.keyboard.press('Escape');
  await expect(withdrawButton(page, analyst)).toBeFocused();
});

test.describe('as candidate B', () => {
  test.use({ storageState: storageStatePath('b') });

  test('candidate B sees only their own application and cannot withdraw, take over or edit candidate A’s', async ({ page, request, apiAs }) => {
    const arranged = await arrangeAppliedJobs(request);
    await openPage(page);
    await expect(titles(page)).toHaveText([platform.title]);
    await expect(page.getByText('1 application', { exact: true })).toBeVisible();
    await expect(entry(page, platform)).toContainText('Status: Submitted');

    const blake = apiAs('b');
    const target = `/jobs-data/applications/${encodeURIComponent(arranged.ids.analyst)}`;
    expect((await blake.del(target)).status, 'B cannot withdraw A’s application').toBe(403);
    expect((await blake.post(target, { coverLetter: 'Taken over', status: 'accepted' })).status, 'B cannot take it over').toBe(403);
    expect((await blake.patch(target, { applicantPhone: '+1 555 0199' })).status, 'B cannot edit it').toBe(403);
    // A cannot set the employer's decision or create an application here either.
    const avery = apiAs('a');
    const forged = await avery.patch<{ code: string; field: string }>(target, { status: 'accepted' });
    expect(forged.status).toBe(400);
    expect(forged.body).toMatchObject({ code: 'APPLICATION_FIELD_NOT_EDITABLE', field: 'status' });
    const invented = await avery.post<{ code: string }>(`/jobs-data/applications/${encodeURIComponent(`${arranged.ids.analyst}_copy`)}`, { jobId: analyst.id });
    expect(invented.status).toBe(404);
    expect(invented.body.code).toBe('APPLICATION_NOT_FOUND');
    const averyRows = await listOf(avery);
    expect(averyRows.find((row) => row.id === arranged.ids.analyst)?.status, 'A’s application is unchanged').toBe('rejected');
    expect(averyRows).toHaveLength(3);

    // B withdraws their own application; A's are untouched.
    await withdrawButton(page, platform).click();
    await withdrawDialog(page).getByRole('button', { name: 'Withdraw application', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'No applications yet' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Applied Jobs' })).toBeFocused();
    expect(await listOf(blake)).toEqual([]);
    expect(await listOf(avery)).toHaveLength(3);
  });
});
