'use strict';
// One official anonymous Horde submission; never bypasses restrictions, retries submission, or logs content.
process.env.FREELMAPI_METRICS_DB = ':memory:';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { FreeLlmRouter } = require('../backend/freellmapi/services/router');
const { ModelDiscoveryService } = require('../backend/freellmapi/services/modelDiscovery');
(async () => {
  const router = new FreeLlmRouter();
  router.modelDiscovery = new ModelDiscoveryService();
  const models = await router.modelDiscovery.getOrDiscover({ providerId: 'aihorde', timeoutMs: 10000 });
  assert.ok(models.length, 'No active text workers in the public catalog');
  const result = await router.routeCompletion({ dataClassification: 'public-synthetic', prompt: 'Complete this sentence with a few words: A tree has',
    platformConfig: { selectionMode: 'manual', primary: 'aihorde', enableFallback: false,
      providers: { aihorde: { enabled: true, model: models[0].id } } },
    maxTokens: 32, temperature: 0.3, timeoutMs: 90000, bypassCache: true });
  assert.equal(result.provider, 'aihorde');
  assert.equal(result.model, models[0].id);
  assert.ok(result.content?.trim(), 'A catalog, queued job, or health check is not inference proof');
  const evidence = { kind: 'real-public-anonymous-inference', verifiedAt: new Date().toISOString(), provider: result.provider,
    model: result.model, latencyMs: result.latencyMs, cached: result.cached, catalogCount: models.length,
    access: 'Official documented anonymous key; lowest-priority community queue', responseContentRecorded: false };
  fs.mkdirSync('artifacts/ai-engine', { recursive: true });
  fs.writeFileSync('artifacts/ai-engine/public-anonymous-inference.json', JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(evidence));
  console.log(`::notice title=Public anonymous inference verified::AI Horde generated nonempty text through discovery and canonical manual routing. No content recorded.`);
})().catch(error => {
  const causes = (error.fallbacksAttempted || []).map(item => ({ provider: item.provider, code: item.code, status: item.status, reason: item.error })).slice(0, 3);
  const detail = JSON.stringify({ code: error.code || 'PUBLIC_INFERENCE_BLOCKED', causes }).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  console.error(`::warning title=Public anonymous inference NOT verified::${detail}. No success is claimed.`);
  console.error(error.message);
  process.exitCode = 1;
});
