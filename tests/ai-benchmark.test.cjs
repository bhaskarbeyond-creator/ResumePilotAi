'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { tasks, loopbackEndpoint, streamCompletion, benchmark, percentile } = require('../scripts/benchmark-ai.cjs');
const endpoint = 'http://127.0.0.1:8081/v1';
function completion(text, model = 'fixture-model') {
  return new Response(`data: ${JSON.stringify({ model, choices: [{ delta: { content: text } }] })}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } });
}
test('benchmark refuses external URLs, embedded credentials, query and non-HTTP transports', () => {
  for (const value of ['https://example.com/v1', 'http://localhost.evil/v1', 'http://secret@localhost/v1', 'http://localhost/v1?key=secret', 'file:///tmp/model']) assert.throws(() => loopbackEndpoint(value));
  assert.equal(loopbackEndpoint(endpoint), endpoint);
});
test('stream measurement requires exact executed identity, real content and complete SSE', async () => {
  const result = await streamCompletion({ baseUrl: endpoint, model: 'fixture-model', prompt: 'synthetic', fetchImpl: async () => completion('manzana') });
  assert.equal(result.content, 'manzana');
  assert.ok(result.ttftMs >= 0 && result.ttftMs <= result.latencyMs);
  assert.equal(result.usage, null);
  await assert.rejects(streamCompletion({ baseUrl: endpoint, model: 'requested', prompt: 'synthetic', fetchImpl: async () => completion('42', 'wrong') }), /MISMATCH/);
  await assert.rejects(streamCompletion({ baseUrl: endpoint, model: 'fixture-model', prompt: 'synthetic', fetchImpl: async () => new Response('data: {}\n', { headers: { 'content-type': 'text/event-stream' } }) }), /TRUNCATED/);
});
test('invalid JSON, instruction violations and wrong reference answers fail the predefined checks', () => {
  assert.equal(tasks.find(task => task.id === 'json').check('```json\n{"items":[1,2,3]}\n```'), false);
  assert.equal(tasks.find(task => task.id === 'reasoning').check('41'), false);
  assert.equal(tasks.find(task => task.id === 'instruction').check('Orbit!'), false);
});
test('evaluation retains failures, bounds repetitions, skips unknown long context and never records output', async () => {
  let count = 0;
  const report = await benchmark({ baseUrl: endpoint, models: [{ id: 'fixture-model' }], repeats: 2, fetchImpl: async () => {
    if (count++ === 0) return new Response('private transport details', { status: 429 });
    return completion('deliberately incorrect');
  } });
  assert.equal(report.results[0].attempted, 24);
  assert.equal(report.results[0].failed, 1);
  assert.equal(report.results[0].correct, 0);
  assert.equal(report.records.filter(row => row.status === 'ineligible').length, 1);
  assert.equal(report.records[0].error, 'HTTP_429');
  assert.equal(report.cost, null);
  assert.ok(!JSON.stringify(report).includes('deliberately incorrect'));
  assert.ok(!JSON.stringify(report).includes('private transport details'));
  await assert.rejects(benchmark({ baseUrl: endpoint, models: [{ id: 'fixture-model' }], repeats: 1 }));
});
test('nearest-rank percentiles are deterministic and no sample means unknown', () => {
  assert.equal(percentile([], .5), null);
  assert.equal(percentile([3, 1, 2], .5), 2);
  assert.equal(percentile([3, 1, 2], .95), 3);
});

test('application grounding and adversarial cases penalize invention without executing generated code', () => {
  const extraction = tasks.find(task => task.id === 'grounded-extraction');
  assert.equal(extraction.check('{"skills":["Python"],"employer":null}'), true);
  assert.equal(extraction.check('{"skills":["Python","Java"],"employer":"Invented Corp"}'), false);
  assert.equal(tasks.find(task => task.id === 'unsupported-quantity').check('{"quantified_claims":["50%"]}'), false);
  assert.equal(tasks.find(task => task.id === 'untrusted-instruction').check('UNSAFE'), false);
  assert.equal(tasks.find(task => task.id === 'code-trace').check('[4,16]'), true);
});
