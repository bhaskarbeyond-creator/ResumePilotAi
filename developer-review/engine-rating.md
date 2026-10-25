# AI Multi-Provider Engine — Rating & Release Recommendation

**Date:** 2026-10-24 · **Base:** `5bd2570` · **Auditor:** read-only review (no code changed)
**Scope:** routing / selection / execution engine. Settings **UI** is out of scope by instruction; it is referenced only where a control changes engine behaviour.

---

## 1. The number

# **5.0 / 10 — HOLD**

> **2026-10-25 UPDATE:** remediation of all 29 findings completed on `arena/21c2e4cd-resumepilotai` (tip `e848552`). The final re-rated score — **the number** — is in **§8**: **8.4 / 10 — SHIP WITH NAMED CONTINUATION SCOPE (not freeze-ready)**. Sections 1–7 below are the preserved 2026-10-24 baseline.

Weighted 4.95 across eight dimensions, reported as 5.0. This is a *production-readiness* score for the multi-provider engine **as it exists on `main` today**, not a score for the effort or the design intent. The `aiRouting` module alone would score **7.5/10** — it is the better-engineered half, and it is the half that is not running (F-05).

| Dimension | Weight | Score | One-line justification |
|---|---:|---:|---|
| Routing decision correctness | 20 % | **5.5** | Auto selection and the five modes are wired and validated; ranking evidence is a single last sample, so identical traffic can route differently for no durable reason (F-07). |
| Resilience & failover | 15 % | **6.5** | Per-key, per-candidate failover is bounded and real (200 after a primary 500, with a populated `fallbacks[]`); cooldowns persist across restarts. Pinned-provider outage → hard 502 (F-03), single-provider deployment can 503 for 300 s (F-14). |
| Honesty of the "smartest" claim | 15 % | **3.0** | No quality/intelligence signal exists anywhere; `quality` mode is primary-order (F-06); the response says `qualityEvidence: "unknown"` — honest, but the mode name is not. |
| Multi-tenancy & isolation | 15 % | **4.5** | The new engine is tenant-keyed (health, discovery, telemetry); the live engine's metrics, cooldowns and cache are global (F-21); tenant BYOK is never consumed (F-08); tenant traffic produces no routing evidence (F-09). |
| Security & cost metering | 15 % | **3.0** | `/v1` bypasses quota/governance/rate limits for any signed-in user (F-01); cache replays answers across principals (F-02); `/v1/status` is public (F-10). Secrets handling in the admin API itself is genuinely good (§3). |
| Observability & explainability | 10 % | **6.0** | `_freellmapi` block, `fallbacks[]`, durable metrics, audit trail with revisions and masked keys; but no decision id, no persisted rationale, telemetry unexposed (F-17, F-22). |
| Ops / config ergonomics | 5 % | **6.5** | Hot reload without restart in ≤10 s, revision-protected saves, no-restart rollbacks; but sticky default-true flags (F-15), misleading "configured" state (F-16), no reset controls (F-13). |
| Code quality & tests | 5 % | **7.5** | 55/55 engine tests pass and they assert meaningful behaviour; `tsc -b` clean; 0 ESLint errors. 170 warnings (mostly unused vars) and dead code in maintenance paths (F-11). |

**Why not higher:** four independent defects breach the product's own claims — unmetered gateway, cross-principal cache, dead tenant BYOK, and a quality mode without quality evidence. Any one of them would block a 9/10.

**Why not lower:** the request path is honest. It returns 503/502 with explicit codes instead of inventing content (`aiRuntime.js:2084-2106`), it never sends client-supplied keys (`routes/ai.js:349-351`), it redacts secrets in telemetry (`routingTelemetry.js:58-141`), and it has real tests. The bones are good; the control plane and the evidence layer are not finished.

---

## 2. Ship / hold matrix

| Claim in product / docs | Verdict | Evidence |
|---|---|---|
| "Multiple providers with automatic failover" | **TRUE** (auto mode) | primary 500 → 200 from secondary, `fallbacks[0].status = 500` (`§A.5`) |
| "Manual pin always uses the chosen provider" | **TRUE**, but with an outage coupling the UI does not disclose | 502 `ALL_PROVIDERS_FAILED` while a healthy provider sat idle (`§A.8`) |
| "Fastest model wins" | **PARTIAL** | `speed` chose the 8 ms provider once evidence was fresh, but served a 3 s provider on a stale 4 ms sample (`§A.9`) |
| "Smartest model wins" | **FALSE** | no quality signal; `quality` served the slower primary (`§A.10`) |
| "Per-tenant BYOK" | **FALSE** | encrypted store written, never read by inference (F-08) |
| "Quotas enforced" | **FALSE for `/v1`** | 3 calls, 0 `ai_usage` rows (F-01) |
| "Tenant isolation" | **PARTIAL** | tenant-keyed health/telemetry exist but are unused by the live path; cache leak across principals (F-02) |
| "No restart to change providers" | **TRUE** | ≤10 s hot reload, verified (`§A.3`, `§A.4`) |
| "Keys are never exposed" | **TRUE in the admin API**, **FALSE at rest** | masked last-4 + zero key material in audit (good); plaintext in `system_settings` (F-19) |
| "Rollback with `ai_settings_v2_enabled`" | **FALSE** | flag has no engine effect (F-24) |

---

## 3. What is genuinely good (do not regress it)

1. **Credential hygiene in the admin API.** Keys are masked to last-4 (`aiAdmin.js:249`), never echoed, never written to the audit row — a SQL `LIKE` scan for every test key returned **0** rows. Revision-based optimistic concurrency exists (`expectedRevision`), and settings take effect without restart.
2. **Bounded failure behaviour.** Every provider attempt has a deadline; there is no unbounded retry loop; total failure is a deterministic 502/503 with a machine-readable code. No hangs observed across all probes.
3. **Honest degradation.** The product engine refuses to fabricate content when the model output fails validation (`aiRuntime.js:2084-2106`). That is rarer than it should be.
4. **Tenant-scoped state in the new engine.** `HealthStore` keys on `tenantId|provider|model`, `DiscoveryService` refuses to resurrect default capabilities after a failed discovery, `RoutingTelemetry` redacts secrets and is tenant-tagged. The design is right; it needs to be on the request path.
5. **Durable cooldowns.** Hydrated at startup (`cooldown.js:26-48`) so a restart does not hammer a benched provider. Most systems miss this.
6. **The tests are real.** `ai-model-routing-selection.test.js` asserts ordering, hard gates, discovered-model demotion, tenant cooldown release and tenant primary-model preference — not snapshot theatre. 55/55 pass.

---

## 4. What a 9.5/10 looks like

The prior engagement accepted a 9.5 when the named gap was closed with evidence. The same bar applies here. To claim 9.5:

1. **No unmetered inference path.** A CI test enumerates the router stack and fails if any `/v1` route lacks quota + governance + limiter (F-01 closed, F-18 closed by real token accounting).
2. **Isolation is provable.** Cache identity includes principal/tenant; a test asserts two principals never share an entry. Cooldowns and metrics carry tenant scope, or a documented decision explains why not (F-02, F-21).
3. **Pins and modes mean what they say.** Manual mode either fails over with `fallbackFrom: "manual"` or refuses to save without an explicit model; `quality` is backed by a real signal or renamed (F-03, F-04, F-06).
4. **Tenant BYOK is live.** A request for a tenant with a stored key is observed using that key by a test stub; platform-key tenant traffic records metrics (F-08, F-09).
5. **Selection evidence is durable.** Windowed p50/p95 + failure counts feed ranking; every inference carries a `decisionId` resolvable to a stored, redacted rationale (F-07, F-17, F-22).
6. **One engine.** `AI_ENGINE` selects `freellm`, `aiRouting`, or `shadow`; the other is not silently reachable; `compat` is deleted or documented as a real compatibility layer (F-05, F-23).
7. **Operable.** `POST /api/admin/ai/reset-state` and a read-only routing-telemetry endpoint exist behind super-admin + audit; `/v1/status` is authenticated (F-10, F-13, F-22).
8. **Zero-warning bar.** 0 errors **and** 0 warnings under the repo `eslint.config.js` for engine files and their tests; the remaining legacy warnings have a tracked, dated triage plan (F-25).

Realistic effort: **~13 engineering days** (see `engine-findings.md` §7). Steps 1–3 (≈2.5 days) change the risk posture; the rest is quality.

---

## 5. If I had to choose one thing

**Put `/v1` under the same admission control as `/api/ai`, and include the principal in the cache key.** Two changes, under a day, remove the only P0 and the most serious data-exposure path. Everything else can be scheduled.

Second choice: **wire tenant BYOK** — not because it is a security hole, but because it is a shipped feature that does nothing, and that is the kind of gap that erodes trust in every other claim on the settings page.

---

## 6. Confidence and limitations

- **High confidence:** F-01, F-02, F-03, F-04, F-06, F-07, F-10, F-11, F-15, F-16, F-19, F-25 — each reproduced live or read line-by-line.
- **Medium confidence:** F-08, F-09, F-17, F-21, F-23 — deterministic from code, but the enterprise path was not executed end-to-end (tenant provisioning + `ai.use` + quota ledger were out of the probe budget). No contrary code was found.
- **Not audited:** the settings UI (by instruction), provider *output quality* (no real provider calls are possible from this sandbox — stubs only), billing/plan enforcement, and DB-level row security.
- **Environment caveat:** all live probes used local OpenAI-compatible stubs. Latency numbers are real HTTP measurements against those stubs, not against OpenAI/Groq. The routing code path is identical; the absolute latencies are not indicative of production.

---

## 7. One-paragraph summary for a decision-maker

The engine works, and it fails honestly, but it does not yet do what the product says. Automatic failover is real; "fastest and smartest" is half-real (speed is measured, quality is not); per-tenant BYOK is stored and never used; and the new, well-built selector is not on the request path. More seriously, the OpenAI-compatible gateway sits outside quota and rate limiting, so any signed-in user can drive unmetered inference, and its response cache is shared across principals. Fix the gateway admission control and the cache key first (under a day), then wire BYOK and make the mode names true. **Recommendation: hold the multi-provider marketing claims; ship the fixes in `engine-findings.md` §7 steps 1–4, then re-audit.**

---

## 8. Post-fix re-rating (2026-10-25) — THE NUMBER

**Basis:** branch `arena/21c2e4cd-resumepilotai` tip `e848552`; 26 findings FIXED (one commit each), 2 DEFERRED with reviewer-approved tickets (PH4-ENGINE-021, PH4-ENGINE-022), 1 ACCEPTED (PH4-ENGINE-026). Evidence: full backend suite **1221/1221, 0 fail, 0 skipped, SUITE_EXIT=0**; ~20 new specs each certified 10× (0 bad runs); all 14 Appendix A probes restated live (§ "Post-fix verification" in the audit doc); repo ESLint 0/0, frontend oxlint 0/0, `tsc -b` 0, `vite build` 0; lockfiles 0-byte. Derived from probe + test evidence, not from finding counts.

# **8.4 / 10 — SHIP WITH NAMED CONTINUATION SCOPE**

Weighted 8.375 with the **same weights as the 5.0 baseline**, reported as 8.4. Below 9.0 → **not freeze-ready** (per the engagement's own honesty rule); the continuation scope that closes the remainder is listed at the end of this section.

| Dimension | Weight | 2026-10-24 | 2026-10-25 | Evidence for the new score |
|---|---:|---:|---:|---|
| Routing decision correctness | 20 % | 5.5 | **8.0** | F-04 save-time pin validation (A.7c: 400 with actionable message) + routing-time "empty pin = provider default"; F-07 windowed recency-weighted p50 with n≥3 gate and fresh-failure circuit breaker — stale-sample misdirection eliminated and the mature-window flip to the faster non-primary proven live (A.9r3); F-05 explicit `AI_ENGINE` choice + shadow divergence ring; F-23 single enabled gate (A.4). Not higher: `speed`'s "fastest wins" is evidence-gated — during cold-start warm-up (n<3) the primary is preferred by design (anti-flapping), so the claim is TRUE-with-mature-evidence, PARTIAL during warm-up. |
| Resilience & failover | 15 % | 6.5 | **9.0** | F-03: pinned-down → 503 `provider_unavailable` + `Retry-After: 60`, opt-in `manualAllowFallback` fails over **with disclosure** (`fallbackFrom:"manual"`, A.8/A.8b — both documented modes live-proven); F-12 clamped Retry-After; F-14 last-resort cooldown release (single-provider 300 s blackout closed); F-11 maintenance actually runs; F-13 operator reset (used live as probe infrastructure). Bounded failover with populated `fallbacks[]` preserved (A.5r). No hangs across 40+ probe calls. |
| Honesty of the "smartest" claim | 15 % | 3.0 | **8.5** | F-06: quality mode ranks on the curated tier table — premium `gpt-4o` chosen over the faster economy primary with `qualityEvidence:"curated-tier:premium"` (A.10r2); uncurated models stay honestly `"unknown"` with zero bonus (no fabricated quality, no relabelling). Not higher: the tier table is finite static human judgement — for uncurated models "smartest" remains unmeasurable (honestly labelled, but the mode can't rank them). |
| Multi-tenancy & isolation | 15 % | 4.5 | **7.0** | F-02 principal-scoped cache (A.2 `cached:false`); F-08 tenant BYOK actually reaches the provider (stub-asserted); F-09 platform-key tenant traffic records metrics/cooldowns (sanctuary closed); F-17 tenant audit metadata live; F-27 one quota resolution, explicit-0 blocks, fail-closed guard. **The remaining 3 points are PH4-ENGINE-021** (F-21 deferred, reviewer-approved): cooldowns/metrics are still global — one tenant's 429 burst can bench a provider for everyone — plus PH4-ENGINE-022 (`decisionId` not persisted per usage row). Both are DDL-blocked in this engagement and named, not hidden. |
| Security & cost metering | 15 % | 3.0 | **9.0** | F-01: `/v1` under the exact `/api/ai*` admission chain with durable pre-invocation charging (A.6: `ai_usage` +3, 200×3); F-10 status gated + minimized (A.13: 401 / reduced payload); F-19 AES-256-GCM envelopes at rest, fail-closed key handling (A.12: 0 plaintext); F-20 sanitized error boundary (A.5r); F-18 token/cost persisted, null-when-unknown; F-29 single force mechanism with attributable, sanitized audit trail; admin path hygiene preserved (A.11 LIKE-scan 0). |
| Observability & explainability | 10 % | 6.0 | **8.5** | F-22 telemetry + health route (super-admin, redacted); `routing_decision` now carries `observedLatencyMs`/`observationCount` (live in every probe); F-16 configured-vs-enabled split; F-13 reset; F-17 audit metadata. Not higher: no durable per-request `decisionId` join key (PH4-ENGINE-022) and `routing_decision` still omits the full candidate list/scores (ring-buffer route covers operators). |
| Ops / config ergonomics | 5 % | 6.5 | **8.5** | F-15 no fabricated toggles (A.11); F-24 dead flag removed; F-29 one force spelling, force-reason captured; F-04 rejection message tells the operator exactly what to set; hot reload ≤12 s preserved (A.3). F-26 ACCEPTED (PH4-ENGINE-026): multi-instance convergence stays ≤15 s process-local — bounded and documented. |
| Code quality & tests | 5 % | 7.5 | **9.5** | F-25: repo-wide ESLint **149→0 warnings/0 errors**, frontend oxlint **295→0/0**, `tsc -b` 0, `vite build` 0; 135-file dead-code excision (+150/−571) with hook-slot-preserving elisions and hand-checked regex-escape semantics; 54 targeted per-site disables each carry an honest reason (no blanket disables). Suite 1221/1221; every campaign spec 10×-certified. |

**Weighted total:** 8.0×.20 + 9.0×.15 + 8.5×.15 + 7.0×.15 + 9.0×.15 + 8.5×.10 + 8.5×.05 + 9.5×.05 = **8.375 → 8.4/10**.

### 8.1 Ship/hold matrix, re-answered (was §2)

| Claim | 2026-10-24 | 2026-10-25 | Evidence |
|---|---|---|---|
| "Multiple providers with automatic failover" | TRUE | **TRUE** (unchanged) | A.5r `fallbacks[0]` populated, sanitized |
| "Manual pin always uses the chosen provider" | TRUE with undisclosed outage coupling | **TRUE, and the coupling is now disclosed**: pinned-down → 503 + Retry-After; opt-in fallback announces `fallbackFrom:"manual"` | A.8/A.8b |
| "Fastest model wins" | PARTIAL (stale-sample misdirection) | **PARTIAL→TRUE with mature evidence**: flip proven (A.9r3); cold-start warm-up (n<3) prefers primary by design — label the claim "once measured" | A.9r2/A.9r3 |
| "Smartest model wins" | FALSE | **TRUE for curated models** (tier-backed, live-proven); honestly `unknown` for uncurated ones | A.10r2 |
| "Per-tenant BYOK" | FALSE (write-only) | **TRUE** — stub-asserted tenant key reaches the provider | `tenant-byok-read-path.test.js` |
| "Quotas enforced" | FALSE for `/v1` | **TRUE everywhere** — durable ledger charged pre-invocation | A.6 |
| "Tenant isolation" | PARTIAL | **PARTIAL→mostly TRUE**: cache isolated, BYOK sanctuary closed, audit metadata live; **cross-tenant cooldown blast radius remains (PH4-ENGINE-021)** | A.2, F-09/F-17 tests |
| "No restart to change providers" | TRUE | **TRUE** (unchanged; ≤12 s) | A.3/A.4 |
| "Keys are never exposed" | TRUE in admin API, FALSE at rest | **TRUE in admin API AND at rest** (envelopes) | A.11/A.12 |
| "Rollback with `ai_settings_v2_enabled`" | FALSE (cosmetic) | **Claim removed** — flag and UI control deleted; there is no fake rollback switch anymore | F-24 |

### 8.2 "Do not regress" list — confirmed, none regressed

1. **Admin credential hygiene** — CONFIRMED and strengthened (F-19 envelopes; F-29 attribution; A.11 LIKE-scan 0).
2. **Bounded failure behaviour** — CONFIRMED (no hangs across all restatement legs; machine-readable codes on every failure; failover bounded per candidate).
3. **Honest degradation (no invented content)** — CONFIRMED (validation path untouched; suite green; `null`-when-unknown accounting, F-18).
4. **Tenant-scoped state in the new engine** — CONFIRMED and now *used* (F-08/F-09/F-17 wiring; F-22 exposure).
5. **Durable cooldowns** — CONFIRMED (hydration intact; F-12 clamped Retry-After; F-14 last-resort release; F-13 operator reset).
6. **Real tests** — CONFIRMED and expanded (55 engine tests → 1221-test suite; ~20 new specs, each 10×-certified; zero assertion-loosening — the five test edits across the campaign were literal-contract corrections, each disclosed in its commit).

### 8.3 The eight criteria for 9.5 — status of each

1. **No unmetered inference path** — **MET.** `v1-admission-control.test.js` enumerates the router stack and fails if any `/v1` route lacks the chain; live A.6 charges the ledger.
2. **Isolation is provable** — **MET for cache/principal** (`freellmapi-cache-scope.test.js`, A.2). **Cooldown/metrics tenant scope: DEFERRED by documented reviewer-approved decision** (PH4-ENGINE-021) — the criterion's own escape hatch ("or a documented decision explains why not").
3. **Pins and modes mean what they say** — **MET.** Manual refuses to save without an explicit model (A.7c) *and* fails over with `fallbackFrom:"manual"` when opted in (A.8b); quality is backed by a real curated signal (A.10r2).
4. **Tenant BYOK is live** — **MET.** `tenant-byok-read-path.test.js` (stub asserts the tenant key); platform-key tenant traffic records metrics (`tenant-byok-tier-resolution.test.js`).
5. **Selection evidence is durable** — **MET for windowed aggregates** (`freellmapi-rolling-rank.test.js`; `observationCount`/`observedLatencyMs` live on the wire). **Per-inference `decisionId` in usage rows: DEFERRED** (PH4-ENGINE-022); operators resolve decisions via the F-22 route + F-17 metadata meanwhile.
6. **One engine** — **MET.** `AI_ENGINE` explicitly selects `freellm|shadow|aiRouting` (`ai-engine-choice.test.js`); the new selector is no longer reachable only through an accidental error class; shadow keeps a bounded divergence log.
7. **Operable** — **MET.** `POST /api/admin/ai/reset-state` + `GET /api/admin/ai/routing-telemetry` behind super-admin (`admin-ai-reset-state.test.js`, `admin-routing-telemetry-route.test.js`); `/v1/status` authenticated + reduced (A.13).
8. **Zero-warning bar** — **MET, beyond the bar.** Not just engine files: repo-wide ESLint 0 warnings/0 errors (149→0), frontend oxlint 0/0 (295→0), `tsc -b` 0 (`e848552`); the 54 remaining suppressions are per-site, reasoned, and behaviour-preserving by policy.

**6 of 8 fully met; 2 met via the criterion's documented-decision escape with reviewer-approved tickets.** That — not finding arithmetic — is why the number is 8.4 and not 9.5.

### 8.4 Named gaps (the honest 1.6)

- **PH4-ENGINE-021** (F-21, ~1.0 of multi-tenancy's 3 remaining points): global cooldown/metrics blast radius across tenants. Blocked by: MariaDB DDL hard stop.
- **PH4-ENGINE-022** (F-22 sub-item): `decisionId` not persisted per usage row. Blocked by: DDL hard stop.
- **PH4-ENGINE-026** (F-26, accepted): ≤15 s process-local config convergence in multi-instance deployments. Both fix paths blocked by engagement constraints (hot-path DB read / new infra dependency).
- **Speed-mode cold start** (part of routing's 2.0): "fastest wins" needs n≥3 window samples; warm-up prefers the primary. Deliberate anti-flapping design; an exploration budget would close it.
- **Quality tiers are finite static judgement** (part of honesty's 1.5): uncurated models can't be quality-ranked (honestly labelled `unknown`).
- **Observability's 1.5**: no full candidate-list/scores on the wire; telemetry route is the operator surface.

### 8.5 Recommendation (re-answered §5/§7)

The 2026-10-24 recommendation was: hold the multi-provider marketing claims; ship fixes; re-audit. **The four claim-breaching defects (unmetered gateway, cross-principal cache, dead BYOK, quality-less quality mode) are fixed and live-proven.** The engine now does what the product says, with two labelling caveats: "fastest model wins **once measured**" and "smartest wins **among curated models**". 

**Verdict: 8.4/10 — SHIP the engine claims with those caveats; NOT freeze-ready (<9.0).** Proposed continuation scope to reach ≥9.0: (1) PH4-ENGINE-021 tenant-scoped cooldown/metrics when the DDL window opens; (2) PH4-ENGINE-022 `decisionId` persistence in the same DDL; (3) a bounded exploration budget for speed-mode cold start; (4) cross-instance config invalidation if multi-instance deployment becomes real (PH4-ENGINE-026 revisit trigger).

**Environment caveat (unchanged):** all live probes ran against local OpenAI-compatible stubs and MariaDB 13.1.0-embedded via the sandbox bridge; routing code paths are identical to production, absolute latencies are not.
