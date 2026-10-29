# M8B — RUNTIME CLOSURE MATRIX

**Source revision:** `69a3ed4`
**Environment:** local backend, `IN_MEMORY_REPOSITORY=1`, `NODE_ENV=development`, local HMAC test identity
(`backend/security/auth.js` `issueLocalTestToken`, `rptest.` prefix — **not Firebase**), port 5099, node v22.22.3
**Evidence:** `Evidence/artifacts/m8b-runtime-probes.json`, `Evidence/logs/m8b-runtime-probes.log`
**Probe tool:** `developer-review/tools/m8b-runtime-probes.cjs` (35 probes, executed twice)

---

## 0. What this evidence class is, and is not

| This evidence IS | This evidence IS NOT |
|---|---|
| integration-level: real Express routes, real middleware, real authz, real validators | production proof |
| in-process persistence (write → read within one process) | MariaDB durability, replication, migration correctness |
| server-side rejection and error-path behaviour | browser behaviour — no DOM, no client code executed |
| authorization results for admin step-up routes | provider settlement — no payment provider was contacted |

Two consequences follow, and both are enforced below: **no test is marked PASS on client-side behaviour**, and the
`IN_MEMORY_REPOSITORY` test double is not trusted where it diverges from `MySQLRepository` (§3).

---

## 1. Test identification

M8A's runtime document did not enumerate 16 *tests*; it recorded 16 *claims* with `runtimeRepro: BLOCKED`, of which
2 had backend route-level evidence (B2, B3). This mission's §6 priority list contains 14 items. The matrix below is
resolved at **18 executable test rows covering all 16 claims** — a claim whose UI and backend halves have different
feasibility gets two rows, because collapsing them would let a passing backend hide a blocked browser test.

---

## 2. Matrix

| Test | Claim | Class | Result | Actual behaviour | Evidence |
|---|---|---|---|---|---|
| **T2** contact backend validation | B1 | integration | **BLOCKED** | all four payloads (valid, short, bad email, honeypot) → `503 RATE_LIMIT_UNAVAILABLE`. Server stderr: `[Rate limit store] contact connect ECONNREFUSED 127.0.0.1:3306`. Admission fails **closed** by design (`security/abuse.js:108`), so the handler is never reached | probes T2a–T2d |
| **T2-UI** contact form submits | B1 | browser e2e | **BLOCKED** | no browser; the fabricated success is a client-side `setSubmitted(true)` with no fetch (`pages/cms/index.tsx:240-244`) | static only |
| **T3** queue telemetry + fallbacks | D2 | integration | **PASS** | `GET /api/platform/queues` → **503 `QUEUE_QUERY_UNAVAILABLE`** (the exact state in which the UI keeps its fabricated baseline); `GET /api/admin/queues` → **404** (the client's own fallback URL does not exist); `POST /api/platform/queues/purge` → **410 `DEAD_LETTER_PURGE_RETIRED`** | T3a–T3c |
| **T3-UI** queue console shows fabricated SES trace | D2 | browser e2e | **BLOCKED** | requires rendering; the display logic (`AdminQueuesTab.tsx:114-115,154-156`) is static-proven only | static only |
| **T4** CMS published slug | B2 | integration | **PASS** | `PUT /api/admin/pages/m8b-probe-page` `{pagecontent,status:'published',expectedRevision:0}` → **200** `revision:1`; `GET /api/public/custom-pages/m8b-probe-page` → **200** with the published content | T4 publish cycle |
| **T4b** CMS unknown slug | B2 | integration | **PASS** | `GET /api/public/custom-pages/m8b-nonexistent-slug` → **404 `CUSTOM_PAGE_NOT_FOUND`** | T4b |
| **T4c** CMS unpublished visibility | B2 | integration | **NOT APPLICABLE to the product** | after `status:'unpublished'` the public route still returned 200. **Cause is a test-double defect:** `MySQLRepository.getCustomPageBySlug` correctly applies `AND published = 1` (`MySQLRepository.js:1814-1819`); `InMemoryRepository.getCustomPageBySlug(slug)` ignores its options argument entirely (`InMemoryRepository.js:734`). Recorded as a harness finding, **not** a product defect | `repositories/InMemoryRepository.js:731-736` |
| **T4-UI** CMS renderer fetches published pages | B2 | browser e2e | **BLOCKED** | the renderer performs no fetch at all (`pages/cms/index.tsx:38,148`); no browser available | static only |
| **T5** blog reader routes | B3 | integration | **PASS** | `GET /api/blog/posts` → **404 `API route not found`** *with a valid admin identity*, and **401** anonymously — so the 404 is confirmed and M8A's demotion of the cause can be reversed. `GET /api/blog-data` → **200**. `GET /api/blog-data/slug/m8b-missing-post` → **404 "Post not found"** | T5a–T5d |
| **T5-UI** blog reader empty state | B3 | browser e2e | **BLOCKED** | the swallowed-error empty state is client-side (`pages/blog/index.tsx:47-50`) | static only |
| **T6** profile persistence | A1, A2 | integration | **FAIL** | `POST /api/users-data/profile {firstname,lastname,occupation,summary,expectedRevision:0}` → **409 `STALE_WRITE` "Revision conflict"**, while `GET` → **404 `PROFILE_NOT_FOUND`** and a retry reports `remoteRevision: 0, remoteProfile: null`. A create at revision 0 conflicts with a profile the read path says does not exist | T6a–T6d |
| **T7** billing console backend | A3 | integration | **PASS (backend) / n/a (UI)** | `GET /api/payment-orders` → **200** `{orders:[],source:"MARIADB_PAYMENT_ORDERS"}`; `POST /api/coupons/validate` with a fake code → **404 "does not exist"** — server validation is strict, so the fail-open is **client-side only**; `GET /api/invoices` → **503 `ECONNREFUSED`** (needs the DB) | T7a–T7c |
| **T7-UI** billing console availability | A3 | browser e2e | **BLOCKED** | `/dashboard/billing` and `/dashboard/plans` redirect to the public pricing page (`router.tsx:201-203,223`); no browser to confirm | static only |
| **T8** TOTP enrolment exist? | A4 | integration | **PASS** | `POST /api/users-data/mfa/enroll` → **404 `API route not found`**. Repo-wide source search finds **no** enrolment/setup/TOTP route anywhere in `backend/`. Enrolment is absent **server-side**, not merely in the UI | T8b + source search |
| **T8b** factor disable | A4 | integration | **BLOCKED** | `POST /api/users-data/mfa/disable` → **503 `IDENTITY_DIRECTORY_UNAVAILABLE`**; server log shows Firebase `app/invalid-credential` (no Google credentials). The route is wired and audit-logged; the identity provider is missing | T8a + server stderr |
| **T9** team membership | C1 | integration | **BLOCKED** | `GET /api/enterprise/teams` and `.../teams/m8b-team/members` → **404 `ENTERPRISE_DISABLED`** ("disabled for this deployment"). Requires tenant provisioning + a config state this environment cannot set | T9a–T9b |
| **T10** employer messaging persistence | C3 | integration | **BLOCKED** | `GET /api/messages/conversations` → **403 `MODULE_DISABLED`**; `POST /api/messages/conversations` → **503 `RATE_LIMIT_UNAVAILABLE`**. Gated on `public_config.modules.enableMessagesModule === true`; `POST /api/admin/settings/public_config` rejects the payload shape (`400 Unsupported settings category or payload`) | T10a–T10f |
| **T11** admin financial authz | D1 | integration | **PASS** | `POST /api/admin/payments/refund` → **403 `FORBIDDEN`** for a non-admin identity, **400 `INVALID_PAYMENT_ORDER`** for SUPER_ADMIN (route reachable, input validated). `GET /api/admin/payment-orders` → **503** `Payment ledger is unavailable` (DB) | T11a–T11d |
| **T14** checkout rejection path | A3 | integration | **PASS** | `POST /api/pay` → **400 `INVALID_PLAN`**; `POST /api/razorpay/create-order` → **400 `CLIENT_PAYMENT_IDENTITY_REJECTED`** ("Payment ownership and amounts are server-controlled"); `POST /api/paypal/create-order` → **503 `PAYMENT_CONFIGURATION_UNAVAILABLE`**. The server **rejects** rather than fabricating, so FS-M8A-01's fabrication is confined to the client | T14a–T14c |
| **T15** interview voice | D5 | browser e2e | **BLOCKED** | needs microphone permission and a real browser; repo-wide search finds 0 media/speech APIs in `frontend/src` | static only |
| **T16** blog / cover-letter editors | D3, D4 | browser e2e | **BLOCKED** | authoring surfaces are client-side | static only |
| **T17** marketing interactivity | B4 | browser e2e | **BLOCKED** | `landing.tsx` has 0 `useState`; absence of interactivity is a client-side property | static only |
| **C2** SIEM export | C2 | — | **NOT APPLICABLE** | claim falsified at source; nothing to execute | — |

---

## 3. Totals

| Result | Count | Tests |
|---|---:|---|
| **PASS** | **8** | T3, T4, T4b, T5, T7, T8, T11, T14 |
| **FAIL** | **1** | T6 |
| **BLOCKED** | **12** | T2, T2-UI, T3-UI, T4-UI, T5-UI, T7-UI, T8b, T9, T10, T15, T16, T17 |
| **NOT APPLICABLE** | **2** | T4c (test-double defect), C2 (claim falsified) |
| **Rows total** | **23** | covering all **16** claims |

**Compare with M8A.** M8A: end-to-end 0/16, backend route-level 2/16, blocked 14/16.
**Now:** browser end-to-end still **0**; backend route-level **8 PASS**; **1 FAIL**; **12 rows blocked**
(9 of them are browser-only rows that M8A also could not run); **2 N/A**.

**Of the 16 claims:** 6 now carry positive runtime evidence (A3, A4, B2, B3, D1, D2), 1 carries a runtime
**failure** (A1/A2 profile create), 8 are blocked by a named dependency, and 1 is not applicable (C2).

---

## 4. The one FAIL, stated precisely

`T6` is recorded as FAIL rather than BLOCKED because two endpoints contradicted each other under one identity in one
process:

- `POST /api/users-data/profile` with `expectedRevision: 0` → `409 STALE_WRITE`
- `GET /api/users-data/profile` → `404 PROFILE_NOT_FOUND`
- retry → `409 PROFILE_CONFLICT` with `remoteRevision: 0, remoteProfile: null`

A create at revision 0 that conflicts with a nonexistent profile is internally inconsistent **for the write path**.
**Attribution is unresolved:** the write goes through `ResilientRepository`/`resilientMutations`, and this environment
runs the in-memory double, so the same divergence class as §2 T4c may apply. It is therefore recorded as a **failure
of the observed behaviour**, with an explicit open question — *does `MySQLRepository` create at revision 0?* — that
cannot be answered without MariaDB. It must not be reported as a production defect until that is settled.

---

## 5. What would unblock the rest

| Blocked group | Exact prerequisite |
|---|---|
| T2, T10a (rate-limited routes) | a MariaDB/MySQL instance on 3306 (the rate-limit store), or a supported in-memory rate-limit store configured for non-production use |
| T8b (identity) | Firebase credentials **or** an identity-directory test double; `TEST_AUTH_HMAC_SECRET` authenticates requests but does not provide a directory for MFA factor lookup |
| T9 (enterprise) | tenant provisioning plus `ENTERPRISE` configuration state enabled in the disposable store |
| T10 (messaging) | a settings document with `modules.enableMessagesModule: true`, written through a supported settings category |
| T6 (resolution) | MariaDB, to establish whether the CAS conflict is a product or test-double behaviour |
| All `browser e2e` rows | a Playwright browser. The repo ships `tools/playwright.audit.config.ts` and `audit-browser-verification.spec.ts`, but the Chromium binary is not obtainable in this sandbox (CDN unreachable) |
| All provider rows | sandbox provider credentials — none are available, and none were invented |

---

## 6. Scope discipline

- One disposable in-memory server, one port, synthetic identities (`probe-super`, `probe-user`, `probe-other`),
  synthetic data only.
- **No repository file was modified to make any probe pass.** The single attempted environment mutation
  (`POST /api/admin/settings/public_config` to enable messaging) was **rejected by the application** and changed
  nothing.
- No TLS or security control was weakened; the local HMAC verifier is the repository's own non-production
  mechanism and is inert when `NODE_ENV=production` (`backend/security/auth.js:19-22`).
- The server was stopped; no process remains.
