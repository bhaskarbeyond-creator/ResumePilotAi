# 05 — SWOT Analysis (evidence-backed)

**Rule applied in this document:** an item appears only if it is bound to a citation — a CAP from §03, an RCA from §06, a `file:line`, a `[PROBE-nnn]`, or a `[SQL-nnn]`. Every row carries an *implication* and a *mapping*, so nothing here is an opinion that cannot be acted on. The SWOT is about the **admin control plane**, not the product as a whole.

Counts: **SW-01…SW-24** — Strengths 6, Weaknesses 9, Opportunities 5, Threats 4.

---

## 1. Strengths

| ID | Strength | Evidence | Implication | Maps to |
|---|---|---|---|---|
| **SW-01** | The health/telemetry subsystem is real and correctly role-projected server-side | `backend/services/platformHealth.js` (793 ln) probes 28 services; `GET /api/platform/operational-status` (`platform.js:287`); non-super responses have `host`, `pid`, `rssMb`, `heapUsedMb`, `loadAverage1m`, `executablePathConfigured` **deleted** by `projectSnapshotForRole` (`platform.js:271-286`) | This is the only admin subsystem where the word "live" is earned — and the client mis-reads it (`AdminHealthTab.tsx:526-551` indexes an array as a map, RCA-003), so the tab displays fixtures. The server is the asset; the client is the defect. The pattern to replicate everywhere is the server's: project by role, never infer | CAP-002, REC-001 |
| **SW-02** | The generic settings write path is the best-engineered control-plane write in the repository | `index.js:3843-3978`: category allowlist (`:3555`), payload size cap (`:3875`), per-category normalisers (`:3879-3882`), `SELECT … FOR UPDATE` (`:3895`), `expectedRevision` mandatory (`:3885-3892`), revision-drift detection between admin/public roots (`:3900-3906`), secret preservation/clear materialisation (`:3666-3713`), audit row written **inside the transaction** (`:3956-3964`) | The pattern to reuse for every other write. The irony is that 4 of 5 console panels do not use it correctly (RCA-013) — the server is ahead of the client | CAP-029…052, REC-012 |
| **SW-03** | Step-up (recent-authentication) enforcement is strict and fails closed | `auth.js:265-306` requires MFA claim + `auth_time` freshness + production failure is a denial, not a bypass; applied to 15 mutation routes (Appendix A.1) | A genuine security improvement over legacy, which enforced step-up only in the client (`src/services/adminReauth.js`) | INV-6 support, REC-009 |
| **SW-04** | Tenant RBAC already implements the model the platform plane needs | `backend/enterprise/constants.js:18-66` (7 named role bundles, permission whitelist); `tenantPolicy.js`; `normalizeCustomRoles` + `customRoles` column in `mysqlTenantRegistry.js`; `GET /roles-matrix` (`routes/enterprise.js`) | REC-005 does not require invention — the exact resource×action model with tenant-defined roles exists one layer down and can be lifted | INV-3, REC-005 |
| **SW-05** | AI governance is a substantive capability, not a stub | `adminAiEntitlement.js` (`DEFAULT_GLOBAL_QUOTAS`, bounds 1–100,000 daily / 256–32,768 tokens per request, `:105-108,207-211`), `aiGovernance.js:37-38` (`DEFAULT_BASIC_DAILY_LIMIT=10`, `DEFAULT_ENTERPRISE_DAILY_LIMIT=5000`), 19 admin AI routes, `ai-settings/**` 11-module UI | The strongest *new-build* surface in the set; the review's AI findings are about audit/authority, not about missing function | CAP-038, REC-015 |
| **SW-06** | Legacy's own design reasoning survives in the repository as an audit asset | `src/components/admin/Admin.jsx:560-700` documents *why* permission-derived tab gating exists, the role-bundle mirror, `FIRST_ACCESSIBLE_TAB`, and the DIR-011/DIR-012 decisions | When the new console's role switch (DIV-004) is challenged, the counter-argument is in the repository with reasons, not in a Slack thread | DIV-004, REC-014 |

---

## 2. Weaknesses

| ID | Weakness | Evidence | Implication | Maps to |
|---|---|---|---|---|
| **SW-07** | Fabricated data is rendered as platform truth in 12 of 14 tabs | `DEFAULT_USERS`, `INITIAL_EVENTS`, `DEFAULT_TICKETS`, `DEFAULT_28_SERVICES`, `INTIAL_ITEMS`, card fallbacks `'48,290'`/`'184.2 GB'` (`AdminDashboardTab.tsx:40-47`) with the "keep baseline on empty/error" guard (`AdminUsersTab.tsx:174-183`) | An operator cannot distinguish "no incidents" from "the console could not ask". This is the single most dangerous property in the set | RCA-001, REC-001 |
| **SW-08** | Mutations report success after failing | 14 `.catch(() => {})` sites; 10 call non-existent routes; a password-reset link is **minted client-side** (`AdminUsersTab.tsx:260-281`) when the request fails | A control plane that lies about state changes is worse than no control plane | RCA-002, RCA-003, REC-002 |
| **SW-09** | Authorisation is decided by two engines that disagree | `enforceApiPolicy` path-string tables (`policy.js:3-101`) **plus** per-route `requirePermission`/`requireSuperAdmin`; 61 routes guarded, 24 inline, **60 policy-only**; the same path resolves to `system.config.read` by default (`policy.js:79`) | Whether a route is protected depends on which layer a developer happened to use; audits of "is X protected?" have no single answer | RCA-007, RCA-008, REC-006 |
| **SW-10** | Eight permission strings are required by code and granted to no role | `system.config.read`, `secrets.manage`, `users.export`, `users.security.manage`, `payments.write`, `system.config.manage`, `messages.read`, `tenant.support.access` (Appendix A.2; `auth.js:63-88`) | `ADMIN` holds `system.config.write` but not `.read` — the action hierarchy (INV-3) is violated in the frozen literal itself, and the read routes that need it are super-admin-only as a side effect | RCA-007, LD-03, REC-005 |
| **SW-11** | The platform role model is code, not configuration | `PERMISSIONS` frozen literal, `backend/security/auth.js:63-88`, byte-identical to legacy; no `admin_roles`/`admin_role_permissions` table in any of the 27 migrations (`[SQL-001]`…`[SQL-027]`) | Changing what an `ADMIN` may do requires a deploy + review, which in practice means it never happens; INV-3 cannot be satisfied | RCA-009, INV-3, REC-005 |
| **SW-12** | Authority includes an arbitrary per-user `permissions` claim | `permissionsFor` union (`auth.js:190-197`) — role bundle **plus** whatever `permissions` array the identity provider asserts; legacy defect LD-05 reproduced | A token with `permissions:['*']` outranks the role model with no database record and no audit | RCA-009, REC-005 |
| **SW-13** | The audit trail has no reader, and its records lack before/after | `GET /api/admin/audit-logs` exists but no tab consumes it; `createAdminAuditMiddleware` writes `{actor, action, target, metadata}` with **no** before/after (`security/adminAudit.js:110-205`); settings writes record only `{category, revision, changedFields}` (`index.js:3945-3965`) | INV-6 ("configuration changes audited with actor, timestamp, before/after, scope") is **not met**; post-incident reconstruction is impossible for value changes | RCA-004, RCA-016, RCA-022, INV-6 |
| **SW-14** | Configuration capability is claimed but not wired | 18 module toggles: 2 gate behaviour, 2 are health-report display strings, 1 is a field-name collision, **13 are inert**, and none has any other frontend consumer (Appendix A.7); `integrations` panel writes keys `platformHealth.js` never reads (`googleMapsKey` vs `googleMapsApiKey`); Twilio configured through a category the server ignores | The console's "Instant Global Propagation" caption (`AdminSettingsTab.tsx:484`) is false for 14 of 18 switches — trust erosion with operational consequences | RCA-011, RCA-013, REC-010, REC-012 |
| **SW-15** | 27 of 59 legacy capabilities have no surface, including customer lifecycle | No `tenants` tab (`console.tsx:50-66`) while `GET /platform/tenants` (`enterprise.js:608`) works; no audit, operators, feature flags, jobs, companies, reviews, pages | The console cannot run the business on a bad day: the levers used during an incident (flags, tenant suspend, audit) are exactly the missing ones | RCA-014, RCA-015, REC-007, REC-008, REC-013 |

---

## 3. Opportunities

| ID | Opportunity | Evidence | Implication | Maps to |
|---|---|---|---|---|
| **SW-16** | Nine working backends are one thin UI away from coverage | CAP-006 (`enterprise.js:608-630`), CAP-007 (`/api/admin/audit-logs`), CAP-013 (`platform.js:1304-1440`), CAP-015 (`platform.js:921`), CAP-018/019/020 (`index.js` PATCH routes), CAP-022/023 (`pages`, `reviews`), CAP-049 (`platform.js:1637-1665`) — all probe-reachable | The gap between "46 % missing" and "coverage" is small in engineering terms; the expensive work (data + authorisation + audit) is already done | REC-007, REC-008, REC-013, REC-020, REC-021 |
| **SW-17** | The tenant model can be lifted one layer to satisfy INV-3 in a single change | `constants.js:18-66` + `tenantPolicy.js` + `customRoles` | One migration + one resolver replaces the frozen literal and makes `ADMIN` configurable without a deploy | REC-005 |
| **SW-18** | The settings transaction already produces everything an audit needs — except the snapshot | `currentCategory` is loaded inside the same `FOR UPDATE` txn (`index.js:3893-3908`) and `persisted` is computed before write (`:3920-3924`) | Adding `before`/`after` to the audit insert is a ~20-line change in code that is already transactional: the cheapest high-value fix in the set | REC-015, INV-6 |
| **SW-19** | The certification harness exists and can be extended to assert the invariants | Root `package.json` → `certify:admin` (`scripts/verify-admin-superadmin-live.mjs`), `certify:crud`, `inventory:api` (`scripts/generate-api-inventory.mjs`) | The six invariants can become a CI gate instead of a review checklist; regression becomes mechanically detectable | REC-023, REC-024 |
| **SW-20** | Legacy's reasoning is available as specification without being a contract | `Admin.jsx:560-700` (route→permission table, role bundle mirror, `FIRST_ACCESSIBLE_TAB`), `AdminReauthPrompt.jsx` (queued waiter design), `sidebar.jsx:68-111` (31 screens with gates) | Design intent can be consulted for *why*, while each behaviour is re-judged on merit — the exact posture §02 sets out | REC-009, REC-014 |

---

## 4. Threats

| ID | Threat | Evidence | Implication | Maps to |
|---|---|---|---|---|
| **SW-21** | An `ADMIN` can strip MFA from a `SUPER_ADMIN` with no step-up and no privilege ceiling | `POST /api/admin/users/:id/unenroll-mfa` reachable by `ADMIN` `[PROBE-004]` (500 stub, therefore authorised); no target-role comparison in the handler (`adminUsers.js`) | The account-takeover chain is: ADMIN strips SA's second factor → change/reset credentials → assume root. The first link is live today | RCA-005, REC-004 |
| **SW-22** | The client is the only place role → tab mapping exists, and it defaults permissive | `console.tsx:81-104` role switch; `cuba-app-shell.tsx:276,407-424` renders all 13 nav items unconditionally; `AdminUsersTab` derives capability from an uppercased role string | Any new tab silently inherits access for every role that reaches the shell; there is no server-published capability manifest to check against | RCA-019, DIV-004, REC-014 |
| **SW-23** | The backend is legacy, so every unpatched legacy weakness is live | `diff` results: `adminUsers.js` 0 lines, `adminAudit.js` 0, `security/adminAudit.js` 0; `security/auth.js` differs only by the `optionalAuth` refactor (DIR-071); `policy.js` differs by 46 lines | "The backend is fine, it's the frontend that regressed" is empirically false: the RBAC literal, the missing `system.config.read` grant and the best-effort audit write are all inherited | §02 RIFF-01…DIFF-09, INTENT-01 |
| **SW-24** | Configuration gaps are silent by construction | Rate limits env-only (`index.js:381-411`); `system.config.manage` granted to nobody; 8 required-but-unassigned permissions; probes report "not configured" for keys that are configured (`platformHealth.js:488-497`) | A missing control looks identical to a control that is set correctly and to one that is set wrongly. Nothing alerts, because nothing knows the difference | REC-016, REC-025, CFG-004 |

---

## 5. Synthesis

**The pattern.** The new control plane is strong where the work was *infrastructural* (telemetry, settings transaction, step-up, AI governance) and weak where the work was *contractual* — binding a UI to an API and telling the truth about the result. Fourteen tabs were written against an imagined backend: routes that do not exist, categories the server rejects, field names nothing reads, and a `catch {}` in place of a state machine.

**The asymmetry that decides sequencing.** The cheapest fixes are the highest-consequence ones: a privilege ceiling on five handlers (SW-21, ~150 lines), a before/after audit snapshot (SW-18, ~20 lines), and an honest failure path (SW-08, mechanical). The expensive fixes are coverage breadth (SW-15) — but nine of those are thin-UI work against working backends (SW-16). Nothing in this list requires re-architecting the backend, because for the admin plane the backend already exists.

**What must not be traded away.** SW-01, SW-02, SW-03 and SW-05 are the mature parts. A remediation programme that rewrites the settings path or the health service to make the console uniform would destroy the only verified work in the set; §10 constrains every recommendation accordingly.

---

*Cross-references: capabilities §03/§04 · root causes §06 · divergences §07 · invariants §08 · configuration §09 · recommendations §10.*
