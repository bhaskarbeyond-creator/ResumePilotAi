# IME365 RBAC & Route-Security Matrix

The existing authorization model is **preserved unchanged**. Only the URL
namespace moved. Authority remains server-side in `backend/security/auth.js`
(`permissionsFor`) and `backend/security/policy.js` (`enforceApiPolicy`); the
frontend mirrors it for rendering only.

## Role → portal reachability

| Role | `/dashboard` | `/employer` | `/org/:slug` | `/admin` |
|---|---|---|---|---|
| Unauthenticated | LOGIN (all portals) | LOGIN | LOGIN | LOGIN |
| `USER` | ALLOW | ALLOW | server-decided | DENY → `/dashboard` |
| `SUPPORT` | ALLOW | ALLOW | server-decided | limited tabs |
| `AUDITOR` | ALLOW | ALLOW | server-decided | limited tabs |
| `ADMIN` | ALLOW | ALLOW | server-decided | ALLOW (except Super Admin) |
| `SUPER_ADMIN` | ALLOW | ALLOW | server-decided | ALLOW |
| Enterprise `*` | ALLOW | ALLOW | per `tenantPolicy` | server-decided |

## Session guard on every private namespace

Verified in `src/main.jsx` and asserted by
`tests/four-portal-architecture.test.mjs` ("keeps every legacy alias behind the
session guard"):

| Route | Guard |
|---|---|
| `/dashboard/*` | `RequireAuthenticated` |
| `/employer/*` | `RequireAuthenticated` |
| `/org/*`, `/org/:slug/*` | `RequireAuthenticated` |
| `/admin/*` | `RequireAuthenticated` |
| `/adm/*` | `RequireAuthenticated` → redirect |
| `/platform/*` | `RequireAuthenticated` → redirect |
| `/dashboard2`, `/dashboard2/*` | `RequireAuthenticated` → redirect |
| `/enterprise/*` | `RequireAuthenticated` → redirect |

An unauthenticated visitor therefore reaches the login screen, never a redirect
that would reveal whether a private path exists.

## Admin first-accessible tab (`FIRST_ACCESSIBLE_TAB`)

Unchanged logic, retargeted to `/admin/...`:

| Condition | Landing |
|---|---|
| `SUPER_ADMIN` | `/admin/dashboard` |
| `audit.read` without `system.config.write` (e.g. `AUDITOR`) | `/admin/audit-logs` |
| `tickets.manage` (e.g. `SUPPORT`) | `/admin/help-desk` |
| otherwise | `/admin/dashboard` |

`RequireTabPerm` still gates every admin tab on the same permission strings as
`PATH_PERMS`; a denied tab re-redirects to `/admin/${FIRST_ACCESSIBLE_TAB}`.

## Verified role behaviour in a real browser

| Scenario | Expected | Observed |
|---|---|---|
| Admin session → `/adm/users` | `/admin/users` | ✅ passed |
| Admin session → `/platform/queues` | `/admin/queues` | ✅ passed |
| Admin session → `/adm` | `/admin/dashboard` | ✅ passed |
| Non-admin → `/adm`, `/adm/users`, `/platform/users` | not `/admin/*`; denied to `/dashboard` | ✅ passed |
| Non-admin + `localStorage.ime365_active_portal = 'admin'` | Admin not offered in switcher | ✅ passed |
| Candidate session → switcher | Candidate + Recruiter only, no Admin | ✅ passed |
| `/adm/users?tab=roles&q=audit` | `/admin/users` + query preserved | ✅ passed |

## Context switcher authorization rules

Stored state never grants access:

1. `usePortalAvailability()` resolves the ID token role, `checkIfAdmin(uid)`,
   and `GET /api/enterprise/status`.
2. The persisted portal is validated against the resulting allow-list.
3. Invalid/stale/revoked/unknown values are discarded; the switcher falls back
   to the candidate portal.
4. Sign-out clears the stored value.

## Server-side authorization (unchanged)

- `backend/index.js` applies `requireAuth` to all non-public API paths and
  `requireEnterpriseAuth` to `/api/enterprise/*`.
- `enforceApiPolicy` maps admin read/write paths to permissions, including both
  `/platform/*` and `/admin/*` aliases, so backend alias support is preserved.
- `requireVerifiedEmail` still applies to `/admin/*` and `/platform/*`.
- No backend file was modified by this refactor
  (`git diff --stat HEAD -- backend/` → 0 files).
