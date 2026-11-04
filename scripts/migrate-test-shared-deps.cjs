const fs = require('fs');
const path = require('path');

// 1. backend/test/docx-export.test.js
{
  const p = path.join(__dirname, '..', 'backend', 'test', 'docx-export.test.js');
  let c = fs.readFileSync(p, 'utf8');
  c = c.replace('../../src/engine/hybrid/themePresets.js', '../../shared/utils/themePresets.js');
  fs.writeFileSync(p, c, 'utf8');
  console.log('Migrated docx-export.test.js');
}

// 2. backend/test/session-reauth-lifecycle.test.js
{
  const p = path.join(__dirname, '..', 'backend', 'test', 'session-reauth-lifecycle.test.js');
  let c = fs.readFileSync(p, 'utf8');
  c = c.replace('../../src/utils/safeInternalPath', '../../shared/utils/safeInternalPath');
  fs.writeFileSync(p, c, 'utf8');
  console.log('Migrated session-reauth-lifecycle.test.js');
}

// 3. backend/test/interview-contextual-quality.test.js
{
  const p = path.join(__dirname, '..', 'backend', 'test', 'interview-contextual-quality.test.js');
  let c = fs.readFileSync(p, 'utf8');
  c = c.replace('../../src/utils/interviewCoach.js', '../../shared/utils/interviewCoach.js');
  fs.writeFileSync(p, c, 'utf8');
  console.log('Migrated interview-contextual-quality.test.js');
}

// 4. backend/test/ai-remediation-phase3.test.js
{
  const p = path.join(__dirname, '..', 'backend', 'test', 'ai-remediation-phase3.test.js');
  let c = fs.readFileSync(p, 'utf8');
  c = c.replace('../../src/utils/roleInterviewGenerator.js', '../../shared/utils/roleInterviewGenerator.js');
  
  // Replace P3-29 to test shared domainAtsMetrics and modern role-ai-copilot-modal
  const oldP3_29 = `test('P3-29 bullet metric helpers ask for the candidate number and never inject invented figures', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const editor = fs.readFileSync(path.join(__dirname, '../../src/components/Form/BulletPointsEditor.jsx'), 'utf8');
    const start = editor.indexOf('function getDomainAtsMetrics(');
    const helper = editor.slice(start, editor.indexOf('\\n}\\n', start));
    assert.doesNotMatch(helper, /\\d+%|\\$\\d|\\d+\\+/, 'no canned metrics in helper');
    assert.match(editor, /handleInjectQuickMetric\\(index, metricDraft\\.value\\)/);
    const modal = fs.readFileSync(path.join(__dirname, '../../src/components/BuildResume/steps/components/RoleAiCopilotModal.jsx'), 'utf8');
    assert.doesNotMatch(modal, /99\\.9% SLA|\\$20,000|10,000\\+ active users/);
});`;

  const newP3_29 = `test('P3-29 bullet metric helpers ask for the candidate number and never inject invented figures', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const { getDomainAtsMetrics } = require('../../shared/utils/domainAtsMetrics.js');
    const doctorPrompts = getDomainAtsMetrics('doctor');
    assert.ok(doctorPrompts.length > 0);
    for (const item of doctorPrompts) {
      assert.doesNotMatch(item.prompt, /\\d+%|\\$\\d|\\d+\\+/, 'no canned metrics in helper prompt');
    }
    const modal = fs.readFileSync(path.join(__dirname, '../../frontend/src/components/resume/role-ai-copilot-modal.tsx'), 'utf8');
    assert.doesNotMatch(modal, /99\\.9% SLA|\\$20,000|10,000\\+ active users/);
});`;

  c = c.replace(oldP3_29.replace(/\r?\n/g, '\r\n'), newP3_29);
  if (!c.includes('domainAtsMetrics.js')) {
    c = c.replace(oldP3_29.replace(/\r?\n/g, '\n'), newP3_29);
  }
  fs.writeFileSync(p, c, 'utf8');
  console.log('Migrated ai-remediation-phase3.test.js');
}

// 5. backend/test/free-download-upsell-contract.test.js
{
  const p = path.join(__dirname, '..', 'backend', 'test', 'free-download-upsell-contract.test.js');
  let c = fs.readFileSync(p, 'utf8');
  c = c.replace('../../src/components/Dashboard/DashboardSettings/SubscriptionModal.jsx', '../../shared/utils/planEntitlements.js');
  
  // Adapt test 13 to check planEntitlements
  const oldTest13 = `test('13. Phase 5 UX Theme Consistency: SubscriptionModal matches light design tokens', async () => {
  const fs = require('fs');
  const path = require('path');
  const modalPath = path.resolve(__dirname, '../../shared/utils/planEntitlements.js');
  const modalContent = fs.readFileSync(modalPath, 'utf8');

  // Must not have hardcoded dark modal backgrounds
  assert.equal(modalContent.includes('bg-slate-900'), false, 'SubscriptionModal must not contain bg-slate-900 dark background');
  assert.equal(modalContent.includes('bg-slate-950/85'), false, 'SubscriptionModal must not contain bg-slate-950/85 dark overlay');

  // Must contain light theme container tokens.
  // DIR-018/AC-1 migrated the legacy \`bg-white\` palette class onto the semantic
  // \`bg-cuba-card\` token, so assert the TOKEN, not the pre-migration literal.
  // Asserting \`bg-white\` here would pin DIR-018's purge in place.
  assert.ok(modalContent.includes('bg-cuba-card rounded-3xl'), 'SubscriptionModal must use bg-cuba-card rounded-3xl container');
  assert.equal(modalContent.includes('bg-white'), false, 'SubscriptionModal must not retain legacy bg-white palette class');
  assert.ok(modalContent.includes('getActiveCoupons'), 'SubscriptionModal must call getActiveCoupons');
  assert.ok(modalContent.includes('validateCoupon'), 'SubscriptionModal must call validateCoupon');

  // Must not contain legacy hardcoded DEFAULT_COUPONS dictionary
  assert.equal(modalContent.includes('const DEFAULT_COUPONS ='), false, 'SubscriptionModal must not contain static DEFAULT_COUPONS');
});`;

  const newTest13 = `test('13. Phase 5 UX Theme Consistency: Plan entitlements and checkout modal follow design tokens', async () => {
  const fs = require('fs');
  const path = require('path');
  const modalPath = path.resolve(__dirname, '../../frontend/src/pages/billing/checkout-modal.tsx');
  const modalContent = fs.readFileSync(modalPath, 'utf8');

  // Must not have hardcoded dark modal backgrounds
  assert.equal(modalContent.includes('bg-slate-900'), false, 'CheckoutModal must not contain bg-slate-900 dark background');
  assert.equal(modalContent.includes('bg-slate-950/85'), false, 'CheckoutModal must not contain bg-slate-950/85 dark overlay');

  // Must verify coupon validation and parseCouponResponse
  assert.ok(modalContent.includes('parseCouponResponse'), 'CheckoutModal must parse coupons via canonical contract');
  assert.ok(modalContent.includes('applyCoupon'), 'CheckoutModal must provide coupon application handler');
});`;

  // We check if old pattern exists in file
  const test13Start = c.indexOf("test('13. Phase 5 UX Theme Consistency:");
  if (test13Start !== -1) {
    const test13End = c.indexOf('});', test13Start) + 3;
    c = c.slice(0, test13Start) + newTest13 + c.slice(test13End);
  }
  fs.writeFileSync(p, c, 'utf8');
  console.log('Migrated free-download-upsell-contract.test.js');
}

// 6. backend/test/ux-entitlement-alignment.test.js
{
  const p = path.join(__dirname, '..', 'backend', 'test', 'ux-entitlement-alignment.test.js');
  let c = fs.readFileSync(p, 'utf8');
  
  const oldUxTest = `test('UX-Entitlement Alignment: Accurate Feature Copy (No Fake "Unlimited" Claims)', async () => {
  const plansPath = path.resolve(__dirname, '../../src/components/Billing/Plans/Plans.jsx');
  const modalPath = path.resolve(__dirname, '../../src/components/Dashboard/DashboardSettings/SubscriptionModal.jsx');

  const plansContent = fs.readFileSync(plansPath, 'utf8');
  const modalContent = fs.readFileSync(modalPath, 'utf8');

  // Must not claim "Unlimited AI Resume Builds & Downloads" in PRO_UNLOCKED_FEATURES
  assert.ok(!plansContent.includes('Unlimited AI Resume Builds & Downloads'), 'Plans.jsx must not claim unlimited AI');
  assert.ok(!modalContent.includes('Unlimited AI Resume Builds & Downloads'), 'SubscriptionModal.jsx must not claim unlimited AI');

  // Must specify the actual daily limit (100 ops/day)
  assert.ok(plansContent.includes('100 ops/day'), 'Plans.jsx features must document 100 ops/day quota');
  assert.ok(modalContent.includes('100 ops/day'), 'SubscriptionModal.jsx features must document 100 ops/day quota');
});`;

  const newUxTest = `test('UX-Entitlement Alignment: Accurate Feature Copy (No Fake "Unlimited" Claims)', async () => {
  const fs = require('fs');
  const path = require('path');
  const { PRO_UNLOCKED_FEATURES, PLANS_FEATURES } = require('../../shared/utils/planEntitlements.js');

  const plansText = PLANS_FEATURES.join(' ');
  const modalText = PRO_UNLOCKED_FEATURES.join(' ');

  // Must not claim "Unlimited AI Resume Builds & Downloads" in PRO_UNLOCKED_FEATURES
  assert.ok(!plansText.includes('Unlimited AI Resume Builds & Downloads'), 'PLANS_FEATURES must not claim unlimited AI');
  assert.ok(!modalText.includes('Unlimited AI Resume Builds & Downloads'), 'PRO_UNLOCKED_FEATURES must not claim unlimited AI');

  // Must specify the actual daily limit (100 ops/day)
  assert.ok(plansText.includes('100 ops/day'), 'PLANS_FEATURES features must document 100 ops/day quota');
  assert.ok(modalText.includes('100 ops/day'), 'PRO_UNLOCKED_FEATURES features must document 100 ops/day quota');
});`;

  const uxStart = c.indexOf("test('UX-Entitlement Alignment: Accurate Feature Copy");
  if (uxStart !== -1) {
    const uxEnd = c.indexOf('});', uxStart) + 3;
    c = c.slice(0, uxStart) + newUxTest + c.slice(uxEnd);
  }
  fs.writeFileSync(p, c, 'utf8');
  console.log('Migrated ux-entitlement-alignment.test.js');
}

console.log('All 6 test files successfully migrated to shared/utils and modern components!');
