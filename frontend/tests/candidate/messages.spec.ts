/**
 * Messages — /dashboard/messages — at the five directive profiles.
 *
 * Real stack only: UI :4000 → Express :8080 → MariaDB bridge. A conversation can
 * only exist for a job application, so each test arranges one through the API:
 *   - the job owner signs in through POST /api/auth/preview-login, the same
 *     non-production verifier the candidate login form uses;
 *   - scripts/dev-db/arrange-messaging-job.mjs inserts ONE active job owned by it.
 *     This is the only step not done through the API: preview identities cannot
 *     hold the `employer` claim that POST /api/employer/jobs requires (it answers
 *     403 in this sandbox; the claim is a Firebase custom claim);
 *   - candidate A applies through POST /api/jobs/:jobId/applications, and the job
 *     owner opens the conversation and writes through /api/messages/*.
 * The module gate is real server configuration (public_config.modules
 * .enableMessagesModule, OFF by default), set per group with
 * scripts/dev-db/set-public-module.mjs; the shipped default is restored afterwards.
 * Every failure-path interception below is a labelled Playwright route.
 *
 * Env for the helpers (defaults match scripts/dev-db/README.md): E2E_DB_HOST,
 * E2E_DB_PORT, E2E_DB_USER, E2E_DB_PASSWORD, E2E_DB_NAME (ime365_sandbox).
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import type { APIRequestContext, Page } from '@playwright/test';
import { AUTH_DIR, expect, expectNoHorizontalOverflow, storageStatePath, test, tokenFor, uidFor } from './fixtures';

const repoRoot = path.resolve(process.cwd(), '..');
const dbEnv = {
  ...process.env,
  DB_HOST: process.env.E2E_DB_HOST || '127.0.0.1',
  DB_PORT: process.env.E2E_DB_PORT || '3306',
  DB_USER: process.env.E2E_DB_USER || 'root',
  DB_PASSWORD: process.env.E2E_DB_PASSWORD || '',
  DB_NAME: process.env.E2E_DB_NAME || 'ime365_sandbox',
};
const devDbScript = (name: string, args: string[]) =>
  execFileSync(process.execPath, [path.join(repoRoot, 'scripts', 'dev-db', name), ...args], { env: dbEnv, stdio: 'pipe' }).toString();
const setMessagesModule = (enabled: boolean) => devDbScript('set-public-module.mjs', ['--module', 'enableMessagesModule', '--value', String(enabled)]);
const removeArranged = () => devDbScript('arrange-messaging-job.mjs', ['--remove']);

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

interface Owner { email: string; name: string; uid: string; token: string }
const OWNERS = {
  riley: { email: 'p002.employer@example.test', name: 'Riley Recruiter', job: 'job_e2e_msg_riley', title: 'Platform Engineer', company: 'Example Test Co' },
  jordan: { email: 'p002.employer.two@example.test', name: 'Jordan Hiring', job: 'job_e2e_msg_jordan', title: 'Data Analyst', company: 'Sample Test Labs' },
} as const;
type OwnerKey = keyof typeof OWNERS;
const signedInOwners = new Map<OwnerKey, Owner>();

// Sessions are kept beside the candidates' storage states (tokens last 7 days), so
// repeated runs do not spend the auth burst budget (5 sign-ins a minute per IP).
const ownerFile = (key: OwnerKey) => path.join(AUTH_DIR, `owner-${key}.json`);
const SESSION_REUSE_MS = 6 * 24 * 60 * 60 * 1000;

async function ownerSession(request: APIRequestContext, key: OwnerKey, fresh = false): Promise<Owner> {
  const cached = signedInOwners.get(key);
  if (cached && !fresh) return cached;
  if (!fresh && fs.existsSync(ownerFile(key))) {
    const saved = JSON.parse(fs.readFileSync(ownerFile(key), 'utf8')) as Owner & { savedAt: number };
    if (Date.now() - saved.savedAt < SESSION_REUSE_MS) {
      signedInOwners.set(key, saved);
      return saved;
    }
  }
  const { email, name } = OWNERS[key];
  // Preview identities perform no password check; a throw-away value is sent.
  const response = await request.post('/api/auth/preview-login', { data: { email, name, password: 'e2e-owner-only' } });
  expect(response.status(), `preview sign-in for ${email}`).toBe(200);
  const body = (await response.json()) as { uid: string; token: string };
  const owner = { email, name, uid: body.uid, token: body.token };
  signedInOwners.set(key, owner);
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  fs.writeFileSync(ownerFile(key), JSON.stringify({ ...owner, savedAt: Date.now() }));
  return owner;
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

interface Arranged { conversationId: string; applicationId: string; owner: Owner }

/** Fresh state: remove earlier rows, then one application + conversation per owner, in order. */
async function arrange(request: APIRequestContext, plan: Array<{ owner: OwnerKey; messages: string[] }>): Promise<Arranged[]> {
  removeArranged();
  const arranged: Arranged[] = [];
  for (const step of plan) {
    const { job, title, company } = OWNERS[step.owner];
    const createJob = (uid: string) => devDbScript('arrange-messaging-job.mjs', ['--create', '--job-id', job, '--owner-uid', uid, '--title', title, '--company', company]);
    let owner = await ownerSession(request, step.owner);
    try {
      createJob(owner.uid);
    } catch (error) {
      // Exit 4: the saved session outlived its user row (a recreated sandbox); signing in provisions it again.
      if ((error as { status?: number }).status !== 4) throw error;
      owner = await ownerSession(request, step.owner, true);
      createJob(owner.uid);
    }
    const applied = await request.post(`/api/jobs/${job}/applications`, {
      headers: bearer(tokenFor('a')),
      data: {
        fullName: 'Avery Tester',
        phone: '+1 555 0100',
        coverLetter: `I would like to apply for the ${title} role. This cover letter exists only for the Messages end-to-end test.`,
      },
    });
    expect(applied.status(), `candidate A applies to ${job}`).toBe(201);
    const { applicationId } = (await applied.json()) as { applicationId: string };
    const opened = await request.post('/api/messages/conversations', { headers: bearer(owner.token), data: { applicationId } });
    expect(opened.status(), 'the job owner opens the conversation').toBe(201);
    const { conversationId } = (await opened.json()) as { conversationId: string };
    for (const text of step.messages) await ownerSends(request, owner, conversationId, text);
    arranged.push({ conversationId, applicationId, owner });
  }
  return arranged;
}

async function ownerSends(request: APIRequestContext, owner: Owner, conversationId: string, text: string) {
  const sent = await request.post('/api/messages/send', { headers: bearer(owner.token), data: { conversationId, text } });
  expect(sent.status(), `${owner.name} sends a message`).toBe(201);
}

interface ApiMessage { id: string; senderId: string; text: string; timestamp: number }
interface ApiConversation { id: string; unreadCount?: number; lastMessage: ApiMessage | null }

async function threadAs(request: APIRequestContext, token: string, conversationId: string): Promise<ApiMessage[]> {
  const response = await request.get(`/api/messages/conversations/${conversationId}/messages?limit=100`, { headers: bearer(token) });
  expect(response.status()).toBe(200);
  return ((await response.json()) as { messages: ApiMessage[] }).messages;
}

async function conversationsOfA(request: APIRequestContext): Promise<{ conversations: ApiConversation[]; totalUnread: number }> {
  const response = await request.get('/api/messages/conversations', { headers: bearer(tokenFor('a')) });
  expect(response.status()).toBe(200);
  return (await response.json()) as { conversations: ApiConversation[]; totalUnread: number };
}

const RILEY_FIRST = 'Hello Avery, thanks for applying to the Platform Engineer role.';
const RILEY_SECOND = 'Are you available for a call on Thursday?';
const threadUrl = (conversationId: string) => `/dashboard/messages?conversationId=${conversationId}`;
const rowFor = (page: Page, name: string) => page.getByRole('list', { name: 'Conversations' }).getByRole('button', { name: new RegExp(name) });
const composer = (page: Page) => page.getByRole('textbox', { name: /^Message to / });
const bubbles = (page: Page) => page.getByRole('list', { name: /^Messages with / }).locator('li[data-sender]');
const twoPane = (page: Page) => (page.viewportSize()?.width ?? 1920) >= 1280;
const isSend = (url: string) => new URL(url).pathname === '/api/messages/send';
const disabledHeading = (page: Page) => page.getByRole('heading', { name: 'Messages are turned off' });
const missingHeading = (page: Page) => page.getByRole('heading', { name: 'This conversation isn’t available' });

test.describe('Messages — module turned off (the shipped default)', () => {
  test.beforeAll(() => {
    removeArranged();
    setMessagesModule(false);
  });
  test.afterAll(() => setMessagesModule(false));

  test('says messaging is off instead of showing an inbox, for the page and for a conversation link', async ({ page, guard }) => {
    guard.expectApiStatuses(403);
    const gate = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/messages/conversations');
    await page.goto('/dashboard/messages');
    const response = await gate;
    expect(response.status()).toBe(403);
    expect(((await response.json()) as { code?: string }).code).toBe('MODULE_DISABLED');
    await expect(page.getByRole('heading', { level: 1, name: 'Messages' })).toBeVisible();
    await expect(disabledHeading(page)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Go to notifications' })).toHaveAttribute('href', '/dashboard/notifications');
    await expect(page.getByRole('list', { name: 'Conversations' })).toHaveCount(0);
    await expect(composer(page)).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    await expectNoAxeViolations(page);

    const threadCalls: string[] = [];
    page.on('request', (request) => {
      if (/\/api\/messages\/conversations\/[^/]+\//.test(new URL(request.url()).pathname)) threadCalls.push(request.url());
    });
    await page.goto(threadUrl('a'.repeat(64)));
    await expect(disabledHeading(page)).toBeVisible();
    expect(threadCalls).toEqual([]);
  });

  test('"Check again" asks the server again and shows the inbox once messaging is turned on', async ({ page, guard }) => {
    guard.expectApiStatuses(403);
    await page.goto('/dashboard/messages');
    await expect(disabledHeading(page)).toBeVisible();
    const stillOff = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/messages/conversations');
    await page.getByRole('button', { name: 'Check again' }).click();
    expect((await stillOff).status()).toBe(403);
    await expect(disabledHeading(page)).toBeVisible();

    setMessagesModule(true);
    try {
      const listed = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/messages/conversations' && response.status() === 200);
      await page.getByRole('button', { name: 'Check again' }).click();
      await listed;
      await expect(page.getByRole('heading', { name: 'No conversations yet' })).toBeVisible();
      await expect(disabledHeading(page)).toHaveCount(0);
    } finally {
      setMessagesModule(false);
    }
  });
});

test.describe('Messages — module turned on', () => {
  test.beforeAll(() => setMessagesModule(true));
  test.afterAll(() => {
    removeArranged();
    setMessagesModule(false);
  });

  test('lists the conversation with the participant, newest message and unread count from the server', async ({ page, request }) => {
    await arrange(request, [{ owner: 'riley', messages: [RILEY_FIRST, RILEY_SECOND] }]);
    const listed = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/messages/conversations');
    await page.goto('/dashboard/messages');
    expect(((await (await listed).json()) as { totalUnread: number }).totalUnread).toBe(2);
    const row = rowFor(page, 'Riley Recruiter');
    await expect(row).toBeVisible();
    await expect(row).toContainText(RILEY_SECOND);
    await expect(row).toContainText('2 unread messages');
    await expect(page.getByText('2 unread', { exact: true })).toBeVisible();
    if (twoPane(page)) await expect(page.getByText('Select a conversation to read and reply.')).toBeVisible();
    else await expect(composer(page)).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    await expectNoAxeViolations(page);
    // Listing alone never advances the read cursor.
    expect((await conversationsOfA(request)).totalUnread).toBe(2);
  });

  test('opening a conversation shows the thread and clears its unread count on the server, which a reload keeps', async ({ page, request }) => {
    const [conversation] = await arrange(request, [{ owner: 'riley', messages: [RILEY_FIRST, RILEY_SECOND] }]);
    await page.goto('/dashboard/messages');
    const read = page.waitForResponse((response) => response.url().endsWith(`/api/messages/conversations/${conversation.conversationId}/read`), { timeout: 15_000 });
    await rowFor(page, 'Riley Recruiter').click();
    await expect(page).toHaveURL(new RegExp(`\\?conversationId=${conversation.conversationId}$`));
    const heading = page.getByRole('heading', { level: 2, name: 'Riley Recruiter' });
    await expect(heading).toBeVisible();
    if (!twoPane(page)) await expect(heading).toBeFocused();
    await expect(bubbles(page)).toHaveCount(2);
    await expect(bubbles(page).nth(0)).toHaveAttribute('data-sender', 'them');
    await expect(bubbles(page).nth(0)).toContainText(RILEY_FIRST);
    await expect(bubbles(page).nth(1)).toContainText(RILEY_SECOND);
    const stored = await threadAs(request, tokenFor('a'), conversation.conversationId);
    await expect(bubbles(page).nth(1).locator('time')).toHaveAttribute('datetime', new Date(stored[1].timestamp).toISOString());
    expect((await read).status()).toBe(200);
    await expect.poll(async () => (await conversationsOfA(request)).totalUnread).toBe(0);
    await expect(page.getByText('2 unread', { exact: true })).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    await expectNoAxeViolations(page);

    await page.reload();
    await expect(heading).toBeVisible();
    await expect(bubbles(page)).toHaveCount(2);
    await expect(page.getByText(/^\d+ unread$/)).toHaveCount(0);
  });

  test('a reply is stored first and shown from the server, survives a reload, and reaches the job owner', async ({ page, request }) => {
    const [conversation] = await arrange(request, [{ owner: 'riley', messages: [RILEY_FIRST, RILEY_SECOND] }]);
    const dialogs: string[] = [];
    page.on('dialog', (dialog) => {
      dialogs.push(dialog.message());
      void dialog.dismiss();
    });
    await page.goto(threadUrl(conversation.conversationId));
    await expect(bubbles(page)).toHaveCount(2);
    const reply = `Yes, Thursday works for me. (${Date.now()})`;
    await composer(page).fill(reply);
    const sent = page.waitForResponse((response) => isSend(response.url()), { timeout: 15_000 });
    await page.getByRole('button', { name: 'Send' }).click();
    const response = await sent;
    expect(response.status()).toBe(201);
    const { messageId } = (await response.json()) as { messageId: string };
    await expect(bubbles(page)).toHaveCount(3);
    await expect(bubbles(page).nth(2)).toHaveAttribute('data-sender', 'me');
    await expect(bubbles(page).nth(2)).toContainText(reply);
    await expect(composer(page)).toHaveValue('');
    await expect(page.locator('p[role="status"]', { hasText: 'Message sent.' })).toBeAttached();
    expect(dialogs, 'no native alert or confirm').toEqual([]);

    const ownerView = await threadAs(request, conversation.owner.token, conversation.conversationId);
    expect(ownerView.at(-1)).toMatchObject({ id: messageId, senderId: uidFor('a'), text: reply });

    await page.reload();
    await expect(bubbles(page)).toHaveCount(3);
    await expect(bubbles(page).nth(2)).toContainText(reply);
    if (twoPane(page)) await expect(rowFor(page, 'Riley Recruiter')).toContainText(`You: ${reply}`);
  });

  test('Enter sends and Shift+Enter adds a line; an empty or blank draft cannot be sent', async ({ page, request }) => {
    const [conversation] = await arrange(request, [{ owner: 'riley', messages: [RILEY_FIRST, RILEY_SECOND] }]);
    let sends = 0;
    page.on('request', (outgoing) => {
      if (isSend(outgoing.url())) sends += 1;
    });
    await page.goto(threadUrl(conversation.conversationId));
    await expect(bubbles(page)).toHaveCount(2);
    const send = page.getByRole('button', { name: 'Send' });
    await expect(send).toBeDisabled();
    await composer(page).fill('   ');
    await expect(send).toBeDisabled();
    await composer(page).press('Enter');
    await composer(page).fill('');
    await composer(page).pressSequentially('Line one');
    await composer(page).press('Shift+Enter');
    await composer(page).pressSequentially('Line two');
    await expect(composer(page)).toHaveValue('Line one\nLine two');
    expect(sends, 'nothing was sent for a blank draft').toBe(0);
    const sent = page.waitForResponse((response) => isSend(response.url()), { timeout: 15_000 });
    await composer(page).press('Enter');
    expect((await sent).status()).toBe(201);
    await expect(bubbles(page)).toHaveCount(3);
    expect(await bubbles(page).nth(2).locator('p').first().innerText()).toBe('Line one\nLine two');
    expect(sends).toBe(1);
  });

  test('a failed send keeps the draft and says so; trying again stores it once', async ({ page, request, guard }) => {
    guard.expectApiStatuses(503);
    const [conversation] = await arrange(request, [{ owner: 'riley', messages: [RILEY_FIRST, RILEY_SECOND] }]);
    await page.goto(threadUrl(conversation.conversationId));
    await expect(bubbles(page)).toHaveCount(2);
    // Labelled failure path: the send route answers 503 as the server does when MariaDB is unavailable.
    await page.route('**/api/messages/send', (route) => route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ success: false, error: 'Messaging service unavailable.' }),
    }));
    const draft = `A draft that must survive (${Date.now()})`;
    await composer(page).fill(draft);
    await page.getByRole('button', { name: 'Send' }).click();
    const alert = page.getByRole('alert').filter({ hasText: 'Your message was not sent.' });
    await expect(alert).toContainText('Messaging service unavailable.');
    await expect(composer(page)).toHaveValue(draft);
    await expect(composer(page)).toHaveAttribute('aria-describedby', /-error/);
    await expect(bubbles(page)).toHaveCount(2);
    expect((await threadAs(request, tokenFor('a'), conversation.conversationId)).some((message) => message.text === draft)).toBe(false);
    await expectNoAxeViolations(page);

    await page.unroute('**/api/messages/send');
    const sent = page.waitForResponse((response) => isSend(response.url()), { timeout: 15_000 });
    await page.getByRole('button', { name: 'Send' }).click();
    expect((await sent).status()).toBe(201);
    await expect(bubbles(page)).toHaveCount(3);
    await expect(alert).toHaveCount(0);
    expect((await threadAs(request, tokenFor('a'), conversation.conversationId)).filter((message) => message.text === draft)).toHaveLength(1);
  });

  test('pressing Send twice quickly stores the message once', async ({ page, request }) => {
    const [conversation] = await arrange(request, [{ owner: 'riley', messages: [RILEY_FIRST] }]);
    let sends = 0;
    page.on('request', (outgoing) => {
      if (isSend(outgoing.url())) sends += 1;
    });
    await page.goto(threadUrl(conversation.conversationId));
    await expect(bubbles(page)).toHaveCount(1);
    const text = `Only once, please (${Date.now()})`;
    await composer(page).fill(text);
    await page.getByRole('button', { name: 'Send' }).dblclick();
    await expect(bubbles(page)).toHaveCount(2);
    await expect(composer(page)).toHaveValue('');
    expect(sends).toBe(1);
    expect((await threadAs(request, tokenFor('a'), conversation.conversationId)).filter((message) => message.text === text)).toHaveLength(1);
  });

  test('the composer enforces the 10 000-character limit the server applies, and long words wrap', async ({ page, request }) => {
    const [conversation] = await arrange(request, [{ owner: 'riley', messages: [RILEY_FIRST] }]);
    await page.goto(threadUrl(conversation.conversationId));
    await expect(bubbles(page)).toHaveCount(1);
    await expect(composer(page)).toHaveAttribute('maxlength', '10000');
    await expect(page.getByText(/of 10,000 characters/)).toHaveCount(0);
    await composer(page).fill('a'.repeat(9_000));
    await expect(page.getByText('9,000 of 10,000 characters')).toBeVisible();
    await composer(page).fill('b'.repeat(10_000));
    await expect(page.getByText('10,000 of 10,000 characters')).toBeVisible();
    const sent = page.waitForResponse((response) => isSend(response.url()), { timeout: 15_000 });
    await page.getByRole('button', { name: 'Send' }).click();
    expect((await sent).status()).toBe(201);
    await expect(bubbles(page)).toHaveCount(2);
    await expectNoHorizontalOverflow(page);
    // One character more is refused by the server itself.
    const over = await request.post('/api/messages/send', {
      headers: bearer(tokenFor('a')),
      data: { conversationId: conversation.conversationId, text: 'c'.repeat(10_001) },
    });
    expect(over.status()).toBe(400);
  });

  test('deep link: direct load, refresh, Back and Forward, and the in-app back button', async ({ page, request }) => {
    const [conversation] = await arrange(request, [{ owner: 'riley', messages: [RILEY_FIRST, RILEY_SECOND] }]);
    await page.goto('/dashboard/messages');
    const row = rowFor(page, 'Riley Recruiter');
    await row.click();
    await expect(page).toHaveURL(new RegExp(`\\?conversationId=${conversation.conversationId}$`));
    const heading = page.getByRole('heading', { level: 2, name: 'Riley Recruiter' });
    await expect(heading).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/\/dashboard\/messages$/);
    if (twoPane(page)) {
      await expect(page.getByText('Select a conversation to read and reply.')).toBeVisible();
    } else {
      await expect(heading).toBeHidden();
      await expect(row).toBeFocused();
    }
    await page.goForward();
    await expect(heading).toBeVisible();
    await page.reload();
    await expect(heading).toBeVisible();
    await expect(bubbles(page)).toHaveCount(2);

    await page.goto(threadUrl(conversation.conversationId));
    await expect(bubbles(page)).toHaveCount(2);
    if (!twoPane(page)) {
      // A direct load has no list entry behind it, so the in-app back button replaces the URL.
      await page.getByRole('button', { name: 'Back to conversations' }).click();
      await expect(page).toHaveURL(/\/dashboard\/messages$/);
      await expect(row).toBeFocused();
    }
  });

  test('an unknown or malformed conversation link says it is not available without asking the API', async ({ page, request }) => {
    await arrange(request, [{ owner: 'riley', messages: [RILEY_FIRST] }]);
    const strayCalls: string[] = [];
    page.on('request', (outgoing) => {
      const pathname = new URL(outgoing.url()).pathname;
      if (pathname.startsWith('/api/messages/conversations/') && /does-not-exist|\.\.|%2F/i.test(outgoing.url())) strayCalls.push(pathname);
    });
    for (const id of ['does-not-exist', '..%2F..%2Fetc%2Fpasswd', '']) {
      await page.goto(`/dashboard/messages?conversationId=${id}`);
      await expect(missingHeading(page)).toBeVisible();
    }
    expect(strayCalls).toEqual([]);
    await expectNoHorizontalOverflow(page);
    await expectNoAxeViolations(page);
    await page.getByRole('button', { name: 'Back to conversations' }).click();
    await expect(page).toHaveURL(/\/dashboard\/messages$/);
    await expect(rowFor(page, 'Riley Recruiter')).toBeVisible();
  });

  test('search narrows the list by name or newest message, and says when nothing matches', async ({ page, request }) => {
    await arrange(request, [
      { owner: 'riley', messages: [RILEY_FIRST, RILEY_SECOND] },
      { owner: 'jordan', messages: ['Hi Avery, could you share a link to your portfolio?'] },
    ]);
    await page.goto('/dashboard/messages');
    const rows = page.getByRole('list', { name: 'Conversations' }).getByRole('button');
    await expect(rows).toHaveCount(2);
    // The server orders conversations by their newest message.
    await expect(rows.nth(0)).toContainText('Jordan Hiring');
    await expect(rows.nth(1)).toContainText('Riley Recruiter');
    const search = page.getByRole('searchbox', { name: 'Search conversations' });
    await search.fill('jordan');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('Jordan Hiring');
    await search.fill('THURSDAY');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('Riley Recruiter');
    await expect(page.locator('p[role="status"]', { hasText: '1 of 2 conversations match.' })).toBeAttached();
    await search.fill('zzz-no-match');
    await expect(page.getByText('No conversations match “zzz-no-match”')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.getByRole('button', { name: 'Clear search' }).click();
    await expect(rows).toHaveCount(2);
    await expect(search).toHaveValue('');
  });

  test('a message that arrives while the thread is open appears without a reload, is announced and marked read', async ({ page, request }) => {
    const [conversation] = await arrange(request, [{ owner: 'riley', messages: [RILEY_FIRST] }]);
    await page.goto(threadUrl(conversation.conversationId));
    await expect(bubbles(page)).toHaveCount(1);
    await expect.poll(async () => (await conversationsOfA(request)).totalUnread).toBe(0);
    const late = `Following up: does 10am suit you? (${Date.now()})`;
    const readAgain = page.waitForResponse((response) => response.url().endsWith(`/conversations/${conversation.conversationId}/read`), { timeout: 25_000 });
    await ownerSends(request, conversation.owner, conversation.conversationId, late);
    await expect(bubbles(page).last()).toContainText(late, { timeout: 20_000 });
    await expect(page.locator('p[role="status"]', { hasText: 'New message from Riley Recruiter.' })).toBeAttached();
    expect((await readAgain).status()).toBe(200);
    await expect.poll(async () => (await conversationsOfA(request)).totalUnread).toBe(0);
  });

  test('loading shows a placeholder; a failed list load explains and Try again recovers', async ({ page, request, guard }) => {
    guard.expectApiStatuses(503);
    await arrange(request, [{ owner: 'riley', messages: [RILEY_FIRST] }]);
    let failing = true;
    // Labelled failure path: the list answers 503 (as when MariaDB is unavailable) until released.
    await page.route('**/api/messages/conversations', async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      if (failing) {
        return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, error: 'Messaging is temporarily unavailable.' }) });
      }
      return route.continue();
    });
    await page.goto('/dashboard/messages');
    await expect(page.getByText('Loading conversations…')).toBeAttached();
    const alert = page.getByRole('alert').filter({ hasText: 'Conversations could not be loaded' });
    await expect(alert).toContainText('Messaging is temporarily unavailable.');
    await expectNoAxeViolations(page);
    failing = false;
    await alert.getByRole('button', { name: 'Try again' }).click();
    await expect(rowFor(page, 'Riley Recruiter')).toBeVisible();
    await expect(alert).toHaveCount(0);
    await page.unroute('**/api/messages/conversations');
  });

  test('if an administrator turns messaging off mid-conversation, the page says so and nothing is sent', async ({ page, request, guard }) => {
    guard.expectApiStatuses(403);
    const [conversation] = await arrange(request, [{ owner: 'riley', messages: [RILEY_FIRST] }]);
    await page.goto(threadUrl(conversation.conversationId));
    await expect(bubbles(page)).toHaveCount(1);
    const text = `Written after messaging was turned off (${Date.now()})`;
    await composer(page).fill(text);
    setMessagesModule(false);
    try {
      // A thread re-read may notice first; either request must lead to the same state.
      await page.getByRole('button', { name: 'Send' }).click({ timeout: 3_000 }).catch(() => undefined);
      await expect(disabledHeading(page)).toBeVisible();
      await expect(composer(page)).toHaveCount(0);
    } finally {
      setMessagesModule(true);
    }
    expect((await threadAs(request, tokenFor('a'), conversation.conversationId)).some((message) => message.text === text)).toBe(false);
  });

  test('keyboard: open a conversation from the list, reply, and return to the same row', async ({ page, request }) => {
    await arrange(request, [{ owner: 'riley', messages: [RILEY_FIRST] }]);
    await page.goto('/dashboard/messages');
    const row = rowFor(page, 'Riley Recruiter');
    await row.focus();
    await page.keyboard.press('Enter');
    const heading = page.getByRole('heading', { level: 2, name: 'Riley Recruiter' });
    await expect(heading).toBeVisible();
    await expect(bubbles(page)).toHaveCount(1);
    await expect(twoPane(page) ? row : heading).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('region', { name: 'Message history' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(composer(page)).toBeFocused();
    await page.keyboard.type('Typed with the keyboard only');
    const sent = page.waitForResponse((response) => isSend(response.url()), { timeout: 15_000 });
    await page.keyboard.press('Enter');
    expect((await sent).status()).toBe(201);
    await expect(bubbles(page).last()).toContainText('Typed with the keyboard only');
    if (!twoPane(page)) {
      await page.getByRole('button', { name: 'Back to conversations' }).focus();
      await page.keyboard.press('Enter');
      await expect(row).toBeFocused();
    }
  });
});

test.describe('Messages — another candidate', () => {
  test.use({ storageState: storageStatePath('b') });
  test.beforeAll(() => setMessagesModule(true));
  test.afterAll(() => {
    removeArranged();
    setMessagesModule(false);
  });

  test("candidate B sees no conversations and cannot open, read or write in A's", async ({ page, request }) => {
    const [conversation] = await arrange(request, [{ owner: 'riley', messages: [RILEY_FIRST, RILEY_SECOND] }]);
    await page.goto('/dashboard/messages');
    await expect(page.getByRole('heading', { name: 'No conversations yet' })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectNoAxeViolations(page);
    await page.goto(threadUrl(conversation.conversationId));
    await expect(missingHeading(page)).toBeVisible();
    await expect(page.getByText(RILEY_FIRST)).toHaveCount(0);

    const asB = bearer(tokenFor('b'));
    const base = `/api/messages/conversations/${conversation.conversationId}`;
    expect((await request.get(`${base}/messages`, { headers: asB })).status()).toBe(404);
    expect((await request.get(`${base}/participant-profile`, { headers: asB })).status()).toBe(404);
    expect((await request.post(`${base}/read`, { headers: asB, data: {} })).status()).toBe(404);
    expect((await request.post('/api/messages/send', { headers: asB, data: { conversationId: conversation.conversationId, text: 'Not my conversation' } })).status()).toBe(404);
    expect((await request.post('/api/messages/conversations', { headers: asB, data: { applicationId: conversation.applicationId } })).status()).toBe(403);
    // Nothing B attempted reached A's thread or A's unread count.
    expect((await threadAs(request, tokenFor('a'), conversation.conversationId)).map((message) => message.text)).toEqual([RILEY_FIRST, RILEY_SECOND]);
    expect((await conversationsOfA(request)).totalUnread).toBe(2);
  });
});
