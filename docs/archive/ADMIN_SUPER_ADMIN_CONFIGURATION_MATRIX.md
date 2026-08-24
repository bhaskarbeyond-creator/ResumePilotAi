# Admin + Super Admin configuration matrix

**Principle:** a configuration census is not an environment editor. Infrastructure-owned values are visible as operational status and remain read-only. Approved runtime flags are editable only through explicit Super Admin controls. Secrets are never returned; only `CONFIGURED`, `NOT_CONFIGURED`, source, masked suffix (where safe), and audit metadata are exposed.

## Runtime ownership matrix

| Configuration family | Canonical source | Read API/UI | Admin | Super Admin | Runtime/restart | Secret posture | Audit/health |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `ENTERPRISE_TENANCY_ENABLED` | `settings/feature_flags` override > backend env > false | `/api/platform/configuration`, `/api/platform/feature-flags`, Feature Flags | read only | read/change | Firestore override per request; env restart | not secret | `FEATURE_FLAG_CHANGED`; health/availability |
| CMS/notification/Enterprise worker flags | feature flag override/env | same | read only | change | startup flags require restart | not secret | flag audit; worker health |
| `PDF_RENDERER_ISOLATED` | env/flag declaration | config + health | read only | change declaration | deployment/worker dependent | not secret | flag audit; PDF health |
| Super Admin MFA override | `SUPER_ADMIN_MFA_REQUIRED` env | config + health | read only | infrastructure-only | startup/deployment | not secret | health; deployment audit |
| Firebase Admin identity | ADC or `FIREBASE_CLIENT_EMAIL`/private key | `/api/admin/firebase-service-account`, config | status only | status only in production | startup; restart/deploy | private key never returned | health probe; deployment logs must be secret-free |
| Firebase web config | curated public settings + `VITE_*` | Firebase settings | existing Admin settings policy | yes | browser build/static | Web API key is public/restricted | generic settings audit |
| AI provider credentials | `settings/ai_providers` > env > legacy server store | AI settings, configuration, health | read status only | replace/test/clear Firestore credential | per request; env restart | write-only, masked; no browser persistence | `AI_PROVIDER_SETTINGS_UPDATED`; provider health |
| AI models/toggles/quota | `data/public_config.ai`, quota settings | AI settings | governed Admin read where route permits | change | per request | no secret | revision/security audit; AI health |
| Razorpay | `settings/payment_providers.razorpay` or complete env pair | `/api/platform/payment-settings`, Subscriptions & Gateways | read status only | replace/test/clear Firestore | per request; env pair deployment-owned | key secret write-only; blank preserves; clear explicit | payment settings + Admin audit; payment health |
| Stripe | payment store/env + public publishable key | payment settings/config | read status only | replace/test/clear Firestore | per request; env restart | secret/webhook write-only | audit; payment health |
| PayPal | payment store/env + environment | payment settings/config | read status only | replace/test/clear Firestore | per request; env restart | client secret write-only | audit; payment health |
| Paytm | payment store/env + website/channel | payment settings/config | read status only | replace/test/clear Firestore | per request; env restart | merchant key write-only | audit; payment health |
| PhonePe | payment store/env + salt index | payment settings/config | read status only | replace/test/clear Firestore | per request; env restart | salt key write-only | audit; payment health |
| SMTP primary/fallback/IMAP | local runtime file + Firestore/env fallback | Email & SMTP; `/api/email/admin/settings` | read/config policy | replace/test/clear stored secret | runtime local file; env restart | password never returned; clear tombstone; env cannot clear | SMTP settings audit; SMTP health/DNS |
| Twilio | `settings/admin_configuration.twilio` > env | Twilio settings/config/health | status only | replace/test/clear Firestore | per request; env restart | Auth token write-only | `TWILIO_SETTINGS_UPDATED`; health |
| GitHub/LinkedIn OAuth | `settings/oauth_providers`/admin config/env | Social OAuth settings + test endpoints | read/config policy | replace/test/clear stored secret | per request; env restart | client secrets write-only | settings audit; OAuth health |
| Cloudflare/R2 | environment only; edge is external | configuration census + deployment identity | status only | status only | deployment | tokens never returned | operational status only |
| Storage provider | `ENTERPRISE_STORAGE_PROVIDER`/bucket and Firebase product storage; Cloudinary/S3 adapters absent | Storage settings + health | Firebase status only; no unimplemented adapter controls | platform status | deployment/restart for Enterprise adapter | access secrets never exposed | explicit `NOT_SUPPORTED`/`STORAGE_PROVIDER_UNSUPPORTED` state |
| Security/rate limits | env (`GLOBAL_RATE_LIMIT_MAX`, abuse limits, `SENSITIVE_AUTH_MAX_AGE_MS`) | census + health | read only | read only | restart/deploy | not secret | health/deployment config |
| CORS/proxy/hostname/protocol/port | env/deployment | census + health | read only | infrastructure-only | restart/deploy | not secret | identity/health |
| Maintenance | `settings/maintenance` + `public_config.systemHealth` | Operations/System Health | read | Super Admin mutate | runtime; audit | no secret | `PLATFORM_MAINTENANCE_UPDATED`; command center |
| Announcements | `platform_announcements` | Operations | read | Super Admin CRUD | runtime | no secret | admin audit |
| Tenant registry | Enterprise Firestore control plane | Tenants Registry/detail | Platform Admin capability | Super Admin + Platform capability | runtime | no secret in projection | tenant lifecycle audit |
| User IAM | Firebase Auth + user profile | Users Manager/user detail | suspend/membership/read subject to permission | role/delete/SuperAdmin protection | immediate + token revoke | no auth secrets | user admin/security audit |
| Backup/restore | Enterprise backup service/deployment | Operations + tenant settings | status/read | Enterprise owner/approved operator | operational flow | snapshot integrity checked; no arbitrary store editing | export/restore audit |

## Discovered environment census (grouped)

The backend `platformConfiguration` service inventories the following classes. The full current payload is generated at runtime by `/api/platform/configuration`.

### Identity, deployment, and network

`NODE_ENV`, `PORT`, `PROTOCOL`, `WEBSITE_NAME`, `PUBLIC_APP_URL`, `COMMIT_SHA`, `FIREBASE_PROJECT_ID`, `FIREBASE_DATABASE_URL`, `FIREBASE_USE_ADC`, `FIREBASE_CLIENT_EMAIL`, `GOOGLE_APPLICATION_CREDENTIALS`, `FIREBASE_STORAGE_BUCKET`, `CORS_ALLOWED_ORIGINS`, `TRUST_PROXY_HOPS`, `GLOBAL_RATE_LIMIT_MAX`, `SENSITIVE_AUTH_MAX_AGE_MS`, and operational address aliases such as `ADMIN_EMAIL`/`SMTP_ADMIN_EMAIL`.

### Enterprise, encryption, storage, workers

`ENTERPRISE_TENANCY_ENABLED`, `ENTERPRISE_DATA_PROVIDER`, `ENTERPRISE_ENCRYPTION_PROVIDER`, `ENTERPRISE_ENCRYPTION_KEY`, `ENTERPRISE_ENCRYPTION_KEYS`, `ENTERPRISE_ENCRYPTION_ACTIVE_KEY`, `TENANT_JOB_SIGNING_SECRET`, `TENANT_ARTIFACT_SIGNING_SECRET`, `ENTERPRISE_STORAGE_PROVIDER`, `ENTERPRISE_STORAGE_BUCKET`, `ENTERPRISE_OUTBOX_WORKER_ENABLED`, `ENTERPRISE_OUTBOX_INTERVAL_MS`, `ENTERPRISE_M2M_KEY_RPM`, `CMS_SCHEDULER_ENABLED`, `CMS_SCHEDULER_INTERVAL_MS`, `NOTIFICATION_OUTBOX_WORKER_ENABLED`, `NOTIFICATION_OUTBOX_EXTERNAL_WORKER`, `NOTIFICATION_OUTBOX_INTERVAL_MS`, `PDF_RENDERER_ISOLATED`, `PUPPETEER_EXECUTABLE_PATH`, `CHROMIUM_PATH`, `PLATFORM_HEALTH_CACHE_MS`, `PLATFORM_HEALTH_MIN_INTERVAL_MS`.

### AI

`GEMINI_API_KEY`, `GEMINI_MODEL`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `NVIDIA_API_KEY`, `NVIDIA_MODEL`, `GROQ_API_KEY`, `GROQ_MODEL`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL`, `AI_BASIC_DAILY_LIMIT`, `AI_PREMIUM_DAILY_LIMIT`, `AI_ADMIN_DAILY_LIMIT`, `AI_BURST_LIMIT`, `AI_BURST_WINDOW_MS`.

### Payments

`STRIPE_SECRET`, `STRIPE_WEBHOOK_SECRET`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENV`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `PAYTM_MID`, `PAYTM_MERCHANT_KEY`, `PAYTM_WEBSITE`, `PAYTM_ENV`, `PAYTM_CHANNEL_ID`, `PHONEPE_MERCHANT_ID`, `PHONEPE_SALT_KEY`, `PHONEPE_SALT_INDEX`, `PHONEPE_ENV`.

### Notifications and OAuth

`SMTP_HOST`, `SMTP_PORT`, `SMTP_ENCRYPTION`, `SMTP_USER` / `SMTP_USERNAME`, `SMTP_PASS`, `SMTP_SENDER_NAME`, `SMTP_REPLY_TO`, `SMTP_ADMIN_EMAIL`, `FALLBACK_SMTP_HOST`, `FALLBACK_SMTP_PORT`, `FALLBACK_SMTP_ENCRYPTION`, `FALLBACK_SMTP_USER`, `FALLBACK_SMTP_PASS`, `IMAP_HOST`, `IMAP_PORT`, `IMAP_ENCRYPTION`, `IMAP_USER`, `IMAP_PASS`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_PHONE`, `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `ADMIN_EMAIL`.

### Abuse and external operations

`NOTIFICATION_HOURLY_LIMIT`, `CONTACT_HOURLY_LIMIT`, `EXPORT_HOURLY_LIMIT`, `SCRAPER_HOURLY_LIMIT`, `MESSAGING_FIVE_MINUTE_LIMIT`, `SENSITIVE_AUTH_MAX_AGE_MS`, `SUPER_ADMIN_MFA_REQUIRED`, `ALLOW_RUNTIME_FIREBASE_CREDENTIAL_ROTATION`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID`, `CLOUDFLARE_R2_ACCESS_KEY_ID`, `CLOUDFLARE_R2_SECRET_ACCESS_KEY`, `CLOUDINARY_API_SECRET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `REDIS_URL`, and `TENANT_REDIS_URL` (legacy unsupported bindings).

## Non-exposed frontend build configuration

`VITE_FIREBASE_*`, `VITE_GOOGLE_MAPS_API_KEY`, `VITE_MEASUREMENT_ID`, `VITE_PAYPAL_CLIENT_ID`, `VITE_RAZORPAY_KEY_ID`, `VITE_WEBSITE_URL`, and `VITE_ENTERPRISE_TENANCY_ENABLED` are build-time/browser values. They are not editable by the server Admin UI. Web API keys are public but must be restricted at the provider; provider secrets must never be prefixed `VITE_`.

## API response guarantee

The configuration endpoint returns `policy.secretsNeverReturned=true`. A secret item contains only configured/source/owner/runtime/restart/audit metadata. It never contains a raw environment value, private key, password, OAuth secret, payment secret, AI key, SMTP password, or Twilio token.
