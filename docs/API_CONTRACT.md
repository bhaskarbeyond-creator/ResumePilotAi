# ResumePilot AI — Complete API Contract Specification

> **Authoritative API Contract Inventory**  
> **Source Commit:** `8c7905f`  
> **Classification:** AUTHORITATIVE SOURCE OF TRUTH

---

## 1. Public Protocol & Diagnostic Endpoints (No Auth Required)

| Method | Endpoint Path | Request Payload | Response Schema | Description |
|--------|---------------|-----------------|-----------------|-------------|
| `GET` | `/healthz` / `/api/healthz` | None | `{ status: "ok", firebaseAdminConfigured: bool, date: string, commitSha: string }` | Liveness & Build Identity Probe |
| `GET` | `/readyz` | None | `{ status: "ok", ready: true }` | Readiness Probe |
| `GET` | `/api/service-availability` | None | `{ available: true, timestamp: string }` | Network Availability Probe |
| `GET` | `/api/public/custom-pages` | None | `{ success: true, pages: Array<{ id, title }> }` | Public published custom pages list |
| `GET` | `/api/public/trusted-by` | None | `{ success: true, items: Array<{ id, name, imageUrl, order }> }` | Public published brand logos |
| `POST` | `/api/auth/oauth/exchange` | `{ code: string }` | `{ customToken: string }` | Social OAuth single-use code exchange |
| `POST` | `/api/auth/verify-email-token` | `{ token: string, email: string }` | `{ success: true, message: string }` | Email verification token validator |
| `POST` | `/api/auth/custom-password-reset` | `{ email: string }` | `{ success: true, message: string }` | Password reset dispatch |
| `POST` | `/api/stripe-webhook` | Raw JSON Buffer | HTTP 200 `{ received: true }` | Stripe webhook event handler |

---

## 2. Authenticated Candidate & Core Endpoints (`Bearer <ID_Token>`)

| Method | Endpoint Path | Request Payload | Response Schema | Description |
|--------|---------------|-----------------|-----------------|-------------|
| `POST` | `/api/generate-summary` | `{ jobTitle, skills, experienceYears, ... }` | `{ summary: string }` | AI Professional Summary Generator |
| `POST` | `/api/generate-work-description` | `{ role, company, keywords, ... }` | `{ bulletPoints: Array<string> }` | AI Work Experience Bullet Generator |
| `POST` | `/api/generate-content` | `{ prompt, context, section }` | `{ content: string }` | General AI Assistant Engine |
| `POST` | `/api/generate-ai-cover-letter` | `{ resumeData, jobDescription }` | `{ coverLetter: string }` | AI Cover Letter Generator |
| `POST` | `/api/parse-resume` | `FormData (PDF / DOCX file)` | `{ parsedData: object }` | AI Resume Parser |
| `POST` | `/api/export-docx` | `{ resumeData: object, templateId: string }` | Binary Buffer (`.docx`) | High-Fidelity DOCX Builder |
| `POST` | `/api/export` | `{ resumeData: object, resumeName: string }` | Binary Buffer (`.pdf`) | Headless Playwright PDF Builder |
| `POST` | `/api/pay` | `{ planId: "monthly"\|"yearly", provider: string }` | `{ orderId: string, clientSecret?: string }` | Subscription Checkout Initiator |
| `POST` | `/api/messages/send` | `{ recipientUid, conversationId, message }` | `{ success: true, messageId: string }` | Direct Messaging Dispatch |

---

## 3. Administrator & Platform Control Plane Endpoints (`ADMIN` / `SUPER_ADMIN`)

| Method | Endpoint Path | Minimum Role | Payload / Params | Response Schema |
|--------|---------------|:------------:|------------------|-----------------|
| `GET` | `/api/platform/overview` | `ADMIN` | None | `{ metrics: object, activeUsers: number }` |
| `GET` | `/api/platform/health` | `ADMIN` | None | `{ status: "ok", services: object, memory: object }` |
| `GET` | `/api/platform/queues` | `SUPER_ADMIN` | None | `{ queues: Array<object>, deadLetterCount: number }` |
| `POST` | `/api/platform/queues/retry` | `SUPER_ADMIN` (MFA) | `{ queueId: string }` | `{ success: true, retriedCount: number }` |
| `GET` | `/api/admin/audit-logs` | `ADMIN` | Query: `?limit=50&page=1` | `{ logs: Array<object>, total: number }` |
| `POST` | `/api/admin/ai-settings` | `SUPER_ADMIN` (MFA) | `{ nvidiaApiKey, geminiApiKey, ... }` | `{ success: true, activeProviders: object }` |
| `POST` | `/api/admin/payment-settings` | `SUPER_ADMIN` (MFA) | `{ stripeSecret, razorpayKey, ... }` | `{ success: true, gateways: object }` |
| `POST` | `/api/platform/operators` | `SUPER_ADMIN` (MFA) | `{ uid: string, role: "ADMIN"\|"SUPER_ADMIN" }` | `{ success: true }` |

---

## 4. Enterprise Multi-Tenant Endpoints (`/api/enterprise/*`)

| Method | Endpoint Path | Scope | Payload / Params | Response Schema |
|--------|---------------|-------|------------------|-----------------|
| `GET` | `/api/enterprise/status` | Tenant | Headers: `X-Tenant-Id` | `{ tenant: object, features: object }` |
| `POST` | `/api/enterprise/context` | User | `{ tenantId: string, workspaceId: string }` | `{ activeTenant: object, workspace: object }` |
| `GET` | `/api/enterprise/resumes` | Workspace | Headers: `X-Tenant-Id`, `X-Workspace-Id` | `{ resumes: Array<object>, total: number }` |
| `GET` | `/api/enterprise/users` | Tenant | Headers: `X-Tenant-Id` | `{ members: Array<object> }` |
| `POST` | `/api/enterprise/ai/config` | Tenant Admin | `{ monthlyTokenLimit, allowedModels }` | `{ success: true, quota: object }` |
| `GET` | `/api/enterprise/audit-logs` | Tenant Admin | Query: `?since=timestamp` | `{ auditEvents: Array<object> }` |
