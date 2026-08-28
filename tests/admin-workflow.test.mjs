import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { formatAdminMoney, normalizeAdminMetrics, normalizeAdminSubscription } from '../src/utils/adminData.js';

test('admin subscription normalization preserves legacy aliases without inventing active status', () => {
  const active = normalizeAdminSubscription({ userId: 'u1', type: 'Premium', sbsEnd: new Date('2030-01-01'), paimentType: 'razorpay' }, 0, new Date('2029-01-01'));
  assert.equal(active.plan, 'Premium');
  assert.equal(active.paymentProvider, 'razorpay');
  assert.equal(active.status, 'active');
  assert.equal(active.active, true);
  const unknown = normalizeAdminSubscription({ userId: 'u2', type: 'Basic' });
  assert.equal(unknown.status, 'unknown');
  assert.equal(unknown.active, false);
  const expired = normalizeAdminSubscription({ uid: 'u3', membershipEnds: new Date('2020-01-01') }, 2, new Date('2029-01-01'));
  assert.equal(expired.status, 'expired');
});

test('admin metrics report unavailable values and format only authoritative finite amounts', () => {
  const metrics = normalizeAdminMetrics({ numberOfUsers: '12', numberOfResumesCreated: 'bad' }, { amount: 42.5, currency: 'INR' });
  assert.equal(metrics.users, 12);
  assert.equal(metrics.resumes, null);
  assert.match(formatAdminMoney(metrics.earnings, metrics.currency), /42\.50|42\.5/);
  assert.equal(formatAdminMoney(null), 'Unavailable');
});

test('admin UI removes invented health and trend claims and uses verified summaries', async () => {
  const [shell, dashboard, settings, health, sidebar] = await Promise.all([
    fs.readFile('src/components/admin/Admin.jsx', 'utf8'),
    fs.readFile('src/components/admin/dashboard/dashboard.jsx', 'utf8'),
    fs.readFile('src/components/admin/settings/Settings.jsx', 'utf8'),
    fs.readFile('src/components/admin/settings/SystemHealthSettings.jsx', 'utf8'),
    fs.readFile('src/components/admin/sidebar/sidebar.jsx', 'utf8'),
  ]);
  assert.doesNotMatch(shell, /SYSTEM ONLINE|admin@projectdemo\.guru/);
  assert.match(shell, /\/healthz/);
  assert.doesNotMatch(dashboard, /\+12%|\+15%|Live metrics/);
  assert.match(dashboard, /no trend inferred/);
  assert.doesNotMatch(settings, /Operational \(100%\)|Enterprise Mailer Ready|API Key Missing/);
  assert.match(health, /configured\. It does not claim live provider success/);
  assert.doesNotMatch(sidebar, /geminiApiKey|stripePublishableKey|smtp.*password/s);
});

test('administrative user and employer changes carry stale-target preconditions and confirmations', async () => {
  const [operations, users, employers, backend, deletion] = await Promise.all([
    fs.readFile('src/services/api/platform.js', 'utf8'),
    fs.readFile('src/components/admin/usersManager/UsersManager.jsx', 'utf8'),
    fs.readFile('src/components/admin/employerApplications/EmployerApplications.jsx', 'utf8'),
    fs.readFile('backend/index.js', 'utf8'),
    fs.readFile('backend/services/accountDeletion.js', 'utf8'),
  ]);
  assert.match(operations, /expectedSuspended/);
  assert.match(operations, /expectedMembership/);
  assert.match(operations, /expectedStatus/);
  assert.match(users, /role="alertdialog"/);
  assert.match(users, /The current target state will be verified/);
  assert.match(employers, /A reason is required/);
  assert.match(backend, /ADMIN_TARGET_CHANGED/);
  assert.match(deletion, /ACCOUNT_IDENTITY_DELETE_FAILED/);
  assert.match(deletion, /IDENTITY_PENDING/);
  assert.match(deletion, /UPDATE blog SET author_id = NULL/);
  assert.match(backend, /SYSTEM_HEALTH_SETTINGS_UPDATED/);
});

test('generic admin settings use audited backend persistence without cross-account browser cache or secret responses', async () => {
  const [operations, backend, policy, migration, email] = await Promise.all([
    fs.readFile('src/services/api/platform.js', 'utf8'),
    fs.readFile('backend/index.js', 'utf8'),
    fs.readFile('backend/security/policy.js', 'utf8'),
    fs.readFile('backend/database/migrations/001_baseline.sql', 'utf8'),
    fs.readFile('src/components/admin/settings/EmailSmtpSettings.jsx', 'utf8'),
  ]);
  assert.doesNotMatch(operations, /localStorage\.(?:getItem|setItem)\('system_settings_cache'/);
  assert.match(operations, /\/api\/admin\/settings\//);
  assert.match(backend, /ADMIN_SETTINGS_UPDATED/);
  assert.match(backend, /ADMIN_SETTINGS_CONFLICT/);
  assert.match(operations, /expectedRevision/);
  assert.match(backend, /publicAdminSettings/);
  assert.match(backend, /INSERT INTO system_settings/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS system_settings/);
  assert.match(policy, /'\/admin\/'/);
  assert.match(policy, /system\.config\.write/);
  assert.match(email, /if \(!response\.ok \|\| !result\.success\)/);
});

test('job moderation is stale-safe, audited, confirmation-gated, and preserves applications', async () => {
  const [jobs, operations, index, mutations, policy] = await Promise.all([
    fs.readFile('src/components/admin/jobsManager/JobsManager.jsx', 'utf8'),
    fs.readFile('src/services/api/platform.js', 'utf8'),
    fs.readFile('backend/index.js', 'utf8'),
    fs.readFile('backend/services/resilientMutations.js', 'utf8'),
    fs.readFile('backend/security/policy.js', 'utf8'),
  ]);
  const backend = index + '\n' + mutations;
  assert.doesNotMatch(jobs, /window\.confirm|createNotification/);
  assert.match(jobs, /role="alertdialog"/);
  assert.match(jobs, /expectedUpdatedAt/);
  assert.match(jobs, /setTimeout\(\(\) => this\.loadJobs\(1\), 350\)/);
  assert.match(operations, /\/api\/admin\/jobs\//);
  assert.match(backend, /JOB_STATUS_UPDATED/);
  assert.match(backend, /JOB_HAS_APPLICATIONS/);
  assert.match(backend, /resilientMutations\.deleteJob/);
  assert.match(policy, /ADMIN_PREFIXES[\s\S]*'\/admin\/'/);
  assert.match(policy, /hasPermission\(req, 'system\.config\.write'\)/);
});

test('company moderation is backend-only, stale-safe, reasoned, and confirmation-gated', async () => {
  const [companies, operations, indexSrc, mutationsSrc, policy] = await Promise.all([
    fs.readFile('src/components/admin/companyManagement/CompanyManagement.jsx', 'utf8'),
    fs.readFile('src/services/api/platform.js', 'utf8'),
    fs.readFile('backend/index.js', 'utf8'),
    fs.readFile('backend/services/resilientMutations.js', 'utf8'),
    fs.readFile('backend/security/policy.js', 'utf8'),
  ]);
  const backend = indexSrc + '\n' + mutationsSrc;
  assert.match(companies, /role="alertdialog"/);
  assert.match(companies, /A reason is required/);
  assert.match(companies, /sanitizeImageUrl/);
  assert.match(operations, /\/api\/admin\/companies\//);
  assert.match(backend, /COMPANY_STATUS_UPDATED/);
  assert.match(backend, /expectedFeatured/);
  assert.match(policy, /ADMIN_PREFIXES[\s\S]*'\/admin\/'/);
  assert.match(policy, /system\.config\.write/);
});

test('review and rating administration is validated, confirmed, audited, and backend-only', async () => {
  const [reviews, operations, backend, policy] = await Promise.all([
    fs.readFile('src/components/admin/reviews/Reviews.jsx', 'utf8'),
    fs.readFile('src/services/api/platform.js', 'utf8'),
    fs.readFile('backend/index.js', 'utf8'),
    fs.readFile('backend/security/policy.js', 'utf8'),
  ]);
  assert.match(reviews, /role="alertdialog"/);
  assert.match(reviews, /validRatings/);
  assert.match(operations, /\/api\/admin\/reviews/);
  assert.match(backend, /REVIEW_CREATED/);
  assert.match(backend, /REVIEW_DELETED/);
  assert.match(backend, /GLOBAL_RATING_UPDATED/);
  assert.match(policy, /ADMIN_PREFIXES[\s\S]*'\/admin\/'/);
  assert.match(policy, /system\.config\.write/);
});

test('contact messages expose truthful loading, error, search, filter, pagination, and accessible expansion states', async () => {
  const [messages, operations] = await Promise.all([
    fs.readFile('src/components/admin/messages/Messages.jsx', 'utf8'),
    fs.readFile('src/services/api/platform.js', 'utf8'),
  ]);
  assert.doesNotMatch(messages, /console\.log|>Search<|>Filter</);
  assert.match(messages, /PAGE_SIZE = 20/);
  assert.match(messages, /aria-expanded/);
  assert.match(messages, /role="alert"/);
  // Contact messages are read through the backend API (MySQL contact_messages).
  assert.match(operations, /apiJson\('\/api\/contact'/);
  assert.match(operations, /\/api\/messages\/conversations/);
});

test('Trusted By lifecycle is relational, revisioned, publish-aware, audited, sanitized, and backend-only', async () => {
  const [adminView, publicView, operations, backend, repository, policy] = await Promise.all([
    fs.readFile('src/components/admin/TrustedBy/TrustedBy.jsx', 'utf8'),
    fs.readFile('src/components/Dashboard2/elements/HomepageTrustedBy.jsx', 'utf8'),
    fs.readFile('src/services/api/platform.js', 'utf8'),
    fs.readFile('backend/index.js', 'utf8'),
    fs.readFile('backend/repositories/MySQLRepository.js', 'utf8'),
    fs.readFile('backend/security/policy.js', 'utf8'),
  ]);
  assert.match(adminView, /role="alertdialog"/);
  assert.match(adminView, /Private draft/);
  assert.match(publicView, /sanitizeImageUrl/);
  assert.match(operations, /includeUnpublished/);
  assert.match(backend, /TRUSTED_LOGO_CREATED/);
  assert.match(backend, /TRUSTED_LOGO_UPDATED/);
  assert.match(backend, /TRUSTED_LOGO_DELETED/);
  assert.match(backend, /getTrustedBy\(\{ publishedOnly: true/);
  assert.match(repository, /UPDATE trusted_by[\s\S]*WHERE id = \? AND revision = \?/);
  assert.match(repository, /DATABASE_OWNERSHIP_VIOLATION/);
  assert.doesNotMatch(backend, /listDocuments\('trusted_by'/);
  assert.match(policy, /ADMIN_PREFIXES[\s\S]*'\/admin\/'/);
});

test('landing marketing content is evidence-backed, revisioned, confirmed, audited, and separate from counters', async () => {
  const [view, operations, backend, statsRoutes, platformRoutes, hero] = await Promise.all([
    fs.readFile('src/components/admin/landingPages/LandingPages.jsx', 'utf8'),
    fs.readFile('src/services/api/platform.js', 'utf8'),
    fs.readFile('backend/index.js', 'utf8'),
    fs.readFile('backend/routes/miscData.js', 'utf8'),
    fs.readFile('backend/routes/platform.js', 'utf8'),
    fs.readFile('src/components/JobsLanding/JobsLandingHero.jsx', 'utf8'),
  ]);
  assert.match(view, /Evidence URL/);
  assert.match(view, /reviewed again within 180 days/);
  assert.match(view, /role="alertdialog"/);
  assert.doesNotMatch(view, /10,000\+|50,000\+|2,500\+|4\.8/);
  assert.match(operations, /landingMarketing/);
  assert.match(operations, /Authoritative landing marketing content is unavailable/);
  assert.match(backend, /LANDING_MARKETING_PUBLISHED/);
  assert.match(backend, /LANDING_MARKETING_EVIDENCE_REQUIRED/);
  assert.doesNotMatch(statsRoutes, /router\.post\('\/stats'/);
  assert.match(platformRoutes, /repo\.getSetting\('public_config'\)/);
  assert.match(platformRoutes, /_settingsSource: 'mariadb'/);
  assert.doesNotMatch(hero, /10,000\+|4\.8/);
});

test('billing admin uses authoritative ledgers without inferred user/subscription payments or fabricated invoices', async () => {
  const [operations, invoices, backend, repository] = await Promise.all([
    fs.readFile('src/services/api/platform.js', 'utf8'),
    fs.readFile('src/components/admin/settings/subscriptionsSettings.jsx', 'utf8'),
    fs.readFile('backend/index.js', 'utf8'),
    fs.readFile('backend/repositories/MySQLRepository.js', 'utf8'),
  ]);
  const ledger = operations.match(/export async function getAllAdminTransactions\(\)[\s\S]*?export async function refundOrderTransaction/)?.[0] || '';
  assert.match(ledger, /\/api\/admin\/payment-orders/);
  assert.match(invoices, /isAuthoritativeInvoice/);
  assert.match(invoices, /isAuthoritativeCreditNote/);
  assert.match(invoices, /printAuthoritativeInvoice/);
  assert.match(invoices, /printAuthoritativeCreditNote/);
  assert.doesNotMatch(ledger, /collection\(['"]users['"]\)|collection\(['"]subscriptions['"]\)|price \|\| 199|Date\.now/);
  assert.doesNotMatch(operations, /subscriptions_cache/);
  assert.doesNotMatch(invoices, /Server-Verified Payment Receipt/);
  assert.match(invoices, /inv\.source === 'payment_orders'/);
  assert.match(invoices, /Multiple currencies/);
  assert.match(repository, /Only an active payment can be refunded/);
  assert.match(repository, /WHERE id = \? FOR UPDATE/);
  assert.match(backend, /executeOrReconcileProviderRefund/);
});

test('maintenance configuration is enforced by the web shell with a claim-based admin bypass', async () => {
  const [main, health] = await Promise.all([
    fs.readFile('src/main.jsx', 'utf8'),
    fs.readFile('src/components/admin/settings/SystemHealthSettings.jsx', 'utf8'),
  ]);
  assert.match(main, /maintenance\.enabled && !maintenance\.admin/);
  assert.match(main, /getIdTokenResult/);
  assert.match(main, /startsWith\('\/adm'\)/);
  assert.match(health, /web shell blocks non-admin routes/);
});

test('user CSV export neutralizes spreadsheet formulas', async () => {
  const users = await fs.readFile('src/components/admin/usersManager/UsersManager.jsx', 'utf8');
  assert.match(users, /\^\[=\+\\-@\]/);
  assert.match(users, /revokeObjectURL/);
});
