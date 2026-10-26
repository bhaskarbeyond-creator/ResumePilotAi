# ADR-004 — Changing authority is a SUPER_ADMIN-only, step-up, reasoned, audited API

**Status:** Accepted · **Date:** 2026-10-26 · **Commit:** `5ace3e6`
**Invariants:** INV-2, INV-3, INV-6

## Context

ADR-001 moved authority into tables. Without a write path, that is configuration in
name only: granting a role to a person would still mean a migration. But a write path
for authority is the most dangerous API in the product — it can grant itself more
power, remove the last account able to fix things, and erase its own evidence.

## Decision

`/api/admin/rbac/*`, mounted in `index.js` before the catch-all admin router:

| Method | Path | Authorisation |
|---|---|---|
| GET | `/roles`, `/roles/:role/permissions`, `/grants` | `audit.read` or `security.read` |
| PUT | `/roles/:role/permissions` | `requireSuperAdmin` + `requireRecentAdminAuthentication` |
| POST | `/grants` | idem |
| DELETE | `/grants/:uid/:role` | idem |

Five invariants are enforced in `services/adminRbacAdministration.js`, each with its
own error code:

1. **SUPER_ADMIN keeps the wildcard** — `BREAK_GLASS_REMOVAL_BLOCKED`. Removing it is
   an unrecoverable lockout.
2. **No self-escalation** — `SELF_ESCALATION_BLOCKED` when the caller would widen a
   role they hold, or grant a role to their own uid.
3. **Platform-managed roles are read-only here** — `PLATFORM_MANAGED_ROLE` for USER,
   EMPLOYER and the ENTERPRISE_* roles, whose authority belongs to the enterprise
   module.
4. **A reason is required** (≥ 12 characters) and is stored in the audit row.
5. **The audit row is written by the server** with `before`/`after` read from the
   store — never from the request body.

A store failure is `503` and the change did not happen. A no-op change writes no audit
row. One change produces exactly one row (the generic post-response audit middleware
skips `/admin/rbac/*`, because it would have recorded the *client's* body as `before`).

## Consequences

- **Positive.** Role changes are a first-class, attributable operation that takes
  effect on the next request (`preloadUserGrants`), not the next deploy.
- **Positive.** Reading "who can do what" is available to auditors, which is what
  makes INV-3 checkable from outside.
- **Negative.** A single super-admin is a bottleneck for role changes, and MFA +
  recent-auth mean a locked-out super-admin cannot fix themselves through the API.
  The recovery path is SQL and is documented (`DEPLOYMENT-RUNBOOK.md §6`).
- **Negative.** No second-person approval yet (`OI-005-1`); the audit trail names one
  identity per change.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Let `system.config.manage` holders edit roles | Circular: the permission being edited is the permission that authorises editing it |
| Allow self-grants for super-admins "because they already have everything" | It is not harmless: a super-admin adding `secrets.manage` to their own bundle produces an audit trail where the beneficiary approved the change; the guard keeps the trail honest |
| Fire-and-forget audit | An authority change with no trace is the exact failure INV-6 exists to prevent |
| Optimistic write (respond before the store confirms) | A 200 for a change that did not persist is worse than an error |

## Verification

`test/admin-rbac-api.test.js` (12 tests): authorisation, step-up, the happy path with
audit assertions (`scope`, `reason`, `before`, `after`, `added`, `removed`,
`occurredAt`), the no-op path, all four refusals, and the 503 path.
