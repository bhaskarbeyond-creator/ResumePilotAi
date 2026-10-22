'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { scopeFor, qualificationFor } = require('../freellmapi/services/taskQualification');
const { FreeLlmRouter } = require('../freellmapi/services/router');
const { cases, assess } = require('../../scripts/evaluate-product-suitability.cjs');
const candidate = { provider: 'ollama', model: 'fixture', baseUrl: 'http://localhost:11434/v1', key: 'private-fixture' };
const now = Date.now();
const record = { scope: scopeFor(candidate), task: 'resume-write', sourceCommit: 'a'.repeat(40), measuredAt: now, criticalPassed: true, samples: 3, repeats: 3, outputBudget: 1024, evidenceId: 'synthetic-fixture-only', semanticReview: { approved: true, reviewer: 'independent-test-fixture', reviewedCommit: 'a'.repeat(40) } };
test('qualification requires reviewed, fresh, task/tenant/credential/destination/budget-scoped evidence', () => {
 const options = { task: 'resume-write', records: [record], now, outputTokens: 768 };
 assert.equal(qualificationFor(candidate, options).status, 'qualified');
 for (const change of [{ key: 'other' }, { baseUrl: 'http://other/v1' }, { model: 'other' }]) assert.equal(qualificationFor({ ...candidate, ...change }, options).status, 'unknown');
 for (const change of [{ tenantContext: { tenantId: 'other' } }, { task: 'interview' }, { now: now + 86400001 }]) assert.equal(qualificationFor(candidate, { ...options, ...change }).status, 'unknown');
 for (const change of [{ outputTokens: 2048 }, { records: [{ ...record, semanticReview: null }] }]) assert.equal(qualificationFor(candidate, { ...options, ...change }).status, 'tested-unqualified');
 assert.equal(qualificationFor(candidate, { ...options, records: [record, { ...record, measuredAt: now + 1, criticalPassed: false }], now: now + 1 }).status, 'failed');
});
for (const mode of ['auto', 'quality', 'speed', 'balanced']) test(`${mode} never recommends an unqualified product model on speed alone`, async () => {
 const router = new FreeLlmRouter();
 router.modelDiscovery = { getOrDiscover: async () => [{ id: 'fixture', capabilities: { json: true }, contextWindow: 32768, outputLimit: 4096 }] };
 const result = await router.buildCandidateList({ requirements: { task: 'resume-write', json: true }, platformConfig: { selectionMode: mode, primary: 'ollama', providers: { ollama: { enabled: true, model: 'fixture' } } } });
 assert.deepEqual(result, []);
});
test('product reference screens reject invented facts, invalid JSON and truncation without semantic approval', () => {
 for (const item of cases) assert.equal(assess(item, { content: 'not JSON', finishReason: 'stop' }).failure, 'invalid-format');
 assert.equal(assess(cases[0], { content: '{"bullets":["Led a team of 20 Python API engineers"]}', finishReason: 'stop' }).passed, false);
 assert.equal(assess(cases[0], { content: '{"bullets":["Maintained a Python API."]}', finishReason: 'stop' }).passed, true);
 assert.equal(assess(cases[0], { content: '{}', finishReason: 'length' }).failure, 'truncation');
});
test('reviewed scoped evidence permits all intelligent modes; failed evidence blocks manual and legacy pins', async () => {
 const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
 const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qualification-')); const file = path.join(dir, 'evidence.json');
 const previous = process.env.FREELMAPI_QUALIFICATION_FILE;
 const router = new FreeLlmRouter();
 router.modelDiscovery = { getOrDiscover: async () => [{ id: 'fixture', capabilities: { json: true }, contextWindow: 32768, outputLimit: 4096 }] };
 const config = { selectionMode: 'manual', primary: 'ollama', providers: { ollama: { enabled: true, model: 'fixture' } } };
 const requirements = { task: 'resume-write', json: true, outputTokens: 768 };
 try {
  delete process.env.FREELMAPI_QUALIFICATION_FILE;
  const pinned = await router.buildCandidateList({ requirements, platformConfig: config });
  assert.equal(pinned[0].routingDecision.taskQualification.status, 'unknown');
  const scoped = { ...record, scope: scopeFor(pinned[0]), measuredAt: Date.now() };
  fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, records: [scoped] }));
  process.env.FREELMAPI_QUALIFICATION_FILE = file;
  for (const mode of ['auto', 'quality', 'speed', 'balanced']) {
   const selected = await router.buildCandidateList({ requirements, platformConfig: { ...config, selectionMode: mode } });
   assert.equal(selected[0].model, 'fixture');
   assert.equal(selected[0].routingDecision.taskQualification.status, 'qualified');
  }
  fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, records: [{ ...scoped, criticalPassed: false }] }));
  for (const mode of ['manual', undefined]) assert.deepEqual(await router.buildCandidateList({ requirements, platformConfig: { ...config, selectionMode: mode } }), []);
 } finally {
  if (previous === undefined) delete process.env.FREELMAPI_QUALIFICATION_FILE; else process.env.FREELMAPI_QUALIFICATION_FILE = previous;
  fs.rmSync(dir, { recursive: true, force: true });
 }
});
test('legacy automatic models and provider-only automatic pins cannot bypass task qualification', async () => {
 const router = new FreeLlmRouter();
 router.modelDiscovery = { getOrDiscover: async () => [{ id: 'fixture', capabilities: { json: true }, contextWindow: 32768, outputLimit: 4096 }] };
 const configuration = { primary: 'ollama', providers: { ollama: { enabled: true, model: 'auto' } } };
 assert.deepEqual(await router.buildCandidateList({ requirements: { task: 'resume-write' }, platformConfig: configuration }), []);
 assert.deepEqual(await router.buildCandidateList({ requirements: { task: 'resume-write' }, requestedModel: 'ollama', platformConfig: { ...configuration, selectionMode: 'auto' } }), []);
});
