'use strict';

/**
 * FreeLLMAPI Smart Router & Fallback Cascade Engine
 *
 * Implements:
 * 1. Dual-tier routing: Tenant Dedicated BYOK vs Platform Free-Pool Mesh
 * 2. Automatic multi-provider failover (Groq → Cerebras → Gemini → NIM → Mistral → OpenRouter)
 * 3. Multi-key pooling: rotate keys on 429/401 before benching a whole provider
 * 4. Dynamic cooldown backoff on HTTP 429 / 5xx (persisted across restarts)
 * 5. Search/media provider isolation: agent tools never reach /chat/completions
 * 6. Multi-stage prompt compression before dispatch
 * 7. Inline tool-call dialect rescue for budget free models
 * 8. In-memory LRU prompt cache integration
 * 9. SSE streaming with provider failover before the first forwarded chunk
 */

const { createHash } = require('node:crypto');
const { getProviderMeta } = require('../providers/registry');
const { callOpenAiCompat, streamOpenAiCompat } = require('../providers/openaiCompat');
const { callGoogleGemini, streamGoogleGemini } = require('../providers/googleGemini');
const { cooldownManager } = require('./cooldown');
const { promptCache } = require('./cache');
const { compressMessages } = require('./compression');
const { rescueInlineToolCalls, toolNamesFrom, normalizeTools } = require('../lib/toolRescue');
const { getMetricsPersistence } = require('./persistence');
const { modelDiscovery } = require('./modelDiscovery');
const { eligible, validateMode, rankCandidates, weightedP50LatencyMs } = require('./selectionPolicy');

// Stable compatibility order. Intelligent modes are ranked only from capability/service evidence.
const DEFAULT_PRIORITY_ORDER = Object.freeze([
  'ovh',
  'pollinations',
  'groq',
  'cerebras',
  'gemini',
  'mistral',
  'nvidia',
  'openrouter',
  'deepseek',
  'cloudflare',
  'sambanova',
  'cohere',
  'siliconflow',
  'huggingface',
  'modelscope',
  'openai',
  'anyapi',
  'airforce',
  'sail',
  'typhoon',
  'kilo',
]);

/**
 * Provider types that speak a chat wire protocol. `search` and `media`
 * providers are agent tools with their own endpoints — sending them a
 * `/chat/completions` request returns 404/422 from upstream (the bug fixed in
 * freellmapi 0.16.6).
 */
const CHAT_PROVIDER_TYPES = Object.freeze(['openai-compat', 'google', 'horde']);

function isChatCapableMeta(meta) {
  if (!meta) return false;
  return CHAT_PROVIDER_TYPES.includes(String(meta.type || 'openai-compat'));
}

function isSearchOrMediaMeta(meta) {
  if (!meta) return false;
  return meta.type === 'search' || meta.type === 'media';
}

function normalizeMessages(prompt, systemPrompt, explicitMessages) {
  if (Array.isArray(explicitMessages) && explicitMessages.length > 0) {
    const list = explicitMessages.map(message => ({ ...message }));
    if (systemPrompt && !list.some(m => m.role === 'system')) {
      list.unshift({ role: 'system', content: String(systemPrompt) });
    }
    return list;
  }
  if (Array.isArray(prompt)) {
    const list = prompt.map(message => ({ ...message }));
    if (systemPrompt && !list.some(m => m.role === 'system')) {
      list.unshift({ role: 'system', content: String(systemPrompt) });
    }
    return list;
  }
  const messages = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: String(systemPrompt) });
  }
  messages.push({ role: 'user', content: String(prompt || '') });
  return messages;
}

/**
 * `key: string | string[]` — or the newer `apiKeys: string[]` array. Splitting
 * on commas/newlines lets an operator paste a pool straight into one field.
 */
function normalizeKeyPool(config = {}) {
  const raw = [];
  if (Array.isArray(config.apiKeys)) raw.push(...config.apiKeys);
  if (Array.isArray(config.apiKey)) raw.push(...config.apiKey);
  else if (typeof config.apiKey === 'string' && config.apiKey !== 'none' && config.apiKey !== 'keyless') raw.push(config.apiKey);
  if (Array.isArray(config.key)) raw.push(...config.key);
  else if (typeof config.key === 'string' && config.key !== 'none' && config.key !== 'keyless') raw.push(config.key);

  const keys = [];
  for (const entry of raw) {
    for (const piece of String(entry || '').split(/[\n,]+/)) {
      const key = piece.trim();
      if (key && !keys.includes(key)) keys.push(key);
    }
  }
  return keys;
}

function estimateTokens(messages) {
  const chars = (messages || []).reduce((sum, message) => {
    if (typeof message?.content === 'string') return sum + message.content.length;
    if (Array.isArray(message?.content)) {
      return sum + message.content.reduce((n, block) => n + (typeof block?.text === 'string' ? block.text.length : 0), 0);
    }
    return sum;
  }, 0);
  return Math.ceil(chars / 4);
}

class FreeLlmRouter {
  constructor() {
    this.cooldownManager = cooldownManager;
    this.promptCache = promptCache;
    this.modelDiscovery = modelDiscovery;
    this.keyCursor = new Map(); // provider -> next key index (round-robin)
  }

  _nextKeyOrder(provider, keyCount) {
    if (keyCount <= 1) return [0];
    const start = this.keyCursor.get(provider) || 0;
    this.keyCursor.set(provider, (start + 1) % keyCount);
    return Array.from({ length: keyCount }, (_unused, offset) => (start + offset) % keyCount);
  }

  async resolveModelForCandidate(pId, key, baseUrl, requestedModel, fetchImpl) {
    const meta = getProviderMeta(pId);
    const req = String(requestedModel || '').trim();

    // If operator specifically requested a concrete model (and not auto/dynamic/chain alias/provider name), use it
    const isAutoOrChain = !req ||
      req.toLowerCase() === 'auto' ||
      req.toLowerCase() === 'dynamic' ||
      req.toLowerCase() === pId.toLowerCase() ||
      Boolean(getProviderMeta(req.toLowerCase())) ||
      req.toLowerCase().startsWith('auto:') ||
      req.toLowerCase().startsWith('chain:');

    if (!isAutoOrChain) {
      return req;
    }

    // Dynamic Discovery: Pull live models directly from the provider's /models endpoint
    try {
      const liveModels = await this.modelDiscovery.getOrDiscover({
        providerId: pId,
        apiKey: key,
        baseUrl: baseUrl || meta?.baseUrl,
        fetchImpl,
      });

      if (liveModels && liveModels.length > 0) {
        // If provider has known verified defaultModel or recommendedModels, prefer them if present
        if (meta?.defaultModel && liveModels.some(m => m.id === meta.defaultModel)) {
          return meta.defaultModel;
        }
        if (Array.isArray(meta?.recommendedModels)) {
          for (const rec of meta.recommendedModels) {
            if (liveModels.some(m => m.id === rec)) return rec;
          }
        }
        // Otherwise preserve provider catalog ordering; names are not quality evidence.
        return liveModels[0].id;
      }
      // A successful empty catalog is authoritative: do not resurrect removed models.
      return null;
    } catch {
      // Bootstrap hint only when discovery is unavailable; inference still verifies it.
      return meta?.defaultModel || null;
    }
  }

  async applySelectionPolicy(candidates, { platformConfig, requestedModel, requirements = {}, fetchImpl, tenantContext }) {
    const policy = platformConfig.tenantPolicy || {};
    const allowed = tenantContext?.allowedModels ?? policy.allowedModels;
    const denied = new Set(tenantContext?.restrictedModels || policy.restrictedModels || []);
    const modelPermitted = candidate => !denied.has(candidate.model) && (!Array.isArray(allowed) || allowed.length === 0 || allowed.includes(candidate.model));
    const mode = platformConfig.selectionMode;
    if (!mode) return candidates.filter(modelPermitted); // Preserve legacy pinned configurations until migrated by an authorized save.
    validateMode(mode);
    // F-03: `manual` is strict by default — a pin never crosses provider/model
    // boundaries. The opt-in `manualAllowFallback` flag (admin setting or
    // MANUAL_ALLOW_FALLBACK env) permits failover away from a DOWN pin; such a
    // deviation is made visible on the response as
    // `routingDecision.fallbackFrom === 'manual'`. Request-level explicit pins
    // (`model` naming a provider) always stay strict.
    const manualAllowFallback = mode === 'manual'
      && platformConfig.manualAllowFallback === true
      && platformConfig.enableFallback !== false;
    const explicit = requestedModel && !['auto', 'dynamic'].includes(requestedModel) && !requestedModel.startsWith('auto:') && !getProviderMeta(requestedModel);
    const explicitProvider = getProviderMeta(requestedModel);
    const configuredPrimary = platformConfig.primary;
    const primary = explicitProvider ? requestedModel : candidates.some(candidate => candidate.provider === configuredPrimary) ? configuredPrimary : candidates[0]?.provider;
    const chosen = (mode === 'manual' && !manualAllowFallback) || explicitProvider ? candidates.filter(candidate => candidate.provider === primary) : candidates;
    const expanded = [];
    // F-14: remember destinations rejected ONLY for an active cooldown so a
    // last-resort release can recover them when nothing else is rankable.
    const cooldownRejections = [];
    for (const source of chosen) {
      for (const key of source.keys) {
        const candidate = { ...source, key, keys: [key] };
        let catalog;
        try {
          catalog = await this.modelDiscovery.getOrDiscover({ providerId: candidate.provider, apiKey: candidate.key, baseUrl: candidate.baseUrl, fetchImpl, timeoutMs: 5000 });
        } catch {
          // Do not claim unknown capabilities or resurrect defaults after failed discovery in intelligent modes.
          continue;
        }
        // F-04: an EMPTY (or literal 'auto') configured model must never become
        // the pin — 'auto' matches no catalog id, so manual mode died with an
        // opaque 503 for a plausible operator configuration. An empty pin now
        // means "provider default": every discovered model of the pinned
        // provider stays eligible and ranked. New saves without an explicit
        // pinned model are rejected at validation time (aiAdmin, F-04).
        const manualPin = mode === 'manual'
          ? String((candidate.isDedicatedByok
            ? tenantContext?.primaryModel
            : platformConfig.providers?.[candidate.provider]?.model) || '').trim()
          : '';
        const pin = explicit ? requestedModel : (manualPin && manualPin !== 'auto' ? manualPin : null);
        for (const metadata of catalog) {
          if (pin && metadata.id !== pin) continue;
          if (!modelPermitted({ model: metadata.id }) || !eligible(metadata, requirements)) continue;
          const cooldown = this.cooldownManager.isOnCooldown(candidate.provider, metadata.id);
          if (cooldown.onCooldown && !candidate.isDedicatedByok) {
            cooldownRejections.push({ candidate, metadata, cooldown });
            continue;
          }
          expanded.push({ ...candidate, model: metadata.id, metadata });
        }
      }
    }
    // F-07: windowed rolling aggregates per destination (p50 over the last N
    // successes + windowed success rate) replace the single last observation —
    // one lucky/blip sample must not reroute the next 30 minutes of traffic.
    // F-09: dedicated-BYOK sanctuary traffic neither trains nor consults the
    // shared platform rank; platform-key tenant traffic DOES — its observations
    // are platform observations (the key, provider and model are the platform's).
    const dedicatedByokTier = candidates.some(candidate => candidate.isDedicatedByok);
    const aggregates = !dedicatedByokTier ? getMetricsPersistence()?.getRollingAggregates?.({ windowMs: 30 * 60_000 }) || [] : [];
    let ordered = rankCandidates(expanded, { mode, primary, observationFor: candidate => aggregates.find(row => row.provider === candidate.provider && row.model === candidate.model) });
    // F-14: last-resort cooldown release — ported from the aiRouting selector
    // (services/aiRouting/modelSelector.js). With every destination benched on
    // a TRANSIENT cooldown (429/5xx backoff) a single-provider deployment used
    // to return a hard 503 for up to 300 s. Now the earliest-expiring benched
    // destination is released and retried, marked `routingDecision.lastResort`
    // so the deviation is visible. Credential rejections ('All pooled keys
    // rejected') are NEVER released — retrying rejected keys only repeats the
    // 401 — and strict pins (manual mode without `manualAllowFallback`, or an
    // explicit model/provider request) keep the F-03 honest
    // 503 + Retry-After contract instead of silently unpinning.
    const strictPin = (mode === 'manual' && !manualAllowFallback) || explicit || explicitProvider;
    if (ordered.length === 0 && !strictPin && cooldownRejections.length > 0) {
      const transient = cooldownRejections
        .filter(rejection => rejection.cooldown.reason !== 'All pooled keys rejected')
        .sort((a, b) => a.cooldown.remainingMs - b.cooldown.remainingMs);
      if (transient.length > 0) {
        const released = transient[0];
        this.cooldownManager.clearCooldown(released.candidate.provider, released.metadata.id);
        ordered = rankCandidates(
          [{ ...released.candidate, model: released.metadata.id, metadata: released.metadata }],
          { mode, primary, observationFor: candidate => aggregates.find(row => row.provider === candidate.provider && row.model === candidate.model) },
        ).map(candidate => ({
          ...candidate,
          routingDecision: { ...(candidate.routingDecision || {}), lastResort: true },
        }));
      }
    }
    // F-03: with the opt-in manual fallback the PIN stays the preferred
    // destination — recent-failure ranking must not silently promote an
    // alternative above it. The deviation happens only ON pin failure, and is
    // marked routingDecision.fallbackFrom === 'manual' at execution time.
    const finalOrdered = manualAllowFallback
      ? [...ordered.filter(c => c.provider === primary), ...ordered.filter(c => c.provider !== primary)]
      : ordered;
    // Manual pins never SILENTLY cross provider/model boundaries: strict by
    // default even with platform fallback enabled, and only widened by the
    // explicit `manualAllowFallback` opt-in (F-03), which keeps the pin ranked
    // first (+5 primary bonus in rankCandidates) and marks any deviation with
    // routingDecision.fallbackFrom === 'manual'.
    if ((mode === 'manual' && !manualAllowFallback) || explicit || explicitProvider || platformConfig.enableFallback === false) {
      const first = finalOrdered[0];
      // A pin restricts destinations, not legitimate credentials for that same model.
      return finalOrdered.filter(candidate => candidate.provider === first?.provider && candidate.model === first?.model).slice(0, 12);
    }
    return finalOrdered.slice(0, 12);
  }

  /**
   * Fast credential sanity check to prevent trying placeholder passwords
   * or obviously malformed tokens that cause 401 failover latency loops.
   */
  _isValidKeyFormat(providerId, key) {
    if (!key || typeof key !== 'string') return false;
    const k = key.trim();
    if (k === 'keyless') return Boolean(getProviderMeta(providerId)?.keyless);
    if (k.length < 8) return false;
    // Provider prefixes change and compatible gateways use different key formats.
    // Only reject explicit placeholder values; upstream authentication is authoritative.
    if (/^(your[-_ ]|replace[-_ ]|placeholder|changeme|example[-_ ])/i.test(k)) return false;
    return true;
  }

  /**
   * Build the ordered failover cascade.
   *
   * Each entry carries a *key pool*, not a single credential. Search and media
   * providers are filtered out here — the single choke point every completion
   * passes through.
   */
  async buildCandidateList({ tenantContext, platformConfig = {}, requestedModel = null, fetchImpl, requirements = {}, dataClassification = 'confidential' }) {
    const customKeys = tenantContext?.customProviderKeys || {};
    const hasTenantByok = Object.keys(customKeys).some(k => Boolean(String(customKeys[k] || '').trim()));

    // ─── TIER 2: TENANT DEDICATED BYOK SANCTUARY ───
    if (hasTenantByok) {
      const allowed = Array.isArray(tenantContext?.allowedProviders)
        ? new Set(tenantContext.allowedProviders.map(p => String(p).toLowerCase()))
        : null;

      const candidates = [];
      for (const [providerId, rawKey] of Object.entries(customKeys)) {
        const pId = providerId.toLowerCase().trim();
        const meta = getProviderMeta(pId);
        if (meta?.keyless && meta.accessCategory !== 'local' && dataClassification !== 'public-synthetic') continue;
        if (isSearchOrMediaMeta(meta) || !isChatCapableMeta(meta)) continue;
        if (allowed && !allowed.has(pId)) continue;

        const keys = normalizeKeyPool({ key: rawKey });
        if (keys.length === 0) continue;
        const model = platformConfig.selectionMode ? tenantContext?.primaryModel || requestedModel || 'auto' : await this.resolveModelForCandidate(pId, keys[0], meta.baseUrl, tenantContext?.primaryModel || requestedModel, fetchImpl);

        if (!model) continue;
        candidates.push({
          provider: pId,
          keys,
          key: keys[0],
          model,
          baseUrl: meta.baseUrl,
          isDedicatedByok: true,
        });
      }

      if (candidates.length === 0) {
        const err = new Error('No valid dedicated BYOK provider keys available for this tenant');
        err.code = 'TENANT_BYOK_UNAVAILABLE';
        err.status = 403;
        throw err;
      }

      return this.applySelectionPolicy(candidates, { platformConfig, requestedModel, requirements, fetchImpl, tenantContext });
    }

    // ─── TIER 1: PLATFORM FREE-POOL MESH ───
    const providers = platformConfig.providers || {};
    const candidates = [];

    // Order by standard failover hierarchy: High-Intelligence & Ultra-Fast first
    // If operator has configured a primary provider, prioritize it first!
    const primary = platformConfig?.primary;
    // Configured providers outside the standard order are appended, preserving
    // the operator's own priority intent for anything not in the default mesh.
    const orderedKeys = [...new Set([
      ...(primary && providers[primary] ? [primary] : []),
      ...DEFAULT_PRIORITY_ORDER,
      ...Object.keys(providers),
    ])];

    const metricsMap = new Map();
    const recentMap = new Map();
    // F-07: rolling per-(provider, model) aggregates are the primary ranking
    // evidence; metricsMap/recentMap remain as the legacy fallback inputs.
    const aggregateMap = new Map();
    try {
      const persistence = getMetricsPersistence();
      if (persistence) {
        const metricsList = persistence.getProviderMetrics({ limit: 100 }) || [];
        for (const m of metricsList) {
          if (!metricsMap.has(m.provider)) metricsMap.set(m.provider, m);
        }
        const recentList = persistence.getRecentRequests({ limit: 50 }) || [];
        for (const r of recentList) {
          if (!recentMap.has(r.provider)) recentMap.set(r.provider, r);
        }
        const aggregates = persistence.getRollingAggregates?.({ windowMs: 30 * 60_000 }) || [];
        for (const aggregate of aggregates) {
          aggregateMap.set(`${aggregate.provider}\u0000${aggregate.model}`, aggregate);
        }
      }
    } catch { /* metrics are best-effort */ }

    const allowedDestinations = Array.isArray(tenantContext?.allowedProviders)
      ? new Set(tenantContext.allowedProviders.map(id => String(id).toLowerCase())) : null;
    // F-14: legacy-path (no selectionMode) cooldown rejections, retained for
    // the last-resort release below.
    const legacyCooldownRejections = [];
    for (const pId of orderedKeys) {
      if (allowedDestinations && !allowedDestinations.has(pId)) continue;
      const conf = providers[pId];
      if (!conf || conf.enabled === false) continue;

      const meta = getProviderMeta(pId);
      // Registry opt-in is not permission to send candidate/private data to public workers.
      // Only trusted synthetic callers can opt in; HTTP request bodies never supply this flag.
      if (meta?.keyless && meta.accessCategory !== 'local' && dataClassification !== 'public-synthetic') continue;
      // Pillar 3 — isolation: search/media providers are not chat models.
      if (isSearchOrMediaMeta(meta)) continue;
      // Unknown provider ids are only callable when the operator supplied an
      // explicit OpenAI-compatible endpoint.
      if (!meta && !conf?.baseUrl) continue;
      if (!isChatCapableMeta(meta) && !conf?.baseUrl) continue;

      let keys = normalizeKeyPool(conf || {});
      if (keys.length === 0 && meta?.keyless) keys = ['keyless'];
      // Filter out invalid keys (e.g. placeholder passwords)
      if (!meta?.keyless) {
        keys = keys.filter(k => this._isValidKeyFormat(pId, k));
      }
      if (keys.length === 0) continue;

      const baseUrl = String(conf?.baseUrl || meta?.baseUrl || '').trim();
      const modelTarget = (requestedModel && !requestedModel.startsWith('auto:') && requestedModel !== 'auto')
        ? requestedModel
        : conf?.model;
      const model = platformConfig.selectionMode ? modelTarget || 'auto' : await this.resolveModelForCandidate(pId, keys[0], baseUrl, modelTarget, fetchImpl);

      if (!model) continue;

      // Check if on active cooldown (provider-level or model-level)
      const cooldown = this.cooldownManager.isOnCooldown(pId, model);
      if (cooldown.onCooldown && !platformConfig.selectionMode) {
        // F-14: remember legacy-path cooldown rejections for last-resort release.
        legacyCooldownRejections.push({ provider: pId, keys, key: keys[0], model, baseUrl: baseUrl || meta?.baseUrl, cooldown });
        continue;
      }

      candidates.push({
        provider: pId,
        keys,
        key: keys[0],
        model,
        baseUrl: baseUrl || meta?.baseUrl,
        isDedicatedByok: false,
      });

      // If fallback is explicitly disabled, only retain the primary provider
      if (platformConfig?.enableFallback === false) {
        break;
      }
    }

    // F-14: last-resort cooldown release for LEGACY pinned configurations (no
    // selectionMode). The tier-1 loop benches a cooled-down provider outright,
    // so a single-provider deployment returned a hard 503 for up to 300 s —
    // the aiRouting selector releases the earliest-expiring transient bench in
    // exactly this situation (services/aiRouting/modelSelector.js). Credential
    // rejections ('All pooled keys rejected') are NEVER released — retrying
    // rejected keys only repeats the 401. Policy-mode deployments get the same
    // release inside applySelectionPolicy; the deviation is visible as
    // routingDecision.lastResort === true either way.
    if (candidates.length === 0 && legacyCooldownRejections.length > 0) {
      const transient = legacyCooldownRejections
        .filter(rejection => rejection.cooldown.reason !== 'All pooled keys rejected')
        .sort((a, b) => a.cooldown.remainingMs - b.cooldown.remainingMs);
      if (transient.length > 0) {
        const released = transient[0];
        this.cooldownManager.clearCooldown(released.provider, released.model);
        candidates.push({
          provider: released.provider,
          keys: released.keys,
          key: released.key,
          model: released.model,
          baseUrl: released.baseUrl,
          isDedicatedByok: false,
          routingDecision: { lastResort: true },
        });
      }
    }

    // ─── DYNAMIC HEALTH & LATENCY ADAPTIVE RANKING (AUTONOMOUS TAKEOVER) ───
    // Dynamically promotes the best, fastest, and most intelligent active providers.
    // If a provider recently succeeded with low latency (<1.5s), it takes over #1.
    // If a provider recently failed or timed out, it is penalized and demoted.
    if (candidates.length > 1 && platformConfig?.enableFallback !== false) {
      candidates.sort((a, b) => {
        const scoreA = this._computeDynamicRankScore(a, platformConfig, metricsMap, recentMap, requestedModel, aggregateMap);
        const scoreB = this._computeDynamicRankScore(b, platformConfig, metricsMap, recentMap, requestedModel, aggregateMap);
        return scoreB - scoreA;
      });
    }

    return this.applySelectionPolicy(candidates, { platformConfig, requestedModel, requirements, fetchImpl, tenantContext });
  }

  _computeDynamicRankScore(candidate, platformConfig, metricsMap, recentMap, requestedModel, aggregateMap) {
    const metric = metricsMap?.get(candidate.provider);
    const recent = recentMap?.get(candidate.provider);
    const req = String(requestedModel || '').toLowerCase().trim();
    if (req && (req === candidate.provider.toLowerCase() || req === candidate.model.toLowerCase())) return 1000;
    // Registry marketing scores and model-name size heuristics are not quality evidence.
    // Unknown performance adds zero; stable input order breaks ties deterministically.
    let score = platformConfig?.primary === candidate.provider ? 120 : 0;
    // Operator-managed credentials retain precedence over unconfigured public paths.
    if (candidate.key && candidate.key !== 'keyless') score += 10;
    // F-07: prefer the windowed aggregate for this exact (provider, model):
    // latency counts only at n >= 3 (recency-weighted p50), reliability is the
    // windowed success rate, and the single last observation acts ONLY as a
    // circuit breaker (one fresh failure still demotes immediately). The
    // legacy single-observation path below remains as a fallback when no
    // aggregate exists (e.g. cold metrics store or older call signatures).
    const aggregate = aggregateMap?.get(`${candidate.provider}\u0000${candidate.model}`);
    if (aggregate && Number(aggregate.n) > 0) {
      const age = Date.now() - Number(aggregate.lastAt);
      if (Number.isFinite(age) && age >= 0 && age < 30 * 60_000) {
        const freshness = 1 - age / (30 * 60_000);
        const n = Number(aggregate.n);
        if (n >= 3) {
          const successRate = Math.max(0, Number(aggregate.successes) || 0) / n;
          score += (successRate >= 0.5 ? 60 : 100) * (2 * successRate - 1) * freshness;
          const p50 = weightedP50LatencyMs(aggregate.successSamples || [], {});
          if (p50 !== null && p50 > 0) {
            score += 20 * Math.max(0, 1 - p50 / 10_000) * freshness;
          }
        } else if (aggregate.lastOk === false) {
          score += -100 * freshness; // circuit breaker on a fresh failure
        }
        return score;
      }
    }
    const observation = recent?.model === candidate.model ? recent
      : metric?.model === candidate.model ? {
        ok: metric.lastStatus === 200, status: metric.lastStatus,
        latencyMs: metric.lastLatencyMs, createdAt: metric.updatedAt,
      } : null;
    if (observation) {
      const age = Date.now() - Number(observation.createdAt);
      if (Number.isFinite(age) && age >= 0 && age < 30 * 60_000) {
        const freshness = 1 - age / (30 * 60_000);
        const successful = observation.ok && observation.status === 200;
        score += (successful ? 60 : -100) * freshness;
        const latency = Number(observation.latencyMs);
        if (successful && Number.isFinite(latency) && latency > 0) {
          score += 20 * Math.max(0, 1 - latency / 10_000) * freshness;
        }
      }
    }

    return score;
  }

  _resolveRequestOptions(options) {
    const tools = normalizeTools(options.tools);
    const toolNames = toolNamesFrom(options.tools);
    const messages = normalizeMessages(options.prompt, options.systemPrompt, options.messages);
    const compressionInput = options.compression;
    const compressionOptions = compressionInput && typeof compressionInput === 'object' ? compressionInput : {};
    const targetTokens = Number(
      compressionOptions.targetTokens
      || options.maxPromptTokens
      || options.platformConfig?.promptTokenBudget
      || 0,
    );
    const compressed = compressionInput === false
      ? { messages, stats: { enabled: false, skipped: 'disabled', beforeTokens: estimateTokens(messages), afterTokens: estimateTokens(messages) } }
      : compressMessages(messages, {
        ...compressionOptions,
        ...(targetTokens > 0 ? { targetTokens } : {}),
      });

    return { messages: compressed.messages, compression: compressed.stats, tools, toolNames };
  }

  _applyToolRescue(result, { tools, toolNames }) {
    if (!tools || tools.length === 0 || !toolNames.size) return result;
    if (Array.isArray(result.toolCalls) && result.toolCalls.length > 0) return result;

    const rescued = rescueInlineToolCalls(result.content || '', toolNames);
    if (!rescued.detected) return result;

    if (!rescued.calls || rescued.calls.length === 0) {
      // Detected as a dialect but unparseable: a dead turn. Fail over rather
      // than handing the agent loop gibberish prose.
      const err = new Error(`[${result.provider}] model emitted an inline tool-call dialect that could not be parsed`);
      err.code = 'TOOL_CALL_DIALECT_UNPARSEABLE';
      err.status = 502;
      err.retryable = true;
      err.provider = result.provider;
      throw err;
    }

    return {
      ...result,
      content: rescued.cleanText,
      toolCalls: rescued.calls.map((call, index) => ({
        id: `call_rescued_${Date.now().toString(36)}_${index}`,
        type: 'function',
        function: { name: call.name, arguments: call.arguments },
      })),
      finishReason: 'tool_calls',
      toolCallsRescued: true,
    };
  }

  _recordMetrics({ scoped = false, provider, model, ok, latencyMs, status }) {
    // Tenant/BYOK service observations must not train the shared platform rank.
    if (scoped) return;
    try {
      getMetricsPersistence().recordRequest({ provider, model, ok, latencyMs, status });
    } catch { /* metrics are best-effort */ }
  }

  async _dispatch(candidate, { messages, temperature, maxTokens, jsonMode, responseFormat, tools, toolChoice, timeoutMs, fetchImpl, signal }) {
    const meta = getProviderMeta(candidate.provider);
    const shared = {
      apiKey: candidate.key,
      model: candidate.model,
      messages,
      temperature,
      maxTokens,
      jsonMode,
      responseFormat,
      tools,
      toolChoice,
      timeoutMs,
      fetchImpl,
      signal,
    };
    if (meta?.type === 'horde') {
      if (jsonMode || responseFormat || tools?.length || messages.some(message => typeof message.content !== 'string') || maxTokens < 16 || maxTokens > 128 || estimateTokens(messages) + maxTokens > 2048) {
        throw Object.assign(new Error('Anonymous AI Horde supports plain text only (16–128 output tokens, 2048 context); no JSON/tools/vision guarantee'), { status: 400, code: 'UNSUPPORTED_CAPABILITY' });
      }
      return require('../providers/aiHorde').callAiHorde({ ...shared, baseUrl: candidate.baseUrl });
    }
    if (meta?.type === 'google' || candidate.provider === 'gemini') {
      return callGoogleGemini({
        ...shared,
        baseUrl: candidate.baseUrl || 'https://generativelanguage.googleapis.com/v1beta',
      });
    }
    return callOpenAiCompat({
      ...shared,
      baseUrl: candidate.baseUrl,
      providerId: candidate.provider,
    });
  }

  async routeCompletion({
    prompt,
    messages: explicitMessages,
    systemPrompt,
    tenantContext = null,
    dataClassification = 'confidential',
    platformConfig = {},
    temperature = 0.3,
    maxTokens = 4096,
    jsonMode = false,
    responseFormat,
    tools,
    toolChoice,
    compression,
    maxPromptTokens,
    timeoutMs = 45000,
    fetchImpl = globalThis.fetch,
    signal,
    bypassCache = false,
    model: requestedModel = null,
    cacheScope = null,
  }) {
    const prepared = this._resolveRequestOptions({
      prompt, messages: explicitMessages, systemPrompt, tools, compression, maxPromptTokens, platformConfig,
    });
    const messages = prepared.messages;
    const compressionStats = prepared.compression;
    const normalizedTools = prepared.tools;
    const toolNames = prepared.toolNames;

    // 2. Build Candidate Failover Cascade
    const candidates = await this.buildCandidateList({ tenantContext, platformConfig, requestedModel, fetchImpl, dataClassification, requirements: {
      tools: normalizedTools.length > 0, json: Boolean(jsonMode || responseFormat),
      vision: messages.some(message => Array.isArray(message.content) && message.content.some(part => part.type === 'image_url')),
      outputTokens: maxTokens, contextTokens: estimateTokens(messages) + maxTokens,
    } });

    if (candidates.length === 0) {
      // F-04: when a selection policy is active, say WHICH policy excluded
      // every destination — the generic wording hid operator-fixable causes
      // (dead pin, cooldown, capability gate, failed discovery).
      const err = new Error(platformConfig.selectionMode
        ? `Selection mode "${platformConfig.selectionMode}" (primary "${platformConfig.primary || requestedModel || 'unset'}") excluded every destination: pin not in catalog, provider on cooldown, capability gate, or failed discovery.`
        : 'No enabled AI provider is configured or healthy');
      err.code = 'AI_PROVIDER_UNAVAILABLE';
      err.status = 503;
      throw err;
    }

    // Cache identity binds tenant policy, eligible destinations and request semantics.
    // Credentials are only hashed, never retained as plaintext cache keys.
    // F-02: `cacheScope` binds the entry to the CALLING PRINCIPAL (user uid /
    // platform-key fingerprint). Without it, two principals submitting
    // byte-identical messages shared one entry — a cross-principal answer
    // replay. Callers MUST pass a scope; null is reserved for trusted
    // in-process callers with no principal concept (and never for HTTP traffic).
    const cacheIdentity = createHash('sha256').update(JSON.stringify({
      tenantContext, candidates, maxTokens, jsonMode, responseFormat, cacheScope: cacheScope || null,
    })).digest('hex');
    // 1. In-Memory LRU Cache Check (structured tool turns are never cached)
    if (!bypassCache && normalizedTools.length === 0) {
      const cacheKeyModel = cacheIdentity;
      const cached = this.promptCache.get(messages, cacheKeyModel, temperature);
      if (cached) {
        return {
          content: cached.content,
          provider: cached.provider,
          model: cached.model,
          usage: cached.usage || { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          routingDecision: cached.routingDecision || null,
          cached: true,
          latencyMs: 0,
          fallbacksAttempted: [],
          compression: compressionStats,
        };
      }
    }

    const fallbacksAttempted = [];
    let lastError = null;

    // 3. Failover Execution Loop: provider → key pool
    for (const candidate of candidates) {
      const keyOrder = candidate.isDedicatedByok ? [0] : this._nextKeyOrder(candidate.provider, candidate.keys.length);
      let keyFailures = 0;
      let sawRateLimit = false;
      let sawRetryAfterMs = 0; // F-12: strongest Retry-After seen across the key pool
      let sawAuthFailure = false;

      for (const keyIndex of keyOrder) {
        const key = candidate.keys[keyIndex];
        if (!key) continue;
        const startTime = Date.now();
        const configuredTimeout = Number(process.env.FREELMAPI_PROVIDER_TIMEOUT_MS);
        const defaultTimeout = configuredTimeout > 0 ? configuredTimeout : (maxTokens > 1000 ? 25000 : 18000);
        const candidateTimeoutMs = candidates.length > 1
          ? Math.min(timeoutMs, defaultTimeout)
          : timeoutMs;

        try {
          const result = await this._dispatch({ ...candidate, key }, {
            messages,
            temperature,
            maxTokens,
            jsonMode,
            responseFormat,
            tools: normalizedTools,
            toolChoice,
            timeoutMs: candidateTimeoutMs,
            fetchImpl,
            signal,
          });

          const rescued = this._applyToolRescue(result, { tools: normalizedTools, toolNames });
          const latencyMs = rescued.latencyMs || (Date.now() - startTime);

          // F-03: when the opt-in manual fallback carried the request away from
          // the pinned provider, the deviation is never silent — the response
          // (and the cache entry) carries routingDecision.fallbackFrom='manual'.
          const routingDecision = platformConfig.selectionMode === 'manual'
            && platformConfig.manualAllowFallback === true
            && platformConfig.primary
            && candidate.provider !== platformConfig.primary
            ? { ...(candidate.routingDecision || {}), fallbackFrom: 'manual' }
            : candidate.routingDecision || null;

          // Cache successful text-only responses in memory
          if (normalizedTools.length === 0 && !rescued.toolCalls) {
            this.promptCache.set(messages, cacheIdentity, temperature, {
              content: rescued.content,
              provider: candidate.provider,
              model: candidate.model,
              routingDecision,
              usage: rescued.usage,
            });
          }

          // Clear cooldown strikes on successful execution
          if (!candidate.isDedicatedByok) this.cooldownManager.clearCooldown(candidate.provider, candidate.model);
          this._recordMetrics({ scoped: Boolean(candidate.isDedicatedByok), provider: candidate.provider, model: candidate.model, ok: true, latencyMs, status: 200 });

          return {
            content: rescued.content,
            toolCalls: rescued.toolCalls || null,
            finishReason: rescued.finishReason || (rescued.toolCalls ? 'tool_calls' : 'stop'),
            provider: candidate.provider,
            model: candidate.model,
            usage: rescued.usage,
            routingDecision,
            cached: false,
            latencyMs,
            fallbacksAttempted,
            compression: compressionStats,
            keysAttempted: fallbacksAttempted.filter(attempt => attempt.provider === candidate.provider && attempt.model === candidate.model).length + 1,
            toolCallsRescued: Boolean(rescued.toolCallsRescued),
            isDedicatedByok: Boolean(candidate.isDedicatedByok),
          };
        } catch (error) {
          lastError = error;
          keyFailures += 1;
          const latencyMs = Date.now() - startTime;
          const status = Number(error.status) || 500;

          fallbacksAttempted.push({
            provider: candidate.provider,
            model: candidate.model,
            keyIndex,
            error: error.message,
            code: error.code || 'UNKNOWN_ERROR',
            status,
            latencyMs,
          });
          this._recordMetrics({ scoped: Boolean(candidate.isDedicatedByok), provider: candidate.provider, model: candidate.model, ok: false, latencyMs, status });

          if (status === 429) sawRateLimit = true;
          const requestedRetryMs = Number(error.retryAfterMs);
          if (Number.isFinite(requestedRetryMs) && requestedRetryMs > sawRetryAfterMs) sawRetryAfterMs = requestedRetryMs;
          if (status === 401 || status === 403) sawAuthFailure = true;
        }
      }

      // Only bench the *provider* once every key in its pool failed.
      const remainingCredential = candidates.slice(candidates.indexOf(candidate) + 1).some(next => next.provider === candidate.provider && next.model === candidate.model);
      if (!candidate.isDedicatedByok && !remainingCredential && (sawRateLimit || keyFailures === candidate.keys.length)) {
        this.cooldownManager.setCooldown(
          candidate.provider,
          candidate.model,
          sawRateLimit ? 'HTTP 429 across all pooled keys' : (sawAuthFailure ? 'All pooled keys rejected' : 'Provider unavailable'),
          sawRetryAfterMs > 0 ? sawRetryAfterMs : null,
        );
      }

      // Dedicated BYOK errors should not fail over to other tenants or public mesh
      if (candidate.isDedicatedByok && candidates.length === 1) {
        throw lastError || new Error('Dedicated BYOK provider failed');
      }
    }

    // 4. All Candidates Exhausted
    const fallbackSummary = fallbacksAttempted.map(f => `${f.provider} (${f.code}: ${f.error})`).join('; ');
    // F-03: when a STRICT pin was exhausted (manual mode without the opt-in
    // `manualAllowFallback`, or a request naming one provider explicitly), the
    // honest statement is "the PINNED provider is unavailable" — not
    // "ALL_PROVIDERS_FAILED" 502, which falsely implies the engine tried
    // everything. Healthy alternatives were deliberately NOT attempted; say so
    // with 503 `provider_unavailable` + Retry-After so callers can back off.
    const explicitProviderRequested = Boolean(requestedModel && getProviderMeta(requestedModel));
    const manualFallbackActive = platformConfig.selectionMode === 'manual'
      && platformConfig.manualAllowFallback === true
      && platformConfig.enableFallback !== false;
    const strictPinExhausted = (platformConfig.selectionMode === 'manual' && !manualFallbackActive)
      || explicitProviderRequested;
    if (strictPinExhausted) {
      const lastAttempt = fallbacksAttempted[fallbacksAttempted.length - 1] || {};
      const pinnedProvider = lastAttempt.provider || platformConfig.primary || String(requestedModel || 'pinned');
      const cooldown = lastAttempt.model
        ? this.cooldownManager.isOnCooldown(pinnedProvider, lastAttempt.model)
        : { onCooldown: false, remainingMs: 0 };
      const retryAfterSeconds = cooldown.onCooldown && cooldown.remainingMs > 0
        ? Math.max(1, Math.ceil(cooldown.remainingMs / 1000))
        : Math.max(1, Math.ceil(Number(this.cooldownManager.DEFAULT_COOLDOWN_MS || 60_000) / 1000));
      const pinnedError = new Error(`Pinned AI provider "${pinnedProvider}" is unavailable: ${fallbackSummary}`);
      pinnedError.code = 'provider_unavailable';
      pinnedError.status = 503;
      pinnedError.provider = pinnedProvider;
      pinnedError.retryAfterSeconds = retryAfterSeconds;
      pinnedError.fallbacksAttempted = fallbacksAttempted;
      pinnedError.lastError = lastError;
      throw pinnedError;
    }
    const finalError = new Error(`All AI providers failed: ${fallbackSummary}`);
    finalError.code = 'ALL_PROVIDERS_FAILED';
    finalError.status = 502;
    finalError.fallbacksAttempted = fallbacksAttempted;
    finalError.lastError = lastError;
    throw finalError;
  }

  /**
   * Streaming completion with pre-first-token failover.
   *
   * Yields: {type:'meta'|'text'|'tool_call'|'usage'|'finish'}.
   * Once a provider has emitted its first content event the stream is committed
   * (retrying another provider would duplicate content in the client).
   */
  async *routeStream({
    prompt,
    messages: explicitMessages,
    systemPrompt,
    tenantContext = null,
    dataClassification = 'confidential',
    platformConfig = {},
    temperature = 0.3,
    maxTokens = 4096,
    jsonMode = false,
    responseFormat,
    tools,
    toolChoice,
    compression,
    maxPromptTokens,
    timeoutMs = 45000,
    fetchImpl = globalThis.fetch,
    signal,
    model: requestedModel = null,
  }) {
    const prepared = this._resolveRequestOptions({
      prompt, messages: explicitMessages, systemPrompt, tools, compression, maxPromptTokens, platformConfig,
    });
    const messages = prepared.messages;
    const normalizedTools = prepared.tools;
    // Streaming is not buffered, so inline tool-call rescue (pillar 5) only
    // applies to the non-streaming path in completeChat — text has already
    // reached the client by the time a stream can be inspected.
    const compressionStats = prepared.compression;

    const candidates = await this.buildCandidateList({ tenantContext, platformConfig, requestedModel, fetchImpl, dataClassification, requirements: {
      tools: normalizedTools.length > 0, json: Boolean(jsonMode || responseFormat),
      vision: messages.some(message => Array.isArray(message.content) && message.content.some(part => part.type === 'image_url')),
      outputTokens: maxTokens, contextTokens: estimateTokens(messages) + maxTokens,
    } });
    if (candidates.length === 0) {
      // F-04: when a selection policy is active, say WHICH policy excluded
      // every destination — the generic wording hid operator-fixable causes
      // (dead pin, cooldown, capability gate, failed discovery).
      const err = new Error(platformConfig.selectionMode
        ? `Selection mode "${platformConfig.selectionMode}" (primary "${platformConfig.primary || requestedModel || 'unset'}") excluded every destination: pin not in catalog, provider on cooldown, capability gate, or failed discovery.`
        : 'No enabled AI provider is configured or healthy');
      err.code = 'AI_PROVIDER_UNAVAILABLE';
      err.status = 503;
      throw err;
    }

    const fallbacksAttempted = [];
    let lastError = null;

    for (const candidate of candidates) {
      const keyOrder = candidate.isDedicatedByok ? [0] : this._nextKeyOrder(candidate.provider, candidate.keys.length);
      let keyFailures = 0;
      let sawRateLimit = false;
      let sawRetryAfterMs = 0; // F-12: strongest Retry-After seen across the key pool

      for (const keyIndex of keyOrder) {
        const key = candidate.keys[keyIndex];
        if (!key) continue;
        const meta = getProviderMeta(candidate.provider);
        const startTime = Date.now();
        let opened = false;
        let emitted = false;
        let finishReason = null;
        let usage = null;
        const toolState = new Map();

        try {
          const configuredTimeout = Number(process.env.FREELMAPI_PROVIDER_TIMEOUT_MS);
          const defaultTimeout = configuredTimeout > 0 ? configuredTimeout : (maxTokens > 1000 ? 25000 : 18000);
          const candidateTimeoutMs = candidates.length > 1
            ? Math.min(timeoutMs, defaultTimeout)
            : timeoutMs;
          const shared = {
            apiKey: key,
            model: candidate.model,
            messages,
            temperature,
            maxTokens,
            jsonMode,
            responseFormat,
            tools: normalizedTools,
            toolChoice,
            timeoutMs: candidateTimeoutMs,
            fetchImpl,
            signal,
          };
          if (meta?.type === 'horde') throw Object.assign(new Error('AI Horde has no supported streaming API'), { status: 400, code: 'UNSUPPORTED_CAPABILITY' });
          const events = (meta?.type === 'google' || candidate.provider === 'gemini')
            ? streamGoogleGemini({ ...shared, baseUrl: candidate.baseUrl || 'https://generativelanguage.googleapis.com/v1beta' })
            : streamOpenAiCompat({ ...shared, baseUrl: candidate.baseUrl, providerId: candidate.provider });

          for await (const event of events) {
            if (event.type === 'open') {
              opened = true;
              yield {
                type: 'meta',
                routingDecision: candidate.routingDecision || null,
                provider: candidate.provider,
                model: candidate.model,
                latencyMs: Date.now() - startTime,
                compression: compressionStats,
                fallbacksAttempted,
                isDedicatedByok: Boolean(candidate.isDedicatedByok),
              };
              continue;
            }

            if (event.type === 'text') {
              emitted = true;
              yield { type: 'text', text: event.text };
              continue;
            }

            if (event.type === 'tool_call') {
              emitted = true;
              const state = toolState.get(event.index) || { id: null, name: '', arguments: '' };
              if (event.id) state.id = event.id;
              if (event.name) state.name = event.name;
              if (typeof event.arguments === 'string') state.arguments = event.arguments;
              toolState.set(event.index, state);
              yield { ...event, provider: candidate.provider };
              continue;
            }

            if (event.type === 'usage') {
              usage = event.usage;
              continue;
            }

            if (event.type === 'finish') {
              finishReason = event.finishReason;
            }
          }

          if (!opened) {
            throw Object.assign(new Error(`[${candidate.provider}] stream closed before opening`), {
              code: 'EMPTY_STREAM', status: 502, retryable: true,
            });
          }
          if (!emitted) {
            throw Object.assign(new Error(`[${candidate.provider}] stream produced no content`), {
              code: 'EMPTY_COMPLETION', status: 502, retryable: true,
            });
          }

          const latencyMs = Date.now() - startTime;
          if (!candidate.isDedicatedByok) this.cooldownManager.clearCooldown(candidate.provider, candidate.model);
          this._recordMetrics({ scoped: Boolean(candidate.isDedicatedByok), provider: candidate.provider, model: candidate.model, ok: true, latencyMs, status: 200 });

          if (usage) yield { type: 'usage', usage };
          yield {
            type: 'finish',
            finishReason: finishReason || (toolState.size > 0 ? 'tool_calls' : 'stop'),
            toolCalls: toolState.size > 0 ? [...toolState.entries()].sort((a, b) => a[0] - b[0]).map(([, state]) => state) : null,
            usage: usage || { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            provider: candidate.provider,
            model: candidate.model,
            latencyMs,
          };
          return;
        } catch (error) {
          lastError = error;
          const status = Number(error.status) || 500;
          if (status === 429) sawRateLimit = true;
          const requestedRetryMs = Number(error.retryAfterMs);
          if (Number.isFinite(requestedRetryMs) && requestedRetryMs > sawRetryAfterMs) sawRetryAfterMs = requestedRetryMs;

          if (opened || emitted) {
            // Mid-stream failure: the client already received partial content.
            // Surface it instead of replaying the answer from another provider.
            this._recordMetrics({ scoped: Boolean(candidate.isDedicatedByok), provider: candidate.provider, model: candidate.model, ok: false, latencyMs: Date.now() - startTime, status });
            throw error;
          }

          keyFailures += 1;
          fallbacksAttempted.push({
            provider: candidate.provider,
            model: candidate.model,
            keyIndex,
            error: error.message,
            code: error.code || 'UNKNOWN_ERROR',
            status,
            latencyMs: Date.now() - startTime,
          });
          this._recordMetrics({ scoped: Boolean(candidate.isDedicatedByok), provider: candidate.provider, model: candidate.model, ok: false, latencyMs: Date.now() - startTime, status });
        }
      }

      const remainingCredential = candidates.slice(candidates.indexOf(candidate) + 1).some(next => next.provider === candidate.provider && next.model === candidate.model);
      if (!candidate.isDedicatedByok && !remainingCredential && (sawRateLimit || keyFailures === candidate.keys.length)) {
        this.cooldownManager.setCooldown(
          candidate.provider,
          candidate.model,
          sawRateLimit ? 'HTTP 429 across all pooled keys' : 'Provider unavailable',
          sawRetryAfterMs > 0 ? sawRetryAfterMs : null,
        );
      }
      if (candidate.isDedicatedByok && candidates.length === 1) {
        throw lastError || new Error('Dedicated BYOK provider failed');
      }
    }

    const summary = fallbacksAttempted.map(f => `${f.provider} (${f.code}: ${f.error})`).join('; ');
    const finalError = new Error(`All AI providers failed: ${summary}`);
    finalError.code = 'ALL_PROVIDERS_FAILED';
    finalError.status = 502;
    finalError.fallbacksAttempted = fallbacksAttempted;
    finalError.lastError = lastError;
    throw finalError;
  }

  /** Providers eligible for chat, used by /v1/models and the admin UI. */
  listChatProviders() {
    return Object.values(require('../providers/registry').PROVIDER_REGISTRY).filter(isChatCapableMeta);
  }
}

const defaultRouter = new FreeLlmRouter();

module.exports = {
  FreeLlmRouter,
  freeLlmRouter: defaultRouter,
  DEFAULT_PRIORITY_ORDER,
  CHAT_PROVIDER_TYPES,
  isChatCapableMeta,
  isSearchOrMediaMeta,
  normalizeKeyPool,
  normalizeMessages,
  estimateTokens,
};
