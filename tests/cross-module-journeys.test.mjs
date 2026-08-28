import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const read = path => fs.readFile(path, 'utf8');

test('new-user journey keeps trusted auth, profile, Resume, AI, Portfolio and logout boundaries connected', async () => {
  const [main, profile, resume, resumeApi, apiClient, resumeRoutes, ai, portfolio, auth] = await Promise.all([
    read('src/main.jsx'),
    read('src/components/Dashboard/DashboardSettings/DashboardSettings.jsx'),
    read('src/services/resumePersistence.js'),
    read('src/services/api/resumes.js'),
    read('src/services/api/client.js'),
    read('backend/routes/resumes.js'),
    read('src/services/aiService.js'),
    read('src/components/PortfolioBuilder/PortfolioBuilder.jsx'),
    read('src/services/api/users.js'),
  ]);
  assert.match(main, /onAuthStateChanged/);
  assert.match(profile, /PROFILE_CONFLICT|profileConflict/);
  assert.match(resume, /expectedRevision/);
  assert.match(resumeApi, /expectedRevision/);
  assert.match(resumeRoutes, /RESUME_CONFLICT/);
  assert.match(resumeRoutes, /remoteData/);
  assert.match(apiClient, /err\.remoteRevision/);
  assert.match(apiClient, /err\.remoteData/);
  assert.match(ai, /\/api\//);
  assert.match(portfolio, /PORTFOLIO_CONFLICT/);
  assert.match(main, /serviceWorker\.unregister|onAuthStateChanged/);
  assert.doesNotMatch(auth, /where\('email'|mergeUserAccounts|existingMembership|collection\('resumes'\).*oldUid/s);
  assert.match(auth, /currentUser\.uid !== userId/);
  assert.match(auth, /saveCurrentUserProfile/);
  assert.doesNotMatch(auth, /membership\s*:|membershipEnds\s*:|role\s*:/);
});

test('billing journey remains server-authoritative from plan through entitlement, invoice and refund', async () => {
  const [checkout, backend, repository, operations] = await Promise.all([
    read('src/components/Billing/Plans/Checkout.jsx'), read('backend/index.js'),
    read('backend/repositories/MySQLRepository.js'), read('src/services/api/platform.js'),
  ]);
  assert.match(checkout, /paymentOrderId|orderId/);
  assert.match(backend, /createProviderOrderRecord/);
  assert.match(backend, /activateVerifiedOrder/);
  assert.match(repository, /Only an active payment can be refunded/);
  assert.match(repository, /claimPaymentRefundAtomic/);
  assert.match(operations, /\/api\/admin\/payment-orders/);
  assert.match(backend, /source: 'payment_orders'/);
  assert.doesNotMatch(operations.match(/getAllAdminTransactions[\s\S]*?refundOrderTransaction/)?.[0] || '', /membership === 'Premium'/);
});

test('content journeys preserve private drafts, revisions and explicit publication', async () => {
  const [resume, resumeRoutes, repository, portfolio, cms] = await Promise.all([
    read('src/services/resumePersistence.js'),
    read('backend/routes/resumes.js'),
    read('backend/repositories/MySQLRepository.js'),
    read('src/services/api/platform.js'),
    read('src/components/Blog/BlogEditor/BlogEditor.jsx'),
  ]);
  assert.match(resume, /publishResume|unpublishResume/);
  assert.match(resumeRoutes, /expectedPublicationRevision/);
  assert.match(repository, /publication_mode, object, source_revision, publication_revision/);
  assert.match(repository, /SELECT \* FROM portfolios WHERE slug = \? AND is_published = 1/);
  assert.match(repository, /published = 1/);
  assert.match(portfolio, /publishPortfolio|unpublishPortfolio/);
  assert.match(cms, /Private Draft/);
});

test('account deletion journey exports owned modules, reports retention and invalidates the session only on success', async () => {
  const [profile, operations, backend, deletion] = await Promise.all([
    read('src/components/Dashboard/DashboardSettings/DashboardSettings.jsx'),
    read('src/services/api/platform.js'),
    read('backend/index.js'),
    read('backend/services/accountDeletion.js'),
  ]);
  assert.match(backend, /repo\.getResumes\(uid\)/);
  assert.match(backend, /repo\.getPortfolios\(uid\)/);
  assert.match(backend, /repo\.getFavourites\(uid\)/);
  assert.match(deletion, /ACCOUNT_IDENTITY_DELETE_FAILED/);
  assert.match(deletion, /IDENTITY_PENDING/);
  assert.match(deletion, /retainedRecordTypes/);
  const deleteFunction = operations.slice(
    operations.indexOf('export async function deleteUserAccountPermanently'),
    operations.indexOf('export async function exportUserDataJSON'),
  );
  assert.match(deleteFunction, /if \(!response\.ok \|\| !data\?\.success\) throw/);
  assert.match(deleteFunction, /await fire\.auth\(\)\.signOut/);
  assert.match(profile, /Payment, invoice, transaction, subscription, and security-audit records may be retained/);
});
