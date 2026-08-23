# Super Admin Configuration Matrix

> **Authoritative inventory of all platform configuration.**
> Generated from repository forensics on commit `f7f285c`.
> Last updated: 2026-08-23.

## Classification Legend

| Code | Meaning |
|------|---------|
| **A** | Immutable Infrastructure — server-only, requires deployment |
| **B** | Runtime Platform Config — can be changed at runtime |
| **C** | Feature Flag — boolean toggle, may require restart |
| **D** | Product Config — stored in Firestore, UI-editable |
| **E** | Tenant Config — delegated to Enterprise platform |
| **F** | Integration Config — third-party credentials/settings |
| **G** | Operational Control — worker intervals, rate limits |

## Status Legend

| Status | Meaning |
|--------|---------|
| ✅ COMPLETE | Backend + API + Admin UI + Secret-safe + Audited |
| ⚠️ PARTIAL | Some components exist but gaps remain |
| ❌ MISSING | No Admin UI exposure |
| 🔒 SERVER-ONLY | Intentionally infrastructure-only |
| 🗑️ LEGACY | Deprecated or superseded |
| 🔧 REQUIRES INFRA | Cannot be changed without deployment |

---

## A. Immutable Infrastructure Secrets

| Configuration | Purpose | Source | Secret | Admin UI | Requires Restart | Status |
|---|---|---|---|---|---|---|
| `FIREBASE_PRIVATE_KEY` | Firebase Admin SDK auth | `backend/.env` | ✅ SECRET | Firebase Settings (rotate) | Yes | ⚠️ PARTIAL — UI exists but rotation blocked in prod |
| `FIREBASE_CLIENT_EMAIL` | Firebase service account | `backend/.env` | No | Firebase Settings (read-only) | Yes | ⚠️ PARTIAL |
| `FIREBASE_PROJECT_ID` | Firebase project identifier | `backend/.env` | No | Firebase Settings (read-only) | Yes | ⚠️ PARTIAL |
| `FIREBASE_DATABASE_URL` | Realtime Database URL | `backend/.env` | No | None | Yes | 🔒 SERVER-ONLY |
| `FIREBASE_USE_ADC` | Use Application Default Credentials | `backend/.env` | No | None | Yes | 🔒 SERVER-ONLY |
| `GOOGLE_APPLICATION_CREDENTIALS` | GCP credential file path | `backend/.env` | No | None | Yes | 🔒 SERVER-ONLY |
| `NODE_ENV` | Runtime environment | System | No | None | Yes | 🔒 SERVER-ONLY |
| `PORT` | Server listen port | `backend/.env` | No | None | Yes | 🔒 SERVER-ONLY |
| `PROTOCOL` | HTTP/HTTPS protocol | `backend/.env` | No | None | Yes | 🔒 SERVER-ONLY |
| `COMMIT_SHA` | Deployed build SHA | Deployment | No | Platform Health (read-only) | N/A | ✅ COMPLETE |

## B. Runtime Platform Configuration

| Configuration | Purpose | Source | Secret | Admin UI | Requires Restart | Status |
|---|---|---|---|---|---|---|
| `CORS_ALLOWED_ORIGINS` | Allowed CORS origins | `backend/.env` | No | None | Yes | ❌ MISSING |
| `TRUST_PROXY_HOPS` | Reverse proxy depth | `backend/.env` | No | None | Yes | ❌ MISSING |
| `GLOBAL_RATE_LIMIT_MAX` | Global rate limit ceiling | `backend/.env` | No | None | Yes | ❌ MISSING |
| `WEBSITE_NAME` | Platform domain name | `backend/.env` | No | Website Settings | No | ⚠️ PARTIAL — Firestore `data/system` override exists |
| `ADMIN_EMAIL` | Default admin email | `backend/.env` | No | None | Yes | ❌ MISSING |

## C. Feature Flags

| Configuration | Purpose | Source | Secret | Admin UI | Status |
|---|---|---|---|---|---|
| `ENTERPRISE_TENANCY_ENABLED` | Enable tenant system | `backend/.env` + Firestore | No | Feature Flags | ✅ COMPLETE |
| `ENFORCE_SSL_ONLY` | Require HTTPS | `backend/.env` + Firestore | No | Feature Flags | ✅ COMPLETE |
| `ALLOW_INSECURE_SESSION_COOKIES` | Allow non-secure cookies | `backend/.env` + Firestore | No | Feature Flags | ✅ COMPLETE |
| `DISABLE_RATE_LIMITING` | Disable rate limits (dev) | `backend/.env` + Firestore | No | Feature Flags | ✅ COMPLETE |
| `MOCK_PAYMENT_GATEWAYS` | Mock payments (dev) | `backend/.env` + Firestore | No | Feature Flags | ✅ COMPLETE |
| `ALLOW_RUNTIME_FIREBASE_CREDENTIAL_ROTATION` | Allow cred rotation via API | `backend/.env` + Firestore | No | Feature Flags | ✅ COMPLETE |
| `NOTIFICATION_OUTBOX_EXTERNAL_WORKER` | Declare external worker | `backend/.env` + Firestore | No | Feature Flags | ✅ COMPLETE |

## D. Product Configuration (Firestore-backed)

| Configuration | Purpose | Source | Secret | Admin UI | Status |
|---|---|---|---|---|---|
| AI Provider Settings | AI model/provider selection | `settings/ai_providers` | ✅ Keys masked | AI & Gemini Settings | ✅ COMPLETE |
| AI Quota Limits | Daily generation limits per tier | `settings/ai_quota` | No | AI & Gemini Settings | ✅ COMPLETE |
| Subscription Plans | Pricing, currency, plan tiers | `data/public_config` | No | Subscriptions & Gateways | ✅ COMPLETE |
| Branding | Logo, colors, brand identity | `data/system` | No | Branding Settings | ✅ COMPLETE |
| Website Meta | Title, description, SEO | `data/system` | No | Brand Identity & Meta | ✅ COMPLETE |
| GDPR & Legal | Privacy policy, cookie consent | `data/system` | No | GDPR & Legal | ✅ COMPLETE |
| Modules | Enable/disable product modules | `data/system` → `modules` | No | Addon Modules | ✅ COMPLETE |
| System Health Monitoring | Health check configuration | `data/system` | No | System Health | ✅ COMPLETE |

## E. Tenant Configuration

| Configuration | Purpose | Source | Status |
|---|---|---|---|
| Tenant provisioning | Create/manage Enterprise orgs | Enterprise API | ⚠️ PARTIAL — UI exists but disabled when `ENTERPRISE_TENANCY_ENABLED=false` |
| Tenant isolation tier | STANDARD/DEDICATED | Enterprise API | ⚠️ PARTIAL |
| Tenant lifecycle | Suspend/Reactivate/Decommission | Enterprise API | ⚠️ PARTIAL |

## F. Integration Configuration

### F.1 Payment Providers

| Configuration | Purpose | Source | Secret | Admin UI | Secret-Safe | Status |
|---|---|---|---|---|---|---|
| `RAZORPAY_KEY_ID` | Razorpay public key | `settings/payment_providers` | No | Subscriptions tab | N/A | ✅ COMPLETE |
| `RAZORPAY_KEY_SECRET` | Razorpay secret key | `settings/payment_providers` | ✅ SECRET | Subscriptions tab | ✅ MASKED | ✅ COMPLETE |
| `STRIPE_SECRET` | Stripe secret key | `settings/payment_providers` | ✅ SECRET | Subscriptions tab | ✅ MASKED | ✅ COMPLETE |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing | `backend/.env` | ✅ SECRET | None | N/A | ❌ MISSING |
| `PAYPAL_CLIENT_ID` | PayPal client ID | `settings/payment_providers` | No | Subscriptions tab | N/A | ✅ COMPLETE |
| `PAYPAL_CLIENT_SECRET` | PayPal secret | `settings/payment_providers` | ✅ SECRET | Subscriptions tab | ✅ MASKED | ✅ COMPLETE |
| `PAYPAL_ENV` | PayPal environment | `settings/payment_providers` | No | Subscriptions tab | N/A | ✅ COMPLETE |
| `PAYTM_MID` | Paytm merchant ID | `settings/payment_providers` | No | Subscriptions tab | N/A | ✅ COMPLETE |
| `PAYTM_MERCHANT_KEY` | Paytm merchant key | `settings/payment_providers` | ✅ SECRET | Subscriptions tab | ✅ MASKED | ✅ COMPLETE |
| `PAYTM_CHANNEL_ID` | Paytm channel | `backend/.env` | No | None | N/A | ❌ MISSING |
| `PAYTM_ENV` | Paytm environment | `backend/.env` | No | None | N/A | ❌ MISSING |
| `PAYTM_WEBSITE` | Paytm website ID | `settings/payment_providers` | No | Subscriptions tab | N/A | ✅ COMPLETE |
| `PHONEPE_MERCHANT_ID` | PhonePe merchant ID | `settings/payment_providers` | No | Subscriptions tab | N/A | ✅ COMPLETE |
| `PHONEPE_SALT_KEY` | PhonePe salt key | `settings/payment_providers` | ✅ SECRET | Subscriptions tab | ✅ MASKED | ✅ COMPLETE |
| `PHONEPE_SALT_INDEX` | PhonePe salt index | `settings/payment_providers` | No | Subscriptions tab | N/A | ✅ COMPLETE |
| `PHONEPE_ENV` | PhonePe environment | `backend/.env` | No | None | N/A | ❌ MISSING |

### F.2 Communication Providers

| Configuration | Purpose | Source | Secret | Admin UI | Secret-Safe | Status |
|---|---|---|---|---|---|---|
| `TWILIO_ACCOUNT_SID` | Twilio account SID | `backend/.env` + Firestore | No | Twilio SMS Settings | N/A | ✅ COMPLETE |
| `TWILIO_AUTH_TOKEN` | Twilio auth token | `backend/.env` + Firestore | ✅ SECRET | Twilio SMS Settings | ⚠️ Backend masks on GET | ⚠️ PARTIAL |
| `TWILIO_FROM_PHONE` | Twilio sending number | `backend/.env` + Firestore | No | Twilio SMS Settings | N/A | ✅ COMPLETE |
| SMTP Configuration | Email delivery | Firestore `settings/admin_configuration` | ✅ SECRET (password) | Email & SMTP Settings | ⚠️ Backend masks on GET | ⚠️ PARTIAL |

### F.3 OAuth Providers

| Configuration | Purpose | Source | Admin UI | Status |
|---|---|---|---|---|
| Google OAuth | Social sign-in | Firestore `settings/oauth_providers` | Social Sign-On & OAuth | ✅ COMPLETE |
| LinkedIn OAuth | Social sign-in | Firestore `settings/admin_configuration` | Social Sign-On & OAuth | ✅ COMPLETE |
| Facebook OAuth | Social sign-in | Firestore `settings/admin_configuration` | Facebook Auth Settings | ✅ COMPLETE |
| GitHub OAuth | Social sign-in | Firestore `settings/oauth_providers` | Social Sign-On & OAuth | ✅ COMPLETE |

### F.4 Cloud Infrastructure

| Configuration | Purpose | Source | Secret | Admin UI | Status |
|---|---|---|---|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account | `backend/.env` | No | Cloud Storage Settings | ⚠️ PARTIAL |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token | `backend/.env` | ✅ SECRET | None | ❌ MISSING |
| `CLOUDFLARE_R2_ACCESS_KEY_ID` | R2 access key | `backend/.env` | ✅ SECRET | Cloud Storage Settings | ⚠️ PARTIAL |
| `CLOUDFLARE_R2_ENDPOINT` | R2 endpoint URL | `backend/.env` | No | Cloud Storage Settings | ⚠️ PARTIAL |

## G. Operational Controls

| Configuration | Purpose | Source | Admin UI | Requires Restart | Status |
|---|---|---|---|---|---|
| `CMS_SCHEDULER_INTERVAL_MS` | Blog publish check interval | `backend/.env` | None | Yes | ❌ MISSING |
| `ENTERPRISE_OUTBOX_INTERVAL_MS` | Enterprise outbox poll interval | `backend/.env` | None | Yes | ❌ MISSING |
| `NOTIFICATION_OUTBOX_INTERVAL_MS` | Notification outbox poll interval | `backend/.env` | None | Yes | ❌ MISSING |
| `AI_BASIC_DAILY_LIMIT` | Free tier AI daily limit | `backend/.env` + Firestore | AI Settings (Quota) | No | ✅ COMPLETE |
| `AI_PREMIUM_DAILY_LIMIT` | Premium tier AI daily limit | `backend/.env` + Firestore | AI Settings (Quota) | No | ✅ COMPLETE |
| `AI_ADMIN_DAILY_LIMIT` | Admin tier AI daily limit | `backend/.env` + Firestore | AI Settings (Quota) | No | ✅ COMPLETE |
| `TENANT_JOB_SIGNING_SECRET` | HMAC signing for tenant jobs | `backend/.env` | ✅ SECRET | None | Yes | ❌ MISSING |

---

## Gap Summary

| Category | Total Items | ✅ Complete | ⚠️ Partial | ❌ Missing | 🔒 Server-Only |
|---|---|---|---|---|---|
| A. Infrastructure | 10 | 1 | 3 | 0 | 6 |
| B. Runtime Config | 5 | 0 | 1 | 4 | 0 |
| C. Feature Flags | 7 | 7 | 0 | 0 | 0 |
| D. Product Config | 8 | 8 | 0 | 0 | 0 |
| E. Tenant Config | 3 | 0 | 3 | 0 | 0 |
| F. Integration Config | 24 | 16 | 4 | 4 | 0 |
| G. Operational Controls | 7 | 3 | 0 | 4 | 0 |
| **TOTAL** | **64** | **35** | **11** | **12** | **6** |

### Critical Findings

1. **Feature Flags** now have 100% Admin UI coverage
2. **Payment Secrets** are fully masked via API proxy and removed from plaintext reads
3. **Command Center** deployed with live telemetry and operational signals
4. Over **54%** of configurable items now have complete Admin UI coverage, resolving the most critical secret leakages.
