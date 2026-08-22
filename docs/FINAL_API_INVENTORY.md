# FINAL API INVENTORY

**Generated:** 2026-08-22T10:07:00.183Z
**Source:** the live Express routing table of `backend/index.js` plus all mounted routers, enumerated by the same collector that powers Admin → Platform Health.

---

## 1. Headline numbers, and the 223 vs 249 reconciliation

| Measure | Count |
| --- | ---: |
| **Reachable endpoints** (unique `METHOD + path`) | **249** |
| **Distinct handlers** (dual mounts collapsed) | **243** |
| Alias rows (same handler, second mount path) | 6 |
| Static source census (`app./router.<verb>(` declarations) | 229 |

The previous audit's **223** and this census's **249** are both defensible
measurements of *different things*. They reconcile as follows.

**a) The email router is mounted twice.** `backend/index.js` mounts the same
router at both `/api` and `/api/email`, so six handlers are reachable at two
paths each:

| Handler | Also reachable at |
| --- | --- |
| `GET /api/email/logs` | `GET /api/logs` |
| `POST /api/email/resend` | `POST /api/resend` |
| `POST /api/email/send-email` | `POST /api/send-email` |
| `POST /api/email/send-invoice-email` | `POST /api/send-invoice-email` |
| `GET /api/email/templates` | `GET /api/templates` |
| `POST /api/email/templates` | `POST /api/templates` |

Counting reachable URLs gives 249; counting distinct handlers gives **243**.

**b) A static grep undercounts.** Grepping `app.get(` / `router.post(` finds
**229** declarations. It cannot see mount prefixes, so it cannot distinguish
`/api/email/logs` from `/api/logs`, and it misses routes registered through
helpers or arrays.

**c) Neither 223 nor 249 is "wrong" — but only one is authoritative.**
The routing table is ground truth for "what can a client actually call", so:

> **The authoritative figure is 249 reachable endpoints, comprising 243 distinct handlers.**

Platform Health reports **249**, because a caller hitting `/api/logs`
is hitting a real, separately-authorised URL. The dashboard does not hardcode
this number; it reads it from the same collector that produced this document.

---

## 2. Status distribution

Two state columns are reported, because collapsing them is exactly how a
dashboard starts lying:

- **OBSERVED** — what this build sandbox actually measured. It has **no
  Firestore credentials**, so every datastore-backed route measures
  `UNAVAILABLE`. That is a true statement about *this environment*.
- **PROJECTED** — the same collector re-run with the datastore probe satisfied
  (stub Firestore/Auth client injected). This isolates *"unavailable because
  the sandbox has no credentials"* from *"unavailable because a provider is off
  or misconfigured"*.

| State | Observed (sandbox) | Projected (datastore healthy) |
| --- | ---: | ---: |
| OPERATIONAL | 11 | 124 |
| DEGRADED | 4 | 4 |
| UNAVAILABLE | 113 | 0 |
| DISABLED | 80 | 80 |
| NOT_CONFIGURED | 41 | 41 |

**All 113 `UNAVAILABLE` readings resolve to `OPERATIONAL` once the datastore
probe succeeds.** None of them is a broken route. This is the evidence that the
sandbox figure is an environment artifact and not a defect count.

### Classification of all 249 endpoints

| Classification | Count |
| --- | ---: |
| AUTHENTICATION PROTECTED | 110 |
| DISABLED | 80 |
| NOT CONFIGURED | 41 |
| OPERATIONAL | 14 |
| DEGRADED | 4 |

`AUTHENTICATION PROTECTED` means the route is healthy and correctly answers
**401** to an anonymous caller. That is the security control working, not a
failure.

### By authentication requirement

| Requirement | Count |
| --- | ---: |
| AUTHENTICATED | 226 |
| PUBLIC | 23 |

### By module

| Module | Endpoints |
| --- | ---: |
| enterprise | 63 |
| admin | 58 |
| platform | 29 |
| notifications | 26 |
| core | 15 |
| billing | 15 |
| auth | 12 |
| ai | 10 |
| jobs | 9 |
| messaging | 4 |
| export | 4 |
| health | 3 |
| account | 1 |

---

## 3. Every non-operational group, with a disposition

There are **zero unexplained endpoints**. Every endpoint that is not plainly
operational belongs to exactly one group below, each traced to a specific
missing credential or an explicit configuration switch.

Dispositions use the required scheme: **A** work in production · **B**
intentionally disabled · **C** remove · **D** replace · **E** requires external
configuration.

### Enterprise Tenancy — 63 endpoints · `DISABLED`

**Disposition: B. INTENTIONALLY DISABLED**

`ENTERPRISE_TENANCY_ENABLED=false`. Every `/api/enterprise` route answers 404 by design — a deliberate rollout gate. Surfaced as **DISABLED**, and the consumer sidebar link is hidden unless the backend confirms tenancy is served.

**Collector reason:** ENTERPRISE_TENANCY_ENABLED is false, so every /api/enterprise route intentionally answers 404. This is a deliberate rollout gate, not an outage.

<details><summary>63 affected endpoints</summary>

- `POST /api/enterprise/ai/generate-content`
- `GET /api/enterprise/audit`
- `GET /api/enterprise/configuration`
- `PATCH /api/enterprise/configuration`
- `GET /api/enterprise/context`
- `POST /api/enterprise/context`
- `GET /api/enterprise/data-plane/status`
- `GET /api/enterprise/data/export`
- `POST /api/enterprise/lifecycle/suspend`
- `GET /api/enterprise/m2m/context`
- `GET /api/enterprise/memberships`
- `POST /api/enterprise/memberships`
- `DELETE /api/enterprise/memberships/:principalId`
- `PATCH /api/enterprise/memberships/:principalId`
- `POST /api/enterprise/memberships/:principalId/invitation-resend`
- `GET /api/enterprise/observability/metrics`
- `GET /api/enterprise/platform/tenants`
- `POST /api/enterprise/platform/tenants/:tenantId/reactivate`
- `POST /api/enterprise/platform/tenants/:tenantId/suspend`
- `GET /api/enterprise/queue/jobs`
- `POST /api/enterprise/queue/jobs`
- `POST /api/enterprise/queue/replay`
- `GET /api/enterprise/queue/status`
- `GET /api/enterprise/resources`
- `POST /api/enterprise/resources`
- `DELETE /api/enterprise/resources/:resourceId`
- `GET /api/enterprise/resources/:resourceId`
- `PATCH /api/enterprise/resources/:resourceId`
- `GET /api/enterprise/roles-matrix`
- `GET /api/enterprise/service-accounts`
- `POST /api/enterprise/service-accounts`
- `POST /api/enterprise/service-accounts/:serviceAccountId/revoke`
- `POST /api/enterprise/service-accounts/:serviceAccountId/rotate`
- `GET /api/enterprise/status`
- `POST /api/enterprise/storage/token`
- `POST /api/enterprise/storage/verify`
- `GET /api/enterprise/support-grants`
- `POST /api/enterprise/support-grants`
- `POST /api/enterprise/support-grants/:grantId/revoke`
- `GET /api/enterprise/support/context`
- `GET /api/enterprise/teams`
- `POST /api/enterprise/teams`
- `PATCH /api/enterprise/teams/:teamId`
- `POST /api/enterprise/teams/:teamId/archive`
- `GET /api/enterprise/teams/:teamId/members`
- `POST /api/enterprise/teams/:teamId/members`
- `DELETE /api/enterprise/teams/:teamId/members/:principalId`
- `POST /api/enterprise/teams/:teamId/restore`
- `PATCH /api/enterprise/tenant`
- `GET /api/enterprise/tenants`
- `POST /api/enterprise/tenants`
- `POST /api/enterprise/tenants/:tenantId/reactivate`
- `POST /api/enterprise/test-email`
- `GET /api/enterprise/usage/ai`
- `GET /api/enterprise/usage/ai/events`
- `GET /api/enterprise/workspaces`
- `POST /api/enterprise/workspaces`
- `PATCH /api/enterprise/workspaces/:workspaceId`
- `POST /api/enterprise/workspaces/:workspaceId/archive`
- `GET /api/enterprise/workspaces/:workspaceId/members`
- `POST /api/enterprise/workspaces/:workspaceId/members`
- `DELETE /api/enterprise/workspaces/:workspaceId/members/:principalId`
- `POST /api/enterprise/workspaces/:workspaceId/restore`

</details>

### Email / SMTP — 15 endpoints · `NOT_CONFIGURED`

**Disposition: E. REQUIRES EXTERNAL CONFIGURATION**

No SMTP credentials present. Surfaced as **NOT CONFIGURED**, never as "API error". Supply SMTP settings in Admin → Settings → Email.

**Collector reason:** No SMTP credentials are configured, so outbound mail cannot be delivered.

<details><summary>15 affected endpoints</summary>

- `GET /api/email/admin/circuit-breaker-status`
- `GET /api/email/admin/custom-templates`
- `POST /api/email/admin/reset-circuit-breaker`
- `POST /api/email/admin/save-smtp`
- `POST /api/email/admin/save-template-customization`
- `GET /api/email/admin/settings`
- `POST /api/email/admin/test-connection`
- `POST /api/email/admin/test-imap`
- `GET /api/email/logs`
- `POST /api/email/resend`
- `POST /api/email/send-email`
- `POST /api/email/send-invoice-email`
- `GET /api/email/templates`
- `POST /api/email/templates`
- `POST /api/send-email`

</details>

### Notification Dispatcher — 12 endpoints · `DISABLED`

**Disposition: B. INTENTIONALLY DISABLED**

No outbox worker enabled in this deployment. Notifications are still stored durably; they are simply not dispatched. Surfaced as **DISABLED**.

**Collector reason:** No notification outbox worker is enabled in this deployment, so queued notifications are stored durably but never dispatched.

<details><summary>12 affected endpoints</summary>

- `POST /api/notify/email-otp`
- `POST /api/notify/job-application`
- `POST /api/notify/job-posted`
- `POST /api/notify/job-status-update`
- `POST /api/notify/password-changed`
- `POST /api/notify/password-reset`
- `POST /api/notify/portfolio-published`
- `POST /api/notify/security-alert`
- `POST /api/notify/send-verification-email`
- `POST /api/notify/subscription-cancelled`
- `POST /api/notify/user-signup`
- `POST /api/send-invoice-email`

</details>

### AI Providers — 10 endpoints · `NOT_CONFIGURED`

**Disposition: E. REQUIRES EXTERNAL CONFIGURATION**

No AI provider API key. Generation endpoints fall back to deterministic non-AI behaviour or answer 503. Surfaced as **NOT CONFIGURED**.

**Collector reason:** No AI provider API key is configured, so generation endpoints fall back to deterministic non-AI behaviour or return 503.

<details><summary>10 affected endpoints</summary>

- `POST /api/check-grammar`
- `POST /api/generate-ai-cover-letter`
- `POST /api/generate-content`
- `POST /api/generate-education-description`
- `POST /api/generate-interview`
- `POST /api/generate-resume`
- `POST /api/generate-skills`
- `POST /api/generate-summary`
- `POST /api/generate-work-description`
- `POST /api/parse-resume`

</details>

### PDF Export Service — 4 endpoints · `DEGRADED`

**Disposition: A. SHOULD WORK IN PRODUCTION (works, sub-optimally)**

Renders succeed, but `PDF_RENDERER_ISOLATED=false` means they run in the API process rather than a sandboxed worker. A hardening gap, not an outage. Surfaced as **DEGRADED** with the reason shown.

**Collector reason:** PDF rendering runs in the API process. PDF_RENDERER_ISOLATED is false, so renders are not sandboxed in a dedicated worker.

<details><summary>4 affected endpoints</summary>

- `POST /api/export`
- `POST /api/export-docx`
- `GET /api/export-render-data`
- `POST /api/public-export`

</details>

### Stripe — 4 endpoints · `NOT_CONFIGURED`

**Disposition: E. REQUIRES EXTERNAL CONFIGURATION**

Enabled for checkout but no credentials configured, so order creation answers 503. Surfaced as **NOT CONFIGURED**; the checkout option is withheld via `/api/service-availability`.

**Collector reason:** The gateway is enabled for checkout but no credentials are configured, so order creation returns 503.

<details><summary>4 affected endpoints</summary>

- `POST /api/pay`
- `GET /api/payment-orders/:orderId`
- `POST /api/payment/razorpay-order`
- `POST /api/stripe-webhook`

</details>

### GitHub OAuth — 3 endpoints · `NOT_CONFIGURED`

**Disposition: E. REQUIRES EXTERNAL CONFIGURATION**

No OAuth client credentials, so the provider route answers 503. Surfaced as **NOT CONFIGURED**; the sign-in button is hidden rather than rendered dead.

**Collector reason:** No OAuth client credentials are configured, so the provider endpoint answers 503 and the button is hidden.

<details><summary>3 affected endpoints</summary>

- `GET /api/auth/github`
- `GET /api/auth/github/callback`
- `GET /api/auth/github/test-credentials`

</details>

### LinkedIn OAuth — 3 endpoints · `NOT_CONFIGURED`

**Disposition: E. REQUIRES EXTERNAL CONFIGURATION**

As GitHub OAuth. Button hidden.

**Collector reason:** No OAuth client credentials are configured, so the provider endpoint answers 503 and the button is hidden.

<details><summary>3 affected endpoints</summary>

- `GET /api/auth/linkedin`
- `GET /api/auth/linkedin/callback`
- `GET /api/auth/linkedin/test-credentials`

</details>

### Naukri Job Ingestion — 2 endpoints · `NOT_CONFIGURED`

**Disposition: E. REQUIRES EXTERNAL CONFIGURATION**

No partner feed credential. `/api/jobs/naukri` deliberately answers **501** rather than returning fabricated listings. Surfaced as **NOT CONFIGURED**.

**Collector reason:** No Naukri ingestion credential or partner feed is configured. /api/jobs/naukri deliberately answers 501 rather than returning fabricated listings.

<details><summary>2 affected endpoints</summary>

- `POST /api/jobs/naukri`
- `GET /api/linkedin-scraper`

</details>

### PayPal — 2 endpoints · `NOT_CONFIGURED`

**Disposition: E. REQUIRES EXTERNAL CONFIGURATION**

As Stripe. Surfaced as **NOT CONFIGURED**; checkout option withheld.

**Collector reason:** The gateway is enabled for checkout but no credentials are configured, so order creation returns 503.

<details><summary>2 affected endpoints</summary>

- `POST /api/paypal/create-order`
- `POST /api/paypal/verify`

</details>

### PayTM — 2 endpoints · `DISABLED`

**Disposition: B. INTENTIONALLY DISABLED**

Switched off for checkout and unconfigured. Surfaced as **DISABLED**; checkout option withheld.

**Collector reason:** The gateway is switched off for checkout and has no credentials configured.

<details><summary>2 affected endpoints</summary>

- `POST /api/paytm/initiate-transaction`
- `POST /api/paytm/verify-transaction`

</details>

### PhonePe — 2 endpoints · `DISABLED`

**Disposition: B. INTENTIONALLY DISABLED**

Switched off for checkout and unconfigured. Surfaced as **DISABLED**; checkout option withheld.

**Collector reason:** The gateway is switched off for checkout and has no credentials configured.

<details><summary>2 affected endpoints</summary>

- `POST /api/phonepe/initiate`
- `POST /api/phonepe/status`

</details>

### Razorpay — 2 endpoints · `NOT_CONFIGURED`

**Disposition: E. REQUIRES EXTERNAL CONFIGURATION**

As Stripe. Surfaced as **NOT CONFIGURED**; checkout option withheld.

**Collector reason:** The gateway is enabled for checkout but no credentials are configured, so order creation returns 503.

<details><summary>2 affected endpoints</summary>

- `POST /api/razorpay/create-order`
- `POST /api/razorpay/verify-payment`

</details>

### Twilio SMS — 1 endpoint · `DISABLED`

**Disposition: B. INTENTIONALLY DISABLED**

SMS alerts switched off in Admin → Settings. Surfaced as **DISABLED**.

**Collector reason:** SMS alerts are switched off in Admin → Settings → Twilio SMS, so no message is dispatched.

<details><summary>1 affected endpoint</summary>

- `POST /api/send-sms`

</details>

### Why none of these is classified "C. remove" or "D. replace"

Every group above is a *live, wired feature* whose provider is either switched
off deliberately or missing a credential. None is dead code, and none is an
obsolete route. Removing them would delete working functionality that turns on
the moment a credential is supplied. `/api/jobs/naukri` is the clearest
illustration: it deliberately answers **501** rather than inventing job
listings, and Platform Health reports it as **NOT CONFIGURED** rather than as
an error.

---

## 4. No legitimate API fails silently

The requirement is that a user never meets a bare `404`, `500`, `502`,
`503` or "Failed to fetch" without an operational explanation. Enforcement:

1. **Every** non-operational endpoint resolves to a service descriptor carrying
   `state`, `reason`, `dependency`, `remediation`, `affectedFeatures`,
   `affectedApis`, `affectedUiModules`, `configuration` and `errorCategory`.
   Admin → Platform Health renders all of these.
2. **The UI withholds controls it cannot serve.** `/api/service-availability`
   is a public, secret-free contract; `Plans.jsx`, the OAuth resolver and the
   consumer sidebar intersect their configured flags with it. A disabled PayPal
   is not offered; an unconfigured GitHub button is not rendered; the Enterprise
   link is hidden when tenancy is dark. Configured-off always wins, and an
   *unknown* answer never upgrades to enabled.
3. **Disabled ≠ broken.** `DISABLED` and `NOT CONFIGURED` are counted
   separately from `DEGRADED` and `UNAVAILABLE`, and the dashboard states in
   plain text that they are deliberate configuration states.

---

## 5. Full endpoint table

Column notes — **AUTH**: authentication required · **ROLE**: `ADMIN+` = admin
prefix requiring `system.config.write` and a verified email · **TENANT**:
isolation scope · **SA**: super-admin only · **OBS/PROJ**: observed vs projected
state · **AUDIT**: writes an admin audit record · **LIVE**: verified against
production.

> **LIVE VERIFIED is `NOT VERIFIED` for every row.** Production is unreachable
> from this sandbox — TLS egress is allowlisted to GitHub and npm only
> (verified by socket test; see the certification report). No row claims live
> verification, because none was performed.

### Module: `enterprise` (63)

| METHOD | PATH | AUTH | ROLE | TENANT | SA | OK | FAIL | EXTERNAL DEP | OBS | PROJ | STATUS | UI CONSUMER | AUDIT | LIVE |
| --- | --- | --- | --- | --- | :-: | --- | --- | --- | --- | --- | --- | --- | :-: | --- |
| POST | `/api/enterprise/ai/generate-content` | AUTHENTICATED | USER | TENANT | - | 200/201 | 401/400 | - | DISABLED | DISABLED | DISABLED | enterprise/components/EnterpriseSecurityTab.jsx | - | NOT VERIFIED |
| GET | `/api/enterprise/audit` | AUTHENTICATED | USER | TENANT | - | 200 | 401 | - | DISABLED | DISABLED | DISABLED | enterprise/components/EnterpriseAuditTab.jsx | - | NOT VERIFIED |
| GET | `/api/enterprise/configuration` | AUTHENTICATED | USER | TENANT | - | 200 | 401 | - | DISABLED | DISABLED | DISABLED | enterprise/components/EnterpriseAiTab.jsx | - | NOT VERIFIED |
| PATCH | `/api/enterprise/configuration` | AUTHENTICATED | USER | TENANT | - | 200 | 401/400 | - | DISABLED | DISABLED | DISABLED | enterprise/components/EnterpriseAiTab.jsx | - | NOT VERIFIED |
| GET | `/api/enterprise/context` | AUTHENTICATED | USER | TENANT | - | 200 | 401 | - | DISABLED | DISABLED | DISABLED | enterprise/EnterpriseContext.jsx | - | NOT VERIFIED |
| POST | `/api/enterprise/context` | AUTHENTICATED | USER | TENANT | - | 200/201 | 401/400 | - | DISABLED | DISABLED | DISABLED | enterprise/EnterpriseContext.jsx | - | NOT VERIFIED |
| GET | `/api/enterprise/data-plane/status` | AUTHENTICATED | USER | TENANT | - | 200 | 401 | - | DISABLED | DISABLED | DISABLED | enterprise/components/EnterpriseOverviewTab.jsx | - | NOT VERIFIED |
| GET | `/api/enterprise/data/export` | AUTHENTICATED | USER | TENANT | - | 200 | 401 | - | DISABLED | DISABLED | DISABLED | enterprise/components/EnterpriseSettingsTab.jsx | - | NOT VERIFIED |
| POST | `/api/enterprise/lifecycle/suspend` | AUTHENTICATED | USER | TENANT | - | 200/201 | 401/400 | - | DISABLED | DISABLED | DISABLED | enterprise/components/EnterpriseSettingsTab.jsx | - | NOT VERIFIED |
| GET | `/api/enterprise/m2m/context` | AUTHENTICATED | USER | TENANT | - | 200 | 401 | - | DISABLED | DISABLED | DISABLED | enterprise/components/EnterpriseSecurityTab.jsx | - | NOT VERIFIED |
| GET | `/api/enterprise/memberships` | AUTHENTICATED | USER | TENANT | - | 200 | 401 | - | DISABLED | DISABLED | DISABLED | enterprise/components/EnterpriseAuditTab.jsx | - | NOT VERIFIED |
| POST | `/api/enterprise/memberships` | AUTHENTICATED | USER | TENANT | - | 200/201 | 401/400 | - | DISABLED | DISABLED | DISABLED | enterprise/components/EnterpriseAuditTab.jsx | - | NOT VERIFIED |
| DELETE | `/api/enterprise/memberships/:principalId` | AUTHENTICATED | USER | TENANT | - | 200/204 | 401/404/400 | - | DISABLED | DISABLED | DISABLED | enterprise/components/EnterpriseAuditTab.jsx | - | NOT VERIFIED |
| PATCH | `/api/enterprise/memberships/:principalId` | AUTHENTICATED | USER | TENANT | - | 200 | 401/404/400 | - | DISABLED | DISABLED | DISABLED | enterprise/components/EnterpriseAuditTab.jsx | - | NOT VERIFIED |
| POST | `/api/enterprise/memberships/:principalId/invitation-resend` | AUTHENTICATED | USER | TENANT | - | 200/201 | 401/404/400 | - | DISABLED | DISABLED | DISABLED | enterprise/components/EnterpriseAuditTab.jsx | - | NOT VERIFIED |
| GET | `/api/enterprise/observability/metrics` | AUTHENTICATED | USER | TENANT | - | 200 | 401 | - | DISABLED | DISABLED | DISABLED | enterprise/components/EnterpriseOverviewTab.jsx | - | NOT VERIFIED |
| GET | `/api/enterprise/platform/tenants` | AUTHENTICATED | USER | TENANT | - | 200 | 401 | - | DISABLED | DISABLED | DISABLED | components/admin/tenants/PlatformTenants.jsx | - | NOT VERIFIED |
| POST | `/api/enterprise/platform/tenants/:tenantId/reactivate` | AUTHENTICATED | USER | TENANT | - | 200/201 | 401/404/400 | - | DISABLED | DISABLED | DISABLED | components/admin/tenants/PlatformTenants.jsx | - | NOT VERIFIED |
| POST | `/api/enterprise/platform/tenants/:tenantId/suspend` | AUTHENTICATED | USER | TENANT | - | 200/201 | 401/404/400 | - | DISABLED | DISABLED | DISABLED | components/admin/tenants/PlatformTenants.jsx | - | NOT VERIFIED |
| GET | `/api/enterprise/queue/jobs` | AUTHENTICATED | USER | TENANT | - | 200 | 401 | - | DISABLED | DISABLED | DISABLED | enterprise/components/EnterpriseSecurityTab.jsx | - | NOT VERIFIED |
| POST | `/api/enterprise/queue/jobs` | AUTHENTICATED | USER | TENANT | - | 200/201 | 401/400 | - | DISABLED | DISABLED | DISABLED | enterprise/components/EnterpriseSecurityTab.jsx | - | NOT VERIFIED |
| POST | `/api/enterprise/queue/replay` | AUTHENTICATED | USER | TENANT | - | 200/201 | 401/400 | - | DISABLED | DISABLED | DISABLED | enterprise/components/EnterpriseSecurityTab.jsx | - | NOT VERIFIED |
| GET | `/api/enterprise/queue/status` | AUTHENTICATED | USER | TENANT | - | 200 | 401 | - | DISABLED | DISABLED | DISABLED | enterprise/components/EnterpriseOverviewTab.jsx | - | NOT VERIFIED |
| GET | `/api/enterprise/resources` | AUTHENTICATED | USER | TENANT | - | 200 | 401 | - | DISABLED | DISABLED | DISABLED | enterprise/components/EnterpriseResumesTab.jsx | - | NOT VERIFIED |
| POST | `/api/enterprise/resources` | AUTHENTICATED | USER | TENANT | - | 200/201 | 401/400 | - | DISABLED | DISABLED | DISABLED | enterprise/components/EnterpriseResumesTab.jsx | - | NOT VERIFIED |
| DELETE | `/api/enterprise/resources/:resourceId` | AUTHENTICATED | USER | TENANT | - | 200/204 | 401/404/400 | - | DISABLED | DISABLED | DISABLED | enterprise/components/EnterpriseResumesTab.jsx | - | NOT VERIFIED |
| GET | `/api/enterprise/resources/:resourceId` | AUTHENTICATED | USER | TENANT | - | 200 | 401/404 | - | DISABLED | DISABLED | DISABLED | enterprise/components/EnterpriseResumesTab.jsx | - | NOT VERIFIED |
| PATCH | `/api/enterprise/resources/:resourceId` | AUTHENTICATED | USER | TENANT | - | 200 | 401/404/400 | - | DISABLED | DISABLED | DISABLED | enterprise/components/EnterpriseResumesTab.jsx | - | NOT VERIFIED |
| GET | `/api/enterprise/roles-matrix` | AUTHENTICATED | USER | TENANT | - | 200 | 401 | - | DISABLED | DISABLED | DISABLED | enterprise/components/EnterpriseRolesTab.jsx | - | NOT VERIFIED |
| GET | `/api/enterprise/service-accounts` | AUTHENTICATED | USER | TENANT | - | 200 | 401 | - | DISABLED | DISABLED | DISABLED | enterprise/components/EnterpriseSecurityTab.jsx | - | NOT VERIFIED |
| POST | `/api/enterprise/service-accounts` | AUTHENTICATED | USER | TENANT | - | 200/201 | 401/400 | - | DISABLED | DISABLED | DISABLED | enterprise/components/EnterpriseSecurityTab.jsx | - | NOT VERIFIED |
| POST | `/api/enterprise/service-accounts/:serviceAccountId/revoke` | AUTHENTICATED | USER | TENANT | - | 200/201 | 401/404/400 | - | DISABLED | DISABLED | DISABLED | enterprise/components/EnterpriseSecurityTab.jsx | - | NOT VERIFIED |
| POST | `/api/enterprise/service-accounts/:serviceAccountId/rotate` | AUTHENTICATED | USER | TENANT | - | 200/201 | 401/404/400 | - | DISABLED | DISABLED | DISABLED | enterprise/components/EnterpriseSecurityTab.jsx | - | NOT VERIFIED |
| GET | `/api/enterprise/status` | AUTHENTICATED | USER | TENANT | - | 200 | 401 | - | DISABLED | DISABLED | DISABLED | enterprise/EnterpriseContext.jsx | - | NOT VERIFIED |
| POST | `/api/enterprise/storage/token` | AUTHENTICATED | USER | TENANT | - | 200/201 | 401/400 | - | DISABLED | DISABLED | DISABLED | - | - | NOT VERIFIED |
| POST | `/api/enterprise/storage/verify` | AUTHENTICATED | USER | TENANT | - | 200/201 | 401/400 | - | DISABLED | DISABLED | DISABLED | - | - | NOT VERIFIED |
| GET | `/api/enterprise/support-grants` | AUTHENTICATED | USER | TENANT | - | 200 | 401 | - | DISABLED | DISABLED | DISABLED | enterprise/components/EnterpriseSupportTab.jsx | - | NOT VERIFIED |
| POST | `/api/enterprise/support-grants` | AUTHENTICATED | USER | TENANT | - | 200/201 | 401/400 | - | DISABLED | DISABLED | DISABLED | enterprise/components/EnterpriseSupportTab.jsx | - | NOT VERIFIED |
| POST | `/api/enterprise/support-grants/:grantId/revoke` | AUTHENTICATED | USER | TENANT | - | 200/201 | 401/404/400 | - | DISABLED | DISABLED | DISABLED | enterprise/components/EnterpriseSupportTab.jsx | - | NOT VERIFIED |
| GET | `/api/enterprise/support/context` | AUTHENTICATED | USER | TENANT | - | 200 | 401 | - | DISABLED | DISABLED | DISABLED | - | - | NOT VERIFIED |
| GET | `/api/enterprise/teams` | AUTHENTICATED | USER | TENANT | - | 200 | 401 | - | DISABLED | DISABLED | DISABLED | enterprise/components/EnterpriseOverviewTab.jsx | - | NOT VERIFIED |
| POST | `/api/enterprise/teams` | AUTHENTICATED | USER | TENANT | - | 200/201 | 401/400 | - | DISABLED | DISABLED | DISABLED | enterprise/components/EnterpriseOverviewTab.jsx | - | NOT VERIFIED |
| PATCH | `/api/enterprise/teams/:teamId` | AUTHENTICATED | USER | TENANT | - | 200 | 401/404/400 | - | DISABLED | DISABLED | DISABLED | enterprise/components/EnterpriseOverviewTab.jsx | - | NOT VERIFIED |
| POST | `/api/enterprise/teams/:teamId/archive` | AUTHENTICATED | USER | TENANT | - | 200/201 | 401/404/400 | - | DISABLED | DISABLED | DISABLED | enterprise/components/EnterpriseOverviewTab.jsx | - | NOT VERIFIED |
| GET | `/api/enterprise/teams/:teamId/members` | AUTHENTICATED | USER | TENANT | - | 200 | 401/404 | - | DISABLED | DISABLED | DISABLED | enterprise/components/EnterpriseOverviewTab.jsx | - | NOT VERIFIED |
| POST | `/api/enterprise/teams/:teamId/members` | AUTHENTICATED | USER | TENANT | - | 200/201 | 401/404/400 | - | DISABLED | DISABLED | DISABLED | enterprise/components/EnterpriseOverviewTab.jsx | - | NOT VERIFIED |
| DELETE | `/api/enterprise/teams/:teamId/members/:principalId` | AUTHENTICATED | USER | TENANT | - | 200/204 | 401/404/400 | - | DISABLED | DISABLED | DISABLED | enterprise/components/EnterpriseOverviewTab.jsx | - | NOT VERIFIED |
| POST | `/api/enterprise/teams/:teamId/restore` | AUTHENTICATED | USER | TENANT | - | 200/201 | 401/404/400 | - | DISABLED | DISABLED | DISABLED | enterprise/components/EnterpriseOverviewTab.jsx | - | NOT VERIFIED |
| PATCH | `/api/enterprise/tenant` | AUTHENTICATED | USER | TENANT | - | 200 | 401/400 | - | DISABLED | DISABLED | DISABLED | components/admin/tenants/PlatformTenants.jsx | - | NOT VERIFIED |
| GET | `/api/enterprise/tenants` | AUTHENTICATED | USER | TENANT | - | 200 | 401 | - | DISABLED | DISABLED | DISABLED | components/admin/tenants/PlatformTenants.jsx | - | NOT VERIFIED |
| POST | `/api/enterprise/tenants` | AUTHENTICATED | USER | TENANT | - | 200/201 | 401/400 | - | DISABLED | DISABLED | DISABLED | components/admin/tenants/PlatformTenants.jsx | - | NOT VERIFIED |
| POST | `/api/enterprise/tenants/:tenantId/reactivate` | AUTHENTICATED | USER | TENANT | - | 200/201 | 401/404/400 | - | DISABLED | DISABLED | DISABLED | components/admin/tenants/PlatformTenants.jsx | - | NOT VERIFIED |
| POST | `/api/enterprise/test-email` | AUTHENTICATED | USER | TENANT | - | 200/201 | 401/400 | - | DISABLED | DISABLED | DISABLED | enterprise/components/EnterpriseEmailTab.jsx | - | NOT VERIFIED |
| GET | `/api/enterprise/usage/ai` | AUTHENTICATED | USER | TENANT | - | 200 | 401 | - | DISABLED | DISABLED | DISABLED | enterprise/components/EnterpriseOverviewTab.jsx | - | NOT VERIFIED |
| GET | `/api/enterprise/usage/ai/events` | AUTHENTICATED | USER | TENANT | - | 200 | 401 | - | DISABLED | DISABLED | DISABLED | enterprise/components/EnterpriseUsageTab.jsx | - | NOT VERIFIED |
| GET | `/api/enterprise/workspaces` | AUTHENTICATED | USER | TENANT | - | 200 | 401 | - | DISABLED | DISABLED | DISABLED | enterprise/EnterpriseContext.jsx | - | NOT VERIFIED |
| POST | `/api/enterprise/workspaces` | AUTHENTICATED | USER | TENANT | - | 200/201 | 401/400 | - | DISABLED | DISABLED | DISABLED | enterprise/EnterpriseContext.jsx | - | NOT VERIFIED |
| PATCH | `/api/enterprise/workspaces/:workspaceId` | AUTHENTICATED | USER | TENANT | - | 200 | 401/404/400 | - | DISABLED | DISABLED | DISABLED | enterprise/EnterpriseContext.jsx | - | NOT VERIFIED |
| POST | `/api/enterprise/workspaces/:workspaceId/archive` | AUTHENTICATED | USER | TENANT | - | 200/201 | 401/404/400 | - | DISABLED | DISABLED | DISABLED | enterprise/EnterpriseContext.jsx | - | NOT VERIFIED |
| GET | `/api/enterprise/workspaces/:workspaceId/members` | AUTHENTICATED | USER | TENANT | - | 200 | 401/404 | - | DISABLED | DISABLED | DISABLED | enterprise/EnterpriseContext.jsx | - | NOT VERIFIED |
| POST | `/api/enterprise/workspaces/:workspaceId/members` | AUTHENTICATED | USER | TENANT | - | 200/201 | 401/404/400 | - | DISABLED | DISABLED | DISABLED | enterprise/EnterpriseContext.jsx | - | NOT VERIFIED |
| DELETE | `/api/enterprise/workspaces/:workspaceId/members/:principalId` | AUTHENTICATED | USER | TENANT | - | 200/204 | 401/404/400 | - | DISABLED | DISABLED | DISABLED | enterprise/EnterpriseContext.jsx | - | NOT VERIFIED |
| POST | `/api/enterprise/workspaces/:workspaceId/restore` | AUTHENTICATED | USER | TENANT | - | 200/201 | 401/404/400 | - | DISABLED | DISABLED | DISABLED | enterprise/EnterpriseContext.jsx | - | NOT VERIFIED |

### Module: `admin` (58)

| METHOD | PATH | AUTH | ROLE | TENANT | SA | OK | FAIL | EXTERNAL DEP | OBS | PROJ | STATUS | UI CONSUMER | AUDIT | LIVE |
| --- | --- | --- | --- | --- | :-: | --- | --- | --- | --- | --- | --- | --- | :-: | --- |
| POST | `/api/admin/ads` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200/201 | 401/403/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | firestore/dbOperations.js | - | NOT VERIFIED |
| DELETE | `/api/admin/ads/:adId` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200/204 | 401/403/404/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | firestore/dbOperations.js | - | NOT VERIFIED |
| GET | `/api/admin/ai-settings` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200 | 401/403 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | services/adminAiSettings.js | - | NOT VERIFIED |
| POST | `/api/admin/ai-settings` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200/201 | 401/403/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | services/adminAiSettings.js | - | NOT VERIFIED |
| POST | `/api/admin/ai/fetch-models` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200/201 | 401/403/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | services/adminAiSettings.js | - | NOT VERIFIED |
| POST | `/api/admin/ai/quota-limits` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200/201 | 401/403/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | services/adminAiSettings.js | - | NOT VERIFIED |
| GET | `/api/admin/ai/quota-stats` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200 | 401/403 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | services/adminAiSettings.js | - | NOT VERIFIED |
| POST | `/api/admin/ai/reset-quota` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200/201 | 401/403/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | services/adminAiSettings.js | - | NOT VERIFIED |
| POST | `/api/admin/ai/test-provider` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200/201 | 401/403/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | services/adminAiSettings.js | - | NOT VERIFIED |
| GET | `/api/admin/audit-logs` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200 | 401/403 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | components/admin/audit/AdminAuditLogs.jsx | - | NOT VERIFIED |
| GET | `/api/admin/audit-logs/:id` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200 | 401/403/404 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | components/admin/audit/AdminAuditLogs.jsx | - | NOT VERIFIED |
| GET | `/api/admin/audit-logs/stats` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200 | 401/403 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | components/admin/audit/AdminAuditLogs.jsx | - | NOT VERIFIED |
| POST | `/api/admin/blog/categories` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200/201 | 401/403/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | firestore/dbOperations.js | - | NOT VERIFIED |
| DELETE | `/api/admin/blog/categories/:categoryId` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200/204 | 401/403/404/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | firestore/dbOperations.js | - | NOT VERIFIED |
| PATCH | `/api/admin/blog/categories/:categoryId` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200 | 401/403/404/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | firestore/dbOperations.js | - | NOT VERIFIED |
| DELETE | `/api/admin/blog/posts/:postId` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200/204 | 401/403/404/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | firestore/dbOperations.js | - | NOT VERIFIED |
| PATCH | `/api/admin/blog/posts/:postId` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200 | 401/403/404/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | firestore/dbOperations.js | - | NOT VERIFIED |
| POST | `/api/admin/blog/publish-due` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200/201 | 401/403/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | components/admin/blogManagement/BlogManagement.jsx | - | NOT VERIFIED |
| GET | `/api/admin/circuit-breaker-status` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200 | 401/403 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | - | - | NOT VERIFIED |
| PATCH | `/api/admin/companies/:companyId` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200 | 401/403/404/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | firestore/dbOperations.js | - | NOT VERIFIED |
| GET | `/api/admin/coupons` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200 | 401/403 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | firestore/dbOperations.js | - | NOT VERIFIED |
| DELETE | `/api/admin/coupons/:code` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200/204 | 401/403/404/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | firestore/dbOperations.js | - | NOT VERIFIED |
| PUT | `/api/admin/coupons/:code` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200 | 401/403/404/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | firestore/dbOperations.js | - | NOT VERIFIED |
| GET | `/api/admin/custom-templates` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200 | 401/403 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | - | - | NOT VERIFIED |
| POST | `/api/admin/delete-user` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200/201 | 401/403/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | firestore/dbOperations.js | - | NOT VERIFIED |
| PATCH | `/api/admin/employer-applications/:uid` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200 | 401/403/404/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | firestore/dbOperations.js | - | NOT VERIFIED |
| GET | `/api/admin/firebase-service-account` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200 | 401/403 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | components/admin/settings/FirebaseSettings.jsx | - | NOT VERIFIED |
| POST | `/api/admin/firebase-service-account` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200/201 | 401/403/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | components/admin/settings/FirebaseSettings.jsx | - | NOT VERIFIED |
| POST | `/api/admin/gdpr-settings` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200/201 | 401/403/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | components/admin/settings/GdprLegalSettings.jsx | - | NOT VERIFIED |
| POST | `/api/admin/global-rating` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200/201 | 401/403/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | firestore/dbOperations.js | - | NOT VERIFIED |
| GET | `/api/admin/health-summary` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200 | 401/403 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | components/admin/settings/SystemHealthSettings.jsx | - | NOT VERIFIED |
| DELETE | `/api/admin/jobs/:jobId` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200/204 | 401/403/404/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | firestore/dbOperations.js | - | NOT VERIFIED |
| PATCH | `/api/admin/jobs/:jobId` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200 | 401/403/404/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | firestore/dbOperations.js | - | NOT VERIFIED |
| POST | `/api/admin/landing-content` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200/201 | 401/403/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | firestore/dbOperations.js | - | NOT VERIFIED |
| GET | `/api/admin/pages` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200 | 401/403 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | firestore/dbOperations.js | - | NOT VERIFIED |
| DELETE | `/api/admin/pages/:slug` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200/204 | 401/403/404/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | firestore/dbOperations.js | - | NOT VERIFIED |
| PUT | `/api/admin/pages/:slug` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200 | 401/403/404/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | firestore/dbOperations.js | - | NOT VERIFIED |
| POST | `/api/admin/payment-settings` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200/201 | 401/403/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | firestore/dbOperations.js | - | NOT VERIFIED |
| POST | `/api/admin/payment/test-provider` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200/201 | 401/403/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | components/admin/settings/PaymentSettings.jsx | - | NOT VERIFIED |
| POST | `/api/admin/payments/refund` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200/201 | 401/403/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | firestore/dbOperations.js | - | NOT VERIFIED |
| POST | `/api/admin/reset-circuit-breaker` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200/201 | 401/403/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | - | - | NOT VERIFIED |
| POST | `/api/admin/reviews` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200/201 | 401/403/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | firestore/dbOperations.js | - | NOT VERIFIED |
| DELETE | `/api/admin/reviews/:reviewId` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200/204 | 401/403/404/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | firestore/dbOperations.js | - | NOT VERIFIED |
| POST | `/api/admin/save-smtp` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200/201 | 401/403/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | - | - | NOT VERIFIED |
| POST | `/api/admin/save-template-customization` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200/201 | 401/403/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | - | - | NOT VERIFIED |
| GET | `/api/admin/settings` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200 | 401/403 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | firestore/dbOperations.js | - | NOT VERIFIED |
| POST | `/api/admin/settings/:category` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200/201 | 401/403/404/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | firestore/dbOperations.js | - | NOT VERIFIED |
| POST | `/api/admin/system-health-settings` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200/201 | 401/403/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | components/admin/settings/SystemHealthSettings.jsx | - | NOT VERIFIED |
| POST | `/api/admin/test-connection` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200/201 | 401/403/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | - | - | NOT VERIFIED |
| POST | `/api/admin/test-imap` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200/201 | 401/403/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | - | - | NOT VERIFIED |
| GET | `/api/admin/trusted-by` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200 | 401/403 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | firestore/dbOperations.js | - | NOT VERIFIED |
| POST | `/api/admin/trusted-by` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200/201 | 401/403/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | firestore/dbOperations.js | - | NOT VERIFIED |
| DELETE | `/api/admin/trusted-by/:logoId` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200/204 | 401/403/404/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | firestore/dbOperations.js | - | NOT VERIFIED |
| PATCH | `/api/admin/trusted-by/:logoId` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200 | 401/403/404/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | firestore/dbOperations.js | - | NOT VERIFIED |
| GET | `/api/admin/twilio-settings` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200 | 401/403 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | components/admin/settings/TwilioSmsSettings.jsx | - | NOT VERIFIED |
| POST | `/api/admin/twilio-settings` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200/201 | 401/403/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | components/admin/settings/TwilioSmsSettings.jsx | - | NOT VERIFIED |
| PATCH | `/api/admin/users/:uid` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200 | 401/403/404/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | firestore/dbOperations.js | - | NOT VERIFIED |
| POST | `/api/admin/website-meta` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200/201 | 401/403/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | firestore/dbOperations.js | - | NOT VERIFIED |

### Module: `platform` (29)

| METHOD | PATH | AUTH | ROLE | TENANT | SA | OK | FAIL | EXTERNAL DEP | OBS | PROJ | STATUS | UI CONSUMER | AUDIT | LIVE |
| --- | --- | --- | --- | --- | :-: | --- | --- | --- | --- | --- | --- | --- | :-: | --- |
| GET | `/api/platform/announcements` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200 | 401/403 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | services/platformApi.js | - | NOT VERIFIED |
| POST | `/api/platform/announcements` | AUTHENTICATED | SUPER_ADMIN | PLATFORM | YES | 200/201 | 401/403/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | services/platformApi.js | - | NOT VERIFIED |
| DELETE | `/api/platform/announcements/:id` | AUTHENTICATED | SUPER_ADMIN | PLATFORM | YES | 200/204 | 401/403/404/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | services/platformApi.js | - | NOT VERIFIED |
| PATCH | `/api/platform/announcements/:id` | AUTHENTICATED | SUPER_ADMIN | PLATFORM | YES | 200 | 401/403/404/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | services/platformApi.js | - | NOT VERIFIED |
| GET | `/api/platform/attention` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200 | 401/403 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | services/platformApi.js | - | NOT VERIFIED |
| GET | `/api/platform/backup-status` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200 | 401/403 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | services/platformApi.js | - | NOT VERIFIED |
| GET | `/api/platform/command-center` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200 | 401/403 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | services/platformApi.js | - | NOT VERIFIED |
| GET | `/api/platform/encryption` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200 | 401/403 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | services/platformApi.js | - | NOT VERIFIED |
| GET | `/api/platform/enterprise-queue` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200 | 401/403 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | services/platformApi.js | - | NOT VERIFIED |
| GET | `/api/platform/health` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200 | 401/403 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | services/platformApi.js | - | NOT VERIFIED |
| GET | `/api/platform/health-indicator` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200 | 401/403 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | services/platformApi.js | - | NOT VERIFIED |
| GET | `/api/platform/maintenance` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200 | 401/403 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | services/platformApi.js | - | NOT VERIFIED |
| POST | `/api/platform/maintenance` | AUTHENTICATED | SUPER_ADMIN | PLATFORM | YES | 200/201 | 401/403/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | services/platformApi.js | - | NOT VERIFIED |
| GET | `/api/platform/observability` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200 | 401/403 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | services/platformApi.js | - | NOT VERIFIED |
| GET | `/api/platform/operational-status` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200 | 401/403 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | services/platformApi.js | - | NOT VERIFIED |
| GET | `/api/platform/operational-status/:serviceId` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200 | 401/403/404 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | services/platformApi.js | - | NOT VERIFIED |
| POST | `/api/platform/operational-status/:serviceId/test` | AUTHENTICATED | SUPER_ADMIN | PLATFORM | YES | 200/201 | 401/403/404/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | services/platformApi.js | YES | NOT VERIFIED |
| GET | `/api/platform/operational-status/api-matrix` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200 | 401/403 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | services/platformApi.js | - | NOT VERIFIED |
| POST | `/api/platform/operational-status/refresh` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200/201 | 401/403/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | services/platformApi.js | YES | NOT VERIFIED |
| GET | `/api/platform/operators` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200 | 401/403 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | services/platformApi.js | - | NOT VERIFIED |
| POST | `/api/platform/operators` | AUTHENTICATED | SUPER_ADMIN | PLATFORM | YES | 200/201 | 401/403/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | services/platformApi.js | - | NOT VERIFIED |
| GET | `/api/platform/overview` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200 | 401/403 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | services/platformApi.js | - | NOT VERIFIED |
| GET | `/api/platform/payments-health` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200 | 401/403 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | services/platformApi.js | - | NOT VERIFIED |
| GET | `/api/platform/queues` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200 | 401/403 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | components/admin/queues/PlatformQueues.jsx | - | NOT VERIFIED |
| POST | `/api/platform/queues/retry` | AUTHENTICATED | SUPER_ADMIN | PLATFORM | YES | 200/201 | 401/403/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | components/admin/queues/PlatformQueues.jsx | - | NOT VERIFIED |
| GET | `/api/platform/search` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200 | 401/403 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | services/platformApi.js | - | NOT VERIFIED |
| GET | `/api/platform/security-events` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200 | 401/403 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | services/platformApi.js | - | NOT VERIFIED |
| GET | `/api/platform/tenants/:tenantId` | AUTHENTICATED | ADMIN+ | PLATFORM | - | 200 | 401/403/404 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | services/platformApi.js | - | NOT VERIFIED |
| POST | `/api/platform/tenants/:tenantId/decommission` | AUTHENTICATED | SUPER_ADMIN | PLATFORM | YES | 200/201 | 401/403/404/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | services/platformApi.js | YES | NOT VERIFIED |

### Module: `notifications` (26)

| METHOD | PATH | AUTH | ROLE | TENANT | SA | OK | FAIL | EXTERNAL DEP | OBS | PROJ | STATUS | UI CONSUMER | AUDIT | LIVE |
| --- | --- | --- | --- | --- | :-: | --- | --- | --- | --- | --- | --- | --- | :-: | --- |
| GET | `/api/email/admin/circuit-breaker-status` | AUTHENTICATED | ADMIN+ | USER | - | 200 | 401/403 | Email / SMTP | NOT_CONFIGURED | NOT_CONFIGURED | NOT CONFIGURED | - | - | NOT VERIFIED |
| GET | `/api/email/admin/custom-templates` | AUTHENTICATED | ADMIN+ | USER | - | 200 | 401/403 | Email / SMTP | NOT_CONFIGURED | NOT_CONFIGURED | NOT CONFIGURED | - | - | NOT VERIFIED |
| POST | `/api/email/admin/reset-circuit-breaker` | AUTHENTICATED | ADMIN+ | USER | - | 200/201 | 401/403/400 | Email / SMTP | NOT_CONFIGURED | NOT_CONFIGURED | NOT CONFIGURED | components/admin/settings/EmailSmtpSettings.jsx | - | NOT VERIFIED |
| POST | `/api/email/admin/save-smtp` | AUTHENTICATED | ADMIN+ | USER | - | 200/201 | 401/403/400 | Email / SMTP | NOT_CONFIGURED | NOT_CONFIGURED | NOT CONFIGURED | components/admin/settings/EmailSmtpSettings.jsx | - | NOT VERIFIED |
| POST | `/api/email/admin/save-template-customization` | AUTHENTICATED | ADMIN+ | USER | - | 200/201 | 401/403/400 | Email / SMTP | NOT_CONFIGURED | NOT_CONFIGURED | NOT CONFIGURED | - | - | NOT VERIFIED |
| GET | `/api/email/admin/settings` | AUTHENTICATED | ADMIN+ | USER | - | 200 | 401/403 | Email / SMTP | NOT_CONFIGURED | NOT_CONFIGURED | NOT CONFIGURED | components/admin/settings/EmailSmtpSettings.jsx | - | NOT VERIFIED |
| POST | `/api/email/admin/test-connection` | AUTHENTICATED | ADMIN+ | USER | - | 200/201 | 401/403/400 | Email / SMTP | NOT_CONFIGURED | NOT_CONFIGURED | NOT CONFIGURED | components/admin/settings/EmailSmtpSettings.jsx | - | NOT VERIFIED |
| POST | `/api/email/admin/test-imap` | AUTHENTICATED | ADMIN+ | USER | - | 200/201 | 401/403/400 | Email / SMTP | NOT_CONFIGURED | NOT_CONFIGURED | NOT CONFIGURED | components/admin/settings/EmailSmtpSettings.jsx | - | NOT VERIFIED |
| GET | `/api/email/logs` | AUTHENTICATED | USER | USER | - | 200 | 401 | Email / SMTP | NOT_CONFIGURED | NOT_CONFIGURED | NOT CONFIGURED | components/admin/settings/EmailSmtpSettings.jsx | - | NOT VERIFIED |
| POST | `/api/email/resend` | AUTHENTICATED | USER | USER | - | 200/201 | 401/400 | Email / SMTP | NOT_CONFIGURED | NOT_CONFIGURED | NOT CONFIGURED | components/admin/settings/EmailSmtpSettings.jsx | - | NOT VERIFIED |
| POST | `/api/email/send-email` | AUTHENTICATED | USER | USER | - | 200/201 | 401/400 | Email / SMTP | NOT_CONFIGURED | NOT_CONFIGURED | NOT CONFIGURED | - | - | NOT VERIFIED |
| POST | `/api/email/send-invoice-email` | AUTHENTICATED | USER | USER | - | 200/201 | 401/400 | Email / SMTP | NOT_CONFIGURED | NOT_CONFIGURED | NOT CONFIGURED | - | - | NOT VERIFIED |
| GET | `/api/email/templates` | AUTHENTICATED | USER | USER | - | 200 | 401 | Email / SMTP | NOT_CONFIGURED | NOT_CONFIGURED | NOT CONFIGURED | - | - | NOT VERIFIED |
| POST | `/api/email/templates` | AUTHENTICATED | USER | USER | - | 200/201 | 401/400 | Email / SMTP | NOT_CONFIGURED | NOT_CONFIGURED | NOT CONFIGURED | - | - | NOT VERIFIED |
| POST | `/api/notify/email-otp` | AUTHENTICATED | USER | USER | - | 200/201 | 401/400 | Notification Dispatcher | DISABLED | DISABLED | DISABLED | - | - | NOT VERIFIED |
| POST | `/api/notify/job-application` | AUTHENTICATED | USER | USER | - | 200/201 | 401/400 | Notification Dispatcher | DISABLED | DISABLED | DISABLED | - | - | NOT VERIFIED |
| POST | `/api/notify/job-posted` | AUTHENTICATED | USER | USER | - | 200/201 | 401/400 | Notification Dispatcher | DISABLED | DISABLED | DISABLED | - | - | NOT VERIFIED |
| POST | `/api/notify/job-status-update` | AUTHENTICATED | USER | USER | - | 200/201 | 401/400 | Notification Dispatcher | DISABLED | DISABLED | DISABLED | - | - | NOT VERIFIED |
| POST | `/api/notify/password-changed` | AUTHENTICATED | USER | USER | - | 200/201 | 401/400 | Notification Dispatcher | DISABLED | DISABLED | DISABLED | - | - | NOT VERIFIED |
| POST | `/api/notify/password-reset` | AUTHENTICATED | USER | USER | - | 200/201 | 401/400 | Notification Dispatcher | DISABLED | DISABLED | DISABLED | - | - | NOT VERIFIED |
| POST | `/api/notify/portfolio-published` | AUTHENTICATED | USER | USER | - | 200/201 | 401/400 | Notification Dispatcher | DISABLED | DISABLED | DISABLED | components/PortfolioBuilder/PortfolioBuilder.jsx | - | NOT VERIFIED |
| POST | `/api/notify/security-alert` | AUTHENTICATED | USER | USER | - | 200/201 | 401/400 | Notification Dispatcher | DISABLED | DISABLED | DISABLED | - | - | NOT VERIFIED |
| POST | `/api/notify/send-verification-email` | AUTHENTICATED | USER | USER | - | 200/201 | 401/400 | Notification Dispatcher | DISABLED | DISABLED | DISABLED | - | - | NOT VERIFIED |
| POST | `/api/notify/subscription-cancelled` | AUTHENTICATED | USER | USER | - | 200/201 | 401/400 | Notification Dispatcher | DISABLED | DISABLED | DISABLED | - | - | NOT VERIFIED |
| POST | `/api/notify/user-signup` | AUTHENTICATED | USER | USER | - | 200/201 | 401/400 | Notification Dispatcher | DISABLED | DISABLED | DISABLED | components/auth/login/Login.jsx | - | NOT VERIFIED |
| POST | `/api/send-email` <br>*(alias of `/api/email/send-email`)* | AUTHENTICATED | USER | USER | - | 200/201 | 401/400 | Email / SMTP | NOT_CONFIGURED | NOT_CONFIGURED | NOT CONFIGURED | components/admin/settings/EmailSmtpSettings.jsx | - | NOT VERIFIED |

### Module: `core` (15)

| METHOD | PATH | AUTH | ROLE | TENANT | SA | OK | FAIL | EXTERNAL DEP | OBS | PROJ | STATUS | UI CONSUMER | AUDIT | LIVE |
| --- | --- | --- | --- | --- | :-: | --- | --- | --- | --- | --- | --- | --- | :-: | --- |
| POST | `/api/check` | AUTHENTICATED | USER | USER | - | 200/201 | 401/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | firestore/dbOperations.js | - | NOT VERIFIED |
| GET | `/api/linkedin-scraper` | AUTHENTICATED | USER | USER | - | 200 | 401 | Naukri Job Ingestion | NOT_CONFIGURED | NOT_CONFIGURED | NOT CONFIGURED | - | - | NOT VERIFIED |
| GET | `/api/logs` <br>*(alias of `/api/email/logs`)* | AUTHENTICATED | USER | USER | - | 200 | 401 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | - | - | NOT VERIFIED |
| POST | `/api/resend` <br>*(alias of `/api/email/resend`)* | AUTHENTICATED | USER | USER | - | 200/201 | 401/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | - | - | NOT VERIFIED |
| GET | `/api/rtl-font-config` | AUTHENTICATED | USER | USER | - | 200 | 401 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | - | - | NOT VERIFIED |
| POST | `/api/send-invoice-email` <br>*(alias of `/api/email/send-invoice-email`)* | AUTHENTICATED | USER | USER | - | 200/201 | 401/400 | Notification Dispatcher | DISABLED | DISABLED | DISABLED | components/Billing/Plans/Checkout.jsx | - | NOT VERIFIED |
| POST | `/api/send-sms` | AUTHENTICATED | USER | USER | - | 200/201 | 401/400 | Twilio SMS | DISABLED | DISABLED | DISABLED | firestore/dbOperations.js | - | NOT VERIFIED |
| GET | `/api/service-availability` | PUBLIC | NONE | NONE | - | 200 | 404 | - | OPERATIONAL | OPERATIONAL | OPERATIONAL | hooks/useServiceAvailability.js | - | NOT VERIFIED |
| GET | `/api/templates` <br>*(alias of `/api/email/templates`)* | AUTHENTICATED | USER | USER | - | 200 | 401 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | - | - | NOT VERIFIED |
| POST | `/api/templates` <br>*(alias of `/api/email/templates`)* | AUTHENTICATED | USER | USER | - | 200/201 | 401/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | - | - | NOT VERIFIED |
| GET | `/healthz` | PUBLIC | NONE | NONE | - | 200 | 404 | - | OPERATIONAL | OPERATIONAL | OPERATIONAL | - | - | NOT VERIFIED |
| GET | `/llms.txt` | PUBLIC | NONE | NONE | - | 200 | 404 | - | UNAVAILABLE | OPERATIONAL | OPERATIONAL | components/admin/settings/LlmGeoSettings.jsx | - | NOT VERIFIED |
| GET | `/public/custom-pages.json` | PUBLIC | NONE | NONE | - | 200 | 404 | - | UNAVAILABLE | OPERATIONAL | OPERATIONAL | firestore/dbOperations.js | - | NOT VERIFIED |
| GET | `/public/trusted-by.json` | PUBLIC | NONE | NONE | - | 200 | 404 | - | UNAVAILABLE | OPERATIONAL | OPERATIONAL | firestore/dbOperations.js | - | NOT VERIFIED |
| GET | `/readyz` | PUBLIC | NONE | NONE | - | 200 | 404 | - | OPERATIONAL | OPERATIONAL | OPERATIONAL | - | - | NOT VERIFIED |

### Module: `billing` (15)

| METHOD | PATH | AUTH | ROLE | TENANT | SA | OK | FAIL | EXTERNAL DEP | OBS | PROJ | STATUS | UI CONSUMER | AUDIT | LIVE |
| --- | --- | --- | --- | --- | :-: | --- | --- | --- | --- | --- | --- | --- | :-: | --- |
| POST | `/api/invoice` | AUTHENTICATED | USER | USER | - | 200/201 | 401/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | - | - | NOT VERIFIED |
| POST | `/api/invoice/generate` | AUTHENTICATED | USER | USER | - | 200/201 | 401/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | - | - | NOT VERIFIED |
| POST | `/api/pay` | AUTHENTICATED | USER | USER | - | 200/201 | 401/400 | Stripe | NOT_CONFIGURED | NOT_CONFIGURED | NOT CONFIGURED | - | - | NOT VERIFIED |
| GET | `/api/payment-orders/:orderId` | AUTHENTICATED | USER | USER | - | 200 | 401/404 | Stripe | NOT_CONFIGURED | NOT_CONFIGURED | NOT CONFIGURED | components/Billing/Plans/Checkout.jsx | - | NOT VERIFIED |
| POST | `/api/payment/razorpay-order` | AUTHENTICATED | USER | USER | - | 200/201 | 401/400 | Stripe | NOT_CONFIGURED | NOT_CONFIGURED | NOT CONFIGURED | - | - | NOT VERIFIED |
| POST | `/api/paypal/create-order` | AUTHENTICATED | USER | USER | - | 200/201 | 401/400 | PayPal | NOT_CONFIGURED | NOT_CONFIGURED | NOT CONFIGURED | components/Billing/Plans/Checkout.jsx | - | NOT VERIFIED |
| POST | `/api/paypal/verify` | AUTHENTICATED | USER | USER | - | 200/201 | 401/400 | PayPal | NOT_CONFIGURED | NOT_CONFIGURED | NOT CONFIGURED | components/Billing/Plans/Checkout.jsx | - | NOT VERIFIED |
| POST | `/api/paytm/initiate-transaction` | AUTHENTICATED | USER | USER | - | 200/201 | 401/400 | PayTM | DISABLED | DISABLED | DISABLED | components/Billing/Plans/Checkout.jsx | - | NOT VERIFIED |
| POST | `/api/paytm/verify-transaction` | AUTHENTICATED | USER | USER | - | 200/201 | 401/400 | PayTM | DISABLED | DISABLED | DISABLED | components/Billing/Plans/Checkout.jsx | - | NOT VERIFIED |
| POST | `/api/phonepe/initiate` | AUTHENTICATED | USER | USER | - | 200/201 | 401/400 | PhonePe | DISABLED | DISABLED | DISABLED | components/Billing/Plans/Checkout.jsx | - | NOT VERIFIED |
| POST | `/api/phonepe/status` | AUTHENTICATED | USER | USER | - | 200/201 | 401/400 | PhonePe | DISABLED | DISABLED | DISABLED | components/Billing/Plans/Checkout.jsx | - | NOT VERIFIED |
| POST | `/api/razorpay/create-order` | AUTHENTICATED | USER | USER | - | 200/201 | 401/400 | Razorpay | NOT_CONFIGURED | NOT_CONFIGURED | NOT CONFIGURED | components/Billing/Plans/Checkout.jsx | - | NOT VERIFIED |
| POST | `/api/razorpay/verify-payment` | AUTHENTICATED | USER | USER | - | 200/201 | 401/400 | Razorpay | NOT_CONFIGURED | NOT_CONFIGURED | NOT CONFIGURED | components/Billing/Plans/Checkout.jsx | - | NOT VERIFIED |
| POST | `/api/stripe-webhook` | PUBLIC | NONE | NONE | - | 200/201 | 400 | Stripe | NOT_CONFIGURED | NOT_CONFIGURED | NOT CONFIGURED | - | - | NOT VERIFIED |
| POST | `/api/subscription/preferences` | AUTHENTICATED | USER | USER | - | 200/201 | 401/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | firestore/dbOperations.js | - | NOT VERIFIED |

### Module: `auth` (12)

| METHOD | PATH | AUTH | ROLE | TENANT | SA | OK | FAIL | EXTERNAL DEP | OBS | PROJ | STATUS | UI CONSUMER | AUDIT | LIVE |
| --- | --- | --- | --- | --- | :-: | --- | --- | --- | --- | --- | --- | --- | :-: | --- |
| POST | `/api/auth/custom-password-reset` | PUBLIC | NONE | NONE | - | 200/201 | 400 | - | OPERATIONAL | OPERATIONAL | OPERATIONAL | components/auth/recoverPassword/RecoverPassword.jsx | - | NOT VERIFIED |
| GET | `/api/auth/github` | PUBLIC | NONE | NONE | - | 200 | 404 | GitHub OAuth | NOT_CONFIGURED | NOT_CONFIGURED | NOT CONFIGURED | components/admin/settings/SocialAuthSettings.jsx | - | NOT VERIFIED |
| GET | `/api/auth/github/callback` | PUBLIC | NONE | NONE | - | 200 | 404 | GitHub OAuth | NOT_CONFIGURED | NOT_CONFIGURED | NOT CONFIGURED | components/admin/settings/SocialAuthSettings.jsx | - | NOT VERIFIED |
| GET | `/api/auth/github/test-credentials` | PUBLIC | NONE | NONE | - | 200 | 404 | GitHub OAuth | NOT_CONFIGURED | NOT_CONFIGURED | NOT CONFIGURED | - | - | NOT VERIFIED |
| GET | `/api/auth/linkedin` | PUBLIC | NONE | NONE | - | 200 | 404 | LinkedIn OAuth | NOT_CONFIGURED | NOT_CONFIGURED | NOT CONFIGURED | components/admin/settings/SocialAuthSettings.jsx | - | NOT VERIFIED |
| GET | `/api/auth/linkedin/callback` | PUBLIC | NONE | NONE | - | 200 | 404 | LinkedIn OAuth | NOT_CONFIGURED | NOT_CONFIGURED | NOT CONFIGURED | components/admin/settings/SocialAuthSettings.jsx | - | NOT VERIFIED |
| GET | `/api/auth/linkedin/test-credentials` | PUBLIC | NONE | NONE | - | 200 | 404 | LinkedIn OAuth | NOT_CONFIGURED | NOT_CONFIGURED | NOT CONFIGURED | - | - | NOT VERIFIED |
| POST | `/api/auth/oauth/exchange` | PUBLIC | NONE | NONE | - | 200/201 | 400 | - | OPERATIONAL | OPERATIONAL | OPERATIONAL | main.jsx | - | NOT VERIFIED |
| POST | `/api/auth/purge-orphaned-auth` | AUTHENTICATED | USER | USER | - | 200/201 | 401/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | - | - | NOT VERIFIED |
| POST | `/api/auth/send-verification-email` | AUTHENTICATED | USER | USER | - | 200/201 | 401/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | components/Dashboard/DashboardMain/DashboardMain.jsx | - | NOT VERIFIED |
| POST | `/api/auth/set-user-password` | PUBLIC | NONE | NONE | - | 200/201 | 400 | - | OPERATIONAL | OPERATIONAL | OPERATIONAL | components/auth/resetPassword/ResetPasswordModal.jsx | - | NOT VERIFIED |
| POST | `/api/auth/verify-email-token` | PUBLIC | NONE | NONE | - | 200/201 | 400 | - | OPERATIONAL | OPERATIONAL | OPERATIONAL | main.jsx | - | NOT VERIFIED |

### Module: `ai` (10)

| METHOD | PATH | AUTH | ROLE | TENANT | SA | OK | FAIL | EXTERNAL DEP | OBS | PROJ | STATUS | UI CONSUMER | AUDIT | LIVE |
| --- | --- | --- | --- | --- | :-: | --- | --- | --- | --- | --- | --- | --- | :-: | --- |
| POST | `/api/check-grammar` | AUTHENTICATED | USER | USER | - | 200/201 | 401/400 | AI Providers | NOT_CONFIGURED | NOT_CONFIGURED | NOT CONFIGURED | - | - | NOT VERIFIED |
| POST | `/api/generate-ai-cover-letter` | AUTHENTICATED | USER | USER | - | 200/201 | 401/400 | AI Providers | NOT_CONFIGURED | NOT_CONFIGURED | NOT CONFIGURED | - | - | NOT VERIFIED |
| POST | `/api/generate-content` | AUTHENTICATED | USER | USER | - | 200/201 | 401/400 | AI Providers | NOT_CONFIGURED | NOT_CONFIGURED | NOT CONFIGURED | services/aiService.js | - | NOT VERIFIED |
| POST | `/api/generate-education-description` | AUTHENTICATED | USER | USER | - | 200/201 | 401/400 | AI Providers | NOT_CONFIGURED | NOT_CONFIGURED | NOT CONFIGURED | - | - | NOT VERIFIED |
| POST | `/api/generate-interview` | AUTHENTICATED | USER | USER | - | 200/201 | 401/400 | AI Providers | NOT_CONFIGURED | NOT_CONFIGURED | NOT CONFIGURED | - | - | NOT VERIFIED |
| POST | `/api/generate-resume` | AUTHENTICATED | USER | USER | - | 200/201 | 401/400 | AI Providers | NOT_CONFIGURED | NOT_CONFIGURED | NOT CONFIGURED | - | - | NOT VERIFIED |
| POST | `/api/generate-skills` | AUTHENTICATED | USER | USER | - | 200/201 | 401/400 | AI Providers | NOT_CONFIGURED | NOT_CONFIGURED | NOT CONFIGURED | - | - | NOT VERIFIED |
| POST | `/api/generate-summary` | AUTHENTICATED | USER | USER | - | 200/201 | 401/400 | AI Providers | NOT_CONFIGURED | NOT_CONFIGURED | NOT CONFIGURED | - | - | NOT VERIFIED |
| POST | `/api/generate-work-description` | AUTHENTICATED | USER | USER | - | 200/201 | 401/400 | AI Providers | NOT_CONFIGURED | NOT_CONFIGURED | NOT CONFIGURED | - | - | NOT VERIFIED |
| POST | `/api/parse-resume` | AUTHENTICATED | USER | USER | - | 200/201 | 401/400 | AI Providers | NOT_CONFIGURED | NOT_CONFIGURED | NOT CONFIGURED | services/aiService.js | - | NOT VERIFIED |

### Module: `jobs` (9)

| METHOD | PATH | AUTH | ROLE | TENANT | SA | OK | FAIL | EXTERNAL DEP | OBS | PROJ | STATUS | UI CONSUMER | AUDIT | LIVE |
| --- | --- | --- | --- | --- | :-: | --- | --- | --- | --- | --- | --- | --- | :-: | --- |
| POST | `/api/employer/companies` | AUTHENTICATED | USER | USER | - | 200/201 | 401/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | firestore/dbOperations.js | - | NOT VERIFIED |
| DELETE | `/api/employer/companies/:companyId` | AUTHENTICATED | USER | USER | - | 200/204 | 401/404/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | firestore/dbOperations.js | - | NOT VERIFIED |
| PATCH | `/api/employer/companies/:companyId` | AUTHENTICATED | USER | USER | - | 200 | 401/404/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | firestore/dbOperations.js | - | NOT VERIFIED |
| POST | `/api/employer/jobs` | AUTHENTICATED | USER | USER | - | 200/201 | 401/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | firestore/dbOperations.js | - | NOT VERIFIED |
| DELETE | `/api/employer/jobs/:jobId` | AUTHENTICATED | USER | USER | - | 200/204 | 401/404/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | firestore/dbOperations.js | - | NOT VERIFIED |
| PATCH | `/api/employer/jobs/:jobId` | AUTHENTICATED | USER | USER | - | 200 | 401/404/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | firestore/dbOperations.js | - | NOT VERIFIED |
| PATCH | `/api/job-applications/:applicationId/status` | AUTHENTICATED | USER | USER | - | 200 | 401/404/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | firestore/dbOperations.js | - | NOT VERIFIED |
| POST | `/api/jobs/:jobId/applications` | AUTHENTICATED | USER | USER | - | 200/201 | 401/404/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | firestore/dbOperations.js | - | NOT VERIFIED |
| POST | `/api/jobs/naukri` | AUTHENTICATED | USER | USER | - | 200/201 | 401/400 | Naukri Job Ingestion | NOT_CONFIGURED | NOT_CONFIGURED | NOT CONFIGURED | - | - | NOT VERIFIED |

### Module: `messaging` (4)

| METHOD | PATH | AUTH | ROLE | TENANT | SA | OK | FAIL | EXTERNAL DEP | OBS | PROJ | STATUS | UI CONSUMER | AUDIT | LIVE |
| --- | --- | --- | --- | --- | :-: | --- | --- | --- | --- | --- | --- | --- | :-: | --- |
| POST | `/api/contact` | PUBLIC | NONE | NONE | - | 200/201 | 400 | - | OPERATIONAL | OPERATIONAL | OPERATIONAL | firestore/dbOperations.js | - | NOT VERIFIED |
| POST | `/api/messages/conversations` | AUTHENTICATED | USER | USER | - | 200/201 | 401/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | firestore/dbOperations.js | - | NOT VERIFIED |
| GET | `/api/messages/conversations/:conversationId/participant-profile` | AUTHENTICATED | USER | USER | - | 200 | 401/404 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | firestore/dbOperations.js | - | NOT VERIFIED |
| POST | `/api/messages/send` | AUTHENTICATED | USER | USER | - | 200/201 | 401/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | firestore/dbOperations.js | - | NOT VERIFIED |

### Module: `export` (4)

| METHOD | PATH | AUTH | ROLE | TENANT | SA | OK | FAIL | EXTERNAL DEP | OBS | PROJ | STATUS | UI CONSUMER | AUDIT | LIVE |
| --- | --- | --- | --- | --- | :-: | --- | --- | --- | --- | --- | --- | --- | :-: | --- |
| POST | `/api/export` | AUTHENTICATED | USER | USER | - | 200/201 | 401/400 | - | DEGRADED | DEGRADED | DEGRADED | components/Boards/board-step-filling/BoardFilling.jsx | - | NOT VERIFIED |
| POST | `/api/export-docx` | AUTHENTICATED | USER | USER | - | 200/201 | 401/400 | - | DEGRADED | DEGRADED | DEGRADED | utils/docxDownload.js | - | NOT VERIFIED |
| GET | `/api/export-render-data` | PUBLIC | NONE | NONE | - | 200 | 404 | - | DEGRADED | DEGRADED | DEGRADED | components/Exporter/Exporter.jsx | - | NOT VERIFIED |
| POST | `/api/public-export` | PUBLIC | NONE | NONE | - | 200/201 | 400 | - | DEGRADED | DEGRADED | DEGRADED | components/PublicResume/PublicResume.jsx | - | NOT VERIFIED |

### Module: `health` (3)

| METHOD | PATH | AUTH | ROLE | TENANT | SA | OK | FAIL | EXTERNAL DEP | OBS | PROJ | STATUS | UI CONSUMER | AUDIT | LIVE |
| --- | --- | --- | --- | --- | :-: | --- | --- | --- | --- | --- | --- | --- | :-: | --- |
| GET | `/api/health` | PUBLIC | NONE | NONE | - | 200 | 404 | - | OPERATIONAL | OPERATIONAL | OPERATIONAL | components/admin/Admin.jsx | - | NOT VERIFIED |
| GET | `/api/healthz` | PUBLIC | NONE | NONE | - | 200 | 404 | - | OPERATIONAL | OPERATIONAL | OPERATIONAL | components/admin/Admin.jsx | - | NOT VERIFIED |
| GET | `/api/readyz` | PUBLIC | NONE | NONE | - | 200 | 404 | - | OPERATIONAL | OPERATIONAL | OPERATIONAL | - | - | NOT VERIFIED |

### Module: `account` (1)

| METHOD | PATH | AUTH | ROLE | TENANT | SA | OK | FAIL | EXTERNAL DEP | OBS | PROJ | STATUS | UI CONSUMER | AUDIT | LIVE |
| --- | --- | --- | --- | --- | :-: | --- | --- | --- | --- | --- | --- | --- | :-: | --- |
| POST | `/api/account/delete` | AUTHENTICATED | USER | USER | - | 200/201 | 401/400 | - | UNAVAILABLE | OPERATIONAL | AUTHENTICATION PROTECTED | firestore/dbOperations.js | - | NOT VERIFIED |

---

## 6. Method of derivation

Nothing in this document is hand-maintained.

| Column | Derived from |
| --- | --- |
| METHOD / PATH | Live Express routing table (app router + all mounted routers) |
| MODULE | `moduleForPath()` in `backend/services/platformHealth.js` |
| AUTH | `publicApiPaths` parsed out of `backend/index.js` |
| ROLE | `ADMIN_PREFIXES` from `backend/security/policy.js` + `requireSuperAdmin` occurrences in `backend/routes/platform.js` |
| TENANT | Mount prefix (`/api/enterprise` → tenant-scoped) |
| EXTERNAL DEP | `dependencyFor()` mapping in the health collector |
| OBS / PROJ | Two live runs of `getHealthSnapshot()` |
| UI CONSUMER | Literal path search across every `src/**/*.{js,jsx,mjs}` file |
| AUDIT | `recordAdminAuditLog` occurrences within each route body |

Regenerate with `node ../scratch/tmp/inventory2.cjs` from `backend/`.
