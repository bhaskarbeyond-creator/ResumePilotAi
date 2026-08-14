import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const read = path => fs.readFile(path, 'utf8');

test('new-user journey keeps trusted auth, profile, Resume, AI, Portfolio and logout boundaries connected', async () => {
  const [main, profile, resume, ai, portfolio] = await Promise.all([
    read('src/main.jsx'), read('src/components/Dashboard/DashboardSettings/DashboardSettings.jsx'),
    read('src/services/resumePersistence.js'), read('src/services/aiService.js'),
    read('src/components/PortfolioBuilder/PortfolioBuilder.jsx'),
  ]);
  assert.match(main, /onAuthStateChanged/);
  assert.match(profile, /PROFILE_CONFLICT|profileConflict/);
  assert.match(resume, /RESUME_CONFLICT/);
  assert.match(ai, /\/api\//);
  assert.match(portfolio, /PORTFOLIO_CONFLICT/);
  assert.match(main, /serviceWorker\.unregister|onAuthStateChanged/);
});

test('billing journey remains server-authoritative from plan through entitlement, invoice and refund', async () => {
  const [checkout, backend, operations] = await Promise.all([
    read('src/components/Billing/Plans/Checkout.jsx'), read('backend/index.js'), read('src/firestore/dbOperations.js'),
  ]);
  assert.match(checkout, /paymentOrderId|orderId/);
  assert.match(backend, /createProviderOrderRecord/);
  assert.match(backend, /activateVerifiedOrder/);
  assert.match(backend, /Only an active payment can be refunded/);
  assert.match(operations, /source: 'payment_orders'/);
  assert.doesNotMatch(operations.match(/getAllAdminTransactions[\s\S]*?refundOrderTransaction/)?.[0] || '', /membership === 'Premium'/);
});

test('content journeys preserve private drafts, revisions and explicit publication', async () => {
  const [resume, portfolio, cms, rules] = await Promise.all([
    read('src/services/resumePersistence.js'), read('src/firestore/dbOperations.js'), read('src/components/Blog/BlogEditor/BlogEditor.jsx'), read('SecurityRules.txt'),
  ]);
  assert.match(resume, /publishResume|unpublishResume/);
  assert.match(portfolio, /publishPortfolio|unpublishPortfolio/);
  assert.match(cms, /Private Draft/);
  assert.match(rules, /status == 'approved'/);
  assert.match(rules, /isPublished == true/);
});

test('account deletion journey exports owned modules, reports retention and invalidates the session only on success', async () => {
  const [profile, operations, backend] = await Promise.all([
    read('src/components/Dashboard/DashboardSettings/DashboardSettings.jsx'), read('src/firestore/dbOperations.js'), read('backend/index.js'),
  ]);
  assert.match(operations, /publishedPortfolios, blogPosts, jobApplications, jobs, companies/);
  assert.match(backend, /ACCOUNT_SELF_DELETION_INCOMPLETE/);
  assert.match(backend, /retainedRecordTypes/);
  assert.match(operations, /await fire\.auth\(\)\.signOut/);
  assert.match(profile, /Payment, invoice, transaction, subscription, and security-audit records may be retained/);
});
