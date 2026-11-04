# 04. IMPLEMENTATION GAP REGISTER
## IME365 – Comprehensive Prioritized Gap & Defect Register

**Repository:** `D:\xampp\htdocs\IME365`  
**Commit:** `0d1a52fc389ff540e4d6d8291391a67872f74150`  
**Audit Date:** November 4, 2026  
**Auditor:** Antigravity (Google DeepMind) — Application Security & Quality Architect  

---

## 1. Summary of Identified Gaps

| Severity | Count | Primary Impact | Description Summary |
|---|---:|---|---|
| **P0 — Critical Blocker** | **0** | Data loss / Fatal vulnerability | Zero data loss, zero critical injection flaws, zero unhandled security breaches. |
| **P1 — Major Deficiency** | **2** | Route failure / Ambient credential dependency | Route shadowing on scraper endpoint; unprovisioned live production AI vault keys. |
| **P2 — Important / Functional** | **3** | Schema registry drift / Dead code accumulation | Missing table ownership in `ownership.js`; 224k-line dead root `src/` tree; bulk user actions. |
| **P3 — Test / Maintainability** | **3** | Automated test suite failures | CAS delete parameter omission; portfolio projection key drift; missing test mock pool. |
| **Total Identified Gaps** | **8** | | |

---

## 2. Exhaustive Gap Register

---

### [GAP-01] Express Route-Shadowing Bug on Naukri Job Ingestion Endpoint
- **Finding ID:** `GAP-01`
- **Feature / Module:** Backend Routing / Job Discovery (`jobsData`)
- **Severity:** **P1 (Major Architectural / API Defect)**
- **Current Implementation:**
  In `backend/index.js:558`, `jobsDataRouter` is mounted at `/api/jobs`:
  ```javascript
  app.use('/api/jobs', jobsDataRouter);
  ```
  Inside `backend/routes/jobsData.js:292`:
  ```javascript
  router.post('/:id', async (req, res) => {
      // Handles job update/save for employer
  });
  ```
  At line 5555 of `backend/index.js`, the explicit scraper endpoint is registered:
  ```javascript
  app.post('/api/jobs/naukri', async (_req, res) => {
      return res.status(501).json({
          success: false,
          code: 'SCRAPER_NOT_CONFIGURED',
          error: 'Naukri ingestion is not configured. No demo or fabricated listings are returned.',
      });
  });
  ```
- **Expected Implementation:**
  `POST /api/jobs/naukri` should immediately match the explicit scraper endpoint and return HTTP 501 with code `SCRAPER_NOT_CONFIGURED`.
- **Exact File & Line References:**
  - Mount: `backend/index.js:558`
  - Shadowing Route: `backend/routes/jobsData.js:292-301`
  - Shadowed Route: `backend/index.js:5555-5561`
- **Technical Root Cause:**
  Express routes are evaluated in strict registration order. Because `/api/jobs` is mounted before line 5555, `jobsData.js`'s parameterized route `router.post('/:id')` captures any POST request with path segment `naukri`, treating `"naukri"` as a job ID.
- **User / Business Impact:**
  API consumers or automated scraper connectors hitting `POST /api/jobs/naukri` unexpectedly trigger the employer job update workflow, attempting to fetch a job with ID `"naukri"` from MariaDB. When MariaDB is degraded or unseeded, it responds with 503 or 404 instead of the intended 501.
- **Reproduction Steps:**
  1. Start backend server on port 8080.
  2. Execute `curl -i -X POST https://ime365.local/api/jobs/naukri -H "Content-Type: application/json" -d "{}"`.
  3. Observe status code returned is 503 (or 404/401) instead of 501.
- **Recommended Correction:**
  Move the explicit `app.post('/api/jobs/naukri')` definition in `backend/index.js` to appear **before** line 558 (`app.use('/api/jobs', jobsDataRouter)`), or define `router.post('/naukri')` directly inside `backend/routes/jobsData.js` above `router.post('/:id')`.
- **Dependencies:** None.
- **Acceptance Criteria:** `POST /api/jobs/naukri` returns HTTP 501 with `{ success: false, code: "SCRAPER_NOT_CONFIGURED" }`.
- **Verification Test:** `node --test --test-name-pattern="Naukri" backend/test/degraded-endpoint-semantics.test.js` passes with exit code 0.

---

### [GAP-02] Unprovisioned Production AI Provider Credentials in Vault
- **Finding ID:** `GAP-02`
- **Feature / Module:** AI Runtime / Admin AI Settings
- **Severity:** **P1 (Operational / Release Blocker)**
- **Current Implementation:**
  `backend/services/aiAdmin.js` loads provider configuration from the MariaDB `system_settings` table (`ai_settings` key) falling back to ambient process environment variables (`NVIDIA_API_KEY`, `GEMINI_API_KEY`, etc.). In local development, ambient workstation keys or test strings are used.
- **Expected Implementation:**
  Production MariaDB vault should store valid, verified enterprise API keys for at least the primary provider (NVIDIA NIM or Google Gemini) with real-time ping latency < 300ms.
- **Exact File & Line References:**
  - `backend/services/aiRuntime.js:39-65`
  - `backend/services/aiAdmin.js:42-110`
- **Technical Root Cause:**
  Production deployment environment variables and MariaDB vault credentials have not been configured for live production release.
- **User / Business Impact:**
  If released to public users without provisioned vault credentials, AI resume generation, bullet polishing, and ATS scoring failover will exhaust local rate limits or fall back to free mesh tiers with variable latency.
- **Reproduction Steps:**
  1. Inspect `system_settings` table where `setting_key = 'ai_settings'`.
  2. Notice API key values are masked or default placeholders.
- **Recommended Correction:**
  In the Super Admin console at `https://ime365.local/admin?tab=ai-settings`, enter valid enterprise API credentials for NVIDIA NIM and Gemini, execute "Test Connection", and verify status badge displays "200 OK — <300ms".
- **Dependencies:** Active API subscription keys from NVIDIA / Google Cloud.
- **Acceptance Criteria:** `POST /api/admin/ai/test-provider` returns `{ success: true, latencyMs: <300, status: "OK" }`.
- **Verification Test:** `npm --prefix backend run test:ai-settings`.

---

### [GAP-03] Missing MariaDB Table Ownership Declarations for Migrations 038–044
- **Finding ID:** `GAP-03`
- **Feature / Module:** Database Architecture / Ownership Invariants
- **Severity:** **P2 (Architectural Invariant Defect)**
- **Current Implementation:**
  `backend/database/ownership.js` defines an authoritative dictionary `ENTITIES` representing all managed MariaDB tables, their owners (`MARIADB`), and their replication modes (`NONE`).
  Seven tables created in migrations 038 to 044 are absent from `ENTITIES`:
  1. `voice_interview_rooms` (Migration 038)
  2. `voice_interview_transcripts` (Migration 038)
  3. `tenant_custom_domains` (Migration 040)
  4. `ip_access_rules` (Migration 041)
  5. `portfolio_media` (Migration 042)
  6. `payment_bank_settlements` (Migration 044)
  7. `payment_settlement_items` (Migration 044)
- **Expected Implementation:**
  Every table created by any migration in `backend/database/migrations/*.sql` must have a corresponding declaration in `backend/database/ownership.js`.
- **Exact File & Line References:**
  - `backend/database/ownership.js:14-125`
  - `backend/test/database-ownership-completeness.test.js:21-38`
- **Technical Root Cause:**
  When migrations 038 through 044 were written, the database schema expanded, but the developer forgot to register the newly added tables into the static `ENTITIES` object in `ownership.js`.
- **User / Business Impact:**
  `backend/test/database-ownership-completeness.test.js` fails. Internal architectural checks attempting to resolve table ownership throw `No authoritative owner is registered for domain "<tableName>"`.
- **Reproduction Steps:**
  1. Run `node --test backend/test/database-ownership-completeness.test.js`.
  2. Observe assertion failure displaying the 7 missing tables.
- **Recommended Correction:**
  Add the 7 table entries to `ENTITIES` in `backend/database/ownership.js`:
  ```javascript
  voice_interview_rooms: Object.freeze({ owner: 'MARIADB', table: 'voice_interview_rooms', writeMode: 'SINGLE_OWNER', replication: 'NONE' }),
  voice_interview_transcripts: Object.freeze({ owner: 'MARIADB', table: 'voice_interview_transcripts', writeMode: 'SINGLE_OWNER', replication: 'NONE' }),
  tenant_custom_domains: Object.freeze({ owner: 'MARIADB', table: 'tenant_custom_domains', writeMode: 'SINGLE_OWNER', replication: 'NONE' }),
  ip_access_rules: Object.freeze({ owner: 'MARIADB', table: 'ip_access_rules', writeMode: 'SINGLE_OWNER', replication: 'NONE' }),
  portfolio_media: Object.freeze({ owner: 'MARIADB', table: 'portfolio_media', writeMode: 'SINGLE_OWNER', replication: 'NONE' }),
  payment_bank_settlements: Object.freeze({ owner: 'MARIADB', table: 'payment_bank_settlements', writeMode: 'SINGLE_OWNER', replication: 'NONE' }),
  payment_settlement_items: Object.freeze({ owner: 'MARIADB', table: 'payment_settlement_items', writeMode: 'SINGLE_OWNER', replication: 'NONE' }),
  ```
- **Dependencies:** None.
- **Acceptance Criteria:** `database-ownership-completeness.test.js` passes 3/3 tests with zero missing entries.
- **Verification Test:** `node --test backend/test/database-ownership-completeness.test.js` exits 0.

---

### [GAP-04] Stale Legacy Frontend Codebase (224,927 lines) at Repository Root
- **Finding ID:** `GAP-04`
- **Feature / Module:** Project Structure / Build Architecture
- **Severity:** **P2 (Maintainability / Developer Cognitive Load / Deployment Risk)**
- **Current Implementation:**
  The repository maintains two parallel frontend trees:
  1. `frontend/src/`: Active React 19 + TypeScript frontend (78,300 lines).
  2. `src/`: Stale legacy React 18 `.jsx` frontend (224,927 lines across 519 files).
  Along with root `src/`, root `index.html` and root `vite.config.js` remain in place.
- **Expected Implementation:**
  The repository root should contain only configuration files that govern the workspace. Dead source code from prior migrations should be archived in a separate repository or safely deleted.
- **Exact File & Line References:**
  - `D:\xampp\htdocs\IME365\src\` (entire directory)
  - `D:\xampp\htdocs\IME365\vite.config.js`
  - `D:\xampp\htdocs\IME365\index.html`
- **Technical Root Cause:**
  When the TypeScript frontend was constructed in `frontend/`, the original source tree was retained as a historical reference rather than pruned.
- **User / Business Impact:**
  High cognitive overhead for engineers; search tools return duplicate/stale JSX symbols; risk of accidental `npx vite build` from the repository root publishing stale assets.
- **Reproduction Steps:**
  1. Inspect root directory: notice both `src/` and `frontend/src/` exist.
- **Recommended Correction:**
  Create an archival zip bundle of root `src/` (e.g. `backups/legacy_jsx_src_archive.zip`) and remove `src/`, root `index.html`, and root `vite.config.js`. Update root `package.json` build scripts to prevent accidental invocation.
- **Dependencies:** Verification that no backend server scripts or export tools import files from root `src/`.
- **Acceptance Criteria:** Root directory contains no `.jsx` files; `npm run build` succeeds cleanly.
- **Verification Test:** `npm run build` and `npm run test:all`.

---

### [GAP-05] Missing Bulk User Management in Modern Admin Console
- **Finding ID:** `GAP-05`
- **Feature / Module:** Admin Console / User Management (`FP-A18`)
- **Severity:** **P2 (Feature Parity Regression)**
- **Current Implementation:**
  `frontend/src/components/admin/AdminUsersTab.tsx` provides a table of users with single-user actions (suspend, change role, revoke session).
- **Expected Implementation:**
  The legacy system in `src/components/admin/usersManager/UsersManager.jsx:154-358` provided checkbox multi-selection and a floating bulk action bar to suspend or activate multiple accounts simultaneously.
- **Exact File & Line References:**
  - Legacy: `src/components/admin/usersManager/UsersManager.jsx:154-358`
  - Modern: `frontend/src/components/admin/AdminUsersTab.tsx`
- **Technical Root Cause:**
  During the TypeScript rewrite of the Admin console, single-user controls were prioritized, omitting the multi-select state and bulk action bar.
- **User / Business Impact:**
  Platform administrators managing hundreds of spam accounts must toggle each user individually rather than applying bulk actions.
- **Reproduction Steps:**
  1. Navigate to `https://ime365.local/admin?tab=users`.
  2. Notice there are no checkboxes in table headers or table rows for multi-selection.
- **Recommended Correction:**
  Introduce `selectedUserIds` state, row checkboxes, a "Select All" header checkbox, and a floating bulk action bar in `AdminUsersTab.tsx` connected to `POST /api/admin/users/bulk-status`.
- **Dependencies:** Backend bulk endpoint verification.
- **Acceptance Criteria:** Admin can select 5 users and suspend them with a single click.
- **Verification Test:** Playwright admin spec verifying multi-user selection and batch state update.

---

### [GAP-06] Test Bug: Optimistic Concurrency Parameter Omission in Blog Contract
- **Finding ID:** `GAP-06`
- **Feature / Module:** Backend Test Suite / Blog Contract
- **Severity:** **P3 (Test Suite Defect)**
- **Current Implementation:**
  `backend/test/mandate9b-contracts.test.js:210-213`:
  ```javascript
  const deleteRes = await request(app)
      .delete(`/api/blog/posts/${postId}`)
      .set('Authorization', 'Bearer admin');
  assert.equal(deleteRes.status, 200);
  ```
- **Expected Implementation:**
  The backend endpoint `DELETE /api/blog/posts/:id` in `backend/routes/blogData.js:534` strictly requires `expectedRevision` in the request query or body:
  ```javascript
  if (!Number.isInteger(expectedRevision) || expectedRevision < 1) {
      return invalid(res, 400, 'expectedRevision is required to delete an article.', 'REVISION_REQUIRED');
  }
  ```
- **Exact File & Line References:**
  - Route requirement: `backend/routes/blogData.js:534-539`
  - Defective Test: `backend/test/mandate9b-contracts.test.js:210-213`
- **Technical Root Cause:**
  The test was written assuming a naive delete without supplying the required optimistic locking parameter enforced by the backend.
- **User / Business Impact:**
  Causes `npm --prefix backend test` to report a failure on `mandate9b-contracts.test.js`, preventing the full backend test suite from reporting 100% green.
- **Reproduction Steps:**
  1. Run `node --test backend/test/mandate9b-contracts.test.js`.
  2. Notice failure on line 213: `AssertionError: 400 !== 200`.
- **Recommended Correction:**
  Update the test call to include `expectedRevision: 1`:
  ```javascript
  .delete(`/api/blog/posts/${postId}?expectedRevision=1`)
  ```
- **Dependencies:** None.
- **Acceptance Criteria:** `mandate9b-contracts.test.js` passes all 15 tests.
- **Verification Test:** `node --test backend/test/mandate9b-contracts.test.js` exits 0.

---

### [GAP-07] Test Assertion Drift: Key Allowlist in Portfolio Public Projection
- **Finding ID:** `GAP-07`
- **Feature / Module:** Backend Test Suite / Portfolio Public Projection
- **Severity:** **P3 (Test Suite Maintenance Defect)**
- **Current Implementation:**
  `backend/test/portfolio-public-projection.test.js:39-50` asserts that `Object.keys(portfolio)` strictly matches:
  `['data', 'id', 'isPublished', 'metadata', 'publishedAt', 'slug', 'theme', 'title']`.
- **Expected Implementation:**
  In feature commit `a2257135`, password protection was implemented, adding `isPasswordProtected` to the projection DTO so the frontend knows whether to display the password gate.
- **Exact File & Line References:**
  - Production DTO: `backend/routes/publicPortfolios.js:44-50`
  - Defective Test: `backend/test/portfolio-public-projection.test.js:48-52`
- **Technical Root Cause:**
  The unit test's static array of allowed keys was not updated when the password protection feature was added.
- **User / Business Impact:**
  Unit test failure on `portfolio-public-projection.test.js`.
- **Reproduction Steps:**
  1. Run `node --test backend/test/portfolio-public-projection.test.js`.
  2. Observe assertion failure: actual array includes `'isPasswordProtected'`.
- **Recommended Correction:**
  Update `portfolio-public-projection.test.js` to include `'isPasswordProtected'` in the expected key array.
- **Dependencies:** None.
- **Acceptance Criteria:** Test passes with 0 failures.
- **Verification Test:** `node --test backend/test/portfolio-public-projection.test.js` exits 0.

---

### [GAP-08] Missing Mock Method in Portfolio Routes Unit Test Harness
- **Finding ID:** `GAP-08`
- **Feature / Module:** Backend Test Suite / Portfolio Routes Mocking
- **Severity:** **P3 (Test Harness Mock Defect)**
- **Current Implementation:**
  In `backend/test/portfolio-routes.test.js:11-28`, `fakeRepository` is defined and injected.
  When `GET /api/portfolios/public/:slug` executes, `resolvePublicPortfolioWithProtection` attempts to call `repo._getPool()`. Since `fakeRepository._getPool` is undefined, it attempts `getRepository()._getPool()` which also returns undefined. `checkPortfolioProtection(undefined, slug)` crashes with an unhandled TypeError, returning HTTP 500.
- **Expected Implementation:**
  The test mock should define `_getPool()` or mock `checkPortfolioProtection` so unit tests execute cleanly without throwing null pointer exceptions.
- **Exact File & Line References:**
  - `backend/test/portfolio-routes.test.js:11-30`
  - `backend/routes/publicPortfolios.js:24-30`
- **Technical Root Cause:**
  When `resolvePublicPortfolioWithProtection` was modified to query MariaDB pool for password hashes, the test harness mock was not updated with `_getPool`.
- **User / Business Impact:**
  `portfolio-routes.test.js` test 1 fails with 500 instead of 200.
- **Reproduction Steps:**
  1. Run `node --test backend/test/portfolio-routes.test.js`.
  2. Observe assertion failure: `500 !== 200`.
- **Recommended Correction:**
  In `backend/test/portfolio-routes.test.js`, add `_getPool: () => ({ query: async () => [[]] })` to `fakeRepository`.
- **Dependencies:** None.
- **Acceptance Criteria:** `portfolio-routes.test.js` passes all 4 tests.
- **Verification Test:** `node --test backend/test/portfolio-routes.test.js` exits 0.
