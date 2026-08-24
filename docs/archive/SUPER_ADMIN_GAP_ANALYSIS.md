# Super Admin `/adm` — Gap Analysis (after this pass)

## Bugs found and RCA

| ID | Finding | RCA | Fix |
|---|---|---|---|
| G1 | Phrases existed as a route but vanished from grouped sidebar | Sidebar rewrite omitted it | Restored in Consumer Product + palette |
| G2 | Announcements had create/update but no delete | Incomplete CRUD | `DELETE /api/platform/announcements/:id` + UI confirm |
| G3 | ADMIN vs SUPER_ADMIN still unclear in product language | Both could enter /adm; only a badge distinguished them | Operators page + header “Platform Admin” vs “Super Admin” |
| G4 | Command palette was nav-only | No entity search wiring | Live `GET /api/platform/search` hits |
| G5 | Enterprise durable outbox invisible in /adm | Only notification_outbox was shown | Read-only `GET /api/platform/enterprise-queue` wrapping existing `getOutboxStatus` |
| G6 | No first-class attention list | Recommendations buried on dashboard | `/adm/attention` + backend signals (health, DLQ, payments, security, tenants, maintenance) |
| G7 | DLQ retry / announcement delete / operator assign / maintenance enable had no confirm | Destructive UX incomplete | `window.confirm` on those mutations |
| G8 | ADMIN saw enabled DLQ replay buttons that always 403 | Dead control | Buttons disabled + “Super Admin only” |
| G9 | Operator / maintenance / decommission audit severity was MEDIUM | Generic POST rule | `deriveSeverity` HIGH; `deriveAction` for operators |
| G10 | `PATCH /api/admin/users/:uid` could demote SUPER_ADMIN | Users API allowed ADMIN/USER without protecting existing SUPER_ADMIN claims | Fail closed with `SUPER_ADMIN_PROTECTED` |
| G11 | Platform mutations did not retry after reauth | `platformFetch` ignored `RECENT_AUTH_REQUIRED` | Wired to `fetchAdminWithReauth` + refreshed Bearer token |

## Still not implemented (by design)

| Item | Why |
|---|---|
| Duplicate tenant IAM / M2M / support in /adm | Enterprise owns them |
| Assign SUPER_ADMIN from UI | Out-of-band only; API rejects |
| Restore from DELETING | Lifecycle does not allow it |
| Fake revenue trends / APM | No real warehouse |
| Ticket/incident desk | Attention is derived signals only |

## Still UNVERIFIED

| Item | Why |
|---|---|
| Playwright execution | No Chromium in this environment at last attempt |
| Live production /adm | TLS to airesume.projectdemo.guru fails here |
| Deploy / COMMIT_SHA / PM2 | Not performed |

## Backend vs UI vs tests

| Capability | Backend | UI | Tests |
|---|---|---|---|
| Command center | Yes | Yes | Yes |
| Tenant lifecycle | Enterprise + decommission | Yes | URL + 403 tests |
| Security events | Yes | Yes | Static |
| Queues/DLQ | Yes | Yes + confirm + Super Admin gate | Super Admin 403 |
| Announcements CRUD | Yes | Yes + delete confirm | Delete 403 + deriveAction |
| Operators | Yes | Yes + confirm | Invalid role 400, ADMIN 403 |
| Attention | Yes (inspected signals) | Yes | GET 200 |
| Enterprise queue posture | Yes | Operations | GET 200 |
| Phrases | Existing | Restored | Static route+nav |
| Playwright | Suite exists | — | UNVERIFIED |
| Production | — | — | UNVERIFIED |
