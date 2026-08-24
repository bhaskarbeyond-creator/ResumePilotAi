# ResumePilotAi — Final Control Plane QA Plan

**Purpose:** Independent validation of the completed control-plane
implementation by the local QA engineer.

**Prerequisites:** Firebase project credentials configured for the backend
(`FIREBASE_PRIVATE_KEY` / `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PROJECT_ID`, or
ADC), plus one `SUPER_ADMIN`, one `ADMIN`, one `AUDITOR`, one `USER`, and two
enterprise tenants (`Tenant A`, `Tenant B`).

**Pre-flight (run once):**

```bash
npm test                     # expect 671 tests / 0 failures
npm run test:enterprise      # expect 196 tests / 0 failures
npm run build                # expect exit 0
npm run lint                 # expect exit 0
```

---

## A. Super Admin → Enterprise

| # | Scenario | Steps | Expected |
|---|---|---|---|
| A1 | Create | `/adm/tenants` → Create enterprise (name, slug, plan) | 201/200; appears in directory |
| A2 | View 360 | Open Enterprise 360 | Overview/Org/Members/Roles/Subscription/Currency/AI/Usage/Audit present |
| A3 | Edit | Rename tenant | Persists after reload |
| A4 | Suspend | Suspend tenant | Members lose access (server 403); status shows SUSPENDED |
| A5 | Restore | Restore tenant | Access resumes; status ACTIVE |
| A6 | Members | Add member (uid/email + role) | Registry + user `tenantMemberships` both updated |
| A7 | Remove member | Remove member | Both registry and user profile reflect removal |
| A8 | AI policy | Change tenant AI policy | Enforcement reflects new limits |
| A9 | Audit | Open tenant audit | Actions above appear with actor/target/action/result |

## B. Super Admin → Users

| # | Scenario | Steps | Expected |
|---|---|---|---|
| B1 | Create | `/adm/users` → Provision User (email, role USER) | 201; appears in directory |
| B2 | Invalid create | Submit invalid email / role SUPER_ADMIN | 400 `INVALID_EMAIL` / `SUPER_ADMIN_PROVISION_FORBIDDEN` |
| B3 | Search | Search by name/email/UID | Matches within page (see limitation §10) |
| B4 | Pagination | Next/Previous across 50+ users | Cursor pagination correct, no duplicates/skips |
| B5 | Filter | Filter by role/status/plan/tenant | Correct results |
| B6 | User 360 | Open drawer | Identity/Security/Tenancy/RBAC/Billing/AI/Audit all populated |
| B7 | Suspend | Suspend a user | User cannot sign in (Firebase `disabled`); audit recorded |
| B8 | Restore | Restore | Sign-in works again |
| B9 | Role | Change role USER → AUDITOR | Role persists; **not** ADMIN (regression: role coercion fix) |
| B10 | Role escalation guard | Attempt to set SUPER_ADMIN via API | 400 |
| B11 | Subscription | Grant Premium 12mo | membership/membershipEnds/paymentStatus update |
| B12 | Currency | Change preferred currency | Normalized in directory + User 360 |
| B13 | AI quota | Set override + expiry, reset usage, remove override | Entitlement reflects each change |
| B14 | Tenant assign/remove | Assign to Tenant A, then remove | Memberships + primary org correct |
| B15 | Delete | Delete a test user | Destructive confirmation + recent-auth gate; data cleaned |

## C. Enterprise → Users (Enterprise Admin)

| # | Scenario | Steps | Expected |
|---|---|---|---|
| C1 | Directory | Enterprise console → members | Sees own members only |
| C2 | Invite | Invite member (email) | Invitation + membership recorded |
| C3 | Role | Change permitted member role | Server-enforced `tenant.roles.manage` |
| C4 | Remove | Remove member | Membership removed |
| C5 | Cross-tenant | Attempt to read/modify Tenant B member | 403 (fail closed) |
| C6 | AI | Adjust org-level AI allocation within limits | Enforcement reflects |
| C7 | Audit | View org audit | Org-scoped events only |

## D. Users → Enterprise

| # | Scenario | Steps | Expected |
|---|---|---|---|
| D1 | Context | `/api/enterprise/context` as member | Correct org, role, permissions |
| D2 | Multi-tenant | User in Tenant A (member) + Tenant B (admin) | Correct per-tenant role; primary org set |
| D3 | Boundary | Member cannot see other tenant's resources | 403 |
| D4 | Entitlements | User sees own AI/subscription/currency | Accurate |

## E. Security (adversarial)

| # | Scenario | Expected |
|---|---|---|
| E1 | Anonymous → Super Admin API | 401 |
| E2 | USER → `/api/admin/users` | 403 |
| E3 | AUDITOR → PATCH suspend/role | 403 |
| E4 | USER → Tenant A (no membership) | 403 |
| E5 | Tenant A admin → Tenant B resource | 403 |
| E6 | Member → escalate to ENTERPRISE_ADMIN | 403 |
| E7 | ENTERPRISE_ADMIN → platform config | 403 |
| E8 | Suspended user → protected resource | 403 |
| E9 | Removed member → tenant resource | 403 |
| E10 | SUPER_ADMIN without MFA (prod) → destructive | 403 `SUPER_ADMIN_MFA_REQUIRED` |
| E11 | Stale-target PATCH (wrong expectedRole) | 409 `ADMIN_TARGET_CHANGED` |
| E12 | Direct API PATCH role=SUPER_ADMIN | 400 |

## Regression gate

```bash
npm test && npm run test:enterprise && npm run build && npm run lint
```

All four must exit 0 before the control plane is accepted.

## Handover acceptance

Mark each of the following:

- [ ] A1–A9 pass
- [ ] B1–B15 pass
- [ ] C1–C7 pass
- [ ] D1–D4 pass
- [ ] E1–E12 pass
- [ ] Regression gate green
- [ ] Production deploy + `verify-production-identity.mjs` live SHA recorded
- [ ] Rollback SHA `ee38cb70` confirmed reachable
