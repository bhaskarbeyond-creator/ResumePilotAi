# Super Admin `/adm` Capability Matrix

Legend: **PASS** = automated local evidence in this checkout; **FAIL** = independently observed failure; **UNVERIFIED** = no qualifying evidence; **N/A** = not an actual `/adm` module/capability.

## A. Actual `/adm` route inventory

| Module | Route | Primary implementation | Server/API boundary | Role intent | Local status | Live status |
|---|---|---|---|---|---|---|
| Command center | `/adm/dashboard` | `dashboard/dashboard.jsx` | Firestore aggregate reads, `/api/platform/health`, audit read | ADMIN/SUPER_ADMIN | PASS build/regression | UNVERIFIED — static UI 500 |
| Admin audit trail | `/adm/audit-logs` | `audit/AdminAuditLogs.jsx` | `/api/admin/audit-logs*` | ADMIN/SUPER_ADMIN | PASS route contract | UNVERIFIED |
| Queue & DLQ monitor | `/adm/queues` | `queues/PlatformQueues.jsx` | `/api/platform/queues*` | Read: ADMIN; replay: SUPER_ADMIN | PASS route tests | UNVERIFIED |
| Tenant registry | `/adm/tenants` | `tenants/PlatformTenants.jsx` | `/api/platform/tenants*` | SUPER_ADMIN | PASS API contract + integration | UNVERIFIED |
| Users manager | `/adm/users` | `usersManager/UsersManager.jsx` | `/api/admin/users/:uid`, delete flow | ADMIN; roles: SUPER_ADMIN | PASS server policy tests | UNVERIFIED |
| User editor | `/adm/user/ss` | `userEdit/UserEdit.jsx` | one audited mutation per request | ADMIN/SUPER_ADMIN by field | PASS build; no browser binary | UNVERIFIED |
| Phrase library | `/adm/phrases` | `phrases/Phrases.jsx` | `/api/admin/phrases*` | ADMIN/SUPER_ADMIN | PASS CRUD integration | UNVERIFIED |
| Contact messages | `/adm/messages` | `messages/Messages.jsx` | Firestore read | ADMIN/SUPER_ADMIN | PASS existing product tests | UNVERIFIED |
| Reviews | `/adm/reviews` | `reviews/Reviews.jsx` | `/api/admin/reviews*` | ADMIN/SUPER_ADMIN | PASS existing integration | UNVERIFIED |
| Trusted-by logos | `/adm/trustedby` | `TrustedBy/TrustedBy.jsx` | `/api/admin/trusted-by*` | ADMIN/SUPER_ADMIN | PASS existing integration | UNVERIFIED |
| Employer applications | `/adm/employer-applications` | `employerApplications/EmployerApplications.jsx` | `/api/admin/employer-applications/:uid` | ADMIN/SUPER_ADMIN | PASS existing integration | UNVERIFIED |
| Job moderation | `/adm/jobs-manager` | `jobsManager/JobsManager.jsx` | `/api/admin/jobs/:jobId` | ADMIN/SUPER_ADMIN | PASS existing integration | UNVERIFIED |
| Company moderation | `/adm/company-management` | `companyManagement/CompanyManagement.jsx` | `/api/admin/companies/:companyId` | ADMIN/SUPER_ADMIN | PASS existing integration | UNVERIFIED |
| Blog moderation | `/adm/blog-management` | `blogManagement/BlogManagement.jsx` | `/api/admin/blog/**` | ADMIN/SUPER_ADMIN | PASS existing integration | UNVERIFIED |
| Landing content | `/adm/landing-pages` | `landingPages/LandingPages.jsx` | `/api/admin/landing-content` | ADMIN/SUPER_ADMIN | PASS existing integration | UNVERIFIED |
| Settings | `/adm/settings?tab=*` | `settings/Settings.jsx` | `/api/admin/**`, `/api/email/admin/**` | ADMIN/SUPER_ADMIN; special gates vary | PASS existing regression | UNVERIFIED |

## B. Settings modules actually rendered by `Settings.jsx`

| Group | Tabs | Status |
|---|---|---|
| Modules | Addon modules | PASS local regression |
| General | Brand/meta, branding, Geo SEO, LLM GEO, Firebase, social/OAuth, email/SMTP | PASS local regression; provider/live checks UNVERIFIED |
| AI & Services | Storage, AI governance, PDF exporter, job scraper, Twilio SMS | PASS route and static regression; external provider test UNVERIFIED |
| Payments | Orders, subscriptions/gateways, watermark | PASS local workflow tests; live financial-provider transaction UNVERIFIED |
| Security & Health | Integrations, limits, system health, code injection, GDPR/legal | PASS local regression; production operational posture UNVERIFIED |
| Content & Media | Templates, pages, blog settings, social, analytics, ads | PASS local regression |

`FacebookAuthSettings` is imported but not surfaced as a separate settings navigation item. It is not counted as an independently reachable `/adm` module.

## C. Required capability matrix

| Capability | Implementation / evidence | Status |
|---|---|---|
| Super Admin identity distinction | `requireSuperAdmin`, server route gates, hidden platform controls | PASS local |
| Legacy ADMIN boundary | `requirePermission('system.config.write')`, role-disabled UI controls | PASS local |
| Tenant provision | `POST /api/platform/tenants`, tenant service + audit | PASS local |
| Tenant view/search/filter/page | Tenant registry UI with server list and local filter/page | PASS local |
| Tenant rename | `PATCH /api/platform/tenants/:id` | PASS local |
| Tenant suspend/reactivate | typed confirmation + valid lifecycle transition | PASS local |
| Tenant decommission start | typed confirmation → `DELETING`; no false claim of destructive purge | PASS local |
| Tenant final purge | No `/adm` final-purge operation exists | N/A / intentionally not exposed |
| Queue state | observed outbox query; unavailable state explicit | PASS local |
| DLQ replay | DLQ-only, confirmation, recent auth, SUPER_ADMIN, bounded 20 | PASS local |
| Queue retry all | same as replay all dead letters | PASS local |
| User create | SUPER_ADMIN-only standard USER provisioning with temporary-password validation/redaction | PASS local |
| User list/search/filter/page | Server-curated `/api/admin/users` directory with bounded filter/page contract; browser proof pending | PASS local; UNVERIFIED browser/live |
| User activate/deactivate | server-authenticated status mutation | PASS local |
| User plan grant/revoke | server-authenticated membership mutation | PASS local |
| ADMIN role grant/revoke | SUPER_ADMIN-only backend field permission | PASS local |
| SUPER_ADMIN protection | generic user mutation/delete forbidden | PASS local |
| Operator management | No separately modeled `/adm` operator entity | N/A |
| Announcements | No actual `/adm` announcement entity/module | N/A |
| Phrase management | trusted CRUD API + public projection | PASS local |
| Audit search/filter/export | server keyset pagination, URL-backed filters, client export; browser proof pending | PASS local; UNVERIFIED browser/live |
| AI governance | settings/AI provider and quota APIs | PASS local regression; real provider test UNVERIFIED |
| Maintenance | existing system health setting with recent auth | PASS local regression; live behavior UNVERIFIED |
| MFA | Firebase native MFA exists; platform-specific live MFA flow not exercised | UNVERIFIED |
| Recent auth | policy gate and reauth UI implemented; local route evidence | PASS local; live UNVERIFIED |
| Responsive drawer | `/adm` mobile drawer code added | PASS build; browser viewports UNVERIFIED due missing Chromium |
| Accessibility dialogs | shared focus-trapping dialog used for newly hardened operations | PASS source/build; assistive-tech audit UNVERIFIED |

## D. `/adm` API contract matrix (directly owned/newly audited)

| UI consumer | Method/path | Handler/service | Gate | Response used by UI |
|---|---|---|---|---|
| Tenant registry list | GET `/api/platform/tenants?limit=200` | `platformRouter` → `TenantService.listPlatformTenants` | SUPER_ADMIN | `{tenants,count}` |
| Tenant provision | POST `/api/platform/tenants` | `TenantService.provisionTenant` | SUPER_ADMIN + recent auth | `{tenant,workspace}` |
| Tenant detail | GET `/api/platform/tenants/:id` | `TenantService.getPlatformTenant` | SUPER_ADMIN | `{tenant}` |
| Tenant rename | PATCH `/api/platform/tenants/:id` | `TenantService.updateTenantProfileAsPlatform` | SUPER_ADMIN + recent auth | `{tenant}` |
| Suspend | POST `/api/platform/tenants/:id/suspend` | lifecycle service | SUPER_ADMIN + recent auth + `SUSPEND <slug>` | `{tenant}` |
| Reactivate | POST `/api/platform/tenants/:id/reactivate` | lifecycle service | SUPER_ADMIN + recent auth + `REACTIVATE <slug>` | `{tenant}` |
| Decommission start | POST `/api/platform/tenants/:id/decommission` | lifecycle service | SUPER_ADMIN + recent auth + `DECOMMISSION <slug>` | `{tenant}` |
| Queue view | GET `/api/platform/queues` | platform outbox query | Admin policy boundary | `{summary,jobs}` |
| Queue replay | POST `/api/platform/queues/retry` | platform outbox write | SUPER_ADMIN + recent auth + typed confirmation | `{retriedCount,replayedIds}` |
| Phrase list | GET `/api/admin/phrases` | Admin phrase route | ADMIN namespace | `{categories}` |
| Phrase category | POST/DELETE `/api/admin/phrases/:id?` | Admin phrase transaction | ADMIN namespace | `{category}` / success |
| Phrase entry | POST/DELETE `/api/admin/phrases/:id/entries` | Admin phrase transaction | ADMIN namespace | `{category}` / success |
| Consumer phrase read | GET `/public/phrases.json` | curated projection | Public read | `{categories}` |
| Generic user mutation | PATCH `/api/admin/users/:uid` | identity + Firestore transaction | field permission, target guard | `{changedFields}` |

Full legacy Admin endpoint references remain governed by the existing `backend/index.js` and `backend/routes/email.js` route registrations. The reproducible source assertion is `npm run test:admin:contract`.

## E. Explicitly absent requests from the original checklist

The repository does **not** contain actual `/adm` modules for a standalone operator directory, platform announcements, standalone jobs queue, separate AI policy entity, tenant billing, final tenant purge, or a platform operator role registry. They must not be reported as PASS merely because they were listed in an assignment template.
