const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

require('dotenv').config({ path: 'backend/.env' });

// Guard: production-live tests require a functioning Firebase Admin SDK. When
// credentials are missing or the SDK version is incompatible, skip everything
// instead of crashing the entire Playwright runner.
let firebaseAdmin = null;
let firebaseReady = false;
try {
    firebaseAdmin = require('firebase-admin');
    const certFn = (firebaseAdmin.credential || {}).cert;
    if (certFn && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
        if (!(firebaseAdmin.apps || []).length) {
            firebaseAdmin.initializeApp({
                credential: certFn({
                    projectId: process.env.FIREBASE_PROJECT_ID || 'ai-resume-builder-424cf',
                    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
                })
            });
        }
        firebaseReady = true;
    }
} catch { /* SDK unavailable or credential error — skip gracefully */ }


test.describe('Live Production E2E', () => {
    // Skip the entire suite when Firebase Admin is not functional.
    test.skip(!firebaseReady, 'Firebase Admin SDK not available — production-live tests are skipped locally');

    let customToken;

    test.beforeAll(async () => {
        // Create a custom token for the admin email
        const user = await firebaseAdmin.auth().getUserByEmail(process.env.ADMIN_EMAIL);
        customToken = await firebaseAdmin.auth().createCustomToken(user.uid);
        fs.mkdirSync(path.join('scratch', 'live-production'), { recursive: true });
    });

    test('authenticate and verify enterprise', async ({ page }) => {
        await page.goto('https://airesume.projectdemo.guru/login');

        // Inject Firebase auth script to sign in with custom token
        await page.evaluate(async (token) => {
            const auth = window.firebase.auth();
            await auth.signInWithCustomToken(token);
        }, customToken);

        await page.waitForTimeout(2000);
        await page.goto('https://airesume.projectdemo.guru/enterprise');
        await page.waitForSelector('.enterprise-shell', { timeout: 30_000 });

        await expect(page.locator('.enterprise-nav-item')).toHaveCount(14);

        // Security M2M Test
        await page.goto('https://airesume.projectdemo.guru/enterprise?tab=security');
        await page.waitForSelector('.enterprise-shell', { timeout: 30_000 });
        await page.getByRole('button', { name: /Create Service Account/ }).click();
        await page.locator('#sa-name').fill('Production E2E Probe');
        await page.getByRole('button', { name: /Create & Reveal Key/ }).click();
        
        const reveal = page.locator('.enterprise-card:has-text("API Key Generated")');
        await expect(reveal).toBeVisible({ timeout: 15_000 });
        const key = (await reveal.locator('code').first().textContent()).trim();
        expect(key).toMatch(/^rpa_/);

        // Test the M2M key against the real production API
        const m2mContext = await page.request.get('https://airesume.projectdemo.guru/api/enterprise/m2m/context', {
            headers: { 'x-api-key': key }
        });
        expect(m2mContext.status()).toBe(200);

        const m2mWrite = await page.request.post('https://airesume.projectdemo.guru/api/enterprise/resources', {
            headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
            data: { resourceType: 'resume', payload: { title: 'M2M Production Probe', source: 'playwright' } }
        });
        expect(m2mWrite.status()).toBe(201);

        const m2mControlPlane = await page.request.get('https://airesume.projectdemo.guru/api/enterprise/memberships', {
            headers: { 'x-api-key': key }
        });
        expect(m2mControlPlane.status()).toBe(403);

        // Rotate Key
        await page.locator('tr', { hasText: 'Production E2E Probe' }).first().locator('button[title*="Rotate"]').click();
        await page.locator('.enterprise-modal button:has-text("Rotate & Generate New Key")').click();
        
        const reveal2 = page.locator('.enterprise-card:has-text("API Key Generated")');
        await expect(reveal2).toBeVisible({ timeout: 15_000 });
        const rotatedKey = (await reveal2.locator('code').first().textContent()).trim();
        expect(rotatedKey).not.toBe(key);

        const deadOldKey = await page.request.get('https://airesume.projectdemo.guru/api/enterprise/m2m/context', {
            headers: { 'x-api-key': key }
        });
        expect(deadOldKey.status()).toBe(401);

        // Revoke Key
        await page.locator('tr', { hasText: 'Production E2E Probe' }).first().locator('button[title*="Revoke"]').click();
        await page.locator('.enterprise-modal button:has-text("Revoke Key")').click();
        await page.waitForTimeout(1000);

        const deadRotatedKey = await page.request.get('https://airesume.projectdemo.guru/api/enterprise/m2m/context', {
            headers: { 'x-api-key': rotatedKey }
        });
        expect(deadRotatedKey.status()).toBe(401);

        // Check viewports
        const VIEWPORTS = [
            { width: 1440, height: 900, label: '1440x900-desktop' },
            { width: 375, height: 667, label: '375x667-mobile-small' }
        ];

        for (const viewport of VIEWPORTS) {
            await page.setViewportSize({ width: viewport.width, height: viewport.height });
            await page.goto('https://airesume.projectdemo.guru/enterprise?tab=overview', { waitUntil: 'domcontentloaded' });
            await page.waitForSelector('.enterprise-shell', { timeout: 30_000 });
            await page.waitForTimeout(500);
            await page.screenshot({ path: path.join('scratch', 'live-production', `responsive-${viewport.label}.png`) });
        }
    });
});
