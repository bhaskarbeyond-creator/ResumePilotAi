'use strict';

/**
 * FreeLLMAPI Multi-Stage Prompt Compression Pipeline
 *
 * Ported (pure CommonJS, zero dependencies) from freellmapi-0.16.6
 * `server/src/services/compression/`.
 *
 * Reference ships nine engines; the three that carry the majority of the
 * 30–70% savings on resume/interview prompts are implemented here:
 *
 *   priority  engine        lossless  what it removes
 *   ─────────────────────────────────────────────────────────────────────────
 *      3      dedup          yes      repeated blocks & duplicate messages
 *     15      jsoncompact    yes      repeated JSON keys / indentation
 *     40      hard-budget     no      least-informative lines over the budget
 *
 * Engine order matters: dedup and jsoncompact shrink the prompt losslessly, so
 * hard-budget has less work to do (and destroys less) before it runs.
 *
 * Prompt budgets exist because free tiers enforce TPM/RPM limits. A Groq free
 * key rejects a 9k-token prompt long before the model's context window does, so
 * the router passes a *provider* budget rather than the model's context size.
 *
 * Configuration (all optional):
 *   FREELMAPI_COMPRESSION=off            disable the pipeline entirely
 *   FREELMAPI_COMPRESSION_ENGINES=dedup,jsoncompact
 *   FREELMAPI_COMPRESSION_MIN_ROWS=8
 *   FREELMAPI_PROMPT_TOKEN_BUDGET=6000   default target for hard-budget
 */

const { dedupEngine } = require('./dedup');
const { jsonCompactEngine } = require('./jsoncompact');
const { hardBudgetEngine } = require('./hardBudget');
const {
  messageChars,
  estimateTokensFromChars,
  textContent,
  withTextContent,
  allMessageText,
  buildToolCallOrigins,
  hasProtectedContent,
} = require('./helpers');

const ENGINES = Object.freeze([dedupEngine, jsonCompactEngine, hardBudgetEngine]);
const ENGINE_IDS = Object.freeze(ENGINES.map(engine => engine.id));

/** How many trailing turns are never rewritten (the live instruction set). */
const FROZEN_TAIL_TURNS = 2;

function parseEngineList(raw) {
  if (!raw) return null;
  const ids = String(raw).split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
  return ids.length > 0 ? new Set(ids) : null;
}

/**
 * Choose handler-visible message indexes that no lossy engine may touch:
 * every system message plus the last N non-system turns.
 */
function computeFrozenIndexes(messages, tailTurns = FROZEN_TAIL_TURNS) {
  const frozen = new Set();
  const nonSystem = [];
  messages.forEach((message, index) => {
    if (message?.role === 'system') frozen.add(index);
    else nonSystem.push(index);
  });
  for (const index of nonSystem.slice(-tailTurns)) frozen.add(index);
  return frozen;
}

function totalToolChars(messages) {
  return (messages || []).reduce((sum, message) => {
    if (message?.role !== 'tool') return sum;
    const content = textContent(message);
    return sum + (content ? content.length : 0);
  }, 0);
}

/**
 * Run the compression pipeline over an OpenAI-shaped message array.
 *
 * @param {Array<object>} messages
 * @param {object} [options]
 * @param {number} [options.targetTokens] prompt budget for hard-budget
 * @param {boolean|object} [options.enabled] false disables the pipeline
 * @param {string[]} [options.engines] allow-list of engine ids
 * @param {object} [options.engineConfig] per-engine `{ minRows, minBlockChars, ... }`
 * @param {string} [options.environment] source of the env defaults (test seam)
 * @returns {{messages: Array<object>, stats: object}}
 */
function compressMessages(messages, options = {}) {
  const source = Array.isArray(messages) ? messages : [];
  const environment = options.environment || process.env;
  const beforeChars = messageChars(source);
  const beforeTokens = estimateTokensFromChars(beforeChars);

  const stats = {
    enabled: false,
    engines: {},
    beforeChars,
    afterChars: beforeChars,
    beforeTokens,
    afterTokens: beforeTokens,
    tokensSaved: 0,
    savedRatio: 0,
    toolCharsBefore: totalToolChars(source),
    toolCharsAfter: totalToolChars(source),
    frozenMessageIndexes: [],
  };

  const configDisabled = String(environment.FREELMAPI_COMPRESSION || '').toLowerCase() === 'off';
  if (options.enabled === false || configDisabled) {
    stats.skipped = configDisabled ? 'FREELMAPI_COMPRESSION=off' : 'disabled';
    return { messages: source.slice(), stats };
  }
  if (beforeChars === 0) {
    stats.skipped = 'empty';
    return { messages: source.slice(), stats };
  }

  const allowed = Array.isArray(options.engines)
    ? new Set(options.engines.map(value => String(value).toLowerCase()))
    : parseEngineList(environment.FREELMAPI_COMPRESSION_ENGINES);

  const engineConfig = { ...(options.engineConfig || {}) };
  if (engineConfig.minRows === undefined && environment.FREELMAPI_COMPRESSION_MIN_ROWS) {
    const parsed = Number(environment.FREELMAPI_COMPRESSION_MIN_ROWS);
    if (Number.isFinite(parsed) && parsed >= 2) engineConfig.minRows = Math.floor(parsed);
  }

  const targetTokens = Number(
    options.targetTokens
      || environment.FREELMAPI_PROMPT_TOKEN_BUDGET
      || 0,
  );
  const context = {
    targetTokens: Number.isFinite(targetTokens) && targetTokens > 0 ? targetTokens : 0,
    frozenMessageIndexes: computeFrozenIndexes(source),
  };

  stats.enabled = true;
  stats.frozenMessageIndexes = [...context.frozenMessageIndexes];
  stats.targetTokens = context.targetTokens || null;

  let current = source.slice();
  for (const engine of [...ENGINES].sort((a, b) => a.priority - b.priority)) {
    if (allowed && !allowed.has(engine.id)) continue;
    const perEngine = { ...(engine.defaultConfig || {}), ...(engineConfig[engine.id] || {}) };
    if (perEngine.enabled === false) continue;
    if (engine.id === 'hard-budget' && !context.targetTokens) continue;
    try {
      const result = engine.apply({ messages: current, config: perEngine, context });
      const before = messageChars(current);
      const after = messageChars(result.messages);
      current = result.messages;
      stats.engines[engine.id] = {
        applied: after < before,
        charsSaved: before - after,
        lossless: engine.lossless,
        ...(result.details || {}),
      };
    } catch (error) {
      // A compression failure must never fail the user's request.
      stats.engines[engine.id] = { applied: false, error: error.message };
    }
  }

  const afterChars = messageChars(current);
  stats.afterChars = afterChars;
  stats.afterTokens = estimateTokensFromChars(afterChars);
  stats.tokensSaved = Math.max(0, stats.beforeTokens - stats.afterTokens);
  stats.savedRatio = beforeChars > 0 ? Number(((beforeChars - afterChars) / beforeChars).toFixed(4)) : 0;
  stats.toolCharsAfter = totalToolChars(current);
  if (!stats.engineIds) stats.engineIds = ENGINE_IDS;

  return { messages: current, stats };
}

module.exports = {
  ENGINES,
  ENGINE_IDS,
  FROZEN_TAIL_TURNS,
  computeFrozenIndexes,
  compressMessages,
  // helpers re-exported for the router and tests
  messageChars,
  estimateTokensFromChars,
  textContent,
  withTextContent,
  allMessageText,
  buildToolCallOrigins,
  hasProtectedContent,
  decodeJsonTables: require('./jsoncompact').decodeJsonTables,
  encodeJsonTable: require('./jsoncompact').encodeJsonTable,
};
