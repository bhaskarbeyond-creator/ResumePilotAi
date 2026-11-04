# 01. EXECUTIVE FORENSIC AUDIT
## IME365 – Interview Made Easy (Full Forensic Engineering Audit)

**Audit Target:** IME365 Repository (`D:\xampp\htdocs\IME365`)  
**Mandatory Local Environment:** `https://ime365.local/`  
**Legacy Reference:** ResumePilotAi (`D:\xampp\htdocs\ResumePilotAi-legacy`)  
**Audit Date:** November 4, 2026  
**Auditor:** Antigravity (Google DeepMind) — Executive Engineering Suite  
**Commit Inspected:** `0d1a52fc389ff540e4d6d8291391a67872f74150` (branch `main`, clean tree)  
**Database Server:** MariaDB 10.4.32 (XAMPP win64, port 3306)  
**Web Server:** Apache 2.4.58 (Win64) OpenSSL/3.1.3 PHP/8.2.12  
**API Server:** Node.js Express 5.2.1 (port 8080 reverse-proxied via Apache mod_proxy)  
**Authoritative UI:** React 19.2.8 + Vite 8.3.0 + Tailwind CSS 4.3.3 + TypeScript 6.0.2 (`frontend/src/`)  

---

## 1. Executive Summary

This report delivers an independent, empirical, evidence-driven forensic assessment of the **IME365 (Interview Made Easy)** application codebase. All observations, metric counts, defect findings, and performance baselines documented herein were derived exclusively through direct source-code inspection, database inspection of MariaDB schemas, static analysis, unit test runs, enterprise regression suites, end-to-end browser automation via Playwright in Chromium, and live HTTPS probing against `https://ime365.local/`.

Unlike previous audit sessions (Mandates 5 through 8E) which operated in isolated container sandboxes lacking a physical MariaDB server, local SSL virtual hosts, or real browser execution environments—and therefore classified dynamic execution as `UNVERIFIABLE` or `BLOCKED`—this audit operated within the **complete, live, physical environment**:
1. Apache 2.4.58 is configured with local virtual host `ime365.local` on port 443 with a valid, locally trusted root CA certificate (`rootCA.crt`).
2. MariaDB 10.4.32 is running on `127.0.0.1:3306` with 98 production tables in `ai_resume_builder` and an isolated test database `airesume_test`.
3. All 44 database migrations (001 through 044) are verified applied cleanly with 0 checksum mismatches.
4. Node.js backend (`backend/index.js`) is actively running on port 8080 and reverse-proxied seamlessly via Apache `ProxyPass /api http://127.0.0.1:8080/api`.
5. Frontend assets are compiled (`tsc -b && vite build`) and published to `dist/` which Apache serves as its authoritative DocumentRoot.
6. Playwright end-to-end tests successfully execute against `https://ime365.local/` using Node's `--use-system-ca` flag with zero certificate bypass.

### High-Level Verdict: **DEVELOPMENT / INTERNAL QA READY — NOT PRODUCTION READY**

The codebase exhibits remarkable engineering depth in its backend data plane, multi-tenant isolation, cryptographically signed outbox, and ATS scoring engine. However, release to public production is blocked by **2 P1 architectural/functional defects**, **5 backend test failures**, **1 route-shadowing defect**, and the persistence of **224,927 lines of dead legacy JSX code** at the repository root that creates developer confusion and deployment drift risks.

---

## 2. Key Forensic Metrics Summary

| Category | Value | Verification Method |
|---|---:|---|
| **Total Source Files** (excl. node_modules, .git, dist) | **4,409** | Recursive filesystem census |
| **Total Lines of Code** (.js, .jsx, .ts, .tsx, .sql, .css, .html) | **484,421** | Physical line-count measurement |
| **Active Backend Code** (`backend/`) | **124,108 lines** | Physical line-count measurement |
| **Active Frontend Code** (`frontend/src/`) | **78,300 lines** | Physical line-count measurement |
| **Legacy Root Code** (stale `src/`) | **224,927 lines** | Physical line-count measurement |
| **Total MariaDB Tables** | **98 tables** | `information_schema.TABLES` query |
| **Applied Database Migrations** | **44 / 44** | `schema_migrations` checksum verification |
| **Reachable Backend Endpoints** | **408 endpoints** | Express routing table audit (`platformHealth.js`) |
| **Frontend Registered Routes** | **42 unique routes** (plus 104 export routes) | `frontend/src/app/router.tsx` AST inspection |
| **Full Backend Test Suite** | **1,829 passed / 5 failed / 1,834 total** (99.73% pass) | `npm --prefix backend test` TAP output |
| **Enterprise Tenancy Test Suite** | **187 passed / 0 failed** (100% pass) | `npm --prefix backend run test:enterprise` |
| **Payment & Billing Test Suite** | **43 passed / 0 failed** (100% pass) | `npm --prefix backend run test:payments` |
| **Frontend Linting (oxlint)** | **0 errors / 2 warnings** (287 files) | `oxlint` scan (60ms) |
| **Frontend Type Checking** | **0 errors** | `tsc -b` execution |
| **E2E Candidate ATS Tests (Playwright)** | **32 passed / 0 failed** across 5 viewports | `playwright test ats-scoring.spec.ts` |
| **API Response Latency (`/api/health`)** | **12.18 ms** | `curl -w` measurement over HTTPS |
| **Static HTML Response Latency (`/`)** | **10.51 ms** | `curl -w` measurement over HTTPS |
| **DB Refresh Latency (`/api/health/databases`)** | **9.98 ms** | `curl -w` measurement over HTTPS |

---

## 3. Actual Application Architecture

The forensic examination confirmed the actual runtime architecture of IME365:

```
[ Client Browser / Playwright ]
             │ (HTTPS: 443 with Trusted Root CA)
             ▼
[ Apache 2.4.58 Reverse Proxy (ime365.local) ]
    ├── DocumentRoot (D:/xampp/htdocs/IME365/dist) ──> Pre-compiled SPA Chunks (React 19 + Tailwind 4)
    └── ProxyPass /api ──> http://127.0.0.1:8080/api
                                  │
                                  ▼
                [ Node.js Express 5.2.1 Core (backend/index.js) ]
                    ├── Security & Auth Guards (Firebase Admin identity + JWT + TOTP)
                    ├── 29 Modular Route Files (backend/routes/*.js)
                    ├── FreeLLMAPI Mesh Engine (backend/freellmapi/)
                    ├── Enterprise Tenancy Core (backend/enterprise/)
                    └── Authoritative Data Layer (backend/database/mysql.js)
                                  │ (Connection Pool: 15 max, port 3306)
                                  ▼
                        [ MariaDB 10.4.32 ]
                 ai_resume_builder (98 Tables, InnoDB)
```

### Architectural Realities:
1. **The Active Frontend is strictly `frontend/src/`**: The modern application is written in TypeScript and React 19, utilizing `@tailwindcss/vite`, Radix UI primitives, Lucide icons, and TanStack Query. The root-level `src/` directory (containing 519 legacy `.jsx` files and 224,927 lines) is **dead/superseded** code inherited from `ResumePilotAi-legacy`. It is bypassed completely during the `build` script (`npm --prefix frontend run build && node scripts/sync-dist.mjs`).
2. **Authoritative Data Plane is 100% MariaDB**: Firestore has been completely removed from the data plane (`firestoreDataPlane: "REMOVED"`). All application data (resumes, users, jobs, interviews, billing, subscriptions, audit logs) resides in MariaDB InnoDB tables.
3. **Identity vs Data Plane Separation**: Firebase Admin SDK is retained strictly for identity token verification (UID, email verification). The application maps external Firebase UIDs deterministically to canonical internal UUIDs in MariaDB (`enterprise_principal_tenants`, `users`).

---

## 4. Critical Findings & Defect Triage

Through exhaustive execution of all 1,834 backend tests and browser automation, 5 specific test failures and 1 critical route-shadowing defect were isolated:

### Finding 1: Route-Shadowing Bug in Job Scraper (`POST /api/jobs/naukri`)
- **Severity:** P1 (Functional / API Integrity Defect)
- **Location:** `backend/index.js:558` vs `backend/routes/jobsData.js:292`
- **Root Cause:** In `backend/index.js:558`, `app.use('/api/jobs', jobsDataRouter)` is mounted. Inside `jobsData.js:292`, `router.post('/:id')` captures all `POST` requests where `:id` is a string. When a client calls `POST /api/jobs/naukri`, Express matches `router.post('/:id')` with `:id = 'naukri'`. The handler attempts to query MariaDB for job ID `'naukri'`. The explicit stub handler at `backend/index.js:5555` (`app.post('/api/jobs/naukri')` returning HTTP 501 `SCRAPER_NOT_CONFIGURED`) is unreachable dead code.
- **Impact:** Calling the scraper endpoint unexpectedly invokes the job modification handler instead of returning the coded 501.

### Finding 2: Missing MariaDB Table Ownership Registrations
- **Severity:** P2 (Architectural Invariant Defect)
- **Location:** `backend/database/ownership.js:14-120`
- **Root Cause:** Migrations 038 through 044 introduced 7 new MariaDB tables:
  `voice_interview_rooms`, `voice_interview_transcripts`, `tenant_custom_domains`, `ip_access_rules`, `portfolio_media`, `payment_bank_settlements`, `payment_settlement_items`.
  While the tables were successfully created in MariaDB, they were omitted from the `ENTITIES` dictionary in `backend/database/ownership.js`.
- **Impact:** Causes `backend/test/database-ownership-completeness.test.js` to fail. Any subsystem relying on `getOwnership(tableName)` throws `No authoritative owner is registered for domain "<tableName>"`.

### Finding 3: Optimistic Concurrency Control Parameter Omission in Test
- **Severity:** P3 (Test Quality Defect)
- **Location:** `backend/test/mandate9b-contracts.test.js:210-213`
- **Root Cause:** `DELETE /api/blog/posts/:id` strictly enforces compare-and-swap (CAS) optimistic locking and rejects requests lacking `expectedRevision` with HTTP 400 `REVISION_REQUIRED`. The test executes a raw delete without this parameter, causing assertion failure `400 !== 200`.

### Finding 4: Key List Drift in Portfolio Public Projection Unit Test
- **Severity:** P3 (Test Maintenance Defect)
- **Location:** `backend/test/portfolio-public-projection.test.js:39-50`
- **Root Cause:** Commit `a2257135` introduced `isPasswordProtected` to the public portfolio projection so frontends can prompt for passwords. The unit test asserts strict array equality against a hardcoded list that predated this feature.

### Finding 5: Missing Mock Pool in Portfolio Route Unit Test
- **Severity:** P3 (Test Harness Defect)
- **Location:** `backend/test/portfolio-routes.test.js:11-30`
- **Root Cause:** `resolvePublicPortfolioWithProtection` expects `repo._getPool()` to check password protection. The test's `fakeRepository` mock failed to implement `_getPool()`, triggering a null reference error (`TypeError: Cannot read properties of undefined (reading 'query')`) resulting in HTTP 500.

### Finding 6: Massive Dead Code Accumulation (224,927 lines)
- **Severity:** P2 (Maintainability / Security Surface / Cognitive Debt)
- **Location:** Root directory `src/` (519 `.jsx` files)
- **Root Cause:** When the project migrated to the React 19 + TypeScript frontend under `frontend/`, the legacy JSX tree was left in place at the root along with root `vite.config.js` and root `index.html`.
- **Impact:** New developers or automated CI jobs running `npx vite build` from root risk building and inspecting the wrong, stale application.

---

## 5. Production Readiness Verdict

### **Verdict: NOT READY FOR PUBLIC PRODUCTION RELEASE**

| Stage | Readiness Verdict | Justification |
|---|:---:|---|
| **Local Development** | **READY** | Full local environment operational with MariaDB, Apache, and Node. |
| **Internal QA** | **READY** | 99.73% backend pass rate, core user journeys passing Playwright E2E. |
| **Staging Deployment** | **CONDITIONAL** | Requires fixing Finding 1 (route shadowing) and Finding 2 (table ownership). |
| **Public Production** | **NOT READY** | Requires resolving P1/P2 defects, removing root dead code, and provisioning live external API credentials (AI, Stripe, Razorpay). |

### Mandatory Gates to Production:
1. Fix the route ordering in `backend/index.js` to eliminate route shadowing of `/api/jobs/naukri`.
2. Register the 7 missing tables in `backend/database/ownership.js`.
3. Fix the 3 test harness regressions to achieve 100% test suite pass rate (1,834/1,834).
4. Archive or remove the 224k-line dead legacy `src/` directory to eliminate deployment ambiguity.
5. Provision production AI provider API keys (NVIDIA NIM / Gemini) in the MariaDB vault.
