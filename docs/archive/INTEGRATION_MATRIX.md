# ResumePilot AI — End-to-End Integration Matrix

> **Authoritative End-to-End Integration Trace Matrix**  
> **Source Commit:** `8c7905f`  
> **Classification:** AUTHORITATIVE SOURCE OF TRUTH

---

## 1. Trace Methodology

Every capability in this matrix is verified across the complete seven-stage execution pipeline:
$$\text{UI Component} \longrightarrow \text{Frontend Client} \longrightarrow \text{Express Gateway} \longrightarrow \text{Security Middleware} \longrightarrow \text{Business Service} \longrightarrow \text{Datastore/Provider} \longrightarrow \text{Persistence Verified}$$

---

## 2. Comprehensive Integration Pathways

### 2.1 Public & Authentication Subsystem

| Stage | Path / Mechanism |
|-------|------------------|
| **UI** | `src/components/welcome/Welcome.jsx`, `Features.jsx`, `Contact.jsx` |
| **Client** | `src/firestore/dbOperations.js:getPages()`, `getTrustedBy()` |
| **API** | `GET /api/public/custom-pages`, `GET /api/public/trusted-by` |
| **Middleware** | `publicApiPaths` Set whitelist in `backend/index.js` (Zero-Auth Protocol Endpoint) |
| **Service** | `backend/index.js:4440`, `backend/index.js:4565` |
| **Datastore** | Firestore collections `pages` (filtered `status: 'published'`) and `trustedBy` |
| **Persistence** | In-memory cache + live Firestore sync |

### 2.2 AI Resume Content Generation Subsystem

| Stage | Path / Mechanism |
|-------|------------------|
| **UI** | `src/components/BuildResume/BuildResume.jsx` & Wizard Steps |
| **Client** | `src/services/aiService.js:generateContent()` |
| **API** | `POST /api/generate-summary`, `POST /api/generate-work-description`, `POST /api/ai/generate` |
| **Middleware** | `requireAuth` (JWT verify) + `aiAccountLimiter` + `enforceDailyAiQuota` |
| **Service** | `backend/services/aiRuntime.js:generateWithProviders()` |
| **Provider** | NVIDIA NIM primary (`meta/llama-3.2-11b-vision-instruct`), Gemini fallback |
| **Persistence** | Firestore atomic transaction updates `users/{uid}/quota` + auto-saved resume draft |

### 2.3 High-Fidelity DOCX & PDF Export Subsystem

| Stage | Path / Mechanism |
|-------|------------------|
| **UI** | Resume Action Toolbar (Download Word / Download PDF) |
| **Client** | `src/utils/docxDownload.js:downloadResumeDocx()` |
| **API** | `POST /api/export-docx`, `POST /api/export` |
| **Middleware** | `requireAuth` + `exportAccountLimiter` + `createExportRenderToken` |
| **Service** | `backend/services/docxExport.js:createResumeDocx()`, `docxThemes.js` |
| **Engine** | `docx` library (native Word XML styling for 51 templates) / Playwright Chromium |
| **Delivery** | Byte stream response (`application/vnd.openxmlformats-officedocument.wordprocessingml.document`) |

### 2.4 Enterprise Multi-Tenancy & Workspace Isolation Subsystem

| Stage | Path / Mechanism |
|-------|------------------|
| **UI** | `src/enterprise/EnterpriseConsole.jsx` (14 specialized tabs) |
| **Client** | `src/enterprise/useTenantApi.jsx:enterpriseFetch()` (Attaches `X-Tenant-Id`, `X-Workspace-Id`) |
| **API** | `GET/POST /api/enterprise/resumes`, `/api/enterprise/users`, `/api/enterprise/ai/config` |
| **Middleware** | `createEnterpriseAuthMiddleware` (`backend/enterprise/enterpriseAuth.js`) |
| **Service** | `backend/enterprise/tenantService.js`, `tenantContext.js` |
| **Datastore** | Firestore tenant boundary `tenants/{tenantId}/workspaces/{workspaceId}/*` |
| **Persistence** | Enforces zero cross-tenant query leakage with verified 10/10 boundary isolation |

### 2.5 Administrator Control Plane & Step-Up Security

| Stage | Path / Mechanism |
|-------|------------------|
| **UI** | `src/components/admin/Admin.jsx`, `tenants/PlatformTenants.jsx`, `settings/AiSettings.jsx` |
| **Client** | `src/services/platformApi.js:platformFetch()` |
| **API** | `POST /api/platform/tenants/:id/decommission`, `POST /api/admin/ai-settings` |
| **Middleware** | `requireSuperAdmin` + `requireRecentAdminAuthentication` (`auth_time` < 10m + MFA check) |
| **Service** | `backend/routes/platform.js`, `backend/services/aiAdmin.js` |
| **Datastore** | Firestore `settings/ai_providers`, `security_audit_logs` |
| **Persistence** | Immutable audit records written to Firestore `security_audit_logs` |
