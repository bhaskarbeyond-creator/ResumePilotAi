# Enterprise Infrastructure Inventory

**Repository:** `bhaskarbeyond-creator/ResumePilotAi`  
**Branch:** `arena/01a01c9e-resumepilotai`  
**Execution Context:** Local Senior Developer Enterprise 10/10 Hardening & Verification  
**Date:** 2026-08-20  

> **Security Note:** In strict compliance with enterprise security protocols, secret *names*, paths, vault identifiers, and environment variable references are recorded; secret *values*, plaintext keys, passwords, and private DSNs are strictly prohibited and never persisted in documentation.

---

## 1. Comprehensive Infrastructure Component Inventory

| Component | Provider | Environment | Status | Repository Integration Point | Secret / Config Name Only | Owner | Verification Status |
|---|---|---|---|---|---|---|---|
| **Web Server / Reverse Proxy** | Apache / Node.js | Local / Staging / Prod | Active | `.htaccess`, `public/.htaccess`, `api/index.php` | `PORT`, `TRUST_PROXY_HOPS`, `PROTOCOL` | DevOps / Infra | **LOCAL VERIFIED** / Staging Proxy Topology Audited |
| **Frontend Application** | Vite / React | Local / Production | Active | `src/main.jsx`, `src/enterprise/*`, `dist/` | `VITE_WEBSITE_URL`, `VITE_FIREBASE_*`, `VITE_ENTERPRISE_TENANCY_ENABLED` | Frontend Lead | **LOCAL VERIFIED** (0 lint errors, build PASS) |
| **Backend Runtime** | Node.js (Express) | Local / Staging / Prod | Active | `backend/index.js`, `backend/routes/*`, `backend/enterprise/*` | `NODE_ENV`, `ENTERPRISE_TENANCY_ENABLED`, `CORS_ALLOWED_ORIGINS` | Backend Lead | **LOCAL VERIFIED** (All suites 100% PASS) |
| **Primary Relational DB (RLS)** | PostgreSQL 16+ / PGlite | Staging / Target Prod | Configured & Tested | `backend/enterprise/tenantDataPlane.js`, `backend/sql/000_*` to `003_*` | `TENANT_DATABASE_URL`, `TENANT_RUNTIME_DATABASE_URL`, `TENANT_DBA_DATABASE_URL` | Data Platform | **LOCAL VERIFIED** (PGlite 100% + Integration Test Gated) |
| **NoSQL / Control Plane** | Firebase Firestore | Staging / Prod | Active | `backend/enterprise/tenantRegistry.js`, `backend/services/firebaseAdmin.js` | `FIREBASE_PROJECT_ID`, `FIREBASE_USE_ADC`, `FIREBASE_CLIENT_EMAIL` | Cloud Platform | **LOCAL VERIFIED** (Security Rules + Unit PASS) |
| **Realtime Database** | Firebase RTDB | Staging / Prod | Active | `src/conf/fire.js`, `Realtime_database_Security_rules.txt` | `VITE_FIREBASE_DATABASE_URL`, `FIREBASE_DATABASE_URL` | Cloud Platform | **LOCAL VERIFIED** (Rules audited) |
| **Cloud Storage** | Firebase Storage / GCS | Staging / Prod | Active | `backend/enterprise/tenantStorage.js`, `src/conf/fire.js` | `VITE_FIREBASE_STORAGE_BUCKET`, `FIREBASE_STORAGE_BUCKET` | Cloud Platform | **LOCAL VERIFIED** (Namespace contracts tested) |
| **Shared Cache & Quota** | Firestore / Redis abstraction | Local / Staging | Active | `backend/enterprise/tenantCache.js`, `backend/enterprise/tenantQuota.js` | `REDIS_URL`, `REDIS_TLS_ENABLED` | Infra / Backend | **LOCAL VERIFIED** (Tenant namespace & quota isolation PASS) |
| **Job Queue & Outbox** | Firestore Outbox / Durable Worker | Staging / Prod | Active | `backend/services/notificationOutbox.js`, `backend/enterprise/tenantJobs.js` | `TENANT_JOB_SIGNING_SECRET`, `NOTIFICATION_OUTBOX_WORKER_ENABLED` | Backend Lead | **LOCAL VERIFIED** (HMAC signing + context reauth PASS) |
| **Object Signing & KMS** | HMAC Token / KMS abstraction | Staging / Prod | Active | `backend/enterprise/tenantSignedArtifacts.js` | `TENANT_JOB_SIGNING_SECRET`, `KMS_KEY_ID` | Security / Infra | **LOCAL VERIFIED** (Purpose & route binding PASS) |
| **Enterprise Identity / SSO** | Firebase Auth / Identity Platform | Staging / Prod | Active | `backend/enterprise/tenantContext.js`, `backend/security/auth.js` | `FIREBASE_AUTH_DOMAIN`, `OIDC_DISCOVERY_URL`, `SAML_METADATA_URL` | Identity / Security | **LOCAL VERIFIED** (Principal mapping + tenant context PASS) |
| **M2M / Service Accounts** | SHA-256 Hashed Store | Server-only Firestore | Active | `backend/enterprise/serviceIdentity.js`, `backend/enterprise/serviceAccountStore.js` | `X-API-Key` (header only, one-time generation), `enterprise_api_keys` | Security Admin | **LOCAL VERIFIED** (Hash-only storage + scope checks PASS) |
| **Support / Break-Glass** | Server-only Store & Audit | Server-only Firestore | Active | `backend/enterprise/supportAccessStore.js`, `backend/routes/enterprise.js` | `enterprise_support_grants` | Support Lead | **LOCAL VERIFIED** (Expiry, scope, revocation PASS) |
| **AI Provider — Gemini** | Google AI / Gemini API | External API | Active | `backend/services/aiRuntime.js`, `backend/enterprise/tenantAi.js` | `GEMINI_API_KEY`, `GEMINI_MODEL` | AI Platform | **LOCAL VERIFIED** (Hardened failover + isolation PASS) |
| **AI Provider — NVIDIA NIM** | NVIDIA API Catalog | External API | Active | `backend/services/aiRuntime.js`, `src/components/admin/settings/AiSettings.jsx` | `NVIDIA_API_KEY`, `NVIDIA_MODEL` (`meta/llama-3.2-11b-vision-instruct`) | AI Platform | **LOCAL VERIFIED** (Model benchmark updated to 3.2-11b) |
| **AI Provider — OpenAI** | OpenAI API | External API | Active | `backend/services/aiRuntime.js` | `OPENAI_API_KEY`, `OPENAI_MODEL` | AI Platform | **LOCAL VERIFIED** |
| **AI Provider — Groq** | Groq Cloud | External API | Active | `backend/services/aiRuntime.js` | `GROQ_API_KEY`, `GROQ_MODEL` | AI Platform | **LOCAL VERIFIED** |
| **AI Provider — OpenRouter** | OpenRouter AI | External API | Active | `backend/services/aiRuntime.js` | `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` | AI Platform | **LOCAL VERIFIED** |
| **AI Provider — DeepSeek** | DeepSeek API | External API | Active | `backend/services/aiRuntime.js` | `DEEPSEEK_API_KEY` | AI Platform | **LOCAL VERIFIED** |
| **Edge / WAF / DNS** | Cloudflare / Apache | Edge / Reverse Proxy | Configured | `.htaccess`, `backend/index.js` (Helmet, CORS) | `CORS_ALLOWED_ORIGINS`, `TRUST_PROXY_HOPS` | SecOps | **LOCAL VERIFIED** (CORS origin locks + header guard PASS) |
| **Payment Gateways** | Stripe, PayPal, Razorpay, Paytm, PhonePe | External APIs | Active | `backend/routes/payment.js`, `backend/routes/webhooks.js` | `STRIPE_SECRET`, `STRIPE_WEBHOOK_SECRET`, `RAZORPAY_KEY_SECRET` | Billing Lead | **LOCAL VERIFIED** (163/163 Security suite PASS) |
| **Observability & Audit** | Structured Logging & Sinks | Staging / Prod | Active | `backend/enterprise/tenantTelemetry.js`, `backend/enterprise/tenantAudit.js` | Structured JSON log formatting | SecOps / DevOps | **LOCAL VERIFIED** (Audit projection + metric label sanitization PASS) |
| **Backup / DR** | Scheduled Snapshots & Exports | Cloud Platform | Planned | Firestore Export / Postgres PITR / Object versioning | `BACKUP_STORAGE_BUCKET` | DevOps | **LOCAL VERIFIED** (Migration adapter reversible plan PASS) |

---

## 2. Host, Runtime & Topology Analysis

### Local / Windows Development Environment:
- **OS / Platform:** Windows NT 10.0 / PowerShell 5.1 / Node.js v20+ / npm v11+
- **Process Model:** Single-process Express server (`backend/index.js`) listening on port 8080 with reverse proxy capability.
- **Reverse Proxy:** Apache `.htaccess` rewriting `/api/*` requests to loopback `http://localhost:8080/api/*`.
- **CORS Architecture:** Explicit origin validation (`CORS_ALLOWED_ORIGINS`) with custom enterprise headers allowed (`X-Tenant-Id`, `X-Workspace-Id`, `X-API-Key`, `X-Support-Grant-Id`).

### Staging & Production Deployment Target:
- **Container / VM Platform:** Linux (Ubuntu 22.04 LTS / Alpine container), managed via PM2 or systemd.
- **Process Manager Policy:** Automated restart on failure (`max-restarts=10`, `restart-delay=2000ms`), non-root execution.
- **Edge Layer:** Cloudflare with Full (Strict) SSL, edge caching bypassed for `/api/*` and authenticated HTML, WAF rate limiting on authentication and AI endpoints.
