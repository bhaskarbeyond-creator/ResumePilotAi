const fs = require('fs');
const path = 'D:/xampp/htdocs/IME365/frontend/tests/candidate/settings.spec.ts';
let content = fs.readFileSync(path, 'utf8');

const target = `    await test.step('the real deletion removes the personal data; identity removal stays pending here', async () => {
      await deleteTrigger(page).click();
      await expect(dialog.getByLabel('Type DELETE to confirm')).toHaveValue('');
      await expect(dialog.getByRole('alert')).toHaveText('');
      await dialog.getByLabel('Type DELETE to confirm').fill('DELETE');
      const deletion = page.waitForResponse((response) => pathOf(response) === '/api/account/delete');
      await dialog.getByRole('button', { name: 'Delete my account', exact: true }).click();
      const response = await deletion;
      expect(response.request().headers()['authorization'], 'the real deletion carries the session token').toBe(\`Bearer \${token}\`);
      if (response.status() === 200) {
        await page.waitForURL((url) => url.pathname === '/');
        expect(await page.evaluate(() => localStorage.getItem('ime_dev_user')), 'the session was cleared').toBeNull();
        await page.goto('/dashboard/settings?tab=account');
        await expect(page).toHaveURL(/\\/login\\?next=/);
        return;
      }
      expect(response.status()).toBe(503);
      expect(((await response.json()) as { code?: string }).code).toBe('ACCOUNT_IDENTITY_DELETE_FAILED');
      await expect(dialog.getByRole('heading', { name: 'Your personal data was deleted' })).toBeVisible();
      await expect(dialog.getByRole('alert')).toHaveText('Your personal data was deleted, but removing your sign-in identity is still pending. Retry now. If it keeps failing, sign out and contact support.');
      await expect(dialog.getByRole('button', { name: 'Retry identity removal', exact: true })).toBeFocused();
      const after = await readProfile(request, token);
      expect(after.email, 'the stored profile is anonymised').toMatch(/^deleted\\+[0-9a-f]+@invalid\\.local$/);
      expect(after.profile.firstname ?? '').toBe('');
    });

    await test.step('a real retry says identity removal is still pending', async () => {
      const retry = page.waitForResponse((response) => pathOf(response) === '/api/account/delete');
      await dialog.getByRole('button', { name: 'Retry identity removal', exact: true }).click();
      const retried = await retry;
      expect(retried.request().headers()['authorization'], 'the retry stays authenticated').toBe(\`Bearer \${token}\`);
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
      await expect(page).toHaveURL(/\\/login\\?next=/);
    });`;

const replacement = `    let deletionCompleted = false;
    await test.step('the real deletion removes the personal data; identity removal stays pending here', async () => {
      await deleteTrigger(page).click();
      await expect(dialog.getByLabel('Type DELETE to confirm')).toHaveValue('');
      await expect(dialog.getByRole('alert')).toHaveText('');
      await dialog.getByLabel('Type DELETE to confirm').fill('DELETE');
      const deletion = page.waitForResponse((response) => pathOf(response) === '/api/account/delete');
      await dialog.getByRole('button', { name: 'Delete my account', exact: true }).click();
      const response = await deletion;
      expect(response.request().headers()['authorization'], 'the real deletion carries the session token').toBe(\`Bearer \${token}\`);
      if (response.status() === 200) {
        deletionCompleted = true;
        await page.waitForURL((url) => url.pathname === '/');
        expect(await page.evaluate(() => localStorage.getItem('ime_dev_user')), 'the session was cleared').toBeNull();
        await page.goto('/dashboard/settings?tab=account');
        await expect(page).toHaveURL(/\\/login\\?next=/);
        return;
      }
      expect(response.status()).toBe(503);
      expect(((await response.json()) as { code?: string }).code).toBe('ACCOUNT_IDENTITY_DELETE_FAILED');
      await expect(dialog.getByRole('heading', { name: 'Your personal data was deleted' })).toBeVisible();
      await expect(dialog.getByRole('alert')).toHaveText('Your personal data was deleted, but removing your sign-in identity is still pending. Retry now. If it keeps failing, sign out and contact support.');
      await expect(dialog.getByRole('button', { name: 'Retry identity removal', exact: true })).toBeFocused();
      const after = await readProfile(request, token);
      expect(after.email, 'the stored profile is anonymised').toMatch(/^deleted\\+[0-9a-f]+@invalid\\.local$/);
      expect(after.profile.firstname ?? '').toBe('');
    });

    if (!deletionCompleted) {
      await test.step('a real retry says identity removal is still pending', async () => {
        const retry = page.waitForResponse((response) => pathOf(response) === '/api/account/delete');
        await dialog.getByRole('button', { name: 'Retry identity removal', exact: true }).click();
        const retried = await retry;
        expect(retried.request().headers()['authorization'], 'the retry stays authenticated').toBe(\`Bearer \${token}\`);
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
        await expect(page).toHaveURL(/\\/login\\?next=/);
      });
    }`;

content = content.replace(target, replacement);

fs.writeFileSync(path, content, 'utf8');
console.log('settings.spec.ts updated with deletionCompleted flag');
