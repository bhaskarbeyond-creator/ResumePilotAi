/**
 * Notifications — /dashboard/notifications — at the five directive profiles.
 *
 * Real stack only: UI :4000 → Express :8080 → MariaDB bridge. Every notification
 * a test reads is written by the backend for a real workflow, arranged through the
 * API (see arrange-applications.ts): candidate A applies to a job ("Application
 * submitted"), and the job owner invites A to interview ("Interview invitation").
 * Read changes go through PATCH /api/notifications-data/:id and
 * POST /api/notifications-data/mark-all-read and are checked again after reload
 * and through the API. Failure paths are labelled Playwright routes; one test
 * replays legacy row shapes that current producers no longer write, also
 * labelled.
 */
import AxeBuilder from '@axe-core/playwright';
import type { Page, Response } from '@playwright/test';
import { expect, expectNoHorizontalOverflow, isCompact, storageStatePath, test, tokenFor } from './fixtures';
import { JOB, arrangeApplication, arrangeManyApplications, bearer, notificationsOf, removeArranged } from './arrange-applications';

async function settleAnimations(page: Page) {
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
    .map((animation) => animation.finished.catch(() => undefined))));
}

async function expectNoAxeViolations(page: Page, scope = '#main-content') {
  await settleAnimations(page);
  const results = await new AxeBuilder({ page }).include(scope).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes.slice(0, 5).map((node) => node.target.join(' ')).join(' | ')}`)).toEqual([]);
}

const pathOf = (response: Response) => new URL(response.url()).pathname;
const isList = (response: Response) => pathOf(response) === '/api/notifications-data' && response.request().method() === 'GET';
const isPatch = (response: Response) => /^\/api\/notifications-data\/[^/]+$/.test(pathOf(response)) && response.request().method() === 'PATCH';
const isMarkAll = (response: Response) => pathOf(response) === '/api/notifications-data/mark-all-read' && response.request().method() === 'POST';

const heading = (page: Page) => page.getByRole('heading', { level: 1, name: 'Notifications', exact: true });
const feed = (page: Page) => page.getByRole('list', { name: 'Notifications', exact: true });
const rows = (page: Page) => feed(page).getByRole('listitem');
const rowFor = (page: Page, title: string) => rows(page).filter({ hasText: title });
const toggle = (page: Page, title: string, to: 'read' | 'unread') => page.getByRole('button', { name: `Mark “${title}” as ${to}`, exact: true });
const markAll = (page: Page) => page.getByRole('button', { name: 'Mark all as read', exact: true });
const filterButton = (page: Page, name: 'All' | 'Unread') =>
  page.getByRole('group', { name: 'Filter notifications' }).getByRole('button', { name: new RegExp(`^${name} \\d+$`) });
const search = (page: Page) => page.getByRole('searchbox', { name: 'Search notifications' });
const bell = (page: Page, unread: number) =>
  page.getByRole('button', { name: unread > 0 ? `${unread} unread notifications` : 'Notifications', exact: true });
const announcement = (page: Page) => page.locator('#main-content p[role="status"]');
const unreadBadge = (page: Page, count: number) => page.locator('#main-content').getByText(`${count} unread`, { exact: true });

/** The shell scrolls inside main#main-content; the document itself must never scroll. */
async function expectNoDocumentScroll(page: Page) {
  const { scrollHeight, innerHeight } = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
  }));
  expect(scrollHeight, 'the document does not scroll vertically').toBeLessThanOrEqual(innerHeight + 1);
}

async function openFeed(page: Page, url = '/dashboard/notifications') {
  const loaded = page.waitForResponse(isList);
  await page.goto(url);
  expect((await loaded).status()).toBe(200);
  await expect(heading(page)).toBeVisible();
}

test.describe('Notifications — an account with none (candidate B)', () => {
  test.use({ storageState: storageStatePath('b') });

  test('shows an honest empty state and no controls that could not do anything', async ({ page, request }) => {
    expect(await notificationsOf(request, tokenFor('b'))).toEqual([]);
    await openFeed(page);
    await expect(page.getByRole('heading', { name: 'No notifications yet' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Browse jobs', exact: true })).toHaveAttribute('href', '/dashboard/jobs');
    await expect(markAll(page)).toHaveCount(0);
    await expect(page.getByRole('group', { name: 'Filter notifications' })).toHaveCount(0);
    await expect(search(page)).toHaveCount(0);
    await expect(bell(page, 0)).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectNoAxeViolations(page);
  });
});

test.describe('Notifications — candidate A’s real feed', () => {
  test.afterEach(() => { removeArranged(); });

  test('lists the real rows newest first, with kind, time and the unread count in the page and the bell', async ({ page, request }) => {
    await arrangeApplication(request, { interview: true, spaced: true });
    await openFeed(page);
    await expect(rows(page)).toHaveCount(2);
    const [newest, oldest] = [rows(page).nth(0), rows(page).nth(1)];
    await expect(newest).toContainText('Interview invitation');
    await expect(newest).toContainText(`You have been invited to interview for ${JOB.title}`);
    await expect(newest).toContainText('Interview');
    await expect(newest.getByRole('link', { name: 'Prepare with Interview Coach' })).toHaveAttribute('href', '/dashboard/interviews');
    await expect(oldest).toContainText('Application submitted');
    // Both F-2 (the applicant keeps this row) and the company name from the jobs row.
    await expect(oldest).toContainText(`Your application for ${JOB.title} at ${JOB.company} was submitted.`);
    await expect(oldest).toContainText('Application');
    // Applied Jobs lists the candidate's real applications (P002 C14), so the row opens it.
    await expect(oldest.getByRole('link', { name: 'View your applications' })).toHaveAttribute('href', '/dashboard/applied-jobs');
    for (const row of [newest, oldest]) {
      const dateTime = await row.locator('time').getAttribute('datetime');
      expect(Number.isFinite(Date.parse(dateTime ?? '')), 'each row shows its created_at time').toBe(true);
    }
    await expect(unreadBadge(page, 2)).toBeVisible();
    await expect(filterButton(page, 'All')).toHaveAccessibleName('All 2');
    await expect(filterButton(page, 'Unread')).toHaveAccessibleName('Unread 2');
    await expect(bell(page, 2)).toBeVisible();
    await expect(toggle(page, 'Interview invitation', 'read')).toBeVisible();
    await expect(page.getByText('Showing 2 of 2 notifications', { exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectNoDocumentScroll(page);
    await expectNoAxeViolations(page);
  });

  test('marking one read persists after reload, and marking it unread restores it', async ({ page, request }) => {
    await arrangeApplication(request, { interview: true });
    await openFeed(page);
    const saveRead = page.waitForResponse(isPatch);
    await toggle(page, 'Interview invitation', 'read').click();
    const readResponse = await saveRead;
    expect(readResponse.status()).toBe(200);
    expect(readResponse.request().postDataJSON()).toEqual({ read: true });
    await expect(toggle(page, 'Interview invitation', 'unread')).toBeFocused();
    await expect(rowFor(page, 'Interview invitation')).toHaveAttribute('data-read', 'true');
    await expect(unreadBadge(page, 1)).toBeVisible();
    await expect(bell(page, 1)).toBeVisible();
    await expect(announcement(page)).toHaveText('Marked “Interview invitation” as read.');

    await page.reload();
    await expect(rowFor(page, 'Interview invitation')).toHaveAttribute('data-read', 'true');
    expect((await notificationsOf(request, tokenFor('a'))).find((row) => row.title === 'Interview invitation')?.read).toBe(true);

    const saveUnread = page.waitForResponse(isPatch);
    await toggle(page, 'Interview invitation', 'unread').click();
    expect((await saveUnread).request().postDataJSON()).toEqual({ read: false });
    await expect(toggle(page, 'Interview invitation', 'read')).toBeFocused();
    await page.reload();
    await expect(rowFor(page, 'Interview invitation')).toHaveAttribute('data-read', 'false');
    await expect(unreadBadge(page, 2)).toBeVisible();
  });

  test('mark all as read persists after reload, then has nothing left to do', async ({ page, request }) => {
    await arrangeApplication(request, { interview: true });
    await openFeed(page);
    const saved = page.waitForResponse(isMarkAll);
    await markAll(page).click();
    const response = await saved;
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, updated: 2 });
    await expect(announcement(page)).toHaveText('Marked 2 notifications as read.');
    await expect(markAll(page)).toHaveAttribute('aria-disabled', 'true');
    await expect(markAll(page)).toBeFocused();
    await expect(bell(page, 0)).toBeVisible();

    await page.reload();
    for (const title of ['Interview invitation', 'Application submitted']) {
      await expect(rowFor(page, title)).toHaveAttribute('data-read', 'true');
    }
    await expect(markAll(page)).toHaveAttribute('aria-disabled', 'true');
    let sent = 0;
    page.on('request', (request_) => { if (new URL(request_.url()).pathname === '/api/notifications-data/mark-all-read') sent += 1; });
    await markAll(page).dispatchEvent('click');
    await page.waitForTimeout(500);
    expect(sent, 'an unavailable Mark all as read sends nothing').toBe(0);
    expect((await notificationsOf(request, tokenFor('a'))).every((row) => row.read)).toBe(true);
  });

  test('a rejected read change rolls back and says why, even when the refresh fails too; the server keeps the row unread', async ({ page, request, guard }) => {
    guard.expectApiStatuses(500, 503);
    await arrangeApplication(request, { interview: true });
    await openFeed(page);
    // Injected failure (labelled): Playwright answers the PATCH and every later list
    // request, as if the server went down; only the client rollback can restore truth.
    await page.route('**/api/notifications-data/*', (route) => (route.request().method() === 'PATCH'
      ? route.fulfill({ status: 500, json: { success: false, error: 'Failed to update notification' } })
      : route.fallback()));
    await page.route('**/api/notifications-data', (route) => (route.request().method() === 'GET'
      ? route.fulfill({ status: 503, json: { success: false, error: 'Failed to fetch notifications' } })
      : route.fallback()));
    await toggle(page, 'Interview invitation', 'read').click();
    const alert = page.getByRole('alert').filter({ hasText: 'Couldn’t mark' });
    await expect(alert).toContainText('Couldn’t mark “Interview invitation” as read. Failed to update notification');
    await expect(rowFor(page, 'Interview invitation')).toHaveAttribute('data-read', 'false');
    await expect(toggle(page, 'Interview invitation', 'read')).toBeFocused();
    await expect(unreadBadge(page, 2)).toBeVisible();
    await expect(page.getByText('Couldn’t refresh notifications, so this list may be out of date.', { exact: false })).toBeVisible({ timeout: 15_000 });
    await alert.getByRole('button', { name: 'Dismiss' }).click();
    await expect(alert).toHaveCount(0);

    await page.unroute('**/api/notifications-data/*');
    await page.unroute('**/api/notifications-data');
    await page.reload();
    await expect(rowFor(page, 'Interview invitation')).toHaveAttribute('data-read', 'false');
    expect((await notificationsOf(request, tokenFor('a'))).every((row) => !row.read)).toBe(true);
  });

  test('a rejected mark all rolls every row back and says why', async ({ page, request, guard }) => {
    guard.expectApiStatuses(500);
    await arrangeApplication(request, { interview: true });
    await openFeed(page);
    // Injected failure (labelled): Playwright answers mark-all-read; the server never sees it.
    await page.route('**/api/notifications-data/mark-all-read', (route) =>
      route.fulfill({ status: 500, json: { success: false, error: 'Failed to mark notifications as read' } }));
    await markAll(page).click();
    await expect(page.getByRole('alert')).toContainText('Couldn’t mark all notifications as read. Failed to mark notifications as read');
    for (const title of ['Interview invitation', 'Application submitted']) {
      await expect(rowFor(page, title)).toHaveAttribute('data-read', 'false');
    }
    await expect(unreadBadge(page, 2)).toBeVisible();
    await expect(markAll(page)).not.toHaveAttribute('aria-disabled', 'true');
    expect((await notificationsOf(request, tokenFor('a'))).every((row) => !row.read)).toBe(true);
  });

  test('a failed load says why, the bell does not claim there is nothing, and Try again recovers', async ({ page, request, guard }) => {
    guard.expectApiStatuses(503);
    await arrangeApplication(request, { interview: true });
    let failures = 0;
    // Injected failure (labelled): Playwright answers the first two list requests
    // (the query retries once); later requests reach the server.
    await page.route('**/api/notifications-data', (route) => {
      if (route.request().method() === 'GET' && failures < 2) {
        failures += 1;
        return route.fulfill({ status: 503, json: { success: false, error: 'Notifications are temporarily unavailable.' } });
      }
      return route.fallback();
    });
    await page.goto('/dashboard/notifications');
    await expect(page.getByText('Notifications could not be loaded')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Notifications are temporarily unavailable.')).toBeVisible();
    expect(failures).toBe(2);
    await expect(markAll(page)).toHaveCount(0);

    await bell(page, 0).click();
    await expect(page.getByRole('menu')).toContainText('Notifications couldn’t be loaded. Open the Notification Center to try again.');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(bell(page, 0)).toBeFocused();

    const recovered = page.waitForResponse((response) => isList(response) && response.status() === 200);
    await page.getByRole('button', { name: 'Try again' }).click();
    await recovered;
    await expect(rows(page)).toHaveCount(2);
    await expect(heading(page)).toBeFocused();
    await expect(bell(page, 2)).toBeVisible();
  });

  test('the Unread filter lives in the URL, survives reload, and keeps a row in place while you work', async ({ page, request }) => {
    await arrangeApplication(request, { interview: true });
    const submitted = (await notificationsOf(request, tokenFor('a'))).find((row) => row.type === 'job_application');
    expect(submitted, 'the applicant kept the "Application submitted" row').toBeTruthy();
    const marked = await request.patch(`/api/notifications-data/${submitted!.id}`, { headers: bearer(tokenFor('a')), data: { read: true } });
    expect(marked.status()).toBe(200);

    await openFeed(page);
    await filterButton(page, 'Unread').click();
    await expect(page).toHaveURL(/\/dashboard\/notifications\?filter=unread$/);
    await expect(filterButton(page, 'Unread')).toHaveAttribute('aria-pressed', 'true');
    await expect(filterButton(page, 'All')).toHaveAttribute('aria-pressed', 'false');
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText('Interview invitation');

    await page.reload();
    await expect(filterButton(page, 'Unread')).toHaveAttribute('aria-pressed', 'true');
    await expect(rows(page)).toHaveCount(1);

    const saved = page.waitForResponse(isPatch);
    await toggle(page, 'Interview invitation', 'read').click();
    expect((await saved).status()).toBe(200);
    await expect(toggle(page, 'Interview invitation', 'unread')).toBeFocused();
    await expect(rows(page)).toHaveCount(1);

    await filterButton(page, 'All').click();
    await expect(page).toHaveURL(/\/dashboard\/notifications$/);
    await expect(rows(page)).toHaveCount(2);
    await filterButton(page, 'Unread').click();
    await expect(page.getByRole('heading', { name: 'You’re all caught up' })).toBeVisible();
    await page.getByRole('button', { name: 'Show all notifications' }).click();
    await expect(filterButton(page, 'All')).toHaveAttribute('aria-pressed', 'true');
    await expect(rows(page)).toHaveCount(2);

    await openFeed(page, '/dashboard/notifications?filter=archived');
    await expect(filterButton(page, 'All')).toHaveAttribute('aria-pressed', 'true');
    await expect(rows(page)).toHaveCount(2);
  });

  test('search matches title, message and kind; no match offers Clear search, which returns focus to the field', async ({ page, request }) => {
    await arrangeApplication(request, { interview: true });
    await openFeed(page);
    await search(page).fill(JOB.company.toUpperCase());
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText('Application submitted');
    await search(page).fill('interview');
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText('Interview invitation');

    await search(page).fill('zzz-no-such-notification');
    const none = page.getByRole('region', { name: 'No notifications match “zzz-no-such-notification”' });
    await expect(none).toBeVisible();
    await expect(page.locator('#main-content p[aria-live="polite"]:not([role])')).toHaveText('0 notifications match “zzz-no-such-notification”.');
    await none.getByRole('button', { name: 'Clear search' }).click();
    await expect(search(page)).toHaveValue('');
    await expect(search(page)).toBeFocused();
    await expect(rows(page)).toHaveCount(2);

    await search(page).fill('interview');
    await page.getByRole('button', { name: 'Clear search', exact: true }).click();
    await expect(search(page)).toHaveValue('');
    await expect(search(page)).toBeFocused();
    await expect(rows(page)).toHaveCount(2);
  });

  test('the interview invitation opens Interview Coach, counts as read, and Back returns to the same view', async ({ page, request }) => {
    await arrangeApplication(request, { interview: true });
    await openFeed(page, '/dashboard/notifications?filter=unread');
    await expect(rows(page)).toHaveCount(2);
    const markedRead = page.waitForResponse(isPatch);
    await rowFor(page, 'Interview invitation').getByRole('link', { name: 'Prepare with Interview Coach' }).click();
    await expect(page).toHaveURL(/\/dashboard\/interviews$/);
    const response = await markedRead;
    expect(response.status()).toBe(200);
    expect(response.request().postDataJSON()).toEqual({ read: true });
    await expect(page.getByRole('heading', { level: 1, name: 'AI Interview Coach' })).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/dashboard\/notifications\?filter=unread$/);
    await expect(filterButton(page, 'Unread')).toHaveAttribute('aria-pressed', 'true');
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText('Application submitted');
    expect((await notificationsOf(request, tokenFor('a'))).find((row) => row.title === 'Interview invitation')?.read).toBe(true);

    await page.goForward();
    await expect(page).toHaveURL(/\/dashboard\/interviews$/);
  });

  test('rows link only where there is an honest destination, and a broken response is reported (labelled mocks)', async ({ page }) => {
    // MOCKED RESPONSE (labelled): current producers no longer write `message` rows
    // (DIR-072 stopped them) but existing databases still hold them, so their
    // shapes are replayed here together with other producer types. Nothing is written.
    const replayed = [
      { id: 'legacy_msg_1', type: 'message', title: 'New message', message: 'Riley Recruiter sent you a message.', data: { conversationId: 'conv_legacy_1' }, read: true, created_at: '2026-01-05T10:00:00.000Z' },
      { id: 'legacy_msg_2', type: 'message', title: 'Earlier chat', message: '', data: {}, read: true, created_at: '2026-01-04T10:00:00.000Z' },
      { id: 'payment_row', type: 'payment_active', title: 'Payment confirmed', message: 'Your payment was confirmed and premium access is active.', data: {}, read: true, created_at: '2026-01-03T10:00:00.000Z' },
      { id: 'moderation_row', type: 'blog_moderation', title: 'Blog post published', message: '“Notes” is now approved.', data: {}, read: true, created_at: '2026-01-02T10:00:00.000Z' },
      { id: 'accepted_row', type: 'application_accepted', title: 'Application accepted', message: 'Your application for Platform Engineer at Example Test Co was accepted.', data: { jobId: 'job_replayed', applicationId: 'app_replayed' }, read: true, created_at: '2026-01-01T10:00:00.000Z' },
      { id: 'received_row', type: 'job_application_received', title: 'New job application', message: 'Blake Tester applied for Platform Engineer.', data: { jobId: 'job_replayed', applicationId: 'app_replayed_b' }, read: true, created_at: '2025-12-31T10:00:00.000Z' },
    ];
    await page.route('**/api/notifications-data', (route) => (route.request().method() === 'GET'
      ? route.fulfill({ json: { success: true, notifications: replayed } })
      : route.fallback()));
    await openFeed(page);
    await expect(rows(page)).toHaveCount(6);
    await expect(rowFor(page, 'New message').getByRole('link', { name: 'Open conversation' })).toHaveAttribute('href', '/dashboard/messages?conversationId=conv_legacy_1');
    await expect(rowFor(page, 'Earlier chat').getByRole('link', { name: 'Open messages' })).toHaveAttribute('href', '/dashboard/messages');
    await expect(rowFor(page, 'Payment confirmed')).toContainText('Billing');
    await expect(rowFor(page, 'Payment confirmed').getByRole('link')).toHaveCount(0);
    await expect(rowFor(page, 'Blog post published')).toContainText('Update');
    await expect(rowFor(page, 'Blog post published').getByRole('link')).toHaveCount(0);
    // The candidate's own application rows open Applied Jobs; the employer's
    // "New job application" row is about someone else's application (P002 C14).
    await expect(rowFor(page, 'Application accepted').getByRole('link', { name: 'View your applications' })).toHaveAttribute('href', '/dashboard/applied-jobs');
    await expect(rowFor(page, 'New job application').getByRole('link')).toHaveCount(0);
    await expect(markAll(page)).toHaveAttribute('aria-disabled', 'true');

    // MOCKED RESPONSE (labelled): a row without an id breaks the documented contract.
    await page.unroute('**/api/notifications-data');
    await page.route('**/api/notifications-data', (route) => (route.request().method() === 'GET'
      ? route.fulfill({ json: { success: true, notifications: [{ title: 'No id', message: 'This row has no primary key.' }] } })
      : route.fallback()));
    await page.reload();
    await expect(page.getByText('Notifications could not be loaded')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('The server returned a notification this page cannot read.')).toBeVisible();
    await expect(page.getByText('No id', { exact: true })).toHaveCount(0);
  });

  test('shows 20 at a time; Show more reveals the rest and moves focus to the first new row', async ({ page, request }) => {
    test.setTimeout(150_000);
    await arrangeManyApplications(request, 21);
    await openFeed(page);
    await expect(rows(page)).toHaveCount(20);
    await expect(page.getByText('Showing 20 of 21 notifications', { exact: true })).toBeVisible();
    await expectNoDocumentScroll(page);
    await page.getByRole('button', { name: 'Show 1 more', exact: true }).click();
    await expect(rows(page)).toHaveCount(21);
    await expect(page.getByText('Showing 21 of 21 notifications', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Show \d+ more$/ })).toHaveCount(0);
    const focusedRow = await page.evaluate(() => {
      const row = document.activeElement?.closest('li');
      return row?.parentElement ? Array.from(row.parentElement.children).indexOf(row) : -1;
    });
    expect(focusedRow, 'focus moved to the first newly shown row').toBe(20);
    await expect(announcement(page)).toHaveText('Showing 21 of 21 notifications.');
    await expectNoDocumentScroll(page);
    // Paging belongs to one view: switching the filter starts again at 20.
    await filterButton(page, 'Unread').click();
    await expect(rows(page)).toHaveCount(20);
    await expectNoHorizontalOverflow(page);
  });

  test('every control works from the keyboard, and focus stays on a toggle after it changes', async ({ page, request }) => {
    await arrangeApplication(request, { interview: true, spaced: true });
    await openFeed(page);
    await filterButton(page, 'All').focus();
    await page.keyboard.press('Tab');
    await expect(filterButton(page, 'Unread')).toBeFocused();
    await page.keyboard.press('Space');
    await expect(filterButton(page, 'Unread')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Enter');
    await expect(filterButton(page, 'All')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(search(page)).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(rowFor(page, 'Interview invitation').getByRole('link', { name: 'Prepare with Interview Coach' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(toggle(page, 'Interview invitation', 'read')).toBeFocused();
    const saved = page.waitForResponse(isPatch);
    await page.keyboard.press('Enter');
    expect((await saved).status()).toBe(200);
    await expect(toggle(page, 'Interview invitation', 'unread')).toBeFocused();
    // While its write is in flight the toggle is aria-disabled and ignores presses.
    await expect(toggle(page, 'Interview invitation', 'unread')).not.toHaveAttribute('aria-busy', 'true');
    const restored = page.waitForResponse(isPatch);
    await page.keyboard.press('Space');
    expect((await restored).request().postDataJSON()).toEqual({ read: false });
    await expect(toggle(page, 'Interview invitation', 'read')).toBeFocused();
    await page.keyboard.press('Tab');
    // The application row links to Applied Jobs (P002 C14) before its toggle.
    await expect(rowFor(page, 'Application submitted').getByRole('link', { name: 'View your applications' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(toggle(page, 'Application submitted', 'read')).toBeFocused();
  });

  test('the header bell shows the live unread count, lists the real rows, and closes with Escape', async ({ page, request }) => {
    await arrangeApplication(request, { interview: true, spaced: true });
    await openFeed(page);
    await bell(page, 2).click();
    const menu = page.getByRole('menu');
    await expect(menu.getByRole('menuitem', { name: /^Unread: Interview invitation/ })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: /^Unread: Application submitted/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(bell(page, 2)).toBeFocused();

    await toggle(page, 'Application submitted', 'read').click();
    await expect(bell(page, 1)).toBeVisible();
    if (!isCompact(page)) {
      await expect(page.getByRole('link', { name: /^Notifications/ }).filter({ hasText: '1' })).toBeVisible();
    }
  });

  test('another account can neither see nor change these notifications', async ({ request }) => {
    await arrangeApplication(request, { interview: true });
    const mine = await notificationsOf(request, tokenFor('a'));
    expect(mine.map((row) => row.title).sort()).toEqual(['Application submitted', 'Interview invitation']);
    const theirs = await notificationsOf(request, tokenFor('b'));
    expect(theirs.filter((row) => mine.some((own) => own.id === row.id))).toEqual([]);
    for (const row of mine) {
      const patched = await request.patch(`/api/notifications-data/${row.id}`, { headers: bearer(tokenFor('b')), data: { read: true } });
      expect(patched.status(), 'B cannot change A’s row').toBe(404);
    }
    const markAllAsB = await request.post('/api/notifications-data/mark-all-read', { headers: bearer(tokenFor('b')), data: {} });
    expect(markAllAsB.status()).toBe(200);
    expect((await notificationsOf(request, tokenFor('a'))).every((row) => !row.read), 'B’s mark all never touches A').toBe(true);
    expect((await request.get('/api/notifications-data')).status(), 'no token, no feed').toBe(401);
    const extraField = await request.patch(`/api/notifications-data/${mine[0].id}`, { headers: bearer(tokenFor('a')), data: { read: true, title: 'changed' } });
    expect(extraField.status(), 'only the read state can change').toBe(400);
  });
});
