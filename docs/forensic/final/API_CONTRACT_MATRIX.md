# API Contract Matrix

## Authenticated vs Public
All `/api/*` routes require `Authorization: Bearer <token>` except the explicit public allowlist (see AUTHORIZATION_AUDIT.md).

## Key API Contracts

### Authentication
| Method | Endpoint | Request | Response | Auth |
|--------|----------|---------|----------|------|
| POST | /api/auth/custom-password-reset | { email } | { success, message } | Public |
| POST | /api/auth/verify-email-token | { token, email } | { success, message } | Public |
| POST | /api/auth/set-user-password | { email, newPassword, token } | { success, message } | Public |
| POST | /api/auth/send-verification-email | { email? } | { success, message } | Authenticated |
| GET  | /api/auth/linkedin | (redirect) | 302 → LinkedIn | Public |
| GET  | /api/auth/linkedin/callback | ?code=&state= | 302 → /dashboard#oauth_code= | Public |
| GET  | /api/auth/github | (redirect) | 302 → GitHub | Public |
| GET  | /api/auth/github/callback | ?code=&state= | 302 → /dashboard#oauth_code= | Public |
| POST | /api/auth/oauth/exchange | { code } | { customToken } | Public |
| POST | /api/auth/preview-login | { email, password, name? } | { token, uid, email, role } | Non-prod only w/ HMAC |

### Account
| Method | Endpoint | Request | Response |
|--------|----------|---------|----------|
| POST | /api/check | {} | { status: 'true'/'false', membershipEnds } |
| POST | /api/account/export | {} | { success, export: {...} } |
| POST | /api/account/delete | {} | { success, message, retainedRecordTypes } |
| GET  | /api/payment-orders | {} | { success, orders, source, count } |
| GET  | /api/payment-orders/:orderId | {} | { orderId, status, planId, membershipEnds, invoiceStatus, invoiceNumber } |

### Payments (all authenticated; amounts server-controlled)
| Method | Endpoint | Request | Response |
|--------|----------|---------|----------|
| POST | /api/pay | { planId, couponCode?, billingDetails? } | { orderId, client_secret, amount, currency } |
| POST | /api/paypal/create-order | { planId, couponCode?, billingDetails? } | { orderId, paymentOrderId, amount, currency } |
| POST | /api/paypal/verify | { orderId, paymentOrderId } | { verified, status, membershipEnds, invoice... } |
| POST | /api/razorpay/create-order | { planId, couponCode?, billingDetails? } | { id, paymentOrderId, amount, currency, key } |
| POST | /api/razorpay/verify-payment | { razorpay_order_id, razorpay_payment_id, razorpay_signature, paymentOrderId } | { verified, ... } |
| POST | /api/paytm/initiate-transaction | { planId, ... } | { success, txnToken, orderId, mid, amount, isLive } |
| POST | /api/paytm/verify-transaction | { orderId } | { verified, status, txnId, ... } |
| POST | /api/phonepe/initiate | { planId, ... } | { success, orderId, redirectUrl, isLive } |
| POST | /api/phonepe/status | { orderId } | { verified, state, paymentId, ... } |
| POST | /api/stripe-webhook | (raw body, stripe-signature) | varies | Public, signed |
| POST | /api/paytm/callback | form body | HTML 200 | Public |
| POST | /api/phonepe/callback | { response } + X-VERIFY | { success, received } | Public, signed |
| POST | /api/admin/payments/refund | { paymentOrderId, reason } | { status: REFUNDED/REFUND_PENDING, refundId, creditNote } | SuperAdmin (recent auth) |
| POST | /api/invoice/generate | { paymentOrderId } | { success, invoiceNumber } | Authenticated |
| GET  | /api/invoices | ?limit | { success, invoices, source } | Authenticated |

### Resumes / Covers / Portfolios
| Method | Endpoint | Mounted at | Notes |
|--------|----------|------------|-------|
| /api/resumes/* | resumesRouter | Owner-scoped |
| /api/covers/* | coversRouter | Owner-scoped |
| /api/portfolios/* | portfoliosRouter | Owner-scoped; public projection at GET /portfolios/public/:slug |

### AI
| Method | Endpoint | Request | Response |
|--------|----------|---------|----------|
| POST | /api/generate-content | { operation, payload } | { data, provider, model, grounding } |
| POST | /api/generate-ai-cover-letter | { jobTitle, companyName, recipientName, userSkills, candidateName, tone, language, jobDescription?, yearsExperience? } | { success, coverLetter, provider } |
| POST | /api/check-grammar | { text } | { hasErrors, corrections[], overallSuggestion } |
| POST | /api/parse-resume | { rawText } | { data: { firstname, lastname, ..., employments[], educations[], skills[] }, grounding } |
| POST | /api/generate-interview | { resumeData?, jobDescription?, questionType? } | { questions[] } |
| GET  | /api/admin/ai-settings | – | { success, ...settings } | Admin |
| GET  | /api/admin/ai/test-provider | { provider } | { success, result } | Admin, rate-limited |

### Export
| Method | Endpoint | Request | Response | Notes |
|--------|----------|---------|----------|-------|
| POST | /api/export | { resumeId, resumeName, language } | application/pdf | Owner + entitlement check |
| POST | /api/export-docx | { resumeId, resumeName, template? } | application/vnd.openxmlformats-...docx | Owner + entitlement |
| POST | /api/public-export | { resumeId, resumeName, language } | application/pdf | Published resumes only |
| GET  | /api/export-render-data | ?token= | { data } | Single-use render token |

### Enterprise
| Method | Endpoint | Notes |
|--------|----------|-------|
| /api/enterprise/* | enterpriseRouter | Human auth + tenant membership |
| /api/enterprise/m2m/* | enterpriseM2mRouter | M2M API key + allowlist |
| GET /api/enterprise/status | Public |

### Admin
| Method | Endpoint | Permission |
|--------|----------|------------|
| /api/admin/* | adminAuditRouter, adminPlatformOperationsRouter, adminUsersRouter | ADMIN or SUPER_ADMIN |
| GET /api/admin/payment-settings | requirePermission('system.config.read') |
| POST /api/admin/firebase-service-account | requireRecentAdminAuthentication | Non-production only |
| GET /api/admin/firebase-service-account | (any authenticated) – returns non-secret metadata |

## Error Schema (consistent across all endpoints)
```json
{
  "error": {
    "code": "MACHINE_READABLE_CODE",
    "message": "Human readable message",
    "requestId": "uuid-or-null"
  }
}
```
Success responses use `{ success: true, ...data }` or `{ success: true, code: ... }`.

## Frontend API Clients
- `src/services/api/client.js` – axios-based base client with interceptors.
- `src/services/api/{users,resumes,covers,jobs,portfolios,blog,platform,databaseAdmin}.js` – per-resource clients.
- `src/services/aiService.js`, `adminAiSettings.js`, `mfaService.js`, `platformApi.js` – specialized clients.
- Native `fetch` is patched at window level to attach Firebase Bearer tokens for same-origin /api/ requests.
- axios interceptor does the same.
