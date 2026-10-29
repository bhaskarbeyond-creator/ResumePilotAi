# Regression-test specification — DISC-020 and DISC-021 (safe, no application changes)

**Mandate 5 (f):** validate DISC-019…DISC-022 with evidence, severity, confidence and closure criteria,
plus a **safe** regression-test spec for DISC-020 that changes no application code.
**Reference revision:** `cccd35a5`. **Spec file:** `developer-review/specs/disc-020-application-feedback.test.js`.

---

## 1. Why a spec and not a test in `backend/test/`

The audit is forbidden from modifying application source, dependencies or the existing test suite. Adding
a file to `backend/test/` *is* a repository change to the application's test suite, so the spec is written
outside the runner's glob (`backend/scripts/run-tests-with-annotations.js` enumerates `backend/test/*.test.js`)
and handed over for a reviewed change.

It is deliberately **not** a mock test. The defect only exists against MariaDB —
`InMemoryRepository.saveApplication` (`:529-534`) spreads the object and therefore "works", while
`MySQLRepository.saveApplication` (`:1600-1637`) writes a fixed list of 13 columns. A test that runs on
`InMemoryRepository` would be green and would prove nothing, which is precisely how this defect survived.

## 2. Status of DISC-019 … DISC-022 against the mandate's four attributes

| Finding | Severity | Confidence | Verification status | Closure criterion (met?) |
|---|---|---|---|---|
| **DISC-019** (OAuth provider breadth regressed from four integrations to one) | P2 | High | static; re-verified this pass — no client call site exists for `GET /auth/{github,linkedin}` or `/auth/oauth/exchange`; only Google is wired (`login.tsx:208-233`) | GitHub and LinkedIn sign-in work end-to-end from the UI certificate, or the providers are removed from the advertised list (not met) |
| **DISC-020** (feedback discarded; `revision` inert) | P2 — could be P1 for a hiring product | High | static code-path, re-verified this pass at `resilientMutations.js:303-345`, `MySQLRepository.js:1600-1637`, `InMemoryRepository.js:529-534`; empirical confirmation blocked (no DB) | cases 1 and 3 of the spec pass on MariaDB (not met) |
| **DISC-021** (applicant read not projected) | P3 today, P2 once DISC-020 is fixed | High | static; the two read paths compared | case 4 of the spec passes (not met) |
| **DISC-022** (Facebook provider constructed and advertised, unreachable) | P3 | High | static; `lib/firebase.ts:17,62`, `login.tsx:208-233` | either a sign-in path exists or the UI stops advertising the provider (not met) |

**Ordering dependency, restated:** DISC-021 is only latent *because* DISC-020 discards the value it would
leak. Fixing DISC-020 alone turns a dead field into a live disclosure. They ship together or not at all.

## 3. The four cases

| Case | What it asserts | Expected at `cccd35a5` | Why |
|---|---|---|---|
| 1 | feedback written through `updateApplicationStatus` survives a re-read | **FAIL (red)** | the payload uses `employerNotes`, the adapter maps `notes` from the pre-update record |
| 2 | the adapter does persist `notes` | **PASS (control)** | proves the harness reaches the real column, so case 1's failure is the mapping, not the fixture |
| 3 | a stale `expectedRevision` raises `APPLICATION_CHANGED` | **FAIL (red)** | `revision` is not in the column map; the CAS counter always reads 1 |
| 4 | an applicant's read omits `notes`, `rating`, `employerId` | **FAIL (red)** | `index.js:1728-1743` returns the row unprojected |

Case 2 exists to protect the audit from itself: if case 2 fails, the harness is wrong and no conclusion
about case 1 may be drawn.

## 4. How to run

```bash
# 1. disposable database — never a shared or production schema
mysql -uroot -e "CREATE DATABASE rp_test_disc20 CHARACTER SET utf8mb4"
mysql -uroot rp_test_disc20 < backend/migrations/001_baseline.sql   # migrations only here

# 2. run the spec (it refuses any schema not named rp_test_* / rp_disc20_*)
cd backend
MARIADB_TEST_URL='mysql://root@127.0.0.1:3306/rp_test_disc20' \
  node --test ../developer-review/specs/disc-020-application-feedback.test.js

# 3. remove the disposable schema
mysql -uroot -e "DROP DATABASE rp_test_disc20"
```

**Safety properties**

| Property | How it is enforced |
|---|---|
| no production access | the connection string comes from `MARIADB_TEST_URL`; the spec skips when unset |
| no accidental destructive run | a name gate rejects any schema not matching `rp_(test|disc20)_*`, asserted in the first test |
| no application or test-suite change | the file lives under `developer-review/specs/` and is not in any runner glob |
| no schema change | the spec reads/writes rows only; migrations run once into the disposable schema |
| no data exfiltration | only synthetic principals (`emp_spec`, `usr_spec`) and `.test` addresses (RFC 2606) |

## 5. What would make these tests go green

The fix is in application code, which this audit does not touch. Recorded for the maintainer, not applied:

1. `MySQLRepository.saveApplication` must persist the feedback (either map `employerNotes` onto `notes`,
   or add an `employer_notes` column and map it) and must map `revision` so the CAS clause can fail.
2. The applicant-scoped read must project columns, matching the owner-scoped serializer.

Until (1) and (2) land together, DISC-020 and DISC-021 stay open, and the applicant-facing rejection
message continues to arrive as a notification while the stored application never changes.
