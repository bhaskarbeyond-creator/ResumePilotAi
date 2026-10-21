'use strict';

/**
 * FreeLLMAPI Google Gemini Adapter
 *
 * Implements native integration with Google Gemini 2.0 Flash / 1.5 Pro / 1.5 Flash
 * via the v1beta generateContent API.
 */

function formatGeminiContents(messages) {
  let systemInstruction = null;
  const contents = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      // Gemini takes system instruction as top-level object
      systemInstruction = {
        parts: [{ text: String(msg.content || '') }],
      };
    } else {
      const role = msg.role === 'assistant' ? 'model' : 'user';
      contents.push({
        role,
        parts: [{ text: String(msg.content || '') }],
      });
    }
  }

  // Ensure there is at least one content part
  if (contents.length === 0) {
    contents.push({
      role: 'user',
      parts: [{ text: 'Hello' }],
    });
  }

  return { systemInstruction, contents };
}

function classifyGeminiError(status, message, rawBody) {
  const msg = String(message || '').toLowerCase();
  const body = typeof rawBody === 'string' ? rawBody.toLowerCase() : JSON.stringify(rawBody || {}).toLowerCase();

  if (status === 400 && (msg.includes('api key') || body.includes('api_key_invalid'))) {
    return { code: 'INVALID_API_KEY', status: 401, retryable: false };
  }
  if (status === 403 || msg.includes('permission_denied') || body.includes('permission_denied')) {
    return { code: 'PERMISSION_DENIED', status: 403, retryable: false };
  }
  if (status === 429 || msg.includes('resource_exhausted') || body.includes('resource_exhausted') || msg.includes('quota')) {
    return { code: 'RATE_LIMIT_EXCEEDED', status: 429, retryable: true };
  }
  if (status === 404 || msg.includes('not found') || body.includes('model_not_found')) {
    return { code: 'MODEL_NOT_FOUND', status: 404, retryable: true };
  }
  if (status >= 500 || msg.includes('unavailable') || body.includes('overloaded')) {
    return { code: 'PROVIDER_SERVER_ERROR', status: 502, retryable: true };
  }
  return { code: 'PROVIDER_ERROR', status: status || 500, retryable: false };
}

async function callGoogleGemini({
  baseUrl = 'https://generativelanguage.googleapis.com/v1beta',
  apiKey,
  model = 'gemini-2.0-flash',
  messages,
  temperature = 0.3,
  maxTokens = 4096,
  jsonMode = false,
  timeoutMs = 45000,
  fetchImpl = globalThis.fetch,
  signal,
}) {
  const cleanModel = model.replace(/^models\//, '');
  const cleanBase = baseUrl.replace(/\/+$/, '');
  const url = `${cleanBase}/models/${encodeURIComponent(cleanModel)}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;

  const { systemInstruction, contents } = formatGeminiContents(messages);

  const generationConfig = {
    temperature: typeof temperature === 'number' ? temperature : 0.3,
    maxOutputTokens: typeof maxTokens === 'number' ? maxTokens : 4096,
  };

  if (jsonMode) {
    generationConfig.responseMimeType = 'application/json';
  }

  const payload = {
    contents,
    generationConfig,
  };

  if (systemInstruction) {
    payload.systemInstruction = systemInstruction;
  }

  const controller = new AbortController();
  const effectiveSignal = signal || controller.signal;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const startTime = Date.now();
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
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
      const errorMsg = data?.error?.message || rawText.slice(0, 300);
      const classified = classifyGeminiError(res.status, errorMsg, data || rawText);
      const err = new Error(`[gemini] ${errorMsg} (HTTP ${res.status})`);
      err.code = classified.code;
      err.status = classified.status;
      err.retryable = classified.retryable;
      err.provider = 'gemini';
      err.model = cleanModel;
      err.latencyMs = latencyMs;
      throw err;
    }

    const candidate = data?.candidates?.[0];
    const rawContent = candidate?.content?.parts?.[0]?.text || '';

    if (!rawContent) {
      const blockReason = candidate?.finishReason || data?.promptFeedback?.blockReason;
      const err = new Error(`[gemini] No content returned (finishReason: ${blockReason || 'UNKNOWN'})`);
      err.code = 'EMPTY_COMPLETION';
      err.status = 502;
      err.retryable = true;
      err.provider = 'gemini';
      throw err;
    }

    return {
      content: rawContent.trim(),
      provider: 'gemini',
      model: cleanModel,
      usage: {
        promptTokens: data?.usageMetadata?.promptTokenCount || 0,
        completionTokens: data?.usageMetadata?.candidatesTokenCount || 0,
        totalTokens: data?.usageMetadata?.totalTokenCount || 0,
      },
      latencyMs,
    };
  } catch (error) {
    clearTimeout(timer);
    if (error.name === 'AbortError' || effectiveSignal.aborted) {
      const err = new Error(`[gemini] Request timed out after ${timeoutMs}ms for model ${cleanModel}`);
      err.code = 'REQUEST_TIMEOUT';
      err.status = 504;
      err.retryable = true;
      err.provider = 'gemini';
      err.model = cleanModel;
      throw err;
    }
    throw error;
  }
}

module.exports = {
  callGoogleGemini,
  formatGeminiContents,
  classifyGeminiError,
};
