import { chromium } from 'playwright';
import { preview } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

async function captureCandidateVisuals() {
    console.log('=== Starting Candidate Experience Visual Evidence Capture ===\n');

    const outputDir = path.resolve(process.cwd(), 'artifacts/visual-evidence');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const API_KEY = 'AIzaSyDigXT7n4Pyf-8WHQtvjHa0wGvJ86nmrwc';
    const authUserKey = `firebase:authUser:${API_KEY}:[DEFAULT]`;

    function makeMockJwt(overrides = {}) {
        const h = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
        const now = Math.floor(Date.now() / 1000);
        const c = Buffer.from(JSON.stringify({ iss: 'https://securetoken.google.com/ai-resume-builder-424cf', aud: 'ai-resume-builder-424cf', auth_time: now, user_id: 'test-user', sub: 'test-user', iat: now, exp: now + 86400 * 30, email: 'user@test.com', email_verified: true, firebase: { identities: { email: ['user@test.com'] }, sign_in_provider: 'password' }, ...overrides })).toString('base64url');
        return `${h}.${c}.mock`;
    }

    const mockToken = makeMockJwt();

    const server = await preview({
        preview: { port: 5174, host: '127.0.0.1', strictPort: false },
    });
    const base = server.resolvedUrls?.local?.[0]?.replace(/\/$/, '') || `http://127.0.0.1:${server.config.preview.port || 5174}`;
    console.log(`Vite preview production server ready at ${base}`);

    const browser = await chromium.launch({
        args: ['--no-sandbox', '--no-zygote', '--disable-gpu', '--disable-dev-shm-usage'],
    });

    const setupAuth = async (page) => {
        await page.addInitScript(({ key, apiKey, token }) => {
            const now = Math.floor(Date.now() / 1000);
            const userObj = { uid: 'test-user', email: 'user@test.com', emailVerified: true, displayName: 'Alex Morgan', isAnonymous: false, stsTokenManager: { apiKey, refreshToken: 'fix', accessToken: token, expirationTime: Date.now() + 86400000 * 30 }, createdAt: String(Date.now()), lastLoginAt: String(Date.now()), apiKey, appName: '[DEFAULT]' };
            const keys = [
                key,
                'firebase:authUser:demo-browser-api-key:[DEFAULT]',
                `firebase:authUser:${apiKey}:[DEFAULT]`,
            ];
            for (const k of keys) {
                localStorage.setItem(k, JSON.stringify(userObj));
            }
            localStorage.setItem('user', 'test-user');
            localStorage.setItem('preferredLanguage', 'en');
            localStorage.setItem('cookie-consent', 'accepted');
            localStorage.setItem('cookieConsentChoice', 'accepted');
            localStorage.setItem('resumepilot_local_session_v1', JSON.stringify({
                token: token,
                uid: 'test-user',
                email: 'user@test.com',
                displayName: 'Alex Morgan',
                role: 'USER',
                exp: now + 86400 * 30,
            }));

            try {
                const req = indexedDB.open('firebaseLocalStorageDb', 1);
                req.onupgradeneeded = () => {
                    const db = req.result;
                    if (!db.objectStoreNames.contains('firebaseLocalStorage')) {
                        db.createObjectStore('firebaseLocalStorage', { keyPath: 'fbase_key' });
                    }
                };
                req.onsuccess = () => {
                    const db = req.result;
                    const tx = db.transaction('firebaseLocalStorage', 'readwrite');
                    const store = tx.objectStore('firebaseLocalStorage');
                    for (const k of keys) {
                        store.put({ fbase_key: k, value: userObj });
                    }
                };
            } catch {}
        }, { key: authUserKey, apiKey: API_KEY, token: mockToken });

        await page.route('**/securetoken.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: mockToken, expires_in: '3600', token_type: 'Bearer', refresh_token: 'fix', id_token: mockToken, user_id: 'test-user', project_id: 'fixture' }) }));
        await page.route('**/identitytoolkit.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ users: [{ localId: 'test-user', email: 'user@test.com', emailVerified: true, displayName: 'Alex Morgan' }] }) }));
        await page.route('**/www.google-analytics.com/**', r => r.abort());
        await page.route('**/www.googletagmanager.com/**', r => r.abort());
        const authoritativeSettings = {
            _settingsSource: 'mariadb-authoritative',
            siteName: 'ResumePilot AI',
            modules: {
                enableAtsScoreModule: true,
                enableImportModule: true,
                enablePublicSharingModule: true,
                enablePortfolioModule: true,
                enableBlog: true,
                enableJobs: true,
                enableSubscriptions: true,
                aiInterview: true,
                jobs: true,
                portfolios: true,
                subscriptions: true,
            },
            maintenanceMode: false,
        };
        await page.route('**/api/settings/public', r => r.fulfill({ json: { settings: authoritativeSettings } }));
        await page.route('**/api/platform/public-config', r => r.fulfill({ json: authoritativeSettings }));
        await page.route('**/api/user/profile**', r => r.fulfill({ json: { success: true, profile: { firstname: 'Alex', lastname: 'Morgan', occupation: 'Staff Software Architect', email: 'alex.morgan@example.com', phone: '+1 (555) 234-5678', city: 'San Francisco', country: 'United States' } } }));
        const mockResumeData = {
            id: 'res-1',
            title: 'Senior Software Engineer Resume',
            firstname: 'Alex',
            lastname: 'Morgan',
            occupation: 'Staff Software Architect',
            email: 'alex.morgan@example.com',
            phone: '+1 (555) 234-5678',
            city: 'San Francisco',
            country: 'United States',
            summary: 'Experienced software architect building cloud SaaS platforms.',
            workHistory: [{ jobTitle: 'Principal Engineer', employer: 'Vanguard Systems', startYear: '2021', isCurrent: true, jobDescription: 'Led platform migration to microservices.' }],
            skills: [{ skill: 'TypeScript' }, { skill: 'React' }, { skill: 'Node.js' }],
            revision: 1,
            template: 'Cv1',
        };

        await page.route('**/api/resumes/**', r => {
            return r.fulfill({ json: { success: true, resume: mockResumeData, data: mockResumeData } });
        });
        await page.route('**/api/resumes', r => {
            if (r.request().method() === 'POST') {
                return r.fulfill({ json: { success: true, resume: mockResumeData, data: mockResumeData } });
            }
            return r.fulfill({ json: { success: true, resumes: [mockResumeData] } });
        });
        await page.route('**/data/resumes/**', r => r.fulfill({ json: mockResumeData }));
        await page.route('**/api/generate-summary**', r => r.fulfill({ json: { summary: 'Experienced software engineer with expertise in React, Node.js, and cloud services.' } }));
        await page.route('**/api/generate-work-description**', r => r.fulfill({ json: { description: '• Led development of microservices\n• Improved performance' } }));
        await page.route('**/api/generate-content**', r => r.fulfill({ json: { content: 'Generated AI content.' } }));
        await page.route('**/api/ai/recommend-skills**', r => r.fulfill({ json: { skills: ['TypeScript', 'React', 'Node.js', 'Docker', 'AWS'] } }));
        await page.route('**/api/ai/recommend-certifications**', r => r.fulfill({ json: { certifications: ['AWS Solutions Architect', 'Google Cloud Professional'] } }));
    };

    try {
        // Desktop Viewport (1440 x 900)
        const desktopPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
        await setupAuth(desktopPage);

        // Standard Candidate Dashboard Captures
        const dashboardCaptures = [
            { name: '01_dashboard_home.png', path: '/dashboard' },
            { name: '02_resume_management.png', path: '/dashboard' },
            { name: '05_ai_interview_coach.png', path: '/dashboard/interview' },
            { name: '06_jobs_career.png', path: '/dashboard/job-tracker' },
            { name: '07_portfolio.png', path: '/dashboard/portfolios' },
            { name: '08_support_desk.png', path: '/dashboard/support' },
            { name: '09_master_profile.png', path: '/dashboard/settings?tab=Profile' },
            { name: '10_subscription.png', path: '/dashboard/plans' },
            { name: '11_security_2fa.png', path: '/dashboard/settings?tab=Account' },
        ];

        for (const item of dashboardCaptures) {
            console.log(`Capturing Dashboard: ${item.name} (${item.path})`);
            await desktopPage.goto(`${base}${item.path}`, { waitUntil: 'domcontentloaded' });
            await desktopPage.waitForTimeout(1000);
            const acceptBtn = await desktopPage.$('button:has-text("Accept All"), button:has-text("Allow analytics"), button:has-text("Reject")');
            if (acceptBtn) {
                await acceptBtn.click().catch(() => {});
                await desktopPage.waitForTimeout(200);
            }
            await desktopPage.screenshot({ path: path.join(outputDir, item.name), fullPage: false });
        }

        // 11 Resume Builder Steps (1440 x 900)
        const builderSteps = [
            { name: '03_resume_builder.png', path: '/build-resume/heading' },
            { name: '03_rb_step1_heading.png', path: '/build-resume/heading' },
            { name: '03_rb_step2_work_history.png', path: '/build-resume/work-history' },
            { name: '03_rb_step3_education.png', path: '/build-resume/education' },
            { name: '04_ats_experience.png', path: '/build-resume/skills' },
            { name: '03_rb_step4_skills.png', path: '/build-resume/skills' },
            { name: '03_rb_step5_projects.png', path: '/build-resume/projects' },
            { name: '03_rb_step6_certifications.png', path: '/build-resume/certifications' },
            { name: '03_rb_step7_languages.png', path: '/build-resume/languages' },
            { name: '03_rb_step8_summary.png', path: '/build-resume/summary' },
            { name: '03_rb_step9_achievements.png', path: '/build-resume/achievements' },
            { name: '03_rb_step10_references.png', path: '/build-resume/references' },
            { name: '03_rb_step11_review_export.png', path: '/build-resume/review' },
        ];

        for (const item of builderSteps) {
            console.log(`Capturing Step: ${item.name} (${item.path})`);
            await desktopPage.goto(`${base}${item.path}`, { waitUntil: 'domcontentloaded' });
            await desktopPage.waitForTimeout(1000);
            await desktopPage.screenshot({ path: path.join(outputDir, item.name), fullPage: false });
        }

        // Capture All 11 Steps Stepper Overview Modal
        console.log('Capturing: 12_rb_all_steps_overview_modal.png');
        await desktopPage.goto(`${base}/build-resume/heading`, { waitUntil: 'domcontentloaded' });
        await desktopPage.waitForTimeout(800);
        const overviewBtn = await desktopPage.$('button:has-text("11 Steps"), button:has-text("All Steps")');
        if (overviewBtn) {
            await overviewBtn.click().catch(() => {});
            await desktopPage.waitForTimeout(400);
        }
        await desktopPage.screenshot({ path: path.join(outputDir, '12_rb_all_steps_overview_modal.png') });
        await desktopPage.keyboard.press('Escape');
        await desktopPage.waitForTimeout(300);

        // Capture ATS Slide-Over Drawer
        console.log('Capturing: 13_rb_ats_companion_drawer.png');
        const atsBtn = await desktopPage.$('button:has-text("ATS:"), button:has-text("ATS Insights")');
        if (atsBtn) {
            await atsBtn.click().catch(() => {});
            await desktopPage.waitForTimeout(500);
        }
        await desktopPage.screenshot({ path: path.join(outputDir, '13_rb_ats_companion_drawer.png') });
        await desktopPage.keyboard.press('Escape');
        await desktopPage.waitForTimeout(300);

        // Capture Template Selection Modal
        console.log('Capturing: 14_rb_template_selection_modal.png');
        const templateBtn = await desktopPage.$('button:has-text("Template")');
        if (templateBtn) {
            await templateBtn.click().catch(() => {});
            await desktopPage.waitForTimeout(500);
        }
        await desktopPage.screenshot({ path: path.join(outputDir, '14_rb_template_selection_modal.png') });
        await desktopPage.keyboard.press('Escape');
        await desktopPage.waitForTimeout(300);

        // Capture Fullscreen Preview Modal
        console.log('Capturing: 15_rb_full_preview_modal.png');
        const previewBtn = await desktopPage.$('button:has-text("Preview")');
        if (previewBtn) {
            await previewBtn.click().catch(() => {});
            await desktopPage.waitForTimeout(600);
        }
        await desktopPage.screenshot({ path: path.join(outputDir, '15_rb_full_preview_modal.png') });
        await desktopPage.keyboard.press('Escape');
        await desktopPage.waitForTimeout(300);

        // Responsive Viewports
        console.log('Capturing: 16_rb_1280x720_desktop.png');
        await desktopPage.setViewportSize({ width: 1280, height: 720 });
        await desktopPage.goto(`${base}/build-resume/heading`, { waitUntil: 'domcontentloaded' });
        await desktopPage.waitForTimeout(800);
        await desktopPage.screenshot({ path: path.join(outputDir, '16_rb_1280x720_desktop.png') });

        console.log('Capturing: 17_rb_1024x768_desktop.png');
        await desktopPage.setViewportSize({ width: 1024, height: 768 });
        await desktopPage.goto(`${base}/build-resume/work-history`, { waitUntil: 'domcontentloaded' });
        await desktopPage.waitForTimeout(800);
        await desktopPage.screenshot({ path: path.join(outputDir, '17_rb_1024x768_desktop.png') });

        console.log('Capturing: 18_rb_768x1024_tablet.png');
        await desktopPage.setViewportSize({ width: 768, height: 1024 });
        await desktopPage.goto(`${base}/build-resume/skills`, { waitUntil: 'domcontentloaded' });
        await desktopPage.waitForTimeout(800);
        await desktopPage.screenshot({ path: path.join(outputDir, '18_rb_768x1024_tablet.png') });

        // Mobile Viewport (390 x 844)
        const mobilePage = await browser.newPage({ viewport: { width: 390, height: 844 } });
        await setupAuth(mobilePage);
        await mobilePage.goto(`${base}/dashboard`, { waitUntil: 'domcontentloaded' });
        await mobilePage.waitForTimeout(800);
        console.log('Capturing Mobile: 12_mobile_dashboard.png');
        await mobilePage.screenshot({ path: path.join(outputDir, '12_mobile_dashboard.png') });

        console.log('Capturing Mobile Navigation: 13_mobile_navigation.png');
        const toggleBtn = await mobilePage.$('button[aria-label="Toggle sidebar"], button[aria-label="Open menu"], button[aria-label="Open navigation menu"]');
        if (toggleBtn) {
            await toggleBtn.click({ force: true }).catch(() => {});
            await mobilePage.waitForTimeout(400);
        }
        await mobilePage.screenshot({ path: path.join(outputDir, '13_mobile_navigation.png') });

        console.log('Capturing Mobile Resume Builder: 19_rb_390x844_mobile.png');
        await mobilePage.goto(`${base}/build-resume/heading`, { waitUntil: 'domcontentloaded' });
        await mobilePage.waitForTimeout(800);
        await mobilePage.screenshot({ path: path.join(outputDir, '19_rb_390x844_mobile.png') });

        // Long-Form Scrolling State with Fixed Bottom Action Footer
        console.log('Capturing: 20_rb_fixed_footer_scrolling.png');
        await desktopPage.setViewportSize({ width: 1440, height: 900 });
        await desktopPage.goto(`${base}/build-resume/heading`, { waitUntil: 'domcontentloaded' });
        await desktopPage.waitForTimeout(800);
        await desktopPage.evaluate(() => {
            const scroller = document.querySelector('.overflow-y-auto');
            if (scroller) scroller.scrollTop = 300;
        });
        await desktopPage.waitForTimeout(300);
        await desktopPage.screenshot({ path: path.join(outputDir, '20_rb_fixed_footer_scrolling.png') });

        // State captures
        console.log('Capturing State: 14_empty_state.png');
        await desktopPage.goto(`${base}/dashboard/portfolios`, { waitUntil: 'domcontentloaded' });
        await desktopPage.waitForTimeout(500);
        await desktopPage.screenshot({ path: path.join(outputDir, '14_empty_state.png') });

        console.log('Capturing State: 15_loading_state.png');
        await desktopPage.goto(`${base}/build-resume/heading`, { waitUntil: 'commit' });
        await desktopPage.screenshot({ path: path.join(outputDir, '15_loading_state.png') });

        console.log('Capturing State: 16_error_recovery_state.png');
        await desktopPage.goto(`${base}/non-existent-candidate-route`, { waitUntil: 'domcontentloaded' });
        await desktopPage.waitForTimeout(400);
        await desktopPage.screenshot({ path: path.join(outputDir, '16_error_recovery_state.png') });

        console.log('\n✅ All Visual Evidence Screenshots Successfully Captured in artifacts/visual-evidence/');
    } finally {
        await browser.close();
        await server.close();
    }
}

captureCandidateVisuals().catch((err) => {
    console.error('Visual capture error:', err);
    process.exit(1);
});
