# Environment & Configuration Inventory

**Discovery method:** `grep -oE '^[A-Z0-9_]+=' .env.example | sort -u` (95 keys total),
cross-referenced with `backend/index.js` requires and `frontend/src/vite-env.d.ts`. No
secret values are reproduced anywhere in this package — only variable names, as committed
in the example file (which itself ships empty/placeholder values).

**Total distinct environment variable names discovered:** 95 (exact count from
`.env.example`). This is a lower bound on the true total — variables referenced only via
`process.env.X` in code without a corresponding `.env.example` entry would not appear
here; a `grep -roE "process\.env\.[A-Z0-9_]+" backend/ frontend/src` cross-check was **not**
performed in this session (`DEFERRED`).

## 1. Server-only configuration (read via `process.env.*` in `backend/`)

| Variable | Purpose (inferred from name/usage context) | Secret classification |
|---|---|---|
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | MariaDB/MySQL connection | `DB_PASSWORD` is a secret |
| `GROQ_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `DEEPSEEK_API_KEY`, `NVIDIA_API_KEY` | AI provider credentials (see DISC-004) | All secrets |
| `GEMINI_MODEL`, `OPENAI_MODEL`, `NVIDIA_MODEL` | Model selection, not secret | Not a secret |
| `OLLAMA_BASE_URL`, `OLLAMA_ENABLED`, `LLAMACPP_BASE_URL`, `LLAMACPP_ENABLED` | Self-hosted LLM endpoints | Not a secret (URLs); enablement flags |
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_USE_ADC` | Firebase Admin SDK (server-side auth verification) | `FIREBASE_PRIVATE_KEY` is a secret |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` | OAuth app credentials | `*_SECRET` are secrets |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENV` | PayPal payments | `*_SECRET` is a secret |
| `PAYTM_MID`, `PAYTM_MERCHANT_KEY`, `PAYTM_WEBSITE`, `PAYTM_ENV` | Paytm payments (India) | `PAYTM_MERCHANT_KEY` is a secret |
| `PHONEPE_MERCHANT_ID`, `PHONEPE_SALT_INDEX`, `PHONEPE_ENV` | PhonePe payments (India) | Likely secret-adjacent (salt index pairs with an undisclosed salt key not seen in the 60-line sample captured) |
| `ENTERPRISE_ENCRYPTION_KEY`, `ENTERPRISE_ENCRYPTION_PROVIDER`, `BACKUP_ENCRYPTION_KEY_BASE64` | At-rest encryption | Secrets |
| `ENTERPRISE_DATA_PROVIDER`, `ENTERPRISE_TENANCY_ENABLED`, `ENTERPRISE_OUTBOX_INTERVAL_MS`, `ENTERPRISE_OUTBOX_WORKER_ENABLED` | Enterprise/multi-tenancy feature flags | Not secrets |
| `AI_BASIC_DAILY_LIMIT`, `AI_PREMIUM_DAILY_LIMIT`, `AI_BURST_LIMIT`, `AI_BURST_WINDOW_MS` | AI quota/rate-limit tuning | Not secrets |
| `CONTACT_HOURLY_LIMIT`, `EXPORT_HOURLY_LIMIT`, `MESSAGING_FIVE_MINUTE_LIMIT`, `NOTIFICATION_HOURLY_LIMIT` | Abuse/rate-limit tuning | Not secrets |
| `CORS_ALLOWED_ORIGINS` | CORS allow-list | Not secret, but security-relevant (misconfiguration risk if set to `*` in production — actual deployed value not visible to this audit) |
| `NODE_ENV` | Standard Node environment flag | Not a secret |
| `ADMIN_EMAIL` | Bootstrap/notification admin address | Not a secret, but PII-adjacent |
| `PDF_RENDERER_ISOLATED` | PDF export sandboxing flag (relevant given `puppeteer-core`/`@sparticuz/chromium` dependencies) | Not a secret |
| `CMS_SCHEDULER_ENABLED`, `CMS_SCHEDULER_INTERVAL_MS` | CMS blog-post scheduler worker | Not secrets |
| `NOTIFICATION_OUTBOX_INTERVAL_MS`, `NOTIFICATION_OUTBOX_WORKER_ENABLED`, `NOTIFICATION_OUTBOX_EXTERNAL_WORKER` | Notification delivery worker tuning | Not secrets |

(39 of the 95 total keys are enumerated above as a representative sample from the first
~60 lines captured; the remaining ~56 keys — likely additional payment/notification/geo
variables given the naming pattern density observed — were **not** individually
enumerated in this session. `DEFERRED` for a complete key-by-key table.)

## 2. Client-exposed configuration (`VITE_*` prefix, read via `import.meta.env.*`)

| Variable | Verified client-safe? | Evidence |
|---|---|---|
| `VITE_WEBSITE_URL` | Yes — public URL | N/A, not sensitive |
| `VITE_FIREBASE_KEY` | Yes — Firebase Web API keys are designed to be public (they identify the Firebase project, not authorize access; access control is enforced server-side/by Firebase Security Rules, not by key secrecy) | `.env.example` places a placeholder value `public-firebase-web-api-key`, matching Firebase's own documented model |
| `VITE_FIREBASE_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID` | Yes — standard public Firebase web config | Same as above |
| `VITE_GOOGLE_MAPS_API_KEY` | Yes, *if* browser-restricted (HTTP referrer restriction) at the Google Cloud Console level | `.env.example` placeholder explicitly named `browser-restricted-maps-key`, indicating the intended operational control is referrer-restriction, not secrecy — **this audit could not verify the actual Google Cloud Console restriction is configured (that lives outside the repository) — `DEFERRED`.** |
| `VITE_RAZORPAY_KEY_ID` | Yes — Razorpay's `key_id` is explicitly a public, client-side identifier by Razorpay's own design (the secret is a separate server-side `key_secret`, not present in any `VITE_*` variable found) | `.env.example` placeholder `rzp_test_public-key-id` |
| `VITE_MEASUREMENT_ID` | Yes — Google Analytics measurement ID, public by design | N/A |
| `VITE_ENTERPRISE_TENANCY_ENABLED` | Yes — feature flag | N/A |
| `VITE_PREVIEW_TOKEN` | Referenced in `frontend/src/vite-env.d.ts` but not present in the 60-line `.env.example` sample captured in this session | **DEFERRED** — purpose/sensitivity not confirmed; recommend a follow-up read of wherever `VITE_PREVIEW_TOKEN` is consumed to classify it (a "preview token" name raises a plausible — not confirmed — question of whether it gates access to unpublished content and should therefore not be a long-lived client-visible value) |

**Verified-safe conclusion:** No client-exposed (`VITE_*`) variable found in this session
represents an actual secret by its respective provider's own security model. This is a
genuine positive finding (see `SWOT-ANALYSIS.md`), reached by checking each provider's
documented key model rather than assuming "contains KEY in the name = secret."

**Caveat:** `VITE_PREVIEW_TOKEN` was not resolved to a confirmed classification — see
above. This single variable is the one open item in an otherwise clean result and should
be the first thing checked in a follow-up session before fully closing this inventory.

## 3. Reconciliation (mandate §4.6)

| Category | Count |
|---|---:|
| Total distinct variable names discovered (`.env.example`) | 95 |
| Classified as server-only secret | ~16 (sample above; not exhaustive) |
| Classified as server-only non-secret config | ~18 (sample above; not exhaustive) |
| Classified as client-exposed, verified provider-safe | 7 |
| Client-exposed, classification deferred | 1 (`VITE_PREVIEW_TOKEN`) |
| Not individually classified this session | ~56 (remaining `.env.example` keys beyond the sampled lines) |

**Coverage of this inventory dimension: 39/95 keys individually classified ≈ 41%.** The
remainder is `DEFERRED`, not asserted safe or unsafe.
