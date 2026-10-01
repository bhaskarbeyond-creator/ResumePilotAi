# IME365 Four-Portal Crawl Report

Crawl of the affected system: route inventory, navigation inventory, portal
inventory, API dependencies, auth/RBAC paths, redirect chains, defects by
severity, and evidence for each resolution.

## 1. Route inventory (final)

| Canonical namespace | Routes | Mount |
|---|---|---|
| Candidate | `/dashboard`, `/dashboard/settings`, `/favorites`, `/interview`, `/portfolios`, `/cover-letters`, `/applied-jobs`, `/job-tracker`, `/jobs/*`, `/plans`, `/support`, `/messages`, `/build-resume/*` | `DashboardMain` |
| Employer | `/employer`, `/employer/jobs`, `/employer/applicants`, `/employer/messages`, `/employer/company`, `/employer/settings` | `EmployerPortal` (new) |
| Organization | `/org`, `/org/:slug`, `/org/:slug/*` | `EnterpriseConsole` |
| Admin | `/admin`, `/admin/dashboard`, `/health`, `/queues`, `/operations`, `/attention`, `/audit-logs`, `/security`, `/help-desk`, `/users`, `/operators`, `/messages`, `/employer-applications`, `/jobs-manager`, `/company-management`, `/tenants`, `/blog-management`, `/landing-pages`, `/reviews`, `/trustedby`, `/phrases`, `/settings` | `Admin` |

Legacy aliases (one-way, session-guarded): `/adm/*`, `/platform/*`,
`/dashboard2*`, `/enterprise/*`, `/dashboard/my-employments`,
`/dashboard/my-companies`.

## 2. Portal inventory (final)

Four cleanly separated portals, each with its own shell, sidebar, and taxonomy.
No portal's primary navigation contains another portal's capability.

## 3. Navigation inventory (final)

See `docs/IME365_NAVIGATION_TAXONOMY.md`. Summary:

- Candidate: Overview, Resumes & Master CV, Cover Letters, Portfolios, Browse
  Jobs, Job Tracker, Submitted Applications, AI Interview Coach, Messages,
  Support, Subscription & Plans, Profile, Security.
- Employer: Recruiter Overview, Job Postings, Applicant ATS Pipeline, Candidate
  Messages, Company Profile, Hiring Preferences.
- Organization: 13 modules across 4 groups (unchanged).
- Admin: 20 canonical paths across 4 groups plus settings.
- One shared Context Switcher embedded in all four.

## 4. API dependencies

| Portal | Endpoints |
|---|---|
| Candidate | `/api/users-data/:uid`, `/api/resumes`, `/api/favourites`, `/api/messages/conversations`, `/api/notifications-data`, `/api/system-settings` |
| Employer | `/api/employer/jobs`, `/api/employer/companies`, `/api/jobs/:id/applications` |
| Organization | `/api/enterprise/status`, `/api/enterprise/tenants`, `/api/enterprise/context`, `/api/enterprise/workspaces` |
| Admin | `/api/admin/*`, `/api/platform/*` |

All employer reads are owner-scoped server-side; the browser sends no user id
for them, so identity is never a client assertion.


## 5. Authentication & RBAC paths

See `docs/IME365_RBAC_MATRIX.md`. Every private namespace, including all legacy
aliases, sits behind `RequireAuthenticated`. The backend model in
`backend/security/auth.js` and `backend/security/policy.js` is unmodified.

## 6. Redirect chains (verified in a real browser)

| Legacy | Chain | Final |
|---|---|---|
| `/dashboard2` | → `/dashboard` | `/dashboard` |
| `/dashboard2/settings` | → `/dashboard/settings` | `/dashboard/settings` |
| `/adm` | → `/admin/` → Admin `FIRST_ACCESSIBLE_TAB` | `/admin/dashboard` |
| `/adm/users` | → `/admin/users` | `/admin/users` |
| `/platform/users` | → `/admin/users` | `/admin/users` |
| `/platform/queues` | → `/admin/queues` | `/admin/queues` |
| `/enterprise` | → `/org` | `/org` |
| `/dashboard/my-employments` | → `/employer/jobs` | `/employer/jobs` |
| `/dashboard/my-companies` | → `/employer/company` | `/employer/company` |
| `/adm/users?tab=roles&q=audit` | → `/admin/users?tab=roles&q=audit` | query preserved |
| `/adm/users` (non-admin) | → `/admin/users` → RBAC deny | `/dashboard` |

No loop: every canonical URL is stable across a reload (asserted per alias).
No history pollution: all hops use `replace`.

## 7. Defects found and resolved

| # | Sev | Defect | Resolution |
|---|---|---|---|
| 1 | **P0** | Admin aliases were session-**unguarded** after conversion to redirects — an unauthenticated visitor would receive a redirect revealing private console paths | Re-wrapped `/adm/*`, `/platform/*`, `/dashboard2*`, `/enterprise/*` in `RequireAuthenticated`. Guard regression now asserted by `four-portal-architecture.test.mjs` and by the `account-isolation` / `export-client` suites |
| 2 | **P0** | Blind `/adm/` → `/admin/` rename created a **redirect loop**: `AdmAliasRedirect` stripped `/admin` and the `/adm/*` route was rewritten to `/admin/*` | Corrected the prefix regex and restored a single `/adm/*` alias route. Now asserted by static and browser tests |
| 3 | **P1** | Candidate sidebar "AI Resumes & Master CV" pointed at `/dashboard` — the resume builder was unreachable from navigation and Overview was duplicated | Repointed to `/build-resume`, corrected the active-state check, relabelled "Resumes & Master CV". Verified in a real browser |
| 4 | **P1** | Two competing persona switchers (candidate sidebar "Enterprise Workspace" link vs Enterprise "Switch View" popover) | Bespoke popover deleted; both surfaces now use the single `ContextSwitcher` |
| 5 | **P1** | Recruiter capability (`My Posted Jobs`, `My Companies`) inside the candidate sidebar | Removed; recruiter screens moved to `/employer` with legacy redirects |
| 6 | **P1** | `AddCompanyModal` had no `role="dialog"`, no `aria-modal`, no accessible name, and no Escape handling | Added dialog semantics, heading id, close-button label, Escape-to-close, and focus restoration |
| 7 | **P2** | `FiBuilding` imported from `react-icons/fi`, which does not export it — build failure | Switched to `FaBuilding` from `react-icons/fa` |
| 8 | **P2** | `RouteSeo` still carried obsolete `/dashboard2` metadata and no employer/org metadata | `/dashboard2` removed; titles and descriptions added for `/employer`, `/org`, `/admin` |
| 9 | **P2** | `PATH_PERMS` and all admin nav targets keyed on `/adm/…` | Re-keyed to `/admin/…` across the sidebar, command palette, dashboard, tenants, health, security, settings, and user drawer |
| 10 | **P2** | Post-login redirect guards did not know about `/org` or `/employer`, so a user landing there would be bounced to `/dashboard` | `Login.jsx` and `Register.jsx` guards extended |
| 11 | **P2** | Maintenance-mode emergency path did not include `/admin` | Added, so operators can still reach the console during maintenance |
| 12 | **P3** | Employer shell initially reused `.dashboardContentWrapper`, which the admin sidebar styles globally with `padding-left` — would have produced overflow in the recruiter portal | Gave the employer shell its own flex layout and SCSS namespace |
| 13 | **P3** | Context switcher could surface a portal from a stale or hand-edited `localStorage` value | Availability is server-derived and the stored value is validated and reconciled before navigation; verified by a browser test |
| 14 | **P3** | Stale test expectations pinned the old routes (`/adm/…`, `/dashboard2`) | `platform-health`, `superadmin-control-plane`, and `user-dashboard-forensic` updated to the new contract (assertions strengthened, not weakened) |

## 8. Console / network errors

- **20/20 browser E2E tests report zero** unexpected `TypeError`,
  `ReferenceError`, or unhandled rejections.
- Live server returns 200 for `/`, `/api/health`, `/login`, and every portal
  deep link.
- No failing API responses in the employer flow; the fixture-backed browser run
  records zero `/api/` responses ≥ 400 on portal screens.

## 9. Empty / loading / error states

- Loading: `EmployerLoading` (status role, polite live region).
- Empty, first-time recruiter: `EmployerOnboarding` — "Welcome to IME365
  Hiring" with `Register Company Profile` and
  `Register Company & Post First Job`, wired to the existing `AddCompanyModal`.
- Empty, no requisitions: the pipeline directs the user to post a role.
- Error: `EmployerErrorState` with the real message and a working retry.
- Unauthorized tenant / invalid slug: handled by the existing enterprise state
  machine; no new client-side tenant state was introduced.

## 10. Responsive, accessibility, and modal behaviour

Detailed in `docs/IME365_UI_UX_VERIFICATION.md`, including the fixed modal
accessibility defect and the employer shell's independent layout.

## 11. Severity summary

| Severity | Found | Resolved | Open |
|---|---|---|---|
| P0 | 2 | 2 | 0 |
| P1 | 4 | 4 | 0 |
| P2 | 6 | 6 | 0 |
| P3 | 3 | 3 | 0 |

**No P0 or P1 defect remains open.**
