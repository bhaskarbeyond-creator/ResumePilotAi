# AI Settings product regression — root-cause evidence

Date: 2026-08-15

## Reproduction and first failures

The two operations were traced independently through the real Express middleware stack with deterministic Firebase-token and provider fixtures.

### Save

`AiSettings.jsx` → `POST /api/admin/ai-settings` → global Firebase `requireAuth` → route policy `system.config.write` → recent-auth policy → AI settings handler → Firestore.

For an otherwise authorized ADMIN whose Firebase `auth_time` is older than `SENSITIVE_AUTH_MAX_AGE_MS`, the first failure was the policy layer:

- HTTP 403
- `error.code = RECENT_AUTH_REQUIRED`
- Handler and Firestore persistence were never reached.

The UI had no reauthentication flow and flattened nested API errors into generic “Unable to save AI settings”/`[object Object]` style failures.

### Provider test

The frontend used `POST /api/admin/test-connection`. Because `emailRoutes` was mounted at `/api` before the later index handler, `/api/admin/test-connection` was claimed by the email router’s `/admin/test-connection` route. AI provider types followed its `type !== 'smtp'` path and could return “Non-SMTP test logged” without contacting an AI provider. Recent-auth rejection happened before either route and produced the same 403 regression as Save.

Thus the historical apparent success was not reliable provider validation, while the newer recent-auth policy surfaced as a product failure because the Admin UI could not reauthenticate or preserve structured errors.

## Historical comparison

### `4a24231`

- AI Settings saved through generic `saveSystemSettings('ai', ...)` browser/Firestore behavior.
- Provider testing used `/api/admin/test-connection`.
- The email route collision already existed and could produce a false-positive non-SMTP response.
- NVIDIA browser/proxy/direct calls and browser-readable keys existed in older UI behavior and are intentionally not restored.

### `d04ad53`

- Generation prompts, provider chain, parsing, fallback, context, cancellation, authentication, quotas and backend-only credentials were restored securely.
- The Admin test/save integration still used the ambiguous test route/generic settings assumptions.

### Admin/security hardening

- Provider secrets moved to `settings/ai_providers` and public controls to `data/public_config.ai`.
- Admin APIs gained RBAC and recent-auth enforcement.
- Generic settings gained revisions, but the dedicated AI route did not participate in revision conflict handling.
- The frontend did not add a reauthentication/retry state and did not preserve nested policy errors.

## Fix

- Canonical provider test route: `POST /api/admin/ai/test-provider`.
- Payment test route: `POST /api/admin/payment/test-provider`.
- Email test route: `POST /api/email/admin/test-connection`.
- No frontend uses the ambiguous `/api/admin/test-connection` path.
- Non-secret AI settings load remains ADMIN-only but no longer requires recent auth.
- Save and provider test remain verified-email ADMIN + `system.config.write` + recent-auth protected; non-secret load is verified-email ADMIN-only without the recent-auth timer.
- UI offers provider-native/password reauthentication and retries the exact pending operation without losing unsaved values.
- Errors retain authorization/configuration/authentication/unavailable/timeout/validation categories and request IDs.
- AI settings save now uses expected revisions, a Firestore transaction, audit logging, public/secret split storage and stale conflict rejection.
- Generic Admin settings cannot write `ai` or `payments`; Firestore browser writes to `public_config` and `ai_providers` remain denied.
- Environment-managed credentials are represented only as source=`environment`; values never reach the browser and deployment credentials retain precedence.
- Typed replacement keys are cleared from component state after confirmed persistence.
- Provider testing uses the same `aiRuntime.requestProvider` adapters, URLs, model mapping and timeout behavior as generation, and never mutates settings.
- The obsolete Gemini-only `/test-ai-config` debug route and unused SDK dependency were removed.

## Provider compatibility

The protected runtime provider set remains NVIDIA, Gemini, OpenAI, Groq, OpenRouter and DeepSeek. Model fields, primary selection, temperature, token bounds, enabled flags and provider fallback remain compatible with `d04ad53`. Ollama remains explicitly unsupported by the trusted runtime/SSRF policy and is no longer selectable as a primary provider.

## Security

- No provider keys in Vite variables, browser settings responses, local/session storage, public Firestore documents, logs or errors.
- Secret replacement is accepted only over an authenticated, permissioned, recent-auth API and stored server-side.
- Provider response details are normalized before reaching the UI.
- Save success is rendered only after the transaction and audit write complete.
- Provider test failure does not alter persisted settings.

## Shared settings regressions checked

- Generic, payment, maintenance, Firebase web, email, SMTP/IMAP, module, Blog, Ads, notification and privacy settings were traced through their active endpoints.
- Generic backend settings now preserve blank or projection-omitted secret fields recursively, so editing non-secret OAuth, integration, storage or mail metadata cannot silently erase configured backend credentials.
- LinkedIn/GitHub runtime credential lookup now consumes the canonical backend settings namespace (while retaining protected and legacy fallbacks); provider-status checks are verified-admin, recent-authenticated, and use the shared retry flow.
- A shared Admin reauthentication coordinator now retries generic settings, payment settings, maintenance settings, email runtime saves/tests, Firebase credential operations and Admin SMS tests after verified reauthentication.
- Email runtime configuration now loads an allowlisted server projection, preserves configured credentials across environment, legacy Firestore and local-file sources when fields are left blank, validates encrypted transport settings, clears typed passwords after confirmed save, and does not optimistically toggle templates before the runtime save succeeds.
- Canonical `/api/email/admin/*` routes and retained `/api/admin/*` email compatibility aliases receive identical verified-email and recent-auth policy, preventing namespace-based middleware bypass.
- Twilio settings now use a dedicated secret-free, revisioned, audited Admin route; blank credential fields preserve configured secrets, the generic settings bypass is closed, and SMS dispatch reads the same canonical backend namespace.
- Ads create/delete moved from direct Firestore writes to recent-auth, revision-checked, validated and audited backend routes with accessible confirmation.
- Direct browser writes to Ads, AI provider secrets and curated public configuration remain denied.
- Firebase service-account status can load without the recent-auth timer for authorized secret managers. Runtime private-key rotation is disabled by default and always disabled in production; the UI directs operators to Workload Identity/Secret Manager instead of implying a deployment-level secret changed.
- The dead duplicate PaymentSettings import and generic `payments`/`ai` category bypasses were removed; canonical subscription/payment settings remain on `/api/admin/payment-settings`.

## External validation

Live provider credentials and outbound provider networks are unavailable here. Deterministic fixtures validate all six request/response contracts, authentication rejection, missing configuration, invalid models, outage, empty response and timeout. Live provider validation remains a staging requirement and is not claimed.
