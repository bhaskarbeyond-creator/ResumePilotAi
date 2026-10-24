# AI Multi-Provider Engine — Independent Audit

**Date:** 2026-10-24
**Repository:** `bhaskarbeyond-creator/ResumePilotAi`
**Base commit:** `5bd2570` (`Merge branch 'freeze/ai-settings-10-10' into main`)
**Audited tree:** working branch `arena/59e83a88-resumepilotai`, tree clean at audit start
**Scope:** the routing/selection/execution engine — **not** the settings UI (frozen, PR #49 / `freeze/ai-settings-10-10`)
**Mode:** read-only. No product code was changed, no commit, no push, no PR.

---

## 0. P0 alert (reported before the rest of this document)

| # | P0 | Evidence | Impact |
|---|----|----------|--------|
| **F-01** | The OpenAI/Anthropic-compatible gateway `/v1/*` is **outside every AI admission control**: no `aiAccountLimiter`, no `aiGovernanceMiddleware`, no `enforceDailyAiQuota`, and no global rate limiter (that limiter is mounted on `/api` only). Any signed-in candidate's Firebase token is accepted as a `/v1` credential. | `backend/index.js:2786,2974,3034` (routes), `backend/index.js:2702-2722` (`resolveV1Principal`), `backend/index.js:390` (`app.use('/api', globalLimiter)`), `backend/index.js:556-569` (quota only on `/api/ai*`). Live probe §A.6: user token accepted; `ai_usage` rows stayed **0** across three `/v1` calls. | Unmetered, unthrottled access to paid provider capacity by any authenticated user (and, in non-production, anonymously when no platform keys are configured — `index.js:2718-2720`). Cost/abuse exposure and a complete bypass of the quota system the product advertises. |

No other finding in this audit is rated P0. Everything else is P1 or lower (§7).

---

## 1. Executive verdict

The product does **not** have one AI engine. It has **two**, stacked:

1. `backend/freellmapi/` — the *legacy* multi-provider mesh (75-provider registry, key pools, cooldown manager, LRU prompt cache, SQLite metrics). This engine actually serves almost every inference today.
2. `backend/services/aiRouting/` — the *new* "dynamic, explainable, tenant-scoped" selector (`selectModels`, `HealthStore`, `DiscoveryService`, `RoutingTelemetry`). It is reached from the product path **only when the legacy engine throws an error class that is not `ALL_PROVIDERS_FAILED` and not HTTP 503** (`backend/services/aiRuntime.js:1846-1871`).

That inversion is the single most important structural finding. The sophisticated engine this audit was commissioned to evaluate is, in the live product path, a rarely-executed fallback. The engine that runs every day (`freellmapi`) has no intelligence signal at all, a single-observation latency heuristic, no tenant awareness in its metrics/cache/cooldown stores, and several correctness bugs (manual mode, cache scoping, metering).

Honest ratings (`engine-rating.md`): **Overall 5.0/10**. The "fastest + smartest active model" claim does **not** survive (§4.7).

---

## 2. What "the engine" actually is

### 2.1 Two engines, one façade

| Layer | File | Role |
|---|---|---|
| Façade | `backend/services/aiGateway/index.js:1-16` | Claims "Single Source of Truth: backend/freellmapi"; re-exports `freellm` + a `compat` object |
| "Compat" | `backend/services/aiGateway/compat/aiRoutingCompat.js:7-12` | Actually re-exports `backend/services/aiRouting` — a *different* engine, not a compatibility shim |
| Product runtime | `backend/services/aiRuntime.js` | Loads config, builds prompts, calls `freellm.completeChat` first (`:1775-1796`); `ALL_PROVIDERS_FAILED` is translated to `502 AI_PROVIDER_ERROR` and thrown (`:1846-1869`), `503 AI_PROVIDER_UNAVAILABLE` is rethrown (`:1870`); `router.route` is reached only for other error codes (`:1871`) |
| Legacy mesh | `backend/freellmapi/**` | Provider registry, key pools, cooldowns, cache, metrics, `/v1` wire protocols |
| New selector | `backend/services/aiRouting/**` | Requirement profiles, capability gates, explainable scoring, tenant-scoped health/telemetry |

### 2.2 Provider registry

- **Location:** `backend/freellmapi/providers/registry.js:13` — `PROVIDER_REGISTRY = Object.freeze({...})`, **75 entries**.
- **Fields:** `type` (`openai-compat` \| `google` \| `horde` \| `search` \| `media`), `baseUrl`, `defaultModel`, `recommendedModels`, `envKey`, `keyless`, `optIn`, `accessCategory`.
- **How it is updated:** by **code change** for a genuinely new provider (`registry.js`); by **configuration only** for any OpenAI-compatible endpoint, because `buildCandidateList` accepts an unknown provider id when a `baseUrl` is stored (`backend/freellmapi/services/router.js:344-347`, `backend/services/freellmConfig.js:101-107`). Admin keys are written to `system_settings.ai_providers` (`backend/services/aiAdmin.js:434-441`).
- **Version surface:** `/v1/models` and `/v1/status` publish the catalog (`backend/index.js:3088-3119`). `intelligenceScore` / `speedScore` / `reliabilityScore` / `latencyMs` are returned as **`null`** — the engine does not fabricate scores (`backend/services/aiAdmin.js:337-341`, `backend/freellmapi/index.js:106-107`). This is honest and should be preserved.

### 2.3 Selection policies — there are three

| # | Implementation | Where | Inputs |
|---|---|---|---|
| A | `_computeDynamicRankScore` (legacy) | `backend/freellmapi/services/router.js:399-428` | +120 primary, +10 non-keyless key, ±60×freshness success, +20×freshness × speed factor; 30-min freshness |
| B | `rankCandidates` (mode-aware) | `backend/freellmapi/services/selectionPolicy.js:21-45` | +5 primary, `min(4,capabilityFlags)×fit/4`, `decay×((success?+1:-1)×reliability + speed×speed)`; `decay = 1-age/30min` |
| C | `selectModels` (dynamic, explainable) | `backend/services/aiRouting/modelSelector.js:74-354` | Hard gates G1–G7, then weights (`WEIGHTS`, `:41-55`) |

Policy B supersedes A in `selectionMode` configurations (A becomes a tie-breaker only, because B re-sorts and uses original order as a stable tiebreak — `router.js:225,388-394`). Policy C is the one described in the design docs and is **not on the hot path** (§2.1).

### 2.4 Scoring formula, transcribed

**Policy C (`modelSelector.js:261-299`)**

```
score = 40·[origin=configured] + 10·[origin=discovered]
      + 10·[provider == primary] + 5·[provider is second in providerOrder]
      + 15·[require.structuredOutput ∧ caps.structuredOutput = YES]
      + 15·[require.streaming        ∧ caps.streaming        = YES]
      + 15·[require.longContext      ∧ contextStatus = verified]
      + 10·[require.qualityTier = premium ∧ caps.reasoning    = YES]
      + 10·[require.modalities       ∧ caps.modalities present]
      + round(successRate·20) + latencyScore(p50, sensitivity)      // only when sampleSize ≥ 3
      + costScore   (0 | +5)                                        // within-provider only
      + 50·[model == tenant primaryModel]
tie-break: score desc → providerOrder asc → model id asc
```

`latencyScore` (`:356-369`): high sensitivity → 10/8/4/0/−10 at ≤1s/≤2.5s/≤5s/≤8s/>8s; otherwise 4/2/0.
`costScore` (`:371-391`): only if the provider publishes pricing and ≥2 sibling models; +5 for cheapest quartile on standard/enhanced tiers, +5 for most expensive quartile on premium. **Cost never gates.**

**Policy B (`selectionPolicy.js:21-45`)**

```
weights     = speed ? {rel:20, speed:60, fit:0}
            : quality ? {rel:30, speed:0, fit:30}
            :            {rel:40, speed:20, fit:10}      // auto, balanced AND manual share this
score = 5·[provider == primary]
      + min(4, trueCapabilityCount)·fit/4
      + decay·( (success ? +1 : -1)·rel + max(0, 1-latency/10000)·speed )
decay = max(0, 1 - age/30min)  when age ∈ [0,30min), else 0
```

### 2.5 Metrics store

- **File:** `data/freellm_metrics.db` (SQLite via `node:sqlite`; resolved at `backend/freellmapi/services/persistence.js:23-37`; git-ignored by `.gitignore:153 /data/`).
- **Schema** (`persistence.js:97-120`, verified live): `provider_metrics(provider, model, requests, successes, failures, total_latency_ms, last_latency_ms, last_status, p95_latency_ms, updated_at)` PK `(provider,model)`; `provider_cooldowns(provider, model, expires_at, reason, strikes, updated_at)`; `request_log(id, provider, model, ok, status, latency_ms, created_at)` + index.
- **What is recorded:** one row per provider attempt (success and failure), latency, HTTP status (`router.js:483-489,643,676`; stream path `:858,879,893`).
- **What is not:** prompts, tokens, cost, **tenant id**. `_recordMetrics` deliberately drops every tenant/BYOK-scoped observation (`router.js:483-485`) — so tenant traffic contributes nothing.
- **Refresh cadence:** synchronous write per attempt; `request_log` pruned to 5000 rows with probability 1% per write (`persistence.js:196-198`). `p95_latency_ms` is computed from an **in-process ring of the last 200 samples** (`persistence.js:144-159`), so it resets to 0 on restart even though the counters persist.
- **Operator surface:** `GET /api/freellmapi/metrics` (super-admin, `backend/index.js:3122`) and the unauthenticated `GET /v1/status` (`:3117`).

### 2.6 Cooldown store

- **Memory:** `backend/freellmapi/services/cooldown.js:15` Map keyed `provider:model`; provider-level key also consulted (`:61-79`).
- **TTL:** 60 s base, doubled per consecutive strike within 10 min, **max 300 s** (`:16-17,86-92`).
- **Durability:** mirrored to `provider_cooldowns` (`:105-112`) and re-hydrated at attach time (`:26-48`), so a restart does not hammer a benched provider.
- **Global scope:** the cooldown key contains **no tenant id**. One tenant's 429 benches the destination for every tenant (see §6.2).
- **Separate store** in the new engine: `HealthStore` keyed `tenantId|provider|model` (`backend/services/aiRouting/healthStore.js:44-46`), in-process only.

### 2.7 Cache

- **Where:** `backend/freellmapi/services/cache.js` — LRU-ish `Map`, 500 entries, 1 h TTL (`:14-18`).
- **Key:** `sha256({ messages, model: cacheIdentity, temperature })` (`:20-23`), where `cacheIdentity = sha256({ tenantContext, candidates, maxTokens, jsonMode, responseFormat })` (`router.js:571-573`).
- **Invalidation:** only TTL and capacity. There is **no** `cleanExpired()` method (`cache.js:56-62`), despite the 6-hourly maintenance job calling it (`freellmapi/index.js:165` → `F-11`). Cache entries are never cleared when settings change; they stop matching only because `candidates` (which embed the keys) change the identity.
- **Scope:** for `/v1` callers `tenantContext` is always `null`, so the identity contains no principal at all → see `F-02`.

### 2.8 Config propagation (settings → live request)

| Path | Cache | TTL | Evidence |
|---|---|---|---|
| freellmapi mesh | `backend/services/freellmConfig.js:31-36,56-75` | **10 s** (`CONFIG_CACHE_MS`) | live probe §A.3: DB change visible after ≤12 s, no restart |
| product runtime | `backend/services/aiRuntime.js:77,1623-1673` | **15 s** (`CONFIGURATION_CACHE_MS`) | same loader family |
| admin save | `backend/services/aiAdmin.js:459-460` | cache cleared **synchronously** on save | static + §A.7 |

No-restart guarantee **holds for a single process**. Both caches are process-local; a multi-instance deployment converges only after the TTL. There is no pub/sub or revision broadcast.

### 2.9 Multi-tenancy inside the engine

| Store | Tenant-aware? | Evidence |
|---|---|---|
| aiRouting `HealthStore` | **Yes** — key `tenantId\|provider\|model` | `healthStore.js:4-14,44-46` |
| aiRouting `RoutingTelemetry` | **Yes** — entries carry `tenantId` | `routingTelemetry.js:14-16,69` |
| aiRouting `DiscoveryService` | **Yes** — per-tenant credential access | `discoveryService.js` (tenant access state) |
| freellmapi `provider_metrics` / `request_log` | **No** | schema has no tenant column |
| freellmapi `CooldownManager` | **No** | `cooldown.js:55-59` |
| freellmapi prompt cache | **Only when the caller passes `tenantContext`** | `router.js:571-573`; `/v1` passes `null` |

---

## 3. Consumer surface (summary — full chart in `engine-consumers.md`)

Discovered by grepping the whole repository, not just `backend/routes/`.

| Consumer | Entry | Auth | Engine |
|---|---|---|---|
| OpenAI SDK / Cursor / Cline | `POST /v1/chat/completions` | `optionalAuth` + platform key **or** Firebase token | freellmapi |
| Anthropic SDK / Claude Code | `POST /v1/messages` | same | freellmapi |
| Agent search | `POST /v1/search` | same | freellmapi search chain |
| Model catalog | `GET /v1/models` | **none** | freellmapi |
| Engine status | `GET /v1/status`, `/api/freellmapi/status` | **none** | freellmapi |
| Durable metrics | `GET /api/freellmapi/metrics` | `requireSuperAdmin` | freellmapi |
| Product content ops | `/api/ai/generate-content`, `/api/ai/parse-resume`, `/api/ai/check-grammar`, legacy `/api/generate-*` | `requireAuth` + governance + daily quota | freellm → aiRuntime → (rare) aiRouting |
| Interview generation | `/api/ai/generate-interview` (+ legacy) | same | freellmapi |
| Live interview | `/api/live-interview/*` | `requireAuth` + governance + quota on POST | freellmapi |
| Cover letter | `/api/generate-ai-cover-letter` | same | freellmapi |
| Enterprise content | `/api/enterprise/ai/generate-content` | tenant context + `ai.use` | freellm (tenant "BYOK" tier, fabricated) |
| Enterprise interview | `/api/enterprise/ai/generate-interview` | same | freellmapi |
| Admin settings | `GET/POST /api/admin/ai-settings` | `requireSuperAdmin` | config only |
| Admin probes | `/api/admin/ai/test-provider`, `/api/admin/ai/fetch-models` | `requireSuperAdmin` | direct provider call |
| Admin quota | `/api/admin/ai/quota-stats`, `/api/admin/ai/quota-limits`, `/api/admin/ai/reset-quota` | path policy (`ai.usage.read` / `ai.entitlements.manage`) | MariaDB quota ledger |
| Tenant BYOK | `PATCH /api/admin/platform/tenants/:id/ai-policy`, `POST …/ai-keys/test` | `system.config.write` + recent auth + `requireSuperAdmin` | **encrypted store, never read by router** |
| Cron | `startAutonomousMaintenance` every 6 h (`index.js:5294`, `freellmapi/index.js:158-174`) | — | cooldown purge (works) + cache purge (throws) |
| Webhooks | none for AI | — | — |
| Batch/backfill | none for AI | — | — |

**No evidence found** for: a scheduled health-check job, quota-reset cron, metric-compaction cron, or a documented third-party partner integration beyond the OpenAI/Anthropic wire compatibility.

---

## 4. Routing intelligence audit

### 4.1 Are the five modes real?

`MODES = ['auto','quality','speed','balanced','manual']` (`selectionPolicy.js:3`), validated at `:4-7` and again on save (`aiAdmin.js:70`). `selectionMode` is read from `public_config.ai.selectionMode` (`freellmConfig.js:116`).

| Mode | Code | What it optimises | Distinct formula? | Live behaviour |
|---|---|---|---|---|
| `auto` | `selectionPolicy.js:25` (else branch) | reliability 40 / speed 20 / fit 10 | **No — identical to `balanced` and to the formula `manual` uses before pinning** | `auto` with primary failing → fell over to the healthy provider (`§A.5`) |
| `balanced` | `:25` | same as `auto` | **No** | not separately probed (same code path) |
| `speed` | `:23` | reliability 20 / speed 60 / fit 0 | yes | after both providers had a fresh success, chose the 8 ms provider over the 3 s primary (`§A.9`) |
| `quality` | `:24` | reliability 30 / speed 0 / fit 30 | yes | chose the **3 s primary** over the 8 ms alternative and reported `qualityEvidence: "unknown"` (`§A.10`) |
| `manual` | `router.js:203,215,227-230` | pin to `platformConfig.primary` | pinning, not a formula | honoured — but with two live defects (`F-03`, `F-04`) |

`manual` pinning is enforced by `chosen = candidates.filter(c => c.provider === primary)` and a final filter that keeps only the top candidate's provider+model (`router.js:227-230`). It is **not** silently overridden by cooldown: when the pinned provider failed with HTTP 500 the request returned **502 `ALL_PROVIDERS_FAILED`** and the healthy secondary received **zero** calls (`§A.8`). That is the documented contract (comment at `router.js:226`), and it is honoured — but see the outage coupling in `F-03`/`F-14`.

When the *selected* provider is unavailable at config level (disabled/unconfigured), the pin cannot be honoured at all: `primary` falls back to `candidates[0].provider` (`router.js:202`) and traffic is served by a different provider while `routing_decision.mode` still says `manual` (`§A.7`). That is a UX honesty gap, not a routing bug.

### 4.2 Signals that actually feed selection

| Signal | Source | Real? | Stale? |
|---|---|---|---|
| Provider order / primary | `public_config.ai.provider` (`freellmConfig.js:110-112`) | yes | no |
| Enabled / disabled | `ai_providers[*].enabled\|disabled` (`freellmConfig.js:98-99`) | yes | 10 s cache |
| Credential present | key pool from env → DB pool → legacy field (`freellmConfig.js:89-94`) | yes | 10 s cache |
| Success/failure | **last** `request_log` row per provider (`router.js:224-225,409-425`) | yes | yes — single sample, 30 min decay |
| Latency | **last** `latency_ms` of that sample (`router.js:420-423`) | yes (wall clock around HTTP) | yes — one sample |
| Capability fit | count of `true` flags in discovered metadata (`selectionPolicy.js:34`) | only if discovery published flags | n/a |
| Cooldown | `cooldownManager.isOnCooldown` (`router.js:219,366`) | yes | per TTL |
| Cost | provider-published pricing (policy C only) | often absent | n/a |
| Intelligence / benchmark | **none anywhere** | — | — |

Nothing is hardcoded except `DEFAULT_PRIORITY_ORDER` (`router.js:31-53`), which is a *tie-breaker/fallback ordering*, not a score.

### 4.3 Latency signal

- **Measurement:** wall-clock duration of the provider HTTP attempt (`router.js:606,628`), stored as `latency_ms`.
- **Statistic used for ranking:** the **single most recent** observation (`getRecentRequests`, `router.js:224-225`), decayed linearly over 30 minutes (`:415-423`).
- **Window / refresh:** none. `p95_latency_ms` exists in the schema but is **not read by any selector** (grep: only `persistence.js` writes/reads it for the metrics endpoint).
- **Granularity:** per provider **and** per model (`_key(provider, model)`).
- **Cold start:** no observation → `score += 0` from the evidence block; only the primary bonus (+120/+5) and key bonus apply. Deterministic and safe.
- **Is it fake/stub-sourced?** No. Both engines measure real HTTP durations. In this audit they measured local stubs, but the code path is the production one.

### 4.4 Intelligence ("smartest") signal

- The only capability signal in the live engine is **a count of boolean flags** in model metadata (`selectionPolicy.js:34`) plus `quality: "unknown"` in the response (`:39-41`).
- Static tiers from the registry are **rank/marketing strings only**; the engine never reads them (`router.js:404-405` comment: "Registry marketing scores and model-name size heuristics are not quality evidence"). Admin catalog exposes `intelligenceScore: null` (`aiAdmin.js:337`).
- **Slower+smarter vs faster+dumber:** in `auto` the formula has no "smart" term at all; in `quality` the primary bonus (+5) dominates because `fit` is 0 when metadata carries no flags — observed: `quality` chose the 3 s primary over an 8 ms healthy alternative (`§A.10`). So the answer is: **it prefers the operator's primary, not the smarter model.**
- **User-observable signal:** `_freellmapi.routing_decision` exists but is `null` unless `selectionMode` is configured (`§A.2`), and even then contains only `{mode, qualityEvidence, capabilityEvidence, observedLatencyMs, lastSuccessfulCatalogRefresh}` (`selectionPolicy.js:38-42`) — no score, no candidate list, no reason. `fallbacks[]` does explain a failover (`§A.5`).

### 4.5 Active-provider filter — the five signals

| Signal | Checked at routing time? | Evidence |
|---|---|---|
| enabled | **yes** | `router.js:336`, `modelSelector.js:107` |
| has key / valid key shape | **yes** | `router.js:349-355`, placeholder filter `:239-248` |
| not rate-limited | **yes** | cooldown key includes model; `:219,366` |
| not in cooldown (failure backoff) | **yes** | `:219,366`; policy C `:226-242` |
| health check | **no** | `probeProviderConnection` is only invoked by the admin "test key" actions (`routes/adminPlatformOperations.js:470-482`, `freellmapi/index.js:76-78`); nothing schedules it |

**Live proof of the disable → skip path (same process, no restart, no cache clear):**

```
T+0    ai_providers.groq = {enabled:false, disabled:true}   (direct DB write, bypasses admin cache clear)
T+12s  POST /v1/chat/completions  {"model":"auto"}
       -> 200, _freellmapi.provider = "openai", actual_model = "alpha-model"
       -> stub beta (/chat/completions) call count unchanged
```
`§A.4`. This exercises the 10 s `CONFIG_CACHE_MS` path rather than the admin save path; §A.7 exercises the synchronous clear.

### 4.6 Failure and fallback

- **Triggers:** any non-2xx (`router.js:661-697`), network error, timeout (`openaiCompat.js:284-331`), empty completion (`:304-306`), unparseable tool dialect (`router.js:459-468`), mid-stream failure (no replay — `router.js:876-881`).
- **Bound:** one pass over the candidate list × key pool (`router.js:597-697`); it is capped at 12 candidates only when a `selectionMode` is configured (`router.js:232`), otherwise every enabled provider is attempted in priority order. **No retry of the same provider** in the legacy engine. The new engine retries a candidate once more, and only for latency-critical live operations (`attempts = latencyCritical ? 2 : 1`, `orchestrator.js:236`), always inside the operation's latency budget. Both are bounded.
- **Provider disclosed?** Yes — `_freellmapi.provider`, `actual_model`, `latency_ms`, `cached`, `fallbacks[]` (`backend/index.js:2957-2965`). Probe `§A.5` shows a real failover recorded with provider, model, HTTP status, and error.
- **All providers fail:** deterministic `502 ALL_PROVIDERS_FAILED` (`router.js:700-706`) / `503 AI_PROVIDER_UNAVAILABLE` when no candidate exists (`:562-567`); the new engine produces `502 AI_PROVIDER_ERROR` with a `failures[]` array (`orchestrator.js:425-449`). No hang: every attempt has a deadline (`httpDeadline.js`, `orchestrator.js:254-256`).
- **Primary in cooldown:** the legacy engine skips it and serves the next eligible provider (probe `§A.5` — openai was in cooldown, groq served). The new engine additionally implements a "last-resort cooldown release" when *everything* is cooling (`modelSelector.js:310-328`), which the legacy engine does **not** (`F-14`).

### 4.7 Verdict on "fastest + smartest active model"

**No — the claim does not survive**, with one partial exception.

What the engine actually does:

1. It picks the operator's **primary** provider unless a *most-recent single observation* says that provider recently failed or was much slower (`router.js:399-428`).
2. In `speed` mode it will prefer a provider whose **last** success was faster (proven, `§A.9`), but a single stale sample can mislead it (observed 3.0 s request served while an 8 ms provider existed, `§A.9` first attempt).
3. In `quality` mode it has **no quality evidence whatsoever** (`qualityEvidence: "unknown"`), so "smartest" reduces to "primary" (`§A.10`).
4. The genuinely explainable, capability-gated, tenant-scoped selector (`aiRouting`) is bypassed for normal product traffic (`§2.1`, `F-05`).

To make the claim true, the engine needs (a) a real quality signal, (b) a windowed latency statistic rather than the last sample, and (c) product traffic actually routed through the selector. See `engine-findings.md` §"Path to a true 10/10".

---

## 5. BYOK and multi-tenancy

### 5.1 Who can write a key

| Route | Guard | Writes | Evidence |
|---|---|---|---|
| `POST /api/admin/ai-settings` | `requireSuperAdmin` only (**no recent-auth**, unlike the tenant policy route) | platform provider keys → `system_settings.ai_providers` | `backend/index.js:3840`; `aiAdmin.js:381-463` |
| `POST /api/admin/ai/test-provider` | `requireSuperAdmin` + dedicated limiter | nothing (probe only) | `index.js:574,3861` |
| `GET/POST /api/admin/ai/fetch-models` | `requireSuperAdmin` | nothing | `index.js:3874` |
| `PATCH /api/admin/platform/tenants/:id/ai-policy` | `system.config.write` + `requireRecentAdminAuthentication` + `requireSuperAdmin` | tenant BYOK → **AES-256-GCM** `enterprise_tenant_credentials` | `adminPlatformOperations.js:393-417`; `mysqlTenantRegistry.js:1656-1699` |
| `POST …/ai-keys/test` | `system.config.write` + recent auth | nothing | `adminPlatformOperations.js:451-464` |

- **There is no user-level BYOK write path.** `routes/ai.js:343-351` explicitly rejects client-supplied credentials (`CLIENT_AI_KEY_REJECTED`); `resolveV1Principal` accepts only platform keys or Firebase identity (`index.js:2702-2722`). Grep for `byok|userApiKey|user_api_key` finds only the enterprise tenant store.
- **A tenant-scoped write path does exist** (`enterprise_tenant_credentials`) and is admin-only.
- **Platform keys are stored in plaintext** in `system_settings.ai_providers` (`aiAdmin.js:434-441`; verified with a SQL read of the stored DeepSeek key, `§A.12`). The tenant store is encrypted; the platform store is not.

### 5.2 Does the routing engine know the tenant?

- **freellmapi:** only if the caller passes `tenantContext`. The `/v1` routes never do (`index.js:2807-2819,2996-3030`), so those calls are platform-scope and share metrics, cooldowns and cache.
- **Product/enterprise:** `applyTenantAiPolicy` stamps `tenantId` and `tenantPolicy` (`tenantAi.js:78-101`); `generateWithProviders` converts that into a `tenantContext` (`aiRuntime.js:1778-1789`) which *does* isolate the cache identity. But the `customProviderKeys` it builds are the **platform** keys from `configuration.providers`, not tenant credentials.

**Consequences (all static, high confidence):**

1. `hasTenantByok` becomes true for every enterprise request (`router.js:258-262`) → the request is executed in the "dedicated BYOK" tier with `isDedicatedByok: true`.
2. That suppresses all durable metrics (`router.js:483-485`) and all cooldowns (`router.js:685`), so the engine learns nothing from tenant traffic — directly weakening "fastest" for the largest customers.
3. Tenant BYOK written through the admin route is **never read by any inference path**: `getTenantCredentials` has exactly one consumer, the "test key" route (`adminPlatformOperations.js:464`). `applyTenantAiPolicy` reads `policy.customProviderKeys` (`tenantAi.js:38,52`), and `normalizeTenantConfiguration` deliberately strips that field on write (`mysqlTenantRegistry.js:143-146`). So the feature is **write-only dead storage**.
4. Because all users share the admin key pool, one tenant can consume another tenant's capacity and rate limit. This is **not documented** in the engine code; the only mitigations are per-tenant quotas on the enterprise routes.

### 5.3 Key lifecycle

| Aspect | Behaviour | Evidence |
|---|---|---|
| Rotation / pools | Multi-key pools supported end-to-end (`apiKeys[]`, comma/newline split); round-robin cursor per provider; all keys tried before benching the provider | `router.js:100-116,137-142,598-604,683-691` |
| Revocation | Admin save clears the config cache synchronously; next request rebuilds candidates without the key | `aiAdmin.js:459-460`; `§A.7` |
| Expiry (401/403) | Classified `credential`; key is tried once, next key in pool, provider may be benched with reason "All pooled keys rejected" | `openaiCompat.js:90-91`; `router.js:678-690` |
| Audit | `admin_audit_logs` row `AI_PROVIDER_SETTINGS_UPDATED` with revision + changed field names; **no key material, not even last-4** | `aiAdmin.js:443-451`; verified: SQL `LIKE` scan for every test key returned 0 rows (`§A.11`) |
| Tenant credential audit | **none** — neither the route nor the registry writes an audit event for BYOK set/delete | `adminPlatformOperations.js:405-417`; `mysqlTenantRegistry.js:1656-1699` |
| Platform key at rest | **plaintext JSON** | `§A.12` |

### 5.4 Cross-tenant inference safety

- **Prompt → provider with another tenant's key:** impossible today *because tenant BYOK is never used*. Every tenant request uses the platform key. The inverse risk (one tenant exhausting the shared pool) is real and unmitigated beyond quota counters.
- **Result leakage via cache:** **proven.** Same prompt, two different bearer credentials, second response `cached: true` served from the first call's entry (`§A.2`). The cache identity for `/v1` has no tenant and no uid (`router.js:571-573`), so any two principals that produce the same message array share inference results. Deterministic prompts make collisions plausible ("write a cover letter for a barista"), and personalized content can be replayed to a different account.

---

## 6. Reliability, logic and observability defects

Full prioritised list with fixes: `engine-findings.md`. Highlights:

### 6.1 Logic errors (all reproduced or code-proven)

| ID | Severity | Finding | Evidence |
|---|---|---|---|
| F-04 | **P1** | `selectionMode: "manual"` + a provider whose **model field is empty** (the common case; the admin UI treats model as optional) pins discovery to the literal string `"auto"`, matches no catalog entry, yields zero candidates, and returns **503** for *every* request. Setting an explicit model string fixes it. | `router.js:215-217` (pin = `providers[p].model \|\| candidate.model`), `:361` (`model = … \|\| 'auto'`), `:217` (`metadata.id !== pin → continue`). Live: `§A.7` (503 with an empty model pin) vs `§A.8` (502 once an explicit model was pinned — the request reached the provider, so routing no longer failed before dispatch) |
| F-08 | **P1** | Tenant BYOK is write-only (see §5.2, item 3) | `adminPlatformOperations.js:405-417`; `tenantAi.js:38`; `mysqlTenantRegistry.js:143-146` |
| F-09 | **P1** | Enterprise traffic is forced into the BYOK tier with platform keys, disabling metrics and cooldowns | `aiRuntime.js:1778-1789`; `router.js:258-262,483-485,685` |
| F-02 | **P1** | Cache has no principal/tenant component on `/v1` | `router.js:571-573`; `§A.2` |
| F-06 | **P1** | "quality" mode has no quality evidence | `selectionPolicy.js:23-37`; `§A.10` |
| F-07 | **P1** | Ranking uses a single last observation; stale latency wins/loses decisions | `router.js:224-225,415-423`; `§A.9` |
| F-15 | P2 | `publicAiSettings` defaults every `enable<Provider>` to **true** when omitted; a partial save silently re-enables all six legacy providers | `aiAdmin.js:81-83`; live: after one partial save `public_config.ai.enableNvidia/Gemini/Openrouter… = true` (`§A.11`) |
| F-16 | P2 | Admin `configuredProviders` = "has credential", so a **disabled** provider still reports `configured: true` | `aiAdmin.js:243-248`; observed for `groq` after disabling it |

### 6.2 Misalignments between layers

| Settings UI says | Engine does | Verdict |
|---|---|---|
| "Manual pin" | Honoured, but a **disabled** pin yields 503 with no fallback; a pinned provider that 500s yields 502 with no fallback; if the pinned provider is *unconfigured*, traffic is silently served by another provider while `mode` still says `manual` | Contract should be explicit; the UI copy cannot promise "we always use X" |
| "Quality" | Selects primary, no quality signal | Copy is misleading |
| Provider "disabled" | Skipped by freellmapi; skipped by aiRuntime only when its `enable<Provider>` is `false` — a **second toggle** lives in `public_config.ai` | Two sources of truth (`freellmConfig.js:98-99` vs `aiRuntime.js:1652`) |
| `enableFallback` toggle | Honoured (`modelSelector.js:57-63`, `buildCandidateList:379-381`) | Aligned |
| `ai_settings_v2_enabled=false` | **No engine effect at all**; only echoed in the admin payload | Rollback flag is UI-only (`aiAdmin.js:348-353`; no engine reference) |
| Quota limits | Enforced by middleware on `/api/ai*` **only**; `/v1` has none | F-01 |
| Tenant BYOK | Stored encrypted, never used | F-08 |

### 6.3 Reliability gaps

- **Metrics DB locked/unavailable:** persistence swallows the error and keeps serving; routing falls back to static order (`persistence.js:199-201`; `buildCandidateList` wraps reads in `try/catch` `:317-329`). Good.
- **`system_settings` unreachable mid-request:** `/v1` returns `503 AI_CONFIG_UNAVAILABLE` (`index.js:2797-2804`); product routes surface a controlled error. Bounded.
- **429 `Retry-After`:** honoured by the new engine (`orchestrator.js:47-49,276,303-321`), **ignored by the live engine** — `classifyError` discards headers (`openaiCompat.js:86-103`) and `setCooldown` uses its own 60 s base (`cooldown.js:81-115`). `F-12`.
- **5xx loops:** bounded (no same-provider retry in freellmapi; 1–2 attempts in aiRouting with a budget). Good.
- **Cooldown with a single provider:** no release valve → up to 300 s of hard 503s. `F-14`.
- **No operator cooldown reset:** `resetCooldowns()` exists (`freellmapi/index.js:143-146`) but no route calls it. `F-13`.

### 6.4 Observability

- **Routing decisions are not logged as decisions.** The live engine persists per-attempt rows (`request_log`) and exposes aggregates; the new engine keeps an in-memory `RoutingTelemetry` ring (`routingTelemetry.js:58-142`) that **no route exposes** (grep over `backend/index.js` and `backend/routes` returns nothing). `F-22`.
- **Tenant audit record is structurally empty:** `recordTenantAiUsageIfApplicable` reads `decisionId/executedModel/selectionLatencyMs/...` (`routes/ai.js:282-292`) but `generateWithProviders` returns only `{latencyMs, cached, fallbacksAttempted}` (`aiRuntime.js:1820-1826`) → the audit metadata persists `aiRouting: {executedModel: null}` with every other key undefined. `F-17`.
- **Failure context:** `fallbacks[]` carries provider, model, HTTP status, error code and latency (`§A.5`) — good — but the error **text** is forwarded to the client (`[openai] server error from alpha (HTTP 500)`), leaking internal ids. `F-20`.
- **Human-readable live state:** `GET /v1/status` (no auth, F-10) and `GET /api/freellmapi/metrics` (super-admin). There is **no** endpoint for aiRouting health/telemetry, and `GET /v1/status` is unauthenticated.

---

## 7. Warnings inventory (Section 6 of the brief)

Commands run at `5bd2570` + this branch, after `npm ci` in `frontend/` and `backend/`.

| Command | Result |
|---|---|
| `npm --prefix frontend run lint` (`oxlint`, project script) | **295 warnings, 0 errors**, 239 files scanned, 58 files with findings |
| `node_modules/.bin/eslint .` (repo flat config `eslint.config.js`) | **170 warnings, 0 errors**, 85 files |
| `npx tsc -b` in `frontend/` | **0 errors, 0 diagnostics** (exit 0) |
| backend lint | **no lint script exists**; `backend/package.json` has no linter dependency. Running `oxlint` with defaults over `backend/` gives 300 findings (193 `no-unused-vars`, 20 `no-control-regex`, 49 `unicorn/no-useless-fallback-in-spread`, …) — these are *not* project policy |
| `npx tsc --noEmit` in `backend/` | not applicable (no TypeScript, no tsconfig) |

### By rule

| Rule | ESLint (repo config) | oxlint (frontend script) |
|---|---|---|
| `no-unused-vars` | 100 | **291** |
| `react-refresh/only-export-components` | 44 | — |
| `no-useless-escape` | 17 | — |
| `react-hooks/exhaustive-deps` | 9 | — |
| `unicorn/*` (3 rules) | — | 3 |
| `no-constant-condition` | — | 1 |

### By category (as requested)

**(a) AI-engine files — must fix (9 ESLint / 46 oxlint-default findings)**
- `backend/services/aiRuntime.js` — 8 ESLint warnings (3 unused vars, 5 useless escapes).
- `backend/routes/adminPlatformOperations.js` — 1 unused var.
- Frontend AI surfaces: `src/components/enterprise/EnterpriseAiTab.tsx` — 8 unused imports/vars; `tests/freellmapi-admin-e2e.spec.ts` — 1 unused const.
- oxlint-default adds 4 `no-useless-fallback-in-spread` in `freellmapi/services/compression/index.js`, 3 in `aiAdmin.js`, 2 unused in `aiRouting/discoveryService.js`, 2 in `routes/ai.js`, 1 each in `modelDiscovery.js`, `aiGovernance.js`, `abuse.js`, `enterprise.js`.

**(b) Non-AI legacy — inventory + triage**
- Largest concentrations: `src/components/admin/AdminUsersTab.tsx` (15), `AdminSettingsTab.tsx` (14), `AdminModerationTab.tsx` (12), `AdminHelpDeskTab.tsx` (12), `src/pages/enterprise/console.tsx` (11), `AdminHealthTab.tsx` (10), plus `backend/index.js` (63 oxlint-default).
- Recommended: **fix** the 4 non-unused-var warnings (`unicorn/no-useless-fallback-in-spread`, `unicorn/prefer-string-starts-ends-with`, `unicorn/no-useless-spread`, `no-constant-condition`) because they can hide real mistakes; **fix** unused imports mechanically (codemod); **drop** (`// eslint-disable-next-line` with a reason) only for intentionally-exported fixtures and for `no-control-regex` in sanitizers, where the repo config already documents the decision (`eslint.config.js:17`).

**(c) Real (non-unused-var) warnings — each is a finding**
1. `unicorn/no-useless-fallback-in-spread` (1 frontend, 49 backend-default) — dead defensive code, no behavioural defect.
2. `unicorn/prefer-string-starts-ends-with` (1) — style.
3. `unicorn/no-useless-spread` (1) — style.
4. `eslint/no-constant-condition` (1) — **inspect**: could be a real loop bug; not in an AI file.
5. `react-hooks/exhaustive-deps` (9) — potential stale-closure bugs in admin/enterprise tabs (UI, previously frozen).
6. `no-useless-escape` (17) — regex hygiene; 5 in `aiRuntime.js` prompt/regex builders.

**Cost to reach "0 warnings":** 58 frontend files (mostly unused imports) + 85 ESLint-reported files, of which ~20 are legacy components with 1–15 findings each; engine-specific work is **13 files / 9 warnings** in the ESLint view (≈0.5–1 day). Full zero is ≈2–3 engineer-days of mechanical work plus a decision on `no-control-regex` (currently off by design).

---

## 8. Appendix A — live probe log

Environment: `NODE_ENV=development`, port 8080, MariaDB via `scripts/dev-db/mariadb-sandbox-bridge.mjs` (WASM 13.1.0), `TEST_AUTH_HMAC_SECRET=local-audit-secret-0123456789`, `FREELMAPI_API_KEYS=audit-platform-key-123`, `AI_ROUTING_DISCOVERY=false`, two OpenAI-compatible probe stubs at `:8791` (`alpha-model`) and `:8792` (`beta-model`). Release: `0.17.0-inprocess-74p`.

| ID | Probe | Result |
|---|---|---|
| A.1 | `POST /v1/chat/completions {"model":"auto"}` | 200; `provider: groq`, `model: beta-model`, `routing_decision: null` |
| A.2 | same body, second call with a **different** principal token | 200; `cached: true` → cross-principal cache hit |
| A.3 | write `public_config.ai = {provider:groq, selectionMode:auto}` → wait 12 s | 200; `routing_decision.mode = "auto"`, `qualityEvidence: "unknown"`; no restart |
| A.4 | set `ai_providers.groq.disabled = true` → wait 12 s | 200 served by `openai`; beta stub received no new call |
| A.5 | `selectionMode=auto`, primary `openai` returns 500 | 200 served by `groq`; `fallbacks[0] = {provider: openai, status: 500, code: PROVIDER_SERVER_ERROR, latencyMs: 10}` |
| A.6 | 3× `/v1` with a **USER** Firebase-style token | 502/503/503 (engine state), **not 401**; `ai_usage` rows 0 before and after |
| A.7 | `selectionMode=manual`, primary `groq`, groq disabled, `openaiModel` **empty** | **503 `AI_PROVIDER_UNAVAILABLE`** (bug F-04) |
| A.8 | after setting `openaiModel=alpha-model`: manual, pinned provider returns 500, secondary healthy | **502 `ALL_PROVIDERS_FAILED`**; secondary call count unchanged |
| A.9 | `selectionMode=speed`, groq slow (3 s), openai fast | first attempt: served groq (stale 4 ms observation) → 3.0 s; after both had fresh samples: served **openai** (8 ms) in 5 ms |
| A.10 | `selectionMode=quality`, same data | 200 in **3.08 s**, provider `groq`, `qualityEvidence: "unknown"` |
| A.11 | admin `POST /api/admin/ai-settings` (super-admin), then audit query | 200, `maskedKeys` last-4 only, audit row `AI_PROVIDER_SETTINGS_UPDATED` with revision + field names, **0** rows matching any test key via `LIKE`; a partial save wrote `enableNvidia/Gemini/Openrouter = true` |
| A.12 | SQL read of `system_settings.ai_providers` | `deepseek.apiKey = "sk-deepseek-audit-123456"` in clear text |
| A.13 | `GET /v1/status` with no credentials | 200 — version, provider counts, cooldown list, cache size, SQLite path |
| A.14 | `GET /api/admin/ai-settings` with a USER token | 403 `FORBIDDEN` (path policy) — access control holds |

Not probed live (marked static): enterprise tenant BYOK end-to-end (requires tenant provisioning + `ai.use`), quota ledger under enterprise load, and multi-instance config propagation. All related findings cite code.

## 9. Appendix B — test evidence

```
NODE_ENV=test node --test --test-concurrency=1 \
  test/ai-model-routing-selection.test.js test/ai-model-routing-health-fallback.test.js \
  test/ai-model-routing-discovery.test.js test/freellmapi-selection-policy.test.js \
  test/ai-model-routing-byok-tenant.test.js
# tests 55  pass 55  fail 0
```

These tests genuinely pin behaviour: deterministic ordering (`ai-model-routing-selection.test.js:244-275`), hard gates (`:122-188`), discovered-model demotion (`:276-297`), tenant cooldown + last-resort release (`:299-353`), tenant primary-model governance (`:377-391`), auto unpinning (`:425-...`). They test **policy C** — the engine that is not on the hot path. There is **no test that asserts mode `quality` prefers a better model**, because no such signal exists.

## 10. Rating and ship/hold

See `engine-rating.md`. Summary: **5.0/10 overall — HOLD.**

---

### Reproduction

```bash
# DB
node scripts/dev-db/mariadb-sandbox-bridge.mjs
# stubs (audit-only, outside the repo)
NAME=alpha PORT=8791 MODE=ok   node /tmp/probe/stub.mjs
NAME=beta  PORT=8792 MODE=ok DELAY=3000 node /tmp/probe/stub.mjs
# backend
cd backend && NODE_ENV=development PORT=8080 DB_HOST=127.0.0.1 DB_USER=root DB_NAME=ime365_sandbox \
  TEST_AUTH_HMAC_SECRET=local-audit-secret-0123456789 FREELMAPI_API_KEYS=audit-platform-key-123 \
  OPENAI_API_KEY=key-alpha-123456 OPENAI_BASE_URL=http://127.0.0.1:8791/v1 OPENAI_MODEL=alpha-model \
  GROQ_API_KEY=key-beta-123456   GROQ_BASE_URL=http://127.0.0.1:8792/v1   GROQ_MODEL=beta-model \
  node index.js
```
