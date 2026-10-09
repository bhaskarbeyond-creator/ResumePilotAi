# DIR-059 — Implementation Evidence

**Directive:** DIR-059 — Job Applications (/dashboard/applied-jobs) Real Data
Pipeline, Kanban Synchronization & Candidate Withdrawal (P1). Plan approved by
the Lead; ACT authorised.

---

## 1. IDENTIFY → PROVE (four proven defects)

**1. The page rendered the wrong entity.** `src/services/api/platform.js:956`
`getUserJobApplications(userId)` was literally `return getTrackedJobs(userId)` —
it returned KANBAN tracker rows, so `/dashboard/applied-jobs` never showed the
`applications` table at all.

**2. Every row rendered blank (data-shape gap).** The `applications` table has
`id, job_id, employer_id, applicant_id, …, status, revision, created_at,
updated_at` — **no `jobTitle`, `company`, `location` or `salary`** (those live on
`jobs` via `job_id`), and `repository.getApplications()` does a bare
`SELECT * FROM applications` with **no join**. `AppliedJobs.jsx:55-63` read
`job.jobTitle` / `job.company` / `job.location` / `job.appliedDate` — all
`undefined` — so rows rendered empty and search/sort by company and date were
inert.

**3. Status vocabulary mismatch.** The table defaults `status` to **`PENDING`**
(uppercase) while `AppliedJobs.jsx:118/212` counted `job.status === 'pending'`
(lowercase) — the tile could **never** match.

**4. No withdrawal and no Kanban promotion existed.**

**Backend was already complete and owner-scoped** (`backend/routes/jobsData.js`):
`GET /applications/list` (:277, `applicantId` from `req.user.uid`),
`DELETE /applications/:id` (:319, 404 missing / 403 not owner),
`PATCH /applications/:id` (:300), tracker routes (:179/186/213). No new backend
route was needed.

## 2. RCA → FIX

| Step | Change |
|---|---|
| S1 | `getUserJobApplications` now reads `GET /api/jobs-data/applications/list`; added `withdrawJobApplication()` → `DELETE /api/jobs-data/applications/:id` |
| S2 | `normaliseApplication()` builds the view model and each row is **enriched** with its job record via `getJobById(job_id)`; `appliedDate` from `created_at` |
| S2b | `APPLICATION_STATUS_MAP` canonicalises the stored vocabulary (`PENDING` → `applied`, `shortlisted` → `interview`, `accepted`/`hired` → `offer`, …); the tile now counts `'applied'` and reads "Under Review" |
| S3 | **Withdrawal** behind the shared Cuba confirm dialog (`useConfirmDialog` → `EnterpriseConfirmModal`), with **optimistic removal + rollback** and a real toast |
| S4 | **1-click Track in Kanban** via `createTrackedJob(..., { status: 'applied' })`, **idempotent** (an already-tracked application opens the tracker instead of duplicating) |

No native `window.confirm` is used anywhere.

## 3. RECHECK → EVIDENCE

| Gate | Command | Result |
|---|---|---|
| New suite | `node --test tests/dir059-applied-jobs.test.mjs` | **7/7 pass** |
| Job regression | `dir059 + job-tracker + job-module-audit-complete + job-portal-dashboard-integration + job-card-premium-ux` | **33/33 pass** |
| Full product matrix | `npm run test:product` | **756 pass, 0 fail** |
| Lint | `eslint` on every changed file | **0 errors** (2 pre-existing warnings in `platform.js`, untouched) |
| Build | `npm run build` | **exit 0, 2.41s** |

Changed files: `src/services/api/platform.js`,
`src/components/AppliedJobs/AppliedJobs.jsx`,
`tests/dir059-applied-jobs.test.mjs`. **Zero backend/schema change** (the routes
already existed and are owner-scoped, so there is no RBAC change to make).

**One test caught a false positive during development:** the
`no window.confirm` assertion initially matched my own explanatory *comment*; the
assertion now strips comments before checking code.

## 4. Honest limitations

- Job enrichment is one `getJobById` call per application (bounded by the
  candidate's application count). If a job record has been deleted the row still
  renders honestly with a "Job" fallback title and blank company rather than
  failing the whole list. A single joined backend projection would be more
  efficient and is a reasonable follow-up.
- The Kanban "already tracked" set is seeded from `getTrackedJobs()` and matched
  by tracker row id; the tracker's row ids are not the application ids, so a
  freshly promoted application is marked in-session. Cross-session de-duplication
  would need a shared key (e.g. `jobId`) — noted, not claimed.
- No DOM crawl was run for this directive; verification is unit + static +
  the full product matrix.
