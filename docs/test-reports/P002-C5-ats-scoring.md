# P002 · C5 — ATS scoring: Overview (P0), ATS Score (P1), Resumes scores (P2)

Parent commit `e1a624e15bca17ab4e74270184feb37a3a91d40e` (C4). Candidate Dashboard scope only; no
backend change.

**Verdict: done.** The scoring path is fully deterministic and local, so everything is verifiable
in this sandbox. Nothing here is blocked by the environment.

## 1. Root cause

`calculateAtsScore` (`frontend/src/lib/atsScore.js`) returns `totalScore`, `qualityScore`,
`sections`, `status`, `strengths`, `improvements` and `jdMatch`, and it reads the flat resume row the
API stores (`firstname`, `summary`, `skills[]`, `employments[]`, `educations[]` …). Two wrong
assumptions broke every consumer:

1. `lib/atsScore.d.ts` declared `score`, `categories`, `keywords` and `actionItems`, which the
   scorer never returns, so TypeScript accepted reads of fields that are always undefined.
2. Callers scored `row.data`, but resume rows have **no `data` column** (verified: the saved row
   returned by `POST /api/resumes/:id` has no `data` key).

| Page | What the candidate saw for a resume whose real score is 64 |
|---|---|
| Overview | "Your top resume scores **85%** ATS — recruiter benchmark ready" and "Avg. ATS score 85% · Recruiter ready". `.score` is always undefined, so the code fell into `setTopAtsScore(85) // Standard baseline` for **every** candidate with a resume |
| ATS Score | Every resume listed as "Untitled Resume" (it read `name`; rows have `title`). An empty object was scored, then rendered as `undefined%`, "JD Match: undefined%", "Readiness: 0%", with no breakdown. A placeholder "Candidate" resume was scored when the account had none |
| Resumes | Every card "ATS: —" / unscored, because only `row.data` was scored |

Evidence: `docs/ui-audit/screenshots/ats-scoring/before/` against `…/after/`, using the audit seed
resume `res_audit_seed_1` (sandbox only; deterministic score 64, "Needs Improvement").

## 2. Fixes

- **`lib/atsScore.d.ts`** now describes the real return shape. Every broken read on the ATS Score
  page became a compile error, and the page was rebuilt against the real fields.
- **`lib/resume-score.ts`** (new): `resumeScoreInput`, `scoreResume`, `resumeQualityScore`. These
  score the stored row (still accepting older nested `data` drafts) and return `null`, never a
  substitute number, when nothing can be read.
- **Overview** (`overview.tsx`):
  - Average score from `computeResumeMetrics` with the same scorer as the Resumes page; the best
    score drives the headline; the primary resume shows its own score, not someone else's "top".
  - DIR-008 thresholds (80 ready / 60 developing) replace the ad-hoc 75 "Recruiter ready".
  - "Profile status" showed an invented **60%** when incomplete; `/api/user-stats` only provides
    `profileComplete`, so it now reads Complete / Incomplete.
  - The plan badge said "**Executive Candidate Plan**" for everyone; it now shows the real
    membership from `/api/users-data/profile` (account A: "Basic plan"), hidden if unknown.
  - The internal template id (`Cv1`) is replaced by the catalog name; "51+ templates" corrected to
    the catalog's 100; the primary resume's "ATS Score" button passes `?resume=<id>`.
- **ATS Score** (`ats-score.tsx`) rebuilt natively:
  - `?resume=<id>` selection in the URL. An unknown id (for example another account's) falls back
    to the candidate's own most recent resume with a notice, and no request is made for it.
  - Real titles; labelled controls (`select`, job description).
  - Nothing is scored until the stored row has loaded; a load failure shows the error with Retry.
  - Results: total score, scorer status, job-description match (only when supplied), covered and
    missing terms, next steps, strengths, section breakdown with findings. Focus moves to the
    results heading.
- **Resumes** (`resumes.tsx`): scores via the adapter, so cards show real "ATS: N/100" badges.
- **WCAG contrast:** axe found serious colour-contrast failures on Overview and Resumes (labels in
  `emerald-600` 3.77:1, `amber-600` 3.19:1, 80%-opacity labels, `ink-subtle` timestamps, faded
  completed steps). They now use Cuba tokens `success-700` (5.48:1), `warning-700` (5.02:1) and
  `ink-muted`. 0 violations at all five profiles.

## 3. Tests

`frontend/tests/candidate/ats-scoring.spec.ts`, 6 tests × 5 profiles. Expected values are computed
with the scorer on the **rows the API stored**, so the UI is checked against persisted data. Each
test also asserts the old wrong values are absent (`85%`, `60%`, `undefined`, unscored badges, the
fixed plan text).

| Test | Proves |
|---|---|
| overview | Average and best from all stored resumes; primary resume's own score; DIR-008 label; real profile flag (no %); real plan; no internal template id; `?resume=` link; axe 0; no overflow |
| ATS Score | `?resume=` preselects; exact total, status, section count and first improvement; no `undefined`; job description match % and term counts; refresh keeps selection; switching resume updates the URL and clears results; focus on results |
| load failure (FAULT INJECTION) | Aborted `GET /api/resumes/:id` → error with Retry, button disabled, no score; Retry → real score |
| Resumes | Card shows `ATS: N/100` for the stored row; no unscored badges; axe 0 |
| accessibility | axe 0 on ATS Score before and after results |
| account B | "Not scored" and "Create your first resume" on Overview; ATS Score empty state; `?resume=<A's id>` makes **no** request for it; API `GET` → 404 |

Results:

- Full four-spec regression (ats-scoring, ai-assistant, cover-letters, auth-session):
  **156 / 157**. The one failure was a real axe colour-contrast defect on Overview at 1920 px (the
  activity timestamps only render there with this data). It was fixed, then the spec re-ran
  **32 / 32**.
- An attempted interim re-run could not sign in. The backend's hourly auth limiter (20 per IP) had
  been exhausted by repeated runs from one loopback IP, and the login form correctly showed "Too
  many sensitive requests…". See §5.
- Per-test results: `docs/test-reports/P002-C5-ats-scoring-playwright.json`.

## 4. Gates

| Gate | Result |
|---|---|
| `npx tsc -b` | 0 errors (with the corrected declarations) |
| `npm run build` | Exit 0, 16 s wall (Vite 1.46 s); only the pre-existing chunk advisory; entry chunk 670.50 kB; shared scorer chunk 29.2 kB |
| `npx oxlint` | 341 warnings, 0 errors (C4: 346). One warning in a changed file is pre-existing (`resumes.tsx:1052`, unused `role`) and left untouched |
| Endpoint contract | 7 unmatched (unchanged; these defects were field and shape errors, not paths) |
| Screenshots | `docs/ui-audit/screenshots/ats-scoring/{before,after}/`: Overview, Resumes and ATS Score (after a real check) at 5 profiles; after: 15 / 15 clean |

## 5. Test environment notes

Added for this run: `AUTH_RATE_LIMIT_MAX=200` on the sandbox backend (default 20 sign-ins per hour
per IP), because every suite run signs both accounts in through the real form from one loopback IP.
Sign-in itself is unchanged: real form, real token verification. Full local backend environment:
`GLOBAL_RATE_LIMIT_MAX=20000 GENERAL_API_MINUTE_LIMIT=5000 AI_BURST_LIMIT=60
AUTH_RATE_LIMIT_MAX=200`. Code and production defaults are unchanged.

## 6. Remaining

- Overview still loads five endpoints sequentially (OV-2 sign-out race, P3).
- The scorer's own status bands (85 / 70 / 45, shown on ATS Score) differ from the dashboard's
  DIR-008 buckets (80 / 60, used on Overview and Resumes). Both are existing product contracts;
  recorded, not changed.
- Resume Builder AI paths are next (C6): a fake "Polish" success message and a summary call to a
  retired endpoint.
