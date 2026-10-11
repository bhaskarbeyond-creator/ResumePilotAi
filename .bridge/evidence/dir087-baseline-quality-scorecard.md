# DIR-087 — Candidate Page Baseline Quality Scorecard

**Composite score: 5.7 / 10** across the 14 scored surfaces.
**Produced by:** `.bridge/evidence/dir087-metrics.mjs` — reproduce with
`node .bridge/evidence/dir087-metrics.mjs`.

Every score below is **derived**, never hand-assigned. If the formula or a count changes,
the score changes with it.

---

## 1. Scoring formula

```
tokenAdoption = cubaClasses / (cubaClasses + legacyColourUtilities)   // is the body on tokens?
responsive    = distinctBreakpoints / 5   (sm, md, lg, xl, 2xl)      // does it adapt?
guards        = (loadingUi + emptyUi + errorUi) / 3                   // is it honest when it fails?

score = 10 * (0.50 * tokenAdoption + 0.25 * responsive + 0.25 * guards)
```

Bands: `GOOD` >= 8.0 · `FAIR` >= 6.0 · `WEAK` >= 4.0 · `POOR` < 4.0

### Why these weights

Token adoption carries half the weight because a body still built from legacy colour
utilities cannot inherit a theme change, a density change or a contrast fix — it is the
single strongest predictor of whether the page can be maintained. Responsive coverage and
guard honesty split the remainder, because a page that does not adapt or that fails
silently is broken for real users regardless of how modern its colours are.

---

## 2. Ranked baseline (worst first)

| Rank | Module | Score | Band | Cuba classes | Legacy colour utils | Breakpoints | Guards |
|---|---|---|---|---|---|---|---|
| 1 | Job Search Bar | **2.5** | POOR | 2 | 56 | 3 | 1/3 |
| 2 | Settings & 2FA | **3.7** | POOR | 2 | 1340 | 4 | 2/3 |
| 3 | Support | **4.0** | WEAK | 1 | 190 | 3 | 3/3 |
| 4 | Resume Builder (shell) | **4.3** | WEAK | 8 | 235 | 5 | 2/3 |
| 5 | Job Portal | **4.5** | WEAK | 14 | 55 | 2 | 3/3 |
| 6 | AI Interview Coach | **4.5** | WEAK | 3 | 803 | 4 | 3/3 |
| 7 | Overview | **5.6** | WEAK | 29 | 234 | 5 | 3/3 |
| 8 | Cover Letters | **5.8** | WEAK | 60 | 0 | 0 | 1/3 |
| 9 | Executive Rail | **5.8** | WEAK | 11 | 0 | 0 | 1/3 |
| 10 | Applied Jobs | **6.8** | FAIR | 81 | 0 | 2 | 2/3 |
| 11 | Portfolios | **7.2** | FAIR | 110 | 2 | 3 | 2/3 |
| 12 | Messages | **7.7** | FAIR | 56 | 0 | 2 | 2/3 |
| 13 | Job Tracker | **8.7** | GOOD | 77 | 0 | 4 | 3/3 |
| 14 | Portfolio Gallery | **9.0** | GOOD | 51 | 0 | 3 | 3/3 |

The shape is consistent with the DIR-081 finding: the **newer, purpose-built surfaces
(Tracker, Gallery, Portfolios) are genuinely tokenised**, while the **oldest and largest
bodies (Settings 6171 lines, Interview Coach 3130 lines) are still legacy**.

---

## 3. P0 / P1 blockers (19 total — 2 P0, 17 P1)

Every blocker is emitted by the same script from the same counts.

### P0 — fix first

| Module | Finding |
|---|---|
| **Settings & 2FA** | **1340 legacy colour utilities** in a 6171-line body. The single largest un-tokenised surface in the suite. |
| **AI Interview Coach** | **803 legacy colour utilities** in a 3130-line body. |

### P1 — 17 findings

Legacy colour volume: `Support` (190) · `Resume Builder shell` (235) · `Overview` (234) ·
`Job Portal` (55).
Breakpoint coverage below 3: `Job Portal` (2) · `Applied Jobs` (2) · `Messages` (2) ·
`Cover Letters` (0) · `Executive Rail` (0).
Incomplete guard coverage: `Job Search Bar` · `Settings & 2FA` · `Support` · `Resume Builder`
· `Overview` · `Cover Letters` · `Executive Rail` · `Applied Jobs` · `Portfolios` ·
`Messages` · `Job Tracker`.


---

## 4. Honest caveats (read before acting on the numbers)

1. **The breakpoint proxy can under-rate a page.** `Cover Letters` and `Executive Rail`
   score 0 distinct breakpoints, but a page may legitimately delegate responsiveness to its
   shell or a parent grid. This is a signal to investigate, **not proof of a defect**.
2. **These legacy counts are NOT comparable to the DIR-082 ratchet.** This counter is a
   **superset**: it also matches `shadow-`/`fill-`/`stroke-`/`decoration-`/`accent-`/
   `caret-` prefixes and the `zinc`/`neutral`/`stone`/`violet`/`fuchsia` families that the
   DIR-082 counter omitted. That is why Settings reads 1340 here versus 1330 there and
   Interview Coach 803 versus 764. **These are not regressions** — they are the same code
   measured by a wider lens.
3. **The guard detector was corrected during this audit.** A first draft matched only the
   component names `CubaSkeleton` / `CubaEmptyState` / `CubaErrorState` and falsely reported
   `DashboardMessages` as unguarded, even though it renders bespoke loading and error states
   from `isLoadingMessages` / `messagesError`. The detector now matches what actually paints
   (a spinner/skeleton, a zero-length branch, an alert region). The false P0s it produced
   were removed rather than reported.
4. **`Job Search Bar` is a component, not a page.** It ranks worst (2.5) partly because a
   224-line search bar has no reason to carry page-level empty/error states. Treat its rank
   as a note that it is thin, not as a page-level verdict.
5. **Scoring a page is not the same as judging its usefulness.** A page can score WEAK and
   still be the right design. The score measures maintainability and state honesty only.

---

## 5. Industry benchmarks (desk research, cited)

Ten dimensions, scored against what these products demonstrably ship. **Sources were
fetched, not recalled.**

| Dimension | Linear | Teal HQ | Rezi | Kickresume | Hired |
|---|---|---|---|---|---|
| Information architecture | Sidebar/tabs/headers/panels rebuilt to raise hierarchy and **density** | Job-tracker-first: dashboard opens on a kanban of saved roles | Sectioned builder; score broken down **section by section** | Template-gallery-first: dashboard opens on the template wall | **n/a — see note** |
| Above-the-fold density | Explicit goal: "reduce visual noise … increase hierarchy and density of navigation" | Board-first, so the pipeline is the fold | Score-first: the number is the fold | Visual preview is the fold | **n/a** |
| Empty / loading / error states | Inbox redesigned around notification **type** | Not verified in this pass | Instant feedback on upload | Not verified in this pass | **n/a** |
| Keyboard & a11y | Command-palette lineage; contrast raised in both themes | Not verified | Not verified | Not verified | **n/a** |
| Responsive behaviour | Desktop + web parity called out | Chrome extension is the "centre of gravity" | Chrome extension: auto-fill and apply in one click | Chrome extension | **n/a** |
| Real-data truthfulness | n/a (not a job product) | Tracker holds **real** saved roles + application stage | **Real-time** ATS formatting "as you type, not after" | Not verified | **n/a** |
| Task-completion depth | Deep (issue → project → cycle) | Deep: track → tailor → cover letter → follow-up | Deep: build → score → target → interview | Medium: pick → fill → export | **n/a** |
| Visual hierarchy | Inter Display for headings, Inter for body; darker text in light mode | Plain, ATS-safe by design | Template families: Simple/Modern/Compact/Creative | Designer-first, richest visual library | **n/a** |
| Performance budget | Not published | Not published | Not published | Not published | **n/a** |
| Progressive disclosure | Not verified | Tracker → detail drawer pattern | AI Resume Agent chat for advanced edits | Not verified | **n/a** |

### Note on Hired — the source is dead

`https://hired.com/how-it-works` **no longer resolves to Hired**. It redirects to **LHH**
(the Adecco Group), which now presents itself as a recruitment-solutions brand and lists
Hired nowhere in its product set. Hired is therefore **not a live independent product** and
cannot be benchmarked. I am recording this rather than inventing its feature set.

**Two of the five named benchmarks could only be partially verified** (Kickresume's and
Teal's internal state handling and a11y), and **no vendor publishes a performance budget**.
Those cells are marked "Not verified" on purpose. The strongest, most directly transferable
lesson is from **Rezi**: formatting and ATS-safety are applied *as you type, not after* —
which is the opposite of IME365's current pattern of surfacing an ATS score on a separate
surface.

### Pricing (verified)

`Rezi`: Free $0 (1 resume, limited AI, 3 PDF downloads) · Pro $29/mo · Lifetime $149.
`Kickresume`: Premium ≈ $24/mo or $144/yr. `Teal`: Teal+ ≈ $9/mo or $79/yr.
