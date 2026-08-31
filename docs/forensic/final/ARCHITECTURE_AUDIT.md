# Architecture Audit

## Backend Structure
- **Monolithic Express 5 application** with modular routers.
- **Entry point:** `backend/index.js` (~6000 lines) – handles app creation, middleware, payment routes, OAuth, export, CMS, health, account management, worker processes.
- **Modular routers:** routes/{adminAudit,adminUsers,adminPlatformOperations,ai,blogData,covers,databaseAdmin,email,enterprise,enterpriseM2m,errorResponder,jobsData,miscData,notificationsData,platform,portfolios,resumes,support,usersData}.js
- **Service layer:** ~40 focused services (see REPOSITORY_GROUND_TRUTH.md).
- **Repository layer:** MySQLRepository + ResilientRepository (retry, CAS, error translation).
- **Enterprise subsystem:** fully separated under `backend/enterprise/` with its own auth, registry, outbox, backup, quota, policy, and storage modules.
- **Security modules:** auth, policy, payments, oauth, reset, abuse, adminAudit, entitlements, exportTokens, network.
- **Database layer:** mysql pool, migrations, authority, domain/canonical, ownership, authTokens, oauthStore, engineManager, migrationRunner, alerts.

## Frontend Structure
- **SPA entry:** src/main.jsx – React Router v6 with lazy-loaded routes.
- **Auth wrapper:** AuthContext + Firebase onAuthStateChanged subscription.
- **API client:** Axios instance with Bearer token interceptor; window.fetch patched for same-origin requests.
- **State management:** Component-local state + React Context (AuthContext, AdminContext, EnterpriseContext); no Redux/Zustand (appropriate for the scale).
- **Code splitting:** Lazy loading via React.lazy for all major routes.
- **Styling:** SCSS modules per component + Tailwind CSS v4; global template enhancements CSS.
- **i18n:** i18next with 17 locales (en, de, es, fr, hi, it, pt, ru, pl, nl, ro, dk, gk, is, no, se).

## Architectural Strengths
1. **Clear separation** – route handlers delegate to services; services use repositories; repositories encapsulate MySQL.
2. **Defense in depth** – auth at gateway, RBAC at route-level, ownership at resource-level, tenant constraints at query-level.
3. **Fail-closed defaults** – enterprise M2M/support use endpoint allowlists; ambiguous credentials rejected; missing config returns 503 not open access.
4. **Transactional boundaries** – outbox pattern, payment activation, conversation creation, website meta use explicit transactions.
5. **Idempotency** – payment orders, webhook claims, OAuth codes, password resets all idempotent via atomic lease/consume in MySQL.
6. **Graceful degradation** – server starts without MySQL (degraded mode); AI providers fail over; source-preserving fallbacks prevent hallucinated content.
7. **Observability** – request IDs, audit logs, security audit logs, health/readyz endpoints, platform health dashboard.

## Potential Architectural Improvements (not required for production)
1. **Split `backend/index.js`** into sub-modules (payments, auth, CMS, etc.). Currently 6000 lines. This is a maintainability concern but not a correctness issue.
2. **Bundle size warnings** – BuildResume (1.2MB) and WebCvRenderer (1.1MB) chunks are large; could be further code-split but not a blocker.
3. **No message queue dependency** – outbox is MariaDB-backed (polling); fine for current scale, would need external queue at very high throughput.

## Findings
- No architecture change is required for production correctness.
- The existing layering is sound; no circular dependencies observed.
- Repository/service/route separation is respected consistently.
