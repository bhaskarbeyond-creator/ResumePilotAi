# ADR-005 — One audit row per authority change, written by the route that makes it

**Status:** Accepted · **Date:** 2026-10-26 · **Commit:** `5ace3e6`
**Invariants:** INV-6

## Context

`security/adminAudit.js` installs a post-response middleware on `/api/admin` and
`/api/platform` that records every mutation, with the request body as metadata. That
is the right default: it catches routes nobody remembered to instrument.

For an authority change it is the wrong mechanism twice over:

1. **Duplication.** The RBAC route writes its own row, so enabling both produced two
   rows per change — a trail that double-counts.
2. **Falsifiable history.** The middleware's `before` value is whatever the client
   sent. A caller could therefore author the "previous" state of their own privilege
   change.

The first symptom was a failing assertion (`1 !== 2` rows), which is how the
duplication was found.

## Decision

`SELF_AUDITED_PREFIXES` in `security/adminAudit.js` lists the paths that audit
themselves (`/api/admin/rbac/`). The middleware skips them; the route writes a row
whose `before`/`after` come from the store.

Matching is done against `originalUrl`, because Express restores the mount prefix
before `res.end` runs — the middleware is mounted at `/api/admin`, so `req.path` is
`/rbac/...` during the handler and `/api/admin/rbac/...` afterwards. The first
implementation matched the wrong one and the duplication persisted; the test caught
it, and the comment in the source records why three spellings are checked.

## Consequences

- **Positive.** Exactly one row per change, with a server-computed diff.
- **Positive.** A no-op produces none, and a rejected or failed change produces none —
  so the trail can be queried as "what changed" without filtering out non-events.
- **Negative.** A self-auditing route must be added to the list, or it will be
  double-counted. Mitigated by the assertion in `admin-rbac-api.test.js` that a
  successful change yields exactly one row; a new self-auditing path needs the same
  assertion.
- **Negative.** The skip list is a second place that knows about auditing.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Let the middleware record it and drop the route's own row | Loses the server-computed diff and keeps the client-authored `before` |
| Have the middleware read the store before and after every mutation | Makes every admin mutation depend on two extra queries and on knowing which table the route touched |
| Add a generic "audit payload" convention the middleware prefers over the body | Reasonable long-term; needs every route to opt in, which is a larger change than a two-line skip list |

## Verification

`test/admin-rbac-api.test.js`:
- "granting a permission takes effect immediately and is audited with before/after" —
  asserts `auditRows.length === 1` and the exact `before`/`after`/`added` arrays;
- "a no-op change writes no audit row" — asserts 0;
- "the break-glass wildcard cannot be removed" — asserts 0 rows for a rejected change;
- "an unreachable store is a 503 failure" — asserts 0 rows for a failed write.
