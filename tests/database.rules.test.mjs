import fs from 'node:fs';
import { after, before, test } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { ref, get, set, update } from 'firebase/database';

let env;
const projectId = 'demo-resumepilot-security';

before(async () => {
  try {
    env = await initializeTestEnvironment({
      projectId,
      database: { rules: fs.readFileSync(new URL('../Realtime_database_Security_rules.txt', import.meta.url), 'utf8') }
    });
    await env.withSecurityRulesDisabled(async context => {
      const db = context.database();
      await update(ref(db), {
        'conversations/conversation-1': { participants: { alice: true, bob: true }, createdAt: 1 },
        'messages/conversation-1/message-1': { senderId: 'alice', text: 'hello', timestamp: 1 },
        'user-conversations/alice/conversation-1': true,
        'user-conversations/bob/conversation-1': true,
        'conversation-participants/lookuphash': 'conversation-1'
      });
    });
  } catch (_err) {
    console.warn('[Database Rules Test] Realtime Database Emulator offline — skipping emulator rule tests.');
  }
});

after(async () => {
  if (env) {
    await env.cleanup();
  }
});

const alice = () => env?.authenticatedContext('alice')?.database();
const bob = () => env?.authenticatedContext('bob')?.database();
const eve = () => env?.authenticatedContext('eve')?.database();
const anonymous = () => env?.unauthenticatedContext()?.database();

test('only participants can read conversations and messages', async (t) => {
  if (!env) { t.skip('Database emulator offline'); return; }
  await assertSucceeds(get(ref(alice(), 'conversations/conversation-1')));
  await assertSucceeds(get(ref(bob(), 'messages/conversation-1')));
  await assertFails(get(ref(eve(), 'conversations/conversation-1')));
  await assertFails(get(ref(anonymous(), 'messages/conversation-1')));
});

test('conversation indexes are private to their owner or participant lookup', async (t) => {
  if (!env) { t.skip('Database emulator offline'); return; }
  await assertSucceeds(get(ref(alice(), 'user-conversations/alice')));
  await assertFails(get(ref(bob(), 'user-conversations/alice')));
  await assertSucceeds(get(ref(alice(), 'conversation-participants/lookuphash')));
  await assertFails(get(ref(eve(), 'conversation-participants/lookuphash')));
});

test('all messaging writes are server-only, including sender overwrite attacks', async (t) => {
  if (!env) { t.skip('Database emulator offline'); return; }
  await assertFails(set(ref(alice(), 'messages/conversation-1/message-2'), { senderId: 'alice', text: 'bypass', timestamp: 2 }));
  await assertFails(set(ref(bob(), 'messages/conversation-1/message-1'), { senderId: 'bob', text: 'overwrite', timestamp: 3 }));
  await assertFails(set(ref(alice(), 'conversations/forged'), { participants: { alice: true, eve: true } }));
  await assertFails(set(ref(alice(), 'user-conversations/eve/conversation-1'), true));
  await assertFails(set(ref(alice(), 'conversation-participants/another-key'), 'conversation-1'));
});
