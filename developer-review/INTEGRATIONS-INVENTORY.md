# External Integrations — Expanded Inventory & Verification

**Source revision:** `ff841d5` (app `537e2985`)
**Supplements:** `appendix/INVENTORIES/external-integrations.md` (base)
**Generated:** 2026-10-28 — resolves UVS-003 (AI failover)

---

## 1. Integration Catalog (13 providers/services)

| Integration | Env Keys / Evidence | Client Wiring | Server Wiring | Tracing Depth | Status |
|---|---|---|---|---|---|
| **Firebase Auth** | `FIREBASE_PROJECT_ID`, `FIREBASE_PRIVATE_KEY`, `VITE_FIREBASE_*`; `firebase.json` emulator | `frontend/src/lib/firebase.ts` | `backend/security/auth.js` `requireAuth` via `firebaseAdmin.verifyIdToken` | config wiring | PASS |
| **AI: Groq, Gemini, OpenAI, OpenRouter, DeepSeek, NVIDIA, Ollama, llama.cpp** | 6 API keys + 2 self-hosted URLs; `registry.js` 75 entries | — | `freellmapi/providers/*` + `services/aiRuntime.js` | **full** (see §2) | PASS |
| **Stripe** | `PAYPAL_` etc vs `verifyStripeSignature` | `https://js.stripe.com` CSP | `express.raw('/api/stripe-webhook')` + `webhookGuard` | signature + replay | PARTIAL (payload E2E deferred) |
| **PayPal** | `PAYPAL_CLIENT_ID/SECRET/ENV` | `@paypal/react-paypal-js` | `validatePayPalOrder` | import-level | PARTIAL |
| **Razorpay** | `VITE_RAZORPAY_KEY_ID` | CSP `checkout.razorpay.com` | `validateRazorpayPayment` | import-level | PARTIAL |
| **Paytm** | `PAYTM_MID/MERCHANT_KEY/WEBSITE/ENV` | CSP `securegw.paytm.in` | `validatePaytmPayment` | import-level | PARTIAL |
| **PhonePe** | `PHONEPE_MERCHANT_ID/SALT_INDEX` | — | `validatePhonePePayment` | import-level | PARTIAL |
| **GitHub OAuth** | `GITHUB_CLIENT_ID/SECRET` | — | `oauth.js` PKCE helpers (`createPkceChallenge`, `assertStateBinding`) | pattern-level | PASS |
| **LinkedIn OAuth** | `LINKEDIN_CLIENT_ID/SECRET` | — | via `oauth.js` | env-level | PARTIAL |
| **Google Maps** | `VITE_GOOGLE_MAPS_API_KEY` | `@react-google-maps/api` | CSP `maps.googleapis.com` | wiring | PASS |
| **GA4** | `VITE_MEASUREMENT_ID` | gtag | CSP allow | wiring | PASS |
| **Playwright/Chromium (SSR PDF/DOCX)** | `playwright`, `@sparticuz/chromium`, `puppeteer-core` | — | `createExportRenderToken` + `backend/services/docxExport.js` | token pattern | PASS |
| **Email/SMTP** | `EmailNotifier`, `notificationOutbox` | — | `NotificationOutbox.processOutboxOnce` outbox pattern | import-level | PARTIAL |

No external network call made during audit (mandate §2.2).

---

## 2. AI Provider Failover / Timeouts / Degraded Behavior — **RESOLVED UVS-003**

### 2.1 Provider Error Classification (non-retryable vs retryable)

Verified in `freellmapi/providers/googleGemini.js:108-109` and `openaiCompat.js:114-115` (HEAD commit fix):

```js
if (status === 402 || msg.includes('insufficient credits') || rawBody.includes('insufficient_credits') || msg.includes('payment required') || ...)
  return { code: 'PAYMENT_REQUIRED', status: 402, retryable: false };
```

- `402 PAYMENT_REQUIRED` → **non-retryable** (stops cascade immediately, surfaces 402 to caller per `router.js` final error mapping).
- `429 RATE_LIMITED` with `retryAfterMs` → retryable, triggers `setCooldown(provider, model, { retryAfterMs })`.
- `500/502/503/504 PROVIDER_SERVER_ERROR` → retryable, next candidate tried.
- `401 INVALID_API_KEY` → retryable *only* within multi-key pool (rotate keys before benching provider).

### 2.2 Cascade Logic

`router.js:756-1060` (`completeChat` non-streaming, `1092-1310` streaming duplicate):

- Ordered candidates slice `0..12` from `applySelectionPolicy()` (primary first, then health-ranked).
- Per-candidate timeout: `Math.min(timeoutMs, defaultTimeout)` where `timeoutMs` default **45s** (`L806`), derived from `PROVIDER_DEFAULTS`/request input.
- `fallbacksAttempted[]` accumulates `{ provider, model, code, error, status }` for final error summary and `_recordDecision`.
- On success: `clearCooldown` for that provider/model, record decision with `fallback` vs `success` outcome, return.
- On retryable failure: `setCooldown` (respecting `retryAfterMs` if present), try next candidate.
- On non-retryable: push to `fallbacksAttempted`, do **not** bench, try next (payment failure ≠ cooldown).

### 2.3 Cooldown & Last-Resort Release (A.5 / F-14 fix)

- TTL: base **60s**, doubled per strike within 10 min, **max 300s** (`cooldown.js:16-17,86-92`), persisted via `provider_cooldowns` table and re-hydrated on restart (`:26-48`).
- Scope-aware: tenant BYOK cooldowns keyed `tenantId|provider|model` (via `scopeKey`), preventing one tenant's 429 from benching another's BYOK path (`router.js:256-260` — checks `scopeKey` equality for BYOK).
- Last-resort: if all candidates excluded by **transient** cooldown (not permanent `All pooled keys rejected`), release the one with shortest `remainingMs` and retry as `lastResort: true` (`L295-310`) — prevents single-provider deployment deadlock.

### 2.4 Cold-Start Exploration (A.9)

- Bounded: at most 1 call per `COLD_START_EXPLORE_INTERVAL` diverted to under-evidenced candidate (`n < 3` observations).
- Guarded: only in `auto/balanced/speed` (speed weight >0), never `quality`/`manual`/ BYOK sanctuary, never when `enableFallback === false` (`L325-340`).
- Visible as `routingDecision.exploration = 'cold-start'` on wire.

### 2.5 Degraded-Service Behavior

- All candidates fail with mixed retryable → `fallbackSummary` string, coalesced to `502 ALL_PROVIDERS_FAILED` (or `402 PAYMENT_REQUIRED` if last was payment, `429 RATE_LIMITED` with `retryAfterSeconds`).
- Pinned `manual` failure → `502 Pinned AI provider "X" is unavailable: ...` with `retryAfterSeconds` derived from cooldown `remainingMs` (`L1041-1054`). Distinct from unpinned.

**Verdict:** UVS-003 **RESOLVED**. No adjacent code-status contradiction found beyond the already-fixed 402 case. Timeouts bounded, cooldowns correct, cascade honest.

---

## 3. Payment Webhook Hardening (sample)

- `backend/security/webhookGuard.js` exports `verifyStripeSignature`, `verifyRazorpaySignature`, `toWebhookRejection`, `recordWebhookRejection`, `REPLAY_WINDOW_SECONDS`.
- `backend/index.js: stripe-webhook` uses `express.raw()` before `verifyStripeSignature`, preventing JSON-parse-then-verify bypass.
- `backend/services/paymentActivation.js` validates payment intents before activating subscriptions (observed imports).

Full E2E payload replay test requires provider sandbox (EG-005 → BLOCKED for live webhook injection).

---

## 4. Residual Gaps

| Integration | Gap | Severity | Closure |
|---|---|---|---|
| PayPal/Razorpay/Paytm/PhonePe | No downstream verification beyond import name | P3 | Open service file, trace `validate*` + state-machine `refundReferences` |
| Email SMTP | Provider identity not identified | P3 | Read `emailNotifier` + `notificationOutbox` |
| Live webhook | Not exercised | P3 | Sandbox with HMAC replay |

