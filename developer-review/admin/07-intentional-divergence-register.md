# 07 — Intentional Divergence Register

**What this register is for.** §03 classifies what legacy did. §04 records what the new system does. This document records the cases where the two differ **on purpose**, and then holds each one to three questions:

1. Is the stated rationale real (does the code show it)?
2. Is the *business intent* preserved, even though the mechanism changed?
3. What was lost by the change, and is that loss acceptable?

A divergence is only "intentional" if the evidence shows a decision. A change that nobody decided — or a capability that simply vanished — is a defect and lives in §06, not here.

**Verdict scale**

| Verdict | Meaning |
|---|---|
| **ACCEPT** | The new behaviour is better and preserves intent. Do not regress toward legacy. |
| **ACCEPT-CONDITIONAL** | Directionally right; requires a named follow-up before the intent is actually preserved. |
| **REJECT** | The change is a regression dressed as a decision. Replace it. |

**Counts:** 18 entries — **6 ACCEPT**, **8 ACCEPT-CONDITIONAL**, **4 REJECT**.

---

## 1. Register

### DIV-001 — 31 separate settings screens collapsed into 5 sections
**Verdict: ACCEPT-CONDITIONAL** · Evidence: `AdminSettingsTab.tsx:112-196` (5 sections) vs `src/components/admin/sidebar/sidebar.jsx:68-111` (31 screens in 6 groups)

| | |
|---|---|
| **Legacy behaviour** | One route `/admin/settings?tab=<key>` with 31 sub-screens, each a separately gated sidebar entry; many screens wrote to the same two `system_settings` roots. |
| **New behaviour** | One tab with 5 sectional panels (Addon Modules, Payments & Gateways, Brand & SEO, Third-Party Keys, Templates/Legal/Code). |
| **Rationale shown in code** | Section nav is grouped by *data owner* rather than by legacy menu order (`AdminSettingsTab.tsx:112-196`). The legacy split was navigational: `websiteSettings` and `brandingSettings`, for example, both wrote the same root with different field subsets. |
| **Intent preserved** | Yes for the 17 screens that have a home; the configuration *need* behind each surviving screen is met by a panel. |
| **What was lost** | 14 screens have no home (10 present-but-cannot-save, 11 absent, 2 obsolete — see §04 §4). Consolidation was used as cover for scope reduction: the field-level capability was dropped, not redesigned. |
| **Required action** | REC-011 (restore the missing fields/categories) and REC-012 (make the surviving panels actually write). Until both land, this divergence does not preserve intent. |

---

### DIV-002 — The backend was carried forward, not rewritten
**Verdict: ACCEPT-CONDITIONAL** · Evidence: `[DIFF-01]`…`[DIFF-09]` (Appendix A.4); `routes/adminUsers.js` 0-line diff; `routes/adminAudit.js` 0; `security/adminAudit.js` 0; `security/auth.js` +108 lines (all `optionalAuth`); `security/policy.js` +46 lines

| | |
|---|---|
| **Legacy behaviour** | Legacy production Express service. |
| **New behaviour** | Byte-identical for the admin domain except a small patch set: `optionalAuth` extraction (DIV-012), three policy additions (DIR-022/DIR-106), `RECENT_AUTHENTICATION_PATHS`, `adminPlatformOperations.js` (392 lines, new), and the settings hardening. |
| **Rationale shown in code** | The patches are surgical and each carries a comment explaining the CVE/regression it closes (e.g. `platform.js:1685-1706` explains why the payment-settings read guard was lowered). This is a deliberate "harden in place" strategy, not neglect. |
| **Intent preserved** | Yes — the admin backend's behaviour is preserved by construction, including its defects. |
| **What was lost** | The opportunity to fix inherited defects. LD-03 (`system.config.write` without `.read`), LD-05 (per-user `permissions` union) and the best-effort audit write are all legacy behaviour, reproduced verbatim (§03 §4). |
| **Required action** | Treat the backend as "legacy with a patch backlog", not as new code. REC-005, REC-006, REC-015 are therefore **fixes to legacy debt**, and should be scheduled as such — they are not regressions to revert. |

---

### DIV-003 — 24 tab routes → 15 tab identifiers (14 panels)
**Verdict: REJECT** · Evidence: `console.tsx:50-66` vs `src/components/admin/Admin.jsx:840-960`

| | |
|---|---|
| **Legacy behaviour** | 24 concrete tab routes, each with an explicit `RequireTabPerm` gate and a `FIRST_ACCESSIBLE_TAB` fallback. |
| **New behaviour** | 15 tab ids (one is an alias), no per-tab gate, role switch decides (DIV-004), and 12 legacy routes have no successor surface. |
| **Rationale shown in code** | None. There is no comment, no mapping table, and no design note in the new console explaining the reduction. |
| **Intent preserved** | No. Reduction is fine; *silent* reduction is not. The 12 dropped routes are capabilities (tenants, audit, operators, jobs, companies, reviews, pages, phrases, messages, landing pages, trusted-by, employer applications), not chrome. |
| **What was lost** | Customer lifecycle, audit reading, staff roster, feature flags, content moderation — §04 §3. |
| **Required action** | REC-007/008/013/020/021 restore the surfaces; REC-014 replaces the role switch with a capability manifest so the next reduction is impossible to make silently. |

---

### DIV-004 — Tab gating by a role switch instead of legacy's per-route permission table
**Verdict: REJECT** · Evidence: `console.tsx:81-104,137,218`; `cuba-app-shell.tsx:276,407-424`; legacy `Admin.jsx:840-960` (`RequireTabPerm` + `ROLE_PERMISSIONS` mirror at `:601-635`)

| | |
|---|---|
| **Legacy behaviour** | Every route declared the permission it required; a user reached the first tab their permissions allowed; the same table drove sidebar visibility and route access, in one place. |
| **New behaviour** | A `if (isSupport) … if (isAuditor) … else all-tabs` switch, duplicated in the shell for nav. |
| **Rationale shown in code** | The role switch carries explanatory copy ("Customer Support Suite", "Compliance & Auditor Suite") — a deliberate UX framing. It is a *presentation* decision applied to an *authorisation* problem. |
| **Intent preserved** | Partly: SUPPORT and AUDITOR genuinely get least privilege (DIV-008). Everything else gets everything, including future roles. |
| **What was lost** | Capability-derivation. Legacy's table is the artefact that made a new role or a new tab a data change; the switch makes it a code change in two places. |
| **Required action** | REC-014 — server-published capability manifest; fail closed on unknown role. Legacy's table is the migration source (it is still in the repo, `Admin.jsx:840-960`). |

---

### DIV-005 — Tenant data is delegated to the enterprise console rather than surfaced in the admin console
**Verdict: ACCEPT-CONDITIONAL** · Evidence: `frontend/src/pages/enterprise/console.tsx`, `frontend/src/components/enterprise/*`; `/api/enterprise/*`; `README` scope §3 (secondary)

| | |
|---|---|
| **Legacy behaviour** | `PlatformTenants.jsx` (2,105 ln) inside `/admin`, with cross-tenant list, detail, suspend/reactivate. |
| **New behaviour** | A separate tenant-scoped console, richer than legacy for the tenant's own admins (roles matrix, custom roles, members, billing view), but **tenant-scoped only** — it cannot list other tenants. |
| **Rationale shown in code** | The enterprise console is architected around a tenant context (`TENANT_CONTEXT_REQUIRED`, `api-client.ts:120-180`), which is the correct model for tenant administration. |
| **Intent preserved** | Yes for tenants administering themselves; **no** for platform staff administering tenants. |
| **What was lost** | The platform's view of its customers. This is the single largest capability gap in the set (RCA-014). |
| **Required action** | Keep the enterprise console as-is (it is good) and add the platform-side registry (REC-007) reusing the same backend service rather than duplicating `PlatformTenants.jsx`. |

---

### DIV-006 — No command palette inside the admin console
**Verdict: ACCEPT-CONDITIONAL** · Evidence: `cuba-app-shell.tsx` (global ⌘K); legacy `AdminCommandPalette.jsx` (239 ln) + `adminEntitySearch.js`

| | |
|---|---|
| **Legacy behaviour** | ⌘K inside `/admin` searching users, tenants, jobs, posts via `GET /api/platform/search`. |
| **New behaviour** | No palette; the global shell owns ⌘K for navigation. |
| **Rationale shown in code** | One keyboard owner for the whole application is a defensible arbitration (a second ⌘K handler would conflict). |
| **Intent preserved** | Partly: navigation is covered; **entity search is not**. `GET /api/platform/search` works (probe 200 for all four roles) and has no consumer. |
| **What was lost** | The fastest path to a specific user/tenant during an incident — the exact scenario where a control plane earns its keep. |
| **Required action** | REC-014 wires `/api/platform/search` into the shell palette as an "entities" provider, so the arbitration is kept and the capability is restored. |

---

### DIV-007 — Step-up reauthentication modal replaced by generic 401 handling
**Verdict: REJECT** · Evidence: `api-client.ts:120-180` (handles `401`/`TENANT_CONTEXT_REQUIRED` only); no `RECENT_AUTH` handler in `frontend/src`; server returns `403` (`auth.js:300-305`); legacy `AdminReauthPrompt.jsx` + `services/adminReauth.js`

| | |
|---|---|
| **Legacy behaviour** | Intercepted `403 RECENT_AUTH_REQUIRED`, paused the request, prompted (password **or** federated popup), retried after success, allowed explicit cancel (`REAUTH_CANCELLED`), supported queued waiters. |
| **New behaviour** | The `403` surfaces as a generic permission-style error; the operator must guess that re-login is required and redo the form. |
| **Rationale shown in code** | None. Nothing in `api-client.ts` mentions recent authentication (the grep returns zero hits), so this is omission rather than decision — recorded here because the *effect* is a durable behavioural divergence. |
| **Intent preserved** | No. The server control is intact and stricter than legacy; the client half was dropped. |
| **What was lost** | Every destructive action's recoverability (RCA-012). |
| **Required action** | REC-009 — port the legacy design (queue + cancel + password/popup). |

---

### DIV-008 — SUPPORT and AUDITOR tab sets hard-coded to 2 and 5 tabs
**Verdict: ACCEPT-CONDITIONAL** · Evidence: `console.tsx:81-104` vs legacy `RequireTabPerm` table (`Admin.jsx:840-960`), where SUPPORT could reach 11 tabs

| | |
|---|---|
| **Legacy behaviour** | SUPPORT reached 11 tabs subject to each tab's permission. |
| **New behaviour** | SUPPORT gets `support` + `users`; AUDITOR gets `health`, `queues`, `operations`, `users`, `security`. |
| **Rationale shown in code** | The role badges describe the reduced scope explicitly ("Customer Support Suite", "Compliance & Auditor Suite") — a deliberate least-privilege narrowing. |
| **Intent preserved** | Yes in direction (narrowing support's reach is right). No in mechanism (hard-coded, so it cannot be tuned without a deploy). |
| **What was lost** | One glaring inconsistency: AUDITOR is given `users` (personal data) but **not** the audit trail, which is the role's actual purpose (RCA-004). |
| **Required action** | REC-014 + REC-008: keep the narrowing, express it as permissions, and move `audit` into AUDITOR's set. |

---

### DIV-009 — Database & persistence-engine screen removed
**Verdict: ACCEPT** · Evidence: `[SQL-*]` (27 migrations, single MariaDB store); `platform.js:836` `GET /platform/encryption`; legacy `databaseSettings` controlled Firestore↔MySQL sync (`reference-code/backend/database/syncManager.js`, `fencing.js`)

| | |
|---|---|
| **Legacy behaviour** | A screen exposing dual-write sync, fencing tokens and tombstone repair for a Firestore+MySQL hybrid. |
| **New behaviour** | No screen; engine status is read-only via `/api/platform/encryption`; `POST /api/admin/settings/storage` returns `501` by design. |
| **Rationale shown in code** | The dual-write engine no longer exists, so its controls would be theatre. Removing them is the correct call and the `501` is honest about the remaining gap. |
| **Intent preserved** | Yes — "know the state of persistence" is met by the read-only engine view. |
| **What was lost** | Nothing of value; `CAP-034` is classified OBSOLETE. |
| **Required action** | None. Do not re-add (REC-016 must render it as "no UI — retired"). |

---

### DIV-010 — Cloud-storage provider screen removed, category refused with `501`
**Verdict: ACCEPT** · Evidence: `index.js:3852-3859` `STORAGE_PROVIDER_UNSUPPORTED`; CAP-037 OBSOLETE

| | |
|---|---|
| **Legacy behaviour** | A screen writing S3/Cloudinary credentials that the product's storage path only partially honoured. |
| **New behaviour** | The category is refused with an explicit, honest error naming the missing adapter. |
| **Rationale shown in code** | The message is a specification: "No production application-storage adapter is implemented. Configure and certify a server-side object-storage adapter before enabling this setting." |
| **Intent preserved** | Yes, and improved: a refusal that states the precondition beats a form that appears to work. |
| **What was lost** | Nothing. |
| **Required action** | None. This is the model for how an unimplemented capability should present itself. |

---

### DIV-011 — `SUPER_ADMIN` cannot be created or demoted through the API
**Verdict: ACCEPT-CONDITIONAL** · Evidence: `routes/adminUsers.js:322`, `:762`

| | |
|---|---|
| **Legacy behaviour** | Super-admin could be assigned like any role. |
| **New behaviour** | Creation and demotion are rejected; root accounts are managed out of band. |
| **Rationale shown in code** | Prevents an `ADMIN` (or a compromised admin token) from minting root. Correct instinct. |
| **Intent preserved** | Yes for safety; no for accountability — the compensating audited provisioning path was never built (RCA-010). |
| **What was lost** | Attestation: the set of root accounts is not knowable from the system of record. |
| **Required action** | REC-026 — runbook + attestation view + claims↔DB reconciliation. |

---

### DIV-012 — `optionalAuth`/`bearerTokenFrom` extraction in `security/auth.js`
**Verdict: ACCEPT** · Evidence: `[DIFF-04]`, +108 lines, no behavioural change to `requirePermission`/`requireSuperAdmin`

| | |
|---|---|
| **Legacy behaviour** | Authentication helper duplicated for optional-auth routes. |
| **New behaviour** | One extraction used by public-but-personalisable endpoints. |
| **Rationale shown in code** | Pure refactor; the permission map, `permissionsFor`, `requirePermission`, `isSuperAdmin`, `superAdminMfaEnforced` and `requireRecentAdminAuthentication` are unchanged. |
| **Intent preserved** | Yes. |
| **What was lost** | Nothing — and this is important for §02's claim: the RBAC model is unchanged, not rewritten. |
| **Required action** | None. |

---

### DIV-013 — Payment-settings read lowered from `SUPER_ADMIN` to `payments.read \| system.config.read`
**Verdict: ACCEPT** · Evidence: `platform.js:1685-1706` (explanatory comment), `:1707` (guard), `:1883` (dead duplicate with the narrower guard)

| | |
|---|---|
| **Legacy behaviour** | Only root could read payment settings, which made the Admin console's payment panel permanently empty for `ADMIN`. |
| **New behaviour** | Read at `payments.read \| system.config.read`; the projection is secret-free by construction (`publicPaymentSettings()` masks to `••••last4`, exposes only public client identifiers). Write remains `SUPER_ADMIN` + MFA + recent auth. |
| **Rationale shown in code** | The comment states the forensic finding explicitly: the super-admin gate "never actually restricted access — it only made the canonical route unreachable for the Admin console". |
| **Intent preserved** | Yes, and the read/write asymmetry is deliberate and documented. |
| **What was lost** | Nothing. Note: the *dead* duplicate at `:1883` carries the old narrower guard — delete it (REC-017) so the record is unambiguous. |
| **Required action** | REC-017 only. |

---

### DIV-014 — Deployment-owned infrastructure settings are read-only in the UI and rejected by the API
**Verdict: ACCEPT** · Evidence: `index.js:3848-3851` `403 INFRASTRUCTURE_SETTING_READ_ONLY` for `exportPdf.websiteDomain`/`backendExportUrl`/`chromiumPath`; `index.js:4853` `409 INFRASTRUCTURE_SECRET_CANNOT_CLEAR` for Twilio when env-managed

| | |
|---|---|
| **Legacy behaviour** | Editable free-text fields for render origin, Chromium path and provider credentials. |
| **New behaviour** | Refused with a message naming the owner ("deployment configuration"). |
| **Rationale shown in code** | A value that must match the container filesystem cannot be safely edited from a browser; the guard is explicit per field, not blanket. |
| **Intent preserved** | Yes — and it removes a whole class of "saved successfully but broke export" incidents. |
| **What was lost** | Nothing an operator should have had. |
| **Required action** | None. Extend the same principle per §09. |

---

### DIV-015 — Audit write is transactional in the settings path but best-effort in the generic middleware
**Verdict: ACCEPT-CONDITIONAL (one half is a defect)** · Evidence: `index.js:3956-3964` (in-transaction insert) vs `security/adminAudit.js:194-196` (failure swallowed)

| | |
|---|---|
| **Legacy behaviour** | Best-effort everywhere. |
| **New behaviour** | Two regimes: transactional for generic settings writes; best-effort for the middleware; **absent** for `adminPlatformOperations.js` and `index.js` handlers. |
| **Rationale shown in code** | The settings comment states the intent correctly ("the revision guard and audit are enforced in the same row-locked transaction"). The middleware was left as inherited. |
| **Intent preserved** | Half. The transactional regime is a genuine improvement; the mixture means an auditor cannot state a single guarantee. |
| **What was lost** | A uniform answer to "is every admin action recorded?" — and RCA-022 shows it is not. |
| **Required action** | REC-015 — extend the transactional regime to all state-changing handlers; make audit failure fail the request; log-and-count for sensitive reads. |

---

### DIV-016 — AI settings consolidated into an 11-module nested console
**Verdict: ACCEPT-CONDITIONAL** · Evidence: `frontend/src/components/admin/ai-settings/{providers,quotas,discovery,gateway,playground,metrics,layout,context,hooks,types,utils}`; ~3,000 LOC vs legacy `adminAiSettings.js` service + one screen

| | |
|---|---|
| **Legacy behaviour** | One settings screen plus a service module for provider keys and quotas. |
| **New behaviour** | Provider orchestration, quota governance, model discovery, gateway routing, a playground and metrics — with real server contracts (`adminAiEntitlement.js`, `aiGovernance.js`). |
| **Rationale shown in code** | The domain genuinely needs it: quotas are per-plan with server-enforced bounds (1–100,000/day; 256–32,768 tokens), discovery is provider-specific, and the playground is a diagnostic tool. |
| **Intent preserved** | Yes, and expanded. This is the strongest new-build surface (§05 SW-05). |
| **What was lost** | Governance of *who* may rotate provider keys and *what* record exists when they do (REC-015). The surface is over-built relative to its audit story, not relative to its function. |
| **Required action** | REC-015 (audit) + REC-005 (authority for key rotation). Do not reduce the surface. |

---

### DIV-017 — Secrets are never returned to the browser; only masked markers are
**Verdict: ACCEPT** · Evidence: `publicAdminSettings` (`index.js:3750-3782`), `isPrivateAdminSettingKey` (`:3658-3664`), `preserveAdminSettingSecrets` (`:3666-3713`), `applyExplicitAdminSecretClears`/`materializeAdminSecretDeletes` (`:3690-3718`), `publicPaymentSettings()` masking

| | |
|---|---|
| **Legacy behaviour** | Several screens returned stored secrets to the browser for display. |
| **New behaviour** | Secrets are stripped from every browser projection; a submitted blank means "keep existing"; explicit clearing requires `clearSecrets` and recent auth; deletes are materialised only at write time. |
| **Rationale shown in code** | The mechanism is deliberate and well-commented ("A private marker survives the merge and is removed by the pure materializer immediately before the MariaDB JSON document is written"). |
| **Intent preserved** | Yes, and this is the correct model. |
| **What was lost** | Nothing — but note the dependency: classification is by **field name**, so an invented name (e.g. `twilioToken`, RCA-013) silently loses protection. The model is right; its input needs validating. |
| **Required action** | REC-012 — add a test that walks every settings category and asserts no projected key matches `/(secret\|token\|password\|keySecret)/i`. |

---

### DIV-018 — Two RBAC models: tenant roles are data, platform roles are code
**Verdict: REJECT (for the platform half)** · Evidence: `backend/enterprise/constants.js:18-66` + `mysqlTenantRegistry.js` (`customRoles` JSON column) + `routes/enterprise.js` (`/roles-matrix`, `SIMULATED_ENTERPRISE_ROLES`) vs `security/auth.js:63-88` frozen literal

| | |
|---|---|
| **Legacy behaviour** | Platform roles hard-coded; tenant roles hard-coded. |
| **New behaviour** | Tenant roles became configurable data with a resource×action matrix and tenant-defined custom roles; platform roles stayed a frozen literal. |
| **Rationale shown in code** | The tenant model was rebuilt because enterprise customers demanded configurable permissions. No rationale exists for leaving the platform model frozen — it was simply not in scope. |
| **Intent preserved** | Yes for tenants; **no** for the platform, where INV-3 requires exactly the model that now exists one layer down. |
| **What was lost** | Platform role configurability (INV-3), and a single consistent RBAC concept across the product. |
| **Required action** | REC-005 — lift the tenant pattern (`admin_roles`, `admin_role_permissions(resource, action)`, `manage ⊃ write ⊃ read`, audited bypass) to the platform plane; seed from the literal. |

---

## 2. Divergences that are *not* in this register

For completeness, changes that a reviewer might expect to find here but that are defects, not decisions — each is handled in §06:

| Change | Why it is not a divergence | Where it lives |
|---|---|---|
| Fixture-first rendering in 12 tabs | No decision, no rationale, no comment claiming it; it is an idiom that produces false state | RCA-001 |
| Success-on-failure mutations | Same | RCA-002 |
| 12 legacy routes with no successor | Silent; no mapping, no note (DIV-003 is the *pattern*; the individual losses are defects) | RCA-014, RCA-015, REC-007/008/013/020/021 |
| 8 unassigned permissions | Inherited, not decided | RCA-007 (LD-03) |
| Client-only role-view simulation | Rebuilt without re-deriving its authority model | RCA-021 |

---

*Cross-references: capability intent §03 · coverage §04 · root causes §06 · invariants §08 · recommendations §10.*
