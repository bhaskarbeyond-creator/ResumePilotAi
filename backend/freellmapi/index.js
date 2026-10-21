'use strict';

/**
 * FreeLLMAPI Unified In-Process Engine
 *
 * Single entry point for all 71 AI providers, failovers, health checks,
 * and Claude Code Agent execution across the IME365 platform.
 * Runs 100% in-process with zero extra daemons, zero network hops, and zero native C++ binaries.
 * Perfect for Hostinger Shared & local XAMPP.
 */

const { PROVIDER_REGISTRY, getProviderMeta, listSupportedProviders } = require('./providers/registry');
const { freeLlmRouter } = require('./services/router');
const { cooldownManager } = require('./services/cooldown');
const { promptCache } = require('./services/cache');
const { probeProviderConnection } = require('./services/health');
const { modelDiscovery } = require('./services/modelDiscovery');
const {
  runClaudeCodeTask,
  handleAnthropicMessages,
  CLAUDE_CODE_FAMILY_MAPPING,
} = require('./agent/claudeCodeAgent');

async function completeChat(options) {
  return freeLlmRouter.routeCompletion(options);
}

async function discoverModels(options) {
  return modelDiscovery.getOrDiscover(options);
}

async function testProvider(options) {
  return probeProviderConnection(options);
}

function getEngineStatus() {
  const allProviders = listSupportedProviders();
  return {
    version: '0.16.6-inprocess-71p',
    engine: 'FreeLLMAPI Native Fusion (71 Providers + Claude Code Agent)',
    totalProvidersCount: allProviders.length,
    supportedProviders: allProviders.map(p => ({
      id: p.id,
      name: p.name,
      defaultModel: p.defaultModel,
      freeTierAvailable: p.freeTierAvailable,
      intelligenceScore: p.intelligenceScore || 80,
      speedScore: p.speedScore || 80,
    })),
    activeCooldowns: cooldownManager.getStatus(),
    cacheEntries: promptCache.size(),
    claudeCodeAgent: {
      status: 'active',
      mappedFamilies: Object.keys(CLAUDE_CODE_FAMILY_MAPPING),
    },
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
  completeChat,
  testProvider,
  discoverModels,
  modelDiscovery,
  getEngineStatus,
  getProviderCatalog: listSupportedProviders,
  getProviderMeta,
  clearCache,
  resetCooldowns,
  startAutonomousMaintenance,
  stopAutonomousMaintenance,
  cooldownManager,
  promptCache,
  freeLlmRouter,
  // Claude Code Agent exports
  runClaudeCodeTask,
  handleAnthropicMessages,
  CLAUDE_CODE_FAMILY_MAPPING,
};
