'use strict';

/**
 * FreeLLMAPI Live Model Discovery Engine
 *
 * Faithfully mirrors freellmapi-0.16.6/server/src/services/model-discovery.ts.
 * Discovers live models directly from provider endpoints (/v1/models or Gemini /models).
 * Zero hardcoding — dynamically pulls, classifies, caches, and updates active models.
 */

const { createHash } = require('node:crypto');
const { getProviderMeta } = require('../providers/registry');

/** Hard cap on catalog body: 2MB protects shared host memory */
const MAX_CATALOG_BYTES = 2 * 1024 * 1024;
const MAX_DISCOVERED_MODELS = 500;
const MAX_MODEL_ID_LENGTH = 256;

const LIST_KEYS = ['data', 'models', 'result', 'results', 'items'];
const ID_KEYS = ['id', 'name', 'model', 'model_id', 'modelId', 'slug'];
const OWNER_KEYS = ['owned_by', 'ownedBy', 'organization', 'owner', 'provider', 'publisher'];
const CONTEXT_KEYS = [
  'context_length', 'context_window', 'inputTokenLimit', 'max_model_len',
  'max_context_length', 'max_context_tokens', 'ctx_len', 'contextWindow',
];
const PRICE_KEYS = ['price', 'pricing'];
const VISION_KEYS = ['vision', 'supports_vision', 'supportsVision', 'image_input', 'multimodal'];
const MODALITY_KEYS = ['modalities', 'input_modalities', 'inputModalities', 'modality'];
const VISION_MODALITIES = ['image', 'vision', 'image-input'];
const VISION_ID_MARKERS = ['llava', 'internvl', 'pixtral', 'moondream', 'cogvlm', 'vision'];

const KIND_ID_MARKERS = [
  ['embedding', /^embed(ding)?s?$/],
  ['embedding', /^bge$/],
  ['transcription', /^whisper$/],
  ['transcription', /^(asr|stt)$/],
  ['transcription', /^transcri(be|ption)$/],
  ['transcription', /^sensevoice(small|large)?$/],
  ['transcription', /^voxtral$/],
  ['audio', /^tts$/],
  ['audio', /^cosyvoice\d*$/],
  ['video', /^wan\d*$/],
  ['video', /^[ti]2v$/],
  ['video', /video/],
  ['image', /^diffusion$/],
  ['image', /^sd(xl)?\d*$/],
  ['image', /^flux$/],
  ['image', /^dall-?e?\d*$/],
  ['image', /^dalle\d*$/],
  ['image', /^kolors$/],
  ['image', /^imagen\d*$/],
  ['image', /^photomaker(v\d+)?$/],
];

const KIND_METADATA_KEYS = ['type', 'task', 'object', 'model_type', 'modelType'];
const KIND_METADATA_VALUES = [
  ['embedding', /embedding/],
  ['transcription', /(speech-?to-?text|transcri|asr\b|\bstt\b)/],
  ['audio', /(text-?to-?speech|\btts\b|speech-?synthesis)/],
  ['video', /video/],
  ['image', /(text-?to-?image|image-?generation|diffusion)/],
];

function classifyModelKindFromId(id) {
  const tokens = String(id || '').toLowerCase().split(/[^a-z0-9]+/);
  for (const token of tokens) {
    for (const [kind, pattern] of KIND_ID_MARKERS) {
      if (pattern.test(token)) return kind;
    }
  }
  return undefined;
}

function kindFromMetadata(record) {
  if (!record || typeof record !== 'object') return undefined;
  for (const key of KIND_METADATA_KEYS) {
    const val = record[key];
    if (typeof val !== 'string') continue;
    const norm = val.trim().toLowerCase();
    if (!norm || norm === 'model') continue;
    for (const [kind, pattern] of KIND_METADATA_VALUES) {
      if (pattern.test(norm)) return kind;
    }
  }
  return undefined;
}

function isChatModel(id, metadata = {}) {
  const metaKind = kindFromMetadata(metadata);
  if (metaKind && metaKind !== 'chat') return false;

  const idKind = classifyModelKindFromId(id);
  if (idKind) return false;

  return true;
}

function detectVision(id, record = {}) {
  for (const key of VISION_KEYS) {
    if (typeof record[key] === 'boolean') return record[key];
  }
  for (const key of MODALITY_KEYS) {
    const val = record[key];
    if (Array.isArray(val)) {
      if (val.some(m => VISION_MODALITIES.includes(String(m).toLowerCase()))) return true;
    }
    if (typeof val === 'string' && val.trim()) {
      const input = val.toLowerCase().split('->')[0];
      if (VISION_MODALITIES.some(m => input.includes(m))) return true;
    }
  }
  const cleanId = String(id || '').toLowerCase();
  for (const token of cleanId.split(/[^a-z0-9]+/)) {
    if (/^vlm?\d*$/.test(token)) return true;
    if (VISION_ID_MARKERS.some(m => token.includes(m))) return true;
  }
  return undefined;
}

function classifyIntelligence() { return 'Unknown'; }

function findModelArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return null;
  for (const key of LIST_KEYS) {
    if (Array.isArray(payload[key])) return payload[key];
    if (payload[key] && typeof payload[key] === 'object') {
      for (const nestedKey of LIST_KEYS) {
        if (Array.isArray(payload[key][nestedKey])) return payload[key][nestedKey];
      }
    }
  }
  return null;
}

function extractModelId(item) {
  if (typeof item === 'string') return item.trim();
  if (!item || typeof item !== 'object') return null;
  for (const key of ID_KEYS) {
    if (typeof item[key] === 'string' && item[key].trim()) {
      return item[key].trim();
    }
  }
  return null;
}

function extractContextWindow(item) {
  if (!item || typeof item !== 'object') return undefined;
  for (const key of CONTEXT_KEYS) {
    const val = Number(item[key]);
    if (Number.isFinite(val) && val > 0) return val;
  }
  return undefined;
}

function extractPricing(item) {
  if (!item || typeof item !== 'object') return { isFree: false, priceNote: undefined };
  for (const key of PRICE_KEYS) {
    const val = item[key];
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (trimmed.toLowerCase() === 'free') return { isFree: true, priceNote: 'free' };
      return { isFree: false, priceNote: trimmed };
    }
    if (val && typeof val === 'object') {
      const p = Number(val.prompt || 0);
      const c = Number(val.completion || 0);
      if (p === 0 && c === 0) return { isFree: true, priceNote: 'free' };
      return { isFree: false, priceNote: `$${p}/M in, $${c}/M out` };
    }
  }
  return { isFree: false, priceNote: undefined };
}

class ModelDiscoveryService {
  constructor(ttlMs = 3600_000) { // 1 hour TTL
    this.cache = new Map(); // providerKey -> { models, expiresAt }
    this.ttlMs = ttlMs;
    this.inFlight = new Map();
    this.retryAfterMs = 30_000;
    this.maxStaleMs = 24 * 3600_000;
    this.maxEntries = 128;
    this.maxConcurrentDiscovery = 16;
  }

  _store(key, entry) {
    this.cache.delete(key);
    while (this.cache.size >= this.maxEntries) this.cache.delete(this.cache.keys().next().value);
    this.cache.set(key, entry);
  }

  _makeCacheKey(providerId, apiKey, baseUrl) {
    const p = String(providerId || '').toLowerCase().trim();
    const credential = !apiKey || apiKey === 'keyless' ? '' : String(apiKey).trim();
    const k = createHash('sha256').update(credential).digest('hex');
    const u = String(baseUrl || getProviderMeta(p)?.baseUrl || '').trim().replace(/\/+$/, '');
    return `${p}:${k}:${u}`;
  }

  async discoverFromEndpoint({
    providerId,
    apiKey,
    baseUrl,
    fetchImpl = globalThis.fetch,
    timeoutMs = 15000,
  }) {
    const meta = getProviderMeta(providerId);
    const targetBaseUrl = baseUrl || meta?.baseUrl;
    const isKeyless = Boolean(meta?.keyless);

    if (!isKeyless && (!apiKey || !String(apiKey).trim() || apiKey === 'keyless')) {
      throw new Error(`API key required to discover models for ${providerId}`);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      let url;
      const headers = {};

      if (meta?.type === 'horde') {
        url = `${targetBaseUrl.replace(/\/+$/, '')}/status/models?type=text`;
        headers['Client-Agent'] = 'ResumePilotAI:1:https://github.com/bhaskarbeyond-creator/ResumePilotAi';
      } else if (meta?.type === 'google' || providerId === 'gemini') {
        const cleanBase = (targetBaseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/+$/, '');
        url = `${cleanBase}/models?key=${encodeURIComponent((apiKey || '').trim())}`;
      } else {
        const cleanBase = (targetBaseUrl || '').replace(/\/+$/, '');
        url = `${cleanBase}/models`;
        if (apiKey && apiKey !== 'keyless') {
          headers['Authorization'] = `Bearer ${String(apiKey).trim()}`;
        }
        if (providerId === 'openrouter') {
          headers['HTTP-Referer'] = 'https://ime365.com';
          headers['X-Title'] = 'IME365 Career Suite';
        }
      }

      const res = await fetchImpl(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} from ${providerId} /models`);
      }

      let json;
      if (res.body?.getReader) {
        const declared = Number(res.headers?.get?.('content-length'));
        if (declared > MAX_CATALOG_BYTES) {
          await res.body.cancel().catch(() => {});
          throw new Error('Model catalog exceeded the configured body limit');
        }
        const reader = res.body.getReader();
        const chunks = [];
        let size = 0;
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > MAX_CATALOG_BYTES) {
              await reader.cancel().catch(() => {});
              throw new Error('Model catalog exceeded the configured body limit');
            }
            chunks.push(Buffer.from(value));
          }
          json = JSON.parse(Buffer.concat(chunks, size).toString('utf8'));
        } finally { reader.releaseLock(); }
      } else if (typeof res.text === 'function') {
        const rawText = await res.text(); // Compatibility for injected non-streaming fetch implementations.
        if (Buffer.byteLength(rawText, 'utf8') > MAX_CATALOG_BYTES) throw new Error('Model catalog exceeded the configured body limit');
        try { json = JSON.parse(rawText); }
        catch { json = typeof res.json === 'function' ? await res.json() : null; }
        if (!json) throw new Error('Model catalog did not return valid JSON');
      } else if (typeof res.json === 'function') json = await res.json();
      else throw new Error('Model catalog returned an unreadable response body');

      const rawList = findModelArray(json);
      if (!rawList) {
        throw new Error(`Unrecognized models envelope format from ${providerId}`);
      }

      const discovered = [];
      const seenIds = new Set();

      for (const item of rawList) {
        const rawId = extractModelId(item);
        if (!rawId || rawId.length > MAX_MODEL_ID_LENGTH || /[\x00-\x1f\x7f]/.test(rawId)) continue;

        // Clean model id (e.g. Gemini returns 'models/gemini-2.0-flash')
        const id = rawId.replace(/^models\//, '');
        if (meta?.type === 'horde' && !(Number(item.count) > 0)) continue;
        if (!id || item.deprecated === true || item.active === false) continue;
        if (seenIds.has(id)) continue;
        seenIds.add(id);

        // Only retain chat/completion models (filter out speech/embeddings/image diffusion)
        if (!isChatModel(id, item)) continue;

        const contextWindow = extractContextWindow(item);
        const intelligenceTier = classifyIntelligence(id);
        const pricing = extractPricing(item);
        const vision = detectVision('', item);

        discovered.push({
          id,
          name: typeof item.name === 'string' ? item.name.slice(0, 512) : id,
          contextWindow,
          ...(meta?.type === 'horde' ? { adapterContextLimit: 2048, limitSource: 'adapter-policy' } : {}),
          intelligenceTier,
          isFree: id.includes(':free') || pricing.isFree || Boolean(item.is_free),
          priceNote: pricing.priceNote,
          vision: vision || false,
          outputLimit: meta?.type === 'horde' ? 128 : Number.isFinite(Number(item.outputTokenLimit || item.max_output_tokens)) ? Number(item.outputTokenLimit || item.max_output_tokens) : undefined,
          capabilities: Object.fromEntries(Object.entries({
            vision: item.capabilities?.vision ?? detectVision('', item) ?? null,
            tools: item.capabilities?.tools ?? item.capabilities?.function_calling ?? item.supports_tools ?? item.supports_tool_calling ?? (Array.isArray(item.supported_parameters) ? item.supported_parameters.includes('tools') : null),
            json: item.capabilities?.json ?? item.supports_json ?? (Array.isArray(item.supported_parameters) ? item.supported_parameters.includes('response_format') : null),
            streaming: item.capabilities?.streaming ?? item.supports_streaming ?? null,
          }).map(([name, value]) => [name, typeof value === 'boolean' ? value : null])),
          ownedBy: [item.owned_by, item.publisher, item.organization, providerId].find(value => typeof value === 'string')?.slice(0, 256),
        });

        if (discovered.length >= MAX_DISCOVERED_MODELS) break;
      }

      return discovered;
    } finally {
      clearTimeout(timer);
    }
  }

  getCachedCatalog({ providerId, apiKey, baseUrl }) {
    const entry = this.cache.get(this._makeCacheKey(providerId, apiKey, baseUrl));
    if (!entry || Date.now() - entry.refreshedAt > this.maxStaleMs) return [];
    return entry.models.map(model => ({ ...model, catalogSource: 'provider',
      catalogStatus: entry.expiresAt > Date.now() ? 'fresh' : 'stale',
      lastSuccessfulRefresh: entry.refreshedAt, catalogRefreshFailed: Boolean(entry.failed) }));
  }

  async getOrDiscover({
    providerId, apiKey, baseUrl, fetchImpl = globalThis.fetch,
    forceRefresh = false, timeoutMs = 15000,
  }) {
    const key = this._makeCacheKey(providerId, apiKey, baseUrl);
    const existing = this.cache.get(key);
    const now = Date.now();
    const snapshot = entry => entry.models.map(model => ({
      ...model,
      catalogSource: 'provider',
      catalogStatus: entry.expiresAt > Date.now() ? 'fresh' : 'stale',
      lastSuccessfulRefresh: entry.refreshedAt,
      catalogRefreshFailed: Boolean(entry.failed),
    }));
    if (!forceRefresh && existing && existing.expiresAt > now) return snapshot(existing);
    if (this.inFlight.has(key)) return this.inFlight.get(key);
    // Even manual refresh must respect backoff after an upstream outage.
    if (existing?.retryAt > now) {
      if (now - existing.refreshedAt <= this.maxStaleMs) return snapshot(existing);
      throw new Error(`Model discovery temporarily unavailable for ${providerId}`);
    }
    if (this.inFlight.size >= this.maxConcurrentDiscovery) throw new Error('Model discovery concurrency limit reached');
    const operation = (async () => {
      try {
        const models = await this.discoverFromEndpoint({ providerId, apiKey, baseUrl, fetchImpl, timeoutMs });
        const refreshedAt = Date.now();
        const entry = { models, refreshedAt, expiresAt: refreshedAt + this.ttlMs };
        this._store(key, entry);
        return snapshot(entry);
      } catch {
        if (existing) {
          existing.failed = true;
          existing.retryAt = Date.now() + this.retryAfterMs;
          // A failed forced refresh must never masquerade as fresh verification.
          existing.expiresAt = Math.min(existing.expiresAt, Date.now());
          if (Date.now() - existing.refreshedAt <= this.maxStaleMs) return snapshot(existing);
        } else {
          this._store(key, { models: [], refreshedAt: 0, expiresAt: 0, failed: true, retryAt: Date.now() + this.retryAfterMs });
        }
        // Failure is not proof that registry defaults are available upstream.
        throw new Error(`Model discovery unavailable for ${providerId}`);
      }
    })();
    this.inFlight.set(key, operation);
    try { return await operation; }
    finally { this.inFlight.delete(key); }
  }

  clear() {
    this.cache.clear();
  }
}

const defaultModelDiscoveryService = new ModelDiscoveryService();

module.exports = {
  ModelDiscoveryService,
  modelDiscovery: defaultModelDiscoveryService,
  isChatModel,
  classifyIntelligence,
  classifyModelKindFromId,
  detectVision,
};
