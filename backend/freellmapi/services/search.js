'use strict';

/**
 * FreeLLMAPI Agent Web Search & Extraction
 *
 * Ported (pure CommonJS) from freellmapi-0.16.6 `server/src/services/search.ts`.
 *
 * Search engines are catalogued with `type: 'search'` and their own wire
 * protocols. They must NEVER be sent to `POST /chat/completions` — that is the
 * bug this module replaces. Agents (Claude Code, Cline, Roo, Aider) reach them
 * through `POST /v1/search` instead.
 *
 * Routing:
 *   1. every enabled search provider with a usable key, ordered by priority
 *      (custom/operator relays first when configured, then catalog engines)
 *   2. a key that is rate-limited or out of credits cools down per engine and
 *      the chain moves on
 *   3. the first engine that returns hits wins
 *
 * Adapters implemented (all six reference engines):
 *   tavily      POST {base}/search      Bearer key        answer + results
 *   exa         POST {base}/search      x-api-key         neural results + text
 *   firecrawl   POST {base}/search      Bearer key        web/news hits
 *   linkup      POST {base}/search      Bearer key        sourcedAnswer | results
 *   parallel    POST {base}/search      x-api-key / keyless MCP
 *   serpsearch  GET  {base}/search      Bearer key        organic SERP
 */

const { getProviderMeta } = require('../providers/registry');
const { cooldownManager } = require('./cooldown');
const { getMetricsPersistence } = require('./persistence');

const SEARCH_PLATFORM_IDS = Object.freeze([
  'tavily', 'exa', 'firecrawl', 'linkup', 'parallel', 'serpsearch',
]);

const DEFAULT_RESULTS = 5;
const MAX_RESULTS = 20;
const CONTENT_CHARS = 1500;
const FETCH_TIMEOUT_MS = 30_000;
const RATE_LIMIT_COOLDOWN_MS = 60_000;
const BAD_KEY_COOLDOWN_MS = 60 * 60_000;
const NO_CREDIT_COOLDOWN_MS = 12 * 60 * 60_000;

class SearchError extends Error {
  constructor(message, status = 502, code = undefined, retryAfterMs = undefined) {
    super(message);
    this.name = 'SearchError';
    this.status = status;
    this.code = code;
    this.retryAfterMs = retryAfterMs;
  }
}

const str = value => (typeof value === 'string' ? value : '');
const clip = value => (value.length > CONTENT_CHARS ? `${value.slice(0, CONTENT_CHARS)}…` : value);
const rankScore = (index, size) => Number((1 - index / Math.max(size, 1)).toFixed(3));

const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(value) {
  const text = String(value || '');
  if (!text.includes('&')) return text;
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === '#') {
      const code = entity[1] === 'x' || entity[1] === 'X'
        ? parseInt(entity.slice(2), 16)
        : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[entity.toLowerCase()] !== undefined ? NAMED_ENTITIES[entity.toLowerCase()] : match;
  });
}

function keepHits(hits) {
  const valid = hits.filter(hit => Boolean(hit && hit.url));
  return valid.map((hit, index) => ({
    title: decodeEntities(hit.title),
    url: hit.url,
    content: clip(decodeEntities(hit.content)),
    score: typeof hit.score === 'number' && Number.isFinite(hit.score) ? hit.score : rankScore(index, valid.length),
  }));
}

/** A key pool is `key: string | string[]`; normalize without ever logging it. */
function normalizeKeyPool(value) {
  if (Array.isArray(value)) {
    return value.map(entry => String(entry || '').trim()).filter(Boolean);
  }
  const single = String(value || '').trim();
  return single ? [single] : [];
}

function resolveSearchProviders({ platformConfig = {}, environment = process.env } = {}) {
  const configured = platformConfig.providers || {};
  const providers = [];

  for (const id of SEARCH_PLATFORM_IDS) {
    const meta = getProviderMeta(id);
    if (!meta) continue;
    const conf = configured[id] || {};
    if (conf.enabled === false) continue;
    let keys = normalizeKeyPool(conf.key);
    if (keys.length === 0) {
      const envKey = environment[meta.envKey || `${id.toUpperCase()}_API_KEY`];
      keys = normalizeKeyPool(envKey);
    }
    if (keys.length === 0) continue;
    providers.push({
      id,
      name: meta.name,
      baseUrl: String(conf.baseUrl || meta.baseUrl || '').replace(/\/+$/, ''),
      keys,
      priority: Number.isFinite(conf.priority) ? conf.priority : providers.length,
    });
  }

  // Operator relays first, then high-priority engines (Tavily/Exa by registry
  // intelligence score), but keep a deterministic stable order on ties.
  providers.sort((a, b) => a.priority - b.priority);
  return providers;
}

async function readUpstream(res, platform) {
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const retryAfterHeader = Number(res.headers?.get?.('retry-after') || 0);
    throw new SearchError(
      `${platform} ${res.status}: ${body.slice(0, 200)}`,
      res.status,
      undefined,
      retryAfterHeader > 0 ? retryAfterHeader * 1000 : undefined,
    );
  }
  const contentType = String(res.headers?.get?.('content-type') || '');
  const raw = await res.text();
  if (contentType.includes('text/event-stream')) {
    const data = raw.split('\n')
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).trim())
      .filter(Boolean);
    if (data.length === 0) throw new SearchError('upstream sent an empty event stream', 502);
    return JSON.parse(data[data.length - 1]);
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new SearchError(`${platform} returned a non-JSON body`, 502);
  }
}

function timeoutSignal(ms, signal) {
  const timeout = typeof AbortSignal !== 'undefined' && AbortSignal.timeout
    ? AbortSignal.timeout(ms)
    : null;
  if (timeout && signal && AbortSignal.any) return AbortSignal.any([timeout, signal]);
  return timeout || signal;
}

const ADAPTERS = {
  tavily: async ({ baseUrl, key, query, maxResults, topic, includeAnswer, fetchImpl, signal }) => {
    const body = { query, max_results: maxResults };
    if (topic) body.topic = topic;
    if (includeAnswer !== undefined) body.include_answer = includeAnswer;
    const res = await fetchImpl(`${baseUrl}/search`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: timeoutSignal(FETCH_TIMEOUT_MS, signal),
    });
    const parsed = await readUpstream(res, 'tavily');
    const hits = (Array.isArray(parsed?.results) ? parsed.results : []).map(row => ({
      title: str(row.title), url: str(row.url), content: str(row.content), score: typeof row.score === 'number' ? row.score : undefined,
    }));
    return { answer: typeof parsed?.answer === 'string' ? parsed.answer : undefined, results: keepHits(hits) };
  },

  exa: async ({ baseUrl, key, query, maxResults, topic, fetchImpl, signal }) => {
    const body = {
      query,
      numResults: maxResults,
      type: 'auto',
      contents: { text: { maxCharacters: CONTENT_CHARS } },
    };
    if (topic === 'news') body.category = 'news';
    const res = await fetchImpl(`${baseUrl}/search`, {
      method: 'POST',
      headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: timeoutSignal(FETCH_TIMEOUT_MS, signal),
    });
    const parsed = await readUpstream(res, 'exa');
    const hits = (Array.isArray(parsed?.results) ? parsed.results : []).map(row => ({
      title: str(row.title),
      url: str(row.url),
      content: str(row.text) || str(row.summary) || (Array.isArray(row.highlights) ? row.highlights.filter(item => typeof item === 'string').join(' … ') : ''),
    }));
    return { results: keepHits(hits) };
  },

  firecrawl: async ({ baseUrl, key, query, maxResults, topic, fetchImpl, signal }) => {
    const source = topic === 'news' ? 'news' : 'web';
    const res = await fetchImpl(`${baseUrl}/search`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, limit: maxResults, sources: [source] }),
      signal: timeoutSignal(FETCH_TIMEOUT_MS, signal),
    });
    const parsed = await readUpstream(res, 'firecrawl');
    const data = parsed?.data;
    const rows = Array.isArray(data) ? data : (data?.[source] || data?.web || []);
    const hits = (Array.isArray(rows) ? rows : []).map(row => ({
      title: str(row.title),
      url: str(row.url),
      content: str(row.description) || str(row.snippet) || str(row.markdown),
    }));
    return { results: keepHits(hits) };
  },

  linkup: async ({ baseUrl, key, query, maxResults, includeAnswer, fetchImpl, signal }) => {
    const wantsAnswer = includeAnswer === true;
    const res = await fetchImpl(`${baseUrl}/search`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: query,
        depth: 'standard',
        outputType: wantsAnswer ? 'sourcedAnswer' : 'searchResults',
        maxResults,
      }),
      signal: timeoutSignal(FETCH_TIMEOUT_MS, signal),
    });
    const parsed = await readUpstream(res, 'linkup');
    if (wantsAnswer) {
      const hits = (Array.isArray(parsed?.sources) ? parsed.sources : []).map(row => ({
        title: str(row.name), url: str(row.url), content: str(row.snippet),
      }));
      return { answer: typeof parsed?.answer === 'string' ? parsed.answer : undefined, results: keepHits(hits) };
    }
    const hits = (Array.isArray(parsed?.results) ? parsed.results : [])
      .filter(row => row?.type === undefined || row.type === 'text')
      .map(row => ({ title: str(row.name), url: str(row.url), content: str(row.content) }));
    return { results: keepHits(hits) };
  },

  parallel: async ({ baseUrl, key, query, maxResults, fetchImpl, signal }) => {
    if (String(key).toLowerCase() === 'keyless' || String(key).toLowerCase() === 'no-key') {
      // Anonymous Search MCP (free tier): one stable conversation id per process.
      const sessionId = `freellmapi-${process.pid}-${Date.now().toString(36)}`;
      const res = await fetchImpl('https://mcp.parallel.ai/v1beta/mcp-server', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'web_search', arguments: { objective: query, search_queries: [query], session_id: sessionId } },
        }),
        signal: timeoutSignal(FETCH_TIMEOUT_MS, signal),
      });
      const rpc = await readUpstream(res, 'parallel');
      const text = (rpc?.result?.content || []).find(entry => entry?.type === 'text' && typeof entry.text === 'string')?.text;
      const failure = typeof rpc?.error?.message === 'string' ? rpc.error.message : (rpc?.result?.isError ? (text || 'tool error') : null);
      if (failure !== null) {
        throw new SearchError(`parallel MCP: ${String(failure).slice(0, 200)}`, /rate.?limit|too many|quota/i.test(String(failure)) ? 429 : 502);
      }
      if (!text) throw new SearchError('parallel MCP returned no text content', 502);
      const parsed = JSON.parse(text);
      const hits = (Array.isArray(parsed?.results) ? parsed.results : []).slice(0, maxResults).map(row => ({
        title: str(row.title) || str(row.url),
        url: str(row.url),
        content: Array.isArray(row.excerpts) ? row.excerpts.filter(item => typeof item === 'string').join(' … ') : '',
      }));
      return { results: keepHits(hits) };
    }

    const res = await fetchImpl(`${baseUrl}/search`, {
      method: 'POST',
      headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        objective: query,
        search_queries: [query],
        mode: 'fast',
        advanced_settings: { max_results: maxResults },
      }),
      signal: timeoutSignal(FETCH_TIMEOUT_MS, signal),
    });
    const parsed = await readUpstream(res, 'parallel');
    const hits = (Array.isArray(parsed?.results) ? parsed.results : []).slice(0, maxResults).map(row => ({
      title: str(row.title) || str(row.url),
      url: str(row.url),
      content: Array.isArray(row.excerpts) ? row.excerpts.filter(item => typeof item === 'string').join(' … ') : '',
    }));
    return { results: keepHits(hits) };
  },

  serpsearch: async ({ baseUrl, key, query, maxResults, topic, fetchImpl, signal }) => {
    const news = topic === 'news';
    const url = new URL(`${baseUrl}/${news ? 'news' : 'search'}`);
    url.searchParams.set('query', query);
    const res = await fetchImpl(url.toString(), {
      method: 'GET',
      redirect: 'error',
      headers: { Authorization: `Bearer ${key}` },
      signal: timeoutSignal(FETCH_TIMEOUT_MS, signal),
    });
    const parsed = await readUpstream(res, 'serpsearch');
    let rows;
    if (news) {
      if (!Array.isArray(parsed) || parsed.some(group => !group || !Array.isArray(group.articles))) {
        throw new SearchError('SerpSearch returned invalid news results', 502);
      }
      rows = parsed.flatMap(group => group.articles);
    } else {
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || parsed.error
        || (parsed.organic_results !== undefined && !Array.isArray(parsed.organic_results))) {
        throw new SearchError('SerpSearch returned invalid search results', 502);
      }
      rows = parsed.organic_results || [];
    }
    const hits = rows.filter(row => row && typeof row === 'object').map(row => ({
      title: str(row.title), url: str(row.url), content: str(row.description),
    }));
    return { results: keepHits(hits).slice(0, maxResults) };
  },
};

/** Bench a key for this engine according to what the upstream said. */
function coolDown(provider, model, keyIndex, error) {
  if (![401, 403, 402, 429, 432, 433].includes(Number(error.status))) return;
  const duration = Number(error.status) === 401 || Number(error.status) === 403
    ? BAD_KEY_COOLDOWN_MS
    : (Number(error.status) === 402 || Number(error.status) === 432 || Number(error.status) === 433)
      ? NO_CREDIT_COOLDOWN_MS
      : (error.retryAfterMs || RATE_LIMIT_COOLDOWN_MS);
  // Cooldown is per provider+engine, matching the chat router's granularity.
  cooldownManager.setCooldown(provider, `${model}#key${keyIndex}`, `search ${error.status}: ${error.message}`.slice(0, 180));
  if (Number(error.status) === 429 && error.retryAfterMs) {
    // Retry-After can exceed the default; extend the benched time explicitly.
    cooldownManager.setCooldown(provider, `${model}#key${keyIndex}`,
      `search 429: retry after ${Math.ceil(error.retryAfterMs / 1000)}s`.slice(0, 180));
  }
  void duration;
}

function searchAvailable({ platformConfig = {}, environment = process.env } = {}) {
  return resolveSearchProviders({ platformConfig, environment }).length > 0;
}

/**
 * Execute one web search through the engine chain.
 *
 * @returns {Promise<{query:string, answer?:string, results:object[], provider:string, engine:string, latencyMs:number, fallbacks:object[]}>}
 */
async function searchWeb({
  query,
  maxResults = DEFAULT_RESULTS,
  topic,
  includeAnswer,
  engine = 'auto',
  platformConfig = {},
  environment = process.env,
  fetchImpl = globalThis.fetch,
  signal,
  timeoutMs = FETCH_TIMEOUT_MS,
} = {}) {
  const q = String(query || '').trim();
  if (!q) throw new SearchError('query is required', 400, 'INVALID_SEARCH_QUERY');
  if (q.length > 2000) throw new SearchError('query is too long (max 2000 chars)', 400, 'INVALID_SEARCH_QUERY');

  const requested = Number.isFinite(Number(maxResults)) ? Math.max(1, Math.min(MAX_RESULTS, Math.floor(Number(maxResults)))) : DEFAULT_RESULTS;
  const chain = resolveSearchProviders({ platformConfig, environment })
    .filter(provider => engine === 'auto' || engine === provider.id)
    .filter(provider => !cooldownManager.isOnCooldown(provider.id, `search`).onCooldown);

  const pinned = String(engine || 'auto').toLowerCase();
  const ordered = pinned !== 'auto'
    ? chain.sort((a, b) => (a.id === pinned ? -1 : b.id === pinned ? 1 : 0))
    : chain;

  if (ordered.length === 0) {
    throw new SearchError(
      'No search provider is configured. Add a Tavily, Exa, Firecrawl, Linkup, Parallel or SerpSearch key in Super Admin → AI keys.',
      503,
      'NO_SEARCH_PROVIDER',
    );
  }

  const fallbacks = [];
  for (const provider of ordered) {
    const adapter = ADAPTERS[provider.id];
    if (!adapter) continue;
    for (let keyIndex = 0; keyIndex < provider.keys.length; keyIndex += 1) {
      const cooldown = cooldownManager.isOnCooldown(provider.id, `search#key${keyIndex}`);
      if (cooldown.onCooldown) {
        fallbacks.push({ provider: provider.id, keyIndex, code: 'COOLDOWN', status: 429 });
        continue;
      }
      const started = Date.now();
      try {
        const result = await adapter({
          baseUrl: provider.baseUrl,
          key: provider.keys[keyIndex],
          query: q,
          maxResults: requested,
          topic,
          includeAnswer,
          fetchImpl,
          signal,
          timeoutMs,
        });
        const latencyMs = Date.now() - started;
        cooldownManager.clearCooldown(provider.id, `search#key${keyIndex}`);
        try {
          getMetricsPersistence().recordRequest({ provider: provider.id, model: 'search', ok: true, latencyMs, status: 200 });
        } catch { /* metrics are best-effort */ }
        if (!result || !Array.isArray(result.results) || result.results.length === 0) {
          throw new SearchError(`${provider.id} returned no results`, 502, 'EMPTY_SEARCH_RESULTS');
        }
        return {
          query: q,
          ...(result.answer ? { answer: result.answer } : {}),
          results: result.results.slice(0, requested),
          provider: provider.id,
          engine: `${provider.id}-search`,
          latencyMs,
          fallbacks,
        };
      } catch (error) {
        const searchError = error instanceof SearchError
          ? error
          : new SearchError(error.message || 'search failed', 502);
        coolDown(provider.id, 'search', keyIndex, searchError);
        try {
          getMetricsPersistence().recordRequest({
            provider: provider.id,
            model: 'search',
            ok: false,
            latencyMs: Date.now() - started,
            status: searchError.status,
          });
        } catch { /* metrics are best-effort */ }
        fallbacks.push({
          provider: provider.id,
          keyIndex,
          code: searchError.code || 'SEARCH_ERROR',
          status: searchError.status,
          error: searchError.message,
        });
      }
    }
  }

  const error = new SearchError(
    `All search providers failed: ${fallbacks.map(item => `${item.provider} (${item.status})`).join('; ')}`,
    502,
    'ALL_SEARCH_PROVIDERS_FAILED',
  );
  error.fallbacks = fallbacks;
  throw error;
}

/** Catalog projection for Super Admin / engine status. */
function listSearchProviders() {
  return SEARCH_PLATFORM_IDS.map(id => {
    const meta = getProviderMeta(id);
    return {
      id,
      name: meta?.name || id,
      label: meta?.label || id,
      type: 'search',
      baseUrl: meta?.baseUrl || '',
      defaultModel: 'search',
      docUrl: meta?.docUrl || '',
      freeTierAvailable: Boolean(meta?.freeTierAvailable),
      capabilities: ['web-search', 'extract'],
    };
  });
}

module.exports = {
  SEARCH_PLATFORM_IDS,
  SearchError,
  ADAPTERS,
  decodeEntities,
  keepHits,
  normalizeKeyPool,
  resolveSearchProviders,
  searchAvailable,
  searchWeb,
  listSearchProviders,
  DEFAULT_RESULTS,
  MAX_RESULTS,
};
