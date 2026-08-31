# Page Matrix — Complete Route Inventory

> **Audit SHA**: `06f443d` | **Source**: `main.jsx`, `Admin.jsx`, `DashboardMain.jsx`, `EnterpriseConsole.jsx`

## Public Routes (No Auth Required)

| Route | Component | Purpose | Backend Dependencies |
|---|---|---|---|
| `/` | `Welcome` | Landing page | `/api/platform/public-config` |
| `/login` | `Welcome` (login mode) | Auth entry | Firebase Auth |
| `/sign-up` | Redirect to `/login` | Legacy alias | None |
| `/contact` | `Contact` | Contact form | `/api/contact` |
| `/features` | `Features` | Feature showcase | None (static) |
| `/billing/plans` | `Plans` | Pricing page | `/api/platform/public-config` |
| `/pricing` | `Plans` | Pricing alias | Same |
| `/jobs` | `JobsLanding` | Job board landing | `/api/jobs-data` |
| `/jobs/portal` | `MainJobListings` | Job listings | `/api/jobs-data` |
| `/jobs/portal/:jobId` | `MainJobListings` | Job detail | `/api/jobs-data/:id` |
| `/jobs/browse` | `MainJobListings` | Browse jobs | `/api/jobs-data` |
| `/jobs/categories` | `JobsLanding` | Job categories | `/api/jobs-data` |
| `/jobs/category/:catName` | `MainJobListings` | Category filter | `/api/jobs-data` |
| `/blog` | `BlogList` | Blog listing | `/api/blog-data` |
| `/blog/:slug` | `BlogPost` | Blog article | `/api/blog-data/slug/:slug` |
| `/shared/:resumeId` | `PublicResume` | Shared resume | `/api/resumes/:id/publication` |
| `/portfolio/:slug` | `PublicPortfolio` | Public portfolio | `/api/portfolios/public/:slug` |
| `/portfolios` | `PortfolioGallery` | Portfolio gallery | `/api/portfolios/public` |
| `/p/:custompage` | `CustomePage` | Custom CMS page | `/api/public/custom-pages/:slug` |
| `/front` | Redirect to `/` | Legacy | None |

## Auth-Optional Routes

| Route | Component | Auth Guard | Notes |
|---|---|---|---|
| `/build-resume/*` | `BuildResume` | `MaybeApplicationShell` (optional auth) | Can be used without login |
| `/create-resume/*` | `BuildResume` | Same | Alias |
| `/create-resume` | `BuildResume` | Same | Alias |

## Authenticated Routes

| Route | Component | Auth Guard | Role Required |
|---|---|---|---|
| `/dashboard/*` (index) | `DashboardMain` → `DashboardHomepage` | `RequireAuthenticated` | Any authenticated |
| `/dashboard/settings` | `DashboardSettings` | Same | Any authenticated |
| `/dashboard/messages` | `DashboardMessages` | Same | Any authenticated |
| `/dashboard/favorites` | `DashboardFavourites` | Same | Any authenticated |
| `/dashboard/interview` | `DashboardInterviews` | Same | Any authenticated |
| `/dashboard/cover-letters` | `CoverLetter` | Same | Any authenticated |
| `/dashboard/portfolios` | `DashboardPortfolios` | Same | Any authenticated |
| `/dashboard/applied-jobs` | `AppliedJobs` | Same | Any authenticated |
| `/dashboard/job-tracker` | `JobTracker` | Same | Any authenticated |
| `/dashboard/my-employments` | `EmployerDashboard` | Same | EMPLOYER intent |
| `/dashboard/my-companies` | `CompaniesManagement` | Same | EMPLOYER intent |
| `/dashboard/plans` | `Billing` | Same | Any authenticated |
| `/dashboard/job-matching` | Redirect → `job-tracker` | Same | Legacy |
| `/coverletter` | `CoverLetter` | `RequireAuthenticated` | Any authenticated |
| `/cover-letter` | `CoverLetter` | Same | Alias |
| `/portfolio/builder` | `PortfolioBuilder` | `RequireAuthenticated` | Any authenticated |
| `/blog-editor` | `BlogEditor` | `RequireAuthenticated` | Any authenticated* |
| `/blog-editor/:postId` | `BlogEditor` | Same | Same* |

## Admin Routes (via `/adm/*`)

| Route | Component | Purpose |
|---|---|---|
| `/adm/` | Redirect → `dashboard` | Default |
| `/adm/dashboard` | `Dashboard` | Admin overview |
| `/adm/audit-logs` | `AdminAuditLogs` | Audit trail |
| `/adm/queues` | `PlatformQueues` | Queue management |
| `/adm/tenants` | `PlatformTenants` | Tenant management |
| `/adm/security` | `PlatformSecurity` | Security dashboard |
| `/adm/operations` | `PlatformOperations` | Operations center |
| `/adm/attention` | `PlatformAttention` | Attention items |
| `/adm/health` | `PlatformHealth` | Platform health |
| `/adm/operators` | `PlatformOperators` | Operator management |
| `/adm/settings` | `Settings` (34 sub-panels) | All settings |
| `/adm/user/ss` | `UserEdit` | User edit |
| `/adm/users` | `UsersManager` | User management |
| `/adm/messages` | `Messages` | Admin messaging |
| `/adm/help-desk` | `HelpDesk` | Support tickets |
| `/adm/reviews` | `Reviews` | Review management |
| `/adm/trustedby` | `TrustedBy` | Trusted logos |
| `/adm/employer-applications` | `EmployerApplications` | Employer apps |
| `/adm/jobs-manager` | `JobsManager` | Job management |
| `/adm/company-management` | `CompanyManagement` | Company management |
| `/adm/blog-management` | `BlogManagement` | Blog CMS |
| `/adm/landing-pages` | `LandingPages` | Custom pages |
| `/adm/phrases` | `Phrases` | AI phrases |
| `/admin/*` | `AdminAliasRedirect` → `/adm/*` | Legacy alias |
| `/platform/*` | `PlatformAliasRedirect` → `/adm/*` | Legacy alias |

## Enterprise Routes (via `/enterprise/*`)

| Tab ID | Component | Permission Required |
|---|---|---|
| `overview` | `EnterpriseOverviewTab` | None (any enterprise member) |
| `resumes` | `EnterpriseResumesTab` | None |
| `members` | `EnterpriseUsersTab` | `tenant.members.read` |
| `teams` | `EnterpriseTeamsTab` | `workspace.read` |
| `workspaces` | `EnterpriseWorkspacesTab` | `workspace.read` |
| `access` | `EnterpriseRolesTab` | `tenant.roles.manage` |
| `ai` | `EnterpriseAiTab` | `tenant.ai.manage` |
| `security` | `EnterpriseSecurityTab` | `tenant.security.read` |
| `usage` | `EnterpriseUsageTab` | `tenant.usage.read` |
| `email` | `EnterpriseEmailTab` | `tenant.settings.write` |
| `audit` | `EnterpriseAuditTab` | `tenant.audit.read` |
| `support` | `EnterpriseSupportTab` | `tenant.settings.write` |
| `settings` | `EnterpriseSettingsTab` | `tenant.settings.write` |
| `platform` | `EnterprisePlatformTab` | `platformOnly` (server flag) |

## Export Routes (Dynamic)

| Pattern | Count | Auth |
|---|---|---|
| `/export/Cv{1-51}/:resumeId/:language` | 51 routes | `RequireExportAccess` |
| `/export/Cover{1-4}/:resumeId/:language` | 4 routes | `RequireExportAccess` |

## Dead/Redirect Routes

| Route | Status | Evidence |
|---|---|---|
| `/dashboard2/*` | DEAD — redirects to `/dashboard/*` | `main.jsx:470-471` imports but never renders Dashboard2 |
| `/resume/:step` | REDIRECT → `/build-resume/heading` | `main.jsx:438` |
| `/dashboard/job-matching` | REDIRECT → `job-tracker` | `DashboardMain.jsx:503` |

## Page Gaps

### PAGE-001: Blog Editor No Permission Check
**Finding**: `/blog-editor` route requires auth but no role/permission check. Any authenticated user can access.
**Backend**: Blog post creation/update APIs need `system.config.write` permission (via admin guard).
**Impact**: Users can access the editor UI but cannot save (403 from backend).
**Severity**: P3 MEDIUM

### PAGE-002: Dashboard2 Bundle Waste
**Finding**: `Dashboard2` component tree is lazy-loaded and code-split but never rendered.
**Impact**: ~1.3KB component + dependencies in bundle.
**Severity**: P4 LOW
