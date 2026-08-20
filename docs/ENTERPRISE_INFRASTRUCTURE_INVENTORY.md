# Enterprise Infrastructure Inventory

**Repository:** `bhaskarbeyond-creator/ResumePilotAi`  
**Branch:** `arena/01a01c9e-resumepilotai`  
**Execution Context:** Real-World Evidence Gap-Closure Audit  
**Date:** 2026-08-20  

> **Security Note:** In strict compliance with enterprise security protocols, secret *names*, paths, vault identifiers, and environment variable references are recorded; secret *values*, plaintext keys, passwords, and private DSNs are strictly prohibited and never persisted in documentation.

---

## 1. Comprehensive Infrastructure Component Inventory

| Component | Provider | Environment | Status | Repository Integration Point | Secret / Config Name Only | Owner | Verification Status |
|---|---|---|---|---|---|---|---|
| **Web Server / Reverse Proxy** | Apache / LiteSpeed / Node | Production (`airesume.projectdemo.guru`) | Active | `.htaccess`, `public/.htaccess`, `api/index.php` | `PORT`, `TRUST_PROXY_HOPS`, `PROTOCOL` | DevOps / Infra | **PRODUCTION VERIFIED** |
| **Frontend Application** | Vite / React / Playwright | Browser / Production (`airesume.projectdemo.guru`) | Active | `src/main.jsx`, `src/enterprise/*`, `dist/` | `VITE_WEBSITE_URL`, `VITE_FIREBASE_*`, `VITE_ENTERPRISE_TENANCY_ENABLED` | Frontend Lead | **PRODUCTION VERIFIED** |
| **Backend Runtime** | Node.js (Express) | Local & Production (`airesume.projectdemo.guru`) | Active | `backend/index.js`, `backend/routes/*`, `backend/enterprise/*` | `NODE_ENV`, `ENTERPRISE_TENANCY_ENABLED`, `CORS_ALLOWED_ORIGINS` | Backend Lead | **PRODUCTION VERIFIED** |
| **Relational DB & RLS Engine (PGlite)** | PostgreSQL 16 (WASM Engine) | In-Process / Local | Active | `backend/enterprise/tenantDataPlane.js`, `backend/sql/000_*` to `003_*` | `TENANT_DATABASE_URL` | Data Platform | **LOCAL VERIFIED** |
| **Managed PostgreSQL (Cloud RDS/DSN)** | Managed PostgreSQL | Staging / Prod Target | Pending DSN | `backend/enterprise-test/real-postgres-rls.integration.test.js` | `TENANT_RUNTIME_DATABASE_URL`, `TENANT_DBA_DATABASE_URL` | Data Platform | **UNVERIFIED** |
| **Production Control Plane (Firestore)** | Firebase Firestore (`ai-resume-builder-424cf`) | Production Project | Active (14 Collections Verified) | `backend/enterprise/tenantRegistry.js`, `backend/services/firebaseAdmin.js` | `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | Cloud Platform | **PRODUCTION VERIFIED** |
| **Realtime Database** | Firebase RTDB | Staging / Prod | Active | `src/conf/fire.js`, `Realtime_database_Security_rules.txt` | `VITE_FIREBASE_DATABASE_URL`, `FIREBASE_DATABASE_URL` | Cloud Platform | **LOCAL VERIFIED** |
| **Cloud Storage Tokens & Namespace** | HMAC / Signed Token | Local / In-Memory | Active | `backend/enterprise/tenantStorage.js`, `backend/enterprise/tenantSignedArtifacts.js` | `TENANT_JOB_SIGNING_SECRET` | Security / Infra | **LOCAL VERIFIED** |
| **Live Object Storage / KMS Scanner** | Cloudflare R2 / GCS / S3 | Staging / Prod | Pending Cloud Connect | `backend/enterprise/tenantStorage.js` | `CLOUDFLARE_R2_ENDPOINT`, `CLOUDFLARE_R2_ACCESS_KEY_ID`, `KMS_KEY_ID` | Cloud Platform | **UNVERIFIED** |
| **Shared Cache & Quota (Adapter)** | Firestore / In-Memory | Local / In-Process | Active | `backend/enterprise/tenantCache.js`, `backend/enterprise/tenantQuota.js` | N/A (In-process & Firestore Atomic Stores) | Backend Lead | **LOCAL VERIFIED** |
| **Live Redis Server** | Redis Enterprise / Standalone | Staging / Prod | Pending Deployment | `backend/enterprise/tenantCache.js` | `REDIS_URL`, `REDIS_TLS_ENABLED` | Infra / Backend | **UNVERIFIED** |
| **Job Queue & Outbox (Firestore)** | Firestore Outbox / Durable Worker | Local / Node | Active | `backend/services/notificationOutbox.js`, `backend/enterprise/tenantJobs.js` | `TENANT_JOB_SIGNING_SECRET`, `NOTIFICATION_OUTBOX_WORKER_ENABLED` | Backend Lead | **LOCAL VERIFIED** |
| **Managed Message Broker (SQS/Kafka)** | Managed Queue Service | Staging / Prod | Pending Deployment | `backend/enterprise/tenantJobs.js` | `QUEUE_PROVIDER_URL` | DevOps / Infra | **UNVERIFIED** |
| **Enterprise Identity & Canonical Principal** | Cryptographic Mapping | In-Process / Node | Active | `backend/enterprise/tenantContext.js`, `backend/security/auth.js` | `canonicalPrincipalId(subject, issuer)` | Identity Lead | **LOCAL VERIFIED** |
| **Live IdP / SAML / SCIM Server** | Okta / Azure AD / Ping | Staging / Prod | Pending Integration | `backend/enterprise/tenantRegistry.js` (`identityPolicy`) | `OIDC_DISCOVERY_URL`, `SAML_METADATA_URL` | Identity Lead | **UNVERIFIED** |
| **M2M / Service Accounts** | SHA-256 Hashed Store | Server-only Firestore | Active | `backend/enterprise/serviceIdentity.js`, `backend/enterprise/serviceAccountStore.js` | `enterprise_api_keys` | Security Admin | **LOCAL VERIFIED** |
| **Support / Break-Glass** | Server-only Store & Audit | Server-only Firestore | Active | `backend/enterprise/supportAccessStore.js`, `backend/routes/enterprise.js` | `enterprise_support_grants` | Support Lead | **LOCAL VERIFIED** |
| **AI Provider — Gemini** | Google AI / Gemini API | External API | Active | `backend/services/aiRuntime.js`, `backend/enterprise/tenantAi.js` | `GEMINI_API_KEY`, `GEMINI_MODEL` | AI Platform | **LOCAL VERIFIED** |
| **AI Provider — NVIDIA NIM** | NVIDIA API Catalog | External API | Active | `backend/services/aiRuntime.js`, `src/components/admin/settings/AiSettings.jsx` | `NVIDIA_API_KEY`, `NVIDIA_MODEL` (`meta/llama-3.2-11b-vision-instruct`) | AI Platform | **LOCAL VERIFIED** |
| **AI Provider — OpenAI** | OpenAI API | External API | Active | `backend/services/aiRuntime.js` | `OPENAI_API_KEY`, `OPENAI_MODEL` | AI Platform | **LOCAL VERIFIED** |
| **AI Provider — Groq** | Groq Cloud | External API | Active | `backend/services/aiRuntime.js` | `GROQ_API_KEY`, `GROQ_MODEL` | AI Platform | **LOCAL VERIFIED** |
| **AI Provider — OpenRouter** | OpenRouter AI | External API | Active | `backend/services/aiRuntime.js` | `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` | AI Platform | **LOCAL VERIFIED** |
| **AI Provider — DeepSeek** | DeepSeek API | External API | Active | `backend/services/aiRuntime.js` | `DEEPSEEK_API_KEY` | AI Platform | **LOCAL VERIFIED** |
| **Cloudflare Edge, WAF & Security Headers** | Cloudflare Edge / LiteSpeed | Production (`airesume.projectdemo.guru`) | Active (HSTS, CSP, CORS Tested) | Edge / Zone Config | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | SecOps | **PRODUCTION VERIFIED** |
| **Payment Gateways** | Stripe, PayPal, Razorpay, Paytm, PhonePe | External APIs | Active | `backend/routes/payment.js`, `backend/routes/webhooks.js` | `STRIPE_SECRET`, `STRIPE_WEBHOOK_SECRET`, `RAZORPAY_KEY_SECRET` | Billing Lead | **LOCAL VERIFIED** |
| **Observability & Audit Context** | Structured Logging & Sinks | In-Process / Node | Active | `backend/enterprise/tenantTelemetry.js`, `backend/enterprise/tenantAudit.js` | Structured JSON log formatting | SecOps / DevOps | **LOCAL VERIFIED** |
| **Backup & Disaster Recovery Drill** | Cloud Snapshots / Restores | Cloud Platform | Pending Drill | Database PITR / Storage Versioning | `BACKUP_STORAGE_BUCKET` | DevOps | **UNVERIFIED** |
| **Cluster Load Testing** | Distributed Load Generators | Staging Cluster | Pending Test | Load Testing Scripts | N/A | QA / DevOps | **UNVERIFIED** |
| **Third-Party Pen Testing** | External Security Auditor | External Audit | Pending Engagement | Penetration Testing Report | N/A | Security Lead | **UNVERIFIED** |
