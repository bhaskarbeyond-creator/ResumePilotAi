# ATS Score Meter — Hardening forensic report

Date: 2026-08-18  
Branch: `arena/01a016a4-resumepilotai`  
**Not deployed.**

## 1. Baseline SHA

Inspected after fetch:

- Working tree at start of this pass: `4e22a36`
- Confirmed present: `7e9d8d6`, `eeaf1df`, `4e22a36`
- `origin/arena/01a016a4-resumepilotai` == HEAD (0/0)
- `origin/main` had no newer commits
- No unrelated local work was overwritten

## 2. Final SHA

`5c82e7a` — `fix(ats): calibrate JD blend, harden matching, and finish regression gates`  
Ancestry: `bb0a804` → `7e9d8d6` → `eeaf1df` → `4e22a36` → `5c82e7a`.

## 3. Exact scoring formula

Category weights are unchanged (still justified; not reshuffled to inflate numbers):

```
Contact            10
Summary            10
Experience         28
Education           8
Skills             14
Projects & proof   14
Integrity          16
────────────────────
quality            100
```

Displayed score:

```
no JD:   round(quality × 0.92)
with JD: round(quality × 0.76 + jdMatch × 0.24)
```

The held 8% without a JD is **target alignment**. Without a job the meter cannot honestly answer “how good is this for the role I want?” That reserve is why a highly relevant JD can outscore the same resume with no JD, while an unrelated JD falls below it.

## 4. Weighting rationale

| Weight | Why it stays |
| --- | --- |
| Experience 28 | Core ATS + recruiter evidence |
| Integrity 16 | Stuffing must *hurt*, not merely fail to help |
| Evidence 14 | Projects/certs/achievements contribute only with substance |
| Skills 14 | Coverage without laundry-list volume |
| Contact 10 / Summary 10 / Education 8 | Necessary, easy to game if over-weighted |

Integrity was tightened **inside** the same 16 points: “no stuffing” now requires narrative, and diversity only pays when there is enough text to judge. That is a condition change, not a redistribution.

## 5. JD matching results

Verified extract + match for:

- React / React Native (React kept only if it appears standalone)
- Machine Learning, Deep Learning
- Spring Boot
- Google Cloud Platform
- AWS Lambda
- CI/CD (`ci-cd`, `cicd`)
- Node.js (`nodejs`)
- .NET (`dotnet`)
- C# (`csharp`)
- C++ (`cpp`)
- SQL
- Power BI
- Product Management

`compactToken` no longer strips `#`/`+`, which had been collapsing `C#` to `c`.

Missing keywords are length-prioritized and the UI shows at most 4 groups × 4 terms.

## 6. Anti-stuffing results

| Case | Result |
| --- | --- |
| 10 natural Python mentions | Not stuffed; scores higher |
| 30× Python block + pasted “responsibilities/requirements” | Stuffed; summary capped; integrity crushed |
| Repeated `10%` | Unique metrics only |
| Duplicate bullets | Count once |
| Duplicate skills `AWS` / `aws` | One skill slot |
| Title-only “AWS” project | 0 evidence points |
| Copied JD-like summary | Detected and capped |

## 7. All-section scoring verification

| Section | Behaviour |
| --- | --- |
| Projects | Needs body (substance, metric, or URL). Skill-name overlap only adds a point with an outcome/URL |
| Certifications | Name + issuer + date; filler title = 0 |
| Achievements | Title + substance + unique metric |
| References / languages | Informational only |
| Hobbies / keyword custom blocks | No JD inflation; stuffing can still penalize |

Wizard-shaped journey test: heading → summary → work → education → skills → projects → certs → achievements → references/languages. Score is non-decreasing; JD then changes the number.

## 8. UX findings

- Label is **ATS readiness**, not “Fortune 500 Ready”
- Collapsed by default
- Empty users see a short coach line and only Contact / Experience / Summary, not seven red cards
- Top actions are concrete (“Add 2 target-JD terms you genuinely have…”, “Improve 2–3 bullets…”)
- Disclaimer states this is **not** Workday / Greenhouse / Lever / Taleo and does not predict interviews
- JD apply is explicit (no per-keystroke JD recompute)

## 9. Accessibility findings

- Spoken gauge: “ATS score X out of 100, {status}”
- `aria-expanded`, focus rings, status word + numeric score
- Not re-certified with a screen reader in a real browser (Chromium unavailable)

## 10. Mobile findings

- Widget is in the mobile nav overlay as well as the desktop sidebar
- Expanded panel still `max-h-[28rem]` with internal scroll
- No live device pass (no Chromium)

## 11. Performance measurements

100 skills + 20 jobs + 20 projects + 20 certs + long summary + long JD: **~19 ms** on this host, no network.

## 12. Multilingual findings

- Unicode matching is safe
- Hindi / French / German / Spanish resumes are not English-verb-scolded
- Widget strings translated for **en, de, es, fr, hi**
- Other locales carry English `AtsScoreMeter` keys so i18n coverage stays ≥95%
- Full semantic scoring of non-English verbs is **not** implemented

## 13. Real /build-resume journey results

Executed:

- Vite `http://127.0.0.1:5173/build-resume` → **200**, HTML + hot `AtsScoreMeter.jsx`
- Data-layer wizard journey test (above) → pass

**Not executed:** click-through in a real browser (Playwright Chromium download failed with `ECONNRESET`). Do not treat the UI as browser-certified.

## 14. Full regression results

| Gate | Result |
| --- | --- |
| `npm run build` | **Pass** (Vite 8, 4.02s) |
| `npm run test:security` | **144/144 pass** (after `backend` `npm install`) |
| `npm run test:templates` | **72/72 pass** (after backend deps) |
| `npm run test:product` | **Pass** after locale keys restored coverage |
| ATS unit + journey | **24/24 pass** |
| extras / i18n / forensic-rc | **Pass** |
| `npm run test:templates:browser` | **Not run** — Playwright Chromium missing |

## 15. Browser / Chromium results

**Failed to install.** `npx playwright install chromium` could not download Chrome for Testing. Gate correctly refused to launch.

## 16. Adversarial score matrix

| Resume | Expected | Final |
| --- | --- | ---: |
| Empty | Very low | **0** |
| Basic | Low / moderate | **41** |
| Strong, no JD | High readiness | **90** |
| Strong + relevant JD | Higher than no JD | **97** |
| Strong + unrelated JD | Lower than no JD | **74** |
| Keyword stuffed | Penalized | **25** |
| Metrics stuffed | Penalized vs strong | **43** |
| Skills only | Low | **18** |
| Projects added to basic | Meaningful lift | **47** |
| Certification added to basic | Meaningful lift | **45** |
| Achievement added to basic | Meaningful lift | **45** |

Surprises worth explaining:

- Strong no-JD is 90, not 100, because 8% is reserved for unknown target fit.
- Partial JD match on an otherwise strong resume can sit between unrelated (74) and fully aligned (97). That is the 76/24 blend doing its job.
- Basic integrity is no longer a free 16 points.

## 17. Remaining limitations

1. Not an employer ATS simulator.
2. Non-English action-verb coaching is withheld, not replaced with language-specific verbs.
3. 11 locales still use English widget copy (keys exist for coverage).
4. JD extraction can still keep a weak leftover bigram from a messy posting.
5. No Chromium / a11y / visual mobile certification in this environment.
6. A complete honest resume can still reach the high 90s with a tight JD — rare, and now requires both quality and fit.

## 18. Honest final rating

**8.7 / 10**

Up from 8.6 because the score order now matches the product question, stuffing/JD punctuation cases are tighter, locales no longer break `test:product`, and build/security/templates/product actually ran.

Not 10: no real browser journey, incomplete widget translations, heuristic JD extraction, no employer-ATS fidelity.

Worth fixing now? Only the Chromium journey, and only in an environment that can download browsers. Do not fake it.

## 19. Git status

Work is on `arena/01a016a4-resumepilotai` only. Deployment was not performed.
