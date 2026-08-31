# Code Completeness Matrix — Module-by-Module Audit

> **Audit SHA**: `06f443d` | **Date**: 2026-08-31

## Module Inventory

### 1. Resume Builder
- **Entry Points**: `/build-resume/*`, `/create-resume/*`
- **Component**: `BuildResume.jsx` (137,158 bytes — **very large single file**)
- **Steps**: 13 wizard steps (Heading → Work → Education → Skills → Certifications → Projects → Achievements → Languages → Summary → References → Custom Sections → Review → Finalize)
- **API Dependencies**: `/api/resumes/:id` (CRUD), `/api/generate-content` (AI), `/api/generate-summary` (AI), `/api/check-grammar` (AI)
- **Tests**: `build-resume-shell.test.mjs`, `resume-workflow.test.mjs`, `resume-persistence.test.mjs`, `resume-field-mapper-integrity.test.mjs`, `create-resume-extras.test.mjs`
- **Status**: WORKING WITH GAPS
- **Gaps**:
  - `BuildResume.jsx` at 137KB is a maintenance risk (single monolithic component)
  - Resume import (PDF/DOCX parsing) via `ResumeImportModal.jsx` → `/api/parse-resume`
  - Template selection via `TemplateSelectionModal.jsx` (56KB — also very large)

### 2. CV/Cover Letter Export (PDF + DOCX)
- **Entry Points**: `/export/Cv{1-51}/:resumeId/:language`, `/export/Cover{1-4}/:resumeId/:language`
- **Components**: `Exporter.jsx`, `ResumePageComposer.jsx` (34KB), `TemplateRenderer.jsx`
- **Backend**: `routes/exports.js` (PDF rendering via headless browser), `services/docxExport.js` (57KB DOCX generation)
- **Templates**: 51 resume + 4 cover letter templates in `src/cv-templates/` and `src/components/cv-templates/`
- **Tests**: 7 template test files, `export-client.test.mjs`, `docx-client-journey.test.mjs`, `export-e2e-real-browser.test.mjs`
- **Status**: WORKING WITH GAPS
- **Gaps**:
  - Export concurrency controlled by semaphore (`services/exportSemaphore.js`)
  - Self-signed certificate handling in dev (`exports.js` recent fix in HEAD commit)

### 3. AI Workflows
- **Routes**: `backend/routes/ai.js` — 5 active endpoints + retired endpoints
  - `/api/generate-interview` — Interview question generation
  - `/api/check-grammar` — Grammar checking
  - `/api/generate-content` — General AI content
  - `/api/parse-resume` — Resume parsing from uploaded files
  - Retired: `/api/generate-summary`, `/api/generate-work-description` (redirected to `/api/generate-content`)
- **Service**: `backend/services/aiRuntime.js` (63KB — comprehensive multi-provider runtime)
- **Providers**: Gemini, NVIDIA NIM, OpenAI, Groq, OpenRouter, DeepSeek
- **Frontend**: `src/services/aiService.js`, `src/utils/interviewCoach.js` (32KB)
- **Tests**: 14 AI-related test files (backend + frontend)
- **Status**: WORKING WITH GAPS
- **Gaps**:
  - Model deprecation management (NVIDIA models retired per AGENTS.md)
  - Grounding validation (`ai-grounding-adversarial.test.js`)
  - Provider failover chain complexity

### 4. Payments
- **Providers**: Stripe, PayPal, Razorpay, Paytm, PhonePe
- **Routes**: `backend/routes/payments.js` — 17 endpoints
- **Services**: `paymentActivation.js` (13KB), `paymentAdmin.js`, `providerRefunds.js` (19KB), `invoiceService.js` (38KB)
- **Frontend**: `src/components/Billing/Plans/Plans.jsx`, `src/utils/subscriptionUtils.js`, `src/utils/authoritativeInvoice.js`
- **Tests**: 12 payment-related test files
- **Status**: WORKING WITH GAPS
- **Gaps**:
  - Indian gateways (Paytm, PhonePe) have complex callback flows
  - Refund state machine has dedicated test coverage
  - Invoice generation at 38KB is substantial

### 5. Enterprise Console
- **Entry Point**: `/enterprise/*`
- **Components**: 17 tab components (Overview, Users, Teams, Workspaces, Roles, Resumes, AI, Security, Usage, Email, Audit, Support, Settings, Platform)
- **Backend**: `backend/routes/enterprise.js` (63KB), `backend/enterprise/` (30 files)
- **Database**: 15 migrations with enterprise-specific tables
- **Tests**: `enterprise-ui.test.mjs`, `test-enterprise-browser.mjs`, enterprise backend tests
- **Status**: WORKING WITH GAPS
- **Gaps**:
  - KMS encryption provider not implemented (`encryptionProvider.js:170`: `Managed KMS encryption provider is not implemented`)
  - Server-key fallback is the only active encryption provider

### 6. Admin Panel
- **Entry Point**: `/adm/*`
- **Components**: 23 route components, 34 settings panels
- **Backend**: `index.js` inline handlers (80 endpoints) + `routes/platform.js` (39 endpoints) + `routes/adminUsers.js` (16 endpoints) + `routes/adminPlatformOperations.js` + `routes/adminAudit.js`
- **Status**: WORKING WITH GAPS
- **Gaps**:
  - No role-based UI differentiation (AUDITOR sees mutation buttons)
  - 34 settings panels is excessive — likely some overlap/redundancy
  - `subscriptionsSettings.jsx` at 167KB is the largest single component in the codebase

### 7. Blog CMS
- **Frontend**: `BlogList`, `BlogPost`, `BlogEditor` components
- **Backend**: Blog CRUD in `index.js` + `routes/blogData.js`
- **Tests**: `blog-workflow.test.mjs`, `blog-list-fallback.test.mjs`
- **Status**: WORKING
- **Gaps**: Blog editor accessible without admin role check (frontend)

### 8. Job Board & Employer
- **Frontend**: `JobsLanding`, `MainJobListings`, `EmployerDashboard`, `CompaniesManagement`
- **Backend**: `routes/employer.js` (26KB), `routes/jobsData.js` (12KB)
- **Tests**: `employer-lifecycle.test.mjs`, `job-tracker.test.mjs`
- **Status**: WORKING WITH GAPS
- **Gaps**: Employer application flow (employer requests → admin approves → employer role)

### 9. Messaging
- **Frontend**: `DashboardMessages`, admin `Messages`
- **Backend**: `routes/messaging.js` (14KB)
- **Tests**: `messaging-regression.test.mjs`, `messaging-authorization.test.mjs`
- **Status**: WORKING

### 10. Portfolio Builder
- **Frontend**: `PortfolioBuilder`, `PortfolioGallery`, `PublicPortfolio`
- **Backend**: `routes/portfolios.js` (5KB)
- **Tests**: 4 portfolio test files
- **Status**: WORKING

### 11. Notifications
- **Frontend**: `DashboardMain` → notification badge
- **Backend**: `routes/notificationsData.js`, `services/notificationOutbox.js` (13KB)
- **Tests**: `notification-lifecycle.test.mjs`
- **Status**: WORKING

### 12. Account/Profile
- **Frontend**: `DashboardSettings`, `ProfileDisplay`
- **Backend**: `routes/usersData.js`, `services/accountDeletion.js` (12KB), `services/profileSanitizer.js`
- **Account Export**: `index.js:3472` (`/api/account/export`)
- **Account Delete**: `index.js:3577` (`/api/account/delete`)
- **Tests**: `profile-workflow.test.mjs`, `profile-concurrency.test.mjs`, `account-lifecycle-regression.test.mjs`, `account-isolation.test.mjs`
- **Status**: WORKING

---

## Dead/Orphan Code Audit

| Item | Type | Evidence | Status |
|---|---|---|---|
| `Dashboard2/` | ORPHAN COMPONENT | Imported at `main.jsx:84` but routes redirect to `Dashboard` | DEAD |
| `Analytics.jsx` | COMPATIBILITY WRAPPER | 7-line re-export of `getWebsiteData()` | ACTIVE (used) |
| `nvidia-proxy.php` | ORPHAN FILE | PHP proxy script at root — no consumer | DEAD |
| `create-user.cjs` | UTILITY SCRIPT | Manual user creation script | INTENTIONALLY RETIRED |
| `database-debug.log` | DEBUG LOG | 3KB debug log committed | SHOULD NOT BE TRACKED |
| `firestore-debug.log` | DEBUG LOG | 184KB debug log | SHOULD NOT BE TRACKED |
| `test-output.txt` | TEST OUTPUT | 124KB test output file | SHOULD NOT BE TRACKED |
| `scratch/` | SCRATCH DIRECTORY | Development scratch files | INTENTIONALLY TEMPORARY |
| `backend/scratch/` | SCRATCH DIRECTORY | Backend dev scratch | INTENTIONALLY TEMPORARY |
| `live_audit_captures/` | AUDIT CAPTURES | Screenshots from previous audits | HISTORICAL |
| `*.png` (root) | SCREENSHOTS | 5 enterprise screenshots in root | SHOULD NOT BE IN ROOT |
| `backend/reset-pwd.js` | UTILITY | Password reset utility | ACTIVE |
| `backend/test-routes.js` | TEST HELPER | Route testing helper | ACTIVE |

---

## Architectural Observations

### ARCH-001: Backend Monolith
- `backend/index.js`: 3,845 lines / 224KB
- Contains 80 inline route handlers that should be in route modules
- Mixes payment helpers, admin CRUD, auth flows, CMS operations
- **Impact**: Maintenance difficulty, merge conflicts, cognitive load
- **Severity**: P1 CRITICAL (maintainability)

### ARCH-002: Frontend Component Size
- `BuildResume.jsx`: 137KB — wizard monolith
- `subscriptionsSettings.jsx`: 167KB — largest component
- `src/services/api/platform.js`: 109KB — API client monolith
- `backend/repositories/MySQLRepository.js`: 150KB — repository monolith
- **Impact**: Difficulty refactoring, testing, and reasoning about code
- **Severity**: P2 HIGH (maintainability)

### ARCH-003: Database Migrations Complete Through 015
- 15 migrations covering baseline through support tickets
- MariaDB is the authoritative database (Firestore eliminated)
- Migration runner exists (`database/migrationRunner.js`)
- **Status**: COMPLETE

### ARCH-004: Cluster Supervisor
- `backend/cluster.js` — master/worker cluster with auto-restart
- **Status**: WORKING (tested via `cluster-supervisor.test.js`)
