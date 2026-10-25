'use strict';
// No benchmark/name/parameter-count quality assumptions. Unknown capability
// evidence fails closed. F-06: the ONE quality signal is the curated static
// tier table in providers/registry.js (documented human judgement about model
// classes — never inferred from names, sizes or marketing). Uncurated models
// keep qualityEvidence 'unknown' and receive no tier bonus.
const { getModelQualityTier } = require('../providers/registry');
const MODES = Object.freeze(['auto', 'quality', 'speed', 'balanced', 'manual']);
const QUALITY_TIER_SCORES = Object.freeze({ premium: 1, standard: 0.55, economy: 0.2 });
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
// F-07: recency-weighted median (p50) over success samples. Weights decay
// exponentially (half-life 10 min) so the aggregate tracks the CURRENT
// behaviour of a destination without letting one lucky/blip sample dominate.
function weightedP50LatencyMs(samples, { now = Date.now(), halfLifeMs = 10 * 60_000 } = {}) {
  const entries = (Array.isArray(samples) ? samples : [])
    .filter(sample => Number.isFinite(Number(sample?.latencyMs)) && Number(sample.latencyMs) >= 0)
    .map(sample => ({
      latencyMs: Number(sample.latencyMs),
      weight: Math.pow(0.5, Math.max(0, now - Number(sample?.createdAt || now)) / Math.max(1000, halfLifeMs)),
    }))
    .sort((a, b) => a.latencyMs - b.latencyMs);
  if (entries.length === 0) return null;
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  if (!(total > 0)) return null;
  let accumulated = 0;
  for (const entry of entries) {
    accumulated += entry.weight;
    if (accumulated >= total / 2) return Math.round(entry.latencyMs);
  }
  return Math.round(entries[entries.length - 1].latencyMs);
}

function rankCandidates(candidates, { mode, primary, observationFor = () => null, qualityTierFor = candidate => getModelQualityTier(candidate.model), now = Date.now() }) {
  validateMode(mode);
  const weights = mode === 'speed' ? { reliability: 20, speed: 60, fit: 0 }
    : mode === 'quality' ? { reliability: 30, speed: 0, fit: 30 }
    : { reliability: 40, speed: 20, fit: 10 };
  return candidates.map((candidate, index) => {
    const metadata = candidate.metadata || {};
    const observation = observationFor(candidate);
    // F-07: `observationFor` may return a WINDOWED AGGREGATE (has numeric `n`,
    // from persistence.getRollingAggregates) or a legacy single row. With an
    // aggregate, latency influences the score only at n >= 3 windowed
    // observations (recency-weighted p50) and reliability uses the windowed
    // success rate; the single LAST observation is used only as a
    // circuit-breaker input (one fresh failure still demotes immediately).
    const isAggregate = Boolean(observation) && Number.isFinite(Number(observation.n));
    const evidenceFit = Object.values(metadata.capabilities || {}).filter(value => value === true).length;
    let decay = 0;
    let reliabilityFactor = 0;
    let speed = 0;
    let observedLatencyMs = null;
    let observationCount = 0;
    if (isAggregate) {
      const n = Math.max(0, Number(observation.n) || 0);
      observationCount = n;
      const age = now - Number(observation.lastAt);
      const fresh = n > 0 && age >= 0 && age < 30 * 60_000;
      decay = fresh ? 1 - age / (30 * 60_000) : 0;
      if (n >= 3) {
        reliabilityFactor = 2 * (Math.max(0, Number(observation.successes) || 0) / n) - 1;
        const p50 = weightedP50LatencyMs(observation.successSamples || [], { now });
        if (p50 !== null && p50 > 0) {
          speed = Math.max(0, 1 - p50 / 10_000);
          observedLatencyMs = p50;
        }
      } else if (fresh && observation.lastOk === false) {
        reliabilityFactor = -1; // circuit breaker: a fresh failure demotes now
      }
    } else if (observation) {
      // Legacy single-observation behaviour, preserved exactly.
      const age = now - Number(observation.createdAt);
      const fresh = age >= 0 && age < 30 * 60_000;
      decay = fresh ? 1 - age / (30 * 60_000) : 0;
      const success = observation.ok && observation.status === 200;
      const latency = Number(observation.latencyMs);
      reliabilityFactor = success ? 1 : -1;
      speed = success && latency > 0 ? Math.max(0, 1 - latency / 10_000) : 0;
      observationCount = fresh ? 1 : 0;
      observedLatencyMs = fresh && success && latency > 0 ? latency : null;
    }
    // F-06: quality mode finally ranks on a real quality signal — the curated
    // tier (premium > standard > economy). Uncurated models get NO bonus and
    // stay 'unknown', so quality mode for them is exactly as conservative as
    // before (primary preference + capability fit, no fabricated quality).
    const qualityTier = mode === 'quality' ? qualityTierFor(candidate) : null;
    const tierBonus = qualityTier && QUALITY_TIER_SCORES[qualityTier] !== undefined
      ? QUALITY_TIER_SCORES[qualityTier] * 40
      : 0;
    const score = (candidate.provider === primary ? 5 : 0) + Math.min(4, evidenceFit) * weights.fit / 4
      + decay * (reliabilityFactor * weights.reliability + speed * weights.speed)
      + tierBonus;
    return { ...candidate, routingDecision: {
      mode, qualityEvidence: qualityTier ? `curated-tier:${qualityTier}` : 'unknown', capabilityEvidence: metadata.catalogSource || 'unknown',
      observedLatencyMs,
      observationCount,
      lastSuccessfulCatalogRefresh: metadata.lastSuccessfulRefresh || null,
    }, _score: score, _index: index };
  }).sort((a, b) => b._score - a._score || a._index - b._index || a.model.localeCompare(b.model))
    .map(({ _score, _index, ...candidate }) => candidate);
}
module.exports = { MODES, validateMode, eligible, rankCandidates, weightedP50LatencyMs };
