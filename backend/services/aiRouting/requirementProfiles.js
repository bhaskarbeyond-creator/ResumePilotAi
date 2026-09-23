'use strict';

/**
 * Request requirement analysis.
 *
 * Maps an AI OPERATION (not a model name) to a generic requirement profile the
 * selector uses for eligibility and ranking:
 *
 *   structuredOutput   — the product contract requires strict JSON
 *   streaming          — the response must stream (none of the current
 *                        operations stream; the field exists so future
 *                        streaming operations route by capability, not by name)
 *   reasoningRequired  — hard gate for reasoning capability (currently none)
 *   latencySensitivity — 'low' | 'medium' | 'high'
 *   qualityTier        — 'standard' | 'enhanced' | 'premium'
 *   determinism        — 'normal' | 'strict' (low-temperature extraction)
 *   maxOutputTokens    — expected output budget (context headroom estimate)
 *   modalities         — required input modalities (e.g. ['audio'])
 *
 * The profile is DATA, applied uniformly to every model; it never references
 * provider or model identifiers.
 */

const { LONG_CONTEXT_SAFE_TOKENS, estimatePromptTokens } = require('./capabilityModel');

const PROFILES = Object.freeze({
    // Fast, short, cheap completion — latency is the dominant requirement.
    autocomplete: Object.freeze({
        structuredOutput: true, streaming: false, reasoningRequired: false,
        latencySensitivity: 'high', qualityTier: 'standard', determinism: 'strict',
        maxOutputTokens: 180, modalities: [],
    }),
    // Question sets: conversational quality + strict JSON.
    'generate-interview': Object.freeze({
        structuredOutput: true, streaming: false, reasoningRequired: false,
        latencySensitivity: 'medium', qualityTier: 'enhanced', determinism: 'normal',
        maxOutputTokens: 4000, modalities: [],
    }),
    // Live interview: context continuity + reliable JSON, turn latency matters.
    'live-interview-open': Object.freeze({
        structuredOutput: true, streaming: false, reasoningRequired: false,
        latencySensitivity: 'high', qualityTier: 'enhanced', determinism: 'normal',
        maxOutputTokens: 1600, modalities: [],
    }),
    'live-interview-turn': Object.freeze({
        structuredOutput: true, streaming: false, reasoningRequired: false,
        latencySensitivity: 'high', qualityTier: 'enhanced', determinism: 'normal',
        maxOutputTokens: 1600, modalities: [],
    }),
    // Final report: depth over speed.
    'live-interview-report': Object.freeze({
        structuredOutput: true, streaming: false, reasoningRequired: false,
        latencySensitivity: 'low', qualityTier: 'premium', determinism: 'normal',
        maxOutputTokens: 4096, modalities: [],
    }),
    'live-interview-guide': Object.freeze({
        structuredOutput: false, streaming: false, reasoningRequired: false,
        latencySensitivity: 'medium', qualityTier: 'enhanced', determinism: 'normal',
        maxOutputTokens: 900, modalities: [],
    }),
    // Verbatim extraction: strict JSON, low temperature, source-sized context.
    'parse-resume': Object.freeze({
        structuredOutput: true, streaming: false, reasoningRequired: false,
        latencySensitivity: 'medium', qualityTier: 'standard', determinism: 'strict',
        maxOutputTokens: 4096, modalities: [],
    }),
    'check-grammar': Object.freeze({
        structuredOutput: true, streaming: false, reasoningRequired: false,
        latencySensitivity: 'medium', qualityTier: 'standard', determinism: 'strict',
        maxOutputTokens: 4096, modalities: [],
    }),
    // Factual, grounded content operations: quality matters, JSON contract.
    'generate-summary': Object.freeze({
        structuredOutput: true, streaming: false, reasoningRequired: false,
        latencySensitivity: 'medium', qualityTier: 'enhanced', determinism: 'normal',
        maxOutputTokens: 2048, modalities: [],
    }),
    'generate-work-description': Object.freeze({
        structuredOutput: true, streaming: false, reasoningRequired: false,
        latencySensitivity: 'medium', qualityTier: 'enhanced', determinism: 'normal',
        maxOutputTokens: 2048, modalities: [],
    }),
    'generate-education-description': Object.freeze({
        structuredOutput: true, streaming: false, reasoningRequired: false,
        latencySensitivity: 'medium', qualityTier: 'enhanced', determinism: 'normal',
        maxOutputTokens: 2048, modalities: [],
    }),
    'enhance-single-bullet': Object.freeze({
        structuredOutput: true, streaming: false, reasoningRequired: false,
        latencySensitivity: 'high', qualityTier: 'enhanced', determinism: 'normal',
        maxOutputTokens: 512, modalities: [],
    }),
    // Recommendation-style operations: JSON + standard quality.
    'generate-skills': Object.freeze({
        structuredOutput: true, streaming: false, reasoningRequired: false,
        latencySensitivity: 'medium', qualityTier: 'standard', determinism: 'normal',
        maxOutputTokens: 2048, modalities: [],
    }),
    'generate-certifications': Object.freeze({
        structuredOutput: true, streaming: false, reasoningRequired: false,
        latencySensitivity: 'medium', qualityTier: 'standard', determinism: 'normal',
        maxOutputTokens: 2048, modalities: [],
    }),
    'generate-projects': Object.freeze({
        structuredOutput: true, streaming: false, reasoningRequired: false,
        latencySensitivity: 'medium', qualityTier: 'standard', determinism: 'normal',
        maxOutputTokens: 2048, modalities: [],
    }),
    'generate-job-description': Object.freeze({
        structuredOutput: true, streaming: false, reasoningRequired: false,
        latencySensitivity: 'medium', qualityTier: 'standard', determinism: 'normal',
        maxOutputTokens: 2048, modalities: [],
    }),
});

const DEFAULT_PROFILE = Object.freeze({
    structuredOutput: false, streaming: false, reasoningRequired: false,
    latencySensitivity: 'medium', qualityTier: 'standard', determinism: 'normal',
    maxOutputTokens: 2048, modalities: [],
});

/**
 * Derive the requirement profile for a request. `prompt` is the fully built
 * prompt (context size is estimated from it); `operation` selects the profile.
 * Unknown operations degrade to the safe generic default.
 */
function deriveRequirementProfile({ operation, prompt = '', payload = {} } = {}) {
    const base = PROFILES[operation] || DEFAULT_PROFILE;
    let contextTokensEstimate = estimatePromptTokens(prompt);
    // Optional caller override (e.g. a live session may know its transcript
    // length better than the raw prompt estimate). Applied BEFORE the token
    // math so requiredTokens/longContextRequired reflect the real context.
    if (payload && typeof payload === 'object' && Number(payload.estimatedInputTokens) > 0) {
        contextTokensEstimate = Math.ceil(Number(payload.estimatedInputTokens));
    }
    const outputBudget = Math.max(64, Number(base.maxOutputTokens) || 2048);
    // 10% headroom so the model has room to generate inside its context window.
    const totalRequiredTokens = Math.ceil((contextTokensEstimate + outputBudget) * 1.1);
    return {
        operation: String(operation || 'unknown'),
        structuredOutput: Boolean(base.structuredOutput),
        streaming: Boolean(base.streaming),
        reasoningRequired: Boolean(base.reasoningRequired),
        latencySensitivity: base.latencySensitivity,
        qualityTier: base.qualityTier,
        determinism: base.determinism,
        maxOutputTokens: outputBudget,
        modalities: [...base.modalities],
        contextTokensEstimate,
        requiredTokens: totalRequiredTokens,
        longContextRequired: totalRequiredTokens > LONG_CONTEXT_SAFE_TOKENS,
    };
}

module.exports = { PROFILES, DEFAULT_PROFILE, deriveRequirementProfile };
