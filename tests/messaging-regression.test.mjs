import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('messaging creation and profile projection are participant-bound and deterministic', async () => {
  // Messaging lives in MySQL (migrated off Firebase Realtime Database). These
  // assertions target the current implementation's security properties:
  // participant-bound creation, deterministic conversation ids, and a
  // secret-free, non-cacheable participant projection.
  const [backend, operations] = await Promise.all([
    fs.readFile('backend/index.js', 'utf8'),
    fs.readFile('src/services/api/platform.js', 'utf8'),
  ]);
  const createRoute = backend.match(/app\.post\('\/api\/messages\/conversations'[\s\S]*?\n\}\);/)?.[0] || '';
  // Only the applicant or the employer may open the conversation.
  assert.match(createRoute, /\[applicantUid, employerUid\]\.includes\(req\.user\.uid\)/);
  // Deterministic conversation id (sha256 over the sorted participant pair)
  // makes concurrent creation idempotent.
  assert.match(createRoute, /createHash\('sha256'\)\.update\(participants\.join/);
  // Participants are persisted to the MySQL conversation_participants table.
  assert.match(createRoute, /INSERT IGNORE INTO conversation_participants/);
  const profileRoute = backend.match(/app\.get\('\/api\/messages\/conversations\/:conversationId\/participant-profile'[\s\S]*?\n\}\);/)?.[0] || '';
  // Membership is verified against the participant table before any projection.
  assert.match(profileRoute, /SELECT 1 FROM conversation_participants WHERE conversation_id = \? AND user_id = \?/);
  assert.match(profileRoute, /safePublicUrl/);
  assert.match(profileRoute, /no-store, private/);
  // The projection must not leak credentials or contact details.
  assert.doesNotMatch(profileRoute, /clientSecret|authToken|email:/);
  assert.match(operations, /getConversationParticipantProfile/);
});

test('message UI owns realtime cleanup, rejects stale account work, and confirms backend sends', async () => {
  const [messages, dialog] = await Promise.all([
    fs.readFile('src/components/Dashboard/DashboardMessages/DashboardMessages.jsx', 'utf8'),
    fs.readFile('src/components/Dashboard/EmployerDashboard/SendMessageDialog.jsx', 'utf8'),
  ]);
  assert.match(messages, /unsubscribeConversationsRef\.current\?\.\(\)/);
  assert.match(messages, /unsubscribeMessagesRef\.current\?\.\(\)/);
  assert.match(messages, /activeAccountUidRef\.current !== userId/);
  assert.match(messages, /if \(!result\.success\) throw new Error/);
  assert.doesNotMatch(messages, /getUserData\(otherUserId\)/);
  assert.match(dialog, /role="dialog"/);
  assert.match(dialog, /aria-modal="true"/);
  assert.match(dialog, /generation !== requestGeneration\.current/);
  assert.match(dialog, /if \(!messageResult\.success\)/);
});
