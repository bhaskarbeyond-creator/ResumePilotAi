'use strict';

/**
 * AI model capability model (provider-agnostic).
 *
 * Capabilities are TRISTATE: 'yes' | 'no' | 'unknown'. A provider that does not
 * publish a capability is recorded as 'unknown' and is NEVER assumed to support
 * it. Eligibility rules live in modelSelector.js:
 *   - explicit 'no'      -> candidate is rejected (hard violation)
 *   - 'yes'              -> candidate is verified (bonus signal)
 *   - 'unknown'          -> candidate stays eligible but unverified (lower rank),
 *                           EXCEPT long-context requests where unverified capacity
 *                           is a hard rejection (we have no evidence it fits).
 *
 * Unknown provider fields are preserved (sanitized) so provider schema evolution
 * never crashes the router and future versions can consume new metadata.
 */

const CAP = Object.freeze({
    YES: 'yes',
    NO: 'no',
    UNKNOWN: 'unknown',
});

// A request whose estimated context exceeds this many tokens requires *verified*
// capacity. Below this threshold an unknown capacity is treated as unverified
// (eligible, lower rank) because the prompt is inside the platform's normal
// generation budget. This is a data threshold, not a model name.
const LONG_CONTEXT_SAFE_TOKENS = 16384;

const MODEL_ID_PATTERN = /^[A-Za-z0-9._:/-]{1,150}$/;

/**
 * Model ids are treated as opaque, provider-namespace identifiers but are
 * embedded into provider URLs and telemetry, so reject the shapes that could
 * become path traversal or injection: `..` sequences, leading/trailing dots
 * or slashes, and control characters (covered by the pattern).
 */
function isValidModelId(modelId) {
    if (typeof modelId !== 'string' || !MODEL_ID_PATTERN.test(modelId)) return false;
    if (modelId.includes('..')) return false;
    if (/^[./-]|[./-]$/.test(modelId)) return false;
    return true;
}

function safeNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

function asTri(value) {
    if (value === true || value === 1) return CAP.YES;
    if (value === false || value === 0) return CAP.NO;
    if (typeof value === 'string') {
        const v = value.trim().toLowerCase();
        if (['yes', 'true', 'supported', 'enabled', '1', 'available'].includes(v)) return CAP.YES;
        if (['no', 'false', 'unsupported', 'disabled', 'unavailable', '0', 'none'].includes(v)) return CAP.NO;
    }
    return CAP.UNKNOWN;
}

// Field aliases are provider-agnostic: the FIRST present field wins. Providers
// that rename or add fields keep working (unknown = unknown).
const STREAMING_FIELDS = ['streaming', 'supportsStreaming', 'supports_streaming', 'stream'];
const STRUCTURED_OUTPUT_FIELDS = [
    'structuredOutput', 'structured_output', 'supportsResponseFormat', 'supports_response_format',
    'responseFormat', 'response_format', 'jsonMode', 'json_mode', 'supportsTools', 'supports_tools', 'tools',
];
const REASONING_FIELDS = ['reasoning', 'supportsReasoning', 'supports_reasoning', 'extendedThinking', 'extended_thinking'];
const MODALITY_FIELDS = ['inputModalities', 'input_modalities', 'modalities', 'inputModalitiesList'];
const CONTEXT_FIELDS = [
    'maxInputTokens', 'max_input_tokens', 'contextWindow', 'context_window', 'contextLength',
    'context_length', 'maxContextTokens', 'max_context_tokens', 'contextTokens', 'inputContextWindow',
];
const OUTPUT_FIELDS = ['maxOutputTokens', 'max_output_tokens', 'maxCompletionTokens', 'max_completion_tokens', 'outputTokens', 'maxTokens'];
const PRICING_FIELDS = ['pricing', 'cost', 'pricingPerMTok', 'prices'];

function firstField(view, candidates) {
    for (const candidate of candidates) {
        if (view && Object.prototype.hasOwnProperty.call(view, candidate)) {
            const value = view[candidate];
            if (value !== null && value !== undefined && value !== '') return value;
        }
    }
    return null;
}

function normalizeModalities(value) {
    if (Array.isArray(value)) {
        return [...new Set(value.map(v => String(v || '').trim().toLowerCase()).filter(Boolean))].slice(0, 16);
    }
    if (typeof value === 'string') {
        return value.split(',').map(v => v.trim().toLowerCase()).filter(Boolean).slice(0, 16);
    }
    return null; // unknown (not published)
}

function normalizePricing(value) {
    if (!value || typeof value !== 'object') return null;
    const flat = {};
    for (const [k, v] of Object.entries(value)) {
        if (typeof v === 'number' || typeof v === 'string') flat[k.toLowerCase().replace(/[^a-z0-9]/g, '')] = v;
    }
    const pick = (...names) => {
        for (const name of names) {
            const raw = flat[name];
            if (raw !== undefined) {
                const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/[^0-9.-]/g, ''));
                if (Number.isFinite(n) && n >= 0) return n;
            }
        }
        return null;
    };
    const input = pick('inputpermtok', 'inputper1m', 'inputpricepermtok', 'promptpricepermtok', 'input', 'prompt');
    const output = pick('outputpermtok', 'outputper1m', 'outputpricepermtok', 'completionpricepermtok', 'output', 'completion');
    if (input === null && output === null) return null;
    const currency = flat.currency || flat.currencycode || (value.currency ? String(value.currency) : null) || null;
    return { inputPerMtok: input, outputPerMtok: output, currency: currency || null };
}

const SECRET_KEY_NAME = /(?:key|token|secret|credential|authorization|password)/i;
const MAX_EXTRA_FIELDS = 24;

function sanitizeExtra(source) {
    const extra = {};
    let count = 0;
    for (const [k, v] of Object.entries(source)) {
        if (count >= MAX_EXTRA_FIELDS) break;
        if (SECRET_KEY_NAME.test(k)) continue; // never persist credential-looking fields
        if (typeof v === 'string') {
            const trimmed = v.trim();
            if (!trimmed) continue;
            // Defense against poisoned catalogs: drop values that look like live secrets.
            if (/\bsk-[A-Za-z0-9_-]{12,}\b/.test(trimmed) || /\bgsk_[A-Za-z0-9]{12,}\b/.test(trimmed)
                || /\bAIza[0-9A-Za-z_-]{20,}\b/.test(trimmed) || /\bnvapi-[A-Za-z0-9._-]{12,}\b/.test(trimmed)) continue;
            extra[k] = trimmed.slice(0, 200);
            count += 1;
        } else if (typeof v === 'number' && Number.isFinite(v)) {
            extra[k] = v;
            count += 1;
        } else if (typeof v === 'boolean') {
            extra[k] = v;
            count += 1;
        }
    }
    return extra;
}

/**
 * Normalize arbitrary provider-discovered metadata into the internal capability
 * representation. Never throws on malformed input; unknown data stays UNKNOWN.
 */
function normalizeModelCapabilities(raw) {
    const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const capsSub = (source.capabilities && typeof source.capabilities === 'object' && !Array.isArray(source.capabilities))
        ? source.capabilities
        : {};
    const supportedSub = (source.supported && typeof source.supported === 'object' && !Array.isArray(source.supported))
        ? source.supported
        : {};
    // Top-level fields take precedence over nested convenience objects.
    const view = { ...capsSub, ...supportedSub, ...source };

    const capabilities = {
        streaming: asTri(firstField(view, STREAMING_FIELDS)),
        structuredOutput: asTri(firstField(view, STRUCTURED_OUTPUT_FIELDS)),
        reasoning: asTri(firstField(view, REASONING_FIELDS)),
    };

    const modalitiesRaw = firstField(view, MODALITY_FIELDS);
    const pricingRaw = firstField(view, PRICING_FIELDS);

    return {
        capabilities,
        modalities: normalizeModalities(modalitiesRaw), // array | null (unknown)
        maxInputTokens: safeNumber(firstField(view, CONTEXT_FIELDS)), // number | null (unknown)
        maxOutputTokens: safeNumber(firstField(view, OUTPUT_FIELDS)), // number | null (unknown)
        pricing: normalizePricing(pricingRaw), // { inputPerMtok, outputPerMtok, currency } | null
        extra: sanitizeExtra(source), // unknown provider fields, sanitized, never used for routing
    };
}

/**
 * Build a full normalized model record. `source` records where the model came
 * from ('discovery', 'configured', 'seed') for explainability.
 */
function normalizeModelRecord({ provider, modelId, raw, source = 'discovery', discoveredAt = null }) {
    return {
        provider: String(provider || ''),
        modelId: String(modelId || ''),
        capabilities: normalizeModelCapabilities(raw),
        source,
        discoveredAt,
    };
}

/**
 * Evaluate one capability requirement against a model's known capability.
 * status: 'not-required' | 'verified' | 'violated' | 'unverified'
 */
function evaluateCapability(required, actual) {
    if (!required) return { status: 'not-required' };
    if (actual === CAP.YES) return { status: 'verified' };
    if (actual === CAP.NO) return { status: 'violated' };
    return { status: 'unverified' };
}

/**
 * Evaluate context capacity against the estimated request footprint.
 * requiredTokens must already include output headroom.
 * status: 'not-required' | 'verified' | 'violated' | 'unverified'
 *         | 'unverified-long-context' (hard rejection in the selector)
 */
function evaluateContext(requiredTokens, maxInputTokens, headroom = 1.1) {
    const required = safeNumber(requiredTokens);
    if (!required) return { status: 'not-required' };
    if (maxInputTokens == null || !Number.isFinite(maxInputTokens)) {
        // Capacity not published: unknown (never assumed supported).
        return required > LONG_CONTEXT_SAFE_TOKENS ? { status: 'unverified-long-context' } : { status: 'unverified' };
    }
    return maxInputTokens >= required * headroom ? { status: 'verified' } : { status: 'violated' };
}

/** Evaluate required modalities (e.g. ['audio']) against published modalities. */
function evaluateModalities(requiredModalities, actualModalities) {
    if (!Array.isArray(requiredModalities) || requiredModalities.length === 0) return { status: 'not-required' };
    if (!Array.isArray(actualModalities) || actualModalities.length === 0) return { status: 'unverified' };
    const actual = new Set(actualModalities.map(m => String(m).toLowerCase()));
    const missing = requiredModalities.filter(m => !actual.has(String(m).toLowerCase()));
    return missing.length ? { status: 'violated', missing } : { status: 'verified' };
}

/** Rough prompt token estimate (chars/4 is the industry-standard heuristic). */
function estimatePromptTokens(text) {
    return Math.max(1, Math.ceil(String(text || '').length / 4));
}

module.exports = {
    CAP,
    LONG_CONTEXT_SAFE_TOKENS,
    MODEL_ID_PATTERN,
    evaluateCapability,
    evaluateContext,
    evaluateModalities,
    estimatePromptTokens,
    isValidModelId,
    normalizeModalities,
    normalizeModelCapabilities,
    normalizeModelRecord,
    safeNumber,
};
