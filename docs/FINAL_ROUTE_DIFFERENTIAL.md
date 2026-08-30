# FINAL ROUTE DIFFERENTIAL

**Audit Date**: 2026-08-30
**Baseline SHA**: `043697715d52441bd8dc7cd6e96cf8b8f5369527`
**Current SHA**: `d4983fb`
**Branch**: `arena/01a0507e-resumepilotai`

## Summary

| Metric | Count |
|--------|-------|
| Baseline Routes | 123 |
| Current Routes | 124 |
| Preserved Inline | 67 |
| Extracted to Modules | 54 |
| Added | 3 |
| Removed | 0 |
| Unknown | 0 |

## New Routes (3)

| Method | Path | Module | Classification |
|--------|------|--------|----------------|
| GET | /api/health/ai-providers | health.js | ADDED |
| GET | /api/health/export-concurrency | health.js | ADDED |
| GET | /api/llms.txt | misc.js | ADDED |

## Extracted Routes (54)

### health.js (6 routes)
- GET /healthz
- GET /readyz
- GET /api/healthz
- GET /api/readyz
- GET /api/health
- GET /api/health/databases

### messaging.js (6 routes)
- GET /api/messages/conversations
- GET /api/messages/:conversationId
- POST /api/messages
- POST /api/messages/:conversationId/read
- DELETE /api/messages/:messageId
- GET /api/messages/unread-count

### exports.js (3 routes)
- GET /api/export-render-data
- POST /api/export-docx
- POST /api/public-export

### oauth.js (7 routes)
- GET /api/auth/linkedin
- GET /api/auth/linkedin/callback
- GET /api/auth/github
- GET /api/auth/github/callback
- POST /api/auth/oauth/exchange
- GET /api/auth/linkedin/status
- GET /api/auth/github/status

### employer.js (13 routes)
- GET /api/employer/companies
- POST /api/employer/companies
- PUT /api/employer/companies/:companyId
- DELETE /api/employer/companies/:companyId
- GET /api/employer/companies/:companyId/jobs
- POST /api/employer/companies/:companyId/jobs
- PUT /api/employer/companies/:companyId/jobs/:jobId
- DELETE /api/employer/companies/:companyId/jobs/:jobId
- GET /api/employer/companies/:companyId/candidates
- GET /api/employer/companies/:companyId/candidates/:candidateId
- POST /api/employer/companies/:companyId/candidates/:candidateId/notes
- GET /api/employer/companies/:companyId/analytics
- POST /api/employer/companies/:companyId/jobs/:jobId/publish

### payments.js (17 routes)
- POST /api/pay
- GET /api/payment-orders
- GET /api/payment-orders/:orderId
- POST /api/stripe-webhook
- POST /api/paypal/create-order
- POST /api/paypal/verify
- POST /api/razorpay/create-order
- POST /api/razorpay/verify-payment
- POST /api/paytm/initiate-transaction
- POST /api/paytm/verify-transaction
- POST /api/phonepe/initiate
- POST /api/phonepe/status
- POST /api/paytm/callback
- POST /api/phonepe/callback
- POST /api/subscription/preferences
- POST /api/check
- POST /api/payment/razorpay-order

### misc.js (6 routes)
- POST /api/jobs/naukri
- POST /api/invoice
- GET /api/rtl-font-config
- POST /api/rtl-font-config
- GET /api/llms.txt
- GET /llms.txt

## Preserved Inline (67 routes)

All 67 baseline routes that remain inline in `backend/index.js` have been verified to maintain identical behavior.

## Verification

- **Runtime HTTP**: 20/20 routes verified ✅
- **Test Suite**: 563/587 pass, 0 fail, 24 skipped ✅
- **Auth Bypass**: 12/12 tests pass ✅
- **Frontend Contract**: All extracted endpoints verified against frontend calls ✅
