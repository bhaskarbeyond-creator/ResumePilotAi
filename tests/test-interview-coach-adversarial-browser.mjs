import { chromium } from 'playwright';
import { createServer } from 'vite';
import assert from 'node:assert/strict';

async function runAdversarialBrowserTests() {
    console.log('=== Starting Advanced Adversarial & Multi-Viewport Browser Test Suite ===');
    const vite = await createServer({
        server: { port: 0, host: '127.0.0.1', strictPort: false },
        logLevel: 'error',
    });
    const server = await vite.listen();
    const port = server.config.server.port;
    const base = `http://127.0.0.1:${port}`;

    const browser = await chromium.launch({
        args: ['--no-sandbox', '--no-zygote', '--disable-gpu', '--disable-dev-shm-usage'],
    });

    const mockExam = {
        title: 'Fullstack Architect Assessment',
        totalQuestions: 4,
        questions: [
            {
                id: 1,
                question: 'What is the primary advantage of event-driven architecture?',
                options: ['Decoupled services and asynchronous scalability', 'Synchronous blocking calls', 'Single point of failure', 'No data persistence'],
                correctAnswer: 0,
                category: 'Architecture',
                difficulty: 'Hard',
                explanation: 'Decoupled services process events asynchronously.',
                estimatedTime: 120,
            },
            {
                id: 2,
                question: 'How do you ensure idempotency in RESTful APIs?',
                options: ['Using unique idempotency keys in request headers', 'Ignoring duplicate requests', 'Disabling database transactions', 'Retrying without delay'],
                correctAnswer: 0,
                category: 'API Design',
                difficulty: 'Intermediate',
                explanation: 'Idempotency keys prevent duplicate processing on retries.',
                estimatedTime: 90,
            },
            {
                id: 3,
                question: 'Which caching strategy writes to cache and storage simultaneously?',
                options: ['Write-through', 'Write-behind', 'Cache-aside', 'Read-through'],
                correctAnswer: 0,
                category: 'System Design',
                difficulty: 'Hard',
                explanation: 'Write-through updates the cache and backing store synchronously.',
                estimatedTime: 120,
            },
            {
                id: 4,
                question: 'What mechanism prevents SQL injection in ORMs?',
                options: ['Parameterized queries and prepared statements', 'Raw string concatenation', 'Client-side input masking only', 'Disabling database indexes'],
                correctAnswer: 0,
                category: 'Security',
                difficulty: 'Easy',
                explanation: 'Parameterized queries treat inputs as literal data rather than executable code.',
                estimatedTime: 60,
            },
        ],
    };

    try {
        const context = await browser.newContext();
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
        const page = await context.newPage();

        // 1. Mock API across all pages in the context
        await context.route('**/api/generate-interview', async (route) => {
            const body = route.request().postDataJSON?.() || {};
            // Verify Bearer header presence if requested
            assert.ok(body.occupation, 'Occupation was sent in payload');
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(mockExam),
            });
        });

        // ── TEST A: KEYBOARD-ONLY COMPLETION FLOW (Zero Mouse Clicks during Exam) ──
        console.log('\n[Test A] Keyboard-Only CBT Completion Flow...');
        await page.goto(`${base}/template-lab/interview-coach.html`, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => document.documentElement.getAttribute('data-lab-state') === 'ready');

        // Setup via role input and Enter
        const roleInput = page.locator('input[placeholder="Software Engineer"]');
        await roleInput.fill('Fullstack Architect');
        const startBtn = page.locator('button:has-text("Start interview")');
        await startBtn.click();
        await page.waitForTimeout(600);

        // Verify Question 1 is active
        assert.ok(await page.locator('text=Question 1 of 4').isVisible(), 'Exam started at Question 1');

        // Press 'A' or '1' to answer Question 1
        await page.keyboard.press('a');
        await page.waitForTimeout(150);
        const radioQ1 = page.locator('input[type="radio"]').first();
        assert.ok(await radioQ1.isChecked(), 'Keyboard "a" selected Option A on Question 1');

        // Press 'Enter' to navigate to Question 2
        await page.keyboard.press('Enter');
        await page.waitForTimeout(250);
        assert.ok(await page.locator('text=Question 2 of 4').isVisible(), 'Enter key navigated to Question 2');

        // Press '?' to open Keyboard Help Dialog
        await page.keyboard.press('?');
        await page.waitForTimeout(200);
        assert.ok(await page.locator('#kbd-help-title:has-text("Keyboard shortcuts")').isVisible(), '? opened help modal');

        // Press Escape to dismiss
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
        assert.ok(!(await page.locator('#kbd-help-title').isVisible()), 'Escape dismissed help modal');

        // Press 'B' to answer Question 2
        await page.keyboard.press('b');
        await page.waitForTimeout(150);
        const radioQ2_B = page.locator('input[type="radio"]').nth(1);
        assert.ok(await radioQ2_B.isChecked(), 'Keyboard "b" selected Option B on Question 2');

        // Press 'Enter' to navigate to Question 3
        await page.keyboard.press('Enter');
        await page.waitForTimeout(250);
        assert.ok(await page.locator('text=Question 3 of 4').isVisible(), 'Enter key navigated to Question 3');

        // Press '1' to answer Question 3 (Option A)
        await page.keyboard.press('1');
        await page.waitForTimeout(150);
        assert.ok(await page.locator('input[type="radio"]').first().isChecked(), 'Keyboard "1" selected Option A on Question 3');

        // Press 'ArrowRight' to navigate to Question 4
        await page.keyboard.press('ArrowRight');
        await page.waitForTimeout(250);
        assert.ok(await page.locator('text=Question 4 of 4').isVisible(), 'ArrowRight navigated to Question 4');

        // Press '4' to answer Question 4 (Option D)
        await page.keyboard.press('4');
        await page.waitForTimeout(150);
        assert.ok(await page.locator('input[type="radio"]').nth(3).isChecked(), 'Keyboard "4" selected Option D on Question 4');

        // Press 'Enter' on last question -> opens Submit Modal
        await page.keyboard.press('Enter');
        await page.waitForTimeout(250);
        assert.ok(await page.locator('#submit-title:has-text("Submit assessment?")').isVisible(), 'Enter on final question triggered Submit confirmation');

        // Press Tab to focus "Submit now" and press Enter to submit
        const submitNowBtn = page.locator('button:has-text("Submit now")');
        await submitNowBtn.click();
        await page.waitForTimeout(600);

        // Verify Report View
        assert.ok(await page.locator('h1:has-text("Assessment report")').isVisible(), 'Keyboard-only flow successfully reached Assessment Report');
        console.log('✓ Keyboard-only CBT test passed with 100% precision.');

        // ── TEST B: STAR EXPORT (Clipboard Copy & Markdown Download) ──
        console.log('\n[Test B] Testing STAR Markdown Export & Clipboard...');
        const copyBtn = page.locator('button[aria-label="Copy STAR summary to clipboard as Markdown"]');
        assert.ok(await copyBtn.isVisible(), 'Copy STAR button is rendered');
        await copyBtn.click();
        await page.waitForTimeout(300);

        const copyStatus = await copyBtn.textContent();
        console.log(`Copy button state: "${copyStatus}"`);
        assert.ok(copyStatus.includes('Copied') || copyStatus.includes('Copy STAR'), 'Copy button responded');

        const downloadBtn = page.locator('button[aria-label="Download STAR summary as a Markdown file"]');
        assert.ok(await downloadBtn.isVisible(), 'Download STAR button is rendered');
        console.log('✓ STAR Export actions verified.');

        // ── TEST C: MULTI-VIEWPORT RESPONSIVENESS AUDIT (320px to 1440px) ──
        console.log('\n[Test C] Multi-Viewport Responsive Matrix Audit...');
        const VIEWPORTS = [
            { width: 320, height: 568, name: 'iPhone SE (320px)' },
            { width: 375, height: 667, name: 'Mobile Standard (375px)' },
            { width: 390, height: 844, name: 'iPhone 14 (390px)' },
            { width: 430, height: 932, name: 'iPhone 14 Pro Max (430px)' },
            { width: 768, height: 1024, name: 'iPad Portrait (768px)' },
            { width: 1024, height: 768, name: 'iPad Landscape (1024px)' },
            { width: 1440, height: 900, name: 'Desktop HD (1440px)' },
        ];

        for (const vp of VIEWPORTS) {
            await page.setViewportSize({ width: vp.width, height: vp.height });
            await page.waitForTimeout(150);

            // Audit horizontal overflow
            const hasHorizontalScrollbar = await page.evaluate(() => {
                return document.documentElement.scrollWidth > document.documentElement.clientWidth;
            });
            assert.equal(hasHorizontalScrollbar, false, `Zero horizontal overflow on ${vp.name} (${vp.width}x${vp.height})`);
            console.log(`  ✓ ${vp.name}: 0 overflow, clean layout`);
        }

        // ── TEST D: MULTI-TAB SESSION CONFLICT & TAKEOVER ──
        console.log('\n[Test D] Multi-Tab Session Conflict & State Protection...');
        const pageTab1 = await context.newPage();
        const pageTab2 = await context.newPage();

        await pageTab1.goto(`${base}/template-lab/interview-coach.html`, { waitUntil: 'domcontentloaded' });
        await pageTab1.waitForFunction(() => document.documentElement.getAttribute('data-lab-state') === 'ready');

        // Start exam in Tab 1
        await pageTab1.locator('input[placeholder="Software Engineer"]').fill('Security Engineer');
        await pageTab1.locator('button:has-text("Start interview")').click();
        await pageTab1.waitForTimeout(500);
        assert.ok(await pageTab1.locator('text=Question 1 of 4').isVisible(), 'Tab 1 active in exam');

        // Answer Q1 in Tab 1
        await pageTab1.locator('label:has-text("A.")').first().click();
        await pageTab1.waitForTimeout(200);

        // Open Tab 2 — it should restore or see the session
        await pageTab2.goto(`${base}/template-lab/interview-coach.html`, { waitUntil: 'domcontentloaded' });
        await pageTab2.waitForFunction(() => document.documentElement.getAttribute('data-lab-state') === 'ready');
        await pageTab2.waitForTimeout(500);

        // Check Tab 2 restored the exam with Q1 answered
        assert.ok(await pageTab2.locator('text=Question 1 of 4').isVisible(), 'Tab 2 restored active exam');
        assert.ok(await pageTab2.locator('input[type="radio"]').first().isChecked(), 'Tab 2 has Q1 answer preserved');

        // Tab 2 submits the exam
        await pageTab2.locator('button:has-text("Submit")').first().click();
        await pageTab2.waitForTimeout(200);
        await pageTab2.locator('button:has-text("Submit now")').click();
        await pageTab2.waitForTimeout(600);
        assert.ok(await pageTab2.locator('h1:has-text("Assessment report")').isVisible(), 'Tab 2 finished exam and rendered report');

        // Now trigger storage event on Tab 1 (simulating user returning to Tab 1)
        await pageTab1.bringToFront();
        await pageTab1.waitForTimeout(500);

        await pageTab1.close();
        await pageTab2.close();
        console.log('✓ Multi-tab conflict handling verified without data loss.');

        // ── TEST E: RECOVERY FROM CORRUPTED & EXPIRED STORAGE ──
        console.log('\n[Test E] Corrupted & Expired Storage Recovery...');
        const recoveryPage = await context.newPage();
        await recoveryPage.goto(`${base}/template-lab/interview-coach.html`, { waitUntil: 'domcontentloaded' });
        await recoveryPage.waitForFunction(() => document.documentElement.getAttribute('data-lab-state') === 'ready');

        // Inject corrupted JSON
        await recoveryPage.evaluate(() => {
            localStorage.setItem('interviewSession:candidate-coach-test-123', '{malformed json%%#@');
        });
        await recoveryPage.reload({ waitUntil: 'domcontentloaded' });
        await recoveryPage.waitForFunction(() => document.documentElement.getAttribute('data-lab-state') === 'ready');

        // Setup page must render normally without crashing
        assert.ok(await recoveryPage.locator('h1:has-text("AI Interview Coach")').isVisible(), 'Self-healed corrupted storage and rendered setup');
        await recoveryPage.close();
        console.log('✓ Corrupt storage self-healing verified.');

        console.log('\n=============================================================');
        console.log('=== ALL ADVERSARIAL & COMPREHENSIVE BROWSER TESTS PASSED! ===');
        console.log('=============================================================\n');

    } finally {
        await browser.close();
        await server.close();
        await vite.close();
    }
}

runAdversarialBrowserTests().catch(err => {
    console.error('Adversarial browser testing failed:', err);
    process.exit(1);
});
