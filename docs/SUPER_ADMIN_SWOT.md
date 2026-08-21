# SUPER ADMIN `/adm` — SWOT

## Strengths

1. Reuses the certified Enterprise control plane instead of cloning it.
2. Firebase custom claims + `checkRevoked` + `enforceApiPolicy` + `requireSuperAdmin`.
3. Admin audit middleware on `/api/admin` and `/api/platform` with secret redaction.
4. Command center refuses invented trends; unavailable sources are labelled.
5. Consumer admin CRUD (users, jobs, companies, blog, billing) was already complete and was preserved.

## Weaknesses

| # | Weakness | Severity | Mitigation now |
|---|---|---|---|
| W1 | ADMIN still shares most settings write surface with SUPER_ADMIN | P1 | Destructive platform ops gated |
| W2 | Queue view samples 50–100 outbox docs, not a global count | P2 | UI states “inspected” |
| W3 | Observability is in-process and resets on restart | P2 | Documented honestly |
| W4 | Playwright / live production not executed here | P1 | Suites exist; marked UNVERIFIED |
| W5 | Class-based UsersManager remains | P3 | Untouched to avoid regression |

## Opportunities

1. Promote `/adm` search to a true entity index if Firestore composite indexes are added.
2. Surface Enterprise outbox jobs (signed tenant jobs) next to notification outbox without merging stores.
3. Assign SUPPORT a read-only `/adm` slice if product wants it (today SUPPORT is correctly excluded).

## Threats

| # | Threat | Severity | Control |
|---|---|---|---|
| T1 | Token still valid until revoke/expiry | P1 | `checkRevoked: true`; role changes revoke refresh tokens |
| T2 | Mass DLQ replay | P2 | Super Admin + recent auth + batch limit 20 |
| T3 | Accidental tenant decommission | P1 | Super Admin + reason + lifecycle, not hard delete |
| T4 | Production TLS / deploy drift | P1 | Rollback SHA `e884770`; production verify UNVERIFIED from this sandbox |
