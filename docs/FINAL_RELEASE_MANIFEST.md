# ResumePilot AI — Final Release Manifest

**Release Version**: Production Freeze Release `2026-08-26`  
**Git Tag**: `zero-trust-production-certification-2026-08-26`  
**Target Environment**: Production (`https://airesume.projectdemo.guru`)  
**Deployment Tool**: `scripts/deploy_production.py` (SFTP / SSH Automated Pipeline)  

---

## 1. Release Manifest Artifacts

### Core Architecture Components
1. **Backend Engine**: Express 5 / Node.js 22 LTS API Gateway (`backend/index.js`)
2. **Database Access Layer**: `backend/repositories/MySQLRepository.js` (30 Relational Tables, InnoDB, utf8mb4)
3. **Standby Database Access Layer**: `backend/repositories/FirestoreRepository.js`
4. **Intelligent Sync & Outbox Daemon**: `backend/database/syncManager.js`
5. **AI Runtime & Multi-Provider Engine**: `backend/services/aiRuntime.js`, `backend/services/aiAdmin.js` (NVIDIA NIM, Gemini, OpenAI, Groq, OpenRouter, DeepSeek)
6. **Billing & Split-Store Payment Vault**: `backend/services/paymentAdmin.js`, `backend/services/platformCurrency.js` (Stripe, PayPal, Razorpay, Paytm, PhonePe)
7. **Security & Authentication Subsystem**: `backend/security/auth.js`, `backend/security/totp.js` (Firebase Auth JWT, TOTP MFA)
8. **Enterprise IAM & Tenancy Engine**: `backend/enterprise/*`

### Client Distribution Bundle
- Production assets built via `npm run build` into `dist/`:
  - `dist/index.html` (Master SPA entry point, CSP compliant)
  - `dist/assets/*` (Optimized JS/CSS bundles with hash revisioning)
  - `dist/locales/*` (Multi-language localization bundles for 15+ locales)

---

## 2. Configuration & Environment Manifest

| Variable | Target Value / Type | Purpose |
| :--- | :--- | :--- |
| `ACTIVE_DATABASE_ENGINE` | `mysql` | Declares MariaDB as the primary authoritative database |
| `MYSQL_HOST` | `srv1942.hstgr.io` | Cloud MariaDB cluster host |
| `MYSQL_PORT` | `3306` | MySQL standard connection port |
| `MYSQL_DATABASE` | `u776602306_airesume` | Production relational schema (30 canonical tables) |
| `DEFAULT_CURRENCY` | `INR` | Standard platform currency |
| `DEFAULT_NVIDIA_MODEL` | `meta/llama-3.2-11b-vision-instruct` | Primary high-speed LLM model |
| `BACKUP_NVIDIA_MODEL` | `nvidia/nemotron-mini-4b-instruct` | Resilient failover LLM model |

---

## 3. Pre-Deployment Validation Checklist

- [x] Zero synchronous Firestore dependencies on user paths
- [x] Chaos engineering tests pass 100% (6/6)
- [x] Database parity tests pass 100% (21/21)
- [x] Security and MFA tests pass 100% (28/28)
- [x] Production build passes cleanly with zero syntax/minification errors
- [x] Negative control mutations verified (monotonic guard & error classifier actively tested)

**Release Authorization**: **APPROVED FOR PRODUCTION DEPLOYMENT**
