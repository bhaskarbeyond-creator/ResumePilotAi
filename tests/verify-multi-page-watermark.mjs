import { chromium } from 'playwright';

async function testMultiPageWatermark() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1200, height: 1600 } });

  // Generate large dataset that forces 3 pages in SmartResumeComposer
  const experiences = Array.from({ length: 12 }, (_, i) => ({
    id: `exp_${i}`,
    title: `Senior Principal Enterprise Architect - Division ${i + 1}`,
    company: `Global Systems Technologies Corporation ${i + 1}`,
    startDate: `201${Math.min(i, 9)}-01`,
    endDate: i === 0 ? '' : `202${Math.min(i, 6)}-01`,
    current: i === 0,
    city: 'San Francisco, CA',
    description: `Led end-to-end cloud migrations, microservice transformations, enterprise IAM integration, high-scale transaction queuing with distributed consensus algorithms, automated test harness pipelines, multi-region database failover, and global performance optimization for enterprise Fortune 500 platforms.`
  }));

  const educations = Array.from({ length: 6 }, (_, i) => ({
    id: `edu_${i}`,
    institution: `Prestigious Institute of Technology ${i + 1}`,
    studyType: 'Master of Science',
    area: 'Computer Science and Distributed Systems Engineering',
    startDate: `200${i}-09`,
    endDate: `200${i + 2}-06`,
    score: '3.98 GPA'
  }));

  const mockMultiPageResume = {
    firstname: 'Dr. Alexander',
    lastname: 'Vanderbilt',
    occupation: 'Distinguished Systems Architect & Fellow',
    email: 'alexander.vanderbilt@enterprise.org',
    phone: '+1 (555) 349-2910',
    city: 'San Francisco, CA',
    summary: 'Distinguished engineering fellow with two decades of experience designing mission-critical distributed architectures, resilient multi-tenant databases, real-time sync daemons, and zero-trust security platforms.',
    workExperiences: experiences,
    education: educations,
    skills: [
      { id: 's1', name: 'Distributed Consensus & Raft', level: 'Master' },
      { id: 's2', name: 'MariaDB Replication & Outbox Patterns', level: 'Master' },
      { id: 's3', name: 'High-Scale Node.js Concurrency', level: 'Master' },
      { id: 's4', name: 'Zero-Trust IAM & Multi-Factor Auth', level: 'Master' }
    ],
    _watermark: {
      enableFreeWatermark: true,
      watermarkText: 'Created with IME365 (Free Plan)',
      opacity: 0.2,
      position: 'diagonal'
    }
  };

  // Render using Vite dev server or by injecting into page
  // Let's use the export rendering page or shared page with injected state
  console.log('Testing multi-page watermark in live browser context...');
  
  // We can test against export route with a mock token or by creating a temporary multi-page published resume
  const mysqlMod = await import('../backend/database/mysql.js');
  const getPool = mysqlMod.getPool || mysqlMod.default?.getPool;
  const pool = getPool();

  const tempResumeId = 'res_multipage_test_' + Date.now();
  await pool.query(
    'INSERT INTO public_resumes (id, owner_uid, is_published, publication_mode, object, source_revision, publication_revision, published_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, 1, NOW(), NOW())',
    [tempResumeId, 'user-proof-001', 1, 'explicit', JSON.stringify(mockMultiPageResume)]
  );

  console.log(`Created multi-page public resume: ${tempResumeId}`);

  try {
    await page.goto(`https://ai-resume-builder.local/shared/${tempResumeId}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const pages = page.locator('.smart-resume-page');
    const pageCount = await pages.count();
    console.log(`Rendered Resume Page Count: ${pageCount}`);

    const watermarks = page.locator('[data-testid="resume-watermark-overlay"]');
    const watermarkCount = await watermarks.count();
    console.log(`Rendered Watermark Count: ${watermarkCount}`);

    for (let i = 0; i < pageCount; i++) {
      const pageEl = pages.nth(i);
      const wmInPage = pageEl.locator('[data-testid="resume-watermark-overlay"]');
      const hasWm = (await wmInPage.count()) === 1;
      const isVisible = await wmInPage.isVisible();
      console.log(`Page ${i + 1}: Watermark present: ${hasWm}, Visible: ${isVisible}`);
    }

    await page.screenshot({ path: 'test-results/browser-verification/multi-page-watermark.png', fullPage: true });
    console.log('Saved multi-page screenshot: test-results/browser-verification/multi-page-watermark.png');
  } finally {
    await pool.query('DELETE FROM public_resumes WHERE id = ?', [tempResumeId]);
    await pool.end();
    await browser.close();
  }
}

testMultiPageWatermark().catch(err => {
  console.error(err);
  process.exit(1);
});
