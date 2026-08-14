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

test('user CSV export neutralizes spreadsheet formulas', async () => {
  const users = await fs.readFile('src/components/admin/usersManager/UsersManager.jsx', 'utf8');
  assert.match(users, /\^\[=\+\\-@\]/);
  assert.match(users, /revokeObjectURL/);
});
