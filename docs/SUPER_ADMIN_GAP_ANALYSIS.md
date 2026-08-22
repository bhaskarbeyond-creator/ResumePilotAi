# Super Admin `/adm` Gap Analysis and Remediation Register

## Scope and method

This register was built from the repository state, route code, tests, build output, and external unauthenticated production probes on 2026-08-22. Prior readiness claims were not treated as evidence.

## Closed or materially remediated gaps

| ID | Finding / RCA | Fix implemented | Evidence | Status |
|---|---|---|---|---|
| G-01 | `/adm/tenants` called `/api/enterprise/platform/tenants`. The Enterprise router returns `API route not found` when tenancy rollout is disabled. | Created `/api/platform/tenants*` Super Admin control-plane adapter outside the Enterprise feature gate; updated tenant UI to use it. | `backend/routes/platform.js`, `PlatformTenants.jsx`, `npm run test:admin:contract` | PASS local |
| G-02 | Platform tenant actions were not protected by typed action confirmation in the `/adm` UI/API. | Typed confirmation phrase required in UI and backend for suspend/reactivate/decommission. | platform integration tests | PASS local |
| G-03 | Queue replay could reset an existing non-DLQ event and did not require typed confirmation/recent auth. | DLQ-only check, one-of request validation, bounded all replay, typed confirmation, SUPER_ADMIN + recent auth. | `superadmin-platform.test.js` | PASS local |
| G-04 | Generic user endpoint could mutate a SUPER_ADMIN target (suspend/membership), while generic deletion permitted peer Super Admin deletion. | Generic mutation and deletion now reject `SUPER_ADMIN_TARGET_PROTECTED`; UI marks target locked. | server role matrix test | PASS local |
| G-05 | User editor did not await mutations and could show a false success; it submitted several changes to an API that permits one state transition per request. | Rebuilt editor to submit sequential audited transitions, refresh after failure, and require typed confirmation. | production build; browser proof pending | PASS code/build; UNVERIFIED browser |
| G-06 | Phrase module used direct Firestore writes despite deny-by-default rules, leading to broken controls/native alerts. | Added audited Admin phrase API, revision checks, public read-only projection, rebuilt phrase UI. | phrase CRUD integration test | PASS local |
| G-07 | Legacy `/admin` links had no client route; Enterprise switcher, navbar, and Firebase settings link could fall through. | Replaced source links and added `/admin/* → /adm/dashboard` compatibility redirect. | source contract test + build | PASS local |
| G-08 | Dashboard hardcoded “Firestore Active”, “Outbox Healthy”, and “Multi-Tenant Active” when observation was unavailable. | Health route reads without mutation and reports `UNAVAILABLE`; UI renders observed statuses. | platform route test + build | PASS local |
| G-09 | Native browser confirms/alerts remained in several Admin destructive flows. | Added `AdminDialog`; migrated tenant, queue, phrase, AI quota, blog category, page delete, and invoice feedback controls. | `test:admin:contract` | PASS source/build |
| G-10 | `/adm` fixed sidebar obscured mobile content. | Added mobile drawer trigger/backdrop/transition and responsive offset CSS. | build; screenshot/browser test blocked | PASS code/build; UNVERIFIED browser |
| G-11 | Users manager read the entire Firestore collection in-browser and lacked a server pagination/filter contract. | Added curated `/api/admin/users` directory API and replaced the roster with server query/filter/page UI. | user-directory integration test + build | PASS local; UNVERIFIED browser |
| G-12 | User roster exposed disabled merge/restore controls whose backend deliberately returned failure. | Removed dead merge/backup UI and unreachable client helpers rather than advertising unsafe identity merge. | `test:admin:contract` dead-control assertion | PASS local |

## Open gaps and gates

| ID | Gap | Severity | RCA | Required remediation / proof | Current status |
|---|---|---:|---|---|---|
| O-01 | Production static SPA returns HTTP 500 for `/`, `/adm`, `/enterprise`, `/index.html` | P0 | Deployment artifact/docroot/rewrite drift; API service remains reachable | Restore an exact built frontend artifact; verify docroot index/assets/rewrite; run `/adm` browser smoke | FAIL live |
| O-02 | Authenticated production Super Admin exercise is absent | P0 | No approved disposable production credentials/session in the environment | Approved QA Super Admin + disposable records, prove UI/API/DB/audit/cleanup | UNVERIFIED |
| O-03 | Live SHA, backend SHA, frontend artifact digest, backup, rollback are unverified | P0 | Deployment connection alias unavailable; no release performed in this run | Reconnect deployment target and execute release/rollback checklist | UNVERIFIED |
| O-04 | Playwright browser run is blocked | P1 | No Chromium binary; CDN install reset connection | Browser-capable runner; run `npm run test:admin:e2e`, inspect shots/network | UNVERIFIED |
| O-05 | Full responsive and keyboard assistive validation is missing | P1 | Depends on browser runner | Verify all six required viewport classes, focus traps, keyboard traversal and contrast | UNVERIFIED |
| O-06 | User roster server API intentionally caps an unindexed operational window at 1,000 records | P2 | Legacy profile schema lacks normalized search/index fields | Add indexed/cursor-backed directory storage before certifying very large tenant/user populations | UNVERIFIED |
| O-07 | Audit screen cursor/deep-link workflow is not browser-proven | P2 | Server keyset pagination and URL-backed filters are implemented, but no browser execution occurred | Run authenticated browser deep-link/cursor/CSV workflow | UNVERIFIED |
| O-08 | Production runtime readiness reports encryption `none`, workers disabled and PDF isolation required | P1 | Runtime configuration differs from target operational posture | Configure supported runtime controls and validate with real checks | FAIL/UNVERIFIED live |
| O-09 | MFA/recent-auth production scenario has not been executed with a real identity | P1 | No production authentication test session | Test normal, expired, revoked, MFA/no-MFA, reauth and post-reauth mutation | UNVERIFIED |

## Root-cause analysis: live HTTP 500

Observed external facts:

- `https://airesume.projectdemo.guru/api/healthz` returned `{"status":"ok","firebaseAdminConfigured":true}`.
- `https://airesume.projectdemo.guru/api/readyz` returned `status: ready`.
- `https://airesume.projectdemo.guru/`, `/adm`, `/enterprise`, and `/index.html` returned HTTP 500 through the available external page probe.
- `robots.txt` remained reachable.

The evidence isolates the immediate failure to static SPA serving rather than the Node health API. Possible concrete causes include a missing `index.html`/asset release, incorrect document root, stale root `.htaccess` rewrite rules, or a web-server handler error. The repository cannot prove which one without server logs/filesystem access. The SSH host alias `airesume` configured by the old deployment script was not resolvable from this environment, so guessing and deploying would be unsafe.

## Release exit criteria

No gap is closed by documentation. All open P0/P1 items must be proven in a deployment-capable environment before a freeze claim is permitted.
