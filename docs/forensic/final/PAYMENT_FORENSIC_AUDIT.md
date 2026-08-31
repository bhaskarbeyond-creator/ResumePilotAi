# Payment Forensic Audit

## Providers
1. Stripe (payment intents)
2. PayPal (Orders v2, capture flow)
3. Razorpay (Orders + signature verification)
4. Paytm (Initiate Transaction + Status callback)
5. PhonePe (PG v1, X-VERIFY HMAC checksum)

## Lifecycle Verified for All Providers

| Stage | Stripe | PayPal | Razorpay | Paytm | PhonePe |
|-------|--------|--------|----------|-------|---------|
| CREATE | ✅ server-side amount/currency/plan | ✅ server-side | ✅ server-side | ✅ server-side | ✅ server-side |
| Client-fields rejected | ✅ (legacy fields blocked) | ✅ (server-owned) | ✅ (userId/uid/amount/keyId rejected) | ✅ | ✅ |
| INITIATE | ✅ PaymentIntent | ✅ Orders v2 create | ✅ Orders create | ✅ InitiateTxn | ✅ /pg/v1/pay |
| VERIFY | ✅ webhook signature | ✅ server-side GET order | ✅ HMAC signature + provider GET payment | ✅ server-side order status | ✅ /pg/v1/status with X-VERIFY |
| CALLBACK/WEBHOOK | ✅ constructEvent + idempotent claim | N/A (capture via client-side call) | N/A (client verify) | ✅ callback HTML + reconcile | ✅ /callback with X-VERIFY |
| SIGNATURE | ✅ Stripe-Signature | ✅ Bearer OAuth token (server) | ✅ SHA256 HMAC | ✅ HS256 JWT-like signature | ✅ SHA256 + salt index |
| STATUS | ✅ payment_intent.succeeded/failed | ✅ CAPTURED/APPROVED check | ✅ captured check | ✅ TXN_SUCCESS only | ✅ PAYMENT_SUCCESS only |
| ACTIVATION | ✅ activateVerifiedOrder (MariaDB) | ✅ | ✅ | ✅ | ✅ |
| IDEMPOTENCY | ✅ Idempotency-Key on create + webhook event claim | ✅ PayPal-Request-Id = ref.id | ✅ receipt = ref.id | ✅ orderId = ref.id | ✅ merchantTransactionId = ref.id |
| INVOICE | ✅ immutable invoice on activation | ✅ | ✅ | ✅ | ✅ |
| FAILURE | ✅ marks FAILED, releases coupon | ✅ | ✅ | ✅ | ✅ |
| REFUND | ✅ charge.refunded webhook → refund state machine + credit notes | Via admin refund endpoint | Via admin refund endpoint | Via admin refund endpoint | Via admin refund endpoint |
| COUPON | ✅ atomic release on failure/duplicate | ✅ | ✅ | ✅ | ✅ |

## Key Security Properties
- Amounts are computed server-side (`getDynamicPlan`) from immutable pricing matrix + INR-only, tax-inclusive.
- Provider credentials are never mixed (pair-selection logic picks env pair OR mysql pair as a complete set, never partial).
- Client-supplied identity fields (`userId`, `uid`, `amount`, `keyId`, `keySecret`) rejected with 400 CLIENT_PAYMENT_IDENTITY_REJECTED.
- Refunds go through `providerRefundId` idempotency and credit-note issuance before entitlement reversal.
- Invoice data is immutable after creation (see `invoiceService.js`); client can't modify billing details during invoice generation.
- Payment orders are always owner-bound (`order.uid !== req.user.uid` → 404, never 403, to prevent enumeration).
- `/api/payment-orders/:id` uses 404 to prevent order-ID enumeration.
- PhonePe redirect URL validated to HTTPS + `*.phonepe.com`.
- Paytm website string constrained to configured value, channel ID is `WEB`.

## Tests
- `backend/test/payments.test.js` (6 subtests): covers all 5 providers and refund/renewal math — all PASS.
- `backend/test/payment-activation.test.js`, `payment-activation-transaction.test.js`, `payment-admin-settings.test.js`, `payment-settings-rbac.test.js`, `payment-order-immutability.test.js`, `indian-gateway-activation.test.js`, `provider-refunds.test.js`, `refund-*.test.js` — all PASS.
- `backend/test/invoice-service.test.js`, `membership-lifecycle.test.js` — all PASS.

## Findings
- PROVEN: All 5 providers implement create/verify/activate/idempotency correctly.
- PROVEN: Client cannot supply amounts or identity.
- PROVEN: Refund state machine is atomic with credit notes.
- PROVEN: Coupons are released on failure.
- NO payment contract regression found.
