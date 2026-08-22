# `/adm` API Matrix

This matrix is generated from the actual route registrations in `backend/index.js`, `backend/routes/platform.js`, `backend/routes/adminAudit.js`, and `backend/routes/email.js`, then reconciled against `/adm` consumers. It documents the contract boundary, not a live-production pass.

**Shared guards:** all `/api/admin/**` and `/api/email/admin/**` paths pass Firebase bearer validation, verified-email checks, `system.config.write`, and Admin audit middleware. `/api/platform/**` first passes the platform read policy; mutations named below add `requireSuperAdmin` and, where applicable, recent auth.

## Platform control plane

| UI/module | Method | API | Gate | Handler/service | Contract status |
|---|---|---|---|---|---|
| Command center | GET | `/api/platform/health` | Admin read policy | platform router | PASS local |
| Command center | GET | `/api/platform/overview` | Admin read policy | platform router | PASS route exists; UI consumption limited |
| Queue monitor | GET | `/api/platform/queues` | Admin read policy | outbox diagnostics | PASS local |
| Queue monitor | POST | `/api/platform/queues/retry` | SUPER_ADMIN + recent auth + typed confirmation | outbox replay | PASS local |
| Tenant registry | GET | `/api/platform/tenants` | SUPER_ADMIN | `TenantService.listPlatformTenants` | PASS local |
| Tenant registry | POST | `/api/platform/tenants` | SUPER_ADMIN + recent auth | `TenantService.provisionTenant` | PASS local |
| Tenant registry | GET | `/api/platform/tenants/:tenantId` | SUPER_ADMIN | `TenantService.getPlatformTenant` | PASS local |
| Tenant registry | PATCH | `/api/platform/tenants/:tenantId` | SUPER_ADMIN + recent auth | `TenantService.updateTenantProfileAsPlatform` | PASS local |
| Tenant registry | POST | `/api/platform/tenants/:tenantId/suspend` | SUPER_ADMIN + recent auth + phrase | lifecycle service | PASS local |
| Tenant registry | POST | `/api/platform/tenants/:tenantId/reactivate` | SUPER_ADMIN + recent auth + phrase | lifecycle service | PASS local |
| Tenant registry | POST | `/api/platform/tenants/:tenantId/decommission` | SUPER_ADMIN + recent auth + phrase | lifecycle service | PASS local |
| Maintenance settings | GET/POST | `/api/platform/maintenance` | GET Admin; POST SUPER_ADMIN + recent auth | platform router | PASS local |

## Audit, identity, content, and platform configuration

| UI/module | Method | API | Contract / authorization |
|---|---|---|---|
| Audit trail | GET | `/api/admin/audit-logs` | filters/cursor, Admin namespace |
| Audit trail | GET | `/api/admin/audit-logs/stats` | sampled aggregates, Admin namespace |
| Audit detail | GET | `/api/admin/audit-logs/:id` | Admin namespace |
| Users directory | GET | `/api/admin/users` | server filter/page contract; curated roster fields; explicit 1,000-record source bound |
| Users | PATCH | `/api/admin/users/:uid` | one field transition; field permission; stale precondition; SUPER_ADMIN target protected |
| Users | POST | `/api/admin/delete-user` | generic delete; recent auth; SUPER_ADMIN target protected |
| Employer applications | PATCH | `/api/admin/employer-applications/:uid` | review state + expected status |
| Jobs | PATCH/DELETE | `/api/admin/jobs/:jobId` | stale state checks / audited moderation |
| Companies | PATCH | `/api/admin/companies/:companyId` | status/featured one-field transition |
| Reviews | POST/DELETE | `/api/admin/reviews`, `/api/admin/reviews/:id` | validated revision-safe CRUD |
| Trusted-by | GET/POST/PATCH/DELETE | `/api/admin/trusted-by*` | revision-safe logo CRUD |
| Custom pages | GET/PUT/DELETE | `/api/admin/pages*` | revision-safe CMS CRUD |
| Landing content | POST | `/api/admin/landing-content` | revisioned marketing display copy |
| Ads | POST/DELETE | `/api/admin/ads*` | validated revision-safe CRUD |
| Phrase library | GET/POST/DELETE | `/api/admin/phrases*` | trusted category CRUD |
| Phrase entries | POST/DELETE | `/api/admin/phrases/:id/entries` | revision-safe phrase CRUD |
| Public phrase consumer | GET | `/public/phrases.json` | curated read-only projection |
| Global rating | POST | `/api/admin/global-rating` | validated global rating |
| Website metadata | POST | `/api/admin/website-meta` | revisioned metadata |
| Generic settings | POST | `/api/admin/settings/:category` | redacted secret-aware revisioned persistence |
| GDPR | POST | `/api/admin/gdpr-settings` | Admin configuration |
| System health setting | GET/POST | `/api/admin/health-summary`, `/api/admin/system-health-settings` | observed summary / recent-auth mutation |
| Firebase service account status | GET/POST | `/api/admin/firebase-service-account` | GET Admin; mutation special elevated/recent-auth policy |

## AI, billing, and communications settings

| UI/module | Method | API | Contract / authorization |
|---|---|---|---|
| AI governance | GET/POST | `/api/admin/ai-settings` | split browser-safe settings/server secrets; revisioned |
| AI provider test | POST | `/api/admin/ai/test-provider` | account-limited, recent auth |
| AI model discovery | POST | `/api/admin/ai/fetch-models` | account-limited, recent auth |
| AI quota | GET/POST | `/api/admin/ai/quota-stats`, `/api/admin/ai/quota-limits`, `/api/admin/ai/reset-quota` | Admin namespace; UI confirmation for reset |
| Payment settings | POST | `/api/admin/payment-settings` | secret-safe persistence |
| Payment provider test | POST | `/api/admin/payment/test-provider` | payment policy gate |
| Coupons | GET/PUT/DELETE | `/api/admin/coupons`, `/api/admin/coupons/:code` | revision-safe coupon administration |
| Provider refund | POST | `/api/admin/payments/refund` | payment policy gate / provider confirmation |
| Twilio | GET/POST | `/api/admin/twilio-settings` | secret-safe setting projection |
| SMTP runtime | GET/POST | `/api/email/admin/settings`, `/api/email/admin/save-smtp` | Admin namespace |
| SMTP/IMAP tests | POST | `/api/email/admin/test-connection`, `/api/email/admin/test-imap` | Admin namespace / reauth retry client |
| Email templates/circuit | GET/POST | `/api/email/admin/circuit-breaker-status`, `/api/email/admin/reset-circuit-breaker`, `/api/email/admin/custom-templates`, `/api/email/admin/save-template-customization` | Admin namespace |
| Email logs/retry | GET/POST | `/api/email/logs`, `/api/email/resend` | policy aliases / Admin client |
| Template email | POST | `/api/send-email` | Admin policy |
| SMS | POST | `/api/send-sms` | Admin policy / reauth client |

## CMS and related Admin APIs

| UI/module | Method | API | Contract / authorization |
|---|---|---|---|
| Blog categories | POST/PATCH/DELETE | `/api/admin/blog/categories*` | revision-safe category CRUD |
| Blog moderation | PATCH/DELETE | `/api/admin/blog/posts/:postId` | state/revision checks |
| Blog schedule worker | POST | `/api/admin/blog/publish-due` | trusted scheduler trigger |
| Public trusted-by | GET | `/public/trusted-by.json` | published read-only projection |
| Public custom page index | GET | `/public/custom-pages.json` | published read-only projection |

## Direct consumer APIs used by `/adm` indirectly

The Admin UI also uses consumer-owned Firestore reads for legacy lists (users, messages, reviews, jobs, companies, billing ledger) and existing backend APIs for employer/job/payment workflows. Those paths are preserved to avoid breaking protected consumer behavior. They are not evidence of platform tenant authority.

## Route mismatch conclusion

The only identified `/adm` feature-gate mismatch was tenant registry use of `/api/enterprise/platform/tenants`; it is remediated by the platform adapter. New contract assertions run via:

```bash
npm run test:admin:contract
```

Live route behavior remains **UNVERIFIED** until the production static SPA outage is resolved and an approved Super Admin session is used.
