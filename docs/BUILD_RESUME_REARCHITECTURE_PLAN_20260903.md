# Build Resume UX/AI Re-Architecture — Phase 1: Assessment & Plan

**Date**: 2026-09-03
**Restore point**: `844bb4430f65f396026ef56be2704d19db9f9c31` (`restore-point-zero-fabrication-handoff-20260903-1025`) — verified present, unmodified.
**Working branch**: `arena/01a065a2-resumepilotai` (working tree = restore point + handoff doc).
**Author**: Principal Architect takeover (Arena Agent Mode).

> Method: every claim in this document was verified against code at the restore point,
> not against previous handover claims. Tests and runtime behavior were treated as
> evidence, not authority.

---

## A. Executive assessment

The previous iteration correctly solved **data safety** (no auto-fill of fake employers on
card click, source-preserving AI fallbacks, revision-based autosave with recovery and
conflict handling) and **ATS scoring** (deterministic, explainable, quality/JD-separated
scorer in `src/utils/atsScore.js`). Those two pillars are sound and will be preserved.

Everything above those two pillars is built on the wrong foundation:

1. **The "universal engine" is a 3,800-line hardcoded profession taxonomy.**
   `src/utils/candidateContext.js` (2,427 lines) + `backend/services/candidateContext.js`
   (1,445 lines) each carry a `DOMAIN_REGISTRY` of ~36 domains, every one with hardcoded
   keywords, action verbs, degrees, certifications, and — critically — **`blueprints`:
   fabricated employers, fabricated metrics ("25+ patients daily with a 99% satisfaction
   rating"), fabricated universities and awards** for every profession.
2. **Those fabrications are presented to candidates as examples and placeholders.**
   `dynamicPlaceholders.js` renders "e.g. Regional Memorial Hospital Network" as the
   employer placeholder; `TrackGuidanceBanner` renders blueprint content in a
   "Need Inspiration? View Role Examples" panel. This violates the absolute no-hardcoded-
   candidate-content rule even with "samples only" labels: a dentist staring at a fake
   hospital name and fake patient volumes is exactly the failure mode this product
   exists to eliminate.
3. **The AI is a generic content generator wearing a costume.** Prompts in
   `backend/services/aiRuntime.js` ask the model to "Generate industry-standard,
   achievement-oriented bullet points with strong action verbs and measurable results"
   when the candidate has no notes, and the provider-failure fallbacks return the
   hardcoded taxonomy bullets (including fabricated "improve productivity by 25%").
   The AI never asks the candidate a single question. It has no KNOW→INFER→ASK contract.
4. **The UX is a form-builder toolbar.** `QuickAddCommandBar` offers "+ Add Internship /
   + Freelance / + Contract Role / + Degree / + Diploma / + Training / + Publications /
   + Patents…" plus gradient "✨ AI" buttons; `TrackGuidanceBanner` is a guidance card
   with pill clouds; `StepAtsCompanion` is a per-step "ATS Career Co-Pilot" rail with
   fabricated statistics ("87% of enterprise ATS portals automatically reject resumes…",
   "Quantified bullets increase interview conversion by 40%", "Recruiters spend 6
   seconds…"), "High ROI" badges, and a monospace "What ATS Scanners Detect" box.
5. **Verified runtime bug**: `BuildResume.jsx:554` calls `getCandidateContext(...)`
   without importing it. The "All Steps Overview" modal (line 2049) throws
   `ReferenceError: getCandidateContext is not defined` the moment a user opens it.
6. **The test suite pins the clutter**: `tests/zero-fabrication-data-safety.test.mjs`
   asserts that `QuickAddCommandBar` and `TrackGuidanceBanner` are mounted in every
   step; `tests/role-agnostic-universal-matrix.test.mjs` asserts the per-domain verb
   lists and fabricated starter blueprints as features. The previous developer certified
   the clutter as architecture.

Verdict: the restore point is a safe rollback baseline (keep it), but the intelligence
layer and the step UI must be **replaced**, not layered on. The replacement becomes
**simpler for the user and more intelligent under the hood**: fewer components, no
per-profession data, an AI that reasons from the candidate's own evidence and asks
when it cannot know.

---

## B. SWOT (current implementation at restore point)

**Strengths**
- Deterministic, explainable ATS engine: 7 weighted sections with per-finding text,
  reasons, and navigable improvements; quality score and JD match kept separate
  (no fake blended score). Non-English content is scored without English-verb penalties.
- Real data-safety plumbing: owner-scoped canonical resume document, optimistic
  revisions, recovery snapshots, conflict resolution, beforeunload guard, debounce.
- AI transport is production-grade: server-side prompts/keys, multi-provider failover,
  timeouts, abort, auth-retry, JSON-repair parsing, prompt-injection defense
  (source treated as data).
- **Extractive grounding on factual AI ops** (`assertGroundedGeneratedContent`):
  token/quantity/identifier checks that fail closed to a source-preserving fallback.
  This is genuinely good and is the foundation for the new AI contract.
- Resume parsing is verbatim-extraction-only (`groundResumeExtraction`).

**Weaknesses**
- Hardcoded 36-domain taxonomy as the "universal" engine (frontend + duplicated backend
  copy — two sources of truth that can diverge).
- Fabricated candidate-like content in blueprints, placeholders, guidance panels,
  and provider-failure fallbacks.
- AI never asks; it invents or returns taxonomy filler. No evidence states
  (KNOWN/INFERRED/UNKNOWN/SUGGESTED/CONFIRMED) anywhere in the contract.
- Clutter: 4 competing chrome components per step (command bar, guidance banner,
  companion rail, workspace header) + verb toolbar + strength badges + overview modal.
- Fake statistics in guidance copy; "ATS Weight" pills; "High ROI" badges.
- Two divergent `cleanSkillName`, two `getCandidateContext` implementations,
  duplicated geographic detection, duplicated archetype synthesizer.
- Verified crash in the overview modal; dead JSON-resume IIFE in the shell.
- Suggestions can be applied with a single "+ Add" without an explicit
  "needs review → confirmed" state.

**Opportunities**
- The grounding layer already proves we can enforce "no invented facts" server-side;
  extend the same machinery to a **questions contract** (ASK before INFER, never fabricate).
- The ATS engine already produces explainable findings — surface *those* (real evidence)
  in place of invented statistics.
- A single evidence-based candidate context (facts + mined vocabulary + gaps + target
  JD) can drive placeholders, next-best-action, AI prompts, and ATS display from one
  source — replacing ~3,800 lines of taxonomy with ~600 lines of evidence logic.
- Inline, step-appropriate AI surfaces (question card, suggestion list with per-item
  accept, editable draft with explicit confirm) replace the giant generic modal.

**Threats**
- Large existing test suite (428+ product tests) pins the old architecture; naive
  deletion breaks CI. (Mitigation: update the 3 architecture-pinning tests to the new
  invariants; keep every behavioral test for modules we don't touch.)
- `candidateContext.js` API is consumed by 10 step files + companion; breaking changes
  ripple. (Mitigation: rewrite the module behind the same export names, then rewrite
  the consumers in the same pass.)
- AI provider may be unconfigured in some environments — the no-provider path is the
  path users actually see in this sandbox; it must be a designed experience
  (questions + source-preserving behavior), not an error.
- Risk of over-compressing: the step must still answer "where am I / what's missing /
  what next" without a wall of chrome. (Mitigation: one rail, one action, deterministic
  gap list.)

---

## C. Root Cause Analysis (architectural, not symptomatic)

| Symptom | Root cause |
|---|---|
| Clutter / card soup | **No single source for "what to do next"**. Four components each decided to explain the step: QuickAddCommandBar (choices), TrackGuidanceBanner (focus pills + samples), StepWorkspaceLayout header (status + ATS weight), StepAtsCompanion (detection + tips). None is owned; all render unconditionally. |
| Repetitive "AI AI AI" buttons | **AI has no contract with the step.** Every component that touches AI renders its own trigger + gradient badge, because there is no shared AI interaction primitive or request lifecycle. |
| Weak "real AI" feeling | **Prompts are role-label-driven, not evidence-driven.** The model receives "Domain: Dentistry" (a taxonomy hit) and is *instructed to generate industry-standard bullets*; it never receives the candidate's actual notes as the only factual basis, and never gets permission to ask questions. |
| Incorrect suggestions / contamination | **Hardcoded keyword scoring picks a domain label, then hardcoded content is served for that label.** An unknown role falls into `synthesizeUniversalRoleData`'s regex archetype chain — a second taxonomy in disguise — and the fallback serves taxonomy bullets with invented metrics. |
| Confusing next action | **No deterministic gap model.** "Next best action" is hand-written marketing copy per step inside StepAtsCompanion instead of being derived from the actual data state (which section is empty, which entry is incomplete). |
| Wasted space / giant panels | Companion rail + guidance banner + command bar consume 12-column grid rows before a single input; the 4-col rail is decorative on most steps. |
| AI accuracy problems | **No ASK state in the product contract.** The only states are "generate content" and "fallback filler". When the candidate has no notes, the system *must* either ask or do nothing — it does neither. |
| Fake ATS statistics | **Copy, not evidence.** The companion's "why it matters" text is authored marketing, not derived from `calculateAtsScore` findings. |
| Two divergent taxonomies | **Frontend/backend parity was achieved by copying a file** instead of a shared contract; `cleanSkillName` and geo detection are duplicated with drift. |
| Overview-modal crash | **Unimported symbol** — evidence that step-AI wiring was done by copy-paste without a build/test that renders the modal. |

**The one-line root cause**: the product was built by *layering presentation components
over a profession-lookup table*, instead of *deriving every UI element from the
candidate's actual evidence plus one explainable analysis engine*.

---

## D. Current architecture assessment

```
src/utils/candidateContext.js   2427 ln  DOMAIN_REGISTRY (36 domains × {keywords, verbs,
                                            degrees, certs, skillCategories, blueprints}),
                                        synthesizeUniversalRoleData (13-regex archetype chain),
                                        getCandidateContext, detectCandidateDomain,
                                        detectGeographicRegion, extractTargetRoleFromJd
src/utils/dynamicPlaceholders.js  226 ln  per-domain "e.g. <fake blueprint value>" placeholders
backend/services/candidateContext.js 1445 ln  duplicated DOMAIN_DATA + synthesizer (diverged)
backend/services/aiRuntime.js    1222 ln  prompts (role-label-driven), grounding asserts
                                            (good), provider failover (good),
                                            taxonomy fallback (bad), parse contract (good)
backend/routes/ai.js               996 ln  transport surface: /generate-content, /parse-resume,
                                            /check-grammar, /generate-interview (OK, keep)
src/services/aiService.js          240 ln  frontend transport: auth, abort, retry (OK, keep)
src/utils/atsScore.js              1088 ln  deterministic explainable scorer (KEEP)
src/components/BuildResume/BuildResume.jsx 2216 ln shell: data layer (KEEP), chrome (CALM),
                                            crash bug (FIX)
steps/* 12 files                   4–624 ln each, all mount: StepWorkspaceLayout +
                                            QuickAddCommandBar + TrackGuidanceBanner
                                            (+ per-step ✨ modals)
components/ 7 files                StepAtsCompanion (511 ln), QuickAddCommandBar (226 ln),
                                            TrackGuidanceBanner (143 ln),
                                            AiDraftReviewModal (200 ln),
                                            StepWorkspaceLayout (152 ln), …
```

## E. Current UX problems (verified in code)

1. Every step renders 4 chrome layers before content: workspace header card →
   quick-add command bar → (empty state) guidance banner or milestone bar → companion rail.
2. QuickAddCommandBar exposes 4–5 near-identical "add" variants per step
   (internship/freelance/contract; degree/diploma/training/continuing-ed;
   publications/volunteering/patents/speaking) — choice overload that adds zero
   information (a resume entry is a resume entry).
3. Empty states are guidance *panels* (pills, samples, badges), not a purpose + one action.
4. Gradient headers, sparkle icons, "High ROI"/"ATS Weight"/"Guidance" badges — decorative
   noise, no functional meaning.
5. Overview modal crashes (bug 5 above) — the product's own "where am I" tool is broken.
6. Inconsistent interaction: work history has a verb toolbar + strength badges + modal;
   other steps have different ad-hoc patterns.
7. On ≤1024px the companion collapses into a second toggle *in the step header*,
   stacking a 3rd chrome element on mobile.

## F. Current AI problems (verified in code)

1. `generate-work-description` with no notes: prompt says *"Generate industry-standard,
   achievement-oriented bullet points with strong action verbs and measurable results for
   this role"* — an explicit fabrication instruction; grounding then *rejects* the model's
   honest answer (tokens not in source) and the taxonomy fallback serves invented bullets.
2. Provider-failure fallbacks (`getContentOperationFallback`) return hardcoded bullets:
   "…improve productivity by 25%", "Maintained high academic standing… earning
   commendation from faculty", "Spearheaded key initiatives…" — presented in the same UI
   slot as grounded output, with only an internal `_source` tag the UI never surfaces.
3. No questions: the contract has no `questions` channel. "ASK" does not exist.
4. No evidence states: suggestions are indistinguishable from facts once inserted
   (single "+ Add" merges text into the field).
5. Skill/cert "recommendations" are fine in spirit but sourced from the taxonomy when the
   provider is down, and the UI never labels them as *to-be-confirmed suggestions*
   consistently.
6. `context` sent to the model = taxonomy output (domain label, hardcoded verbs) —
   the model's "understanding" of the candidate is really a lookup-table hit.
7. No cost control at the UI level (no debounced triggers; every tone pill click re-fires;
   no caching keyed on content hash; abort exists per-modal but not per-field).

## G. Current ATS problems

- **Engine**: sound (explainable, weighted, separate JD match, stuffing detection,
  non-English tolerance). **Keep unchanged.**
- **Presentation**: fake statistics ("87% of portals reject…", "conversion by 40%",
  "6 seconds") — remove all invented statistics; every displayed claim must come from
  `calculateAtsScore` findings or be a neutral instruction.
- "ATS Weight: X%" pill implies a hidden formula; replace with plain section status.
- JD match currently only MATCHED/MISSING at review; the plan extends display to
  MATCHED / PARTIAL / MISSING with deterministic partial matching (token-overlap ≥50%
  of the term's tokens) — no new AI call needed.

## H. Design principles (binding)

1. **One panel of truth per step**: header (title, purpose, state) + content +
   optional single right rail ("Guide") on xl screens. Nothing else.
2. **Primary action first**: each step has exactly one obvious primary action
   ("Add your experience", "Add a qualification"). Secondary/advanced AI actions are
   revealed inside the entry or in the rail — never in a toolbar.
3. **Safe placeholders only**: instructional, field-contextual, never profession-flavored,
   never resembling real data ("Enter the organization where you worked").
4. **AI is quiet**: a single inline "Improve with AI" affordance per content field/entry
   and one rail-level contextual offer. No gradients, no sparkles, no badges.
5. **Evidence states are visible**: AI output is always labeled
   `Suggestion — needs your confirmation` until the candidate accepts it. Accepted
   content is then the candidate's data (candidate edit = confirmation).
6. **Ask, don't guess**: when a factual request lacks evidence, AI returns questions.
   The question card shows the exact question and an answer box; answering triggers
   regeneration with the answer merged into the evidence.
7. **Determinism where determinism wins**: duplicates, validation, gap detection,
   placeholder safety, ATS scoring — all local code. AI is used only for semantics:
   rewriting, extraction, question generation, JD interpretation.
8. **Role-agnostic by construction**: no per-profession data structures anywhere in the
   new intelligence layer. The model receives the candidate's own text; the system
   cannot be "wrong" about a profession it has never seen.
9. **Calm premium visuals**: white surfaces, 1px borders, restrained palette
   (slate + one indigo accent + semantic emerald/amber/rose), real type scale,
   generous but purposeful whitespace, 8px rhythm.
10. **Data wins**: AI never overwrites existing content; apply = append or
    explicit-replace-with-confirmation; local state resets are impossible (entries
    are created blank and never touched except by the candidate).

## I. Proposed architecture (intelligence core)

### I.1 `src/utils/candidateContext.js` (REWRITTEN, same export surface)

Evidence-based context, zero profession data:

```
getCandidateContext(resumeData, targetJd) → {
  facts: { name, headline, location, roles[], education[], skills[],
           certifications[], projects[], achievements[], languages[],
           summary, experienceYears, hasJd },
  vocabulary: Set-ish array of content tokens mined from the candidate's own
             entries (deterministic; powers dedupe, grounding previews, JD partial
             matching),
  region: 'IN'|'US'|'UK'|'CA'|'AU'|'EU'|'GLOBAL' (kept, deterministic),
  target: { role, jd, jdRole },                       // deterministic JD role parse kept
  gaps:  { heading[], workHistory[], education[], skills[], projects[],
           certifications[], languages[], summary[], achievements[], references[] },
         // deterministic "what's missing / incomplete" per section, drives next action
  profileHash: string                                  // for AI request caching
}
```

Removed: `DOMAIN_REGISTRY`, `DOMAINS`, `synthesizeUniversalRoleData`,
`BALANCED_UNIVERSAL_BLUEPRINTS`, `detectCandidateDomain`, per-domain verbs/degrees/certs.
Kept (exported, deterministic): `detectGeographicRegion`, `extractTargetRoleFromJd`,
`estimateExperienceYears`.

### I.2 `src/utils/dynamicPlaceholders.js` (REWRITTEN)

Static neutral, field-contextual strings only ("Enter the organization where you
worked", "Enter the credential exactly as shown on your certificate"). No examples,
no profession, no region-flavored fake city lists beyond the field label itself.

### I.3 `backend/services/candidateContext.js` (REWRITTEN to a thin parity module)

No domain data. Exports the same deterministic helpers the frontend uses (geo region,
JD role parse, experience estimate, vocabulary mining) so frontend/backend parity is
**one contract, two small ports**, and `aiRuntime` no longer imports taxonomy.

### I.4 `backend/services/aiRuntime.js` (PROMPTS + FALLBACKS REWRITTEN; transport/grounding kept)

- **Prompt construction**: system = evidence contract (KNOW/INFER/ASK/SUGGEST/CONFIRM
  rules). User = verified candidate facts (section-scoped) + target role/JD +
  conversation answers. **No domain label, no hardcoded verb lists, no "industry-
  standard" instructions.**
- **ASK contract**: factual ops (`generate-work-description`,
  `generate-education-description`, `generate-summary`) receive `candidateNotes`.
  If notes are < N chars, the model (or, without provider, a deterministic question
  bank keyed to *the section*, not the profession) returns
  `{ questions: [{ id, question, answerField }] }` instead of content. Frontend stores
  answers in the payload context and re-requests.
- **SUGGEST ops** (`generate-skills`, `generate-certifications`, `generate-summary`
  variants): always `requiresConfirmation: true`; items carry `basis` (quote of the
  candidate evidence that inspired them) when available.
- **Fallbacks** (provider down / grounding fail): source-preserving only. For factual
  ops with insufficient evidence → `questions` + `_source: 'ask'`. Never taxonomy
  bullets, never invented metrics.
- Grounding asserts **kept and extended**: summary must be extractive; quantities,
  identifiers, and claim families must exist in the source.

### I.5 Frontend AI interaction layer (NEW, small)

`src/components/BuildResume/ai/useAiAssist.js` + `aiContract.js`:
- one request lifecycle: explicit trigger → loading → (suggestions | questions | error)
  → accept/edit/discard;
- AbortController per active request, cancel-on-unmount/replace;
- request cache keyed on `profileHash + operation + fieldId + context` (no repeat
  calls on re-render / tone-fiddling without content change);
- graceful degradation: provider down → surface the deterministic questions path,
  never a dead end.

## J. Proposed UX architecture

**Component set (replaces the current 7 with 7 smaller, single-purpose ones):**

| New | Replaces | Role |
|---|---|---|
| `StepShell.jsx` | StepWorkspaceLayout | header (title, one-line purpose, state chip) + content + single optional rail; no ATS-weight pill; no second mobile toggle |
| `StepGuide.jsx` | StepAtsCompanion | the ONLY AI rail: "Ready / Missing / Next best action" derived from `gaps` + `calculateAtsScore` findings (real evidence); one contextual AI offer |
| `EmptyState.jsx` | TrackGuidanceBanner | purpose sentence + ONE primary button + optional secondary "Ask AI to help me start" |
| `AiPromptCard.jsx` | WorkHistorySuggestionModal, EducationSuggestionModal, AiDraftReviewModal | inline surface with 3 states: `questions` (ask → answer → regenerate), `suggestions` (per-item accept, labeled needs-confirmation), `draft` (editable, explicit "Use this draft" with replace-warning when existing content) |
| `Field.jsx` | InputField + ad-hoc labels | label, safe placeholder, hint, error — one visual language |
| `EntryList.jsx` / `EntryHeader.jsx` | per-step card boilerplate | collapsible entry (summary row + expand) with inline kebab actions (edit order, duplicate, delete) |
| `useAiAssist.js` | per-modal fetch code | shared lifecycle + cache + abort |

**Deleted**: `QuickAddCommandBar.jsx`, `TrackGuidanceBanner.jsx`,
`StepAtsCompanion.jsx`, `AiDraftReviewModal.jsx`, `WorkHistorySuggestionModal.jsx`,
`EducationSuggestionModal.jsx`.

**Per-step interaction models** (deliberately not identical):

1. **Heading** — single form card: name row, contact row, headline + links (progressive:
   links inside "Add more"). No AI. Gap list in rail.
2. **Work history** — entry list; each entry: fields + bullet editor; inline "Strengthen
   with AI" (evidence-gated: no notes → question card; notes → grounded rewrite
   suggestions); primary "Add your experience".
3. **Education** — entry list; same inline AI for coursework/research notes.
4. **Skills** — chip list + optional grouping; deterministic duplicate detection with
   inline resolve; AI "Suggest skills from your experience" → per-item add
   (labeled suggestions); JD-match panel (matched/partial/missing).
5. **Projects** — entry list; fields are purpose/contribution/outcome (labels guide;
   no fake content); optional inline AI structuring from pasted notes.
6. **Certifications** — entry list with type select (Certification / License /
   Registration / Training / Course — a structural distinction, not a taxonomy);
   AI "Credentials worth knowing for this role" as labeled suggestions.
7. **Languages** — minimal list + level select; no AI.
8. **Summary** — editor + counter + "Draft from my profile" (grounded; draft state in
   AiPromptCard; explicit confirm; JD-alignment hint when JD present).
9. **Achievements** — entry list; "Find in my experience" = deterministic scan of the
   candidate's own text for recognition signals + AI rewrite with confirmation.
10. **References** — privacy-first: "Available on request" default toggle; optional
    named references; consent note. No AI.
11. **Custom sections** — "Add a section" (blank, named by the candidate); AI offer
    "Sections that fit your profile" (labeled suggestions from actual profile content).
12. **Review** — keep the ATS command center (AtsScoreMeter) + JD matcher extended to
    MATCHED/PARTIAL/MISSING; export/share unchanged.

**Shell changes (BuildResume.jsx)**: fix the `getCandidateContext` crash (and remove the
dead IIFE); calm header (no gradients; keep autosave pill, ATS pill, preview, download);
ribbon simplified (number + name + state, no per-step icon noise); overview modal kept
but fixed and de-badged (real completion status from `gaps`).

## K. Proposed AI architecture

```
Candidate action (explicit trigger)
   → useAiAssist(operation, { section, entryId, evidence, target, answers, tone? })
   → cache hit? → render
   → POST /api/generate-content { operation, payload, context: { facts, target, answers } }
   → backend: buildGroundedPrompt (evidence-only) → provider failover
   → parse → grounding asserts (factual ops)
   → contract: { suggestions[] | questions[] | draft, requiresConfirmation, _source }
   → AiPromptCard renders state
   → candidate: accept (per item) / edit / discard / answer questions → regenerate
```

Rules: no per-keystroke calls; explicit buttons; abort on navigation; 45s timeout;
one retry via provider failover; cache keyed on content hash; all factual output
server-grounded; all suggestions UI-labeled until confirmed.

## L. Proposed ATS architecture

Engine unchanged (`src/utils/atsScore.js` stays byte-identical unless a bug is found).
Presentation: StepGuide shows the real section score + its findings (why it matters =
the engine's own finding text); Review keeps AtsScoreMeter + JD matcher with
PARTIAL state added in the engine via token-overlap (deterministic, tested).
No invented statistics anywhere in the builder.

## M. Step-by-step implementation plan

1. Freeze baseline: run existing product/security/build suites at restore point (record results).
2. Rewrite `src/utils/candidateContext.js` + `src/utils/dynamicPlaceholders.js` (evidence core).
3. Rewrite `backend/services/candidateContext.js` (parity port).
4. Rewrite `aiRuntime.js` prompts + fallbacks (evidence prompts, ASK contract, source-only fallbacks); keep transport/grounding.
5. Add `aiContract.js` + `useAiAssist.js` (frontend lifecycle).
6. Add design-system primitives: `Field`, `EntryList`/`EntryHeader`, `EmptyState`, `StepShell`, `StepGuide`, `AiPromptCard`.
7. Rewrite the 11 steps + Review onto the new primitives (one step at a time, keeping data-layer calls identical).
8. Delete the 6 clutter components; fix shell bug; calm chrome.
9. Tests: rewrite the 3 architecture-pinning suites to the new invariants; add
   `tests/builder-evidence-no-fabrication.test.mjs` (no hardcoded candidate facts in UI
   sources; neutral placeholders; unknown-role generalization with invented professions)
   and `tests/ai-runtime-ask-behavior.test.mjs` (provider failure → questions, not
   fabrication; malformed responses; grounding; duplicate handling).
10. Build + full test suites; fix regressions.
11. Browser validation: Playwright across 6 viewports (1440×900, 1280×800, 1024×768,
    768×1024, 390×844, 360×800) for every step in empty + populated states;
    journey smoke (doctor, chef, unknown role, JD paste).
12. Final report (format per handover directive).

## N. File impact map

**Rewritten**: `src/utils/candidateContext.js`, `src/utils/dynamicPlaceholders.js`,
`backend/services/candidateContext.js`, `backend/services/aiRuntime.js`,
`src/components/BuildResume/BuildResume.jsx`, all 12 step files under
`src/components/BuildResume/steps/`.

**Deleted**: `components/QuickAddCommandBar.jsx`, `components/TrackGuidanceBanner.jsx`,
`components/StepAtsCompanion.jsx`, `components/AiDraftReviewModal.jsx`,
`steps/components/WorkHistorySuggestionModal.jsx`,
`steps/components/EducationSuggestionModal.jsx`.

**Added**: `components/StepShell.jsx`, `components/StepGuide.jsx`,
`components/EmptyState.jsx`, `components/AiPromptCard.jsx`, `components/Field.jsx`,
`components/EntryList.jsx`, `components/EntryHeader.jsx`, `ai/useAiAssist.js`,
`ai/aiContract.js`, tests `tests/builder-evidence-no-fabrication.test.mjs`,
`tests/ai-runtime-ask-behavior.test.mjs`.

**Updated tests**: `tests/builder-11-step-ux-ats-overhaul.test.mjs`,
`tests/zero-fabrication-data-safety.test.mjs`, `tests/role-agnostic-universal-matrix.test.mjs`.

## O. Files/modules intentionally NOT changed

- `src/utils/atsScore.js` — engine is the good part; presentation changes only.
  (A minimal, tested PARTIAL-matching extension is the only allowed change.)
- `src/utils/resumeData.js`, `src/services/resumePersistence.js` — data-safety core.
- `src/services/aiService.js` — transport is sound; contract extended via payload only.
- `backend/routes/ai.js` — surface unchanged (no new endpoints needed).
- `PreviewModal`, `TemplateSelectionModal`, `ResumeImportModal`, `AtsScoreMeter`
  (unless copy audit requires a stat removal), templates, cv-templates, dashboard,
  admin, enterprise, auth, billing, blog, portfolio — out of scope per §33.
- All test files for untouched modules.

## P. Risk assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Break pinned tests (428+) | High | Medium | Update exactly the 3 architecture-pinning files; run full suite; fix fallout locally |
| AI provider unconfigured in sandbox | Certain | Medium | No-provider path is a designed experience (questions + source-preserving), validated in browser |
| Grounding too strict for legitimate rewrites | Medium | Medium | Keep connective-token allowance; extend token set only with evidence; test suite covers |
| Shell bug fix changes modal behavior | Low | Low | Modal kept (fixed), regression-tested |
| i18n: new strings not in locale files | Medium | Low | Use `t(key, fallback)` pattern already used; no locale file edits required |
| Over-simplification removes needed affordance | Low | Medium | Every removed action keeps an equivalent in the new IA (verified in journey tests) |

## Q. Validation strategy

1. `npm run test:product`, `npm run test:security:static`, `npm --prefix backend test`
   (baseline before, full after).
2. New automated assertions (§40/§41/§42): no-fabrication source scan, AI relevance
   (no IT terms served to non-IT candidates), unknown-role generalization with
   invented professions not present in any registry (there is no registry).
3. AI failure simulation: provider down, timeout, malformed JSON, hallucinated
   claim (grounding rejection), duplicate suggestions, conflicting data.
4. Real browser: Playwright screenshots + interaction smoke at all 6 viewports for
   all 12 steps, empty and populated; 8 journeys (doctor, dentist, lawyer, SWE, chef,
   unknown role, improve-existing, JD paste).
5. Build: `npm run build` clean.

## R. Rollback strategy

- Restore point `844bb44` + tags + checkpoint branch remain untouched on GitHub.
- All work lives on `arena/01a065a2-resumepilotai` with local commits per phase
  (never pushed unless instructed).
- Rollback = `git reset --hard 844bb4430f65f396026ef56be2704d19db9f9c31` on a fresh
  clone/branch. No shared-state migration is introduced (resume document schema
  unchanged; `completedSteps` semantics unchanged), so saved resumes remain compatible
  with both the old and the new UI.
