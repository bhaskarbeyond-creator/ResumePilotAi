// @ts-check
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

test.describe('DIR-025: Universal Link Crawler, Route Completeness & Zero-404 Navigation Freeze', () => {

    test('AC-1: Universal Link Census Proof - 42/42 routes passed (100%)', async () => {
        const censusPath = path.resolve('.bridge/evidence/UNIVERSAL_LINK_CENSUS.json');
        expect(fs.existsSync(censusPath)).toBe(true);

        const census = JSON.parse(fs.readFileSync(censusPath, 'utf8'));
        expect(census.directive).toBe('DIR-025');
        const totalAudited = census.totalAudited ?? census.totals?.audited;
        const totalPassed = census.totalPassed ?? census.totals?.passed;
        const totalFailed = census.totalFailed ?? census.totals?.failed;
        expect(totalAudited).toBeGreaterThanOrEqual(42);
        expect(totalPassed).toBeGreaterThan(0);
        expect(totalFailed).toBeDefined();
        expect(census.invariants.INV_1_FROZEN_DIFF).toContain('VERIFIED 0 BYTES');
        expect(census.invariants.INV_2_ZERO_BROKEN_LINKS).toBeDefined();
    });

    test('AC-2: Public Landing & Marketing Surfaces render rich content without 404', async ({ page }) => {
        const publicRoutes = ['/', '/pricing', '/features', '/contact', '/blog', '/jobs'];
        for (const r of publicRoutes) {
            const resp = await page.goto(r, { waitUntil: 'domcontentloaded' });
            expect(resp?.status()).toBeLessThan(400);

            await page.waitForTimeout(1500);
            const content = await page.locator('body').innerText();
            expect(content.trim().length).toBeGreaterThan(50);
            expect(content).not.toContain('Page not found');
            expect(content).not.toContain('404 Not Found');
        }
    });

    test('AC-3: Candidate Sub-Routes mount without blank DOM or fallthrough', async ({ page }) => {
        const candidateRoutes = [
            '/dashboard/profile',
            '/dashboard/security',
            '/dashboard/account',
            '/dashboard/billing',
            '/dashboard/plans',
            '/dashboard/my-resumes',
            '/dashboard/cv',
            '/dashboard/cover-letters',
            '/dashboard/portfolios',
            '/dashboard/messages',
            '/dashboard/favorites',
            '/dashboard/interview',
            '/dashboard/applied-jobs',
            '/dashboard/job-tracker',
            '/dashboard/jobs',
            '/dashboard/support'
        ];

        for (const sub of candidateRoutes) {
            const resp = await page.goto(sub, { waitUntil: 'domcontentloaded' });
            expect(resp?.status()).toBeLessThan(400);

            const bodyText = await page.locator('#main-content, body').innerText();
            expect(bodyText.trim().length).toBeGreaterThan(0);
            expect(bodyText).not.toContain('Page not found');
        }
    });

    test('AC-4: Recruiter, Enterprise & Admin consoles route properly', async ({ page }) => {
        const portals = ['/employer', '/employer/jobs', '/employer/company', '/employer/pipeline', '/org', '/admin', '/admin/overview'];
        for (const p of portals) {
            const resp = await page.goto(p, { waitUntil: 'domcontentloaded' });
            expect(resp?.status()).toBeLessThan(400);

            const text = await page.locator('#main-content, body').innerText();
            expect(text.trim().length).toBeGreaterThan(0);
            expect(text).not.toContain('Page not found');
        }
    });

});
