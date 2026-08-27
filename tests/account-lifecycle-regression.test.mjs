import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('account deletion removes deleted-user messaging without deleting participant-owned application history', async () => {
  // Messaging cleanup is MySQL-backed (migrated off RTDB): the deleted user's
  // participant rows and sent messages are removed transactionally, while
  // application history owned by the applicant is preserved.
  const backend = await fs.readFile('backend/index.js', 'utf8');
  assert.match(backend, /collectionGroup\('userNotifications'\)\.where\('data\.applicationId'/);
  const helper = backend.slice(backend.indexOf('async function removeDeletedUserFromRealtimeMessaging'), backend.indexOf("app.post('/api/account/delete'"));
  // Conversation membership discovered via the MySQL participant table.
  assert.match(helper, /SELECT conversation_id FROM conversation_participants WHERE user_id = \?/);
  assert.match(helper, /conversation_participants/);
  // The deleted user's participant row is removed (or the whole conversation
  // dropped when no real accounts remain).
  assert.match(helper, /DELETE FROM conversation_participants WHERE conversation_id = \? AND user_id = \?/);
  // The deleted user's sent messages are purged.
  assert.match(helper, /DELETE FROM conversation_messages WHERE conversation_id = \? AND sender_id = \?/);
  assert.match(helper, /deletedParticipantId/);
  const selfDelete = backend.slice(backend.indexOf("app.post('/api/account/delete'"), backend.indexOf('// Administrative deletion is explicit'));
  assert.match(selfDelete, /removeDeletedUserFromRealtimeMessaging\(uid\)/);
  assert.match(selfDelete, /Applications belong to their applicants/);
  assert.doesNotMatch(selfDelete, /where\('jobId'.*recursiveDelete\(application\.ref\)/s);
  const adminDelete = backend.slice(backend.indexOf("app.post(['/api/admin/delete-user'"), backend.indexOf("app.post('/api/auth/set-user-password'"));
  assert.match(adminDelete, /removeDeletedUserFromRealtimeMessaging\(targetUid, identityAdmin\)/);
  assert.match(adminDelete, /employer jobs/);
  assert.match(adminDelete, /companies/);
});

test('account export is active-UID-bound, broad, and reports partial availability truthfully', async () => {
  const [operations, backend, profile] = await Promise.all([
    fs.readFile('src/firestore/dbOperations.js', 'utf8'),
    fs.readFile('backend/index.js', 'utf8'),
    fs.readFile('src/components/Dashboard/DashboardSettings/DashboardSettings.jsx', 'utf8'),
  ]);
  // Frontend: the export is assembled by the backend API for the active UID only.
  const exported = operations.slice(operations.indexOf('export async function exportUserDataJSON'), operations.indexOf('export async function beginUserTotp2FA'));
  assert.match(exported, /uid !== authenticatedUser\.uid/);
  assert.match(exported, /\/api\/account\/export/);
  // Backend: the MySQL-assembled export covers the same broad section set.
  const exportEndpoint = backend.slice(backend.indexOf("app.post('/api/account/export'"), backend.indexOf("app.post('/api/account/delete'"));
  for (const section of ['resumes', 'portfolios', 'covers', 'favourites', 'jobTracker', 'transactions', 'notifications', 'applications', 'messaging', 'exportWarnings']) assert.match(exportEndpoint, new RegExp(section));
  // Messaging export is assembled from the MySQL participant table.
  assert.match(exportEndpoint, /SELECT conversation_id FROM conversation_participants WHERE user_id = \?/);
  assert.match(exportEndpoint, /repo\.getUser\(uid\)/);
  assert.match(profile, /Review exportWarnings in the file/);
  assert.match(profile, /notification, and messaging data will be removed/);
});
