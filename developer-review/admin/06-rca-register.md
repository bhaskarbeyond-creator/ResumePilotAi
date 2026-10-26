# 06 — Root-Cause Analysis Register

**Scope.** Every defect class found in the deliverable, with the same seven fields. A row is only listed here if the symptom was reproduced by execution (`[PROBE]`), by byte-level comparison (`[DIFF]`), or by a citation that cannot be read another way. Severity uses the scale in §README-7. Confidence uses C3/C2/C1 from §README-4.

**Summary**

| Severity | Count | IDs |
|---|---|---|
| **Critical** | 6 | RCA-001, RCA-002, RCA-003, RCA-004, RCA-005, RCA-006 |
| **High** | 11 | RCA-007, RCA-008, RCA-009, RCA-010, RCA-011, RCA-012, RCA-013, RCA-014, RCA-015, RCA-021, RCA-022 |
| **Medium** | 3 | RCA-016, RCA-017, RCA-019 |
| **Low** | 2 | RCA-018, RCA-020 |
| **Total** | **22** | |

**Why five of the six Critical findings are Critical.** They share one property: the operator is given a false belief about the state of the platform or about the effect of their own action. In a control plane, a false belief is the defect — not the underlying 404, and not the missing tab.

---

## RCA-001 — The console renders fabricated data as live platform state

**Severity:** Critical · **Confidence:** C3 (fixtures cited byte-exactly; loader guards cited; `[PROBE-002]` shows the real endpoint returning an empty collection)

| Field | Content |
|---|---|
| **Symptom** | Twelve of fourteen admin tabs seed React state from hard-coded constants and keep those constants when the real response is empty or fails. The dashboard shows `12,450` users, `3,420` revenue, `14.2 GB` storage; the users tab shows four named fictional people, one of them a `SUPER_ADMIN` owned by "Northwind Careers"; security shows four fabricated attack events; queues shows a `DEAD_LETTER` count of `1` even when the outbox is empty. |
| **Evidence & reproduction** | `AdminDashboardTab.tsx:40-47` (card fallbacks `'48,290'`, `'14,820'`, `'102,450'`, `'28,190'`, `'420,910'`, `'184.2 GB'` and numeric fallbacks `12450/3420/48900/15720/89200`) fed by `usePlatformStats` (`use-api-hooks.ts:326-346`); `AdminUsersTab.tsx:174-183` (`if (res?.users?.length > 0) setUsers(res.users)` + `catch { /* Keep baseline */ }`); `AdminSecurityTab.tsx:159,177,181`; `AdminContentMarketingTab.tsx:66-111`; `AdminAttentionTab.tsx:79`; `AdminModerationTab.tsx:116-118`; `AdminBlogManagementTab.tsx:86`; `AdminQueuesTab.tsx:114-115,237`; `AdminHealthTab.tsx:50,508`; `AdminHelpDeskTab.tsx:117`; `AdminOperationsTab.tsx:48-52`. `[PROBE-002]`: `GET /api/admin/users` → `200 {"success":true,"users":[]}` on a clean install; the tab renders four users anyway. |
| **Mechanism (root cause)** | A single defensive idiom — *"never show an empty screen"* — was applied uniformly, which converts three distinct states (loading, empty, error) into one state (populated). The idiom is written three ways in the codebase (`if (len>0) setX`, `} catch {}`, `data.x \|\| FALLBACK`) so no single wrapper can be repaired; each tab must be converted separately. It is not a rendering bug: the fixture is the *initial* state, so the false value is on screen before any request completes. |
| **Blast radius** | All 12 tabs listed above; every operator decision taken from them. Concretely: incident triage (attention/security), customer support (users/help desk), capacity decisions (dashboard/queues), and any audit statement made from the console. |
| **Required modification** | **REC-001** — delete every fixture constant; introduce one `<AdminDataSurface>` that takes `{status, data, error}` and renders `loading \| empty \| error \| live` with a visible provenance tag; the wrapper makes it impossible to render data without a provenance value. |
| **Risk of the fix** | Low code risk, real product risk: honest empty states will look "worse" than the current fabricated dashboards, and stakeholders may read the change as a regression. Mitigation: ship with a provenance chip (`LIVE` / `EMPTY` / `UNAVAILABLE`) so the improvement is visible. |
| **Verification** | `grep -c "DEFAULT_USERS\|INITIAL_EVENTS\|DEFAULT_TICKETS\|DEFAULT_28_SERVICES" frontend/src/components/admin/*.tsx` → `0`. New test: for each tab, stub the loader to reject and assert the rendered DOM contains an error state and **no** numeric KPI. |

---

## RCA-002 — Mutations report success after failing

**Severity:** Critical · **Confidence:** C3 (14 `.catch(() => {})` sites; `[PROBE-003]` shows the target routes returning `404`)

| Field | Content |
|---|---|
| **Symptom** | Operator actions show a success toast, and local state is updated optimistically, regardless of the HTTP result. Suspend user, purge caches, run backup, approve employer, delete article, reply to a ticket, retry a DLQ job — all report success. One action (copy password-reset link) mints a **fabricated** `?reset_token=sec_rst_<timestamp>` URL client-side when the request fails. |
| **Evidence & reproduction** | `AdminUsersTab.tsx:203-225` (suspend), `:260-281` (reset link fabrication); `AdminOperationsTab.tsx:118-145` (backup, cache-clear); `AdminModerationTab.tsx:150-160`; `AdminBlogManagementTab.tsx:126-134`; `AdminQueuesTab.tsx:173-208,262,285`; `AdminHelpDeskTab.tsx:157-175` (reply appended after a swallowed failure). `[PROBE-003]`: `POST /api/admin/users/:uid/status`, `POST /api/admin/operations/{backup,cache-clear}`, `POST /api/admin/employer-applications/:id/verify`, `DELETE /api/blog/posts/:id`, `POST /api/admin/queues/dead-letter-queue/{retry,purge}` → **404** for every role including `SUPER_ADMIN`. |
| **Mechanism (root cause)** | `.catch(() => {})` was used as an error-suppression idiom to keep demo flows smooth, and the success path was written *after* the `await` without inspecting a result. Because 10 of those 14 calls target routes that do not exist, the `catch` is not handling an edge case — it is the normal path. The reset-link case is a distinct, worse subclass: the failure branch *fabricates* a credential-shaped artefact (`sec_rst_…`) that has no server record, so the operator may hand a user a link that cannot work and believe the reset was issued. |
| **Blast radius** | Every mutating control in the console; all roles. Highest-consequence instances: account suspension (a compromised account stays live while the operator believes it is disabled) and password reset (user is told a reset was issued; none was). |
| **Required modification** | **REC-002** — delete all 14 suppression sites; introduce `mutate()` in the api client that either returns `2xx` data or throws a typed error; update state only from the response; remove the client-side reset-link minting. |
| **Risk of the fix** | Medium: 10 of the mutations will now *always* fail loudly until **REC-003** lands, which will expose a visibly broken console for the duration of that window. Sequence REC-002 and REC-003 in the same sprint (they are the same work viewed from two ends). |
| **Verification** | `grep -c "catch(() => {})" frontend/src/components/admin/*.tsx` → `0`. Test per mutation: stub `500` → assert error toast, no state change, no success string. Test for the reset link: assert the clipboard is untouched on failure. |

---

## RCA-003 — The console was written against an imagined API: 13 non-existent paths and (at least) 3 response-shape mismatches

**Severity:** Critical · **Confidence:** C3 (`[PROBE-003]` 404s; Appendix A.5 mapping)

| Field | Content |
|---|---|
| **Symptom** | Two halves of one mistake. (a) **Paths**: thirteen distinct paths used by the console (15 call sites) are not registered in the Express app. (b) **Shapes**: three surfaces call a *correct* path but parse the response as if it had a different structure — health (`services` is an array, read as a map), email (`settings.smtp.*`, read as flat `settings.*`), and, consequently, every fixture that survives because the parse yields nothing. |
| **Evidence & reproduction** | Paths: full table in **Appendix A.5**. Shapes: `AdminHealthTab.tsx:526-551` (`Record<string,any>` + `services?.[s.id]`) vs `platformHealth.js:675` (`services` array, items carry `state`); `AdminEmailSmtpTab.tsx:75-81` (`{...settingsData.settings}`) vs `routes/email.js:1665-1671` (`settings.smtp`, `settings.imap`). In both cases the client's `catch`/empty-guard keeps the fixture, so the mismatch is invisible to the operator. `[PROBE-002]` confirms the endpoints themselves are healthy. Headline: `POST /api/admin/users/:uid/status`, `POST /api/admin/queues/dead-letter-queue/{retry,purge}`, `POST /api/admin/operations/{backup,cache-clear}`, `POST /api/admin/employer-applications/:id/verify`, `POST /api/admin/jobs/:id/moderate`, `DELETE /api/blog/posts/:id`, `GET /api/admin/dashboard`, `/api/admin/tenants`, `/api/platform/tenants`, `/api/admin/queues`, `GET /api/blog/posts`. Each returns `404 NOT_FOUND` — not `403` — for `SUPER_ADMIN`. |
| **Mechanism (root cause)** | The console was written from a *mental model* of the API rather than from the registered routes and response contracts. Paths were recalled from legacy naming (`/blog/posts` vs `/api/blog-data`; `/api/platform/tenants` vs `/api/enterprise/platform/tenants`); response shapes were assumed (`settings` flat, `services` keyed). Because every loader tolerates a miss (RCA-001's idiom), no mismatch ever surfaces as an error — the UI silently falls back to a fixture that looks plausible. There is no shared type between client and server (`frontend/src` has hand-written interfaces, none generated from the Express handlers), which is why both halves happened at once. |
| **Blast radius** | 13 console operations across 7 tabs, plus the three highest-value read surfaces (health, email, security) which show fixtures because of shape or absence of a loader; every affected write also produces a false success (RCA-002). |
| **Required modification** | **REC-003** — remap each path per Appendix A.5; add response readers keyed to the server's actual shape (health by `id`/`state`, email via `settings.smtp`); add a **contract test** in two parts: (i) every call string resolves to a registered route; (ii) every documented response shape is asserted against a live handler (supertest + schema). The second part is what prevents this class from recurring. |
| **Risk of the fix** | Low. Two remaps are not 1:1 (`/admin/dashboard` → `/platform/command-center`; DLQ retry → `/platform/queues/retry`, which takes `jobId` not `queue/state`), so the UI payloads change. |
| **Verification** | New CI job `npm run certify:contracts` (REC-023): route-resolution test over all FE call strings → 0 unresolved. Manual: each of the 10 operations returns a non-404 for `SUPER_ADMIN` in a live environment. |

---

## RCA-004 — The roles designed to read the audit trail cannot reach it, and no tab exists

**Severity:** Critical · **Confidence:** C3 (`[PROBE-002]`: `/api/admin/audit-logs` → `403` for `ADMIN`, `200` for `SUPER_ADMIN`; `console.tsx:50-66` has no audit tab)

| Field | Content |
|---|---|
| **Symptom** | `AUDITOR` — the role whose entire purpose is independent review — and `ADMIN` are denied `GET /api/admin/audit-logs`. The console has no tab bound to it for any role. `use-api-hooks.ts:442` defines an audit-log hook that nothing consumes. |
| **Evidence & reproduction** | `backend/security/policy.js:79` resolves unmatched admin reads to `system.config.read`; `auth.js:63-88` grants `system.config.read` to **no role**. `[PROBE-002]`: `/api/admin/audit-logs` → 403 for SUPPORT/AUDITOR/ADMIN, 200 for SUPER_ADMIN. `AUDITOR` holds `audit.read` (`auth.js:78`) — a permission that grants access to nothing, because the route path never resolves to it. |
| **Mechanism (root cause)** | Two authorisers (RCA-008) mean a route's effective permission is decided by the **path string**, not by the handler's intent. `/api/admin/audit-logs` is not in `ADMIN_EXACT` (`policy.js:9-53`), so it falls to the default `system.config.read` — a permission the vocabulary defines but no role carries. The `audit.read` grant is therefore decorative, and the audit trail becomes super-admin-only by accident. |
| **Blast radius** | INV-6 (auditability) and the segregation-of-duties principle for the whole platform: without an independent reader, every other admin action is unattested. Also blocks compliance reporting entirely. |
| **Required modification** | **REC-008** (tab + hook wiring) and **REC-006** (declare `/api/admin/audit-logs*` → `audit:read` in the route→(resource,action) manifest, granted to AUDITOR, ADMIN, SUPER_ADMIN). |
| **Risk of the fix** | Low. Granting `audit.read` widens AUDITOR's view of admin activity — which is the role's stated purpose; no personal-data field in `admin_audit_logs` is excluded today, so REC-015 should confirm redaction policy. |
| **Verification** | `[PROBE-002]` re-run must show `200` for AUDITOR and ADMIN on `GET /api/admin/audit-logs` and `200` for AUDITOR on `/audit-logs/stats`. UI: acting as AUDITOR, the Audit tab lists ≥1 row after an admin action. |

---

## RCA-005 — An `ADMIN` can remove MFA from a `SUPER_ADMIN` (no target-privilege ceiling, no step-up)

**Severity:** Critical · **Confidence:** C3 (`[PROBE-004]`: reachable by ADMIN, 500 stub ⇒ authorisation passed; no `requireRecentAdminAuthentication` on the route)

| Field | Content |
|---|---|
| **Symptom** | `POST /api/admin/users/:id/unenroll-mfa` is reachable by `ADMIN` and does not require recent authentication. The handler does not compare the caller's role with the target's role, so an `ADMIN` can clear the second factor of the `SUPER_ADMIN` account. |
| **Evidence & reproduction** | `[PROBE-004]`: `POST /api/admin/users/<sa-uid>/unenroll-mfa` as `ADMIN` → `500 app/invalid-credential` (Firebase absent in the sandbox) — i.e. the request passed authorisation and reached the identity mutation. Compare `POST /api/admin/delete-user` and `/payments/refund`, which are `SUPER_ADMIN`-only (`403` for ADMIN) — the inconsistency is visible within the same probe run. Handler: `backend/routes/adminUsers.js` (0-line diff from legacy, `[DIFF-03]`), no `assertCanActOnTarget`, no `requireRecentAdminAuthentication`. |
| **Mechanism (root cause)** | User-mutating handlers are guarded by *"is the caller an admin?"* only. There is no *"may this admin act on this target?"* concept anywhere in the codebase — the two-level model (role of caller, role of target) was never implemented, and legacy did not have it either (so this is an inherited hole, not a rewrite regression). Missing step-up compounds it: MFA removal is exactly the class of action INV-6's recent-auth control exists for. |
| **Blast radius** | Account-takeover chain: `ADMIN` strips SA's TOTP → SA's account is now single-factor → credential reset/impersonation becomes feasible → root. Also allows any admin to silently downgrade a peer's security posture. |
| **Required modification** | **REC-004** — one guard `assertCanActOnTarget(caller, target, operation)` returning `403 TARGET_OUTRANKS_CALLER`, applied to `unenroll-mfa`, `revoke-sessions`, `send-password-reset`, `ai-entitlement`, `PATCH /:uid`, `delete-user`; plus `requireRecentAdminAuthentication` on `unenroll-mfa`. |
| **Risk of the fix** | Low. Behaviour change: admins lose the ability to help a locked-out super-admin. That is intentional; the break-glass path is §11 RR-003 (requires an explicit, audited decision). |
| **Verification** | `[PROBE-004]` must change from `500` to `403 TARGET_OUTRANKS_CALLER` when caller=`ADMIN`, target=`SUPER_ADMIN`; `200/500` when both are `ADMIN`; and a fresh-auth requirement (`401 RECENT_AUTH_REQUIRED`) when the token is older than the freshness window. Four-case table in Appendix A.3. |

---

## RCA-006 — No privilege ceiling on the remaining user-mutating handlers

**Severity:** Critical · **Confidence:** C2 (code reading of `adminUsers.js`; the same authorisation shape as RCA-005, which was executed)

| Field | Content |
|---|---|
| **Symptom** | The same missing check applies to role assignment (`PATCH /api/admin/users/:uid` with `role`), password reset issuance (`send-password-reset`), session revocation (`revoke-sessions`) and AI-entitlement adjustment. An `ADMIN` can set another account's role, issue a reset link for a super-admin, or revoke a super-admin's sessions. |
| **Evidence & reproduction** | `backend/routes/adminUsers.js` — handlers for `PATCH /:uid`, `send-password-reset`, `revoke-sessions`, `ai-entitlement` (0-line diff vs legacy, `[DIFF-03]`); `[PROBE-002]` shows all four reachable by `ADMIN` (`200`/`400`, never `403`). Guard set on `/api/admin/*` mutations is `requireAdmin` + path-policy only (`policy.js:82-101`), with no per-target evaluation. |
| **Mechanism (root cause)** | Same as RCA-005: authorisation is evaluated on the *caller's* credential and the *path*, never on the *(caller, target)* pair. `PATCH /:uid` accepts a body `role` and validates it against the role vocabulary but not against the caller's rank; there is no rank ordering defined for roles at all, which is why the check could not have been written in one place. |
| **Blast radius** | Privilege escalation without touching MFA: `ADMIN` sets a second account (or their own) to `SUPER_ADMIN` if the target-role rule is only "valid role"; and lateral disruption (revoke a super-admin's sessions during an incident). |
| **Required modification** | **REC-004** (same guard, same PR as RCA-005). Requires a **role rank function** in `backend/security/auth.js` (`SUPER_ADMIN > ADMIN > AUDITOR/SUPPORT > …`) — the single artefact that does not exist today. |
| **Risk of the fix** | Medium: introducing rank ordering changes who may edit whom. `AUDITOR` and `SUPPORT` must remain non-mutating (they are today); `ADMIN`→`ADMIN` must remain allowed (peer support). |
| **Verification** | Matrix test over `{SUPER_ADMIN, ADMIN, AUDITOR, SUPPORT} × {SUPER_ADMIN, ADMIN}` targets for the five handlers → 32 assertions, all `403` where the target outranks the caller. Recorded in Appendix A.3 as the target-privilege table. |

---

## RCA-007 — Eight permission strings are required and granted to nobody

**Severity:** High · **Confidence:** C3 (`auth.js:63-88` byte-identical to legacy `[DIFF-04]`; Appendix A.2 census; `[PROBE-002]` 403s)

| Field | Content |
|---|---|
| **Symptom** | `system.config.read`, `secrets.manage`, `users.export`, `users.security.manage`, `payments.write`, `system.config.manage`, `messages.read`, `tenant.support.access` are checked by at least one handler and held by no role except `SUPER_ADMIN` (which holds `*`). Every route behind them is therefore super-admin-only in practice. |
| **Evidence & reproduction** | Census in Appendix A.2: 8 required-but-unassigned, 24 granted-but-never-required. `system.config.read` is the *default* permission for unmatched admin reads (`policy.js:79`), so the whole class of unlisted admin reads collapses to super-admin-only: `[PROBE-002]` shows `/admin/settings`, `/admin/pages`, `/admin/coupons`, `/admin/blog/posts`, `/admin/trusted-by` → 403 for ADMIN. `system.config.manage` gates all generic settings writes (`policy.js:82-101`), so **`ADMIN` cannot save any setting** despite holding `system.config.write`. |
| **Mechanism (root cause)** | The permission vocabulary grew by accretion: handlers were written with new permission strings, the role literals were never updated to grant them. Because `manage` does not imply `write`/`read` in the resolver (`permissionsFor` does exact-string matching, `auth.js:190-197`), holding `.write` does not confer `.read` — the action hierarchy asserted by INV-3 does not exist in the implementation. Legacy defect **LD-03** reproduced verbatim. |
| **Blast radius** | Every admin route that relies on the default read permission or on `system.config.manage`; the effective role model becomes "SUPER_ADMIN or read-only", which is the opposite of what the four-role design intends. |
| **Required modification** | **REC-006** (declare permissions per route, delete the path-table default) and **REC-005** (`manage ⊃ write ⊃ read` hierarchy in the resolver so `system.config.manage` implies `system.config.read`). |
| **Risk of the fix** | Medium: widening ADMIN access to settings reads must be paired with RCA-013's write path or ADMIN will be able to *open* panels that cannot save — better than today, still confusing. Ship REC-006 and REC-012 together. |
| **Verification** | Appendix A.2 census must show **0** required-but-unassigned permissions, and the probe matrix must show ADMIN `200` on `/admin/settings/:category` GET for the categories it is meant to read. CI assertion: every permission string appearing in a `requirePermission(...)` call exists in at least one role bundle. |

---

## RCA-008 — Authorisation is decided twice, by two mechanisms that disagree

**Severity:** High · **Confidence:** C3 (`policy.js` vs per-route middleware census; `[PROBE-002]` 403 splits that contradict the role bundles)

| Field | Content |
|---|---|
| **Symptom** | 145 distinct admin/platform routes: 61 carry route-level permission middleware, 24 perform inline checks in the handler, and **60 rely on the path-string policy alone**. Where both exist, the stricter wins, which makes the effective rule unpredictable from either file alone. |
| **Evidence & reproduction** | Census Appendix A.1. `enforceApiPolicy` (`policy.js:106-160`) is mounted globally (`index.js`); `ADMIN_PREFIXES` (`:3`), `ADMIN_EXACT` (`:9`), `resolveAdminReadPermission` (`:54`), `resolveAdminMutationPermission` (`:82`), `RECENT_AUTHENTICATION_PATHS` (`:103`). Example disagreements: `/api/admin/settings/:category` (middleware: none; policy: `system.config.read`/`manage`), `/api/platform/queues` (policy: none beyond `requireAdmin`; handler: none), `/api/admin/ai-settings` (policy: `system.config.read` by `:73`; probe: 403 for ADMIN). Four paths are registered **twice** in `routes/platform.js` with different guards (`/configuration` 1670 vs 1846; `/payment-settings` 1707 `['payments.read','system.config.read']` vs 1883 `system.config.read`; `/payment-webhooks` 1727/1903; `replay` 1809/1985). Express serves the first match, so the second registration of each pair is dead code whose guard differs from the live one. |
| **Mechanism (root cause)** | Two authorisation designs coexist: a declarative path-prefix table (legacy, fast, coarse) and per-route middleware (newer, precise, inconsistently applied). Neither is authoritative, so each new route inherits whichever the author remembered. The duplicate registrations are the same failure in its purest form — the same authorising intent written twice, diverging. |
| **Blast radius** | The platform's authorisation surface as a whole: any audit answer to "who can call X?" requires reading three files, and any answer derived from one file is unreliable. 60 routes have no handler-level statement of what they require. |
| **Required modification** | **REC-006** — one engine. Declare `route → (resource, action)` in a single manifest consumed by `requirePermission`; `enforceApiPolicy` becomes a thin adapter over it or is deleted. **REC-017** deletes the four dead duplicate blocks. |
| **Risk of the fix** | High: touching the authoriser can lock operators out of production. Mitigation is mechanical — generate the manifest *from* the current route table, assert equivalence in CI (new tests must show identical allow/deny for the full role matrix before and after), then refactor. Do not hand-write the manifest. |
| **Verification** | Appendix A.3's 26-route × 5-role matrix becomes a checked-in fixture; the refactor must reproduce it byte-for-byte, then extend it to all 145 routes. `git grep "router.post('/payment-webhooks"` → 1 registration. |

---

## RCA-009 — Authority is a union of a frozen role literal and an arbitrary per-user claim

**Severity:** High · **Confidence:** C3 (`auth.js:63-88`, `:190-197`; no role/permission DDL across 27 migrations)

| Field | Content |
|---|---|
| **Symptom** | What an admin may do is decided by (a) a `Object.freeze`d literal in source and (b) whatever `permissions` array the identity provider asserts on the token. There is no role table, no permission table, no per-user grant record, and no audit when either changes. Role bundles are not configurable by any dashboard — which is exactly what INV-3 forbids. |
| **Evidence & reproduction** | `auth.js:63-88` (`Object.freeze({...})`, byte-identical to legacy `[DIFF-04]`); `permissionsFor` (`:190`) returns `[...bundle, ...(claims.permissions \|\| [])]`; `requirePermission` (`:198`); `isSuperAdmin` (`:219`). Migrations `[SQL-001]`…`[SQL-027]` contain no `roles`/`permissions`/`role_permissions` table (verified by scan; `admin_*` tables are users, audit logs, sessions, invitations). Inherited legacy defect **LD-05**. |
| **Mechanism (root cause)** | RBAC was implemented as authentication-claim decoration rather than as data. A frozen literal is the cheapest correct thing to ship on day one, and it never got a second day. The `claims.permissions` union was presumably added for a one-off grant and remained, which means the literal is not even the authority — the token is. |
| **Blast radius** | INV-3 (configurable bundles) **not met**; INV-2 (super-admin unconditional rights) met only by the `*` wildcard; every "tighten a role" request becomes a deploy; every privilege grant is invisible to the audit trail. |
| **Required modification** | **REC-005** — `admin_roles`, `admin_role_permissions(resource, action)`, `admin_user_roles`; resolver with hierarchy; seed from the current literal so day-one behaviour is identical; drop the `claims.permissions` union (or persist it as an explicit, audited grant). |
| **Risk of the fix** | Medium-high: the resolver is on the hot path of every admin request, and a seeding mistake locks everyone out. Mitigation: dual-run (compare DB resolution with literal resolution, log divergence, then flip) for one release. |
| **Verification** | New table-driven test: for each built-in role, DB-resolved permission set == literal set. Then a change test: grant `audit.read` to SUPPORT via the API → probe shows the new capability without a deploy, and an audit row records actor/target/before/after. |

---

## RCA-010 — Super-admin lifecycle is out of band with no audited provisioning path

**Severity:** High · **Confidence:** C2 (code reading of `adminUsers.js:322,762`; no provisioning route in the census)

| Field | Content |
|---|---|
| **Symptom** | `SUPER_ADMIN` can be neither created nor demoted through the API. Correct as a break-glass protection, but no audited path replaces it, so the only way to add or remove a root account is a manual Firebase/database operation performed by someone, recorded nowhere. |
| **Evidence & reproduction** | `backend/routes/adminUsers.js:322` (create rejects `SUPER_ADMIN`), `:762` (update rejects demotion); no `/api/admin/operators` creation route that grants `SUPER_ADMIN` (the operators routes are `platform.js:1304,1342` and create *staff* accounts under the caller's constraint). DIV-011 records the intent. |
| **Mechanism (root cause)** | The guard was added to close an escalation path, without adding the compensating control (an audited, dual-approved provisioning flow). This is a *correct* decision with an *incomplete* design: the risk moved from "escalation via API" to "unlogged root creation". |
| **Blast radius** | Attestation: at any moment the set of root accounts is not knowable from the system of record. On staff departure, revocation is a manual, unverified act. |
| **Required modification** | **REC-026** — document and instrument the provisioning runbook; add `GET /api/admin/operators?role=SUPER_ADMIN` attestation view (data already returned by `platform.js:1304-1340`), plus a reconciliation job that compares Firebase custom claims against `admin_*` records and alerts on divergence. |
| **Risk of the fix** | Low code risk; organisational risk is that the runbook names individuals. Keep the runbook role-based, not person-based. |
| **Verification** | Attestation view lists every root account with `uid`, `email`, `lastSignIn`, `mfaEnrolled`; reconciliation job emits a metric `admin.root_accounts_mismatch` = 0. |

---

## RCA-011 — Thirteen of eighteen module toggles control nothing

**Severity:** High · **Confidence:** C3 (cross-tree consumer scan, Appendix A.7)

| Field | Content |
|---|---|
| **Symptom** | The console presents 18 "Addon Modules" switches and captions them "Instant Global Propagation … across all connected portals" (`AdminSettingsTab.tsx:484`). Thirteen of the eighteen keys are read by no code path that changes behaviour; two more appear only as display strings in the health report; one is a field-name collision inside the AI provider config; two are real gates. No key has any consumer in `frontend/src` other than the toggle definition itself. |
| **Evidence & reproduction** | Appendix A.7 census over `frontend/` + `backend/`: **enforced** — `enableMessagesModule` (`index.js:609`) and `enablePortfolioModule` (`routes/portfolios.js:16`); **display only** — `enableLinkedinAuthModule`/`enableGithubAuthModule` (`platformHealth.js:209-210`); **name collision** — `enableImportModule` (`aiAdmin.js:86,270`, an AI provider field); **inert** — the remaining 13. The toggles *do* persist correctly (the modules panel is the only one sending `expectedRevision`), which makes them more convincing and therefore more dangerous. Legacy defect **LD-02** reproduced: legacy at least hid the corresponding UI; the new console has no consumer at all. |
| **Mechanism (root cause)** | Toggles were specified as product configuration in one workstream and never wired in the code that would consume them. Because the persistence layer is generic (`system_settings.modules`), writing a flag always "succeeds" — there is no failure mode that would reveal the missing consumer. |
| **Blast radius** | An operator disabling a module (e.g. "turn off interviews for maintenance") believes the feature is off while it remains fully available. This is a false-assurance failure with customer-visible consequences. |
| **Required modification** | **REC-010** — for each of the 18 keys, either (a) add a server-side gate at the enumerated call sites, or (b) remove the switch and delete the key. No third option. Correct the propagation caption to state which flags are restart-required. |
| **Risk of the fix** | Medium: adding gates to 14 features touches many handlers. Removal is safer for the ones with no near-term consumer; prefer removal-with-ticket over speculative gating. |
| **Verification** | Appendix A.7 becomes a checked-in census test: every key in `MODULE_DEFINITIONS` must appear in ≥1 non-definition reference, or the build fails. Plus one behavioural test per wired flag: flag off → endpoint returns `403 MODULE_DISABLED`/feature hidden. |

---

## RCA-012 — Step-up failures dead-end; there is no recovery path

**Severity:** High · **Confidence:** C3 (`auth.js:265-306` returns `RECENT_AUTH_REQUIRED`; `api-client.ts` has no handler for it; no UI)

| Field | Content |
|---|---|
| **Symptom** | 15 mutation routes carry `requireRecentAdminAuthentication`. When the session is stale the server returns **`403 RECENT_AUTH_REQUIRED`** — the same status code it uses for "you may not" — and the new client handles only `401`/`TENANT_CONTEXT_REQUIRED` (`api-client.ts:120-180`). The operator therefore sees a permission-style failure with no way to re-authenticate and retry. |
| **Evidence & reproduction** | `auth.js:265-306` (`requireRecentAdminAuthentication`; `SENSITIVE_AUTH_MAX_AGE_MS` default 600,000 ms at `:296`; **`403`** returned at `:300-305`; and a hard precondition `if (!isSuperAdmin(req.user)) return 403` at `:276-280`); `RECENT_AUTHENTICATION_PATHS` `policy.js:103`; `frontend/src/lib/api-client.ts:120-180`; no `reauth` module anywhere in `frontend/src` (`grep -rn "RECENT_AUTH\|reauth" frontend/src` → 0 hits). Legacy implemented exactly this: `AdminReauthPrompt.jsx` (queued waiters, `REAUTH_CANCELLED`, password **or** federated popup) and `src/services/adminReauth.js` (81 ln, request interception + retry). |
| **Mechanism (root cause)** | The rewrite dropped the client half of a server-enforced control, and the server chose a status code (`403`) that is indistinguishable from an authorisation denial without parsing `error.code`. The server's step-up design assumes a cooperating client; without it the control becomes a hard stop instead of a checkpoint, and operators learn to avoid the actions that trigger it — the control degrades behaviourally even though it is technically intact. |
| **Blast radius** | Every destructive action (15 routes): payment refunds, secret rotation, code injection, delete-user, queue purge. Two compounding effects: (a) operators read a step-up failure as "I lack permission" and stop trying; (b) because `requireRecentAdminAuthentication` begins with a super-admin precondition (`auth.js:276-280`), it can never be used to protect an *ADMIN* action — so ADMIN-performed destructive actions (MFA removal, role change, session revoke) have **no** step-up at all, which is the structural half of RCA-005/006. |
| **Required modification** | **REC-009** — port the interceptor: on `RECENT_AUTH_REQUIRED`, show a modal, re-authenticate (password or provider popup), replay the queued request; surface MFA posture in the shell header (CAP-017). |
| **Risk of the fix** | Low. Reuse the legacy design (queue + explicit cancel) rather than inventing one; the legacy file is the specification and it was tested in production. |
| **Verification** | With a token older than the freshness window, clicking "Refund" opens the prompt; after successful reauth the refund completes **once** (no double-submit); cancelling shows a clear "action cancelled" state and does not mutate local state. |

---

## RCA-013 — The settings console was written against an imagined API

**Severity:** High · **Confidence:** C3 (`index.js:3885-3892` mandatory `expectedRevision`; panel payloads cited; field-name diff against `platformHealth.js`)

| Field | Content |
|---|---|
| **Symptom** | Four of the five settings panels **cannot save**: they POST `{ data }` without `expectedRevision`, and the server rejects with `400 ADMIN_SETTINGS_REVISION_REQUIRED` (generic categories) or `400 PAYMENT_SETTINGS_REVISION_REQUIRED` (payment settings). Separately, the integrations panel writes field names no consumer reads, and one of its fields would be published publicly if the write succeeded. |
| **Evidence & reproduction** | Server: `index.js:3885-3892` (`if (!Number.isInteger(expectedRevision) …) throw ADMIN_SETTINGS_REVISION_REQUIRED`), `:4250-4256` (payment equivalent). Client: `AdminSettingsTab.tsx:880-886` (branding/geoSeo/llmGeo), `:1024-1034` (integrations), `:1179-1187` (templateManager/gdpr/codeInjection), `:661` (payment-settings) — all omit `expectedRevision`; only the modules panel sends it (`:421-428`). Field names: panel writes `googleMapsKey`/`recaptchaSiteKey`/`recaptchaSecret`; `platformHealth.js:488-497` reads `googleMapsApiKey`/`recaptchaSecretKey` → probes report "not configured" for configured keys. Twilio: panel writes `twilioSid`/`twilioToken` into category `integrations` (`:1030-1031`), while the canonical path is `POST /api/admin/twilio-settings` (`index.js:4845`, with `AC…`/E.164 validation and a `TWILIO_SETTINGS_UPDATED` audit). `twilioToken` does not match the private-key classifier (`index.js:3658-3664`), so it would be written to `public_config` and served by the unauthenticated `GET /api/platform/public-config` (`platform.js:227-256`, allowlisted public at `index.js:426`). |
| **Mechanism (root cause)** | The panel code was authored from the *shape of the UI*, not from the contract. Three independent consequences share one cause: (1) the revision contract is not satisfied, so writes fail; (2) the category/field vocabulary is invented, so reads and writes miss their consumers; (3) secret classification is keyed on field **names**, so an invented name silently loses its classification and its confidentiality. The third is the most serious and the least visible: today the 400 blocks it, so the leak is latent — fixing the revision bug without fixing the classification would *create* the leak. |
| **Blast radius** | 10 of 31 legacy settings screens cannot persist (branding, assets, geo-SEO, LLM-GEO, integrations, template manager, GDPR, code injection, currency/GST, gateways); Twilio configuration is unreachable through the console and would be mis-stored if it were reachable; Maps/reCAPTCHA health reporting is permanently wrong. |
| **Required modification** | **REC-012** (one settings client: read `revision` from the GET, send `expectedRevision` on every write, map 409 to a "reload and re-apply" state; rename integration fields to the consumed names; route Twilio through `/api/admin/twilio-settings`; add the invented secret names to the private-key classifier *before* enabling any write) and **REC-011** (fill the missing categories). |
| **Risk of the fix** | Medium, and the ordering matters: **classification fix first**, revision fix second. Doing it the other way opens a public leak of a Twilio auth token. This ordering constraint is a hard requirement, not advice. |
| **Verification** | (a) Each of the 10 panels saves and re-reads the new value; (b) a 409 test (save twice from two tabs) surfaces the reload prompt; (c) `GET /api/platform/public-config` must not contain any key matching `/(secret\|token\|password\|keySecret)/i`; (d) `platformHealth` shows Maps/reCAPTCHA configured after a save. |

---

## RCA-014 — The Tenants Registry has no console surface

**Severity:** High · **Confidence:** C3 (`/api/platform/tenants` implemented at `enterprise.js:608`; `console.tsx:50-66` has no tab; FE has no caller)

| Field | Content |
|---|---|
| **Symptom** | Enterprise tenant lifecycle — list, inspect, suspend, reactivate — is unavailable in the new console. The legacy UI for it is 2,105 lines. |
| **Evidence & reproduction** | Backend: `backend/routes/enterprise.js:608` `GET /platform/tenants`, `:621` suspend, `:630` reactivate, service-level `listPlatformTenants`/`setTenantLifecycleAsPlatform`. Frontend: no `tenants` tab id, no component, no call. `[PROBE-002]`: `GET /api/platform/tenants` → 404 (only *that path*; the real path is under `/api/enterprise`), `GET /api/admin/tenants` → 404, while `/api/enterprise/platform/tenants` is implemented. |
| **Mechanism (root cause)** | The console's tab set was derived from a design sketch rather than from the capability inventory; tenant administration was assumed to live in the enterprise console (it does not — the enterprise console is tenant-scoped and cannot list other tenants). The backend capability survived the rewrite; the UI did not. |
| **Blast radius** | Customer lifecycle: a non-paying or abusive enterprise tenant cannot be suspended; a recovered tenant cannot be reactivated. Every intervention requires direct DB access (`enterprise_tenant_configurations`), unlogged in the admin audit trail. |
| **Required modification** | **REC-007** (registry table + detail + suspend/reactivate with reason + audit) and **REC-020** (decommission + garbage-collect, which the backend also already implements at `platform.js:1547,1587`). |
| **Risk of the fix** | Medium: suspension is destructive to a customer. Require a typed reason, a confirmation dialog, and an audit row with before/after status. |
| **Verification** | Suspend a test tenant → `enterprise_tenant_configurations.status` changes, an audit row records actor/reason/`before=ACTIVE`/`after=SUSPENDED`, and the tenant's API calls return `403 TENANT_SUSPENDED`. Reactivate reverses all three. |

---

## RCA-015 — Feature flags are unreachable from any UI

**Severity:** High · **Confidence:** C3 (`platform.js:1637,1646` registered; `grep -rn featureFlag frontend/src` → 0 callers)

| Field | Content |
|---|---|
| **Symptom** | Seven registered feature flags — three of which gate workers and require a restart — can only be changed by a hand-crafted `PUT`. The console has no surface, although the backend route, service and audit path all exist. |
| **Evidence & reproduction** | `backend/routes/platform.js:1637` `GET /feature-flags` (SA), `:1646` `PUT /feature-flags/:flagKey` (SA + `requireRecentAdminAuthentication`); `backend/services/featureFlagService.js` (7 flags, restart-required metadata); `[PROBE-002]`: `/api/admin/operations/feature-flags` → 403 for ADMIN, `PUT /feature-flags/:flag` → 403 for ADMIN; no `featureFlag` reference in `frontend/src`. Legacy had a screen for it (CAP-049). |
| **Mechanism (root cause)** | Same as RCA-014: the tab set was sketched, and the "operations" grouping was implemented as four cards (backup/cache/maintenance/telemetry) that missed the flags. The console advertises operations coverage while omitting the one operations control that matters during an incident. |
| **Blast radius** | Incident response: a runaway worker can only be stopped by a deploy or a manual `PUT`. Restart-required flags cannot be flipped with confidence because there is nowhere to see which are restart-required. |
| **Required modification** | **REC-013** — a Feature Flags panel under Operations: list with description/owner/scope/restart-required, toggle with `requireRecentAdminAuthentication`, and a restart-pending indicator. |
| **Risk of the fix** | Low. Two constraints: SA-only (matches the backend), and a confirmation step naming the blast radius, because three flags stop background processing. |
| **Verification** | Toggle a worker flag → DB value changes, audit row written, `restartRequired` badge appears, and the worker logs `flag disabled, exiting` on next tick. Non-SA roles must not see the panel (probe: 403). |

---

## RCA-016 — Configuration changes are audited without before/after

**Severity:** Medium · **Confidence:** C3 (`index.js:3945-3965`; `security/adminAudit.js:110-205`)

| Field | Content |
|---|---|
| **Symptom** | INV-6 requires actor, timestamp, **before/after** and scope. The system records actor, timestamp, action, target and a metadata bag of `{category, revision, changedFields}`. No prior value and no new value are stored, for any configuration surface. |
| **Evidence & reproduction** | Settings path: in-transaction insert of `{category, revision, changedFields}` (`index.js:3945-3965`) — the pre-image (`currentCategory`, loaded at `:3893-3908`) and post-image (`persisted`, computed at `:3920-3924`) exist in memory but are not persisted. Generic middleware: `createAdminAuditMiddleware` (`index.js:3283`) builds its document at `security/adminAudit.js:110-205` with no body capture. Table: `admin_audit_logs` ([SQL-001]:503) has no value columns. |
| **Mechanism (root cause)** | The audit document was modelled as an *event log* ("who did what, where") rather than a *change log* ("from what, to what"). The design is coherent; it just cannot answer the question a configuration audit exists to answer. |
| **Blast radius** | Post-incident reconstruction: "who changed the currency to USD, and from what?" is unanswerable. Compliance: auditors will ask for before/after and the answer is "not stored". Also blocks the rollback capability that REC-016's config editor would need. |
| **Required modification** | **REC-015** — add `before`/`after` JSON (redacted via the existing private-key classifier) to the settings audit insert, using the images already in scope; extend `admin_audit_logs` with `before_value`/`after_value` (nullable, size-capped, redacted) and a `scope` column (`platform \| tenant \| module`). |
| **Risk of the fix** | Medium: naive snapshotting writes secrets into the audit table. Mitigation is mandatory — reuse `isPrivateAdminSettingKey` (`index.js:3658-3664`) to redact, and cap the payload, with a test asserting a secret field never appears in `before`/`after`. |
| **Verification** | Change `currency` INR→USD: audit row contains `before={"currency":"INR"}`, `after={"currency":"USD"}`, actor uid, `scope=platform`, and no secret-looking keys. Test: rotate a Stripe secret → `before`/`after` contain `••••` only. |

---

## RCA-017 — Feature Flags and the platform config census have no home, and the console's own settings map is incomplete

**Severity:** Medium · **Confidence:** C3 (`platformConfiguration.js` census exists; no consumer; `AdminSettingsTab.tsx:112-196` 5 sections)

| Field | Content |
|---|---|
| **Symptom** | The config census (`GET /api/platform/configuration`) answers exactly the question operators ask ("who owns this value? does it need a restart?") and has no UI. Legacy deep-linked each value to its editing screen; five of those screens no longer exist in the new console. |
| **Evidence & reproduction** | `backend/services/platformConfiguration.js:338-480` groups values as `infrastructure/runtime/featureFlags/integrations/workers/security/governance` with per-item owner and restart metadata; `platform.js:1670` (and dead duplicate `:1846`) super-admin only; frontend has 5 settings sections (`AdminSettingsTab.tsx:112-196`) and no census consumer. |
| **Mechanism (root cause)** | The census was built as an *inspection* endpoint in the same workstream that produced the flag service, and the UI workstream independently designed 5 settings sections from the legacy screen list. The two were never reconciled, so the one thing that could tell an operator where a value lives is not shown. |
| **Blast radius** | Operability: every configuration question becomes a code read. For the 14 inert module flags (RCA-011) the census would have made the inertness visible at build time — the gap is causally related to the defect. |
| **Required modification** | **REC-016** — a read-only "Platform Configuration" view: grouped census with owner, source (`env` \| `db`), restart-required, and a deep link that resolves to a real console location or says "no UI — API only". |
| **Risk of the fix** | Low; read-only surface. Must not become an editing surface by accident — `GET /configuration` is SA-only and stays so. |
| **Verification** | Every one of the ~90 census entries renders with a non-empty owner; a UI test asserts no deep link resolves to a removed tab (the legacy failure mode). |

---

## RCA-018 — Four route blocks are registered twice, with divergent guards

**Severity:** Low · **Confidence:** C3 (line numbers; identical bodies; different middleware)

| Field | Content |
|---|---|
| **Symptom** | `routes/platform.js` registers `GET /configuration`, `GET /payment-settings`, `GET /payment-webhooks` and `POST /payment-webhooks/:eventId/replay` twice each. Express serves the first match; the second copy of each pair is unreachable dead code — and in two cases its guard differs from the live one. |
| **Evidence & reproduction** | Live/dead pairs: `/configuration` 1670 / 1846 (both `requireSuperAdmin`); `/payment-settings` 1707 (`requirePermission(['payments.read','system.config.read'])`) / 1883 (`requirePermission('system.config.read')`); `/payment-webhooks` 1727 / 1903; `replay` 1809 / 1985 (both `requireSuperAdmin`). Bodies byte-identical; ~340 duplicated lines. `platform.js` therefore reports 49 registrations where 45 routes are served. |
| **Mechanism (root cause)** | A patch series applied twice (the second application re-appended the blocks instead of updating them), with no route-table uniqueness assertion in CI. The divergence in the `/payment-settings` guard is the residue of the very RCA-007 discussion the file's own comments describe. |
| **Blast radius** | Maintainability and auditability: a reader auditing "what guard protects payment settings?" finds two answers, and the wrong one is the easier to find (it appears later, next to its explanatory comment). No runtime consequence today. |
| **Required modification** | **REC-017** — delete the four later blocks; add a CI assertion that no `(method, path)` pair is registered twice in any router. |
| **Risk of the fix** | Very low; behaviour is unchanged by construction (dead code). The uniqueness test is what prevents recurrence. |
| **Verification** | `grep -c "router.get('/payment-settings'" backend/routes/platform.js` → `1`; route-table uniqueness test passes; full probe matrix unchanged before/after. |

---

## RCA-019 — Client-side role derivation is duplicated, permissive-by-default, and not a capability model

**Severity:** Medium · **Confidence:** C3 (`console.tsx:81-104,218`; `cuba-app-shell.tsx:276,407-424`)

| Field | Content |
|---|---|
| **Symptom** | The console decides what a user can see from an uppercased role string, in two places, with a default branch that grants the full tab set. The shell renders all 13 nav groups for every role, including links the console will then refuse. Capability is never obtained from the server. |
| **Evidence & reproduction** | `console.tsx:81-104` (SUPPORT → 2 tabs, AUDITOR → 5, **otherwise all 15**), `:218` (`viewerRole`), `:137` (`isForbiddenTab`); `cuba-app-shell.tsx:276` (`simulatedRole`), `:407-424` (adminNavGroups returned unconditionally), `:1056` (gate). Backend correctly denies the underlying routes (`[PROBE-002]`), so this is a UX/consistency defect, not an authorisation hole — the reason it is Medium, not High. |
| **Mechanism (root cause)** | With no server-published capability manifest (RCA-009), the client had to re-derive capability and chose the role string, because that is what the session claims carry. Duplication followed: the shell and the page each needed the mapping. The permissive default is the conventional "unknown role = power user" shortcut, which fails open. |
| **Blast radius** | Any role not in the two special cases (including future roles and `ENTERPRISE_ADMIN` if it ever reaches `/admin`) receives the full console and then a cascade of 403s. Every new tab silently inherits access. Operators cannot tell "not allowed" from "not built". |
| **Required modification** | **REC-014** — serve capabilities with the session (`GET /api/admin/capabilities` returning resolved `resource:action` pairs from REC-005's tables); derive tabs, nav and buttons from it; fail **closed** on an unknown role. |
| **Risk of the fix** | Low; the backend already enforces, so the change cannot open a hole — only close a UX gap. Requires REC-005 first (the manifest must come from somewhere). |
| **Verification** | For each of the 5 synthetic roles, the rendered tab set equals the probed reachable set (Appendix A.3). A role with no granted permissions sees zero tabs and an explanatory screen. No nav item renders for a resource the session cannot read. |

---

## RCA-020 — Comments and copy assert contract compliance the code does not have

**Severity:** Low · **Confidence:** C3 (comment/payload pairs cited)

| Field | Content |
|---|---|
| **Symptom** | Files open with "Zero Fake Data: All reads/writes bind to authentic backend contracts" above 5 panels that cannot save; `// CONTRACT: POST /api/admin/support/tickets/:id/messages` sits directly above `.catch(() => {})`; the modules panel promises "Instant Global Propagation" for 14 inert flags. |
| **Evidence & reproduction** | `AdminSettingsTab.tsx:12` vs RCA-013; `AdminHelpDeskTab.tsx:156-160`; `AdminSettingsTab.tsx:484` vs Appendix A.7; `AdminEmailSmtpTab.tsx:5-10` is the one header that is accurate. |
| **Mechanism (root cause)** | Contract documentation was written from intent at authoring time and never validated against behaviour, so it records the plan rather than the code. In a review context this is actively harmful: it is the first thing a reader trusts. |
| **Blast radius** | Reviewer and maintainer trust; it materially slows audit (this review spent effort disproving two of these headers) and it will mislead the next engineer who "fixes" a panel by following its comment. |
| **Required modification** | **REC-017** — delete contract comments that are not enforced by a test; replace with a link to the contract test name that enforces them. |
| **Risk of the fix** | None. |
| **Verification** | `grep -rn "Zero Fake Data\|// CONTRACT:" frontend/src` returns only comments adjacent to a test file reference. |

---

## RCA-021 — The role-view simulation is client-side theatre with a super-admin-only audit call

**Severity:** High · **Confidence:** C3 (`cuba-app-shell.tsx:283-317` posts `platform.js:2027`; `[PROBE-002]` 403 for ADMIN)

| Field | Content |
|---|---|
| **Symptom** | The shell offers a role-view switcher. Selecting a role changes only local rendering; every server decision still uses the real role. Each switch posts an audit event to `POST /api/platform/role-view-audit`, which is `SUPER_ADMIN`-only — so the very action being audited is unavailable to the roles most likely to use it. |
| **Evidence & reproduction** | `frontend/src/components/shell/cuba-app-shell.tsx:283-317` (handler), `:276` (`simulatedRole`); `backend/routes/platform.js:2027` `POST /role-view-audit` with `requireAuth, requireSuperAdmin`; `[PROBE-002]`: 403 for ADMIN. Legacy CAP-014 was super-admin-only too, but legacy also gated the *switcher* behind the same role (`Admin.jsx:648-676`), so a non-SA never saw it. |
| **Mechanism (root cause)** | The feature was rebuilt as a UI affordance without re-deriving its authority model: legacy's rule ("only root may impersonate, and every impersonation is audited") was split, with the UI shown to everyone and the audit enforced for root only. A simulation was also preferred over a real capability projection, which is why INV-3's absence went unnoticed. |
| **Blast radius** | Operators may believe the console is enforcing a reduced view (it is not). Audit-trail integrity is weakened because failed audit posts are silently dropped (`[PROBE-002]` 403 → `.catch`). |
| **Required modification** | **REC-018** — either (a) restrict the switcher to `SUPER_ADMIN` and make the audit call succeeding a precondition of switching, or (b) replace it with the server-verified capability projection from REC-014 and delete the simulation. Recommendation: (b), then (a) as the interim. |
| **Risk of the fix** | Low; (a) is a one-line gate plus an error path. Removing the simulation changes a demo affordance — confirm with the product owner (§11 RR-004). |
| **Verification** | As ADMIN, the switcher is absent (or disabled with a reason). As SUPER_ADMIN, a switch produces exactly one audit row and no switch is possible when the audit write fails. |

---

## RCA-022 — Audit writes are best-effort and fail silently

**Severity:** High · **Confidence:** C3 (`security/adminAudit.js:194-196`; `recordAdminAuditLog` call counts)

| Field | Content |
|---|---|
| **Symptom** | The generic audit middleware swallows write failures, and coverage is uneven: `recordAdminAuditLog` is called 12× in `routes/platform.js`, 15× in `routes/adminUsers.js`, and **0×** in `routes/adminPlatformOperations.js` (392 lines of admin operations) and **0×** in `index.js`. So the settings path audits inside its transaction (good), many platform routes audit best-effort (fragile), and a whole module audits nothing. |
| **Evidence & reproduction** | `backend/security/adminAudit.js:194-196` (failure caught and discarded); call census above (`grep -c recordAdminAuditLog`); `index.js:3283` mounts the middleware but `index.js` itself never calls the recorder for its own handlers; the transactional insert at `index.js:3956-3964` is the exception, not the rule. |
| **Mechanism (root cause)** | Audit was treated as telemetry ("nice to have, must not break the request") rather than as a control ("if it cannot be recorded, the action must not proceed"). The permissive choice is invisible in normal operation because audit writes almost always succeed — the failure mode appears exactly when it matters (DB under pressure during an incident). |
| **Blast radius** | INV-6 and non-repudiation: during the incidents where audit matters most (DB saturation, write errors), the record is most likely to be lost — and it is lost silently, so nobody knows the record is incomplete. |
| **Required modification** | **REC-015** — for mutations that change state: fail the request if the audit row cannot be written (`503 AUDIT_WRITE_FAILED`), inside the same transaction where one exists; for reads of sensitive data, best-effort remains acceptable and must be logged with a counter. Add explicit recording to `adminPlatformOperations.js` and to `index.js` handlers. |
| **Risk of the fix** | Medium: making audit mandatory converts an audit-outage into a control-plane outage. That is the correct trade for state-changing operations (an unrecorded change is worse than a refused one) but must be agreed — §11 RR-005 records the decision and its trade-off. |
| **Verification** | Simulate an audit-insert failure (revoke INSERT on `admin_audit_logs`) → the settings save must return `503` and **not** persist the value. Coverage test: every mutating handler has ≥1 `recordAdminAuditLog` call or a documented exemption. |

---

## 7. Defects deliberately *not* listed here

Three things that look like defects and are not, recorded so they are not "fixed":

1. **`POST /api/admin/settings/storage` → `501 STORAGE_PROVIDER_UNSUPPORTED`** is a deliberate, correct refusal (CAP-037, DIV-010). A future reviewer will be tempted to implement storage because the legacy screen existed; §03 classifies it OBSOLETE.
2. **`SUPER_ADMIN` cannot be created/demoted via API** (DIV-011) is a correct protection; its gap is RCA-010, not the restriction itself.
3. **`ADMIN` denied `/api/admin/database-settings`** is correct least privilege (the capability is obsolete), not an RCA-007 instance.

---

*Cross-references: capability status §04 · SWOT §05 · divergences §07 · invariants §08 · configuration values §09 · remediation §10 · probe harness Appendix A.3.*
