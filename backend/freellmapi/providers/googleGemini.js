'use strict';

/**
 * FreeLLMAPI Google Gemini Adapter
 *
 * Native integration with Google Gemini 2.0 Flash / 1.5 Pro / 1.5 Flash via the
 * v1beta generateContent API, including:
 * - system instructions
 * - JSON mode (`responseMimeType`)
 * - native function calling (`tools[].functionDeclarations`)
 * - SSE streaming (`streamGenerateContent?alt=sse`)
 */

function formatGeminiContents(messages) {
  let systemInstruction = null;
  const contents = [];

  for (const msg of messages || []) {
    if (msg.role === 'system') {
      systemInstruction = {
        parts: [{ text: String(msg.content || '') }],
      };
      continue;
    }
    if (msg.role === 'tool') {
      // Tool results ride back as user-visible function responses.
      contents.push({
        role: 'user',
        parts: [{
          functionResponse: {
            name: msg.name || msg.tool_call_id || 'tool',
            response: { content: String(msg.content || '') },
          },
        }],
      });
      continue;
    }
    if (msg.role === 'assistant' && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
      contents.push({
        role: 'model',
        parts: msg.tool_calls.map(call => ({
          functionCall: {
            name: call.function?.name || 'unknown',
            args: safeParseJson(call.function?.arguments),
          },
        })),
      });
      continue;
    }
    const role = msg.role === 'assistant' ? 'model' : 'user';
    contents.push({
      role,
      parts: [{ text: String(msg.content || '') }],
    });
  }

  // Ensure there is at least one content part
  if (contents.length === 0) {
    contents.push({ role: 'user', parts: [{ text: 'Hello' }] });
  }

  return { systemInstruction, contents };
}

function safeParseJson(value) {
  if (value && typeof value === 'object') return value;
  try { return JSON.parse(String(value || '{}')); } catch { return {}; }
}

function formatGeminiTools(tools, toolChoice) {
  if (!Array.isArray(tools) || tools.length === 0) return {};
  const functionDeclarations = tools
    .filter(tool => tool?.type === 'function' && tool.function?.name)
    .map(tool => ({
      name: tool.function.name,
      description: tool.function.description || '',
      parameters: tool.function.parameters || { type: 'object', properties: {} },
    }));
  if (functionDeclarations.length === 0) return {};

  const out = { tools: [{ functionDeclarations }] };
  let mode = null;
  let allowedFunctionNames;
  if (toolChoice === 'none') mode = 'NONE';
  else if (toolChoice === 'required') mode = 'ANY';
  else if (toolChoice && typeof toolChoice === 'object' && toolChoice.function?.name) {
    mode = 'ANY';
    allowedFunctionNames = [toolChoice.function.name];
  } else if (toolChoice === 'auto') mode = 'AUTO';
  if (mode) {
    out.toolConfig = {
      functionCallingConfig: {
        mode,
        ...(allowedFunctionNames ? { allowedFunctionNames } : {}),
      },
    };
  }
  return out;
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

function buildGeminiRequest({
  baseUrl = 'https://generativelanguage.googleapis.com/v1beta',
  apiKey,
  model = 'gemini-2.0-flash',
  messages,
  temperature = 0.3,
  maxTokens = 4096,
  jsonMode = false,
  responseFormat,
  tools,
  toolChoice,
  stream = false,
}) {
  const cleanModel = String(model || '').replace(/^models\//, '');
  const cleanBase = String(baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');
  const method = stream ? 'streamGenerateContent' : 'generateContent';
  const query = stream ? `alt=sse&key=${encodeURIComponent(String(apiKey || '').trim())}` : `key=${encodeURIComponent(String(apiKey || '').trim())}`;
  const url = `${cleanBase}/models/${encodeURIComponent(cleanModel)}:${method}?${query}`;

  const { systemInstruction, contents } = formatGeminiContents(messages);

  const generationConfig = {
    temperature: typeof temperature === 'number' ? temperature : 0.3,
    maxOutputTokens: typeof maxTokens === 'number' ? maxTokens : 4096,
  };

  const responseType = responseFormat?.type || (jsonMode ? 'json_object' : null);
  if (responseType === 'json_object' || responseType === 'json_schema') {
    generationConfig.responseMimeType = 'application/json';
    const schema = responseFormat?.json_schema?.schema;
    if (schema && typeof schema === 'object') generationConfig.responseSchema = schema;
  }

  const payload = {
    contents,
    generationConfig,
    ...formatGeminiTools(tools, toolChoice),
  };
  if (systemInstruction) payload.systemInstruction = systemInstruction;

  return { url, payload, cleanModel };
}

function geminiPartsToResult(parts) {
  const texts = [];
  const toolCalls = [];
  for (const part of parts || []) {
    if (typeof part?.text === 'string' && part.text) texts.push(part.text);
    if (part?.functionCall?.name) {
      toolCalls.push({
        id: `call_${Date.now().toString(36)}_${toolCalls.length}`,
        type: 'function',
        function: {
          name: part.functionCall.name,
          arguments: JSON.stringify(part.functionCall.args || {}),
        },
      });
    }
  }
  return { text: texts.join(''), toolCalls: toolCalls.length > 0 ? toolCalls : null };
}

function mapUsage(metadata) {
  return {
    promptTokens: metadata?.promptTokenCount || 0,
    completionTokens: metadata?.candidatesTokenCount || 0,
    totalTokens: metadata?.totalTokenCount || 0,
  };
}

async function readGeminiError(res, cleanModel) {
  const rawText = typeof res.text === 'function' ? await res.text().catch(() => '') : JSON.stringify(await res.json().catch(() => ({})));
  let data = null;
  try { data = JSON.parse(rawText); } catch { data = null; }
  const errorMsg = data?.error?.message || String(rawText).slice(0, 300);
  const classified = classifyGeminiError(res.status, errorMsg, data || rawText);
  const err = new Error(`[gemini] ${errorMsg} (HTTP ${res.status})`);
  err.code = classified.code;
  err.status = classified.status;
  err.retryable = classified.retryable;
  err.provider = 'gemini';
  err.model = cleanModel;
  return err;
}

async function callGoogleGemini({
  baseUrl = 'https://generativelanguage.googleapis.com/v1beta',
  apiKey,
  model = 'gemini-2.0-flash',
  messages,
  temperature = 0.3,
  maxTokens = 4096,
  jsonMode = false,
  responseFormat,
  tools,
  toolChoice,
  timeoutMs = 45000,
  fetchImpl = globalThis.fetch,
  signal,
}) {
  const { url, payload, cleanModel } = buildGeminiRequest({
    baseUrl, apiKey, model, messages, temperature, maxTokens, jsonMode, responseFormat, tools, toolChoice, stream: false,
  });

  const controller = new AbortController();
  const onAbort = () => controller.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) {
      controller.abort(signal.reason);
    } else {
      signal.addEventListener('abort', onAbort, { once: true });
    }
  }
  const timer = setTimeout(() => {
    controller.abort(new Error(`Timeout of ${timeoutMs}ms exceeded`));
  }, timeoutMs);
  const effectiveSignal = controller.signal;

  const startTime = Date.now();
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: effectiveSignal,
    });

    const latencyMs = Date.now() - startTime;
    if (!res.ok) throw await readGeminiError(res, cleanModel);

    const rawText = typeof res.text === 'function' ? await res.text() : JSON.stringify(await res.json());
    let data = null;
    try { data = JSON.parse(rawText); } catch { data = null; }

    const candidate = data?.candidates?.[0];
    const { text, toolCalls } = geminiPartsToResult(candidate?.content?.parts);

    if (!text && !toolCalls) {
      const blockReason = candidate?.finishReason || data?.promptFeedback?.blockReason;
      const err = new Error(`[gemini] No content returned (finishReason: ${blockReason || 'UNKNOWN'})`);
      err.code = 'EMPTY_COMPLETION';
      err.status = 502;
      err.retryable = true;
      err.provider = 'gemini';
      throw err;
    }

    return {
      content: text.trim(),
      provider: 'gemini',
      model: cleanModel,
      usage: mapUsage(data?.usageMetadata),
      latencyMs,
      toolCalls,
      finishReason: candidate?.finishReason === 'STOP'
        ? (toolCalls ? 'tool_calls' : 'stop')
        : (candidate?.finishReason || (toolCalls ? 'tool_calls' : 'stop')),
    };
  } catch (error) {
    if (error.name === 'AbortError' || (effectiveSignal && effectiveSignal.aborted)) {
      const err = new Error(`[gemini] Request timed out after ${timeoutMs}ms for model ${cleanModel}`);
      err.code = 'REQUEST_TIMEOUT';
      err.status = 504;
      err.retryable = true;
      err.provider = 'gemini';
      err.model = cleanModel;
      throw err;
    }
    throw error;
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

/**
 * Streaming Gemini completion (async generator, same event contract as
 * `streamOpenAiCompat`).
 */
async function* streamGoogleGemini({
  baseUrl = 'https://generativelanguage.googleapis.com/v1beta',
  apiKey,
  model = 'gemini-2.0-flash',
  messages,
  temperature = 0.3,
  maxTokens = 4096,
  jsonMode = false,
  responseFormat,
  tools,
  toolChoice,
  timeoutMs = 45000,
  fetchImpl = globalThis.fetch,
  signal,
}) {
  const { url, payload, cleanModel } = buildGeminiRequest({
    baseUrl, apiKey, model, messages, temperature, maxTokens, jsonMode, responseFormat, tools, toolChoice, stream: true,
  });

  const controller = new AbortController();
  const onAbort = () => controller.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) {
      controller.abort(signal.reason);
    } else {
      signal.addEventListener('abort', onAbort, { once: true });
    }
  }
  const timer = setTimeout(() => {
    controller.abort(new Error(`Timeout of ${timeoutMs}ms exceeded`));
  }, timeoutMs);
  const effectiveSignal = controller.signal;

  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: effectiveSignal,
    });

    if (!res.ok) throw await readGeminiError(res, cleanModel);
    yield { type: 'open', provider: 'gemini', model: cleanModel, status: res.status };

    const contentType = String(res.headers?.get?.('content-type') || '');
    let usage = null;
    let finishReason = null;

    if (!contentType.includes('text/event-stream') || !res.body) {
      const rawText = typeof res.text === 'function' ? await res.text() : JSON.stringify(await res.json());
      let data = null;
      try { data = JSON.parse(rawText); } catch { data = null; }
      const parts = data?.candidates?.[0]?.content?.parts;
      const { text, toolCalls } = geminiPartsToResult(parts);
      if (text) yield { type: 'text', text };
      for (const [index, call] of (toolCalls || []).entries()) {
        yield { type: 'tool_call', index, id: call.id, name: call.function.name, arguments: call.function.arguments, done: true };
      }
      if (data?.usageMetadata) yield { type: 'usage', usage: mapUsage(data.usageMetadata) };
      yield { type: 'finish', finishReason: toolCalls ? 'tool_calls' : 'stop' };
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let toolIndex = 0;

    const handlePayload = function* handle(payloadText) {
      let event;
      try { event = JSON.parse(payloadText); } catch { return; }
      if (event?.error) {
        const err = new Error(`[gemini] ${event.error.message || 'stream error'}`);
        err.code = 'STREAM_ERROR';
        err.status = 502;
        err.retryable = false;
        throw err;
      }
      if (event?.usageMetadata) usage = mapUsage(event.usageMetadata);
      const candidate = event?.candidates?.[0];
      if (!candidate) return;
      if (candidate.finishReason) finishReason = candidate.finishReason;
      for (const part of candidate.content?.parts || []) {
        if (typeof part?.text === 'string' && part.text) yield { type: 'text', text: part.text };
        if (part?.functionCall?.name) {
          yield {
            type: 'tool_call',
            index: toolIndex,
            id: `call_${Date.now().toString(36)}_${toolIndex}`,
            name: part.functionCall.name,
            arguments: JSON.stringify(part.functionCall.args || {}),
            done: true,
          };
          toolIndex += 1;
        }
      }
    };

    for await (const chunk of res.body) {
      buffer += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
      let newline = buffer.indexOf('\n');
      while (newline !== -1) {
        const line = buffer.slice(0, newline).replace(/\r$/, '');
        buffer = buffer.slice(newline + 1);
        if (line.startsWith('data:')) {
          const payloadText = line.slice(5).trim();
          if (payloadText && payloadText !== '[DONE]') yield* handlePayload(payloadText);
        }
        newline = buffer.indexOf('\n');
      }
    }
    buffer += decoder.decode();
    for (const line of buffer.split('\n')) {
      const trimmed = line.replace(/\r$/, '');
      if (trimmed.startsWith('data:')) {
        const payloadText = trimmed.slice(5).trim();
        if (payloadText && payloadText !== '[DONE]') yield* handlePayload(payloadText);
      }
    }

    if (usage) yield { type: 'usage', usage };
    yield {
      type: 'finish',
      finishReason: toolIndex > 0 ? 'tool_calls' : (finishReason === 'STOP' || !finishReason ? 'stop' : String(finishReason).toLowerCase()),
    };
  } catch (error) {
    if (error.name === 'AbortError' || (effectiveSignal && effectiveSignal.aborted)) {
      const err = new Error(`[gemini] Request timed out after ${timeoutMs}ms for model ${cleanModel}`);
      err.code = 'REQUEST_TIMEOUT';
      err.status = 504;
      err.retryable = true;
      err.provider = 'gemini';
      err.model = cleanModel;
      throw err;
    }
    throw error;
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

module.exports = {
  callGoogleGemini,
  streamGoogleGemini,
  formatGeminiContents,
  formatGeminiTools,
  buildGeminiRequest,
  classifyGeminiError,
};
