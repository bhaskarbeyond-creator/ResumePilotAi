# Root-Cause Analysis Register

## RCA-1 Blanket adminAudit middleware blocked SUPPORT
- **Root cause:** `router.use(requirePermission('system.config.read'))` was placed at the top of `adminAudit.js` to guard the audit-log routes, but mounted routers on the same Express app share middleware ordering; later `app.use('/api/admin/...', otherRouter)` inherited the permission check because the audit router was mounted before them (or the route prefix collided).
- **Remediation:** Per-route guards only.
- **Prevention:** `scripts/rbac-matrix-scanner.mjs` and the 288-case matrix make route-permission mismatches immediately visible.

## RCA-2 requireRecentAdminAuthentication relaxed in non-prod
- **Root cause:** Original code treated `NODE_ENV !== 'production'` as "I'm in a test, skip MFA/recent-auth so that tests don't need to mint fresh tokens," and in doing so it also skipped the super-admin role check. Tests that would have caught this were using SUPER_ADMIN tokens anyway.
- **Remediation:** Super-admin role gate is unconditional; MFA is conditional on `SUPER_ADMIN_MFA_REQUIRED` flag; recent-auth window only in production or when `REQUIRE_RECENT_AUTH_IN_TEST=true`. Test tokens minted via `issueLocalTestToken` continue to work because role checks pass.

## RCA-3 resolveAdminReadPermission coarse default
- **Root cause:** The function defaulted to `system.config.read` for any unrecognized admin path; as new admin endpoints were added (health, payments, users mutations, AI, subscriptions) the defaults were too broad or too narrow in places.
- **Remediation:** Added explicit mappings for each route family; added the 459-case expanded matrix to catch gaps in future additions.

## RCA-4 Admin shell mounted all routes unconditionally
- **Root cause:** The Admin shell was implemented when ADMIN was the only operator role; later additions of SUPPORT and AUDITOR added server-side deny but no client-side UX gating.
- **Remediation:** Client-side mirror of backend permission map for navigation and deep-link redirects. Backend remains authoritative.

## RCA-5 Debug console.log leaks
- **Root cause:** Interactive debugging statements were left in place during development.
- **Remediation:** Mechanical stripper + lint rule for unused empty catches prevents recurrence.

## RCA-6 Skip link broken target
- **Root cause:** Each shell (Dashboard, Admin) declared its own `<main id="main-content">`, while public marketing pages declared none. The skip link in index.html preceded the React root and could find the id only inside one of the authenticated shells.
- **Remediation:** One document-level `<main>` at the router root; nested shells use semantic `<div>`/`<section>` instead of declaring competing landmarks.

## RCA-7 Email-admin routes lacked explicit permission guards
- **Root cause:** Global `enforceApiPolicy` defaults to `system.config.read` for admin reads; email-admin routes fell into that bucket even when a narrower permission (`email.logs.read`, `email.template.manage`) was appropriate.
- **Remediation:** Per-route `requirePermission(...)` so the intent is explicit at the handler and the global policy does not silently over-grant.
