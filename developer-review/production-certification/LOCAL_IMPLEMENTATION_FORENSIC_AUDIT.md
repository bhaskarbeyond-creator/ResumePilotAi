# LOCAL IMPLEMENTATION FORENSIC AUDIT

**Gate:** G0 / Phase 1 — Independent audit of all local developer work
**Prepared by:** Remote Developer (independent takeover)
**Date (UTC):** 2026-10-30
**Baseline audited:** `025479b5899c82965295d8c9a359f83ef647980a`
**Evidence:** `developer-review/production-certification/evidence/`

---

## 1. Scope and method

This audit does not accept the local developer's completion classifications. It
re-executes the repository's own test runners, reads the implementation behind
each failing and suspicious result, and traces defects to their root cause
across the service, data-plane adapter and HTTP layers.

Classification scale used (per the directive):

* **A** Verified and accepted
* **B** Verified with minor corrections
* **C** Partially implemented
* **D** Defective or unsafe
* **E** Not implemented

---

## 2. Executed verification

| Check | Command | Result |
|---|---|---|
| Backend suite (baseline) | `npm --prefix backend test` | 1,716 tests — 1,527 pass / **176 fail** / 13 skip |
| Backend suite (after corrections) | `npm --prefix backend test` | 1,731 tests — **1,544 pass / 174 fail** / 13 skip |
| Enterprise suite (baseline) | `npm --prefix backend run test:enterprise` | 187 tests — 186 pass / **1 fail** |
| Enterprise suite (after corrections) | `npm --prefix backend run test:enterprise` | 187 tests — **187 pass / 0 fail**, exit 0 |
| Security suite | `npm run test:security` | pass, exit 0 |
| Frontend production build | `npm --prefix frontend run build` | pass, `tsc -b` + vite, 355 files synced |

Delta attributable to this audit: **+15 tests, +17 passes, −2 failures**, with
the failing set otherwise unchanged. No test was weakened, deleted or skipped to
obtain a green result; one stale assertion was corrected to the contract the
production code actually implements (§4.2, with justification).

---

## 3. FINDING FA-01 — Team lead capability was non-functional end to end

**Classification of the inherited implementation: D — Defective.**
**Modules affected: MOD-11 / MOD-13 (Enterprise tenant registry, team management).**

The handover classifies the enterprise modules as Tier 1 / "Strict Production
Working". The team-lead capability inside them did not work against the real
database adapter. This is a **false positive in the local matrix**, and it is the
exact failure mode the directive warns about: the API returned HTTP 200 while
doing nothing.

### 3.1 The defect chain (four independent breaks)

1. **Service dropped the lead on create.** `TenantService.createTeam`
   (`backend/enterprise/tenantService.js`) called
   `registry.createTeam({ tenantId, workspaceId, name })` — it never forwarded
   `input.leadPrincipalId`. The frontend sends it:
   `frontend/src/lib/enterprise-api.ts:453-457` posts
   `{ name, leadPrincipalId, workspaceId }`.
2. **MariaDB adapter could not persist a lead on create.**
   `MySqlTenantRegistry.createTeam` had no lead parameter and its `INSERT`
   omitted the `team_lead_uid` column added by migration 030.
3. **MariaDB adapter never exposed the lead on read.** `getTeam` returned
   `rows[0]` from `SELECT *` and `listTeams` returned raw rows, so responses
   carried the snake_case column `team_lead_uid` while both frontends render the
   camelCase contract field `leadPrincipalId`
   (`frontend/src/components/enterprise/EnterpriseTeamsTab.tsx:219`,
   `src/enterprise/components/EnterpriseTeamsTab.jsx:390-398`).
4. **The test double disagreed with the production contract.**
   `TenantService.updateTeam` hands the lead to the registry under the internal
   key `teamLeadUid` (the key `MySqlTenantRegistry` consumes), but
   `InMemoryTenantRegistry.updateTeam` destructured `leadPrincipalId` only. The
   double therefore silently discarded the lead — which is precisely why the
   HTTP-level expectation failed while the SQL-level tests passed.

**Net production effect:** an administrator could open the team editor, pick a
lead, receive a success response, and the lead was neither stored nor displayed.
The UI would always render "Unassigned".

### 3.2 Why the existing tests did not catch it

`backend/test/enterprise-team-lifecycle.test.js` exercises the MariaDB adapter
with a fake pool but asserts only on the generated SQL string:

```js
assert.match(updateCall.sql, /team_lead_uid = \?/);
assert.deepEqual(updateCall.params, ['Alpha renamed', '44444444-…', '2222…', '1111…']);
```

It never asserts that the value comes back out of the adapter. The one HTTP-level
test that did assert the response field
(`backend/enterprise-test/enterprise-completeness.test.js:107`, "team lead:
assignment, validation, and audit trail") was failing — and its failure was
reported as part of a large MariaDB-dependent failure population, which made it
look environmental rather than real. It was the **only** enterprise failure that
survived with no database connection present, which is what isolated it.

### 3.3 Corrections applied

| File | Change |
|---|---|
| `backend/enterprise/mysqlTenantRegistry.js` | Added `normalizeTeamRow()` mapping `team_lead_uid` → `leadPrincipalId`; applied in `getTeam` and `listTeams`. `createTeam` now accepts `teamLeadUid`, validates membership, binds the column in the `INSERT`, and returns the normalized team. Extracted `assertActiveTeamLead()` and reused it in `updateTeam` to remove duplicated validation. |
| `backend/enterprise/tenantService.js` | Added `resolveTeamLead()`; `createTeam` now forwards and validates the lead and records it in the `TEAM_CREATED` audit event. `updateTeam` reuses the same resolver. `TEAM_UPDATED` audit metadata now reads the normalized field. |
| `backend/test/helpers/inMemoryTenantRegistry.js` | `updateTeam` and `createTeam` now honour the production contract key `teamLeadUid` (while still accepting `leadPrincipalId` for direct callers) and accept `description`. The double can no longer diverge from the adapter. |

The raw `team_lead_uid` column remains present on returned rows, so any existing
consumer reading the column is unaffected.

### 3.4 Verification

New regression suite `backend/test/enterprise-team-lead-contract.test.js`
(**15 tests, all passing**) pins the contract at every layer:

* MariaDB adapter — `getTeam`/`listTeams` expose `leadPrincipalId`; `createTeam`
  binds the lead into the `INSERT` and returns it; non-member and inactive leads
  are rejected with 403; absent lead persists `NULL`.
* TenantService — the public `leadPrincipalId` field and the internal
  `teamLeadUid` alias both reach the data plane; an ineligible lead is rejected
  **before** any team is created; no lead passes `null`.
* HTTP — create returns the lead; patch assigns it; a re-read of the list still
  reports it (persistence, not echo); empty lead clears it; a lead-only patch
  preserves the team name.

Enterprise suite after correction: **187/187, exit 0** (was 186/187).

---

## 4. FINDING FA-02 — Two failing tests that need no database

`backend/test/support-blog-applications.test.js` failed 2 of 65 tests **on the
pristine baseline**. These are not environmental.

### 4.1 Verified as pre-existing, not introduced

To rule out self-infliction, the audit stashed all local changes and re-ran the
same file on the untouched baseline. It failed identically (63 pass / 2 fail),
then the changes were restored. The two failures are inherited.

### 4.2 FA-02a — Stale assertion against a refactored page

The test asserted `assert.match(tracker, /updateTrackedJob/)` and
`assert.match(tracker, /setJobs\(\(current\) => current\.map/)` against
`frontend/src/pages/dashboard/job-tracker.tsx`. Both patterns are absent.

Verification of the real current implementation:

* `updateTrackedJob` **still exists** at `frontend/src/lib/job-tracker.ts:239`,
  but is consumed by `frontend/src/components/job-tracker/tracker-form-dialog.tsx:88`
  — the page legitimately delegated form editing to that component.
* The page now drives stage moves through
  `moveTrackedJobStage(job, status, { write, rollback, remove })`
  (`job-tracker.tsx:111-115`) with `reconcileTrackedJob` and `rollbackTrackedJob`.

The assertion encoded a symbol location that moved during a valid refactor. The
test's *intent* — the page uses the real API modules and does not swallow
failures — is still satisfied and is now asserted directly against
`moveTrackedJobStage`, `reconcileTrackedJob` and `rollbackTrackedJob`. The
no-swallow assertions (`catch(() => undefined)`, `catch(() => null)`) and the
`could not be loaded` error-state assertion were retained unchanged.

**This is a correction of a stale expectation, not a weakening.** The replacement
asserts more of the failure-handling contract than the original did.

### 4.3 FA-02b — Swallowed rollback rejection

`backend/routes/jobsData.js:655` contained:

```js
await connection.rollback().catch(() => {});
```

This violates the repository's own hygiene contract, which asserts that the
assigned files (`routes/support.js`, `services/supportTickets.js`,
`routes/blogData.js`, `routes/jobsData.js`) contain no swallowed rejection. It
was the last such occurrence across those four files.

Corrected to log the failure while preserving best-effort semantics, so a
rollback failure still cannot mask the original write failure and the connection
is still returned to the pool by the `finally` block:

```js
await connection.rollback().catch(rollbackErr => {
  console.error('[Application evaluation rollback]', rollbackErr?.code || rollbackErr?.message || rollbackErr);
});
```

### 4.4 Verification

`backend/test/support-blog-applications.test.js` after both corrections:
**65 tests, 65 pass, 0 fail** (was 63/65).

---

## 5. Classification of the remaining 174 backend failures

The remaining failures are **not** assumed to be environmental; they were
classified by inspection.

* 149 of 168 leaf failures carry `ECONNREFUSED 127.0.0.1:3306` directly inside
  their TAP error block — a direct MariaDB connection refusal.
* 19 leaf failures do **not** carry that string in their own block and were
  therefore individually triaged. Representative examples:
  * `GET /api/jobs is mounted alongside /api/jobs-data` — asserts
    `[200, 304]`, observed **503**.
  * `POST /api/billing/validate-coupon is mounted alongside /api/coupons/validate`
    — asserts `[400, 404]`, observed **500**.

  In both cases the route *is* mounted (no 404) and the handler fails downstream
  because the database is unreachable. These are DB-derived, but the distinction
  matters: **route mounting is proven; handler behaviour is not.**
* No failure was observed that is explained by the code under audit rather than
  by the absent database, other than the two already corrected in §4.

**Honest limitation:** this classification is by inspection and pattern
analysis, not by re-running the suite against a live MariaDB. It cannot be
completed in this sandbox (§7 of `REMOTE_REPOSITORY_BASELINE.md`). The 174
failures must be re-executed against MariaDB 10.4 before any Tier 1 module
classification can be accepted.

---

## 6. Test-integrity observations

Issues in the inherited test estate that affect how much the 620/"green" claim
can be trusted:

1. **SQL-string assertions standing in for behaviour.** FA-01 survived because
   adapter tests asserted the generated SQL rather than the returned object. Any
   capability whose value is written but never read back is invisible to such
   tests.
2. **Test doubles that diverge from the adapter contract.** The in-memory
   registry keyed on a different parameter name than the MariaDB adapter. Where a
   double and the real adapter disagree, the double silently defines the
   contract. FA-01 is now locked down by tests that pin both.
3. **Stale assertions after refactors.** FA-02a shows the estate can drift from
   the implementation without anyone noticing, because the failure was buried in
   a large red suite.
4. **13 skipped tests** contradict the handover's "zero skips" claim and have not
   yet been individually justified.
5. **Dependency engine mismatch.** `@firebase/storage@0.14.6` requires
   Node ≥ 24.12.0; the toolchain is Node 22.22.3. Untriaged.

---

## 7. Items NOT yet verified — explicitly open

The following were **not** verified in this pass and must not be read as
accepted:

* Migration 001–044 execution against a real MariaDB, fresh install, upgrade
  path, and rollback scripts. Files are present; execution is unproven.
* All 42 module classifications. Only the team-lead capability was traced end to
  end; it alone overturned a Tier 1 classification.
* The 112-capability matrix and the 54 forensic findings. Both remain
  unreconciled against code.
* The eight reported Playwright workflows. Not executed; Playwright browsers are
  not installed in this sandbox.
* MOD-29 (WebRTC/SFU), MOD-12/21 (DNS/SSL), MOD-06 (Wasabi/S3 telemetry),
  MOD-39 (payment settlement). Each requires external infrastructure or
  credentials that are unreachable here.
* Security testing of live endpoints, tenant isolation under concurrency, and
  performance/load measurement.

---

## 8. G0 / Phase 1 summary

| Item | Count |
|---|---|
| Defects identified | 3 (FA-01, FA-02a, FA-02b) |
| Defects corrected and regression-tested | 3 |
| New regression tests added | 15 (all passing) |
| Existing tests corrected (stale expectation) | 1, with justification |
| Tests weakened or deleted | 0 |
| Enterprise suite | 186/187 → **187/187** |
| Backend suite failures | 176 → **174** |
| Baseline findings raised | 2 (RB-01, RB-02) |

**Headline conclusion:** the local developer's Tier 1 classification is not
reliable as handed over. A capability inside a Tier 1 module returned HTTP 200
while persisting nothing, and the test estate was structurally unable to detect
it. The reported test totals (620) and the reported commit history (11 commits)
are both unreproducible. The application-side corrections made here are verified;
the wider matrix requires a live MariaDB before it can be audited at all.
