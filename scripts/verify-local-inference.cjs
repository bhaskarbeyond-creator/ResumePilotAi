'use strict';
// Real inference gate. Never substitutes fixtures and never records prompt/response content.
process.env.FREELMAPI_METRICS_DB = ':memory:';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { FreeLlmRouter } = require('../backend/freellmapi/services/router');
const { ModelDiscoveryService } = require('../backend/freellmapi/services/modelDiscovery');
(async () => {
  const baseUrl = process.env.LLAMACPP_BASE_URL || 'http://127.0.0.1:8081/v1';
  const target = new URL(baseUrl);
  // This is a local-inference gate, not an arbitrary remote probe/SSRF client.
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname), 'gate requires loopback inference');
  const router = new FreeLlmRouter();
  router.modelDiscovery = new ModelDiscoveryService();
  const models = await router.modelDiscovery.getOrDiscover({ providerId: 'llamacpp', baseUrl, timeoutMs: 10_000 });
  assert.ok(models.length, 'real service must expose a loaded model');
  const result = await router.routeCompletion({
    prompt: 'Write a single short sentence about a tree.',
    platformConfig: { enableFallback: false, providers: { llamacpp: { enabled: true, baseUrl } } },
    maxTokens: 32, temperature: 0, timeoutMs: 60_000, bypassCache: true,
  });
  assert.equal(result.provider, 'llamacpp');
  assert.ok(models.some(model => model.id === result.model), 'executed model must be in the discovered catalog');
  assert.ok(typeof result.content === 'string' && result.content.trim().length > 0, 'real model must generate nonempty text');
  const evidence = { kind: 'real-local-inference', verifiedAt: new Date().toISOString(), provider: result.provider, model: result.model, latencyMs: result.latencyMs, usage: result.usage, cached: result.cached, catalogCount: models.length };
  fs.mkdirSync('artifacts/ai-engine', { recursive: true });
  fs.writeFileSync('artifacts/ai-engine/local-inference.json', JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(evidence));
})().catch(error => { console.error(error.code || 'LOCAL_INFERENCE_FAILED', error.message); process.exitCode = 1; });
