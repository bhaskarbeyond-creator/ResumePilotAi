# ResumePilot AI — System Architecture Specification

> **Authoritative Current Architecture Baseline**  
> **Source Commit:** `8c7905f` (and subsequent forensic fixes)  
> **Classification:** AUTHORITATIVE SOURCE OF TRUTH

---

## 1. Architectural Overview & System Topography

ResumePilot AI is a cloud-native, multi-tenant AI resume builder, interview preparation coach, and enterprise talent management platform. The application is built on a decoupled, zero-trust layered architecture:

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                 PRESENTATION TIER                                       │
│                                                                                         │
│   React 19 SPA (Vite 8) + TailwindCSS + SCSS + i18next + Framer Motion                  │
│   ├─ Public Marketing & Discovery  (/, /features, /pricing, /jobs, /portfolios, /blog)  │
│   ├─ Candidate Workspace          (/dashboard, /create-resume, /coverletter, /portfolio)│
│   ├─ Administrator Control Plane  (/adm/* with alias /admin/*, /platform/*)             │
│   └─ Enterprise Multi-Tenant Hub  (/enterprise/* — 14 specialized management consoles)  │
└────────────────────────────────────────┬────────────────────────────────────────────────┘
                                         │ HTTPS / Bearer JWT / Cookie / M2M API Keys
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                   SECURITY & GATEWAY TIER                               │
│                                                                                         │
│   Node.js / Express 5 API Gateway (Port 8080)                                           │
│   ├─ Reverse Proxy & Security Headers (Helmet, Strict CSP, CORS Allowlist, Rate Limiters)│
│   ├─ Identity & Zero-Trust Boundary (Firebase Admin JWT, Claims Resolver, M2M Validator)│
│   ├─ Step-Up Auth & Session Freshness (TOTP MFA Enforcement, `auth_time` Stale Gates)   │
│   └─ Policy Enforcement Middleware (RBAC: USER, ADMIN, SUPER_ADMIN; Tenant Boundary)    │
└────────────────────────────────────────┬────────────────────────────────────────────────┘
                                         │
                   ┌─────────────────────┴─────────────────────┐
                   ▼                                           ▼
┌──────────────────────────────────────┐    ┌─────────────────────────────────────────┐
│        BUSINESS & ROUTING LAYER      │    │       ENTERPRISE DATA & OUTBOX TIER     │
│                                      │    │                                         │
│  ├─ Platform Router (/api/platform)  │    │  ├─ Multi-Tenant Repository (Firestore) │
│  ├─ AI Service Runtime (/api/ai)     │    │  ├─ Durable Outbox Queue & DLQ (HMAC)   │
│  ├─ Email & Notification (/api/email)│    │  ├─ AES-256-GCM Envelope Encryption     │
│  ├─ Export Engine (PDF & DOCX)       │    │  ├─ Quota & Tenant Policy Engine        │
│  └─ Payment Gateways (/api/pay)      │    │  └─ Backup / Restore System Engine      │
└──────────────────┬───────────────────┘    └────────────────────┬────────────────────┘
                   │                                             │
                   ▼                                             ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                              STORAGE & INTEGRATIONS LAYER                               │
│                                                                                         │
│  ├─ Primary Datastore: Google Cloud Firestore (Collections: users, resumes, tenants...) │
│  ├─ Realtime Datastore: Firebase Realtime Database (Chat & Presence)                    │
│  ├─ AI Inference Providers: NVIDIA NIM, Google Gemini, OpenAI, Groq, OpenRouter, DeepSeek│
│  ├─ Payment Processors: Stripe, Razorpay, PayPal, Paytm, PhonePe                        │
│  ├─ Messaging & SMTP: Nodemailer (SMTP / Brevo), Twilio SMS                             │
│  └─ Headless Browser Renderers: Playwright Chromium (High-Fidelity PDF & DOCX pipeline) │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Module Boundaries & Ownership

### 2.1 Presentation Tier (`src/`)
- **App Shell & Routing (`src/main.jsx`)**: Central routing switch using `react-router-dom` v7. Mounts public routes, protected user dashboards via `RequireAuthenticated`, administrator panels via `/adm/*`, and multi-tenant consoles via `/enterprise/*`.
- **Public & Marketing (`src/components/welcome/`, `JobsLanding/`, `Blog/`, `Features/`)**: Public discovery pages, SEO metadata (`RouteSeo.jsx`), and marketing components.
- **Candidate Studio (`src/components/BuildResume/`, `CoverLetter/`, `PortfolioBuilder/`)**: Interactive editors with live preview, 51 resume templates (`src/cv-templates/`), 4 cover letter templates, and 4 web portfolio templates.
- **Admin Control Plane (`src/components/admin/`)**: 31 configuration cards, user management, audit logs, system health, and job/company moderation.
- **Enterprise Console (`src/enterprise/`)**: 14 operational tabs for multi-tenant identity, role-based access, signed artifact distribution, audit exports, and cloud workspace isolation.

### 2.2 API & Gateway Tier (`backend/index.js`, `backend/routes/`)
- **Express Monolith Gateway (`backend/index.js`)**: Configures security middlewares, request tracing (`X-Request-Id`), JSON body parsing, CORS allowlisting, and rate limiting (global 2500 req/15m, auth 20 req/h).
- **Public API Exception Whitelist (`publicApiPaths`)**: Explicitly whitelisted zero-auth protocol endpoints (`/healthz`, `/readyz`, `/api/healthz`, `/api/service-availability`, `/api/platform/version`, `/stripe-webhook`, `/contact`, `/api/public/custom-pages`, `/api/public/trusted-by`, `/api/auth/oauth/exchange`).
- **Platform Router (`backend/routes/platform.js`)**: 25+ administrative health, metrics, observability, queue inspection, and operator role endpoints.
- **AI Gateway Router (`backend/routes/ai.js`)**: Unified streaming/non-streaming inference proxy with automatic multi-provider fallback and prompt injection protection.
- **Email Router (`backend/routes/email.js`)**: SMTP verification, template preview, outbox queueing, and webhook notifications.
- **Enterprise Router (`backend/routes/enterprise.js`)**: Multi-tenant administration, workspace isolation, team memberships, and audit streams.

### 2.3 Business Services Tier (`backend/services/`)
- **AI Runtime (`aiRuntime.js`)**: Dynamically resolves keys from server-side Firestore secrets (`settings/ai_providers`), manages failover cascades (NVIDIA NIM $\rightarrow$ Gemini $\rightarrow$ Groq $\rightarrow$ OpenAI), and sanitizes LLM JSON output with control character unescaping.
- **DOCX & PDF Export Engines (`docxExport.js`, `docxThemes.js`)**: Generates byte-accurate Word documents matching all 51 CSS resume archetypes; drives headless Playwright for pixel-perfect PDF rendering.
- **Payment Admin Engine (`paymentAdmin.js`, `backend/security/payments.js`)**: Server-side coupon application, idempotency reservation, order ledger integrity, and provider webhook signature verification (Stripe HMAC, Razorpay SHA-256, PayPal REST, Paytm Checksum, PhonePe SHA-256).
- **Platform Health Service (`platformHealth.js`)**: Live connectivity probes for Firestore, Auth, Storage, SMTP, and AI providers with TTL-cached snapshots.

### 2.4 Enterprise & Storage Tier (`backend/enterprise/`)
- **Tenant Context (`tenantContext.js`)**: Request-scoped tenant and workspace isolation enforcing strict tenant boundary separation.
- **Durable Outbox Queue (`enterpriseOutbox.js`)**: Transactional Firestore queue with HMAC-SHA256 envelope signing, lease-based worker concurrency, and Dead Letter Queue (DLQ) retry policies.
- **Envelope Encryption (`encryptionProvider.js`)**: AES-256-GCM field and document level encryption with authenticated data tags (AAD) preventing tampering.

---

## 3. Authentication & Security Boundaries

| Boundary | Authentication Mechanism | Authorization Policy | Enforcement Point |
|----------|--------------------------|----------------------|-------------------|
| **Public Endpoints** | None (Anonymous) | Open or IP Rate Limited | `publicApiPaths` Set (`backend/index.js:253`) |
| **Authenticated User** | Firebase ID Token (`Bearer`) | Valid UID matching target resource | `requireAuth` (`backend/security/auth.js`) |
| **Platform Administrator** | Firebase ID Token (`Bearer`) | Role `ADMIN` or `SUPER_ADMIN` in custom claims | `requirePermission` (`backend/security/auth.js`) |
| **Super Administrator** | Firebase ID Token (`Bearer`) + TOTP MFA | Role `SUPER_ADMIN` + Second factor verification | `requireSuperAdmin` & `requireRecentAdminAuthentication` |
| **Enterprise Tenant** | Firebase Token or M2M API Key | Tenant membership + workspace entitlement | `createEnterpriseAuthMiddleware` (`backend/enterprise/`) |

---

## 4. Failure & Resilience Boundaries

1. **AI Provider Fallback**: If primary inference provider (e.g. NVIDIA NIM) encounters HTTP 429, 500, or model deprecation, `aiRuntime.js` immediately cascades to secondary active providers (Gemini, Groq, OpenAI) without dropping client connection.
2. **Firestore Rate Limit & Quota Resilience**: Public read endpoints (`getPages`, `getTrustedBy`, `getFeaturedJobs`, `getPublicPortfolios`) implement client-side in-memory caching and fallback to prevent page crashes during upstream quota constraints.
3. **Outbox Queue Isolation**: Outbox workers run asynchronously with exponential backoff. Poison messages are quarantined to the DLQ after 5 failed lease attempts without blocking other tenant notifications.
4. **Zero Client Secret Leakage**: Secret keys are never returned in client API responses. Server projections mask sensitive fields (`geminiApiKey: ''`) while returning explicit status booleans.
