# DATA FLOW AUDIT — End-to-End MariaDB Pipeline Architecture

This document audits the complete data flow across all 10 major subsystems of ResumePilot AI.

$$\text{MariaDB (Port 3306)} \longrightarrow \text{MySQLRepository} \longrightarrow \text{ResilientRepository} \longrightarrow \text{API Layer} \longrightarrow \text{Frontend Client} \longrightarrow \text{React State} \longrightarrow \text{UI Component}$$

---

## 1. Authentication & Session Flow

```text
MariaDB (users table)
  ↓
MySQLRepository.getUser(uid) / saveUser(uid, data)
  ↓
ResilientRepository (Enforces tenant context & owner scoping)
  ↓
API: POST /api/auth/preview-login & GET /api/user-profile
  ↓
Frontend: src/conf/fire.js (LocalAuth / FirebaseAuth) & src/services/api/users.js
  ↓
State: AuthProvider context & localStorage ('resumepilot_local_session_v1')
  ↓
Components: AuthWrapper, ProtectedRoute, Header
  ↓
UI: User session state, avatar, role badge, navigation guards
```
- **Audit Findings:** No mock fallback in production; fail-closed behavior verified. When MariaDB is unreachable in production, `ResilientRepository` throws controlled `503 SERVICE_UNAVAILABLE`.

---

## 2. User Profile Subsystem

```text
MariaDB: `users` table (id, email, firstname, lastname, displayName, photoUrl, jobTitle, bio, city, country, membership, role)
  ↓
MySQLRepository.getUser(uid) / saveUser(uid, payload)
  ↓
Backend Route: GET/PATCH /api/user-profile (backend/index.js)
  ↓
Frontend Service: src/services/profilePersistence.js & src/services/api/users.js
  ↓
State: ProfileDisplay state & Form state
  ↓
Component: ProfileDisplay.jsx & DashboardSettings.jsx
  ↓
UI: Personal information forms, avatar uploader, membership badges
```
- **Audit Findings:** Property mapping (`firstname`/`lastname`/`displayName`/`jobTitle`) matches between DB columns and React components. Optimistic locking with `revision` column ensures collision-free updates.

---

## 3. Resume Builder & Persistence Subsystem

```text
MariaDB: `resumes` table (id, user_id, title, template, revision, firstname, lastname, email, phone, occupation, country, city, address, postalcode, summary, employments, educations, skills, languages, hobbies, projects, certifications, achievements, references, customSections, sectionOrder, hiddenSections, completedSteps)
  ↓
MySQLRepository.getResume(id) / saveResume(id, data, { expectedRevision })
  ↓
Backend Route: GET/POST/PUT/DELETE /api/resumes/:id (backend/routes/resumes.js & backend/index.js)
  ↓
Frontend Service: src/services/resumePersistence.js & src/services/api/resumes.js
  ↓
State: BuildResume.jsx (`resumeData` state, `updateResumeData` debounced auto-save)
  ↓
Components: PersonalDetailsStep, ExperienceStep, EducationStep, SkillsStep, ProjectsStep, CertificationsStep, LanguagesStep, SummaryStep
  ↓
UI: Multi-step wizard, interactive cards, drag-and-drop ordering, template preview
```
- **Audit Findings:** JSON fields (`employments`, `educations`, `skills`, `certifications`, `projects`, etc.) are serialized to `LONGTEXT` in MariaDB and parsed back to arrays. `normalizeResumeData` ensures structural integrity.

---

## 4. AI Recommendation & Generation Subsystem

```text
User Input / Resume Context (Target Role, Work History, Education, Core Skills)
  ↓
Frontend Service: src/services/aiService.js (`generateUserAiContent('generate-certifications', payload)`)
  ↓
API Route: POST /api/generate-content (backend/routes/ai.js)
  ↓
Backend Service: backend/services/aiRuntime.js (`executeContentOperation`)
  ↓
AI Provider Router: Nvidia NIM (Llama 3.2 11B Vision) / Gemini 2.0 Flash / Groq / OpenAI
  ↓
AI Response Parsing: `parseAiResponse` (Extracts JSON, cleans names, validates structure)
  ↓
Fallback Provider: `getContentOperationFallback` (5-domain role-tailored fallback library)
  ↓
API Response: `{ success: true, data: { certifications: [...] }, provider: 'nvidia' }`
  ↓
Frontend State: CertificationsStep `aiRecommendations` state
  ↓
UI: AI Recommendations Panel, interactive cards, "+ Add", "Add All Recommended", deduplication
```
- **Audit Findings:** Reconnected end-to-end. Grounded validation active for factual rewrite operations; career exploration recommendations use role context with fallback resilience.

---

## 5. Cover Letters Subsystem

```text
MariaDB: `covers` table (id, user_id, title, template, revision, recipient_name, recipient_title, company_name, company_address, letter_body, created_at, updated_at)
  ↓
MySQLRepository.getCover(id) / saveCover(id, data) / listCovers(userId)
  ↓
Backend Route: /api/covers & /api/covers/:id (backend/routes/covers.js)
  ↓
Frontend Service: src/services/api/covers.js
  ↓
State: CoverLetter.jsx state
  ↓
Component: CoverLetter.jsx & CoverLetterPreview.jsx
  ↓
UI: Cover letter editor and high-fidelity preview
```
- **Audit Findings:** Complete parity. Cover letter export resolves directly from owner-scoped MariaDB records.

---

## 6. Portfolios Subsystem

```text
MariaDB: `portfolios` table (id, user_id, slug, template, is_published, data, created_at, updated_at)
  ↓
MySQLRepository.getPortfolio(id) / savePortfolio(id, data) / getPublishedPortfolioBySlug(slug)
  ↓
Backend Route: /api/portfolios & /api/portfolios/public/:slug (backend/routes/portfolios.js)
  ↓
Frontend Service: src/services/api/portfolios.js
  ↓
Component: PortfolioBuilder.jsx & WebCvRenderer.jsx
  ↓
UI: Online portfolio builder, custom themes, and public shareable URLs
```
- **Audit Findings:** Real MariaDB persistence with slug uniqueness and owner-scoped mutations.

---

## 7. Jobs & Applications Subsystem

```text
MariaDB: `jobs` & `applications` tables
  ↓
MySQLRepository.listJobs() / getJob(id) / applyJob(id, userId, resumeId)
  ↓
Backend Route: /api/jobs & /api/applications (backend/routes/jobsData.js)
  ↓
Frontend Service: src/services/api/jobs.js
  ↓
Component: MainJobListings.jsx, JobsLanding.jsx, AppliedJobs.jsx
  ↓
UI: Job board, applicant tracking, and recruiter dashboard
```
- **Audit Findings:** Real database relations linking job seekers, resumes, and employers.

---

## 8. Dashboard & Analytics Subsystem

```text
MariaDB: `users`, `resumes`, `covers`, `portfolios`, `ai_usage`, `stats` tables
  ↓
MySQLRepository aggregates counts and telemetry
  ↓
Backend Route: GET /api/dashboard/stats & /api/user-profile
  ↓
Frontend Service: src/services/api/dashboard.js
  ↓
State: DashboardHomepage.jsx & DashboardMain.jsx state
  ↓
UI: Real resume counts, cover letter counts, portfolio counts, AI usage quotas, and recent activity
```
- **Audit Findings:** No mock metrics or hardcoded statistics in production. All counts trace to real MariaDB rows.

---

## 9. Admin & Control Plane Subsystem

```text
MariaDB: `system_settings`, `admin_audit_logs`, `security_audit_logs`, `stats` tables
  ↓
MySQLRepository / platform services
  ↓
Backend Routes: /api/admin/users, /api/platform/command-center, /api/platform/security-events, /api/platform/operations
  ↓
Frontend Service: src/services/platformApi.js & src/services/api/platform.js
  ↓
Component: Admin.jsx, UsersManager.jsx, User360Drawer.jsx, PlatformSecurity.jsx, PlatformOperations.jsx
  ↓
UI: Admin control center, audit logs, security incident inspector, user management
```
- **Audit Findings:** Super Admin permissions enforce server-side checks. Role management updates both Firebase Auth and MariaDB `users` table.

---

## 10. Multi-Tenancy & Enterprise Subsystem

```text
MariaDB: `enterprise_tenants`, `enterprise_memberships`, `enterprise_workspaces`, `enterprise_quota_buckets`, `enterprise_outbox`
  ↓
Enterprise Tenant Service (backend/enterprise/tenantService.js)
  ↓
Backend Route: /api/enterprise/* (backend/routes/enterprise.js)
  ↓
Frontend Service: src/enterprise/services/enterpriseApi.js
  ↓
Component: EnterpriseConsole.jsx & TenantAdmin.jsx
  ↓
UI: Enterprise organization management, workspace switcher, team roles, AI quotas
```
- **Audit Findings:** 10/10 adversarial isolation verified. All enterprise operations persist atomically in MariaDB with transactional outbox.
