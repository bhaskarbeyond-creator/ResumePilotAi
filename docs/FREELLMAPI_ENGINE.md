# FreeLLMAPI Native Engine

The multi-provider AI engine that powers ResumePilot AI, the Super Admin AI
console, and the public OpenAI/Anthropic-compatible gateway.

**Version:** `0.17.0-inprocess-74p` (`backend/freellmapi/index.js` -> `ENGINE_VERSION`)

## Architecture invariant

The engine runs **100% in-process inside the existing Express app**.

| Constraint | Status |
| --- | --- |
| Separate daemon / sidecar process | None |
| Extra listening port | None (`backend/index.js` is the only server) |
| Native or C++ dependency (`better-sqlite3`, `node-gyp`) | None |
| Network dependency at boot | None |
| Reference `freellmapi-0.16.6/` | Read-only porting reference; never executed |

Only Node built-ins are used: `fetch`, `node:crypto`, `ReadableStream`,
`AsyncIterator`, and `node:sqlite` (with an in-memory fallback).

## Layer map

```
backend/
  index.js                    HTTP mounting, auth, SSE framing, OpenAI/Anthropic wire
  services/
    freellmConfig.js          Super-Admin settings + env -> engine platformConfig
    aiAdmin.js                /admin/ai-settings contract (pools, masking, cooldowns)
  freellmapi/
    index.js                  Public engine surface (completeChat, streamChat, searchWeb...)
    services/router.js        Chat cascade, key rotation, cooldowns, compression, rescue
    services/search.js        Tavily / Exa / Firecrawl / Linkup / Parallel / SerpSearch
    services/cooldown.js      Per-provider / per-key cooling windows
    services/persistence.js   node:sqlite metrics ledger (in-memory fallback)
    services/compression/     dedup, jsoncompact, hardBudget, index (pure JS)
    providers/openaiCompat.js OpenAI-compatible call + async-generator stream
    providers/googleGemini.js Gemini call + async-generator stream
    providers/registry.js     74-provider catalog
    lib/toolRescue.js         Inline tool-call recovery
    agent/claudeCodeAgent.js  Anthropic /v1/messages translation + streaming
```

## Provider catalog

74 providers, split by capability. The split is the isolation boundary that
keeps search engines out of the chat cascade.

| Group | Count | Behaviour |
| --- | --- | --- |
| Chat - `openai-compat` / `google` | 67 | Eligible for chat completions |
| Search - `type: 'search'` | 6 | Only reachable through `/v1/search` |
| Media - `type: 'media'` (Speechify TTS) | 1 | Never a chat candidate |

Admin UI tiers: **Frontier Free Tier (13)**, **Fast Community Mesh (54)**,
**Agent Search & Extraction Tools (7)**.

## HTTP surface

All routes are mounted on the existing Express app. There is deliberately **no
`/api/v1` alias**: the shared `/api` auth stage accepts Firebase bearer tokens
only, so an alias would reject platform-key clients.

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/v1/chat/completions` | Platform key or Firebase token | `stream: true` -> SSE |
| POST | `/v1/messages` | Platform key or Firebase token | Anthropic Messages; `stream: true` -> SSE |
| POST | `/v1/search` | Platform key or Firebase token | Agent web search |
| GET | `/v1/models` | Public | Model discovery incl. capability counts |
| GET | `/v1/status` | Public | Engine version, capabilities, cooldowns |
| GET | `/api/freellmapi/metrics` | Super Admin | Durable metrics ledger |
| POST | `/api/admin/ai/test-provider` | Super Admin | Live reachability probe |
| GET/POST | `/api/admin/ai-settings` | Super Admin | Keys, pools, cooldowns, engine metadata |

`/v1/*` authentication accepts, in order:

1. a platform API key from `FREELMAPI_API_KEYS` / `IME365_V1_API_KEYS`
   (comma or newline separated, compared in constant time), or
2. a verified Firebase ID token.

When no platform keys are configured **and** `NODE_ENV !== 'production'`,
anonymous access is allowed so a local XAMPP checkout works out of the box.

### Streaming contract

SSE responses set `Content-Type: text/event-stream`, `Cache-Control: no-cache`,
`Connection: keep-alive`, and `X-Accel-Buffering: no` (Apache/Passenger buffers
otherwise), then call `flushHeaders()` before the first chunk.

- OpenAI: `chat.completion.chunk` deltas -> optional usage chunk -> `data: [DONE]`.
- Anthropic: `message_start` -> `content_block_start/delta/stop` ->
  `message_delta` -> `message_stop`. Internal telemetry (`_meta`) is never
  written to the wire.

### Search contract

```jsonc
POST /v1/search
{ "query": "capital of Telangana", "max_results": 5, "topic": "news", "include_answer": true }
```

```jsonc
{
  "object": "search.result",
  "provider": "tavily",
  "engine": "tavily",
  "query": "capital of Telangana",
  "answer": "...",                     // when the engine returns one
  "results": [{ "title": "...", "url": "...", "content": "...", "score": 0.93 }],
  "latency_ms": 412,
  "fallbacks": []
}
```

Error codes: `400 invalid_search_query`, `503 NO_SEARCH_PROVIDER`,
`502 ALL_SEARCH_PROVIDERS_FAILED`.

## Credential precedence

For each provider, the highest-precedence source wins:

1. environment variable registered on the provider (e.g. `GROQ_API_KEY`)
2. `ai_providers[<id>].apiKeys[]` (multi-key pool, Super Admin)
3. `ai_providers[<id>].apiKey` (single key or comma-separated pool)
4. legacy `system_settings.ai.<provider>ApiKey`
5. `'keyless'` sentinel for keyless gateways (e.g. Kilo)

Pools rotate round-robin per request; a key that returns 429 is benched before
the provider-wide cooldown starts, so the next key is tried immediately.

## Environment variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `FREELMAPI_API_KEYS` / `IME365_V1_API_KEYS` | Accepted `/v1` platform keys | none (anonymous in non-production) |
| `FREELMAPI_REQUEST_TIMEOUT_MS` | Per-completion upstream timeout | `60000` |
| `FREELMAPI_PROMPT_TOKEN_BUDGET` | hard-budget compression ceiling | unset |
| `FREELMAPI_COMPRESSION` | `off` disables all compression | on (dedup + jsoncompact) |
| `FREELMAPI_COMPRESSION_ENGINES` | Comma list of enabled engines | env-defined set |
| `FREELMAPI_COMPRESSION_MIN_ROWS` | JSON table compaction threshold | engine default |
| `FREELMAPI_METRICS_DB` | SQLite path (`:memory:` for tests) | `data/freellm_metrics.db` |
| `FREELMAPI_DISABLE_SQLITE` | `1` forces the in-memory ledger | unset |

`data/` is git-ignored: the metrics ledger is machine state, never source.

## Compression engines (pure JS)

| Engine | Priority | Lossless | Behaviour |
| --- | --- | --- | --- |
| `dedup` | 3 | yes | Replaces repeated long blocks with `[repeated from earlier in this conversation: ...]`, keeping the most recent copy |
| `jsoncompact` | 15 | yes (reversible) | Collapses JSON arrays into `[[json-table:v1 columns=[...] rows=N]]...[[/json-table]]` |
| `hard-budget` | 40 | no | Token ceiling. Drops oldest tool output first, then assistant prose, then user text; system messages and recent turns are never touched |

The most recent turns are frozen (recency always wins) and are never rewritten.

## Tool-call rescue

Some providers emit tool calls inline in prose instead of `tool_calls`. The
rescue pass parses those blocks against the declared tool names and populates
`message.tool_calls` with valid ids and JSON arguments, so clients never see a
"model described a tool instead of calling it" turn.

## Persistence and observability

`services/persistence.js` opens `node:sqlite` lazily, tolerates the experimental
API warning, and degrades to an in-memory map when the module or filesystem is
unavailable. It records request counts, latency, provider outcomes, and
cooldowns, capped at `MAX_LOG_ROWS = 5000`.

`GET /v1/status` returns `capabilities`, `activeCooldowns`, `cacheEntries`, and a
`persistence` summary (`backend: 'sqlite' | 'memory'`). `/api/freellmapi/metrics`
returns the same ledger to Super Admins.

## Verification

| Gate | Command | Result |
| --- | --- | --- |
| Engine unit suite | `node --test backend/test/freellmapi-engine.test.js` | 28/28 |
| HTTP gateway contract | `node --test backend/test/v1-gateway.integration.test.js` | 21/21 |
| Shared hosting compatibility | `node --test backend/test/shared-hosting-compatibility.test.js` | 5/5 |
| Admin AI contract | `npm run test:ai-settings` | 13/13 |
| Admin console parity | `node --test tests/admin-console-parity.test.mjs` | 12/12 |
| Browser, 5 viewports | `node tests/freellmapi-admin-browser.mjs` | 45/45 |
| Type check | `./frontend/node_modules/.bin/tsc -b frontend` | 0 errors |
| Production build | `npm run build --prefix frontend` | ~2 s |

Screenshots (1920x1080, 1440x900, 1024x768, 768x1024, 375x667 plus the key-pool
and Add-key dialog states) live in
[`docs/ui-audit/screenshots/freellmapi/`](ui-audit/screenshots/freellmapi/).

The browser suite skips with exit 0 when no Chromium binary is available; it
never fabricates a browser result. Install one with
`npx playwright install chromium` or point `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`
at an existing binary.
