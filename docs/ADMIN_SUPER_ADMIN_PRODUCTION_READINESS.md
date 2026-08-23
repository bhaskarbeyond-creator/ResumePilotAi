# Admin + Super Admin production readiness

## Gate matrix

| Gate | Code/tool evidence | Status from this environment |
| --- | --- | --- |
| Architecture | `docs/ADMIN_SUPER_ADMIN_FINAL_ARCHITECTURE.md`, Enterprise regression suite | PASS locally / live UNVERIFIED |
| Configuration | `GET /api/platform/configuration`, feature flags UI | PASS contract / live UNVERIFIED |
| API contracts | source-generated `docs/FINAL_API_INVENTORY.md`, API verifier | PASS source / live UNVERIFIED |
| Tenant control | platform list/detail/rename + Enterprise lifecycle | PASS contract / live UNVERIFIED |
| User control | Firebase Auth-backed directory + guarded PATCH/delete | PASS contract / live UNVERIFIED |
| CRUD | `scripts/verify-crud-live.mjs` + read-back/audit | live UNVERIFIED |
| RBAC separation | server `requirePermission`/`requireSuperAdmin` + negative tests | PASS locally / live UNVERIFIED |
| MFA/reauth | Firebase second-factor claim + `auth_time` | PASS contract / live UNVERIFIED |
| Audit | admin middleware + explicit security/tenant events | PASS contract / live UNVERIFIED |
| Secret handling | write-only projections, preserve/replace/clear | PASS locally / live UNVERIFIED |
| Platform health | real probe collector + no-zero UI | PASS locally / live UNVERIFIED |
| UI/UX | Enterprise-aligned controls and live Playwright | source PASS / live UNVERIFIED |
| Responsive | six viewport Playwright loop | live UNVERIFIED |
| Enterprise regression | `npm run test:enterprise:all` | must run before release |
| Consumer regression | `npm run test`, `npm run test:product` | must run before release |
| Validation tooling | four live scripts + Playwright config | PASS (built) |
| Documentation | requested matrix/runbook/flowcharts | PASS (built) |

## Release blockers

Do not promote until the Local Developer records PASS for all live gates. In particular, a green local test run does not prove production identity, Firebase claim configuration, payment provider behavior, Firestore indexes, worker liveness, or responsive UI.

## Operational safeguards

- Build from the exact commit and stamp backend/frontend identity.
- Take a fresh backup before deploy; run `scripts/verify-backup-rollback.mjs`.
- Keep `ENTERPRISE_TENANCY_ENABLED=false` until tenant data-plane, encryption, membership, and operator gates are approved.
- Keep infrastructure-owned secret rotation outside production Admin UI.
- Use disposable `zz-cert-*` resources only for live CRUD and inspect cleanup output.
- Purge CDN only after identity verification says the intended build is deployed.
- Roll back to a known-good ancestor, then rerun identity/health/API checks.
