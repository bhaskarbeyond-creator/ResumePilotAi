# DIR-064 — LibreOffice Visual Parity Harness + Supersede-on-State-Change Dedup

Two follow-ups from DIR-063, both previously flagged as **not done**.

---

## 1. LibreOffice wired into the parity harness (true VISUAL comparison)

### Why it was needed
DIR-063 delivered **OOXML-level contract assertions** (section order, typography, bullet
indent, dates, contact lines) plus print-media emulation. That is a *structural* proxy.
`backend/test/docx-parity.test.js` said so in its own limits: *"true VISUAL pixel
DOCX-vs-PDF comparison requires a DOCX renderer (LibreOffice/Word)"*. LibreOffice 26.8.1.1
is now installed, so that gap is closed.

### New harness — `template-lab/docx-visual-parity.mjs`

```
DOCX (backend createResumeDocx)  --soffice-->  PDF  --soffice-->  PNG
Lab page (Chromium page.pdf)     ---------->  PDF  --soffice-->  PNG
                                                                   |
                                                        pixel comparison
```

Two design decisions that make the comparison fair:
* **One rasteriser for both sides** — LibreOffice's PNG export produces both images, so a
  difference is a *document* difference, never a rasteriser difference.
* **One fixture for both sides** — `template-lab/fixtures.js` feeds the DOCX generator
  *and* the lab page, so a mismatch cannot come from differing input data.

Metrics per template: A4 aspect, ink coverage %, and a 64-bit average-hash (hamming
distance). PASS = both rasters A4-ish, |ink Δ| ≤ 8pp, phash ≤ 20/64.

Run: `npm run test:dir064:visual` (report → `template-lab/evidence/dir064/visual-parity.json`).

### Result across all 55 templates: **50/55 pass**

### The 5 FAILURES are real defects, not artifacts

| Template | DOCX ink | PDF ink | Δ | phash | Reading |
|---|---|---|---|---|---|
| **Cv9** | 27.37% | 37.27% | **−9.9** | 6/64 | PDF has ~10pp more ink → the DOCX is **missing a large coloured region** |
| **Cv26** | 26.81% | 35.78% | **−8.97** | 6/64 | same class |
| **Cv50** | 25.33% | 34.52% | **−9.19** | 7/64 | same class |
| **Cv48** | 27.38% | 4.25% | **+23.13** | **36/64** | **inverted** — the DOCX has a coloured region the PDF does not |
| **Cv42** | 5.52% | 5.97% | −0.45 | **21/64** | ink matches; **layout differs** (marginal, 21 vs the 20 threshold) |

**Spot-checked Cv48** rather than trusting the aggregate. Row-wise ink profile:

```
DOCX thirds: [33.1%, 36.2%, 12.8%]
PDF  thirds: [ 6.2%,  4.7%,  1.9%]
```

That is not a rasterisation artifact — the two documents are **structurally different**.
Both rasters pass the A4 aspect check, so this is content, not geometry.

**I did NOT fix these.** They are newly-discovered defects in coloured-region handling for
specific archetypes, and fixing five template renderings without regressing the other 50
(or the INV-1 frozen tree) is real work that deserves its own directive. Reporting them is
the deliverable here; silently patching them would be worse.

---

## 2. Supersede-on-state-change dedup

### The gap
`autowake.cjs`'s `deliver()` already had an outstanding-wake guard, but it collapses
duplicates only for the same **`(directiveId, role, mode)`**. A directive that advances
`plan → act → lead` emits wakes with **different modes**, so nothing stopped a queued wake
being delivered after the directive had finished. DIR-063 produced **15 lifecycle wakes**
(`ISSUED` / `PLAN_SUBMITTED` / `IN_PROGRESS`) that were all delivered *after* it reached
`APPROVED_FROZEN` — each one a turn spent confirming there was nothing to do.

### The fix
`deliver()` now refuses any wake whose directive is already **terminal**
(`APPROVED_FROZEN` / `CANCELLED`), returning `{ suppressed: 'directive-terminal' }`.

**Deliberately conservative:** `isDirectiveTerminal()` returns `false` on a missing,
unreadable or corrupt record, so it can only ever *drop a superseded lifecycle wake* — it
can never swallow a live one.

### Verified — `tests/dir064-wake-supersede.test.mjs` (5/5)

| Test | Result |
|---|---|
| wake for an `APPROVED_FROZEN` directive is SUPPRESSED | pass |
| wake for a `CANCELLED` directive is SUPPRESSED | pass |
| wake for a LIVE (`IN_PROGRESS`) directive is **NOT** suppressed | pass |
| missing/unknown directive is **NEVER** suppressed | pass |
| corrupt directive record is **NEVER** suppressed | pass |

Live check against the real project:
```
DIR-063 (APPROVED_FROZEN) -> suppressed = directive-terminal | wakeId = null
DIR-999 (unknown)         -> (not suppressed)               | wakeId = minted
```

---

## 3. VERIFICATION

| Gate | Result |
|---|---|
| `tests/dir064-wake-supersede.test.mjs` | **5/5 pass** |
| visual parity sweep, 55 templates | **50/55 pass** (5 real defects reported) |
| `autowake.cjs` syntax | OK |
| Freeze manifest | re-baselined, `intact: true`, `blocked: false` |

New scripts: `test:dir064`, `test:dir064:visual`.

---

## 4. HONEST LIMITS

* **The 5 visual failures are reported, not fixed.** Cv9/Cv26/Cv50/Cv48 lose or gain a
  large coloured region; Cv42 diverges in layout. Root-causing and fixing them is
  outstanding work.
* **Page 1 only.** LibreOffice's PNG export renders a single page, so the comparison covers
  page 1 of each document. Multi-page divergence is not covered.
* **Coarse metrics.** Ink coverage + a 64-bit average hash detect *large* divergences
  (missing regions, wrong layout) but will not catch subtle typographic differences — a
  template can pass at phash 19/64 and still differ visibly. `Cv15`, `Cv45`, `Cv46`, `Cv49`
  all sit at 19–20/64, i.e. right at the threshold.
* **Thresholds are mine, not derived.** |Δink| ≤ 8pp and phash ≤ 20/64 were chosen to
  separate the obvious divergences; they are not calibrated against a labelled corpus.
* **The dedup suppresses on TERMINAL state only.** It does not drop a wake for a directive
  that is merely *behind* its wake (e.g. an `IN_PROGRESS` wake arriving while the directive
  is at `EVIDENCE_SUBMITTED`). That narrower supersede rule was not implemented.
* **The dedup was not verified against a live dispatch** — only via direct `deliver()` calls
  and the unit suite.
* **LibreOffice needs a dedicated user profile** (`-env:UserInstallation=...`) or headless
  conversion silently produces nothing. Without the flag the first attempt yielded no PDF
  at all; the harness sets it explicitly.

