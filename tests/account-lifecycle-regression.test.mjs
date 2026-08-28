import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('account deletion is transactional, removes deleted-user messaging, and preserves other applicants history', async () => {
  const [backend, deletion, migration] = await Promise.all([
    fs.readFile('backend/index.js', 'utf8'),
    fs.readFile('backend/services/accountDeletion.js', 'utf8'),
    fs.readFile('backend/database/migrations/001_baseline.sql', 'utf8'),
  ]);

  assert.match(deletion, /beginTransaction\(\)/);
  assert.match(deletion, /connection\.commit\(\)/);
  assert.match(deletion, /connection\.rollback/);
  assert.match(deletion, /DELETE FROM conversation_participants WHERE user_id = \?/);
  assert.match(deletion, /DELETE FROM conversation_messages WHERE sender_id = \?/);
  assert.match(deletion, /LEFT JOIN conversation_participants/);

  // A deleting applicant's personal submission is removed. A deleting employer
  // does not erase another participant's application record: the listing becomes
  // a non-public tombstone so its foreign-key reference and history survive.
  assert.match(deletion, /DELETE FROM applications WHERE applicant_id = \?/);
  assert.doesNotMatch(deletion, /DELETE FROM applications WHERE applicant_id = \? OR employer_id = \?/);
  assert.match(deletion, /UPDATE applications SET notes = '', rating = 0/);
  assert.match(deletion, /UPDATE jobs SET status = 'DELETED'/);
  assert.doesNotMatch(deletion, /DELETE FROM jobs WHERE employer_id = \?/);
  assert.match(migration, /FOREIGN KEY \(job_id\) REFERENCES jobs\(id\) ON DELETE CASCADE/);

  const selfDelete = backend.slice(backend.indexOf("app.post('/api/account/delete'"), backend.indexOf('// Administrative deletion is explicit'));
  assert.match(selfDelete, /accountDeletion\.requestDeletion/);
  assert.match(selfDelete, /other applicants retain their history/);
  const adminDelete = backend.slice(backend.indexOf("app.post(['/api/admin/delete-user'"), backend.indexOf("app.post('/api/auth/set-user-password'"));
  assert.match(adminDelete, /accountDeletion\.requestDeletion/);
  assert.match(adminDelete, /identityAdmin/);
});

test('account export is active-UID-bound, broad, and reports partial availability truthfully', async () => {
  const [operations, backend, profile] = await Promise.all([
    fs.readFile('src/services/api/platform.js', 'utf8'),
    fs.readFile('backend/index.js', 'utf8'),
    fs.readFile('src/components/Dashboard/DashboardSettings/DashboardSettings.jsx', 'utf8'),
  ]);
  // Frontend: the export is assembled by the backend API for the active UID only.
  const exported = operations.slice(operations.indexOf('export async function exportUserDataJSON'), operations.indexOf('export async function beginUserTotp2FA'));
  assert.match(exported, /uid !== authenticatedUser\.uid/);
  assert.match(exported, /\/api\/account\/export/);

  const exportEndpoint = backend.slice(backend.indexOf("app.post('/api/account/export'"), backend.indexOf("app.post('/api/account/delete'"));
  for (const section of ['resumes', 'portfolios', 'covers', 'favourites', 'jobTracker', 'transactions', 'notifications', 'applications', 'messaging', 'exportWarnings']) {
    assert.match(exportEndpoint, new RegExp(section));
  }
  assert.match(exportEndpoint, /readSection/);
  assert.match(exportEndpoint, /status: 'UNAVAILABLE'/);
  assert.match(exportEndpoint, /status: 'PARTIAL'/);
  assert.match(exportEndpoint, /SELECT conversation_id FROM conversation_participants WHERE user_id = \?/);
  assert.match(exportEndpoint, /repo\.getUser\(uid\)/);
  assert.match(exportEndpoint, /Cache-Control', 'no-store, private'/);
  assert.match(profile, /Review exportWarnings in the file/);
  assert.match(profile, /notification, and messaging data will be removed/);
});
