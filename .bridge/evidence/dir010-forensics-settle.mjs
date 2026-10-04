// DIR-010 FORENSICS PROBE 2 — settle-state census of /employer/applicants.
//
// Probe 1 read the pipeline DOM after a fixed 4s wait and found 0 pills and 0
// "View Resume" buttons. That is ambiguous: it is either (a) the suite's own
// timing defect, or (b) the pipeline genuinely never renders rows. This probe
// removes the ambiguity by waiting CONDITION-DRIVEN on the pipeline reaching a
// terminal state (table rows, or an explicit empty/error state), up to 60s, and
// then reports exactly which state it landed in.
import path from 'node:path';
import process from 'node:process';
import fs from 'node:fs';
import dotenv from 'dotenv';
import { chromium } from '@playwright/test';
import { mintFirebaseSession } from '../../tests/e2e/dir006-session.mjs';

dotenv.config({ path: path.join(process.cwd(), '.env'), quiet: true });
dotenv.config({ path: path.join(process.cwd(), 'backend', '.env'), quiet: true });

const WEB_ORIGIN = process.env.DIR010_WEB_ORIGIN || 'http://localhost:3000';
const OUT = path.join(process.cwd(), '.bridge', 'evidence', 'dir010-forensics-settle.json');

const email = process.env.DIR010_RECRUITER_EMAIL
    || process.env.DIR007_EMPLOYER_EMAIL
    || process.env.DIR006_EMAIL
    || process.env.ADMIN_EMAIL;
const session = await mintFirebaseSession({ email });
if (!session) throw new Error(`no live identity for ${email}`);
console.log('identity =', session.email);

const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

// Capture the API traffic the pipeline actually makes, so a silent 4xx/5xx cannot
// masquerade as "the page has no rows".
const apiLog = [];
page.on('response', async (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith('/api/')) {
        apiLog.push({ status: r.status(), path: u.pathname, method: r.request().method() });
    }
});

await page.addInitScript(({ uid, email, token, refreshToken, apiKey }) => {
    const authUser = {
        uid, email, emailVerified: true, displayName: email.split('@')[0], isAnonymous: false,
        stsTokenManager: { apiKey, refreshToken, accessToken: token, expirationTime: Date.now() + 3600_000 },
        createdAt: String(Date.now()), lastLoginAt: String(Date.now()),
        apiKey, appName: '[DEFAULT]',
    };
    localStorage.setItem(`firebase:authUser:${apiKey}:[DEFAULT]`, JSON.stringify(authUser));
    localStorage.setItem('user', uid);
    localStorage.setItem('preferredLanguage', 'en');
    localStorage.setItem('ime365_cuba_shell_v2', 'cuba');
    localStorage.setItem('resumepilot_privacy_consent_v1', 'denied');
    localStorage.setItem('ime365_privacy_consent_v1', 'denied');
}, {
    uid: session.uid, email: session.email,
    token: session.idToken, refreshToken: session.refreshToken, apiKey: session.apiKey,
});

await page.goto(`${WEB_ORIGIN}/employer/applicants`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
await page.getByRole('navigation', { name: 'Employer navigation' }).waitFor({ state: 'visible', timeout: 60_000 });

// CONDITION-DRIVEN settle: poll until the pipeline leaves its loading state.
// "Loading your applicant pipeline…" is the transient string EmployerLoading renders.
const t0 = Date.now();
let settled = null;
while (Date.now() - t0 < 60_000) {
    settled = await page.evaluate(() => {
        const txt = document.body.innerText || '';
        const loading = /Loading your applicant pipeline/i.test(txt);
        const rows = document.querySelectorAll('tbody tr').length;
        return { loading, rows, snippet: txt.replace(/\s+/g, ' ').slice(0, 400) };
    });
    if (!settled.loading && settled.rows > 0) break;
    if (/could not load|no requisitions/i.test(settled.snippet)) break;
    await page.waitForTimeout(1000);
}
console.log('settled after', ((Date.now() - t0) / 1000).toFixed(1), 's');

const census = await page.evaluate(() => {
    const tone = (el) => [...el.classList].find((c) => c.startsWith('cuba-pill-')) || null;
    const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const pills = [...document.querySelectorAll('*')]
        .filter((el) => tone(el))
        .filter(visible)
        .map((el) => ({
            tag: el.tagName.toLowerCase(),
            tone: tone(el),
            text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60),
            className: el.getAttribute('class'),
        }));
    return {
        bodyRows: document.querySelectorAll('tbody tr').length,
        pillCount: pills.length,
        pills,
        stageSummaryItems: [...document.querySelectorAll('ul[aria-label="Pipeline stage summary"] li')]
            .map((li) => ({ text: (li.textContent || '').trim(), className: li.getAttribute('class') })),
        viewResumeButtons: [...document.querySelectorAll('button')]
            .filter((b) => /view resume/i.test(b.textContent || '')).length,
        stageSelects: document.querySelectorAll('select[id^="stage-"]').length,
        textSample: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 500),
    };
});

const result = { settle: settled, waitedSeconds: Number(((Date.now() - t0) / 1000).toFixed(1)), census, apiLog };
console.log(JSON.stringify(result, null, 2));
fs.writeFileSync(OUT, `${JSON.stringify(result, null, 2)}\n`);
console.log('wrote', OUT);
await browser.close();
