'use strict';

/**
 * `hard-budget` compression engine (priority 40, lossy).
 *
 * Ported from freellmapi-0.16.6 `services/compression/engines/hard-budget.ts`.
 *
 * When the prompt still exceeds the model's prompt budget after the lossless
 * engines have run, drop the least-informative *lines* first: old messages
 * before recent ones, tool output before assistant prose before user turns.
 * System messages, the most recent turns, and lines carrying protected content
 * (dates, numbers, e-mail addresses, URLs) are never removed.
 */

const { messageChars, textContent, withTextContent, hasProtectedContent } = require('./helpers');

const hardBudgetEngine = {
  id: 'hard-budget',
  priority: 40,
  lossless: false,
  targets: ['messages', 'tool-results'],
  defaultConfig: { enabled: true },
  apply({ messages, context = {} }) {
    const targetTokens = Number(context.targetTokens || 0);
    if (!targetTokens) return { messages };
    if (messageChars(messages) <= targetTokens * 4) return { messages };

    const targetChars = targetTokens * 4;
    const frozen = context.frozenMessageIndexes || new Set();
    const output = [...messages];
    const candidates = [];

    output.forEach((message, messageIndex) => {
      const content = textContent(message);
      if (content == null || message.role === 'system' || frozen.has(messageIndex)) return;
      content.split('\n').forEach((line, lineIndex) => {
        if (!line.trim() || hasProtectedContent(line)) return;
        const recency = messageIndex / Math.max(1, output.length);
        const role = message.role === 'tool' ? 0.2 : message.role === 'assistant' ? 0.5 : 0.8;
        candidates.push({
          messageIndex,
          lineIndex,
          length: line.length + 1,
          score: recency + role,
        });
      });
    });

    const removed = new Map();
    let currentChars = messageChars(output);
    for (const candidate of candidates.sort((a, b) => a.score - b.score || b.length - a.length)) {
      if (currentChars <= targetChars) break;
      const set = removed.get(candidate.messageIndex) || new Set();
      set.add(candidate.lineIndex);
      removed.set(candidate.messageIndex, set);
      currentChars -= candidate.length;
    }

    let linesDropped = 0;
    for (const [messageIndex, indexes] of removed) {
      const message = output[messageIndex];
      const content = textContent(message);
      const kept = content.split('\n').filter((_line, lineIndex) => !indexes.has(lineIndex));
      linesDropped += indexes.size;
      output[messageIndex] = withTextContent(message, kept.join('\n'));
    }

    return { messages: output, details: { linesDropped, targetTokens } };
  },
};

module.exports = { hardBudgetEngine };
