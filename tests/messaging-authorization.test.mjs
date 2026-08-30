import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const routeBlock = (source, signature) => {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `${signature} must exist`);
  const next = source.indexOf('\n});', start);
  return source.slice(start, next + 4);
};

test('conversation lists and messages are selected through caller membership', async () => {
  const source = await fs.readFile('backend/routes/messaging.js', 'utf8');
  const list = routeBlock(source, "router.get('/messages/conversations'");
  assert.match(list, /JOIN conversation_participants cp ON cp\.conversation_id = c\.id/);
  assert.match(list, /cp\.user_id = \?/);
  assert.match(list, /\[uid\]/);

  const messages = routeBlock(source, "router.get('/messages/conversations/:conversationId/messages'");
  assert.match(messages, /conversation_participants/);
  assert.match(messages, /user_id = \?/);
  assert.match(messages, /req\.user\.uid/);
});

test('message writes reject non-participants and derive sender identity from the verified token', async () => {
  const source = await fs.readFile('backend/routes/messaging.js', 'utf8');
  const send = routeBlock(source, "router.post('/messages/send'");
  assert.match(send, /conversation_participants/);
  assert.match(send, /req\.user\.uid/);
  assert.doesNotMatch(send, /senderId\s*=\s*req\.body/);
  assert.match(send, /INSERT INTO conversation_messages/);
});

test('conversation creation is limited to the application parties and idempotent', async () => {
  const source = await fs.readFile('backend/routes/messaging.js', 'utf8');
  const create = routeBlock(source, "router.post('/messages/conversations'");
  assert.match(create, /\[applicantUid, employerUid\]\.includes\(req\.user\.uid\)/);
  assert.match(create, /createHash\('sha256'\)/);
  assert.match(create, /INSERT IGNORE INTO conversation_participants/);
  assert.match(create, /beginTransaction\(\)/);
  assert.match(create, /rollback\(\)/);
});
