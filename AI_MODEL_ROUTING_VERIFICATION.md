# AI Model Routing — Dynamic Selection & Provider Orchestration: Verification Report

Date: 2026-09-24 · Branch: `arena/01a0d04f-resumepilotai`

## A. Repository & baseline state

| Item | Value |
|---|---|
| Starting `origin/main` (verified) | `90396fd84e26c4b9105629ff86073a3e50b1a406` |
| Branch | `arena/01a0d04f-resumepilotai` (branched exactly at `90396fd`) |
| Reported commit `a41e3206` | **UNVERIFIED** — not present on `origin/main`; not used as a baseline |
| Baseline regression control | Full suite run on pristine `90396fd` in a separate worktree (`/tmp/base-rpa`), identical harness |

Change set (all within the allowed scope):

| Path | Change | Why in scope |
|---|---|---|
| `backend/services/aiRouting/` (10 new modules) | NEW | The dynamic routing engine: capability model, discovery service, health store, requirement profiles, provider adapters, model selector, orchestrator, routing telemetry, http deadline, public API |
| `backend/services/aiRuntime.js` (−231/+62 net) | MODIFIED | Legacy hardcoded provider-order execution replaced by the dynamic router; grounding/fallback contract preserved |
| `backend/enterprise/tenantAi.js` | MODIFIED | Tenant AI policy: BYOK key application, `restrictedModels` denylist, `tenantId` stamp for routing-state isolation, frozen credential-free `tenantPolicy` for the selector |
| `backend/services/aiAdmin.js` | MODIFIED | Admin provider-config surface wired to the new discovery/health/telemetry state |
| `backend/routes/ai.js` | MODIFIED | Tenant audit event now carries safe routing telemetry (decision id, executed model, latencies, fallback count — no secrets, no prompts) |
| `backend/test/helpers/aiRouteContract.js` | MODIFIED | Added `reinstallOverrides()` (test harness for DB-free app-level AI route tests) |
| `backend/test/helpers/aiSettingsContract.js` | MODIFIED | Test harness compatibility |
| `backend/test/ai-model-routing-discovery.test.js` | NEW (10 tests) | Discovery/capability suite |
| `backend/test/ai-model-routing-selection.test.js` | NEW (11 tests) | Requirement analysis, eligibility, explainable selection, future-model suite |
| `backend/test/ai-model-routing-health-fallback.test.js` | NEW (10 tests) | Health/cooldown/recovery + fallback contract suite |
| `backend/test/ai-model-routing-byok-tenant.test.js` | NEW (7 tests) | BYOK credential correctness + multi-tenant isolation, app-level HTTP |
| `backend/test/ai-routing-security.test.js` | NEW (5 tests) | Injection, cache poisoning, config-cache isolation, telemetry leakage |
| `backend/test/ai-adversarial-and-stress.test.js` | MODIFIED (test only) | Fallback-cascade scenarios made state-independent (`resetSharedAiRouterForTests()` between scenarios) so each cascade step evaluates the full provider set |

Not touched: UI/UX, branding, SEO, payments, billing, general auth, resume/interview/ATS business logic, unrelated prompts, unrelated AI behavior, unrelated infra.

## B. Scope compliance — PASS

Every modified file is directly part of provider/model discovery, capability discovery, requirement analysis, eligibility, routing, health signals, telemetry, or BYOK/tenant-aware selection (plus the required tests and their documented test helpers). No out-of-scope file was modified. Unrelated pre-existing issues encountered along the way were documented (§I), not fixed.

## C. Architecture overview

Pipeline (per request): **tenant resolution → BYOK/provider config resolution (`applyTenantAiPolicy`) → requirement analysis (`requirementProfiles`, derived from operation + prompt size) → capability/eligibility filtering → explainable selection (`modelSelector`: deterministic score → provider order → model id) → execution (provider adapters, tenant's credential only) → response validation/grounding (unchanged) → safe routing telemetry (tenant-scoped) → bounded runtime adaptation (health store with rolling/decaying metrics, cooldown, rate-limit windows, last-known-good with expiry).**

Key properties:

- **No hardcoded models/rankings in the selector.** `modelSelector.js` and `orchestrator.js` contain zero model-name literals (grep-verified). Model names exist only as (a) operator/tenant configuration, (b) provider-adapter `defaultModel` **configuration seeds** (provider quirks live in adapters, per requirement). Ranking signals: configured-model +40, provider primary +10, discovered +10, verified structured-output +15, verified long-context +25, tenant primary-model +50 (governance override), health ≤ +24 — fully explainable per decision (`selectionReasons`, `rejectionSummary`, `decisionId`).
- **Discovery is cached, not per-request.** `scheduleRefresh` is deduped + TTL-gated (15 min catalog / access TTL, 6 h max staleness); requests route on cached state. Success replaces the catalog (public model metadata, no credentials); 429/network keeps last-known-good; 401/403 rejects the tenant's credential.
- **Cache isolation model (audited).** GLOBAL: model catalog (public metadata), provider reachability. TENANT-SCOPED: credential access (`tenantId|provider` keys), health metrics, telemetry, routing config, BYOK credentials (credentials exist only in the per-request provider config, never in caches/telemetry).
- **Fallback is same-tenant only**, satisfies the original requirement (same operation, grounded), and otherwise degrades to an **explicit `aiUnavailable: true`** state. Zero fabricated AI content on any routing failure; `noFallback` propagates the structured provider error.

## D. BYOK correctness — PASS

Evidence (app-level HTTP, real Express app, hermetic):

- **Suite 4, test 1** — concurrent Tenant A (openai+groq) vs Tenant B (groq only): every provider call carried its own tenant's key (`sk-contoso-openai-byok…` / `gsk_MayoGroqByok…`); platform keys never used by a tenant; no credential crossed boundaries.
- **Suite 4, test 2** — A's openai key 503s on the provider side: A fell back to **its own** groq key (`[KEY_A_OPENAI, KEY_A_GROQ]` call sequence, `x-ai-provider: groq`), B ran independently on its own key; A's failed attempt recorded under A's health only.
- **Suite 4, test 3** — C's only allowed provider failed: request degraded to `200 + x-ai-provider: fallback + aiUnavailable: true`; groq (allowed for other tenants) was never consumed for C.
- **Suite 5, test 1** — payload-embedded `tenantId`/`providers`/`primary`/top-level `apiKey`: injection fields ignored (A's own primary+key used) or rejected (`400 CLIENT_AI_KEY_REJECTED`, zero provider calls); malformed `X-Tenant-Id` fails closed with zero provider calls.
- **Suite 5, test 4** — platform → tenant → platform sequence: cached config never cross-polluted (platform key before and after tenant use).

Cross-tenant fallback: **never occurs** — candidate set is built exclusively from the resolved tenant's configuration; tenant policy (`allowedProviders`) bounds even the fallback path (Suite 4 test 3).

## E. Multi-tenant isolation — PASS

- **Concurrent isolation**: Suite 4 test 1 (A→openai/Key-A ∥ B→groq/Key-B simultaneously).
- **Routing-state isolation**: Suite 4 test 7 + Suite 5 test 3 — telemetry queries return only the queried tenant's entries; health snapshots are tenant-scoped (B has no openai/groq-failure state from A's outage); a poisoned discovery catalog from A's restricted credential never reached B's executed models, B's telemetry, or the platform scope (Suite 5 test 3, all phases).
- **Credential isolation**: verified above (§D). Tenant B can never be served by Tenant A's credential, provider, or model-scope.
- **Fail-closed on spoofed tenant**: `X-Tenant-Id` naming another tenant → `404 TENANT_MEMBERSHIP_NOT_FOUND` (identical contract in the production MySQL registry and the in-memory test registry — denies access without leaking tenant existence), zero provider calls (Suite 4 test 4).
- **Secrets**: no credential string appears in any response body/header, routing telemetry, health snapshot, or tenant audit event — including when the provider's error message echoes a secret (Suite 5 test 5) and across prompt-injection attempts embedding a platform key (Suite 5 test 2).

## F. Future-model readiness — PASS

- **Synthetic new model participates generically**: discovery suite (10/10) feeds a provider catalog containing `brand-new-model-2027` (unknown capabilities → normalized to `unverified`, never fabricated); the model becomes eligible and selectable purely through the generic path.
- **Capability-aware selection**: selection suite (11/11) — a brand-new discovered model with *verified* long-context capacity outranks a configured model that cannot fit the prompt; unknown-capability models are never treated as "supported" (unknown ≠ supported).
- **Schema evolution tolerated**: `normalizeModelCapabilities` preserves unknown capability fields in `extra` without breaking selection (capability suite).
- **No allowlist dependency**: selector contains no model allowlist; retirement/cooldown of a model is dynamic (model-not-found → 30-min block → recovery, health suite test 9).

## G. Performance

Measured in this environment (in-memory mocks; production provider latency is additional network time):

| Operation | Result |
|---|---|
| Pure selection (eligibility + explainable ranking, 2 providers / 4 models, 100k iterations) | **avg 3.5 µs** |
| Full `route()` incl. one execution (mocked fetch, 2000 iterations) | **avg 0.072 ms** |
| Selection latency in app-level HTTP tests (telemetry `selectionLatencyMs`) | **< 1 ms** (reported 0–0.2 ms) |
| Discovery per request | **none** — cached state; refreshes are deduped, async, TTL-gated (15 min catalog TTL, 6 h max staleness) |

## H. Test evidence

Verdicts use PASS / FAIL / BLOCKED / UNVERIFIED / NOT APPLICABLE only.

| Suite | Scope | Result |
|---|---|---|
| `ai-model-routing-discovery` (10) | provider/model discovery, catalog replace, tenant access, last-known-good, malformed responses | **PASS 10/10** |
| `ai-model-routing-selection` (11) | requirement analysis, eligibility, explainable ranking, future model, tenant policy | **PASS 11/11** |
| `ai-model-routing-health-fallback` (10) | rolling/decaying metrics, cooldown/recovery, rate-limit windows, fallback contract, no fabrication | **PASS 10/10** |
| `ai-model-routing-byok-tenant` (7) | BYOK credential correctness, concurrency, no cross-tenant fallback, policy bounds, fail-closed, secrets | **PASS 7/7** |
| `ai-routing-security` (5) | injection, cache poisoning, config-cache isolation, telemetry leakage | **PASS 5/5** |
| `ai-runtime` (14) | existing runtime contract (grounding, fallback, parsing) under the new router | **PASS 14/14** |
| `ai-admin`, `ai-ecosystem`, `ai-enterprise-acceptance`, `ai-remediation-phase2/3`, `ai-routes.integration` (67) | pre-existing AI suites | **PASS 67/67** |
| `ai-adversarial-and-stress` (9) | pre-existing adversarial suite (incl. 7-tier fallback cascade, 20-way concurrency) | **PASS 9/9** (after state-isolation test fix, §I.2) |
| DB-dependent suites (MariaDB CERTIFICATION, forensics, payment webhooks, RBAC forensics, enterprise role view, proof/integration AI tests) | require a live migrated MariaDB | **BLOCKED** — no MariaDB in this sandbox (`3306` closed). Identical failure set on pristine base `90396fd` with the same harness (39/39 of the base-run failures are environment-caused; 0 differ from base). |

Full-branch final run (98 test files): **725 tests — 688 pass, 13 fail, 24 skip**. All 13 failures are in the BLOCKED category above and are byte-for-byte the pre-existing base set (diff vs base failure list: **0 regressions, 0 new failures**). All 43 new routing tests pass when the five new suites are run together and inside the full run.

## I. Remaining issues & documented (not fixed) findings

1. **DB-dependent suites BLOCKED without MariaDB** — 13 tests fail in this sandbox identically on base and branch (connection-refused 503s / missing DB). Verdict: BLOCKED, not FAIL of the routing work; they are environment-gated by design (`RUN_MARIADB_INTEGRATION`).
2. **Fallback-cascade test required a state-isolation fix** (test code only): the pre-existing test's scenario D asserted all 6 providers attempted while the shared router's health store legitimately carried a 429 rate-limit window from scenario C (the new router's intended bounded adaptation). Fix: `resetSharedAiRouterForTests()` between scenarios — each scenario now evaluates the full provider set, preserving the original assertion (`failures.length === 6`).
3. **`X-Tenant-Id` spoof returns 404, not 403** — both the production (MySQL) and in-memory registries fail closed with `TENANT_MEMBERSHIP_NOT_FOUND` (404) for non-members. Deliberate (no tenant-existence leak). The new BYOK suite initially asserted 403 and was corrected to the actual contract; behavior is fail-closed with zero provider calls.
4. **Global model catalog is shared across tenants by design** — the catalog is public model metadata (no credentials); tenant credential access is strictly tenant-scoped. Verified safe under poisoning (Suite 5 test 3): a restricted credential's catalog cannot make another tenant execute out-of-scope models once that tenant's own access record exists, and can at worst surface one extra candidate to a tenant with *no* access record yet, executed with that tenant's **own** credential (self-heals via provider 404 → health → failover).
5. **Reported commit `a41e3206`** — UNVERIFIED; not on `origin/main`; baseline taken from verified latest `origin/main` (`90396fd`) as required.
6. **Pre-existing, unrelated** (documented only, untouched): no-MariaDB 503s in proof/integration suites; legacy `PROVIDERS` env-var fallback paths retained in `aiRuntime` for config compatibility (now feeding the dynamic router, not a hardcoded ranking).

## J. Assessment (10 dimensions — evidence-bound, no unearned 10s)

| # | Dimension | Score | Basis |
|---|---|---|---|
| 1 | No hardcoded selection (future-proof core) | **9** | Zero model literals in selector/orchestrator; synthetic 2027 model participates. −1: adapter `defaultModel` seeds are static per provider (acceptable as configuration seeds, but they do encode today's names in adapters). |
| 2 | BYOK correctness (every hop, every tenant) | **9** | App-level proof across primary/fallback/discovery/injection; no cross-tenant credential path found. −1: live-provider end-to-end (real OpenAI/Groq keys) not exercised in sandbox. |
| 3 | Multi-tenant isolation (config, state, cache, metrics) | **9** | Concurrency, health/telemetry scoping, poisoned-catalog isolation, config-cache isolation all proven. −1: MariaDB-backed registry path (production store) only exercised where DB exists (CI), blocked here. |
| 4 | Eligibility before ranking, explainable | **9** | Hard gates (capability/context/streaming/modality/structured output/tenant access) precede scoring; every decision carries reasons + rejection summary + decisionId. −1: requirement profiles are operation-mapped (heuristic, though deterministic and tested). |
| 5 | Fast selection / safe caching | **9** | 3.5 µs pure selection; cached discovery; last-known-good with 6 h staleness bound. −1: single-process cache (no cross-instance invalidation channel beyond the DB settings path). |
| 6 | Health & bounded adaptation | **8** | Rolling/decaying metrics, cooldown (3 consecutive), 429 windows, model-not-found 30-min block, recovery — all tested; adaptation is bounded and logged. −2: recovery is threshold-based (no progressive probing), and rate-limit default window is fixed 60 s when Retry-After is absent. |
| 7 | Fallback integrity (same tenant, satisfies request, zero fabrication) | **9** | Same-tenant same-request fallback; explicit `aiUnavailable` state otherwise; grounding preserved; noFallback propagates structured error. −1: fallback for summary is source-preserving (asks/preserves) rather than regenerating — by product design, noted for completeness. |
| 8 | Security (injection, poisoning, leakage) | **9** | Injection fields rejected/ignored; poisoned catalog contained; secret-free responses/telemetry/health/audit even when the provider echoes a secret; client keys rejected at the route boundary. −1: no live fuzzing/corpus beyond the encoded scenarios. |
| 9 | Test coverage & honesty of evidence | **9** | 43 new tests across the full required matrix (discovery, capability, selection, health, fallback, BYOK, multi-tenancy, future-compat, security) + all pre-existing AI suites green; base-vs-branch diff = 0 regressions. −1: DB-gated integration matrix is BLOCKED, not PASS. |
| 10 | Production readiness (ops, observability, failure modes) | **8** | Admin surface exposes discovery/health/telemetry state; audit events carry routing explainability; fail-closed everywhere. −2: single-instance runtime state (health/telemetry in-memory) and the DB-gated paths remain UNVERIFIED in this environment. |

**Overall: PASS** for the acceptance criteria that can be verified in this environment; **BLOCKED** items are strictly the MariaDB-dependent integration surfaces (identical on base). No criterion was called PASS on unavailable infrastructure.
