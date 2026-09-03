# Build Resume — Rebuild Report (2026-09-03)

**Scope:** Full takeover of the Build Resume experience on branch `arena/01a065a2-resumepilotai`
from certified restore point `844bb44` (rollback target `e77da46`).
**Companion analysis:** `docs/BUILD_RESUME_REARCHITECTURE_PLAN_20260903.md` (deliverable #1).
**Result:** professional, minimal, AI-native builder — no fabricated content, deterministic ATS,
evidence-gated AI. Net source change: **−7,418 lines** (37 files, +3,397 / −10,815) plus 12 new modules.

---

## 1. Rebuild summary

| Area | Before | After |
|---|---|---|
| Step chrome | Card-soup: 4–7 stacked cards per step, quick-add command bar, role "track" banners, verb toolbars, fake "Popular" lists | One `StepShell` panel per step: header (number, title, purpose, live completion state) + body + single evidence-derived Guide rail |
| Component tree | 11 steps + 12 bespoke components (StepWorkspaceLayout, StepAtsCompanion, QuickAddCommandBar, AiDraftReviewModal, TrackGuidanceBanner, 2 suggestion modals, InputField, ProgressCard, SectionCard, Button, FinalizeStep) | 11 steps + 7 primitives (StepShell, StepGuide, EntryList, EntryHeader, EmptyState, Field, AiPromptCard) + 2 AI modules (aiContract, useAiAssist) |
| Lines in builder tree | ~18.5k | ~6.9k (shell 2,291 + steps 3,302 + components 842 + AI 351) |
| AI surface | 5 ad-hoc fetch paths, raw `generateUserAiContent` calls inside steps, modal review flows | One contract (`aiContract.js`) + one lifecycle hook (`useAiAssist.js`) + one inline surface (`AiPromptCard`), with ASK-before-INFER questions, per-suggestion confirm, and editable drafts with replace warnings |
| ATS display | "Command center" hero, hidden "Weight: X%" pills, invented readiness statistics | Engine findings only; 7-section readiness with real scores; JD matcher with honest MATCHED / PARTIAL / MISSING buckets; no weight-distribution UI |
| Crashes / unreachables | Overview modal ReferenceError (`getCandidateContext` not imported); blocking `window.prompt()`; mobile drawer close button trapped under the dashboard topbar (z-index:1 content-wrapper stacking context) | Fixed import; in-app custom-section dialog; overlays portaled to `<body>` at `z-[70]` |

### Files

- **Deleted (12):** `components/StepWorkspaceLayout.jsx`, `components/StepAtsCompanion.jsx`,
  `components/QuickAddCommandBar.jsx`, `components/AiDraftReviewModal.jsx`,
  `components/TrackGuidanceBanner.jsx`, `steps/components/WorkHistorySuggestionModal.jsx`,
  `steps/components/EducationSuggestionModal.jsx`, `steps/components/InputField.jsx`,
  `steps/components/ProgressCard.jsx`, `steps/components/SectionCard.jsx`,
  `steps/components/Button.jsx`, `steps/FinalizeStep.jsx`.
- **Added (12):** `components/{StepShell,StepGuide,EntryList,EntryHeader,EmptyState,Field,AiPromptCard}.jsx`,
  `ai/{aiContract,useAiAssist}.js`, plan + report docs, browser verification harness
  (`tests/build-resume-rearchitecture-browser.mjs`).
- **Rewritten (12 steps):** all 11 content steps now share StepShell + EntryList contracts;
  ReviewStep rebuilt around the ATS engine's own findings.
- **Shell (`BuildResume.jsx`):** crash fix, ATS computation hoisted out of a render-time IIFE,
  `window.prompt` replaced by a dialog, purple/emerald gradients removed, `updateResumeData`
  now passed to ReviewStep (JD persistence), calm neutral chrome.
- **Engine (`src/utils`):** `candidateContext.js` rebuilt as the evidence-based context
  (facts, mined vocabulary, gaps, region, target-role parse — no profession taxonomy);
  `dynamicPlaceholders.js` reduced to neutral instructional placeholders; `atsScore.js`
  extended with the PARTIAL JD-match bucket.

---

## 2. UX changes

**One panel of truth.** Every step renders a single bordered shell: step number, title,
one-line purpose, and a live *Complete / In progress* state computed from the candidate's
actual data. On large screens a single Guide rail shows (a) the deterministic gaps for that
section and (b) the ATS engine's own findings for it — no second "intelligence" companion,
no weight pills.

**Entries, not cards.** Multi-item sections (work history, education, projects,
certifications, achievements) use one `EntryList`: collapsible entries with a summary row
(title · org · dates) and expand-to-edit body. New entries expand automatically. No
per-card action matrices.

**One primary action per empty section.** Empty states are a purpose sentence + one primary
button (+ one quiet secondary where it earns its place). No sample data, no pill clouds.

**Zero fabrication.** Removed, with test pins:
- fake "Popular (Nearby) Universities" lists and generic degree pills (Education);
- "Quick Grade Presets" for CGPA (Education);
- verb-toolbar auto-insert (Work history);
- "92% Recruiters Prefer" statistic and privacy-studio chrome (References);
- "Add Category" preset bar, TrackGuidanceBanner, QuickAddCommandBar (Custom sections);
- every role-example sample across all 12 step files (banned-pattern test).

What *was* added instead is deterministic and labeled:
- **Achievements → "Find in my experience":** local regex scan of the candidate's own
  employment/project/education text for recognition signals; matches are offered with their
  source line and, when accepted, become an *editable entry pre-filled with the candidate's
  own words* (no AI call).
- **Custom sections → "Sections your profile already hints at":** deterministic scan for
  publications / patents / volunteering / speaking / open-source / memberships in the
  candidate's text; chips are labeled with the matched word and only create a *blank*
  section the candidate fills in.
- **References:** privacy-first — one click "Available upon request" or a named reference
  with an explicit consent note.

**Calm chrome.** Header keeps autosave pill, real ATS score pill, template, preview,
download. Gradients and marketing copy removed. `window.prompt` replaced by a small
in-app dialog for custom section titles.

**Navigation.** The 12-step ribbon + overview modal remain (the overview modal's
ReferenceError crash is fixed); the modal now renders real per-section completion state.
Previous/Next footer unchanged in behavior.

**Mobile.** Below 768px the hamburger opens a full drawer listing all steps (with the ATS
companion); at exactly 768px the app's `md` breakpoint puts the scrollable ribbon in play
and the hamburger is hidden — both surfaces are verified by the journey suite. All
builder overlays (toasts, alerts, drawers, dialogs) are portaled to `<body>` so the
dashboard shell's mobile topbar can no longer cover their controls.

---

## 3. AI changes

**One contract, one lifecycle, one surface.**

- `ai/aiContract.js` — the single shape every step uses:
  - `canRunAssistOperation(op, {resumeData, targetJd, entry, extra})` — local readiness gate
    so triggers disable *with a reason* before a request that would 400;
  - `buildAssistPayload(...)` — section-scoped candidate **facts** + target role/JD + prior
    answers are the only context the model receives (plus a profile hash for caching);
  - `normalizeAssistResult(op, data)` — backend response normalized to
    `questions | suggestions | draft | empty`, each with a human source label;
  - `describeAssistSource` / `describeAiError` — honest labels and friendly failures.
- `ai/useAiAssist.js` — shared request lifecycle: one trigger at a time, AbortController
  (navigation/re-trigger can never clobber newer state), payload-hash response cache
  (re-opening a card never re-bills the provider), and degradation to the backend's
  questions-or-source-preserving result — **the hook never invents content**.
- `AiPromptCard.jsx` — the single inline surface with five states: trigger (shows what
  evidence will be used), quiet loading (no fake content), questions (ASK before INFER —
  "answer any of these — only what you type will be used"), suggestions (per-item confirm,
  "only add what is true for you"), draft (editable, with explicit replace warning when the
  field already has content). Errors offer retry + dismiss — never a dead end.

**Where AI runs (all evidence-gated):**
- Work history — per role: "Strengthen with AI" once notes exist, else it asks questions;
  answers are written into the entry's notes (visible, editable) and become the only
  evidence for the next pass.
- Education — same pattern per qualification.
- Skills / Certifications — targeted suggestions from the declared target role + profile
  facts; every suggestion is individually confirmed; skills dedupe and cap at 20.
- Summary — full draft from profile facts only, editable before use.

**What AI does NOT do:** autocomplete is still available through the existing field
component, but no step auto-inserts verbs, no "improve all" bulk buttons, no role-example
starter content, and every accepted suggestion passes through the candidate's explicit
confirmation.

---

## 4. ATS changes

- **PARTIAL bucket (new, pinned by test):** `matchJobDescription` now separates multi-word
  JD terms into MATCHED / PARTIAL / MISSING. A term is PARTIAL when at least half of its
  distinctive tokens appear (word-boundary matched); single-word terms can never be partial.
  PARTIAL terms carry **half weight** in the JD match score. The Review step shows all three
  buckets with counts and the honest note that a partial match often means "a different word
  for the same thing."
- **No hidden formula UI:** "ATS Weight: X%" pills and the "Weight Distribution" section
  were removed from Review — the section scores and the engine's own finding text are shown
  instead (the weights still exist in the engine for scoring; they are not presented as a
  magic formula).
- **Engine findings drive the display:** "What is working" (strengths) and "What to fix
  first" (improvements) come from `calculateAtsScore` output only; each improvement links to
  its section.
- **Section readiness:** 7 sections with real `score/maxScore`, one-line engine rationale,
  and an Edit link back to the step.
- **JD persistence:** the Review step's target JD now writes back to the resume document
  (`targetJobDescription`, debounced) so Summary/Skills AI gating and the ATS pill see the
  same target.
- **Guide rail:** each step's rail shows the engine's open findings for that section
  (deterministic gaps + real ATS text) — no invented statistics anywhere.

---

## 5. Test results

All suites run on branch `arena/01a065a2-resumepilotai`, 2026-09-03.

| Suite | Result | Notes |
|---|---|---|
| Frontend product (`npm run test:product`) | **442/442 pass** | baseline was 377/380 (3 pre-existing failures); all now pass. Includes rewritten `builder-11-step-ux-ats-overhaul` (9/9), `certifications-step` (7/7), `user-resume-builder-reliability` (5/5) |
| Security static (`npm run test:security:static`) | **44/44 pass** | |
| Backend (`npm --prefix backend test`) | **578/612 pass (34 env-only)** | identical to baseline: the 34 failures are MariaDB/RBAC-integration suites requiring a live database, unavailable in this sandbox. No AI-runtime/candidate-context failure |
| Production build (`npm run build`) | **pass** | Vite build in ~3.7s; only pre-existing warnings (direct-eval in a dependency, chunk size) |
| esbuild strict bundle (all 12 steps + shell + primitives) | **0 errors** | named-import/export resolution verified per file |
| Browser verification (Playwright, 6 viewports × 8 journeys) | **48/48 pass** | full detail in §6; caught and fixed a real mobile layering bug (drawer close button) |

### Test changes (old-architecture pins → new-architecture pins)

- `tests/builder-11-step-ux-ats-overhaul.test.mjs` — rewritten: now pins StepShell/StepGuide
  presence, deletion of all clutter components, per-step StepShell usage, calm Review step
  (no "Command Center", no weight pills), the PARTIAL half-weight semantics, and a
  zero-fabrication banned-pattern scan across all step files.
- `tests/certifications-step.test.mjs` — the "AI recommendation engine + quick-add" pin
  replaced with the shared AI contract pin (`useAiAssist`, `canRunAssistOperation`,
  `AiPromptCard`, no quick-add).
- `tests/user-resume-builder-reliability.test.mjs` — deleted `InputField.jsx` check replaced
  by the new `components/Field.jsx` primitive (same coercion safety assertion).

---

## 6. Browser verification

**Method:** production `dist` build booted with the app's own non-production local preview
identity (`VITE_LOCAL_AUTH` + `VITE_PREVIEW_TOKEN`), served over a static server that stubs
only `/api/platform/public-config` (the maintenance gate) and 404s the rest — the UI runs
exactly as in a non-production environment with a live backend. Headless Chromium,
Playwright, 6 viewports × 8 journeys:

| # | Journey | What it proves |
|---|---|---|
| J1 | Builder loads | app boots into the builder under local identity, no page errors |
| J2 | All 12 steps render via ribbon | every step route mounts with its StepShell header |
| J3 | Entry persists across SPA navigation | typed heading fields + a work-history entry survive step-to-step navigation |
| J4 | Review is engine-driven | section readiness list, "What is working"/"What to fix first", Edit links, and absence of "Command Center"/weight UI |
| J5 | JD matcher buckets | pasting a JD renders Match % + matched / "Not in your resume" buckets |
| J6 | Overview modal | the former ReferenceError crash site opens with all step cards and zero page errors |
| J7 | Custom section dialog | `+ Custom` opens the in-app dialog (no `window.prompt`), creates the section, lands on the step |
| J8 | Overflow + errors | no horizontal overflow at the viewport; zero uncaught page errors over the whole run |

**Result: 48/48 checks passed** (6 viewports × 8 journeys, 2026-09-03, final run
`/tmp/browser-final2.log`):

| Viewport | J1 | J2 | J3 | J4 | J5 | J6 | J7 | J8 |
|---|---|---|---|---|---|---|---|---|
| 1440×900 desktop | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (11 cards) | ✓ | ✓ |
| 1280×800 desktop | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (11 cards) | ✓ | ✓ |
| 1024×768 tablet | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (11 cards) | ✓ | ✓ |
| 768×1024 tablet | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (11 cards) | ✓ | ✓ |
| 390×844 mobile | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (drawer) | ✓ | ✓ |
| 360×780 mobile | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (drawer) | ✓ | ✓ |

Details: J1 boots in ~3.0s with the correct StepShell h1 and zero page errors at every
width; J3 shows `first="Asha" occ="Site Reliability Engineer" workAdded=true` (entry
persists across navigation); J4 shows
`{sectionReadiness, working, fixFirst, editLinks: 7, noCommandCenter, noWeights}`;
J5 renders `Match:` with the "Not in your resume" bucket; J6 opens the overview with all
11 step cards (mobile: the navigation drawer lists 11 steps) with zero errors;
J7 creates the custom section via the in-app dialog and lands on `/build-resume/custom`;
J8 shows `scrollWidth == innerWidth` at every width.

**Bug found by the harness and fixed in `BuildResume.jsx`:** on phones, the mobile
navigation drawer's close (X) button was unreachable — the dashboard's mobile topbar
(`z-[60]`, `ProfileDisplay.jsx`) painted over the top 56px of the screen because the
legacy `.dashboardContentWrapper { position: relative; z-index: 1 }` rule (`index.scss`)
trapped every builder overlay in a low stacking context. The drawer could not be closed
with its X (only by tapping the dimmed backdrop away from the topbar), which also hid the
top-anchored toasts and save-error alert. Fix: the six builder overlay surfaces
(Success/Download/Upgrade toasts, save-error/conflict alert, ATS companion drawer,
mobile navigation drawer, steps overview modal, custom-section dialog) now render via
`createPortal(..., document.body)` at `z-[70]`, above the topbar, with no change to
desktop layering. Re-verification after the fix: 48/48.

**Environment note:** the sandbox blocks the Playwright/Chrome CDNs and Debian mirrors; the
browser binary was sourced from the npm registry (`@sparticuz/chromium` 149 headless shell +
its bundled Amazon-Linux NSS/NSPR libraries). The harness records that dependency.

---

## 7. Rollback & verification checklist

- Rollback: `git reset --hard 844bb44` (certified restore point; session head `e77da46`).
- Verify: `npm run test:product && npm run test:security:static && npm run build`
  (baseline: 380/377 + 44/44 + build OK).
- Known pre-existing (unchanged by this work): 34 backend DB-integration tests require a live
  MariaDB; template-lab visual regression requires a GPU browser environment.
