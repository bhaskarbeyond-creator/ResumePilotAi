'use strict';

// F-18: static per-model price table for honest usage-cost accounting.
// Prices are USD MICROS per 1K tokens (1 USD = 1,000,000 micros) from the
// providers' published list prices at the time of writing (2026-10). This is
// a deliberately STATIC table: no network price discovery, no guessing.
// Unknown models price at `null` — never 0 — so callers can distinguish
// "free" from "we do not know". Curated registry models are covered; any
// model not listed here is unpriced by design.

// { input: micros per 1K prompt tokens, output: micros per 1K completion tokens }
const MODEL_PRICING_MICROS_PER_1K = Object.freeze({
  // OpenAI
  'gpt-4o': Object.freeze({ input: 2500, output: 10000 }),
  'gpt-4o-mini': Object.freeze({ input: 150, output: 600 }),
  'gpt-4.1-mini': Object.freeze({ input: 400, output: 1600 }),
  'gpt-4.1-nano': Object.freeze({ input: 100, output: 400 }),
  // Google
  'gemini-2.0-flash': Object.freeze({ input: 100, output: 400 }),
  'gemini-1.5-flash': Object.freeze({ input: 75, output: 300 }),
  // Groq-hosted Meta models
  'llama-3.3-70b-versatile': Object.freeze({ input: 590, output: 790 }),
  'llama-3.1-8b-instant': Object.freeze({ input: 50, output: 80 }),
  // DeepSeek
  'deepseek-chat': Object.freeze({ input: 140, output: 280 }),
  'deepseek-reasoner': Object.freeze({ input: 140, output: 280 }),
  // Anthropic
  'claude-3-5-sonnet': Object.freeze({ input: 3000, output: 15000 }),
  'claude-3-5-haiku': Object.freeze({ input: 800, output: 4000 }),
});

/**
 * List price of a model, or null when unknown.
 * @returns {{input:number, output:number}|null}
 */
function getModelPricing(model) {
  const key = String(model || '').trim().toLowerCase();
  if (!key) return null;
  return MODEL_PRICING_MICROS_PER_1K[key] || null;
}

/**
 * Total cost in USD micros for one attempt, or null when it cannot be
 * computed honestly:
 *   - unknown model (no list price)          -> null (NEVER 0)
 *   - missing/non-finite/negative token counts -> null
 * A known model with genuine zero tokens costs 0 — a real, computed zero.
 */
function computeCostMicros(model, promptTokens, completionTokens) {
  const pricing = getModelPricing(model);
  if (!pricing) return null;
  const input = Number(promptTokens);
  const output = Number(completionTokens);
  if (!Number.isFinite(input) || !Number.isFinite(output) || input < 0 || output < 0) return null;
  return Math.round((input / 1000) * pricing.input + (output / 1000) * pricing.output);
}

module.exports = { MODEL_PRICING_MICROS_PER_1K, getModelPricing, computeCostMicros };
