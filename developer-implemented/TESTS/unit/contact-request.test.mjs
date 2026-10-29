import { test } from 'node:test';
import assert from 'node:assert/strict';
import { submitContact } from '../../../frontend/src/pages/cms/contact-request.ts';
const input = { name: 'Test User', email: 'test@example.test', subject: 'Help', message: 'Please help me today.' };
const response = (status, body) => new Response(body, { status });

test('sends persisted subject and accepts only documented response', async () => {
  let seen;
  await submitContact(input, async (url, options) => { seen = { url, ...options }; return response(202, JSON.stringify({success:true})); });
  assert.equal(seen.url, '/api/contact'); assert.equal(seen.method, 'POST');
  assert.deepEqual(JSON.parse(seen.body), { name: input.name, email: input.email, message: `Subject: Help\n\n${input.message}` });
});
for (const [label, send] of [
  ['validation rejected', async () => response(400, JSON.stringify({success:false}))],
  ['server failure', async () => response(500, JSON.stringify({success:false}))],
  ['network failure', async () => { throw new Error('offline'); }],
  ['malformed', async () => response(202, 'not json')],
  ['false success', async () => response(202, JSON.stringify({success:false}))],
  ['wrong status', async () => response(200, JSON.stringify({success:true}))],
]) test(label, async () => assert.rejects(submitContact(input, send)));
test('local validation and retry after failure', async () => {
  let count = 0;
  await assert.rejects(submitContact({ ...input, message: '' }, async () => { count++; }));
  assert.equal(count, 0);
  await assert.rejects(submitContact(input, async () => { count++; throw new Error('offline'); }));
  await submitContact(input, async () => { count++; return response(202, '{"success":true}'); });
  assert.equal(count, 2);
});
