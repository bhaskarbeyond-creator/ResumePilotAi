# External Integration Inventory

**Discovery method:** `.env.example` variable names, `backend/index.js` top-of-file
`require()` statements, and `backend/freellmapi/providers/` directory listing. No live
calls were made to any of the integrations listed below (mandate §6.7 / §2.2 explicitly
forbid state-changing or external network calls during this audit).

| Integration | Evidence | Call-site tracing performed? |
|---|---|---|
| **Firebase Authentication** | `FIREBASE_PROJECT_ID`/`FIREBASE_CLIENT_EMAIL`/`FIREBASE_PRIVATE_KEY` env vars; `VITE_FIREBASE_*` client config; `frontend/src/lib/firebase.ts` read directly (`apiKey: import.meta.env.VITE_FIREBASE_KEY`); `firebase.json` emulator config present (auth emulator on port 9099) | Partial — confirmed config wiring only, not the full auth-verification code path in `backend/security/auth.js` |
| **AI providers — Groq, Gemini, OpenAI, OpenRouter, DeepSeek, NVIDIA, Ollama (self-hosted), llama.cpp (self-hosted)** | `.env.example` keys; `backend/freellmapi/providers/{aiHorde.js,googleGemini.js,openaiCompat.js}`; `backend/services/aiRuntime.js` (`generateWithProviders`, `getSharedAiRouter`) | Partial — provider file names and registry confirmed; failover/timeout/retry logic not traced (see UVS-003) |
| **Stripe** | `backend/index.js` raw-body webhook route `app.use('/api/stripe-webhook', express.raw(...))`; `verifyStripeSignature` imported from `./security/webhookGuard`; CSP allow-lists `https://js.stripe.com`, `https://api.stripe.com` | Partial — webhook signature verification function located and its name read, body not traced |
| **PayPal** | `PAYPAL_CLIENT_ID`/`PAYPAL_CLIENT_SECRET`/`PAYPAL_ENV`; `@paypal/react-paypal-js` frontend dependency; `validatePayPalOrder` imported in `backend/index.js` | Not traced beyond import name |
| **Razorpay** | `VITE_RAZORPAY_KEY_ID`; `validateRazorpayPayment` imported; CSP allow-lists `checkout.razorpay.com`/`api.razorpay.com` | Not traced beyond import name |
| **Paytm** | `PAYTM_MID`/`PAYTM_MERCHANT_KEY`/`PAYTM_WEBSITE`/`PAYTM_ENV`; `validatePaytmPayment` imported; CSP allow-lists `securegw.paytm.in`/`securegw-stage.paytm.in` | Not traced beyond import name |
| **PhonePe** | `PHONEPE_MERCHANT_ID`/`PHONEPE_SALT_INDEX`; `validatePhonePePayment` imported | Not traced beyond import name |
| **GitHub OAuth** | `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET`; `backend/security/oauth.js` (`createPkceChallenge`, `assertStateBinding`, etc. — PKCE flow confirmed by function names) | Partial — PKCE-pattern function names confirmed, full flow not traced |
| **LinkedIn OAuth** | `LINKEDIN_CLIENT_ID`/`LINKEDIN_CLIENT_SECRET` | Not traced beyond env var presence |
| **Google Maps** | `VITE_GOOGLE_MAPS_API_KEY`; `@react-google-maps/api` frontend dependency; CSP allow-lists `maps.googleapis.com` | Not traced |
| **Google Analytics (GA4)** | `VITE_MEASUREMENT_ID` | Not traced |
| **Playwright / Chromium (server-side)** | `require('playwright')` in `backend/index.js` top-level import; `@sparticuz/chromium` dependency; `puppeteer-core` dependency — used for server-side PDF/export rendering per `PDF_RENDERER_ISOLATED` env var and `createExportRenderToken`/`consumeExportRenderToken` imports | Partial — import and related token-based export-rendering security helpers located; full rendering pipeline not traced |
| **Email (SMTP/notifier)** | `EmailNotifier` service (`backend/services/emailNotifier`), `processOutboxOnce` (`backend/services/notificationOutbox`) — outbox pattern confirmed by name | Not traced beyond import name; actual SMTP provider not identified in this session |

## Negative-findings statement

**What was searched:** Top-of-file `require()`/`import` statements in `backend/index.js`
and `.env.example` variable names.
**What this does NOT establish:** Whether every listed integration is actually invoked
on a live, reachable code path (vs. dead/half-migrated code), what its timeout/retry
policy is, or whether failures degrade gracefully. All of these require opening the
individual service files under `backend/services/` and `backend/security/`, which was not
done exhaustively in this session (`DEFERRED`, see `ENVIRONMENT-GAPS.md` EG-006).
**No external network call was made to any provider listed above during this audit.**
