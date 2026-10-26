# ADR-003 — Route authorisation is a declarative manifest, and every route must have a rule

**Status:** Accepted · **Date:** 2026-10-26 · **Commit:** `b2803e1`
**Invariants:** INV-1 (reachability), INV-3, INV-5

## Context

`security/policy.js` answered "what does this admin path need?" with two if-ladders
keyed on string prefixes, ending in `return 'system.config.read'`. That fallthrough
made three different situations indistinguishable:

- a path that is deliberately restricted;
- a path nobody thought about;
- a path that does not exist.

Concretely, `GET /admin/audit-logs` fell through to `system.config.read`, which no
role held, so **AUDITOR — the role whose entire job is reading the audit trail — was
refused**, while holding `audit.read`. The ladder also could not express "read and
write of the same resource need different actions in a fixed order", so a rule added
in the wrong place silently shadowed another.

## Decision

`security/routeManifest.js` holds an ordered list of named rules, each with
`methods` (`read` | `write` | `any`), `exact`/`prefix` selectors, a permission (or a
`{read, write}` pair), and a one-sentence rationale. Reads and writes are resolved in
separate passes so a read rule cannot shadow a mutation rule. The manifest is the
only place authorisation for a path is decided.

Two explicit catch-all rules (`default-admin-read`, `default-admin-write`) preserve
pre-REC-006 behaviour for any path the manifest does not name. They are **tracked**:
`test/route-manifest.test.js` asserts that the number of registered routes resolving
to a default is zero, using a 152-row inventory fixture.

## Consequences

- **Positive.** The access policy is reviewable as data, and a decision has a name
  (`audit-log-read`, `coupons-write`) that tests and logs can reference.
- **Positive.** A route added without a rule fails the build instead of inheriting a
  default — the authorisation question is forced at the moment the route is written.
- **Positive.** Four proven mis-resolutions are fixed with one line each.
- **Negative.** The inventory fixture must be refreshed by hand when routes are
  added. Deliberate: Express 5 removed the route-walk the earlier enumeration used,
  and a crawl would also miss conditionally registered routes.
- **Negative.** A large number of rules (27) is more to read than two ladders. The
  compensation is that each rule explains itself, which the ladders never did.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Keep the ladders, fix the fallthrough to deny | Would 403 ADMIN on dozens of reads in one commit, with no UI test coverage, and would still not name the decision |
| Generate the manifest from the route table at boot | Removes the human review step that is the point; an auto-generated policy that nobody read is how the default poisoning happened |
| Annotate each route at registration (`app.get(path, requirePermission(...))`) | Requires touching 152 registrations and loses the ability to see the whole policy in one screen |

## Verification

`test/route-manifest.test.js` (7 tests): every route resolves to a named rule; zero
on a default; no dead rules; the four corrections; read/write independence; every
named permission is held by some role; end-to-end decisions for 4 roles × 6 paths.
