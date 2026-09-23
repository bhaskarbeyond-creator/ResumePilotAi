import dotenv from 'dotenv';
dotenv.config({ path: 'backend/.env' });
import { test, expect } from '@playwright/test';
import { executeContentOperation } from '../backend/services/aiRuntime.js';
import { issueLocalTestToken } from '../backend/security/auth.js';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const API_KEY = process.env.VITE_FIREBASE_KEY || 'test-mock-firebase-key';

const now = Math.floor(Date.now() / 1000);
const rptestToken = issueLocalTestToken({
    uid: 'test-user',
    email: 'alex.morgan@example.com',
    email_verified: true,
    auth_time: now,
    exp: now + 3600,
});

// Candidate details with complete previous steps entered
const candidateResumeData = {
    id: 'res-summary-10-10',
    title: 'Senior Full Stack Engineer Resume',
    firstname: 'Alex',
    lastname: 'Morgan',
    occupation: 'Senior Full Stack Engineer',
    targetRole: 'Senior Full Stack Engineer',
    email: 'alex.morgan@example.com',
    phone: '+1 (555) 234-5678',
    city: 'San Francisco',
    country: 'United States',
    summary: '',
    employments: [
        {
            jobTitle: 'Senior Full Stack Engineer',
            employer: 'TechCorp',
            startDate: '2020-01',
            endDate: 'Present',
            current: true,
            isCurrent: true,
            description: 'Led cloud migration and microservices architecture, scaling APIs across 12 distributed services.',
        },
        {
            jobTitle: 'Software Engineer',
            employer: 'InnoSystems',
            startDate: '2016-03',
            endDate: '2019-12',
            current: false,
            isCurrent: false,
            description: 'Built reactive frontend applications in React and engineered performant REST APIs with Node.js and PostgreSQL.',
        },
    ],
    educations: [
        {
            degree: 'B.S. in Computer Science',
            school: 'UC Berkeley',
            started: '2012',
            finished: '2016',
            description: 'Focus on distributed systems and algorithm complexity.',
        },
    ],
    skills: [
        { skill: 'React' },
        { skill: 'Node.js' },
        { skill: 'TypeScript' },
        { skill: 'Docker' },
        { skill: 'AWS' },
        { skill: 'PostgreSQL' },
        { skill: 'GraphQL' },
        { skill: 'Redis' },
    ],
    certifications: [
        {
            title: 'AWS Certified Solutions Architect',
            issuer: 'Amazon Web Services',
        },
    ],
    projects: [
        {
            title: 'Cloud Orchestration Engine',
            description: 'High-throughput deployment engine automating container lifecycle management.',
        },
    ],
    completedSteps: [1, 2, 3, 4, 5, 6],
    revision: 1,
    template: 'Cv1',
};

test.describe('10/10 AI Summary Generation & Dynamic Context Suite', () => {

    test.beforeEach(async ({ page }) => {
        const authUserKey = `firebase:authUser:${API_KEY}:[DEFAULT]`;

        await page.addInitScript(({ key, apiKey, token, resumeId }) => {
            const userObj = {
                uid: 'test-user',
                email: 'alex.morgan@example.com',
                emailVerified: true,
                displayName: 'Alex Morgan',
                isAnonymous: false,
                stsTokenManager: { apiKey, refreshToken: token, accessToken: token, expirationTime: Date.now() + 3600000 },
                createdAt: String(Date.now()),
                lastLoginAt: String(Date.now()),
                apiKey,
                appName: '[DEFAULT]',
            };
            localStorage.setItem(key, JSON.stringify(userObj));
            localStorage.setItem('firebase:authUser:demo-browser-api-key:[DEFAULT]', JSON.stringify(userObj));
            if (apiKey) localStorage.setItem(`firebase:authUser:${apiKey}:[DEFAULT]`, JSON.stringify(userObj));
            localStorage.setItem('user', 'test-user');
            localStorage.setItem('currentResumeId', resumeId);
            localStorage.setItem('resumepilot_privacy_consent_v1', 'denied');
            localStorage.setItem('ime365_privacy_consent_v1', 'denied');
            localStorage.setItem('preferredLanguage', 'en');
        }, { key: authUserKey, apiKey: API_KEY, token: rptestToken, resumeId: candidateResumeData.id });

        // Intercept Firebase Auth token validation requests
        await page.route('**/securetoken.googleapis.com/**', r => r.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ access_token: rptestToken, expires_in: '3600', token_type: 'Bearer', refresh_token: rptestToken, id_token: rptestToken, user_id: 'test-user', project_id: 'fixture' }),
        }));
        await page.route('**/identitytoolkit.googleapis.com/**', r => r.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ users: [{ localId: 'test-user', email: 'alex.morgan@example.com', emailVerified: true, displayName: 'Alex Morgan' }] }),
        }));
        await page.route('**/www.google-analytics.com/**', r => r.abort());
        await page.route('**/www.googletagmanager.com/**', r => r.abort());
        await page.route('**/maps.googleapis.com/**', r => r.abort());

        // Platform configuration and user profile
        await page.route('**/api/platform/public-config', r => r.fulfill({
            json: {
                _settingsSource: 'mariadb-authoritative',
                modules: { enableAtsScore: true, enableAI: true },
            },
        }));
        await page.route('**/api/settings/public', r => r.fulfill({
            json: { settings: { siteName: 'ResumePilot AI', enableBlog: true, enableJobs: true } },
        }));
        await page.route('**/api/user/profile**', r => r.fulfill({
            json: {
                success: true,
                profile: {
                    firstname: 'Alex',
                    lastname: 'Morgan',
                    occupation: 'Senior Full Stack Engineer',
                    email: 'alex.morgan@example.com',
                },
            },
        }));

        // Seed resume data for the builder
        await page.route('**/api/resumes/**', r => {
            if (r.request().method() === 'POST') {
                return r.fulfill({ json: { success: true, resume: candidateResumeData, data: candidateResumeData } });
            }
            return r.fulfill({ json: { success: true, resume: candidateResumeData, data: candidateResumeData } });
        });
        await page.route('**/api/resumes', r => {
            return r.fulfill({ json: { success: true, resumes: [candidateResumeData] } });
        });
    });

    test('1. Career Evidence Digest accurately reflects merged tenure and all previous details', async ({ page }) => {
        await page.goto(`${BASE_URL}/build-resume/summary?id=${candidateResumeData.id}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(2000);

        // Verify Step Shell header
        const heading = page.locator('h1, h2').filter({ hasText: /Executive Bio|Professional Summary/i }).first();
        await expect(heading).toBeVisible({ timeout: 15000 });

        // Verify Career Evidence Digest
        const evidenceContainer = page.locator('div').filter({ hasText: /Synthesizes:/ }).last();
        await expect(evidenceContainer).toBeVisible();

        const digestText = await evidenceContainer.innerText();
        console.log('[Playwright Test] Rendered Evidence Digest:', digestText);

        // Must display calculated non-overlapping tenure (from 2016-03 to present = 10+ yrs exp)
        expect(digestText).toMatch(/10\s*yrs/i);
        // Must show 2 positions, 8 skills, 1 degree, 1 credential
        expect(digestText).toMatch(/2\s*positions?/i);
        expect(digestText).toMatch(/8\s*skills?/i);
        expect(digestText).toMatch(/1\s*degree/i);
        expect(digestText).toMatch(/1\s*credential/i);

        // Verify Tone Selector Pills are present
        const toneGroup = page.locator('[role="group"][aria-label="Tone preference"]');
        await expect(toneGroup).toBeVisible();
        await expect(toneGroup.locator('button').filter({ hasText: /^Balanced$/i })).toBeVisible();
        await expect(toneGroup.locator('button').filter({ hasText: /^Concise$/i })).toBeVisible();
        await expect(toneGroup.locator('button').filter({ hasText: /^Technical$/i })).toBeVisible();
        await expect(toneGroup.locator('button').filter({ hasText: /^Executive$/i })).toBeVisible();

        // Verify AI Generation button is ready and enabled
        const generateBtn = page.getByRole('button', { name: /Generate Executive Bio/i });
        await expect(generateBtn).toBeVisible();
        await expect(generateBtn).toBeEnabled();
    });

    test('2. Dynamic 10/10 AI generation strictly prohibits fallback and delivers authentic executive summary', async ({ page }) => {
        let interceptedPayload = null;
        let interceptedResponse = null;

        // Route interceptor to observe the exact request and forward to real backend
        await page.route('**/api/generate-content', async (route) => {
            const req = route.request();
            const postData = req.postDataJSON() || {};
            if (postData.operation === 'generate-summary') {
                interceptedPayload = postData.payload || {};
                console.log('[Playwright Intercept] POST /api/generate-content with noFallback:', interceptedPayload.noFallback);

                // Forward to real backend server
                const response = await route.fetch();
                interceptedResponse = await response.json();
                console.log('[Playwright Intercept] AI Provider:', interceptedResponse.provider);
                console.log('[Playwright Intercept] AI Summary:', interceptedResponse.data?.summary || interceptedResponse.summary);

                return route.fulfill({ response });
            }
            return route.continue();
        });

        await page.goto(`${BASE_URL}/build-resume/summary?id=${candidateResumeData.id}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(2000);

        // Click Generate Executive Bio (AI)
        const generateBtn = page.getByRole('button', { name: /Generate Executive Bio/i });
        await expect(generateBtn).toBeVisible();
        await generateBtn.click();

        // In UI: Wait for the Draft Panel to render (real AI on NVIDIA NIM takes ~15-20s)
        const draftTextarea = page.locator('textarea[aria-label="Draft (editable)"]');
        await expect(draftTextarea).toBeVisible({ timeout: 60000 });

        // Verify that the request was dispatched with noFallback: true and all previous details
        expect(interceptedPayload).not.toBeNull();
        expect(interceptedPayload.noFallback).toBe(true);
        expect(interceptedPayload.targetRole).toBe('Senior Full Stack Engineer');
        expect(interceptedPayload.employments?.length).toBe(2);
        expect(interceptedPayload.skills?.length).toBe(8);
        expect(interceptedPayload.certifications?.length).toBe(1);

        // Verify real AI response returned from backend (NVIDIA NIM or active model)
        expect(interceptedResponse).not.toBeNull();
        expect(interceptedResponse.success).toBe(true);
        // Provider must NOT be fallback!
        expect(interceptedResponse.provider).not.toBe('fallback');
        expect(interceptedResponse.provider).not.toBe('source-preserving-fallback');
        expect(interceptedResponse._source).not.toBe('source-preserving-fallback');

        const summaryText = await draftTextarea.inputValue();
        expect(typeof summaryText).toBe('string');
        console.log(`[Playwright Test] AI Summary Length: ${summaryText.length} chars`);
        console.log(`[Playwright Test] AI Summary Content: "${summaryText}"`);

        // 10/10 ATS Quality Rules:
        // 1. Length bound strictly between 250 and 460 characters
        expect(summaryText.length).toBeGreaterThanOrEqual(250);
        expect(summaryText.length).toBeLessThanOrEqual(460);

        // 2. Synthesizes verified tenure or target domain
        expect(summaryText).toMatch(/experience|engineer|full-stack|software/i);

        // 3. Integrates verified candidate skills from previous steps
        expect(summaryText).toMatch(/React|Node\.js|AWS|TypeScript|microservices|PostgreSQL|Docker/i);

        // 4. Zero banned robotic AI clichés
        expect(summaryText).not.toMatch(/results-driven/i);
        expect(summaryText).not.toMatch(/\bleveraging\b/i);
        expect(summaryText).not.toMatch(/\butilizing\b/i);
        expect(summaryText).not.toMatch(/pivotal role/i);
        expect(summaryText).not.toMatch(/testament to/i);
        expect(summaryText).not.toMatch(/\bdelve\b/i);

        // 5. Zero first-person pronouns
        expect(summaryText).not.toMatch(/\b(?:I|my|me|our)\b/);

        // 6. Zero third-person pronouns
        expect(summaryText).not.toMatch(/\b(?:He|She)\s+(?:is|has|leads|brings)/);

        // 7. Zero candidate name monologue
        expect(summaryText).not.toMatch(/^Alex Morgan\s+/);

        // Click "Use this draft"
        const useDraftBtn = page.getByRole('button', { name: /Use this draft/i });
        await expect(useDraftBtn).toBeVisible();
        await useDraftBtn.click();

        // Verify draft was accepted and committed into the RichTextEditor
        await page.waitForTimeout(800);
        const editor = page.locator('.quill .ql-editor, textarea[name="summary"], [contenteditable="true"]').first();
        const editorText = await editor.innerText().catch(() => editor.inputValue());
        expect(editorText.length).toBeGreaterThan(100);
        expect(editorText).toContain(summaryText.slice(0, 30));

        // Verify character counter is updated
        const meter = page.locator('span', { hasText: /\d+\/400/ }).first();
        await expect(meter).toBeVisible();
        const meterText = await meter.innerText();
        console.log('[Playwright Test] Updated Character Meter:', meterText);
        expect(meterText).toMatch(/\d+\/400/);
    });

    test('3. Selecting different tones dynamically customizes the CPRW summary prompt', async ({ page }) => {
        let sentTone = null;

        await page.route('**/api/generate-content', async (route) => {
            const data = route.request().postDataJSON() || {};
            if (data.operation === 'generate-summary') {
                sentTone = data.payload?.tone;
                return route.fulfill({
                    json: {
                        success: true,
                        provider: 'nvidia',
                        model: 'meta/llama-3.2-11b-vision-instruct',
                        data: {
                            summary: 'Senior Full Stack Engineer with 10+ years of experience architecting cloud systems and high-throughput microservices. Expert in TypeScript, React, and Node.js APIs deployed on AWS with Docker and PostgreSQL. Delivers scalable platforms with proven operational velocity.',
                        },
                    },
                });
            }
            return route.continue();
        });

        await page.goto(`${BASE_URL}/build-resume/summary?id=${candidateResumeData.id}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(1500);

        // Select "Technical" tone from the tone selector group
        const techPill = page.locator('[role="group"][aria-label="Tone preference"] button').filter({ hasText: /^Technical$/i });
        await expect(techPill).toBeVisible();
        await techPill.click();
        await expect(techPill).toHaveAttribute('aria-pressed', 'true');

        // Click Generate Bio
        const generateBtn = page.getByRole('button', { name: /Generate Executive Bio/i });
        await generateBtn.click();

        // Verify tone was transmitted in the payload
        await expect.poll(() => sentTone, { timeout: 10000 }).toBe('technical');
    });

    test('4. End-to-End Fallback Guard: never serves fake/mock content when noFallback is active', async () => {
        // Direct test against aiRuntime engine: confirm that with noFallback: true, provider failure fails closed
        await expect(
            executeContentOperation({
                operation: 'generate-summary',
                payload: {
                    name: 'Alex Morgan',
                    targetRole: 'Senior Full Stack Engineer',
                    workHistory: 'Senior Engineer at TechCorp with 10 years experience',
                    skills: ['React', 'Node.js', 'AWS'],
                    noFallback: true,
                },
                environment: {},
                fetchImpl: async () => new Response('{}', { status: 503 }),
                requestId: 'test-nofallback-guard',
            })
        ).rejects.toThrow(/Fallback is disabled|All configured AI providers failed/);
    });
});
