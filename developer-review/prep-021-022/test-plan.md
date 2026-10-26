# (c) Test plan — DDL-free now, integration/e2e exactly enumerated for post-migration

**NOT EXECUTED — DDL-GATED package. Design only: no test file has been written or run.**
Hard rule honored: *no test below (part 1) requires a new column or table to exist anywhere.*
Part 2 lists the exact tests that become writable only after migrations land. Engagement bar applies
to all of it eventually: `node:test`, 10× fresh-process certification, zero `console.*`, zero
`waitForTimeout`, no assertion loosening.

---

## Part 1 — tests that run WITHOUT DDL (fakes/stubs only)

All part-1 tests exercise **logic that already exists or ships behind capability probes**, against
in-memory fakes implementing the *current* store interfaces. They are valuable even if the DDL
window never opens: they pin the tenant-scoping contract and the decisionId plumbing semantics.

### 1.1 `backend/test/tenant-scoped-evidence-contract.test.js` (new, ~9 tests)

Fake: `FakeMetricsPersistence` — `Map`-based, implements `recordRequest`, `getRollingAggregates`,
`clearCooldown`, `resetAll` with an **optional** `scopeKey` parameter (defaults `'platform'`; the
fake tolerates the parameter without any schema — it is a JS object contract, not a column).

1. **Platform path invariance:** recording without a scope and reading without a scope yields
   aggregates identical to today's shape (`{n, successes, failures, lastAt, lastOk, lastStatus,
   successSamples}`) — pins the regression contract for the 1236-suite platform behavior.
2. **Scope isolation (reads):** tenant A observations never appear in tenant B's or the platform's
   aggregates; counts per scope exact.
3. **Scope isolation (writes):** `recordRequest({scopeKey:'uid:h1'})` leaves the platform window
   byte-identical (same inputs → same aggregates as an unscoped control fake).
4. **Sink-hole replacement contract:** a `scoped:true`-shaped BYOK observation routed to
   `scopeKey='uid:{hash}'` is *retained in that scope* (the fake asserts the router-side helper's
   decision table: dedicated-BYOK → tenant scope; platform-key → platform scope; never cross).
5. **Window math per scope:** recency-weighted p50 + n≥3 gate computed per scope (seeded samples;
   deterministic — reuses the S1 certification fixture pattern, including the weighted-median
   `[3ms,100,100]→100` seed).
6. **Sample-cap per scope:** `maxSamples=10` applies within a scope, not globally (A's 10 samples
   don't evict B's seeds).
7. **Cooldown scope semantics (fake clock):** tenant penalty row benches the provider for that
   tenant only; platform credential cooldown (`credential_kind='platform'`) benches for everyone —
   the physics-honesty rule from `schema-proposal.md` §2.2, test-enforced.
8. **BYOK failure scoping:** a dedicated-BYOK failure produces a cooldown visible only to that
   scope; the platform aggregate/cooldown stores receive nothing (F-09 sanctuary preserved — this
   is the existing behavior, re-pinned under the new key shape).
9. **F-14 last-resort release scope guard:** a scoped last-resort release clears only rows in the
   requesting scope; a platform cooldown survives a tenant's release attempt (explicit rule from
   `schema-proposal.md` §3.5).

### 1.2 `backend/test/decision-id-plumbing.test.js` (new, ~7 tests)

Fake: `FakeTelemetry` (array capture) + `FakeDecisionSink` (implements the *future*
`recordDecision(entry)` as a plain object sink). No SQLite, no MariaDB.

1. **Generation:** ids are UUIDv4-shaped (`crypto.randomUUID` — node built-in, zero deps), unique
   across 10k sequential generations, stable within one routed request (one id per request, not per
   attempt).
2. **Wire contract additive:** `routingDecision` with `decisionId` passes through the existing
   `_freellmapi.routing_decision` serializer unchanged in every *existing* field (pins S1's
   `exploration` passthrough proof pattern for the new field).
3. **Attempt-vs-decision cardinality:** a fallback chain (attempt 1 fails, attempt 2 serves) yields
   ONE decisionId with `outcome:'fallback'` — attempts share the id; per-attempt rows are the
   request_log's business (join key semantics pinned without any table existing).
4. **Telemetry threading:** `FakeTelemetry.record` receives `{decisionId, tenantId:'platform'|...}`
   — matches the existing `tenantId` default in `routingTelemetry.js` (no shape break).
5. **Null-when-unknown discipline:** failed dispatch with no usage → sink entry carries
   `promptTokens:null, completionTokens:null, status:<code>` — never 0, never fabricated (F-18
   rule extended to the ledger).
6. **Ledger-write isolation:** sink throwing (simulating absent table / window closed) never
   propagates — the routed response and quota charge are unaffected (principle 5, fail-open on
   evidence, fail-closed on money).
7. **Capability-probe gating:** writer emits nothing when `supportsDecisionLedger()===false`
   (fake returns false) — pins the "never emit unknown-column SQL pre-028" rule as a unit
   contract.

### 1.3 Existing-suite regression pinning (no new files)

- The certified S1 file (`freellmapi-cold-start-exploration.test.js`, 9 tests) and wave-1/wave-2
  tier files re-certify 10× at the execution commit — exploration cadence and tier behavior must be
  provably untouched by scope threading (they run entirely in `'platform'` scope).
- `freellmapi-rolling-rank.test.js` (F-07) + `tenant-byok-*.test.js` (F-08/F-09) are the
  regression tripwires for scope semantics colliding with the sanctuary.

**Explicit boundaries for part 1:** no test opens a real SQLite file with new columns; no test
touches MariaDB; nothing requires `backend/database/mysql.js`, auth middleware, or the global rate
limiter to change; fakes implement *optional-parameter* versions of today's interfaces, so every
part-1 test passes against the frozen `bb2b82b` code shapes as well as the execution-phase code.

---

## Part 2 — integration/e2e tests, writable ONLY after migrations land (exact list)

Gated: part 2 items 1–2 after Phase B (MariaDB 028/029); items 3–8 after Phase A+C activation.
Each ships with 10× certification; live-probe legs reuse the S1/S2 stub harness
(`/tmp/probe/stub-s1.mjs` pattern: NAME/PORT/MODEL/DELAY_MS OpenAI-compatible stubs).

1. **`migrations-028-029.test.js`** — runner applies 028+029 on the sandbox bridge:
   `schema_migrations` ledger rows with sha256 checksums; `SHOW CREATE TABLE ai_routing_decisions`
   equals the proposal; `enterprise_ai_usage.decision_id` exists + indexed; **down round-trip**
   (029.down → 028.down → re-up) restores baseline exactly; parallel-run `GET_LOCK` no-op
   (pattern: existing `enterprise-mariadb-migration.test.js`).
2. **`decision-ledger-join.test.js`** — one routed /v1 call → exactly one `ai_routing_decisions`
   row whose `decision_id` equals the wire `routing_decision.decisionId`, with tenant columns
   honest (`tenant_id NULL` for platform-key traffic; populated for enterprise principal) and one
   `enterprise_ai_usage` row carrying the same id (the join the reviewer's finding asked for).
3. **`scoped-store-rebuild.test.js`** — real file-backed SQLite: seed rows pre-shape → open with
   new code → guarded rebuild ran once (counts parity, all rows `scope_key='platform'`,
   `PRAGMA integrity_check` ok); restart idempotence; `.bak`-restore rollback drill (Phase A
   checklist items A1–A4 as an automated test).
4. **`scoped-evidence-live.test.js`** — two tenant principals with dedicated BYOK keys against two
   stubs at different latencies: per-scope windows diverge (A's rank flips on A's evidence at
   n≥3 while B's selection is untouched) — the F-21 "tenant traffic produces routing evidence"
   closure, proven at the router level with real stores.
5. **`cross-tenant-cooldown-e2e.test.js`** — tenant A bursts a stub into 429s on its BYOK key →
   A sees the cooldown, B is served normally (blast-radius closure); **and** the physics-honesty
   leg: a platform-key 429 cools the provider for BOTH (documented, asserted — not "fixed" away).
6. **`quota-invariance-e2e.test.js`** — A.6 probe restated with flags ON: `ai_usage` charges
   identical to `bb2b82b` behavior; a force-failed ledger insert (fault injection via flag) never
   affects charge or response.
7. **`reset-route-scoped-e2e.test.js`** — F-13 `POST /api/admin/ai/reset-state` extended semantics:
   platform reset does not wipe tenant scopes; scoped reset (new optional parameter, super-admin
   only) wipes one scope; response shape stays per-store honest.
8. **`telemetry-redaction-e2e.test.js`** — F-22 route with `decisionId` + `tenantId` populated:
   redaction invariants re-proven (zero key material, zero provider internals — A.11-style LIKE
   scan across the new fields included).

Probe legs to restate live at execution time (appendix rows, same discipline as S1/S2):
A.9r3 + A.9r4-after re-run unchanged (platform regression), a two-tenant A.15r1/r2 pair (scoped
evidence + cross-tenant cooldown), and an A.16 decisionId join leg (wire → telemetry → SQLite →
MariaDB, one id end-to-end).
