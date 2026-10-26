# Deployment runbook — platform RBAC (migration 028)

**Applies to:** commits `1d47922`, `b2803e1`, `5ace3e6` on
`arena/55faaf92-resumepilotai`.

**Audience:** whoever deploys. Every step has a verification command and a rollback.
If a verification fails, **stop** — do not proceed to the next step.

---

## 0. What changes for the running system

| Change | Observable effect on day one |
|---|---|
| Roles and permissions move from a frozen literal to `admin_roles` / `admin_role_permissions` | **None.** §A of the migration reproduces the literal exactly; a test parses the SQL to prove it. |
| `messages.read` granted to ADMIN and SUPPORT | Contact-form submissions become readable by ADMIN and SUPPORT (previously SUPER_ADMIN only). This is the sole intentional authority change. |
| Action hierarchy `manage ⊃ write ⊃ read` is applied on the request path | ADMIN can now read admin paths it could already write (`system.config.read` default). AUDITOR gains `audit.read` access to `/admin/audit-logs`. |
| `claims.permissions` on identity tokens is no longer authority | **Nothing in this codebase mints that claim** (verified: only `role` is set via `setCustomUserClaims`). If you have ever set a `permissions` custom claim by hand, it stops working — see §7.1. |
| Route authorisation is a manifest | Four corrections: audit-logs → `audit.read`, pages → `content.manage`, coupons → `payments.read`/`.manage`, settings → named rules. |
| New API `/api/admin/rbac/*` | SUPER_ADMIN can edit bundles and grants without a deploy. |

---

## 1. Pre-flight (no downtime)

```bash
# 1.1 The migration exists and is the one you reviewed
ls -l backend/database/migrations/028_admin_rbac.sql backend/database/migrations/028_admin_rbac.down.sql

# 1.2 The seed still equals the code vocabulary
cd backend && NODE_ENV=test node --test --test-concurrency=1 --test-force-exit \
  test/admin-rbac-resolver.test.js test/route-manifest.test.js test/admin-rbac-api.test.js
# expect: 31 tests, 31 pass

# 1.3 The running code is the reviewed code
git log --oneline -3
# expect: 5ace3e6, b2803e1, 1d47922
```

**Pre-flight gate:** 1.2 must be green. It is the only automated proof that the
migration will not change anyone's authority when it is applied.

---

## 2. Apply the migration

The application applies migrations at boot (`backend/database/migrations` runner
invoked from `initializeSchema`). Two supported paths:

### 2.1 Normal path — deploy and let the boot apply it

```bash
# The boot logs, in order:
#   [Startup] Schema bootstrap ...
#   [AdminRBAC] Loaded 8 role(s) and N stored permission(s).
```

Verification:

```sql
-- 2.1a Eight roles, all system
SELECT name, rank, is_system FROM admin_roles ORDER BY rank DESC;
-- SUPER_ADMIN 100, ADMIN 80, AUDITOR 60, SUPPORT 60, EMPLOYER 40,
-- ENTERPRISE_ADMIN 30, ENTERPRISE_MEMBER 20, USER 10

-- 2.1b SUPER_ADMIN holds the wildcard, and ONLY the wildcard
SELECT resource, action FROM admin_role_permissions p
  JOIN admin_roles r ON r.id = p.role_id
 WHERE r.name = 'SUPER_ADMIN';
-- ('*','*')  <- exactly one row

-- 2.1c The one intentional grant
SELECT r.name FROM admin_role_permissions p JOIN admin_roles r ON r.id = p.role_id
 WHERE p.resource = 'messages' AND p.action = 'read' ORDER BY r.name;
-- ADMIN, SUPPORT
```

### 2.2 Controlled path — apply before the deploy

```bash
mysql -h "$DB_HOST" -u "$DB_USER" -p "$DB_NAME" < backend/database/migrations/028_admin_rbac.sql
```

Idempotent: `CREATE TABLE IF NOT EXISTS`, `ON DUPLICATE KEY UPDATE` for roles, and
`INSERT IGNORE` for permissions. Running it twice is safe and changes nothing.

---

## 3. Verify the runtime authority

```bash
# 3.1 The resolver reports database truth, not the literal fallback
curl -s -H "Authorization: Bearer $SUPER_ADMIN_TOKEN" \
  "$API/api/admin/rbac/roles" | jq '{source, roles: (.roles|length)}'
# expect: {"source":{"degraded":false,"source":"database", …}, "roles":8}

# 3.2 AUDITOR reaches the audit trail (previously 403)
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $AUDITOR_TOKEN" \
  "$API/api/admin/audit-logs"
# expect: 200

# 3.3 ADMIN reaches settings (previously 403 because it lacked system.config.read)
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $ADMIN_TOKEN" \
  "$API/api/admin/settings"
# expect: 200

# 3.4 A role change takes effect without a restart, and is audited
curl -s -X PUT "$API/api/admin/rbac/roles/SUPPORT/permissions" \
  -H "Authorization: Bearer $SUPER_ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"permissions":[{"resource":"users","action":"read"},{"resource":"tickets","action":"manage"}],
       "reason":"Reverting a temporary grant after verification"}' | jq '{changed, added, removed, auditRecorded}'
# expect: changed reflects reality, auditRecorded: true
```

**If 3.1 reports `"source": "literal-fallback"`:** the store was unreachable at
boot. The system is *safe* (pre-028 authority) but not *configurable*. Check
`[AdminRBAC] admin.rbac.store_unavailable` in the logs, fix connectivity, and
restart. Do **not** treat this as success.

---

## 4. Rollback

There are three independent levels. Use the smallest one that fixes the problem.

### 4.1 Roll back one role change (seconds, no deploy)

Re-apply the previous bundle through the API. The response's `before` is the
previous state:

```bash
curl -s -X PUT "$API/api/admin/rbac/roles/SUPPORT/permissions" \
  -H "Authorization: Bearer $SUPER_ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"permissions":[ {"resource":"users","action":"read"},
                       {"resource":"email.logs","action":"read"},
                       {"resource":"tenants","action":"read"},
                       {"resource":"tickets","action":"manage"} ],
       "reason":"Rollback: restoring the audited previous bundle"}'
```

### 4.2 Roll back the resolver (one deploy, schema intact)

Set `ADMIN_RBAC_CACHE_TTL_MS` to a value that forces constant expiry is **not** a
rollback. The supported rollback is to revert commit `1d47922` and redeploy. The
tables remain; the code stops reading them. Authority returns to the literal in
`security/permissionVocabulary.js` — the exact pre-028 behaviour.

### 4.3 Roll back the schema

```bash
sed -n '1,40p' backend/database/migrations/028_admin_rbac.down.sql
mysql -h "$DB_HOST" -u "$DB_USER" -p "$DB_NAME" < backend/database/migrations/028_admin_rbac.down.sql
```

The down migration drops `admin_user_roles`, `admin_role_permissions` and
`admin_roles` in dependency order. Afterwards the resolver falls back to the
literal **by construction** (it treats a missing store as degraded), so a schema
rollback is not a lockout. Verify with §3.1 — `source` must read `literal-fallback`
and every role must still resolve.

> **Data loss warning.** §4.3 discards every grant recorded in `admin_user_roles`.
> Export first:
> ```sql
> SELECT * FROM admin_user_roles INTO OUTFILE '/tmp/admin_user_roles_backup.csv'
>   FIELDS TERMINATED BY ',' OPTIONALLY ENCLOSED BY '"' LINES TERMINATED BY '\n';
> ```

---

## 5. Granting a role to a person (the operational task this unblocks)

```bash
# 5.1 Time-boxed grant, with a reason that will be read by an auditor
curl -s -X POST "$API/api/admin/rbac/grants" \
  -H "Authorization: Bearer $SUPER_ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"uid":"<firebase-uid>","role":"ADMIN",
       "reason":"On-call cover for the billing incident, expires with the rota",
       "expiresAt":"2026-11-02T09:00:00Z"}' | jq

# 5.2 Confirm the resolver sees it
curl -s -H "Authorization: Bearer $SUPER_ADMIN_TOKEN" \
  "$API/api/admin/rbac/grants" | jq '.[] | select(.uid=="<firebase-uid>")'

# 5.3 Revoke
curl -s -X DELETE "$API/api/admin/rbac/grants/<firebase-uid>/ADMIN" \
  -H "Authorization: Bearer $SUPER_ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"reason":"On-call cover ended; incident closed"}' | jq '{auditRecorded}'
```

**Rules the API will enforce, so you are not surprised:**

| Attempt | Response |
|---|---|
| Grant a role to yourself | `409 SELF_ESCALATION_BLOCKED` |
| Widen a role you hold | `409 SELF_ESCALATION_BLOCKED` |
| Remove the wildcard from SUPER_ADMIN | `409 BREAK_GLASS_REMOVAL_BLOCKED` |
| Edit USER / EMPLOYER / ENTERPRISE_* | `409 PLATFORM_MANAGED_ROLE` — use the enterprise API |
| Reason shorter than 12 characters | `400 VALIDATION_FAILED` with `field: "reason"` |
| Stale sign-in (> 10 min by default) | `403 RECENT_AUTH_REQUIRED` |
| Store unreachable | `503 RBAC_OPERATION_FAILED` — the change did **not** happen |

---

## 6. Break-glass: every super-admin is locked out

Requires database credentials — which is the point: recovering authority should need
a different secret from the one authority controls.

```sql
-- 6.1 Find the account that should be able to fix this
SELECT uid, email FROM users WHERE role = 'SUPER_ADMIN' ORDER BY created_at LIMIT 5;

-- 6.2 Confirm the break-glass role still holds the wildcard
SELECT p.resource, p.action FROM admin_role_permissions p
  JOIN admin_roles r ON r.id = p.role_id WHERE r.name = 'SUPER_ADMIN';

-- 6.3 If the wildcard was lost (it cannot be, via the API), restore it
INSERT IGNORE INTO admin_role_permissions (role_id, resource, action, granted_by)
SELECT id, '*', '*', 'break-glass:manual' FROM admin_roles WHERE name = 'SUPER_ADMIN';

-- 6.4 Grant SUPER_ADMIN to a specific uid inside the grant framework, so the
--     recovery is itself auditable and revocable through the API
INSERT INTO admin_user_roles (uid, role_id, granted_by, reason)
SELECT ?, id, 'break-glass:manual', 'Lockout recovery — revoke after restoring access'
  FROM admin_roles WHERE name = 'SUPER_ADMIN'
ON DUPLICATE KEY UPDATE reason = VALUES(reason);
```

Then restart the API (to clear the cache) and, within the hour:
1. sign in as that account and confirm `/api/admin/rbac/roles` returns 200;
2. create a *second* super-admin with `POST /api/admin/rbac/grants`;
3. revoke the break-glass grant with a reason that names this runbook section.

---

## 7. Post-deploy checks that catch the failures this design fears

| Check | Command | Fail means |
|---|---|---|
| Seed drift | `node --test test/admin-rbac-resolver.test.js` | the migration and the vocabulary disagree — do not proceed |
| Route coverage | `node --test test/route-manifest.test.js` | a route exists with no authorisation rule |
| Cache warmed | log line `[AdminRBAC] Loaded N role(s)` at boot | the store was unreachable; system is in literal fallback |
| No degraded responses | `grep admin.rbac.store_unavailable` in logs | store flapping |
| Audit trail intact | §3.4 `auditRecorded: true` | the audit repository is down — authority changes are being refused, by design |

### 7.1 If you have legacy `permissions` custom claims

They are no longer authority. To migrate them into the new model:

```sql
-- For each uid with a hand-set permissions claim, grant the equivalent role
INSERT IGNORE INTO admin_user_roles (uid, role_id, granted_by, reason)
SELECT 'the-uid', id, 'migration:claims', 'Converted from a legacy permissions claim'
  FROM admin_roles WHERE name = 'ADMIN';
```

Do **not** re-add the merge in code. A grant that is not persisted cannot be
audited, which is the defect REC-005 removed.

---

## 8. Configuration the deployment must set

| Variable | Default | Why it matters |
|---|---|---|
| `ADMIN_RBAC_CACHE_TTL_MS` | `15000` | How long a role change can take to be observed by a process that did not perform it. Writes invalidate locally; other instances converge within this window. Lower = faster convergence, more queries. |
| `SENSITIVE_AUTH_MAX_AGE_MS` | `600000` | Step-up window for authority changes. |
| `SUPER_ADMIN_MFA_REQUIRED` | `true` in production | If MFA is enforced and the only super-admin has none, every authority change returns `403 SUPER_ADMIN_MFA_REQUIRED`. Enrol MFA **before** the deploy. |
| `REQUIRE_RECENT_AUTH_IN_TEST` | unset | Test-only. Leave unset in production. |

> **Multi-instance note.** The RBAC cache is per process. A role change made on
> instance A is observed by instance B after at most `ADMIN_RBAC_CACHE_TTL_MS`. If
> your fleet is large or the TTL must be long, the correct fix is a pub/sub
> invalidation, recorded as `OI-005-7`.
