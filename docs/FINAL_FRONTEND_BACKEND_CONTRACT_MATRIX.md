# FINAL FRONTEND/BACKEND CONTRACT MATRIX

**Audit Date**: 2026-08-30
**Baseline SHA**: `043697715d52441bd8dc7cd6e96cf8b8f5369527`
**Current SHA**: `d4983fb`

## Payment Endpoints

| Endpoint | Frontend File | Frontend Line | Request Contract | Response Contract | Status |
|----------|---------------|---------------|------------------|-------------------|--------|
| POST /api/paypal/create-order | Checkout.jsx | 39 | `{ planId, couponCode, billingDetails }` | `{ orderId, paypalOrderId, status }` | ✅ MATCH |
| POST /api/paypal/verify | Checkout.jsx | 489 | `{ orderId, paymentOrderId }` | `{ verified, orderId, paymentOrderId, status, membershipEnds, invoiceStatus, invoiceNumber }` | ✅ MATCH |
| POST /api/razorpay/create-order | Checkout.jsx | 525 | `{ planId, couponCode, billingDetails }` | `{ orderId, razorpayOrderId, razorpayKeyId, amount, currency, status }` | ✅ MATCH |
| POST /api/razorpay/verify-payment | Checkout.jsx | 557 | `{ razorpay_order_id, razorpay_payment_id, razorpay_signature, paymentOrderId }` | `{ verified, status, paymentOrderId, membershipEnds, invoiceStatus, invoiceNumber }` | ✅ MATCH |
| POST /api/paytm/initiate-transaction | Checkout.jsx | 609 | `{ planId, couponCode, billingDetails }` | `{ success, txnToken, orderId, paymentOrderId, mid, amount, isLive }` | ✅ MATCH |
| POST /api/paytm/verify-transaction | Checkout.jsx | 650 | `{ orderId }` | `{ verified, status, txnId, orderId, membershipEnds, invoiceStatus, invoiceNumber }` | ✅ MATCH |
| POST /api/phonepe/initiate | Checkout.jsx | 690 | `{ planId, couponCode, billingDetails }` | `{ success, orderId, paymentOrderId, redirectUrl, isLive }` | ✅ MATCH |
| POST /api/phonepe/status | Checkout.jsx | 181 | `{ orderId }` | `{ verified, state, paymentId, orderId, status, membershipEnds, invoiceStatus, invoiceNumber }` | ✅ MATCH |
| GET /api/payment-orders | platform.js | 226 | (none) | `{ success, orders, source, count }` | ✅ MATCH |

## Health Endpoints

| Endpoint | Frontend File | Frontend Line | Request Contract | Response Contract | Status |
|----------|---------------|---------------|------------------|-------------------|--------|
| GET /api/healthz | Admin.jsx | 45 | (none) | `{ status: 'ok' }` | ✅ MATCH |

## Export Endpoints

| Endpoint | Frontend File | Frontend Line | Request Contract | Response Contract | Status |
|----------|---------------|---------------|------------------|-------------------|--------|
| GET /api/export-render-data | Exporter.jsx | 27 | `?token=...` | (binary) | ✅ MATCH |
| POST /api/export-docx | docxDownload.js | 89 | (binary) | (binary) | ✅ MATCH |
| POST /api/public-export | PublicResume.jsx | 50 | `{ userId, templateId }` | (binary) | ✅ MATCH |

## OAuth Endpoints

| Endpoint | Frontend File | Frontend Line | Request Contract | Response Contract | Status |
|----------|---------------|---------------|------------------|-------------------|--------|
| GET /api/auth/linkedin | Login.jsx | 381 | (none) | (redirect) | ✅ MATCH |
| GET /api/auth/github | Login.jsx | 388 | (none) | (redirect) | ✅ MATCH |
| POST /api/auth/oauth/exchange | main.jsx | 206 | `{ code, state, provider }` | `{ token, user }` | ✅ MATCH |

## Verification

All frontend calls to extracted endpoints have been verified to match the backend response contracts.
No behavioral changes detected between baseline and current implementations.
