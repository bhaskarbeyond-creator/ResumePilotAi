# R17 — Dimension ceiling table and maximum honestly-declarable score

Date: 2026-10-26. Branch: `arena/21c2e4cd-resumepilotai`. Evidence state: tenant archive run 8b
committed at `4c383cf` (all three legs ALL-TRUE on the tightened sentinel); platform archive at
`06724ec`; this doc is committed on the tip after the final full-suite gate.
Bars and weights: `developer-review/prep-021-022/path-to-9.5.md` (authoritative). Evidence:
`developer-review/probes/2026-10-26/` (committed transcripts) + the session commit ledger.

Rules applied (mandate): NO pre-credit of designed-but-unexecuted work; human-gated packages are
execution-ready but NOT counted; the official number is whatever the verifier's evidence says;
no freeze-readiness declaration is made here.

| # | Dimension | Weight | Ceiling | Autonomously achievable NOW (evidence) | Human-gated remainder |
|---|-----------|-------:|--------:|------------------------------------------|------------------------|
| 1 | Routing-decision correctness | 20% | 9.5 | **9.5** — 2.4 live two-tenant divergence probe green (`a15r1`: divergenceProven, 7/7), S1 nine-test battery re-certified ×10 against both code shapes, A.9r3/A.9r4 restated byte-equal on platform scope (hard-stop gate PASSED, 0 divergences / 66 calls) | none below ceiling |
| 2 | Resilience & failover | 15% | 9.5 | **9.5** — 2.5 both halves proven live: scoped benches + F-14 scoped releases (`a15r2`: crossTenantCooldownProven + physicsHonestyProven, 12/12 verdict fields, exact `'platform'` sentinel asserted) and the physics-honesty leg (model-pinned platform-credential 429 benches groq platform-wide → T3's platform-credential traffic cools to openai while the bench is active; T2's BYOK sanctuary ignores platform benches — asserted, not fixed away); A.5 scoped cooldown/hydration certified ×10; scope_key sentinel invariant verified on all three scoped tables (`scope-key-sentinel-verification.txt`) | none below ceiling |
| 3 | Honesty-of-smartest | 15% | 9.5 | **9.0** — curated-tier flip re-certified live (A.10r3 byte-equal, 6/6 `curated-tier:premium`), F-06 no-relabeling pinned; but the ≥3 mesh aliases operator-promoted on T1/T2 have never been executed | H.2 worksheet (`docs/ai-settings/tier-curation/`, `scripts/dev-db/fingerprint-probe.sh`): operator promotes ≥3 aliases (~25 min) → +0.075 |
| 4 | Multi-tenancy & isolation | 15% | 9.5 | **9.0** — C.1/C.4/C.5 landed and live-proven (tenant-scoped evidence, scoped reset route echoes, dedicated-BYOK sanctuary pool semantics, zero platform pollution in `provider_metrics`), platform byte-equality preserved, batteries ×10; but no production observation cycle has ever run | H.3 template (`developer-review/packages/h3-production-observation/`): one 14-day observation cycle → +0.075 |
| 5 | Security & cost-metering | 15% | 9.5 | **9.0** — money path untouched (hard boundary honored), 028/029 dry-run in WASM only (R12, "REAL WINDOW PENDING"), H.1 package part 1 debugged green; the drill itself has never run in the target environment | H.1 drill (`developer-review/packages/h1-security-drill/`, `scripts/dev-db/enterprise-key-rotation-drill.sh`): operator executes part 2 in target env (~30 min) → +0.075 |
| 6 | Observability & explainability | 10% | 9.5 | **9.5** — decisionId multi-hop e2e live (`a16`: singleIdE2E 6/6 incl. MariaDB `enterprise_ai_usage.decision_id` join via the real repository write path, 029 capability probe green); routing_decisions ring + telemetry route (scope filter) landed; honest topology disclosed in transcript | none below ceiling |
| 7 | Operational ergonomics | 5% | 9.5 | **9.5** — C.4 scoped `reset-state` (400 INVALID_RESET_STATE_SCOPE, super-admin, per-scope honest echoes — proven at route layer in tenant run 3 and in-process in `a15r2`), reset route tests ×10 | none below ceiling |
| 8 | Code quality & testing | 5% | 10 | **9.7** — R13 inventory: 156 directives repo-wide (154 root src/), zero provably-redundant, every kept directive justified one-line (`developer-review/suppression-inventory-r13.md`); suite 1334/1334 fail-0 skip-0 at tip (1319/1319 at ee1b237 era; count varies with dynamic
integration subtests); all new tests certified ×10; lint gates 0/0 every commit | 71 exhaustive-deps + 82 react-refresh restructures need product-owner sign-off on component splits/deps (~0.015 to 10) |

## Weighted maximum from this mandate alone

```
9.5×0.20 + 9.5×0.15 + 9.0×0.15 + 9.0×0.15 + 9.0×0.15 + 9.5×0.10 + 9.5×0.05 + 9.7×0.05
= 1.900 + 1.425 + 1.350 + 1.350 + 1.350 + 0.950 + 0.475 + 0.485
= 9.285  →  declare 9.3 / 10
```

## Plain statement

**The maximum honestly-declarable number after this mandate, on this branch's evidence alone, is
9.3 / 10.** It is NOT a freeze declaration — freeze-readiness is the verifier's call against a
re-run on the new tip. The program ceiling is 9.525 → 9.5 (7 dimensions capped at 9.5; code/
tests capped at 10): reaching it requires exactly three human-executed bars — H.1 security drill
in the target environment (+0.075), H.2 mesh-alias operator promotions (+0.075), H.3 one
production observation cycle (+0.075) — plus the disclosure-gated suppression restructure
(+0.015). All four packages are committed, execution-ready (<30 min each for H.1–H.3), and NOT
pre-credited in the 9.3.

Ceiling argued once, with evidence: the 9.5-per-dimension cap and the three human-gated bars come
from `path-to-9.5.md` (accepted earlier as the authoritative bar list); nothing in this mandate's
evidence exceeds those bars, and no dimension is claimed above its bar state.
