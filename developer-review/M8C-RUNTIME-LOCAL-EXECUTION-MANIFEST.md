# M8C — Runtime Local Execution Manifest

**Mandate:** 8C §9 (P1). **Audited revision:** `69a3ed4`.
**Machine-readable manifest:** `Evidence/artifacts/m8c-runtime-manifest.json` (every test case, probe
and contract defect with its fields).
**Reproduce:** `python3 developer-review/tools/m8c-runtime-manifest.py [--json]`.

---

## 1. Three collections, counted separately — never added together

| Collection | Count | What it answers | Is it a pass? |
|---|---|---|---|
| **Probes** (`RT-P-01…35`) | 35 | Does the route exist and what does it return? | **Never.** A probe is evidence about routing. |
| **Test cases** (`RT-T`, parsed from the closure matrix) | **23** | Is the claim supported end-to-end? | PASS / FAIL / BLOCKED / NOT APPLICABLE |
| **Contract defects** (`RT-C-01…11`) | **11** | Was the alleged wrong client URL confirmed? | PASS means *defect confirmed*, not "product works" |

**No combined runtime pass rate is published.** 8 test-case passes and 5 HTTP 2xx probes are not
"13 passes": the probes were executed in-process against `InMemoryRepository` with no browser, so
they say nothing about whether a user can reach the behaviour.

### Test-case tally (reproduces the mandate's 35/8/1/12/2 claim, which is actually 23 test cases)

| Status | Count | IDs |
|---|---|---|
| **PASS** | **8** | `T3, T4, T4b, T5, T7, T8, T11, T14` |
| **FAIL** | **1** | `T6` |
| **BLOCKED** | **12** | `T2, T2-UI, T3-UI, T4-UI, T5-UI, T7-UI, T8b, T9, T10, T15, T16, T17` |
| **NOT APPLICABLE** | **2** | `T4c` (test-double defect), `C2` (claim falsified at source) |
| **Total** | **23** | |

`T7` is recorded as `PASS (backend) / n/a (UI)`: the backend leg passed, the UI leg is **not**
counted as a pass. The qualifier is preserved in `qualifier` in the artifact.

### Probe tally

| Class | Count |
|---|---|
| 2xx | 5 |
| 4xx | 18 |
| 5xx | 11 |
| skipped | 1 |
| **Total** | **35** |

---

## 2. Environment — and therefore what could not be tested

| Component | Status in this sandbox | Consequence |
|---|---|---|
| Node backend | runnable, **in-process HTTP only** | route wiring provable; persistence only in-memory |
| MariaDB | **absent** (`ECONNREFUSED 127.0.0.1:3306`) | every DB-backed leg BLOCKED |
| Browser (Playwright/Chromium) | **absent** | every `-UI` case BLOCKED; **browser E2E = 0** |
| Firebase identity | **no credentials** (`app/invalid-credential`) | MFA disable BLOCKED |
| Razorpay / PayPal | **no sandbox keys** | provider settlement unprovable (checkout *rejection* is provable and passed) |
| Messaging module | cannot enable: `POST /api/admin/settings/public_config` → **400** | messaging BLOCKED |

**A passing HTTP response is not browser-level correctness.** Nothing in this manifest upgrades a
blocked browser claim on the strength of an HTTP 200.

---

## 3. The 23 test cases

Each row's full command, expected result, evidence to capture and status detail is in the artifact
(`testCases[]`); prerequisites are in §5. Summary:

| ID | Claim tested | Area | Kind | Status |
|---|---|---|---|---|
| `T2` | contact backend validation | B1 | integration | **BLOCKED** |
| `T2-UI` | contact form submits | B1 | browser e2e | **BLOCKED** |
| `T3` | queue telemetry + fallbacks | D2 | integration | **PASS** |
| `T3-UI` | queue console shows fabricated SES trace | D2 | browser e2e | **BLOCKED** |
| `T4` | CMS published slug | B2 | integration | **PASS** |
| `T4b` | CMS unknown slug | B2 | integration | **PASS** |
| `T4c` | CMS unpublished visibility | B2 | integration | **NOT APPLICABLE** |
| `T4-UI` | CMS renderer fetches published pages | B2 | browser e2e | **BLOCKED** |
| `T5` | blog reader routes | B3 | integration | **PASS** |
| `T5-UI` | blog reader empty state | B3 | browser e2e | **BLOCKED** |
| `T6` | profile persistence | A1, A2 | integration | **FAIL** |
| `T7` | billing console backend | A3 | integration | **PASS** (backend only) |
| `T7-UI` | billing console availability | A3 | browser e2e | **BLOCKED** |
| `T8` | TOTP enrolment exists? | A4 | integration | **PASS** (it does not) |
| `T8b` | factor disable | A4 | integration | **BLOCKED** |
| `T9` | team membership | C1 | integration | **BLOCKED** |
| `T10` | employer messaging persistence | C3 | integration | **BLOCKED** |
| `T11` | admin financial authz | D1 | integration | **PASS** |
| `T14` | checkout rejection path | A3 | integration | **PASS** |
| `T15` | interview voice | D5 | browser e2e | **BLOCKED** |
| `T16` | blog / cover-letter editors | D3, D4 | browser e2e | **BLOCKED** |
| `T17` | marketing interactivity | B4 | browser e2e | **BLOCKED** |
| `C2` | SIEM export | C2 | integration | **NOT APPLICABLE** |

`T6` is the only FAIL and it is a real product-path failure: `POST /api/users-data/profile`
`{expectedRevision: 0}` → **409 `STALE_WRITE`** while `GET` → **404 `PROFILE_NOT_FOUND`**. A create
at revision 0 conflicts with a profile the read path says does not exist.

`T4c` is **NOT APPLICABLE to the product**: the public route returned unpublished content because
`InMemoryRepository.getCustomPageBySlug` ignores its query options, while
`MySQLRepository` correctly applies `AND published = 1`. Recorded as a test-double defect.

`C2` is **NOT APPLICABLE**: the SIEM-export claim was falsified at source, so there is nothing to
execute.

---

## 4. The 11 alleged client URL contract defects, one test each

Each is a false-success site: the client posts to a URL, swallows the failure and renders success.
The test is *"does the client's exact URL fail, and does the client suppress the success state?"*.
**All 11 are BLOCKED**: no probe in the recorded set addresses any of these exact URLs, so none can
be upgraded without a browser session.

| Test | Client path | Contract classification | Sites | Status |
|---|---|---|---|---|
| `RT-C-01` | `/blog/posts/{X}` | AMBIGUOUS | 3 | **BLOCKED** |
| `RT-C-02` | `/platform/operational-status/refresh` | not in gap set (resolves or unresolved) | 1 | **BLOCKED** |
| `RT-C-03` | `/admin/employer-applications/{X}/verify` | AMBIGUOUS | 2 | **BLOCKED** |
| `RT-C-04` | `/admin/jobs/{X}/moderate` | NO_OPERATION | 1 | **BLOCKED** |
| `RT-C-05` | `/admin/operations/backup` | NO_OPERATION | 1 | **BLOCKED** |
| `RT-C-06` | `/admin/operations/cache-clear` | NO_OPERATION | 1 | **BLOCKED** |
| `RT-C-07` | `/admin/queues/dead-letter-queue/purge` | ANOTHER_CONTRACT | 2 | **BLOCKED** |
| `RT-C-08` | `/admin/users/{X}/status` | AMBIGUOUS | 1 | **BLOCKED** |
| `RT-C-09` | `/platform/role-view-audit` | not in gap set | 1 | **BLOCKED** |
| `RT-C-10` | `/admin/users/{X}/revoke-sessions` | not in gap set | 1 | **BLOCKED** |
| `RT-C-11` | `/admin/users` | not in gap set | 1 | **BLOCKED** |

Per test, the manifest records: unique id, prerequisites, exact request (method + URL + the identity
the client uses), expected result (a 4xx the client does **not** swallow, and no success state), the
evidence to capture (response status + body for the client's exact URL, plus a DOM/screenshot proof
that the success state is suppressed), environment, and status with its basis.

**Note on the four "not in gap set" paths.** They are false-success sites whose URL either resolves
to a registered operation or was left unresolved by the contract revalidation; they are not among
the 15 gap shapes. Their defect is therefore *swallowing*, not *wrong URL*, and a runtime test must
prove the suppression rather than the 404.

---

## 5. Exact local instructions to unblock, per prerequisite

1. **MariaDB.** Start a disposable server on `127.0.0.1:3306`, create an empty schema, run the
   repository's migrations **there only**, point `DB_HOST/DB_USER/DB_PASSWORD/DB_NAME` at it, then
   re-run `RT-T T6, T7, T8b, T11` persistence legs. Synthetic data only.
2. **Browser.** `npx playwright install chromium`, start backend + frontend dev server, sign in with
   a synthetic admin identity, then execute every `-UI` case and all 11 `RT-C` cases. Capture
   screenshot + DOM before/after each submit.
3. **Firebase.** Supply emulator or sandbox identity credentials to unblock `T8b`; do **not** use
   production credentials.
4. **Payment providers.** Sandbox keys only, **no real charge**. `T14` already proves the server
   rejects invalid plans/identities, so provider settlement is the only missing leg.
5. **Messaging.** `T10` needs `public_config.modules.enableMessagesModule = true`; the settings route
   rejects that payload in this build (`400 Unsupported settings category or payload`), so this is
   currently a **product-side blocker**, not an environment gap.

## 6. What this manifest refuses to do

- It does not convert a probe into a pass.
- It does not convert a backend pass into a UI pass (`T7` keeps its qualifier).
- It does not count BLOCKED or NOT APPLICABLE as pass: the pass count is 8 of 23, and 14 of 23
  claims remain untested or inapplicable.
- It does not invent a result for any of the 11 contract defects.
- **Browser E2E coverage remains 0 of 12 browser-level claims.**
