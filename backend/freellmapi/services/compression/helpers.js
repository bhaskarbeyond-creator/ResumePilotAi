'use strict';

/**
 * FreeLLMAPI Compression Helpers
 *
 * Message-shape utilities shared by every compression engine. Ported from
 * freellmapi-0.16.6 `server/src/services/compression/helpers.ts`.
 */

function textContent(message) {
  return message && typeof message.content === 'string' ? message.content : null;
}

function withTextContent(message, content) {
  return { ...message, content };
}

function messageChars(messages) {
  return (messages || []).reduce((sum, message) => {
    if (typeof message?.content === 'string') return sum + message.content.length;
    if (!Array.isArray(message?.content)) return sum;
    return sum + message.content.reduce((n, block) => {
      if (typeof block === 'string') return n + block.length;
      return n + (typeof block?.text === 'string' ? block.text.length : 0);
    }, 0);
  }, 0);
}

function estimateTokensFromChars(chars) {
  return Math.ceil(chars / 4);
}

function allMessageText(messages) {
  return (messages || []).map(message => {
    if (typeof message?.content === 'string') return message.content;
    if (!Array.isArray(message?.content)) return '';
    return message.content.map(block => {
      if (typeof block === 'string') return block;
      return typeof block?.text === 'string' ? block.text : '';
    }).join('');
  }).join('\n');
}

function buildToolCallOrigins(messages) {
  const origins = new Map();
  (messages || []).forEach((message, messageIndex) => {
    for (const call of message?.tool_calls || []) {
      if (!call || !call.id) continue;
      origins.set(call.id, {
        id: call.id,
        name: call.function?.name || 'unknown',
        arguments: call.function?.arguments || '{}',
        messageIndex,
      });
    }
  });
  return origins;
}

/**
 * Content that must never be truncated or rewritten by a compression engine:
 * identifiers a human would look up (emails, URLs) and quantitative anchors
 * (dates, currency, percentages, phone numbers).
 */
const PROTECTED_PATTERNS = [
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
  /https?:\/\/\S+/i,
  /\b\d{4}-\d{2}-\d{2}\b/,
  /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/,
  /\b(?:19|20)\d{2}\b/,
  /[₹$€£]\s?\d/,
  /\b\d+(?:\.\d+)?\s?%/,
  /\+?\d[\d\s().-]{7,}\d/,
];

function hasProtectedContent(line) {
  const value = String(line || '');
  if (!value) return false;
  return PROTECTED_PATTERNS.some(pattern => pattern.test(value));
}

module.exports = {
  textContent,
  withTextContent,
  messageChars,
  estimateTokensFromChars,
  allMessageText,
  buildToolCallOrigins,
  hasProtectedContent,
};
