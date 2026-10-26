# (e) One-page delta — what 9.5 looks like (honest weighting, no pre-inflation)

**Design-only. Baseline: rating §8.7 at `bb2b82b` = 8.650 → reported 8.7/10, NOT FREEZE-READY.**
Same dimension weights as the 5.0 baseline (they were never re-weighted; they will not be now).

## The arithmetic, plainly

| Dimension | Weight | Now (10-26) | After 021+022 only | Program ceiling | What the move requires |
|---|---:|---:|---:|---:|---|
| Routing decision correctness | 20 % | 9.0 | **9.5** (+0.100) | 9.5 | Tenant-scoped evidence removes the last correctness caveat (per-tenant latency profiles rank per-tenant); operator-tunable exploration interval documented for the 75-provider discovery-rate story. Evidence bar: (c)2.4 live two-tenant divergence probe + S1 9-test re-certification + A.9r3/r4 restated byte-equal on platform scope |
| Resilience & failover | 15 % | 9.0 | **9.5** (+0.075) | 9.5 | Cross-tenant benching removed as a failure amplifier (tenant penalties + scoped cooldowns), platform-credential physics honestly kept. Bar: (c)2.5 both-halves e2e + burst probe |
| Honesty of "smartest" | 15 % | 9.0 | 9.0 | **9.5** (+0.075) | NOT moved by 021/022. Moves only when the mesh-alias runbook is *operated*: first operator-verified promotions executed with evidence files + canary updates. Bar: ≥3 aliases promoted on T1/T2 evidence (runbook §4), zero name-inference, A.10-shape probe on a promoted alias |
| Multi-tenancy & isolation | 15 % | 7.0 | **9.0** (+0.300) | 9.5 (+0.075 more) | 021 is the whole move: tenant-scoped metrics + cooldown layers + BYOK evidence un-sink-holed, decision ledger joined per tenant (022). 9.0 not 9.5 at first landing: per-tenant upstream-account physics and ledger maturity need one production observation cycle; 9.5 additionally wants tenant key-pools wired through `enterprise_tenant_credentials` (027 table already exists). Bar: (c)2.2/2.4/2.5/2.7/2.8 all green + two-tenant live probes |
| Security & cost metering | 15 % | 9.0 | 9.0 | **9.5** (+0.075) | NOT moved by 021/022 (money path deliberately untouched). The residual is organizational: `ENTERPRISE_ENCRYPTION_KEY` rotation/fail-closed drill *rehearsed and evidenced* in the target environment (§8.5 Q4). Bar: drill transcript + A.12 restated post-rotation |
| Observability & explainability | 10 % | 8.5 | **9.5** (+0.100) | 9.5 | 022 is the whole move: `decisionId` wire→telemetry→SQLite→MariaDB join proven, candidate-list/scores exposed on the telemetry route (wire stays slim). Bar: (c)2.2 join e2e + redaction re-proof (c)2.8 |
| Ops / config ergonomics | 5 % | 8.5 | 8.5 | **9.5** (+0.050) | Scoped reset (F-13 extension) + scope-filtered telemetry route; PH4-ENGINE-026 stays accepted (multi-instance convergence unchanged by this program). Bar: (c)2.7 + route tests |
| Code quality & tests | 5 % | 9.5 | 9.5 | **10** (+0.025) | Only via burning down part of the 54 reasoned suppressions (react-refresh splits, dep-array reviews). Bar: repo-wide 0/0 preserved + suppression count materially reduced with per-site justification review |

**Totals (same weights, no inflation):**
- Today: **8.650 → 8.7**.
- **021+022 executed and certified: 8.650 + 0.100 + 0.075 + 0.300 + 0.100 = 9.225 → ~9.2.** Say it
  plainly: the two tickets alone do **not** reach 9.5. They are worth ~+0.58, and 0.30 of that is
  multi-tenancy — the dimension the deferrals created.
- Full program (021/022 at 9.5-maturity + runbook operated + ops + security drill + partial debt
  burn-down): 9.225 + 0.075 (multi-tenancy→9.5) + 0.075 (honesty) + 0.075 (security) + 0.050 (ops)
  + 0.025 (code) = **9.525 → 9.5 exactly, and only if every bar above is met with live evidence.**

## Reading of the delta (for the reviewer's freeze file)

1. The binding constraint is no longer engine logic — it is (i) the DDL window for 028/029 +
   approval for the Phase-A SQLite rebuilds, (ii) one *organizational* security drill, and (iii)
   operator labor on mesh-alias verification. None of the three is codeable around.
2. Nothing in this program touches the money path, auth, or the global limiter — the 9.2 landing
   is achievable without re-opening any P0 surface (F-01/F-09/F-19 stay certified-untouched;
   (b)/(d) encode that as a hard boundary).
3. If the reviewer's freeze bar stays 9.5-honest, the minimum credible sequence is: Phase A+C
   (no window needed) → 021 evidence lands (+0.475 total) → DDL window → 022 ledger (+0.100) →
   runbook operation + security drill (+0.150). Each arrow is independently verifiable; the score
   only moves when the evidence bar in the table above is met — not when the code merges.
4. **Pre-inflation guard:** this page assigns zero credit for designed-but-unexecuted work. Until
   the probes/tests listed per dimension are run and certified 10×, the official number remains
   **8.7/10, NOT FREEZE-READY** (rating §8.7).
