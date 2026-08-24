# Admin + Super Admin SWOT

## Strengths

- Server-side Firebase token verification with revocation checking and claim-derived RBAC.
- Explicit Super Admin boundary for platform flags, secrets, maintenance, provider tests, tenant decommission, operator changes, and permanent user deletion.
- Firestore transactions/revisions for important settings, tenant lifecycle, CMS moderation, coupons, and payment orders.
- Payment provider verification binds owner, internal order, plan, amount, currency, signature, and provider capture state.
- Secret-free health/config/audit projections; public availability is boolean-only.
- Enterprise tenancy uses structural Firestore partitions and server-resolved membership/workspace context.
- Live tooling produces machine-readable PASS/FAIL/BLOCKED/INCOMPLETE evidence instead of manufacturing green status.

## Weaknesses

- Production/Cloudflare/Firebase credentials and provider accounts are unavailable to this sandbox, so live behavior remains unverified.
- Some legacy product Admin modules retain older component patterns and direct public reads for public content; they now have server Admin list contracts for moderation data, but a full browser pass is still needed.
- Firestore query/index availability can affect large list performance; bounded fallback reads are used but should be monitored.
- The platform health collector uses bounded samples for outbox/tenant diagnostics and labels them as sampled.

## Opportunities

- Add CI that runs `npm run inventory:api`, checks the generated manifest, and stamps backend/frontend SHA on every deployment.
- Move all server-only credentials to a managed Secret Manager/KMS envelope rather than local JSON/`.env` paths.
- Add a dedicated external worker heartbeat/lease record so worker health is measured, not declared.
- Add Firestore aggregate counters for user/tenant/payment dashboards where count queries are too expensive.
- Complete a single shared design-token layer for legacy Admin settings.

## Threats

- A stale frontend/backend pair can expose controls against an older API; SHA certification and no-cache identity endpoints reduce this risk.
- Misconfigured environment secrets override runtime settings by design; the UI labels them infrastructure-owned and refuses clear operations.
- A compromised Super Admin remains high impact; production MFA, recent auth, audit mirroring, token revocation, and destructive confirmations are defense in depth, not elimination of risk.
- Provider outages, DNS changes, SMTP certificate failures, or missing Firestore indexes can degrade valid features; health status distinguishes those from disabled/not-configured capabilities.
