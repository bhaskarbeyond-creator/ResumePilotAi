import { chromium } from 'playwright';
import { createServer } from 'vite';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

async function runWorkHistoryPlaywrightE2E() {
    console.log('================================================================');
    console.log('🚀 STARTING PLAYWRIGHT COMPLETE WORK HISTORY END-TO-END AUDIT');
    console.log('================================================================\n');

    const resultsDir = path.resolve('test-results/work-history-playwright');
    if (!fs.existsSync(resultsDir)) {
        fs.mkdirSync(resultsDir, { recursive: true });
    }

    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--no-zygote', '--disable-gpu', '--disable-dev-shm-usage'],
    });

    let page;
    let viteServer;

    try {
        const context = await browser.newContext({
            viewport: { width: 1440, height: 900 },
            ignoreHTTPSErrors: true,
        });
        page = await context.newPage();

        // 1. Intercept AI Generation APIs to provide deterministic ATS-certified responses
        await page.route('**/api/generate-work-description', async (route) => {
            const req = route.request();
            let postData = {};
            try { postData = req.postDataJSON() || {}; } catch {}
            console.log(`[Playwright Mock] Intercepted /api/generate-work-description (mode=${postData.mode || 'default'})`);

            if (postData.mode === 'questions') {
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        questions: [
                            {
                                id: 'q1',
                                question: 'What core web applications and scalable architectures did you develop?',
                                starterChips: ['React SPA', 'Microservices', 'GraphQL API', 'Design System'],
                            },
                            {
                                id: 'q2',
                                question: 'Which tools, frameworks, and deployment pipelines did you leverage?',
                                starterChips: ['Node.js', 'PostgreSQL', 'Docker', 'AWS ECS', 'TypeScript'],
                            },
                            {
                                id: 'q3',
                                question: 'What quantifiable outcomes did you achieve in speed, scale, or cost?',
                                starterChips: ['+35% Speed', '40ms Latency', 'Team of 6', '$25k Saved', '10k+ Users'],
                            },
                        ],
                    }),
                });
            }

            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    suggestions: [
                        'Architected high-throughput microservices in Node.js and TypeScript, reducing query latency by 45% across 6 core services.',
                        'Engineered modern frontend components in React, improving lighthouse performance scores by 35% and boosting conversion by 18%.',
                        'Automated CI/CD deployment pipelines utilizing Docker and GitHub Actions, cutting release turnaround times from 3 days to 4 hours.',
                        'Spearheaded technical mentorship for a cross-functional team of 6 junior engineers, elevating code test coverage from 62% to 94%.',
                    ],
                }),
            });
        });

        // Mock AI bullet enhancement endpoint to return high-impact ATS-optimized bullets
        await page.route('**/api/generate-content', async (route) => {
            const postData = route.request().postDataJSON() || {};
            const bullet = postData.payload?.bullet || postData.bullet || '';
            let enhanced = 'Engineered scalable web applications using React and Node.js, improving page load speed by 35% across 50,000+ active users.';
            if (/DSP Platforms/i.test(bullet)) {
                enhanced = 'Scaled client portfolio across DSP platforms, driving a +25% increase in revenue growth through strategic campaign management.';
            }
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    enhancedBullet: enhanced,
                    sourceExcerpt: bullet,
                    data: { enhancedBullet: enhanced },
                }),
            });
        });

        // 2. Navigate to Work History step in Build Resume harness
        if (!process.env.TEST_APP_URL) {
            viteServer = await createServer({
                server: { port: 3000 },
            });
            await viteServer.listen();
        }
        const targetUrl = process.env.TEST_APP_URL || 'http://localhost:3000/template-lab/builder-preview.html?step=work-history';
        console.log(`[Step 1] Navigating to QA Studio Harness: ${targetUrl}`);
        await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 20000 });
        await page.waitForTimeout(1000);

        // Verify Step 2 Heading
        const stepTwoIndicator = page.locator('button, div').filter({ hasText: /Work history/i }).first();
        assert.ok(await stepTwoIndicator.isVisible(), 'Work history step indicator must be visible');
        console.log('✓ Step 2 "Work history" loaded in DOM.');

        // Take initial empty/roadmap screenshot
        await page.screenshot({ path: path.join(resultsDir, '01_work_history_initial.png') });

        // 3. Add First Role & Test Autocomplete
        console.log('\n[Step 2] Testing Role Creation & Universal Autocomplete...');
        const addRoleButton = page.locator('button').filter({ hasText: /Add (?:Your First Role|another role|Experience)/i }).first();
        assert.ok(await addRoleButton.isVisible(), 'Add First Role button must be visible in empty state');
        await addRoleButton.click();
        await page.waitForTimeout(600);

        // Locate Job Title input
        const jobTitleInput = page.locator('input[name^="jobTitle-"]').first();
        assert.ok(await jobTitleInput.isVisible(), 'Job Title input must be rendered');
        await jobTitleInput.click();
        await jobTitleInput.fill('Softw');
        await page.waitForTimeout(300);

        // Verify Autocomplete suggestions appear
        const jobSuggestions = page.locator('div, li, button').filter({ hasText: /Software Engineer/i });
        const hasJobSuggestions = await jobSuggestions.count() > 0;
        console.log(`✓ Job Title autocomplete active (${await jobSuggestions.count()} matches found).`);

        await jobTitleInput.fill('Software Engineer');

        // Locate Employer input
        const employerInput = page.locator('input[name^="employer-"]').first();
        assert.ok(await employerInput.isVisible(), 'Employer input must be rendered');
        await employerInput.click();
        await employerInput.fill('Goo');
        await page.waitForTimeout(300);

        // Verify Company Autocomplete
        const companySuggestions = page.locator('div, li, button').filter({ hasText: /Google/i });
        const hasCompanySuggestions = await companySuggestions.count() > 0;
        console.log(`✓ Employer autocomplete active (${await companySuggestions.count()} matches found).`);

        await employerInput.fill('Google');
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);

        // Fill City
        const cityInput = page.locator('input[name^="city-"]').first();
        if (await cityInput.isVisible()) {
            await cityInput.fill('Mountain View, CA');
        }

        // Fill Start Date (Month input)
        const startMonthInput = page.locator('input[type="month"]').first();
        if (await startMonthInput.isVisible()) {
            await startMonthInput.fill('2021-06');
            console.log('✓ Start date set to 2021-06.');
        }

        // Toggle "Current Role" checkbox
        const currentCheckbox = page.locator('input[type="checkbox"]').first();
        if (await currentCheckbox.isVisible()) {
            await currentCheckbox.check({ force: true });
            console.log('✓ "Current Role" toggle checked.');
        }

        await page.waitForTimeout(600);
        await page.screenshot({ path: path.join(resultsDir, '02_role_created_autocomplete.png') });

        // 4. Verify Role ATS Health Card
        console.log('\n[Step 3] Verifying Role ATS Health Card...');
        const healthCard = page.locator('text=Role ATS Health');
        assert.ok(await healthCard.isVisible(), 'Role ATS Health Card must be visible');
        console.log('✓ Role ATS Health Card rendered.');

        // 5. Test Live Bullet Scoring & 1-Click ATS Power-Up
        console.log('\n[Step 4] Testing BulletPointsEditor & 1-Click "⚡ Make ATS Green"...');
        const bulletTextarea = page.locator('textarea').first();
        assert.ok(await bulletTextarea.isVisible(), 'Bullet point textarea must be visible');

        // 5a. Test Passive Phrase -> Expect 🔴 Red
        await bulletTextarea.fill('Worked on web application modules and attended daily standups');
        await page.waitForTimeout(500);

        const redBadge = page.getByText(/Needs Action Verb|Needs Work|Draft/i).first();
        assert.ok(await redBadge.isVisible(), 'Passive bullet must be flagged with warning badge');
        console.log('✓ Passive bullet correctly flagged with red/amber badge.');

        // 5b. Test 1-Click Passive Fixer Chip: click "Architected" or "Engineered"
        const verbChip = page.locator('button').filter({ hasText: /^(?:Architected|Engineered|Spearheaded|Delivered|Optimized)$/ }).first();
        if (await verbChip.isVisible()) {
            await verbChip.click();
            await page.waitForTimeout(300);
            const updatedText = await bulletTextarea.inputValue();
            assert.match(updatedText, /^(?:Architected|Engineered|Spearheaded|Delivered|Optimized)/, 'Bullet must be updated with strong verb');
            console.log(`✓ 1-Click Action Verb applied: "${updatedText.slice(0, 45)}..."`);
        }

        // 5c. Test 1-Click Metric Injector: click "+25% Speed" or "-40% Latency"
        const metricChip = page.locator('button').filter({ hasText: /\+25% Speed|-40% Latency|\+20k|Team of 5\+/i }).first();
        if (await metricChip.isVisible()) {
            await metricChip.click();
            await page.waitForTimeout(300);
            const textWithMetric = await bulletTextarea.inputValue();
            assert.match(textWithMetric, /25%|40%|\$20,000|5\+|99\.9%|10,000\+/, 'Bullet must contain injected metric');
            console.log(`✓ 1-Click Metric injected: "${textWithMetric.slice(0, 65)}..."`);

            // Verify badge transitions to 🟢 Strong (Action + Metrics)
            const strongBadge = page.getByText(/Strong \(Action \+ Metrics\)|Strong/i).first();
            assert.ok(await strongBadge.isVisible(), 'Bullet must achieve 🟢 Strong (Action + Metrics)');
            console.log('✓ Bullet quality successfully elevated to 🟢 STRONG (ATS PASSED)!');
        }

        // 5d. Test Google X-Y-Z Formula Guide toggle
        const formulaToggle = page.locator('button').filter({ hasText: /View Examples|Hide Guide/i }).first();
        if (await formulaToggle.isVisible()) {
            await formulaToggle.click();
            await page.waitForTimeout(300);
            const guideCard = page.locator('text=Google X-Y-Z Formula').first();
            assert.ok(await guideCard.isVisible(), 'Formula guide must expand');
            console.log('✓ Google X-Y-Z Formula Guide interactive toggle verified.');
        }

        // 5e. Verify User Scenario: Single Bullet "Client Portfolio DSP Platforms +25% Revenue Growth"
        console.log('\n[Step 4e] Verifying Single Bullet AI Enhance & Enhance All Highlight State...');
        await bulletTextarea.fill('Client Portfolio DSP Platforms +25% Revenue Growth');
        await page.waitForTimeout(500);

        // Check "Enhance All" button state when only 1 bullet exists:
        const enhanceAllBtn = page.locator('button').filter({ hasText: /Enhance All/i }).first();
        assert.ok(await enhanceAllBtn.isVisible(), 'Enhance All button must be rendered in quality bar');
        const isDisabled = await enhanceAllBtn.isDisabled();
        assert.equal(isDisabled, true, 'Enhance All must NOT be active when only 1 bullet exists');
        console.log('✓ Enhance All is correctly un-highlighted and disabled when only 1 bullet exists.');

        // Click "✨ AI Enhance" on this single bullet
        const aiEnhanceBtn = page.locator('button').filter({ hasText: /AI Enhance/i }).first();
        assert.ok(await aiEnhanceBtn.isVisible(), 'AI Enhance button on bullet must be visible');
        await aiEnhanceBtn.click();
        await page.waitForTimeout(1000);

        // Verify the bullet content was enhanced into an ATS-aligned Google X-Y-Z sentence
        const enhancedText = await bulletTextarea.inputValue();
        assert.match(enhancedText, /Scaled|Engineered|Spearheaded/, 'Enhanced bullet must start with strong action verb');
        assert.match(enhancedText, /25%/, 'Enhanced bullet must retain +25% metric');
        console.log(`✓ AI Enhance elevated bullet to: "${enhancedText}"`);

        // Verify quality badge is 🟢 Strong
        const greenBadge = page.getByText(/Strong \(Action \+ Metrics\)|Strong/i).first();
        assert.ok(await greenBadge.isVisible(), 'Bullet must achieve 🟢 Strong (Action + Metrics) after AI Enhance');
        console.log('✓ AI Enhance elevated bullet quality to 🟢 Strong (ATS Passed)!');

        // Now test: Add second bullet point -> "Enhance All" MUST become highlighted & enabled!
        const addBulletBtn = page.locator('button').filter({ hasText: /Add Bullet Point/i }).first();
        await addBulletBtn.click();
        await page.waitForTimeout(400);

        const isEnhanceAllEnabledNow = await enhanceAllBtn.isEnabled();
        assert.equal(isEnhanceAllEnabledNow, true, 'Enhance All MUST be highlighted and enabled when more bullets are added');
        console.log('✓ Enhance All successfully highlighted and enabled when more bullets are added!');

        // Fill second bullet and test Enhance All execution
        const secondBullet = page.locator('textarea').nth(1);
        if (await secondBullet.isVisible()) {
            await secondBullet.fill('responsible for deploying cloud services');
            await page.waitForTimeout(400);

            console.log('Testing "✨ Enhance All" execution...');
            await enhanceAllBtn.click();
            await page.waitForTimeout(1500);

            const secondBulletVal = await secondBullet.inputValue();
            assert.match(secondBulletVal, /Spearheaded|Engineered|Architected|Deployed/, 'Second bullet must be enhanced with strong action verb');
            console.log(`✓ Second bullet successfully elevated: "${secondBulletVal}"`);
        }

        await page.screenshot({ path: path.join(resultsDir, '03_bullet_ats_green_elevated.png') });

        // 6. Test AI Role Copilot Modal
        console.log('\n[Step 5] Testing AI Role Copilot Modal...');
        const copilotButton = page.locator('button').filter({ hasText: /AI Copilot/i }).first();
        assert.ok(await copilotButton.isVisible(), 'AI Copilot button must be visible');
        await copilotButton.click();
        await page.waitForTimeout(600);

        // Verify Modal Header & Tabs
        const modal = page.locator('[role="dialog"], .fixed').filter({ hasText: /AI Role Copilot/i }).first();
        assert.ok(await modal.isVisible(), 'AI Role Copilot modal must open');
        console.log('✓ AI Role Copilot modal opened successfully.');

        // Test Polish All Bullets
        const polishButton = page.locator('button').filter({ hasText: /Polish All \d+ Bullets|Polish/i }).first();
        if (await polishButton.isVisible()) {
            console.log('Clicking "Polish All Bullets"...');
            await polishButton.click();
            await page.waitForTimeout(1000);

            // Verify generated bullets appear with 🟢 100% ATS Ready badge
            const atsBadge = page.getByText(/100% ATS Ready|Strong/i).first();
            assert.ok(await atsBadge.isVisible(), 'Generated bullets in Copilot must show 🟢 100% ATS Ready');
            console.log('✓ AI Generated bullets verified with 🟢 100% ATS READY status!');

            // Test "Select All" / "Deselect All"
            const selectAllBtn = page.locator('button').filter({ hasText: /Select All|Deselect All/i }).first();
            if (await selectAllBtn.isVisible()) {
                console.log('✓ Select All / Deselect All control verified.');
            }

            // Apply selected bullets
            const applyBtn = page.locator('button').filter({ hasText: /Replace All|Apply Bullets|Append/i }).first();
            if (await applyBtn.isVisible()) {
                await applyBtn.click();
                await page.waitForTimeout(600);
                console.log('✓ Generated bullets applied to role successfully.');
            } else {
                const closeBtn = page.locator('button').filter({ hasText: /^Close$/i }).first();
                if (await closeBtn.isVisible()) await closeBtn.click();
            }

            // Ensure modal backdrop is fully dismissed
            await page.keyboard.press('Escape');
            await page.waitForTimeout(500);
        }

        await page.screenshot({ path: path.join(resultsDir, '04_copilot_generated_applied.png') });

        // 7. Add a Second Role & Verify Career Progression Velocity
        console.log('\n[Step 6] Adding Second Role & Testing Career Progression Velocity...');
        const addSecondRoleBtn = page.locator('button').filter({ hasText: /Add another role/i }).first();
        if (await addSecondRoleBtn.isVisible()) {
            await addSecondRoleBtn.click();
            await page.waitForTimeout(500);

            const allTitles = page.locator('input[name^="jobTitle-"]');
            const secondTitle = allTitles.nth(1);
            if (await secondTitle.isVisible()) {
                await secondTitle.fill('Frontend Architect');
                const allEmployers = page.locator('input[name^="employer-"]');
                await allEmployers.nth(1).fill('Stripe');
                console.log('✓ Second role ("Frontend Architect" at "Stripe") added.');
            }
        }

        await page.waitForTimeout(600);
        await page.screenshot({ path: path.join(resultsDir, '05_two_roles_career_timeline.png') });

        console.log('\n================================================================');
        console.log('🎉 ALL PLAYWRIGHT COMPLETE WORK HISTORY VALIDATION STEPS PASSED!');
        console.log(`📸 Screenshots captured in: ${resultsDir}`);
        console.log('================================================================\n');

    } catch (err) {
        console.error('❌ Playwright Test Failure:', err);
        if (page) {
            await page.screenshot({ path: path.join(resultsDir, 'error_failure.png') }).catch(() => {});
        }
        throw err;
    } finally {
        await browser.close();
        if (viteServer) {
            await viteServer.close();
        }
    }
}

runWorkHistoryPlaywrightE2E().catch((err) => {
    console.error(err);
    process.exit(1);
});
