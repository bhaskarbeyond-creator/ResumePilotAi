# Repository Ground Truth

**Audit date:** 2026-08-31 03:00 UTC  
**Branch:** arena/01a055a9-resumepilotai  
**Baseline SHA:** 043697715d52441bd8dc7cd6e96cf8b8f5369527 (HEAD)  
**Post-fix SHA:** Same HEAD (working tree contains minor uncommitted lint/debug fixes)

## 1. Stack Identification

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend bundler | Vite (with Rolldown) | 7.x |
| UI framework | React | 18+ |
| Styling | SCSS + Tailwind CSS v4 | 4.x |
| i18n | react-i18next | 23+ |
| Backend runtime | Node.js | 22.x |
| Web framework | Express | 5.2.1 |
| Auth | Firebase Admin SDK (IDENTITY ONLY) | 14.x |
| Primary DB | MySQL2 / MariaDB | 3.x |
| Payments | Stripe, PayPal, Razorpay, Paytm, PhonePe | Stripe 22.x |
| PDF export | Playwright (headless Chromium) | 1.x |
| DOCX export | docx | 9.x |
| Email | Nodemailer | 9.x |
| Testing | Node `--test` runner + Playwright | Built-in |
| Lint | ESLint | 8/9 |

## 2. Critical Architectural Facts

1. **Single authoritative database:** MariaDB/MySQL. No Firestore data plane is consulted at runtime.
2. **Firebase Admin is identity-only.** Used for ID-token verification and account lifecycle; never for application data reads/writes.
3. **Schema bootstrap is idempotent and non-fatal.** Server starts in degraded mode when MySQL is unreachable.
4. **Dual graceful-shutdown handlers** are registered (both `require.main === module` block AND earlier top-level declarations). The second shadows the first but both call `closePool()` safely.
5. **All payment providers use server-side order creation and verification.** Client cannot supply amount, uid, keyId, or keySecret.
6. **Enterprise tenancy is a first-class subsystem** with M2M service accounts, support-grant elevation, per-tenant AI quotas, and MySQL-backed outbox queue.

## 3. Directory Inventory

### Backend (`backend/`)
- `index.js` (5979 lines): Express app, payment routes, auth routes, CMS, health, OAuth, export
- `database/` – mysql pool, schema bootstrap, migrations (001–015), authority, ownership, domain/canonical, auth tokens, oauth store, engine manager, migration runner, alerts
- `routes/` – adminAudit, adminUsers, adminPlatformOperations, ai, blogData, covers, databaseAdmin, email, enterprise, enterpriseM2m, errorResponder, jobsData, miscData, notificationsData, platform, portfolios, resumes, support, usersData
- `security/` – auth, policy, payments, oauth, reset, abuse, adminAudit, entitlements, exportTokens, network
- `services/` – ~40 services covering AI runtime, AI admin, admin settings, billing, invoices, refunds, notifications outbox, CMS scheduler, docx export, email, Firebase admin, payment activation, payment admin, platform currency/configuration/health, profile sanitizer, discovery metadata, public app URL, readyz alerts, resilient mutations, refund references, support tickets, account deletion, indian gateway activation
- `enterprise/` – tenant service, auth, routing, context, quota, policy, cache, lifecycle, observability, audit, storage, telemetry, signed artifacts, jobs, outbox, backup, repository, feature flags, encryption, service accounts/identity, MySQL registry/atomic counter/service account/support grant stores, workspace resolution
- `repositories/` – MySQLRepository, ResilientRepository, index
- `test/` – 76 test files; 513 passing, 24 skipped (enterprise env-dependent / requires live MySQL)
- `fonts/` – TTF fonts for PDF rendering

### Frontend (`src/`)
- `main.jsx` (494 lines): entry, router with lazy-loaded routes, auth wrapper, axios/fetch interceptors
- `components/` – Admin, Dashboard, BuildResume, CoverLetter, Billing, Portfolio, Welcome, Exporter, Contact, PublicResume, PublicPortfolio, Jobs, Blog, Auth, etc.
- `cv-templates/` – 51 CV templates (Cv1–Cv51), 4 cover templates (Cover1–Cover4)
- `engine/hybrid/` – Smart Resume Composer, layout system, content sanitizer
- `enterprise/` – EnterpriseConsole with tabs for Overview/Users/Teams/Roles/Ai/Security/Audit/Settings/Email/Usage/Workspaces/Resumes/Platform/Support/Help
- `services/` – api client modules (users, resumes, covers, jobs, portfolios, blog, platform, databaseAdmin), aiService, adminAiSettings, adminReauth, mfaService, platformApi, profilePersistence, resumeFieldMapper, resumeParser, resumePersistence
- `utils/` – ~35 utility modules covering auth errors, ats score, browser state, docx/pdf download, gst, health, i18n, interview coach, job tracker, oauth, privacy consent, sanitization, signOut, subscription utils, template catalog/registry, totp helper
- `hooks/` – useConfirmDialog, useMetaManager, useOAuthSignIn, useServiceAvailability, useUnreadMessages, useUnreadNotifications
- `models/` – Education, Employment, Language, Skills

### Tests (`tests/`)
- ~80+ root-level test files covering product flows, adversarial, UX, performance, certification
- `certification/` helpers and DB failure/firestore-off tests
- `browser-e2e/` runner
- `helpers/` browser/enterprise/superadmin/firebase harnesses

## 4. Build/Test Status (at audit time)

| Target | Result |
|--------|--------|
| `npm run lint` | ✅ 0 errors, 0 warnings |
| `npm run build` (Vite) | ✅ Built successfully (4.4s) |
| Backend unit tests (`npm --prefix backend test`) | ✅ 513 pass, 0 fail, 24 skipped |
| Security static tests | ✅ 44 pass, 0 fail |
| Product tests (`npm run test:product`) | ✅ 411 pass, 0 fail |

## 5. Known Environment-Blocked Tests

The 24 skipped backend tests and all `tests/certification/*`, `backend/enterprise-test/*` tests require:
- Live MariaDB instance with `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- Valid Firebase Admin credentials for ID-token verification
- Valid Stripe/PayPal/Razorpay/Paytm/PhonePe credentials for payment flows
- TENANT_JOB_SIGNING_SECRET (≥32 bytes) for enterprise outbox worker tests

These are classified **VALID_ENVIRONMENT_LIMITATION**, not failures. The logic they verify is reviewed statically and all non-DB unit tests pass.
