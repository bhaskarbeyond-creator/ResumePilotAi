# P002 · C6 — Resume Builder: truthful AI, save, export and guidance; skills storage contract

Parent commit `14b1b0443b8abef9d8b56c2af9242bfab4e45601` (C5). Candidate Dashboard scope. One
backend change: a tolerant read in the Word export for skills stored by the earlier builder (§2.3),
with a new backend test.

**Verdict: done, except AI success output.** Every path in this commit was exercised against the
real backend and database. Successful AI output still can't be shown here: the sandbox has no AI
provider, so `generate-content` answers with its documented `aiUnavailable` fallback, and the tests
assert that path as received.

## 1. What the candidate saw before C6

Seed: `res_audit_seed_1` (sandbox only; deterministic score 64). Evidence:
`docs/ui-audit/screenshots/resume-builder/before/` against `…/after/`.

| # | Sev. | Defect (before) |
|---|---|---|
| 1 | P0 | **Job Match tab was fabricated.** "ATS Profile Alignment **84%**" and "Strong match with … criteria" for every resume. "Matched Keywords" was a fixed list (React, TypeScript, Node.js, REST APIs, Cloud Architecture, Testing) shown as matched whatever the resume said. "Recommended In-Demand Keywords" (Docker, Kubernetes, GraphQL, …) was the same for every role, and one click wrote each into the candidate's skills. The target role defaulted to an invented "Senior Software Engineer" |
| 2 | P0 | **"+ Metric Sample" wrote an invented achievement into the candidate's job description:** "• Led cross-functional initiatives resulting in 25% efficiency gain." |
| 3 | P1 | **Skills were stored in a shape no other reader understands.** The builder saved `skills` as `{ category, skills: [...] }` groups. The Word export, the resume templates (`templateUtils`), the ATS scorer, the job-application skill match, the employer drawer and the enterprise PDF all read one item per skill (`name`/`skillName`). As a result, a builder-saved resume **exported to Word with no skills** and was **scored as having no skills** on Overview, ATS Score, Resumes and the builder itself |
| 4 | P1 | **List entries without an `id`** (certifications, achievements, projects, languages, references, custom sections and their items, e.g. from the legacy builder or an import) were matched by `entry.id === undefined`. Editing one changed all of them, deleting one deleted all of them, and React logged duplicate-key errors |
| 5 | P1 | "Polish" called the non-existent `/api/generate-suggestions` and always reported success |
| 6 | P1 | "Generate with AI" (summary) called the retired `/api/generate-summary` (HTTP 410) and failed silently |
| 7 | P1 | The header and footer always said "Saved", even for unsaved edits or a resume that was never saved |
| 8 | P1 | The DOCX export was sent without the session token. Export, share and PDF fell back to a placeholder resume id (`res-alex-001`) when the resume was not saved, and used `alert()` |
| 9 | P1 | The header badge showed a heuristic "ATS: 80/100 · ATS Optimized" while every other page showed the deterministic 64 |
| 10 | P2 | The right rail was branded "AI Career Assistant" with a pulsing "Live" badge (and "Active" when collapsed), but it makes **no AI or network calls**. "Auto Fill with AI" was a Master Profile import (no AI). "AI Suggest" on the Skills step had **no click handler**. The "Tips" tab was named "AI Suggestions" |
| 11 | P2 | Progress said "6 of 13" next to "50%": the percentage divided by 12 (Finalize can never be complete) and the label by 13 |
| 12 | P2 | Accessibility: axe found 11 rule violations across the 13 steps at 1366 px. Icon-only buttons had no name (delete, move, duplicate, remove skill). Month inputs had no label. There were three contrast failures, plus label-in-name failures on the two mobile triggers. The collapsed panel was a `div role="button"` that ignored Enter and Space. Collapsing or expanding the panel dropped focus to the page. All 33 visible field labels were unassociated (screen readers announced placeholders such as "e.g. San Francisco, CA") |
| 13 | P3 | The breadcrumb always said "New Resume", because the shell read `useParams().resumeId` under a splat route where it never exists |
| 14 | P3 | Copy promised "zero hallucinations"; `handleAddKeyword` mutated React state in place; "Duplicate" used an undo icon |

## 2. Fixes

### 2.1 AI, save and export (`pages/dashboard/resume-builder.tsx`)
- **Summary suggestion:** calls `runContentOperation('generate-summary', …)` with the resume's own name, title and work history. It shows a suggestion box ("Use this summary" / "Dismiss") and never overwrites the summary on its own. Clarifying questions, the unavailable state and errors are announced in a status region.
- **Polish:** the fake action is removed.
- **Save state:** truthful, computed by comparing snapshots: "Not saved yet", "Unsaved changes" or "Saved". A `beforeunload` guard warns while edits are unsaved.
- **DOCX:** uses `apiClient` (Bearer token, blob). Export, share and PDF require a saved resume and show a notice otherwise. Errors use the server's message. All `res-alex-001` fallbacks and `alert()` calls are removed.
- **Header badge:** `resumeQualityScore(serializeToBackend(resume))`, the same deterministic score as the other pages, with the DIR-008 label.

### 2.2 Guidance panel and progress
- **Panel:** renamed "Resume guidance". The "Live" and "Active" badges and the AI icons are removed. The tabs are "Writing tips" and "Job description match".
- **Job description match:** paste a job description and the panel compares it with `scoreResume(serializeToBackend(resume), { jobDescription })`, the scorer the ATS Score page uses. It shows the match percentage, "X of Y keywords …", the keywords found and the keywords missing. Adding a missing keyword is an explicit button ("Add Kubernetes to skills", with "Add only the skills you really have."). It creates an unsaved edit and never saves on its own. Nothing is sent anywhere.
- **Collapse and expand:** the collapsed bar is a real `<button aria-expanded>`. Focus moves to the replacement control after collapse, expand, hide and show.
- **"+ Metric Sample"** and the dead **"AI Suggest"** are removed. **"Auto Fill with AI"** is now "Fill from profile" (same Master Profile import, with a loading state).
- **Progress:** counts the 12 completable sections: "N of 12", "N/12", and a percentage over 12.
- **Breadcrumb** (`components/layout/cuba-app-shell.tsx`, shared): "Edit Resume" for a saved resume and "New Resume" otherwise, derived from the path. Every candidate page uses this shell; the full suite in §3 is its regression.

### 2.3 Skills storage contract
- **Builder save:** writes the shape every reader already expects: one `{ name, category }` item per skill. The category keeps the builder's grouping, which the template view model already groups by. A category with no skills has nothing to store.
- **Builder load** (`groupStoredSkills`): reads plain strings, flat items and the earlier `{ category, skills }` groups.
- **Rows saved before C6** stay readable. The same expansion was added to:
  - `lib/resume-score.ts` (scorer adapter);
  - `lib/resume-view-model.ts` and `cv-templates/templateUtils.ts` (templates);
  - `backend/services/docxExport.js` `normalizeResume` (Word export).
- **Backend test** `backend/test/docx-skill-groups.test.js`: written first and run against the unchanged export. It failed 2 of 4 (grouped and JSON-string shapes lost every skill). After the fix: 4 of 4. With the existing DOCX and export suites: 45 / 45.

### 2.4 List entries
- `withEntryIds` gives every certification, achievement, project, language, reference, custom section and item a unique, deterministic id when it has none, or repeats one.
- It maps common legacy names: `name` → project or achievement `title`; `name`/`level` → language `language`/`proficiency`; `title` → certification `name`; `title` → `sectionTitle`.

### 2.5 Accessibility
- All 33 visible field labels are associated with their controls (`aria-label`, with `aria-required` where the label shows "*"). The Radix proficiency select is named on its trigger.
- Every icon-only button is named after its entry, e.g. "Delete ISTQB Advanced", "Move QA Engineer up", "Remove Playwright".
- Contrast: Optional badge and Add Photo text fixed; "Download PDF" and "Save & Finish" moved to emerald-700.
- The mobile triggers keep their visible text in the accessible name.

## 3. Tests

`frontend/tests/candidate/resume-builder.spec.ts`: 11 tests × 5 profiles, all against the real
backend and database.

| Test | What it proves |
|---|---|
| Summary suggestion | Exact `generate-content` request body; the unavailable answer shows its message, no suggestion, and the summary is unchanged; no "Polish" or "AI recommendations refreshed"; axe clean |
| Thin content | The server's clarifying questions are listed; nothing is written |
| Save state | "Saved" → edit → "Unsaved changes" → Ctrl+S → `POST` 200 → "Saved"; reload keeps the edit; the header score equals `calculateAtsScore(stored row)`; breadcrumb "Edit Resume" |
| New resume | "Not saved yet"; breadcrumb "New Resume"; share and Word export ask for a save, and no export request is sent; no placeholder id |
| DOCX export | The request carries `Authorization: Bearer …` and the resume id; the download is a ZIP container (`PK`); a 402 path is handled if the plan blocks export |
| Job description match | No number before a job description is pasted, and no 84%. The score, "X of Y" text, found list and missing list equal an independent `calculateAtsScore(stored row, { jobDescription })`. "Add …" moves the keyword to found, shows "Unsaved changes", sends no save and leaves the stored row unchanged |
| Guidance panel | Collapse, expand, hide and show by keyboard (Enter and Space), with focus on the replacement control; no "Live" or "Active" badge; no "AI Career Assistant" |
| Progress, no invented content | "N of 12" with a matching percentage (or "N/12" on small screens); "Fill from profile"; no "Metric Sample", no "25% efficiency gain" and no "AI Suggest" |
| Skills storage contract | A row in the earlier grouped shape loads its categories. Saving stores exactly `[{name, category}, …]`, and the scorer's skills section is now above 0. Reload keeps the categories. The downloaded Word file lists every skill (`word/document.xml`) |
| Entries without ids | Editing one of two id-less certifications leaves the other; deleting one keeps the other; a `{ name, level }` language shows "English" |
| Axe on every step | All 13 steps: no WCAG 2.1 A/AA violations and no console errors at every profile |

**Full candidate regression**, all five specs at all five profiles: **212 / 212 passed** (14.7 min). The run covers auth session, cover letters, AI assistant, ATS scoring and the resume builder, and it includes the shell change. Per-test results are in `docs/test-reports/P002-C6-resume-builder-playwright.json`.

The run before it found 179 / 182. Three failures:

- Builder at 390 and 320: label-in-name on both mobile triggers (fixed in the product).
- Cover letters at 320: axe read a 150 ms colour transition mid-way. The test now waits for animations to settle; the settled colours pass at all five profiles.

The failing focused tests were re-run three times each at 390 and 320 (14 / 14).

## 4. Gates

| Gate | Result |
|---|---|
| `npx tsc -b` | 0 errors |
| `npm run build` | Exit 0, 16.9 s wall (Vite 1.66 s); only the pre-existing chunk advisory; entry chunk 670.71 kB (C5: 670.50 kB) |
| `npx oxlint` | 341 warnings, 0 errors (unchanged from C5). The warning set of `resume-builder.tsx` is identical to the pre-C6 file |
| Endpoint contract | 6 unmatched (C5: 7). The builder's `generate-suggestions` call is gone; the remaining six are the portfolio `/api/api/...` calls. Output: `docs/test-reports/P002-C6-endpoint-contract.json`. The checker matches paths, not payloads; for example, it cannot see that the Interview Coach posts `generate-content` without an `operation` (next surface) |
| Backend DOCX and export | `docx-skill-groups` (new) + `docx-export` + `docx-parity` + `export-pipeline` + `export-tokens-authority`: 45 / 45 |
| Backend `npm test` (fresh database per tree) | Each tree got a brand-new, empty bridge data directory and its own bridge. `main` (`98f3449`): 934 tests, 897 pass, 37 fail. This branch: **938 tests, 901 pass, 37 fail**. The failure sets are identical at every nesting level; the four extra tests are `docx-skill-groups`, all passing. The 37 failures are pre-existing (AI governance and tenant harness, the MariaDB 11.4 integration and migration gate on the sandbox engine, and state cascades). Reusing one database across runs is not comparable: consecutive runs of this branch gave 31 and 54 failures, and the four files behind the first run's "new" names pass in isolation on both trees (37 / 37 each) |
| Root static suite (`tests/*.test.mjs`) | This branch: 3,954 tests, 3,894 pass, 51 fail. `main`: 3,947, 3,887, 51. The failing names are identical: 51 top-level and 55 nested lines, none on only one side. The failures in tests that read files changed here have identical diagnostics after normalising the checkout path. Secret scan: 13 findings against 14 on `main`, nothing added; `frontend/src/pages/auth/login.tsx: hardcoded password` is gone since C2. Both trees were run with `--test-force-exit --test-timeout=120000` (see §5) |
| Axe sweep | 13 steps × 5 profiles: 0 violations (before: 11 at 1366) |
| Screenshots | `docs/ui-audit/screenshots/resume-builder/{before,after}/`: summary step and new resume at 5 profiles, 10 / 10 clean each. The "before" set was captured from a temporary detached worktree of C5 (`14b1b04`), served on `127.0.0.1:4001` with its own Vite cache; `capture-report.json` records that origin |

## 5. Test environment notes

- **Backend:** restarted once, to load the DOCX change. The same documented sandbox environment was used: `GLOBAL_RATE_LIMIT_MAX=20000 GENERAL_API_MINUTE_LIMIT=5000 AI_BURST_LIMIT=60 AUTH_RATE_LIMIT_MAX=200 AI_BASIC_DAILY_LIMIT=1000`. Code and production defaults are unchanged.
- **Capture script:** `scripts/audit/capture-candidate-screens.mjs` now accepts `E2E_STORAGE_STATE`, because saved sign-in state is scoped to one origin. It was needed for the "before" capture on :4001.
- **Root static suite:** one file (`tests/autocomplete-typing-suggestions-10-10.test.mjs`) never exits in this sandbox. It calls the backend AI runtime, which keeps the event loop alive. Comparison runs therefore use `--test-force-exit --test-timeout=120000` on both trees.

## 6. Remaining

- **AI success output** (summary suggestion text) is environment-blocked: there is no provider.
- **Skills "AI Suggest"** is removed rather than wired. The real skills operation is available in the AI Assistant (C4); builder integration is P3.
- **Job description keyword extraction** can join neighbouring capitalised terms across a comma (e.g. "TypeScript Kubernetes"). This is the shared scorer, so ATS Score behaves the same (P3, recorded).
- **Shell:** the optional `onPreview`/`onDownload` action block in `cuba-app-shell.tsx` has no consumer, so it never renders (P3, recorded).
- **Builder-created entries** still use the builder's field names (`title`, `language`, `proficiency`). Whether every downstream reader maps them was not re-audited in C6.
- **Next surface:** Interview Coach (C7). Its `generate-content` calls have no `operation`, so they always get a 400. Feedback and session scores are canned ("all answers are correct", fixed strengths). CBT questions repeat to fill the count. The "Live Face-to-Face" studio is a static mock: no camera, microphone or speech code, a hard-coded question and fake captions.
