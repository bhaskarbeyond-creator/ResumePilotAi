import dotenv from 'dotenv';
dotenv.config({ path: 'backend/.env' });
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { executeContentOperation } from '../backend/services/aiRuntime.js';
import { issueLocalTestToken } from '../backend/security/auth.js';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const API_KEY = process.env.VITE_FIREBASE_KEY || 'AIzaSyDigXT7n4Pyf-8WHQtvjHa0wGvJ86nmrwc';

const now = Math.floor(Date.now() / 1000);
const rptestToken = issueLocalTestToken({
    uid: 'test-user',
    email: 'alex.morgan@example.com',
    email_verified: true,
    auth_time: now,
    exp: now + 3600,
});

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

async function main() {
    console.log('========================================================================');
    console.log('🚀 RUNNING PLAYWRIGHT 10/10 AI SUMMARY GENERATION BROWSER TEST SUITE');
    console.log('========================================================================\n');

    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--no-zygote', '--disable-gpu', '--disable-dev-shm-usage', '--disable-web-security'],
    });

    try {
        const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

        // 1. Configure browser localStorage and authentic rptest auth session
        await page.addInitScript(({ apiKey, token, resumeId }) => {
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
            localStorage.setItem(`firebase:authUser:${apiKey}:[DEFAULT]`, JSON.stringify(userObj));
            localStorage.setItem(`firebase:authUser:demo-browser-api-key:[DEFAULT]`, JSON.stringify(userObj));
            localStorage.setItem('user', 'test-user');
            localStorage.setItem('currentResumeId', resumeId);
            localStorage.setItem('resumepilot_privacy_consent_v1', 'denied');
            localStorage.setItem('ime365_privacy_consent_v1', 'denied');
            localStorage.setItem('preferredLanguage', 'en');
        }, { apiKey: API_KEY, token: rptestToken, resumeId: candidateResumeData.id });

        // 2. Set up network intercepts for auxiliary endpoints
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
                profile: { firstname: 'Alex', lastname: 'Morgan', occupation: 'Senior Full Stack Engineer', email: 'alex.morgan@example.com' },
            },
        }));

        await page.route('**/api/resumes/**', r => {
            return r.fulfill({ json: { success: true, resume: candidateResumeData, data: candidateResumeData } });
        });
        await page.route('**/api/resumes', r => {
            return r.fulfill({ json: { success: true, resumes: [candidateResumeData] } });
        });

        // ---------------------------------------------------------------------------------
        // TEST 1: Navigation & Career Evidence Digest Verification
        // ---------------------------------------------------------------------------------
        console.log('▶ [TEST 1] Loading /build-resume/summary and verifying Career Evidence Digest...');
        await page.goto(`${BASE_URL}/build-resume/summary?id=${candidateResumeData.id}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(2000);

        const currentUrl = page.url();
        console.log('  Current URL:', currentUrl);
        assert.ok(currentUrl.includes('/build-resume/summary'), `Expected /build-resume/summary but got ${currentUrl}`);

        const headings = await page.locator('h1, h2').allTextContents();
        console.log('  Page Headings:', headings);
        assert.ok(headings.some(h => /Executive Bio|Professional Summary|Write a professional summary/i.test(h)), 'Summary heading not rendered');

        // Verify Career Evidence Digest text
        const digestLocator = page.locator('div').filter({ hasText: /Synthesizes:/ }).last();
        await digestLocator.waitFor({ state: 'visible', timeout: 10000 });
        const digestText = await digestLocator.innerText();
        console.log('  Rendered Digest:', digestText);

        assert.ok(/10\s*yrs/i.test(digestText), `Digest must reflect calculated tenure (expected ~10 yrs, got: ${digestText})`);
        assert.ok(/2\s*positions?/i.test(digestText), `Digest must show 2 positions (got: ${digestText})`);
        assert.ok(/8\s*skills?/i.test(digestText), `Digest must show 8 skills (got: ${digestText})`);
        assert.ok(/1\s*degree/i.test(digestText), `Digest must show 1 degree (got: ${digestText})`);
        assert.ok(/1\s*credential/i.test(digestText), `Digest must show 1 credential (got: ${digestText})`);
        console.log('  ✓ [TEST 1 PASSED] Career Evidence Digest properly synthesized all previous details!');

        // ---------------------------------------------------------------------------------
        // TEST 2: Dynamic Tone Selection in Browser
        // ---------------------------------------------------------------------------------
        console.log('\n▶ [TEST 2] Verifying Tone Selector Pills in the UI...');
        const toneGroup = page.locator('[role="group"][aria-label="Tone preference"]');
        await toneGroup.waitFor({ state: 'visible', timeout: 5000 });

        const techPill = toneGroup.locator('button').filter({ hasText: /^Technical$/i });
        await techPill.click();
        await page.waitForTimeout(300);
        const isTechPressed = await techPill.getAttribute('aria-pressed');
        assert.equal(isTechPressed, 'true', 'Technical tone button should be pressed');
        console.log('  ✓ [TEST 2 PASSED] Tone selector interactively switches to Technical!');

        // ---------------------------------------------------------------------------------
        // TEST 3: Real AI Generation (Zero Fallback, Strict 10/10 CPRW ATS Quality)
        // ---------------------------------------------------------------------------------
        console.log('\n▶ [TEST 3] Triggering real AI summary generation with noFallback: true...');
        let interceptedPayload = null;
        let interceptedResponse = null;

        await page.route('**/api/generate-content', async (route) => {
            const postData = route.request().postDataJSON() || {};
            if (postData.operation === 'generate-summary') {
                interceptedPayload = postData.payload || {};
                console.log('  [API Request] POST /api/generate-content (generate-summary):');
                console.log('    noFallback:', interceptedPayload.noFallback);
                console.log('    targetRole:', interceptedPayload.targetRole);
                console.log('    tone:', interceptedPayload.tone);
                console.log('    experienceTenure:', interceptedPayload.experienceTenure);
                console.log('    employments count:', interceptedPayload.employments?.length);
                console.log('    skills count:', interceptedPayload.skills?.length);

                // Forward to real backend server
                const response = await route.fetch();
                interceptedResponse = await response.json();
                console.log('  [API Response] Status:', response.status());
                const summaryCandidate = interceptedResponse.data?.summary || interceptedResponse.summary;
                console.log('    Summary preview:', summaryCandidate?.slice(0, 100) + '...');

                return route.fulfill({ response });
            }
            return route.continue();
        });

        const generateBtn = page.getByRole('button', { name: /Generate Executive Bio/i });
        await generateBtn.click();

        // Wait for generation to complete (real AI on NVIDIA NIM takes ~15-20s)
        console.log('  Awaiting real AI generation from NVIDIA NIM backend...');
        const draftTextarea = page.locator('textarea[aria-label="Draft (editable)"]');
        await draftTextarea.waitFor({ state: 'visible', timeout: 60000 });

        assert.ok(interceptedPayload, 'Request payload was not captured');
        assert.equal(interceptedPayload.noFallback, true, 'noFallback must be true');
        assert.equal(interceptedPayload.tone, 'technical', 'Selected tone must be passed');
        assert.ok(interceptedResponse, 'Backend response must be captured');

        const summaryText = await draftTextarea.inputValue();
        assert.ok(typeof summaryText === 'string' && summaryText.length > 0, 'Summary must be rendered in DraftPanel');
        console.log(`\n  ================ FULL AI-GENERATED SUMMARY (${summaryText.length} chars) ================`);
        console.log(`  "${summaryText}"`);
        console.log(`  ========================================================================\n`);

        // 10/10 Quality Assertions:
        assert.ok(summaryText.length >= 250 && summaryText.length <= 460, `Length must be 250-460 chars (got ${summaryText.length})`);
        assert.ok(/React|Node\.js|TypeScript|AWS|microservices|cloud/i.test(summaryText), 'Must synthesize candidate technical skills');
        assert.ok(!/results-driven/i.test(summaryText), 'Must NOT contain results-driven');
        assert.ok(!/\bleveraging\b/i.test(summaryText), 'Must NOT contain leveraging');
        assert.ok(!/\butilizing\b/i.test(summaryText), 'Must NOT contain utilizing');
        assert.ok(!/\bpivotal role\b/i.test(summaryText), 'Must NOT contain pivotal role');
        assert.ok(!/\bdelve\b/i.test(summaryText), 'Must NOT contain delve');
        assert.ok(!/\b(?:I|my|me|our)\b/.test(summaryText), 'Must NOT contain first-person pronouns');
        assert.ok(!/\b(?:He|She)\s+(?:is|has|leads|brings)/.test(summaryText), 'Must NOT contain third-person pronouns');
        assert.ok(!/^Alex Morgan\s+/.test(summaryText), 'Must NOT narrate candidate full name monologue');
        console.log('  ✓ [TEST 3 PASSED] Real AI generated a 10/10 ATS-compliant executive summary with zero fallback!');

        // ---------------------------------------------------------------------------------
        // TEST 4: Accepting Draft into Editor & Character Meter Update
        // ---------------------------------------------------------------------------------
        console.log('\n▶ [TEST 4] Accepting AI draft into the editor and verifying character meter...');
        const useDraftBtn = page.getByRole('button', { name: /Use this draft/i });
        await useDraftBtn.click();
        await page.waitForTimeout(1000);

        const editor = page.locator('.quill .ql-editor, textarea, [contenteditable="true"]').first();
        const editorText = await editor.innerText().catch(() => editor.inputValue());
        console.log('  Editor Text Preview:', editorText.slice(0, 100) + '...');
        assert.ok(editorText.length >= 100, 'Editor must contain accepted draft');
        assert.ok(editorText.includes(summaryText.slice(0, 30)), 'Editor must contain the generated summary');

        const meter = page.locator('span', { hasText: /\d+\/400/ }).first();
        const meterText = await meter.innerText();
        console.log('  Character Meter Text:', meterText);
        assert.ok(/\d+\/400/.test(meterText), 'Character meter must be updated');
        console.log('  ✓ [TEST 4 PASSED] Draft accepted into rich text editor and meter updated!');

        // ---------------------------------------------------------------------------------
        // TEST 5: Fallback Rejection Guard Verification
        // ---------------------------------------------------------------------------------
        console.log('\n▶ [TEST 5] Testing engine-level fallback rejection when noFallback is active...');
        let rejected = false;
        try {
            await executeContentOperation({
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
                requestId: 'test-nofallback-guard-script',
            });
        } catch (err) {
            rejected = true;
            console.log('  Rejected error:', err.message, '| code:', err.code);
            assert.ok(/Fallback is disabled|All configured AI providers failed/i.test(err.message), 'Error message must state fallback disabled');
        }
        assert.ok(rejected, 'Must reject provider failure when noFallback is true');
        console.log('  ✓ [TEST 5 PASSED] Fallback rejection guard successfully verified!');

        console.log('\n========================================================================');
        console.log('🎉 ALL 5 PLAYWRIGHT 10/10 AI SUMMARY TESTS PASSED 100% WITH ZERO ERRORS!');
        console.log('========================================================================\n');

    } finally {
        await browser.close();
    }
}

main().catch((err) => {
    console.error('Playwright Test Suite Failed:', err);
    process.exit(1);
});
