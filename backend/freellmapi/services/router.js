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

const { getProviderMeta } = require('../providers/registry');
const { callOpenAiCompat, streamOpenAiCompat } = require('../providers/openaiCompat');
const { callGoogleGemini, streamGoogleGemini } = require('../providers/googleGemini');
const { cooldownManager } = require('./cooldown');
const { promptCache } = require('./cache');
const { compressMessages } = require('./compression');
const { rescueInlineToolCalls, toolNamesFrom, normalizeTools } = require('../lib/toolRescue');
const { getMetricsPersistence } = require('./persistence');
const { modelDiscovery } = require('./modelDiscovery');

// Standard fallback priority order for platform free/budget mesh:
// Strictly prioritized by High-Intelligence (70B+ / Frontier), Instant Availability & Ultra-Fast Latency
const DEFAULT_PRIORITY_ORDER = Object.freeze([
  'ovh',         // Llama-3.3-70b @ 700ms (Frontier 70B, keyless instant-available)
  'pollinations',// Fast OpenAI-compatible keyless instant-available
  'groq',        // Llama-3.3-70b @ 140ms (High Intelligence + Ultra Fast)
  'cerebras',    // Llama-3.3-70b @ 100ms (1,800 tok/sec)
  'gemini',      // Gemini 2.0 Flash (Multimodal Frontier + Fast)
  'mistral',     // Mistral Large (Frontier Intelligence)
  'nvidia',      // Nemotron 70B / Llama 3.2 11B
  'openrouter',  // Llama 3.3 70B:free
  'deepseek',    // DeepSeek V3 / R1 (Frontier Reasoning)
  'cloudflare',  // Llama 3.1 70B
  'sambanova',   // Llama 3.3 70B
  'cohere',      // Command R+
  'siliconflow', // DeepSeek V3 / FLUX
  'huggingface', // Llama 3.3 70B
  'modelscope',  // Qwen 2.5 72B
  'openai',      // GPT-4o-mini
  'anyapi',      // Llama 3.3 70B
  'airforce',    // Llama 3.3 70B
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
const CHAT_PROVIDER_TYPES = Object.freeze(['openai-compat', 'google']);

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

    // Use verified defaultModel instantly with zero network blocking
    if (meta?.defaultModel) {
      return meta.defaultModel;
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
        // Otherwise use highest intelligence Frontier model discovered
        return liveModels[0].id;
      }
    } catch {
      // Fall back safely to registry default on discovery network error
    }

    return meta?.defaultModel || 'default';
  }

  /**
   * Fast credential sanity check to prevent trying placeholder passwords
   * or obviously malformed tokens that cause 401 failover latency loops.
   */
  _isValidKeyFormat(providerId, key) {
    if (!key || typeof key !== 'string') return false;
    const k = key.trim();
    if (k === 'keyless') return true;
    if (k.length < 8) return false;
    if (k.includes('@') && !k.startsWith('ghp_')) return false; // Common user passwords
    if (providerId === 'groq' && !k.startsWith('gsk_')) return false;
    if (providerId === 'openrouter' && !k.startsWith('sk-or-')) return false;
    if (providerId === 'cerebras' && !k.startsWith('csk-')) return false;
    if (providerId === 'gemini' && !k.startsWith('AIza')) return false;
    return true;
  }

  /**
   * Build the ordered failover cascade.
   *
   * Each entry carries a *key pool*, not a single credential. Search and media
   * providers are filtered out here — the single choke point every completion
   * passes through.
   */
  async buildCandidateList({ tenantContext, platformConfig = {}, requestedModel = null, fetchImpl }) {
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
        if (isSearchOrMediaMeta(meta) || !isChatCapableMeta(meta)) continue;
        if (allowed && allowed.size > 0 && !allowed.has(pId)) continue;

        const keys = normalizeKeyPool({ key: rawKey });
        if (keys.length === 0) continue;
        const model = await this.resolveModelForCandidate(pId, keys[0], meta.baseUrl, tenantContext?.primaryModel || requestedModel, fetchImpl);

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

      return candidates;
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
      }
    } catch { /* metrics are best-effort */ }

    for (const pId of orderedKeys) {
      const conf = providers[pId];
      if (!conf || conf.enabled === false) continue;

      const meta = getProviderMeta(pId);
      // Pillar 3 — isolation: search/media providers are not chat models.
      if (isSearchOrMediaMeta(meta)) continue;
      // Unknown provider ids are only callable when the operator supplied an
      // explicit OpenAI-compatible endpoint.
      if (!meta && !conf?.baseUrl) continue;
      if (!isChatCapableMeta(meta) && !conf?.baseUrl) continue;

      // Credential Integrity Gate: if a provider has zero recorded successes and its
      // keys were actively rejected with HTTP 401/403, do not waste latency calling it
      const recentReq = recentMap.get(pId);
      if (recentReq && !recentReq.ok && (recentReq.status === 401 || recentReq.status === 403)) {
        const metric = metricsMap.get(pId);
        if (metric && metric.successes === 0 && metric.failures >= 1) {
          continue;
        }
      }

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
      const model = await this.resolveModelForCandidate(pId, keys[0], baseUrl, modelTarget, fetchImpl);

      // Check if on active cooldown (provider-level or model-level)
      const cooldown = this.cooldownManager.isOnCooldown(pId, model);
      if (cooldown.onCooldown) continue;

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

    // If all providers are on cooldown, fall back to testing the earliest expired one
    if (candidates.length === 0) {
      for (const pId of orderedKeys) {
        const conf = providers[pId];
        if (!conf || conf.enabled === false) continue;
        const meta = getProviderMeta(pId);
        if (isSearchOrMediaMeta(meta)) continue;
        let keys = normalizeKeyPool(conf);
        if (keys.length === 0 && meta?.keyless) keys = ['keyless'];
        if (keys.length === 0) continue;
        candidates.push({
          provider: pId,
          keys,
          key: keys[0],
          model: conf.model || meta?.defaultModel,
          baseUrl: conf.baseUrl || meta?.baseUrl,
          isDedicatedByok: false,
        });
      }
    }

    // ─── DYNAMIC HEALTH & LATENCY ADAPTIVE RANKING (AUTONOMOUS TAKEOVER) ───
    // Dynamically promotes the best, fastest, and most intelligent active providers.
    // If a provider recently succeeded with low latency (<1.5s), it takes over #1.
    // If a provider recently failed or timed out, it is penalized and demoted.
    if (candidates.length > 1 && platformConfig?.enableFallback !== false) {
      candidates.sort((a, b) => {
        const scoreA = this._computeDynamicRankScore(a, platformConfig, metricsMap, recentMap, requestedModel);
        const scoreB = this._computeDynamicRankScore(b, platformConfig, metricsMap, recentMap, requestedModel);
        return scoreB - scoreA;
      });
    }

    return candidates;
  }

  _computeDynamicRankScore(candidate, platformConfig, metricsMap, recentMap, requestedModel) {
    const meta = getProviderMeta(candidate.provider);
    const m = metricsMap ? metricsMap.get(candidate.provider) : null;
    const r = recentMap ? recentMap.get(candidate.provider) : null;
    const isPrimary = platformConfig?.primary === candidate.provider;
    const req = String(requestedModel || '').toLowerCase().trim();

    // 0. If user specifically targeted this provider or model, it wins top priority
    if (req && (req === candidate.provider.toLowerCase() || req === candidate.model.toLowerCase())) {
      return 1000;
    }

    // 1. Intelligence & Speed capability baseline from curated catalog (0-100 scale)
    const intelligence = Number(meta?.intelligenceScore) || 85;
    const speed = Number(meta?.speedScore) || 85;
    let score = (intelligence * 0.6) + (speed * 0.4);

    // 2. Keyless providers have zero authentication failure risk
    if (meta?.keyless) {
      score += 20;
    }

    // 3. Operator's explicit primary preference
    if (isPrimary) {
      score += 35;
    }

    // 4. Most recent live request (instant-realtime health signal)
    if (r) {
      const ageMs = Math.max(0, Date.now() - Number(r.createdAt || 0));
      if (r.ok && r.status === 200) {
        score += 120; // Proven active and working right now
        if (r.latencyMs < 1000) {
          score += 50; // Lightning-fast sub-second response
        } else if (r.latencyMs < 2500) {
          score += 25; // Smooth sub-2.5s response
        } else if (r.latencyMs > 6000) {
          score -= 30; // Sluggish response
        }
      } else if (!r.ok) {
        // Decay penalty after 30 minutes
        const penalty = ageMs > 30 * 60 * 1000 ? 80 : 250;
        score -= penalty;
      }
    } else if (m) {
      // 5. Aggregate metrics fallback when no recent log entry exists
      if (m.lastStatus === 200) {
        score += 80;
        const latency = Number(m.lastLatencyMs || m.avgLatencyMs) || 2000;
        if (latency < 1000) score += 30;
        else if (latency < 2500) score += 15;
      } else if (m.lastStatus && m.lastStatus !== 200) {
        score -= 150;
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

  _recordMetrics({ provider, model, ok, latencyMs, status }) {
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
  }) {
    const prepared = this._resolveRequestOptions({
      prompt, messages: explicitMessages, systemPrompt, tools, compression, maxPromptTokens, platformConfig,
    });
    const messages = prepared.messages;
    const compressionStats = prepared.compression;
    const normalizedTools = prepared.tools;
    const toolNames = prepared.toolNames;

    // 1. In-Memory LRU Cache Check (structured tool turns are never cached)
    if (!bypassCache && normalizedTools.length === 0) {
      const cacheKeyModel = tenantContext?.primaryModel || requestedModel || 'default';
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
          compression: compressionStats,
        };
      }
    }

    // 2. Build Candidate Failover Cascade
    const candidates = await this.buildCandidateList({ tenantContext, platformConfig, requestedModel, fetchImpl });

    if (candidates.length === 0) {
      const err = new Error('No enabled AI provider is configured or healthy');
      err.code = 'AI_PROVIDER_UNAVAILABLE';
      err.status = 503;
      throw err;
    }

    const fallbacksAttempted = [];
    let lastError = null;

    // 3. Failover Execution Loop: provider → key pool
    for (const candidate of candidates) {
      const keyOrder = candidate.isDedicatedByok ? [0] : this._nextKeyOrder(candidate.provider, candidate.keys.length);
      let keyFailures = 0;
      let sawRateLimit = false;
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

          // Cache successful text-only responses in memory
          if (normalizedTools.length === 0 && !rescued.toolCalls) {
            this.promptCache.set(messages, candidate.model, temperature, {
              content: rescued.content,
              provider: candidate.provider,
              model: candidate.model,
              usage: rescued.usage,
            });
          }

          // Clear cooldown strikes on successful execution
          this.cooldownManager.clearCooldown(candidate.provider, candidate.model);
          this._recordMetrics({ provider: candidate.provider, model: candidate.model, ok: true, latencyMs, status: 200 });

          return {
            content: rescued.content,
            toolCalls: rescued.toolCalls || null,
            finishReason: rescued.finishReason || (rescued.toolCalls ? 'tool_calls' : 'stop'),
            provider: candidate.provider,
            model: candidate.model,
            usage: rescued.usage,
            cached: false,
            latencyMs,
            fallbacksAttempted,
            compression: compressionStats,
            keysAttempted: keyFailures + 1,
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
          this._recordMetrics({ provider: candidate.provider, model: candidate.model, ok: false, latencyMs, status });

          if (status === 429) sawRateLimit = true;
          if (status === 401 || status === 403) sawAuthFailure = true;
        }
      }

      // Only bench the *provider* once every key in its pool failed.
      if (!candidate.isDedicatedByok && (sawRateLimit || keyFailures === candidate.keys.length)) {
        this.cooldownManager.setCooldown(
          candidate.provider,
          candidate.model,
          sawRateLimit ? 'HTTP 429 across all pooled keys' : (sawAuthFailure ? 'All pooled keys rejected' : 'Provider unavailable'),
        );
      }

      // Dedicated BYOK errors should not fail over to other tenants or public mesh
      if (candidate.isDedicatedByok && candidates.length === 1) {
        throw lastError || new Error('Dedicated BYOK provider failed');
      }
    }

    // 4. All Candidates Exhausted
    const fallbackSummary = fallbacksAttempted.map(f => `${f.provider} (${f.code}: ${f.error})`).join('; ');
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

    const candidates = await this.buildCandidateList({ tenantContext, platformConfig, requestedModel, fetchImpl });
    if (candidates.length === 0) {
      const err = new Error('No enabled AI provider is configured or healthy');
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
          const events = (meta?.type === 'google' || candidate.provider === 'gemini')
            ? streamGoogleGemini({ ...shared, baseUrl: candidate.baseUrl || 'https://generativelanguage.googleapis.com/v1beta' })
            : streamOpenAiCompat({ ...shared, baseUrl: candidate.baseUrl, providerId: candidate.provider });

          for await (const event of events) {
            if (event.type === 'open') {
              opened = true;
              yield {
                type: 'meta',
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
          this.cooldownManager.clearCooldown(candidate.provider, candidate.model);
          this._recordMetrics({ provider: candidate.provider, model: candidate.model, ok: true, latencyMs, status: 200 });

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

          if (opened || emitted) {
            // Mid-stream failure: the client already received partial content.
            // Surface it instead of replaying the answer from another provider.
            this._recordMetrics({ provider: candidate.provider, model: candidate.model, ok: false, latencyMs: Date.now() - startTime, status });
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
          this._recordMetrics({ provider: candidate.provider, model: candidate.model, ok: false, latencyMs: Date.now() - startTime, status });
        }
      }

      if (!candidate.isDedicatedByok && (sawRateLimit || keyFailures === candidate.keys.length)) {
        this.cooldownManager.setCooldown(
          candidate.provider,
          candidate.model,
          sawRateLimit ? 'HTTP 429 across all pooled keys' : 'Provider unavailable',
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
