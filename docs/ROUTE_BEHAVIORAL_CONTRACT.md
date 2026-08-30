# Route Behavioral Contract

**Baseline SHA**: `dba1b12`
**Generated**: 2026-08-30
**Purpose**: Authoritative extraction contract — every route must preserve these invariants.

## Baseline Metrics

| Metric | Value |
|--------|-------|
| Inline routes (index.js) | 104 |
| Mounted router routes | 253 |
| Total unique routes | 352 |
| Duplicate routes | 0 |
| Route modules | 23 |
| index.js LOC | 5,128 |
| Backend tests | 537 (513 pass, 0 fail, 24 skipped) |
| Arena tests | 3,078 (3,056 pass, 0 fail, 22 skipped) |
| Build | PASSING |

## Global Middleware Chain (applied to ALL /api routes)

```
1. x-request-id injection
2. Stripe webhook raw body (/api/stripe-webhook only)
3. express.json (256kb limit)
4. express.urlencoded (64kb limit)
5. trust proxy
6. CORS
7. helmet (security headers)
8. globalLimiter (2500 req/15min)
9. authLimiter (/api/email, /api/auth only)
10. requireAuth (skipped for publicApiPaths)
11. enforceApiPolicy (skipped for publicApiPaths)
```

## Route-Specific Middleware

| Middleware | Applied To |
|-----------|-----------|
| `aiAccountLimiter` + `enforceDailyAiQuota` | `/api/generate-interview`, `/api/check-grammar`, `/api/generate-ai-cover-letter`, `/api/generate-content`, `/api/parse-resume`, `/api/ai/*` |
| `requireRecentAdminAuthentication` + `aiAccountLimiter` | `/api/admin/ai/test-provider` |
| `exportAccountLimiter` | `/api/export`, `/api/public-export`, `/api/export-docx` |
| `scraperAccountLimiter` | `/api/linkedin-scraper` |
| `messagingAccountLimiter` | `/api/messages` |
| `notificationAccountLimiter` | `/api/auth/send-verification-email` |
| `requirePermission('system.config.write')` | `/api/admin/*` (POST/PUT/PATCH/DELETE) |
| `requirePermission('tickets.manage')` | `/api/admin/support/*` |
| `requirePermission('system.config.read')` | `/api/admin/payment-settings` (GET) |
| `requireRecentAdminAuthentication` | Various admin mutation routes |
| `createAdminAuditMiddleware()` | `/api/admin/*`, `/api/platform/*` |
| `createEnterpriseAuthMiddleware` | `/api/enterprise/*` |

## Public API Paths (no auth required)

```
/healthz, /readyz, /health, /health/databases, /service-availability
/platform/version, /platform/public-config, /enterprise/status
/stripe-webhook, /public-export, /export-render-data, /contact
/auth/custom-password-reset, /auth/verify-email-token, /auth/set-user-password
/auth/linkedin, /auth/linkedin/callback, /auth/github, /auth/github/callback
/auth/oauth/exchange, /auth/preview-login
/public/custom-pages, /public/custom-pages.json, /public/trusted-by
/public/trusted-by.json, /public/featured-companies
/custom-pages, /custom-pages.json, /trusted-by, /trusted-by.json
/blog-data, /jobs-data, /paytm/callback, /phonepe/callback
/stats, /reviews, /phrases, /portfolios/public
```

## Extracted Route Modules (mounted, verified)

### messaging.js (6 routes) — `/api`
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/api/contact` | No (public) | contactAccountLimiter |
| GET | `/api/messages/conversations` | Yes | messagingAccountLimiter |
| POST | `/api/messages/conversations` | Yes | messagingAccountLimiter |
| GET | `/api/messages/conversations/:id/messages` | Yes | messagingAccountLimiter |
| POST | `/api/messages/conversations/:id/messages` | Yes | messagingAccountLimiter |
| POST | `/api/messages/conversations/:id/read` | Yes | messagingAccountLimiter |

### health.js (6 routes) — `/api` + `/`
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/healthz` | No | Root-level liveness |
| GET | `/api/healthz` | No | Liveness |
| GET | `/api/health` | No | Liveness |
| GET | `/api/health/databases` | No | Database health |
| GET | `/api/health/ai-providers` | No | AI provider health |
| GET | `/api/health/export-concurrency` | No | Export semaphore |
| GET | `/readyz` | No | Root-level readiness |
| GET | `/api/readyz` | No | Readiness |

### exports.js (3 routes) — `/api`
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/export-render-data` | No (token) | Single-use render token |
| POST | `/api/export`, `/api/public-export` | Varies | PDF export, exportAccountLimiter |
| POST | `/api/export-docx` | Yes | DOCX export, exportAccountLimiter |

### oauth.js (7 routes) — `/api`
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/auth/linkedin` | No | OAuth begin |
| GET | `/api/auth/github` | No | OAuth begin |
| GET | `/api/auth/linkedin/callback` | No | OAuth callback |
| GET | `/api/auth/github/callback` | No | OAuth callback |
| POST | `/api/auth/oauth/exchange` | No | Token exchange |
| GET | `/api/auth/linkedin/test-credentials` | Yes | Credential check |
| GET | `/api/auth/github/test-credentials` | Yes | Credential check |

## Inline Routes Remaining (104) — Grouped by Domain

### Payment Routes (17)
| Method | Path | Auth | Middleware |
|--------|------|------|-----------|
| POST | `/api/pay` | Yes | — |
| GET | `/api/payment-orders` | Yes | — |
| GET | `/api/payment-orders/:orderId` | Yes | — |
| POST | `/api/stripe-webhook` | No | Stripe signature |
| POST | `/api/paypal/create-order` | Yes | — |
| POST | `/api/paypal/verify` | Yes | — |
| POST | `/api/razorpay/create-order` | Yes | — |
| POST | `/api/razorpay/verify-payment` | Yes | — |
| POST | `/api/paytm/initiate-transaction` | Yes | — |
| POST | `/api/paytm/verify-transaction` | Yes | — |
| POST | `/api/phonepe/initiate` | Yes | — |
| POST | `/api/phonepe/status` | Yes | — |
| POST | `/api/paytm/callback` | No | — |
| POST | `/api/phonepe/callback` | No | — |
| POST | `/api/subscription/preferences` | Yes | — |
| POST | `/api/check` | Yes | — |
| POST | `/api/payment/razorpay-order` | Yes | — |

### Employer/Job Routes (12)
| Method | Path | Auth | Middleware |
|--------|------|------|-----------|
| POST | `/api/jobs/:jobId/applications` | Yes | — |
| PATCH | `/api/job-applications/:applicationId/status` | Yes | — |
| GET | `/api/jobs/:jobId/applications` | Yes | — |
| POST | `/api/employer-applications` | Yes | — |
| GET | `/api/public/featured-companies` | No | — |
| GET | `/api/employer/companies` | Yes | — |
| POST | `/api/employer/companies` | Yes | — |
| PATCH | `/api/employer/companies/:companyId` | Yes | — |
| DELETE | `/api/employer/companies/:companyId` | Yes | — |
| GET | `/api/employer/jobs` | Yes | — |
| POST | `/api/employer/jobs` | Yes | — |
| PATCH | `/api/employer/jobs/:jobId` | Yes | — |
| DELETE | `/api/employer/jobs/:jobId` | Yes | — |

### Admin Routes (40+)
All require admin authentication. See inline code for specific permission requirements.

### Auth Routes (5)
| Method | Path | Auth | Middleware |
|--------|------|------|-----------|
| POST | `/api/auth/custom-password-reset` | No | — |
| POST | `/api/auth/send-verification-email` | Yes | notificationAccountLimiter |
| POST | `/api/auth/verify-email-token` | No | — |
| POST | `/api/auth/set-user-password` | No | — |
| POST | `/api/auth/preview-login` | No | test-only |

### Account Routes (6)
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/api/invoice/generate` | Yes | — |
| GET | `/api/invoices` | Yes | — |
| GET | `/api/invoices/:paymentOrderId` | Yes | — |
| POST | `/api/invoice` | Yes | 410 retired |
| POST | `/api/account/export` | Yes | GDPR |
| POST | `/api/account/delete` | Yes | GDPR |

### Misc Routes (8)
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/api/send-sms` | Admin | Twilio |
| GET | `/llms.txt` | No | AI disclosure |
| GET | `/api/rtl-font-config` | No | — |
| POST | `/api/generate-ai-cover-letter` | Yes | AI |
| POST | `/api/jobs/naukri` | Yes | 501 |
| GET | `/api/service-availability` | No | — |
| GET | `/api/linkedin-scraper` | Yes | — |
| POST | `/api/notify/user-signup` | Yes | 410 retired |

## Extraction Safety Rules

1. **ONE implementation per endpoint** — no duplicates
2. **Middleware order preserved** — auth → tenant → rate limit → validation → handler
3. **Response contracts preserved** — status codes, error codes, response shapes
4. **Database behavior preserved** — same repository functions, same transactions
5. **Security preserved** — auth, authorization, tenant isolation, rate limits
6. **AI behavior preserved** — grounding, provider cascade, fallback
7. **No dead code** — old implementations removed after extraction
8. **Tests validate behavior** — not just file layout
