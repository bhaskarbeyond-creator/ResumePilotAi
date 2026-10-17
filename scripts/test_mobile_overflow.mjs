import { chromium } from 'playwright';
import crypto from 'node:crypto';

const uid = 'OhZdiSIFL7ePA1TMkfu9bnR935D3';
const email = 'bhaskar.beyond@gmail.com';
const displayName = 'Bhaskar Beyond';
const apiKey = 'AIzaSyDigXT7n4Pyf-8WHQtvjHa0wGvJ86nmrwc';
const secret = 'local-test-auth-hmac-secret-super-secure-32chars';
const currentResumeId = 'res_1792220149222';

const payload = {
    uid, email, email_verified: true, auth_time: Math.floor(Date.now() / 1000), role: 'USER',
    exp: Math.floor(Date.now() / 1000) + 360000,
    firebase: { identities: { email: [email] }, sign_in_provider: 'password' }
};
const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
const mockToken = `rptest.${body}.${sig}`;

async function run() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 375, height: 812 },
        isMobile: true,
        hasTouch: true,
        ignoreHTTPSErrors: true
    });

    await context.addInitScript(({ apiKey, token, uid, email, displayName, currentResumeId }) => {
        const userObj = {
            uid, email, emailVerified: true, displayName, isAnonymous: false,
            stsTokenManager: { apiKey, refreshToken: 'mock-refresh-token', accessToken: token, expirationTime: Date.now() + 36000000 },
            createdAt: String(Date.now()), lastLoginAt: String(Date.now()), apiKey, appName: '[DEFAULT]',
        };
        const p = JSON.stringify(userObj);
        localStorage.setItem(`firebase:authUser:${apiKey}:[DEFAULT]`, p);
        localStorage.setItem('firebase:authUser:demo-browser-api-key:[DEFAULT]', p);
        localStorage.setItem('user', uid);
        localStorage.setItem('currentResumeId', currentResumeId);
        localStorage.setItem('resumepilot_privacy_consent_v1', 'accepted');
        sessionStorage.removeItem('superadmin_role_view');
    }, { apiKey, token: mockToken, uid, email, displayName, currentResumeId });

    await context.route('**/securetoken.googleapis.com/**', (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
            access_token: mockToken,
            expires_in: '36000',
            token_type: 'Bearer',
            refresh_token: 'mock-refresh-token',
            id_token: mockToken,
            user_id: uid,
            project_id: 'ai-resume-builder-424cf',
        }),
    }));

    const page = await context.newPage();
    await page.goto('https://ime365.local/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="cuba-shell"]', { timeout: 15000 });
    await page.waitForTimeout(1500);

    const data = await page.evaluate(() => {
        const docWidth = window.innerWidth;
        const all = document.querySelectorAll('*');
        const overflows = [];
        for (const el of all) {
            const rect = el.getBoundingClientRect();
            if (rect.right > docWidth + 0.5) {
                overflows.push({
                    tag: el.tagName,
                    id: el.id,
                    className: (el.className || '').toString().slice(0, 50),
                    text: (el.textContent || '').trim().slice(0, 30),
                    right: rect.right,
                    width: rect.width
                });
            }
        }
        return {
            url: window.location.href,
            windowWidth: docWidth,
            scrollWidth: document.documentElement.scrollWidth,
            bodyScrollWidth: document.body.scrollWidth,
            headerWidth: document.querySelector('header')?.getBoundingClientRect().width,
            overflowCount: overflows.length,
            overflows: overflows.slice(0, 10)
        };
    });

    console.log(JSON.stringify(data, null, 2));
    await browser.close();
}

run().catch(console.error);
