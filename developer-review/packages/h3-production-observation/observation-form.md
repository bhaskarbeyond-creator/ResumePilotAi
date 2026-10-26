# Production observation cycle — evidence form (H.3)

Return this file filled. Empty fields = not observed = say so explicitly ("none observed" is a
valid, honest entry; blanks are not).

## 1. Deploy block (day 0)

| Field | Value |
|---|---|
| Operator | |
| Engine owner (second signature) | |
| Deploy date (UTC) | |
| Tree SHA deployed | |
| Instances / topology (single or multi-instance; process count) | |
| 028 applied? (date + window) | |
| 029 applied? (date + window) | |
| `FREELMAPI_TENANT_SCOPED_EVIDENCE` | 0 → 1 at (UTC) |
| `FREELMAPI_DECISION_LEDGER` | 0 → 1 at (UTC) |
| Tenants observed (ids or count) | |
| Expected daily routed-request volume | |

## 2. Day-0 baseline (flags OFF, before flip)

| Metric | Value |
|---|---|
| p50 routed latency (window: last 24 h) | |
| p95 routed latency | |
| Platform cooldown rows (`provider_cooldowns`, scope NULL/platform) | |
| Tenant/user-scoped cooldown rows (should be 0 with flag OFF) | |
| `routing_decisions` ring size + `PRAGMA integrity_check` | |
| `request_log.decision_id` non-NULL count (should be 0 with flag OFF) | |
| `enterprise_ai_usage.decision_id` non-NULL count (should be 0 with flag OFF) | |

## 3. Daily checks (days 1–13; fill only anomalies, or tick "nothing to report")

| Day | Anomaly (or ✓) |
|---|---|
| 1 | |
| 2 | |
| 3 | |
| 4 | |
| 5 | |
| 6 | |
| 7 | |
| 8 | |
| 9 | |
| 10 | |
| 11 | |
| 12 | |
| 13 | |

## 4. Exit-criteria block (day 14)

| Criterion | Measured | Pass/Fail |
|---|---|---|
| Zero cross-tenant benching events | | |
| Zero platform-cooldown clears from tenant-scoped activity (F-14) | | |
| `decision_id` join integrity usage↔request_log↔ring ≥ 99% (record ring size; pruned tail exempt) | | |
| p50 regression vs day-0 baseline ≤ 5% | | |
| Zero unknown-column SQL errors on any instance | | |
| Scoped rows observed in `provider_cooldowns` (`scope_key`, `credential_kind`) — how many, which scopes | | |
| Tenant key-pool events: per-credential benches observed (C.5) — count + scopes | | |
| A single end-to-end decisionId traced by hand (usage row → request_log → ring): paste the id | | |

## 5. Incident / rollback section (empty = no incidents)

| Field | Value |
|---|---|
| Incidents (timestamp, trigger, action) | |
| Flags rolled back? (when, why) | |
| 028/029 reverted? (when, why) | |

## 6. Sign-off

- [ ] All exit criteria measured and recorded (pass or fail — failures are evidence too)
- [ ] Baseline + exit blocks come from real telemetry reads (paste queries used, optionally)
- [ ] No field left blank

Operator: ______________________  Date: __________
Engine owner: __________________  Date: __________
