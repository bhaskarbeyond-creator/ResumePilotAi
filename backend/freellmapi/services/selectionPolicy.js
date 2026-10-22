'use strict';
// No benchmark/name/parameter-count quality assumptions. Unknown capability evidence fails closed.
const MODES = Object.freeze(['auto', 'quality', 'speed', 'balanced', 'manual']);
function validateMode(mode) {
  if (!MODES.includes(mode)) throw Object.assign(new Error('Unsupported AI selection mode'), { code: 'AI_SELECTION_MODE_INVALID', status: 400 });
  return mode;
}
function eligible(model, requirements = {}) {
  const capabilities = model.capabilities || {};
  if (model.deprecated || model.active === false) return false;
  for (const name of ['vision', 'tools', 'json', 'streaming']) {
    if (requirements[name] && capabilities[name] !== true) return false;
  }
  if (requirements.contextTokens && model.adapterContextLimit && requirements.contextTokens > model.adapterContextLimit) return false;
  if (requirements.outputTokens && model.outputLimit && requirements.outputTokens > model.outputLimit) return false;
  if (requirements.contextTokens && model.contextWindow && requirements.contextTokens > model.contextWindow) return false;
  // Unknown context is not proof of long-context support.
  if (requirements.contextTokens > 8192 && !model.contextWindow) return false;
  return true;
}
function rankCandidates(candidates, { mode, primary, observationFor = () => null, now = Date.now() }) {
  validateMode(mode);
  const weights = mode === 'speed' ? { reliability: 20, speed: 60, fit: 0 }
    : mode === 'quality' ? { reliability: 30, speed: 0, fit: 30 }
      : { reliability: 40, speed: 20, fit: 10 };
  return candidates.map((candidate, index) => {
    const metadata = candidate.metadata || {};
    const observation = observationFor(candidate);
    const age = now - Number(observation?.createdAt);
    const fresh = observation && age >= 0 && age < 30 * 60_000;
    const decay = fresh ? 1 - age / (30 * 60_000) : 0;
    const success = observation?.ok && observation.status === 200;
    const latency = Number(observation?.latencyMs);
    const evidenceFit = Object.values(metadata.capabilities || {}).filter(value => value === true).length;
    const speed = success && latency > 0 ? Math.max(0, 1 - latency / 10_000) : 0;
    const score = (candidate.provider === primary ? 5 : 0) + Math.min(4, evidenceFit) * weights.fit / 4
      + decay * ((success ? 1 : -1) * weights.reliability + speed * weights.speed);
    return { ...candidate, routingDecision: {
      mode, qualityEvidence: 'unknown', capabilityEvidence: metadata.catalogSource || 'unknown',
      observedLatencyMs: fresh && success && latency > 0 ? latency : null,
      lastSuccessfulCatalogRefresh: metadata.lastSuccessfulRefresh || null,
    }, _score: score, _index: index };
  }).sort((a, b) => b._score - a._score || a._index - b._index || a.model.localeCompare(b.model))
    .map(({ _score, _index, ...candidate }) => candidate);
}
module.exports = { MODES, validateMode, eligible, rankCandidates };
