'use strict';

/**
 * FreeLLMAPI Claude Code Agent & Anthropic-Wire Bridge
 *
 * Implements:
 * 1. Claude Code Model Mapping: Maps `claude-3-7-sonnet`, `claude-3-5-sonnet`,
 *    `claude-3-5-haiku`, and `opusplan` to FreeLLMAPI's highest-intelligence and fastest models.
 * 2. Anthropic Messages Wire Translator (/v1/messages): Translates Anthropic SDK / Claude CLI
 *    turn payloads into OpenAI/Gemini format and translates completions back into Anthropic format,
 *    including `tools` → `tool_use` blocks and SSE streaming
 *    (`message_start` / `content_block_delta` / `message_stop`).
 * 3. Autonomous Claude Code Agent Task Runner: Can execute structured multi-step
 *    agent tasks (e.g. resume fact grounding, ATS audit, interview question synthesis).
 */

const { freeLlmRouter } = require('../services/router');
const { normalizeTools } = require('../lib/toolRescue');

// Claude Code Family Model Mapping: High-Intelligence & Ultra-Fast Defaults
const CLAUDE_CODE_FAMILY_MAPPING = Object.freeze({
  // Frontier Intelligence (Architecture, Complex Synthesis, Executive Resume Bio)
  opus: {
    preferredProvider: 'groq',
    preferredModel: 'llama-3.3-70b-versatile',
    fallbackModel: 'gemini-2.0-flash',
    intelligence: 'Frontier',
  },
  // High-Intelligence Flagship (Standard Claude Code Tasking & Resume Optimization)
  sonnet: {
    preferredProvider: 'cerebras',
    preferredModel: 'llama3.3-70b',
    fallbackModel: 'llama-3.3-70b-versatile',
    intelligence: 'Frontier',
  },
  // Fast Background & Quick Extraction (Typo Checks, Quick Formatting, Autocomplete)
  haiku: {
    preferredProvider: 'groq',
    preferredModel: 'llama-3.1-8b-instant',
    fallbackModel: 'llama3.1-8b',
    intelligence: 'Fast',
  },
  // Catch-all / Default
  default: {
    preferredProvider: 'groq',
    preferredModel: 'llama-3.3-70b-versatile',
    fallbackModel: 'gemini-2.0-flash',
    intelligence: 'Frontier',
  },
});

function classifyClaudeModelFamily(modelName) {
  const m = String(modelName || '').toLowerCase().trim();
  if (!m || m === 'auto' || m === 'default') return 'default';
  if (m === 'opusplan' || m.startsWith('opusplan')) return 'default';
  if (m.includes('opus')) return 'opus';
  if (m.includes('sonnet')) return 'sonnet';
  if (m.includes('haiku')) return 'haiku';
  return 'default';
}

function translateAnthropicToMessages(body) {
  const messages = [];

  // Extract system prompt
  let systemPrompt = '';
  if (typeof body.system === 'string') {
    systemPrompt = body.system;
  } else if (Array.isArray(body.system)) {
    systemPrompt = body.system.map(part => (typeof part === 'string' ? part : part.text || '')).join('\n\n');
  }

  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }

  // Convert Anthropic messages array
  if (Array.isArray(body.messages)) {
    for (const msg of body.messages) {
      let contentStr = '';
      const toolCalls = [];
      if (typeof msg.content === 'string') {
        contentStr = msg.content;
      } else if (Array.isArray(msg.content)) {
        contentStr = msg.content
          .map(item => {
            if (typeof item === 'string') return item;
            if (item.type === 'text') return item.text || '';
            if (item.type === 'tool_use') {
              toolCalls.push({
                id: item.id || `call_${toolCalls.length}`,
                type: 'function',
                function: {
                  name: item.name || 'unknown',
                  arguments: JSON.stringify(item.input || {}),
                },
              });
              return '';
            }
            if (item.type === 'tool_result') {
              const resultContent = typeof item.content === 'string'
                ? item.content
                : Array.isArray(item.content)
                  ? item.content.map(part => (typeof part === 'string' ? part : part.text || '')).join('\n')
                  : JSON.stringify(item.content || '');
              return `[Tool Result: ${resultContent}]`;
            }
            return '';
          })
          .filter(Boolean)
          .join('\n');
      }

      const message = {
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: contentStr,
      };
      if (toolCalls.length > 0) message.tool_calls = toolCalls;
      messages.push(message);
    }
  }

  return messages;
}

function translateToAnthropicResponse(result, requestedModel = 'claude-3-7-sonnet') {
  const content = [];
  if (result.content) {
    content.push({ type: 'text', text: result.content });
  }
  for (const call of result.toolCalls || []) {
    let input = {};
    try { input = JSON.parse(call.function?.arguments || '{}'); } catch { input = { _raw: call.function?.arguments }; }
    content.push({
      type: 'tool_use',
      id: call.id,
      name: call.function?.name || 'unknown',
      input,
    });
  }
  if (content.length === 0) content.push({ type: 'text', text: '' });

  return {
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    type: 'message',
    role: 'assistant',
    model: requestedModel,
    content,
    stop_reason: result.finishReason === 'tool_calls' ? 'tool_use' : 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: result.usage?.promptTokens || 0,
      output_tokens: result.usage?.completionTokens || 0,
    },
    _freellmapi: {
      provider: result.provider,
      actualModel: result.model,
      latencyMs: result.latencyMs,
      cached: result.cached,
      compression: result.compression || null,
    },
  };
}

function anthropicTools(body) {
  return normalizeTools(Array.isArray(body.tools) ? body.tools : []);
}

/**
 * Handle Anthropic /v1/messages POST request from Claude Code CLI or Anthropic SDK
 */
async function handleAnthropicMessages(reqBody, options = {}) {
  const messages = translateAnthropicToMessages(reqBody);
  const tools = anthropicTools(reqBody);
  const toolChoice = reqBody.tool_choice && reqBody.tool_choice.type === 'any'
    ? 'required'
    : reqBody.tool_choice && reqBody.tool_choice.type === 'tool'
      ? { type: 'function', function: { name: reqBody.tool_choice.name } }
      : 'auto';

  const result = await freeLlmRouter.routeCompletion({
    messages,
    temperature: typeof reqBody.temperature === 'number' ? reqBody.temperature : 0.3,
    maxTokens: reqBody.max_tokens || 4096,
    platformConfig: options.platformConfig || {},
    tenantContext: options.tenantContext || null,
    timeoutMs: options.timeoutMs || 60000,
    tools: tools.length > 0 ? tools : undefined,
    toolChoice: tools.length > 0 ? toolChoice : undefined,
    fetchImpl: options.fetchImpl,
    signal: options.signal,
    // F-02: principal-bound cache scope from the /v1 admission layer.
    cacheScope: options.cacheScope ?? null,
  });

  return translateToAnthropicResponse(result, reqBody.model || 'claude-3-7-sonnet');
}

/**
 * Stream an Anthropic Messages response as the SDK's SSE event sequence.
 *
 * Yields plain event objects; the HTTP layer serialises each one as
 * `event: <type>\ndata: <json>\n\n`.
 */
async function* streamAnthropicMessages(reqBody, options = {}) {
  const messages = translateAnthropicToMessages(reqBody);
  const tools = anthropicTools(reqBody);
  const requestedModel = reqBody.model || 'claude-3-7-sonnet';
  const messageId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  let started = false;
  let textBlockOpen = false;
  let blockIndex = 0;
  let outputTokens = 0;
  let stopReason = 'end_turn';
  const toolBlocks = new Map();

  const ensureMessageStart = function* ensureStart() {
    if (started) return;
    started = true;
    yield {
      type: 'message_start',
      message: {
        id: messageId,
        type: 'message',
        role: 'assistant',
        model: requestedModel,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 0 },
      },
    };
  };

  const stream = freeLlmRouter.routeStream({
    messages,
    temperature: typeof reqBody.temperature === 'number' ? reqBody.temperature : 0.3,
    maxTokens: reqBody.max_tokens || 4096,
    platformConfig: options.platformConfig || {},
    tenantContext: options.tenantContext || null,
    timeoutMs: options.timeoutMs || 60000,
    tools: tools.length > 0 ? tools : undefined,
    toolChoice: tools.length > 0 ? 'auto' : undefined,
    fetchImpl: options.fetchImpl,
    signal: options.signal,
  });

  for await (const event of stream) {
    if (event.type === 'meta') {
      yield* ensureMessageStart();
      yield { type: '_meta', provider: event.provider, model: event.model };
      continue;
    }

    if (event.type === 'text') {
      yield* ensureMessageStart();
      if (!textBlockOpen) {
        textBlockOpen = true;
        yield {
          type: 'content_block_start',
          index: blockIndex,
          content_block: { type: 'text', text: '' },
        };
      }
      outputTokens += Math.max(1, Math.round(event.text.length / 4));
      yield {
        type: 'content_block_delta',
        index: blockIndex,
        delta: { type: 'text_delta', text: event.text },
      };
      continue;
    }

    if (event.type === 'tool_call') {
      yield* ensureMessageStart();
      if (!toolBlocks.has(event.index)) {
        if (textBlockOpen) {
          yield { type: 'content_block_stop', index: blockIndex };
          textBlockOpen = false;
          blockIndex += 1;
        }
        const toolIndex = blockIndex + event.index;
        toolBlocks.set(event.index, toolIndex);
        yield {
          type: 'content_block_start',
          index: toolIndex,
          content_block: {
            type: 'tool_use',
            id: event.id || `toolu_${Date.now().toString(36)}`,
            name: event.name || 'unknown',
            input: {},
          },
        };
      }
      const toolIndex = toolBlocks.get(event.index);
      // Anthropic streams the raw JSON of the arguments as input_json_delta.
      const delta = typeof event.arguments === 'string' ? event.arguments : '';
      if (delta) {
        yield {
          type: 'content_block_delta',
          index: toolIndex,
          delta: { type: 'input_json_delta', partial_json: delta },
        };
      }
      stopReason = 'tool_use';
      continue;
    }

    if (event.type === 'usage') {
      outputTokens = Math.max(outputTokens, event.usage?.completionTokens || 0);
      continue;
    }

    if (event.type === 'finish') {
      if (event.finishReason === 'tool_calls') stopReason = 'tool_use';
      else if (event.finishReason === 'length') stopReason = 'max_tokens';
      break;
    }
  }

  yield* ensureMessageStart();
  if (textBlockOpen) {
    yield { type: 'content_block_stop', index: blockIndex };
  }
  for (const toolIndex of [...toolBlocks.values()].sort((a, b) => a - b)) {
    yield { type: 'content_block_stop', index: toolIndex };
  }
  yield {
    type: 'message_delta',
    delta: { stop_reason: stopReason, stop_sequence: null },
    usage: { output_tokens: outputTokens },
  };
  yield { type: 'message_stop' };
}

/**
 * Execute an autonomous Claude Code Agent task
 */
async function runClaudeCodeTask({
  taskPrompt,
  systemInstructions = 'You are Claude Code, an expert software architect, resume intelligence engine, and rigorous code reviewer.',
  context = {},
  temperature = 0.2,
  options = {},
}) {
  const fullPrompt = `TASK:
${taskPrompt}

CONTEXT:
${JSON.stringify(context, null, 2)}`;

  const result = await freeLlmRouter.routeCompletion({
    prompt: fullPrompt,
    systemPrompt: systemInstructions,
    temperature,
    platformConfig: options.platformConfig || {},
    tenantContext: options.tenantContext || null,
    cacheScope: options.cacheScope ?? null,
  });

  return {
    success: true,
    result: result.content,
    agent: 'Claude Code (FreeLLMAPI Native)',
    model: result.model,
    provider: result.provider,
    latencyMs: result.latencyMs,
    usage: result.usage,
  };
}

module.exports = {
  CLAUDE_CODE_FAMILY_MAPPING,
  classifyClaudeModelFamily,
  translateAnthropicToMessages,
  translateToAnthropicResponse,
  handleAnthropicMessages,
  streamAnthropicMessages,
  runClaudeCodeTask,
};
