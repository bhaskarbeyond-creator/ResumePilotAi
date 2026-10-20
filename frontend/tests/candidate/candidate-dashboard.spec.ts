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
  test('tracks a job, verifies stage column, tests Cover Letter link, moves stage, and deletes with Radix Dialog', async ({ page }) => {
    const testCompany = `AcmeCorp-${randomUUID().slice(0, 6)}`;
    const testTitle = 'Senior Cloud Architect';

    await page.goto('/dashboard/job-tracker');
    await expect(page.getByRole('heading', { name: 'Job Tracker' })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    // 1. Open Track Job Dialog
    await page.getByTestId('track-job-button').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Track a Job Application')).toBeVisible();

    // 2. Fill form and submit
    await page.getByTestId('input-job-company').fill(testCompany);
    await page.getByTestId('input-job-title').fill(testTitle);
    await dialog.locator('#job-location').fill('Remote, US');
    await dialog.locator('#job-salary').fill('$150k - $180k');
    await dialog.locator('#job-status').selectOption('applied');

    await page.getByTestId('submit-track-job-button').click();
    await expect(dialog).not.toBeVisible();

    // 3. Verify card exists on the board
    const jobCard = page.getByTestId('job-card').filter({ hasText: testCompany }).first();
    await expect(jobCard).toBeVisible();
    await expect(jobCard).toContainText(testTitle);

    // 4. Test Cover Letter link in action menu
    await jobCard.getByRole('button', { name: `Options for ${testCompany}` }).click();
    const tailorLink = page.getByRole('link', { name: 'Tailor Cover Letter' });
    await expect(tailorLink).toBeVisible();
    const href = await tailorLink.getAttribute('href');
    expect(href).toContain('/dashboard/cover-letters?role=');
    expect(href).toContain(encodeURIComponent(testCompany));

    // 5. Move stage to 'interview'
    await page.getByRole('button', { name: 'Interview' }).click();
    await expect(page.getByRole('status')).toContainText(`Moved ${testCompany} to Interview`);

    // 6. Toggle to List view and verify row
    await page.getByRole('button', { name: 'List view' }).click();
    const listRow = page.getByTestId('job-list-row').filter({ hasText: testCompany }).first();
    await expect(listRow).toBeVisible();
    await expect(listRow.getByRole('link', { name: 'Cover Letter' })).toBeVisible();

    // 7. Delete job through accessible Radix confirmation Dialog
    await listRow.getByRole('button', { name: `Delete ${testCompany} application` }).click();
    const deleteDialog = page.getByRole('dialog');
    await expect(deleteDialog).toBeVisible();
    await expect(deleteDialog.getByText('Delete Tracked Job')).toBeVisible();

    await page.getByTestId('confirm-delete-job-button').click();
    await expect(deleteDialog).not.toBeVisible();
    await expect(page.getByTestId('job-list-row').filter({ hasText: testCompany })).toHaveCount(0);
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
