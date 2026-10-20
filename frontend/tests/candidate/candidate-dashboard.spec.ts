/**
 * Candidate Dashboard Deep Audit & Verification Suite (Surface 2 & 3: Job Tracker, Settings, Support, Favourites, Aliases)
 *
 * Runs across all five responsive viewport profiles against the real stack:
 * UI -> api-client (Bearer token) -> Express -> MariaDB.
 * Verifies accessible Radix UI dialogs, real persistence, legacy alias redirects,
 * and zero horizontal overflow.
 */

import { randomUUID } from 'node:crypto';
import { test, expect, expectNoHorizontalOverflow } from './fixtures';

test.describe('Candidate Dashboard — Job Tracker Surface', () => {
  // Rewritten in C13 for the rebuilt tracker: accessible names replace the old
  // test ids. tests/candidate/job-tracker.spec.ts covers the surface in depth.
  let testCompany = '';
  test.afterEach(async ({ apiAs }) => {
    if (!testCompany) return;
    const api = apiAs('a');
    const { body } = await api.get<{ jobs?: Array<{ id: string; company: string; revision: number }> }>('/jobs-data/tracker');
    for (const job of (body.jobs ?? []).filter((item) => item.company === testCompany)) {
      await api.del(`/jobs-data/tracker/${encodeURIComponent(job.id)}`, { expectedRevision: job.revision });
    }
  });

  test('tracks a job, verifies stage column, tests Cover Letter link, moves stage, and deletes with Radix Dialog', async ({ page }) => {
    testCompany = `AcmeCorp-${randomUUID().slice(0, 6)}`;
    const testTitle = 'Senior Cloud Architect';
    const job = `${testTitle} at ${testCompany}`;

    await page.goto('/dashboard/job-tracker');
    await expect(page.getByRole('heading', { level: 1, name: 'Job Tracker' })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    // 1. Open the add dialog
    await page.getByRole('button', { name: 'Track a job', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Track a job' });
    await expect(dialog).toBeVisible();

    // 2. Fill the form and submit
    await dialog.getByLabel('Company (required)').fill(testCompany);
    await dialog.getByLabel('Job title (required)').fill(testTitle);
    await dialog.getByLabel('Location', { exact: true }).fill('Remote, US');
    await dialog.getByLabel('Salary or range').fill('$150k - $180k');
    await dialog.getByLabel('Stage', { exact: true }).selectOption('applied');
    await dialog.getByRole('button', { name: 'Add to tracker' }).click();
    await expect(dialog).not.toBeVisible();

    // 3. The job is in the Applied column
    const jobCard = page.getByRole('region', { name: /^Applied \(\d+ jobs?\)$/ }).getByRole('article', { name: testTitle }).filter({ hasText: testCompany });
    await expect(jobCard).toBeVisible();
    await expect(jobCard).toContainText('$150k - $180k');

    // 4. Cover letter link in the actions menu
    await page.getByRole('button', { name: `Actions for ${job}` }).click();
    const tailorLink = page.getByRole('menuitem', { name: 'Write a cover letter' });
    await expect(tailorLink).toBeVisible();
    const href = await tailorLink.getAttribute('href');
    expect(href).toContain('/dashboard/cover-letters?role=');
    expect(href).toContain(encodeURIComponent(testCompany));
    await page.keyboard.press('Escape');

    // 5. Move the stage to Interviewing
    await page.getByLabel(`Stage for ${job}`).selectOption('interview');
    await expect(page.locator('#main-content').getByRole('status')).toContainText(`Moved ${job} to Interviewing.`);

    // 6. Switch to the list view and find the job
    await page.getByRole('button', { name: 'List', exact: true }).click();
    const listRow = page.getByRole('list', { name: 'Tracked jobs' }).getByRole('article', { name: testTitle }).filter({ hasText: testCompany });
    await expect(listRow).toBeVisible();
    await expect(listRow.getByLabel(`Stage for ${job}`)).toHaveValue('interview');

    // 7. Remove the job through the confirmation dialog
    await page.getByRole('button', { name: `Actions for ${job}` }).click();
    await page.getByRole('menuitem', { name: 'Remove from tracker…' }).click();
    const deleteDialog = page.getByRole('dialog', { name: 'Remove this job from your tracker?' });
    await expect(deleteDialog).toBeVisible();
    await deleteDialog.getByRole('button', { name: 'Remove job' }).click();
    await expect(deleteDialog).not.toBeVisible();
    await expect(page.getByRole('article', { name: testTitle }).filter({ hasText: testCompany })).toHaveCount(0);
  });

  test('applied-jobs and job-matching route aliases resolve correctly', async ({ page }) => {
    // /dashboard/applied-jobs displays Job Tracker
    await page.goto('/dashboard/applied-jobs');
    await expect(page.getByRole('heading', { name: 'Job Tracker' })).toBeVisible();

    // /dashboard/job-matching redirects to /dashboard/job-tracker
    await page.goto('/dashboard/job-matching');
    await expect(page).toHaveURL(/\/dashboard\/job-tracker/);
    await expect(page.getByRole('heading', { name: 'Job Tracker' })).toBeVisible();
  });
});

test.describe('Candidate Dashboard — Settings & Security Surface', () => {
  // Settings was rebuilt in P002 C11 (docs/test-reports/P002-C11-settings.md):
  // the Master Profile uses the backend's own fields, a preview session is told
  // it has no password or second factor, the decorative notification preferences
  // and the duplicate help desk moved to their own pages, and the theme is a
  // radio group. These two checks walk the same path as the original ones on the
  // real page; settings.spec.ts covers saves, conflicts, deletion and axe.
  test('navigates the sections, guards the deletion dialog, and sends moved sections to their pages', async ({ page }) => {
    // Candidate A must never be deleted: any deletion request is answered here.
    const deletionRequests: string[] = [];
    await page.route('**/api/account/delete', (route) => {
      deletionRequests.push(route.request().method());
      return route.fulfill({ status: 418, json: { success: false, error: 'Blocked by the test: candidate A must never be deleted.' } });
    });

    await page.goto('/dashboard/settings');
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    const sections = page.getByRole('navigation', { name: 'Settings sections' });

    // 1. Master Profile: the real contact fields; the sign-in email is read-only.
    const profile = page.getByRole('form', { name: 'Master Profile' });
    await expect(profile.getByLabel('First name')).toBeVisible();
    await expect(profile.getByLabel('Last name')).toBeVisible();
    await expect(profile.getByLabel('Sign-in email')).not.toBeEditable();

    // 2. Security & 2FA: a preview session has no password form and no factor control.
    await sections.getByRole('link', { name: 'Security & 2FA' }).click();
    await expect(page).toHaveURL(/\/dashboard\/settings\?tab=security$/);
    await expect(page.getByRole('heading', { level: 3, name: 'Password', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: 'Two-factor authentication', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /two-factor|2FA/i })).toHaveCount(0);

    // 3. Account & Data: the deletion dialog refuses anything but DELETE; Cancel closes it.
    await sections.getByRole('link', { name: 'Account & Data' }).click();
    await page.getByRole('button', { name: 'Delete account…', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Delete your account?' })).toBeVisible();
    await dialog.getByLabel('Type DELETE to confirm').fill('NO');
    await dialog.getByRole('button', { name: 'Delete my account', exact: true }).click();
    await expect(dialog.getByText('Type DELETE in capital letters to confirm.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).toBeHidden();

    // 4. Appearance: the theme is a radio group.
    await sections.getByRole('link', { name: 'Appearance' }).click();
    await expect(page.getByRole('radio', { name: 'Light', exact: true })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Dark', exact: true })).toBeVisible();

    // 5. Notification preferences and the help desk live on their own pages.
    await page.goto('/dashboard/settings?tab=notifications');
    await expect(page).toHaveURL(/\/dashboard\/notifications$/);
    await page.goto('/dashboard/settings?tab=support');
    await expect(page).toHaveURL(/\/dashboard\/support$/);
    await expect(page.getByRole('heading', { name: 'Support Center' })).toBeVisible();

    expect(deletionRequests, 'no deletion request was sent for candidate A').toEqual([]);
  });

  test('legacy settings route aliases redirect to their sections', async ({ page }) => {
    await page.goto('/dashboard/profile');
    await expect(page).toHaveURL(/\/dashboard\/settings\?tab=profile$/);
    await expect(page.getByRole('form', { name: 'Master Profile' }).getByLabel('First name')).toBeVisible();

    await page.goto('/dashboard/security');
    await expect(page).toHaveURL(/\/dashboard\/settings\?tab=security$/);
    await expect(page.getByRole('heading', { level: 3, name: 'Password', exact: true })).toBeVisible();

    // The shell's "Account Settings" is ?tab=account, so the old address opens that section.
    await page.goto('/dashboard/account');
    await expect(page).toHaveURL(/\/dashboard\/settings\?tab=account$/);
    await expect(page.getByRole('heading', { level: 2, name: 'Account & Data', exact: true })).toBeVisible();
  });
});

test.describe('Candidate Dashboard — Support & Favourites Surfaces', () => {
  test('support desk renders tickets and opens accessible creation dialog', async ({ page }) => {
    await page.goto('/dashboard/support');
    await expect(page.getByRole('heading', { name: 'Support Center' })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    // Open ticket dialog
    await page.getByRole('button', { name: 'Create New Ticket' }).click();
    const ticketDialog = page.getByRole('dialog');
    await expect(ticketDialog).toBeVisible();
    await expect(ticketDialog.getByRole('heading', { name: 'Create Support Ticket' })).toBeVisible();

    // Cancel closes dialog
    await ticketDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(ticketDialog).not.toBeVisible();
  });

  test('support route aliases redirect to /dashboard/support', async ({ page }) => {
    await page.goto('/dashboard/tickets');
    await expect(page).toHaveURL(/\/dashboard\/support/);
    await expect(page.getByRole('heading', { name: 'Support Center' })).toBeVisible();

    await page.goto('/dashboard/help');
    await expect(page).toHaveURL(/\/dashboard\/support/);
    await expect(page.getByRole('heading', { name: 'Support Center' })).toBeVisible();
  });

  test('saved favourites renders filters, view toggle, and zero overflow', async ({ page }) => {
    await page.goto('/dashboard/favourites');
    await expect(page.getByRole('heading', { name: 'Saved Items', exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    // Filter toggles
    await page.getByRole('button', { name: 'all' }).click();
    await page.getByRole('button', { name: 'jobs' }).click();
    await page.getByRole('button', { name: 'documents' }).click();
    await page.getByRole('button', { name: 'all' }).click();

    // View toggle (grid / list)
    await page.getByLabel('Switch to list view').click();
    await page.getByLabel('Switch to grid view').click();

    // /dashboard/favorites alias redirects to /dashboard/favourites
    await page.goto('/dashboard/favorites');
    await expect(page).toHaveURL(/\/dashboard\/favourites/);
  });
});
