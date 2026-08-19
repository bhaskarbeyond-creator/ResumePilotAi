import { chromium } from 'playwright';
import { createServer } from 'vite';
import assert from 'node:assert/strict';

async function runInterviewCoachBrowserAudit() {
    console.log('=== Starting Real Playwright AI Interview Coach Browser Validation ===');
    const vite = await createServer({
        server: { port: 0, host: '127.0.0.1', strictPort: false },
        logLevel: 'error',
    });
    const server = await vite.listen();
    const port = server.config.server.port;
    const base = `http://127.0.0.1:${port}`;
    console.log(`Vite test server listening on ${base}`);

    const browser = await chromium.launch({
        args: ['--no-sandbox', '--no-zygote', '--disable-gpu', '--disable-dev-shm-usage'],
    });

    try {
        const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

        // Mock AI question generation endpoint
        await page.route('**/api/generate-interview', async (route) => {
            const mockExam = {
                title: 'Senior React Engineer Assessment',
                totalQuestions: 5,
                duration: '15 minutes',
                questions: [
                    {
                        id: 1,
                        question: 'What is the primary benefit of React hooks?',
                        options: [
                            'State and lifecycle methods in functional components',
                            'Faster DOM rendering than virtual DOM',
                            'Elimination of JavaScript closures',
                            'Direct compilation to machine code',
                        ],
                        correctAnswer: 0,
                        category: 'React Fundamentals',
                        difficulty: 'Intermediate',
                        explanation: 'Hooks allow functional components to manage local state and lifecycle side-effects.',
                        estimatedTime: 120,
                    },
                    {
                        id: 2,
                        question: 'How do you prevent unnecessary re-renders in child components?',
                        options: [
                            'React.memo or useMemo/useCallback',
                            'Using setTimeout',
                            'Writing code without JSX',
                            'Calling forceUpdate()',
                        ],
                        correctAnswer: 0,
                        category: 'Performance',
                        difficulty: 'Intermediate',
                        explanation: 'React.memo memoizes rendered output based on shallow prop comparisons.',
                        estimatedTime: 120,
                    },
                    {
                        id: 3,
                        question: 'What is the purpose of the key prop in lists?',
                        options: [
                            'Helps React identify which items have changed, been added, or removed',
                            'Styles the list element',
                            'Encrypts item data',
                            'Enforces strict TypeScript types',
                        ],
                        correctAnswer: 0,
                        category: 'React Core',
                        difficulty: 'Easy',
                        explanation: 'Keys give elements a stable identity across renders.',
                        estimatedTime: 90,
                    },
                    {
                        id: 4,
                        question: 'Explain the difference between useEffect and useLayoutEffect.',
                        options: [
                            'useLayoutEffect runs synchronously after all DOM mutations',
                            'useEffect runs before DOM rendering',
                            'They are completely identical',
                            'useLayoutEffect is deprecated',
                        ],
                        correctAnswer: 0,
                        category: 'Advanced React',
                        difficulty: 'Hard',
                        explanation: 'useLayoutEffect fires synchronously after DOM mutations before browser paint.',
                        estimatedTime: 180,
                    },
                    {
                        id: 5,
                        question: 'How do you handle global state efficiently in large apps?',
                        options: [
                            'Global context / Redux / Zustand stores',
                            'Window object global variables',
                            'Prop drilling 20 levels deep',
                            'Using eval()',
                        ],
                        correctAnswer: 0,
                        category: 'Architecture',
                        difficulty: 'Advanced',
                        explanation: 'Modern state management libraries provide selector-based subscriptions.',
                        estimatedTime: 150,
                    },
                ],
            };
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(mockExam),
            });
        });

        console.log('\nStep 1: Navigating to Interview Coach Lab...');
        await page.goto(`${base}/template-lab/interview-coach.html`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => document.documentElement.getAttribute('data-lab-state') === 'ready', null, { timeout: 15000 });
        await page.waitForTimeout(500);

        // Verify Setup UI Elements
        console.log('Step 2: Auditing Setup Configuration UI...');
        const heading = await page.textContent('h1');
        console.log(`Audited Heading: "${heading}"`);
        assert.ok(heading.includes('Interview Coach') || heading.includes('AI Interview'), `Expected heading, got "${heading}"`);

        // Check target role input
        const roleInput = page.locator('input[placeholder="Software Engineer"]');
        assert.ok(await roleInput.isVisible(), 'Target role input is visible');
        await roleInput.fill('Senior React Engineer');

        // Check Interview Type dropdown
        const typeSelect = page.locator('select').first();
        assert.ok(await typeSelect.isVisible(), 'Interview type selector is visible');
        await typeSelect.selectOption('technical');

        // Check Question Count dropdown
        const questionCountSelect = page.locator('select').nth(3);
        await questionCountSelect.selectOption('5');

        // Check Duration Presets
        const preset15 = page.locator('button:has-text("15 min")');
        assert.ok(await preset15.isVisible(), '15 min preset is visible');
        await preset15.click();

        // Check Start Interview Button
        const startBtn = page.locator('button:has-text("Start interview")');
        assert.ok(await startBtn.isVisible(), 'Start interview button is visible');
        assert.ok(await startBtn.isEnabled(), 'Start button is enabled after entering occupation');

        console.log('Step 3: Simulating Question Fetch & Starting CBT Exam...');
        await startBtn.click();
        await page.waitForTimeout(600);

        console.log('Step 4: Auditing CBT Exam Interface...');
        // Verify CBT Header and Timer
        const cbtHeader = page.locator('header p:has-text("Computer Based Test")');
        assert.ok(await cbtHeader.isVisible(), 'CBT header is visible');

        const timer = page.locator('[role="timer"]');
        assert.ok(await timer.isVisible(), 'Timer is visible and active');
        const timerText = await timer.textContent();
        console.log(`Live Timer value: ${timerText}`);
        assert.ok(timerText.includes(':'), 'Timer shows formatted MM:SS');

        // Verify Question 1 of 5
        const qCounter = page.locator('text=Question 1 of 5');
        assert.ok(await qCounter.isVisible(), 'Question counter 1 of 5 is visible');

        // Answer Question 1 (Option A)
        const optionA = page.locator('label:has-text("A.")').first();
        await optionA.click();
        console.log('Answered Question 1 (Option A)');

        // Click "Save & Next"
        const nextBtn = page.locator('button:has-text("Save & Next")');
        await nextBtn.click();
        await page.waitForTimeout(300);

        // Verify on Question 2 of 5
        assert.ok(await page.locator('text=Question 2 of 5').isVisible(), 'Advanced to Question 2');

        // Mark Question 2 for Review
        const markBtn = page.locator('button:has-text("Mark for Review")');
        await markBtn.click();
        console.log('Marked Question 2 for review');

        // Navigate back to Question 1 via "Previous"
        const prevBtn = page.locator('button:has-text("Previous")');
        await prevBtn.click();
        await page.waitForTimeout(300);

        // Verify Question 1 answer is still selected
        const radio1 = page.locator('input[type="radio"]').first();
        assert.ok(await radio1.isChecked(), 'Question 1 answer was preserved across navigation');

        // Navigate to Question 5 directly via palette
        const paletteBtn5 = page.locator('aside button:has-text("5")');
        await paletteBtn5.click();
        await page.waitForTimeout(300);
        assert.ok(await page.locator('text=Question 5 of 5').isVisible(), 'Direct palette navigation jumped to Question 5');

        // Answer Question 5
        const optionA_Q5 = page.locator('label:has-text("A.")').first();
        await optionA_Q5.click();
        console.log('Answered Question 5');

        console.log('Step 5: Testing Mobile Responsiveness (< 1024px)...');
        // Resize viewport to mobile (375x667)
        await page.setViewportSize({ width: 375, height: 667 });
        await page.waitForTimeout(400);

        // On mobile, palette button is in header
        const mobilePaletteBtn = page.locator('button:has-text("Palette")');
        assert.ok(await mobilePaletteBtn.isVisible(), 'Mobile palette button is visible on 375px');
        await mobilePaletteBtn.click();
        await page.waitForTimeout(300);

        // Drawer is open
        const closePaletteBtn = page.locator('button:has-text("Close palette")');
        assert.ok(await closePaletteBtn.isVisible(), 'Mobile palette drawer opened successfully');
        await closePaletteBtn.click();
        await page.waitForTimeout(300);

        // Restore viewport to desktop
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.waitForTimeout(300);

        console.log('Step 6: Submitting Assessment and Verifying Confirmation Modal...');
        const submitBtn = page.locator('button:has-text("Submit")').first();
        await submitBtn.click();
        await page.waitForTimeout(300);

        const modalTitle = page.locator('#submit-title:has-text("Submit assessment?")');
        assert.ok(await modalTitle.isVisible(), 'Confirmation modal is visible');

        const submitNowBtn = page.locator('button:has-text("Submit now")');
        await submitNowBtn.click();
        await page.waitForTimeout(800);

        console.log('Step 7: Auditing Assessment Report Screen...');
        const reportTitle = page.locator('h1:has-text("Assessment report")');
        assert.ok(await reportTitle.isVisible(), 'Assessment report screen is displayed');

        // Check report metrics cards
        const overallScore = await page.locator('text=Overall').locator('..').textContent();
        console.log(`Report metric card: ${overallScore}`);
        assert.ok(overallScore.includes('%'), 'Overall score formatted with percentage');

        // Check question analysis accordion
        const questionAnalysis = page.locator('summary:has-text("Q1:")');
        assert.ok(await questionAnalysis.isVisible(), 'Question 1 analysis summary is rendered');
        await questionAnalysis.click();
        await page.waitForTimeout(200);
        assert.ok(await page.locator('text=Ideal structure:').first().isVisible(), 'Question analysis expanded');

        console.log('Step 8: Testing Refresh / Reopen Persistence...');
        const backBtn = page.locator('button:has-text("Back")');
        await backBtn.click();
        await page.waitForTimeout(500);

        // Verify history list displays the completed session
        const historyItem = page.locator('text=Senior React Engineer');
        assert.ok(await historyItem.isVisible(), 'Completed interview is recorded in Previous interviews history');

        const openReportBtn = page.locator('button:has-text("Open report")').first();
        assert.ok(await openReportBtn.isVisible(), 'Open report link is available in history');
        await openReportBtn.click();
        await page.waitForTimeout(400);

        assert.ok(await page.locator('h1:has-text("Assessment report")').isVisible(), 'Reopened assessment report successfully from history');

        console.log('\n=== REAL PLAYWRIGHT BROWSER VALIDATION PASSED (100%) ===\n');
    } finally {
        await browser.close();
        await server.close();
        await vite.close();
    }
}

runInterviewCoachBrowserAudit().catch(err => {
    console.error('Browser validation failed:', err);
    process.exit(1);
});
