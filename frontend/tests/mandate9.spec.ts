import { test, expect, type Page } from '@playwright/test';
async function fillContact(page: Page) {
  await page.goto('/contact');
  await page.getByPlaceholder('Jane Doe').fill('Test User');
  await page.getByPlaceholder('jane@example.com').fill('user@example.test');
  await page.getByPlaceholder(/Enterprise inquiry/).fill('Support');
  await page.getByPlaceholder(/How can we help/).fill('Please help with my account.');
}
test('contact success requires server response and preserves subject', async ({ page }) => {
  let payload: Record<string, string> | undefined;
  await page.route('**/api/contact', async route => { payload = route.request().postDataJSON(); await route.fulfill({ status: 202, json: { success: true } }); });
  await fillContact(page); await page.getByRole('button', { name: 'Send Message' }).click();
  await expect(page.getByRole('heading', { name: 'Message Received!' })).toBeVisible();
  expect(payload?.message).toContain('Subject: Support');
});
for (const [label, status, body] of [['validation', 400, {success:false}], ['server', 500, {success:false}], ['malformed', 202, 'broken']] as const) {
  test(`contact ${label} response does not show success`, async ({ page }) => {
    await page.route('**/api/contact', route => typeof body === 'string' ? route.fulfill({ status, body }) : route.fulfill({ status, json: body }));
    await fillContact(page); await page.getByRole('button', { name: 'Send Message' }).click();
    await expect(page.getByRole('alert')).toBeVisible(); await expect(page.getByText('Message Received!')).toHaveCount(0);
  });
}
test('network uncertainty allows retry', async ({ page }) => {
  let attempts = 0;
  await page.route('**/api/contact', route => ++attempts === 1 ? route.abort() : route.fulfill({status:202,json:{success:true}}));
  await fillContact(page); await page.getByRole('button', { name: 'Send Message' }).click();
  await expect(page.getByRole('alert')).toContainText('may have been received');
  await page.getByRole('button', { name: 'Send Message' }).click();
  await expect(page.getByText('Message Received!')).toBeVisible(); expect(attempts).toBe(2);
});

test('jobs browse uses public data route and filters the returned jobs', async ({ page }) => {
  await page.route('**/api/jobs-data', route => route.fulfill({status:200,json:{success:true,jobs:[{id:'job-1',title:'Platform Engineer',company_name:'Example Co',location:'Remote',job_type:'Full-time',skills:['TypeScript'],status:'active',created_at:'2026-01-01'}]}}));
  await page.goto('/jobs');
  await expect(page.getByText('Platform Engineer')).toBeVisible();
  await page.getByPlaceholder('Job title, keyword, or company…').fill('not-found');
  await expect(page.getByText('No jobs found')).toBeVisible();
});

test('blog list requests only published posts and shows errors instead of empty success', async ({ page }) => {
  let publishedOnly: string | null = null;
  await page.route('**/api/blog-data?*', route => { publishedOnly = new URL(route.request().url()).searchParams.get('publishedOnly'); return route.fulfill({status:503,json:{success:false}}); });
  await page.goto('/blog');
  await expect(page.getByRole('alert')).toContainText('unavailable');
  await expect(page.getByText('No articles found')).toHaveCount(0);
  expect(publishedOnly).toBe('true');
});
