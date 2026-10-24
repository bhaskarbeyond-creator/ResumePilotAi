# AI Multi-Provider Engine — Rating & Release Recommendation

**Date:** 2026-10-24 · **Base:** `5bd2570` · **Auditor:** read-only review (no code changed)
**Scope:** routing / selection / execution engine. Settings **UI** is out of scope by instruction; it is referenced only where a control changes engine behaviour.

---

## 1. The number

# **5.0 / 10 — HOLD**

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
