/**
 * Saved Favorites — /dashboard/favourites — at the five directive profiles (P002 C15).
 *
 * Real stack: UI :4000 → Express :8080 → MariaDB bridge.
 * - Candidate A saves favourites through POST /api/favourites, as the bookmark
 *   on the Dashboard does (one test saves through that bookmark itself). The
 *   saved jobs are rows owned by the test employer, who closes one of them
 *   through the job route (tests/candidate/arrange-applications.ts); only the
 *   job rows are inserted directly. A's resume is created through the API.
 * - The page reads GET /api/favourites, removes through DELETE
 *   /api/favourites/:itemId and undoes through POST /api/favourites. Every test
 *   removes what it saved.
 * - Failure paths are labelled Playwright routes (FAULT INJECTION); one test
 *   replays row shapes the current workflows cannot produce (LABELLED MOCK).
 */
import AxeBuilder from '@axe-core/playwright';
import type { APIRequestContext, Page } from '@playwright/test';
import { expect, expectNoHorizontalOverflow, isCompact, storageStatePath, test, type ApiClient } from './fixtures';
import { arrangeOwnClosedJob, arrangeSavedJobs, removeArranged, SAVED_JOBS, updateJob, type ArrangedJob } from './arrange-applications';

interface ListedFavourite {
  id: string;
  itemId: string;
  itemType: string;
  createdAt: string;
  data: Record<string, unknown>;
  job: { title: string; company: string; location: string; listed: boolean } | null;
  document: { title: string } | null;
  [key: string]: unknown;
}

const { researcher, engineer, reliability } = SAVED_JOBS;
const OWN_JOB = { id: 'job_e2e_msg_c15_own', title: 'Freelance Accessibility Audit', company: 'Avery Tester Studio' } as const;
const RESUME = { id: 'e2e-c15-avery-platform-cv', title: 'Avery Platform CV', lastname: 'Saved-Item-Check' } as const;
// Its id has a space and a slash, so removing it proves the id is encoded into the URL.
const MISSING_COVER = { id: 'cl_e2e_c15 missing/letter', title: 'Letter to Fabrikam Test Ops' } as const;
const BLAKE_RESUME = { id: 'e2e-c15-blake-cv', title: 'Blake Private CV' } as const;
const nameOf = (job: ArrangedJob) => `${job.title} at ${job.company}`;

async function listOf(api: ApiClient): Promise<ListedFavourite[]> {
  const { status, body } = await api.get<{ favourites: ListedFavourite[] }>('/favourites');
  expect(status).toBe(200);
  return body.favourites;
}

async function clearSaved(api: ApiClient) {
  for (const row of await listOf(api)) {
    expect((await api.del(`/favourites/${encodeURIComponent(row.itemId)}`)).status).toBe(200);
  }
}

async function save(api: ApiClient, itemId: string, itemType: string, data: Record<string, unknown>) {
  const { status } = await api.post('/favourites', { itemId, itemType, data });
  expect(status, `save ${itemId}`).toBe(200);
}

/**
 * Fresh state, then candidate A saves, oldest first: their resume, a cover
 * letter that is not in their account (saved with its title), the closed
 * reliability job (with the details the Dashboard saves), the engineer job
 * (likewise) and the researcher job with an empty payload, as the legacy
 * bookmark saved it. The list is newest first.
 */
async function arrangeSaved(request: APIRequestContext, api: ApiClient, options: { own?: boolean } = {}) {
  await clearSaved(api);
  await arrangeSavedJobs(request);
  if (options.own) await arrangeOwnClosedJob(request, OWN_JOB);
  await api.del(`/resumes/${encodeURIComponent(RESUME.id)}`);
  const resume = { title: RESUME.title, firstname: 'Avery', lastname: RESUME.lastname, expectedRevision: null };
  expect((await api.post(`/resumes/${encodeURIComponent(RESUME.id)}`, resume)).status).toBe(200);
  await save(api, RESUME.id, 'resume', {});
  await save(api, MISSING_COVER.id, 'cover', { title: MISSING_COVER.title });
  await save(api, reliability.id, 'job', { title: reliability.title, company: reliability.company, location: 'Remote' });
  await save(api, engineer.id, 'job', { title: engineer.title, company: engineer.company, location: 'Remote' });
  await save(api, researcher.id, 'job', {});
  if (options.own) await save(api, OWN_JOB.id, 'job', {});
}

test.afterEach(async ({ apiAs }) => {
  for (const account of ['a', 'b'] as const) {
    const api = apiAs(account);
    await clearSaved(api);
    await api.del(`/resumes/${encodeURIComponent(account === 'a' ? RESUME.id : BLAKE_RESUME.id)}`);
  }
});
test.afterAll(() => { removeArranged(); });

async function openPage(page: Page, url = '/dashboard/favourites') {
  await page.goto(url);
  await expect(page.getByRole('heading', { level: 1, name: 'Saved Favorites' })).toBeVisible();
  await expect(page.getByText('Loading your saved items…')).toHaveCount(0);
}

const main = (page: Page) => page.locator('#main-content');
const statusRegion = (page: Page, text: string | RegExp) => main(page).getByRole('status').filter({ hasText: text });
const alertRegion = (page: Page, text: string | RegExp) => main(page).getByRole('alert').filter({ hasText: text });
const savedList = (page: Page) => page.getByRole('list', { name: 'Saved items', exact: true });
// Auto-retrying: the list re-renders after a filter, a removal or a reload.
const titles = (page: Page) => savedList(page).getByRole('heading', { level: 3 });
const entry = (page: Page, title: string) => page.getByRole('article', { name: title, exact: true });
const removeButton = (page: Page, name: string) => page.getByRole('button', { name: `Remove ${name} from your saved items`, exact: true });
const undoButton = (page: Page, name: string) => page.getByRole('button', { name: `Undo: save ${name} again`, exact: true });
const filterButton = (page: Page, label: string) => page.getByRole('group', { name: 'Show' }).getByRole('button', { name: new RegExp(`^${label} \\d+$`) });
const search = (page: Page) => page.getByRole('searchbox', { name: 'Search saved items' });
const ALL_TITLES = [researcher.title, engineer.title, reliability.title, MISSING_COVER.title, RESUME.title];

async function openNavigation(page: Page) {
  if (isCompact(page)) await page.getByRole('button', { name: 'Open menu' }).click();
}

async function expectNoAxeViolations(page: Page, scope: string) {
  const results = await new AxeBuilder({ page }).include(scope).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`)).toEqual([]);
}

/** "Saved 21 Oct" as the page writes it, in the browser's locale and time zone. */
const savedLabel = (page: Page, iso: string) => page.evaluate((value) => {
  const date = new Date(value);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return `Saved ${date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })}`;
}, iso);

// ── Reading ─────────────────────────────────────────────────────────────────

test('lists candidate A’s saved items newest first, each with its current details or the ones saved with it', async ({ page, request, apiAs }) => {
  await arrangeSaved(request, apiAs('a'));
  await openPage(page);

  await expect(page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Saved Favorites' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByText('5 saved items', { exact: true })).toBeVisible();
  await expect(titles(page)).toHaveText(ALL_TITLES);
  for (const label of ['All 5', 'Jobs 3', 'Documents 2']) {
    await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible();
  }
  await expect(filterButton(page, 'All')).toHaveAttribute('aria-pressed', 'true');

  const rows = await listOf(apiAs('a'));
  const row = (itemId: string) => rows.find((item) => item.itemId === itemId)!;
  // Open jobs show the live listing, whatever was saved with them (the researcher job was saved with nothing).
  expect(row(researcher.id).data).toEqual({});
  expect(row(researcher.id).job).toEqual({ title: researcher.title, company: researcher.company, location: 'Remote', listed: true });
  for (const job of [researcher, engineer]) {
    const card = entry(page, job.title);
    await expect(card).toContainText(job.company);
    await expect(card).toContainText('Remote');
    await expect(card).toContainText('Open on the job board');
    const created = row(job.id).createdAt;
    await expect(card.locator('time')).toHaveAttribute('datetime', created);
    await expect(card.locator('time')).toHaveText(await savedLabel(page, created));
    // The job portal has no page for a single job, so there is nothing to link to.
    await expect(card.getByRole('link')).toHaveCount(0);
  }

  // The closed job: the server withholds its row, so the page shows what was saved with it, and says so.
  expect(row(reliability.id).job).toBeNull();
  const closed = entry(page, reliability.title);
  await expect(closed).toContainText(reliability.company);
  await expect(closed).toContainText('No longer listed');
  await expect(closed).toContainText('This job isn’t open on the job board now. The details shown are the ones saved with it.');

  // Documents: the resume opens in its builder; a cover letter that is not in the account cannot be opened.
  const resume = entry(page, RESUME.title);
  await expect(resume).toContainText('Resume');
  await expect(resume.getByRole('link', { name: `Open in Resume Builder: ${RESUME.title}`, exact: true })).toHaveAttribute('href', `/build-resume/${RESUME.id}`);
  expect(row(RESUME.id).document).toEqual({ title: RESUME.title });
  const cover = entry(page, MISSING_COVER.title);
  await expect(cover).toContainText('Cover letter');
  await expect(cover).toContainText('Not in your account');
  await expect(cover).toContainText('This cover letter isn’t in your account, so it can’t be opened. The title shown is the one saved with it.');
  await expect(cover.getByRole('link')).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});

test('the type filter and the search live in the URL: reload, direct links and Back/Forward keep them', async ({ page, request, apiAs }) => {
  await arrangeSaved(request, apiAs('a'));
  await openPage(page);

  await filterButton(page, 'Jobs').click();
  await expect(page).toHaveURL(/\/dashboard\/favourites\?type=jobs$/);
  await expect(filterButton(page, 'Jobs')).toHaveAttribute('aria-pressed', 'true');
  await expect(filterButton(page, 'All')).toHaveAttribute('aria-pressed', 'false');
  await expect(titles(page)).toHaveText([researcher.title, engineer.title, reliability.title]);
  await expect(page.getByText('Showing 3 of 5 saved items', { exact: true })).toBeVisible();

  await search(page).fill('fabrikam');
  await expect(page).toHaveURL(/\?type=jobs&q=fabrikam$/);
  await expect(titles(page)).toHaveText([reliability.title]);
  await page.reload();
  await expect(search(page)).toHaveValue('fabrikam');
  await expect(filterButton(page, 'Jobs')).toHaveAttribute('aria-pressed', 'true');
  await expect(titles(page)).toHaveText([reliability.title]);

  // The same search among documents finds the cover letter saved with that company in its title.
  await filterButton(page, 'Documents').click();
  await expect(page).toHaveURL(/\?type=documents&q=fabrikam$/);
  await expect(titles(page)).toHaveText([MISSING_COVER.title]);

  // No match, then everything again with one control.
  await search(page).fill('zzz-no-such-item');
  await expect(page.getByText('No saved items match “zzz-no-such-item” in documents.', { exact: true })).toBeVisible();
  await expect(savedList(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Show all saved items', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/favourites$/);
  await expect(titles(page)).toHaveText(ALL_TITLES);

  // A direct link, then away and Back/Forward.
  await page.goto('/dashboard/favourites?type=documents&q=platform');
  await expect(titles(page)).toHaveText([RESUME.title]);
  await expect(page.getByText('Showing 1 of 5 saved items', { exact: true })).toBeVisible();
  await page.goto('/dashboard/applied-jobs');
  await expect(page.getByRole('heading', { level: 1, name: 'Applied Jobs' })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/dashboard\/favourites\?type=documents&q=platform$/);
  await expect(titles(page)).toHaveText([RESUME.title]);
  await page.goForward();
  await expect(page).toHaveURL(/\/dashboard\/applied-jobs$/);
  await page.goBack();
  await expect(search(page)).toHaveValue('platform');
  await expect(filterButton(page, 'Documents')).toHaveAttribute('aria-pressed', 'true');

  // An unknown type shows everything.
  await page.goto('/dashboard/favourites?type=bogus');
  await expect(filterButton(page, 'All')).toHaveAttribute('aria-pressed', 'true');
  await expect(titles(page)).toHaveText(ALL_TITLES);
});

// ── Removing and Undo ───────────────────────────────────────────────────────

test('removing takes effect at once and Undo saves the item again with what it had; both survive a reload', async ({ page, request, apiAs }) => {
  const api = apiAs('a');
  await arrangeSaved(request, api);
  await openPage(page);
  const before = (await listOf(api)).find((row) => row.itemId === engineer.id)!;

  await removeButton(page, nameOf(engineer)).click();
  await expect(statusRegion(page, `Removed ${nameOf(engineer)} from your saved items.`)).toBeVisible();
  await expect(entry(page, engineer.title)).toHaveCount(0);
  await expect(page.getByText('4 saved items', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Jobs 2', exact: true })).toBeVisible();
  // Focus moves to Undo, the control that belongs to what just happened.
  await expect(undoButton(page, nameOf(engineer))).toBeFocused();
  expect((await listOf(api)).map((row) => row.itemId)).not.toContain(engineer.id);

  await undoButton(page, nameOf(engineer)).click();
  await expect(statusRegion(page, `${nameOf(engineer)} is back in your saved items.`)).toBeVisible();
  await expect(undoButton(page, nameOf(engineer))).toHaveCount(0);
  await expect(page.locator(`#favourite-title-${engineer.id}`)).toBeFocused();
  // Saved again with the same payload. It counts as saved now, so it is listed first.
  const restored = (await listOf(api)).find((row) => row.itemId === engineer.id)!;
  expect(restored.data).toEqual(before.data);
  expect(restored.itemType).toBe('job');
  const reordered = [engineer.title, researcher.title, reliability.title, MISSING_COVER.title, RESUME.title];
  await expect(titles(page)).toHaveText(reordered);
  await page.reload();
  await expect(titles(page)).toHaveText(reordered);

  // A removal is for good: after a reload the item is still gone.
  await removeButton(page, RESUME.title).click();
  await expect(statusRegion(page, `Removed ${RESUME.title} from your saved items.`)).toBeVisible();
  await page.reload();
  await expect(titles(page)).toHaveText(reordered.slice(0, 4));
  expect((await listOf(api)).map((row) => row.itemId)).not.toContain(RESUME.id);
  // Only the favourite went: the resume itself is still in the account.
  expect((await api.get(`/resumes/${encodeURIComponent(RESUME.id)}`)).status).toBe(200);

  // An id with a space and a slash is removed too (it travels encoded in the URL).
  await removeButton(page, MISSING_COVER.title).click();
  await expect(statusRegion(page, `Removed ${MISSING_COVER.title} from your saved items.`)).toBeVisible();
  expect((await listOf(api)).map((row) => row.itemId)).not.toContain(MISSING_COVER.id);
});

test('a removal that fails keeps the item and says so; trying again removes it', async ({ page, request, apiAs, guard }) => {
  await arrangeSaved(request, apiAs('a'));
  await openPage(page);

  // FAULT INJECTION: the server is unavailable for the first attempt.
  guard.expectApiStatuses(503);
  await page.route('**/api/favourites/*', (route) => (route.request().method() === 'DELETE'
    ? route.fulfill({ status: 503, json: { success: false, error: 'Saved items are temporarily unavailable (fault injection)' } })
    : route.fallback()));
  await removeButton(page, nameOf(researcher)).click();
  await expect(alertRegion(page, `${nameOf(researcher)} wasn’t removed. Check your connection and try again.`)).toBeVisible();
  await expect(entry(page, researcher.title)).toBeVisible();
  await expect(removeButton(page, nameOf(researcher))).toBeFocused();
  await expect(page.getByRole('button', { name: /^Undo/ })).toHaveCount(0);
  expect((await listOf(apiAs('a'))).map((row) => row.itemId)).toContain(researcher.id);

  await page.unroute('**/api/favourites/*');
  await removeButton(page, nameOf(researcher)).click();
  await expect(statusRegion(page, `Removed ${nameOf(researcher)} from your saved items.`)).toBeVisible();
  await expect(alertRegion(page, 'wasn’t removed')).toHaveCount(0);
  await expect(entry(page, researcher.title)).toHaveCount(0);
  expect((await listOf(apiAs('a'))).map((row) => row.itemId)).not.toContain(researcher.id);
});

test('an Undo that fails says so and stays available; trying again saves the item with its details', async ({ page, request, apiAs, guard }) => {
  await arrangeSaved(request, apiAs('a'));
  await openPage(page);
  await removeButton(page, nameOf(reliability)).click();
  await expect(undoButton(page, nameOf(reliability))).toBeFocused();

  // FAULT INJECTION: saving again fails once.
  guard.expectApiStatuses(503);
  await page.route('**/api/favourites', (route) => (route.request().method() === 'POST'
    ? route.fulfill({ status: 503, json: { success: false, error: 'Saved items are temporarily unavailable (fault injection)' } })
    : route.fallback()));
  await undoButton(page, nameOf(reliability)).click();
  await expect(alertRegion(page, `${nameOf(reliability)} couldn’t be saved again. Check your connection and try again.`)).toBeVisible();
  await expect(undoButton(page, nameOf(reliability))).toBeVisible();
  expect((await listOf(apiAs('a'))).map((row) => row.itemId)).not.toContain(reliability.id);

  await page.unroute('**/api/favourites');
  await undoButton(page, nameOf(reliability)).click();
  await expect(statusRegion(page, `${nameOf(reliability)} is back in your saved items.`)).toBeVisible();
  // The details saved with it came back too: the closed job still shows them.
  await expect(entry(page, reliability.title)).toContainText(reliability.company);
  const restored = (await listOf(apiAs('a'))).find((row) => row.itemId === reliability.id)!;
  expect(restored.data).toEqual({ title: reliability.title, company: reliability.company, location: 'Remote' });
});

test('removing an item already removed elsewhere says so, offers no Undo and moves focus to the next item', async ({ page, request, apiAs }) => {
  await arrangeSaved(request, apiAs('a'));
  await openPage(page);
  // Another tab, or the Dashboard bookmark, removes it first.
  expect((await apiAs('a').del(`/favourites/${encodeURIComponent(researcher.id)}`)).body).toMatchObject({ removed: true });
  await removeButton(page, nameOf(researcher)).click();
  await expect(statusRegion(page, `${nameOf(researcher)} had already been removed from your saved items.`)).toBeVisible();
  await expect(entry(page, researcher.title)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Undo/ })).toHaveCount(0);
  await expect(page.locator(`#favourite-title-${engineer.id}`)).toBeFocused();
});

// ── States ──────────────────────────────────────────────────────────────────

test('loading, a failed load with a working Try again, and a failed refresh that keeps the list', async ({ page, request, apiAs, guard }) => {
  await arrangeSaved(request, apiAs('a'));
  guard.expectApiStatuses(500);
  // Slowed down (not mocked) so the loading state can be seen.
  await page.route('**/api/favourites', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1_200));
    await route.fallback();
  });
  await page.goto('/dashboard/favourites');
  await expect(page.getByText('Loading your saved items…')).toBeVisible();
  await expect(page.getByText('5 saved items', { exact: true })).toBeVisible();
  await page.unroute('**/api/favourites');

  // FAULT INJECTION: every read fails until the route is removed.
  const failReads = (route: Parameters<Parameters<Page['route']>[1]>[0]) => route.fulfill({ status: 500, json: { success: false, error: 'Failed to load favourites (fault injection)' } });
  await page.route('**/api/favourites', failReads);
  await page.reload();
  const loadError = alertRegion(page, 'Your saved items couldn’t be loaded. Check your connection and try again.');
  await expect(loadError).toBeVisible({ timeout: 15_000 });
  // A failed read is never presented as an empty list (the defect this page had: FV-1).
  await expect(page.getByRole('heading', { name: 'Nothing saved yet' })).toHaveCount(0);
  await expect(savedList(page)).toHaveCount(0);
  await expect(page.getByText(/^\d+ saved items?$/)).toHaveCount(0);
  await page.unroute('**/api/favourites');
  await loadError.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText('5 saved items', { exact: true })).toBeVisible();
  await expect(loadError).toHaveCount(0);

  // A refresh that fails keeps what is on screen and says it may be out of date.
  await page.route('**/api/favourites', failReads);
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  const stale = alertRegion(page, 'may be out of date');
  await expect(stale).toBeVisible({ timeout: 15_000 });
  await expect(titles(page)).toHaveText(ALL_TITLES);
  await page.unroute('**/api/favourites');
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(statusRegion(page, 'Your saved items are up to date.')).toBeVisible();
  await expect(stale).toHaveCount(0);
});

test('with nothing saved, says so and points to the bookmark on the Dashboard', async ({ page, apiAs }) => {
  await clearSaved(apiAs('a'));
  await openPage(page);
  await expect(page.getByRole('heading', { name: 'Nothing saved yet' })).toBeVisible();
  await expect(page.getByText('Save a job with the bookmark next to it in Top Job Matches on your Dashboard, and it appears here.')).toBeVisible();
  await expect(search(page)).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Show' })).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  const dashboard = page.getByRole('link', { name: 'Go to your Dashboard', exact: true });
  await expect(dashboard).toHaveAttribute('href', '/dashboard');
  await dashboard.click();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test('rows that the current workflows cannot produce are shown as stored, never guessed (labelled mock)', async ({ page }) => {
  // LABELLED MOCK: shapes that older clients or direct API use can leave in MariaDB: another item
  // type, a document without a title or a timestamp, and a job saved with no details whose listing is gone.
  await page.route('**/api/favourites', (route) => (route.request().method() === 'GET'
    ? route.fulfill({
      json: {
        success: true,
        favourites: [
          { id: 'fav_mock_1', itemId: 'portfolio-1', itemType: 'portfolio', createdAt: '2026-10-20T09:00:00.000Z', data: { title: 'Design portfolio' }, job: null, document: null },
          { id: 'fav_mock_2', itemId: 'resume untitled', itemType: 'resume', createdAt: null, data: {}, job: null, document: { title: '' } },
          { id: 'fav_mock_3', itemId: 'job-empty', itemType: 'job', createdAt: '2026-10-19T09:00:00.000Z', data: {}, job: null, document: null },
        ],
      },
    })
    : route.fallback()));
  await openPage(page);
  await expect(titles(page)).toHaveText(['Design portfolio', 'Untitled resume', 'Saved job']);
  await expect(entry(page, 'Design portfolio')).toContainText('Portfolio');
  await expect(entry(page, 'Design portfolio').getByRole('link')).toHaveCount(0);
  await expect(entry(page, 'Untitled resume').locator('time')).toHaveCount(0);
  // Ids are encoded into the builder link.
  await expect(entry(page, 'Untitled resume').getByRole('link', { name: 'Open in Resume Builder: Untitled resume', exact: true }))
    .toHaveAttribute('href', '/build-resume/resume%20untitled');
  await expect(entry(page, 'Saved job')).toContainText('This job isn’t open on the job board now, so its details can’t be shown.');
  // Another type counts under All only.
  for (const label of ['All 3', 'Jobs 1', 'Documents 1']) {
    await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible();
  }
});

// ── Around the page ─────────────────────────────────────────────────────────

test('a job saved with the Dashboard bookmark is listed with its live details; removing it here clears the bookmark', async ({ page, request, apiAs }) => {
  const api = apiAs('a');
  await clearSaved(api);
  const owner = await arrangeSavedJobs(request);
  // The listing gives no location; the bookmark must not invent one.
  await updateJob(request, owner, researcher, { location: '' });
  await page.goto('/dashboard');
  const bookmark = page.getByRole('button', { name: `Save ${researcher.title}`, exact: true });
  await expect(bookmark).toHaveAttribute('aria-pressed', 'false');
  await bookmark.click();
  await expect(bookmark).toHaveAttribute('aria-pressed', 'true');
  // Saved with what the listing says, nothing invented.
  const saved = await listOf(api);
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({ itemId: researcher.id, itemType: 'job' });
  expect(saved[0].data).toEqual({ title: researcher.title, company: researcher.company });
  expect(saved[0].job).toEqual({ title: researcher.title, company: researcher.company, location: '', listed: true });
  // The Dashboard's activity names the real company.
  await expect(page.getByText(`Bookmarked a job at ${researcher.company}`, { exact: true })).toBeVisible();

  await page.goto('/dashboard/favourites');
  await expect(titles(page)).toHaveText([researcher.title]);
  await expect(entry(page, researcher.title)).toContainText('Open on the job board');
  await expect(entry(page, researcher.title)).not.toContainText('Remote');
  await removeButton(page, nameOf(researcher)).click();
  await expect(page.getByRole('heading', { name: 'Nothing saved yet' })).toBeVisible();
  await page.goto('/dashboard');
  await expect(page.getByRole('button', { name: `Save ${researcher.title}`, exact: true })).toHaveAttribute('aria-pressed', 'false');
});

test('a saved resume opens in the Resume Builder, and Back returns to the filtered list', async ({ page, request, apiAs }) => {
  await arrangeSaved(request, apiAs('a'));
  await openPage(page, '/dashboard/favourites?type=documents');
  await expect(titles(page)).toHaveText([MISSING_COVER.title, RESUME.title]);
  await entry(page, RESUME.title).getByRole('link', { name: `Open in Resume Builder: ${RESUME.title}`, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/build-resume/${RESUME.id}`));
  // The builder opened this resume: its stored last name is in the form.
  await expect(page.locator('#rb-lastName')).toHaveValue(RESUME.lastname);
  await page.goBack();
  await expect(page).toHaveURL(/\/dashboard\/favourites\?type=documents$/);
  await expect(titles(page)).toHaveText([MISSING_COVER.title, RESUME.title]);
});

test('a job the candidate posted themself shows its details while closed, as the job route does for its owner', async ({ page, request, apiAs }) => {
  await arrangeSaved(request, apiAs('a'), { own: true });
  await openPage(page, '/dashboard/favourites?type=jobs');
  const own = entry(page, OWN_JOB.title);
  await expect(own).toContainText(OWN_JOB.company);
  await expect(own).toContainText('Not open on the job board');
  await expect(own).toContainText('This is your own listing, and it isn’t open on the job board.');
  const row = (await listOf(apiAs('a'))).find((item) => item.itemId === OWN_JOB.id)!;
  expect(row.job).toEqual({ title: OWN_JOB.title, company: OWN_JOB.company, location: 'Remote', listed: false });
  // Candidate B saving the same closed job learns nothing about it.
  const blake = apiAs('b');
  await save(blake, OWN_JOB.id, 'job', {});
  const theirs = (await listOf(blake)).find((item) => item.itemId === OWN_JOB.id)!;
  expect(theirs.job).toBeNull();
  expect(JSON.stringify(theirs)).not.toContain(OWN_JOB.title);
});

test('the navigation, the breadcrumb and the /dashboard/favorites alias lead to Saved Favorites', async ({ page, request, apiAs }) => {
  await arrangeSaved(request, apiAs('a'));
  const sidebar = page.getByRole('navigation', { name: 'Main navigation' });
  await page.goto('/dashboard');
  await openNavigation(page);
  await sidebar.getByRole('link', { name: 'Saved Favorites', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/favourites$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Saved Favorites' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Saved Favorites' })).toHaveAttribute('aria-current', 'page');
  await openNavigation(page);
  await expect(sidebar.getByRole('link', { name: 'Saved Favorites', exact: true })).toHaveAttribute('aria-current', 'page');
  if (isCompact(page)) await page.keyboard.press('Escape');

  await page.goto('/dashboard/favorites');
  await expect(page).toHaveURL(/\/dashboard\/favourites$/);
  await expect(titles(page)).toHaveText(ALL_TITLES);
});

test('works with the keyboard and has no axe violations, with and without a removal notice', async ({ page, request, apiAs }) => {
  await arrangeSaved(request, apiAs('a'));
  await openPage(page);
  await expectNoAxeViolations(page, '#main-content');

  // Tab order follows the page: the filters, the search, then each item's controls.
  await page.getByRole('button', { name: 'All 5', exact: true }).focus();
  const order: string[] = [];
  for (let step = 0; step < 6; step += 1) {
    await page.keyboard.press('Tab');
    order.push(await page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null;
      return element?.getAttribute('aria-label') || element?.id || element?.textContent?.trim() || '';
    }));
  }
  expect(order).toEqual([
    'Jobs 3',
    'Documents 2',
    'Search saved items',
    `Remove ${nameOf(researcher)} from your saved items`,
    `Remove ${nameOf(engineer)} from your saved items`,
    `Remove ${nameOf(reliability)} from your saved items`,
  ]);

  // The filters are toggle buttons: Space presses one.
  await page.getByRole('button', { name: 'Documents 2', exact: true }).focus();
  await page.keyboard.press('Space');
  await expect(page).toHaveURL(/\?type=documents$/);
  await expect(filterButton(page, 'Documents')).toHaveAttribute('aria-pressed', 'true');

  // Remove with Enter, then Undo with Enter: focus goes to Undo, then back to the item.
  await removeButton(page, RESUME.title).focus();
  await page.keyboard.press('Enter');
  await expect(undoButton(page, RESUME.title)).toBeFocused();
  await expectNoAxeViolations(page, '#main-content');
  await page.keyboard.press('Enter');
  await expect(statusRegion(page, `${RESUME.title} is back in your saved items.`)).toBeVisible();
  await expect(page.locator(`#favourite-title-${RESUME.id}`)).toBeFocused();
});

test.describe('as candidate B', () => {
  test.use({ storageState: storageStatePath('b') });

  test('candidate B sees only their own saved items, learns nothing of candidate A’s, and cannot remove them', async ({ page, request, apiAs }) => {
    await arrangeSaved(request, apiAs('a'));
    const blake = apiAs('b');
    await blake.del(`/resumes/${encodeURIComponent(BLAKE_RESUME.id)}`);
    expect((await blake.post(`/resumes/${encodeURIComponent(BLAKE_RESUME.id)}`, { title: BLAKE_RESUME.title, expectedRevision: null })).status).toBe(200);
    await save(blake, BLAKE_RESUME.id, 'resume', {});
    // B saves the id of A's resume: the list does not describe it.
    await save(blake, RESUME.id, 'resume', {});
    await openPage(page);
    await expect(titles(page)).toHaveText(['Resume', BLAKE_RESUME.title]);
    await expect(entry(page, 'Resume')).toContainText('Not in your account');
    await expect(main(page).getByText(RESUME.title)).toHaveCount(0);
    await expect(entry(page, BLAKE_RESUME.title).getByRole('link', { name: `Open in Resume Builder: ${BLAKE_RESUME.title}`, exact: true })).toBeVisible();

    // B cannot remove A's favourites: nothing is removed and A's list is unchanged.
    const attempt = await blake.del(`/favourites/${encodeURIComponent(researcher.id)}`);
    expect(attempt.status).toBe(200);
    expect(attempt.body).toMatchObject({ removed: false });
    expect((await listOf(apiAs('a'))).map((row) => row.itemId)).toContain(researcher.id);

    // B removes their own item; A's five stay.
    await removeButton(page, BLAKE_RESUME.title).click();
    await expect(statusRegion(page, `Removed ${BLAKE_RESUME.title} from your saved items.`)).toBeVisible();
    await expect(titles(page)).toHaveText(['Resume']);
    expect(await listOf(apiAs('a'))).toHaveLength(5);
  });
});
