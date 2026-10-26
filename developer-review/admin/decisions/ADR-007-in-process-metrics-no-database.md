# ADR-007 — Counters live in the process, not behind the database

**Status:** Accepted · **Date:** 2026-10-26 · **Commit:** `[REC-025|INV-6]`
**Invariants:** INV-6 (a trail that can be checked), INV-2 (a super-admin lockout is visible)

## Context

REC-025 asked for three counters — `admin_audit_write_failures`,
`admin_action_total{action,outcome}`, `admin_denied_total{code}` — and for an alert on audit
write failures. The obvious implementation is a metrics library (`prom-client`) writing to the
same place the durable rollups already live: `enterprise_observability_rollups`, read by
`GET /api/platform/observability`.

Two facts made that the wrong place:

1. **The failure being measured is a database failure.** `admin_audit_write_failures` moves
   exactly when the audit store is unreachable. A counter stored in that store is dead at the
   moment it has something to say, and the alert it feeds is silent during the one incident it
   exists to catch.
2. **A rollup is history; an alert needs now.** Reading `enterprise_observability_rollups`
   costs a round trip and answers questions about the last aggregation window. "Has any audit
   row been lost in the last five minutes" must be answerable in microseconds, from memory,
   and it must not itself depend on a healthy pool.

## Decision

`backend/services/operationalMetrics.js` is a four-counter registry in process memory, with:

- **Bounded cardinality** — 500 series per counter, then a named `__overflow__` bucket and a
  `droppedSeries` count, so an overflow is visible rather than silent.
- **Closed label vocabularies** — roles are an enum; unknown roles collapse to `OTHER`; route
  labels are normalised (`/api/admin/users/9f3c…` → `/api/admin/users/:id`).
- **Prometheus text exposition** at `GET /api/platform/metrics`, `security.read`, no database;
  `Accept: application/json` returns the same data as structure.
- **The counters embedded in `GET /api/platform/operational-status`**, attached at response
  time so the health snapshot's 30 s cache cannot make a counter look stale.

## Consequences

- **Positive.** The alarm survives the outage it reports; a scrape answers in microseconds; no
  new dependency; no schema change, so a rollback of this change is a code rollback with
  nothing to unwind.
- **Positive.** Cardinality is a design constraint rather than a production surprise, and the
  ceiling is a test rather than a comment.
- **Negative — and operationally important.** The counters **reset on process restart**. Every
  alert must therefore be written with `increase(...[5m])`, never on the raw value: a raw-value
  alert either pages forever on a stale total or is silenced by a restart. This is stated in
  `OBSERVABILITY-AND-ROLLBACK.md §4.3` and is the reason `snapshot()` reports `since` and
  `uptimeMs`.
- **Negative.** Per-process counters do not aggregate across replicas; a dashboard must
  `sum by (action, outcome)`, not read a single target. With `N` replicas each counter is a
  partial view, which is correct for rates and misleading for totals — so no SLO in
  `OBSERVABILITY-AND-ROLLBACK.md §3` is expressed as a total.
- **Deliberately absent.** Process identity (`hostname`, `pid`, `instance`). One series per
  container on a shared dashboard is a cardinality bug wearing a best practice's clothes; the
  scrape target already distinguishes replicas.

## Alternatives

1. **`prom-client` with a `/metrics` registry.** Rejected: it solves cardinality and exposition,
   which this module solves in 40 lines, and it adds a dependency to a service whose
   reliability story is "few moving parts". Revisit if histograms are needed — a counter
   registry does not answer a latency question well, and the day p95 latency must be alerted on,
   a real client earns its place.
2. **Write counters into `enterprise_observability_rollups`.** Rejected for the reason in the
   context: it is the store whose failure the counter reports.
3. **Log-only, with an alert on log queries.** Rejected: it depends on a log pipeline being
   healthy, adds seconds-to-minutes of latency to the audit-failure alert, and cannot answer
   "how many" without a query language.
