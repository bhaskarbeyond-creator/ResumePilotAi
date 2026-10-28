# Frontend Component/Route Inventory

**Discovery method:** `find frontend/src -maxdepth 2 -type d`, `find src -maxdepth 2 -type
d` (legacy root tree), file-extension counts via
`find . -type f | sed 's/.*\.//' | sort | uniq -c`.

## 1. Active frontend (`frontend/`, TypeScript)

Top-level `frontend/src/` directories confirmed to exist:
`app`, `assets`, `components`, `cv-templates`, `hooks`, `lib`, `pages`, `providers`.

Test infrastructure confirmed:
- `frontend/playwright.config.ts` and `frontend/playwright.candidate.config.ts` (two
  distinct Playwright configurations — general suite vs. a "candidate" suite, i.e. likely
  the job-seeker/candidate-facing flows specifically)
- `frontend/tests/` containing a `candidate/` subdirectory, an
  `engine-responsive.spec.ts-snapshots` directory (implying an existing visual-regression
  baseline for responsive layouts already exists in the repository — this is a verified
  positive finding, not something this audit created), and a `harness/` subdirectory
- 21 `*.spec.ts` files counted under `frontend/tests` (`find frontend/tests -type f -name
  "*.spec.ts" | wc -l`)

**Page/route file count:** `find frontend/src/pages -maxdepth 2 -type f` returned 34
files. `find frontend/src -iname "*.tsx" | xargs grep -l "Route\b"` returned 11 files
referencing a `Route` symbol (consistent with React Router or a similar routing library;
the specific router library was not identified by name in this session — `DEFERRED`).

**Not inventoried in this session (DEFERRED):** Individual component names/counts under
`frontend/src/components/` (directory was not even listed), state-management mechanism
identification, and a component-by-component UI/UX pass — see `UI-UX-AUDIT.md` and
`UNVERIFIED-SUSPICIONS.md` UVS-004.

## 2. Legacy/parallel root frontend (`src/`, JavaScript/JSX) — see DISC-001

Top-level root `src/` directories confirmed to exist (abbreviated list; full list is in
this audit's raw tool output and `DISCREPANCY-LOG.md` DISC-001):
`assets` (with 13 sub-folders including `Landing Page images`, `backupresumes`,
`countries`, `coversNew`, `cv10-assets` … `cv7-assets`, `dashboard`, `favicons`, `logo`,
`paiment` *(sic — misspelled)*, `payment` *(both spellings present — see note below)*,
`portfolioPreview`, `resumesNew`), `components` (34 named subdirectories, e.g.
`AppliedJobs`, `BuildResume`, `Candidate`, `CoverLetter`, `Dashboard`, `Dashboard2`,
`EmployerPortal`, `JobsListings`, `PortfolioBuilder`, `PublicPortfolio`, `admin`, `auth`,
`cuba`), `cv-templates` (51 numbered template folders `cv1`…`cv51` plus `cover1`…`cover4`
and a `shared` folder), `engine/hybrid`, `enterprise/components`, `locales` (18 language
folders: de, dk, en, es, fr, gk, hi, is, it, nl, no, pl, pt, ro, ru, se), `models`,
`services/{api,jobs,seo}`, `styles`, `utils`.

**Notable sub-finding (not separately escalated — recorded here for completeness):** Root
`src/assets/` contains **both** `paiment/` (misspelled) and `payment/` (correctly
spelled) directories side by side. Given DISC-001 already establishes this entire tree is
not part of the active build, this is not independently escalated to the discrepancy log,
but is recorded here as corroborating evidence that the root tree accumulated
inconsistencies over time without active maintenance — consistent with DISC-001's
root-cause narrative.

**`Dashboard` and `Dashboard2` both present** under root `src/components/` — consistent
with DISC-001's narrative of an in-progress, never-completed rewrite/migration (a "v2"
component folder was started alongside the original and neither was ever removed).

## 3. Repository-wide file-extension counts (both trees combined, excludes `node_modules`/`.git`)

| Extension | Count |
|---|---:|
| `.js` | 1,159 |
| `.jsx` | 519 |
| `.png` | 309 |
| `.JPG` | 243 |
| `.mjs` | 222 |
| `.tsx` | 152 |
| `.css` | 152 |
| `.scss` | 120 |
| `.sql` | 95 |
| `.md` | 87 |
| `.ts` | 84 |
| `.woff2` | 72 |
| `.cjs` | 65 |
| `.map` | 51 |
| `.json` | 46 |
| `.ttf` | 40 |
| `.jpg` | 27 |
| `.sh` | 17 |
| `.php` | 10 |
| `.jsonl` | 9 |

**Interpretation caveat:** These counts are **not** split by active-vs-legacy tree in this
session (that would require re-running the count scoped separately to `frontend/src` vs.
root `src/`). The large `.jsx` (519) count relative to `.tsx` (152) is at least partly
attributable to the legacy root tree (DISC-001) but this was not precisely apportioned —
`DEFERRED`.

## Negative-findings statement

**What was searched:** Directory structure two levels deep, file extension census,
Playwright config/test file presence.
**What this does NOT establish:** Actual component implementation quality, state-handling
completeness, accessibility, or responsive behavior of any individual
screen/component — all `DEFERRED` to `UI-UX-AUDIT.md`'s explicitly scoped-down treatment
of this dimension.
