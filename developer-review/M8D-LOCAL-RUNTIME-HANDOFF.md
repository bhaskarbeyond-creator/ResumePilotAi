# M8D — Local Runtime Handoff

**Mandate:** 8D §7 (P1). **Audited revision:** `69a3ed4`.
**Machine-readable:** `Evidence/artifacts/m8c-runtime-manifest.json` (re-generated unchanged).
**Reproduce:** `python3 developer-review/tools/m8c-runtime-manifest.py [--json]`.
**Evidence of the recorded runs:** `Evidence/logs/m8b-runtime-probes.log`,
`Evidence/artifacts/m8b-runtime-probes.json`, `Evidence/logs/m8b-toolchain.log`.

This is the handoff a developer needs in order to close the runtime gaps. Nothing here claims a test
was executed that was not.

---

## 1. The four counts, kept separate

| Collection | Count | Source |
|---|---|---|
| **HTTP probes** | **35** (5 × 2xx, 18 × 4xx, 11 × 5xx, 1 skipped) | `m8b-runtime-probes.json`, 35 records |
| **Test cases** | **23** (8 PASS, 1 FAIL, 12 BLOCKED, 2 N/A) | parsed from `M8B-RUNTIME-CLOSURE-MATRIX.md` status table |
| **Findings** | **56** log entries (54 distinct) | `DISCREPANCY-LOG.md` |
| **Client URL contract defects** | **11** (11 BLOCKED) | `m8-contract-gap-revalidation.json` `falseSuccessPaths` |

**Never summed.** A probe is evidence about routing; a test case is a judgement; a finding is a
defect record; a contract defect is a specific client/server mismatch. 8 test passes and 5 HTTP 2xx
probes are not "13 passes".

**Verified against the underlying records in M8D:** the 35 probe records and the 23 status rows were
re-read; both tallies reproduce exactly. The probe artifact stores normalised paths (`{id}` for
concrete ids), so probe→path mapping is by URL shape — which is why none of the 11 contract defects
could be mapped to an executed probe, and why all 11 stay BLOCKED rather than inferred.

## 2. What the recorded runs actually prove

- Backend route wiring, in-process behaviour, and request/response shapes — **yes**.
- Persistence — **only** in the in-memory repository; MariaDB was never reached.
- Browser behaviour — **no browser existed**; `browser E2E = 0 of 12 browser-level claims`.
- Provider behaviour — **no provider was contacted**; checkout *rejection* is server-side and proven.

`T7` keeps its qualifier (`PASS (backend) / n/a (UI)`); a backend pass is never promoted to a UI pass.

## 3. Handoff, per test case

Common prerequisites: Node ≥ 18, repo at `69a3ed4`, backend started with `IN_MEMORY_REPOSITORY=1` for
DB-free cases; `curl` available. For browser cases add Playwright Chromium and the frontend dev
server. Every case: **capture the exact command, the response status and body, and for UI cases a
screenshot plus the DOM before/after the action.**

| ID | Entry point / command | Prerequisites | Expected | Evidence to capture | Status now |
|---|---|---|---|---|---|
| `T2` | `curl -sS -X POST $API/contact -H 'content-type: application/json' -d @payloads/contact-valid.json` (and short/bad-email/honeypot variants) | backend up; rate-limit store reachable **or** the admission path short-circuits | validation errors for the three invalid payloads, 2xx for valid | status + body for all four payloads; server stderr | **BLOCKED** — all four returned `503 RATE_LIMIT_UNAVAILABLE` (fail-closed admission, `security/abuse.js:108`) |
| `T2-UI` | open the public contact page, submit, watch network | browser + dev server | a request is issued and failure is surfaced | HAR + screenshot + DOM | **BLOCKED** — no browser; the success state is a client-side `setSubmitted(true)` with no fetch (`pages/cms/index.tsx:240-244`) |
| `T3` | `curl $API/platform/queues`; `curl $API/admin/queues`; `curl -X POST $API/platform/queues/purge` | backend up | 503 / 404 / 410 respectively, i.e. the console shows fabricated data | three responses | **PASS** (recorded) |
| `T3-UI` | open admin → Queues | browser | fabricated SES trace visible while the API is down | screenshot + DOM | **BLOCKED** — display logic static-only (`AdminQueuesTab.tsx:114-115,154-156`) |
| `T4` | `PUT $API/admin/pages/m8b-probe-page` with `{pagecontent,status:'published',expectedRevision:0}` then `GET $API/public/custom-pages/m8b-probe-page` | backend + admin identity | 200 `revision:1`, then 200 with content | both responses | **PASS** (recorded) |
| `T4b` | `GET $API/public/custom-pages/m8b-nonexistent-slug` | backend | 404 `CUSTOM_PAGE_NOT_FOUND` | response | **PASS** (recorded) |
| `T4c` | publish, then `PUT` with `status:'unpublished'`, then re-read publicly | **MariaDB required** to be meaningful | 404 after unpublish | responses + DB row | **NOT APPLICABLE** to the product: in-memory double ignores `publishedOnly` (`InMemoryRepository.js:734`); `MySQLRepository.js:1814-1816` applies `AND published = 1` |
| `T4-UI` | open CMS renderer for a published page | browser | content renders from a fetch | HAR + screenshot | **BLOCKED** — renderer performs no fetch (`pages/cms/index.tsx:38,148`) |
| `T5` | `curl $API/blog/posts` (admin and anonymous); `curl $API/blog-data`; `curl $API/blog-data/slug/m8b-missing-post` | backend + admin identity | 404 (admin) / 401 (anonymous); 200; 404 | four responses | **PASS** (recorded) |
| `T5-UI` | open `/blog` with the API failing | browser | swallowed-error empty state | screenshot + DOM | **BLOCKED** — client-side (`pages/blog/index.tsx:47-50`) |
| `T6` | `POST $API/users-data/profile` `{firstname,lastname,occupation,summary,expectedRevision:0}`, then `GET` | backend | create succeeds at revision 0 | request/response, then a re-read | **FAIL** — 409 `STALE_WRITE` while `GET` → 404 `PROFILE_NOT_FOUND` |
| `T7` | `GET $API/payment-orders`; `POST $API/coupons/validate` (fake code); `GET $API/invoices` | backend; **MariaDB** for invoices | 200 orders; 404 for the fake coupon; 503 invoices without DB | three responses | **PASS (backend) / n/a (UI)** |
| `T7-UI` | open `/dashboard/billing` | browser | console reachable | URL + screenshot | **BLOCKED** — routes redirect to public pricing (`router.tsx:201-203,223`) |
| `T8` | `POST $API/users-data/mfa/enroll`; plus repo-wide route search | backend | route existence | response + grep output | **PASS** — 404: no enrolment route exists anywhere in `backend/` |
| `T8b` | `POST $API/users-data/mfa/disable` | **Firebase credentials** | factor disabled | response + audit row | **BLOCKED** — 503 `IDENTITY_DIRECTORY_UNAVAILABLE`, Firebase `app/invalid-credential` |
| `T9` | `GET $API/enterprise/teams`; `GET $API/enterprise/teams/m8b-team/members` | tenant provisioning + config state | membership list | responses | **BLOCKED** — 404 `ENTERPRISE_DISABLED` |
| `T10` | `GET $API/messages/conversations`; `POST $API/messages/conversations` | `public_config.modules.enableMessagesModule=true` | 2xx with a conversation | responses | **BLOCKED** — 403 `MODULE_DISABLED` / 503; enabling payload rejected 400 |
| `T11` | `POST $API/admin/payments/refund` as non-admin, then SUPER_ADMIN; `GET $API/admin/payment-orders` | two identities | 403 then 400 `INVALID_PAYMENT_ORDER`; 503 ledger | four responses | **PASS** (recorded) |
| `T14` | `POST $API/pay`; `POST $API/razorpay/create-order`; `POST $API/paypal/create-order` | backend | 400 `INVALID_PLAN`; 400 `CLIENT_PAYMENT_IDENTITY_REJECTED`; 503 | three responses | **PASS** (recorded) |
| `T15` | interview voice mode, microphone permission | **browser + microphone** | audio capture works | screenshot, permission state | **BLOCKED** — 0 media/speech APIs in `frontend/src` |
| `T16` | blog and cover-letter editors | browser | rich editor present | screenshot + DOM | **BLOCKED** — client-side; the editor is a plain `<textarea>` |
| `T17` | marketing landing page interactions | browser | interactive elements respond | screenshot + DOM | **BLOCKED** — `landing.tsx` has 0 `useState` |
| `C2` | SIEM export | — | — | — | **NOT APPLICABLE** — claim falsified at source |

## 4. Handoff, per contract defect (all 11)

Each is a false-success site: the client posts to a URL, swallows the failure and renders success.
**Test:*does the client's exact URL fail, and does the client suppress the success state?*** PASS for
these means **the defect was confirmed**, not that the product works.

Common prerequisites for all 11: backend + frontend dev servers, a signed-in identity of the right
role, and browser dev tools. Evidence: response status/body for the client's **exact** URL plus a
screenshot/DOM diff proving the success state is suppressed.

| Test | Path | Contract class | Sites | Status |
|---|---|---|---|---|
| `RT-C-01` | `/blog/posts/{X}` | AMBIGUOUS | 3 | **BLOCKED** |
| `RT-C-02` | `/platform/operational-status/refresh` | not in gap set | 1 | **BLOCKED** |
| `RT-C-03` | `/admin/employer-applications/{X}/verify` | AMBIGUOUS | 2 | **BLOCKED** |
| `RT-C-04` | `/admin/jobs/{X}/moderate` | NO_OPERATION | 1 | **BLOCKED** |
| `RT-C-05` | `/admin/operations/backup` | NO_OPERATION | 1 | **BLOCKED** |
| `RT-C-06` | `/admin/operations/cache-clear` | NO_OPERATION | 1 | **BLOCKED** |
| `RT-C-07` | `/admin/queues/dead-letter-queue/purge` | ANOTHER_CONTRACT | 2 | **BLOCKED** |
| `RT-C-08` | `/admin/users/{X}/status` | AMBIGUOUS | 1 | **BLOCKED** |
| `RT-C-09` | `/platform/role-view-audit` | not in gap set | 1 | **BLOCKED** |
| `RT-C-10` | `/admin/users/{X}/revoke-sessions` | not in gap set | 1 | **BLOCKED** |
| `RT-C-11` | `/admin/users` | not in gap set | 1 | **BLOCKED** |

The four "not in gap set" paths are false-success sites whose URL resolves (or was unresolved) rather
than being one of the 15 gap shapes; their defect is *swallowing*, so a runtime test must prove
suppression rather than a 404.

## 5. Ordered plan to close the runtime gap

1. **MariaDB** (unblocks T6/T7/T11/T8b persistence legs, and makes T4c meaningful). Disposable
   instance, migrations there only, synthetic data.
2. **Playwright Chromium** (unblocks all 12 `-UI` cases and all 11 `RT-C` cases). This is the single
   highest-value step: it converts 23 blocked claims into executable ones.
3. **Firebase emulator** (T8b). **Payment sandbox keys** (settlement only; no real charge).
4. **T10 cannot be unblocked externally** — the settings route rejects the enabling payload. That is
   `M8D-06`-adjacent product work, not environment setup.

## 6. Prohibitions honoured

No blocked test is reported as passing. No in-memory or static evidence is presented as database,
browser, or provider validation. No probe is counted as a test pass. No result was invented for any
of the 11 contract defects.
