# Senior / Principal Forensic Review — Projects UX + Skills Pagination

- **Baseline:** `559dc0a`
- **Junior implementation:** `585d0e1` → `d1cfb1c`
- **Reviewer fixes:** `ed189d4` (on `arena/01a01500-resumepilotai`, pushed)
- **Date:** 2026-08-18

> Scope note: this review independently reproduced the data paths at three levels —
> (1) `smartPartitioner` unit level, (2) server-side DOM render of `SmartResumeComposer`
> (the exact tree the browser/PDF/Print consume), and (3) the backend DOCX OOXML pipeline.
> The Playwright browser matrix (`test:templates:browser` and the template-lab probes)
> **could not be executed in this sandbox** — the environment cannot download the Chromium
> binary (network blocks the Playwright CDN and OS package repos). That gap is called out
> explicitly in §C/§D and is the reason the verdict is not a blind 🟢.

---

## A. PROJECTS UX

### Current implementation
`ProjectsStep.jsx` is wired into `BuildResume.jsx` as wizard step **id 7**, route `projects`,
registered in the same `steps[]` array as its siblings and sorted by `DEFAULT_SECTION_ORDER`,
so it lands **between Skills and Languages** — matching the section order the rendering engine
uses (`summary → employment → education → skills → projects → …`). The step mirrors the
Work History / Education / Skills card UX: dashed "Add Project" button, expand/collapse cards,
accent strip, green complete indicator, move/duplicate/delete actions, 500 ms autosave, and
auto-expand of a lone card.

### UX quality (assessed from the code + the shared step pattern, not a live click-through)
- **Placement / discoverability:** natural. It appears in the sidebar nav and the
  desktop/mobile progress dots, in logical render order.
- **Consistency:** visually and behaviourally consistent with the other card steps.
- **Responsive:** `grid-cols-1 sm:grid-cols-2`, `truncate`, `min-w-0` — designed for small screens.
- **Accessibility:** action buttons carry `aria-label`s. The expandable card *header* is a
  clickable `<div>` without a tab/Enter handler — a shared pattern across all sibling steps
  (pre-existing, not introduced here), flagged as a minor non-blocking item.
- **Autosave / Back / Next / refresh:** autosave pushes `projects` into the parent after 500 ms
  (identical to siblings). `handleNext`/`handlePrevious` persist before navigating. After the
  debounce window + the parent save the project survives refresh/reopen (persistence path is
  `normalizeResumeData` → canonical snapshot → Firestore + recovery envelope).
- **Validation:** a project is "complete" on a non-empty title; nothing blocks saving a partial
  record, which is the correct behaviour for this product.

### Data lifecycle (reproduced without a browser)
| Case | Result |
|---|---|
| 1 project (title only) | preserved, 1 card |
| title + description | preserved |
| title + URL | preserved, URL rendered as link |
| description only | preserved (renders with an empty title line — cosmetic) |
| 3 / 10 projects | all rendered in order |
| completely empty project | suppressed in render (`filterMeaningfulProjects`) |
| empty + real mixed | empty suppressed, real kept |
| reopen / edit / preview | `normalizeResumeData` passes `projects` through verbatim; DOCX and PDF both emit it |

### Issues (found → fixed in `ed189d4`)
1. **Data-model mismatch — `role`, `begin`, `end`, `current` were collected but never rendered.**
   `SmartProjects` renders only `title/name`, `url`, `description`; `docxExport.buildProjectsBlock`
   renders the same three. The wizard's "Your Role" / "Start Date" / "End Date" fields were
   therefore silently dropped in the final resume, PDF, and DOCX.
   **Fix:** removed the dead fields; the step now collects exactly what the engine renders
   (`title`, `url`, `description`). This eliminates the mismatch without touching the certified
   51-template visual system.
2. **Step never tracked completion.** Every sibling step pushes/removes its `completedSteps` id;
   Projects pushed nothing, so it could never show the green check and the progress denominator
   grew by one with no compensating counter.
   **Fix:** ProjectsStep now marks/unmarks step **7** on the same "≥1 valid record" contract as
   Work History / Education / Skills.
3. **Wizard content was untranslated.** Only `BuildResume.steps.projects` existed in the locales;
   all `ProjectsStep.*` strings fell back to the English JSX defaults in every non-English locale.
   **Fix:** added the full `ProjectsStep.*` block (13 keys) to all 16 locales.

### RCA
The junior scaffolded the step from the Work-History pattern but (a) copied fields the resume
renderer never supported, (b) stopped short of the completion-tracking and (c) translated only
the navigation label — three independent omissions, none affecting data safety but all degrading
the "production-grade" claim.

### Score: **8.5/10** (after fixes). Solid, consistent, data-safe; docked for the pre-existing
card-header keyboard focus pattern and the systemic <500 ms autosave race on immediate Next
(see note below).

> **Pre-existing, out of scope:** every card step (Work History, Education, Skills, Projects)
> debounces autosave by 500 ms and cancels the pending timer on unmount; clicking **Next** within
> 500 ms of the last keystroke can drop that keystroke. This is a cross-step, pre-existing
> behaviour and was left untouched per "do not rewrite working code."

---

## B. SKILLS

### Pagination algorithm
`smartPartitioner.js` now splits main-flow skills into **height-aware chunks** (cap
`SKILLS_CHUNK_CAP = PN_CAPACITY − 30 = 900 px`), growing each chunk with the same
`skillsHeightFor(chunk, false)` estimator the sidebar uses. The greedy multi-page packer then
distributes the chunks. `SmartFlowRenderer` flattens chunks that land on a page and titles the
first block `Key Skills`, subsequent blocks `Key Skills (Continued)`.

### Estimator ↔ reality consistency (code audit)
- **Skill name length:** accounted (`charsPerLine` 26 sidebar / 46 main; rating variants wrap at
  26/60). Long names are *over*-estimated, which is the safe direction.
- **DOTS/BARS row height:** explicitly modelled (`15×lines + 9` dots, `15×lines + 13` bars ≈
  24/28 px per row vs ~22/27 px real) — over-estimate, safe.
- **Section heading:** `+26 px` per block; chunk cap subtracts 30 px — consistent.
- **Density:** skills render at a fixed 10 px font in the CSS, so they are density-independent;
  the inter-section gap is density-aware via `SECTION_GAP_PX` (11/14/18) and the packer charges it.
- **Capacities:** `P1_CAPACITY` 900 (815 banner/tech-grid), `PN_CAPACITY` 930 against an A4 sheet
  of 1123 px minus continuation header/footer/padding (~98–193 px headroom) — internally coherent.

### Independent stress matrix (reproduced, 51 templates × 5/10/20/30/40/50/75/100 skills)
| n | Integrity across 51 templates |
|---|---|
| 5, 10, 20, 30, 40, 50, 75, 100 | **entered = rendered, missing = 0, duplicates = 0, order unchanged** |

Also run across all five variants (**pills / badges / inline / dots / bars**) ×
minimal-ats / compact-euro / modern-split: **no loss, no duplication, no reorder**, and no chunk
`estHeight` exceeded the 900 px cap. Server-side DOM render of the actual composer confirmed the
DOM emits **exactly** 50/75/100 skills for **all 51 templates** (this is the tree PDF/Print rasterize).

Chunking behaviour on the two targets (single-column DOTS):
```
Cv41/Cv44 (dots, 24 px/skill):
  n=30 → 1 page   (746 px fits P1)
  n=40 → 36+4     n=50 → 36+14    n=75 → 36+36+3    n=100 → 36+36+28
```

### 51-template results
All 51 templates render; no archetype drift; no invalid output; no lost/duplicated/reordered
skills. Baseline clipped a 50-skill dots resume (~1200 px atomic block vs 930 px capacity) under
`overflow:hidden`; the new code paginates it correctly.

### Missing / Duplicates / Clipping
**Missing = 0, Duplicates = 0** across every matrix cell. **Clipping:** no clip path identified —
the estimator is consistently conservative (over-estimates), and each chunk is bounded by the
capacity of the page it lands on.

### Visual regressions
None introduced. `SmartSkills`/`SmartProjects` and `smartEngine.css` are untouched. The only
renderer change is the flattening + `(Continued)` title, which is content-preserving.

### Minor, non-blocking observations
1. `SKILLS_CHUNK_CAP` is derived from `PN_CAPACITY` (930), not `P1_CAPACITY` (815). For a
   banner/tech-grid resume whose *only* content is a large overflow-skills set, the first chunk
   (≤900) could be placed on the page-1 815 px budget. Harmless (the sheet is 1123 px and the
   budget already carries ~27 % headroom) but an internal inconsistency worth tidying later.
2. Greedy filling leaves a sparse tail in a few count/size combinations (e.g. 40 dots → a 4-skill
   final page). This is strictly better than the baseline (which clipped) and matches how
   experience/education items already paginate; a balanced split was deliberately **not**
   implemented (height-aware balancing adds complexity/risk for purely cosmetic gain).

### RCA
The original bug: skills were a single atomic flow item whose estimated height exceeded
`PN_CAPACITY`, so the packer could never place it and `overflow:hidden` silently cut the tail.
The junior's fix — chunk before packing, and move the capacity constants above first use to fix
the TDZ — is correct and robust. The TDZ claim is real: `P1_CAPACITY`/`PN_CAPACITY`/`SECTION_GAP_PX`
were declared *after* the section builder in the baseline, and the new chunking references them
*before* that point.

### Score: **9/10** (0.5 docked for observation #1, 0.5 for the sparse-tail cosmetic).

---

## C. REGRESSION

- **PDF:** the backend `/api/export` renders the real frontend export page through headless
  Chromium and calls `page.pdf()` on the exact `SmartResumeComposer` DOM. Because the DOM emits
  every entered skill/project (verified above), the PDF cannot silently drop them. Pipeline
  tests (33) pass. *(Live Chromium PDF generation not runnable in this sandbox.)*
- **Print:** same DOM, with print CSS; same guarantee.
- **DOCX:** independent Word pipeline — verified **100 skills + 10 projects** all present in the
  generated OOXML for Cv1/Cv41/Cv44/Cv17/Cv20; `role`/dates are correctly not rendered (now
  consistent with the wizard).
- **Templates:** 51/51 server-render + partitioner pass; `template-render` / `template-production-render`
  / `template-differentiation` / `template-empty-sections` / `template-quality-gate` all green.
- **Security / auth / subscription / dashboard:** **zero files touched** by the change set;
  `test:security` = 166 pass. No bypass, no model corruption, no colour/presentation leakage
  (G5 test still green).
- **Existing certified modules:** `smartPartitioner`/`SmartFlowRenderer` changes are additive and
  content-preserving; no unrelated module was modified.

---

## D. TEST INTEGRITY

### Actual commands and actual results (re-run independently)
| Command | Result |
|---|---|
| `npm run build` | ✅ 4.6–5.4 s |
| `npm run test:templates` | ✅ 72 / 72 (7 files, `node --test`) |
| `npm run test:product` | ✅ 194 + 1 + 8 = 203 / 203 |
| `npm run test:security` | ✅ 22 + 144 = 166 / 166 |
| backend `docx-export` + `docx-parity` + `export-pipeline` | ✅ 33 / 33 |
| `node --test tests/i18n.test.mjs` | ✅ 3 / 3 |
| `npm run lint` | ⚠️ 23 errors / 504 warnings — **all pre-existing**, none in the changed files |
| `npm run test:templates:browser` (`template-lab/gate.mjs`) | ❌ **could not run** — Chromium download blocked by sandbox network |

### Skipped / orphaned / false-positive risks
- **Orphaned tests:** `tests/export-e2e-real-browser.test.mjs` and `tests/run-e2e-browser.mjs`
  exist but are **not wired into any npm script** — they are dead unless invoked by hand.
- **False-positive risk (addressed):** `template-production-render.test.mjs` only stress-tests
  **32 skills** and asserts *partitioner counts*, not DOM pixel clipping; and `gate.mjs`/probes
  require a browser. The "51/51" confidence the junior implied therefore rests partly on a test
  that doesn't exercise 50/75/100-skill clipping. My independent matrix (5–100 skills × 51
  templates × 5 variants, plus server-side DOM counts) closes most of that gap.
- **Stale-selector history:** `gate.mjs` documents that it previously targeted retired
  `.resume-pages` markup and "could not fail"; it now targets `.smart-resume-page`. Correct, but
  it cannot be executed here to confirm the matrix end-to-end.
- **`npm run lint` red:** `tests/verify-all-55-templates.mjs` (`document` undefined) and other
  pre-existing files fail; none of the files in the junior's diff have lint errors.

---

## E. GIT

- **Baseline:** `559dc0a` (section-gap pagination fix — intact).
- **Junior commits:** `585d0e1` (ProjectsStep + skills chunking + en/hi locales), `d1cfb1c` (14
  more locales).
- **Reviewer commit:** `ed189d4` — localization of ProjectsStep content, field/rendering
  alignment, completion tracking. Pushed to `origin/arena/01a01500-resumepilotai`.
- **Changed files (559dc0a..HEAD):** 20 files, all scoped —
  `BuildResume.jsx`, `steps/ProjectsStep.jsx`, `components/SmartFlowRenderer.jsx`,
  `smartPartitioner.js`, and 16 `src/locales/*/*.json`.
- **Working tree:** clean. **Remote:** synchronized.
- **Confirmed:** no unrelated changes, no accidental deletions, no test weakening, no certified
  baseline modification, no security/auth/subscription changes, no data-model corruption
  (locale diffs are pure additions; the only "deletions" are the trailing commas the additions
  required).

---

## F. FINAL VERDICT

### 🟡 APPROVED WITH NON-BLOCKING ISSUES

**Blocking requirement before a full 🟢 production stamp:** run the browser matrix
(`npm run test:templates:browser` → `template-lab/gate.mjs`, plus `overflow-probe`, `print-probe`,
and `visual-regression`) in a CI runner that has Chromium. Every non-browser check I could
execute (partitioner, DOM server-render, DOCX OOXML, full unit/integration suites) passes, and the
estimator audit shows no clipping mechanism — but I will not claim the *actual browser experience*
is verified when the sandbox could not launch one.

**Non-blocking issues (none introduced data loss):**
1. `SKILLS_CHUNK_CAP` should ideally derive from `min(P1_CAPACITY, PN_CAPACITY)` (internal
   consistency; currently harmless).
2. Greedy chunking can leave a sparse final skills page in a few count/size combinations
   (cosmetic; strictly better than the baseline's clipping).
3. Pre-existing `completedSteps` off-by-one across the other steps (Summary→6, Languages→5,
   Finalize→5) — not introduced here, but it keeps the progress bar from being fully truthful.
4. Pre-existing `npm run lint` debt and card-header keyboard focus pattern — separate housekeeping.

**Score summary:** Projects UX 8.5 · Projects data integrity 10 · Skills pagination 9 ·
Skills visual quality 10 · PDF/Print/DOCX 9 (pipeline verified, live render pending browser) ·
51-template regression 10 · Localization 10 (after fix) · Testing 7 (browser gate unexecutable
here) · Architecture 9 · Production safety 9.

**Bottom line:** the objective — "Make Projects naturally usable and guarantee Skills are never
lost, while preserving the existing clean UX and all certified template designs" — is met on the
code/data level. The three genuine defects in the junior's work (unrendered Projects fields,
missing completion tracking, untranslated wizard) are fixed; the skills pagination change is
sound and was independently stress-tested. Ship it after the browser gate runs clean in CI.
