# Candidate execution baseline — 2026-10-14

## Actual state and governance
- Branch: `arena/652ee1d3-resumepilotai`; HEAD `7490f087bf61b5cd3614a470bc3bf4a73ac3d066`; initially clean. No user changes overwritten.
- Node 22.22.3 / npm 10.9.8, Linux sandbox. Root and backend locked dependencies installed. No deployment, migration, remote mutation or live fault injection authorised/executed.
- Read `.agents/AGENTS.md` and `.clinerules`. Their historical certifications are not current results. Frozen modules remain untouched pending explicit Lead approval.
- `bridge status` and `bridge inbox --role dev` both fail: command not found. No independent reviewer is available through this environment. Lead decision: **BLOCKED — VERIFICATION UNAVAILABLE**, not approved.
- Windows XAMPP is unavailable. Browser tests use a foreground, disposable Vite test harness closed in `finally`, not a detached application server or production service. Synthetic fixtures are confined to tests, labelled SIMULATED. No application authentication bypass is added.

## Architecture observed
React 19 / React Router 7 / Vite 8 frontend; Express backend, MariaDB authoritative application storage, Firebase identity plane. Nested main/dashboard/builder routers. Candidate navigation is in `candidateNavigation.js`. `TemplateRenderer` selects SmartResumeComposer for CVs; legacy CV component tests alone do not prove production rendering. Cover renderers have a separate path. 51 SQL migration files were found. CI starts pinned MariaDB 11.4, migrates and exercises tests; neither Docker nor a MariaDB executable is installed here. Providers and Firebase are not configured; outbound access excludes live application/provider hosts.

## Reproducible baseline
Logs: `artifacts/candidate-audit-20261014/` (ignored regenerable evidence).

| Command | Actual outcome |
|---|---|
| `npm ci --no-audit --no-fund` | success |
| `npm --prefix backend ci --ignore-scripts --no-audit --no-fund` | success |
| `npm run build` | success; Vite 9.22 s under concurrent baseline load, direct-eval and large-chunk warnings; not a controlled performance benchmark |
| `npm run lint` | exit 0, **243 warnings**, zero errors; not warning-free approval |
| `npm run test:product` after both installs | 734 tests, 729 pass, 5 fail; chained downstream suites did not run |
| `npm run test:security` after both installs | 881 tests, 823 pass, 58 fail |

Initial root-only runs (686/525 test denominators) had missing backend dependencies; retain those logs but use `*-installed.log` as baseline. Pre-existing product failures concern builder structural assertions, legacy wizard assertions and frozen hash assertions. Security failures include missing MariaDB/live infrastructure as well as AI contract, ownership and architecture assertions; do not classify all as infrastructure without individual triage.

## First remediation plan (T2)
Scope: notification page only, plus test-only harness and audit reports. No frozen source, security boundary, backend contract, migration or provider changes.

Acceptance: StrictMode remount loads; stale/unmounted responses cannot update current UI; row/bulk mutations cannot overlap and roll back unrelated successful work; duplicate events issue one request; success toast uses dashboard's positional contract; failed requests roll back honestly and can retry; long content fits all eight specified viewports; automated accessibility findings recorded, not hidden.

Trace: DashboardMain → DashboardNotifications → platform.apiJson → authenticated `/api/notifications-data` → notificationsData router → owner-scoped MariaDB update → optimistic UI commit/rollback. Browser harness substitutes only the API boundary. It does **not** verify identity, database or durable persistence. Regression uses real component rendering, controlled delayed responses and HTTP faults. Baseline screenshots precede source edits. Rollback is a scoped revert of the notification component and added test files, not a repository reset.

Can this be better and optimised for 10/10? Yes: test simultaneous row/bulk writes and StrictMode teardown, not just static source assertions. Independent Lead challenge remains required after implementation.
