// @ts-check
/**
 * DIR-022 - Payment Webhook Reconciler & Entitlement Sentinel, live-stack proof.
 *
 * WHAT THIS SUITE PROVES (mapped to the directive's ACs):
 *   AC-1/AC-2  A forged or unsigned Stripe delivery is REJECTED with 400 by the
 *              live backend, the response body leaks no provider message or
 *              secret, and an unsigned request is rejected too.
 *   AC-4       A real candidate marked PAST_DUE in MariaDB with a live grace
 *              deadline RENDERS the Cuba recovery banner on the real candidate
 *              dashboard, and `/api/check` still reports them as entitled
 *              (INV-5). With the deadline passed, the banner disappears and
 *              `/api/check` reports them as NOT entitled — proving the banner
 *              and the entitlement gate read the SAME authoritative column.
 *
 * Following the DIR-006/012/013/017/019/020/021 convention this suite NEVER
 * intercepts, mocks or fulfills an /api/* route: everything the browser sees
 * comes from the live backend on :8080 and its authoritative MariaDB.
 *
 * WHY THE CANDIDATE IS RESTORED: the suite writes a real PAST_DUE row so the
 * banner can be observed against the live server. It snapshots every column it
 * touches and restores them in afterAll, because this identity is a shared,
 * long-lived account and leaving it PAST_DUE would corrupt other lanes' runs.
 */
import { test, expect } from '@playwright/test';
import path from 'node:path';
import dotenv from 'dotenv';
import { mintFirebaseSession } from './dir006-session.mjs';

dotenv.config({ path: path.join(process.cwd(), '.env'), quiet: true });
dotenv.config({ path: path.join(process.cwd(), 'backend', '.env'), quiet: true });

const IDENTITY_EMAIL = process.env.DIR022_EMAIL
    || process.env.ADMIN_EMAIL
    || process.env.DIR020_EMAIL
    || process.env.DIR006_EMAIL;

async function mintIdentityWithRetry(attempts = 4) {
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            return await mintFirebaseSession({ email: IDENTITY_EMAIL });
        } catch (error) {
            lastError = error;
            const transient = /OAuth2 access token|fetch failed|ETIMEDOUT|ECONNRESET|getaddrinfo/i
                .test(String(error?.message || error));
            if (!transient || attempt === attempts) break;
            const backoffMs = attempt * 5_000;
            console.warn(`[dir022] transient identity mint failure (attempt ${attempt}/${attempts}), retrying in ${backoffMs}ms`);
            await new Promise((resolve) => { setTimeout(resolve, backoffMs); });
        }
    }
    throw lastError;
}

const SESSION = IDENTITY_EMAIL ? await mintIdentityWithRetry() : null;

async function signIn(page) {
    if (!SESSION) throw new Error('DIR022 requires a live Firebase identity. Set DIR022_EMAIL (or ADMIN_EMAIL in backend/.env).');
    await page.addInitScript(({ uid, email, token, refreshToken, apiKey }) => {
        localStorage.setItem(`firebase:authUser:${apiKey}:[DEFAULT]`, JSON.stringify({
            uid,
            email,
            emailVerified: true,
            isAnonymous: false,
            stsTokenManager: { apiKey, refreshToken, accessToken: token, expirationTime: Date.now() + 3600_000 },
            createdAt: String(Date.now()),
            lastLoginAt: String(Date.now()),
            apiKey,
            appName: '[DEFAULT]',
        }));
        localStorage.setItem('user', uid);
        localStorage.setItem('ime365_cuba_shell_v2', 'cuba');
    }, {
        uid: SESSION.uid,
        email: SESSION.email,
        token: SESSION.idToken,
        refreshToken: SESSION.refreshToken,
        apiKey: SESSION.apiKey,
    });
}

/**
 * Reads the authenticated candidate's entitlement straight from the LIVE API.
 *
 * WHY NOT `page.request`: that helper runs in Node with its own cookie/context
 * and therefore does NOT carry the Firebase bearer token the SPA holds, so
 * `/api/check` answers 401 and the assertion would be testing the auth
 * middleware instead of the entitlement gate. `page.evaluate` runs inside the
 * authenticated page and uses the real fetch the product uses.
 */
async function readEntitlement(page) {
    return page.evaluate(async () => {
        const response = await fetch('/api/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
        });
        return { status: response.status, body: await response.json() };
    });
}

/** Console/page errors are a hard failure, not a warning. */
function trackFailures(page, sink) {
    page.on('pageerror', (error) => sink.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
        if (message.type() === 'error' && !message.text().includes('Failed to load resource')) {
            sink.push(`console.error: ${message.text()}`);
        }
    });
}

/**
 * Direct MariaDB access, used ONLY to set up and tear down the entitlement state
 * the banner depends on.
 *
 * The product never grants entitlement this way — this stands in for "the
 * gateway declined the renewal and the reconciler recorded it", so the browser
 * observes a state the real pipeline can genuinely produce.
 *
 * WHY `SET time_zone = '+00:00'` IS MANDATORY HERE
 * A raw mysql2 connection inherits the server's SYSTEM time zone (IST on this
 * machine, UTC+05:30), while the application's pool forces `+00:00`. A fixture
 * that therefore wrote `DATE_ADD(NOW(3), …)` stored an instant 5.5 hours ahead
 * of the one the app reads back, which made an EXPIRED grace window look live
 * and produced a false product failure. The application code is correct — this
 * fixture now speaks the same clock the application does.
 */
async function withDatabase(fn) {
    const mysql = await import('mysql2/promise');
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || '127.0.0.1',
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD ?? '',
        database: process.env.DB_NAME || 'ai_resume_builder',
        timezone: 'Z',
    });
    try {
        await connection.query("SET time_zone = '+00:00'");
        return await fn(connection);
    } finally {
        await connection.end();
    }
}

/** Snapshot of every column this suite is allowed to touch. */
let snapshot = null;

test.beforeAll(async () => {
    if (!SESSION) return;
    snapshot = await withDatabase(async (connection) => {
        const [rows] = await connection.query(
            `SELECT id, paymentStatus, membership, membershipEnds, paymentGraceUntil,
                    paymentGraceStartedAt, renewalFailedAt, revision
             FROM users WHERE id = ? LIMIT 1`,
            [SESSION.uid],
        );
        if (!rows.length) throw new Error(`DIR022 could not find the identity ${SESSION.uid} in MariaDB`);
        return rows[0];
    });
});

test.afterAll(async () => {
    // Always restore, even when a test failed mid-way. A shared identity left in
    // PAST_DUE would silently break every other lane's run.
    if (!snapshot) return;
    await withDatabase(async (connection) => {
        await connection.query(
            `UPDATE users
             SET paymentStatus = ?, membership = ?, membershipEnds = ?, paymentGraceUntil = ?,
                 paymentGraceStartedAt = ?, renewalFailedAt = ?, revision = ?, updated_at = NOW()
             WHERE id = ?`,
            [
                snapshot.paymentStatus, snapshot.membership, snapshot.membershipEnds,
                snapshot.paymentGraceUntil, snapshot.paymentGraceStartedAt, snapshot.renewalFailedAt,
                snapshot.revision, snapshot.id,
            ],
        );
    });
});

/**
 * Writes the exact PAST_DUE + grace state the renewal-failure path produces.
 * A NEGATIVE `graceHours` writes an already-expired window, which is how the
 * post-expiry case is set up without waiting three real days.
 */
async function setPastDue({ graceHours }) {
    await withDatabase(async (connection) => {
        await connection.query(
            `UPDATE users
             SET paymentStatus = 'PAST_DUE', membership = 'Premium',
                 membershipEnds = DATE_ADD(NOW(), INTERVAL 1 YEAR),
                 renewalFailedAt = NOW(3), paymentGraceStartedAt = NOW(3),
                 paymentGraceUntil = DATE_ADD(NOW(3), INTERVAL ? HOUR),
                 revision = revision + 1, updated_at = NOW()
             WHERE id = ?`,
            [graceHours, SESSION.uid],
        );
    });
}

/** Puts the account back into its real, healthy (non-recovery) entitlement state. */
async function restoreHealthyState() {
    await withDatabase(async (connection) => {
        await connection.query(
            `UPDATE users
             SET paymentStatus = ?, membership = ?, membershipEnds = ?,
                 paymentGraceUntil = NULL, paymentGraceStartedAt = NULL,
                 renewalFailedAt = NULL, revision = ?, updated_at = NOW()
             WHERE id = ?`,
            [snapshot.paymentStatus, snapshot.membership, snapshot.membershipEnds, snapshot.revision, SESSION.uid],
        );
    });
}

test('AC-1/AC-2: a forged Stripe delivery is rejected 400 with zero secret leakage', async ({ request }) => {
    const response = await request.post('/api/stripe-webhook', {
        headers: { 'Content-Type': 'application/json', 'stripe-signature': 'forged-signature-value' },
        data: { id: 'evt_dir022_forged', type: 'payment_intent.succeeded' },
    });

    expect(response.status()).toBe(400);

    const body = await response.text();
    // INV-2: the body must be a fixed code, never a provider message, a stack
    // trace, or anything resembling a signing secret.
    expect(body).not.toMatch(/Webhook Error/i);
    expect(body).not.toMatch(/whsec_/i);
    expect(body).not.toMatch(/sk_(live|test)_/i);
    expect(body).not.toMatch(/at Object|node_modules|\.js:\d+:\d+/);

    // The code is matched against the full accepted set rather than a single
    // literal: this deployment has no STRIPE_WEBHOOK_SECRET configured, so the
    // guard legitimately reports the SECRET_UNAVAILABLE variant, while a
    // configured deployment reports one of the signature variants. Both are
    // rejections; an earlier version of this test hard-coded /SIGNATURE/ and
    // failed against the former.
    expect(body).toMatch(/WEBHOOK_SIGNING_SECRET_UNAVAILABLE|STRIPE_SIGNATURE_|RAZORPAY_SIGNATURE_|WEBHOOK_SIGNATURE_REJECTED/);

    // The request id is returned so an operator can correlate the rejection
    // with the audit row written to security_audit_logs.
    expect(JSON.parse(body).error.requestId).toBeTruthy();
});

test('AC-2: an unsigned delivery without a signature header is also rejected', async ({ request }) => {
    const response = await request.post('/api/stripe-webhook', {
        headers: { 'Content-Type': 'application/json' },
        data: { id: 'evt_dir022_unsigned', type: 'payment_intent.succeeded' },
    });
    expect(response.status()).toBe(400);
    expect(JSON.parse(await response.text()).error.code).toMatch(
        /WEBHOOK_SIGNING_SECRET_UNAVAILABLE|STRIPE_SIGNATURE_|WEBHOOK_SIGNATURE_REJECTED/,
    );
});

test('AC-4/INV-5: a PAST_DUE candidate in grace renders the banner and stays entitled', async ({ page }) => {
    const failures = [];
    trackFailures(page, failures);
    await signIn(page);
    await setPastDue({ graceHours: 72 });

    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });

    // The banner appears in the real, live DOM.
    const banner = page.getByTestId('payment-grace-banner');
    await expect(banner).toBeVisible();
    await expect(banner.getByRole('heading', { name: 'Your subscription renewal failed' })).toBeVisible();

    // The copy states the SERVER-derived deadline, not a hardcoded "3 days".
    const daysLeft = Number(await banner.getAttribute('data-days-left'));
    expect(daysLeft).toBeGreaterThan(0);
    expect(daysLeft).toBeLessThanOrEqual(3);
    await expect(banner).toContainText(`within ${daysLeft} day${daysLeft === 1 ? '' : 's'}`);

    // The banner links to the real billing settings surface.
    await expect(banner.getByRole('link', { name: /update payment method/i })).toHaveAttribute(
        'href', /\/dashboard\/settings\?tab=billing/,
    );

    const graceUntil = await banner.getAttribute('data-grace-until');
    expect(Number.isFinite(Date.parse(graceUntil))).toBe(true);

    // INV-5, proven at the API: the server still considers this paying user
    // entitled during their recovery window.
    const check = await readEntitlement(page);
    expect(check.status).toBe(200);
    expect(check.body.status).toBe('true');
    expect(check.body.paymentStatus).toBe('PAST_DUE');
    // The banner and the entitlement gate read the SAME authoritative column.
    expect(Date.parse(check.body.paymentGraceUntil)).toBe(Date.parse(graceUntil));

    expect(failures).toEqual([]);
});

test('AC-4: an expired grace window removes the banner and revokes entitlement', async ({ page }) => {
    const failures = [];
    trackFailures(page, failures);
    await signIn(page);
    // A deadline already in the past: the recovery window has closed.
    await setPastDue({ graceHours: -1 });

    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('payment-grace-banner')).toHaveCount(0);

    // And the server agrees: outside grace, no entitlement.
    const check = await readEntitlement(page);
    expect(check.status).toBe(200);
    expect(check.body.status).toBe('false');

    expect(failures).toEqual([]);
});

test('AC-4: a healthy candidate is never shown the recovery banner', async ({ page }) => {
    const failures = [];
    trackFailures(page, failures);
    await signIn(page);
    await restoreHealthyState();

    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    // Give the banner's profile fetch time to resolve before asserting absence,
    // otherwise this would pass merely because the fetch had not landed yet.
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('payment-grace-banner')).toHaveCount(0);

    expect(failures).toEqual([]);
});

test('AC-4: the recovery banner meets WCAG 2.1 AA (axe, no violations)', async ({ page }) => {
    const failures = [];
    trackFailures(page, failures);
    await signIn(page);
    await setPastDue({ graceHours: 48 });
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('payment-grace-banner')).toBeVisible();

    const { default: AxeBuilder } = await import('@axe-core/playwright');
    const results = await new AxeBuilder({ page })
        .include('[data-testid="payment-grace-banner"]')
        .analyze();
    expect(results.violations).toEqual([]);

    expect(failures).toEqual([]);
});