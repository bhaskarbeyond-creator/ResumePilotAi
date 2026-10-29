# M8A — FALSE-SUCCESS AND MOCK DATA

**Source revision:** `888c2e5`
**Scope:** surfaces where the product tells the user something happened that did not happen, or displays data that was
never measured. Identification and evidence only — **no remediation is authorized by this mandate.**

These five records (`FS-M8A-01` … `FS-M8A-05`) extend the existing false-success inventory (12 sites / 11 paths + 1
undetectable). They are not replacements and they are not deduplicated against it here.

---

## FS-M8A-01 — Checkout fabricates a paid order, an invoice and a verified entitlement after a failed payment

**Severity: highest in this mandate.** This is the only fabricated surface that asserts a **financial state**.

| Step | Locus | Observed |
|---|---|---|
| 1 | `frontend/src/pages/billing/checkout-modal.tsx:345-349` | the payment request fails and the error is **swallowed** |
| 2 | `checkout-modal.tsx:356-360` | on that failure path the code **generates** `ORD-…` and `INV-2026-…` identifiers locally |
| 3 | `checkout-modal.tsx:377+` | renders `Status: PAID (Verified Server Entitlement)` |
| 4 | `checkout-modal.tsx:249-259` | coupon validation **fails open** to a hardcoded coupon list |

**User impact:** a candidate whose payment failed is shown a paid invoice number and an "entitlement" the server never
granted. The identifiers look authoritative and are machine-shaped, so they will be quoted in support requests and
potentially presented as proof of purchase.

**Why it matters for the audit:** the backend is real (`/api/pay`, PayPal, Razorpay, `POST /api/coupons/validate`,
`/api/invoices`), so this is not a missing-integration gap. The UI **replaces a real failure with a fabricated success** —
which no API-contract check, route-registration check or endpoint-count metric can detect. It is detectable only by
reading the failure branch.

**Related promise defect:** `frontend/src/pages/billing/pricing.tsx:167-172` advertises in-account upgrade, downgrade and
cancel. `account-panel.tsx:53,240` offers account **deletion only**. `router.tsx:201-203,223` routes `/dashboard/plans`
→ `/pricing` and `/dashboard/billing` → `/dashboard/plans`, so both dashboard billing routes land on the **public
marketing page**. The console the copy promises has no route at all.

**Register:** `FP-A29` (new) + `FP-A24` (no change).

---

## FS-M8A-02 — Contact form reports success without contacting anything

| Step | Locus | Observed |
|---|---|---|
| 1 | `frontend/src/pages/cms/index.tsx:234-247` | `ContactPage` collects name, email, subject, message |
| 2 | `cms/index.tsx:240-244` | `handleSubmit` performs `if (!email || !message) return;` then `setSubmitted(true)` |
| 3 | same | **no fetch, no api client, no await** — the handler returns |
| — | `backend/index.js:2360-2385` | a complete endpoint exists: honeypot, regex validation, length limits, persistence, `202`/`400`/`500` |
| — | `backend/index.js:577` | `contactAccountLimiter` installed |
| — | `src/services/api/platform.js:310` | the **legacy** client does call `POST /api/contact` |

**User impact:** messages are silently discarded while the sender is told they were received. The organisation loses
every inbound contact from the modern site and has no telemetry showing the loss, because no request is made.

**Secondary defect:** the backend persists but dispatches **no notification mail** — so even the legacy path stores a
message that nobody is told about. This is a capability gap in the backend, not a UI defect.

**Register:** `FP-G22` (new). Bucket 3.

---

## FS-M8A-03 — CMS renders hardcoded content and silently serves the wrong page

| Locus | Observed |
|---|---|
| `frontend/src/pages/cms/index.tsx:38` | `CMS_PAGES` — a hardcoded `Record<string, CmsContent>` dictionary |
| `frontend/src/pages/cms/index.tsx:148` | `CMS_PAGES[slug] \|\| CMS_PAGES['privacy-policy']` |
| whole file | **zero** network calls |
| `backend/index.js:6537` | real public list: `/api/public/custom-pages`, `/public/custom-pages.json`, … |
| `backend/index.js:6595` | real public detail: `/api/public/custom-pages/:slug` |
| `backend/index.js:6621,6630,6658` | real admin CRUD: `GET /api/admin/pages`, `PUT/DELETE /api/admin/pages/:slug` |

**Two distinct defects, often conflated:**
1. **Disconnected API** — admins can publish, the public renderer never reads the publication.
2. **Wrong-content fallback** — an unknown or newly published slug does **not** show "not found"; it shows **privacy-policy
   text**. A visitor to `/terms-of-sale` can be served a privacy policy and has no way to know.

**Re-adjudication of the dossier's framing:** the claim posed "hardcoded dictionary *versus* fallback" as alternatives.
Source shows **both**. The dossier's route name (`GET /api/pages`) does not exist; the live routes are the
`custom-pages` pair above. `/api/cms-pages` returns **`410 API_RETIRED`** by design (`index.js:470`) and is not a defect.

**Register:** `FP-G10` → reclassify toward false-success/disconnected-API.

---

## FS-M8A-04 — Blog reader swallows a 404 into a permanent empty state

| Locus | Observed |
|---|---|
| `frontend/src/app/router.tsx:77,78` | `/blog` and `/blog/:slug` both render `BlogPage` |
| `frontend/src/pages/blog/index.tsx:45` | `get<{ posts: BlogPost[] }>('/blog/posts')` |
| `frontend/src/pages/blog/index.tsx:47-50` | `catch { setPosts([]) }` — failure indistinguishable from "no content" |
| `frontend/src/pages/blog/index.tsx` | **no `useParams`** — the `:slug` parameter is never read |
| repository search | `/api/blog/posts` **does not exist**; only `/api/blog-data/*` (`index.js:517`) and `/api/admin/blog/posts` (`:6424`) |
| `backend/routes/blogData.js:35,49,74,85` | real list, categories, `/slug/:slug`, `/:id` |

**Three defects, in the order a user meets them:**
1. the request targets a non-existent route → 404;
2. the 404 is swallowed → the reader shows "No articles found / Check back soon for new content", which reads as
   *"the company has not written anything"* rather than *"the site is broken"*;
3. even with data, `/blog/:slug` cannot render an article — no slug read, no body, no author, no sharing, no
   missing-article state.

**Register:** `FP-G09` → split (reader defects here; authoring regression in D3).

---

## FS-M8A-05 — Queue console invents an SES failure, frame paths and line numbers

| Locus | Observed |
|---|---|
| `frontend/src/components/admin/AdminQueuesTab.tsx:48` | `DEFAULT_QUEUES` constant |
| `:55,59` | `INITIAL_JOBS`, `channel: 'SMTP / SES'` constants |
| `:67-69` | `SES_RATE_LIMIT_EXCEEDED: Maximum send rate exceeded` with frames `at SESClient.sendTransactional (/backend/services/mailTransport.js:142:19)`, `at Worker.processJob (/backend/services/queues/emailWorker.js:88:24)`, `at JobPool.drain (/backend/services/queues/pool.js:204:11)` |
| `:114-115` | initial state is the constants — rendered **before** any fetch resolves |
| `:139` | `get('/platform/queues').catch(() => get('/admin/queues'))` |
| `:154-156` | `catch { /* Keep baseline */ }` — after a **failed** load the fabricated data stays on screen |
| `:164-176, 178-196` | retry handlers have `finally` but **no `catch`**; success text is asserted without inspecting the response |
| `backend/routes/platform.js:465,504` | real list and retry routes (retry requires step-up recent auth) |
| `backend/routes/platform.js:543` | `POST /queues/purge` → **`410` retired** |
| repository search | `/admin/queues` does not exist — the client's fallback URL is wrong |

**What is fabricated:** the SES stack trace names **specific file paths and line numbers that do not exist**. An operator
debugging a delivery incident would search for `mailTransport.js:142` — a file/line chosen to look plausible. This is
worse than a placeholder because it is *investigable* and false under investigation.

**What is genuine:** list and retry are wired to real routes with real step-up auth. The console is **partly real and
partly fabricated**, and the fabricated part is precisely what renders when telemetry is missing or the network is down —
i.e. the exact conditions of an incident.

**Additional loss:** the legacy **Purge DLQ** control (`PlatformQueues.jsx:96-101,187`) is now a retired `410`.

**Register:** `FP-A20` → add all five defects.

---

## 1. Cross-cutting pattern

Four of the five share one anti-pattern: **the failure branch is the fabrication branch.**

| Surface | Failure | What the user is shown |
|---|---|---|
| Checkout | payment error swallowed | paid invoice + verified entitlement |
| Contact | no request made | message received |
| Blog | 404 swallowed | no articles exist yet |
| Queues | telemetry unavailable | invented SES incident with false file:line |
| CMS | unknown slug | privacy policy |

Every one is invisible to route-registration audits, endpoint counts and contract checks, because in each case the
*route* is fine and the *contract* is fine. The defect is in what the client does when the call does not succeed.

**This is why the register metric must not be read as a completeness measure.** A `FULL` or `PARTIAL` classification
derived from handlers, labels and subfeature classes cannot see a fabricated success branch.

---

## 2. Detection implication for the verifier set

Existing verifiers count endpoints, subfeature classes and registration reconciliation. None of them can flag these
surfaces. A candidate check — recording it as a **gap**, not implementing it, because verifier changes are a separate
authorization — would be: for each `catch`/`.catch()`, assert that the branch either surfaces an error state or sets a
terminal error flag, and flag branches that assign success identifiers or success copy.

`FS-M8A-01` is the strongest test case: the fabricated `ORD-…`/`INV-…` generation occurs **inside** the failure path.

---

## 3. Non-claims

- No payment processor was contacted; **no provider-side settlement claim** is made in either direction.
- No browser executed these paths. Each record rests on source control flow, which is literal for `FS-M8A-01`,
  `FS-M8A-02` and `FS-M8A-04` (no call / obvious fabricated assignment) and inferential for `FS-M8A-05` (rendering order
  and the `catch` that preserves baseline).
- Severity is not assigned to production impact; only the user-visible misstatement is recorded.
