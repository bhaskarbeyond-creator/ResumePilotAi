import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

import crypto from 'node:crypto';

const uid = 'OhZdiSIFL7ePA1TMkfu9bnR935D3';
const email = 'bhaskar.beyond@gmail.com';
const displayName = 'Bhaskar Beyond';
const apiKey = 'AIzaSyDigXT7n4Pyf-8WHQtvjHa0wGvJ86nmrwc';
const secret = 'local-test-auth-hmac-secret-super-secure-32chars';

const payload = {
    uid,
    email,
    email_verified: true,
    auth_time: Math.floor(Date.now() / 1000),
    role: 'USER',
    exp: Math.floor(Date.now() / 1000) + 360000,
    firebase: { identities: { email: [email] }, sign_in_provider: 'password' },
};
const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
const mockToken = `rptest.${body}.${sig}`;

async function main() {
    const browser = await chromium.launch({
        args: ['--no-sandbox', '--disable-gpu'],
    });

    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        ignoreHTTPSErrors: true,
    });

    await context.addInitScript(({ apiKey, token, uid, email, displayName }) => {
        const userObj = {
            uid,
            email,
            emailVerified: true,
            displayName,
            isAnonymous: false,
            stsTokenManager: {
                apiKey,
                refreshToken: 'mock-refresh-token',
                accessToken: token,
                expirationTime: Date.now() + 36000000,
            },
            createdAt: String(Date.now()),
            lastLoginAt: String(Date.now()),
            apiKey,
            appName: '[DEFAULT]',
        };
        const payload = JSON.stringify(userObj);
        localStorage.setItem(`firebase:authUser:${apiKey}:[DEFAULT]`, payload);
        localStorage.setItem('firebase:authUser:demo-browser-api-key:[DEFAULT]', payload);
        localStorage.setItem('user', uid);
        localStorage.setItem('resumepilot_privacy_consent_v1', 'accepted');
        sessionStorage.removeItem('superadmin_role_view');
    }, { apiKey, token: mockToken, uid, email, displayName });

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

    await context.route('**/identitytoolkit.googleapis.com/**', (route) => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
            users: [{
                localId: uid,
                email: email,
                emailVerified: true,
                displayName: displayName,
            }],
        }),
    }));

    const page = await context.newPage();
    page.on('console', msg => {
        if (msg.type() === 'error' || msg.text().includes('api') || msg.text().includes('fail')) {
            console.log('BROWSER LOG:', msg.type(), msg.text());
        }
    });
    page.on('request', req => {
        if (req.url().includes('/api/')) {
            console.log('API REQUEST:', req.method(), req.url(), 'AUTH HEADER:', req.headers()['authorization']);
        }
    });
    page.on('response', res => {
        if (res.url().includes('/api/') && !res.ok()) {
            console.log('API RESPONSE ERROR:', res.status(), res.url());
        }
    });

    const routes = [
        { path: '/dashboard', name: 'test-overview-fullpage.png' },
        { path: '/dashboard/job-tracker', name: 'test-tracker-fullpage.png' },
        { path: '/dashboard/resumes', name: 'test-resumes-hub-fullpage.png' },
        { path: '/dashboard/cover-letters', name: 'test-cover-letters-fullpage.png' },
        { path: '/dashboard/interview', name: 'test-interview-fullpage.png' },
        { path: '/dashboard/applied-jobs', name: 'test-applied-jobs-fullpage.png' },
    ];

    for (const { path: routePath, name } of routes) {
        console.log(`Navigating to https://ime365.local${routePath}...`);
        try {
            await page.goto(`https://ime365.local${routePath}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForTimeout(2500);

            // Test unlocked fullpage
            await page.evaluate(() => {
                const main = document.getElementById('cuba-main-content');
                if (main) {
                    document.documentElement.style.height = 'auto';
                    document.body.style.height = 'auto';
                    document.body.style.overflow = 'visible';
                    let el = main;
                    while (el && el !== document.body) {
                        el.style.height = 'auto';
                        el.style.maxHeight = 'none';
                        el.style.overflow = 'visible';
                        el = el.parentElement;
                    }
                }
            });
            await page.screenshot({ path: `candidate_screenshots/${name}`, fullPage: true });
            console.log(`Saved ${name}`);
        } catch (err) {
            console.error(`Failed to capture ${routePath}:`, err.message);
        }
    }

    await browser.close();
}

main().catch(console.error);
