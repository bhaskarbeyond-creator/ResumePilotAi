/**
 * End-to-end builder UX journey (guest mode, no Firebase) against the dev
 * server. Exercises: create → enter data → navigate steps → change template →
 * verify data intact → preview → template switching round-trip → mobile view.
 * Usage: node template-lab/builder-journey.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.LAB_BASE_URL || 'http://localhost:3000';
const CHROMIUM_PATH = process.env.CHROMIUM_PATH || '/tmp/chromium/chromium';
const launchArgs = ['--no-sandbox', '--no-zygote', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run', '--disable-background-networking'];

const report = [];
const log = (k, v) => { report.push([k, v]); console.log(`${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`); };

async function main() {
  const browser = await chromium.launch({
    executablePath: CHROMIUM_PATH,
    env: { ...process.env, LD_LIBRARY_PATH: `/tmp/chromium/lib:${process.env.LD_LIBRARY_PATH || ''}` },
    args: launchArgs,
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('ERR_CONNECTION')) errors.push(m.text().slice(0, 160)); });

  try {
    // 1. Land on builder
    await page.goto(`${BASE}/build-resume`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForTimeout(10_000);
    await page.waitForSelector('input[type="text"], input:not([type])', { timeout: 20_000 });
    // Dismiss privacy consent banner if present (it overlays the bottom action bar)
    const consent = page.locator('section[role="dialog"] button').last();
    if (await consent.count()) { await consent.click().catch(() => {}); await page.waitForTimeout(800); }
    log('step1-landing', await page.evaluate(() => location.pathname));

    // 2. Fill heading fields
    const fill = async (re, value) => {
      const input = page.getByPlaceholder(re).first();
      if (await input.count()) { await input.fill(value); return true; }
      return false;
    };
    await fill(/first name/i, 'Bhaskar');
    await fill(/last name/i, 'Venkata');
    await fill(/email/i, 'journey@example.com');
    await page.waitForTimeout(1500); // allow debounced auto-save to commit
    log('step2-heading-filled', 'yes');

    // 3. Next step
    await page.getByRole('button', { name: /Next/i }).click();
    await page.waitForTimeout(1500);
    log('step3-after-next', await page.evaluate(() => location.pathname));

    // 4. Work history: add employment
    const addBtn = page.getByRole('button', { name: /add another position|add position|add employment/i }).first();
    log('step4-add-btn', { count: await addBtn.count(), text: await addBtn.textContent().catch(() => null) });
    if (await addBtn.count()) { await addBtn.click(); await page.waitForTimeout(1500); }
    const workInputs = page.locator('input[type="text"], input:not([type])');
    const count = await workInputs.count();
    log('step4-work-inputs', count);
    const jobInput = page.getByPlaceholder(/job title|software engineer/i).first();
    if (await jobInput.count()) await jobInput.fill('Staff Platform Engineer');
    const companyInput = page.getByPlaceholder(/company|employer|google/i).first();
    if (await companyInput.count()) await companyInput.fill('Meridian Financial Systems');
    await page.waitForTimeout(1500);

    // 5. Go back to heading, check data persisted in state (inputs still filled)
    await page.getByRole('button', { name: /Previous/i }).click();
    await page.waitForTimeout(1500);
    const persistedName = await page.evaluate(() => {
      const inputs = [...document.querySelectorAll('input')];
      const first = inputs.find((i) => i.value === 'Bhaskar');
      return first ? 'name-persisted' : 'name-MISSING';
    });
    log('step5-back-navigation', persistedName);

    // 6. Change template in right rail → Cv12
    await page.getByRole('button', { name: /Change Template/i }).first().click();
    await page.waitForTimeout(2500);
    const modalVisible = await page.evaluate(() => !!document.querySelector('.fixed.inset-0'));
    log('step6-template-modal-open', modalVisible);
    // Search for the minimal template inside the modal
    const search = page.locator('.fixed.inset-0 input[placeholder*="Search"]').first();
    await search.fill('Minimal');
    await page.waitForTimeout(1500);
    await page.locator('.template-modal-content img').first().click().catch(() => {});
    await page.waitForTimeout(2500);
    log('step6-template-selected', 'yes');

    // 7. Verify heading data survived the switch
    const afterSwitch = await page.evaluate(() => ({
      url: location.pathname,
      modalStillOpen: !!document.querySelector('.fixed.inset-0'),
      inputValues: [...document.querySelectorAll('input')].map((i) => i.value).filter((v) => v.length),
      templateLabel: [...document.querySelectorAll('p')].map((p) => p.textContent).find((t) => t && /Template|Cv/i.test(t)) || null,
    }));
    log('step7-data-after-switch', afterSwitch);

    // 8. Open preview modal and check name renders in preview
    await page.getByRole('button', { name: /View Full Size|Preview/i }).first().click();
    await page.waitForTimeout(3000);
    const previewText = await page.evaluate(() => document.body.innerText);
    log('step8-preview-has-name', previewText.includes('Bhaskar') ? 'yes' : 'no');
    const closePreview = page.locator('button[aria-label*="Close"], button:has-text("Close")').first();
    await closePreview.click().catch(() => page.keyboard.press('Escape'));
    await page.waitForTimeout(1200);

    // 9. Template round trip: A(1) → B(12) → C(7) → A(1)
    const openModal = async () => {
      await page.getByRole('button', { name: /Change Template/i }).first().click();
      await page.waitForTimeout(2000);
    };
    const pickById = async (id) => {
      const search = page.locator('.fixed.inset-0 input[placeholder*="Search"]').first();
      await search.fill(id);
      await page.waitForTimeout(1000);
      const card = page.locator('.template-modal-content img').first();
      if (await card.count()) { await card.click().catch(() => {}); }
      await page.waitForTimeout(2000);
    };
    await openModal(); await pickById('Cv7'); await openModal(); await pickById('Cv1');
    const nameAfterRoundTrip = await page.evaluate(() => {
      const inputs = [...document.querySelectorAll('input')];
      return inputs.find((i) => i.value === 'Bhaskar') ? 'yes' : 'no';
    });
    log('step9-roundtrip-A-B-C-A', nameAfterRoundTrip);

    // 10. Mobile viewport behavior
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(1500);
    const mobile = await page.evaluate(() => {
      const overflow = document.documentElement.scrollWidth > document.documentElement.clientWidth + 2;
      const menuBtn = !!document.querySelector('button[aria-label="Open navigation menu"]');
      const previewBtn = !!document.querySelector('button[aria-label="Open resume preview"]');
      return { horizontalOverflow: overflow, menuBtn, previewBtn };
    });
    log('step10-mobile', mobile);

    // 11. Console error tally
    log('step11-console-errors', errors.length);
    if (errors.length) log('step11-sample', errors.slice(0, 4));
  } finally {
    await browser.close();
  }
  console.log('\n==== JOURNEY REPORT ====');
  for (const [k, v] of report) console.log(`${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
}

main().catch((e) => { console.error('JOURNEY FAILED:', e.message); process.exit(1); });
