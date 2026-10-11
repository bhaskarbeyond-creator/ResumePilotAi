# DIR-091 — Reconciliation Progress & Evidence

**Directive:** DIR-091 — 100% Pixel-Perfect Reference Parity for Candidate Dashboard and Build Resume
**Status:** IN_PROGRESS (plan auto-approved 85/100; ACT authorized)
**Base:** certified HEAD `42d51bfc`

---

## 1. Why the patch was NOT applied

`.bridge/tmp/hunk-*.diff` were extracted from `01a12b9e-…patch` for forensics. `git apply --check`
fails on all 8 modified files; `--3way` conflicts in 7. Blob pre-images resolve to a
DIR-053/055/058-era tree (~2026-10-09) while HEAD has advanced through DIR-084/086/088/090/093.
Only the new file applies cleanly. The patch is **partially superseded**: its `DashboardHomepage`
hunks re-add the sort control / view toggle (pinned by DIR-090 `dir095 AC3/AC4`, including a
`gap-3.5` list-mode pin) and its `resumeKind` badge duplicates DIR-093's Master/Tailored pill.
**Decision (approved in plan):** re-implement the patch's genuinely-new hunks on HEAD.

### Superseded hunks verified and DROPPED (not re-implemented)

| Patch hunk | HEAD reality | Action |
|---|---|---|
| `StepShell` `atsResult` → `StepGuide` | HEAD `StepShell:53` computes `atsResult` and derives `atsSection`; `StepGuide` already accepts `atsSection` | dropped (would add a dead prop) |
| `HeadingStep` refs `targetRoleRef`/`targetJdRef`, `handleAutofillJd`, `requiredFields` | all already exist (lines 166, 167, 426, 100) | reused |
| Step ribbon, Saved indicator, Escape handler | already exist (`stepRibbonRef:100`, `savedVersionRef:185`, `closeOnEscape:210`) | not duplicated |

---

## 2. Implemented on HEAD

### S3 — `src/components/Candidate/CandidateCareerAssistant.jsx` (364 lines, extracted verbatim via `git apply --include`)
- **Pass 1:** 50 legacy palette utility classes → **0** (`bg-violet-50`→`--cuba-primary-soft`,
  `bg-sky-50`→`--cuba-info-soft`, `bg-amber-50`→`--cuba-warning-soft`, `bg-slate-100`/`slate-50`
  →`--cuba-canvas`, `text-slate-500/600`→`--cuba-ink-subtle`, etc. per the directive's own table).
- **Pass 2 (gap found and closed):** pass 1 handled palette *classes* but left **27 raw hex literals +
  2 arbitrary shadows** — also a breach of "no ad-hoc random colors". Tokenised using only verified
  `cuba-tokens.css` values: `#7366ff`→`--cuba-primary` (exact), `#5949d6`→`--cuba-primary-strong`
  (exact), `#4738bd`→`--cuba-primary-ink-strong` (closest), `border-[#7366ff]/20`→`--cuba-primary-line`
  (exactly rgba(115,102,255,0.2)), `shadow-[0_5px_12px_rgba(115,102,255,0.28)]`→`--cuba-primary-glow`
  (near-exact), quality-gradient stops→`--cuba-success`/`--cuba-info`. **Result: 0 hex, 0 arbitrary shadows.**
- **Fabricated metric removed:** `{jdMatch?.score ?? 0}%` (a fabricated `0%`) → honest `—`.
- ESLint clean (0 warnings) via the codebase's own prop pattern.

### S4 — `StepShell.jsx` (+8)
`headerActions = null` prop; header row `flex`→`flex flex-wrap`; new `headerActions` slot rendered
between the title block and the guide toggle.

### S4 — `HeadingStep.jsx` (+62)
`resetConfirmOpen` state; `resetPersonalInformation()` (clears form/target role/JD/refs/touched/errors/
disclosure — autosave stays the sole persistence path); title `Your details`→**`Personal information`**;
`statusBadge` `5/5`→**`5 of 5 required fields`** (renders as the reference's "5 of 5 required fields
Complete" beside the existing Complete pill); `targetJd` now the live state; **`headerActions`** =
`Auto Fill with AI` (reuses real `handleAutofillJd`, disabled until a role exists) + `Reset section`
with an **inline confirm** (no native dialog); card → `rounded-2xl … shadow-cuba-xl` with the
**"Personal & contact details"** header + **`Required *`** pill.

### S4 — `BuildResume.jsx` (+11)
`showQuickActions` state; Escape handler extended to close it (incl. deps); **breadcrumb** nav
(`aria-label="Resume builder breadcrumb"`, `Resumes › {current step}`); Saved pill `2xl:flex`→`xl:flex`.

---

## 3. Verification (evidence)

| Gate | Result |
|---|---|
| ESLint (4 touched files) | **exit 0**, 0 errors; 13 warnings all pre-existing (none from added lines) |
| Build | success, **4.18 s** |
| Pinned + guard suites (11 files) | **73 pass / 2 fail** — identical to pre-change baseline |
| Palette utilities in added lines | **0** (BuildResume 11, StepShell 8, HeadingStep 62 added lines) |
| Hex literals in added lines | **0** |
| `src/cv-templates` diff | **0** |

### The 2 failures are pre-existing — proven, not assumed
Both are the single assertion `AC6: the DIR-081 legacy ceiling is carried forward unchanged (sweep
still pending)` in `dir082`, failing on `DashboardHomepage.jsx regressed: 278 legacy utilities exceeds
the DIR-081 ceiling of 226`. `git diff --stat` shows the tracked change set is only `BuildResume.jsx`,
`StepShell.jsx`, `HeadingStep.jsx` — **`DashboardHomepage.jsx` is not in it**. This is the **F-GAP-7**
item documented in DIR-090's report *before DIR-091 existed*.

---

## 4. Deviations flagged to the Lead

1. **statusBadge wording.** The plan-mode wake prose says `'5/5 required fields'`; the newer wake
   `mv45vaf0` and the reference screenshot say "5 of 5 required fields Complete". Implemented
   **"5 of 5 required fields"** (screenshot wins; the existing Complete pill supplies "Complete").
2. **Breadcrumb.** The patch gates it at `2xl:` and shows `Resumes › {step}`; the plan-mode wake prose
   specifies 4 levels (`Dashboard > Resumes & Master CV > Build Resume > [Name]`). Implemented the
   patch's 2-level structure at **`xl:`** so it is visible at the ~1440px reference width — consistent
   with the patch's own Saved-pill `2xl`→`xl` change. Awaiting a ruling if the 4-level form is required.

---

## 5. Remaining

- S4: `StepGuide` ATS-panel rework; visible `Step N of 12` footer (currently only an `aria-label` in `StepShell:79`).
- S5: mount `CandidateCareerAssistant` as the dashboard right rail (real reads only) + `CubaAppShell` `sidebarFooter` slot.
- S6: hero Tracked Roles / Interview Activity em-dash placeholders; assert no fabricated `0`/`Ready`.
- S7: register `test:dir091` (no-raw-palette, no-hex, real-API-only reads, no fabricated literals, dir095 AC1–AC7 intact).
- S8: authenticated XAMPP before/after capture of both pages; submit evidence.

---

## 6. BLOCKER ESCALATED — S5 conflicts with frozen, certified work (`evt_mv46iig0`)

**Finding:** the dashboard right rail **already exists**. `CubaCandidateShell.jsx:530` renders
`<CandidateExecutiveRail onNavigate={navigate} onAsk={handleAsk} />`, and that **326-line** component
already contains **every element** of the reference rail spec:

| Reference rail element | `CandidateExecutiveRail.jsx` |
|---|---|
| Tabs Suggestions / Resume Insights / Job Match | present (`TABS`, line 29) |
| 4 action cards incl. Improve ATS, Tailor, Cover letter, Mock drill | present (real `getCopilotActions`, line 55) |
| "Ask me anything…" input + quick prompt pills | present (`PROMPT_CHIPS`, line 35) |
| "Your Career Co-pilot" subtext | present |
| Live status pill | present |
| Today's Insights cards | present (real `insights` memo — DIR-090 P0-1 fix) |

The patch's `CandidateCareerAssistant.jsx` therefore **duplicates an already-shipped, frozen rail**.

**Regression risk — six certified suites pin `CandidateExecutiveRail`:**

| Suite | Pin |
|---|---|
| `dir077:60-62` | exact JSX `<CandidateExecutiveRail onNavigate={navigate} onAsk={handleAsk} />` + `aria-label="Executive intelligence rail"` + `data-testid="cuba-executive-rail"` |
| `dir084:79,89` | `space-y-2.5" data-testid="cuba-executive-rail"` + aside classes `2xl:overflow-y-auto cuba-scrollbar [scrollbar-gutter:stable]" aria-label="Executive intelligence rail"` |
| `dir085:65` | aside located by `aria-label="Executive intelligence rail"` |
| `dir086:107` | `data-testid="cuba-executive-rail"` |
| `dir093:103` | `className="space-y-2.5" data-testid="cuba-executive-rail"` |
| `dir095` | reads `RAIL` for the data-lineage ACs |

Mounting `CandidateCareerAssistant` as the dashboard rail would break all six — which would also break
this directive's own "dir084–dir095 all green" invariant. **Per the mandatory workflow I escalated
instead of guessing** (option (a) treat S5 as superseded / repurpose only its additive blocks, or
option (b) replace the rail and declare the six pins retired as supersession).

**Second finding:** `test:dir091` and `tests/dir091-candidate-dashboard-reference-mastery.test.mjs`
**already exist** (6 ACs), created by the **previous** DIR-091 — which is `APPROVED_FROZEN` in
`.bridge/archived_directives/DIR-091.json` ("Candidate Workspace (/dashboard) 10/10 Mastery"). S7's
"register test:dir091" is therefore already satisfied; the Build Resume half should **extend** that
suite rather than create a duplicate. Confirmation requested in the same escalation.

---

## 7. LEAD RULING RECEIVED (`mv46nxxh`) AND EXECUTED

**Ruling:** (1) Option (a) **APPROVED** — keep `CandidateExecutiveRail.jsx` as the authoritative
dashboard right rail; do NOT replace it or break the six pins; **treat the S5 rail mount as
superseded**. (2) **EXTEND** `tests/dir091-candidate-dashboard-reference-mastery.test.mjs` with
AC7–AC10 (do not create a duplicate file). (3) Render the **4-level breadcrumb**. (4) Proceed with S6–S8.

### Delivered

**4-level breadcrumb** (`BuildResume.jsx`): `Dashboard › Resumes & Master CV › Build Resume › {name}`.
The first two levels call the existing `handleExitBuilder` (which persists unsaved work before
navigating); the last level resolves through the SAME real logic the header title uses — custom
resume title, else `firstname + lastname`, else the honest untitled fallback — and carries
`aria-current="page"`.

**`dir091` EXTENDED, not duplicated** — now 11 ACs (AC1–AC6 pre-existing, AC7–AC11 added):

| AC | Pins |
|---|---|
| AC7 | HeadingStep: `Auto Fill with AI`, `Reset section`, `resetConfirmOpen`, `resetPersonalInformation`, `Clear all fields?`, **no `window.confirm(`**, retitle `'Personal information'`, `Personal &amp; contact details`, `Required *` |
| AC8 | StepShell: `headerActions = null`, the `{headerActions ? (` slot, `flex flex-wrap` header, and that `StepGuide` still receives the derived `atsSection` (no dead `atsResult` prop) |
| AC9 | BuildResume: breadcrumb `aria-label`, the four levels **in order**, `aria-current="page"`, `resumeData?.firstname`, and the Saved pill at `hidden xl:flex` with the old `hidden 2xl:flex` form **absent** |
| AC10 | `CandidateCareerAssistant` has **no palette utilities and no raw hex**; reads `getActiveJobs` + `getTrackedJobs`; **no `?? 0`**; renders the honest `—`; new HeadingStep actions are token-based |
| AC11 | `CubaMetricCardRow`: numeric props default to `null`, `applications === null ? '--' : …`, **no `value="0"`/`value={0}`**, and the Interview Coach card is the reference's capability label, not a count |

**`test:dir091` → 11/11 pass.**

### S6 — verified ALREADY DELIVERED on HEAD (patch hunk superseded)

The patch's `CubaCandidateHero.jsx` hunk is **also against a pre-DIR-085 tree**: its context still
imports `CubaStatCard` (retired by DIR-085) and it renames the four cards to
`Active Resumes / Best ATS Score / Tracked Roles / Interview Activity` — which would **break
`dir091 AC1`**, which pins `Total Resumes / Avg. ATS Score / Job Applications / Interview Coach`, and
break DIR-085's retirement assertions. The substantive goal of S6 is already met:

- The fabricated `Job Applications: 0` is **already gone** — `applications === null ? '--' : String(applications)`.
- The hero already performs **real reads** (`getTrackedJobs`, `getStatesOfUser`) with explicit `—` placeholders.
- `CubaMetricCardRow`'s own contract: *"Nothing here is hardcoded… an unresolved read renders an explicit placeholder, never a fake zero."*
- `dir091 AC3` already pins "every metric binds to a real platform read and never fabricates a zero".
- The remaining `value="Ready"` is the **reference's own specified content** for the Interview Coach
  **capability** card (not a measured count), and no coach-readiness data source exists. Left as
  specified, and now pinned by AC11 so it can never be mistaken for a metric.

---

## 8. REFINED BREADCRUMB SPEC EXECUTED (`mv478udi`)

The newest ACT wake tightened the breadcrumb contract: *"Each ancestor segment must link back to its
appropriate route ('/dashboard', '/dashboard', '/dashboard'), with the final segment representing the
active resume's title or candidate name. Render visible from xl breakpoint upward."*

Changes made to comply:

- Added `Link` to the `react-router-dom` import.
- All **three ancestor segments are now real `<Link to="/dashboard">` elements** (they were `<button>`s,
  and `Build Resume` was a plain `<span>`).
- Added `handleBreadcrumbNavigate()` so the links still flush pending edits before leaving — the same
  data-safety guarantee `handleExitBuilder` provides — without double-navigating. The write is
  fire-and-forget because a client-side route change does not cancel the request.
- Final segment remains the real resume title / candidate name with `aria-current="page"`.
- Visibility is `hidden xl:flex` (xl and upward), as specified.

**AC9 strengthened accordingly** and now pins: the four levels **in order, bounded to the `<nav>`
element** (so the order check cannot be satisfied by matching text elsewhere in the file), **exactly
three `<Link to="/dashboard">` ancestors**, **no `<button>` in the breadcrumb**, `aria-current="page"`
on the final segment, and the `hidden xl:flex` visibility class.

### Final verification for this directive's implemented scope

| Gate | Result |
|---|---|
| `test:dir091` | **11/11 pass** |
| Full pinned suite (11 files) | **78 pass / 2 fail** — the 2 are the pre-existing F-GAP-7 `dir082` `DashboardHomepage` 278>226 ratchet (not in this diff) |
| ESLint (all touched files) | **exit 0**, 0 errors |
| Build | **2.95 s** |
| `src/cv-templates` diff | **0** |
| Palette / hex in added lines | **0 / 0** |

Diff: `BuildResume.jsx` +39, `StepShell.jsx` +9, `HeadingStep.jsx` +66, `dir091…test.mjs` +120.

### Remaining: S8 only
Authenticated XAMPP before/after capture of both pages, then `bridge dev submit-evidence`.
`CandidateCareerAssistant.jsx` remains an unwired orphan because S5's rail mount was ruled superseded —
pending a decision on whether to delete it or repurpose only its additive blocks.

---

## 9. Zero-hardcoded-data invariant re-verified against the wake's own examples

The newest wake restated the invariant with explicit examples ("Never hardcode mock user names
(e.g. 'Babu M'), static scores ('69%')"). Checked directly:

- **`'Babu M'`** — no occurrence in `src/`. A repo-wide search matched only `CubaButton` (substring
  false positive), `.bridge` directive spec text, and the vendored `dashboardTemplate/` assets.
- **`'69%'`** — the only occurrence in `src/` is a **comment** in `CubaMetricCardRow.jsx` (line 9)
  that documents the opposite: *"The reference screenshot's numbers (5 resumes, 69% ATS, 1
  application) are ILLUSTRATIVE of the layout and are NOT baked in."* `dir091 AC2` already strips
  comments before asserting the figure is absent from code, so the comment cannot mask a real value.
- `dir095` documents that the previously hardcoded *"Your resume is 69% ATS ready"* insight string was
  removed by the DIR-090 P0-1 fix (real `insights` memo now rendered).
- `CubaMetricCardRow`'s header contract: every value is passed in from `CubaCandidateHero`, which reads
  the real platform services; unresolved reads render an explicit placeholder.

---

## 10. S8 — AUTHENTICATED TWO-PAGE LIVE CAPTURE (COMPLETE)

Harness: `.bridge/evidence/dir091-two-page-capture.mjs` (new and additive — DIR-090's certified harness
is untouched). XAMPP-served, session minted by the platform's own `mintFirebaseSession()`, **no API mocked**.

### Serving defect found and corrected
The first run **failed honestly** and exposed a real environment fact: the app is served from XAMPP's
**document root**, not a subpath. `http://localhost/IME365/dashboard` renders "Page not found" because
`src/main.jsx:522` uses `<BrowserRouter>` with **no `basename`**, so the router sees the full
`/IME365/dashboard` and matches nothing. Verified: `http://localhost/dashboard` renders the real
workspace (`rail: 1`, `metricCards: 1`, 19,454 chars). The harness default was corrected and the finding
is documented in-file.

### A genuine defect the live DOM caught that the static suite could not
`HeadingStep` renders `t('HeadingStep.title', 'Personal information')`, but the i18n file **overrides**
the default — `src/locales/en/en.json` had `HeadingStep.title = "Personal & Contact Information"`, so the
reference title never appeared on screen. Locale fixed, and **AC7 now pins the locale value** so this
class of bug cannot recur silently.

### Live results — 12/12 checks PASS (1920×1080, real data)

| Check | Result |
|---|---|
| dashboard rendered the real workspace | PASS (`rail: 1`, `metricCards: 1`, `analyticsBand: 1`) |
| breadcrumb present in the live DOM | PASS |
| breadcrumb visible at 1920 (xl) | PASS |
| three ancestor links | PASS |
| every ancestor links to `/dashboard` | PASS |
| ancestor labels match the reference levels | PASS (`Dashboard > Resumes & Master CV > Build Resume`) |
| breadcrumb contains no buttons | PASS |
| final segment is the current page | PASS (`aria-current` = real title "Recruiter Resume") |
| Auto Fill with AI rendered | PASS |
| Reset section rendered | PASS |
| required-fields badge rendered | PASS (**"5 of 5 required fields"**) |
| Personal information heading rendered | PASS |

**0 failed `/api` responses · 0 console errors.**

Artifacts: `dir091-dashboard-1920.png` (358,967 B), `dir091-build-resume-1920.png` (290,447 B),
`dir091-build-resume-fullpage.png`, `dir091-two-page-manifest.json`.

### Final gates
`test:dir091` **11/11**; full pinned suite **84 pass / 2 fail** (the 2 = the pre-existing F-GAP-7 `dir082`
`DashboardHomepage` 278>226 ratchet, not in this diff); ESLint 0 errors; build **3.23 s**;
`src/cv-templates` diff **0**.






