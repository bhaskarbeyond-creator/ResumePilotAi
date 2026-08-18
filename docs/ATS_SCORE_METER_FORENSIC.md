# ATS Score Meter — Forensic Report

Date: 2026-08-18  
Branch: `arena/01a016a4-resumepilotai`  
Baseline HEAD inspected: `bb0a804` (`feat(custom-section): add (Continued) title support for custom sections in SmartFlowRenderer`)  
`origin/main` at start of work: identical to `bb0a804`. No local uncommitted work was overwritten.

This work is **not deployed**. Deployment waits on explicit approval.

Honest product rating after this pass: **8.6 / 10**.  
It is a useful, explainable, stuffing-resistant coaching meter. It is not a 10/10 employer ATS simulator, not multilingual-scoring complete, and not browser-validated in this environment.

---

## 1. Current ATS architecture (after this work)

| Layer | Path | Role |
| --- | --- | --- |
| Scoring engine | `src/utils/atsScore.js` | Pure, synchronous, no React, no network |
| Widget | `src/components/BuildResume/AtsScoreMeter.jsx` | Presentation only; re-exports `calculateAtsScore` |
| Host | `src/components/BuildResume/BuildResume.jsx` | Desktop sidebar + mobile nav; `onNavigate` to wizard steps |
| Persistence | `sessionStorage` key `rpai.ats.targetJd` | JD stays on-device; **not** written into the resume document |
| Tests | `tests/ats-score.test.mjs` | Formula, JD match, stuffing, extras, multilingual, UI wiring |

The engine is isolated from template rendering, PDF, DOCX, and autosave.

Score updates on every `resumeData` change via `useMemo`. JD text is applied on an explicit **Update match** click so typing a long JD does not recompute on every keystroke.

No API call is made for the instant score.

---

## 2. Existing scoring formula (baseline, pre-change)

Inspected in `AtsScoreMeter.jsx` at `bb0a804`. The previous SWOT numbers were still accurate.

```
Contact    = name 5 + email 4 + phone 3 + location 3          → 15
Experience = any job 10 + 2 “bullets” 10 + 2 verb hits 8
             + 1 metric regex hit 7                           → 35
Education  = any row 10 + degree AND school 5                 → 15
Skills     = ≥3 skills 10 + ≥6 skills 10                      → 20
Summary    = ≥40 chars 8 + ≥100 chars 7                       → 15
────────────────────────────────────────────────────────────
Total      = min(100, sum)
```

JD matcher was a separate widget:

- tokenize with `/\b[a-z]{3,}\b/g`
- drop a tiny English stopword list
- take first 15 unique tokens
- `JSON.stringify(resume).includes(keyword)`

It was **not** part of the numeric score.

There were **no ATS unit tests** before this work.

---

## 3. Problems found

1. **Projects / certifications / achievements / custom / languages / references / hobbies were ignored.**
2. **Presence-only scoring.** Six skills, 100 summary characters, or one `10%` were enough to max a category.
3. **Keyword stuffing won.** Old formula scored the stuffed fixture **83 / 100**. The same fixture is now **27**.
4. **Action verbs used `String.includes`.** `"led"` matched `"settled"`. Duplicates stacked.
5. **Metrics accepted years and repeated the same `10%`.**
6. **JD matcher missed `Node.js`, `CI/CD`, `React Native`, Unicode, and hyphen/slash variants.** It also scanned JSON punctuation noise.
7. **English-only coaching** would have flagged every non-English resume for missing verbs.
8. **UX was a number + gamified labels** (`Fortune 500 Ready`) with no top actions, no strengths, no “why”.
9. **Accessibility:** no `aria-expanded`, no spoken score meaning, broken dynamic Tailwind (`border-${theme.bg}/20`).
10. **Desktop-only.** The meter lived in `hidden md:flex` sidebar.
11. **JD scan was not explainable** and dumped a wall of unigrams.

---

## 4. New scoring model (0–100)

Quality categories always sum to 100:

| Category | Max | What it actually measures |
| --- | ---: | --- |
| Contact | 10 | Parseable name, valid-looking email, 7+ digit phone, city/country |
| Summary | 10 | Useful length + lexical variety; stuffed summaries cap at 3 |
| Experience | 28 | Complete roles, **unique** bullets, unique action-led bullets **or** non-English structure, unique metrics, dates |
| Education | 8 | School + degree + date. Presence alone is not 15 points anymore |
| Skills | 14 | Unique skills, 8–16 sweet spot; 28+ laundry lists are penalized |
| Projects & proof | 14 | Quality of projects (≤6), certs (≤4), achievements (≤4). Filler titles earn 0 |
| Integrity | 16 | Anti-stuffing, diversity, dates, bounded skill list. Empty resume = 0 |

When a target JD is present:

```
displayed = round(quality × 0.76 + jdMatch × 0.24)
```

No JD → displayed = quality. The UI says so.

Languages, hobbies, and references are **informational only**. They do not add points.

---

## 5. Why each weighting was chosen

- **Experience 28** is the core ATS + recruiter signal.
- **Integrity 16** exists so stuffing *hurts* instead of merely failing to help.
- **Evidence 14** integrates the new Create Resume extras without letting a cert dump replace a job history.
- **Skills 14** rewards coverage, not volume.
- **Contact 10 / Summary 10 / Education 8** are necessary but easy to game if over-weighted (the old 15/15/15 split was).
- **JD 24% blend** answers “how good is this resume for *this* job?” without letting a keyword paste overwrite a hollow resume.

A resume cannot reach 95–100 by adding random numbers, repeating “Python”, or filling empty sections with “test”.

A genuinely complete, evidenced resume *can* reach 100 on quality. That is intentional. Stuffing cannot.

---

## 6. JD matching improvements

Maintainable, no giant synonym dictionary.

1. Pull special tokens (`Node.js`, `CI/CD`, hyphenates, 2–5 letter acronyms).
2. Pull capitalized multi-word phrases (`React Native`, `Machine Learning`, `AWS Lambda`).
3. Pull remaining content bigrams, skipping generic tails (`services`, `features`, `pipelines`).
4. Prefer longer phrases over their unigram parts.
5. Normalize Unicode NFKC; generate hyphen / slash / compact variants.
6. Match each keyword **once**.
7. Group missing terms: Technical Skills / Tools / Methodologies / Role-Domain.

Verified: `React Native`, `Machine Learning`, `Spring Boot`, `Google Cloud`, `CI/CD`, `Node.js`, `AWS Lambda`, `Product Management`, plus `nodejs` ↔ `Node.js` and `ci-cd` ↔ `CI/CD`.

---

## 7. Keyword stuffing protection

- Unique bullets, unique metrics, unique verbs only.
- Consecutive repeats (`python python python`) and low unique-token ratio flag stuffing.
- Any content token ≥8 occurrences or ≥14% share flags stuffing.
- Stuffed summaries cap at 3/10.
- Stuffed integrity caps at 6/16 (0 if empty).
- 28+ skills are treated as a laundry list.
- JD match counts a term once even if it is pasted 50 times.

Old stuffed fixture: **83**. New: **27**. It no longer beats a strong targeted resume (**87**).

---

## 8. Section coverage

| Section | Scored? | How |
| --- | --- | --- |
| Heading / contact | Core | Parseable identity |
| Summary | Core | Quality + anti-stuffing |
| Work history | Core | Roles, unique bullets, impact |
| Education | Core | School + degree + date |
| Skills | Core | Unique, bounded |
| Projects | Evidence | Title + substance + metric/URL/skill overlap |
| Certifications | Evidence | Name + issuer + date; filler = 0 |
| Achievements | Evidence | Title + substance + unique metric |
| Custom sections | Tiny leftover in evidence | Only if leftover cap remains and content has substance |
| Languages | Informational | Not points |
| Hobbies | Not scored | Stuffing magnet |
| References | Not scored | ATS typically ignores |

---

## 9. UX improvements

- Radial gauge kept; label is now **ATS Score XX / 100** plus **Excellent / Strong / Needs Improvement / Getting Started** (no “Fortune 500” gamification).
- Collapsed by default so it does not dominate the wizard.
- Expanded panel: strengths, **top 3** actions, per-category score / max / findings / recommended action, **Improve {section}** jump.
- JD drawer: matched count, missing count, grouped missing terms.
- On-device disclaimer: heuristic, not an employer ATS, not an AI audit.
- Mobile nav now hosts the same widget.
- JD stored in `sessionStorage` only.

---

## 10. Accessibility

- `aria-label` region, spoken gauge text (“ATS score 72 out of 100, Needs Improvement”).
- Expand control has `aria-expanded` + `sr-only` label + visible focus ring.
- Status is a **word**, not color alone.
- Score is also printed as `72 / 100`.
- Dynamic broken Tailwind color classes removed.

Remaining: full screen-reader pass in a real browser was **not** run here.

---

## 11. Responsive behavior

- Desktop: left sidebar, collapsed height ~90px.
- Expanded details: `max-h-[28rem]` + internal scroll so the footer/plan controls stay reachable.
- Mobile: same widget inside the slide-over nav (the previous meter was desktop-only).
- No overlay on the editor canvas.

Real device/browser layout was **not** visually certified in this environment.

---

## 12. Performance impact

- Pure CPU, no network, no debounce on resume scoring (the previous meter was already per-render).
- JD apply is explicit, so pasting a 4k JD does not recompute on each character.
- No new dependencies.

---

## 13. AI audit decision

**Not implemented.**

Reasons:

- The useful work is explainable heuristics. An opaque second score would compete with the meter.
- Sending resume + JD to a model is a privacy and cost change that is not required for the instant meter.
- Existing AI surfaces are already user-triggered; adding another one without a dedicated backend contract is not “architecturally safe” in this pass.

The UI states this clearly. Instant ATS Score ≠ AI Deep ATS Analysis.

---

## 14. Test matrix

`tests/ats-score.test.mjs` (18 tests, all passing):

- formula / weights = 100
- empty = 0; 0–100 bounds
- adversarial order A–L
- stuffing cannot beat targeted
- duplicate bullets/keywords do not stack
- multi-word / acronym / punctuation JD terms
- Node.js / CI/CD variants
- empty / filler / meaningful extras
- hobbies/references do not inflate JD score
- metrics + action-verb context
- French resume is not verb-scolded
- Unicode JD matching
- explainability payload
- no `fetch` / `generateUserAiContent`
- BuildResume desktop + mobile mount; renderer import untouched

Also added to `npm run test:product`.

---

## 15. Before / after scores on adversarial resumes

| Resume | Old | New quality | New with JD |
| --- | ---: | ---: | ---: |
| A. Empty | 0 | 0 | 0 |
| B. Basic | 58 | 49 | — |
| C. Strong (no JD) | 100 | 100 | — |
| D. Strong + target SWE JD | 100* | 100 | **87** (JD match 45% — missing ML / Spring / Lambda) |
| E. Strong + pediatric-nurse JD | 100* | 100 | **76** |
| F. Keyword-stuffed | **83** | 35 | **27** |
| H. Skills-only | 34-ish | **20** | — |
| L. French (no extras) | would miss verbs | **64** | no English-verb warnings |

\*Old JD match did not change the number.

Ordering now: strong targeted (87) > strong unrelated (76) > basic (49) > stuffed (27) > skills-only (20) > empty (0).

---

## 16. Regression results

Ran in this sandbox:

- `node --test tests/ats-score.test.mjs` → **18/18 pass**
- `tests/forensic-rc.test.mjs` → **pass** (including “never invent ATS facts”)
- `en.json` parses

Could **not** run here (no `node_modules`):

- `npm run build`
- `npm run test:product` (full suite; `jszip` / `i18next` missing)
- `npm run test:templates`
- `npm run test:security`
- `npm run test:templates:browser`

Create Resume extras, 51 templates, PDF/DOCX, persistence, and autosave were not modified in their pipelines. ATS is a sidecar.

---

## 17. Browser results

**Not run.** Chromium/Playwright and Vite deps are not installed in this environment. Do not treat the widget as browser-certified.

---

## 18. Git commit

`7e9d8d6` — `feat(ats): replace presence scoring with an explainable readiness meter` on `arena/01a016a4-resumepilotai`.

---

## 19. Deployment status

**Not deployed.** Waiting for explicit approval.

---

## 20. Remaining limitations (why this is not 10/10)

1. Heuristic, not a Greenhouse/Lever/Workday parser.
2. English action-verb coaching only; non-English is *protected*, not equivalently coached.
3. JD extraction can still pick a weak phrase from a messy posting.
4. A complete, honest resume can still hit 100 on quality — by design — which some users may read as grade inflation if they have not pasted a JD.
5. Locale strings beyond English use `t()` fallbacks; 15 other locale files were not translated in this pass.
6. No live browser / a11y / narrow-viewport certification here.
7. No optional AI audit (deliberate).
8. Integrity “no stuffing” on a *sparse but non-empty* resume can still look slightly generous.

Recommended follow-ups after approval: install deps, run `test:product` + `build` + a real `/build-resume` pass, then translate `AtsScoreMeter.*` in the other 15 locales.
