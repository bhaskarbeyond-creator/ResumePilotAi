/**
 * Mandate 11H — end-to-end suite: candidate identity security, Master Profile
 * concurrency, MFA, session security, the GDPR export / deletion lifecycle,
 * the theme switcher and live regions.
 *
 * Tests tagged @firebase run against the dev server started with placeholder
 * Firebase settings (see mandate11h.config.ts): the real Firebase JS SDK runs,
 * and FirebaseFixture answers its Identity Toolkit requests the way the
 * service does (an MFA-required sign-in returns mfaPendingCredential + mfaInfo,
 * the TOTP finalize call returns tokens, ...). Every other test runs against
 * the server without Firebase, with a backend preview session.
 *
 * All /api responses are page.route() fixtures that follow the backend
 * contracts in backend/routes/usersData.js and backend/index.js. Nothing in
 * the application is mocked: the assertions are about the requests the real
 * components send and the states they show. No fixed sleeps are used; waits
 * are on visible state or on recorded requests.
 */
import { test, expect, type Page, type Request, type Route } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';

/* ─── Shared fixtures ───────────────────────────────────────────────────── */

const json = (route: Route, status: number, body: unknown) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const b64url = (value: unknown) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');

interface ApiCall { method: string; path: string; body: unknown; authorization: string | undefined }

/**
 * Answers every /api request: specific handlers first, then a 404 for anything
 * not modelled (recorded in `unhandled`, so a test can prove a request was
 * never sent).
 */
class ApiFixture {
  readonly calls: ApiCall[] = [];
  readonly unhandled: string[] = [];
  private readonly handlers: Array<{ method: string; path: string; handle: (route: Route, request: Request) => Promise<void> | void }> = [];

  constructor(private readonly page: Page) {}

  async install() {
    await this.page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const handler = this.handlers.find((entry) => entry.method === request.method() && entry.path === url.pathname);
      let body: unknown = null;
      try { body = request.postDataJSON(); } catch { body = request.postData(); }
      this.calls.push({ method: request.method(), path: url.pathname, body, authorization: request.headers().authorization });
      if (handler) return handler.handle(route, request);
      if (url.pathname.startsWith('/api/notifications')) return json(route, 200, { notifications: [], unreadCount: 0 });
      if (url.pathname.startsWith('/api/ai-usage')) return json(route, 200, { used: 0, limit: 100, remaining: 100 });
      this.unhandled.push(`${request.method()} ${url.pathname}`);
      return json(route, 404, { success: false, error: 'Not modelled by the mandate11h fixture' });
    });
  }

  on(method: string, path: string, handle: (route: Route, request: Request) => Promise<void> | void) {
    this.handlers.unshift({ method, path: `/api${path}`, handle });
  }

  count(method: string, path: string) {
    return this.calls.filter((call) => call.method === method && call.path === `/api${path}`).length;
  }

  bodies(method: string, path: string) {
    return this.calls.filter((call) => call.method === method && call.path === `/api${path}`).map((call) => call.body);
  }
}

/** A promise the test resolves when it wants a held response to complete. */
function gate() {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => { open = resolve; });
  return { opened, open };
}

/* ─── Preview-session helpers (server without Firebase) ─────────────────── */

const CANDIDATE = { uid: 'usr_cand_11h', email: 'priya@example.test', displayName: 'Priya Sharma', role: 'USER' };

function previewToken(identity: { uid: string; email: string; role: string }) {
  return `rptest.${b64url({ ...identity, exp: Math.floor(Date.now() / 1000) + 3600 })}.${'a'.repeat(64)}`;
}

/** Store the preview session once per tab (a later reload, e.g. after sign-out, must not restore it). */
async function seedPreviewSession(page: Page) {
  const record = { ...CANDIDATE, token: previewToken(CANDIDATE) };
  await page.addInitScript((value) => {
    if (window.sessionStorage.getItem('m11h_seeded')) return;
    window.sessionStorage.setItem('m11h_seeded', '1');
    window.localStorage.setItem('ime_dev_user', JSON.stringify(value));
  }, record);
}

const SAVED_PROFILE = {
  firstname: 'Priya',
  lastname: 'Sharma',
  occupation: '',
  phone: '+91 98765 43210',
  address: '',
  city: 'Pune',
  postalCode: '',
  country: 'India',
  websiteUrl: '',
  linkedinUrl: '',
  githubUrl: '',
  summary: '',
};

const profileBody = (revision: number, profile: Record<string, string>) => ({
  success: true,
  user: { uid: CANDIDATE.uid, email: CANDIDATE.email, revision, profile: { ...profile, email: CANDIDATE.email } },
});

/**
 * GET /api/users-data/profile. The auth provider's session check (a fetch())
 * always succeeds; the panel's loads (axios XHR) are answered by `load`.
 */
function serveProfile(api: ApiFixture, load: (attempt: number) => { status: number; body: unknown }) {
  let attempt = 0;
  api.on('GET', '/users-data/profile', (route, request) => {
    if (request.resourceType() === 'fetch') return json(route, 200, profileBody(3, SAVED_PROFILE));
    attempt += 1;
    const { status, body } = load(attempt);
    return json(route, status, body);
  });
}

async function openSettings(page: Page, tab: 'profile' | 'security' | 'account' | 'appearance') {
  await page.goto(`/dashboard/settings?tab=${tab}`);
}

/* ─── Firebase fixture (server with placeholder Firebase settings) ──────── */

const FB_PROJECT = 'mandate11h-test';

interface FirebaseAccount { uid: string; email: string; password: string; totpEnrollmentId: string | null }

/**
 * Stands in for Identity Toolkit / Secure Token. Only the endpoints the flows
 * use are modelled; any other googleapis request is recorded as unexpected.
 */
class FirebaseFixture {
  readonly requests: Array<{ endpoint: string; body: Record<string, unknown> }> = [];
  readonly unexpected: string[] = [];
  readonly totpCode = '246810';
  holdSignIn: Promise<void> | null = null;
  account: FirebaseAccount = { uid: 'fb_cand_11h', email: 'meera@example.com', password: 'Corr3ct-Horse!', totpEnrollmentId: 'totp-enrollment-1' };
  private pendingCredentials = new Set<string>();

  constructor(private readonly page: Page) {}

  count(endpoint: string) { return this.requests.filter((entry) => entry.endpoint === endpoint).length; }
  last(endpoint: string) { return [...this.requests].reverse().find((entry) => entry.endpoint === endpoint)?.body ?? null; }

  private idToken() {
    const now = Math.floor(Date.now() / 1000);
    const { uid, email, totpEnrollmentId } = this.account;
    return `${b64url({ alg: 'RS256', kid: 'mandate11h' })}.${b64url({
      iss: `https://securetoken.google.com/${FB_PROJECT}`,
      aud: FB_PROJECT,
      auth_time: now,
      user_id: uid,
      sub: uid,
      iat: now,
      exp: now + 3600,
      email,
      email_verified: true,
      firebase: { identities: { email: [email] }, sign_in_provider: 'password', ...(totpEnrollmentId ? { sign_in_second_factor: 'totp' } : {}) },
    })}.mandate11h-signature`;
  }

  private tokens() {
    return { idToken: this.idToken(), refreshToken: 'refresh-token-11h', expiresIn: '3600', localId: this.account.uid, email: this.account.email };
  }

  private mfaInfo() {
    return this.account.totpEnrollmentId
      ? [{ mfaEnrollmentId: this.account.totpEnrollmentId, displayName: 'Pixel authenticator', enrolledAt: '2026-09-01T10:00:00.000Z', totpInfo: {} }]
      : [];
  }

  private static error(route: Route, message: string) {
    return json(route, 400, { error: { code: 400, message, errors: [{ message, domain: 'global', reason: 'invalid' }] } });
  }

  async install() {
    await this.page.route('https://identitytoolkit.googleapis.com/**', (route) => this.identityToolkit(route));
    await this.page.route('https://securetoken.googleapis.com/**', (route) => {
      this.requests.push({ endpoint: 'token', body: {} });
      const tokens = this.tokens();
      return json(route, 200, { access_token: tokens.idToken, id_token: tokens.idToken, expires_in: '3600', token_type: 'Bearer', refresh_token: tokens.refreshToken, user_id: this.account.uid, project_id: FB_PROJECT });
    });
    // The hosted auth iframe and reCAPTCHA are never needed by these flows.
    await this.page.route(/https:\/\/(mandate11h-test\.firebaseapp\.com|www\.google\.com|apis\.google\.com|www\.gstatic\.com)\//, (route) => {
      this.unexpected.push(route.request().url());
      return route.abort();
    });
  }

  private async identityToolkit(route: Route) {
    const url = new URL(route.request().url());
    const endpoint = url.pathname.replace(/^\/v[12]\//, '');
    const body = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
    this.requests.push({ endpoint, body });
    const { account } = this;

    switch (endpoint) {
      case 'accounts:signInWithPassword': {
        if (this.holdSignIn) await this.holdSignIn;
        if (body.email !== account.email || body.password !== account.password) return FirebaseFixture.error(route, 'INVALID_LOGIN_CREDENTIALS');
        if (!account.totpEnrollmentId) return json(route, 200, this.tokens());
        const pending = `pending-${this.requests.length}`;
        this.pendingCredentials.add(pending);
        return json(route, 200, { localId: account.uid, email: account.email, mfaPendingCredential: pending, mfaInfo: this.mfaInfo() });
      }
      case 'accounts/mfaSignIn:finalize': {
        const info = body.totpVerificationInfo as { verificationCode?: string } | undefined;
        if (!this.pendingCredentials.has(String(body.mfaPendingCredential))) return FirebaseFixture.error(route, 'INVALID_MFA_PENDING_CREDENTIAL');
        if (body.mfaEnrollmentId !== account.totpEnrollmentId) return FirebaseFixture.error(route, 'MFA_ENROLLMENT_NOT_FOUND');
        if (info?.verificationCode !== this.totpCode) return FirebaseFixture.error(route, 'INVALID_CODE');
        this.pendingCredentials.delete(String(body.mfaPendingCredential));
        const { idToken, refreshToken } = this.tokens();
        return json(route, 200, { idToken, refreshToken });
      }
      case 'accounts:lookup':
        return json(route, 200, {
          users: [{
            localId: account.uid,
            email: account.email,
            emailVerified: true,
            passwordHash: 'UkVEQUNURUQ=',
            providerUserInfo: [{ providerId: 'password', email: account.email, federatedId: account.email, rawId: account.email }],
            mfaInfo: this.mfaInfo(),
            createdAt: '1760000000000',
            lastLoginAt: String(Date.now()),
          }],
        });
      case 'accounts:sendOobCode':
        if (body.email !== account.email) return FirebaseFixture.error(route, 'EMAIL_NOT_FOUND');
        return json(route, 200, { email: account.email });
      case 'accounts:update':
        if (typeof body.password === 'string') account.password = body.password;
        return json(route, 200, { ...this.tokens(), providerUserInfo: [{ providerId: 'password', federatedId: account.email }], passwordHash: 'UkVEQUNURUQ=' });
      default:
        this.unexpected.push(endpoint);
        return FirebaseFixture.error(route, 'NOT_MODELLED_IN_TEST');
    }
  }
}

/** Sign in through the real login page with password + TOTP; returns once the app has left /login. */
async function signInWithTotp(page: Page, firebase: FirebaseFixture, next = '/dashboard') {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.locator('#email').fill(firebase.account.email);
  await page.locator('#password').fill(firebase.account.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByLabel('Authenticator app code').fill(firebase.totpCode);
  await page.getByRole('button', { name: 'Verify & Sign In' }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** Collect console output, so tests can prove secrets never reach it. */
function captureConsole(page: Page) {
  const lines: string[] = [];
  page.on('console', (message) => lines.push(message.text()));
  return lines;
}

/* ─── 1. Login: password visibility, validation, duplicate submits ──────── */

test.describe('@firebase sign-in', () => {
  test('password toggle is a named toggle button; validation and failures are generic; submits never double', async ({ page }) => {
    const api = new ApiFixture(page);
    await api.install();
    const firebase = new FirebaseFixture(page);
    await firebase.install();
    const consoleLines = captureConsole(page);

    await page.goto('/login');
    const password = page.locator('#password');
    const toggle = page.getByRole('button', { name: 'Show password' });
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(toggle).toHaveAttribute('aria-controls', 'password');
    await expect(password).toHaveAttribute('type', 'password');
    await password.fill('wrong-password-1');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(password).toHaveAttribute('type', 'text');
    await toggle.press('Space');
    await expect(password).toHaveAttribute('type', 'password');

    // Client-side validation: nothing reaches Firebase.
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Enter a valid email address.');
    expect(firebase.count('accounts:signInWithPassword')).toBe(0);

    // A held request: further submits while it runs are ignored.
    const held = gate();
    firebase.holdSignIn = held.opened;
    await page.locator('#email').fill(firebase.account.email);
    await password.press('Enter');
    await expect.poll(() => firebase.count('accounts:signInWithPassword')).toBe(1);
    await password.press('Enter');
    await page.getByRole('button', { name: /Sign in|Signing in/ }).first().dispatchEvent('click');
    held.open();
    // Wrong password: one generic message that does not say which part was wrong.
    await expect(page.getByRole('alert')).toHaveText('Invalid email or password.');
    expect(firebase.count('accounts:signInWithPassword')).toBe(1);
    await expect(page).toHaveURL(/\/login/);

    expect(consoleLines.join('\n')).not.toContain('wrong-password-1');
    expect(firebase.unexpected).toEqual([]);
  });

  /* ─── 2. Password reset ─────────────────────────────────────────────── */

  test('password reset gives the same answer whether or not the account exists', async ({ page }) => {
    const api = new ApiFixture(page);
    await api.install();
    const firebase = new FirebaseFixture(page);
    await firebase.install();

    await page.goto('/login');
    await page.getByRole('button', { name: 'Forgot password?' }).click();
    await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
    await expect(page.locator('#password')).toHaveCount(0);

    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByRole('alert')).toContainText('Enter a valid email address.');
    expect(firebase.count('accounts:sendOobCode')).toBe(0);

    const status = page.getByRole('status').filter({ hasText: /reset link/ });
    await page.locator('#email').fill(firebase.account.email);
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(status).toBeVisible();
    const existingText = await status.innerText();
    expect(firebase.last('accounts:sendOobCode')).toMatchObject({ requestType: 'PASSWORD_RESET', email: firebase.account.email });

    await page.locator('#email').fill('nobody-here@example.com');
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect.poll(() => firebase.count('accounts:sendOobCode')).toBe(2);
    await expect(status).toHaveText(existingText);
    expect(existingText).toContain('If an account exists for that email');
    await expect(page.getByRole('alert')).toBeEmpty();

    await page.getByRole('button', { name: 'Back to sign in' }).click();
    await expect(page.locator('#password')).toBeVisible();
  });

  /* ─── 3. MFA challenge ──────────────────────────────────────────────── */

  test('TOTP challenge: validated input, invalid code stays on the challenge, cancel keeps the form, success only after Firebase confirms', async ({ page }) => {
    const api = new ApiFixture(page);
    await api.install();
    const firebase = new FirebaseFixture(page);
    await firebase.install();
    const consoleLines = captureConsole(page);

    await page.goto('/login');
    await page.locator('#email').fill(firebase.account.email);
    await page.locator('#password').fill(firebase.account.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();

    const challenge = page.getByRole('form', { name: 'Two-factor verification' });
    await expect(page.getByRole('heading', { name: 'Two-Factor Authentication' })).toBeVisible();
    const code = challenge.getByLabel('Authenticator app code');
    await expect(code).toBeFocused();
    await expect(code).toHaveAttribute('autocomplete', 'one-time-code');
    await expect(code).toHaveAttribute('inputmode', 'numeric');

    // Too short: rejected locally.
    await code.fill('12345');
    await challenge.getByRole('button', { name: 'Verify & Sign In' }).click();
    await expect(page.getByRole('alert')).toHaveText('Enter the 6-digit code from your authenticator app.');
    expect(firebase.count('accounts/mfaSignIn:finalize')).toBe(0);

    // Wrong code: Firebase refuses, the challenge stays, no success is shown.
    await code.fill('000000');
    await challenge.getByRole('button', { name: 'Verify & Sign In' }).click();
    await expect.poll(() => firebase.count('accounts/mfaSignIn:finalize')).toBe(1);
    await expect(page.getByRole('alert')).not.toBeEmpty();
    await expect(page.getByText('Verified. Signing you in…')).toHaveCount(0);
    await expect(challenge).toBeVisible();
    await expect(code).toHaveValue('');

    // Cancel returns to sign-in with the email and password kept.
    await page.getByRole('button', { name: 'Cancel and return to sign in' }).click();
    await expect(challenge).toHaveCount(0);
    await expect(page.locator('#email')).toHaveValue(firebase.account.email);
    await expect(page.locator('#password')).toHaveValue(firebase.account.password);

    // Second attempt with the right code completes through the TOTP assertion.
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByLabel('Authenticator app code').fill(firebase.totpCode);
    await page.getByRole('button', { name: 'Verify & Sign In' }).click();
    await expect(page).not.toHaveURL(/\/login/);
    const finalize = firebase.last('accounts/mfaSignIn:finalize');
    expect(finalize).toMatchObject({ mfaEnrollmentId: 'totp-enrollment-1', totpVerificationInfo: { verificationCode: firebase.totpCode } });
    expect(String(finalize?.mfaPendingCredential)).toMatch(/^pending-/);
    expect(finalize).not.toHaveProperty('phoneVerificationInfo');

    const output = consoleLines.join('\n');
    expect(output).not.toContain(firebase.totpCode);
    expect(output).not.toContain(firebase.account.password);
    expect(output).not.toContain('pending-');
    expect(firebase.unexpected).toEqual([]);
  });

  /* ─── 6. Password change ────────────────────────────────────────────── */

  test('password change: policy errors before any request, strength is separate, re-authentication with TOTP, inputs cleared', async ({ page }) => {
    const api = new ApiFixture(page);
    await api.install();
    serveProfile(api, () => ({ status: 200, body: profileBody(1, SAVED_PROFILE) }));
    const firebase = new FirebaseFixture(page);
    await firebase.install();
    await signInWithTotp(page, firebase);
    const oldPassword = firebase.account.password;

    await openSettings(page, 'security');
    const form = page.getByRole('form', { name: 'Change password' });
    const current = form.getByLabel('Current password', { exact: true });
    const next = form.getByLabel('New password', { exact: true });
    const confirm = form.getByLabel('Confirm new password', { exact: true });
    await expect(current).toHaveAttribute('type', 'password');
    await form.getByRole('button', { name: 'Show current password' }).click();
    await expect(current).toHaveAttribute('type', 'text');

    const signInsBefore = firebase.count('accounts:signInWithPassword');
    await current.fill(oldPassword);
    await next.fill('short');
    await confirm.fill('short');
    await form.getByRole('button', { name: 'Change password' }).click();
    await expect(form.getByText(/at least 8/)).toBeVisible();
    await expect(next).toHaveAttribute('aria-invalid', 'true');

    await next.fill(oldPassword);
    await confirm.fill(oldPassword);
    await form.getByRole('button', { name: 'Change password' }).click();
    await expect(form.getByText(/differs from your current/)).toBeVisible();

    await next.fill('Brand-New-Pass-77');
    await confirm.fill('Brand-New-Pass-78');
    await form.getByRole('button', { name: 'Change password' }).click();
    await expect(form.getByText(/do not match/)).toBeVisible();
    expect(firebase.count('accounts:signInWithPassword')).toBe(signInsBefore);

    // Strength is reported separately from the policy.
    await next.fill('password123');
    await expect(form.getByText('Weak', { exact: false }).first()).toBeVisible();
    await next.fill('Brand-New-Pass-77');
    await confirm.fill('Brand-New-Pass-77');
    await expect(form.getByText('Strong', { exact: false }).first()).toBeVisible();

    await form.getByRole('button', { name: 'Change password' }).click();
    // Re-authentication hits MFA: a second step, no update yet.
    const mfaCode = form.getByLabel('Authenticator app code');
    await expect(mfaCode).toBeFocused();
    expect(firebase.count('accounts:update')).toBe(0);
    await mfaCode.fill(firebase.totpCode);
    await form.getByRole('button', { name: 'Verify and change password' }).click();

    await expect(form.getByRole('status')).toContainText('Your password was changed.');
    expect(firebase.last('accounts:signInWithPassword')).toMatchObject({ email: firebase.account.email, password: oldPassword });
    expect(firebase.last('accounts:update')).toMatchObject({ password: 'Brand-New-Pass-77' });
    await expect(form.getByLabel('Current password', { exact: true })).toHaveValue('');
    await expect(form.getByLabel('New password', { exact: true })).toHaveValue('');
    await expect(form.getByLabel('Confirm new password', { exact: true })).toHaveValue('');
    expect(firebase.unexpected).toEqual([]);
  });

  /* ─── 7. MFA removal dialog ─────────────────────────────────────────── */

  test('two-factor removal: real enrolled factor, warning dialog, focus restore, recent-sign-in path, confirmed result', async ({ page }) => {
    const api = new ApiFixture(page);
    await api.install();
    serveProfile(api, () => ({ status: 200, body: profileBody(1, SAVED_PROFILE) }));
    const disableReplies = [
      { status: 403, body: { error: { code: 'RECENT_AUTH_REQUIRED', message: 'Please reauthenticate before this sensitive operation', requestId: 'req-1' } } },
      { status: 200, body: { success: true, mfaEnabled: false, removedFactorCount: 1 } },
    ];
    api.on('POST', '/users-data/mfa/disable', (route) => {
      const reply = disableReplies.shift() ?? { status: 500, body: { success: false, error: 'unexpected extra call' } };
      return json(route, reply.status, reply.body);
    });
    const firebase = new FirebaseFixture(page);
    await firebase.install();
    await signInWithTotp(page, firebase);

    await openSettings(page, 'security');
    const factors = page.getByRole('list', { name: 'Enrolled second factors' });
    await expect(factors).toContainText('Pixel authenticator');
    await expect(factors).toContainText('Authenticator app');

    const trigger = page.getByRole('button', { name: 'Turn off two-factor authentication' });
    await trigger.click();
    const dialog = page.getByRole('alertdialog', { name: 'Turn off two-factor authentication?' });
    await expect(dialog).toContainText('signs out every active session, including this one');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(api.count('POST', '/users-data/mfa/disable')).toBe(0);

    // Recent sign-in required: explained, nothing claimed, sign-in offered.
    await trigger.click();
    await dialog.getByRole('button', { name: 'Turn off', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('needs a sign-in from the last 10 minutes');
    await expect(dialog.getByRole('button', { name: 'Sign in again' })).toBeFocused();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(trigger).toBeFocused();

    await trigger.click();
    await dialog.getByRole('button', { name: 'Turn off', exact: true }).click();
    const done = page.getByRole('alertdialog', { name: 'Two-factor authentication is off' });
    await expect(done.getByRole('status')).toContainText('Removed 1 factor. Every session was signed out, including this one.');
    expect(api.count('POST', '/users-data/mfa/disable')).toBe(2);
    // The request carried the Firebase ID token, not a preview token.
    const call = api.calls.find((entry) => entry.path === '/api/users-data/mfa/disable');
    expect(call?.authorization).toMatch(/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);
  });
});

/* ─── 4. Profile load, dirty state, validation, save ────────────────────── */

test('profile: load failure and retry, dirty tracking, validation, discard, save with the server revision', async ({ page }) => {
  const api = new ApiFixture(page);
  await api.install();
  await seedPreviewSession(page);
  // The app's query client retries a failed read once, so two failures are needed.
  serveProfile(api, (attempt) => (attempt <= 2
    ? { status: 500, body: { success: false, error: 'Failed to load user profile' } }
    : { status: 200, body: profileBody(3, SAVED_PROFILE) }));
  let revision = 3;
  api.on('POST', '/users-data/profile', (route, request) => {
    const body = request.postDataJSON() as { profile: Record<string, string> };
    revision += 1;
    return json(route, 200, profileBody(revision, { ...SAVED_PROFILE, ...body.profile }));
  });

  await openSettings(page, 'profile');
  await expect(page.getByRole('alert').filter({ hasText: 'Your Master Profile could not be loaded.' })).toContainText('Failed to load user profile');
  await expect(page.getByRole('form', { name: 'Master Profile' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Retry' }).click();

  const form = page.getByRole('form', { name: 'Master Profile' });
  const save = form.getByRole('button', { name: 'Save Master Profile' });
  await expect(form.getByLabel('First name')).toHaveValue('Priya');
  await expect(form.getByLabel('Sign-in email')).toHaveAttribute('readonly', '');
  await expect(form.getByText('All changes saved.')).toBeVisible();
  await expect(save).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByRole('progressbar', { name: 'Master Profile completeness' })).toHaveAttribute('aria-valuetext', /^\d+ of 8 fields filled \(\d+%\)$/);

  // A pristine save explains itself and sends nothing. The button is
  // aria-disabled (still focusable and clickable), so force past Playwright's
  // enabled check the way a real click would.
  await save.click({ force: true });
  await expect(form.getByRole('status')).toContainText('No changes to save.');
  expect(api.count('POST', '/users-data/profile')).toBe(0);

  const city = form.getByLabel('City');
  await city.fill('Mumbai');
  await expect(form.getByText('You have unsaved changes.')).toBeVisible();
  await expect(save).not.toHaveAttribute('aria-disabled', 'true');

  // Invalid input blocks saving and is announced on the field.
  const phone = form.getByLabel('Phone');
  await phone.fill('call me');
  await expect(phone).toHaveAttribute('aria-invalid', 'true');
  await expect(save).toHaveAttribute('aria-disabled', 'true');
  await phone.fill('+44 20 7946 0958');
  await expect(phone).not.toHaveAttribute('aria-invalid', 'true');

  await form.getByRole('button', { name: 'Discard changes' }).click();
  await expect(city).toHaveValue('Pune');
  await expect(phone).toHaveValue(SAVED_PROFILE.phone);
  await expect(form.getByRole('status')).toContainText('Unsaved changes discarded.');

  await city.fill('  Mumbai  ');
  await save.click();
  await expect(form.getByRole('status')).toContainText('Master Profile saved.');
  await expect(form.getByText('All changes saved.')).toBeVisible();
  await form.getByLabel('Professional headline').fill('Data Analyst');
  await form.getByRole('button', { name: 'Save Master Profile' }).click();
  await expect(form.getByText('All changes saved.')).toBeVisible();

  expect(api.bodies('POST', '/users-data/profile')).toEqual([
    { expectedRevision: 3, profile: { city: 'Mumbai' } },
    { expectedRevision: 4, profile: { occupation: 'Data Analyst' } },
  ]);
});

/* ─── 5. Conflict handling ──────────────────────────────────────────────── */

const REMOTE_PROFILE = { ...SAVED_PROFILE, city: 'Chennai', occupation: 'Data Lead' };
const conflictReply = (remoteRevision: number) => ({
  success: false,
  code: 'PROFILE_CONFLICT',
  error: 'Profile was changed in another tab or device. Reload it before saving again.',
  remoteRevision,
  remoteProfile: REMOTE_PROFILE,
});

test('conflict: local edits stay, differences can be reviewed, "keep mine" saves on the refreshed revision', async ({ page }) => {
  const api = new ApiFixture(page);
  await api.install();
  await seedPreviewSession(page);
  serveProfile(api, () => ({ status: 200, body: profileBody(3, SAVED_PROFILE) }));
  api.on('POST', '/users-data/profile', (route, request) => {
    const body = request.postDataJSON() as { expectedRevision: number; profile: Record<string, string> };
    if (body.expectedRevision !== 5) return json(route, 409, conflictReply(5));
    return json(route, 200, profileBody(6, { ...REMOTE_PROFILE, ...body.profile }));
  });

  await openSettings(page, 'profile');
  const form = page.getByRole('form', { name: 'Master Profile' });
  const city = form.getByLabel('City');
  await expect(city).toHaveValue('Pune');
  await city.fill('Mumbai');
  await form.getByRole('button', { name: 'Save Master Profile' }).click();

  const banner = page.getByRole('region', { name: 'Changed in another tab or device' });
  await expect(banner).toContainText('revision 5');
  await expect(form.getByRole('alert')).toContainText('changed in another tab or device');
  await expect(form.getByRole('status')).not.toContainText('Master Profile saved.');
  await expect(city).toHaveValue('Mumbai');
  await expect(form.getByRole('button', { name: 'Save Master Profile' })).toHaveAttribute('aria-disabled', 'true');
  expect(api.count('POST', '/users-data/profile')).toBe(1);

  await banner.getByRole('button', { name: 'Review differences' }).click();
  const review = page.getByRole('dialog', { name: 'Review differences' });
  await expect(review.getByRole('columnheader', { name: 'Saved version (revision 5)' })).toBeVisible();
  await expect(review.getByRole('row', { name: /City Mumbai Chennai/ })).toBeVisible();
  await expect(review.getByRole('row', { name: /Professional headline .*Data Lead/ })).toBeVisible();
  await review.getByRole('button', { name: 'Back to my edits' }).click();
  await expect(review).toHaveCount(0);
  await expect(city).toHaveValue('Mumbai');

  await banner.getByRole('button', { name: 'Keep my edits and overwrite' }).click();
  await expect(form.getByRole('status')).toContainText('Master Profile saved.');
  await expect(banner).toHaveCount(0);
  await expect(city).toHaveValue('Mumbai');
  // Fields the user did not edit now show the newer saved values.
  await expect(form.getByLabel('Professional headline')).toHaveValue('Data Lead');
  expect(api.bodies('POST', '/users-data/profile')).toEqual([
    { expectedRevision: 3, profile: { city: 'Mumbai' } },
    { expectedRevision: 5, profile: { city: 'Mumbai' } },
  ]);
});

test('conflict: discarding only replaces the edits once the newer version has loaded', async ({ page }) => {
  const api = new ApiFixture(page);
  await api.install();
  await seedPreviewSession(page);
  serveProfile(api, (attempt) => {
    if (attempt === 1) return { status: 200, body: profileBody(3, SAVED_PROFILE) };
    if (attempt === 2) return { status: 503, body: { success: false, error: 'Profile storage is unavailable.' } };
    return { status: 200, body: profileBody(5, REMOTE_PROFILE) };
  });
  api.on('POST', '/users-data/profile', (route) => json(route, 409, conflictReply(5)));

  await openSettings(page, 'profile');
  const form = page.getByRole('form', { name: 'Master Profile' });
  const city = form.getByLabel('City');
  await expect(city).toHaveValue('Pune');
  await city.fill('Mumbai');
  await form.getByRole('button', { name: 'Save Master Profile' }).click();
  const discard = page.getByRole('button', { name: 'Discard my edits and load the newer version' });

  await discard.click();
  await expect(form.getByRole('alert')).toContainText('The newer version could not be loaded, so your edits were kept.');
  await expect(city).toHaveValue('Mumbai');

  await discard.click();
  await expect(form.getByRole('status')).toContainText('Loaded the newer saved version. Your unsaved edits were discarded.');
  await expect(city).toHaveValue('Chennai');
  await expect(form.getByText('All changes saved.')).toBeVisible();
  expect(api.count('POST', '/users-data/profile')).toBe(1);
});

/* ─── 8. Data export ────────────────────────────────────────────────────── */

const EXPORT_ARCHIVE = {
  exportDate: '2026-10-29T09:30:00.000Z',
  userId: CANDIDATE.uid,
  profile: { firstname: 'Priya', email: CANDIDATE.email },
  resumes: [{ id: 'res_1', title: 'Data Analyst CV' }],
  exportWarnings: [{ section: 'invoices', status: 'PARTIAL', message: '2 malformed invoice records could not be exported.' }],
  note: 'Payment records are retained for legal reasons.',
};

test('export: one request, a dated JSON file with the exact archive, partial sections disclosed; failures download nothing', async ({ page }) => {
  const api = new ApiFixture(page);
  await api.install();
  await seedPreviewSession(page);
  serveProfile(api, () => ({ status: 200, body: profileBody(3, SAVED_PROFILE) }));
  const held = gate();
  let exportCalls = 0;
  api.on('POST', '/account/export', async (route) => {
    exportCalls += 1;
    if (exportCalls === 1) {
      await held.opened;
      return json(route, 200, { success: true, export: EXPORT_ARCHIVE });
    }
    return json(route, 500, { success: false, error: 'Account export is temporarily unavailable.' });
  });

  await openSettings(page, 'account');
  const button = page.getByRole('button', { name: 'Download my data' });
  const download = page.waitForEvent('download');
  await button.click();
  await expect(page.getByRole('button', { name: 'Preparing your file…' })).toHaveAttribute('aria-busy', 'true');
  // A second click while busy (aria-disabled, still clickable) must not start another export.
  await page.getByRole('button', { name: 'Preparing your file…' }).click({ force: true });
  held.open();
  const file = await download;

  const today = await page.evaluate(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
  expect(file.suggestedFilename()).toBe(`ime365-data-export-${today}.json`);
  expect(JSON.parse(await readFile(await file.path(), 'utf8'))).toEqual(EXPORT_ARCHIVE);
  expect(exportCalls).toBe(1);

  await expect(page.getByRole('status').filter({ hasText: 'Downloaded' })).toContainText('but the export is incomplete');
  await expect(page.getByRole('list', { name: 'Sections not included' })).toContainText('2 malformed invoice records could not be exported.');

  // A failed export is an error and produces no file.
  let unexpectedDownload = false;
  page.on('download', () => { unexpectedDownload = true; });
  await page.getByRole('button', { name: 'Download my data' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Your data was not exported.' })).toContainText('temporarily unavailable');
  expect(exportCalls).toBe(2);
  expect(unexpectedDownload).toBe(false);
});

/* ─── 9. Account deletion ───────────────────────────────────────────────── */

test('deletion: exact confirmation, partial identity failure with verified retry, then sign-out and cleanup', async ({ page }) => {
  const api = new ApiFixture(page);
  await api.install();
  await seedPreviewSession(page);
  serveProfile(api, () => ({ status: 200, body: profileBody(3, SAVED_PROFILE) }));
  const replies = [
    { status: 503, body: { success: false, code: 'ACCOUNT_IDENTITY_DELETE_FAILED', error: 'Application data was removed, but identity deletion is pending. Retry deletion to finish.' } },
    { status: 200, body: { success: true, message: 'Account deleted', retainedRecordTypes: ['invoices', 'payments', 'security_audit_logs'] } },
  ];
  api.on('POST', '/account/delete', (route) => {
    const reply = replies.shift()!;
    return json(route, reply.status, reply.body);
  });

  await openSettings(page, 'account');
  await page.evaluate(() => {
    localStorage.setItem('currentResumeId', 'res_1');
    localStorage.setItem('ime365_theme', 'dark');
    sessionStorage.setItem('rpai.ats.targetJd', 'job description');
  });
  const trigger = page.getByRole('button', { name: 'Delete account…' });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Delete your account?' });
  await expect(dialog).toContainText('Payment records, invoices and security audit logs are retained.');
  const confirmation = dialog.getByLabel('Type DELETE to confirm');
  await expect(confirmation).toBeFocused();
  const remove = dialog.getByRole('button', { name: 'Delete my account' });
  await expect(remove).toHaveAttribute('aria-disabled', 'true');

  await confirmation.fill('delete');
  await expect(remove).toHaveAttribute('aria-disabled', 'true');
  await remove.click({ force: true }); // aria-disabled stays clickable; the handler must refuse
  await expect(dialog.getByText('Type DELETE in capital letters to confirm.')).toBeVisible();
  await expect(confirmation).toBeFocused();
  expect(api.count('POST', '/account/delete')).toBe(0);

  await confirmation.fill('DELETE');
  await expect(remove).not.toHaveAttribute('aria-disabled', 'true');
  await remove.click();

  // The dialog is retitled for the partial state; the confirmation field is gone.
  const partial = page.getByRole('dialog', { name: 'Your personal data was deleted' });
  await expect(partial.getByRole('alert')).toContainText('Your personal data was deleted, but removing your sign-in identity is still pending.');
  await expect(partial.getByLabel('Type DELETE to confirm')).toHaveCount(0);
  const retry = partial.getByRole('button', { name: 'Retry identity removal' });
  await expect(retry).toBeFocused();
  await expect(partial.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard\/settings/);

  await retry.click();
  await page.waitForURL((url) => url.pathname === '/');
  expect(api.bodies('POST', '/account/delete')).toEqual([{}, {}]);
  const storage = await page.evaluate(() => ({
    session: localStorage.getItem('ime_dev_user'),
    resume: localStorage.getItem('currentResumeId'),
    theme: localStorage.getItem('ime365_theme'),
    jd: sessionStorage.getItem('rpai.ats.targetJd'),
  }));
  expect(storage).toEqual({ session: null, resume: null, theme: 'dark', jd: null });
});

test('deletion: recent sign-in and unconfirmed answers are never treated as deleted', async ({ page }) => {
  const api = new ApiFixture(page);
  await api.install();
  await seedPreviewSession(page);
  serveProfile(api, () => ({ status: 200, body: profileBody(3, SAVED_PROFILE) }));
  const replies = [
    { status: 403, body: { error: { code: 'RECENT_AUTH_REQUIRED', message: 'Please reauthenticate before this sensitive operation', requestId: 'req-9' } } },
    { status: 200, body: { message: 'queued' } },
  ];
  api.on('POST', '/account/delete', (route) => {
    const reply = replies.shift()!;
    return json(route, reply.status, reply.body);
  });

  await openSettings(page, 'account');
  const trigger = page.getByRole('button', { name: 'Delete account…' });
  await trigger.click();
  let dialog = page.getByRole('dialog', { name: 'Delete your account?' });
  await dialog.getByLabel('Type DELETE to confirm').fill('DELETE');
  await dialog.getByRole('button', { name: 'Delete my account' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Nothing was deleted. Sign in again, then return here.');
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Sign in again' })).toBeFocused();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await expect(trigger).toBeFocused();

  await trigger.click();
  dialog = page.getByRole('dialog', { name: 'Delete your account?' });
  await dialog.getByLabel('Type DELETE to confirm').fill('DELETE');
  await dialog.getByRole('button', { name: 'Delete my account' }).click();
  await expect(dialog.getByRole('alert')).toContainText('The server did not confirm the deletion');
  await expect(page).toHaveURL(/\/dashboard\/settings/);
  expect(await page.evaluate(() => localStorage.getItem('ime_dev_user'))).not.toBeNull();
});

/* ─── 10. Theme switcher ────────────────────────────────────────────────── */

test('theme: keyboard radio group applies, announces and persists light / dark / system', async ({ page }) => {
  const api = new ApiFixture(page);
  await api.install();
  await seedPreviewSession(page);
  serveProfile(api, () => ({ status: 200, body: profileBody(3, SAVED_PROFILE) }));
  await page.emulateMedia({ colorScheme: 'dark' });

  await openSettings(page, 'appearance');
  const group = page.getByRole('group', { name: 'Colour theme' });
  const light = group.getByRole('radio', { name: 'Light' });
  const dark = group.getByRole('radio', { name: 'Dark' });
  const system = group.getByRole('radio', { name: 'System' });
  await light.check();
  await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);

  await light.focus();
  await page.keyboard.press('ArrowDown');
  await expect(dark).toBeChecked();
  await expect(dark).toBeFocused();
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  await expect(page.getByRole('status').filter({ hasText: 'Theme set to Dark.' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('ime365_theme'))).toBe('dark');

  await page.keyboard.press('ArrowDown');
  await expect(system).toBeChecked();
  await expect(page.getByText('Your device currently uses the dark theme.')).toBeVisible();

  await page.reload();
  await expect(page.getByRole('radio', { name: 'System' })).toBeChecked();
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);
});

/* ─── 11. Live regions ──────────────────────────────────────────────────── */

test('live regions: polite status and assertive alert are separate, empty ones take no space, settings pass axe', async ({ page }) => {
  const api = new ApiFixture(page);
  await api.install();
  await seedPreviewSession(page);
  serveProfile(api, () => ({ status: 200, body: profileBody(3, SAVED_PROFILE) }));
  let saves = 0;
  api.on('POST', '/users-data/profile', (route, request) => {
    saves += 1;
    if (saves === 1) return json(route, 500, { success: false, error: 'Failed to save user profile' });
    const body = request.postDataJSON() as { profile: Record<string, string> };
    return json(route, 200, profileBody(4, { ...SAVED_PROFILE, ...body.profile }));
  });

  await openSettings(page, 'profile');
  const form = page.getByRole('form', { name: 'Master Profile' });
  await expect(form.getByLabel('First name')).toHaveValue('Priya');
  const status = form.getByRole('status');
  const alert = form.getByRole('alert');
  await expect(status).toHaveCount(1);
  await expect(alert).toHaveCount(1);
  await expect(status).toBeEmpty();
  await expect(alert).toBeEmpty();
  for (const region of [status, alert]) {
    const box = await region.boundingBox();
    expect(box?.height ?? 0).toBe(0);
  }

  await form.getByLabel('City').fill('Mumbai');
  await form.getByRole('button', { name: 'Save Master Profile' }).click();
  await expect(alert).toContainText('Your changes were not saved. Failed to save user profile');
  await expect(status).toBeEmpty();
  await expect(form.getByLabel('City')).toHaveValue('Mumbai');
  await expect(form.getByText('You have unsaved changes.')).toBeVisible();

  await form.getByRole('button', { name: 'Save Master Profile' }).click();
  await expect(status).toContainText('Master Profile saved.');
  await expect(alert).toBeEmpty();

  const results = await new AxeBuilder({ page })
    .include('main form[aria-label="Master Profile"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(results.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
});

/* ─── 12. Regression and resilience ─────────────────────────────────────── */

test('regression: unsafe return paths never leave the site; safe ones are kept', async ({ page }) => {
  const api = new ApiFixture(page);
  await api.install();
  api.on('POST', '/auth/preview-login', (route) => json(route, 200, { token: previewToken(CANDIDATE), displayName: CANDIDATE.displayName }));
  serveProfile(api, () => ({ status: 200, body: profileBody(3, SAVED_PROFILE) }));
  const origin = new URL(page.url() === 'about:blank' ? test.info().project.use.baseURL! : page.url()).origin;

  for (const [next, expected] of [
    ['//evil.example/dashboard', '/dashboard'],
    ['/%2F%2Fevil.example', '/dashboard'],
    ['javascript:alert(1)', '/dashboard'],
    ['/resumes?page=2', '/resumes?page=2'],
  ] as const) {
    await page.goto(`/login?next=${encodeURIComponent(next)}`);
    await page.locator('#email').fill(CANDIDATE.email);
    await page.locator('#password').fill('preview-pass-1');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL((url) => url.pathname !== '/login');
    const landed = new URL(page.url());
    expect(landed.origin, next).toBe(origin);
    expect(`${landed.pathname}${landed.search}`, next).toBe(expected);
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  }
});

test('regression: registration reports a failed name sync and retries it without creating another account', async ({ page }) => {
  const api = new ApiFixture(page);
  await api.install();
  api.on('POST', '/auth/preview-login', (route) => json(route, 200, { token: previewToken(CANDIDATE), displayName: 'Asha Rao' }));
  api.on('GET', '/users-data/profile', (route, request) => json(route, request.resourceType() === 'fetch' ? 200 : 404,
    request.resourceType() === 'fetch' ? profileBody(0, {}) : { success: false, code: 'PROFILE_NOT_FOUND', error: 'Profile not found' }));
  let profilePosts = 0;
  api.on('POST', '/users-data/profile', (route) => {
    profilePosts += 1;
    return profilePosts === 1
      ? json(route, 500, { success: false, error: 'Failed to save user profile' })
      : json(route, 200, profileBody(1, { firstname: 'Asha', lastname: 'Rao' }));
  });

  await page.goto('/login');
  await page.getByRole('button', { name: 'Sign up free' }).click();
  await page.getByLabel('First name').fill('Asha');
  await page.getByLabel('Last name').fill('Rao');
  await page.locator('#email').fill('asha@example.test');
  await page.locator('#password').fill('short');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('alert')).toHaveText('Use a password of at least 8 characters.');
  expect(api.count('POST', '/auth/preview-login')).toBe(0);

  await page.locator('#password').fill('long-enough-pass');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Account created' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveText('Your account was created, but your name could not be saved to your Master Profile.');
  expect(await page.evaluate(() => sessionStorage.getItem('ime365_registration_profile_sync'))).toBe('failed');

  await page.getByRole('button', { name: 'Try saving my name again' }).click();
  await page.waitForURL((url) => url.pathname === '/dashboard');
  expect(api.count('POST', '/auth/preview-login')).toBe(1);
  expect(api.bodies('POST', '/users-data/profile')).toEqual([
    { expectedRevision: 0, profile: { firstname: 'Asha', lastname: 'Rao' } },
    { expectedRevision: 0, profile: { firstname: 'Asha', lastname: 'Rao' } },
  ]);
  expect(await page.evaluate(() => sessionStorage.getItem('ime365_registration_profile_sync'))).toBeNull();
});

test('regression: preview sessions get the honest security notice and no password or 2FA controls', async ({ page }) => {
  const api = new ApiFixture(page);
  await api.install();
  await seedPreviewSession(page);
  serveProfile(api, () => ({ status: 200, body: profileBody(3, SAVED_PROFILE) }));

  await openSettings(page, 'security');
  await expect(page.getByText('Password and 2FA settings are disabled in preview sessions.')).toBeVisible();
  await expect(page.getByRole('form', { name: 'Change password' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Turn off two-factor authentication' })).toHaveCount(0);
  expect(api.count('POST', '/users-data/mfa/disable')).toBe(0);
});
