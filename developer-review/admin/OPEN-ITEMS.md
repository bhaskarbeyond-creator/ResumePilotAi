# Open items

**Purpose.** Everything that is **not** done, with the exact next action. An item
here is a known gap, not a wish: each has a file, an acceptance criterion, and an
owner-facing dependency.

**Rule obeyed throughout:** no blank cells and no `TBD`. Where a decision belongs to
a person outside engineering, the item reads
`UNRESOLVED — decision required` followed by the exact question and the trade-offs.

**Status key:** `OPEN` (nothing started) · `PARTIAL` (some work landed) ·
`BLOCKED` (waiting on a decision or an environment) · `DEFERRED` (decided not to do,
with a reason).

---

## 1. Authority and security

| ID | Item | Status | Next action | Acceptance |
|---|---|---|---|---|
| `OI-005-1` | No second-person approval for authority changes | OPEN | Add a `pending_authority_changes` table + `POST /api/admin/rbac/changes` with a second super-admin approval step; the change applies only on approval | A single super-admin cannot widen a role without a second identity in the audit row |
| `OI-005-2` | No scoped, time-boxed impersonation ("audited opt-in bypass") | OPEN | `POST /api/admin/rbac/impersonation` issuing a short-lived grant with `scope`, `reason`, `expires_at`; every impersonated request carries an `actor_uid` distinct from `subject_uid` | An impersonated request is attributable to both identities; the grant cannot outlive its expiry |
| `OI-005-3` | Legacy dotted permission aliases double the key space | DEFERRED | Migrate the ~66 `permissions.has('users.update')` call sites to `satisfies(…, 'users:update')`, then delete the alias push in `expandGrant` | `grep -rc "permissions.has('" backend/routes backend/index.js` → 0 for permission keys |
| `OI-005-4` | No console screen for role administration | OPEN | Build `AdminRbacTab` against `/api/admin/rbac/*` (list roles, edit bundle with a diff preview, grants with expiry) | A super-admin can perform §5 of the runbook without curl |
| `OI-005-5` | Grants have no bulk-revoke | OPEN | `DELETE /api/admin/rbac/grants?uid=` and a "revoke all for uid" action with a mandatory reason | Off-boarding a person is one audited call |
| `OI-005-6` | **No migration test** for 028 | OPEN | Add a MariaDB-backed test that applies 028 to an empty schema, asserts the seeded rows, applies `down`, asserts the tables are gone and that resolution falls back to the literal | `test/admin-rbac-migration.integration.test.js` green in CI |
| `OI-005-7` | RBAC cache is per process; convergence bounded by TTL | OPEN | Publish an invalidation event on role/grant writes (Redis pub/sub or a `rbac_versions` row polled by every instance) | A role change on instance A is observed by instance B in < 1 s |
| `OI-012-1` | Settings audit has no server-computed previous value | OPEN | In the settings write handler (`index.js:3885-3965`), read the current value before writing and pass `previous` into the audit event's `metadata` | The audit row for a settings change contains `before` ≠ `after`; a test asserts the client body cannot influence `before` |

---

## 2. Configuration (INV-4)

Source of truth: `09-configuration-gap-register.md` (34 CFG gaps: 3 DB-VALID,
1 split, 9 DB-BROKEN, 14 CODE-UNJUST, 8 CODE-JUST — of which 3 remain unjustified).

| ID | Item | Status | Next action | Acceptance |
|---|---|---|---|---|
| `OI-CFG-1` | 9 DB-BROKEN settings | OPEN | For each key listed in `09-configuration-gap-register.md` §DB-BROKEN: a migration adding the missing row/column, a reader that falls back to the default when the row is absent, and an admin panel field with validation | Every DB-BROKEN key round-trips: change in the panel → reload → value persists |
| `OI-CFG-2` | 14 CODE-UNJUST values that should be configurable | OPEN | Promote each to a typed config key with a default, a validator, and an audit trail; delete the constant | `grep` for the constant returns only the registry entry |
| `OI-CFG-3` | 3 CODE-JUST values with no written justification | OPEN | Either add the justification comments the register asks for, or promote them | `09-configuration-gap-register.md` shows 0 unjustified |
| `OI-CFG-4` | Rate limits are env-only (`index.js:381-411`) | OPEN | Settings category `limits.rate` with per-scope values, validation, and a "revert to default" action | A rate limit can be changed from the dashboard and takes effect without a restart |
| `OI-CFG-5` | Retention windows are env-only (CFG-013/014/015) | **UNRESOLVED — decision required** | **Question for legal/compliance:** what are the lawful retention periods for (a) administrative audit rows, (b) AI usage records, (c) the notification outbox? **Trade-offs:** short retention reduces exposure and destroys investigation evidence; long retention preserves evidence and increases breach impact. **Interim position:** indefinite retention (RR-007), no deletion job, so nothing is lost while the decision is open | A documented period per class, encoded as a config key with a deletion job and an audit trail |
| `OI-CFG-6` | Tenant-level config overrides | DEFERRED (RR-008) | Namespaced keys today; adding `tenant_id` needs a schema change on the configuration tables and a resolver change on every read | A tenant can override a platform default without forking a row |

---

## 3. Console surfaces (INV-1)

| ID | Item | Status | Next action | Acceptance |
|---|---|---|---|---|
| `OI-008-1` | No audit-trail tab (REC-008) | OPEN | `AdminAuditTab` consuming `GET /api/admin/audit-logs`, `/stats`, `/:id`; add `audit` to `VALID_TABS` and to the AUDITOR set; delete the client-side role-view simulation (RR-004) | AUDITOR can read, filter and page the trail in the UI; the tab is not visible to SUPPORT |
| `OI-007-1` | No tenants registry (REC-007) | OPEN | `AdminTenantsTab` + one backend namespace: consolidate `GET /platform/tenants` (`routes/enterprise.js:608`) and `GET /platform/tenants/:id` (`routes/platform.js:1444`); suspend requires a typed reason and writes `before=ACTIVE/after=SUSPENDED` | Suspend → DB row, audit row, and a 403 `TENANT_SUSPENDED` from the tenant's own token |
| `OI-001-1` | Sample data seeded in admin tabs | **CLOSED** | All 9 seeded surfaces converted to `useAdminResource` + `AdminDataState` across D-020-1 and the Step-4 console-integrity commits. `grep -n "useState.*(DEFAULT_\\|INITIAL_\\|FALLBACK_)" frontend/src/components/admin/*.tsx` → **0 hits**. 16 seeded state variables removed: `DEFAULT_TICKETS`, `DEFAULT_QUEUES`, `INITIAL_JOBS`, `DEFAULT_28_SERVICES`, `DEFAULT_APPLICATIONS`, `DEFAULT_JOBS`, `INITIAL_EVENTS`, `INITIAL_OPERATORS`, `INITIAL_AUDITS`, `INITIAL_ANNOUNCEMENTS`, `DEFAULT_ARTICLES`, `INITIAL_PHRASES`, `INITIAL_REVIEWS`, `INITIAL_TRUSTED`, `INITIAL_PAGES`, the operations-tab `syncStatus` metrics constant. Every converted tab has a jsdom suite asserting the empty and 503 states render as reports, never as rows (`TEST-EVIDENCE.md §4`) | n/a |
| `OI-018-1` | Console hides tabs by role name, not capability (REC-018) | OPEN | `useCapabilities()` reading `GET /api/admin/rbac/roles/:role/permissions` + the caller's resolved set; derive `allowedTabs` from permissions | A role granted `audit.read` through the API sees the audit tab without a deploy; the visible-but-denied cells in `SECURITY-AND-RBAC-PROOF.md §5.2` disappear |
| `OI-018-2` | Phantom notification paths (13 paths / 15 call sites) | OPEN | Remove the calls or implement the routes; the list is in `03-coverage-and-comparison-matrix.md` Appendix A.4 | `grep` for each path returns either a route registration or nothing |
| `OI-018-3` | Response-shape mismatches | PARTIAL | Health (`services` array + `OPERATIONAL/DEGRADED/…` enum) and the security-tab loader are fixed in the Step-4 rewrite. Remaining: `AdminEmailSmtpTab.tsx:75-80` spreads `settingsData.settings` into the `smtp` object, but the endpoint (`routes/email.js:1662`) returns `settings.smtp`, `settings.fallbackSmtp`, `settings.imap`, `settings.enabledTemplates`, `settings.revision` — so host/port land as `settings.host = undefined` and the form keeps its bootstrap values (`smtp.hostinger.com`) while reporting `configuredOnServer`. Fix the reader to `settings.smtp` and gate `configuredOnServer` on the server answering | The tab renders the stored SMTP configuration against a seeded backend; the bootstrap host never overwrites a stored one |

---

### 3.1 Console honesty (found while implementing Step 4)

| ID | Item | Status | Next action | Acceptance |
|---|---|---|---|---|
| `OI-ATTN-1` | Two attention signal kinds have no console surface | OPEN | `payments` and `tenancy` items from `GET /api/platform/attention` are rendered read-only ("no console tab yet") because no tab explains them; give them a home — payments under `settings`, tenancy once `OI-007-1` lands — and add both to `KIND_TO_TAB` in `AdminAttentionTab.tsx` | Every `kind` the endpoint can emit maps to a tab; the read-only fallback is unreachable |
| `OI-OPS-1` | Backup and cache-purge controls were fiction | **CLOSED as removal** | The controls posted to `/api/admin/operations/backup` and `/api/admin/operations/cache-clear`, neither of which is a route, swallowed the failure and announced success after a `setTimeout` (including a fabricated "Last Verified Snapshot: Today, 02:00 UTC"). Both cards are removed; `AdminOperationsTab` now says the operations are runbook-only and points at `DEPLOYMENT-RUNBOOK.md`. If a real backup-trigger API is wanted, it needs a schema, an audited route and a drill first — that is a new REC, not a revival of the old button | n/a |
| `OI-TRUTH-1` | Mutations that report success without a server answer | **CLOSED** | The three patterns are gone from `frontend/src/components/admin/`: (a) `.catch(() => {})` before a success message — the only two remaining hits are doc comments in `AdminUsersTab.tsx:11` and `AdminOperationsTab.tsx:6` that describe what was removed; (b) `setState` presented as persistence — every save now reloads from the server or reports the refusal; (c) synthesised identifiers/links — the `?reset_token=sec_rst_<ts>` fallback is gone, and the only `sec_rst_` hit is the doc comment at `AdminUsersTab.tsx:12`. `AdminOperationsTab` was the worst offender (backup/cache-purge announced success for routes that do not exist) and is now the runbook notice — see `OI-OPS-1` | n/a |
| `OI-STRICT-1` | `strict` is off app-wide | PARTIAL | `tsconfig.strict.json` covers `src/components/admin`, `src/pages/admin` and `tests/unit` at 0 errors (D-021-1). Remaining, with the error count measured on this branch: `ResumePageComposer.tsx` 47, `portfolio-view.tsx` 36, `resume-builder.tsx` 25, `interview-coach.tsx` 22, `support.tsx` 10, `templateUtils.ts` 10, `checkout-modal.tsx` 8, `EnterpriseOverviewTab.tsx` 7, `pages/cms/index.tsx` 5, `ai-assistant.tsx` 4, `EnterpriseRolesTab.tsx` 4, `ui/ai-processing-modal.tsx` 3, `employer/portal.tsx` 2. Convert one file per change; extend the strict project's `include` as each lands | `npx tsc -p tsconfig.app.json --noEmit --strict` → 0 errors, at which point `tsconfig.app.json` sets `"strict": true` and `tsconfig.strict.json` is deleted |

---

## 4. UX (the largest gap — see `UX-DEVICE-MATRIX.md`)

| ID | Item | Status | Next action | Acceptance |
|---|---|---|---|---|
| `OI-UX-1` | No tab navigation; 11 of 15 tabs are URL-only | OPEN | Add a `role="tablist"` with roving focus and a scrollable strip on C1/C2 | Every tab reachable without typing a URL, at every width |
| `OI-UX-2` | No 44 px touch targets | OPEN | Utility class applied to every interactive element at ≤ 768 px | axe-core `target-size`: 0 violations |
| `OI-UX-3` | No performance budget | OPEN | Lighthouse CI job asserting LCP < 2.5 s, INP < 200 ms, CLS < 0.1 on `/admin` at C1 and C4 | The job fails the build on regression |
| `OI-UX-4` | No safe-area handling | OPEN | `env(safe-area-inset-*)` on fixed chrome; `100dvh` | Verified at C1 on a notched emulation |
| `OI-UX-5` | 101 sub-12 px text uses | OPEN | `--text-2xs` token with a 12 px floor | 0 uses of `text-[10px]`/`text-[11px]` |
| `OI-UX-6` | No forced-colors / high-contrast | OPEN | `@media (forced-colors: active)` + a high-contrast theme | 0 contrast violations at AA on all 15 tabs |
| `OI-UX-7` | Sparse focus visibility (12 occurrences) | OPEN | `:focus-visible` everywhere; keyboard walk-through recorded | Every interactive element shows focus |
| `OI-UX-8` | No density modes, no print design | OPEN | `data-density` token set; per-surface print rules | Both verified visually and by snapshot |
| `OI-UX-9` | No admin visual regression | OPEN | 45 snapshots (15 tabs × C1/C3/C5) | Committed and reviewed |

---

## 5. Test tiers not present

| ID | Tier | Status | Next action |
|---|---|---|---|
| `OI-T-1` | Coverage measurement | PARTIAL | Measured and gated: `npm run test:coverage` enforces branches 80 / lines 95 / functions 90 and reports 98.42 / 82.52 / 97.53 / 98.42 (`TEST-EVIDENCE.md §3`). **Branches are below the 10/10 bar's 85 %**, so the requirement is met for statements/lines/functions and not met for branches. Next action is `OI-COV-1`/`OI-COV-2` (tests, not exclusions), then raise the `--branches` floor to 85 |
| `OI-T-2` | Migration | PARTIAL | `test/migrations-integrity.test.js` (5 tests) statically proves forward/rollback pairing, column coverage for INV-6, and `IF NOT EXISTS` idempotency. Applying and rolling back against a real MariaDB remains `OI-005-6` |
| `OI-T-3` | Performance | PARTIAL | `test/performance-budget.test.js` (4) and `test/mariadb-query-budget.test.js` (15) cover payload size, census latency and query counts. The browser vitals budgets (LCP/INP/CLS) remain `OI-UX-3` |
| `OI-T-4` | E2E / visual / a11y execution | BLOCKED | No browser binary in the sandbox and no route to download one. The `e2e` job in `.github/workflows/quality-gate.yml` runs `admin-console-ux.spec.ts` + `accessibility.spec.ts` on `dev` against a MariaDB service. Behaviour that does not need a browser moved to `tests/unit` (53 tests, `npm run test:unit`) |
| `OI-T-5` | Chaos / adversarial scripts | PARTIAL | `test/chaos-resilience.test.js` (5) covers RBAC-store, config-store and audit-repository outages in-process. The 12 `scripts/adversarial-*.mjs` still need a live stack and real tokens |
| `OI-T-6` | Full backend suite green | BLOCKED | Requires MariaDB. Command: `DB_HOST=127.0.0.1 DB_NAME=airesume_test npm --prefix backend test`. Four known environmental failures are catalogued in `TEST-EVIDENCE.md §4.2` |

---

## 6. Analysis defects found and corrected during execution

| ID | Defect | Where it was wrong | Correction |
|---|---|---|---|
| `OI-A-1` | "`system.config.manage` gates all generic settings writes" | `09-configuration-gap-register.md`, `06-rca-register.md` RCA-007 | The ladder returns `system.config.write` (`policy.js:93-101` at the analysed commit); ADMIN holds it. The real blockers were `expectedRevision` (`index.js:3888`) and the unassigned `system.config.read` on the read half. Corrected in `DECISION-LOG.md` D-013-1. |
| `OI-A-2` | "8 required-but-unassigned permissions" | `12-appendices.md` §A.2 | 7 of 8 are any-of alternatives, hierarchy-implied, or intentionally SUPER_ADMIN-exclusive. Only `messages.read` was a real gap. Corrected in D-005-2, and the census that produced the count is now a test that models any-of groups. |
| `OI-A-3` | Migration decomposed `users.roles.manage` as `('users','roles')` | first draft of `028_admin_rbac.sql` | `parsePermission` splits at the **last** dot, so the key would have been `users.roles:manage` while the seed stored `users:roles` — a silent loss of role management for ADMIN. Fixed at `028_admin_rbac.sql:107`; the golden-seed test caught it. |
| `OI-A-4` | `adminRbac.js` imported `PERMISSIONS` from `security/auth.js` | first draft | `auth.js` never exported it, and importing it there would create a require cycle whose symptom was `undefined` at first call. Fixed by extracting `security/permissionVocabulary.js`. |

---

## 7. Deferred by decision (not gaps)

| Item | Decision | Reason |
|---|---|---|
| Object-storage adapter | Keep the 501 | A stub that returns success loses the file (RR-006) |
| Legacy SPA compatibility for admin routes | Not maintained | New frontend only (RR-010); the manifest is the single place to add a compatibility rule |
| `secrets.manage` for ADMIN | Refused | It gates the Firebase service-account key; granting it is a platform-wide impersonation primitive (`SECURITY-AND-RBAC-PROOF.md §2`) |
| Editing USER/EMPLOYER/ENTERPRISE_* through this API | Refused (409) | Tenant authority is owned by the enterprise module; two writable sources diverge (D-005-10) |
| `claims.permissions` support | Removed | Nothing mints the claim; an unauditable grant is indistinguishable from a compromise (D-005-3) |
