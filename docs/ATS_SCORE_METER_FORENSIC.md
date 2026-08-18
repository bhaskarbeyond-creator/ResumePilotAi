# ATS Score Meter — Final product decision

Date: 2026-08-18  
Branch: `arena/01a016a4-resumepilotai`  
**Not deployed.**

## 1. Baseline SHA

After fetch:

- Recovered `origin/arena/01a016a4-resumepilotai` at `13706ad`
- Ancestry: `bb0a804` → `7e9d8d6` → `eeaf1df` → `4e22a36` → `5c82e7a` → `13706ad`
- `origin/main` had no newer commits
- Local branch was reset to `13706ad` (clean) before this pass

## 2. Final SHA

See the commit created at the end of this pass.

## 3. Scoring architecture

**Decision: OPTION B — two independent numbers.**

| Dimension | What it answers | Range |
| --- | --- | --- |
| ATS Readiness | How strong / parseable is this resume? | 0–100 |
| Target job match | How well does it cover *this* JD? | Not provided, or 0–100% |

They are not blended.

## 4. Combined-vs-separate decision

The 92% no-JD ceiling was a hack to make a *combined* number sort correctly. It failed the product test:

- **Why 8%?** There was no empirical ATS reason. It was invented so `quality × 0.76 + match × 0.24` could outscore no-JD.
- **Should an excellent resume without a JD be capped at 92?** No. The user has not failed a job match; they have not *asked* one.
- **Understandable?** No. “94 became 86 because I did not paste a posting” is not a coaching message.
- **Frustrating?** Yes, especially for students and career-switchers who build a resume first.

Adversarial proof that a single blended number lies:

| Resume | Readiness | JD match | Old blend |
| --- | ---: | ---: | ---: |
| Strong, no JD | 98 | — | 90 (punished) |
| Strong + pediatric-nurse JD | 98 | 0% | 74 (looks worse than a mediocre resume) |
| Keyword-stuffed + SWE JD keywords | 33 | high | can approach the mid-50s and look “closer” than it is |

Two numbers stay honest:

- Strong + nurse JD: **Readiness 98 / Job match 0%**
- Stuffed + SWE keywords: **Readiness 33 / Job match high** — the user can see the cheat

## 5. Final scoring formula

Readiness categories (unchanged weights):

```
Contact            10
Summary            10
Experience         28
Education           8
Skills             14
Projects & proof   14
Integrity          16
────────────────────
ATS Readiness     100
```

`ATS Readiness = quality`. No 0.92 factor. No 0.76/0.24 blend.

`Target job match = matched distinctive terms / extracted terms`, or **Not provided**.

## 6. JD matching matrix

| Term | Extract | Match notes |
| --- | --- | --- |
| React Native | yes | Multi-word |
| React | yes if standalone | Not inferred only from React Native |
| Machine Learning / Deep Learning | yes | |
| Spring Boot | yes | |
| Google Cloud / Google Cloud Platform | yes | |
| AWS Lambda | yes | |
| CI/CD | yes | `ci-cd`, `cicd` |
| Node.js | yes | `nodejs` |
| .NET | yes | `dotnet` |
| C# / C++ | yes | `csharp` / `cpp` |
| SQL / Power BI / Kubernetes / Docker / PostgreSQL | yes | |
| Java vs JavaScript | JavaScript does **not** satisfy Java | Word-boundary + `java(?!script)` |
| C vs C++ vs C# | Do **not** cross-match | `c` cannot consume `c++` / `c#` |
| “Need Java” | not extracted as a phrase | Weak heads (`need`, `hiring`, …) dropped |

## 7. Anti-gaming matrix

| Case | Result |
| --- | --- |
| Natural strong resume | Readiness 98 |
| Keyword stuffed | Readiness 33, integrity crushed |
| JD copied into summary | Summary capped (posting language) |
| Keyword block in custom section | Stuffing on full-resume text |
| Repeated skills | Deduped |
| Repeated metrics / verbs / bullets | Unique only |
| Same skill in Skills + empty project + cert title | No triple-count; empty project = 0 |
| Irrelevant hobbies/references | Do not change readiness or invent JD hits |
| HTML/whitespace empties | 0 |
| Huge skills list | Laundry-list penalty |
| Stuffed vs strong | 33 < 98 |

## 8. Section coverage

| Section | Readiness | How / max | JD match | Abuse |
| --- | --- | --- | --- | --- |
| Heading | Yes | Contact 10 | Tokens only | Invalid email scores less |
| Summary | Yes | 10; stuffed/pasted cap 3 | Yes | Keyword dump / pasted JD |
| Work history | Yes | 28 unique roles/bullets/verbs/metrics | Yes | Duplicate bullets ignored |
| Education | Yes | 8 | Weak | Presence not 15 anymore |
| Skills | Yes | 14 unique, 8–16 sweet spot | Yes | 28+ list penalized |
| Projects | Evidence ≤6 | Needs body/metric/URL | Yes | Title-only “AWS” = 0 |
| Certifications | Evidence ≤4 | Name + issuer + date | Yes | Filler title = 0 |
| Achievements | Evidence ≤4 | Substance / unique metric | Yes | Empty HTML = 0 |
| Custom | ≤2 leftover | Only with substance | Yes (and stuffing) | Keyword blocks hurt integrity |
| References | Informational | 0 points | No | — |
| Languages | Informational | 0 points | Tokens only | — |
| Hobbies | No | 0 | Should not inflate | Ignored for points |

## 9. UX findings

- Gauge is **ATS readiness** only
- Collapsed row also shows **Target job match: Not provided** or **N% match**
- Combined “blend hint” removed
- Empty users: 3 categories + coach line
- Recommendations stay concrete
- Widget tightened (`p-3`, smaller gauge, `max-h-[min(22rem,50vh)]`)
- Disclaimer still names Workday / Greenhouse / Lever / Taleo

## 10. Mobile findings

- Same compact widget in the mobile nav
- Horizontal overflow is asserted in the browser script **when a browser can launch**
- Not visually certified here (see §13)

## 11. Localization matrix

All **16** locales now have a full `AtsScoreMeter` object (title, gauge, JD strings, empty coach, disclaimer, category names):

`en de es fr hi it nl pt pl ru dk no se ro is gk`

Interpolation tokens match English.

## 12. Performance

100 skills + 20 jobs + 20 projects + 20 certs + long summary + long JD: **~23 ms**, no network.

## 13. Real /build-resume browser journey

Attempted, **not executed**:

| Approach | Result |
| --- | --- |
| System Chrome/Chromium | Not installed |
| `npx playwright install chromium` | TLS reset to Playwright CDN |
| `@puppeteer/browsers install chrome` | TLS reset to googlechromelabs |
| `apt-get install chromium` + NSS libs | Debian mirrors connection failed |
| `@sparticuz/chromium` via npm | **Succeeded** — unpacked ELF `/tmp/chromium-bin` (200 MB) |
| Launch that ELF | **Failed**: `libnspr4.so` / `libnss3.so` missing |

A Playwright journey script is in `tests/ats-score-browser.mjs`. It exits `2` (`BROWSER_UNAVAILABLE`) in this sandbox. I am **not** claiming a click-through of heading → … → PDF/DOCX.

Wizard *data* journey (`tests/ats-score-journey.test.mjs`) still passes: score is non-decreasing by section; JD changes match, not readiness.

## 14. PDF validation

`npm run test:templates` — **72/72**, including production composer render of all 51 templates. ATS code is not on the render path.

## 15. DOCX validation

Included in `test:templates` emptiness/DOCX parity and `test:product` (`create-resume-extras`, `docx-client-journey`). Pass. No ATS imports in DOCX builders.

## 16. Full regression

| Gate | Result |
| --- | --- |
| `npm run build` | Pass |
| `npm run test:security` | Pass (after backend `npm install`) |
| `npm run test:templates` | 72/72 |
| `npm run test:product` | 238 + render suites pass |
| ATS unit + journey | 25 + 1 pass |
| `npm run test:templates:browser` | **Not runnable** (same Chromium/libs gap) |
| `tests/ats-score-browser.mjs` | Exit 2 |

## 17. Remaining limitations

1. Not an employer ATS.
2. Non-English verbs are *not scored as verbs*; they are not falsely penalized.
3. JD extraction can still keep a leftover bigram on messy postings.
4. **No real browser / PDF-button / refresh-persistence click-through in this environment.**
5. Persistence after refresh still requires a signed-in draft (pre-existing).

## 18. Honest ratings

| Area | Score | Note |
| --- | ---: | --- |
| Algorithm | 8.8 | Separate dimensions are the correct model |
| JD matching | 8.5 | Java/C family collisions fixed |
| Anti-gaming | 8.7 | Stuffed cannot beat strong |
| UX | 8.4 | Clearer; not visually signed off |
| Accessibility | 8.0 | Labels present; no SR pass |
| Mobile | 7.5 | Code-level only |
| Localization | 8.6 | All 16 locales filled |
| Performance | 9.2 | ~23 ms, sync |
| PDF/DOCX safety | 9.0 | Isolated; gates green |
| Browser validation | **3.0** | Script exists; cannot launch Chrome |
| Regression coverage | 8.8 | Product/security/templates green |

**Overall: 8.3 / 10**

Down from the previous 8.7 on honesty: we rejected the 92% ceiling (correct) but still have not run the mandatory UI journey. This is **not** production-ready until Chromium can launch.

## 19. Git status

Work is only on `arena/01a016a4-resumepilotai`. **Not deployed.**
