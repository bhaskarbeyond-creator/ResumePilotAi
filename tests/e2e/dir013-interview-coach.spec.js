// @ts-check
/**
 * DIR-013 — AI Interview Coach & Audio/Voice CBT Simulator, live-stack proof.
 *
 * AC-1/AC-2/AC-3/AC-6/AC-7 evidence for the narrowed scope:
 *   Stage 1  the studio renders and every --cuba-* token the waveform needs
 *            actually RESOLVES in the live document (a canvas reads these
 *            through getComputedStyle, so an unloaded token would silently
 *            stop the wave from painting at all).
 *   Stage 2  the waveform canvas is genuinely painting, in a real CBT state,
 *            rather than having thrown inside its effect.
 *   Stage 3  the frozen baseline is byte-identical and the interview sources
 *            contain no literal colour values.
 *
 * Following the DIR-012 convention this suite NEVER intercepts, mocks or
 * fulfills an /api/* route: everything the browser sees comes from the live
 * backend on :8080 and its authoritative MariaDB.
 */
import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import dotenv from 'dotenv';
import { mintFirebaseSession } from './dir006-session.mjs';

dotenv.config({ path: path.join(process.cwd(), '.env'), quiet: true });
dotenv.config({ path: path.join(process.cwd(), 'backend', '.env'), quiet: true });

const WEB_ORIGIN = process.env.DIR013_WEB_ORIGIN || 'http://localhost:3000';
// Used only for the direct authoritative read that proves the cleanup worked.
// Browser traffic still flows through the Vite proxy exactly as the app does.
const API_ORIGIN = process.env.DIR013_API_ORIGIN || 'http://localhost:8080';
// Same identity resolution as the certified DIR-012 suite: a real, existing
// Firebase Auth user, never a fabricated one.
const IDENTITY_EMAIL = process.env.DIR013_EMAIL
    || process.env.ADMIN_EMAIL
    || process.env.DIR006_EMAIL;

/**
 * Mints the live identity, retrying the transient Google auth failure.
 *
 * `mintFirebaseSession` reaches two external Google endpoints (the OAuth2 token
 * endpoint via the Admin SDK's service-account exchange, then Identity Toolkit).
 * Both intermittently answer
 *   `failed to fetch a valid Google OAuth2 access token ... reason: ""`
 * which is an upstream transport error, NOT an invalid credential and NOT a
 * product defect. Because the helper is shared with the certified DIR-006 and
 * DIR-012 suites it is left untouched; the resilience is added here instead, so
 * a transient network blip cannot be misreported as a DIR-013 regression.
 *
 * If every attempt fails the error is rethrown, so a genuinely broken identity
 * configuration still fails loudly rather than being masked.
 */
async function mintIdentityWithRetry(attempts = 4) {
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            const session = await mintFirebaseSession({ email: IDENTITY_EMAIL });
            if (session) return session;
            // A null result means credentials are absent, which retrying cannot
            // fix — surface it immediately instead of burning the budget.
            return null;
        } catch (error) {
            lastError = error;
            const transient = /OAuth2 access token|fetch failed|ETIMEDOUT|ECONNRESET|getaddrinfo/i
                .test(String(error?.message || error));
            if (!transient || attempt === attempts) break;
            const backoffMs = attempt * 5_000;
            console.warn(
                `[dir013] transient identity mint failure (attempt ${attempt}/${attempts}), `
                + `retrying in ${backoffMs}ms: ${error?.message || error}`,
            );
            await new Promise((resolve) => { setTimeout(resolve, backoffMs); });
        }
    }
    throw lastError;
}

const SESSION = IDENTITY_EMAIL ? await mintIdentityWithRetry() : null;

/** Every token LiveAudioWaveform's computed-style bridge depends on. */
const WAVE_TOKENS = [
    '--cuba-wave-idle', '--cuba-wave-bar-from', '--cuba-wave-bar-to',
    '--cuba-wave-indigo-1', '--cuba-wave-indigo-2', '--cuba-wave-indigo-3',
];
const STUDIO_TOKENS = [
    '--cuba-studio-from', '--cuba-studio-via', '--cuba-studio-to',
    '--cuba-studio-glow', '--cuba-studio-sheen', '--cuba-studio-scrim',
];

/** Seeds a genuine Firebase session into the browser before any app code runs. */
async function signIn(page) {
    if (!SESSION) throw new Error(
        'DIR013 requires a live Firebase identity. Set DIR013_EMAIL (or ADMIN_EMAIL).',
    );
    await page.addInitScript(({ uid, email, token, refreshToken, apiKey }) => {
        localStorage.setItem(`firebase:authUser:${apiKey}:[DEFAULT]`, JSON.stringify({
            uid, email, emailVerified: true, isAnonymous: false,
            stsTokenManager: { apiKey, refreshToken, accessToken: token, expirationTime: Date.now() + 3600_000 },
            createdAt: String(Date.now()), lastLoginAt: String(Date.now()), apiKey, appName: '[DEFAULT]',
        }));
        localStorage.setItem('user', uid);
        localStorage.setItem('ime365_cuba_shell_v2', 'cuba');
    }, {
        uid: SESSION.uid, email: SESSION.email, token: SESSION.idToken,
        refreshToken: SESSION.refreshToken, apiKey: SESSION.apiKey,
    });
}
test.describe('DIR-013 AI Interview Coach — live stack', () => {
    test('AC-1/AC-2: studio + waveform tokens resolve and the canvas paints', async ({ page }) => {
        const defects = [];
        await signIn(page);

        // Recorded so Stage 2 can prove the studio it measured was mounted by a
        // GENUINE live-backend session rather than by a client-side shortcut.
        // A canvas that appeared without a 201 on this endpoint would prove
        // nothing, so the assertions below require this record to exist.
        const sessionPosts = [];
        page.on('request', (r) => {
            if (r.method() === 'POST' && r.url().includes('/api/live-interview/sessions')) {
                sessionPosts.push({ startedAt: Date.now(), url: r.url() });
            }
        });
        page.on('response', async (r) => {
            const req = r.request();
            if (req.method() !== 'POST' || !r.url().includes('/api/live-interview/sessions')) return;
            const rec = sessionPosts.find((p) => !p.status);
            if (!rec) return;
            rec.status = r.status();
            rec.finishedAt = Date.now();
            rec.durationMs = rec.finishedAt - rec.startedAt;
            // Reading the body is what makes this an authenticity proof rather
            // than a status-code-only check.
            try { rec.body = await r.json(); } catch { rec.body = null; }
        });

        const abandons = [];
        page.on('response', (r) => {
            const req = r.request();
            if (req.method() !== 'DELETE') return;
            if (!r.url().includes('/api/live-interview/sessions/')) return;
            abandons.push({ status: r.status(), url: r.url() });
        });

        page.on('console', (m) => { if (m.type() === 'error') defects.push(`console: ${m.text()}`); });
        page.on('pageerror', (e) => defects.push(`pageerror: ${e.message}`));
        page.on('response', (r) => {
            if (r.url().includes('/api/') && r.status() >= 400) {
                defects.push(`api ${r.status()}: ${r.url()}`);
            }
        });

        await page.goto(`${WEB_ORIGIN}/dashboard/interview`, { waitUntil: 'domcontentloaded' });

        // ---- Stage 1: every token the canvas bridge needs must RESOLVE.
        // An unresolved token makes resolveWavePalette() return null, which
        // renders an invisible waveform rather than an error, so this is the
        // assertion that actually protects the visual.
        const tokens = await page.evaluate(({ wave, studio }) => {
            const cs = getComputedStyle(document.documentElement);
            const read = (n) => cs.getPropertyValue(n).trim();
            return {
                wave: Object.fromEntries(wave.map((n) => [n, read(n)])),
                studio: Object.fromEntries(studio.map((n) => [n, read(n)])),
            };
        }, { wave: WAVE_TOKENS, studio: STUDIO_TOKENS });

        for (const [name, value] of Object.entries({ ...tokens.wave, ...tokens.studio })) {
            expect(value, `${name} must resolve to a real colour`).not.toBe('');
        }
        // The canvas bridge only accepts a fully-resolved palette.
        expect(tokens.wave['--cuba-wave-bar-to']).toMatch(/^#[0-9a-fA-F]{6}$/);
        expect(tokens.wave['--cuba-wave-idle']).toMatch(/^#[0-9a-fA-F]{6}$/);

        // ---- Stage 2: the canvas actually paints inside a REAL session.
        // DashboardInterviews only mounts <LiveInterviewSession> once
        // `liveSession` is truthy, so the studio (and therefore the canvas)
        // genuinely does not exist until a live session is opened. Drive the
        // real controls: pick Live Face-to-Face, set an occupation, start.
        // Nothing is mocked, injected or fulfilled — the session is created by
        // the live backend and its authoritative MariaDB.
        //
        // BUDGET (re-derived from measurement, DIR-013 rerun): opening a live
        // session is a genuine first-turn inference. Measured against the live
        // backend at 36s and 55s, and the client itself allows the provider
        // 120s (`timeoutMs: 120_000` in DashboardInterviews.startLiveInterview).
        // So the canvas can legitimately appear as late as ~120s + render. This
        // wait is 150s to cover the client's own ceiling, and the enclosing test
        // timeout must therefore exceed 150s PLUS the ~50s the earlier steps
        // (goto, token census, two role/occupation clicks) already consume. The
        // previous 180s test budget could not satisfy that, so the suite failed
        // on its own arithmetic rather than on any product defect.
        const liveMode = page.getByRole('button', { name: /Live Face-to-Face/i }).first();
        await expect(liveMode, 'live face-to-face mode is unavailable')
            .toBeVisible({ timeout: 30_000 });
        await liveMode.click();

        const occupation = page.getByRole('button', { name: 'Frontend Developer', exact: true }).first();
        await expect(occupation, 'no occupation quick-pick was offered')
            .toBeVisible({ timeout: 30_000 });
        await occupation.click();

        // In live mode the label is "Start live interview" (DashboardInterviews
        // swaps it on `state.mode === 'live'`), so the locator must cover both.
        const startBtn = page.getByRole('button', { name: /Start (live )?interview/i }).first();
        await expect(startBtn, 'start control never enabled').toBeEnabled({ timeout: 30_000 });
        await startBtn.click();

        // Opening a session is a genuine provider round-trip. Measured against
        // the live backend on an idle machine it returns 201 in ~25-37s, but
        // that inference shares the same LM Studio/LM-studio-class provider
        // that the rest of the local stack is using, so under contention it is
        // materially slower. The client itself allows the provider 120s
        // (`timeoutMs: 120_000` in DashboardInterviews.startLiveInterview).
        //
        // BUDGET: Lead-approved 240s. This is 2x the client's own ceiling, so a
        // canvas that has not appeared by then is a genuine defect rather than a
        // slow provider, and the wait stays well inside the 420s test timeout
        // even after goto + token census + the three role/occupation clicks.
        await page.waitForSelector('canvas', { timeout: 240_000 });

        // Resolve the created session from the recorded POST response BEFORE the
        // cleanup, so the authoritative re-read below has the id it needs
        // (`created` itself is only computed further down, after this block).
        const createdSessionId = (() => {
            const rec = sessionPosts.find((p) => p.status === 201);
            return rec?.body?.session?.sessionId || null;
        })();
        expect(createdSessionId, 'live session POST carried no sessionId').toBeTruthy();

        // ---- Canvas proof (AC-2). These MUST run while the studio is still
        // mounted: abandoning the session unmounts <LiveInterviewSession>, so
        // measuring afterwards would always observe zero canvases. Measure
        // first, then clean up.
        const canvases = page.locator('canvas');
        const count = await canvases.count();
        expect(count, 'live studio mounted no canvas').toBeGreaterThan(0);

        const geom = await canvases.first().evaluate((canvas) => ({
            width: canvas.width,
            height: canvas.height,
            boxWidth: canvas.getBoundingClientRect().width,
        }));
        expect(geom.width, 'canvas has no backing store').toBeGreaterThan(0);
        expect(geom.height, 'canvas has no backing store').toBeGreaterThan(0);
        expect(geom.boxWidth, 'canvas is not laid out').toBeGreaterThan(0);

        // No pixels at all means the rAF loop never ran (palette missing,
        // zero-sized box, or a throw inside the effect).
        const nonBlank = await canvases.first().evaluate((canvas) => {
            const ctx = canvas.getContext('2d');
            if (!ctx) return 0;
            const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
            let painted = 0;
            for (let i = 3; i < data.length; i += 4) if (data[i] > 0) painted += 1;
            return painted;
        });
        expect(nonBlank, 'waveform canvas must paint visible pixels').toBeGreaterThan(0);

        // Abandon the session so the proof leaves no orphaned authoritative row.
        //
        // This MUST drive the real control rather than a text guess. The studio's
        // leave control is labelled "Leave interview" (LiveInterviewSession.jsx
        // ~925) and it only OPENS a confirmation dialog; the actual
        // `abandonLiveInterviewSession` call lives behind that dialog's
        // "Leave & discard" confirm button (~1236). The previous version scanned
        // for /discard|end interview|exit/i, which matches neither label, so
        // `discard?.click()` was a silent no-op and every run leaked an
        // `active` row into MariaDB. Both steps are now explicit and the result
        // is asserted below.
        const leaveButton = page.getByRole('button', { name: /leave interview/i }).first();
        await leaveButton.click();
        const confirmLeave = page.getByRole('button', { name: /leave\s*&\s*discard/i }).first();
        await confirmLeave.click({ timeout: 15_000 });

        // The row must actually leave the authoritative store, otherwise this run
        // has polluted it. `abandon` hard-deletes the row
        // (liveInterviewSession.js abandon -> store.remove -> DELETE FROM
        // live_interview_sessions), so the DELETE must have been issued.
        await expect
            .poll(async () => abandons.length, { timeout: 30_000, message: 'the session was never abandoned' })
            .toBeGreaterThan(0);
        expect(abandons[0].status, `abandon returned ${abandons[0].status}`)
            .toBeLessThan(400);
        // GET is the authoritative read, so it must no longer report the row as
        // live. Any non-200 (404/409) satisfies this: the point is that the
        // session is no longer a resumable, authoritative session.
        await expect
            .poll(async () => {
                const res = await page.request.get(`${API_ORIGIN}/api/live-interview/sessions/${createdSessionId}`, {
                    headers: { Authorization: `Bearer ${SESSION.idToken}` },
                });
                return res.status();
            }, { timeout: 30_000, message: 'abandoned session should no longer be readable as active' })
            .not.toBe(200);

        // ---- Authenticity gate (AC-2 / INV-4). The canvas above is only
        // meaningful if a real session was minted by the live backend. Without
        // this the test could pass against a purely client-rendered studio and
        // prove nothing about the product.
        expect(sessionPosts.length, 'no live session was ever requested').toBeGreaterThan(0);
        const created = sessionPosts.find((p) => p.status);
        expect(created, 'live session POST never completed').toBeTruthy();
        expect(created.status, `session POST returned ${created.status}`).toBe(201);
        // The response must carry a server-issued session, not an empty shell.
        expect(created.body?.session?.sessionId, 'session response had no sessionId')
            .toMatch(/^[A-Za-z0-9_-]{16,128}$/);
        // And it must have taken real provider time. A sub-second "inference"
        // means nothing was generated.
        expect(created.durationMs, 'session POST was too fast to be a real inference')
            .toBeGreaterThan(1_000);

        // Surfaced for the Lead: the genuine round-trip cost of this run.
        console.log(
            `[dir013] live session POST ${created.status} in `
            + `${(created.durationMs / 1000).toFixed(1)}s `
            + `sessionId=${created.body?.session?.sessionId}`,
        );

        // ---- Zero defects on the interview route (AC-6).
        expect(defects, `defects: ${defects.join(' | ')}`).toEqual([]);
    });

    test('AC-1: frozen baseline is byte-identical and no raw hex remains', async () => {
        const git = (args) => execFileSync('git', args, { cwd: process.cwd(), encoding: 'utf8' });
        const diffStat = (paths) => git(['--no-pager', 'diff', '--stat', 'e314f715', '--', ...paths]).trim();

        // INV-1: the 51 CV templates must produce git diff = 0.
        expect(diffStat(['src/cv-templates']), 'CV templates frozen').toBe('');
        // Lead ruling: aiRuntime.js is strictly frozen.
        expect(diffStat(['backend/services/aiRuntime.js']), 'aiRuntime frozen').toBe('');

        // The two interview sources must contain no literal colour values.
        for (const rel of [
            'src/components/Dashboard/DashboardInterviews/LiveAudioWaveform.jsx',
            'src/components/Dashboard/DashboardInterviews/LiveInterviewSession.jsx',
        ]) {
            const src = fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
            expect(src, `${rel} must not hard-code colours`).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
            expect(src, `${rel} must consume cuba tokens`).toMatch(/--cuba-/);
        }
    });
});