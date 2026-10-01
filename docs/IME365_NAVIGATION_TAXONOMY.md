# IME365 Navigation Taxonomy

Four portals, four disjoint navigation sets. No entry appears in two portals'
primary navigation, and no navigation item targets a removed or redirected route.

## 1. Candidate Dashboard — `/dashboard`

Source: `src/components/Dashboard/ProfileDisplay/ProfileDisplay.jsx`

### MAIN WORKSPACE
| Label | Route | Icon |
|---|---|---|
| Overview & Resumes | `/dashboard` | `FiGrid` |

### CAREER SUITE
| Label | Route | Icon |
|---|---|---|
| Resumes & Master CV | `/build-resume` | `FiFileText` |
| Cover Letters | `/dashboard/cover-letters` | `FiFileText` |
| Portfolios & Web CV | `/dashboard/portfolios` | `FiBarChart` |

### JOB INTELLIGENCE
| Label | Route | Icon |
|---|---|---|
| Browse Job Portal | `/dashboard/jobs` | `FiSearch` |
| Job Tracker | `/dashboard/job-tracker` | `FaListCheck` |
| Submitted Applications | `/dashboard/applied-jobs` | `FaRegComments` |
| AI Interview Coach | `/dashboard/interview` | `FaCrown` |

### COMMUNICATIONS
| Label | Route | Icon |
|---|---|---|
| Messages & Chat (unread badge) | `/dashboard/messages` | `FiMessageSquare` |
| Notifications | (panel) | `FiBell` |

### ACCOUNT & SECURITY
| Label | Route | Icon |
|---|---|---|
| Subscription & Plans | `/dashboard/plans` | `FiSettings` |
| Master Profile Data | `/dashboard/settings?tab=Profile` | `FiUser` |
| Security & 2FA Hub | `/dashboard/settings?tab=Security` | `FiShield` |
| Help Desk & Support | `/dashboard/support` | `FiLifeBuoy` |

**Removed from candidate navigation:** `My Posted Jobs`, `My Companies`, and the
bespoke `Enterprise Workspace` link.

## 2. Recruiter & Hiring Portal — `/employer`

Source: `src/components/EmployerPortal/EmployerSidebar.jsx`

### HIRING COMMAND
| Label | Route |
|---|---|
| Recruiter Overview | `/employer` |

### REQUISITIONS & APPLICANTS
| Label | Route |
|---|---|
| Job Postings | `/employer/jobs` |
| Applicant ATS Pipeline | `/employer/applicants` |
| Candidate Messages | `/employer/messages` |

### BRAND & SETTINGS
| Label | Route |
|---|---|
| Company Profile | `/employer/company` |
| Hiring Preferences | `/employer/settings` |

Utilities: `Candidate Dashboard` (cross-portal), `Admin Console` (only when the
ID token carries a platform role), `Sign Out`.

**Deliberately absent:** resume builder, cover letters, portfolios, and every

## 3. Organization Workspace — `/org/:slug`

Source: `src/enterprise/EnterpriseConsole.jsx` (NAVIGATION, unchanged)

Groups: **Home** · **Organization** · **Governance** · **Administration**

| Module | Permission gate |
|---|---|
| Overview | — |
| Talent & Resumes | — |
| Users & IAM | `tenant.members.read` |
| Teams | `workspace.read` |
| Workspaces | `workspace.read` |
| Roles & permissions | `tenant.roles.manage` |
| AI workspace | `tenant.ai.manage` |
| Security & M2M | `tenant.security.read` |

Tenant visibility remains server-authoritative via `/api/enterprise/context`.
The canonical route is now `/org/:slug/*`; `/enterprise/*` redirects here.

## 4. Platform Admin Console — `/admin`

Source: `src/components/admin/sidebar/sidebar.jsx`

### CONTROL PLANE & OBSERVABILITY
| Label | Route | `PATH_PERMS` |
|---|---|---|
| Command Center | `/admin/dashboard` | `system.config.read` \| `users.read` \| `audit.read` |
| Platform Health | `/admin/health` | `security.read` |
| Queues & DLQ | `/admin/queues` | `system.config.read` \| `security.read` |
| Operations | `/admin/operations` | `system.config.read` \| `security.read` |
| Attention Needed | `/admin/attention` | `system.config.read` \| `tickets.manage` |
| Audit Trail | `/admin/audit-logs` | `audit.read` |
| Security Events | `/admin/security` | `security.read` |

### SUPPORT & IDENTITY
| Label | Route | `PATH_PERMS` |
|---|---|---|
| Help Desk & Tickets | `/admin/help-desk` | `tickets.manage` |
| Users Manager | `/admin/users` | `users.read` |
| Operators & Staff | `/admin/operators` | `*` |
| System Broadcasts | `/admin/messages` | `notifications.send` |

### MARKETPLACE & HIRING MODERATION
| Label | Route | `PATH_PERMS` |
|---|---|---|
| Employer Verifications | `/admin/employer-applications` | `applications.review` \| `users.read` |
| Jobs Moderation | `/admin/jobs-manager` | `jobs.manage` \| `system.config.write` |
| Company Registry | `/admin/company-management` | `jobs.manage` \| `system.config.write` |
| Tenants Registry | `/admin/tenants` | `tenants.read` |

### CONTENT & MARKETING CMS
| Label | Route | `PATH_PERMS` |
|---|---|---|
| Blog Engine | `/admin/blog-management` | `system.config.write` |
| Landing Pages | `/admin/landing-pages` | `system.config.write` |
| Reviews & Testimonials | `/admin/reviews` | `system.config.write` |
| Trusted By | `/admin/trustedby` | `system.config.write` |
| Localization & Phrases | `/admin/phrases` | `system.config.write` |


## Global Context Switcher

Source: `src/components/common/ContextSwitcher.jsx` — **one** implementation,
embedded in the candidate sidebar, employer sidebar, admin header, and the
Enterprise shell. The bespoke Enterprise "Switch View" popover was removed so the
product ships exactly one persona switcher.

| Portal | Route |
|---|---|
| Candidate Dashboard | `/dashboard` |
| Recruiter & Hiring Portal | `/employer` |
| Organization Workspace | `/org/:slug` (server-resolved slug) |
| Platform Admin Console | `/admin` |

Availability is derived from server state, never from storage:

- Candidate + Recruiter — any authenticated session.
- Organization — only when `GET /api/enterprise/status` returns `enabled: true`.
- Admin — only when the ID token role is `ADMIN`/`SUPER_ADMIN`, corroborated by
  `checkIfAdmin`.

The selection persists under `localStorage['ime365_active_portal']` for
convenience only. A stale, invalid, revoked, or hand-edited value is discarded
and reconciled against server availability before any navigation.

## Verification

| Property | Enforced by |
|---|---|
| Candidate nav has no recruiter entries | `four-portal-architecture.test.mjs`, E2E |
| Employer nav has no candidate/admin entries | `four-portal-architecture.test.mjs`, E2E |
| No duplicate nav path within a portal | `four-portal-architecture.test.mjs` |
| Every nav target resolves to a real route | `four-portal-architecture.test.mjs` |
| No nav item targets a legacy alias | `four-portal-architecture.test.mjs` |
| Exactly one desktop Overview | `four-portal-architecture.test.mjs` |
| Resume entry targets the builder | `four-portal-architecture.test.mjs`, E2E |

### SYSTEM SETTINGS
`/admin/settings` — the Super Admin accordion retains every existing settings
module (Modules & Addons, Database Engine, AI Providers & Models, Payments &
Gateways, Security Limits, and the rest). Settings detection uses
`location.pathname.startsWith('/admin/settings')`. No settings functionality was
removed — only the namespace and `PATH_PERMS` keys changed.

admin control-plane entry.
