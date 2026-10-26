# ADR-002 — A permission claim on an identity token is not authority

**Status:** Accepted · **Date:** 2026-10-26 · **Commit:** `1d47922`
**Invariants:** INV-3, INV-5

## Context

`permissionsFor` used to union the role bundle with an arbitrary `permissions` array
read off the identity token:

```js
const declared = Array.isArray(user?.claims?.permissions) ? user.claims.permissions : [];
return new Set([...(PERMISSIONS[role] || []), ...declared]);
```

Nothing in this repository ever writes that claim — a grep for
`setCustomUserClaims` shows only `role` — so any value present is either forged or a
stale remnant. It was also invisible to audit: there is no record of who set it, when,
or why.

A test (`superadmin-platform.test.js`) asserted that `{claims: {permissions: ['*']}}`
confers super-admin. The test documented the hole.

## Decision

Resolution reads persisted roles (`admin_roles`) and persisted grants
(`admin_user_roles`) only. The token contributes identity and role name; it does not
contribute authority. `isSuperAdmin` likewise depends on the resolved set, so a
forged claim cannot pass it.

## Consequences

- **Positive.** Every capability a caller holds can be named, attributed and revoked.
  A compromised token without a persisted grant confers nothing beyond its role.
- **Positive.** The escalation surface shrinks: there is no longer a code path where
  a value supplied by an identity provider silently widens platform authority.
- **Negative.** Any deployment that hand-set a `permissions` custom claim loses that
  authority at deploy time. Mitigation and a migration query are in
  `DEPLOYMENT-RUNBOOK.md §7.1`.
- **Negative.** One pre-existing assertion changed polarity. Documented as a contract
  tightening, not a skipped test — the file still fails if a token claim ever confers
  authority again.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Keep the union, but log divergence | Logging a hole does not close it; the claim remains unauditable by construction |
| Allow the claim only for `'*'` | A forged wildcard is the worst case, so this preserves the worst case |
| Migrate claims into `admin_user_roles` lazily at first login | Adds a write on the authentication path and needs a mapping from arbitrary strings to roles; the one-off SQL migration is smaller and reviewable |

## Verification

`admin-rbac-resolver.test.js` — "token-asserted permissions are not authority
(RCA-009 negative test)" asserts that a SUPPORT token carrying
`['*','secrets.manage','users.delete']` holds none of them, and that
`isSuperAdmin` is false.
