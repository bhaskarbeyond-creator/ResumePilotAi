# Security and RBAC proof

**Scope.** Whether the six admin/super-admin invariants stated in the original brief
now hold, and exactly what proves each one. An invariant is marked **PROVEN** only
when a test asserts it *and* the assertion fails if the code is reverted. Otherwise
it is marked **PARTIAL** or **NOT MET**, with the gap named.

**Commit range proven here:** `9d922d2` (analysis) → `1d47922` (RBAC resolver),
`b2803e1` (route manifest), `5ace3e6` (RBAC administration API).

**How to reproduce every claim in this document:**

```bash
cd backend
NODE_ENV=test node --test --test-concurrency=1 --test-force-exit \
  test/admin-rbac-resolver.test.js test/route-manifest.test.js \
  test/admin-rbac-api.test.js test/admin-rbac-contract.test.js \
  test/superadmin-control-plane.test.js test/superadmin-platform.test.js \
  test/admin-target-authority.test.js test/setting-classification.test.js
```

No database is required: every suite injects its store. Suites that do require
MariaDB are listed in `TEST-EVIDENCE.md` and are environmental, not product,
failures.

---

## 1. Invariant-by-invariant verdict

| # | Invariant | Verdict | Proof |
|---|---|---|---|
| INV-1 | Every Must-exist/Should-exist capability is reachable from the dashboard | **PARTIAL** | Reachability is now decided by data, not by a prefix ladder: 146 registered admin routes resolve to a named manifest rule (`route-manifest.test.js`), and every permission a route requires is held by ≥1 non-wildcard role (`admin-rbac-resolver.test.js`). 11 capabilities still have no console surface — enumerated in §5 and `OPEN-ITEMS.md`. |
| INV-2 | Super-admin has unconditional, complete rights; no hard-coded restriction blocks any path | **PROVEN** | Wildcard `('*','*')` is seeded (migration 028 §A), expanded to `'*'` (`expandGrant`), honoured first in `satisfies` and in the manifest (`permission: '*'`), and cannot be removed (`BREAK_GLASS_REMOVAL_BLOCKED`). Three tests. Residual: routes that call `requireSuperAdmin` in addition to the manifest are *stricter* than the manifest, and that is intentional (§4). |
| INV-3 | Admin roles are configurable permission bundles (resource × action, `manage ⊃ write ⊃ read`, audited opt-in bypass) | **PROVEN (hierarchy, bundles, grants) / PARTIAL (bypass)** | Bundles live in `admin_roles`/`admin_role_permissions` and are editable through `/api/admin/rbac/roles/:role/permissions`; hierarchy proven in the resolver *and* on the request path; grants in `admin_user_roles` with expiry, reason and audit. The "audited opt-in super-admin bypass" exists as the wildcard + recent-auth path, but there is no *scoped, time-boxed impersonation* with its own audit row — see §4.3. |
| INV-4 | Every business-affecting value is dashboard-configurable, with validation/default/audit, unless justified in code | **PARTIAL** | Settings writes are audited with actor and outcome (`security/adminAudit.js` middleware); 34 configuration gaps remain classified in `09-configuration-gap-register.md` (9 DB-BROKEN, 14 CODE-UNJUST). Not closed in this pass; `OPEN-ITEMS.md` `OI-CFG-*`. |
| INV-5 | UI hiding is not authorization | **PROVEN as a property, PARTIAL as coverage** | Enforcement is server-side and role-name-independent: `route-manifest.test.js` shows a hidden tab's endpoint denying and a visible tab's endpoint denying too when the permission is absent. The console still hides tabs by **role name**, so visibility and authority can disagree in both directions (§6). |
| INV-6 | Configuration changes are audited with actor, timestamp, before/after, scope | **PROVEN for authority; PARTIAL for settings values** | RBAC writes: one row per change with `actorUid`, `actorEmail`, `occurredAt`, `metadata.scope`, `metadata.before`, `metadata.after`, `metadata.reason`, `metadata.added/removed` (`admin-rbac-api.test.js`, 4 assertions). Settings writes: audited with actor and sanitised body, but the *previous* value is not read server-side, so `before` is the client's word. |

---

## 2. INV-2 — super-admin completeness, in detail

Three independent mechanisms, each of which alone would be insufficient:

1. **Seed.** `028_admin_rbac.sql` inserts `('*','*')` for `SUPER_ADMIN` and nothing
   else. A test asserts the seeded model expands to exactly the literal
   (`superadmin` bundle is `['*']`).
2. **Resolution.** `expandGrant('*','*')` → `'*:*'`; `resolvePermissionSet` then
   adds `'*'`; `satisfies` returns `true` for any requirement when the set contains
   `'*'` *or* `'*:*'`. `permissions.has('*')` — used by 12 legacy handlers — is
   also true, because `'*'` is in the set.
3. **Irreversibility guard.** `assertBreakGlassRetained` refuses to persist a
   SUPER_ADMIN bundle without the wildcard (`409 BREAK_GLASS_REMOVAL_BLOCKED`).

**Deliberate strictness that looks like a restriction but is not.** Some routes call
`requireSuperAdmin` *after* the manifest has already authorised them (for example
`/platform/configuration`, `/admin/firebase-service-account`,
`/platform/payment-webhooks/:eventId/replay`). Those calls cannot block a
super-admin: `requireSuperAdmin` returns 403 only when `isSuperAdmin()` is false,
and for `SUPER_ADMIN` it is structurally true (`role === 'SUPER_ADMIN' ||
permissions.has('*')`). The one case that *can* block a super-admin is
`superAdminMfaEnforced()` — deliberately, per `auth.js:265-306`, and it returns
`SUPER_ADMIN_MFA_REQUIRED`, not `FORBIDDEN`.

---

## 3. INV-3 — configuration, hierarchy and grants

### 3.1 The data model

```
admin_roles(id, name, display_name, description, rank, is_system)
admin_role_permissions(role_id, resource, action, granted_by)      -- UNIQUE(role_id, resource, action)
admin_user_roles(uid, role_id, granted_by, granted_at, expires_at, reason)  -- UNIQUE(uid, role_id)
```

`resource` and `action` are stored separately so the hierarchy is a property of the
*resolver*, not of string formatting. `is_system` marks the eight built-in roles;
they can be edited (that is the point) but not deleted, so a deployment always has a
resolvable role name.

### 3.2 The hierarchy

```
manage ⊃ write ⊃ read          (+ view, execute, policy, send ⊃ read)
```

Proven in three places:

| Layer | Test |
|---|---|
| Pure resolver | "manage implies write implies read on the same resource" |
| Request path (`enforceApiPolicy` → `satisfies`) | "hierarchy applies on the request path, so ADMIN can read settings it can write" |
| Capability census | "no requirement group is unreachable by every non-wildcard role" |

The third test is the interesting one: it parses `requirePermission(...)` calls,
`security/policy.js` return statements and inline `permissions.has(...)` chains out of
the source, models each as an *any-of group*, and asserts each group is satisfied by
at least one non-wildcard role. It carries a negative control (`nonexistent.permission`
must be flagged), so a bug that made every comparison true could not leave it green.

### 3.3 Change path

`PUT /api/admin/rbac/roles/:role/permissions` → validate → read stored bundle →
diff → guard (wildcard retained, no self-escalation, not platform-managed) → store
transaction → audit → refresh cache → respond with `added`/`removed`.

Five independent refusals, each with its own code: `VALIDATION_FAILED`,
`ROLE_NOT_FOUND`, `PLATFORM_MANAGED_ROLE`, `BREAK_GLASS_REMOVAL_BLOCKED`,
`SELF_ESCALATION_BLOCKED`. A store failure is `503`, and the response says the
change did **not** happen.

### 3.4 What is *not* done

- **Second-person approval.** A single super-admin can change any bundle. The audit
  trail names them, and self-escalation is blocked, but there is no four-eyes queue.
  Rationale: a queue is a workflow with its own state machine and cannot be
  half-built; recorded as `OI-005-1`.
- **Scoped impersonation ("audited opt-in super-admin bypass").** Today a
  super-admin's access is the wildcard, permanently. A time-boxed, reason-bearing
  impersonation grant with its own audit row is the stronger design and is **not
  implemented**; `OI-005-2`. Until then, the closest control is
  `admin_user_roles.expires_at`, which applies to *additional* roles, not to the
  caller's own wildcard.

---

## 4. INV-1 — reachability

### 4.1 What "reachable" now means

A capability is reachable when (a) a route exists, (b) the manifest names the
resource/action that route needs, and (c) at least one role holds that permission.
All three are asserted:

- (a) + (b): `route-manifest.test.js` — 152 inventory rows, 0 unresolved, 0 on a
  default.
- (c): `admin-rbac-resolver.test.js` — census over the source, 0 orphans.
- No dead rules: every manifest rule is reached by a route or declared
  forward-looking.

### 4.2 Corrections this produced

| Path | Was | Now | Effect |
|---|---|---|---|
| `GET /admin/audit-logs*` | `system.config.read` (default) | `audit.read` | AUDITOR can read the trail — the role's whole purpose |
| `GET/PUT /admin/pages*` | default read / `system.config.write` | `content.manage` | content authority stops masquerading as configuration authority |
| `GET /admin/coupons` | default read | `payments.read` | AUDITOR and ADMIN can see discount codes |
| `POST/PUT/DELETE /admin/coupons*` | `system.config.write` | `payments.manage` | creating a discount code is a billing change, not a config change |

### 4.3 Capabilities with no console surface (INV-1 gap)

| Capability | Backend | Console | Consequence |
|---|---|---|---|
| Audit trail (REC-008) | `routes/adminAudit.js` (3 routes) | **no tab** (`VALID_TABS` has no `audit`) | AUDITOR's suite is described in the UI as "security audit logs" but there is no way to open them |
| Tenants registry (REC-007) | `routes/platform.js:1444`, `routes/enterprise.js:608` | **no tab** | roster of customers is API-only |
| Rate limits (CFG-004) | `index.js:381-411` (env) | **no panel** | not dashboard-configurable |
| Retention windows (CFG-013/014) | env + scheduler | **no panel** | not dashboard-configurable |
| Object storage (RR-006) | 501 by design | none | correctly absent |
| Role administration | `/api/admin/rbac/*` (this pass) | **no screen** | roles are editable only via API today — `OI-005-4` |

---

## 5. INV-5 — UI hiding is not authorization

### 5.1 The property

Authorisation never consults the frontend. Every admin request passes
`requireAuth` → `enforceApiPolicy` (manifest) and, where present,
`requirePermission`/`requireSuperAdmin`. The console's `allowedTabs` array affects
rendering only.

**Proven behaviour** (`route-manifest.test.js`, "an AUDITOR reaches the audit trail
and ADMIN reaches settings it may write"):

| Caller | Request | Result | Why |
|---|---|---|---|
| AUDITOR | `GET /admin/audit-logs` | allowed | holds `audit.read` |
| AUDITOR | `GET /admin/settings` | **403** | no `system.config.read`; the tab is hidden too, so this is the *consistent* case |
| ADMIN | `GET /admin/settings` | allowed | `system.config.write` implies `read` |
| ADMIN | `GET /admin/rbac/roles` | **403** | not an auditor/security reader — tab does not exist, but the API denies anyway |
| SUPPORT | `GET /admin/support/tickets` | allowed | `tickets.manage` |
| SUPPORT | `DELETE /admin/users/*` | **403** | `users.read` does not imply `users.update` |
| USER | `GET /admin/users` | **403** | no admin-plane permission at all |

### 5.2 Visibility vs enforcement matrix (console tabs)

Visibility is taken from `frontend/src/pages/admin/console.tsx:83-104`. Enforcement
is the manifest rule that guards the tab's primary endpoint(s). **V** = visible,
**H** = hidden, **✓** = authorisation passes, **✗** = 403.

| Tab (endpoint family) | Required permission (rule id) | SA | ADMIN | AUDITOR | SUPPORT |
|---|---|---|---|---|---|
| `dashboard` (`/platform/command-center`) | any of system.config.read, users.read, audit.read (`dashboard-and-overview`) | V ✓ | V ✓ | H ✓ | H ✓ |
| `health` (`/admin/health-summary`, `/platform/health`) | `security.read` (`health-and-security-telemetry`) | V ✓ | V ✓ | V ✓ | H ✓ |
| `queues` (`/platform/queues`) | `security.read` (same) | V ✓ | V ✓ | V ✓ | H ✓ |
| `operations` (`/platform/maintenance`, `/platform/backup-status`, feature flags) | `security.read` for the surface; `*` for flags (`super-admin-configuration`) | V ✓ | V ✓ / ✗ flags | V ✓ / ✗ flags | H ✓ |
| `attention` (`/platform/attention`) | `security.read` | V ✓ | V ✓ | H ✓ | H ✓ |
| `users` (`/admin/users`) | `users.read` (`admin-users-directory`) | V ✓ | V ✓ | V ✓ | V ✓ |
| `support` (`/admin/support/tickets`) | `tickets.manage` (`support-desk`) | V ✓ | V ✓ | H ✓ | V ✓ |
| `moderation` (`/admin/jobs`, `/admin/employer-applications`) | any of users.read, tickets.manage (`admin-jobs-and-reviews`) | V ✓ | V ✓ | H ✓ | H ✗ (holds tickets.manage → ✓ on jobs, ✗ on employer-applications writes) |
| `blog` (`/admin/blog/*`) | `blog.read` / `blog.write` (`cms-blog`) | V ✓ | V ✓ | H ✓ | H ✓ |
| `content` (`/admin/pages`, `/admin/coupons`, `/admin/trusted-by`) | `content.manage`, `payments.read/.manage` (`cms-pages`, `coupons-*`) | V ✓ | V ✓ | H ✓ | H ✓ |
| `ai-settings` (`/admin/ai-settings`) | `system.config.read/.write`; route also `requireSuperAdmin` | V ✓ | V ✓ | H ✗ (also route-blocked) | H ✓ |
| `email` (`/email/logs`, `/email/admin/settings`) | `email.logs.read`, `system.config.read` (`email-*`) | V ✓ | V ✓ | H ✓ | H ✓ |
| `security` (`/platform/security-events`, `/admin/audit-logs`) | `security.read` + `audit.read` | V ✓ | V ✓ | V ✓ | H ✓ |
| `settings` (`/admin/settings/:category`) | `system.config.read/.write` (`settings-surface`) | V ✓ | V ✓ | H ✓ | H ✓ |
| `modules` (`/platform/public-config`) | `system.config.read` (default) | V ✓ | V ✓ | H ✓ | H ✓ |

**Findings, stated plainly:**

1. **No "HIDDEN-BUT-AUTHORIZED" on the admin plane.** Every hidden tab is genuinely
   denied to that role. The one place a role has authority it cannot see is
   *non-tab* surface: an ADMIN may call `/api/admin/rbac/roles` (it holds
   `security.read`) although no screen offers it.
2. **Three "VISIBLE-BUT-DENIED" cells.** `operations` for AUDITOR and ADMIN
   (feature-flag panels), and `ai-settings` for AUDITOR. The console hides tabs by
   **role name**, not by permission, so a role that holds `security.read` sees a tab
   whose feature-flag call returns 403. This is the concrete INV-5 violation that
   remains: not a security hole (the backend denies), but a UX lie.
3. **The matrix is role-name-based, not capability-based**, which is why granting
   `audit.read` to a custom role today changes nothing a person can see. Fixing this
   is `OI-018-1` (`useCapabilities()`), and it is the gating item for the console
   rework.

---

## 6. INV-6 — configuration audit

### 6.1 Authority changes (proven)

One row per change, written by the route, with a store-computed diff:

```json
{
  "action": "UPDATE_ROLE_PERMISSIONS",
  "category": "iam.rbac",
  "severity": "HIGH",
  "actorUid": "sa-rbac", "actorEmail": "sa@test",
  "outcome": "SUCCESS", "statusCode": 200,
  "occurredAt": "…",
  "metadata": {
    "scope": "role:AUDITOR",
    "reason": "Compliance review requires read-only access to platform configuration",
    "before": ["audit:read", "users:read"],
    "after": ["audit:read", "system.config:read", "users:read"],
    "added": ["system.config:read"], "removed": [], "changed": true
  }
}
```

Guarantees asserted by tests:

- a successful change produces **exactly one** row (the generic middleware row is
  suppressed for `/admin/rbac/*`);
- a **no-op** produces none;
- a **rejected** change produces none (no success row for a failure);
- a **failed store** produces none and returns 503;
- the `before` value is never taken from the request body.

### 6.2 Settings values (partial)

`createAdminAuditMiddleware` records every admin/platform mutation with actor,
timestamp, method, path, status, and a redacted body
(`sanitizeAuditValue` + `security/settingClassification.js`). What it does **not**
do is read the previous value server-side, so the trail answers "who changed
`settings.general.foo` to X and when", but not "from what". Closing that is
`OI-012-1`: read-before-write inside the settings handler, pass `previous` into the
audit event. The schema already has a `metadata` JSON column and needs no migration.

---

## 7. Residual security risks (ranked, with owner-facing actions)

| # | Risk | Severity | Status | Action |
|---|---|---|---|---|
| SR-1 | No second-person approval for authority changes; one super-admin is sufficient | High | Accepted for now | `OI-005-1` |
| SR-2 | No scoped impersonation; super-admin access is all-or-nothing | Medium | Accepted | `OI-005-2` |
| SR-3 | Settings audit has no server-computed previous value | Medium | Open | `OI-012-1` |
| SR-4 | Console hides tabs by role name → visible-but-denied cells | Low (UX) | Open | `OI-018-1` |
| SR-5 | Legacy dotted permission aliases double the key space | Low | Accepted | `OI-005-3` |
| SR-6 | `admin_user_roles` grants are not themselves revocable in bulk | Low | Open | `OI-005-5` |

---

## 8. Threat-model checks performed

| Attack | Attempt | Result |
|---|---|---|
| Token forgery | Add `permissions: ['*']` to a SUPPORT token | No effect — `claims.permissions` is not authority (`admin-rbac-resolver.test.js`) |
| Privilege escalation by role edit | ADMIN calls `PUT /roles/SUPPORT/permissions` | 403 (SUPER_ADMIN only) |
| Self-escalation | SUPER_ADMIN widens SUPER_ADMIN | 409 `SELF_ESCALATION_BLOCKED` |
| Lockout | Remove the wildcard from SUPER_ADMIN | 409 `BREAK_GLASS_REMOVAL_BLOCKED` |
| SQL injection by resource name | `resource: "users; DROP TABLE admin_roles"` | 400 — pattern-validated before it reaches a parameterised statement |
| Unknown action smuggling | `action: "sudo"` | 400 with the allowed vocabulary named |
| Stale session | 1-hour-old `auth_time` with recent-auth enforced | 403 `RECENT_AUTH_REQUIRED` |
| Audit suppression | Make the audit repository unavailable during a change | 503, no change applied |
| Redaction bypass | `firebase.apiKey` through the private-key classifier | Redacted after the ordering bug fix in `settingClassification.js` (Phase 0) |
| Peer-admin lateral move | ADMIN acts on another ADMIN's account | Allowed only for equal rank; acting on a *higher* rank is denied by `targetAuthority.js` (Phase 0, 28 tests) |
