'use strict';

/**
 * FreeLLMAPI Smart Router & Fallback Cascade Engine
 *
 * Implements:
 * 1. Dual-tier routing: Tenant Dedicated BYOK vs Platform Free-Pool Mesh
 * 2. Automatic multi-provider failover (Groq -> Cerebras -> Gemini -> NIM -> Mistral -> OpenRouter)
 * 3. Dynamic cooldown backoff on HTTP 429 / 5xx
 * 4. In-memory LRU prompt cache integration
 * 5. Structured JSON mode guarantee & fact grounding adherence
 */

const { getProviderMeta } = require('../providers/registry');
const { callOpenAiCompat } = require('../providers/openaiCompat');
const { callGoogleGemini } = require('../providers/googleGemini');
const { cooldownManager } = require('./cooldown');
const { promptCache } = require('./cache');

// Standard fallback priority order for platform free/budget mesh:
// Strictly prioritized by High-Intelligence (70B+ / Frontier) and Ultra-Fast Latency
const DEFAULT_PRIORITY_ORDER = Object.freeze([
  'groq',        // Llama-3.3-70b @ 140ms (High Intelligence + Ultra Fast)
  'cerebras',    // Llama-3.3-70b @ 100ms (1,800 tok/sec)
  'gemini',      // Gemini 2.0 Flash (Multimodal Frontier + Fast)
  'mistral',     // Mistral Large (Frontier Intelligence)
  'nvidia',      // Nemotron 70B / Llama 3.2 11B
  'openrouter',  // Llama 3.3 70B:free
  'deepseek',    // DeepSeek V3 / R1 (Frontier Reasoning)
  'cloudflare',  // Llama 3.1 70B
  'cohere',      // Command R+
  'siliconflow', // DeepSeek V3 / FLUX
  'huggingface', // Llama 3.3 70B
  'modelscope',  // Qwen 2.5 72B
  'sambanova',   // Llama 3.3 70B
  'openai',      // GPT-4o-mini
  'anyapi',      // Llama 3.3 70B
  'airforce',    // Llama 3.3 70B
  'ovh',         // Llama 3.1 70B
  'sail',
  'typhoon',
  'pollinations',
]);

function normalizeMessages(prompt, systemPrompt) {
  if (Array.isArray(prompt)) {
    const list = [...prompt];
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

const { modelDiscovery } = require('./modelDiscovery');

class FreeLlmRouter {
  constructor() {
    this.cooldownManager = cooldownManager;
    this.promptCache = promptCache;
    this.modelDiscovery = modelDiscovery;
  }

  async resolveModelForCandidate(pId, key, baseUrl, requestedModel, fetchImpl) {
    const meta = getProviderMeta(pId);
    const req = String(requestedModel || '').trim();

    // If operator specifically requested a concrete model (and not auto/dynamic), use it
    if (req && req.toLowerCase() !== 'auto' && req.toLowerCase() !== 'dynamic') {
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
        // Highest intelligence Frontier model discovered
        return liveModels[0].id;
      }
    } catch {
      // Fall back safely to registry default on discovery network error
    }

    return meta?.defaultModel || 'default';
  }

  async buildCandidateList({ tenantContext, platformConfig = {}, fetchImpl }) {
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
        const key = String(rawKey || '').trim();
        if (!key) continue;
        if (allowed && allowed.size > 0 && !allowed.has(pId)) continue;

        const meta = getProviderMeta(pId) || { baseUrl: '', defaultModel: 'default' };
        const model = await this.resolveModelForCandidate(pId, key, meta.baseUrl, tenantContext?.primaryModel, fetchImpl);

        candidates.push({
          provider: pId,
          key,
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

      return candidates;
    }

    // ─── TIER 1: PLATFORM FREE-POOL MESH ───
    const providers = platformConfig.providers || {};
    const candidates = [];

    // Order by standard failover hierarchy: High-Intelligence & Ultra-Fast first
    // If operator has configured a primary provider, prioritize it first!
    const primary = platformConfig?.primary;
    let orderedKeys = [
      ...DEFAULT_PRIORITY_ORDER,
      ...Object.keys(providers).filter(k => !DEFAULT_PRIORITY_ORDER.includes(k)),
    ];
    if (primary && providers[primary]) {
      orderedKeys = [primary, ...orderedKeys.filter(k => k !== primary)];
    }

    for (const pId of orderedKeys) {
      const conf = providers[pId];
      if (!conf || conf.enabled === false) continue;
      const key = String(conf.key || '').trim();
      if (!key) continue;

      const meta = getProviderMeta(pId);
      const baseUrl = String(conf.baseUrl || meta?.baseUrl || '').trim();
      const model = await this.resolveModelForCandidate(pId, key, baseUrl, conf.model, fetchImpl);

      // Check if on active cooldown
      const cooldown = this.cooldownManager.isOnCooldown(pId, model);
      if (cooldown.onCooldown) {
        // benched temporarily
        continue;
      }

      candidates.push({
        provider: pId,
        key,
        model,
        baseUrl: baseUrl || meta?.baseUrl,
        isDedicatedByok: false,
      });

      // If fallback is explicitly disabled, only retain the primary provider
      if (platformConfig?.enableFallback === false) {
        break;
      }
    }

    // If all providers are on cooldown, fall back to testing the earliest expired one
    if (candidates.length === 0) {
      for (const pId of orderedKeys) {
        const conf = providers[pId];
        if (conf && conf.enabled !== false && conf.key) {
          const meta = getProviderMeta(pId);
          candidates.push({
            provider: pId,
            key: conf.key,
            model: conf.model || meta?.defaultModel,
            baseUrl: conf.baseUrl || meta?.baseUrl,
            isDedicatedByok: false,
          });
        }
      }
    }

    return candidates;
  }

  async routeCompletion({
    prompt,
    systemPrompt,
    tenantContext = null,
    platformConfig = {},
    temperature = 0.3,
    maxTokens = 4096,
    jsonMode = false,
    timeoutMs = 45000,
    fetchImpl = globalThis.fetch,
    signal,
    bypassCache = false,
  }) {
    const messages = normalizeMessages(prompt, systemPrompt);

    // 1. In-Memory LRU Cache Check
    if (!bypassCache) {
      const cacheKeyModel = tenantContext?.primaryModel || 'default';
      const cached = this.promptCache.get(messages, cacheKeyModel, temperature);
      if (cached) {
        return {
          content: cached.content,
          provider: cached.provider,
          model: cached.model,
          usage: cached.usage || { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          cached: true,
          latencyMs: 0,
          fallbacksAttempted: [],
        };
      }
    }

    // 2. Build Candidate Failover Cascade
    const candidates = await this.buildCandidateList({ tenantContext, platformConfig, fetchImpl });

    if (candidates.length === 0) {
      const err = new Error('No enabled AI provider is configured or healthy');
      err.code = 'AI_PROVIDER_UNAVAILABLE';
      err.status = 503;
      throw err;
    }

    const fallbacksAttempted = [];
    let lastError = null;

    // 3. Failover Execution Loop
    for (const candidate of candidates) {
      const startTime = Date.now();
      try {
        let result;
        const meta = getProviderMeta(candidate.provider);

        if (meta?.type === 'google' || candidate.provider === 'gemini') {
          result = await callGoogleGemini({
            baseUrl: candidate.baseUrl || 'https://generativelanguage.googleapis.com/v1beta',
            apiKey: candidate.key,
            model: candidate.model,
            messages,
            temperature,
            maxTokens,
            jsonMode,
            timeoutMs,
            fetchImpl,
            signal,
          });
        } else {
          result = await callOpenAiCompat({
            baseUrl: candidate.baseUrl,
            apiKey: candidate.key,
            model: candidate.model,
            messages,
            temperature,
            maxTokens,
            jsonMode,
            timeoutMs,
            providerId: candidate.provider,
            fetchImpl,
            signal,
          });
        }

        // Cache successful response in memory
        this.promptCache.set(messages, candidate.model, temperature, {
          content: result.content,
          provider: candidate.provider,
          model: candidate.model,
          usage: result.usage,
        });

        // Clear cooldown strikes on successful execution
        this.cooldownManager.clearCooldown(candidate.provider, candidate.model);

        return {
          content: result.content,
          provider: candidate.provider,
          model: candidate.model,
          usage: result.usage,
          cached: false,
          latencyMs: result.latencyMs || (Date.now() - startTime),
          fallbacksAttempted,
          isDedicatedByok: Boolean(candidate.isDedicatedByok),
        };
      } catch (error) {
        lastError = error;
        const latencyMs = Date.now() - startTime;

        fallbacksAttempted.push({
          provider: candidate.provider,
          model: candidate.model,
          error: error.message,
          code: error.code || 'UNKNOWN_ERROR',
          status: error.status || 500,
          latencyMs,
        });

        // If error is retryable (429, 503, timeout, etc.), bench this provider temporarily and fail over
        if (error.retryable !== false && !candidate.isDedicatedByok) {
          this.cooldownManager.setCooldown(candidate.provider, candidate.model, error.message);
        }

        // Dedicated BYOK errors should not fail over to other tenants or public mesh
        if (candidate.isDedicatedByok && candidates.length === 1) {
          throw error;
        }
      }
    }

    // 4. All Candidates Exhausted
    const fallbackSummary = fallbacksAttempted.map(f => f.provider + ' (' + f.code + ': ' + f.error + ')').join('; ');
    const finalError = new Error('All AI providers failed: ' + fallbackSummary);
    finalError.code = 'ALL_PROVIDERS_FAILED';
    finalError.status = 502;
    finalError.fallbacksAttempted = fallbacksAttempted;
    finalError.lastError = lastError;
    throw finalError;
  }
}

const defaultRouter = new FreeLlmRouter();

module.exports = {
  FreeLlmRouter,
  freeLlmRouter: defaultRouter,
};
