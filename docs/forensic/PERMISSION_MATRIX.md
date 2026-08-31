# Permission Matrix — Endpoint Authorization Audit

> **Audit SHA**: `06f443d` | **Date**: 2026-08-31

## Authorization Architecture

```
Request → cors() → helmet() → rateLimit() → requireAuth/requireEnterpriseAuth → enforceApiPolicy → admin guard → route handler
```

### Middleware Stack (Order)
1. **CORS** (`index.js:307-317`) — Strict origin allowlist, `credentials: false`
2. **Helmet** (`index.js:323-324`) — Security headers, `crossOriginResourcePolicy: 'cross-origin'`
3. **Rate Limiters** — Global (2500/15min), Auth (20/hr), messaging, notification limiters
4. **requireAuth** (`index.js:403`) — Firebase JWT verification on all `/api` non-public paths
5. **enforceApiPolicy** (`index.js:413`, `security/policy.js:71-111`) — Role/permission check
6. **Admin Guard** (`index.js:583-589`) — Additional `system.config.write` on admin mutations
7. **requireRecentAdminAuthentication** — Individual route-level for destructive ops

### Public API Paths (No Auth)
```
/healthz, /readyz, /health, /health/databases, /health/ai-providers,
/health/export-concurrency, /service-availability, /platform/version,
/platform/public-config, /enterprise/status, /stripe-webhook,
/public-export, /export-render-data, /contact,
/auth/custom-password-reset, /auth/verify-email-token,
/auth/set-user-password, /auth/linkedin*, /auth/github*,
/auth/oauth/exchange, /auth/preview-login,
/public/custom-pages*, /public/trusted-by*, /public/featured-companies,
/blog-data*, /jobs-data*, /paytm/callback, /phonepe/callback,
/rtl-font-config, /llms.txt, /jobs/naukri, /invoice
```

---

## Admin Endpoint Authorization Map

### Inline Admin Endpoints (backend/index.js)

| Line | Method | Path | Inline Auth | Global Auth | Effective Permission |
|---|---|---|---|---|---|
| 683 | GET | `/api/admin/payment-settings` | `requirePermission('system.config.read')` | `enforceApiPolicy` + `payments.read` | **payments.read** |
| 694 | GET | `/api/admin/ai-settings` | None inline | `enforceApiPolicy` → `system.config.read` | system.config.read |
| 716 | POST | `/api/admin/blog/categories` | None inline | Admin guard → `system.config.write` | system.config.write |
| 727 | PATCH | `/api/admin/blog/categories/:id` | None inline | Admin guard → `system.config.write` | system.config.write |
| 744 | DELETE | `/api/admin/blog/categories/:id` | None inline | Admin guard → `system.config.write` | system.config.write |
| 765 | PATCH | `/api/admin/blog/posts/:id` | None inline | Admin guard → `system.config.write` | system.config.write |
| 785 | DELETE | `/api/admin/blog/posts/:id` | None inline | Admin guard → `system.config.write` | system.config.write |
| 801 | POST | `/api/admin/blog/publish-due` | None inline | Admin guard → `system.config.write` | system.config.write |
| 823 | GET | `/api/admin/health-summary` | None inline | `enforceApiPolicy` → `system.config.read` | system.config.read |
| 864 | POST | `/api/admin/system-health-settings` | `requireRecentAdminAuthentication` | Admin guard | SUPER_ADMIN + recent auth |
| 1156 | GET | `/api/admin/settings` | None inline | `enforceApiPolicy` → `system.config.read` | system.config.read |
| 1193 | POST | `/api/admin/settings/:category` | None inline | Admin guard → `system.config.write` | system.config.write |
| 1333 | POST | `/api/admin/ai-settings` | `requireRecentAdminAuthentication` | Admin guard | SUPER_ADMIN + recent auth |
| 1346 | POST | `/api/admin/ai/test-provider` | `requireRecentAdminAuthentication` | Admin guard | SUPER_ADMIN + recent auth |
| 1359 | POST | `/api/admin/ai/fetch-models` | `requireRecentAdminAuthentication` | Admin guard | SUPER_ADMIN + recent auth |
| 1373 | GET | `/api/admin/ai/quota-stats` | None inline | `enforceApiPolicy` → `system.config.read` | system.config.read |
| 1387 | POST | `/api/admin/ai/quota-limits` | `requireRecentAdminAuthentication` | Admin guard | SUPER_ADMIN + recent auth |
| 1409 | POST | `/api/admin/ai/reset-quota` | `requireRecentAdminAuthentication` | Admin guard | SUPER_ADMIN + recent auth |
| 1431 | POST | `/api/admin/payment-settings` | `requireRecentAdminAuthentication` | Admin guard | SUPER_ADMIN + recent auth |
| 1719 | GET | `/api/admin/coupons` | None inline | `enforceApiPolicy` → `system.config.read` | system.config.read |
| 1741 | PUT | `/api/admin/coupons/:code` | None inline | Admin guard → `system.config.write` | system.config.write |
| 1769 | DELETE | `/api/admin/coupons/:code` | None inline | Admin guard → `system.config.write` | system.config.write |
| 1786 | POST | `/api/admin/payment/test-provider` | `requireRecentAdminAuthentication` | Admin guard | SUPER_ADMIN + recent auth |
| 1939 | GET | `/api/admin/twilio-settings` | None inline | `enforceApiPolicy` → `system.config.read` | system.config.read |
| 1958 | POST | `/api/admin/twilio-settings` | `requireRecentAdminAuthentication` | Admin guard | SUPER_ADMIN + recent auth |
| 2495 | GET | `/api/admin/firebase-service-account` | None inline | `enforceApiPolicy` → `secrets.manage` | **secrets.manage** |
| 2512 | POST | `/api/admin/firebase-service-account` | `requireRecentAdminAuthentication` | Admin guard + `secrets.manage` | SUPER_ADMIN + secrets.manage |
| 2720 | POST | `/api/admin/payments/refund` | `requireRecentAdminAuthentication` | Admin guard + `payments.manage` | SUPER_ADMIN + payments.manage |
| 2867 | GET | `/api/admin/employer-applications` | None inline | `enforceApiPolicy` → `system.config.read` | system.config.read |
| 2874 | GET | `/api/admin/companies` | None inline | `enforceApiPolicy` → `system.config.read` | system.config.read |
| 2888 | GET | `/api/admin/jobs` | None inline | `enforceApiPolicy` → `system.config.read` | system.config.read |
| 2903 | GET | `/api/admin/reviews` | None inline | `enforceApiPolicy` → `system.config.read` | system.config.read |
| 2912 | GET | `/api/admin/ads` | None inline | `enforceApiPolicy` → `system.config.read` | system.config.read |
| 2917 | GET | `/api/admin/payment-orders` | None inline | `enforceApiPolicy` → `system.config.read` | system.config.read |
| 3007 | GET | `/api/admin/blog/categories` | None inline | `enforceApiPolicy` → `system.config.read` | system.config.read |
| 3012 | GET | `/api/admin/blog/posts` | None inline | `enforceApiPolicy` → `system.config.read` | system.config.read |
| 3028 | PATCH | `/api/admin/employer-applications/:uid` | None inline | Admin guard + `users.update` | **users.update** |
| 3074 | POST | `/api/admin/ads` | None inline | Admin guard → `system.config.write` | system.config.write |
| 3091 | DELETE | `/api/admin/ads/:adId` | None inline | Admin guard → `system.config.write` | system.config.write |
| 3160 | GET | `/api/admin/pages` | None inline | `enforceApiPolicy` → `system.config.read` | system.config.read |
| 3169 | PUT | `/api/admin/pages/:slug` | None inline | Admin guard → `system.config.write` | system.config.write |
| 3197 | DELETE | `/api/admin/pages/:slug` | None inline | Admin guard → `system.config.write` | system.config.write |
| 3213 | POST | `/api/admin/website-meta` | `requireRecentAdminAuthentication` | Admin guard | SUPER_ADMIN + recent auth |
| 3302 | GET | `/api/admin/trusted-by` | None inline | `enforceApiPolicy` → `system.config.read` | system.config.read |
| 3311 | POST | `/api/admin/trusted-by` | None inline | Admin guard → `system.config.write` | system.config.write |
| 3325 | PATCH | `/api/admin/trusted-by/:id` | None inline | Admin guard → `system.config.write` | system.config.write |
| 3343 | DELETE | `/api/admin/trusted-by/:id` | None inline | Admin guard → `system.config.write` | system.config.write |
| 3359 | POST | `/api/admin/reviews` | None inline | Admin guard → `system.config.write` | system.config.write |
| 3383 | DELETE | `/api/admin/reviews/:id` | None inline | Admin guard → `system.config.write` | system.config.write |
| 3399 | PATCH | `/api/admin/companies/:id` | None inline | Admin guard → `system.config.write` | system.config.write |
| 3425 | PATCH | `/api/admin/jobs/:jobId` | None inline | Admin guard → `system.config.write` | system.config.write |
| 3449 | DELETE | `/api/admin/jobs/:jobId` | None inline | Admin guard → `system.config.write` | system.config.write |
| 3605 | POST | `/api/admin/delete-user` | `requireRecentAdminAuthentication` | Admin guard | SUPER_ADMIN + recent auth |

### Webhook/Callback Security

| Provider | Endpoint | Verification | Status |
|---|---|---|---|
| **Stripe** | `/api/stripe-webhook` | `constructEvent(body, sig, STRIPE_WEBHOOK_SECRET)` — cryptographic signature | **PROVEN SECURE** |
| **PayPal** | `/api/paypal/verify` | Server-side order capture via PayPal API | **PROVEN SECURE** |
| **Razorpay** | `/api/razorpay/verify-payment` | Server-side signature verify | **PROVEN SECURE** |
| **Paytm** | `/api/paytm/callback` | Delegated to `indianGatewayActivation.handlePaytmCallback` | PARTIALLY PROVEN |
| **PhonePe** | `/api/phonepe/callback` | `X-VERIFY` header, returns 400 on `PHONEPE_SIGNATURE_INVALID` | **PROVEN SECURE** |

---

## CORS Policy Assessment

**Configuration** (index.js:307-317):
- **Origin**: Strict allowlist (`allowedOrigins` set) — exact match required
- **Production**: Only production domain(s) allowed
- **Development**: localhost:5173, localhost:3000, ai-resume-builder.local added
- **Methods**: GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS
- **Credentials**: `false` (cookies not sent cross-origin)
- **Max-Age**: 600 seconds preflight cache
- **Assessment**: **SECURE** — strict origin allowlist with non-browser bypass for API clients

## Rate Limiting Assessment

| Limiter | Scope | Window | Max Requests | Key |
|---|---|---|---|---|
| Global | `/api` | 15 min | 2500 | `req.user?.uid \|\| req.ip` |
| Auth | `/api/auth`, `/api/email` | 1 hour | 20 | IP |
| Messaging | `/api/messages` | — | Account-level | — |
| Notification | Specific notify paths | — | Account-level | — |
| **Assessment** | **SECURE** | Good | layering | Appropriate |
