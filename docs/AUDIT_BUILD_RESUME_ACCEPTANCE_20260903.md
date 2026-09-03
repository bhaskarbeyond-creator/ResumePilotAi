# Acceptance Audit — Build Resume Rebuild (2026-09-03)

Subject: branch `arena/01a065a2-resumepilotai` @ `d9cd071` (baseline `e77da46` / `844bb44`).
Method: independent re-run of every claimed suite, full code read of the builder tree + AI/ATS
modules, real-browser visual audit (Playwright, dist build, 6 viewports × 12 steps + overlays,
empty + doctor persona = 164 screenshots, 0 page errors), and targeted adversarial probes.
Every claim below was re-verified; nothing is carried over from the self-report.

---

## 1. EXECUTIVE VERDICT (pre-fix): 7.5 / 10

Technically the rebuild is real: zero-fabrication discipline, evidence-gated AI, deterministic
ATS, honest empty states, role-agnostic structure, and every claimed test number reproduces.
It is NOT yet a 10/10 because four user-visible defects break the "senior, minimal, premium"
bar, and one of them is a correctness defect:

| # | Defect | Severity | Evidence |
|---|--------|----------|----------|
| D1 | Step-completion state is systematically wrong: legacy flag-alias map collides with current step IDs → empty steps show "Completed" (ribbon, footer %, overview). Also `isStepCompleted('work-history')` checks nonexistent field `workHistory` instead of `employments` → valid work history shows incomplete on fresh load. | P0 (correctness + trust) | Screenshot: overview "Projects — Completed — 0 project(s) added"; code `BuildResume.jsx` legacyMap + L531 |
| D2 | Visual hierarchy broken app-wide in the builder: unlayered legacy `h1–h6` rules in `src/tailwind.css` beat Tailwind v4 layered utilities (unlayered > layered). Every step title renders at 32px instead of 16px, "GUIDE"/ATS labels at 19px instead of 10–11px, modal h3s at 19px instead of 14px, plus undesigned 0.67–1.33em margins. Direct consequence: mobile step header shows a 3-line giant title with the step badge floating bottom-left. | P0 (the core UX ask) | All 164 screenshots; `src/tailwind.css:23-53` + Tailwind 4.1.8 native layers |
| D3 | Global-default bias in the EN locale builder placeholders: Country placeholder "India", phone "+91 98765 43210", city "e.g. Hyderabad, Bengaluru", postal "e.g. 500081", address "e.g. Madhapur, Hitec City", names "e.g. Aarav/Sharma", email "aarav.sharma@gmail.com", job-title example with "Lead Cloud Architect", CGPA "8.8/10", IT-skewed skill/achievement examples. A brand-new resume in an empty global product defaults to Indian + IT examples. | P1 (mandate: no India-as-default / no IT bias) | `src/locales/en/en.json` HeadingStep/WorkHistoryStep/EducationStep/SkillsStep/AchievementsStep/ReferencesStep keys; empty-state screenshots |
| D4 | ATS "Readiness Companion" drawer opens nearly empty (meter collapsed by default) and reads its JD from a **second store** (localStorage) while the resume document carries `targetJobDescription` — the two never sync, so the drawer's "Target job match" stays "Not provided" even after the candidate pastes a JD in Review. | P1 (ATS must be useful, context must propagate) | `AtsScoreMeter.jsx` L58-66; ATS-drawer screenshot |

Secondary findings (P2/P3) in §6. Zero-fabrication, AI grounding, ask-don't-invent, and
role-agnosticism all PASS (details in the final report).

**Score rationale:** 8.5 technical (deducted: D1 correctness, D4 fragmented JD state) ×
exceptional-UX requirement not met (D2, D3) → 7.5. Target after P0+P1 fixes and re-validation: 9.5+.

---

## 2. SWOT

**Strengths**
- Zero-fabrication architecture is real and verified end-to-end: AI payloads are evidence-only
  (candidate facts + target + region label + own vocabulary + profileHash; no taxonomy);
  grounded generation is fail-closed (source-excerpt presence, quantified-claim subset,
  protected-claim families, extractive token check); ASK gate (<10 chars evidence) returns
  deterministic questions with **no provider call**; suggestions are capped and carry `basis`;
  accepted drafts are explicitly labeled, editable, and never replace existing content
  (WorkHistory appends bullets; AiPromptCard warns "replaces what is currently in this field").
- Deterministic "intelligent" features that don't pretend to be AI: `findAchievementSignals`
  (own-lines recognition regex, source-labeled), CustomSections own-words hints creating a
  BLANK section, SkillsStep JD match panel (real engine output, "never pad the list"),
  action-verb coaching on the candidate's own bullets.
- ATS is explainable and dual-dimension: quality 0–100 + separate JD match (never blended),
  every section emits finding + action + navigateTo, stuffing detector, non-English handling,
  honest disclaimer ("Heuristic… not Workday/Greenhouse… nothing is sent to a server").
- AI plumbing is race-safe: AbortController + sequence counter, payload-hash cache, abort-on-
  unmount, stale-response discard; autocomplete suggests only from the candidate's own data and
  excludes identity fields entirely.
- Empty states are purposeful (one primary CTA, honest copy); overlays fixed via portaling;
  0 page errors across 164 real-browser shots; all suites reproduce exactly.

**Weaknesses**
- D1: completion state (ribbon/footer/overview) is not trustworthy for fresh loads and after
  visiting neighboring steps — the single most visible "progress" signal in the product.
- D2: heading cascade collision defeats the entire new design system's type scale in the
  builder (mobile header is the worst casualty).
- D3: EN locale placeholders encode India + IT as the universal default.
- D4: two JD sources of truth; ATS drawer under-delivers on first open.
- StepGuide hidden below 1024px (tablet portrait loses the deterministic gap rail).
- Guide rail duplicates gap vs ATS-finding wording on early steps (redundant, not wrong).
- `estimateExperienceYears` assumes 24 months per undated role (feeds seniority label + AI
  summary payload; flagged, not user-visible as a number).
- `DOMAIN_ANCHOR_TERMS` (stuffing tolerance) skews IT in a global product (minor).

**Opportunities**
- One scoped CSS fix restores the full intended type scale (biggest visual lever, tiny diff).
- Making `isStepCompleted` purely content-derived removes an entire class of state-drift bugs.
- Single JD source of truth (resume document) unifies Review, Skills panel, StepShell ATS,
  and the meter for free.
- Neutral, instructional placeholders align EN with the already-neutral JSX fallbacks.

**Threats**
- Any future unlayered element-selector CSS (or legacy page importing these rules) will
  re-break the builder type scale — the scoped exclusion must stay and be documented.
- Legacy saved resumes with old numeric `completedSteps` flags: after alias cleanup they rely
  on the (correct) content checks — verified safe; no migration needed.
- Test-suite risk on the i18n change: placeholder strings are referenced by tests — all
  placeholder assertions re-run (product 442/442 gate).

---

## 3. ROOT CAUSE ANALYSIS

**RC-1 (D1) — Legacy completion aliases vs renumbered steps.**
The pre-rebuild app numbered sections differently. `isStepCompleted` kept a `legacyMap`
mapping old numeric flags → steps. The rebuild renumbered steps (1 heading … 11 custom) and
new step components write the **current** IDs on visit. The old numeric aliases now point at
*other* steps' current IDs: education's flag 3 completes work-history, skills' 4 completes
education, projects' 5 completes skills, certifications' 6 completes projects, languages' 7
completes certifications, summary's 8 completes languages, and work-history's 2 completes
summary. Seven of eleven entries collide. Combined with the `workHistory`-vs-`employments`
field-name bug in the work-history content check, the completion signal is unreliable on both
fresh loads (undercount) and after neighboring-step visits (overcount).
*Fix:* drop colliding numeric aliases (keep self-IDs + string aliases) and check the
canonical `employments` field. Content checks remain the authoritative source.

**RC-2 (D2) — Tailwind v4 cascade layers vs legacy unlayered heading rules.**
`src/tailwind.css` contains "Preserve original heading styles": unlayered
`h1{font-size:2em} … h6{…}`. Under Tailwind v3 (no native layers) utility classes won by
specificity. Under Tailwind v4 (`@import 'tailwindcss'` = layered theme/base/components/
utilities), **unlayered author CSS beats layered utilities regardless of specificity**. So the
rebuild's `text-sm sm:text-base` step titles render at 2em, `text-[10px]` labels at 1.17em,
etc. Root cause is the migration, not the builder. Global removal of the legacy block would
visibly change dozens of unrelated pages (hundreds of headings outside the builder use
`text-*` utilities and currently render at legacy size); the scoped, zero-blast-radius fix is
a `:not(:is(.rp-builder-scope *))` exclusion on the legacy rule + the scope class on the
builder root and its six portaled surfaces.

**RC-3 (D3) — Example data fossilized in the EN locale.**
The builder's JSX fallbacks are neutral ("Your first name", "Enter the job title you are
applying for"), but `src/locales/en/en.json` still carries pre-rebuild Indian example strings
under `HeadingStep.*` / `WorkHistoryStep.*` / `EducationStep.*` / `SkillsStep.*` /
`AchievementsStep.*` / `ReferencesStep.*` keys, and the EN locale is the default for a global
product. These are placeholders (examples), not fabricated candidate facts — but the mandate
is explicit: India-specific examples only in Indian context, no IT bias.
*Fix:* replace with neutral instructional text matching the JSX fallbacks (builder-owned keys
only; other locale files untouched).

**RC-4 (D4) — Split JD state + collapsed-by-default diagnostics.**
`AtsScoreMeter` keeps its JD in localStorage (`readStoredJobDescription`) while ReviewStep
writes `resumeData.targetJobDescription` (the document the rest of the builder reads). The
meter also defaults to collapsed, so the dedicated "Readiness Companion" drawer opens empty.
*Fix:* meter takes an optional `jobDescription` prop (document wins, localStorage fallback
for legacy), and the drawer renders it expanded by default.

**RC-5 (P2) — Stray duplicate hint under the City field.**
`HeadingStep` passes `hint={getDynamicPlaceholder('heading','city',…)}` → the literal
"Enter your city" renders *below* the City input whose placeholder already says it.
*Fix:* remove the redundant hint prop.

---

## 4. UX SCORECARD (14 dimensions) — pre-fix

| # | Dimension | Score | Notes |
|---|-----------|-------|-------|
| 1 | First-time clarity (empty resume) | 8 | Purposeful empty states, one CTA each; hurt by D3 placeholders |
| 2 | Visual hierarchy / type scale | 3 | D2: every heading 1.17–2× intended size; mobile header broken |
| 3 | Density & calm (no card-soup) | 9 | Single panel per step, one guide rail, quiet chrome |
| 4 | Progress & completion trust | 3 | D1: false "Completed" on empty steps; wrong field check |
| 5 | Navigation (ribbon/drawer/overview) | 8 | All three work; drawer fixed by portaling; ribbon auto-scroll minor |
| 6 | Mobile usability (390/360) | 6 | Usable; giant 3-line title + floating badge (D2); bottom nav noise (app shell, out of scope) |
| 7 | Tablet (768/1024) | 7 | Guide rail hidden <1024; header title hidden at 768 |
| 8 | CTA clarity per step | 9 | Exactly one primary action per step |
| 9 | Guide rail usefulness | 8 | Deterministic gaps + real ATS findings; minor wording overlap; absent <1024 |
| 10 | Overlays (drawer/modal/drawer-ATS) | 7 | Drawer+overview clean; ATS drawer opens empty (D4) |
| 11 | AI affordances (cards, confirmations) | 9 | Explicit accept/checkboxes, source labels, amber replace-warning |
| 12 | Empty vs partial states | 9 | Honest, no invented content |
| 13 | i18n/locale neutrality | 4 | D3: EN default encodes India+IT examples |
| 14 | A11y basics (labels, aria, keyboard) | 8 | aria-current, aria-expanded, sr-only, focus rings; heading semantics fine |

UX total: 89/140 ≈ 6.4/10 → the gap to "exceptional" is D1+D2+D3+D4.

## 5. AI SCORECARD (11 dimensions) — pre-fix

| # | Dimension | Score | Notes |
|---|-----------|-------|-------|
| 1 | What AI knows (payload) | 10 | Evidence-only: facts, target{role,jdRole}, region label, own vocabulary, profileHash. No taxonomy. |
| 2 | What AI must ask | 9 | ASK gate <10 chars → deterministic questions, no provider call; per-entry evidence gating in work history |
| 3 | What AI never invents | 10 | Grounding fail-closed 502; quantified-claim subset; protected families; extractive token check; identity fields excluded from autocomplete |
| 4 | Distinguishable from candidate facts | 9 | Labels, amber warning, append-not-replace, drafts editable before use |
| 5 | No silent mutation / no overwrite | 10 | Explicit confirmation only; accepted bullets append |
| 6 | Context hierarchy (not blind dump) | 9 | Section-scoped evidence, clamped payloads (roles≤12/3000ch etc.), profileHash |
| 7 | No role contamination / stale context | 9 | AbortController+seq, payload-hash cache, abort-on-unmount |
| 8 | Suggestions grounded + explainable | 9 | ≤8 suggestions with `basis`; own-data autocomplete only |
| 9 | Safe fallbacks | 9 | Source-preserving fallbacks; extraction re-verified verbatim; error normalization |
| 10 | JD/country context propagation | 6 | Document JD flows to steps; meter's JD is a second store (D4); region detection is label-only |
| 11 | Regulated-profession safety | 9 | Protected-claim families; ask-first on evidence gaps; no license/registration claims generated |

AI total: 99/110 ≈ 9.0/10.

## 6. ARCHITECTURE SCORECARD (10 dimensions) — pre-fix + P2/P3 register

| # | Dimension | Score | Notes |
|---|-----------|-------|-------|
| 1 | State management (single source) | 7 | resumeData canonical + refs + recovery; **D1 flag drift**, D4 split JD |
| 2 | Race conditions / stale writes | 9 | seq+abort+hash-cache; save pipeline with revision + conflict |
| 3 | Contracts (FE↔BE) | 9 | aiContract mirror, clamps on both sides, strict schema normalizer |
| 4 | CSS architecture | 4 | RC-2 unlayered-vs-layered collision; z-1 trap required portaling (accepted, documented) |
| 5 | i18n architecture | 6 | Keys clean; EN values carry fossilized examples (D3) |
| 6 | ATS computation | 9 | Deterministic, two dimensions, explainable; minor IT skew in DOMAIN_ANCHOR_TERMS (P3) |
| 7 | Dead code / unused | 8 | 12 components deleted; `BuildResume.customSection.prompt` dead key (P3); 24-month tenure assumption (P3, documented) |
| 8 | Portals/layering | 9 | Six surfaces portaled; no z-trap regressions in 164 shots |
| 9 | Persistence/recovery | 9 | Revision + conflict + recovery + canonical snapshot |
| 10 | Test coverage of the module | 8 | 442 product + 44 security + 48 browser journeys; completion-state unit gap (adding with D1 fix) |

**P2/P3 register**
- P2-1: Guide rail hidden <1024px (tablet portrait) — decide: show compact rail at md or leave (out-of-scope-ish; leave, documented).
- P2-2: Guide rail wording overlap (gap vs ATS finding) — cosmetic; leave unless trivial (dedupe by text-similarity is risky; leave, documented).
- P3-1: `estimateExperienceYears` 24-month assumption — label it in code comment; do not change behavior (affects AI payload; behavioral change = out of scope).
- P3-2: `DOMAIN_ANCHOR_TERMS` IT skew — leave (changing stuffing tolerance changes scores; out of scope; documented).
- P3-3: dead key `BuildResume.customSection.prompt` — leave (i18n data, no behavior).
- P3-4: header title hidden at 768px — cosmetic; leave (documented).

---

## 7. FIX PLAN (P0 → P1) — each with scope proof

### P0-1 — Correct completion state (D1)
- **Problem:** empty steps show "Completed" (ribbon/footer/overview); work history with
  valid `employments` shows incomplete on fresh load.
- **Root cause:** RC-1 (legacy numeric alias collisions + wrong field name).
- **Solution:** in `BuildResume.jsx` `isStepCompleted`: (a) `legacyMap` keeps only
  self-referencing IDs and string aliases (`'work-history','employment','heading',…`);
  (b) `case 'work-history'` checks `resumeData.employments`.
- **Files:** `src/components/BuildResume/BuildResume.jsx` (one function).
- **Why this file / why not elsewhere:** the function is builder-internal; no other module
  computes step completion (verified by grep: only BuildResume.jsx).
- **Risk:** legacy saves with old numeric flags lose flag-based completion — content checks
  (already correct) re-derive completion from actual data; new step components re-write their
  current ID on visit. No data loss, flags are cache only.
- **Benefit:** progress signal becomes truthful — the builder's primary trust surface.
- **Validation:** new/updated product unit tests for `isStepCompleted`-equivalent logic via the
  step components' completion + full product suite (442 gate) + browser check: fresh doctor
  load → work history completed in ribbon; empty projects stays pending after certifications.

### P0-2 — Restore builder type scale (D2)
- **Problem:** all builder headings render at legacy 2em/1.5em/1.17em sizes + undesigned
  margins; mobile step header broken.
- **Root cause:** RC-2 (unlayered legacy h1–h6 vs Tailwind v4 layers).
- **Solution:** `src/tailwind.css` legacy heading block selectors become
  `h1:not(:is(.rp-builder-scope h1))` … `h5:not(:is(.rp-builder-scope h5))` (h6 unused in
  builder — left untouched to minimize diff); `rp-builder-scope` class added to the builder
  root div and to the six portaled surface wrappers (toasts carry no headings; added to
  overview modal, ATS drawer, mobile drawer, custom-section dialog, save-error alert).
- **Files:** `src/tailwind.css` (6 selector lines), `src/components/BuildResume/BuildResume.jsx`
  (class additions only).
- **Why this file / why not elsewhere:** the colliding rule lives in tailwind.css; only a
  builder-scoped exclusion there leaves every non-builder page byte-identical (verified:
  index.scss loads after tailwind.css and all its heading rules are class-scoped (0,1,1) ≥
  the new specificity, so tie-breaks by source order are unchanged).
- **Risk:** non-builder pages: zero selector-behavior change (rule still matches all
  non-builder headings with equal-or-higher specificity than before; any page rule that
  previously won by specificity still wins by source order). Builder: headings render at
  their designed sizes (preflight + utilities).
- **Benefit:** restores the entire intended visual hierarchy at all 6 viewports.
- **Validation:** 6-viewport × 12-step re-shoot vs this audit's shots (before/after), 0 page
  errors, product suite, build.

### P1-1 — Neutral EN builder placeholders (D3)
- **Problem:** EN default shows India+IT example strings on an empty global product.
- **Root cause:** RC-3.
- **Solution:** replace builder-owned keys in `src/locales/en/en.json` with neutral
  instructional text matching the JSX fallbacks (9 keys: HeadingStep first/last name,
  jobTitle, email, phone, address, city, postalCode, country; WorkHistoryStep jobTitle;
  WorkHistoryStep company; EducationStep school/degree/startDate/endDate/description;
  SkillsStep skillName; ProjectsStep title/url; CertificationsStep title/issuer/date;
  AchievementsStep title; ReferencesStep name/reference; CustomSectionsStep
  sectionTitle/itemTitle). No other locale files touched (language-specific locales may keep
  localized examples — that's translation content, not the global EN default).
- **Files:** `src/locales/en/en.json` only (builder keys).
- **Why:** builder-owned i18n keys; user-visible defect is the builder's first impression.
- **Risk:** low; tests referencing placeholder strings re-run in the 442 gate.
- **Benefit:** empty state is globally neutral; no profession/region assumption before the
  candidate provides any context.
- **Validation:** product suite + re-shoot of empty heading at 1440/390.

### P1-2 — Single JD source of truth + useful ATS drawer (D4)
- **Problem:** ATS drawer opens collapsed/empty; meter's JD (localStorage) never syncs with
  the resume document's `targetJobDescription`.
- **Root cause:** RC-4.
- **Solution:** `AtsScoreMeter` accepts optional `jobDescription` + `onJobDescriptionChange`
  props; document value wins over localStorage (fallback preserved); BuildResume passes
  `resumeData.targetJobDescription` and writes updates back through `updateResumeData`;
  drawer renders the meter `defaultExpanded` (new prop, default false — mobile drawer stays
  collapsed to preserve its compact behavior… decision: both drawer call-sites expanded;
  the meter instance elsewhere keeps default).
- **Files:** `src/components/BuildResume/AtsScoreMeter.jsx`,
  `src/components/BuildResume/BuildResume.jsx` (2 call sites).
- **Why / risk:** builder-internal; localStorage fallback keeps legacy local JDs working;
  product suite + browser check (paste JD in Review → drawer shows match % + chips).
- **Benefit:** ATS becomes immediately useful; JD context truly global.
- **Validation:** browser probe (JD in Review → meter match appears) + product suite + build.

### P2 (with P0-2 scope, trivial) — Remove stray City hint (RC-5)
- `HeadingStep.jsx`: drop `hint={getDynamicPlaceholder('heading','city',…)}` (placeholder
  already says it). One line; user-visible rendering artifact removed.

**Explicitly NOT doing (scope discipline):** index.scss z-1 trap (portal fix stands),
estimateExperienceYears behavior, DOMAIN_ANCHOR_TERMS, other locale files, app-shell bottom
nav, StepGuide breakpoint, guide-wording dedupe, dead i18n key, template modal heading margins
(assessed after P0-2 re-shoot; only fix if still wrong).

---

## 8. CLAIM VERIFICATION (independent re-run, this audit)

| Claim | Independent result | Status |
|-------|--------------------|--------|
| FE product 442/442 | 442/442 PASS, EXIT=0 (/tmp/audit-fe-product.log) | VERIFIED |
| FE security static 44/44 | 44/44 PASS, EXIT=0 (/tmp/audit-fe-security.log) | VERIFIED |
| Backend 578/612, 34 env-only | 578/612, 34 fail; sorted failure-name list **byte-identical** to baseline `e77da46` (worktree /tmp/rp-baseline); all signatures ECONNREFUSED :3306 / 503 fail-closed; 0 failures in the 3 modified backend test files | VERIFIED (PARTIAL by nature — no MariaDB in sandbox; reported as 578/612, never "all pass") |
| Browser journeys 48/48 | Re-run in final validation phase (harness committed) | PENDING re-run |
| Production build PASS | PASS ~4.3s (chunk-size warnings only) | VERIFIED |
| 12 steps, 6 portaled overlays, 12 deleted components | Confirmed by read + git diff stat (+5,621/−10,815, 49 files) | VERIFIED |
| Zero hardcoding (no profession registries, no candidate data) | grep sweep clean; dynamicPlaceholders neutral; no 20/50/100 registries anywhere in builder+utils | VERIFIED |

---

## 9. POST-FIX IMPLEMENTATION & VALIDATION RECORD (2026-09-03)

### Additional finding discovered during adversarial validation
- **P1-3 (found by probe A2a):** `candidateContext.js` derived the declared role as
  `data.occupation || data.title || …` — `data.title` is the *document name* (default
  "Untitled Resume"). Resumes without a declared occupation therefore carried
  `role: "Untitled Resume"` into the AI evidence payload, `profileHash`, and job-title
  suggestions. Fixed: `data.title` removed from the chain; headline now falls back to the
  candidate's own current role. Proven by node-level before/after (role "Untitled Resume" → ""
  / own current role) + regression test.

### Files changed (11)
| File | Change |
|------|--------|
| `src/components/BuildResume/BuildResume.jsx` | P0-1 `isStepCompleted` (alias map + `employments`); P0-2 `rp-builder-scope` on root + 4 portaled surfaces; P1-2 meter JD props + `defaultExpanded` on desktop drawer |
| `src/components/BuildResume/AtsScoreMeter.jsx` | P1-2 `jobDescription`/`onJobDescriptionChange`/`defaultExpanded` props; document JD wins, localStorage fallback retained |
| `src/tailwind.css` | P0-2 legacy h1–h5 rules exclude `.rp-builder-scope` (h6 untouched; documented) |
| `src/locales/en/en.json` | P1-1 25 builder placeholder keys → neutral instructional text (byte-exact roundtrip; no other keys touched) |
| `src/utils/candidateContext.js` | P1-3 document title excluded from declared role |
| `src/components/BuildResume/steps/HeadingStep.jsx` | P2 stray City hint removed + unused import removed |
| `tests/build-resume-completion-state.test.mjs` | NEW — 9 regression tests (P0-1 ×3, P0-2 ×2, P1-1, P1-2, P1-3, P2) |
| `tests/ats-module-toggle.test.mjs` | assertion updated to multi-line call-site form (intent preserved: exactly 2 meter mounts) |
| `tests/ats-score.test.mjs` | assertions updated + strengthened (now also pins JD wiring at both call sites) |
| `package.json` | new test file added to `test:product` |
| `docs/AUDIT_BUILD_RESUME_ACCEPTANCE_20260903.md` | this document |

### Validation matrix (all post-fix, independent re-runs)
| Suite | Result |
|-------|--------|
| FE product (`test:product`, 4 stages) | **451/451 PASS, 0 fail** (439+1+8+3; was 442 pre-fix, +9 new regression tests) |
| FE security static | **44/44 PASS, EXIT=0** |
| Backend (`npm --prefix backend test`) | **578/612, 34 fail — sorted failure-name list byte-identical to baseline `e77da46`** (all ECONNREFUSED :3306 / 503 fail-closed; no MariaDB in sandbox; 0 failures in modified files) |
| Production build (`npm run build`) | **PASS 3.78s** (known warnings only: lottie eval, chunk size) |
| Browser journeys (committed harness, 6 viewports × 8) | **48/48 PASS** |
| Adversarial probe (A1–A6, 27 checks) | **27/27 PASS** (novel role, own-data autocomplete, rapid typing, JD propagation, completion truthfulness, AI safe fallback; 0 page errors) |
| Visual re-shoot (6 viewports × 12 steps + overlays × empty/doctor) | **167 shots, 0 page errors in all viewports/modes**; before/after review confirms P0-2 type scale, P1-1 placeholders, P2 hint, P0-1 completion, P1-2 drawer |

### Explicit non-changes (scope discipline)
`src/index.scss` z-1 trap untouched (portal fix stands); `estimateExperienceYears` behavior
unchanged (24-month assumption documented); `DOMAIN_ANCHOR_TERMS` untouched (score behavior);
other locale files untouched (translation content); app-shell bottom nav, StepGuide
breakpoint, guide wording dedupe, dead i18n key — all documented, left unchanged.
No push, no deploy, no tag, no production change. Restore refs intact.
