# IME365 Dashboard Architecture — Baseline Report

Captured **before** the four-portal refactor, from repository evidence only.

| Field | Value |
|---|---|
| Branch | `main` |
| Baseline commit | `8cc41894a9782a88de079f011b917c1690913d50` |
| Working tree at start | Clean except a pre-existing unrelated edit to `artifacts/docx-parity-matrix.md` (preserved untouched) |
| Frontend | React 19, Vite 8, React Router 7, Tailwind 4, SCSS design tokens |
| Backend | Node/Express 5, MariaDB, port 8080, MariaDB is the authoritative store |
| Web server | Apache vhost `https://ime365.local/`, `/api` reverse-proxied to 127.0.0.1:8080 |

> The directive described "React 18 / Router v6". The repository is actually
> **React 19.1 / react-router-dom 7.18.2**. This baseline reflects the real
> repository, and all work targets the installed versions.

## Build / test status at baseline

| Gate | Command | Baseline result |
|---|---|---|
| Build | `npm run build` | exit 0 |
| ESLint | `npx eslint . --quiet` | exit 0 |
| Static security | `npm run test:security:static` | 44/44 pass |
| Backend | `cd backend && npm test` | 821 tests, 2 fail (see Pre-existing failures) |
| Product | `npm run test:product` | 497 tests, 2 fail |

## Pre-existing failures (NOT caused by this work)

Both were reproduced on a pristine checkout of the baseline commit with all
refactor changes stashed (`git stash push -u`), proving they are environmental:

1. `backend/test/forensic-data-lineage.test.js` — "12. Domain: Support Tickets
   Lineage", `500 !== 200` on `GET /api/admin/support/tickets`. Local MariaDB
   support-ticket state. Resolves on a clean re-run (final backend gate is
   821/821).
2. `tests/interview-coach-lifecycle.test.mjs` — "role input rendered". Fails
   identically at the baseline commit. Still failing at final certification.

## Route inventory (baseline)

| Route | Component | Notes |
|---|---|---|
| `/dashboard/*` | `DashboardMain` | Candidate + recruiter mixed |
| `/dashboard2`, `/dashboard2/*` | `DashboardMain` | **Duplicate mount** of the same shell |
| `/dashboard/my-employments` | `EmployerDashboard` | Recruiter inside candidate sidebar |
| `/dashboard/my-companies` | `CompaniesManagement` | Recruiter inside candidate sidebar |
| `/enterprise/*` | `EnterpriseConsole` | No `/org/:slug` namespace |
| `/adm/*` | `Admin` | **Canonical** admin namespace |
| `/admin/*` | `AdminAliasRedirect` → `/adm/*` | Reverse of target architecture |
| `/platform/*` | `PlatformAliasRedirect` → `/adm/*` | Reverse of target architecture |
| `/build-resume/*`, `/coverletter`, `/portfolio/builder`, `/export/*`, `/blog-editor`, `/billing/plans`, `/jobs/*`, `/blog*` | various | Unchanged |

## Portal inventory (baseline)

Only **three** logical portals existed, one of which was unnamed:

1. Candidate dashboard (`/dashboard`) — contaminated with recruiter links.
2. Admin console (`/adm`) — correctly namespaced but not at the required path.
3. Enterprise console (`/enterprise`) — no organization slug namespace.
4. No employer portal at all.

## Navigation inventory (baseline)

- **Candidate sidebar** (`ProfileDisplay.jsx`) contained `My Posted Jobs`
  (`/dashboard/my-employments`) and `My Companies` (`/dashboard/my-companies`),
  both gated on `isEmployer` — recruiter capability in the candidate shell.
- The sidebar's "AI Resumes & Master CV" entry pointed at `/dashboard`, making
  the resume builder unreachable from navigation and duplicating Overview.
- The sidebar carried a bespoke `Enterprise Workspace` link, competing with the
  Enterprise console's own "Switch View" popover.
- **Admin sidebar** used `/adm/*` for `PATH_PERMS` and every nav target.

## RBAC behaviour (baseline)

Authoritative model lives in `backend/security/auth.js` (`permissionsFor`) and
`backend/security/policy.js` (`enforceApiPolicy`). Roles: `USER`, `SUPPORT`,
`AUDITOR`, `ADMIN`, `SUPER_ADMIN`; tenant roles `ENTERPRISE_*`.

Frontend mirrors this via `RequireTabPerm` in `Admin.jsx` and `PATH_PERMS` in
`sidebar.jsx`. `FIRST_ACCESSIBLE_TAB` computed the role landing tab. This model
is preserved exactly; only the URL namespace changed.

## API dependencies (baseline)

- Candidate: `/api/users-data/:uid`, `/api/resumes`, `/api/favourites`,
  `/api/messages/conversations`, `/api/notifications-data`, `/api/system-settings`
- Recruiter: `/api/employer/jobs`, `/api/employer/companies`,
  `/api/jobs/:id/applications`
- Enterprise: `/api/enterprise/status`, `/api/enterprise/tenants`,
  `/api/enterprise/context`, `/api/enterprise/workspaces`
- Admin: `/api/admin/*`, `/api/platform/*`

## Known duplicate routes / navigation at baseline

- `/dashboard2` duplicated `/dashboard` as a second full mount.
- `/admin/*` and `/platform/*` were aliases *into* `/adm`, i.e. the reverse of
  the required one-way direction.
- Two competing persona switchers (candidate sidebar link vs Enterprise
  "Switch View" popover).
- Duplicate "Resumes" and "Overview" entries in the candidate sidebar.
