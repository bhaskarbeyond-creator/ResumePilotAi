import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('messaging creation and profile projection are participant-bound and deterministic', async () => {
  const [backend, operations, rules] = await Promise.all([
    fs.readFile('backend/index.js', 'utf8'),
    fs.readFile('src/firestore/dbOperations.js', 'utf8'),
    fs.readFile('Realtime_database_Security_rules.txt', 'utf8'),
  ]);
  const createRoute = backend.match(/app\.post\('\/api\/messages\/conversations'[\s\S]*?\n\}\);/)?.[0] || '';
  assert.match(createRoute, /\[applicantUid, employerUid\]\.includes\(req\.user\.uid\)/);
  assert.match(createRoute, /const conversationId = lookupKey/);
  assert.match(createRoute, /conversation-participants/);
  const profileRoute = backend.match(/app\.get\('\/api\/messages\/conversations\/:conversationId\/participant-profile'[\s\S]*?\n\}\);/)?.[0] || '';
  assert.match(profileRoute, /participants\/\$\{req\.user\.uid\}/);
  assert.match(profileRoute, /safePublicUrl/);
  assert.match(profileRoute, /no-store, private/);
  assert.doesNotMatch(profileRoute, /clientSecret|authToken|email:/);
  assert.match(operations, /getConversationParticipantProfile/);
  assert.match(rules, /data\.child\('participants'\)\.child\(auth\.uid\)\.val\(\) === true/);
  assert.match(rules, /"\.write": false/);
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
