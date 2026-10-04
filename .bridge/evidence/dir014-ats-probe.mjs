// @ts-check
/**
 * DIR-014 verification probe.
 *
 * The Stage-3 E2E assertion has two legitimate branches (ATS module ON vs
 * administratively OFF). A suite that silently takes the easier branch would
 * still report green while proving nothing about the tier meter, so this
 * probe reports which branch the live stack actually exercised and dumps the
 * concrete numbers behind the assertion.
 *
 * Writes .bridge/evidence/dir014-ats-probe.json.
 */
import { chromium } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';
import { mintFirebaseSession } from '../../tests/e2e/dir006-session.mjs';

dotenv.config({ path: path.join(process.cwd(), '.env'), quiet: true });
dotenv.config({ path: path.join(process.cwd(), 'backend', '.env'), quiet: true });

const WEB_ORIGIN = process.env.DIR014_WEB_ORIGIN || 'http://localhost:3000';
const IDENTITY_EMAIL = process.env.DIR014_EMAIL
    || process.env.ADMIN_EMAIL
    || process.env.DIR006_EMAIL;

const session = await mintFirebaseSession({ email: IDENTITY_EMAIL });
if (!session) throw new Error('DIR014 probe needs a live identity.');

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
const page = await context.newPage();

const consoleErrors = [];
page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });

await page.addInitScript(({ uid, email, token, refreshToken, apiKey }) => {
    localStorage.setItem(`firebase:authUser:${apiKey}:[DEFAULT]`, JSON.stringify({
        uid, email, emailVerified: true, isAnonymous: false,
        stsTokenManager: { apiKey, refreshToken, accessToken: token, expirationTime: Date.now() + 3600_000 },
        createdAt: String(Date.now()), lastLoginAt: String(Date.now()), apiKey, appName: '[DEFAULT]',
    }));
    localStorage.setItem('user', uid);
    localStorage.setItem('ime365_cuba_shell_v2', 'cuba');
}, {
    uid: session.uid, email: session.email, token: session.idToken,
    refreshToken: session.refreshToken, apiKey: session.apiKey,
});

await page.goto(`${WEB_ORIGIN}/coverletter`, { waitUntil: 'domcontentloaded' });
await page.locator('.cl-stepper').waitFor({ timeout: 60_000 });

const report = { branch: null, score: null, tier: null, matched: [], missing: [], consoleErrors };

report.branch = await page.locator('.cl-ats__toggle').count() ? 'ats-enabled' : 'ats-disabled';

if (report.branch === 'ats-enabled') {
    await page.locator('.cl-ats__toggle').click();
    await page.locator('#cl-jobdesc').fill(
        'Senior Software Engineer with React, TypeScript, GraphQL, Kubernetes, '
        + 'observability, and microservices delivery experience. You will mentor '
        + 'engineers, own CI/CD, and partner on architecture.',
    );
    // Partial letter: deliberately omits Kubernetes/observability/CI-CD.
    await page.locator('.cl-step').nth(1).click();
    await page.locator('.cl-segmented__btn', { hasText: 'Text Editor' }).click();
    await page.locator('#cl-letterbody').fill(
        'I build React and TypeScript applications, ship GraphQL services, '
        + 'and mentor engineers on microservices delivery.',
    );
    await page.locator('.cl-step').nth(0).click();

    const meter = page.locator('.cl-ats__track[role="meter"]');
    await meter.waitFor({ timeout: 30_000 });
    report.score = Number(await meter.getAttribute('aria-valuenow'));
    report.tier = (await page.locator('.cl-ats__fill').getAttribute('class')) || '';
    report.matched = await page.locator('.cl-chip--matched').allInnerTexts();
    report.missing = await page.locator('.cl-chip--missing').allInnerTexts();

    // Resolve the ACTUAL rendered colours so the tier claim is measured, not
    // inferred from a class name.
    report.rendered = await page.evaluate(() => {
        const fill = document.querySelector('.cl-ats__fill');
        const score = document.querySelector('.cl-ats__score');
        const track = document.querySelector('.cl-ats__track');
        if (!fill || !score || !track) return null;
        const cs = (el) => getComputedStyle(el);
        return {
            fillBg: cs(fill).backgroundColor,
            scoreColor: cs(score).color,
            scoreBg: cs(score).backgroundColor,
            fillWidthPct: ((fill.getBoundingClientRect().width / track.getBoundingClientRect().width) * 100).toFixed(1),
            scoreText: score.textContent.trim(),
        };
    });
}

report.consoleErrors = consoleErrors;
fs.writeFileSync('.bridge/evidence/dir014-ats-probe.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

await browser.close();