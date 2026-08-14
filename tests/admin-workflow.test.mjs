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
  const [operations, users, employers, backend] = await Promise.all([
    fs.readFile('src/firestore/dbOperations.js', 'utf8'),
    fs.readFile('src/components/admin/usersManager/UsersManager.jsx', 'utf8'),
    fs.readFile('src/components/admin/employerApplications/EmployerApplications.jsx', 'utf8'),
    fs.readFile('backend/index.js', 'utf8'),
  ]);
  assert.match(operations, /expectedSuspended/);
  assert.match(operations, /expectedMembership/);
  assert.match(operations, /expectedStatus/);
  assert.match(users, /role="alertdialog"/);
  assert.match(users, /The current target state will be verified/);
  assert.match(employers, /A reason is required/);
  assert.match(backend, /ADMIN_TARGET_CHANGED/);
  assert.match(backend, /USER_DELETION_INCOMPLETE/);
  assert.match(backend, /blog_posts/);
  assert.match(backend, /SYSTEM_HEALTH_SETTINGS_UPDATED/);
});

test('generic admin settings use audited backend persistence without cross-account browser cache or secret responses', async () => {
  const [operations, backend, rules, email] = await Promise.all([
    fs.readFile('src/firestore/dbOperations.js', 'utf8'),
    fs.readFile('backend/index.js', 'utf8'),
    fs.readFile('SecurityRules.txt', 'utf8'),
    fs.readFile('src/components/admin/settings/EmailSmtpSettings.jsx', 'utf8'),
  ]);
  assert.doesNotMatch(operations, /localStorage\.(?:getItem|setItem)\('system_settings_cache'/);
  assert.match(operations, /\/api\/admin\/settings\//);
  assert.match(backend, /ADMIN_SETTINGS_UPDATED/);
  assert.match(backend, /ADMIN_SETTINGS_CONFLICT/);
  assert.match(operations, /expectedRevision/);
  assert.match(backend, /publicAdminSettings/);
  assert.match(rules, /admin_configuration/);
  assert.match(email, /if \(!response\.ok \|\| !result\.success\)/);
});

test('job moderation is stale-safe, audited, confirmation-gated, and preserves applications', async () => {
  const [jobs, operations, backend, rules] = await Promise.all([
    fs.readFile('src/components/admin/jobsManager/JobsManager.jsx', 'utf8'),
    fs.readFile('src/firestore/dbOperations.js', 'utf8'),
    fs.readFile('backend/index.js', 'utf8'),
    fs.readFile('SecurityRules.txt', 'utf8'),
  ]);
  assert.doesNotMatch(jobs, /window\.confirm|createNotification/);
  assert.match(jobs, /role="alertdialog"/);
  assert.match(jobs, /expectedUpdatedAt/);
  assert.match(jobs, /setTimeout\(\(\) => this\.loadJobs\(1\), 350\)/);
  assert.match(operations, /\/api\/admin\/jobs\//);
  assert.match(backend, /JOB_STATUS_UPDATED/);
  assert.match(backend, /JOB_HAS_APPLICATIONS/);
  assert.match(backend, /transaction\.get\(applicationsQuery\)/);
  assert.doesNotMatch(rules.match(/match \/jobs\/\{id\}[\s\S]*?match \/jobApplications/)?.[0] || '', /allow update: if admin\(\)/);
});

test('company moderation is backend-only, stale-safe, reasoned, and confirmation-gated', async () => {
  const [companies, operations, backend, rules] = await Promise.all([
    fs.readFile('src/components/admin/companyManagement/CompanyManagement.jsx', 'utf8'),
    fs.readFile('src/firestore/dbOperations.js', 'utf8'),
    fs.readFile('backend/index.js', 'utf8'),
    fs.readFile('SecurityRules.txt', 'utf8'),
  ]);
  assert.match(companies, /role="alertdialog"/);
  assert.match(companies, /A reason is required/);
  assert.match(companies, /sanitizeImageUrl/);
  assert.match(operations, /\/api\/admin\/companies\//);
  assert.match(backend, /COMPANY_STATUS_UPDATED/);
  assert.match(backend, /expectedFeatured/);
  assert.doesNotMatch(rules.match(/match \/companies\/\{id\}[\s\S]*?match \/jobs/)?.[0] || '', /allow update: if admin\(\)/);
});

test('review and rating administration is validated, confirmed, audited, and backend-only', async () => {
  const [reviews, operations, backend, rules] = await Promise.all([
    fs.readFile('src/components/admin/reviews/Reviews.jsx', 'utf8'),
    fs.readFile('src/firestore/dbOperations.js', 'utf8'),
    fs.readFile('backend/index.js', 'utf8'),
    fs.readFile('SecurityRules.txt', 'utf8'),
  ]);
  assert.match(reviews, /role="alertdialog"/);
  assert.match(reviews, /validRatings/);
  assert.match(operations, /\/api\/admin\/reviews/);
  assert.match(backend, /REVIEW_CREATED/);
  assert.match(backend, /REVIEW_DELETED/);
  assert.match(backend, /GLOBAL_RATING_UPDATED/);
  assert.match(rules, /match \/reviews\/\{id\}[^\n]+allow write: if false/);
});

test('user CSV export neutralizes spreadsheet formulas', async () => {
  const users = await fs.readFile('src/components/admin/usersManager/UsersManager.jsx', 'utf8');
  assert.match(users, /\^\[=\+\\-@\]/);
  assert.match(users, /revokeObjectURL/);
});
