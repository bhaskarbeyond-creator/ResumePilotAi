#!/usr/bin/env node
'use strict';

/**
 * Live AI Fleet Verification & Model Health Probe Suite — IME365
 *
 * Gated, executable probe suite runnable on demand and in CI/staging.
 * Contacts each configured upstream AI provider with real configured credentials,
 * testing for: alive / retired / timeout / auth-invalid / not-configured / rate-limited.
 *
 * Usage:
 *   node backend/scripts/probe-ai-fleet.js [--json] [--timeout <ms>] [--provider <name>]
 */

const path = require('node:path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

const { loadProviderConfiguration } = require('../services/aiRuntime');
const { getAdapter } = require('../services/aiRouting/providerAdapters');

const PROBE_PROVIDERS = ['nvidia', 'groq', 'openrouter', 'gemini', 'openai', 'deepseek'];
const DEFAULT_PROBE_TIMEOUT_MS = 12000;

async function probeSingleProvider(providerId, providerConfig, { timeoutMs = DEFAULT_PROBE_TIMEOUT_MS, fetchImpl = global.fetch } = {}) {
  const adapter = getAdapter(providerId);
  const key = String(providerConfig?.key || '').trim();
  const model = String(providerConfig?.model || adapter?.defaultModel || '').trim();

  if (!key) {
    return {
      provider: providerId,
      model,
      status: 'not-configured',
      httpStatus: null,
      latencyMs: 0,
      alive: false,
      errorClass: 'unconfigured',
      message: 'No API key configured in environment or database',
      responseSnippet: null,
    };
  }

  if (!adapter) {
    return {
      provider: providerId,
      model,
      status: 'no-adapter',
      httpStatus: null,
      latencyMs: 0,
      alive: false,
      errorClass: 'unsupported',
      message: `No adapter registered for provider ${providerId}`,
      responseSnippet: null,
    };
  }

  const startTime = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const request = adapter.buildChatRequest({
      providerConfig: { ...providerConfig, key, model },
      model,
      prompt: 'Respond with exactly one word: OK',
      temperature: 0.1,
      maxTokens: 10,
    });

    const response = await fetchImpl(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal: controller.signal,
    });

    clearTimeout(timer);
    const latencyMs = Date.now() - startTime;
    const rawText = await response.text().catch(() => '');
    let body = {};
    try { body = JSON.parse(rawText); } catch { body = { raw: rawText }; }

    const status = response.status;
    const bodyStr = JSON.stringify(body).toLowerCase();

    if (response.ok) {
      let snippet = '';
      try {
        const extracted = adapter.extractChatResponse(body, status);
        snippet = String(extracted.content || '').trim().slice(0, 80);
      } catch {
        snippet = rawText.slice(0, 80);
      }
      return {
        provider: providerId,
        model,
        status: 'alive',
        httpStatus: status,
        latencyMs,
        alive: true,
        errorClass: null,
        message: 'Model is responsive and producing tokens',
        responseSnippet: snippet,
      };
    }

    if (status === 410 || bodyStr.includes('retired') || bodyStr.includes('deprecated') || bodyStr.includes('model_retired')) {
      return {
        provider: providerId,
        model,
        status: 'retired',
        httpStatus: status,
        latencyMs,
        alive: false,
        errorClass: 'model_retired',
        message: body.error?.message || body.message || 'Model has been retired by upstream provider',
        responseSnippet: null,
      };
    }

    if (status === 404 || bodyStr.includes('model not found') || bodyStr.includes('does not exist')) {
      return {
        provider: providerId,
        model,
        status: 'not-found',
        httpStatus: status,
        latencyMs,
        alive: false,
        errorClass: 'model_not_found',
        message: body.error?.message || body.message || 'Model was not found or account lacks access',
        responseSnippet: null,
      };
    }

    if (status === 401 || status === 403 || bodyStr.includes('invalid api key') || bodyStr.includes('unauthorized') || bodyStr.includes('invalid_api_key')) {
      return {
        provider: providerId,
        model,
        status: 'auth-invalid',
        httpStatus: status,
        latencyMs,
        alive: false,
        errorClass: 'auth_invalid',
        message: body.error?.message || body.message || `API key rejected (HTTP ${status})`,
        responseSnippet: null,
      };
    }

    if (status === 429 || bodyStr.includes('rate limit') || bodyStr.includes('quota')) {
      return {
        provider: providerId,
        model,
        status: 'rate-limited',
        httpStatus: status,
        latencyMs,
        alive: false,
        errorClass: 'rate_limit',
        message: body.error?.message || body.message || 'Upstream rate limit or quota exceeded',
        responseSnippet: null,
      };
    }

    return {
      provider: providerId,
      model,
      status: 'upstream-error',
      httpStatus: status,
      latencyMs,
      alive: false,
      errorClass: 'provider_error',
      message: body.error?.message || body.message || `Upstream returned HTTP ${status}`,
      responseSnippet: rawText.slice(0, 120),
    };

  } catch (err) {
    clearTimeout(timer);
    const latencyMs = Date.now() - startTime;
    if (err.name === 'AbortError' || controller.signal.aborted) {
      return {
        provider: providerId,
        model,
        status: 'timeout',
        httpStatus: 408,
        latencyMs,
        alive: false,
        errorClass: 'timeout',
        message: `Upstream request timed out after ${timeoutMs}ms`,
        responseSnippet: null,
      };
    }
    return {
      provider: providerId,
      model,
      status: 'network-error',
      httpStatus: null,
      latencyMs,
      alive: false,
      errorClass: 'network_failure',
      message: err.message || 'Network connection failed',
      responseSnippet: null,
    };
  }
}

async function probeAiFleet({ providers = PROBE_PROVIDERS, timeoutMs = DEFAULT_PROBE_TIMEOUT_MS, environment = process.env, fetchImpl = global.fetch, runtimeConfig: passedConfig = null } = {}) {
  let runtimeConfig = passedConfig;
  if (!runtimeConfig) {
    try {
      runtimeConfig = await loadProviderConfiguration(environment);
    } catch (err) {
      return {
        timestamp: new Date().toISOString(),
        fleetAlive: false,
        summary: {
          totalProbed: 0,
          aliveCount: 0,
          deadCount: 0,
          unconfiguredCount: 0,
          primaryProvider: 'none',
          primaryAlive: false,
        },
        error: `Could not load provider configuration: ${err.message}`,
        diagnosticCode: err.diagnosticCode || err.code || 'CONFIG_LOAD_FAILED',
        remediation: err.remediation || null,
        answer: `AI Fleet is UNCONFIGURED / BLOCKED: ${err.message}`,
        results: [],
      };
    }
  }

  const results = [];
  for (const pId of providers) {
    const pConfig = runtimeConfig.providers[pId] || {};
    const res = await probeSingleProvider(pId, pConfig, { timeoutMs, fetchImpl });
    results.push(res);
  }

  const aliveProviders = results.filter(r => r.alive);
  const deadProviders = results.filter(r => !r.alive && r.status !== 'not-configured');
  const unconfiguredProviders = results.filter(r => r.status === 'not-configured');

  return {
    timestamp: new Date().toISOString(),
    fleetAlive: aliveProviders.length > 0,
    summary: {
      totalProbed: results.length,
      aliveCount: aliveProviders.length,
      deadCount: deadProviders.length,
      unconfiguredCount: unconfiguredProviders.length,
      primaryProvider: runtimeConfig.primary,
      primaryAlive: results.find(r => r.provider === runtimeConfig.primary)?.alive || false,
    },
    answer: aliveProviders.length > 0
      ? `AI Fleet is OPERATIONAL with ${aliveProviders.length} active provider(s) (${aliveProviders.map(a => `${a.provider}:${a.model}`).join(', ')}).`
      : 'AI Fleet is DOWN. Zero configured providers are responding successfully.',
    results,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const jsonOutput = args.includes('--json');
  const timeoutIdx = args.indexOf('--timeout');
  const timeoutMs = timeoutIdx !== -1 && args[timeoutIdx + 1] ? Number(args[timeoutIdx + 1]) : DEFAULT_PROBE_TIMEOUT_MS;

  const fleet = await probeAiFleet({ timeoutMs });

  if (jsonOutput) {
    console.log(JSON.stringify(fleet, null, 2));
    process.exit(fleet.fleetAlive ? 0 : 1);
  }

  console.log('\n============================================================');
  console.log('   LIVE AI FLEET OPERATIONAL VERIFICATION REPORT');
  console.log('============================================================');
  console.log(`Timestamp       : ${fleet.timestamp}`);
  console.log(`Fleet Status    : ${fleet.fleetAlive ? 'OPERATIONAL' : 'DOWN'}`);
  console.log(`Primary Provider: ${fleet.summary?.primaryProvider || 'none'} (${fleet.summary?.primaryAlive ? 'ALIVE' : 'DEAD / DOWN'})`);
  console.log(`Summary Counts  : ${fleet.summary?.aliveCount} alive, ${fleet.summary?.deadCount} failing, ${fleet.summary?.unconfiguredCount} unconfigured`);
  console.log(`\nDirect Verdict  :\n  >> ${fleet.answer}`);

  if (fleet.error) {
    console.log(`\n[!] CONFIG ERROR: ${fleet.error}`);
    if (fleet.remediation) console.log(`    Remediation : ${fleet.remediation}`);
  }

  console.log('\nDetailed Per-Model Probe Results:');
  console.log('------------------------------------------------------------');
  for (const r of fleet.results || []) {
    const statusTag = r.alive ? '[ALIVE]' : `[${r.status.toUpperCase()}]`;
    const latencyTag = r.latencyMs > 0 ? `${r.latencyMs}ms` : '-';
    console.log(`${r.provider.padEnd(12)} | ${r.model.padEnd(35)} | ${statusTag.padEnd(14)} | ${latencyTag.padEnd(8)} | HTTP ${r.httpStatus || 'N/A'}`);
    if (!r.alive) {
      console.log(`    ↳ Reason: ${r.message}`);
    } else if (r.responseSnippet) {
      console.log(`    ↳ Output: "${r.responseSnippet}"`);
    }
  }
  console.log('============================================================\n');

  process.exit(fleet.fleetAlive ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = {
  probeSingleProvider,
  probeAiFleet,
};
