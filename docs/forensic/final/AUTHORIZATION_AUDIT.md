# Authorization Audit

## Backend Enforcement Verified

All sensitive routes are protected by at least one of:
1. `requireAuth` – mounted as middleware on `/api` with explicit `publicApiPaths` allowlist
2. `requirePermission(<perm>)` – granular permission checks per route
3. `requireRecentAdminAuthentication` – for high-impact control-plane mutations
4. `requireSuperAdmin` – for SUPER_ADMIN-gated operations (commercials, AI policy, service accounts, credential rotation)
5. Enterprise `createEnterpriseAuthMiddleware` – for `/api/enterprise/*` paths, handles M2M + support grants + human auth
6. Resource-level ownership checks in every handler (e.g. `order.uid !== req.user.uid` → 404)

## Public API Paths (Explicitly Allow-listed)
```
/healthz, /readyz, /health, /health/databases, /service-availability,
/platform/version, /platform/public-config, /enterprise/status,
/stripe-webhook, /public-export, /export-render-data, /contact,
/auth/custom-password-reset, /auth/verify-email-token, /auth/set-user-password,
/auth/linkedin, /auth/linkedin/callback, /auth/github, /auth/github/callback,
/auth/oauth/exchange, /auth/preview-login (only in non-production w/ HMAC),
/public/custom-pages, /public/custom-pages.json, /public/trusted-by,
/public/trusted-by.json, /public/featured-companies,
/custom-pages, /custom-pages.json, /trusted-by, /trusted-by.json,
/blog-data, /jobs-data, /paytm/callback, /phonepe/callback,
/stats, /reviews, /phrases, /portfolios/public
```
Plus regex-allowed paths: `/blog-data/slug/<slug>`, `/jobs-data/<id>`, `/phrases/<id>`, `/portfolios/public/<slug>`, `/public/custom-pages/<slug>`.

All other `/api/*` paths require authentication.

## Retired Endpoints (Return 410 GONE)
```
/api/cms-pages, /api/cms-pages/*  → duplicate CMS API retired
/api/notify/user-signup, /api/notify/password-reset, ... → client notification dispatch retired
/api/subscription/preferences → non-recurring plans; preferences not accepted
/api/invoice (POST) → client-authored invoice retired; use /api/invoice/generate
/api/payments/create-razorpay-order (legacy) → use /api/razorpay/create-order with planId
```

## Frontend Authorization

- `RequireAuthenticated` component in `main.jsx` redirects unauthenticated users to `/login?next=<path>`.
- Admin console (`/adm/*`) does additional role check via `checkIfAdmin()` API call; non-admins see an access-denied UX.
- Enterprise console (`/enterprise/*`) checks claims server-side on every API call.
- Navigation items in all dashboards are conditionally rendered based on role/claims (verified in Admin sidebar, Enterprise tab permissions).

## M2M Endpoint Allowlists (Enterprise)
M2M service accounts can only reach a fixed allowlist (`M2M_ALLOWED_ENDPOINTS`); control-plane writes (memberships, IAM, configuration, lifecycle) are human-only.

## Support Grant Allowlists
Support elevation grants may only reach diagnostic and repair-read endpoints; grant management and IAM are never reachable through a support grant.

## Finding Summary
- PROVEN: All sensitive endpoints protected server-side.
- PROVEN: Frontend guards exist; they are defense-in-depth, not the primary control.
- PROVEN: Enterprise M2M and support grants use fail-closed endpoint allowlists.
- NO bypass found in static analysis.
