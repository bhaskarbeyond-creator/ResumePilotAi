'use strict';

/**
 * FreeLLMAPI Claude Code Agent & Anthropic-Wire Bridge
 *
 * Implements:
 * 1. Claude Code Model Mapping: Maps `claude-3-7-sonnet`, `claude-3-5-sonnet`,
 *    `claude-3-5-haiku`, and `opusplan` to FreeLLMAPI's highest-intelligence and fastest models.
 * 2. Anthropic Messages Wire Translator (/v1/messages): Translates Anthropic SDK / Claude CLI
 *    turn payloads into OpenAI/Gemini format and translates completions back into Anthropic format.
 * 3. Autonomous Claude Code Agent Task Runner: Can execute structured multi-step
 *    agent tasks (e.g. resume fact grounding, ATS audit, interview question synthesis).
 */

const { freeLlmRouter } = require('../services/router');

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
      if (typeof msg.content === 'string') {
        contentStr = msg.content;
      } else if (Array.isArray(msg.content)) {
        contentStr = msg.content
          .map(item => {
            if (typeof item === 'string') return item;
            if (item.type === 'text') return item.text || '';
            if (item.type === 'tool_use') return `[Tool Use: ${item.name}(${JSON.stringify(item.input || {})})]`;
            if (item.type === 'tool_result') return `[Tool Result: ${item.content || ''}]`;
            return '';
          })
          .filter(Boolean)
          .join('\n');
      }

      messages.push({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: contentStr,
      });
    }
  }

  return messages;
}

function translateToAnthropicResponse(result, requestedModel = 'claude-3-7-sonnet') {
  return {
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    type: 'message',
    role: 'assistant',
    model: requestedModel,
    content: [
      {
        type: 'text',
        text: result.content,
      },
    ],
    stop_reason: 'end_turn',
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
    },
  };
}

/**
 * Handle Anthropic /v1/messages POST request from Claude Code CLI or Anthropic SDK
 */
async function handleAnthropicMessages(reqBody, options = {}) {
  const family = classifyClaudeModelFamily(reqBody.model);
  const mapping = CLAUDE_CODE_FAMILY_MAPPING[family] || CLAUDE_CODE_FAMILY_MAPPING.default;

  const messages = translateAnthropicToMessages(reqBody);

  const result = await freeLlmRouter.routeCompletion({
    prompt: messages,
    temperature: typeof reqBody.temperature === 'number' ? reqBody.temperature : 0.3,
    maxTokens: reqBody.max_tokens || 4096,
    platformConfig: options.platformConfig || {},
    tenantContext: options.tenantContext || null,
    timeoutMs: options.timeoutMs || 60000,
  });

  return translateToAnthropicResponse(result, reqBody.model || 'claude-3-7-sonnet');
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
  runClaudeCodeTask,
};
