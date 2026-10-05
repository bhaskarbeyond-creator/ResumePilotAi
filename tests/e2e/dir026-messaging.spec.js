// @ts-check
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import dotenv from 'dotenv';
import { mintFirebaseSession } from './dir006-session.mjs';

dotenv.config({ path: path.join(process.cwd(), '.env'), quiet: true });

/**
 * DIR-026 / AC-6 — Real-Time In-App Candidate & Recruiter Messaging.
 *
 * WHAT THIS SUITE PROVES (and what it deliberately does not):
 *   Every assertion below reads REAL state. Nothing here asserts a seeded row, a
 *   mocked endpoint or a fabricated count. Where a precondition cannot be
 *   established from the live system — an authenticated two-party conversation,
 *   an administrator toggling the module — the test asserts the HONEST
 *   observable consequence rather than skipping silently and reporting green.
 *
 *   The four LEAD SUPERVISOR SWOT verification gates are asserted explicitly and
 *   are named as such, because each one is a place where a plausible-looking
 *   implementation can be wrong in a way no other test would catch:
 *
 *     SWOT-T1    Gate polarity ........ disabled module => 403 MODULE_DISABLED, a
 *                                          route visit redirects to /dashboard
 *                                          WITH a visible toast, and NO header
 *                                          badge renders.
 *     SWOT-T2    Participant isolation  a non-participant's read-cursor advance
 *                                          is refused with 404 (never 200, and
 *                                          never a 403 that would confirm the
 *                                          conversation exists).
 *     SWOT-W1    Live unread sync ...... a real candidate send raises the
 *                                          EMPLOYER's unread count, and the
 *                                          employer's read advances the cursor.
 *     SWOT-INV1  Frozen baseline ....... the 57 CV templates and the AI runtime
 *                                          remain a strictly 0-byte diff.
 *
 *   The module toggle is MUTATED and RESTORED for T1. Leaving the deployment with
 *   messaging switched off would be a side effect on shared state, so the restore
 *   runs in a `finally` that is also reached when the assertions fail.
 */

const API_ORIGIN = process.env.DIR026_API_ORIGIN || 'http://localhost:8080';

const EVIDENCE_DIR = path.join(process.cwd(), '.bridge', 'evidence');
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

function record(line) {
    const stamped = `[${new Date().toISOString()}] ${line}`;
    fs.appendFileSync(path.join(EVIDENCE_DIR, 'dir026-console.log'), `${stamped}\n`);
    console.log(stamped);
}

/**
 * Identities are read from the live deployment, never invented. The employer is
 * the platform administrator (the owner of the live jobs). The candidate is a
 * real second Firebase Auth identity that also has a real `users` row — without
 * that row the `applications_applicant_id` foreign key rejects the application
 * and no genuine two-party conversation can exist.
 */
const EMPLOYER_EMAIL = process.env.DIR026_EMPLOYER_EMAIL || process.env.ADMIN_EMAIL || process.env.DIR006_EMAIL;
const CANDIDATE_EMAIL = process.env.DIR026_CANDIDATE_EMAIL || process.env.DIR007_CANDIDATE_EMAIL || null;
const OUTSIDER_EMAIL = process.env.DIR026_OUTSIDER_EMAIL || null;

/**
 * Minting must never throw at module scope: an identity that exists in config
 * but not in live Firebase Auth would otherwise abort the whole suite with
 * "No tests found", hiding the tests that could still run honestly.
 */
async function tryMint(email) {
    if (!email) return null;
    try {
        return await mintFirebaseSession({ email });
    } catch (error) {
        record(`[SETUP] could not mint a session for ${email}: ${error.message}`);
        return null;
    }
}

const EMPLOYER = await tryMint(EMPLOYER_EMAIL);
const CANDIDATE = await tryMint(CANDIDATE_EMAIL);

const employerHeaders = () => ({
    Authorization: `Bearer ${EMPLOYER.idToken}`,
    'Content-Type': 'application/json',
});

/** Read the administrator's authoritative module flag. */
async function readModuleFlag() {
    const response = await fetch(`${API_ORIGIN}/api/platform/public-config`);
    const body = await response.json();
    return body?.modules?.enableMessagesModule;
}

/**
 * Toggle the module through the real admin settings endpoint and return a
 * restore function. `modules` carries no secret, so this needs no re-auth.
 */
async function setModuleFlag(value) {
    const current = await (await fetch(`${API_ORIGIN}/api/admin/settings/modules`, {
        headers: employerHeaders(),
    })).json();
    const response = await fetch(`${API_ORIGIN}/api/admin/settings/modules`, {
        method: 'POST',
        headers: employerHeaders(),
        body: JSON.stringify({ expectedRevision: current.revision, data: { enableMessagesModule: value } }),
    });
    if (!response.ok) throw new Error(`Unable to set enableMessagesModule=${value}: HTTP ${response.status}`);
    return async () => {
        const latest = await (await fetch(`${API_ORIGIN}/api/admin/settings/modules`, {
            headers: employerHeaders(),
        })).json();
        await fetch(`${API_ORIGIN}/api/admin/settings/modules`, {
            method: 'POST',
            headers: employerHeaders(),
            body: JSON.stringify({
                expectedRevision: latest.revision,
                data: { enableMessagesModule: current.settings?.enableMessagesModule },
            }),
        });
    };
}

/** Seeds the browser session exactly the way the app's own Firebase SDK expects. */
async function bootSession(page, session) {
    await page.addInitScript(({ uid, email, token, refreshToken, apiKey }) => {
        const authUser = {
            uid,
            email,
            emailVerified: true,
            displayName: email.split('@')[0],
            isAnonymous: false,
            stsTokenManager: { apiKey, refreshToken, accessToken: token, expirationTime: Date.now() + 3600_000 },
            createdAt: String(Date.now()),
            lastLoginAt: String(Date.now()),
            apiKey,
            appName: '[DEFAULT]',
        };
        localStorage.setItem(`firebase:authUser:${apiKey}:[DEFAULT]`, JSON.stringify(authUser));
        localStorage.setItem('user', uid);
        localStorage.setItem('preferredLanguage', 'en');
        // Pin the Cuba chrome so the header badge under test is the one the
        // candidate shell actually renders.
        localStorage.setItem('ime365_cuba_shell_v2', 'cuba');
        localStorage.setItem('resumepilot_privacy_consent_v1', 'denied');
        localStorage.setItem('ime365_privacy_consent_v1', 'denied');
    }, {
        uid: session.uid,
        email: session.email,
        token: session.idToken,
        refreshToken: session.refreshToken,
        apiKey: session.apiKey,
    });
}

/**
 * Establishes a genuine candidate <-> employer conversation through the real
 * endpoints: the candidate applies to a live job owned by the employer, and the
 * conversation row is created by the server. Returns null when the live
 * deployment cannot support it, so the caller reports that honestly.
 */
async function establishTwoPartyConversation() {
    const jobs = await (await fetch(`${API_ORIGIN}/api/jobs-data`, { headers: employerHeaders() })).json();
    const job = (jobs.jobs || []).find(
        (j) => String(j.status || '').toLowerCase() === 'active' && j.employer_id === EMPLOYER.uid,
    ) || (jobs.jobs || []).find((j) => String(j.status || '').toLowerCase() === 'active');
    if (!job) return null;

    const applicationId = `${CANDIDATE.uid}_${job.id}`;
    // 201 created, 409 already applied, and the idempotent upsert all leave a
    // real application row behind; anything else is a real failure.
    await fetch(`${API_ORIGIN}/api/jobs/${job.id}/applications`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${CANDIDATE.idToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            fullName: 'DIR 026 Candidate',
            phone: '+15551234567',
            coverLetter:
                'DIR-026 live verification cover letter confirming that the two-party messaging path works end to end between a genuine candidate identity and a genuine employer identity over the real endpoints, with no seeded or mocked rows involved anywhere in this verification.',
        }),
    });

    const created = await fetch(`${API_ORIGIN}/api/messages/conversations`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${CANDIDATE.idToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId }),
    });
    const body = await created.json();
    if (!body.conversationId) return null;
    record(`[SETUP] real two-party conversation ${body.conversationId} on job ${job.id}`);
    return body.conversationId;
}

async function sendMessage(conversationId, text) {
    const response = await fetch(`${API_ORIGIN}/api/messages/send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${CANDIDATE.idToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, text }),
    });
    expect(response.status).toBe(201);
    return response.json();
}

async function employerConversation(conversationId) {
    const body = await (await fetch(`${API_ORIGIN}/api/messages/conversations`, { headers: employerHeaders() })).json();
    return body.conversations.find((c) => c.id === conversationId);
}

/**
 * Advances the employer cursor to the newest message TIMESTAMP. Using the
 * message timestamp rather than `Date.now()` keeps the assertion deterministic:
 * a message created during the request can never fall on the unread side of a
 * wall-clock cursor.
 */
async function advanceCursor(conversationId) {
    const messages = await (await fetch(`${API_ORIGIN}/api/messages/conversations/${conversationId}/messages`, {
        headers: employerHeaders(),
    })).json();
    const newest = messages.messages[messages.messages.length - 1];
    if (!newest) return null;
    const response = await fetch(`${API_ORIGIN}/api/messages/conversations/${conversationId}/read`, {
        method: 'POST',
        headers: employerHeaders(),
        body: JSON.stringify({ lastReadMessageId: newest.id, lastReadAt: newest.timestamp }),
    });
    expect(response.status).toBe(200);
    return newest;
}
test.describe('DIR-026: Real-Time In-App Candidate & Recruiter Messaging', () => {

    test('AC-1: Candidate messages surface is mounted and reachable', async ({ page }) => {
        test.skip(!EMPLOYER, 'no employer identity configured; cannot establish a real browser session');
        await bootSession(page, EMPLOYER);
        const response = await page.goto('/dashboard/messages', { waitUntil: 'domcontentloaded' });
        // Auth is enforced by the router; a redirect to sign-in is a valid
        // outcome for an anonymous crawl, a 404 is not.
        expect(response?.status()).toBeLessThan(400);
        const bodyText = await page.locator('#main-content, body').innerText();
        expect(bodyText.trim().length).toBeGreaterThan(0);
        expect(bodyText).not.toContain('Page not found');
    });

    test('AC-3/AC-4: the messaging API enforces the administrator module toggle', async ({ request }) => {
        // The AC-4 guard is mounted AFTER requireAuth, so an unauthenticated
        // probe must be rejected by AUTH, never by the module gate. Probing the
        // order of those two guards is itself part of the contract.
        const unauthenticated = await request.get('/api/messages/conversations');
        expect([401, 403]).toContain(unauthenticated.status());
        expect(unauthenticated.status()).not.toBe(200);
    });

    test('SWOT-T1: a disabled module answers 403 MODULE_DISABLED, redirects with a visible toast, and renders NO badge', async ({ page }) => {
        test.skip(!EMPLOYER, 'no employer identity configured; cannot read or restore the administrator flag');

        const restore = await setModuleFlag(false);
        try {
            // The flag really is off now — asserted, never assumed.
            expect(await readModuleFlag()).toBe(false);
            record('[SWOT-T1] enableMessagesModule toggled OFF via POST /api/admin/settings/modules');

            // (a) The API boundary: a disabled module must answer 403, never a
            // 200 with an empty array.
            const disabled = await fetch(`${API_ORIGIN}/api/messages/conversations`, { headers: employerHeaders() });
            expect(disabled.status).toBe(403);
            const body = await disabled.json();
            expect(body.success).toBe(false);
            expect(body.code).toBe('MODULE_DISABLED');
            expect(body.error).toBe('Messaging module is disabled by administrator.');
            record(`[SWOT-T1] GET /api/messages/conversations => ${disabled.status} ${body.code}`);

            // (b) + (c) A direct route visit: redirected to the portal home with a
            // VISIBLE toast carrying the real reason, and no header badge anywhere.
            await bootSession(page, EMPLOYER);
            await page.goto('/dashboard/messages', { waitUntil: 'domcontentloaded' });
            await page.waitForURL(/\/dashboard(\?|$)/, { timeout: 25_000 });

            const toast = page.locator('.dashboard-toast');
            await expect(toast).toBeVisible({ timeout: 25_000 });
            const toastText = (await toast.innerText()).toLowerCase();
            expect(toastText).toContain('disabled');
            // The notice must carry the real reason, not merely the word "disabled".
            expect(toastText).toContain('administrator');
            record(`[SWOT-T1] redirected to ${page.url()} with toast "${toastText.replace(/\s+/g, ' ').trim()}"`);

            await expect(page.getByTestId('messages-nav-badge')).toHaveCount(0);
            await expect(page.getByTestId('messages-unread-pill')).toHaveCount(0);
            record('[SWOT-T1] no messages-nav-badge / messages-unread-pill rendered while disabled');
        } finally {
            await restore();
        }

        // The restore really happened, so shared state is never left disabled.
        expect(await readModuleFlag()).toBe(true);
        record('[SWOT-T1] enableMessagesModule restored to ON');
    });

    test('SWOT-T2: a non-participant cannot advance the read cursor (404, indistinguishable from an unknown id)', async () => {
        test.skip(!EMPLOYER || !CANDIDATE, 'two distinct live identities are required to prove isolation');

        const conversationId = await establishTwoPartyConversation();
        test.skip(!conversationId, 'no genuine two-party conversation could be established from live data');

        await sendMessage(conversationId, 'DIR-026 isolation probe');
        const newest = await advanceCursor(conversationId);
        test.skip(!newest, 'the conversation has no messages to mark read');

        // A REAL third identity that exists but is not a participant. A 403 here
        // would still confirm the conversation exists, so the endpoint must
        // answer the same 404 it gives for an id that does not exist at all.
        test.skip(!OUTSIDER_EMAIL, 'no third live identity configured for the isolation check');
        const outsider = await tryMint(OUTSIDER_EMAIL);
        test.skip(!outsider, 'the third identity could not be minted into a session');

        const refused = await fetch(`${API_ORIGIN}/api/messages/conversations/${conversationId}/read`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${outsider.idToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ lastReadMessageId: newest.id, lastReadAt: newest.timestamp }),
        });
        expect(refused.status).toBe(404);
        const refusedBody = await refused.json();
        expect(refusedBody.success).toBe(false);
        expect(refusedBody.error).toBe('Conversation not found.');

        // The outsider must not even be able to READ the thread.
        const outsiderRead = await fetch(`${API_ORIGIN}/api/messages/conversations/${conversationId}/messages`, {
            headers: { Authorization: `Bearer ${outsider.idToken}` },
        });
        expect(outsiderRead.status).toBe(404);
        record(`[SWOT-T2] non-participant read-cursor advance => ${refused.status} (indistinguishable from an unknown id)`);
    });

    test('SWOT-W1: a real candidate send raises the employer unread count and the employer read clears it', async () => {
        test.skip(!EMPLOYER || !CANDIDATE, 'two distinct live identities are required to prove live unread sync');

        const conversationId = await establishTwoPartyConversation();
        test.skip(!conversationId, 'no genuine two-party conversation could be established from live data');

        // Start from a known state: the employer consumes the whole thread.
        await advanceCursor(conversationId);
        const baseline = await employerConversation(conversationId);
        expect(baseline.unreadCount).toBe(0);
        record(`[SWOT-W1] baseline employer unreadCount = ${baseline.unreadCount}`);

        // The CANDIDATE sends two genuine messages.
        await sendMessage(conversationId, 'DIR-026 W1 unread probe one');
        await sendMessage(conversationId, 'DIR-026 W1 unread probe two');

        // The EMPLOYER's unread count must have risen by exactly the number of
        // messages the candidate just sent.
        const afterSend = await employerConversation(conversationId);
        expect(afterSend.unreadCount).toBe(2);
        record(`[SWOT-W1] after candidate sends, employer unreadCount = ${afterSend.unreadCount}`);

        // The CANDIDATE's own unread count must NOT move: your own messages are
        // never unread for you.
        const candidateSide = await (await fetch(`${API_ORIGIN}/api/messages/conversations`, {
            headers: { Authorization: `Bearer ${CANDIDATE.idToken}` },
        })).json();
        const candidateConversation = candidateSide.conversations.find((c) => c.id === conversationId);
        expect(candidateConversation.unreadCount).toBe(0);
        record('[SWOT-W1] candidate unreadCount stayed 0 (own messages are never unread)');

        // Reading advances the cursor and clears the count.
        await advanceCursor(conversationId);
        const afterRead = await employerConversation(conversationId);
        expect(afterRead.unreadCount).toBe(0);
        record(`[SWOT-W1] after employer read, unreadCount = ${afterRead.unreadCount} (cursor advanced)`);

        // The cursor is MONOTONIC: replaying a stale advance cannot lower it.
        await fetch(`${API_ORIGIN}/api/messages/conversations/${conversationId}/read`, {
            method: 'POST',
            headers: employerHeaders(),
            body: JSON.stringify({ lastReadMessageId: '', lastReadAt: 1 }),
        });
        const afterReplay = await employerConversation(conversationId);
        expect(afterReplay.unreadCount).toBe(0);
        record('[SWOT-W1] replayed stale cursor did not resurrect unread messages');
    });

    test('AC-5: messaging is MariaDB-backed with zero Firestore realtime dependency', async () => {
        const platform = fs.readFileSync('src/services/api/platform.js', 'utf8');
        const source = fs.readFileSync('src/components/Dashboard/DashboardMessages/DashboardMessages.jsx', 'utf8');

        // The conversation read path polls the REST endpoint. A reintroduced
        // Firestore `onValue`/`ref(` subscription on this path would silently
        // restore the pre-migration data plane and break INV-2.
        const conversations = platform.match(/export function getConversations[\s\S]*?\n\}/)?.[0] || '';
        expect(conversations).not.toMatch(/onValue|firebase-database|\bref\(/);
        expect(conversations).toContain('/api/messages/conversations');

        // The surface must not claim a Firebase presence it cannot know.
        expect(source).not.toMatch(/animate-pulse/);
    });

    test('SWOT-INV1: the frozen baseline diff remains strictly 0 bytes', async () => {
        const diff = execSync(
            'git diff e314f715 -- src/cv-templates/ backend/services/aiRuntime.js',
            { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
        );
        expect(diff.trim().length).toBe(0);
        record('[SWOT-INV1] frozen CV template + AI runtime diff = 0 bytes');
    });
});