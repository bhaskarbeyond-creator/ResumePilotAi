'use strict';

/**
 * FreeLLMAPI OpenAI-Compatible Adapter
 *
 * Implements high-performance, resilient chat completions against any
 * OpenAI-compatible API: Groq, Cerebras, NVIDIA NIM, Mistral, OpenRouter,
 * DeepSeek, OpenAI, Cloudflare, …
 *
 * Features:
 * - Robust AbortController timeout handling
 * - DeepSeek / reasoning <think>…</think> stripping (blocking + streaming)
 * - Native error classification (429 RateLimit, 401 Auth, 5xx Server, Timeout)
 * - Safe JSON mode negotiation
 * - Native `tools` / `tool_choice` passthrough with structured `tool_calls`
 * - Async-generator SSE streaming (`streamOpenAiCompat`)
 */

function stripThinkTags(text) {
  if (!text || typeof text !== 'string') return text;
  // Remove <think>…</think> blocks from DeepSeek R1 / reasoning models
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

/**
 * Stateful filter for streamed reasoning tags. A chunk boundary can land in the
 * middle of `<think>`, so text is held while a partial tag could still be
 * forming and dropped while the tag is open.
 */
class ThinkTagFilter {
  constructor() {
    this.pending = '';
    this.insideThink = false;
  }

  push(chunk) {
    if (!chunk) return '';
    let buffer = this.pending + chunk;
    this.pending = '';
    let output = '';

    for (;;) {
      if (this.insideThink) {
        const close = buffer.toLowerCase().indexOf('</think>');
        if (close === -1) {
          // Hold back a possible partial closing tag.
          const keep = Math.min('</think>'.length - 1, buffer.length);
          this.pending = buffer.slice(buffer.length - keep);
          return output;
        }
        buffer = buffer.slice(close + '</think>'.length);
        this.insideThink = false;
        continue;
      }

      const open = buffer.toLowerCase().indexOf('<think>');
      const lt = buffer.lastIndexOf('<');
      const partialTail = lt !== -1 && buffer.slice(lt).length < '<think>'.length
        && '<think>'.startsWith(buffer.slice(lt).toLowerCase());
      if (open === -1) {
        if (partialTail) {
          output += buffer.slice(0, lt);
          this.pending = buffer.slice(lt);
        } else {
          output += buffer;
        }
        return output;
      }
      output += buffer.slice(0, open);
      buffer = buffer.slice(open + '<think>'.length);
      this.insideThink = true;
    }
  }

  flush() {
    const tail = this.pending;
    this.pending = '';
    if (this.insideThink) {
      this.insideThink = false;
      return '';
    }
    return tail;
  }
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

function buildHeaders({ baseUrl, apiKey, providerId }) {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${String(apiKey || '').trim()}`,
  };
  // Keyless gateways reject an Authorization header outright.
  if (!apiKey || String(apiKey).trim() === '' || String(apiKey).trim() === 'keyless') {
    delete headers.Authorization;
  }
  if (providerId === 'openrouter') {
    headers['HTTP-Referer'] = 'https://ime365.com';
    headers['X-Title'] = 'IME365 Professional Career Suite';
  }
  void baseUrl;
  return headers;
}

function normalizeResponseFormat({ jsonMode, responseFormat }) {
  if (responseFormat && typeof responseFormat === 'object' && typeof responseFormat.type === 'string') {
    return { type: responseFormat.type, ...(responseFormat.json_schema ? { json_schema: responseFormat.json_schema } : {}) };
  }
  if (jsonMode) return { type: 'json_object' };
  return null;
}

function buildRequestPayload({
  model,
  messages,
  temperature = 0.3,
  maxTokens = 4096,
  jsonMode = false,
  responseFormat,
  tools,
  toolChoice,
  stream = false,
  parallelToolCalls,
}) {
  const payload = {
    model: String(model || '').trim(),
    messages,
    temperature: typeof temperature === 'number' ? temperature : 0.3,
    max_tokens: typeof maxTokens === 'number' ? maxTokens : 4096,
  };
  if (stream) payload.stream = true;

  const format = normalizeResponseFormat({ jsonMode, responseFormat });
  if (format) payload.response_format = format;

  if (Array.isArray(tools) && tools.length > 0) {
    payload.tools = tools;
    if (toolChoice !== undefined && toolChoice !== null) payload.tool_choice = toolChoice;
    if (typeof parallelToolCalls === 'boolean') payload.parallel_tool_calls = parallelToolCalls;
  }
  return payload;
}

function normalizeToolCalls(rawCalls) {
  if (!Array.isArray(rawCalls) || rawCalls.length === 0) return null;
  const calls = [];
  rawCalls.forEach((call, index) => {
    const name = call?.function?.name;
    if (!name) return;
    const rawArgs = call.function.arguments;
    calls.push({
      id: call.id || `call_${Date.now().toString(36)}_${index}`,
      type: 'function',
      function: {
        name,
        arguments: typeof rawArgs === 'string' ? rawArgs : JSON.stringify(rawArgs || {}),
      },
    });
  });
  return calls.length > 0 ? calls : null;
}

/**
 * Parse a `text/event-stream` body into `data:` payloads.
 * Yields raw strings (including `[DONE]`); never throws on malformed JSON —
 * the caller decides what a bad chunk means.
 */
async function* iterateSseData(body) {
  if (!body) return;
  const decoder = new TextDecoder();
  let buffer = '';
  const flushLine = function* flush(line) {
    if (!line.startsWith('data:')) return;
    const payload = line.slice(5).trim();
    if (payload) yield payload;
  };
  for await (const chunk of body) {
    buffer += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
    let newline = buffer.indexOf('\n');
    while (newline !== -1) {
      const line = buffer.slice(0, newline).replace(/\r$/, '');
      buffer = buffer.slice(newline + 1);
      yield* flushLine(line);
      newline = buffer.indexOf('\n');
    }
  }
  buffer += decoder.decode();
  for (const line of buffer.split('\n')) {
    yield* flushLine(line.replace(/\r$/, ''));
  }
}

/**
 * Blocking chat completion.
 *
 * @returns {Promise<{content:string, provider:string, model:string, usage:object,
 *   latencyMs:number, toolCalls:Array|null, finishReason:string|null, rawMessage:object|null}>}
 */
async function callOpenAiCompat({
  baseUrl,
  apiKey,
  model,
  messages,
  temperature = 0.3,
  maxTokens = 4096,
  jsonMode = false,
  responseFormat,
  tools,
  toolChoice,
  parallelToolCalls,
  timeoutMs = 45000,
  providerId = 'openai-compat',
  fetchImpl = globalThis.fetch,
  signal,
}) {
  const url = `${String(baseUrl || '').replace(/\/+$/, '')}/chat/completions`;
  const headers = buildHeaders({ baseUrl, apiKey, providerId });
  const payload = buildRequestPayload({
    model, messages, temperature, maxTokens, jsonMode, responseFormat, tools, toolChoice, parallelToolCalls,
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
      headers,
      body: JSON.stringify(payload),
      signal: effectiveSignal,
    });

    clearTimeout(timer);
    const latencyMs = Date.now() - startTime;
    let rawText = '';
    let data = null;
    try {
      rawText = await res.text();
      data = JSON.parse(rawText);
    } catch {
      if (typeof res.json === 'function') {
        try {
          data = await res.json();
          rawText = JSON.stringify(data);
        } catch {
          data = null;
        }
      } else {
        data = null;
      }
    }

    if (!res.ok) {
      const errorMsg = data?.error?.message || data?.message || String(rawText).slice(0, 300);
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

    const choice = data?.choices?.[0];
    const rawContent = choice?.message?.content || '';
    const cleanContent = stripThinkTags(rawContent);
    const toolCalls = normalizeToolCalls(choice?.message?.tool_calls);

    // An empty text answer is only an error when the model also produced no
    // structured tool call: tool-only turns are a legitimate completion.
    if (!cleanContent && !toolCalls) {
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
      toolCalls,
      finishReason: choice?.finish_reason || (toolCalls ? 'tool_calls' : 'stop'),
      rawMessage: choice?.message || null,
    };
  } catch (error) {
    clearTimeout(timer);
    if (error.name === 'AbortError' || (effectiveSignal && effectiveSignal.aborted)) {
      const err = new Error(`[${providerId}] Request timed out after ${timeoutMs}ms for model ${model}`);
      err.code = 'REQUEST_TIMEOUT';
      err.status = 504;
      err.retryable = true;
      err.provider = providerId;
      err.model = model;
      throw err;
    }
    throw error;
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

/**
 * Streaming chat completion (async generator).
 *
 * Yields:
 *   { type: 'open', provider, model, status }
 *   { type: 'text', text }                       (already <think>-filtered)
 *   { type: 'tool_call', index, id, name, arguments, done }
 *   { type: 'finish', finishReason }
 *   { type: 'usage', usage }
 *
 * The `open` event is emitted as soon as upstream answers 2xx, which is the
 * point of no return for failover: the router will not retry another provider
 * after it has forwarded a chunk.
 */
async function* streamOpenAiCompat({
  baseUrl,
  apiKey,
  model,
  messages,
  temperature = 0.3,
  maxTokens = 4096,
  jsonMode = false,
  responseFormat,
  tools,
  toolChoice,
  parallelToolCalls,
  timeoutMs = 45000,
  providerId = 'openai-compat',
  fetchImpl = globalThis.fetch,
  signal,
}) {
  const url = `${String(baseUrl || '').replace(/\/+$/, '')}/chat/completions`;
  const headers = buildHeaders({ baseUrl, apiKey, providerId });
  const payload = buildRequestPayload({
    model, messages, temperature, maxTokens, jsonMode, responseFormat, tools, toolChoice, stream: true, parallelToolCalls,
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
      headers,
      body: JSON.stringify(payload),
      signal: effectiveSignal,
    });

    if (!res.ok) {
      const rawText = await res.text().catch(() => '');
      let data = null;
      try { data = JSON.parse(rawText); } catch { data = null; }
      const errorMsg = data?.error?.message || data?.message || String(rawText).slice(0, 300);
      const classified = classifyError(res.status, errorMsg, data || rawText);
      const err = new Error(`[${providerId}] ${errorMsg} (HTTP ${res.status})`);
      err.code = classified.code;
      err.status = classified.status;
      err.retryable = classified.retryable;
      err.provider = providerId;
      err.model = model;
      throw err;
    }

    yield { type: 'open', provider: providerId, model, status: res.status };

    const contentType = String(res.headers?.get?.('content-type') || '');

    // Some gateways ignore `stream: true` and answer with one JSON document.
    if (!contentType.includes('text/event-stream') || !res.body) {
      const rawText = await res.text();
      let data = null;
      try { data = JSON.parse(rawText); } catch { data = null; }
      const choice = data?.choices?.[0];
      const text = stripThinkTags(choice?.message?.content || '');
      if (text) yield { type: 'text', text };
      for (const [index, call] of (choice?.message?.tool_calls || []).entries()) {
        if (!call?.function?.name) continue;
        yield {
          type: 'tool_call',
          index,
          id: call.id || `call_${Date.now().toString(36)}_${index}`,
          name: call.function.name,
          arguments: typeof call.function.arguments === 'string' ? call.function.arguments : JSON.stringify(call.function.arguments || {}),
          done: true,
        };
      }
      if (data?.usage) {
        yield {
          type: 'usage',
          usage: {
            promptTokens: data.usage.prompt_tokens || 0,
            completionTokens: data.usage.completion_tokens || 0,
            totalTokens: data.usage.total_tokens || 0,
          },
        };
      }
      yield { type: 'finish', finishReason: choice?.finish_reason || 'stop' };
      return;
    }

    const thinkFilter = new ThinkTagFilter();
    const toolStates = new Map();
    let finishReason = null;
    let usage = null;

    for await (const payloadText of iterateSseData(res.body)) {
      if (payloadText === '[DONE]') break;
      let event;
      try {
        event = JSON.parse(payloadText);
      } catch {
        continue;
      }
      if (event?.error) {
        const err = new Error(`[${providerId}] ${event.error.message || 'stream error'}`);
        err.code = 'STREAM_ERROR';
        err.status = 502;
        err.retryable = false;
        throw err;
      }

      if (event?.usage) {
        usage = {
          promptTokens: event.usage.prompt_tokens || 0,
          completionTokens: event.usage.completion_tokens || 0,
          totalTokens: event.usage.total_tokens || 0,
        };
      }

      const choice = event?.choices?.[0];
      if (!choice) continue;
      const delta = choice.delta || {};

      if (typeof delta.content === 'string' && delta.content.length > 0) {
        const text = thinkFilter.push(delta.content);
        if (text) yield { type: 'text', text };
      }

      if (Array.isArray(delta.tool_calls)) {
        for (const partial of delta.tool_calls) {
          const index = Number.isInteger(partial.index) ? partial.index : 0;
          const state = toolStates.get(index) || { index, id: null, name: '', arguments: '' };
          if (partial.id) state.id = partial.id;
          if (partial.function?.name) state.name += partial.function.name;
          if (typeof partial.function?.arguments === 'string') state.arguments += partial.function.arguments;
          toolStates.set(index, state);
          yield {
            type: 'tool_call',
            index,
            id: state.id,
            name: state.name,
            arguments: state.arguments,
            done: false,
          };
        }
      }

      if (choice.finish_reason) finishReason = choice.finish_reason;
    }

    const tail = thinkFilter.flush();
    if (tail) yield { type: 'text', text: tail };
    if (usage) yield { type: 'usage', usage };
    yield {
      type: 'finish',
      finishReason: finishReason || (toolStates.size > 0 ? 'tool_calls' : 'stop'),
    };
  } catch (error) {
    if (error.name === 'AbortError' || (effectiveSignal && effectiveSignal.aborted)) {
      const err = new Error(`[${providerId}] Request timed out after ${timeoutMs}ms for model ${model}`);
      err.code = 'REQUEST_TIMEOUT';
      err.status = 504;
      err.retryable = true;
      err.provider = providerId;
      err.model = model;
      throw err;
    }
    throw error;
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

module.exports = {
  callOpenAiCompat,
  streamOpenAiCompat,
  classifyError,
  stripThinkTags,
  ThinkTagFilter,
  iterateSseData,
  buildRequestPayload,
  buildHeaders,
  normalizeToolCalls,
  normalizeResponseFormat,
};
