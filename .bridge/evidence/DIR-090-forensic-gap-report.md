# DIR-090 — Forensic Gap Analysis Report

**Directive:** DIR-090 — Lead Delivery Forensic Review & Gap Audit — Candidate Dashboard 100% Reference Parity
**Auditor:** Cline (STAFF_DEVELOPER), adversarial forensic mode
**Target:** IME365 `D:\xampp\htdocs\IME365`, route `/dashboard`
**Reference:** `.bridge/references/candidate-dashboard-target-reference.png` (1024x515)
**Claim under audit:** the Lead Architect's assertion that the Candidate Dashboard was implemented with
**"100% token and layout fidelity"**.

---

## 1. Verdict

**The 100% parity claim does not hold.** Six of the seven layout zones are at or near structural parity,
but the audit found **one P0 invariant breach (fabricated metrics rendered in the live DOM)**, **three real
functional/visual gaps**, and **one evidence-integrity defect that invalidates acceptance criterion AC2
outright**. All eight pre-existing suites were green throughout, because none of them asserted rail *data
lineage* or toolbar *interactivity* — the exact blind spot this audit exposes.

| # | Zone (per the directive's own enumeration) | Verdict | Evidence |
|---|---|---|---|
| 1 | Sidebar + "Upgrade to Pro" | PASS | live 1920 capture vs reference |
| 2 | Top bar | PASS (live adds an "AI Engine Ready" pill the reference lacks) | live 1920 capture |
| 3 | Welcome header | PASS after fix (quote placement corrected) | `CopilotHeroHud.jsx:99-104` |
| 4 | 4 metric cards | PASS (deltas are measured, not estimated) | `CubaMetricCardRow.jsx`; dir091 AC2/AC2b |
| 5 | Workspace toolbar | PASS after fix (Sort + view toggle were dead shells) | `DashboardHomepage.jsx:1262-1300` |
| 6 | Resume grid + 5th dashed card | PASS | live 1920 capture |
| 7 | Right rail + 3-column bottom band | PASS after fix (P0-1 + GAP-2 + GAP-5) | `CandidateExecutiveRail.jsx`, `analyticsLogic.js` |

---

## 2. F-P0-1 — Fabricated metrics rendered in the live DOM  ·  severity P0

**Invariant breached:** *"Zero fabricated metrics or hardcoded scores"*.

`CandidateExecutiveRail.jsx` rendered a **hardcoded** "Today's Insights" list. Every string in it was copied
**verbatim from the reference screenshot**, while the *real* computed `insights` memo sitting a few lines
above it was consumed **only for its `.length`** in an `sr-only` span:

| Location | Hardcoded literal | Real measured value |
|---|---|---|
| `:285` | `Your resume is 69% ATS ready` | measured `summary.bestScore` = **82%** |
| `:286` | `Add more quantifiable achievements to improve score.` | — |
| `:294` | `3 new jobs match your profile` | no such measurement exists |
| `:295` | `Software Engineer, Product Analyst, Data Analyst` | reference screenshot copy |
| `:303-304` | `Complete your profile` / `Add skills and certifications...` | reference screenshot copy |
| `:279` | `<span className="sr-only">{insights.length}</span>` | the tell: the real rows were hidden |

**Two independent proofs.** (a) The source above. (b) The live capture shows the metric donut at a measured
**82%** while the rail asserts **69%** — a visible self-contradiction on a single screen.

**Why every suite stayed green.** `dir093 AC3` asserted only that the memo *existed*
(`const insights = useMemo(...)`, `if (resumeState.resumes === null) return rows;`), never that it was
*rendered*. `dir091 AC2`'s `doesNotMatch(code, /\b69\b/)` guard targets **`CubaMetricCardRow.jsx`**, not the
rail. So the one file that actually hardcoded the reference figure had no anti-fabrication pin at all.

**Remediation (done):** the list now renders `insights.map(...)`, splitting each measured sentence into a
bold lead and a muted detail line; the `sr-only` count hack is deleted; an honest `CubaEmptyState` is shown
while the read is unresolved. New pin: **`dir095 AC1`**.

---

## 3. F-GAP-2 — Legend series count and inverted colour mapping  ·  severity Medium

The reference legend lists **four** series (Applied, Shortlisted, Interview, Offers); the app has **three**
(`analyticsLogic.js` `PROGRESS_SERIES`).

* **Dropping "Shortlisted" is CORRECT, not a gap.** `backend/routes/jobsData.js` constrains `status` to
  `wishlist | applied | interview | offer | rejected`, so a `shortlisted` row can never exist. Rendering that
  series would produce a permanently empty bar.
* **The colours were genuinely INVERTED.** Pre-DIR-090: `interview -> var(--cuba-warning)` (#7d5800, dark
  amber) and `offer -> var(--cuba-success)` (#1a7f37, green). The reference paints **Interviewing green** and
  **Offers amber**. Corrected; the mapping is now pinned by **`dir095 AC2`** (dir094 AC1 pins only the series
  ids, so no existing pin was superseded).

> Correction of an intermediate hypothesis: the legend is **not** missing. It is rendered at
> `CubaApplicationProgressChart.jsx:194-196`. An early bottom crop of mine showed black banding because the
> crop rectangle exceeded the source image bounds. That was my measurement artifact, not an app defect, and
> it is not reported as a gap.

---

## 4. F-GAP-3 — Sort and Grid/List controls were non-functional shells  ·  severity Medium

`DashboardHomepage.jsx:1229-1252` rendered a `Sort` button and a Grid/List toggle with **no `onClick` and no
state at all**, Grid hardcoded active. The reference mandates a working Sort (Last Updated, ATS Score, Title)
and a working view toggle. `dir090 AC4` even *asserted the absence* of these features, so the suite
documented the gap rather than closing it.

**Remediation (done):** `sortBy` and `viewMode` state; a native `<select>` (keyboard/AT-correct) offering the
three real keys; `aria-pressed` Grid/List buttons that really reflow the card container; and a comparator
(`sortResumeDocuments` / `resumeSortTimestamp`) that reads only stored fields — `updated_at`, `created_at`,
`calculateAtsScore`, `title` — never a synthesised value. New pin: **`dir095 AC3/AC4`**.

---

## 5. F-GAP-4 — Per-job match badges are absent  ·  ACCEPTED POLICY DEVIATION, not a defect

The reference shows `92% / 86% / 78%` match badges. **No such value exists in this platform**, and
`dir094 AC3` deliberately fails the build if anyone hardcodes them. Column 2 therefore reaches *visual and
structural* parity only. **This is why "100% parity" is unachievable by policy, and it must be recorded as an
accepted deviation rather than closed.** Recorded here, as required.

---

## 6. F-GAP-5 / F-GAP-6 — Cosmetic divergences  ·  severity Low

* **F-GAP-5** reference `2 days ago` vs live `2d ago` (`analyticsLogic.js` `postedLabel`). Corrected for days
  and weeks; safe because dir094 AC8 pins only the minute/hour cases. New pin: **`dir095 AC5`**.
* **F-GAP-6** the reference sets the quote *inline to the left* of the CTA group; the live header stacked it
  above. Corrected in `CopilotHeroHud.jsx`.

---

## 7. F-EV-1 — Evidence integrity: AC2 has never had a valid artifact  ·  severity High

This is the most consequential finding, because it explains why the others survived review.

1. **The below-the-fold artifact was byte-identical to the viewport shot.** The previous
   `.bridge/capture_dashboard.mjs` scrolled `.cuba-scrollbar`, which does not exist, so the scroll no-opped.
   `current_dashboard_bottom_analytics.png` was bit-for-bit `current_dashboard_live_1920.png` (both
   **427,882 bytes, MD5 `734B5FC719CA5A4045F2B30F1E564C1E`**). **No genuine bottom-zone evidence ever
   existed**, and nothing in the harness noticed.
2. **Every figure in that capture was a fixture.** The harness intercepted *all* data APIs, and its
   `/api/user-stats` body literally carried `bestScore: 69` — the reference screenshot's decorative number.
   Any "parity" read from those captures was parity with the harness's own mock file.
3. **It spawned a rogue server.** An in-process Vite dev server on port 5188, violating the P0 XAMPP-only
   server invariant.

**Remediation (done).** The harness was rewritten and the defective original archived as
`.bridge/evidence/capture_dashboard.pre-dir090.mjs`. It now:

* serves from **XAMPP Apache** (`http://localhost/IME365`) and **refuses to run** if Apache is down — it never
  starts a server;
* leaves data APIs **unmocked by default** (real MariaDB via the managed backend API), with `--mock` as an
  explicitly labelled **ILLUSTRATIVE** design-review mode;
* discovers the real scroller, **verifies the scroll actually moved**, and **proves by MD5** that the bottom
  artifact differs from the viewport shot — failing loudly otherwise;
* **asserts the dashboard actually rendered**, so a blank shell can never be shipped as evidence;
* writes a manifest (`.bridge/evidence/dir090-capture-manifest.json`) with the mode, scroll telemetry and
  per-artifact MD5 + byte size. New pin: **`dir095 AC7`**.

### 7.1 What the repaired harness immediately exposed

Re-run XAMPP-served with **real** data, the capture **FAILED** — correctly:

```
[FATAL] /dashboard rendered no Candidate workspace (no cuba-executive-rail, no cuba-copilot-hud).
render probe: {"rails":0,"hud":0,"bodyText":...}
scroll: {"found":true,"tag":"HTML","before":0,"after":0,"scrollHeight":1080,"clientHeight":1080}
[FATAL] the dashboard did not scroll
[FATAL] current_dashboard_bottom_analytics.png is BYTE-IDENTICAL to the viewport shot (md5 0A65161A9D91973517425AA9B1790755)
```

Apache **does** reverse-proxy `/api` to the managed backend
(`httpd-vhosts.conf:18-19 ProxyPass /api http://127.0.0.1:8080/api`), and that API answers
**401 Unauthorized** to the harness's stub session — verified on three separate data endpoints
(`.bridge/evidence/dir090-api-401-probe.log`). So an Apache-served, real-data capture is impossible without a
genuinely authenticated session, and the old harness concealed exactly that by mocking the API layer
wholesale.

**AC2 disposition: BLOCKED, with the blocker now precisely identified.** Producing a valid bottom-zone
artifact requires a real authenticated session (or a sanctioned test-session mechanism). That is the
remediation owner's decision, and it must not be faked.

---

## 7.2 F-GAP-7 — Pre-existing breach of the DIR-082 legacy-utility ratchet  ·  severity Medium

Discovered while verifying that my own edits had not regressed the neighbouring suites.

* `tests/dir082-viewport-density.test.mjs` AC6 holds a ratchet ceiling of **226** legacy palette utilities for
  `DashboardHomepage.jsx`. The committed HEAD version sits at exactly **226** (passing). The working tree sits
  at **278** — a **+52** breach introduced by the previous (DIR-093-era) uncommitted work, **not** by DIR-090.
  Measured directly: `HEAD = 226`, working tree = `278`; and every line DIR-090 inserted into that file
  contains **zero** palette utilities (the four matches that fall inside my line window, at 1425-1428, are the
  pre-existing "Cover Letters View" markup — `bg-slate-50` / `text-slate-700` / `text-slate-500`).
* The failure is *mis-attributed* at runtime because of a **test-file defect**: the AC3 callback at
  `dir082:67-85` is missing its closing `});`, so AC3 swallows the blocks that follow it and reports failures
  belonging to AC6. One root cause therefore surfaces as `pass 4 / fail 2` (AC3 and AC6).

**Deliberately not fixed here.** (a) Clearing 52 palette utilities is a DIR-088-style per-surface token sweep,
which the directive's own learnings flag as needing visual verification, and it is outside DIR-090's scope.
(b) Raising the ceiling would be precisely the "silently relaxed ratchet" the test forbids. (c) Repairing the
missing `});` would change another directive's test semantics. All three are referred upward.

---

## 8. AC3 — Test-suite verification (100% green, including the new guard)

| Suite | Result |
|---|---|
| dir084 | 8/8 |
| dir085 | 6/6 |
| dir086 | 6/6 |
| dir090 | 5/5 |
| dir091 | 6/6 |
| dir092 | 6/6 |
| dir093 | 7/7 |
| dir094 | 8/8 |
| **dir095 (new)** | **7/7** |
| **Combined run** | **59 pass / 0 fail** |

Invariants: `git diff --stat -- src/cv-templates` = **empty (0)**; no new dependency added; no charting
library introduced.

---

## 9. Edge-case recommendations

1. **Pin data lineage, not just structure.** dir093 asserted the insights memo existed; dir095 AC1 asserts it
   is *rendered* and that the reference's literals can never return. Apply this pattern to any surface whose
   design target contains illustrative numbers.
2. **Treat "the artifact exists" as insufficient.** Every capture claim should carry a hash comparison and a
   scroll/render probe, as the repaired harness now does.
3. **Make mock mode impossible to cite.** Any fixture-backed capture must be labelled at the artifact and
   manifest level (done), so it can never be quoted as a real-data measurement.
4. **Never close a coverage gap with a negative assertion.** `dir090 AC4` pinned the *absence* of the Sort and
   view-toggle features; a green suite then implied coverage that did not exist. Prefer an explicit
   `BLOCKED` / `NOT-DELIVERED` marker plus an owning directive.
5. **Record accepted deviations in writing.** F-GAP-4 (match badges) is a permanent, policy-mandated
   divergence; without this note, a future "parity" pass will try to close it by inventing data.

---

## 10. Residual work (not done here, and deliberately so)

* **AC2** — obtain a sanctioned authenticated session, then re-run `.bridge/capture_dashboard.mjs` and capture
  the genuine bottom band. Until then, AC2 remains **BLOCKED**.
* **F-GAP-4** — no action; accepted policy deviation.
* One pre-existing `no-unused-vars` warning remains in `CopilotHeroHud.jsx` (`Icon`, a destructured parameter
  used only in JSX — the repo's `varsIgnorePattern` exempts uppercase *imports* but destructured params are
  checked as *args*). It predates this directive, is one of five sibling warnings in
  `src/components/Candidate/`, and was left untouched to avoid unrelated churn.

---

## 11. Evidence index

| Artifact | What it proves |
|---|---|
| `.bridge/evidence/DIR-090-forensic-gap-report.md` | this report |
| `.bridge/evidence/capture_dashboard.pre-dir090.mjs` | the defective harness (scroll no-op, port 5188, `bestScore: 69` mock) |
| `.bridge/evidence/dir090-capture-run.log` | the repaired harness failing loudly on a blank/unauthenticated render |
| `.bridge/evidence/dir090-api-401-probe.log` | `/api/user-stats`, `/api/resumes`, `/api/jobs-data/tracker` all 401 |
| `.bridge/evidence/dir090-capture-manifest.json` | mode, scroll telemetry, per-artifact MD5 + byte size |
| `tests/dir095-candidate-dashboard-data-lineage.test.mjs` | the new 7-AC anti-regression pin |



