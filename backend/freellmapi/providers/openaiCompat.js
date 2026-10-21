'use strict';

/**
 * FreeLLMAPI OpenAI-Compatible Adapter
 *
 * Implements high-performance, resilient chat completions against any OpenAI-compatible API:
 * Groq, Cerebras, NVIDIA NIM, Mistral, OpenRouter, DeepSeek, OpenAI, Cloudflare, etc.
 *
 * Features:
 * - Robust AbortController timeout handling
 * - DeepSeek / reasoning <think>...</think> stripping
 * - Native error classification (429 RateLimit, 401 Auth, 5xx Server, Timeout)
 * - Safe JSON mode negotiation
 */

function stripThinkTags(text) {
  if (!text || typeof text !== 'string') return text;
  // Remove <think>...</think> blocks from DeepSeek R1 / reasoning models
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

function classifyError(status, message, body) {
  const msg = String(message || '').toLowerCase();
  const rawBody = typeof body === 'string' ? body.toLowerCase() : JSON.stringify(body || {}).toLowerCase();
  
  if (status === 401 || status === 403 || msg.includes('invalid api key') || rawBody.includes('invalid_api_key')) {
    return { code: 'INVALID_API_KEY', status: 401, retryable: false };
  }
  if (status === 429 || msg.includes('rate limit') || msg.includes('quota') || rawBody.includes('rate_limit') || rawBody.includes('insufficient_quota')) {
    return { code: 'RATE_LIMIT_EXCEEDED', status: 429, retryable: true };
  }
  if (status === 404 || msg.includes('model not found') || rawBody.includes('model_not_found')) {
    return { code: 'MODEL_NOT_FOUND', status: 404, retryable: true };
  }
  if (status >= 500 || status === 502 || status === 503 || status === 504) {
    return { code: 'PROVIDER_SERVER_ERROR', status: status || 502, retryable: true };
  }
  return { code: 'PROVIDER_ERROR', status: status || 500, retryable: false };
}

async function callOpenAiCompat({
  baseUrl,
  apiKey,
  model,
  messages,
  temperature = 0.3,
  maxTokens = 4096,
  jsonMode = false,
  timeoutMs = 45000,
  providerId = 'openai-compat',
  fetchImpl = globalThis.fetch,
  signal,
}) {
  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey.trim()}`,
  };

  if (providerId === 'openrouter') {
    headers['HTTP-Referer'] = 'https://ime365.com';
    headers['X-Title'] = 'IME365 Professional Career Suite';
  }

  const payload = {
    model: model.trim(),
    messages,
    temperature: typeof temperature === 'number' ? temperature : 0.3,
    max_tokens: typeof maxTokens === 'number' ? maxTokens : 4096,
  };

  if (jsonMode) {
    // Only pass json_object format if supported
    payload.response_format = { type: 'json_object' };
  }

  const controller = new AbortController();
  const effectiveSignal = signal || controller.signal;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const startTime = Date.now();
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: effectiveSignal,
    });

    clearTimeout(timer);
    const latencyMs = Date.now() - startTime;
    const rawText = await res.text();

    let data;
    try {
      data = JSON.parse(rawText);
    } catch {
      data = null;
    }

    if (!res.ok) {
      const errorMsg = data?.error?.message || data?.message || rawText.slice(0, 300);
      const classified = classifyError(res.status, errorMsg, data || rawText);
      const err = new Error(`[${providerId}] ${errorMsg} (HTTP ${res.status})`);
      err.code = classified.code;
      err.status = classified.status;
      err.retryable = classified.retryable;
      err.provider = providerId;
      err.model = model;
      err.latencyMs = latencyMs;
      throw err;
    }

    const rawContent = data?.choices?.[0]?.message?.content || '';
    const cleanContent = stripThinkTags(rawContent);

    if (!cleanContent) {
      const err = new Error(`[${providerId}] Empty completion received from model ${model}`);
      err.code = 'EMPTY_COMPLETION';
      err.status = 502;
      err.retryable = true;
      err.provider = providerId;
      throw err;
    }

    return {
      content: cleanContent,
      provider: providerId,
      model,
      usage: {
        promptTokens: data?.usage?.prompt_tokens || 0,
        completionTokens: data?.usage?.completion_tokens || 0,
        totalTokens: data?.usage?.total_tokens || 0,
      },
      latencyMs,
    };
  } catch (error) {
    clearTimeout(timer);
    if (error.name === 'AbortError' || effectiveSignal.aborted) {
      const err = new Error(`[${providerId}] Request timed out after ${timeoutMs}ms for model ${model}`);
      err.code = 'REQUEST_TIMEOUT';
      err.status = 504;
      err.retryable = true;
      err.provider = providerId;
      err.model = model;
      throw err;
    }
    throw error;
  }
}

module.exports = {
  callOpenAiCompat,
  classifyError,
  stripThinkTags,
};
