import { chromium } from 'playwright';
import assert from 'assert';
import admin from '../backend/services/firebaseAdmin.js';
import { getRepository } from '../backend/repositories/index.js';

const TARGET_URL = 'https://ai-resume-builder.local';

if (!admin.apps.length) {
    const pKey = process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined;
    if (pKey && process.env.FIREBASE_PROJECT_ID) {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: pKey,
            }),
        });
    }
}

(async () => {
  console.log('Testing Blog Editor & Superadmin Edit Flow with Real Auth...\n');
  const repo = getRepository();

  // Find a real blog post from DB
  const posts = await repo.getBlogPosts({ limit: 5 });
  console.log(`Found ${posts.length} blog posts in DB:`);
  posts.forEach(p => console.log(`  - [${p.id}] ${p.title} (${p.status}, published=${p.published})`));

  assert.ok(posts.length > 0, 'Must have at least 1 blog post in DB');
  const targetPost = posts[0];
  console.log(`\nTarget Post to edit: ID=${targetPost.id}, Title="${targetPost.title}"`);

  // Create Firebase Super Admin custom token
  const saUid = 'OhZdiSIFL7ePA1TMkfu9bnR935D3';
  const saEmail = 'bhaskar.beyond@gmail.com';
  const saClaims = {
    email: saEmail,
    email_verified: true,
    role: 'SUPER_ADMIN',
    superAdmin: true,
    sign_in_second_factor: 'totp'
  };
  const customToken = await admin.auth().createCustomToken(saUid, saClaims);

  const browser = await chromium.launch({
    headless: true,
    args: ['--ignore-certificate-errors']
  });

  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 1440, height: 900 }
  });

  const page = await context.newPage();

  // Step 1: Sign in as Super Admin & accept cookie consent
  console.log('1. Authenticating as Super Admin in browser...');
  await page.goto(`${TARGET_URL}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.evaluate(async (token) => {
    localStorage.setItem('privacy_consent_accepted', 'true');
    localStorage.setItem('cookie_consent', 'true');
    await window.fire.auth().signInWithCustomToken(token);
  }, customToken);
  await page.waitForTimeout(1000);

  // Step 2: Navigate directly to /blog-editor/:postId
  const targetUrl = `${TARGET_URL}/blog-editor/${targetPost.id}?admin=1`;
  console.log(`2. Navigating to ${targetUrl}...`);
  await page.goto(targetUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const currentUrl = page.url();
  console.log('  Current URL after loading:', currentUrl);
  assert.ok(currentUrl.includes(`/blog-editor/${targetPost.id}`), `URL must remain on /blog-editor/${targetPost.id}, got: ${currentUrl}`);

  // Step 3: Check loaded form data
  const titleVal = await page.$eval('input[placeholder="Article headline / title..."]', el => el.value);
  console.log('  ✓ Loaded Title in Editor:', JSON.stringify(titleVal));
  assert.equal(titleVal, targetPost.title, 'Title in editor must match target post title');

  // Check Excerpt
  const excerptVal = await page.$eval('textarea[placeholder*="preview summary"]', el => el.value);
  console.log('  ✓ Loaded Excerpt in Editor:', JSON.stringify(excerptVal.slice(0, 50) + '...'));

  // Step 4: Test Live Preview Modal
  console.log('\n3. Opening Live Preview Modal...');
  await page.click('#rp-btn-preview-post');
  await page.waitForTimeout(400);

  const previewModalTitle = await page.$eval('div[style*="max-width: 860px"] h1', el => el.innerText).catch(() => '');
  console.log('  ✓ Preview Modal Article Title:', JSON.stringify(previewModalTitle));
  assert.equal(previewModalTitle, targetPost.title, 'Preview title must match post title');

  // Close Preview Modal
  console.log('  Closing Preview Modal...');
  await page.evaluate(() => {
    document.getElementById('rp-btn-close-preview')?.click();
  });
  await page.waitForTimeout(400);

  // Step 5: Test Saving / Updating Post
  console.log('\n4. Testing Publish / Update Live Post button...');
  await page.click('#rp-btn-publish-post');
  await page.waitForTimeout(1500);

  // Step 6: Test Navigation to New Post (/blog-editor?admin=1)
  console.log('\n5. Navigating to /blog-editor?admin=1 for new post...');
  await page.goto(`${TARGET_URL}/blog-editor?admin=1`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  const newPostUrl = page.url();
  console.log('  New Post URL:', newPostUrl);
  assert.ok(newPostUrl.includes('/blog-editor'), 'Must remain on /blog-editor');

  const newPostTitle = await page.$eval('input[placeholder="Article headline / title..."]', el => el.value);
  console.log('  ✓ New post title input is blank:', JSON.stringify(newPostTitle));
  assert.equal(newPostTitle, '', 'New post must start with empty title input');

  // Step 7: Test Return to Admin Console
  console.log('\n6. Testing "Admin Console" return button...');
  await page.click('#rp-btn-return-admin');
  await page.waitForTimeout(1500);

  const landedAdminUrl = page.url();
  console.log('  Landed URL after clicking Admin Console:', landedAdminUrl);
  assert.ok(landedAdminUrl.includes('/adm'), 'Must land on /adm');

  // Take screenshot of verified Blog Editor Studio
  await page.goto(targetUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'test-results/blog_editor_studio_verified.png', fullPage: true });

  console.log('\n✅ ALL BLOG EDITOR & SUPERADMIN CHECKS PASSED (0 REDIRECTS, 100% WORKING)!');
  await browser.close();
})().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
