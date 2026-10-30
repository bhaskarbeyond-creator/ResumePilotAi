/**
 * Settings — /dashboard/settings — at the five directive profiles.
 *
 * Real stack only: UI :4000 → Express :8080 → MariaDB bridge.
 * - Master Profile edits go through GET/POST /api/users-data/profile as
 *   candidate A and are checked after reload and through the API. A's saved
 *   fields are restored after every Master Profile test (the cover-letter spec
 *   reads A's names from the same profile).
 * - Export downloads A's real archive and checks it holds A's data only.
 * - Account deletion only ever runs for a disposable preview account that the
 *   test registers through the real form. In this sandbox the identity provider
 *   has no credentials, so the real outcome is the documented partial state
 *   (503 ACCOUNT_IDENTITY_DELETE_FAILED: personal data removed, identity
 *   pending). The recent-sign-in rejection and the final identity removal are
 *   labelled Playwright responses. Wherever candidate A opens the deletion
 *   dialog, a route fails the test if a deletion request is ever sent.
 * - Other failure paths are labelled Playwright routes.
 */
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import type { APIRequestContext, Page, Response } from '@playwright/test';
import { ACCOUNTS, expect, expectNoHorizontalOverflow, isCompact, test, tokenFor, uidFor } from './fixtures';

const PROFILE_KEYS = [
  'firstname', 'lastname', 'occupation', 'phone', 'address', 'city',
  'postalCode', 'country', 'websiteUrl', 'linkedinUrl', 'githubUrl', 'summary',
] as const;
type ProfileKey = (typeof PROFILE_KEYS)[number];
type ProfileValues = Record<ProfileKey, string>;

const [A_FIRST, A_LAST] = ACCOUNTS.a.name.split(' ') as [string, string];

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

/** The shell scrolls inside main#main-content; the document itself must never scroll. */
async function expectNoDocumentScroll(page: Page) {
  const { scrollHeight, innerHeight } = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
  }));
  expect(scrollHeight, 'the document does not scroll vertically').toBeLessThanOrEqual(innerHeight + 1);
}

// ── Real API helpers ─────────────────────────────────────────────────────────

async function readProfile(request: APIRequestContext, token = tokenFor('a')) {
  const response = await request.get('/api/users-data/profile', { headers: { Authorization: `Bearer ${token}` } });
  expect(response.status(), 'profile read').toBe(200);
  const body = (await response.json()) as { user: { revision: number; email?: string; profile: Record<string, unknown> } };
  return { revision: Number(body.user.revision), email: body.user.email, profile: body.user.profile };
}

/** A real save from "another tab": the same endpoint, on top of the stored revision. */
async function writeProfile(request: APIRequestContext, profile: Partial<ProfileValues>, token = tokenFor('a')) {
  const { revision } = await readProfile(request, token);
  const response = await request.post('/api/users-data/profile', {
    headers: { Authorization: `Bearer ${token}` },
    data: { expectedRevision: revision, profile },
  });
  expect(response.status(), 'profile write').toBe(200);
}

async function snapshotProfile(request: APIRequestContext): Promise<ProfileValues> {
  const { profile } = await readProfile(request);
  return Object.fromEntries(PROFILE_KEYS.map((key) => [key, typeof profile[key] === 'string' ? profile[key] : ''])) as ProfileValues;
}

// ── Locators ─────────────────────────────────────────────────────────────────

const pathOf = (response: Response) => new URL(response.url()).pathname;
const isProfileSave = (response: Response) => pathOf(response) === '/api/users-data/profile' && response.request().method() === 'POST';

const settingsHeading = (page: Page) => page.getByRole('heading', { level: 1, name: 'Settings', exact: true });
const sectionNav = (page: Page) => page.getByRole('navigation', { name: 'Settings sections' });
const sectionLink = (page: Page, name: string) => sectionNav(page).getByRole('link', { name, exact: true });
const sectionHeading = (page: Page, name: string) => page.getByRole('heading', { level: 2, name, exact: true });
const profileForm = (page: Page) => page.getByRole('form', { name: 'Master Profile' });
const field = (page: Page, label: string) => profileForm(page).getByLabel(label);
const saveButton = (page: Page) => profileForm(page).getByRole('button', { name: /^(Save Master Profile|Saving…)$/ });
const formStatus = (page: Page) => profileForm(page).getByRole('status');
const formAlert = (page: Page) => profileForm(page).getByRole('alert');
const deleteTrigger = (page: Page) => page.getByRole('button', { name: 'Delete account…', exact: true });
const deleteDialog = (page: Page) => page.getByRole('dialog');

async function openSettings(page: Page, url = '/dashboard/settings') {
  await page.goto(url);
  await expect(settingsHeading(page)).toBeVisible();
}

/** Wait until the Master Profile form shows A's real saved names. */
async function expectProfileLoaded(page: Page) {
  await expect(field(page, 'First name')).toHaveValue(A_FIRST);
  await expect(field(page, 'Last name')).toHaveValue(A_LAST);
}

/**
 * Safety net for tests that open the deletion dialog as candidate A: any
 * deletion request is answered by Playwright (never reaching the server) and
 * fails the test.
 */
async function forbidDeletion(page: Page) {
  const attempts: string[] = [];
  await page.route('**/api/account/delete', (route) => {
    attempts.push(route.request().method());
    return route.fulfill({ status: 418, json: { success: false, error: 'Blocked by the test: candidate A must never be deleted.' } });
  });
  return attempts;
}

// ── Master Profile ───────────────────────────────────────────────────────────

test.describe('Master Profile', () => {
  let original: ProfileValues;
  test.beforeEach(async ({ request }) => { original = await snapshotProfile(request); });
  test.afterEach(async ({ request }) => { await writeProfile(request, original); });

  test('loads the real profile, saves edits through the API and keeps them after reload', async ({ page, request }) => {
    await openSettings(page);
    await expect(sectionLink(page, 'Master Profile')).toHaveAttribute('aria-current', 'page');
    await expect(sectionHeading(page, 'Master Profile')).toBeVisible();
    await expectProfileLoaded(page);
    await expect(field(page, 'Sign-in email')).toHaveValue(ACCOUNTS.a.email);
    await expect(field(page, 'Sign-in email')).toHaveAttribute('readonly', '');
    // Both live regions exist, empty, before any message (announcements need them in place).
    await expect(formStatus(page)).toHaveText('');
    await expect(formAlert(page)).toHaveText('');

    const run = test.info().project.name;
    const typed: Array<[string, ProfileKey, string]> = [
      ['Professional headline', 'occupation', `QA Analyst (${run})`],
      ['Phone', 'phone', '+91 98765 43210'],
      ['City', 'city', 'Vijayawada'],
      ['Postal code', 'postalCode', '520001'],
      ['Country', 'country', 'India'],
      ['LinkedIn profile', 'linkedinUrl', 'https://www.linkedin.com/in/avery-tester'],
      ['Professional summary', 'summary', `Quality analyst. Saved by the ${run} run.`],
    ];
    for (const [label, , value] of typed) await field(page, label).fill(value);
    await expect(profileForm(page).getByText('You have unsaved changes.')).toBeVisible();
    await expect(profileForm(page).getByText(`${typed[6][2].length} of 5000 characters`)).toBeVisible();

    const saved = page.waitForResponse(isProfileSave);
    await saveButton(page).click();
    const response = await saved;
    expect(response.status()).toBe(200);
    // Only the edited fields are sent, under the backend's own keys, on top of the loaded revision.
    const sent = response.request().postDataJSON() as { expectedRevision: number; profile: Record<string, string> };
    expect(Object.keys(sent.profile).sort()).toEqual(typed.map(([, key]) => key).sort());
    expect(Object.keys(sent.profile).every((key) => (PROFILE_KEYS as readonly string[]).includes(key))).toBe(true);
    expect(Number.isInteger(sent.expectedRevision)).toBe(true);
    await expect(formStatus(page)).toHaveText('Master Profile saved.');
    await expect(saveButton(page)).toBeFocused();
    await expect(profileForm(page).getByText('All changes saved.')).toBeVisible();

    const stored = (await readProfile(request)).profile;
    for (const [, key, value] of typed) expect(stored[key], key).toBe(value);
    expect(stored.firstname).toBe(A_FIRST);

    await page.reload();
    await expectProfileLoaded(page);
    for (const [label, , value] of typed) await expect(field(page, label)).toHaveValue(value);
  });

  test('validates before sending, focuses the first problem, and discards or skips unchanged saves', async ({ page }) => {
    await openSettings(page);
    await expectProfileLoaded(page);
    let posts = 0;
    page.on('request', (request) => { if (request.method() === 'POST' && request.url().endsWith('/api/users-data/profile')) posts += 1; });
    await expect(field(page, 'First name')).toHaveAttribute('maxlength', '120');
    await expect(field(page, 'Professional summary')).toHaveAttribute('maxlength', '5000');
    await expect(field(page, 'First name')).toHaveAttribute('aria-required', 'true');

    await field(page, 'First name').fill('   ');
    await field(page, 'Website').fill('example.com');
    await saveButton(page).click();
    await expect(formAlert(page)).toHaveText('Some fields need attention. Fix them, then save again.');
    await expect(field(page, 'First name')).toBeFocused();
    await expect(field(page, 'First name')).toHaveAttribute('aria-invalid', 'true');
    await expect(field(page, 'First name')).toHaveAccessibleDescription('Enter your first name.');
    await expect(field(page, 'Website')).toHaveAccessibleDescription('Enter a full web address that starts with https://');
    expect(posts, 'invalid input is never sent').toBe(0);

    await field(page, 'First name').fill(A_FIRST);
    await expect(field(page, 'First name')).not.toHaveAttribute('aria-invalid', 'true');
    await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
    await expect(field(page, 'Website')).toHaveValue(original.websiteUrl);
    await expect(field(page, 'Website')).not.toHaveAttribute('aria-invalid', 'true');
    await expect(formStatus(page)).toHaveText('Unsaved changes discarded.');
    await expect(page.getByRole('button', { name: 'Discard changes', exact: true })).toHaveCount(0);

    await saveButton(page).click();
    await expect(formStatus(page)).toHaveText('No changes to save. Your Master Profile is up to date.');
    expect(posts, 'an unchanged profile is not re-sent').toBe(0);
  });

  test('keeps the edits on a save conflict and requires an explicit resolution', async ({ page, request, guard }) => {
    guard.expectApiStatuses(409);
    let saves = 0;
    page.on('response', (response) => { if (isProfileSave(response)) saves += 1; });
    await openSettings(page);
    await expectProfileLoaded(page);
    await field(page, 'City').fill('Vijayawada');
    // Another tab saves first: a real write that changes the city and a field this tab never touched.
    await writeProfile(request, { city: 'Guntur', country: 'Bharat' });
    const first = page.waitForResponse(isProfileSave);
    await saveButton(page).click();
    expect((await first).status()).toBe(409);
    await expect(formAlert(page)).toContainText('changed in another tab or device');

    // The conflict is announced, the local edit survives and the server keeps its version.
    await expect(profileForm(page).getByRole('heading', { name: 'Changed in another tab or device' })).toBeVisible();
    await expect(field(page, 'City')).toHaveValue('Vijayawada');
    expect((await readProfile(request)).profile.city, 'nothing was overwritten').toBe('Guntur');

    // Saving again does not guess: it asks for one of the three explicit resolutions
    // and sends no request, so the other tab's write can never be silently replaced.
    const saveAttempts = saves;
    await saveButton(page).click();
    await expect(formAlert(page)).toHaveText('Your Master Profile was changed elsewhere. Choose one of the options above before saving.');
    expect(saves, 'no save is sent while the conflict is unresolved').toBe(saveAttempts);

    // "Inspect remote changes" shows both versions side by side without writing anything.
    await profileForm(page).getByRole('button', { name: 'Review differences', exact: true }).click();
    const review = page.getByRole('dialog');
    await expect(review.getByRole('heading', { name: 'Review differences', exact: true })).toBeVisible();
    await expect(review.getByRole('columnheader', { name: 'Field', exact: true })).toBeVisible();
    await expect(review.getByRole('cell', { name: 'Guntur', exact: true })).toBeVisible();
    await expect(review.getByRole('cell', { name: 'Vijayawada', exact: true })).toBeVisible();
    await review.getByRole('button', { name: 'Back to my edits', exact: true }).click();
    await expect(review).toBeHidden();
    expect((await readProfile(request)).profile.city, 'inspecting writes nothing').toBe('Guntur');

    // "Keep local & overwrite" sends only this tab's edit on top of the revision the
    // server reported, so the other tab's untouched field survives.
    const serverRevision = (await readProfile(request)).revision;
    const second = page.waitForResponse(isProfileSave);
    await profileForm(page).getByRole('button', { name: 'Keep my edits and overwrite', exact: true }).click();
    const merged = await second;
    expect(merged.status()).toBe(200);
    const sent = merged.request().postDataJSON() as { expectedRevision: number; profile: Record<string, string> };
    expect(sent.profile).toEqual({ city: 'Vijayawada' });
    expect(sent.expectedRevision, 'the write targets the revision the server just reported').toBe(serverRevision);
    await expect(formStatus(page)).toHaveText('Master Profile saved.');
    await expect(field(page, 'Country')).toHaveValue('Bharat');
    const stored = (await readProfile(request)).profile;
    expect(stored.city).toBe('Vijayawada');
    expect(stored.country, 'the other tab’s change is kept').toBe('Bharat');
    await expect(profileForm(page).getByRole('heading', { name: 'Changed in another tab or device' })).toHaveCount(0);

    // "Discard & reload" loads the newest saved version instead of the stale one.
    await field(page, 'City').fill('Eluru');
    await writeProfile(request, { city: 'Tenali' });
    await saveButton(page).click();
    await expect(formAlert(page)).toContainText('changed in another tab or device');
    await profileForm(page).getByRole('button', { name: 'Discard my edits and load the newer version', exact: true }).click();
    await expect(field(page, 'City')).toHaveValue('Tenali');
    await expect(formStatus(page)).toHaveText('Loaded the newer saved version. Your unsaved edits were discarded.');
    expect((await readProfile(request)).profile.city, 'discarding writes nothing').toBe('Tenali');
  });

  test('shows a loading state, then a retryable error instead of an empty form', async ({ page, guard }) => {
    guard.expectApiStatuses(503);
    // Start on another page, then open Settings from the account menu (in-app navigation).
    await page.goto('/dashboard/notifications');
    await expect(page.getByRole('heading', { level: 1, name: 'Notifications', exact: true })).toBeVisible();
    let failures = 0;
    // Injected failure (labelled): the first two Master Profile reads by the page
    // (XHR; the query retries once) are answered slowly with 503. The session
    // check uses fetch and is never touched. Later reads reach the server.
    await page.route('**/api/users-data/profile', async (route) => {
      if (route.request().method() === 'GET' && route.request().resourceType() === 'xhr' && failures < 2) {
        failures += 1;
        await new Promise((resolve) => setTimeout(resolve, 600));
        return route.fulfill({ status: 503, json: { success: false, code: 'DATABASE_UNAVAILABLE', error: 'The database is temporarily unavailable.' } });
      }
      return route.fallback();
    });
    await page.getByRole('button', { name: `Account menu for ${ACCOUNTS.a.name}` }).click();
    await page.getByRole('menuitem', { name: 'Your Profile' }).click();
    await expect(page).toHaveURL(/\/dashboard\/settings\?tab=profile$/);
    await expect(page.getByText('Loading your Master Profile…')).toBeVisible();
    await expect(page.getByText('Your Master Profile could not be loaded.')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('The database is temporarily unavailable.')).toBeVisible();
    await expect(profileForm(page)).toHaveCount(0);
    expect(failures).toBe(2);

    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await expectProfileLoaded(page);
  });

  test('reports a failed save without claiming success and keeps the typed values', async ({ page, request, guard }) => {
    guard.expectApiStatuses(500);
    await openSettings(page);
    await expectProfileLoaded(page);
    // Injected failure (labelled): Playwright answers the save; the server never sees it.
    await page.route('**/api/users-data/profile', (route) => (route.request().method() === 'POST'
      ? route.fulfill({ status: 500, json: { success: false, code: 'INTERNAL_ERROR', error: 'Failed to save user profile' } })
      : route.fallback()));
    await field(page, 'Professional headline').fill('Never stored');
    await saveButton(page).click();
    await expect(formAlert(page)).toHaveText('Your changes were not saved. Failed to save user profile');
    await expect(formStatus(page)).toHaveText('');
    await expect(field(page, 'Professional headline')).toHaveValue('Never stored');
    await expect(profileForm(page).getByText('You have unsaved changes.')).toBeVisible();
    expect((await readProfile(request)).profile.occupation ?? '').toBe(original.occupation);
  });

  test('keeps unsaved edits across sections and warns before a reload drops them', async ({ page }) => {
    await openSettings(page);
    await expectProfileLoaded(page);
    await field(page, 'Professional headline').fill('Draft headline');
    await sectionLink(page, 'Appearance').click();
    await expect(sectionHeading(page, 'Appearance')).toBeVisible();
    await expect(profileForm(page)).toBeHidden();
    const warned = await page.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(warned, 'a reload with unsaved edits asks first').toBe(true);
    await page.goBack();
    await expect(sectionHeading(page, 'Master Profile')).toBeVisible();
    await expect(field(page, 'Professional headline')).toHaveValue('Draft headline');
    await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
    const clean = await page.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(clean, 'no prompt once nothing is unsaved').toBe(false);
  });
});

// ── Sections, addresses and entry points ─────────────────────────────────────

test.describe('Sections and addresses', () => {
  test('section links keep history and refresh, and every supported address opens its section', async ({ page }) => {
    await openSettings(page, '/dashboard/settings?tab=security');
    await expect(sectionHeading(page, 'Security & 2FA')).toBeVisible();
    await expect(sectionLink(page, 'Security & 2FA')).toHaveAttribute('aria-current', 'page');
    await expect(sectionLink(page, 'Master Profile')).not.toHaveAttribute('aria-current', 'page');

    await sectionLink(page, 'Account & Data').click();
    await expect(page).toHaveURL(/\/dashboard\/settings\?tab=account$/);
    await expect(sectionHeading(page, 'Account & Data')).toBeVisible();
    await sectionLink(page, 'Appearance').click();
    await expect(page).toHaveURL(/\?tab=appearance$/);
    await expect(sectionLink(page, 'Appearance')).toHaveAttribute('aria-current', 'page');
    await page.goBack();
    await expect(sectionHeading(page, 'Account & Data')).toBeVisible();
    await page.goBack();
    await expect(sectionHeading(page, 'Security & 2FA')).toBeVisible();
    await page.goForward();
    await expect(sectionHeading(page, 'Account & Data')).toBeVisible();
    await page.reload();
    await expect(sectionHeading(page, 'Account & Data')).toBeVisible();
    await expect(sectionHeading(page, 'Master Profile')).toBeHidden();

    const addresses: Array<[string, RegExp, string]> = [
      ['/dashboard/settings', /\/dashboard\/settings$/, 'Master Profile'],
      ['/dashboard/settings?tab=Profile', /\?tab=Profile$/, 'Master Profile'],
      ['/dashboard/settings?tab=2fa', /\?tab=2fa$/, 'Security & 2FA'],
      ['/dashboard/settings?tab=ACCOUNT', /\?tab=ACCOUNT$/, 'Account & Data'],
      ['/dashboard/settings?tab=unknown-section', /\?tab=unknown-section$/, 'Master Profile'],
      ['/dashboard/profile', /\/dashboard\/settings\?tab=profile$/, 'Master Profile'],
      ['/dashboard/security', /\/dashboard\/settings\?tab=security$/, 'Security & 2FA'],
      ['/dashboard/account', /\/dashboard\/settings\?tab=account$/, 'Account & Data'],
    ];
    for (const [address, url, section] of addresses) {
      await page.goto(address);
      await expect(page, address).toHaveURL(url);
      await expect(sectionHeading(page, section), address).toBeVisible();
    }
    // Sections that moved out of Settings keep their old links.
    await page.goto('/dashboard/settings?tab=support');
    await expect(page).toHaveURL(/\/dashboard\/support$/);
    await page.goto('/dashboard/settings?tab=notifications');
    await expect(page).toHaveURL(/\/dashboard\/notifications$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Notifications', exact: true })).toBeVisible();
  });

  test('the account menu and the sidebar open the matching sections', async ({ page }) => {
    await openSettings(page, '/dashboard/settings?tab=appearance');
    const menuItems: Array<[string, string, RegExp]> = [
      ['Account Settings', 'Account & Data', /\?tab=account$/],
      ['Security & 2FA Hub', 'Security & 2FA', /\?tab=security$/],
      ['Your Profile', 'Master Profile', /\?tab=profile$/],
    ];
    for (const [item, section, url] of menuItems) {
      await page.getByRole('button', { name: `Account menu for ${ACCOUNTS.a.name}` }).click();
      await page.getByRole('menuitem', { name: item }).click();
      await expect(page).toHaveURL(url);
      await expect(sectionHeading(page, section)).toBeVisible();
    }
    if (isCompact(page)) await page.getByRole('button', { name: 'Open menu' }).click();
    await page.getByRole('link', { name: 'Security & 2FA Hub' }).click();
    await expect(page).toHaveURL(/\/dashboard\/settings\?tab=security$/);
    await expect(sectionHeading(page, 'Security & 2FA')).toBeVisible();
  });
});

// ── Security & 2FA ───────────────────────────────────────────────────────────

test('a preview session is told plainly that it has no password or second factor to manage', async ({ page }) => {
  const nativeDialogs: string[] = [];
  page.on('dialog', async (dialog) => { nativeDialogs.push(dialog.type()); await dialog.dismiss(); });
  await openSettings(page, '/dashboard/settings?tab=security');
  await expect(sectionHeading(page, 'Security & 2FA')).toBeVisible();
  await expect(page.getByRole('heading', { level: 3, name: 'Password' })).toBeVisible();
  await expect(page.getByText('Preview identities have no password, so there is nothing to change here.', { exact: false })).toBeVisible();
  await expect(page.getByRole('heading', { level: 3, name: 'Two-factor authentication' })).toBeVisible();
  await expect(page.getByText('This preview session has no Firebase identity, so there are no second factors to manage.', { exact: false })).toBeVisible();
  // No form that cannot work, and no control that would call the identity service.
  await expect(page.locator('#main-content input[type="password"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /two-factor|2FA/i })).toHaveCount(0);
  expect(nativeDialogs).toEqual([]);
});

// ── Account & Data: export ───────────────────────────────────────────────────

test('downloads the real data export, holding this account’s data only', async ({ page }) => {
  await openSettings(page, '/dashboard/settings?tab=account');
  const button = page.getByRole('button', { name: 'Download my data', exact: true });
  const [download] = await Promise.all([page.waitForEvent('download'), button.click()]);
  expect(download.suggestedFilename()).toMatch(/^personal-data-export-\d{4}-\d{2}-\d{2}\.json$/);
  const archive = JSON.parse(fs.readFileSync(await download.path(), 'utf8')) as {
    userId: string; profile: { email?: string }; exportWarnings: Array<{ section: string }>;
  };
  expect(archive.userId).toBe(uidFor('a'));
  expect(archive.profile.email).toBe(ACCOUNTS.a.email);
  const text = JSON.stringify(archive);
  expect(text, 'no data of candidate B').not.toContain(uidFor('b'));
  expect(text, 'no data of candidate B').not.toContain(ACCOUNTS.b.email);
  const status = page.locator('#main-content').getByRole('status').filter({ hasText: 'Downloaded' });
  if (archive.exportWarnings.length === 0) {
    await expect(status).toHaveText(`Downloaded ${download.suggestedFilename()}.`);
  } else {
    await expect(page.getByRole('list', { name: 'Sections not included' }).getByRole('listitem')).toHaveCount(archive.exportWarnings.length);
  }
  await expect(button).toBeFocused();
});

test('reports a failed export and downloads nothing', async ({ page, guard }) => {
  guard.expectApiStatuses(500);
  // Injected failure (labelled): Playwright answers the export request.
  await page.route('**/api/account/export', (route) => route.fulfill({ status: 500, json: { success: false, error: 'Account export is temporarily unavailable.' } }));
  let downloads = 0;
  page.on('download', () => { downloads += 1; });
  await openSettings(page, '/dashboard/settings?tab=account');
  await page.getByRole('button', { name: 'Download my data', exact: true }).click();
  await expect(page.locator('#main-content').getByRole('alert').filter({ hasText: 'not exported' }))
    .toHaveText('Your data was not exported. Account export is temporarily unavailable.');
  await expect(page.getByRole('button', { name: 'Download my data', exact: true })).toBeFocused();
  expect(downloads).toBe(0);
});

// ── Account & Data: deletion ─────────────────────────────────────────────────

test('the deletion dialog needs DELETE typed, closes every way, returns focus and reopens clean', async ({ page }) => {
  const attempts = await forbidDeletion(page);
  await openSettings(page, '/dashboard/settings?tab=account');
  const trigger = deleteTrigger(page);
  const dialog = deleteDialog(page);
  const confirmation = dialog.getByLabel('Type DELETE to confirm');
  const submit = dialog.getByRole('button', { name: 'Delete my account', exact: true });

  await trigger.click();
  await expect(dialog.getByRole('heading', { name: 'Delete your account?' })).toBeVisible();
  await expect(dialog).toContainText('Payment records, invoices and security audit logs are retained.');
  await expect(confirmation).toBeFocused();
  const box = await dialog.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
  // The page behind the dialog cannot scroll while it is open.
  expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).toBe('hidden');

  await submit.click();
  await expect(dialog.getByText('Type DELETE in capital letters to confirm.')).toBeVisible();
  await expect(confirmation).toBeFocused();
  await confirmation.fill('delete');
  await submit.click();
  await expect(confirmation).toHaveAttribute('aria-invalid', 'true');
  await expect(confirmation).toHaveAccessibleDescription('Type DELETE in capital letters to confirm.');

  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await expect(confirmation).toHaveValue('');
  await expect(dialog.getByText('Type DELETE in capital letters to confirm.')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.click();
  for (let step = 0; step < 6; step += 1) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate((node) => node.contains(document.activeElement)), 'focus stays in the dialog').toBe(true);
  }
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  expect(attempts, 'no deletion request was ever sent for candidate A').toEqual([]);
});

test.describe('Account deletion with a disposable account', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('a stale sign-in deletes nothing; the real deletion removes the data, retries, then ends the session', async ({ page, request, guard }) => {
    guard.expectApiStatuses(403, 503);
    const email = `p002.settings.delete.${test.info().project.name}.${Date.now()}@example.test`;
    const dialog = deleteDialog(page);

    await test.step('register a disposable account through the real form', async () => {
      await page.goto('/login?next=%2Fdashboard%2Fsettings%3Ftab%3Daccount');
      await page.getByRole('button', { name: 'Sign up free' }).click();
      await page.getByLabel('First name').fill('Dana');
      await page.getByLabel('Last name').fill('Disposable');
      await page.getByLabel('Email').fill(email);
      // Preview identities perform no password check; a throw-away value is typed.
      await page.locator('#password').fill(`e2e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);
      await page.getByRole('button', { name: 'Create account' }).click();
      await page.waitForURL(/\/dashboard\/settings\?tab=account$/);
      await expect(sectionHeading(page, 'Account & Data')).toBeVisible();
    });
    const token = await page.evaluate(() => (JSON.parse(localStorage.getItem('ime_dev_user') ?? '{}') as { token?: string }).token ?? '');
    expect(token).not.toBe('');
    expect((await readProfile(request, token)).email).toBe(email);

    await test.step('a sign-in older than the server window is refused and nothing is deleted', async () => {
      // Injected response (labelled): the server's documented answer for a sign-in
      // older than SENSITIVE_AUTH_MAX_AGE_MS; the request never reaches the server.
      await page.route('**/api/account/delete', (route) => route.fulfill({
        status: 403,
        json: { error: { code: 'RECENT_AUTH_REQUIRED', message: 'Please reauthenticate before this sensitive operation' } },
      }), { times: 1 });
      await deleteTrigger(page).click();
      await dialog.getByLabel('Type DELETE to confirm').fill('DELETE');
      await dialog.getByRole('button', { name: 'Delete my account', exact: true }).click();
      await expect(dialog.getByRole('alert')).toHaveText('For your security, deleting your account needs a sign-in from the last 10 minutes. Nothing was deleted. Sign in again, then return here.');
      await expect(dialog.getByRole('button', { name: 'Sign in again', exact: true })).toBeFocused();
      expect((await readProfile(request, token)).email, 'the account is intact').toBe(email);
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(deleteTrigger(page)).toBeFocused();
    });

    await test.step('the deletion request carries the session bearer token', async () => {
      await deleteTrigger(page).click();
      await dialog.getByLabel('Type DELETE to confirm').fill('DELETE');
      // Injected response (labelled): the request is captured before answering, so the
      // test can check what the browser sent without deleting anything here.
      let sentAuth: string | undefined;
      await page.route('**/api/account/delete', async (route) => {
        sentAuth = route.request().headers()['authorization'];
        await route.fulfill({ status: 403, json: { error: { code: 'RECENT_AUTH_REQUIRED', message: 'Please reauthenticate before this sensitive operation' } } });
      });
      const attempt = page.waitForResponse((response) => pathOf(response) === '/api/account/delete');
      await dialog.getByRole('button', { name: 'Delete my account', exact: true }).click();
      const response = await attempt;
      expect(sentAuth, 'the session token is sent as a bearer credential').toBe(`Bearer ${token}`);
      expect(response.request().headers()['authorization'], 'the page sends the same header').toBe(`Bearer ${token}`);
      expect(response.request().method(), 'the deletion is a token-authenticated API call').toBe('POST');
      await expect(dialog.getByRole('alert')).toHaveText('For your security, deleting your account needs a sign-in from the last 10 minutes. Nothing was deleted. Sign in again, then return here.');
      expect((await readProfile(request, token)).email, 'the account is intact').toBe(email);
      await page.unroute('**/api/account/delete');
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    });

    await test.step('the real deletion removes the personal data; identity removal stays pending here', async () => {
      await deleteTrigger(page).click();
      await expect(dialog.getByLabel('Type DELETE to confirm')).toHaveValue('');
      await expect(dialog.getByRole('alert')).toHaveText('');
      await dialog.getByLabel('Type DELETE to confirm').fill('DELETE');
      const deletion = page.waitForResponse((response) => pathOf(response) === '/api/account/delete');
      await dialog.getByRole('button', { name: 'Delete my account', exact: true }).click();
      const response = await deletion;
      expect(response.request().headers()['authorization'], 'the real deletion carries the session token').toBe(`Bearer ${token}`);
      expect(response.status()).toBe(503);
      expect(((await response.json()) as { code?: string }).code).toBe('ACCOUNT_IDENTITY_DELETE_FAILED');
      await expect(dialog.getByRole('heading', { name: 'Your personal data was deleted' })).toBeVisible();
      await expect(dialog.getByRole('alert')).toHaveText('Your personal data was deleted, but removing your sign-in identity is still pending. Retry now. If it keeps failing, sign out and contact support.');
      await expect(dialog.getByRole('button', { name: 'Retry identity removal', exact: true })).toBeFocused();
      const after = await readProfile(request, token);
      expect(after.email, 'the stored profile is anonymised').toMatch(/^deleted\+[0-9a-f]+@invalid\.local$/);
      expect(after.profile.firstname ?? '').toBe('');
    });

    await test.step('a real retry says identity removal is still pending', async () => {
      const retry = page.waitForResponse((response) => pathOf(response) === '/api/account/delete');
      await dialog.getByRole('button', { name: 'Retry identity removal', exact: true }).click();
      const retried = await retry;
      expect(retried.request().headers()['authorization'], 'the retry stays authenticated').toBe(`Bearer ${token}`);
      expect(retried.status()).toBe(503);
      await expect(dialog.getByRole('alert')).toHaveText('The retry did not finish either. Removing your sign-in identity is still pending. Try again in a moment, or sign out and contact support.');
    });

    await test.step('once identity removal completes, the session ends and the home page loads', async () => {
      // Injected response (labelled): the identity provider has no credentials in
      // this sandbox, so the completed outcome is answered with the server's success shape.
      await page.route('**/api/account/delete', (route) => route.fulfill({
        status: 200,
        json: { success: true, message: 'Identity and personal data were deleted.', retainedRecordTypes: ['payment_orders', 'transactions', 'invoices', 'security_audit_logs', 'deletion_requests'] },
      }), { times: 1 });
      await dialog.getByRole('button', { name: 'Retry identity removal', exact: true }).click();
      await page.waitForURL((url) => url.pathname === '/');
      expect(await page.evaluate(() => localStorage.getItem('ime_dev_user')), 'the session was cleared').toBeNull();
      await page.goto('/dashboard/settings?tab=account');
      await expect(page).toHaveURL(/\/login\?next=/);
    });
  });
});

// ── Appearance ───────────────────────────────────────────────────────────────

test('the theme applies at once, survives a reload and works from the keyboard', async ({ page }) => {
  await openSettings(page, '/dashboard/settings?tab=appearance');
  const radio = (name: 'Light' | 'Dark' | 'System') => page.getByRole('radio', { name, exact: true });
  await page.locator('label').filter({ hasText: 'Dark backgrounds' }).click();
  await expect(radio('Dark')).toBeChecked();
  await expect(radio('Dark')).toHaveAccessibleDescription('Dark backgrounds');
  await expect(page.locator('html')).toHaveClass(/(^|\s)dark(\s|$)/);
  await expect(page.locator('#main-content').getByRole('status').filter({ hasText: 'Theme set' })).toHaveText('Theme set to Dark.');

  await page.reload();
  await expect(radio('Dark')).toBeChecked();
  await expect(page.locator('html')).toHaveClass(/(^|\s)dark(\s|$)/);

  await radio('Dark').focus();
  await page.keyboard.press('ArrowRight');
  await expect(radio('System')).toBeChecked();
  await expect(radio('System')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(radio('Light')).toBeChecked();
  await expect(page.locator('html')).not.toHaveClass(/(^|\s)dark(\s|$)/);
  expect(await page.evaluate(() => localStorage.getItem('ime365_theme'))).toBe('light');
});

// ── Accessibility and layout ─────────────────────────────────────────────────

test('every section and the open deletion dialog pass axe, without document scroll or horizontal overflow', async ({ page }) => {
  const attempts = await forbidDeletion(page);
  const sections: Array<[string, string]> = [
    ['profile', 'Master Profile'], ['security', 'Security & 2FA'], ['appearance', 'Appearance'], ['account', 'Account & Data'],
  ];
  for (const [tab, name] of sections) {
    await openSettings(page, `/dashboard/settings?tab=${tab}`);
    await expect(sectionHeading(page, name)).toBeVisible();
    if (tab === 'profile') await expectProfileLoaded(page);
    await expectNoAxeViolations(page);
    await expectNoHorizontalOverflow(page);
    await expectNoDocumentScroll(page);
  }
  await deleteTrigger(page).click();
  await expect(deleteDialog(page)).toBeVisible();
  await expectNoAxeViolations(page, '[role="dialog"]');
  await page.keyboard.press('Escape');
  expect(attempts).toEqual([]);
});
