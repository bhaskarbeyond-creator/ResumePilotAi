# Probe archive — 2026-10-26 (R15)

All transcripts in this directory are **committed evidence** (never /tmp). Score claims are made
only against these archived files. Harness: `../harness/` (rebuilt in-tree after the original
/tmp scripts were lost with the sandbox — reconstruction disclosed in commit bodies
`fe0195d`/`a4231ff`/`b89fa75`/`1174e83`/`e1a807c`/`83ee887`/`2269505`).

## Platform battery — C.1 hard-stop gate (flags OFF, byte-equality vs verified baseline)

Targets: `baseline-bb2b82b` = clean clone at tag `verified-bb2b82b`; `tip-flags-off` = branch tip
with `FREELMAPI_TENANT_SCOPED_EVIDENCE` / `FREELMAPI_DECISION_LEDGER` at their defaults (0).
Comparison surface: call/status/provider/model/cached/mode/exploration/qualityEvidence/
observationCount/lastResort/fallbacks/decisionIdPresent/content. Timing fields excluded
(physically nondeterministic) — disclosed in `compare-transcripts.mjs` and every verdict file.

| Leg | Files | Result |
|---|---|---|
| A.9r3 (manual-pin maturity → speed flip) | `a9r3-{baseline-bb2b82b,tip-flags-off}.jsonl`, `a9r3-byte-equal-verdict.txt` | **byte-equal (5 calls, 0 divergences)**; flipProven=true on BOTH targets; served openai/gpt-4o on windowed evidence, zero beta posts |
| A.10r3 (quality flip on curated tier) | `a10r3-{baseline-bb2b82b,tip-flags-off}.jsonl`, `a10r3-byte-equal-verdict.txt` | **byte-equal (6 calls, 0 divergences)**; 6/6 served gemini-1.5-pro, qualityEvidence `curated-tier:premium`, flip on call 1 |
| A.9r4 (cold-start exploration budget, 61 calls) | `a9r4-{baseline-bb2b82b,tip-flags-off}.jsonl`, `a9r4-byte-equal-verdict.txt` | **byte-equal (61 calls, 0 divergences)**; diversions at exactly 20/40/60 (`exploration:"cold-start"`, observationCount 0→1→2), merit flip at 61 (observationCount 3, no marker), 3/61 = 4.9% ≤ 5% budget, budgetOk+flipOnMerit true on BOTH |

**Conclusion: with both flags OFF the tip is byte-identical to `verified-bb2b82b` on the platform
routing surface — the C.1 re-run requirement is satisfied (run 4; runs 1–3 invalidated by harness
defects, all disclosed).**

Env disclosures (in every transcript `meta` line): `AI_BURST_LIMIT=200/60s` identical on both
targets (the /v1 admission limiter defaults to 12/60s — env-tunable by design in
`security/abuse.js`; the 61-call sequence needs headroom; limiter stays ACTIVE),
`FREELMAPI_METRICS_DB=:memory:`, fresh MariaDB database per (leg, target).

## Tenant legs — new behaviour (tip only, flags ON)

`a15r1/a15r2/a16-tip-flags-on.jsonl`. Design (disclosed in `../harness/leg-tenant.mjs` header):
the legs drive the REAL engine singleton in-process (`backend/freellmapi` `completeChat` /
`resetCooldowns` — the exact functions the HTTP routes call) with a URL-rewriting `fetchImpl`
pointing registry baseUrls at local stubs, because dedicated-BYOK candidates dispatch to the
registry's real provider baseUrl **by design** and the sandbox has no external egress. Real
MariaDB-backed encrypted BYOK credentials (real registry + F-08 read path), real SQLite scoped
stores, real enterprise repository write path. The HTTP route layer (preview-login, tenant
resolution, deny-by-default aiPolicy CAS grant, `X-Tenant-Id`, scoped reset-state route echoes
with per-scope messages) was proven live in tenant run 3 (superseded transcripts; cited in commit
`e1a807c`).

| Leg | Verdict | Key evidence lines |
|---|---|---|
| A.15r1 two-tenant scoped-evidence divergence | **divergenceProven=true (7/7)** | T1's injected-failure BYOK benched ONLY `tenant:<T1>` (`credential_kind:"byok"`); T2 served by its own key (`isDedicatedByok:true`, stub `lastAuth` = T2 key); platform control served openai; platform scope has ZERO groq failures/benches; T1 never served by its failing key (sanctuary throws honestly; seq-2 shows the by-design last-resort release marker) |
| A.15r2 cross-tenant cooldown + F-14 releases | **crossTenantCooldownProven=true + physicsHonestyProven=true** | platform-wide outage hit both tenants with SEPARATE scoped rows; `resetCooldowns(platform)` (the C.4 route's function) cleared platform rows and KEPT both tenant scopes; `resetCooldowns(tenant:T1)` cleared exactly T1; T2's bench persisted until its OWN release (last-resort marker pre-release, absent post-release); recovery served. Physics-honesty leg (test-plan item 5): a model-pinned platform call (an unpinned policy call would rank around the 429 stub and never attempt groq) drove groq into RATE_LIMIT_EXCEEDED → platform bench row persisted (`scope_key:"platform"`, `credential_kind:"platform"`) → T3 (no BYOK) fell to openai while the bench was active even after the stub recovered → T2's BYOK sanctuary IGNORED the platform bench (served groq) — documented, asserted, not fixed away. 12/12 verdict fields true |
| A.16 decisionId multi-hop | **singleIdE2E=true (6/6)** | D1 (platform): result/wire object → SQLite `routing_decisions` ring → `request_log.decision_id`. D2 (tenant): ring row with `scope_key=tenant:<id>` → `request_log` → **MariaDB `enterprise_ai_usage.decision_id` = D2** via the real repository write path (029 capability probe: column present). Honest topology disclosure: the tenant HTTP wire does not expose decisionId by design, so no single id crosses all five hops on one call; the F-22 route's in-memory ring belongs to the aiRouting engine (`sel-*` namespace) — the `telemetry.record({decisionId})` plumbing contract is unit-pinned (`decision-id-plumbing.test.js` test 4) |

## Restatements

- **A.12 restatement** (envelope at rest + fail-closed rotation): `scripts/dev-db/enterprise-key-rotation-drill.sh`
  + `../../packages/h1-security-drill/` — package part 1 executed green during package debugging
  (disclosed, NOT pre-credited); the human drill remains the scored artifact.
- **R12 dry-run**: `r12-migration-dry-run-sandbox.txt` (028/029 WASM-bridge dry run,
  EXECUTED-IN-WASM — REAL WINDOW PENDING). Note for operators: `initializeSchema → runMigrations`
  applies the migrations directory automatically, which the tenant-leg databases demonstrate live
  (ddl-probe lines: `enterprise_ai_usage.decision_id` present without manual DDL).
