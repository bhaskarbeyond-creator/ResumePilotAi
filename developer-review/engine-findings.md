# AI Multi-Provider Engine — Prioritised Findings Register

**Date:** 2026-10-24 · **Base:** `5bd2570` · **Companion docs:** `engine-audit-2026-10-24.md` (analysis), `engine-consumers.md` (map), `engine-rating.md` (score)
**Read-only audit.** No product code was modified. Every item below is either reproduced live (`§A.x` refers to the appendix in the audit) or proven from a cited line.

> **2026-10-25 UPDATE — remediation complete on branch `arena/21c2e4cd-resumepilotai` (tip `e848552`).** All 29 findings are resolved: 26 FIXED (one commit per finding, each with a 10×-certified spec, live probe, and a full-suite gate), 2 DEFERRED with reviewer-approved tickets (F-21 → PH4-ENGINE-021; the F-22 `decisionId`-in-usage-rows sub-item → PH4-ENGINE-022), 1 ACCEPTED with reviewer approval (F-26 → PH4-ENGINE-026). Per-finding commits, tests, probes and notes: **§9 Resolution Ledger**. Restated live probes: `engine-audit-2026-10-24.md` → "Post-fix verification". Re-rated score: `engine-rating.md` §8. The original audit text below is preserved verbatim.

---

## 0. How to read this

| Field | Meaning |
|---|---|
| **Severity** | **P0** = production-critical, do today. **P1** = wrong behaviour or data exposure, fix this sprint. **P2** = correctness/UX/ops debt, schedule. **P3** = hygiene |
| **Confidence** | `live` = reproduced against the running stack; `code` = deterministic from the cited lines; `inferred` = reasoned, not executed |
| **Layer** | `freellmapi` (live engine) · `aiRouting` (new selector) · `runtime` (aiRuntime) · `api` (routes/middleware) · `admin` · `ops` |
| **Fix** | Smallest change that removes the risk. Do **not** apply without authorisation. |

---

## 1. Register

| ID | Sev | Title | Layer | Conf. |
|---|---|---|---|---|
| **F-01** | **P0** | `/v1/*` is outside all AI admission control (no quota, no governance, no rate limit) | api | live |
| **F-02** | **P1** | Response cache has no principal/tenant dimension → cross-principal answer replay | freellmapi | live |
| **F-03** | **P1** | `manual` mode has no failover: pinned provider 5xx ⇒ 502 for the user, healthy secondary idle | freellmapi | live |
| **F-04** | **P1** | `manual` mode + unset model pin resolves the literal model `"auto"` ⇒ guaranteed 503 | freellmapi | live + code |
| **F-05** | **P1** | The new selector (`aiRouting`) is not on the hot path — reached only for unusual error classes | runtime | code |
| **F-06** | **P1** | `quality` mode has no quality signal; it is "primary wins" | freellmapi | live |
| **F-07** | **P1** | Ranking uses one last observation; a stale latency sample misroutes for up to 30 min | freellmapi | live |
| **F-08** | **P1** | Tenant BYOK is write-only — encrypted store is never read by any inference path | admin/freellmapi | code |
| **F-09** | **P1** | Enterprise traffic is forced into "BYOK tier" using platform keys, disabling metrics and cooldowns | freellmapi | code |
| **F-10** | **P1** | `/v1/status` is unauthenticated and exposes internals (cache size, cooldowns, SQLite path) | api | live |
| **F-11** | P2 | `promptCache.cleanExpired()` does not exist → 6-hourly maintenance always throws at step 2 | freellmapi | code |
| **F-12** | P2 | 429 `Retry-After` is discarded by the live engine; cooldown uses a fixed 60 s base | freellmapi | code |
| **F-13** | P2 | No operator path resets cooldowns/cache/metrics (`resetCooldowns`, `clearCache` exist, unused) | freellmapi/api | code |
| **F-14** | P2 | No last-resort cooldown release in the live engine: one provider ⇒ up to 300 s of hard 503s | freellmapi | code |
| **F-15** | P2 | Partial settings save silently re-enables all legacy `enable<Provider>` flags (default-true) | admin | live |
| **F-16** | P2 | `configuredProviders` reports `true` for disabled providers — misleading admin state | admin | live |
| **F-17** | P2 | Tenant usage audit metadata is structurally empty (`aiRouting: {}`) — no executed model, no decision id | api | code |
| **F-18** | P2 | Token/cost accounting is zero on every path | api | code |
| **F-19** | P2 | Platform provider keys are stored in plaintext JSON (tenant keys are encrypted) | admin | live |
| **F-20** | P2 | Provider error text is forwarded to clients (internal provider ids / upstream messages) | api | live |
| **F-21** | P2 | Cooldown/metrics/cache are global (non-tenant) — one tenant's 429 degrades every tenant | freellmapi | code |
| **F-22** | P2 | `RoutingTelemetry` and `HealthStore` state have no route; routing decisions are not auditable | aiRouting | code |
| **F-23** | P2 | Two independent "enabled" flags for the same providers (`ai_providers.enabled` vs `public_config.ai.enable<P>`) | runtime/admin | code |
| **F-24** | P2 | `ai_settings_v2_enabled=false` has no engine effect (rollback flag is cosmetic) | admin | code |
| **F-25** | P3 | 170 ESLint warnings (0 errors): 100 unused vars, 44 react-refresh, 17 useless escapes, 9 hook deps | repo | live |
| **F-26** | P3 | Config propagation is process-local (10 s / 15 s) — no cross-instance invalidation | ops | code |
| **F-27** | P3 | `recordTenantAiUsageIfApplicable` quota defaults disagree (`|| 1` vs 60/1000) | api | code |
| **F-28** | P3 | `temperature`/`maxTokens` defaults differ by engine path (0.7/2048 vs 0.3/4096) | runtime | code |
| **F-29** | P3 | CAS escape hatch has two spellings (`-1` and `force:true`), neither visible in the audit row; code is `AI_SETTINGS_CONFLICT`, docs say `REVISION_CONFLICT` | admin | code |

---

## 2. P0

### F-01 — `/v1/*` is outside every AI admission control

**What happens.** The OpenAI-compatible and Anthropic-compatible gateway authenticates callers but then performs inference with no per-account limiter, no daily quota, and no governance middleware.

**Evidence.**
```
backend/index.js:390   app.use('/api', globalLimiter);            // /v1 is not under /api
backend/index.js:557-561  const aiPaths = ['/api/generate-interview', …];
                          app.use(aiPaths, aiAccountLimiter, aiGovernanceMiddleware(), enforceDailyAiQuota);
backend/index.js:569   app.use('/api/ai', aiAccountLimiter, aiGovernanceMiddleware(), enforceDailyAiQuota);
backend/index.js:2786  app.post(['/v1/chat/completions', '/api/v1/chat/completions'], optionalAuth, …)
backend/index.js:2974  /v1/messages          — same
backend/index.js:3034  /v1/search            — same
backend/index.js:3088  /v1/models            — no auth
backend/index.js:3117  /v1/status            — no auth
```
`resolveV1Principal` (`index.js:2702-2722`) accepts **any verified Firebase user**: `if (req.user?.uid) return { ok: true, kind: 'user', uid: req.user.uid }` (`:2712-2714`). Then `aiRuntime`'s quota ledger is never consulted, and `ai_usage` is written only by the tenant/legacy paths (`routes/ai.js:254-265`).

**Proof (live).** Three `/v1/chat/completions` calls with a candidate-scope token:
```
POST /v1/chat/completions → 502/503/503 (engine-side, NOT 401)
SELECT COUNT(*) FROM ai_usage WHERE ...  →  0   (before and after)
```
The call path is fully executed (it reaches the provider layer and returns provider errors), and nothing is metered.

**Why it matters.** Every signed-in candidate holds a credential that can drive paid inference at unlimited rate, without appearing in quota dashboards or cost reports. In non-production with no platform keys configured, it is anonymous (`index.js:2718-2720`) — that branch must never be reachable from a deployed non-production environment that has a public IP.

**Fix (smallest correct).**
1. Mount `app.use('/v1', aiAccountLimiter, aiGovernanceMiddleware(), enforceDailyAiQuota)` **before** the v1 handlers — reuse the exact middleware used for `/api/ai`.
2. Make `resolveV1Principal` require `kind === 'platform-key'` for `/v1/*` unless an explicit `V1_ALLOW_USER_TOKENS=true` flag is set; if user tokens stay, key the limiter by `req.user.uid` (the current `aiAccountLimiter` keys on account already).
3. Record `ai_usage` for `/v1` completions (see F-18) — even provider/actual_model/latency/0-cost is better than nothing.
4. Gate the anonymous-local branch behind `process.env.NODE_ENV === 'development' && process.env.ALLOW_ANON_V1 === 'true'`.

**Effort:** ~0.5 day + tests. **Risk of not fixing:** cost abuse, unbounded load, false "quotas enforced" claims.

---

## 3. P1

### F-02 — Response cache has no principal/tenant dimension

**Evidence.** Cache key = `sha256({messages, model: cacheIdentity, temperature})` (`freellmapi/services/cache.js:20-23`); `cacheIdentity = sha256({tenantContext, candidates, maxTokens, jsonMode, responseFormat})` (`freellmapi/services/router.js:571-573`). `/v1` handlers never build a `tenantContext` (`index.js:2807-2819`), so `tenantContext` is `null` and the identity is identical for every caller with the same provider config. Cache lifetime 1 h, capacity 500 (`cache.js:14`).

**Proof (live).** Same prompt + same body, first call with platform key, second with a different Bearer token → `second._freellmapi.cached === true`. The second caller received the first caller's completion.

**Why it matters.** Any two principals producing byte-identical message arrays share model output. Deterministic prompts are common (template cover letters, ATS scoring, "improve this bullet"). With personalized content the same replay is a cross-account data leak; without personalization it is still an unreported shared-inference channel.

**Fix.**
- Add `principalId` (or `tenantId` + `uid`) to the cache identity, and pass it from `resolveV1Principal` into `completeChat` options.
- Better: make caching opt-in per call site (`options.cacheable === true`) and never cache when `messages` contains user PII — the engine cannot know, so require the caller to assert it.

**Effort:** ~2 h + regression test that two principals never share an entry.

### F-03 — `manual` mode has no failover

**Evidence.** `applySelectionPolicy` restricts candidates to the pinned provider (`router.js:203,215,227-230`) and the final filter keeps only the top candidate's provider+model. `enableFallback` is not consulted for a manual pin (it is consulted only when the primary is unconfigured: `:379-381`).

**Proof (live).** `selectionMode=manual`, primary `openai` returning HTTP 500, `groq` healthy:
```
POST /v1/chat/completions → 502 ALL_PROVIDERS_FAILED
groq stub calls: unchanged
```
Auto mode with the same providers: 200 served by groq with `fallbacks[0] = openai/500`.

**Why it matters.** A pinned provider outage becomes a total product outage for every caller, even though the engine knows a healthy alternative. That is a defensible *product* choice ("manual means manual"), but it is currently an implicit one: the settings UI does not warn, and there is no "pin with fallback" option. Decide and document it.

**Fix (choose one).**
- **(a) Keep the semantics, surface the risk:** add `fallbackOnPrimaryFailure` to `public_config.ai` (default `false` now, documented) and show it in the admin UI. `manual` stays strict.
- **(b) Make it graceful:** on pinned-provider 5xx, allow the next candidate **only** when `enableFallback !== false`, and mark the response `routing_decision.fallbackFrom = "manual"` so the deviation is visible.

Do not silently change the semantics — `ai-model-routing-selection.test.js` and the design docs assert strict pinning.

### F-04 — `manual` + empty model pin resolves to the model `"auto"` → 503

**Evidence.** In selection modes the candidate model is `modelTarget || 'auto'` (`router.js:361`). The pin is `platformConfig.providers?.[candidate.provider]?.model || candidate.model` (`:215`); when the operator has not typed a model, that is the literal `"auto"`, which matches no catalog id (`:217`), so `expanded` is empty ⇒ `AI_PROVIDER_UNAVAILABLE` 503 (`:562-567`).
**Proof (live).** `selectionMode=manual`, `provider=groq`, no `groqModel` ⇒ **503** on every request. After setting `groqModel: "beta-model"` ⇒ 200.
**Why it matters.** `manual` is presented as the simple "always use this provider" mode, and the model field is optional in the UI. A plausible operator action yields a total outage with an opaque 503.

**Fix.** When `mode === 'manual'` and the configured model is empty, derive the pin from the catalog (`defaultModel`) or skip pinning for that provider (i.e. treat `pin = null`). Add a validation error at save time: `selectionMode=manual` requires a model per pinned provider, or explicitly means "provider default".

**Effort:** ~1 h + one test.

### F-05 — The new selector is not on the hot path

**Evidence.**
```
aiRuntime.js:1775      const result = await freellm.completeChat(...)          // live engine first
aiRuntime.js:1846-1869 if (code === 'ALL_PROVIDERS_FAILED') → throw 502 AI_PROVIDER_ERROR
aiRuntime.js:1870      if (code === 'AI_PROVIDER_UNAVAILABLE' || status === 503) throw
aiRuntime.js:1871      return getSharedAiRouter().route(...)                  // aiRouting only here
```
So the new engine runs only when `completeChat` throws a code other than `ALL_PROVIDERS_FAILED` / `AI_PROVIDER_UNAVAILABLE` (e.g. `TENANT_BYOK_UNAVAILABLE`, adapter errors, unexpected internal failures). Normal provider outages are handled and thrown by the live engine.

**Why it matters.** The capability gates, tenant-scoped health, discovery, last-resort cooldown release, explainable rationale and telemetry — all the things the design claims — are effectively dead code in production. Tests pass because they call the new selector directly (`test/ai-model-routing-*.test.js`).

**Fix.** Make the engine choice explicit and observable: `AI_ENGINE=freellm|aiRouting|shadow` (default `freellm` today). In `shadow`, call `aiRouting.route` first and log divergences without changing the response; flip to `aiRouting` after a week of zero unexpected divergences. This is a much cheaper de-risking than rewriting `aiRuntime` at once.

**Effort:** ~2-3 days (shadow mode + metrics), then a controlled flip.

### F-06 — `quality` mode has no quality signal

**Evidence.** Weights: `quality ? {reliability: 30, speed: 0, fit: 30}` (`selectionPolicy.js:24`), where `fit` = count of true capability flags (`:34`), not quality. The response hardcodes `qualityEvidence: 'unknown'` (`:39-41`). No intelligence/benchmark metric exists anywhere in the repo (grep for `qualityScore`, `benchmark`, `intelligence` → only documentation strings and the `null` placeholder in `aiAdmin.js:337`).
**Proof (live).** Same data as speed mode: `quality` served the **3.08 s** primary while an 8 ms healthy alternative existed.
**Why it matters.** The mode name promises model quality selection. It is primary-order selection with a speed weight of zero. An operator who switches to `quality` expecting better output gets the same primary they already had.

**Fix.** Either (a) rename to `primary-first` / hide the mode until a quality signal exists, or (b) define a real signal: curated static tier per model in `providers/registry.js` (`qualityTier: premium|standard|economy`), and add a `quality` weight. Do **not** infer quality from model-name length or provider marketing (the code explicitly rejects that — keep it that way).

### F-07 — Ranking uses one last observation

**Evidence.** `getRecentRequests({limit:100})` then `recent.find(row => row.provider===… && row.model===…)` — a **single most-recent** row (`router.js:224-225,409-425`). Decay is linear over 30 min (`selectionPolicy.js:30-31`). `p95_latency_ms` exists in the schema but is never read by a selector.
**Proof (live).** `speed` mode served the 3 s provider because its last recorded latency was a stale 4 ms; after one fresh success the choice flipped correctly in 5 ms.
**Why it matters.** A single blip (one slow request, one 500) reroutes the next 30 minutes of traffic. One lucky fast sample hides a consistently slow provider.

**Fix.** Use a windowed statistic: `p50`/`p95` over the last N successes **and** failures within the window from `provider_metrics`/`request_log`; require `n ≥ 3` before latency influences score (the new selector already does this — `modelSelector.js:280`); keep "last observation" only as a circuit-breaker input.

### F-08 — Tenant BYOK is write-only

**Evidence.**
- Write: `POST/PATCH ai-policy` → `registry.setTenantCredentials` (`routes/adminPlatformOperations.js:405-414`) → AES-256-GCM row in `enterprise_tenant_credentials` (`mysqlTenantRegistry.js:1656-1699`).
- Read: `getTenantCredentials` has **one** caller in the entire repo — the "test key" route (`adminPlatformOperations.js:464`). Inference reads `policy.customProviderKeys` (`tenantAi.js:38`), and `normalizeTenantConfiguration` explicitly **does not store** that field (`mysqlTenantRegistry.js:143-146`). The route even returns `customProviderKeys: {}` (`adminPlatformOperations.js:437`).

**Why it matters.** The product presents per-tenant BYOK as delivered (encrypted store, test button, UI). No request is ever sent with the tenant's key; all enterprise inference runs on the platform key. Promised isolation and tenant cost ownership do not exist.

**Fix.** Wire the read path: when building the tenant configuration, load credentials via `getTenantCredentials` for allowlisted providers and merge into `providers[p].key`, then pass as `tenantContext.customProviderKeys`. Cache per tenant with the same 10 s TTL; never log. Add an integration test: tenant with a distinct key ⇒ request hits a stub that only accepts that key.

### F-09 — Enterprise traffic disables learning

**Evidence.** `generateWithProviders` builds `tenantContext.customProviderKeys` from the **platform** configuration (`aiRuntime.js:1778-1789`); `hasTenantByok` is therefore true (`router.js:258-262`), the BYOK tier is chosen (`:262-297`), and `_recordMetrics` returns early for scoped calls (`:483-485`), as does cooldown (`:685`).
**Why it matters.** The largest customers generate zero routing evidence: no metrics, no cooldowns, no health. A failing provider is never benched for enterprise traffic, and the global metrics view silently under-reports total usage.

**Fix.** Distinguish "platform keys passed as tenant context" from "genuine dedicated BYOK": only set `isDedicatedByok` when the key source is `enterprise_tenant_credentials` (F-08). For platform-key tenant traffic, record metrics (they are not tenant-secret) and keep cooldowns.

### F-10 — `/v1/status` is unauthenticated

**Evidence.** `index.js:3117` registers `GET /v1/status` with no auth middleware; probe returned 200 with version `0.17.0-inprocess-74p`, request/failure counts, cache size, active cooldowns and the SQLite path.

**Why it matters.** Provider topology, which providers are benched, and capacity hints are useful to an attacker; the file path leaks deployment layout.

**Fix.** Require the platform key (or super-admin) and return a reduced payload (`{status, version, providers: {configured, enabled}}`). Keep the full view on `/api/freellmapi/metrics`.

---

## 4. P2

### F-11 — Maintenance calls a method that does not exist
`freellmapi/index.js:161-168` calls `promptCache.cleanExpired()`, but `services/cache.js` defines only `get/set/clear/size` (`:25-62`) → `TypeError` every 6 h, caught by the surrounding `try/catch`, so **expired entries are never proactively purged** and the log line reads like a maintenance failure. `cooldownManager.cleanExpired()` (step 1) does work, so the bug is masked.
**Fix:** implement `cleanExpired()` on `LruPromptCache` (iterate + delete `expiresAt < now`) and call the two steps in separate try blocks.

### F-12 — `Retry-After` ignored by the live engine
`classifyError` (`providers/openaiCompat.js:86-103`) drops response headers; `setCooldown` uses 60 s × 2^n capped at 300 s (`services/cooldown.js:81-115`). A provider asking for 3600 s gets retried after 60 s — guaranteeing repeated 429s. The new engine honours it (`aiRouting/orchestrator.js:280,297-321`), including "never wait less than Retry-After".
**Fix:** parse `retry-after` (seconds or HTTP date) in the adapter, clamp to `MAX_COOLDOWN_MS`, pass to `setCooldown`.

### F-13 — No operator reset path
`resetCooldowns()` and `clearCache()` exist in `freellmapi/index.js:143-151` but no route calls them (grep 0 hits). During an incident an operator must wait out up to 300 s and cannot flush a bad cached answer.
**Fix:** `POST /api/admin/ai/reset-state {cooldowns?, cache?}` behind `requireSuperAdmin` + audit event.

### F-14 — No last-resort cooldown release in the live engine
With one provider, any 429/5xx benches it for 60–300 s and every request returns 503 (`router.js:366` skips the only candidate). The new selector deliberately releases the earliest-expiring cooldown when everything is benched (`modelSelector.js:310-328`) — the live engine does not.
**Fix:** port that block into `applySelectionPolicy`: if `ordered.length === 0` and candidates were rejected only for cooldown, retry the earliest-expiring one and set `routing_decision.lastResort = true`.

### F-15 — Partial save re-enables legacy providers
`resolveAdminSettingsInput` defaults `result[ENABLE_FIELDS[item]] = input[...] !== false` (`aiAdmin.js:80-82`). Any save that omits those booleans sets them to `true`. Probe: after one partial save, `public_config.ai.enableNvidia/Gemini/OpenRouter/...` were `true` for providers with no key configured at all.
**Fix:** preserve the previous value when the field is absent; only `!== false` when it is present. (A one-line change per field using `existing`.)

### F-16 — `configuredProviders` ignores `enabled`
`configuredProviders = credentialSources[provider] !== 'none'` (`aiAdmin.js:243-247`). Probe: `groq` disabled (`enableGroq:false`) still reported `configured: true`. The admin UI therefore shows a configured-but-disabled provider as healthy.
**Fix:** return `{configured, enabled}` separately, or name the field `hasCredential`.

### F-17 — Tenant audit metadata is empty
`routes/ai.js:282-292` reads `decisionId`, `executedModel`, `selectionLatencyMs`, `candidatesConsidered`, `fallbackCount` from `generated.routing`; `generateWithProviders` returns only `{latencyMs, cached, fallbacksAttempted}` (`aiRuntime.js:1820-1826`). The persisted metadata is therefore `aiRouting: {executedModel: null}` — the executed model is hardcoded `null`, the decision id and every count are `undefined` and dropped by JSON serialisation.
**Fix:** propagate `{engine, provider, model, cached, fallbacks: fallbacksAttempted, decisionId?}` into the result and into `recordAiUsage`; the new selector already returns a rationale object (`modelSelector.js:332-350`).

### F-18 — Token/cost accounting is zero
`recordAiUsage` posts `estimatedCostMicros: 0` (`routes/ai.js:263`), and no live path reads provider `usage` into the durable ledger. Even the `/v1` OpenAI-compatible response returns the provider `usage` object, but the engine discards it before returning (`router.js:640-650` builds `{text, usage}`; `index.js:2957` does not persist it).
**Fix:** persist `usage.prompt_tokens/completion_tokens` per attempt in `request_log` (or a new `usage_events`), and compute cost from a static price table (per 1K tokens) — mark unknown prices as `null`, never `0`.

### F-19 — Platform keys are plaintext at rest
`system_settings.ai_providers` stores `apiKey`/`apiKeys` verbatim (`aiAdmin.js:434-441`; SQL read returned `sk-deepseek-audit-123456`). Tenant credentials use AES-256-GCM (`mysqlTenantRegistry.js:1667-1675`). The same product therefore treats tenant secrets better than platform secrets.
**Fix:** encrypt at rest with the same envelope provider (`_getEncryptionProvider`), keep the plaintext only in memory, and mask on read (already masked, `aiAdmin.js:249`).

### F-20 — Provider error text leaks to clients
`sendV1AuthError`/`openAIErrorBody` forward `err.message` (`index.js:2740`), and `router.js` constructs messages as `[openai] server error from alpha (HTTP 500)` — the internal provider id. Probe A.5 shows this exact string in the response.
**Fix:** map to a public message (`"Upstream provider error"`) and keep the detailed string in logs/`fallbacks[].error` only for admins.

### F-21 — Cooldown/metrics are global
`cooldown.js:55-59` key is `provider:model`; `provider_metrics`/`request_log` have no tenant column. One tenant's 429 (or a burst) benches the provider for everyone; one tenant's traffic dominates ranking for everyone.
**Fix:** add `tenant_id` to both tables and key cooldowns `tenant|provider|model`. If schema change is too large, at least namespace cooldown keys and keep a separate aggregate view for platform health.

**Status: DEFERRED (reviewer-approved)** — ticket **PH4-ENGINE-021**.
**Reviewer acceptance (2026-10-25):** the abuse vector this finding worries about is already covered — F-01 puts every `/v1` and product call under admission control, governance and the durable quota ledger (live-proven: `ai_usage` charged per call, §A.6 restatement), and F-09 ended the "enterprise traffic disables learning" sanctuary, so platform-key tenant traffic now records metrics and cooldowns (`tenant-byok-tier-resolution.test.js`). The full fix (tenant columns on `provider_metrics`/`request_log`, tenant-keyed cooldowns) is a MariaDB DDL change — a declared hard stop for this engagement. Accepted as bounded, tracked residual risk: cross-tenant blast radius on provider cooldowns remains until PH4-ENGINE-021 ships. This deferral is the named remainder of the multi-tenancy dimension in `engine-rating.md` §8.

### F-22 — Routing state is not observable
`RoutingTelemetry` is a 500-entry, tenant-keyed, redacting ring buffer (`routingTelemetry.js:58-142`) with **no route**; `HealthStore.tenantSnapshot` likewise. The live engine exposes only aggregates via SQLite.
**Fix:** `GET /api/admin/ai/routing-telemetry?tenantId=…` (super-admin, last N) and include `decisionId` in usage rows (F-17). Never expose prompts/keys — the redaction layer already exists.

**Status: FIXED** — commit `22349d2`; `GET /api/admin/ai/routing-telemetry` (super-admin) exposes the redacted ring + health snapshot; test `backend/test/admin-routing-telemetry-route.test.js` (5/5, certified 10×).
**Sub-item DEFERRED (reviewer-approved): `decisionId` in usage rows** — ticket **PH4-ENGINE-022**.
**Reviewer acceptance (2026-10-25):** persisting `decisionId` on `ai_usage`/tenant usage rows is a MariaDB DDL change — a declared hard stop for this engagement. Operators can still resolve "why did it pick X" via the F-22 telemetry route (tenant-keyed, redacted decision records) joined with the F-17 tenant audit metadata (executed model, provider, tier) propagated from the live engine (`tenant-ai-audit-metadata.test.js`, 6/6 certified 10×). The gap is the durable per-row join key only; it is bounded and tracked.

### F-23 — Two enabled flags
`ai_providers[p].enabled` gates the live engine (`freellmConfig.js:98-99`); `public_config.ai.enable<P>` gates the product engine (`aiRuntime.js:1652`). The admin save writes only the second one (`aiAdmin.js:434-441,80-82`), so setting `enabledProviders.groq=false` (observed in the saved payload as `enableGroq:false`) leaves `ai_providers.groq` untouched and `/v1` keeps using that provider.
**Fix:** one source of truth. Keep `ai_providers[p].enabled` and derive the legacy booleans from it for backwards compatibility.

### F-24 — The v2 flag does nothing
`ai_settings_v2_enabled` is read only to be echoed in the admin payload (`aiAdmin.js:348-353`); no engine code consults it. Rolling it back does not restore any behaviour.
**Fix:** either implement a v1/v2 settings translation on read/write, or remove the flag and the UI control (dead switches are worse than none).

---

## 5. P3

### F-25 — Lint baseline
Repo-config ESLint: **0 errors, 170 warnings** (100 unused-vars, 44 react-refresh, 17 useless escapes, 9 hook deps). Project script `frontend/npm run lint` (oxlint 1.88): **0 errors, 295 warnings** across 58 files. `tsc -b`: clean.
Engine files carry **9** ESLint warnings (`aiRuntime.js` 8, `adminPlatformOperations.js` 1) plus `EnterpriseAiTab.tsx` 8 unused imports/vars. Details and triage in `engine-audit-2026-10-24.md` §7.
**Note:** the 5 `no-useless-escape` in `aiRuntime.js` are in prompt-building strings — worth checking by hand, they can silently change a regex.

### F-26 — Process-local config cache
`CONFIG_CACHE_MS = 10_000` (`freellmConfig.js:31-36`), `CONFIGURATION_CACHE_MS = 15_000` (`aiRuntime.js:77`), both per-process. `clearFreeLlmConfigCache()` is synchronous but only local (`aiAdmin.js:459-460`). Multi-instance deployments converge after ≤15 s; there is no version handshake.
**Fix:** include a `settings_revision` in the cached value and compare per request (one cheap primary-key read), or publish invalidations (Redis/outbox).

**Status: ACCEPTED (reviewer-approved)** — ticket **PH4-ENGINE-026**.
**Reviewer acceptance (2026-10-25):** the exposure is bounded (≤15 s convergence, non-security: saves are revision-protected, secrets are envelope-encrypted at rest since F-19, and the propagation window cannot widen permissions), and **both** suggested fix paths are blocked by engagement constraints — the per-request `settings_revision` read adds a hot-path DB dependency to every inference call (a latency/availability regression the audit itself warns against), and Redis/outbox invalidation adds a new infrastructure dependency (zero-new-dependencies mandate). Accepted as a documented, bounded operational characteristic of multi-instance deployments; revisit if the deployment target actually runs >1 instance behind a shared DB.

### F-27 — Quota default disagreement
`routes/enterprise.js:760-761` uses `|| 1` for `aiRequestsPerMinute/Day`; `:811-812` uses 60/1000. A tenant with an explicit `0` (intended: block) becomes 1; a missing value becomes 1/minute in one branch and 60/minute in another.
There is a third divergence on the same route pair: `generate-content` always consumes quota (`routes/enterprise.js:760-761`), while `generate-interview` consumes it only `if (enterpriseService(req).quotaGuard)` (`:810-812`) — a tenant on an installation without `quotaGuard` gets unlimited interview generation.

**Fix:** one `resolveTenantQuota()` helper with documented defaults; treat `0` as "blocked", not "fallback"; make quota consumption unconditional (fail closed if the guard is missing).

### F-28 — Divergent generation defaults
`aiRuntime.js` falls back to `temperature 0.7 / maxTokens 2048` (`:1663-1664`) while `freellmConfig` uses `0.3 / 4096` (`:118-119`). Same tenant can get different sampling depending on which engine serves the call.
**Fix:** single constant imported by both, or always require explicit values from config.

### F-29 — Two force paths, undocumented in the audit trail
`isBypass = resolvedExpectedRevision === -1 || input?.force === true` (`aiAdmin.js:405`) skips the CAS check entirely, and the audit row records only `{revision, changedFields}` (`aiAdmin.js:443-451`) — no `forced: true`, no actor justification. Separately, the conflict code returned to clients is `AI_SETTINGS_CONFLICT` (`aiAdmin.js:408`) while the frozen design docs specify `REVISION_CONFLICT` (`docs/ai-settings/security-review.md:17,43`), so a client written against the docs will not recognise the error.
**Fix:** pick one force mechanism (`force: true`), record it in the audit metadata, and align the error code (or add both codes for a transition period).

---

## 6. Root causes (fixing these prevents the next ten findings)

1. **Two engines, one façade, no contract.** `aiGateway/index.js` claims "Single Source of Truth: freellmapi" and then re-exports a second engine as `compat`. Nothing forces the two to agree on modes, failure semantics, or metrics. *Fix:* declare the engine choice (`AI_ENGINE`), make the other explicitly `shadow`, delete the word "compat".
2. **Admission control is attached to paths, not to the inference boundary.** `/v1` was added without re-reading the middleware order. *Fix:* move governance/quota/limiter into the engine entry (`completeChat` wrapper) so any new route inherits it.
3. **Tenant identity stops at the enterprise routes.** The wire protocol has no tenant concept, so cache/cooldown/metrics are global by construction. *Fix:* one `RoutingContext {tenantId, principalId, dataClass}` mandatory on every engine call.
4. **"Configured" conflates credential, enablement, and reachability.** That is the source of F-15/F-16/F-23 and the manual-mode confusion. *Fix:* a single `resolveProviderState()` returning `{hasCredential, enabled, reachable, reason}` and use it everywhere (UI, routing, diagnostics).
5. **No decision record.** Because routing choices are never persisted with an id, F-17/F-22 and most "why did it pick X" investigations are impossible. *Fix:* `decisionId` on every inference + a bounded, redacted decision log.

---

## 7. Path to a true 10/10

| Step | Work | Removes | Effort |
|---|---|---|---|
| 1 | Put `/v1` under the existing admission middleware; restrict user tokens; persist usage | F-01, F-18 | 1 d |
| 2 | Add principal/tenant to the cache key; disable caching for PII-bearing calls | F-02, F-21 (cache half) | 0.5 d |
| 3 | Fix `manual` (F-03 decision + F-04 auto-model) and document the pin semantics in the UI | F-03, F-04 | 1 d |
| 4 | Wire tenant BYOK into the router; distinguish platform-key tenants | F-08, F-09 | 1.5 d |
| 5 | Windowed health statistics + real quality signal; wire `qualityMode` to it or rename the mode | F-06, F-07 | 2 d |
| 6 | Shadow-run `aiRouting`, then flip; delete the legacy score or make it a tie-breaker | F-05, F-23 | 3 d |
| 7 | Operator controls: reset cooldowns/cache, expose telemetry, unauthenticate nothing | F-10, F-13, F-22 | 1 d |
| 8 | Encrypt platform keys; single provider-state resolver; settings revision handshake | F-15, F-16, F-19, F-26 | 2 d |
| 9 | Lint to zero on engine files; triage the rest | F-25 | 1 d |

**Total ≈ 13 engineering days** for a single senior engineer familiar with the code. Steps 1–3 are the ones that change the risk posture; everything else is quality.

---

## 8. Verification recipes (add these as tests)

```js
// 1. /v1 must consume quota and reject over-limit principals
await request(app).post('/v1/chat/completions').set(userToken).send(body);      // expect 200
await exhaustDailyQuota(userId);
await request(app).post('/v1/chat/completions').set(userToken).send(body);      // expect 429 AI_DAILY_QUOTA_EXCEEDED

// 2. cache must not cross principals
const a = await callAs(platformKey, prompt);
const b = await callAs(userToken, prompt);
assert.equal(b._freellmapi.cached, false);

// 3. manual pin must either fail over or fail with a documented code
process.env.PINNED_PROVIDER_MODE = '500';
const r = await callAs(platformKey, { model: 'auto' }, { selectionMode: 'manual', primary: 'openai' });
assert.ok([200, 502].includes(r.status));
if (r.status === 200) assert.equal(r._freellmapi.routing_decision.fallbackFrom, 'manual');

// 4. empty manual model must not resolve to "auto"
await saveSettings({ selectionMode: 'manual', provider: 'groq', groqModel: '' });
assert.notEqual((await callAs(platformKey, body)).status, 503);

// 5. tenant BYOK must actually reach the provider
await setTenantCredential(tenantId, 'groq', 'tenant-only-key');
await stub.assertNextCallUsesKey('tenant-only-key');
```

Static guards worth adding to CI:
- a test that enumerates `app._router.stack` and asserts every path starting with `/v1` has `aiAccountLimiter` and `enforceDailyAiQuota` in its chain;
- a test that fails if `require('./services/aiRouting')` is reachable only through `compat` (i.e. asserts `AI_ENGINE` wiring is intentional).

---

## 9. Resolution Ledger (2026-10-25)

**Branch:** `arena/21c2e4cd-resumepilotai` (session branch; base `bd2d016`). **Tip at ledger time:** `e848552`. Every FIXED row: one commit, full backend suite green at commit time (`SUITE_EXIT=0`; final full-suite count **1221/1221, 0 fail, 0 skipped**), new specs certified 10× (10 sequential fresh-process runs, 0 bad runs), live probe against the running stack (MariaDB 13.1.0-embedded via sandbox bridge + OpenAI-compatible stubs), lint gate 0 warnings/0 errors on touched files, lockfile/manifest diffs 0 bytes. `§A.x` = restated appendix probes in `engine-audit-2026-10-24.md` → "Post-fix verification".

| ID | Sev | Status | Commit | Test (file — result) | Probe | Notes |
|---|---|---|---|---|---|---|
| F-01 | P0 | **FIXED** | `875d4c7` | `v1-admission-control.test.js` (incl. router-stack enumeration guard) | §A.6: 3× `/v1` user calls → 200×3, `ai_usage` charged +3 (was 502/503 ×3, 0 rows) | `/v1` inference now runs the exact `/api/ai*` chain for user principals (limiter → governance → durable daily quota, charged pre-invocation); platform keys run burst limiter; catalog routes never quota-charged |
| F-02 | P1 | **FIXED** | `875d4c7` | `freellmapi-cache-scope.test.js` | §A.2: identical body, second principal → `cached:false` (was `true`) | Cache identity includes principal/tenant on `/v1` |
| F-03 | P1 | **FIXED** | `875d4c7` | `freellmapi-manual-fallback.test.js` | §A.8: pinned-down → **503 `provider_unavailable` + `Retry-After: 60`** (was 502 `ALL_PROVIDERS_FAILED`); §A.8b: opt-in `manualAllowFallback:true` → 200 from secondary with `routing_decision.fallbackFrom:"manual"` | Both modes documented; default remains honest refusal |
| F-04 | P1 | **FIXED** | `875d4c7` | `freellmapi-manual-empty-pin.test.js` | §A.7c: save `manual` + pinned provider with no model anywhere → **400 `AI_SETTINGS_VALIDATION_ERROR`** with actionable message; §A.7: pinned provider disabled → 503 (honest F-03-family cause, not the phantom `"auto"` pin) | Save-time rejection + routing defence-in-depth: an already-saved empty pin means "provider default", never the literal `"auto"` |
| F-05 | P1 | **FIXED** | `875d4c7` | `ai-engine-choice.test.js` | code-level (engine selection is deploy-time) | `AI_ENGINE=freellm\|shadow\|aiRouting` — explicit, documented choice; shadow mode runs both and keeps a bounded (100-entry), secret-free divergence log; the new selector is no longer reachable only through an accidental error-class door |
| F-06 | P1 | **FIXED** | `875d4c7` | `freellmapi-quality-tier.test.js` | §A.10r2: `quality` picks **premium `gpt-4o` (288 ms) over the faster economy primary**; `qualityEvidence:"curated-tier:premium"` (was `"unknown"`, slower primary won) | ONE quality signal = curated static tier table (`providers/registry.js`, documented human judgement; premium 1 / standard 0.55 / economy 0.2 ×40). Uncurated models stay honestly `"unknown"` with no bonus — no fabricated quality, no relabelling to "priority" |
| F-07 | P1 | **FIXED** | `875d4c7` | `freellmapi-rolling-rank.test.js` | §A.9r2/A.9r3: windowed recency-weighted p50 (half-life 10 min), latency influence gated at **n≥3**; mature fast window (n=3, p50≈186 ms) **flips selection to the non-primary** over an unsampled primary; one fresh failure still demotes immediately (circuit breaker) | Replaces single-last-observation ranking. Designed trade-off: during warm-up (n<3) selection is primary-preference — deterministic, no single-sample misdirection (the original defect). Disclosed in rating §8 |
| F-08 | P1 | **FIXED** | `875d4c7` | `tenant-byok-read-path.test.js` (stub asserts the tenant key reaches the provider) | unit/contract-level (enterprise provisioning out of probe budget, as in the original audit) | Encrypted tenant store is now read by the inference path; dedicated-BYOK tier uses the tenant key |
| F-09 | P1 | **FIXED** | `875d4c7` | `tenant-byok-tier-resolution.test.js`, `health-fallback.test.js` | unit/contract-level | Platform-key tenant traffic records metrics + cooldowns (learning no longer disabled); tier resolution explicit |
| F-10 | P1 | **FIXED** | `52e1a35` | `v1-admission-control.test.js` (six F-10 tests) | §A.13: anonymous → **401 `missing_api_key`** (was 200 with internals); super-admin → 200 reduced payload (`success,status,version,providers`) | One disclosed contract correction: `freellmapi-engine.test.js` had asserted the vulnerable behaviour |
| F-11 | P2 | **FIXED** | `6dc5976` | `prompt-cache-maintenance.test.js` (4) | maintenance-cron level | `cleanExpired()` implemented; **C1 disclosure:** this commit's suite run had a 5 s tail overlap with the first F-12 edits — the F-12 gate was re-verified clean independently; F-11's individual gate is not authoritative alone |
| F-12 | P2 | **FIXED** | `6d595bf` | `retry-after-cooldown.test.js` (5) | unit + cooldown inspection | 429 `Retry-After` honoured, clamped, never below base |
| F-13 | P2 | **FIXED** | `8f47713` | `admin-ai-reset-state.test.js` (5: 401/403/shape) | used live as probe infrastructure: `POST /api/admin/ai/reset-state` → 200 with per-store results (§A.5r/§A.9r3 legs) | **C2:** the F-13 probe's 502→503 line reflects F-03's new contract (dependency chain) |
| F-14 | P2 | **FIXED** | `a860d0b` | `last-resort-cooldown-release.test.js` (7/7) | unit | Live engine releases the least-bad cooldown when everything is cooling (single-provider deployments no longer hard-503 for up to 300 s) |
| F-15 | P2 | **FIXED** | `31837fa` | `ai-admin-partial-save-toggles.test.js` (5/5) | §A.11: partial save leaves `enableNvidia/Gemini/Openrouter` **null** (were fabricated `true`) | Omitted toggles no longer default-true |
| F-16 | P2 | **FIXED** | `6222aab` | `ai-admin-configured-enabled-split.test.js` (4/4) | admin GET payload | `configuredProviders` vs `enabledProviders` reported separately; **C3:** the dual map is a designed contract (consolidation ticket only if roadmap requires) |
| F-17 | P2 | **FIXED** | `547dabc` | `tenant-ai-audit-metadata.test.js` (6/6) | audit-row level | Tenant usage audit metadata carries executed provider/model/tier from the live engine (was structurally empty `aiRouting: {}`) |
| F-18 | P2 | **FIXED** | `4e5c8b0` | `usage-cost-accounting.test.js` (5/5) | §A.6 rows: scope/email/counts persisted | Token/cost accounting persisted and priced; `null` for unknown (never fabricated 0) |
| F-19 | P2 | **FIXED** | `d98739e` | `ai-secret-encryption.test.js` (6/6) | §A.12: stored shape `{__enterpriseEncrypted, alg, keyVersion, wrappedKey, iv, tag, ciphertext}`; **0** plaintext occurrences (was clear-text `sk-…`) | AES-256-GCM envelopes; fail-closed without `ENTERPRISE_ENCRYPTION_KEY(S)` |
| F-20 | P2 | **FIXED** | `a8330f8` | `v1-public-error-boundary.test.js` (4/4) | §A.5r: `fallbacks[0].error = "Upstream provider error"` (was `"server error from alpha (HTTP 500)"`) | Provider internals no longer forwarded to `/v1` clients |
| F-21 | P2 | **DEFERRED (reviewer-approved)** | — | — | — | Ticket **PH4-ENGINE-021**; reviewer acceptance recorded on the F-21 detail row (F-01 admission + F-09 sanctuary removal cover the abuse vector; full tenant-scoping = MariaDB DDL hard stop). Named remainder of multi-tenancy 7.0 in rating §8 |
| F-22 | P2 | **FIXED** (sub-item deferred) | `22349d2` | `admin-routing-telemetry-route.test.js` (5/5) | route-level (super-admin only) | `GET /api/admin/ai/routing-telemetry` — redacted ring + health snapshot. **Sub-item DEFERRED (reviewer-approved): `decisionId` in usage rows → PH4-ENGINE-022** (DDL hard stop; operators resolve decisions via this route + F-17 metadata) |
| F-23 | P2 | **FIXED** | `3a8475d` | `provider-enabled-single-source.test.js` (5/5) | §A.4: `ai_providers.groq.disabled=true` removes the provider from **both** engines (zero new beta calls) | Single enabled source of truth = `ai_providers[p].enabled/disabled`; legacy `enable<P>` booleans remain a compatibility input (AND-ed), never an independent gate |
| F-24 | P2 | **FIXED** | `2f8f698` | `ai-settings-v2-flag-removal.test.js` (3/3) | admin payload | Dead `ai_settings_v2_enabled` switch + UI control removed (dead switches are worse than none). Disclosed contract corrections: `ai-admin.test.js`, frontend `engine-security.spec.ts` |
| F-25 | P3 | **FIXED** | `e848552` | no new spec (hygiene); source-contract tests re-verified green (p1-gap, ai-remediation-phase3, ux-entitlement, free-download-upsell, docx-export, email-honesty, interview-quality, payment-rbac) | lint gates: repo ESLint **149→0 warnings/0 errors**, frontend oxlint **295→0/0**, `tsc -b` 0, `vite build` 0 | 135 files, +150/−571 dead-code excision; 12 useless escapes hand-checked semantics-preserving; 54 targeted per-site disables **with reasons** (43 react-refresh co-export, 9 exhaustive-deps, 1 do/while paginator, 1 intentional-ignore contract destructuring); zero blanket disables |
| F-26 | P3 | **ACCEPTED (reviewer-approved)** | — | — | — | Ticket **PH4-ENGINE-026**; reviewer acceptance on the F-26 detail row: bounded ≤15 s convergence, non-security, both fix paths blocked (hot-path DB read / new infra dependency) |
| F-27 | P3 | **FIXED** | `a3eb324` | `tenant-ai-quota-resolution.test.js` (5/5) | unit + wire (503 fail-closed) | One `resolveTenantQuota()`: explicit `0` = blocked (`TENANT_QUOTA_BLOCKED` 429), missing = documented defaults, `typeof` gate ends `Number([])===0` coercion; quota consumption unconditional (fail-closed `TENANT_QUOTA_UNAVAILABLE` 503 when the guard is missing) |
| F-28 | P3 | **FIXED** | `b1cd2cc` | `generation-defaults-single-source.test.js` (4/4) | probe: unconfigured `/v1` sampling disagreement `true→false`; both engines 0.7/2048 | Frozen `aiGenerationDefaults.js` imported at all 5 fallback sites. Disclosed: unconfigured `/v1` sampling moved 0.3→0.7, max_tokens 4096→2048 (the admin-save defaults' values) |
| F-29 | P3 | **FIXED** | `a0c343d` | `ai-settings-force-audit.test.js` (6/6) | probe legs: `expectedRevision:-1` → **409** (was 200 backdoor); conflict code single-spelling `REVISION_CONFLICT` on wire `code` **and** `reasonCode`; forced save audit row carries `forced:true` + sanitized bounded `forceReason` | One force mechanism (`force:true` only, matching frozen security-review); force exempts `expectedRevision`, absence still 400. Disclosed literal-contract corrections: `ai-admin.test.js:41`, `ai-adversarial-and-stress.test.js:363` |

**Deferred/accepted register:** PH4-ENGINE-021 (F-21 tenant-scoped cooldown/metrics — DDL), PH4-ENGINE-022 (F-22 `decisionId` in usage rows — DDL), PH4-ENGINE-026 (F-26 cross-instance config invalidation — accepted bounded characteristic). All three carry reviewer acceptance dated 2026-10-25.

**Suite progression across the campaign:** 1211 (F-27) → 1215 (F-28) → 1221 (F-29) → 1221 (F-25, no tests added/removed), every step `SUITE_EXIT=0`, 0 fail, 0 skipped.

---

## 10. A.5 / A.9 / A.10 preconditions (reviewer decision required)

The following D1 restatement probes restate the fixes' behavior **only under documented preconditions**. These are not bugs; they are design choices that bound when "fastest + smartest" selection actually activates. The reviewer should explicitly accept or reject these preconditions as part of the freeze decision. This section does **not** self-accept them.

**A.5 (failing primary) — no precondition.** The engine preemptively avoids a failing primary before any attempt (F-07 windowed ranking: a fresh failure demotes immediately, and a mature failure window outranks nothing). A primary whose recent observations were failures will not be tried; a healthy fallback serves instead. Correct behavior — the classical attempt-then-failover path with populated, sanitized `fallbacks[]` is still exercised whenever the failure is not yet in the window (probe leg A.5r with fresh metrics).

**A.9 (fastest) — PRECONDITION: ≥3 prior observations per provider.** Latency affects selection only after **n≥3** windowed observations of a provider:model candidate (F-07 rolling aggregate, recency-weighted p50, half-life 10 min). The first two calls to a slow provider do **not** flip selection to a fast one; during warm-up (n<3) selection is deterministic primary-preference. Proven live: A.9r1/A.9r2 did not flip (fast provider stuck at n=0/n=2), A.9r3 flipped immediately once the fast provider's window matured (n=3, p50≈186 ms) — including over an unsampled primary. User-observable consequence: an operator who adds a new fast provider may see the incumbent primary serve the first ~3 requests.

**A.10 (smartest) — PRECONDITION: model must be in the curated tier registry.** Quality mode differentiates premium vs standard vs economy only for model ids present in the curated static tier table (F-06; `backend/freellmapi/providers/registry.js` — documented human judgement, never inferred from names/sizes/marketing). Providers/models not in the registry cannot be differentiated by a quality signal and honestly keep `qualityEvidence:"unknown"` with no tier bonus (probe leg A.10r1: uncurated stub models → "unknown", primary served; A.10r2: curated `gpt-4o` (premium) vs `llama-3.1-8b-instant` (economy) → premium chosen over the faster economy primary, `qualityEvidence:"curated-tier:premium"`).

**Recommended tickets if the reviewer rejects these preconditions:**
- **PH4-ENGINE-030** — Cold-start latency seeding: bounded exploration strategy for the first-3-calls on new/unseen providers (e.g., a small exploration budget that samples unevidenced candidates instead of strict primary-preference while n<3).
- **PH4-ENGINE-031** — Tier registry auto-discovery: pull model capability/class metadata from provider APIs where available, so quality differentiation extends beyond the static curated table (must preserve the "never guessed" honesty rule — unknown stays unknown).
