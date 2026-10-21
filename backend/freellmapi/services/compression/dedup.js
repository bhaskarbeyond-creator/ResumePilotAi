'use strict';

/**
 * `dedup` compression engine (priority 3, lossless).
 *
 * Ported from freellmapi-0.16.6 `services/compression/engines/dedup.ts`.
 *
 * Long blocks that repeat verbatim later in the conversation (pasted job
 * descriptions, retried tool output, echoed context) are replaced by a short
 * reference. The first occurrence always survives, so nothing is lost: the
 * model can read the original earlier in the same prompt.
 */

const crypto = require('node:crypto');
const { textContent, withTextContent } = require('./helpers');

function hash(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function preview(text) {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  const slice = collapsed.slice(0, 60);
  const last = slice.charCodeAt(slice.length - 1);
  // Never split a surrogate pair (emoji / astral CJK) in half.
  return last >= 0xd800 && last <= 0xdbff ? slice.slice(0, -1) : slice;
}

const dedupEngine = {
  id: 'dedup',
  priority: 3,
  lossless: true,
  targets: ['messages', 'tool-results'],
  defaultConfig: { enabled: true, minBlockChars: 80, minBlockLines: 3 },
  apply({ messages, config = {}, context = {} }) {
    const minChars = Number.isInteger(config.minBlockChars) ? config.minBlockChars : 80;
    const minLines = Number.isInteger(config.minBlockLines) ? config.minBlockLines : 3;
    const frozen = context.frozenMessageIndexes || new Set();
    const seen = new Map();
    let blocksReplaced = 0;
    let messagesReplaced = 0;

    // Exact duplicate messages: keep the copy nearest the end of the prompt
    // (the most recent instruction wins) and stub the older ones.
    const contentCounts = new Map();
    messages.forEach((message, index) => {
      if (message?.role === 'system' || frozen.has(index)) return;
      const content = textContent(message);
      if (content == null || content.length < minChars) return;
      const digest = hash(content);
      const bucket = contentCounts.get(digest) || [];
      bucket.push(index);
      contentCounts.set(digest, bucket);
    });

    const duplicateOfLater = new Map();
    for (const indexes of contentCounts.values()) {
      if (indexes.length < 2) continue;
      const keep = indexes[indexes.length - 1];
      for (const index of indexes) {
        if (index !== keep) duplicateOfLater.set(index, keep);
      }
    }

    const output = messages.map((message, index) => {
      const content = textContent(message);
      if (content == null || message.role === 'system' || frozen.has(index)) return message;

      if (duplicateOfLater.has(index)) {
        messagesReplaced += 1;
        return withTextContent(message, `[same content as message ${duplicateOfLater.get(index) + 1}; not repeated]`);
      }

      const parts = content.split(/(\n{2,})/);
      let replacedHere = 0;
      const next = parts.map((part, partIndex) => {
        if (partIndex % 2 === 1) return part;
        const lineCount = part.split('\n').length;
        if (part.length < minChars || lineCount < minLines) return part;
        const digest = hash(part);
        const bucket = seen.get(digest) || [];
        const exact = bucket.find(candidate => candidate === part);
        if (exact !== undefined) {
          replacedHere += 1;
          return `[repeated from earlier in this conversation: ${preview(part)}…]`;
        }
        bucket.push(part);
        seen.set(digest, bucket);
        return part;
      }).join('');

      if (replacedHere > 0) blocksReplaced += replacedHere;
      return next === content ? message : withTextContent(message, next);
    });

    return { messages: output, details: { blocksReplaced, messagesReplaced } };
  },
};

module.exports = { dedupEngine, preview };
