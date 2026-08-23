# Admin + Super Admin complete capability matrix

**Baseline audited:** `01168acccff4cecdec95af224a1f34ce30917da1`
**Live:** `UNVERIFIED` until the Local Developer runbook executes.
**Notation:** `R` read, `C` create, `U` update, `D` delete/decommission, `—` not supported, `SA` Super Admin-only, `PA` Platform Admin capability, `TP` tenant policy.

Every mutation listed as implemented is intended to follow **UI → authenticated HTTP → server authorization → Firestore/provider mutation → audit → response → UI reload**. The live tools prove that chain against production; this matrix is the source-level contract.

## A. Shell and control plane

| Module/UI | Browser route | Backend API / method | CRUD | Security / role | Audit | Persistence | Refresh | Error / responsive |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Admin shell | `/adm/*` | Firebase Auth client hint + protected API boundary | — | authenticated; server claims authoritative | access/mutations logged | session UI only | route mount | redirect to login/home; responsive rail |
| Compatibility shell | `/admin/*` | React redirect to `/adm/*` | — | same auth as `/adm` | — | none | redirect preserves suffix/query/hash | fixes Enterprise app-switcher dead link |
| Command Center | `/adm/dashboard` | `GET /api/platform/command-center` | R | Admin read; SA gets diagnostics | sensitive read/mutation events | Firestore aggregates/probes | refresh button | null/unavailable metrics; responsive KPI grid |
| Attention | `/adm/attention` | `GET /api/platform/attention`, command center | R | Admin read | read audit | derived live signals | refresh | no-ticket disclaimer; deep links |
| Platform Health | `/adm/health` | `GET /api/platform/operational-status`, `/health-indicator`, `/operational-status/:serviceId`; `POST .../refresh`, `POST .../:serviceId/test` | R; test/refresh | Admin read; provider test SA+MFA+recent auth | operator actions | real probes, bounded samples | refresh/auto-refresh | state/reason/remediation; service drawer/mobile |
| API Matrix | `/adm/health` → View API Matrix | `GET /api/platform/operational-status/api-matrix` | R | Admin read | sensitive read | Express route census + health dependencies | view control | filters; table scroll |
| Audit Trail | `/adm/audit-logs` | `GET /api/admin/audit-logs`, `/stats`, `/:id` | R | Admin read; server-sanitized | immutable admin log | `admin_audit_logs` | filter/reload/pagination | query error + retry; detail dialog |
| Security Events | `/adm/security` | `GET /api/platform/security-events` | R | Admin read; secrets omitted | mirrors HIGH/CRITICAL | `security_audit_logs` | refresh/filter | explicit unavailable; table scroll |
| Queue & DLQ | `/adm/queues` | `GET /api/platform/queues`; `POST /queues/retry` | R; U/retry | Admin read; retry SA+MFA+recent auth | retry + middleware | `notification_outbox` | reload after retry | unavailable is not healthy/zero; responsive table |
| Platform Operations | `/adm/operations` | encryption, observability, backup, queue, maintenance, announcements APIs | R; announcement C/U/D; maintenance U | reads Admin; writes SA+MFA+recent auth | explicit operation audits | Firestore + Enterprise service | reload after mutation | provider/infrastructure status; forms/dialogs |
| Platform Operators | `/adm/operators` | `GET/POST /api/platform/operators` | R/U role | read Admin; role mutation SA+MFA+recent; SUPER_ADMIN never assignable | explicit role audit | Firebase custom claims + profile | reload | conflict/forbidden states; mobile scroll |
| Tenant Registry | `/adm/tenants` | `GET /api/enterprise/platform/tenants`, `POST /api/enterprise/tenants`, lifecycle endpoints | R/C/U lifecycle/D | platform capability; provisioning/lifecycle PA; decommission SA | tenant + admin audit | Enterprise Firestore registry | reload after every action | disabled/not configured distinct; drawer responsive |
| Tenant Detail | `/adm/tenants` drawer | `GET /api/platform/tenants/:tenantId` | R | Admin platform capability; ID validated server-side | read audit | tenant registry, memberships, usage, M2M, audit | open/retry | section-level source status; mobile drawer |
| Tenant Rename | tenant detail drawer | `PATCH /api/platform/tenants/:tenantId` | U | SA+MFA+recent auth; slug immutable | `PLATFORM_TENANT_RENAMED` | tenant registry transaction | table + drawer immediate update | validation/conflict/not-found; form wraps |
| Tenant Suspend/Reactivate | registry rows | `POST /api/enterprise/platform/tenants/:id/suspend|reactivate` | U lifecycle | Platform capability; server transition guard | lifecycle audit | tenant registry | list reload | 409 invalid transition; confirm dialog |
| Tenant Decommission | registry/detail | `POST /api/platform/tenants/:id/decommission` | D/decommission | SA+MFA+recent auth + reason; retention `DELETING` | HIGH audit | Enterprise lifecycle | list/detail refresh | reason required; destructive confirmation |
| User Manager | `/adm/users` | `GET /api/admin/users`, `GET /users/:uid`, `/users/:uid/audit`; PATCH user; delete endpoint | R/U/D | Admin read/suspend/membership; SA role/delete; SUPER_ADMIN target protected | user/security audit | Firebase Auth + profile | list/detail reload | filters, status/MFA badges, error banners; responsive table |
| User Detail | `/adm/user/ss` | same user GET/PATCH/audit APIs | R/U | role controls hidden/disabled for Admin; server enforced | audit section | Auth/profile | save + audit reload | explicit stale target/conflict; form mobile |

## B. Super Admin/settings capability matrix

| Settings module | Route/tab | Backend/API | CRUD | Admin vs SA | Secret/audit posture | Persistence / refresh | Error/UX |
| --- | --- | --- | --- | --- | --- | --- |
| Addon Modules | `modulesSettings` | `POST /api/admin/settings/modules` | R/U | Admin+ | no secrets; revision + audit | public_config + session event | conflict/retry |
| Brand Identity & Meta | `websiteSettings` | `POST /api/admin/website-meta` | R/U | Admin+ | safe text/URLs; revision + audit | public config + reload | validation/conflict |
| Branding | `brandingSettings` | generic settings | R/U | Admin+ | URLs validated by UI/backend normalizer | public config; event | error banner; responsive |
| Indian Geo-SEO | `geoSeoSettings` | generic settings | R/U | Admin+ | URL/content sanitized | public config; event | validation |
| LLM GEO | `llmGeoSettings` | generic settings + `/llms.txt` | R/U | Admin+ | content sanitized, no provider secret | public config | safe preview/errors |
| Firebase web config | `firebaseSettings` | generic settings; service status/rotation endpoint | R/U web; service rotation separate | web config Admin policy; service rotation infrastructure-only in production | private key never returned; rotation `501` in production | public config / deployment | clear reason and restart warning |
| Social Sign-On & OAuth | `socialAuthSettings` | generic settings; OAuth credential status tests | R/U/test | Admin settings policy; environment/secret status protected | client secrets write-only; explicit clear; audit | server store/public projection | configured/not configured/callback errors |
| Email & SMTP | `emailSettings` | `/api/email/admin/settings`, `save-smtp`, tests, logs, deliverability | R/U/test/read logs | Admin settings read policy; secret changes governed | passwords write-only; blank preserve; clear tombstone; audit | runtime file + config; reload | DNS/SMTP explicit states |
| Cloud Storage | `storageSettings` | generic settings | R/U | Admin settings policy; Enterprise adapter infra-only | access secrets write-only, explicit clear | public projection + server config | provider unsupported clearly shown |
| AI & Gemini | `aiSettings` | `/api/admin/ai-settings`, test/fetch-models/quota | R/U/test/quota | read policy; provider writes/tests SA+recent auth | server-only keys, masked, preserve/clear, no localStorage | `settings/ai_providers` + public models/revision | conflict/provider auth/timeout states |
| PDF Exporter | `exportPdfSettings` | generic settings + export routes | R/U | Admin settings policy; Chromium path infra status | path not secret in UI but infra-owned | public config/deploy | isolated-worker status |
| Job/Naukri Scraper | `jobScraperSettings` | generic settings; `/api/jobs/naukri` | R/U; external ingestion unsupported | Admin settings; no fabricated listings | no secrets returned | public config | `501 SCRAPER_NOT_CONFIGURED` |
| Twilio SMS | `twilioSmsSettings` | `GET/POST /api/admin/twilio-settings`, `/api/send-sms` | R/U/test | SA+MFA+recent auth for credential mutation | token write-only, blank preserve, explicit clear, audit | server config/public enable flag | E.164/disabled/error states |
| Orders & Transactions | `ordersManagement` | `GET /api/admin/payment-orders`, refund endpoint | R/read; refund U | ledger read policy; refund policy | no provider client secrets; refund audit | payment ledger | provider failure explicit |
| PDF Watermark | `watermarkSettings` | generic settings | R/U | Admin+ | no secret | public config | safe form |
| Subscriptions & Gateways | `subscriptionsSettings` | `/api/platform/payment-settings`; `POST /api/admin/payment-settings`; provider test | R/U/test | SA for gateway credentials | Razorpay/Stripe/PayPal/Paytm/PhonePe write-only; masked/preserve/replace/clear | public settings + server provider store/revision | reauth/conflict/provider errors; responsive cards |
| Maps & Keys | `integrationsSettings` | generic settings | R/U | Admin settings policy | public maps key; reCAPTCHA secret write-only | public/server projection | configuration state |
| Security & Limits | `securityLimitsSettings` | generic settings + health | R/U | Admin policy; deployment limits status | no secret | public config/env | restart/owner explained |
| System Health | `systemHealthSettings` | health summary; maintenance settings | R/U/read | maintenance mutation SA+recent auth | audit; no secret | public_config + maintenance doc | no fake healthy; maintenance warning |
| Feature Flags | `featureFlagsSettings` | `GET/PUT /api/platform/feature-flags` | R/U | SA+MFA+recent auth for writes | flag metadata; audit event | `settings/feature_flags`; runtime flag refresh | confirm/high risk/restart/source |
| Platform Config | `platformConfigSettings` | `GET /api/platform/configuration` | R only | SA read | all env/integration secret statuses only; infra not editable | live config census | source/impact/dependency/owner/restart; explicit 403 |
| Code Injection | `codeInjectionSettings` | generic settings | R/U | Admin policy, should be deployment-reviewed | active content restrictions; audit | public config | safety validation |
| GDPR & Legal | `gdprLegalSettings` | `POST /api/admin/gdpr-settings` | R/U | Admin+ | legal text/URLs sanitized | public config | validation/error |
| Templates | `templateManagerSettings` | generic settings | R/U | Admin+ | no provider secrets | public config | responsive controls |
| Pages | `pages` | `GET/PUT/DELETE /api/admin/pages` | R/C/U/D | Admin+ | content sanitizer; revision + audit | pages collection | 400/404/409 visible |
| Blog Engine | `blog` | admin blog list/categories/moderation/publish | R/C/U/D | Admin+ moderation; backend transitions | sanitized content; revision + audit | blog collections | status/confirmation/pagination |
| Social Links | `socialSettings` | generic settings | R/U | Admin+ | safe URLs | public config | validation |
| Analytics | `analytics` | `POST /api/admin/website-meta` | U | Admin+ | tracking code sanitized/validated; audit | public meta | conflict/error |
| Ads Manager | `ads` | `GET/POST/DELETE /api/admin/ads` | R/C/D | Admin+; delete confirmation | URL sanitizer/revision/audit | ads collection | not-found/conflict; table scroll |

## C. Consumer product Admin modules

| Module/UI | Route | API/CRUD | Authorization/audit | Refresh/error |
| --- | --- | --- | --- | --- |
| Employer Applications | `/adm/employer-applications` | GET list; PATCH approve/reject/active | Admin user-update permission; revision/status check; audit + notification | reload list; explicit failures |
| Jobs Manager | `/adm/jobs-manager` | GET list/filter; PATCH status/featured; DELETE only no-app jobs | Admin policy; stale target; audit + employer notification | reload page; 409 preserved |
| Company Management | `/adm/company-management` | GET list/stats; PATCH status/featured | Admin policy; stale target; audit + notification | measured stats or unavailable |
| Blog Management | `/adm/blog-management` | GET posts/categories; PATCH moderation; DELETE; POST publish due | Admin policy; revision/transition guard; audit + author notification | pagination, confirmation, retry |
| Landing Pages | `/adm/landing-pages` | GET/POST frontend marketing stats | Admin policy; revision/audit; labelled marketing copy (not telemetry) | reload after save |
| Reviews | `/adm/reviews` | GET approved/admin; POST; DELETE | backend-only writes, revision/audit | reload and confirm |
| Trusted By | `/adm/trustedby` | GET/POST/PATCH/DELETE | URL sanitizer, revision/audit | publish state reload |
| Messages | `/adm/messages` | consumer messaging APIs | ownership/rate limit; audit where admin | explicit unavailable; responsive |
| Phrases | `/adm/phrases` | category phrase operations | Admin policy/content validation | reload/error |

## D. Route ownership notes

- Enterprise owns tenant context, membership, workspace/team, M2M, tenant audit, usage, backup, and tenant configuration. `/adm` provides global platform operations and links; it does not duplicate tenant data-plane writes.
- `/api/platform` is the global Admin/Super Admin operational API. `/api/admin` is the legacy/consumer moderation API. `/api/enterprise` is tenant-aware and feature-gated.
- `POST /api/admin/payment-settings` and `GET /api/platform/payment-settings` are intentionally separate write/read contracts after the Razorpay audit; the browser now calls the actual read route.
- `/api/platform/version` is public deployment identity only. It contains no configuration or secret material.
