'use strict';

/**
 * FreeLLMAPI Live Health & Reachability Prober
 *
 * Performs zero-simulation live reachability and latency checks for
 * Super Admin Master Keys and Tenant Dedicated BYOK keys.
 */

const { getProviderMeta } = require('../providers/registry');
const { callOpenAiCompat } = require('../providers/openaiCompat');
const { callGoogleGemini } = require('../providers/googleGemini');

async function probeProviderConnection({
  providerId,
  apiKey,
  model,
  baseUrl,
  timeoutMs = 12000,
  fetchImpl = globalThis.fetch,
}) {
  const meta = getProviderMeta(providerId);
  const targetBaseUrl = baseUrl || meta?.baseUrl;
  const targetModel = model || meta?.defaultModel;
  const effectiveKey = ((!apiKey || !String(apiKey).trim()) && meta?.keyless) ? 'keyless' : apiKey;

  if (!effectiveKey || !String(effectiveKey).trim()) {
    return {
      ok: false,
      status: 400,
      code: 'MISSING_API_KEY',
      error: `API key is required for provider ${providerId}`,
      latencyMs: 0,
    };
  }

  if (!targetBaseUrl && meta?.type !== 'google') {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_ENDPOINT',
      error: `No valid baseUrl configured for provider ${providerId}`,
      latencyMs: 0,
    };
  }

  const testMessages = [
    { role: 'user', content: 'Respond with the single word: OK' },
  ];

  const startTime = Date.now();
  try {
    let result;
    if (meta?.type === 'horde') {
      result = await require('../providers/aiHorde').callAiHorde({ baseUrl: targetBaseUrl, apiKey: effectiveKey, model: targetModel, messages: testMessages, maxTokens: 16, timeoutMs, fetchImpl });
    } else if (meta?.type === 'google' || providerId === 'gemini') {
      result = await callGoogleGemini({
        baseUrl: targetBaseUrl || 'https://generativelanguage.googleapis.com/v1beta',
        apiKey: effectiveKey,
        model: targetModel,
        messages: testMessages,
        maxTokens: 10,
        temperature: 0.1,
        timeoutMs,
        fetchImpl,
      });
    } else {
      result = await callOpenAiCompat({
        baseUrl: targetBaseUrl,
        apiKey: effectiveKey,
        model: targetModel,
        messages: testMessages,
        maxTokens: 10,
        temperature: 0.1,
        timeoutMs,
        providerId,
        fetchImpl,
      });
    }

    return {
      ok: true,
      provider: providerId,
      model: targetModel,
      latencyMs: result.latencyMs || (Date.now() - startTime),
      preview: result.content.slice(0, 50),
    };
  } catch (error) {
    return {
      ok: false,
      provider: providerId,
      model: targetModel,
      status: error.status || 500,
      code: error.code || 'PROBE_FAILED',
      error: error.message || 'Connection test failed',
      latencyMs: Date.now() - startTime,
    };
  }
}

module.exports = {
  probeProviderConnection,
};
