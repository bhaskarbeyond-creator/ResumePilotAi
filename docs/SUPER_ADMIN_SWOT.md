# SUPER ADMIN `/adm` — SWOT

## Strengths

1. Reuses the certified Enterprise control plane instead of cloning it.
2. Firebase custom claims + `checkRevoked` + `enforceApiPolicy` + `requireSuperAdmin`.
3. Admin audit middleware on `/api/admin` and `/api/platform` with secret redaction; operator/maintenance/decommission classified HIGH.
4. Command center and Attention refuse invented trends; unavailable sources are labelled.
5. Consumer admin CRUD (users, jobs, companies, blog, phrases, billing) was already complete and was preserved.
6. Platform Admin (`ADMIN`) and Super Admin (`SUPER_ADMIN`) are distinct: destructive mutations are Super Admin + recent-auth + confirm.

## Weaknesses

| # | Weakness | Severity | Mitigation now |
|---|---|---|---|
| W1 | ADMIN still shares most settings write surface with SUPER_ADMIN | P2 | Destructive platform ops gated; accepted product-admin model |
| W2 | Queue/payment/security counts are inspected samples, not global scans | P2 | UI states “inspected” |
| W3 | Observability is in-process and resets on restart | P2 | Documented honestly |
| W4 | Playwright / live production not executed here | P1 | Suites exist; marked UNVERIFIED |
| W5 | Class-based UsersManager remains | P3 | Untouched to avoid regression |
| W6 | Operator list shows Firestore `users.role`, not live custom claims | P2 | API note + cannot treat UI as authority |

## Opportunities

1. Promote `/adm` search to a true entity index if Firestore composite indexes are added.
2. Surface per-tenant Enterprise outbox jobs as a drill-down (replay stays in `/enterprise`).
3. Assign SUPPORT a read-only `/adm` slice if product wants it (today SUPPORT is correctly excluded).

## Threats

| # | Threat | Severity | Control |
|---|---|---|---|
| T1 | Token still valid until revoke/expiry | P1 | `checkRevoked: true`; role changes revoke refresh tokens |
| T2 | Mass DLQ replay | P2 | Super Admin + recent auth + confirm + batch limit 20 |
| T3 | Accidental tenant decommission | P1 | Super Admin + reason ≥ 8 + confirm + lifecycle, not hard delete |
| T4 | Production TLS / deploy drift | P1 | Rollback tag `superadmin-rollback-64ba2df`; production verify UNVERIFIED from this sandbox |
| T5 | Accidental SUPER_ADMIN grant | P1 | Operators API rejects SUPER_ADMIN; existing SUPER_ADMIN claims protected |
