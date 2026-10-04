// @ts-check
/**
 * DIR-014 public-config lineage probe (Step 6 root-cause).
 *
 * MariaDB stores enableAtsScoreModule=true, yet the live UI renders the
 * fail-closed ATS branch. getSystemSettings() only reaches a `remote` verdict
 * when fetchPublicConfig() returns a payload whose _settingsSource matches
 * /^mariadb($|-)/ (hasAuthoritativeMariaDbSettings). This probe captures the
 * REAL network response, its status, and the derived verdict so the break in
 * the lineage is measured rather than inferred.
 *
 * Writes .bridge/evidence/dir014-public-config-probe.json.
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
if (!session) throw new Error('DIR014 public-config probe needs a live identity.');

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const context = await browser.newContext();
const page = await context.newPage();

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

// Capture every public-config response the live page actually receives.
const captures = [];
page.on('response', async (res) => {
    if (!/\/api\/(platform\/)?public-config/.test(res.url())) return;
    let body = null;
    try { body = await res.json(); } catch { body = '<non-json>'; }
    const modules = body && typeof body === 'object'
        ? (body.modules || body.data?.modules || null)
        : null;
    captures.push({
        url: res.url(),
        status: res.status(),
        settingsSource: body?._settingsSource ?? null,
        settingsStale: body?._settingsStale ?? null,
        hasModulesKey: modules ? Object.prototype.hasOwnProperty.call(modules, 'enableAtsScoreModule') : false,
        atsScore: modules?.enableAtsScoreModule ?? null,
        coverLetter: modules?.enableCoverLetterModule ?? null,
        topLevelKeys: body && typeof body === 'object' ? Object.keys(body).slice(0, 30) : [],
    });
});

const consoleErrors = [];
page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
const failedRequests = [];
page.on('requestfailed', (req) => failedRequests.push({ url: req.url(), error: req.failure()?.errorText }));

await page.goto(`${WEB_ORIGIN}/coverletter`, { waitUntil: 'domcontentloaded' });
await page.locator('.cl-stepper').waitFor({ timeout: 60_000 });
await page.waitForTimeout(2500);

const dom = await page.evaluate(() => ({
    atsToggleCount: document.querySelectorAll('.cl-ats__toggle').length,
    // The card that hosts the ATS subcard renders regardless of the flag.
    subcardPresent: !!document.querySelector('.cl-subcard'),
}));

const report = {
    captures,
    dom,
    consoleErrors,
    failedRequests,
    derivedVerdict: captures.length === 0
        ? 'NO public-config request observed -> getSystemSettings() fell back to _settingsSource:"unavailable"'
        : captures.map((c) => `/^mariadb(?:$|-)/.test(String(c.settingsSource))`
            ? `${c.url} -> AUTHORITATIVE (resolved)`
            : `${c.url} -> NOT authoritative (_settingsSource=${JSON.stringify(c.settingsSource)}) -> client fails closed`),
};
report.failClosedExplained = captures.length > 0
    && captures.every((c) => !/^mariadb(?:$|-)/.test(String(c.settingsSource)));

fs.mkdirSync('.bridge/evidence', { recursive: true });
fs.writeFileSync('.bridge/evidence/dir014-public-config-probe.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

await browser.close();
