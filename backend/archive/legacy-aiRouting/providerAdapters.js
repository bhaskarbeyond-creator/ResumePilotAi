'use strict';

/**
 * Provider adapters.
 *
 * All provider-specific behavior (URL shapes, auth styles, response parsing,
 * discovery endpoints, request quirks) lives HERE — not in the central routing
 * engine. The selector/orchestrator only speak a generic adapter contract:
 *
 *   adapter.buildChatRequest({ providerConfig, model, prompt, temperature, maxTokens })
 *       -> { url, method, headers, body }
 *   adapter.buildDiscoveryRequest({ providerConfig })
 *       -> { url, method, headers }
 *   adapter.extractChatResponse(body, status)
 *       -> { content, usage }            (throws ProviderRequestError on bad output)
 *   adapter.normalizeDiscoveryResponse(body)
 *       -> [ { modelId, raw } ]          (validated model ids only)
 *
 * `adapter.defaultModel` is a CONFIGURATION SEED only: it fills the effective
 * model when the operator/tenant has not configured one. It is NOT a ranking —
 * runtime health and discovery evidence dynamically demote it (e.g. a retired
 * model 404s -> cooldown -> selection fails over to discovered models).
 *
 * A new provider requires registering an adapter + a configuration entry; the
 * central routing engine needs no changes. A new model from an existing
 * provider requires no code change at all.
 */

const { isValidModelId } = require('./capabilityModel');

class ProviderRequestError extends Error {
    constructor(message, { errorClass = 'provider_error', status = 502, code = null, retryAfterMs = null } = {}) {
        super(message);
        this.name = 'ProviderRequestError';
        this.errorClass = errorClass;
        this.status = status;
        if (code) this.code = code;
        if (retryAfterMs) this.retryAfterMs = retryAfterMs;
    }
}

function extractProviderErrorMessage(body, status, providerName) {
    if (!body || typeof body !== 'object') return `${providerName} HTTP ${status}`;
    if (typeof body.error === 'string' && body.error.trim()) return body.error.trim();
    if (typeof body.error?.message === 'string' && body.error.message.trim()) return body.error.message.trim();
    if (typeof body.message === 'string' && body.message.trim()) return body.message.trim();
    if (typeof body.detail === 'string' && body.detail.trim()) return body.detail.trim();
    return `${providerName} HTTP ${status}`;
}

function normalizeOpenAiUsage(meta) {
    if (!meta || typeof meta !== 'object') return null;
    const promptTokens = Number(meta.prompt_tokens ?? meta.input_tokens) || 0;
    const completionTokens = Number(meta.completion_tokens ?? meta.output_tokens) || 0;
    const totalTokens = Number(meta.total_tokens) || (promptTokens + completionTokens);
    return { promptTokens, completionTokens, totalTokens };
}

const NON_CHAT_MODEL_PATTERN = /\b(?:embed|embedding|embeddings|rerank|reranker|detector|diffusion|flux|clip|whisper|tts|asr|ocr|stt|upscaler|vae|deplot)\b|-(?:embed|rerank|detector|diffusion)$/i;

/**
 * OpenAI-compatible chat-completions adapter factory. One instance per
 * OpenAI-compatible gateway (openai, groq, deepseek, openrouter, nvidia, ...).
 */
function openAiCompatibleAdapter({ id, name, defaultModel, baseUrl, discoveryPath = '/models', extraHeaders = null }) {
    const resolveBaseUrl = (configured) => {
        const base = String(configured || '').trim().replace(/\/+$/, '');
        return base || baseUrl;
    };
    const headersFor = (key) => {
        const base = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
        const extra = typeof extraHeaders === 'function' ? (extraHeaders() || {}) : (extraHeaders || {});
        return { ...base, ...extra };
    };
    return {
        id,
        name,
        kind: 'openai-compatible',
        defaultModel,
        defaultBaseUrl: baseUrl,
        defaultChatUrl: `${baseUrl}/chat/completions`,
        discovery: { supported: true, path: discoveryPath },
        buildChatRequest({ providerConfig, model, prompt, temperature, maxTokens }) {
            const base = resolveBaseUrl(providerConfig?.baseUrl);
            const url = /\/chat\/completions$/.test(base) ? base : `${base}/chat/completions`;
            return {
                url,
                method: 'POST',
                headers: headersFor(providerConfig?.key),
                body: JSON.stringify({
                    model,
                    messages: [{ role: 'user', content: prompt }],
                    temperature,
                    max_tokens: maxTokens,
                }),
            };
        },
        buildDiscoveryRequest({ providerConfig }) {
            const base = resolveBaseUrl(providerConfig?.baseUrl);
            const url = base.endsWith(discoveryPath) ? base : `${base}${discoveryPath}`;
            return { url, method: 'GET', headers: headersFor(providerConfig?.key) };
        },
        extractChatResponse(body, status) {
            if (!body || typeof body !== 'object') {
                throw new ProviderRequestError(`Invalid response from ${name} provider (HTTP ${status})`, { errorClass: 'invalid_response', status: 502 });
            }
            const content = body.choices?.[0]?.message?.content;
            const text = String(content || '');
            if (!text.trim()) {
                throw new ProviderRequestError(`Empty content received from ${name} provider`, { errorClass: 'empty_response', status: 502, code: 'EMPTY_PROVIDER_RESPONSE' });
            }
            return { content: text, usage: normalizeOpenAiUsage(body.usage) };
        },
        normalizeDiscoveryResponse(body) {
            let list = null;
            if (Array.isArray(body?.data)) list = body.data;
            else if (Array.isArray(body?.models)) list = body.models;
            else if (Array.isArray(body)) list = body;
            else if (body && typeof body === 'object' && !Array.isArray(body) && ('data' in body || 'models' in body)) {
                // A list field is present but has the wrong type: the response
                // is malformed, NOT an authoritative empty catalog. Callers
                // (discovery service) keep their last-known-good state.
                throw new ProviderRequestError('Malformed discovery response: model list has wrong type', { errorClass: 'invalid_response', status: 502, code: 'MALFORMED_DISCOVERY' });
            }
            const out = [];
            const seen = new Set();
            for (const item of list || []) {
                if (!item || typeof item !== 'object') continue;
                const modelId = String(item.id || item.name || '').trim();
                if (!isValidModelId(modelId) || seen.has(modelId)) continue;
                if (NON_CHAT_MODEL_PATTERN.test(modelId)) continue;
                seen.add(modelId);
                out.push({ modelId, raw: item });
            }
            return out;
        },
    };
}

/** Gemini-native REST adapter (key-in-URL, candidates/parts response shape). */
const geminiAdapter = {
    id: 'gemini',
    name: 'Gemini',
    kind: 'gemini-native',
    defaultModel: 'gemini-2.0-flash',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    defaultChatUrl: null, // gemini uses /v1beta/models/{model}:generateContent
    discovery: { supported: true, path: '/v1beta/models' },
    resolveBaseUrl(configured) {
        const base = String(configured || '').trim().replace(/\/+$/, '');
        return base || 'https://generativelanguage.googleapis.com';
    },
    buildChatRequest({ providerConfig, model, prompt, temperature, maxTokens }) {
        const base = geminiAdapter.resolveBaseUrl(providerConfig?.baseUrl);
        const modelPath = String(model || '').startsWith('models/') ? String(model) : `models/${model}`;
        return {
            url: `${base}/v1beta/${modelPath}:generateContent?key=${encodeURIComponent(providerConfig?.key || '')}`,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature, maxOutputTokens: maxTokens },
            }),
        };
    },
    buildDiscoveryRequest({ providerConfig }) {
        const base = geminiAdapter.resolveBaseUrl(providerConfig?.baseUrl);
        return {
            url: `${base}/v1beta/models?key=${encodeURIComponent(providerConfig?.key || '')}`,
            method: 'GET',
            headers: {},
        };
    },
    extractChatResponse(body, status) {
        if (!body || typeof body !== 'object') {
            throw new ProviderRequestError(`Invalid response from Gemini provider (HTTP ${status})`, { errorClass: 'invalid_response', status: 502 });
        }
        const parts = body.candidates?.[0]?.content?.parts || [];
        const text = parts.map(part => part?.text || '').join('');
        if (!text.trim()) {
            throw new ProviderRequestError('Empty content received from Gemini provider', { errorClass: 'empty_response', status: 502, code: 'EMPTY_PROVIDER_RESPONSE' });
        }
        const meta = body.usageMetadata || null;
        const usage = meta ? {
            promptTokens: Number(meta.promptTokenCount) || 0,
            completionTokens: Number(meta.candidatesTokenCount) || 0,
            totalTokens: Number(meta.totalTokenCount) || 0,
        } : null;
        return { content: text, usage };
    },
    normalizeDiscoveryResponse(body) {
        let list = null;
        if (Array.isArray(body?.models)) list = body.models;
        else if (body && typeof body === 'object' && !Array.isArray(body) && 'models' in body) {
            throw new ProviderRequestError('Malformed discovery response: model list has wrong type', { errorClass: 'invalid_response', status: 502, code: 'MALFORMED_DISCOVERY' });
        }
        const out = [];
        const seen = new Set();
        for (const item of list || []) {
            if (!item || typeof item !== 'object') continue;
            const rawName = String(item.name || item.id || '').trim();
            const modelId = rawName.replace(/^models\//, '');
            if (!isValidModelId(modelId) || seen.has(modelId)) continue;
            seen.add(modelId);
            out.push({ modelId, raw: item });
        }
        return out;
    },
};

function appIdentityHeaders() {
    return {
        'HTTP-Referer': process.env.APP_URL || process.env.TARGET_URL || 'https://ime365.com',
        'X-Title': 'IME365',
    };
}

const PROVIDER_ADAPTERS = new Map([
    ['nvidia', openAiCompatibleAdapter({
        id: 'nvidia', name: 'NVIDIA NIM',
        defaultModel: 'meta/llama-3.2-11b-vision-instruct',
        baseUrl: 'https://integrate.api.nvidia.com/v1',
    })],
    ['gemini', geminiAdapter],
    ['openai', openAiCompatibleAdapter({
        id: 'openai', name: 'OpenAI',
        defaultModel: 'gpt-4o-mini',
        baseUrl: 'https://api.openai.com/v1',
    })],
    ['groq', openAiCompatibleAdapter({
        id: 'groq', name: 'Groq',
        defaultModel: 'llama-3.3-70b-versatile',
        baseUrl: 'https://api.groq.com/openai/v1',
    })],
    ['openrouter', openAiCompatibleAdapter({
        id: 'openrouter', name: 'OpenRouter',
        defaultModel: 'openrouter/auto',
        baseUrl: 'https://openrouter.ai/api/v1',
        extraHeaders: appIdentityHeaders,
    })],
    ['deepseek', openAiCompatibleAdapter({
        id: 'deepseek', name: 'DeepSeek',
        defaultModel: 'deepseek-chat',
        baseUrl: 'https://api.deepseek.com',
    })],
]);

function getAdapter(providerId) {
    return PROVIDER_ADAPTERS.get(String(providerId || '')) || null;
}

function listAdapterIds() {
    return [...PROVIDER_ADAPTERS.keys()];
}

/**
 * Extension point: register a provider adapter for a new gateway. The central
 * routing engine iterates whatever providers the tenant configuration exposes
 * and looks adapters up by id — no central code change is needed.
 */
function registerProviderAdapter(adapter) {
    if (!adapter || typeof adapter.id !== 'string' || !adapter.id
        || typeof adapter.buildChatRequest !== 'function'
        || typeof adapter.extractChatResponse !== 'function'
        || typeof adapter.normalizeDiscoveryResponse !== 'function') {
        throw new Error('Invalid provider adapter');
    }
    PROVIDER_ADAPTERS.set(String(adapter.id), adapter);
    return adapter;
}

module.exports = {
    ProviderRequestError,
    appIdentityHeaders,
    extractProviderErrorMessage,
    getAdapter,
    geminiAdapter,
    listAdapterIds,
    openAiCompatibleAdapter,
    registerProviderAdapter,
};
