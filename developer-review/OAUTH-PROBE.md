# Subfeature Probe — OAuth, Payments, Rejection Feedback, Portfolio Gallery

**Revision:** `0adad00` · **Why this file exists:** V4 requirement (a) demands decomposition into
subfeatures (OAuth *initiation / callback / error / linking*; payments *initiation / webhook / invoice /
refund / reconciliation*) rather than a single per-provider verdict. A provider can be "supported" in one
subfeature and absent in another, and the earlier package's per-provider rows hid exactly that.

Legend for reachability: values are from the 384-operation register
(`BACKEND-OPERATION-REACHABILITY.md`), not from reading route declarations.

---

## 1. OAuth — four subfeatures × six providers

### 1.1 Initiation (how a user starts a flow)

| Provider | Legacy | Modern | Modern endpoint state |
|---|---|---|---|
| Google | Firebase popup (`useOAuthSignIn.js`) **+** GIS fallback | `login.tsx:209-233` `signInWithPopup` | n/a — client SDK, no backend op |
| Facebook | Firebase popup **+** direct SDK fallback | **none** — `facebookProvider` constructed (`firebase.ts:62`), never imported by a page; admin toggle `enableFacebookAuthModule` still advertised (`AdminSettingsTab.tsx:224-228`, default `true` at `:378`) | n/a |
| LinkedIn | `window.location.href = '/api/auth/linkedin'` (`auth/login/Login.jsx:389`, `auth/register/Register.jsx:254`, `useOAuthSignIn.js:185`) | **none** | `GET /auth/linkedin` = **UNREACHABLE** (R6) |
| GitHub | `'/api/auth/github'` (`Login.jsx:396`, `Register.jsx:261`, `useOAuthSignIn.js:192`) | **none** | `GET /auth/github` = **UNREACHABLE** (R6) |
| X/Twitter | never implemented | never implemented | — |
| Apple | never implemented | never implemented | — |

### 1.2 Callback (provider → server)

| Provider | Endpoint | Register state | Meaning |
|---|---|---|---|
| LinkedIn | `GET /auth/linkedin/callback` | **EXTERNAL-CALLER** (R3) | the provider can reach it; nothing initiates it, so in practice no browser will ever arrive here |
| GitHub | `GET /auth/github/callback` | **EXTERNAL-CALLER** (R3) | same |
| Google/Facebook | none (Firebase-hosted) | — | no server-side callback by design |

**This is the sharpest single fact in the whole OAuth picture:** the pair
`initiation UNREACHABLE` + `callback EXTERNAL-CALLER` describes a flow that is *half alive*. The hard part
(state + PKCE + single-use consume + timing-safe cookie binding, all verified in
`backend/security/oauth.js`, `backend/database/oauthStore.js`, `backend/index.js:7273-7460`) is
implemented and correct, and the entry point that would exercise it does not exist in the modern client.

### 1.3 Error handling

| Subfeature | Legacy | Modern | Evidence |
|---|---|---|---|
| Provider-side denial | redirect to `/login?error=…` handled in `Login.jsx` | not applicable (no server flow to deny) | — |
| Misconfiguration | `oauth_not_configured` fail-closed | same backend behaviour, unreachable from UI | `backend/index.js:7280` (`failOAuthBegin(..., 'oauth_not_configured')`) |
| State/PKCE mismatch | backend rejects; legacy UI surfaces the redirect error | backend intact, no UI path | `oauth.js` state validation |
| Popup cancellation (Google) | handled | handled (`login.tsx` catch → toast) | `login.tsx:216-233` |
| Popup cancellation (Facebook) | handled | **cannot occur** — no handler | — |

### 1.4 Account linking

| Behaviour | Backend | Modern UI |
|---|---|---|
| `assertAccountLinkSafe` — refuses to attach a provider identity to a conflicting account (`OAUTH_IDENTITY_CONFLICT`) or requires an explicit link (`OAUTH_ACCOUNT_LINK_REQUIRED`) | implemented | no UI surface (only the Google Firebase path exists, which links via Firebase, not this code) |
| Verified-email-only rule (`emailVerified === true`) | implemented, enforced | same |
| No silent merge | implemented | same |

**Verdict per subfeature:** initiation **regressed (4 → 1)**; callback **present but unreachable in
practice**; error handling **present for the one surviving provider only**; linking **implemented
server-side, unreachable client-side**. Net: `DISC-019` (breadth) and `DISC-022` (advertised-but-unwired
provider) are the actionable defects; the *security architecture* is not a defect.

---

## 2. Payments — five subfeatures

| Subfeature | Endpoints | Register state | Verdict |
|---|---|---|---|
| **Initiation** | `POST /razorpay/create-order`, `POST /paypal/create-order` | **UI-REACHABLE** — `pages/billing/checkout-modal.tsx:346,348` | present for Razorpay + PayPal |
| | `POST /payment/razorpay-order` | **UNREACHABLE** | duplicate/legacy variant; dead code path |
| | `POST /paytm/initiate-transaction`, `POST /phonepe/initiate` | **EXTERNAL-CALLER** (provider-family rule) | **caveat:** an "initiate" call is normally client-originated. The rule matched the provider family, and the modern checkout does not call either. The class may therefore *overstate* reachability for these two; if reclassified they would be `UNREACHABLE`, raising that count to 203. Recorded as a register limitation, not silently fixed |
| **Webhook** | `POST /stripe-webhook`, `POST /razorpay/verify-payment`, `POST /paypal/verify`, `POST /paytm/callback`, `POST /paytm/verify-transaction`, `POST /phonepe/callback`, `POST /phonepe/status` | **EXTERNAL-CALLER** (all 7) | healthy — these must never have a browser caller |
| **Invoice** | `POST /invoice`, `POST /invoice/generate`, `GET /invoices`, `GET /invoices/{id}`, `POST /email/send-invoice-email` | 4 × **UNREACHABLE**, 1 × **SERVER-ONLY** | end-to-end invoicing exists with **no UI to trigger or read it** |
| **Refund** | `POST /admin/payments/refund` | **UNREACHABLE** | no refund execution surface |
| **Reconciliation** | `GET /platform/payment-webhooks`, `POST /platform/payment-webhooks/{id}/replay`, `POST /admin/subscriptions/{id}/reconcile`, `GET /admin/payment-orders`, `GET /payment-orders`, `GET /payment-orders/{id}`, `GET /platform/payments-health` | **all UNREACHABLE** | operators cannot see or replay a webhook, reconcile a subscription or read the order ledger |
| **Configuration** | `GET/POST /admin/payment-settings`, `POST /admin/payment/test-provider` | **UI-REACHABLE** | provider keys are administrable |

**Net:** money *comes in* (initiation + webhooks work and are correctly classified as external), and it
cannot be *accounted for* (invoice, refund, reconciliation, ledger all unreachable). That asymmetry is the
finding — not "payments are broken".

---

## 3. Rejection feedback — subfeatures

| Subfeature | State | Evidence |
|---|---|---|
| Capture | present, free-text, optional | `CandidateReviewDrawer.tsx:84`, `:821` |
| Validation | server-side whitelist + transition map + 1,000-char cap + control-char strip | `index.js:1689-1703` |
| Authorization | employer-owns-job check, 404 on mismatch | `resilientMutations.js:307-312` |
| Persistence | **broken under MySQL** — `employerNotes` has no column; `notes` is re-written from the pre-update record | `MySQLRepository.js:1600-1637` (`DISC-020`) |
| CAS / revision | **inert under MySQL** — `revision` not in the column map | same |
| Applicant notification | present (text embedded in the notification) | `index.js:1629-1635` |
| Applicant-visible record | absent from the UI; **owner columns not projected** from the API | `applied-jobs.tsx`; `index.js:1728-1743` (`DISC-021`) |
| Structured reason | **no `rejectionReason` field** anywhere | `grep rejectionReason` → 0 |

## 4. Portfolio gallery — subfeatures

| Subfeature | Legacy | Modern | Verdict |
|---|---|---|---|
| Route | `/portfolios` (`main.jsx:575`) | `/portfolios` (`router.tsx:99`) | parity |
| Search | title/description/tags | title + `metadata.description` + `metadata.tags` (`gallery.tsx:60-67`) | parity |
| Filter | theme (server-side `?theme=`) | template (`?template=`, client-side, derived from present templates) | parity, different mechanism |
| Result count | yes | yes ("N of M match") | parity |
| Loading | yes | skeleton + `aria-busy` | improved |
| Error | swallowed to console | error panel + retry (`gallery.tsx:115-122`) | improved |
| Empty | yes | yes | parity |
| URL state | no | `?q=`, `?template=` persist across reload/back-forward | improved |
| Deep link | yes (`public-portfolio`) | yes (`public-portfolio.tsx`, `/portfolios/public/:slug`) | parity |
| Preview imagery | 4 static theme PNGs | palette-driven rendering | replaced, equivalent |

The gallery is the one area where the modern implementation is unambiguously better. The adjacent
portfolio *editor* is where the loss is (`FP-C01`…`FP-C04`) — do not confuse the two.

---

## 5. Register limitations this probe exposed

1. Provider-family rule R3 can misclassify client-originated endpoints whose path contains a provider name
   (`/paytm/initiate-transaction`, `/phonepe/initiate`). Impact bounded at 2 of 384 operations; disclosed
   in §2 rather than patched silently, because changing the rule now would alter published counts without
   re-reviewing all 27 `EXTERNAL-CALLER` rows.
2. A "present" endpoint is not a present capability: `/auth/github/callback` is reachable *by a provider*
   and used by nobody, which the class alone cannot express — hence this file.
3. Nothing here is runtime-verified: no live provider credentials (EG-010), no database (EG-007).
