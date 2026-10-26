# AI Multi-Provider Engine — Rating & Release Recommendation

**Date:** 2026-10-24 · **Base:** `5bd2570` · **Auditor:** read-only review (no code changed)
**Scope:** routing / selection / execution engine. Settings **UI** is out of scope by instruction; it is referenced only where a control changes engine behaviour.

---

## 1. The number

# **5.0 / 10 — HOLD**

> **2026-10-25 UPDATE:** remediation of all 29 findings completed on `arena/21c2e4cd-resumepilotai` (tip `e848552`). The final re-rated score — **the number** — is in **§8**: **8.4 / 10 — NOT FREEZE-READY; ship-with-preconditions recommended — the freeze decision, including accept/reject of the A.5/A.9/A.10 preconditions (`engine-findings.md` §10), belongs to the reviewer**. Sections 1–7 below are the preserved 2026-10-24 baseline. **2026-10-26 UPDATE: the reviewer decided — A.9/A.10 rejected as final state, closed with code (`e606c72`, `ac93772`); the S3 spec repair landed (`a2eabd7`). The superseding number is §8.7: 8.7 / 10 — still NOT FREEZE-READY.**

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

## 8. Post-fix re-rating (2026-10-25) — THE NUMBER

> **Superseded 2026-10-26 by §8.7 (post-S1/S2/S3 re-rate: 8.7/10).** Sections 8–8.6 below are preserved verbatim as the 2026-10-25 record.

**Basis:** branch `arena/21c2e4cd-resumepilotai` (code tip `e848552`, docs `eb0512f`/`714ccdb`+); 26 findings FIXED (one commit each), 2 DEFERRED with reviewer-approved tickets (PH4-ENGINE-021, PH4-ENGINE-022), 1 ACCEPTED (PH4-ENGINE-026). Evidence: full backend suite **1221/1221, 0 fail, 0 skipped, SUITE_EXIT=0**; ~20 new specs each certified 10× (0 bad runs); **all 14 Appendix A probes restated live, every attempted leg reported including the misses** (audit doc → "Post-fix verification"); repo ESLint 0 warnings/0 errors, frontend oxlint 0/0, `tsc -b` 0, `vite build` 0; lockfiles 0-byte. This score is derived from that probe + test evidence — not from "26 closed therefore 10".

# **8.4 / 10 — NOT FREEZE-READY**

Weighted 8.375 with the **same dimension weights as the 5.0 baseline**, reported as 8.4. Below 9.0 → no freeze-ready claim (per the engagement's honesty rule). The recommendation at §8.6 is *ship-with-named-preconditions-and-continuation-scope*; **the preconditions in `engine-findings.md` §10 are NOT self-accepted here** — accepting them as design (or requiring PH4-ENGINE-030/031 first) is the reviewer's freeze decision.

| Dimension | Weight | Baseline (10-24) | Final (10-25) | Evidence | Residual (named, ticketed) |
|---|---:|---:|---:|---|---|
| Routing decision correctness | 20 % | 5.5 | **8.0** | F-04 save-time pin validation (A.7c: 400 with actionable message) + routing-time "empty pin = provider default"; F-07 windowed recency-weighted p50, n≥3 gate, fresh-failure circuit breaker — stale-sample misdirection eliminated; mature-window flip to the faster non-primary proven live (A.9r3, after A.9r1/r2 misses documented); F-05 explicit `AI_ENGINE` choice + bounded shadow divergence log; F-23 single enabled gate (A.4) | **Cold-start warm-up:** with n<3 per candidate, selection is primary-preference — a newly added fast provider may not win its first ~3 requests (**precondition A.9**; PH4-ENGINE-030 if rejected) |
| Resilience & failover | 15 % | 6.5 | **9.0** | F-03 pinned-down → 503 `provider_unavailable` + `Retry-After: 60`; opt-in `manualAllowFallback` fails over **with disclosure** (`fallbackFrom:"manual"`, A.8/A.8b — both documented modes live-proven); F-12 clamped Retry-After; F-14 last-resort cooldown release; F-11 maintenance runs; F-13 operator reset (used live as probe infrastructure); bounded failover with sanitized `fallbacks[]` preserved (A.5/A.5r); no hangs across 40+ probe calls | Single-provider deployments still depend on the last-resort release policy rather than real redundancy (inherent, documented) |
| Honesty of the "smartest" claim | 15 % | 3.0 | **8.5** | F-06 curated tier table decides quality mode: premium `gpt-4o` chosen over the faster economy primary with **zero latency observations** (`observationCount:0`), `qualityEvidence:"curated-tier:premium"` (A.10r2); uncurated models honestly stay `"unknown"` with no bonus (A.10r1); no fabricated quality, no relabelling | **Finite registry:** models outside the curated table cannot be quality-differentiated (**precondition A.10**; PH4-ENGINE-031 if rejected) |
| Multi-tenancy & isolation | 15 % | 4.5 | **7.0** | F-02 principal-scoped cache (A.2 `cached:false`); F-08 tenant BYOK reaches the provider (stub-asserted); F-09 platform-key tenant traffic records metrics/cooldowns; F-17 tenant audit metadata live; F-27 one quota resolution, explicit-0 blocks, fail-closed | **PH4-ENGINE-021 (F-21, reviewer-approved deferral): cooldowns/metrics remain platform-scoped — one tenant's 429 burst can bench a provider for every tenant.** PH4-ENGINE-022: no per-row `decisionId`. Both DDL-blocked in this engagement. These deferrals are the 3.0 |
| Security & cost metering | 15 % | 3.0 | **9.0** | F-01 `/v1` under the exact `/api/ai*` admission chain, charged pre-invocation (A.6: `ai_usage` +3; the A.9/A.10 first-run 429s are the ledger working); F-10 status gated + reduced (A.13); F-19 AES-256-GCM envelopes at rest (A.12: 0 plaintext); F-20 sanitized error boundary (A.5r); F-18 token/cost persisted, null-when-unknown; F-29 single force mechanism + attributable sanitized audit trail; A.11 LIKE-scan 0 | Key envelopes fail closed without `ENTERPRISE_ENCRYPTION_KEY(S)` — an operational provisioning requirement, not a code gap (§8.6 Q4) |
| Observability & explainability | 10 % | 6.0 | **8.5** | F-22 telemetry + health route (super-admin, redacted); `routing_decision.observedLatencyMs/observationCount` live on the wire in every probe; F-16 configured-vs-enabled split; F-13 reset; F-17 audit metadata | No durable per-request `decisionId` join key (PH4-ENGINE-022); wire `routing_decision` still omits the full candidate list/scores (telemetry route is the operator surface) |
| Ops / config ergonomics | 5 % | 6.5 | **8.5** | F-15 no fabricated toggles (A.11); F-24 dead flag removed; F-29 one force spelling + force-reason captured; F-04 rejection message tells the operator exactly what to set; hot reload ≤12 s preserved (A.3/A.4) | **PH4-ENGINE-026 (F-26, reviewer-accepted):** config propagation stays process-local, ≤15 s multi-instance convergence |
| Code quality & tests | 5 % | 7.5 | **9.5** | F-25: repo-wide ESLint **149→0 warnings/0 errors**, frontend oxlint **295→0/0**, `tsc -b` 0, `vite build` 0; 135-file dead-code excision (+150/−571), hook-slot-preserving elisions, hand-checked regex-escape semantics; 54 targeted per-site disables each with an honest reason; zero blanket disables. Suite 1221/1221; every campaign spec 10×-certified; five existing-test edits were literal-contract corrections, each disclosed in its commit | The disable-with-reason population (54) is a tracked debt surface: react-refresh file splits and dep-array reviews remain future work |

**Weighted total:** 8.0×.20 + 9.0×.15 + 8.5×.15 + 7.0×.15 + 9.0×.15 + 8.5×.10 + 8.5×.05 + 9.5×.05 = **8.375 → 8.4/10**.

**Mapping to the reviewer's 7-dimension view (2026-10-25 mandate):** consumer correctness ≈ routing+resilience (8.0/9.0); **routing intelligence** ≈ routing (8.0) + honesty-of-smartest (8.5) → combined ≈ 8.25, i.e. the 9/10-branch treatment: the ~1 point of combined gap is exactly **"cold-start latency requires n≥3 observations"** and **"niche models absent from the tier registry"** — offered as PH4-ENGINE-030 / PH4-ENGINE-031; per the 8/10-branch honesty test, the user-observable failures are named: *a newly added fast provider may serve its first ~3 requests on the slower incumbent, and quality mode cannot rank uncurated models (it says `unknown` rather than guessing)*. **BYOK/multi-tenant = 7.0** with PH4-ENGINE-021 named as the 3.0 gap (metering/keys/BYOK-read are 10/10; cooldown/metrics remain platform-scoped by accepted deferral). Reliability under failure = 9.0. Observability = 8.5. **Code quality/warnings = 9.5** (0/0 both linters; not 10 because the 54 reasoned suppressions are documented debt, not zero debt). Security metering = 9.0.

### 8.1 Ship/hold matrix, re-answered (was §2)

| Claim | 2026-10-24 | 2026-10-25 | Evidence |
|---|---|---|---|
| "Multiple providers with automatic failover" | TRUE | **TRUE** (unchanged) | A.5/A.5r `fallbacks[0]` populated, sanitized |
| "Manual pin always uses the chosen provider" | TRUE with undisclosed outage coupling | **TRUE, and the coupling is now disclosed**: pinned-down → 503 + Retry-After; opt-in fallback announces `fallbackFrom:"manual"` | A.8/A.8b |
| "Fastest model wins" | PARTIAL (stale-sample misdirection) | **TRUE once measured; PARTIAL during cold-start warm-up** (n<3 → primary-preference): flip proven at maturity | A.9r1/r2/r3; precondition A.9 |
| "Smartest model wins" | FALSE | **TRUE for curated models** (tier-backed, decided with zero latency evidence); honestly `unknown` for uncurated | A.10r1/r2; precondition A.10 |
| "Per-tenant BYOK" | FALSE (write-only) | **TRUE** — stub-asserted tenant key reaches the provider | `tenant-byok-read-path.test.js` |
| "Quotas enforced" | FALSE for `/v1` | **TRUE everywhere** — durable ledger charged pre-invocation | A.6 (+ the A.9/A.10 first-run 429s) |
| "Tenant isolation" | PARTIAL | **PARTIAL→mostly TRUE**: cache isolated, BYOK sanctuary closed, audit metadata live; **cross-tenant cooldown blast radius remains (PH4-ENGINE-021)** | A.2; F-09/F-17 tests |
| "No restart to change providers" | TRUE | **TRUE** (unchanged; ≤12 s) | A.3/A.4 |
| "Keys are never exposed" | TRUE in admin API, FALSE at rest | **TRUE in admin API AND at rest** (envelopes) | A.11/A.12 |
| "Rollback with `ai_settings_v2_enabled`" | FALSE (cosmetic) | **Claim removed** — flag and UI control deleted; no fake rollback switch remains | F-24 |

### 8.2 "Do not regress" list (§3) — confirmed, none regressed

1. **Admin credential hygiene** — CONFIRMED, strengthened (F-19 envelopes; F-29 attribution; A.11 LIKE-scan 0).
2. **Bounded failure behaviour** — CONFIRMED (no hangs across all restatement legs; machine-readable codes on every failure; per-candidate bounds intact).
3. **Honest degradation (no invented content)** — CONFIRMED (validation path untouched; suite green; `null`-when-unknown accounting, F-18).
4. **Tenant-scoped state in the new engine** — CONFIRMED and now *used* (F-08/F-09/F-17 wiring; F-22 exposure).
5. **Durable cooldowns** — CONFIRMED (hydration intact; F-12 clamped Retry-After; F-14 last-resort release; F-13 operator reset).
6. **Real tests** — CONFIRMED, expanded (55 engine tests → 1221-test suite; ~20 new specs each 10×-certified; zero assertion-loosening — five literal-contract corrections, each disclosed).

### 8.3 The eight criteria for 9.5 (§4) — status of each, with the proving test

1. **No unmetered inference path** — **MET.** `backend/test/v1-admission-control.test.js` enumerates the router stack and fails if any `/v1` route lacks the chain; live A.6 charges the ledger.
2. **Isolation is provable** — **MET for cache/principal** (`freellmapi-cache-scope.test.js`; A.2). Cooldown/metrics tenant scope: **DEFERRED by documented reviewer-approved decision** (PH4-ENGINE-021) — the criterion's own "or a documented decision explains why not" branch.
3. **Pins and modes mean what they say** — **MET.** `freellmapi-manual-empty-pin.test.js` + A.7c (save refused); `freellmapi-manual-fallback.test.js` + A.8/A.8b (`fallbackFrom:"manual"`); `freellmapi-quality-tier.test.js` + A.10r2 (real curated signal).
4. **Tenant BYOK is live** — **MET.** `tenant-byok-read-path.test.js` (stub asserts the tenant key); `tenant-byok-tier-resolution.test.js` (platform-key tenant traffic records metrics).
5. **Selection evidence is durable** — **MET for windowed aggregates** (`freellmapi-rolling-rank.test.js`; `observationCount`/`observedLatencyMs` live on the wire). Per-inference `decisionId` in usage rows: **DEFERRED** (PH4-ENGINE-022); operators resolve decisions via the F-22 route + F-17 metadata meanwhile.
6. **One engine** — **MET.** `ai-engine-choice.test.js`: `AI_ENGINE` explicitly selects `freellm|shadow|aiRouting`; the new selector is no longer reachable only through an accidental error class; shadow keeps a bounded, secret-free divergence log.
7. **Operable** — **MET.** `admin-ai-reset-state.test.js` + `admin-routing-telemetry-route.test.js` (super-admin); `/v1/status` authenticated + reduced (A.13); reset route used live between probe legs.
8. **Zero-warning bar** — **MET, beyond the bar.** Not just engine files: repo-wide ESLint 0 warnings/0 errors (149→0), frontend oxlint 0/0 (295→0), `tsc -b` 0 (`e848552`); the 54 remaining suppressions are per-site, reasoned, behaviour-preserving by policy.

**6 of 8 fully met; 2 met via the criterion's documented-decision branch with reviewer-approved tickets.** That — not finding arithmetic — is why the number is 8.4 and not 9.5.

### 8.4 Named gaps (the honest 1.6)

- **PH4-ENGINE-021** (F-21): global cooldown/metrics blast radius across tenants — the largest residual (~1.0–1.5 of the gap; the bulk of multi-tenancy's missing 3.0). Blocked by: MariaDB DDL hard stop.
- **PH4-ENGINE-022** (F-22 sub-item): `decisionId` not persisted per usage row. Blocked by: DDL hard stop.
- **PH4-ENGINE-026** (F-26, accepted): ≤15 s process-local config convergence in multi-instance deployments. Both fix paths blocked by engagement constraints.
- **Precondition A.9** (speed cold start): n≥3 window samples before latency flips selection; warm-up = primary-preference. Candidate ticket **PH4-ENGINE-030** (bounded exploration budget) if the reviewer rejects the precondition.
- **Precondition A.10** (finite curated tiers): uncurated models cannot be quality-ranked (honestly `unknown`). Candidate ticket **PH4-ENGINE-031** (registry auto-discovery, never-guessed rule preserved) if rejected.
- **Observability remainder**: no full candidate-list/scores on the wire (telemetry route covers operators).

### 8.5 The five ship/hold questions, re-answered (2026-10-25)

1. **Would you ship this engine to 1,000 customers today?** **Yes — with preconditions.** (a) Reviewer accepts preconditions A.9/A.10 as design (findings §10) or schedules PH4-ENGINE-030/031; (b) PH4-ENGINE-021's cross-tenant cooldown blast radius is accepted for the current traffic profile or scheduled first — at 1,000 customers this is the item most likely to bite; (c) `ENTERPRISE_ENCRYPTION_KEY(S)` provisioned and fail-closed behaviour rehearsed in the target environment; (d) single-instance deployment, or ≤15 s config convergence (PH4-ENGINE-026) accepted.
2. **Single highest-risk thing in the engine right now:** the platform-scoped cooldown/metrics stores (F-21/PH4-ENGINE-021) — one tenant's burst or one tenant's abusive traffic against a provider benches it for *everyone*. Everything else that was P0/P1 is closed and probe-proven.
3. **Single highest-value fix done in this engagement:** F-01 — `/v1` admission control (`875d4c7`). It converted an unmetered, ungoverned paid-capacity gateway into the exact admission chain the product advertises, and every restatement leg (A.6, and the A.9/A.10 first-run 429s) proves the ledger charging.
4. **The ONE thing it would be irresponsible to ship without:** provisioned, verified key-encryption operations — `ENTERPRISE_ENCRYPTION_KEY(S)` present in every instance with a rehearsed rotation/fail-closed drill. The envelopes (F-19) fail closed by design: without the key the engine cannot read its own provider secrets, and the tempting "fix" (plaintext fallback) would re-open F-19.
5. **Does "fastest + smartest active model" survive the audit?** **Yes — with preconditions.** (i) A.5: a failing primary is preemptively skipped once its failure window is mature — correct behaviour, **no precondition**; (ii) A.9: "fastest" activates only after ≥3 windowed observations per candidate (warm-up = primary-preference); (iii) A.10: "smartest" differentiates only models present in the curated tier registry (others honestly `unknown`). **This document does not self-accept (ii)/(iii).** Recommendation: accept A.5 as design; for A.9/A.10 the reviewer chooses — accept as documented design trade-offs, or require PH4-ENGINE-030 (cold-start exploration) and PH4-ENGINE-031 (registry auto-discovery) before freeze.

### 8.6 Recommendation (re-answered §5/§7)

The 2026-10-24 recommendation was: hold the multi-provider marketing claims; ship fixes; re-audit. **The four claim-breaching defects (unmetered gateway, cross-principal cache, dead BYOK, quality-less quality mode) are fixed and live-proven.** With preconditions A.9/A.10 labelled, the marketing claims are now accurate: "fastest model wins **once measured**", "smartest wins **among curated models**".

**Verdict: 8.4/10 — NOT freeze-ready (<9.0); ship-with-preconditions is defensible today; the freeze decision belongs to the reviewer.** Continuation scope to ≥9.0, in priority order: (1) PH4-ENGINE-021 tenant-scoped cooldown/metrics when the DDL window opens; (2) PH4-ENGINE-022 `decisionId` persistence in the same DDL; (3) PH4-ENGINE-030 cold-start exploration budget (if precondition A.9 is rejected); (4) PH4-ENGINE-031 tier auto-discovery (if precondition A.10 is rejected); (5) cross-instance config invalidation if multi-instance deployment becomes real (PH4-ENGINE-026 revisit trigger).

**Environment caveat (unchanged):** all live probes ran against local OpenAI-compatible stubs and MariaDB 13.1.0-embedded via the sandbox bridge; routing code paths are identical to production, absolute latencies are not.

### 8.7 Post-mandate re-rate (2026-10-26) — THE CURRENT NUMBER

**Basis:** reviewer accepted the 8.4, then rejected preconditions A.9/A.10 as a final state and mandated: S1 = PH4-ENGINE-030 (cold-start exploration, routing 8.0→≥9.0 without regressing the A.9r3 flip), S2 = PH4-ENGINE-031 (tier coverage, honesty 8.5→≥9.0), S3 = repair `freellmapi-admin-e2e` ("do NOT leave it as 47/47 fail"). All three delivered on this branch: **S1 `e606c72`**, **S2 `ac93772`**, **S3 `a2eabd7`**; findings §10 updated in `1a9036c`. Evidence base for this re-rate: S1 tests 9/9 10×-certified + live BEFORE/AFTER probes (25/25 chicken-and-egg reproduced BEFORE; ticks at 20/40/60 and call-61 merit flip AFTER, 3 diversions in 61 calls = 4.9%); S2 tests 6/6 10×-certified + live A.10r3 BEFORE/AFTER (`qualityEvidence:"unknown"` → `"curated-tier:premium"`, flip at call 1); S3 spec 47/47 passing, 10× certified, zero flakes, BEFORE run 47/47 failing on the identical stack; backend suite **1236/1236** (1221 + 9 S1 + 6 S2), fail 0, skipped 0, SUITE_EXIT=0; eslint/oxlint 0/0 on every touched file; lockfiles 0-byte throughout.

| Dimension | Weight | 10-25 | **10-26** | What moved (and what still caps it) |
|---|---:|---:|---:|---|
| Routing decision correctness | 20 % | 8.0 | **9.0** | S1: the never-sampled-candidate chicken-and-egg is closed — bounded (≤1-in-20, ≤5%), wire-marked (`exploration:'cold-start'`) exploration in intelligent modes only; manual/explicit/quality/BYOK-sanctuary/fallback-disabled paths untouched; breaker-demoted candidates never targeted; AFTER probe: observationCount 0→1→2 on ticks, **call 61 flips on merit** (153 ms vs 3003 ms) with no pin and no outage; the A.9r3 mature-window flip is preserved (asserted in the new e2e test — no regression). Capped below 9.5: warm-up is still primary-preference for a never-sampled candidate's first ~19 calls, and one-target-per-tick means full discovery across a 75-provider catalog is slow by design (bounded budget is the point, but it is a rate limit). |
| Honesty of the "smartest" claim | 15 % | 8.5 | **9.0** | S2: curated coverage of chat-capable catalog ids 17/80 → **37/80** (table 27→47) from documented public benchmark evidence (LMSYS Arena bands, ArtificialAnalysis classes), aliases tier-consistent; the remaining 43 unknowns are **provable deliberate absences** — a drift-canary test pins the exact 80 = 37 + 43 split (40 opaque mesh aliases where a `-70b`/`-fast` suffix is not evidence, 3 insufficiently-benchmarked ids, 3 tool endpoints); live A.10r3: unknown→`curated-tier:premium` flip at call 1. Capped below 9.5: 40 mesh aliases stay undifferentiable until operators verify backing-model identity — an external-data boundary, documented in-code, not a curation omission. |
| Code quality & tests | 5 % | 9.5 | **9.5** (basis strengthened) | S3: the rotted 47-test admin e2e spec (pre-existing at tip AND base, cmp-verified) repaired to 47/47 × 10 certified runs — selectors re-anchored to the real DOM (prefixed testids, Radix 1.3.1's `role="dialog"` without `aria-modal`, real labels, invalid comma-text syntax removed, missing authentication added, all `waitForTimeout` removed), **no assertion loosened** (count ≥70 kept, containment math unchanged, real error paths asserted instead of fabricated successes). Suite 1221→1236. Score unchanged — the dimension was already at its capped value; the rot repair removes a standing counter-example that the 10-25 rating had disclosed. |
| All other dimensions | — | — | **unchanged** | No code touching resilience (9.0), multi-tenancy (7.0), security (9.0), observability (8.5) or ops (8.5) was modified in S1/S2/S3; their 10-25 evidence and residuals stand verbatim. |

**Weighted total:** 9.0×.20 + 9.0×.15 + 9.0×.15 + 7.0×.15 + 9.0×.15 + 8.5×.10 + 8.5×.05 + 9.5×.05 = 1.800 + 1.350 + 1.350 + 1.050 + 1.350 + 0.850 + 0.425 + 0.475 = **8.650 → 8.7/10**.

# **8.7 / 10 — STILL NOT FREEZE-READY**

Said plainly, in the reviewer's own arithmetic: S1 hit its target (routing 8.0→9.0) and S2 hit its target (honesty 8.5→9.0 — the full option-(b) delivery, not the partial 8.7 the reviewer hypothesised), **and the total still moves only 8.4 → 8.7**, because the number is dominated by the untouched 15%-weight dimensions — above all **multi-tenancy 7.0** (PH4-ENGINE-021/022, DDL-blocked, reviewer-approved deferrals). 8.65 < 9.0 → no freeze-ready claim per the engagement's honesty rule, and the honest freeze bar remains 9.5. No dimension was inflated: every move above is tied to fresh 10×-certified tests plus live BEFORE/AFTER probes listed in the basis line; unchanged dimensions keep their 10-25 values verbatim.

**Precondition/ticket status after this re-rate:** A.5 — none required (unchanged). A.9 — **CLOSED** (`e606c72`; findings §10 closure note). A.10 — **CLOSED** (`ac93772`; findings §10 closure note). PH4-ENGINE-030/031 — **DELIVERED**. PH4-ENGINE-021/022 — still deferred (DDL hard stop; they are now *the* gap). PH4-ENGINE-026 — accepted. `freellmapi-admin-e2e` — **repaired and back inside the gate**; the interim "excluded: pre-existing rot, S3 in progress" marker is lifted as of `a2eabd7`.

**Ship/hold delta vs §8.5/§8.6:** Q1 precondition (a) (schedule-or-accept A.9/A.10) is **resolved — closed with code**; the single highest-risk item for 1,000 customers is unchanged: PH4-ENGINE-021's platform-scoped cooldown blast radius. Continuation scope to 9.5, in priority order: (1) PH4-ENGINE-021 tenant-scoped cooldown/metrics (15% × ~2.5 points — the only path to a freeze-bar total); (2) PH4-ENGINE-022 `decisionId` persistence (observability →9.5); (3) operator-facing mesh-alias backing-model verification workflow (honesty →9.5); (4) full candidate-score list on the wire (observability remainder).
