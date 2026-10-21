'use strict';

/**
 * FreeLLMAPI Unified In-Process Engine
 *
 * Single entry point for all 74 AI providers, failovers, health checks,
 * agent web search, prompt compression and Claude Code Agent execution across
 * the IME365 platform.
 *
 * Runs 100% in-process with zero extra daemons, zero network hops and zero
 * native C++ binaries — perfect for Hostinger Shared & local XAMPP.
 *
 * Reference parity (freellmapi 0.16.6):
 *   ✔ OpenAI-compatible `POST /v1/chat/completions` (+ SSE streaming)
 *   ✔ Anthropic `POST /v1/messages` (+ SSE streaming)
 *   ✔ `POST /v1/search` with six native search/extraction engines
 *   ✔ dedup / jsoncompact / hard-budget prompt compression
 *   ✔ inline tool-call dialect rescue
 *   ✔ multi-key pools per provider
 *   ✔ durable metrics + cooldown persistence (`node:sqlite`)
 */

const { PROVIDER_REGISTRY, getProviderMeta, listSupportedProviders } = require('./providers/registry');
const { freeLlmRouter, isChatCapableMeta, isSearchOrMediaMeta } = require('./services/router');
const { cooldownManager } = require('./services/cooldown');
const { promptCache } = require('./services/cache');
const { probeProviderConnection } = require('./services/health');
const { modelDiscovery } = require('./services/modelDiscovery');
const { compressMessages, ENGINE_IDS: COMPRESSION_ENGINE_IDS } = require('./services/compression');
const { rescueInlineToolCalls, toolNamesFrom, normalizeTools } = require('./lib/toolRescue');
const { searchWeb, listSearchProviders, searchAvailable, SEARCH_PLATFORM_IDS } = require('./services/search');
const { getMetricsPersistence, resetMetricsPersistenceForTests } = require('./services/persistence');
const {
  runClaudeCodeTask,
  handleAnthropicMessages,
  streamAnthropicMessages,
  translateAnthropicToMessages,
  CLAUDE_CODE_FAMILY_MAPPING,
} = require('./agent/claudeCodeAgent');

const ENGINE_VERSION = '0.17.0-inprocess-74p';

let _persistenceAttached = false;

/** Mirror cooldown expiry into the durable metrics DB (idempotent). */
function ensurePersistence() {
  if (_persistenceAttached) return getMetricsPersistence();
  const store = getMetricsPersistence();
  cooldownManager.attachPersistence(store);
  _persistenceAttached = true;
  return store;
}

// Attach on load so cooldowns survive a restart even before the first request.
try { ensurePersistence(); } catch { /* persistence is optional */ }

async function completeChat(options) {
  ensurePersistence();
  return freeLlmRouter.routeCompletion(options);
}

function streamChat(options) {
  ensurePersistence();
  return freeLlmRouter.routeStream(options);
}

async function search(options) {
  ensurePersistence();
  return searchWeb(options);
}

async function discoverModels(options) {
  return modelDiscovery.getOrDiscover(options);
}

async function testProvider(options) {
  return probeProviderConnection(options);
}

function listChatProviders() {
  return listSupportedProviders().filter(isChatCapableMeta);
}

function getEngineStatus() {
  const allProviders = listSupportedProviders();
  const chatProviders = allProviders.filter(isChatCapableMeta);
  const agentProviders = allProviders.filter(isSearchOrMediaMeta);
  const persistence = (() => {
    try { return ensurePersistence().getSummary(); } catch { return null; }
  })();

  return {
    version: ENGINE_VERSION,
    engine: 'FreeLLMAPI Native Fusion (74 Providers + Claude Code Agent)',
    totalProvidersCount: allProviders.length,
    chatProvidersCount: chatProviders.length,
    searchProvidersCount: agentProviders.filter(p => p.type === 'search').length,
    mediaProvidersCount: agentProviders.filter(p => p.type === 'media').length,
    supportedProviders: allProviders.map(p => ({
      id: p.id,
      name: p.name,
      type: p.type || 'openai-compat',
      defaultModel: p.defaultModel,
      freeTierAvailable: p.freeTierAvailable,
      keyless: Boolean(p.keyless),
      intelligenceScore: p.intelligenceScore || 80,
      speedScore: p.speedScore || 80,
    })),
    capabilities: {
      openaiChatCompletions: true,
      sseStreaming: true,
      anthropicMessages: true,
      agentWebSearch: true,
      promptCompressionEngines: COMPRESSION_ENGINE_IDS,
      toolCallRescue: true,
      multiKeyPools: true,
      durableMetrics: persistence ? persistence.backend : 'disabled',
    },
    activeCooldowns: cooldownManager.getStatus(),
    cacheEntries: promptCache.size(),
    persistence,
    claudeCodeAgent: {
      status: 'active',
      mappedFamilies: Object.keys(CLAUDE_CODE_FAMILY_MAPPING),
    },
  };
}

function getMetrics(options = {}) {
  const store = ensurePersistence();
  return {
    summary: store.getSummary(),
    providers: store.getProviderMetrics({ limit: options.limit || 100 }),
    recentRequests: store.getRecentRequests({ limit: options.logLimit || 50 }),
  };
}

function clearCache() {
  promptCache.clear();
  return { ok: true, message: 'In-memory prompt cache cleared' };
}

function resetCooldowns() {
  cooldownManager.resetAll();
  return { ok: true, message: 'All provider cooldowns reset' };
}

function resetMetricsForTests() {
  if (_persistenceAttached) {
    try { cooldownManager.attachPersistence(null); } catch { /* ignore */ }
  }
  _persistenceAttached = false;
  resetMetricsPersistenceForTests();
}

let _maintenanceTimer = null;

function startAutonomousMaintenance({ intervalMs = 6 * 60 * 60 * 1000 } = {}) {
  if (_maintenanceTimer) return;
  _maintenanceTimer = setInterval(async () => {
    try {
      // 1. Purge expired cooldowns
      cooldownManager.cleanExpired();
      // 2. Clean prompt cache
      promptCache.cleanExpired();
    } catch (err) {
      console.warn('[FreeLLMAPI Autonomous] Maintenance cycle error:', err.message);
    }
  }, intervalMs);

  if (_maintenanceTimer.unref) {
    _maintenanceTimer.unref(); // Do not prevent Node process from exiting cleanly in scripts/tests
  }
}

function stopAutonomousMaintenance() {
  if (_maintenanceTimer) {
    clearInterval(_maintenanceTimer);
    _maintenanceTimer = null;
  }
}

module.exports = {
  ENGINE_VERSION,
  // chat
  completeChat,
  streamChat,
  // agent tools
  search,
  searchWeb,
  searchAvailable,
  listSearchProviders,
  SEARCH_PLATFORM_IDS,
  // provider catalog
  testProvider,
  discoverModels,
  modelDiscovery,
  getEngineStatus,
  getProviderCatalog: listSupportedProviders,
  getChatProviders: listChatProviders,
  getProviderMeta,
  isChatCapableMeta,
  isSearchOrMediaMeta,
  PROVIDER_REGISTRY,
  // compression
  compressMessages,
  COMPRESSION_ENGINE_IDS,
  // tool rescue
  rescueInlineToolCalls,
  toolNamesFrom,
  normalizeTools,
  // observability & maintenance
  getMetrics,
  ensurePersistence,
  get persistence() { return ensurePersistence(); },
  clearCache,
  resetCooldowns,
  resetMetricsForTests,
  startAutonomousMaintenance,
  stopAutonomousMaintenance,
  cooldownManager,
  promptCache,
  freeLlmRouter,
  // Claude Code Agent exports
  runClaudeCodeTask,
  handleAnthropicMessages,
  streamAnthropicMessages,
  translateAnthropicToMessages,
  CLAUDE_CODE_FAMILY_MAPPING,
};
