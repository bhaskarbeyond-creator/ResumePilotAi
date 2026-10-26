# 09 — Configuration Gap Register

**Purpose.** Enumerate every business-affecting value the control plane depends on, state where it actually lives today, and then either (a) specify the dashboard key it should have — with scope, default, validation, and audit requirement — or (b) justify in writing why it must stay code/deployment-level. There are **no blank cells**: every row resolves to one of those two outcomes.

**Classification key**

| Code | Meaning | Count |
|---|---|---|
| **DB-VALID** | Dashboard-configurable today, with validation + revision guard + audit (`index.js:3843-3978`) | **3** |
| **DB-BROKEN** | Has a dashboard field, but the write is rejected (`400 … REVISION_REQUIRED`) or lands where nothing reads it | **9** |
| **CODE-UNJUST** | Hard-coded or env-only, with no written justification — **must become configurable** | **14** |
| **CODE-JUST** | Hard-coded/env-only **with** a defensible reason (deployment ownership, security invariant, protocol constant) | **8** |
| **Total** | | **34** |

Scope vocabulary: **PLATFORM** (one value for the whole deployment) · **TENANT** (per enterprise tenant) · **PLAN** (per subscription tier) · **DEPLOYMENT** (must match the container/host; not editable at runtime).

---

## 1. AI quotas and limits (CFG-001 … CFG-006)

| ID | Value | Where it lives today | Class | Proposed key & scope | Default | Validation | Audit |
|---|---|---|---|---|---|---|---|
| **CFG-001** | Basic-tier daily AI request limit | `security/aiGovernance.js:38` `DEFAULT_BASIC_DAILY_LIMIT = 10`; overridden per-user by entitlement | **CODE-UNJUST** | `ai.quota.plan.basic.dailyRequests`, scope **PLAN** | 10 | integer 1–100,000 (`aiGovernance.js:105-108`) | before/after + revision (REC-015); plan change is a commercial term → actor + reason mandatory |
| **CFG-002** | Enterprise daily AI request limit | `aiGovernance.js:37` `DEFAULT_ENTERPRISE_DAILY_LIMIT = 5000`; `platform.js:249` fallback 5000 | **CODE-UNJUST** | `ai.quota.plan.enterprise.dailyRequests`, scope **PLAN** | 5,000 | integer 1–100,000 | as CFG-001 |
| **CFG-003** | Plan quota table (Basic/Premium/Enterprise/Admin daily + maxTokens) | `adminAiEntitlement.js:8-13` `DEFAULT_GLOBAL_QUOTAS` (10/2048, 100/4096, 5000/8192, 10000/16384) | **CODE-UNJUST** | `ai.quota.plans`, scope **PLAN** | as coded | daily 1–100,000; tokens 256–32,768 (`:105-108,207-211`) | full table diff in audit (`before`/`after` per plan) |
| **CFG-004** | Global API rate limit | `index.js:381-386` env `GLOBAL_RATE_LIMIT_MAX`, default 2,500 / 15 min (10,000 in `NODE_ENV=test`) | **CODE-UNJUST** | `security.rateLimit.global`, scope **PLATFORM** | 2500 / 15 min | integer 100–100,000 per window; window fixed at 15 min | before/after + actor; **restart-required = false** (limiter reads per boot → mark `restart-required: true` until hot-reload exists) |
| **CFG-005** | Auth hourly + burst rate limits | `index.js:394-411` env `AUTH_RATE_LIMIT_MAX` (20/h prod), `AUTH_BURST_RATE_LIMIT_MAX` (5/min prod); both lifted in test | **CODE-UNJUST** | `security.rateLimit.authHourly` / `.authBurst`, scope **PLATFORM** | 20/h, 5/min | hourly 1–1,000; burst 1–60; burst ≤ hourly | before/after + actor. Rationale for both limits is documented in-code (DIR-040 comment) — keep the explanation, move the number |
| **CFG-006** | Per-request token ceiling | `adminAiEntitlement.js:9-12` `maxTokens` per plan; `aiGovernance.js` validates 256–32,768 | **CODE-UNJUST** (defaults) | `ai.quota.plans.*.maxTokens`, scope **PLAN** | 2048/4096/8192/16384 | 256–32,768 | as CFG-003 |

**Why CFG-001…006 matter.** These are commercial terms (what a customer paid for) enforced by a constant that requires a deploy to change. A pricing change currently ships as code, and the change is unattributable: the AI entitlement audit records the *user-level* override, not the *plan default* it derived from.

---

## 2. Security and session policy (CFG-007 … CFG-010)

| ID | Value | Where it lives today | Class | Proposed key & scope | Default | Validation | Audit |
|---|---|---|---|---|---|---|---|
| **CFG-007** | Sensitive-action freshness window (step-up) | `security/auth.js:296` env `SENSITIVE_AUTH_MAX_AGE_MS`, default `10 * 60 * 1000` | **CODE-JUST** — a security invariant must not be loosened from a UI that the same session could compromise | — (recommend read-only exposure in the config census, REC-016) | 600,000 ms | deployment-controlled | surfaced read-only |
| **CFG-008** | Whether step-up is enforced outside production | `auth.js:293` `REQUIRE_RECENT_AUTH_IN_TEST` | **CODE-JUST** — test-only escape hatch | — | `false` | deployment-controlled | surfaced read-only |
| **CFG-009** | Super-admin MFA enforcement | `auth.js:230` `superAdminMfaEnforced()` (prod default true) | **CODE-JUST** — deliberately not switchable at runtime; a runtime switch would be an attacker's first target | — | `true` in production | deployment-controlled | surfaced read-only |
| **CFG-010** | Sensitive-read audit list | `security/adminAudit.js` (sensitive reads: `/audit-logs`, `/firebase-service-account`) | **CODE-UNJUST** | `security.audit.sensitiveReads`, scope **PLATFORM** | the two current paths | array of route patterns, ≤50, each must resolve to a registered route | before/after + actor (widening audit scope is a governance change) |

---

## 3. Connection, session and retention (CFG-011 … CFG-016)

| ID | Value | Where it lives today | Class | Proposed key & scope | Default | Validation | Audit |
|---|---|---|---|---|---|---|---|
| **CFG-011** | Admin session idle/absolute TTL | No admin-specific value; sessions are Firebase-issued (`admin_*` session records exist, no TTL constant found in `backend/` outside live-interview sessions `liveInterviewSession.js:37`) | **CODE-UNJUST** | `security.session.adminTtlMinutes`, scope **PLATFORM** | 60 (proposed — see §7 note) | 5–1,440; must be ≤ Firebase ID-token refresh policy | before/after + actor |
| **CFG-012** | Queue inspection sample size | `routes/platform.js:471` `LIMIT 50` on `notification_outbox` and `enterprise_outbox`; response sets `sampled: true` | **CODE-UNJUST** | `operations.queues.sampleSize`, scope **PLATFORM** | 50 | 10–500 | before/after; response must keep `sampled` flag honest |
| **CFG-013** | Notification outbox retention | `[SQL-001]:693` table; no pruning configuration found | **CODE-UNJUST** | `operations.retention.notificationOutboxDays`, scope **PLATFORM** | 30 (proposed) | 1–365 | before/after + actor; deletion is irreversible → dry-run count in the confirmation |
| **CFG-014** | AI usage retention | `[SQL-001]:675` `ai_usage`; no pruning configuration | **CODE-UNJUST** | `operations.retention.aiUsageDays`, scope **PLATFORM** | 90 (proposed) | 7–730; must be ≥ any billing reconciliation window | before/after + actor |
| **CFG-015** | Audit-log retention | `[SQL-001]:503` `admin_audit_logs`; no pruning configuration | **CODE-UNJUST** | `governance.retention.adminAuditDays`, scope **PLATFORM** | 365 (proposed) | 90–3,650; **floor of 90 is a hard minimum** | before/after + actor; lowering below the compliance floor should require a second approver |
| **CFG-016** | Announcement expiry / banner TTL | `routes/platform.js:977-1120` CRUD; expiry is per-record, no platform default | **CODE-UNJUST** | `content.announcements.defaultTtlHours`, scope **PLATFORM** | 24 | 1–720 | before/after |

---

## 4. Revenue, currency and tax (CFG-017 … CFG-020)

| ID | Value | Where it lives today | Class | Proposed key & scope | Default | Validation | Audit |
|---|---|---|---|---|---|---|---|
| **CFG-017** | Base currency | `AdminSettingsTab.tsx:589` FE default `'INR'`; server reads `payment_providers`/`public_config` | **DB-BROKEN** — the panel posts to `/api/admin/payment-settings` without `expectedRevision` ⇒ `400 PAYMENT_SETTINGS_REVISION_REQUIRED` (`index.js:4250-4256`) | `payments.currency`, scope **PLATFORM** | INR | ISO-4217 membership; changing an established currency requires an explicit migration acknowledgement | before/after + actor; **must warn** that historical invoices are not re-denominated |
| **CFG-018** | GST / sales-tax rate | `AdminSettingsTab.tsx:592` FE default `18`; posted with the payment payload | **DB-BROKEN** (same rejection path) | `payments.tax.gstPercentage`, scope **PLATFORM** (offer **TENANT** override later) | 18 | number 0–100, 2 decimal places | before/after + actor + reason (tax changes are auditable events) |
| **CFG-019** | Gateway enablement (Razorpay/Stripe/PayPal/Paytm/PhonePe) | `platform.js:151-200` `resolvePaymentProviders` with per-provider `adminEnabled` toggles; `public_config.subscriptions` overrides | **DB-BROKEN** | `payments.providers.*.enabled`, scope **PLATFORM** | current values | boolean; a provider cannot be enabled without a credentialed pair (`selectCredentialPair`, `:137-142`) | before/after; enabling a live-mode provider must require step-up |
| **CFG-020** | Twilio sender + SMS enablement | Canonical: `index.js:4826-4915` (`/api/admin/twilio-settings`), `admin_configuration.twilio`; FE instead writes `integrations.twilioSid/twilioToken` | **DB-BROKEN** | `communications.sms.fromNumber`, `communications.sms.enabled`, scope **PLATFORM** | none / disabled | E.164 (`/^\+[1-9]\d{7,14}$/`), `AC[a-f0-9]{32}` SID, token 16–256 chars | `TWILIO_SETTINGS_UPDATED` already written (`index.js:4915`) — keep; add before/after |

---

## 5. Product surface and content (CFG-021 … CFG-027)

| ID | Value | Where it lives today | Class | Proposed key & scope | Default | Validation | Audit |
|---|---|---|---|---|---|---|---|
| **CFG-021** | Module enablement (18 keys) | `system_settings.modules` via `POST /api/admin/settings/modules` — the only settings write that works correctly | **DB-VALID** | `modules.*`, scope **PLATFORM** | current | boolean; **must be gated on having a consumer** (Appendix A.7) | revision + `changedFields` today; before/after pending REC-015 |
| **CFG-022** | Feature-flag defaults (7) | `services/featureFlagService.js`; `platform.js:1637-1665` | **DB-VALID** (backend) / no UI (RCA-015) | `featureFlags.*`, scope **PLATFORM** | as coded | boolean + restart-required metadata; SA-only + step-up | `PUT` already requires step-up; add before/after + restart-pending marker |
| **CFG-023** | CV template catalogue + pro/free split | **Hard-coded in the admin UI**: `AdminSettingsTab.tsx:1164-1172` (`Array.from({length:51})`, pro set `[7,12,18,24,30,35,42,48,51]`); real catalogue `frontend/src/lib/template-catalog.ts` | **CODE-UNJUST** — two sources of truth that will diverge on the next template release | `content.templates.catalog`, scope **PLATFORM** (derived from the catalogue, not hand-entered) | catalogue | every id must exist in `template-catalog.ts`; pro set ⊆ catalogue | before/after + actor |
| **CFG-024** | Disabled-template list | `templateManager.disabledTemplates` via `POST /api/admin/settings/templateManager` | **DB-BROKEN** (no `expectedRevision`) | `content.templates.disabled`, scope **PLATFORM** | `[]` | array ≤ catalogue size, ids validated | before/after |
| **CFG-025** | GDPR consent defaults (enabled, privacy URL, terms URL) | `AdminSettingsTab.tsx:1153-1155` FE defaults (`true`, `/p/privacy-policy`, `/p/terms-of-service`); writes `gdpr` | **DB-BROKEN** | `legal.consent.*`, scope **PLATFORM** | current | URLs must be same-origin paths or HTTPS; enable flag boolean | before/after + actor (statutory surface) |
| **CFG-026** | Geo-SEO defaults + LLM discovery directives | `AdminSettingsTab.tsx:856-858` FE default keyword string and `llms.txt` directives; server normalises (`index.js:3871`) | **DB-BROKEN** | `seo.geo.*`, `seo.llm.*`, scope **PLATFORM** | empty (no seeded marketing claims) | keyword list ≤ 50 × 120 chars; directives ≤ 10,000 chars (`normalizeAdminSettingValue`, `:3567`) | publish is already audited (`LLMS_DISCOVERY_PUBLISHED`); add before/after |
| **CFG-027** | Brand identity defaults (title, meta, logos, favicon) | `AdminSettingsTab.tsx:853-855` FE defaults; writes `branding` | **DB-BROKEN** | `branding.*`, scope **PLATFORM** | none | URL fields must be https or root-relative; asset MIME/size validation required (CAP-030) | before/after |

---

## 6. Protocol constants and hard limits (CFG-028 … CFG-034)

| ID | Value | Where it lives today | Class | Proposed key & scope | Default | Validation | Audit |
|---|---|---|---|---|---|---|---|
| **CFG-028** | Settings payload size cap | `index.js:3875` `100_000` bytes | **CODE-JUST** — a request-size guard protects the transaction; exposing it invites a DoS by configuration | — | 100 KB | fixed | n/a |
| **CFG-029** | Settings string/array/object caps and nesting depth | `index.js:3560-3578` (10,000 chars per string, 200 array items, 200 object keys, depth 6) | **CODE-JUST** — storage-integrity invariants; not business policy | — | as coded | fixed | n/a |
| **CFG-030** | Social-link validation (allowlist, HTTPS, length) | `index.js:3859-3873` | **CODE-JUST** — the allowlist *is* the schema of the `social` category; a configurable allowlist would let an admin add a field the UI cannot render | — | 5 networks, HTTPS, ≤500 chars | fixed | validation failure logged |
| **CFG-031** | Deployment-owned export/render values (`websiteDomain`, `backendExportUrl`, `chromiumPath`) | `index.js:3848-3851` `403 INFRASTRUCTURE_SETTING_READ_ONLY` | **CODE-JUST** — must match the container filesystem; DIV-014 | `DEPLOYMENT` (read-only in census) | env | deployment-controlled | read-only exposure |
| **CFG-032** | Object-storage provider credentials | `index.js:3852-3859` `501 STORAGE_PROVIDER_UNSUPPORTED` | **CODE-JUST** until an adapter exists — and honest about it (DIV-010) | `storage.*` — **only after** an adapter ships | n/a | requires an adapter decision (§11 RR-006) | would require before/after once enabled |
| **CFG-033** | AI provider model names / fallback order | `services/aiRuntime.js`, `admin_configuration.ai` (provider keys + model selection); partially surfaced in `ai-settings/providers` | **DB-BROKEN** for the parts the console writes through the generic settings path; **DB-VALID** for the dedicated AI routes | `ai.providers.*.model`, `.fallbackOrder`, scope **PLATFORM** | as coded | model must be in the provider's discovery list; fallback chain acyclic | before/after + actor; a model change alters output quality and cost → reason mandatory |
| **CFG-034** | Maintenance-mode message + window | `system_settings` via `POST /api/admin/system-health-settings` (`index.js:3475`), read by `GET /api/admin/health-summary` — the one console write that is fully correct | **DB-VALID** | `operations.maintenance.*`, scope **PLATFORM** | disabled | message ≤ 500 chars; window end > start | revision + in-transaction audit today; before/after pending REC-015 |

---

## 7. Reconciliation against the invariant

INV-4 requires *"every business-affecting value dashboard-configurable with validation/default/audit unless justified as code-level"*. Measured against the 34 rows:

| Verdict | Count | What it means in practice |
|---|---|---|
| Configurable and working | **3** (CFG-021, CFG-022, CFG-034) | the modules panel, feature flags (API only) and the maintenance lever |
| Configurable, **partly** working | **1** (CFG-033) | AI provider settings are correct on the dedicated AI routes and broken on the generic path |
| Configurable but **cannot persist today** | **9** (CFG-017…020, 024…027, 033) | the panel exists, the write returns `400` (RCA-013). The most consequential: currency (CFG-017), tax (CFG-018), Twilio (CFG-020) |
| Code/env-only, **unjustified** | **14** | AI plan quotas (the commercial contract), all four rate limits, three retention windows, session TTL, queue sample size, audit sensitive-read list, template catalogue |
| Code/env-only, **justified** | **8** | size/depth caps, social schema, deployment-owned values, storage-until-adapter, step-up window, test-only step-up escape, super-admin MFA |
| **Total** | **34** | 0 blanks; every unjustified row has a proposed key, default and validation in the table above |

**Two observations the table forces:**

1. **The truly urgent rows are not the quotas — they are the security limits.** Four of the fourteen unjustified values (CFG-004, CFG-005, CFG-010, CFG-016) are operational-security levers that an operator needs *during* an incident, when a deploy is least available. Rate limits are also the only values in the set whose misconfiguration is a denial-of-service risk in both directions.
2. **Eight of the nine "configurable but broken" rows share one root cause** (missing `expectedRevision`, RCA-013) and one fix (REC-012); CFG-033 is broken for a different reason (it has two writers with different contracts). This is the cheapest configuration win available: one client change repairs currency, tax, gateways, Twilio, templates, GDPR, SEO, branding and code injection at once.

**On the three "proposed" defaults.** CFG-011, CFG-013, CFG-014 carry proposed values because no current value exists anywhere in the codebase (verified by search). They are marked `UNRESOLVED — decision required` in §11 (RR-007) with the trade-offs stated: a retention period is a legal and storage-cost decision, not an engineering one, and inventing a number here would be a false precision.

---

*Cross-references: invariant INV-4 §08 · root cause RCA-013 §06 · recommendations REC-011/012/015/016 §10 · open decisions §11.*
