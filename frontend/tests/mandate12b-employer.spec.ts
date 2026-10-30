import { test, expect, type Page } from '@playwright/test';

const REQUIRED_VIEWPORTS = [
  { width: 375, height: 667 },
  { width: 768, height: 1024 },
  { width: 1280, height: 900 },
] as const;

const uid = 'm12b-employer';
const payload = Buffer.from(JSON.stringify({ uid, email: 'recruiter@example.test', role: 'EMPLOYER', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
const previewToken = `rptest.${payload}.${'a'.repeat(64)}`;
const conversationId = 'conversation-12b';
let postedMessages: Array<{ id: string; senderId: string; text: string; timestamp: number }>;
let slots: Array<Record<string, unknown>>;
const timestamp = Date.now();

async function installSession(page: Page) {
  await page.addInitScript((token) => {
    localStorage.setItem('ime_dev_user', JSON.stringify({ token, displayName: 'Recruiter' }));
    localStorage.setItem('token', token);
  }, previewToken);
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname;
    if (pathname === '/api/users-data/profile') return route.fulfill({ json: { profile: { uid, role: 'EMPLOYER', email: 'recruiter@example.test' } } });
    if (pathname === '/api/employer/jobs') return route.fulfill({ json: { jobs: [] } });
    if (pathname === '/api/messages/conversations' && route.request().method() === 'GET') {
      return route.fulfill({ json: { success: true, totalUnread: 1, conversations: [{ id: conversationId, applicationId: 'app-12b', participants: { [uid]: true, candidate: true }, lastMessage: postedMessages.at(-1) || { id: 'msg_10000000000_abcdef12', senderId: 'candidate', text: 'Could we talk this week?', timestamp }, unreadCount: 1 }] } });
    }
    if (pathname.endsWith('/participant-profile')) return route.fulfill({ json: { success: true, profile: { name: 'Candidate Fixture' } } });
    if (pathname.endsWith(`/conversations/${conversationId}/messages`) && route.request().method() === 'GET') return route.fulfill({ json: { success: true, messages: postedMessages } });
    if (pathname.endsWith(`/conversations/${conversationId}/read`)) return route.fulfill({ json: { success: true } });
    if (pathname === '/api/messages/send') {
      const body = route.request().postDataJSON() as { text: string };
      postedMessages.push({ id: `msg_${Date.now()}_abcdef1234567890`, senderId: uid, text: body.text, timestamp: Date.now() });
      return route.fulfill({ status: 201, json: { success: true, messageId: postedMessages.at(-1)?.id } });
    }
    if (pathname === '/api/employer/interviews/slots' && route.request().method() === 'GET') return route.fulfill({ json: { success: true, slots } });
    if (pathname === '/api/employer/interviews/slots' && route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      const created = { id: 'islot_created_12345678', employerId: uid, startTime: body.startTime, endTime: body.endTime, durationMinutes: body.durationMinutes, isBooked: false, applicationId: null };
      slots = [...slots, created];
      return route.fulfill({ status: 201, json: { success: true, slot: created } });
    }
    if (pathname.includes('/calendar')) return route.fulfill({ status: 409, headers: { 'content-type': 'application/json' }, json: { success: false, error: { message: 'That interview slot has no booking yet.' } } });
    return route.fulfill({ json: { success: true, jobs: [], applications: [], slots: [], companies: [] } });
  });
}

test.beforeEach(({ browserName }, info) => {
  void browserName;
  // This suite runs its explicit 375/768/1280 matrix once; other configured
  // projects duplicate the same checks and are skipped rather than misreported.
  test.skip(info.project.name !== 'mobile-iphone-se', 'The spec drives its own required viewport matrix.');
  postedMessages = [{ id: 'msg_10000000000_abcdef12', senderId: 'candidate', text: 'Could we talk this week?', timestamp }];
  slots = [];
});

test('real conversation flow sends, reloads, and reconciles server messages at all required viewports', async ({ page }) => {
  await installSession(page);
  for (const viewport of REQUIRED_VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto('/employer?tab=messages');
    await expect(page.getByText('Candidate Fixture')).toBeVisible();
    await expect(page.getByText('Could we talk this week?').first()).toBeVisible();
    const readRequest = page.waitForRequest((request) => request.url().includes(`/messages/conversations/${conversationId}/read`) && request.method() === 'POST');
    await page.getByRole('button', { name: /Candidate Fixture/ }).click();
    await readRequest;
    await page.getByRole('textbox', { name: 'Message text' }).fill(`Reply at ${viewport.width}`);
    const sendRequest = page.waitForRequest((request) => request.url().endsWith('/api/messages/send') && request.method() === 'POST');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    expect((await sendRequest).postDataJSON()).toEqual({ conversationId, text: `Reply at ${viewport.width}` });
    await expect(page.getByText(`Reply at ${viewport.width}`)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

test('honest empty conversation state is rendered when the API returns no records', async ({ page }) => {
  await installSession(page);
  await page.route('**/api/messages/conversations', (route) => route.fulfill({ json: { success: true, conversations: [], totalUnread: 0 } }));
  await page.goto('/employer?tab=messages');
  await expect(page.getByText('No Active Candidate Conversations')).toBeVisible();
  await expect(page.getByText(/Sarah Jenkins|David Chen|Emily Watson/)).toHaveCount(0);
});

test('failed message request is never represented as delivered', async ({ page }) => {
  await installSession(page);
  await page.goto('/employer?tab=messages');
  await page.getByRole('button', { name: /Candidate Fixture/ }).click();
  await page.route('**/api/messages/send', (route) => route.fulfill({ status: 503, json: { success: false, error: 'Messaging unavailable' } }));
  await page.getByRole('textbox', { name: 'Message text' }).fill('Do not persist this');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Messaging unavailable' })).toBeVisible();
  await expect(page.getByText('Do not persist this')).toHaveCount(0);
});

test('slot manager modal is titled and submits a native 30-minute slot', async ({ page }) => {
  await installSession(page);
  await page.goto('/employer/pipeline');
  await page.getByRole('button', { name: 'Manage Interview Slots' }).click();
  const dialog = page.getByRole('dialog', { name: 'Manage Employer Interview Slots' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'New Slot' }).click();
  const date = new Date(Date.now() + 2 * 86400000);
  const dateInput = dialog.getByLabel('Date');
  await dateInput.fill(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`);
  await dialog.getByLabel('Start Time').fill('10:00');
  await dialog.getByLabel('Duration').selectOption('30');
  const request = page.waitForRequest((item) => item.url().endsWith('/api/employer/interviews/slots') && item.method() === 'POST');
  await dialog.getByRole('button', { name: 'Save Availability Slot' }).click();
  const body = (await request).postDataJSON() as { durationMinutes: number; startTime: string; endTime: string };
  expect(body.durationMinutes).toBe(30);
  expect(Date.parse(body.endTime) - Date.parse(body.startTime)).toBe(30 * 60_000);
  await expect(dialog.getByText(/10:00–10:30/)).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Manage Employer Interview Slots' })).toBeVisible();
});
