// @ts-check
/**
 * DIR-014 - AI Cover Letter Builder & Multi-Format Generator, live-stack proof.
 *
 * AC-1/AC-2/AC-3 evidence:
 *   Stage 1  every `--cuba-*` token the new cl-* layer consumes actually
 *            RESOLVES in the live document. An unloaded token silently falls
 *            back to nothing, which is exactly how "it compiled but looks
 *            unstyled" defects survive a code review - so this is read back
 *            through getComputedStyle rather than asserted from source.
 *   Stage 2  the shell gate is real: mounted inside CubaCandidateShell the
 *            duplicate logo + "Back to Dashboard" chrome is gone; mounted
 *            standalone on /coverletter it is present.
 *   Stage 3  dark mode genuinely re-resolves the layer, and the ATS tier
 *            meter reports a live, tier-correct score with working
 *            1-click keyword chips.
 *   Stage 4  INV-1 frozen baseline is byte-identical and no legacy Tailwind
 *            palette utility survives in the two in-scope sources.
 *
 * Following the DIR-012/DIR-013 convention this suite NEVER intercepts,
 * mocks or fulfills an /api/* route: everything the browser sees comes from
 * the live backend on :8080 and its authoritative MariaDB.
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import dotenv from 'dotenv';
import { mintFirebaseSession } from './dir006-session.mjs';

dotenv.config({ path: path.join(process.cwd(), '.env'), quiet: true });
dotenv.config({ path: path.join(process.cwd(), 'backend', '.env'), quiet: true });

const WEB_ORIGIN = process.env.DIR014_WEB_ORIGIN || 'http://localhost:3000';
const IDENTITY_EMAIL = process.env.DIR014_EMAIL
    || process.env.ADMIN_EMAIL
    || process.env.DIR006_EMAIL;

/**
 * Mints the live identity, retrying the transient Google auth failure that
 * DIR-013 already documented (`failed to fetch a valid Google OAuth2 access
 * token` is an upstream transport error, not a credential or product fault).
 * Every failure is rethrown so a genuinely broken identity config still
 * fails loudly.
 */
async function mintIdentityWithRetry(attempts = 4) {
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            const session = await mintFirebaseSession({ email: IDENTITY_EMAIL });
            if (session) return session;
            return null; // missing credentials: retrying cannot fix it
        } catch (error) {
            lastError = error;
            const transient = /OAuth2 access token|fetch failed|ETIMEDOUT|ECONNRESET|getaddrinfo/i
                .test(String(error?.message || error));
            if (!transient || attempt === attempts) break;
            const backoffMs = attempt * 5_000;
            console.warn(
                `[dir014] transient identity mint failure (attempt ${attempt}/${attempts}), `
                + `retrying in ${backoffMs}ms: ${error?.message || error}`,
            );
            await new Promise((resolve) => { setTimeout(resolve, backoffMs); });
        }
    }
    throw lastError;
}

const SESSION = IDENTITY_EMAIL ? await mintIdentityWithRetry() : null;

async function signIn(page) {
    if (!SESSION) throw new Error(
        'DIR014 requires a live Firebase identity. Set DIR014_EMAIL (or ADMIN_EMAIL).',
    );
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
 * Reads a custom property off :root and fails when it is missing or still
 * holding an unresolved var() reference. This is the check that distinguishes
 * "the token exists in the stylesheet" from "the token actually resolved".
 */
async function readRootToken(page, token) {
    return page.evaluate((name) => {
        const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        return { name, value: raw, resolved: Boolean(raw) && !raw.startsWith('var(') };
    }, token);
}

/** Every token the new cl-* SCSS layer consumes, grouped by role. */
const TOKEN_GROUPS = {
    surface: ['--cuba-canvas', '--cuba-card', '--cuba-elevated'],
    line: ['--cuba-line', '--cuba-line-strong'],
    ink: ['--cuba-ink', '--cuba-ink-muted', '--cuba-ink-subtle', '--cuba-ink-inverse'],
    brand: [
        '--cuba-primary', '--cuba-primary-fill', '--cuba-primary-ink',
        '--cuba-primary-ink-strong', '--cuba-primary-soft', '--cuba-primary-soft-hover',
        '--cuba-primary-ring', '--cuba-primary-gradient', '--cuba-on-primary', '--cuba-primary-strong',
    ],
    status: [
        '--cuba-success', '--cuba-success-soft', '--cuba-warning', '--cuba-warning-soft',
        '--cuba-danger', '--cuba-danger-soft', '--cuba-info', '--cuba-info-soft',
    ],
    shape: [
        '--cuba-radius-sm', '--cuba-radius-md', '--cuba-radius-lg', '--cuba-radius-xl',
        '--cuba-shadow-sm', '--cuba-shadow-md', '--cuba-shadow-lg', '--cuba-ease',
        '--cuba-z-modal', '--cuba-z-popover',
    ],
    glass: [
        '--cuba-glass-bg', '--cuba-glass-bg-strong',
        '--cuba-dark-glass-bg', '--cuba-dark-glass-bg-strong',
    ],
};

const ALL_TOKENS = Object.values(TOKEN_GROUPS).flat();

test.describe('DIR-014 AI Cover Letter Builder - live stack', () => {
    test('AC-1: every cl-* token resolves in the live document (light + dark)', async ({ page }) => {
        await signIn(page);
        await page.goto(`${WEB_ORIGIN}/coverletter`, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('.cover-letter')).toBeVisible({ timeout: 60_000 });

        const unresolved = [];
        for (const [group, tokens] of Object.entries(TOKEN_GROUPS)) {
            for (const token of tokens) {
                const light = await readRootToken(page, token);
                if (!light.resolved) unresolved.push(`${group}/${token} light="${light.value}"`);
            }
        }
        expect(unresolved, `unresolved tokens (light): ${unresolved.join(', ')}`).toEqual([]);

        // Dark mode must genuinely re-publish the layer rather than merely
        // leaving the light values in place: --cuba-card is required to
        // actually change value when the theme flips.
        const lightCard = (await readRootToken(page, '--cuba-card')).value;
        const lightInk = (await readRootToken(page, '--cuba-ink')).value;
        await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
        await page.waitForTimeout(400);
        const darkCard = (await readRootToken(page, '--cuba-card')).value;
        const darkInk = (await readRootToken(page, '--cuba-ink')).value;

        expect(darkCard, `--cuba-card must differ in dark (light=${lightCard})`).not.toBe(lightCard);
        expect(darkInk, `--cuba-ink must differ in dark (light=${lightInk})`).not.toBe(lightInk);

        const darkUnresolved = [];
        for (const token of ALL_TOKENS) {
            const dark = await readRootToken(page, token);
            if (!dark.resolved) darkUnresolved.push(`${token} dark="${dark.value}"`);
        }
        expect(darkUnresolved, `unresolved tokens (dark): ${darkUnresolved.join(', ')}`).toEqual([]);
    });

    test('AC-5: ATS tier boundaries and score floor are pinned deterministically', () => {
        // The tier meter, the numeric readout and the chip colours are all
        // driven by ONE helper. If the live tenant has ATS administratively
        // OFF, the browser stage above legitimately exercises the fail-closed
        // branch instead - so the band arithmetic is pinned here against the
        // shipped source, independent of tenant configuration. This is a real
        // execution of the shipped function, not a regex over the file.
        const source = fs.readFileSync('src/components/CoverLetter/CoverLetter.jsx', 'utf8');

        const tierSrc = source.match(/const atsTier = \(score\) => \{[\s\S]*?\n\};/);
        expect(tierSrc, 'atsTier helper must exist as the single tiering source').not.toBeNull();
         
        const atsTier = new Function(`${tierSrc[0]}; return atsTier;`)();

        // AC-5 bands: >= 80 strong, 60-79 warning, < 60 critical.
        expect(atsTier(100)).toBe('success');
        expect(atsTier(80)).toBe('success');
        expect(atsTier(79)).toBe('warning');
        expect(atsTier(60)).toBe('warning');
        expect(atsTier(59)).toBe('danger');
        expect(atsTier(0)).toBe('danger');

        // calculateAtsMetrics must clamp to [30,100] so a meter can never
        // render a nonsensical width, and must never invent a score with no
        // job description to compare against.
        const metricsSrc = source.match(/calculateAtsMetrics = \(letterBody, jobDesc\) => \{[\s\S]*?\n {4}\};/);
        expect(metricsSrc, 'calculateAtsMetrics must exist').not.toBeNull();
        expect(metricsSrc[0]).toMatch(/Math\.min\(100,\s*Math\.max\(30,/);

         
        const calculateAtsMetrics = new Function(
            `${metricsSrc[0]}; return calculateAtsMetrics;`,
        )();
        expect(calculateAtsMetrics('body', ''), 'no JD => no score').toBeNull();
        expect(calculateAtsMetrics('body', '   '), 'blank JD => no score').toBeNull();
        expect(calculateAtsMetrics('body', 'the and for'), 'stopwords only => no score').toBeNull();

        const jd = 'React TypeScript GraphQL Kubernetes microservices observability delivery';
        const full = calculateAtsMetrics(`I use React TypeScript GraphQL Kubernetes microservices observability delivery daily.`, jd);
        expect(full.score, 'a letter covering every keyword scores 100').toBe(100);
        expect(full.missing).toEqual([]);

        const none = calculateAtsMetrics('I enjoy long walks and gardening.', jd);
        expect(none.matched).toEqual([]);
        expect(none.score, 'zero matches clamps up to the 30 floor').toBe(30);
    });

    test('AC-2: header de-duplication is real in both mount contexts', async ({ page }) => {
        await signIn(page);

        // Standalone: the builder owns the chrome, so the logo and the
        // dashboard link MUST be rendered.
        await page.goto(`${WEB_ORIGIN}/coverletter`, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('.cl-header')).toBeVisible({ timeout: 60_000 });
        await expect(page.locator('.cl-header__logo')).toHaveCount(1);
        await expect(page.locator('.cl-header a[href="/dashboard"]')).toHaveCount(1);

        // Embedded in CubaCandidateShell: the shell already renders that
        // chrome, so repeating it is the defect this directive removes.
        await page.goto(`${WEB_ORIGIN}/dashboard/cover-letters`, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('.cover-letter .cl-header')).toBeVisible({ timeout: 60_000 });
        await expect(
            page.locator('.cover-letter .cl-header__logo'),
            'logo must be suppressed inside the candidate shell',
        ).toHaveCount(0);
        await expect(
            page.locator('.cover-letter .cl-header a[href="/dashboard"]'),
            '"Back to Dashboard" must be suppressed inside the candidate shell',
        ).toHaveCount(0);

        // The workspace identity itself must survive de-duplication.
        await expect(page.locator('.cover-letter .cl-header__title')).toContainText('Cover Letter Builder');
    });

    test('AC-3/AC-5: M3 stepper, ATS tier meter and 1-click keyword chips work', async ({ page }) => {
        await signIn(page);
        await page.goto(`${WEB_ORIGIN}/coverletter`, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('.cl-stepper')).toBeVisible({ timeout: 60_000 });

        // Stepper: exactly one step is aria-current at a time.
        const steps = page.locator('.cl-step');
        await expect(steps).toHaveCount(3);
        await expect(page.locator('.cl-step[aria-current="step"]')).toHaveCount(1);
        await steps.nth(2).click();
        await expect(page.locator('.cl-step[aria-current="step"]')).toContainText('Export & Share Package');

        // Back to step 1 and feed the matcher a real job description so the
        // score is computed from genuine input rather than asserted.
        await steps.nth(0).click();
        const atsToggle = page.locator('.cl-ats__toggle');

        // BRANCH IS RECORDED, NOT ASSUMED. enableAtsScoreModule is an
        // administrative setting, so the live tenant may legitimately have
        // ATS off; a suite that silently took the easier branch would still
        // report green while proving nothing about the tier meter. The tier
        // LOGIC is therefore additionally pinned by a deterministic test
        // below that exercises atsTier() directly, independent of tenant
        // configuration.
        const atsEnabled = await atsToggle.count() > 0;
        console.log(`[dir014] ATS branch exercised: ${atsEnabled ? 'ENABLED' : 'DISABLED (fail-closed)'}`);

        if (atsEnabled) {
            await atsToggle.click();
            await page.locator('#cl-jobdesc').fill(
                'Senior Software Engineer with React, TypeScript, GraphQL, Kubernetes, '
                + 'observability, and microservices delivery experience. You will mentor '
                + 'engineers, own CI/CD, and partner on architecture.',
            );
            // The letter body drives the "matched" side of the score.
            await steps.nth(1).click();
            await page.locator('.cl-segmented__btn', { hasText: 'Text Editor' }).click();
            await page.locator('#cl-letterbody').fill(
                'I build React and TypeScript applications, ship GraphQL services on '
                + 'Kubernetes, and mentor engineers on microservices delivery.',
            );
            await steps.nth(0).click();

            const meter = page.locator('.cl-ats__track[role="meter"]');
            await expect(meter).toBeVisible({ timeout: 30_000 });

            const score = Number(await meter.getAttribute('aria-valuenow'));
            expect(Number.isFinite(score), 'ATS meter must expose a numeric score').toBe(true);
            expect(score).toBeGreaterThanOrEqual(0);
            expect(score).toBeLessThanOrEqual(100);

            // Tier colour must agree with the score band (>=80 success,
            // 60-79 warning, <60 danger) - one helper drives both.
            const fillClass = await page.locator('.cl-ats__fill').getAttribute('class');
            if (score >= 80) expect(fillClass).not.toContain('cl-ats__fill--');
            else if (score >= 60) expect(fillClass).toContain('cl-ats__fill--warning');
            else expect(fillClass).toContain('cl-ats__fill--danger');

            // Matched chips are inert; missed chips are real buttons that copy.
            await expect(page.locator('.cl-chip--matched').first()).toBeVisible();
            const missed = page.locator('.cl-chip--missing');
            expect(await missed.count(), 'a real JD against a partial letter yields missed keywords').toBeGreaterThan(0);
            await missed.first().click();
            await expect(page.locator('.cl-toast')).toContainText('Copied');
        } else {
            // ATS module is administratively OFF: the fail-closed branch must
            // still render the optional JD field and must NOT show a score.
            await expect(page.locator('#cl-jobdesc-plain')).toBeVisible();
            await expect(page.locator('.cl-ats__score')).toHaveCount(0);
        }
    });

    test('AC-4: preview modal opens, zooms through the ladder and closes on Escape', async ({ page }) => {
        await signIn(page);
        await page.goto(`${WEB_ORIGIN}/coverletter`, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('.cl-stepper')).toBeVisible({ timeout: 60_000 });

        await page.locator('.cl-step').nth(1).click();
        await page.getByRole('button', { name: 'Open Fullscreen Modal' }).click();

        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        await expect(dialog).toHaveAttribute('aria-modal', 'true');
        // The modal must actually mount the A4 paper through TemplateRenderer.
        await expect(dialog.locator('.cl-paper')).toBeVisible();

        const readout = dialog.locator('.cl-zoom__value');
        await expect(readout).toBeVisible();
        const start = Number((await readout.innerText()).replace('%', '').trim());
        expect(Number.isFinite(start)).toBe(true);

        await dialog.getByRole('button', { name: 'Zoom in' }).click();
        const zoomed = Number((await readout.innerText()).replace('%', '').trim());
        expect(zoomed, 'zoom-in must increase the scale').toBeGreaterThan(start);

        // Escape must dismiss the dialog (WCAG keyboard requirement).
        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
    });

    test('AC-4/AC-9: INV-1 frozen baseline intact and no legacy palette utility remains', async () => {
        const git = (args) => execFileSync('git', args, { cwd: process.cwd(), encoding: 'utf8' });
        const diffStat = (paths) => git(['--no-pager', 'diff', '--stat', 'e314f715', '--', ...paths]).trim();

        // INV-1: the frozen CV templates and AI runtime must be byte-identical.
        expect(diffStat(['src/cv-templates']), 'CV templates frozen').toBe('');
        expect(diffStat(['backend/services/aiRuntime.js']), 'AI runtime frozen').toBe('');

        // AC-1/AC-9: the in-scope JSX carries no legacy Tailwind palette
        // utility, and the new SCSS layer carries no raw hex.
        const jsx = fs.readFileSync('src/components/CoverLetter/CoverLetter.jsx', 'utf8');
        const legacy = jsx.match(/\b(?:bg|text|border|from|to|ring)-(?:slate|indigo|emerald|amber|rose|red|blue|sky|green|orange|purple|gray|zinc|neutral|stone)-\d+/g);
        expect(legacy, `legacy palette utilities remain: ${[...new Set(legacy || [])].join(', ')}`).toBeNull();

        const scss = fs.readFileSync('src/components/CoverLetter/CoverLetter.scss', 'utf8');
        const legacyMarker = scss.indexOf('LEGACY PRE-DIR-014 RULES');
        expect(legacyMarker, 'the preserved legacy block must still be labelled').toBeGreaterThan(-1);
        const modernLayer = scss.slice(0, legacyMarker);
        const rawHex = modernLayer.match(/#[0-9a-fA-F]{3,8}\b/g);
        expect(rawHex, `raw hex in the new layer: ${[...new Set(rawHex || [])].join(', ')}`).toBeNull();
    });
});