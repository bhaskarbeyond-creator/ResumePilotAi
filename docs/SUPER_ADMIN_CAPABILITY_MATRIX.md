# SUPER ADMIN `/adm` — Capability Matrix

Classification: EXISTS | PARTIAL | BROKEN | UNWIRED | MISSING | EXTERNAL | NOT APPLICABLE

Belongs in `/adm`? Yes / No / Via Enterprise

| # | Capability | Status | In `/adm`? | Evidence |
|---|---|---|---|---|
| 1 | Platform Command Center | EXISTS | Yes | `/adm/dashboard` + `GET /api/platform/command-center` |
| 2 | Global platform health | EXISTS | Yes | Health score, DB ping, runtime, SHA |
| 3 | Tenant registry | EXISTS | Yes | Reuses `/api/enterprise/platform/tenants` |
| 4 | Tenant provisioning | EXISTS | Yes | `POST /api/enterprise/tenants` |
| 5 | Tenant lifecycle | EXISTS | Yes | Active / Suspended / DELETING |
| 6 | Tenant suspension | EXISTS | Yes | `/suspend` (URL bug fixed) |
| 7 | Tenant reactivation | EXISTS | Yes | `/reactivate` (URL bug fixed) |
| 8 | Tenant decommissioning | EXISTS | Yes | Super Admin `DELETING` + reason + confirm |
| 9 | Tenant health | PARTIAL | Yes | Attention list from lifecycle; no per-tenant synthetic score |
| 10 | Tenant usage | EXTERNAL | Via Enterprise | Link to `/enterprise?tab=usage` |
| 11 | Tenant quotas | EXTERNAL | Via Enterprise | Existing tenant quota APIs |
| 12 | Global users | EXISTS | Yes | `/adm/users` |
| 13 | User lifecycle | PARTIAL | Yes | Suspend/delete/membership; no archive |
| 14 | User security | PARTIAL | Yes | Role/suspend + token revoke; MFA mgmt is user-self |
| 15 | Platform roles | EXISTS | Yes | `/adm/operators` assigns ADMIN/SUPPORT/USER; SUPER_ADMIN out-of-band |
| 16 | Platform permissions | MISSING | No | Hardcoded in `auth.js` (intentional fail-closed) |
| 17 | SUPER_ADMIN separation | EXISTS | Yes | Server gates: decommission, DLQ replay, maintenance, announcement CUD, operators |
| 18 | Support engineers | EXTERNAL | Via Enterprise | `EnterpriseSupportTab`; SUPPORT cannot open `/adm` |
| 19 | Break-glass | EXTERNAL | Via Enterprise | Support grants |
| 20 | Service accounts | EXTERNAL | Via Enterprise | `EnterpriseSecurityTab` |
| 21 | M2M | EXTERNAL | Via Enterprise | `enterpriseM2m` |
| 22 | AI providers | EXISTS | Yes | Settings AI tab |
| 23 | AI models | EXISTS | Yes | Settings AI tab |
| 24 | Global AI governance | PARTIAL | Yes | Settings + tenant AI policy in Enterprise |
| 25 | AI quotas | PARTIAL | Yes | `/api/admin/ai/quota-*` |
| 26 | Feature flags | PARTIAL | Yes | Modules settings; env flags remain env |
| 27 | Global configuration | EXISTS | Yes | 30 settings tabs |
| 28 | Security policies | PARTIAL | Yes | Security limits + tenant security policy |
| 29 | Identity policies | PARTIAL | Yes | Social/Firebase settings + tenant SSO/MFA |
| 30 | Global audit | EXISTS | Yes | `/adm/audit-logs` |
| 31 | Security events | EXISTS | Yes | `/adm/security` |
| 32 | Queue | EXISTS | Yes | `/adm/queues` (notification outbox) |
| 33 | DLQ | EXISTS | Yes | Replay Super Admin only + confirm |
| 34 | Background jobs | PARTIAL | Yes | Notification outbox + Enterprise outbox posture (`/adm/operations`) |
| 35 | Notifications | PARTIAL | Yes | Outbox + settings |
| 36 | Email delivery | PARTIAL | Yes | Queue monitor + SMTP settings |
| 37 | Email failures | EXISTS | Yes | DLQ + lastError |
| 38 | Storage | PARTIAL | Yes | Storage settings; no usage meter |
| 39 | Encryption/key status | EXISTS | Yes | `/adm/operations` (no key material) |
| 40 | Backup | PARTIAL | Yes | Capability + last export from audit; export remains Enterprise |
| 41 | Restore | EXTERNAL | Via Enterprise | `enterpriseBackup.restoreTenantSnapshot` |
| 42 | Data retention | PARTIAL | Via Enterprise + GDPR settings | |
| 43 | Compliance | PARTIAL | Yes | GDPR settings |
| 44 | Observability | EXISTS | Yes | In-process enterprise metrics + command center |
| 45 | Error aggregation | PARTIAL | Yes | Observability error counters; no external APM |
| 46 | API health | EXISTS | Yes | `/api/healthz` `/readyz` header + command center |
| 47 | Deployment health | PARTIAL | Yes | Commit SHA + runtime; PM2 not queried from this host |
| 48 | Release management | MISSING | No | Deploy remains operational/runbook |
| 49 | Maintenance mode | EXISTS | Yes | Super Admin + confirm on enable + public_config dual-write |
| 50 | Platform announcements | EXISTS | Yes | Super Admin full CRUD (POST/PATCH/DELETE) |
| 51 | Billing | EXISTS | Yes | Orders/subscriptions settings |
| 52 | Subscriptions | EXISTS | Yes | |
| 53 | Payments | EXISTS | Yes | Payment health sample + ledger |
| 54 | Coupons | EXISTS | Yes | |
| 55 | Revenue | PARTIAL | Yes | Stored earnings only |
| 56 | Consumer product administration | EXISTS | Yes | Jobs, companies, employers, users |
| 57 | Content | EXISTS | Yes | Pages/blog/ads |
| 58 | Jobs | EXISTS | Yes | |
| 59 | Companies | EXISTS | Yes | |
| 60 | Reviews | EXISTS | Yes | |
| 61 | Blog | EXISTS | Yes | |
| 62 | Landing pages | EXISTS | Yes | |
| 63 | Trusted-by | EXISTS | Yes | |
| 64 | Ads | EXISTS | Yes | |
| 65 | Global search | PARTIAL | Yes | Command palette + `GET /api/platform/search` (email/id/tenant) |
| 66 | Command palette | EXISTS | Yes | ⌘K nav + live entity search |
| 67 | Notifications center | PARTIAL | Yes | Announcements + consumer notifications |
| 68 | Admin activity | EXISTS | Yes | Audit + dashboard stream |
| 69 | Incident management | PARTIAL | Yes | `/adm/attention` derived signals; no ticket system |
| 70 | Platform risk intelligence | PARTIAL | Yes | Risk score from inspected signals only |
| 71 | Phrases CMS | EXISTS | Yes | `/adm/phrases` restored in sidebar + palette |
| 72 | Platform operators | EXISTS | Yes | `/adm/operators` + `GET/POST /api/platform/operators` |
| 73 | Enterprise outbox posture | EXISTS | Yes | `GET /api/platform/enterprise-queue` (read-only) |

**Not blindly added:** a second tenant registry, a fake metrics warehouse, a competing M2M system, or a fabricated revenue trend chart.
