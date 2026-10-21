'use strict';

/**
 * Compatibility layer: re-exports legacy aiRouting symbols backed by FreeLLMAPI.
 *
 * This module allows aiRuntime.js to migrate off ./aiRouting without rewriting
 * its internal helper functions (providerOrder, getSharedAiRouter, requestProvider).
 * All implementations delegate to FreeLLMAPI core where possible.
 */

const {
  PROVIDER_REGISTRY,
  getProviderMeta,
  listSupportedProviders,
} = require('../../../freellmapi/providers/registry');

const { freeLlmRouter } = require('../../../freellmapi/services/router');
const { fetchWithDeadline } = require('../../../freellmapi/providers/openaiCompat');
const { modelDiscovery } = require('../../../freellmapi/services/modelDiscovery');

// ============================================================
// 1. Provider Adapter Compatibility (getAdapter, listAdapterIds)
// ============================================================

// Minimal adapter interface expected by aiRuntime.requestProvider()
function createCompatAdapter(providerId) {
  const meta = getProviderMeta(providerId);
  if (!meta) return null;

  return {
    name: meta.name || providerId,
    defaultModel: meta.defaultModel || 'default',
    defaultChatUrl: meta.baseUrl || '',
    buildChatRequest({ providerConfig, model, prompt, temperature, maxTokens }) {
      const messages = Array.isArray(prompt)
        ? prompt
        : [{ role: 'user', content: String(prompt || '') }];
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${providerConfig?.key || ''}`,
      };
      const body = JSON.stringify({
        model,
        messages,
        temperature: temperature ?? 0.7,
        max_tokens: maxTokens ?? 2048,
      });
      const baseUrl = providerConfig?.baseUrl || meta.baseUrl || '';
      const url = `${baseUrl.replace(/\/$/, '')}/v1/chat/completions`;
      return { url, method: 'POST', headers, body };
    },
    extractChatResponse(body) {
      const content = body?.choices?.[0]?.message?.content || '';
      const usage = body?.usage
        ? {
            promptTokens: body.usage.prompt_tokens || 0,
            completionTokens: body.usage.completion_tokens || 0,
            totalTokens: body.usage.total_tokens || 0,
          }
        : { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
      return { content, usage };
    },
  };
}

function getAdapter(providerId) {
  return createCompatAdapter(providerId);
}

function listAdapterIds() {
  return listSupportedProviders()
    .filter(meta => meta.type === 'openai-compat' || meta.type === 'google')
    .map(meta => meta.id);
}

// ============================================================
// 2. Provider Order / Model Selection Compatibility
// ============================================================

// Re-export computeProviderOrder from modelSelector logic (simplified for compat)
function computeProviderOrder(configuration) {
  const providers = configuration?.providers || {};
  const enabled = Object.keys(providers).filter(provider => providers[provider]?.enabled === true);
  if (!enabled.length) return [];
  const primary = enabled.includes(configuration.primary) ? configuration.primary : enabled[0];
  return configuration.enableFallback === false ? [primary] : [primary, ...enabled.filter(p => p !== primary)];
}

// createAiModelRouter - returns a router compatible with the old interface
function createAiModelRouter({ log = console.warn } = {}) {
  // The new freeLlmRouter is the canonical router; we wrap it to match old API
  return {
    async route({ prompt, configuration, operation, fetchImpl, signal, timeoutMs }) {
      const isJson = operation && ['generate-summary', 'generate-work-description', 'generate-education-description', 'enhance-single-bullet', 'autocomplete', 'generate-job-description', 'generate-projects', 'parse-resume'].includes(operation);
      const result = await freeLlmRouter.routeCompletion({
        prompt,
        platformConfig: configuration,
        tenantContext: configuration?.tenantContext,
        temperature: configuration?.temperature ?? 0.3,
        maxTokens: configuration?.maxTokens ?? 4096,
        jsonMode: isJson,
        timeoutMs: timeoutMs || 45000,
        fetchImpl,
        signal,
      });
      return {
        raw: result.content,
        provider: result.provider,
        model: result.model,
        usage: result.usage,
        routing: {
          latencyMs: result.latencyMs,
          cached: result.cached,
          fallbacksAttempted: result.fallbacksAttempted,
        },
      };
    },
    reset() {
      // freeLlmRouter is stateless per-request; no-op
    },
  };
}

// ============================================================
// 3. HTTP Deadline & Error Extraction (from openaiCompat)
// ============================================================

// Re-export fetchWithDeadline from openaiCompat
// Already imported above

// Provider error message extraction (from googleGemini/openaiCompat logic)
function extractProviderErrorMessage(body, status, adapterName) {
  if (!body) return `HTTP ${status}`;
  // OpenAI-compatible error format
  if (body.error?.message) return body.error.message;
  if (body.message) return body.message;
  // Google Gemini error format
  if (body.error?.details) return JSON.stringify(body.error.details);
  return `HTTP ${status} from ${adapterName}`;
}

// ============================================================
// 4. Requirement Profiles (deriveRequirementProfile)
// ============================================================

// Simplified requirement profile derivation
function deriveRequirementProfile(operation, payload = {}) {
  const structuredOutput = [
    'generate-summary',
    'generate-work-description',
    'generate-education-description',
    'enhance-single-bullet',
    'autocomplete',
    'generate-job-description',
    'generate-projects',
    'parse-resume',
  ].includes(operation);

  return {
    operation,
    structuredOutput,
    streaming: true,
    reasoningRequired: operation === 'parse-resume' || operation === 'generate-summary',
    longContextRequired: ['generate-summary', 'parse-resume'].includes(operation),
    qualityTier: operation === 'parse-resume' ? 'premium' : 'standard',
    requiredTokens: operation === 'parse-resume' ? 8000 : 4000,
    latencySensitivity: ['autocomplete', 'generate-interview', 'live-interview-turn', 'live-interview-open', 'live-interview-guide'].includes(operation) ? 'high' : 'normal',
    modalities: [],
  };
}

// ============================================================
// 5. Model Selector (selectModels) - delegate to FreeLLMAPI router
// ============================================================

async function selectModels({ configuration, requirement, catalog = null, tenantAccess = null, health = null, seedModels = null, isProviderUnreachable = null, primaryModelPolicy = null, now = null }) {
  // Build a minimal candidate list for compatibility
  const providerOrder = computeProviderOrder(configuration);
  const candidates = [];

  for (const provider of providerOrder) {
    const providerConfig = configuration?.providers?.[provider] || {};
    if (!providerConfig.enabled || !providerConfig.key) continue;

    const meta = getProviderMeta(provider);
    const model = providerConfig.model || meta?.defaultModel || 'default';

    candidates.push({
      provider,
      model,
      eligible: true,
      origin: 'configured',
      score: 100,
      reasons: ['compat:configured'],
      caps: meta ? { capabilities: { structuredOutput: true, streaming: true } } : null,
    });
  }

  return {
    decisionId: `compat-${Date.now()}`,
    candidates,
    order: candidates.map(c => ({ provider: c.provider, model: c.model })),
    selection: candidates[0] || null,
    eligibleCount: candidates.length,
    rejectedCount: 0,
    lastResort: false,
    selectionLatencyMs: 0,
    rationale: `compat: ${candidates.length} configured providers`,
  };
}

// ============================================================
// 6. Error Classification (classifyProviderError, classifyThrownError)
// ============================================================

const NETWORK_ERROR_PATTERN = /ECONNRESET|ETIMEDOUT|fetch failed|Inference connection error|connection error|socket hang up|network|ENOTFOUND|EAI_AGAIN/i;

function classifyProviderError({ status, message = '' }) {
  const text = String(message);
  if (status === 429 || /rate.?limit|too many requests|Worker local total request limit|quota exceeded/i.test(text)) return 'rate_limited';
  if (status === 401 || status === 403) return 'credential';
  if (status === 404 || /model_not_found|model not found|not found for account|invalid.?model|no such model|end of life|no longer available|deprecated|retired/i.test(text)) {
    return 'model_not_found';
  }
  if (status === 504 || /timed out|timeout/i.test(text)) return 'timeout';
  if (status >= 500) return 'server';
  if (status === 400) return 'bad_request';
  if (NETWORK_ERROR_PATTERN.test(text)) return 'network';
  return 'provider_error';
}

function classifyThrownError(error) {
  if (!error) return { errorClass: 'provider_error', status: 0 };
  // Check for ProviderRequestError-like structure
  if (error.errorClass) return { errorClass: error.errorClass, status: error.status || 0 };
  if (error.name === 'TimeoutError' || error.code === 'AI_PROVIDER_TIMEOUT') return { errorClass: 'timeout', status: 504 };
  if (error.name === 'AbortError') return { errorClass: 'aborted', status: 0 };
  const message = String(error.message || '');
  const status = Number(error.status) || 0;
  if (status) return { errorClass: classifyProviderError({ status, message }), status };
  if (NETWORK_ERROR_PATTERN.test(message)) return { errorClass: 'network', status: 0 };
  return { errorClass: 'provider_error', status: 0 };
}

const RETRYABLE_CLASSES = new Set(['server', 'network', 'rate_limited']);

module.exports = {
  // Provider adapters
  getAdapter,
  listAdapterIds,
  // Provider order / router
  computeProviderOrder,
  createAiModelRouter,
  // HTTP & errors
  fetchWithDeadline,
  extractProviderErrorMessage,
  // Requirement profiles
  deriveRequirementProfile,
  // Model selection
  selectModels,
  // Error classification
  classifyProviderError,
  classifyThrownError,
  RETRYABLE_CLASSES,
};