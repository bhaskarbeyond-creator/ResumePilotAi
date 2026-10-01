# IME365 Route Migration Matrix

Every route discovered in `src/main.jsx`, `DashboardMain.jsx`, and
`Admin.jsx` is listed with an explicit disposition. No route is orphaned.

Disposition key: **KEEP** (canonical) · **REDIRECT** (one-way compatibility) ·
**MOVE** (canonical path changed) · **REPLACE** (implementation replaced)

## Candidate portal — canonical `/dashboard`

| Current route | Action | Canonical route |
|---|---|---|
| `/dashboard` | KEEP | `/dashboard` |
| `/dashboard/settings` | KEEP | `/dashboard/settings` |
| `/dashboard/favorites` | KEEP | `/dashboard/favorites` |
| `/dashboard/interview` | KEEP | `/dashboard/interview` |
| `/dashboard/portfolios` | KEEP | `/dashboard/portfolios` |
| `/dashboard/cover-letters` | KEEP | `/dashboard/cover-letters` |
| `/dashboard/applied-jobs` | KEEP | `/dashboard/applied-jobs` |
| `/dashboard/job-tracker` | KEEP | `/dashboard/job-tracker` |
| `/dashboard/jobs`, `/dashboard/jobs/portal`, `/dashboard/jobs/portal/:jobId`, `/dashboard/jobs/browse`, `/dashboard/jobs/category/:catName` | KEEP | unchanged |
| `/dashboard/plans` | KEEP | `/dashboard/plans` |
| `/dashboard/support` | KEEP | `/dashboard/support` |
| `/dashboard/messages` | KEEP | `/dashboard/messages` |
| `/dashboard/tickets` | REDIRECT | `/dashboard/support` |
| `/dashboard/help` | REDIRECT | `/dashboard/support` |
| `/dashboard/job-matching` | REDIRECT | `/dashboard/job-tracker` |
| `/build-resume/*` | KEEP | `/build-resume/*` (canonical resume builder) |
| `/coverletter` | KEEP | `/coverletter` |
| `/portfolio/builder` | KEEP | `/portfolio/builder` |
| `/dashboard2` | REDIRECT | `/dashboard` |
| `/dashboard2/*` | REDIRECT | `/dashboard/*` |
| `/dashboard/my-employments` | REDIRECT | `/employer/jobs` |
| `/dashboard/my-companies` | REDIRECT | `/employer/company` |

## Employer portal — canonical `/employer` (NEW)

| Current route | Action | Canonical route |
|---|---|---|
| `/employer` | REPLACE (new shell) | `/employer` |
| `/employer/jobs` | REPLACE | `/employer/jobs` |
| `/employer/applicants` | REPLACE | `/employer/applicants` |
| `/employer/messages` | REPLACE | `/employer/messages` |
| `/employer/company` | REPLACE | `/employer/company` |
| `/employer/settings` | REPLACE | `/employer/settings` |
| `/employer/*` (unknown) | REDIRECT | `/employer` |

Capability was **moved, not removed**: `EmployerDashboard`,
`CompaniesManagement`, `DashboardMessages`, `AddCompanyModal`,
`EditJobModal`, `JobApplicationsModal`, and `SendMessageDialog` are all still
mounted, now inside the employer shell.

## Organization portal — canonical `/org`

| Current route | Action | Canonical route |
|---|---|---|
| `/org` | REPLACE (new canonical) | `/org` |
| `/org/:slug` | REPLACE (new canonical) | `/org/:slug` |
| `/org/:slug/*` | REPLACE (new canonical) | `/org/:slug/*` |
| `/enterprise` | REDIRECT | `/org` |
| `/enterprise/*` | REDIRECT | `/org/*` |

## Admin console — canonical `/admin`

| Current route | Action | Canonical route |
|---|---|---|
| `/adm` | MOVE | `/admin` → `/admin/dashboard` |
| `/adm/dashboard` | MOVE | `/admin/dashboard` |
| `/adm/health` | MOVE | `/admin/health` |
| `/adm/queues` | MOVE | `/admin/queues` |
| `/adm/operations` | MOVE | `/admin/operations` |
| `/adm/attention` | MOVE | `/admin/attention` |
| `/adm/audit-logs` | MOVE | `/admin/audit-logs` |
| `/adm/security` | MOVE | `/admin/security` |
| `/adm/help-desk` | MOVE | `/admin/help-desk` |
| `/adm/users` | MOVE | `/admin/users` |
| `/adm/operators` | MOVE | `/admin/operators` |
| `/adm/messages` | MOVE | `/admin/messages` |
| `/adm/employer-applications` | MOVE | `/admin/employer-applications` |
| `/adm/jobs-manager` | MOVE | `/admin/jobs-manager` |
| `/adm/company-management` | MOVE | `/admin/company-management` |
| `/adm/tenants` | MOVE | `/admin/tenants` |
| `/adm/blog-management` | MOVE | `/admin/blog-management` |
| `/adm/landing-pages` | MOVE | `/admin/landing-pages` |
| `/adm/reviews` | MOVE | `/admin/reviews` |
| `/adm/trustedby` | MOVE | `/admin/trustedby` |
| `/adm/phrases` | MOVE | `/admin/phrases` |
| `/adm/settings` | MOVE | `/admin/settings` |
| `/admin/*` | REDIRECT | `/admin/*` (now canonical; was alias to `/adm`) |
| `/platform/*` | REDIRECT | `/admin/*` |

## Public / unchanged routes

`/`, `/login`, `/contact`, `/p/*`, `/cookies`, `/terms`, `/privacy-policy`,
`/about`, `/jobs`, `/jobs/*`, `/blog`, `/blog/:slug`, `/portfolios`,
`/export/Cv<N>/*`, `/export/Cover<N>/*`, `/shared/*`, `/front`, `*` (NotFound).

## Redirect model

All compatibility redirects are **one-way** and implemented in `src/main.jsx`:

```jsx
function AdmAliasRedirect() {          // /adm/*      -> /admin/*
    const location = useLocation();
    const suffix = location.pathname.replace(/^\/adm/, '') || '/';
    return <Navigate to={`/admin${suffix}${location.search}${location.hash}`} replace />;
}
function PlatformAliasRedirect() {     // /platform/* -> /admin/*
    /* strips /platform */
}
function EnterpriseLegacyRedirect() {   // /enterprise/* -> /org/*
    /* strips /enterprise */
}
function Dashboard2Redirect() {        // /dashboard2/* -> /dashboard/*
    /* strips /dashboard2 */
}
```

Guarantees enforced by `tests/four-portal-architecture.test.mjs`:

- No bidirectional alias: no redirect targets `/adm`, `/dashboard2`, or `/enterprise`.
- `location.search` and `location.hash` are appended on every redirect.
- `replace` is used, so compatibility hops do not pollute history.
- Suffix is preserved (`/adm/users` → `/admin/users`).
- Every alias stays behind `RequireAuthenticated`.

## Security note on admin aliases

`/adm/*` and `/platform/*` redirect **into** the canonical console, they do not
bypass it. Browser verification confirms a non-admin session hitting `/adm/users`
is redirected to `/admin/users` and then denied by RBAC to `/dashboard` — the
alias is not an authorization bypass.
