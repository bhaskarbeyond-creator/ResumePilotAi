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
  test('navigates tabs, tests Radix security dialogs, and saves preferences', async ({ page }) => {
    await page.goto('/dashboard/settings');
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    // 1. Profile tab: Verify form fields
    await expect(page.locator('#settings-first-name')).toBeVisible();
    await expect(page.locator('#settings-last-name')).toBeVisible();
    await expect(page.locator('#settings-email')).toBeVisible();

    // 2. Switch to Security tab
    await page.getByTestId('settings-tab-security').click();
    await expect(page.getByRole('heading', { name: 'Password' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Two-Factor Authentication (TOTP 2FA)' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Danger Zone & Privacy Compliance' })).toBeVisible();

    // 3. Test Disable 2FA Radix dialog
    await page.getByTestId('disable-mfa-trigger-button').click();
    const mfaDialog = page.getByRole('dialog');
    await expect(mfaDialog).toBeVisible();
    await expect(mfaDialog.getByText('Disable Two-Factor Authentication')).toBeVisible();
    await mfaDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(mfaDialog).not.toBeVisible();

    // 4. Test Delete Account Radix dialog with safety validation
    await page.getByTestId('delete-account-trigger-button').click();
    const deleteAccountDialog = page.getByRole('dialog');
    await expect(deleteAccountDialog).toBeVisible();
    await expect(deleteAccountDialog.getByText('Delete Account & All Data')).toBeVisible();

    const deleteBtn = page.getByTestId('confirm-delete-account-button');
    await expect(deleteBtn).toBeDisabled();

    // Typing wrong text keeps it disabled
    await page.getByTestId('confirm-delete-input').fill('NO');
    await expect(deleteBtn).toBeDisabled();

    // Typing DELETE enables it
    await page.getByTestId('confirm-delete-input').fill('DELETE');
    await expect(deleteBtn).toBeEnabled();

    // Cancel out
    await deleteAccountDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(deleteAccountDialog).not.toBeVisible();

    // 5. Switch to Notifications tab and save preferences
    await page.getByTestId('settings-tab-notifications').click();
    await expect(page.getByText('Job match alerts')).toBeVisible();
    await page.getByTestId('save-notifications-button').click();
    await expect(page.getByText('Notification preferences saved successfully.')).toBeVisible();

    // 6. Switch to Appearance tab
    await page.getByTestId('settings-tab-appearance').click();
    await expect(page.getByText('Theme')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Light' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Dark' })).toBeVisible();

    // 7. Switch to Support tab within Settings
    await page.getByTestId('settings-tab-support').click();
    await expect(page.getByText('Support & Help Desk')).toBeVisible();
    await expect(page.getByTestId('new-ticket-button')).toBeVisible();
  });

  test('legacy settings route aliases redirect to correct tabs', async ({ page }) => {
    // /dashboard/profile -> /dashboard/settings?tab=profile
    await page.goto('/dashboard/profile');
    await expect(page).toHaveURL(/\/dashboard\/settings\?tab=profile/);
    await expect(page.locator('#settings-first-name')).toBeVisible();

    // /dashboard/security -> /dashboard/settings?tab=security
    await page.goto('/dashboard/security');
    await expect(page).toHaveURL(/\/dashboard\/settings\?tab=security/);
    await expect(page.getByRole('heading', { name: 'Password' })).toBeVisible();

    // /dashboard/account -> /dashboard/settings
    await page.goto('/dashboard/account');
    await expect(page).toHaveURL(/\/dashboard\/settings/);
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
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
