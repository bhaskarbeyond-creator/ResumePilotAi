# ADR-001 — Platform authority lives in the database, not in code

**Status:** Accepted · **Date:** 2026-10-26 · **Commits:** `1d47922`, `5ace3e6`
**Invariants:** INV-3 (configurable bundles), INV-6 (audited change)

## Context

`backend/security/auth.js:63-88` held the entire platform permission model in an
`Object.freeze`d literal. Two consequences followed, both observed rather than
theorised:

1. **A permission change required a release.** In practice that meant it never
   happened, which is why eight permission strings appeared in handlers while no
   role held them.
2. **A change could not be audited.** There was no actor, no timestamp and no
   before/after, because there was no change event — only a deploy.

The same file also could not express what the route policy assumed. `policy.js`
gates a read of a resource with `read` and a write of the same resource with
`write`; a role holding `write` therefore could not `read` the thing it could
change. ADMIN hit exactly this on every unlisted admin GET.

## Decision

Authority is stored as `(role, resource, action)` rows in `admin_roles` /
`admin_role_permissions`, with per-user grants in `admin_user_roles`. A resolver
(`services/adminRbac.js`) serves the request path synchronously from an in-process
cache warmed at boot and invalidated on write.

The permission literal is retained in `security/permissionVocabulary.js` for exactly
two purposes: it is the seed reference the migration is tested against, and it is the
fail-safe fallback when the store is unavailable.

## Consequences

- **Positive.** Authority is editable at runtime, with an actor and a diff; the
  action hierarchy is expressible; a store outage degrades to pre-028 authority
  rather than to nothing.
- **Negative.** The request path now depends on an in-process cache whose freshness
  is bounded by `ADMIN_RBAC_CACHE_TTL_MS`. With more than one instance, a change made
  on A is observed by B after at most that TTL. Recorded as `OI-005-7`; the fix is a
  pub/sub invalidation, not a longer TTL.
- **Negative.** Two representations of the truth (SQL rows and the fallback literal)
  must not drift. Mitigated by a test that *parses the SQL* and compares the seeded
  model to the literal, so drift fails the build.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Keep the literal, add a config file | Still needs a deploy; still unauditable |
| Store permissions as opaque strings (`'users.update'`) in one column | Makes the hierarchy a parsing problem at request time and invites inconsistencies like `users.roles.manage` being ambiguous (see `OI-A-3`) |
| Resolve from the database on every request | Adds a query to every authorisation decision; the cache has the same correctness with a bounded, documented staleness |
| Fail closed when the store is down | Would turn a database blip into a total admin outage, including for the break-glass role |

## Verification

- `test/admin-rbac-resolver.test.js` (12 tests): seed equals literal, hierarchy,
  degradation, unknown role, zero-authority role, token claims ignored, grants,
  wildcard, capability census.
- `test/admin-rbac-api.test.js` (12 tests): the write path end to end.
- Fail-before evidence: the seed test fails if the SQL drifts; the store-injection
  seam refuses to run outside `NODE_ENV=test`.
