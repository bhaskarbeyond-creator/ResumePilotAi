# ResumePilot AI — Configuration & Environment Matrix

> **⚠ FORENSIC AUDIT CORRECTION (2026-08-24).** Census re-derived from source:
> **97** app-level backend environment variables (excluding `node_modules`) and
> **18** `VITE_*` build-time public variables.
>
> **`FIREBASE_TOTP_MFA_ENABLED` does not exist in this codebase** — a full-tree
> search returns no match. MFA enforcement is governed by
> `SUPER_ADMIN_MFA_REQUIRED` (defaults to enabled when `NODE_ENV=production`),
> with `SENSITIVE_AUTH_MAX_AGE_MS` (default `600000`) and
> `REQUIRE_RECENT_AUTH_IN_TEST`. Any runbook referencing
> `FIREBASE_TOTP_MFA_ENABLED` describes an unimplemented setting.
> See `FINAL_FORENSIC_CODEBASE_AUDIT.md` §10.


> **Authoritative Configuration & Environment Census**  
> **Source Commit:** `8c7905f`  
> **Classification:** AUTHORITATIVE SOURCE OF TRUTH

---

## 1. Classification Taxonomy

- **SUPER_ADMIN CONFIGURABLE**: Managed dynamically at runtime via the `/adm/settings` Super Admin UI cards.
- **ADMIN CONFIGURABLE**: Managed dynamically via standard Admin UI panels without MFA escalation.
- **READ ONLY**: Read by clients/consoles for diagnostics; immutable from public or standard admin APIs.
- **INFRASTRUCTURE ONLY**: Injected via process environment variables (`.env`) or cloud orchestrator at container startup.

---

## 2. Master Configuration Census

| Setting / Variable | Location / Scope | Classification | Runtime Consumption |
|--------------------|------------------|----------------|---------------------|
| `PORT` | `backend/.env` | INFRASTRUCTURE ONLY | Express HTTP listener (default 8080) |
| `WEBSITE_NAME` | `backend/.env` | INFRASTRUCTURE ONLY | CORS allowlist & public link generator |
| `PROTOCOL` | `backend/.env` | INFRASTRUCTURE ONLY | Must be `https` in production |
| `FIREBASE_PROJECT_ID` | `backend/.env` | INFRASTRUCTURE ONLY | Firebase Admin initialization |
| `FIREBASE_CLIENT_EMAIL` | `backend/.env` | INFRASTRUCTURE ONLY | Service Account credentials |
| `FIREBASE_PRIVATE_KEY` | `backend/.env` | INFRASTRUCTURE ONLY | Service Account cryptographic signing |
| `SUPER_ADMIN_MFA_REQUIRED`| `backend/.env` | INFRASTRUCTURE ONLY | Enforces TOTP MFA check on Super Admin routes |
| `ENTERPRISE_TENANCY_ENABLED`| `backend/.env` & public_config | SUPER_ADMIN CONFIGURABLE | Toggles multi-tenant enterprise engine |
| `AI Provider API Keys` | Firestore `settings/ai_providers` | SUPER_ADMIN CONFIGURABLE | `aiRuntime.js` multi-provider failover |
| `AI Primary & Fallback Models`| Firestore `settings/ai_providers`| SUPER_ADMIN CONFIGURABLE | Model selection in `AiSettings.jsx` |
| `Daily AI Generation Quotas`| Firestore `settings/ai_providers`| SUPER_ADMIN CONFIGURABLE | `enforceDailyAiQuota` in `abuse.js` |
| `Stripe Secret & Webhook Keys`| Firestore `settings/subscriptions`| SUPER_ADMIN CONFIGURABLE | Payment Intent creation & webhook HMAC |
| `Razorpay Key ID & Secret` | Firestore `settings/subscriptions`| SUPER_ADMIN CONFIGURABLE | Razorpay order creation & signature check |
| `PayPal Client ID & Secret`| Firestore `settings/subscriptions`| SUPER_ADMIN CONFIGURABLE | PayPal v2 order capture & validation |
| `Paytm Merchant ID & Key` | Firestore `settings/subscriptions`| SUPER_ADMIN CONFIGURABLE | Paytm transaction initiation |
| `PhonePe Merchant ID & Salt`| Firestore `settings/subscriptions`| SUPER_ADMIN CONFIGURABLE | PhonePe payment initiation & checksum |
| `SMTP Host, Port, User, Pass`| Firestore `settings/smtp` | SUPER_ADMIN CONFIGURABLE | Nodemailer transactional email delivery |
| `Twilio SID, Auth Token, From`| Firestore `settings/twilio` | SUPER_ADMIN CONFIGURABLE | SMS dispatch engine in `backend/index.js` |
| `Maintenance Mode Toggles` | Firestore `data/public_config` | SUPER_ADMIN CONFIGURABLE | Locks client SPA with admin bypass |
| `Feature Flags Matrix` | Firestore `data/public_config` | ADMIN CONFIGURABLE | Dynamic UI module toggles |
| `Custom CMS Pages` | Firestore `pages` collection | ADMIN CONFIGURABLE | Custom footer links and marketing pages |
| `Trusted Brand Logos` | Firestore `trustedBy` collection | ADMIN CONFIGURABLE | Marquee brand logo manager |
| `Commit SHA / Build Identity`| `backend/COMMIT_SHA` | READ ONLY | Health checks (`/api/healthz`, `/api/platform/version`) |
| `System Health Matrix` | Live diagnostic memory / cache | READ ONLY | Real-time health probes (`/api/platform/health`) |
