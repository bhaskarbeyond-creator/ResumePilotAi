# M8D — Independent Validation of the M8C Changes

**Mandate:** 8D §3 (P0). **Validated revision:** `0bf550a` (M8C HEAD) → `69a3ed4` (audited source).
**Before/after outputs preserved:** `Evidence/logs/m8c-baseline/` (M8C pre-change, exit 1),
`Evidence/logs/m8c-final/` (M8C post-change, exit 0), `Evidence/logs/m8d/` (this validation).

**Headline finding: one M8C rule was bypassable, and M8D proved it, then fixed it.**
C05's group-level exemption could be evaded by placing a defective row beside a justified one. That
is the exact bypass §3 asks about. It was not caught by M8C's own 13 fixtures. Fixture `f14` now
catches it, and the rule now grants exemption per row, propagating only through corpus containment.

---

## 1. The five earlier verifier failures, re-tested

| Check | M8C claim | M8D independent result |
|---|---|---|
| C03 corpus-scope | 53 bare-directory rows; 12 declared, **41 named UNVERIFIED** | **Holds.** The overlay declares exactly 41 `directory-unreconstructed`; C03's passing line prints the 41 rather than clearing them. M8D has now reconstructed those 41 (§`M8D-41-ROW-SOURCE-RECONSTRUCTION.md`) — and found 9 of them were contaminated, so C03's conservatism was justified. |
| C04 duplicate-corpus | empty-corpus pair excluded; 109 corpora; scoped corpora used | **Holds.** The exclusion is correct (two rows with no files cannot share one), and `f9`/`f12` still fire on real duplicates with non-empty corpora. |
| C05 duplicate-dist | group-level justification; 2 groups documented | **Was bypassable** — see §2. Rule replaced. |
| C06 full-evidence | 3 `clientOnly` rationales accepted; 13 FULL rows checked | **Holds.** Each rationale is anchored in that row's own register evidence (`FP-C06` renderers, `FP-E04` `lib/atsScore.js`, `FP-E13` engine/layouts) and `f11` removes them to prove the check still fires. |
| C10 verification-evidence | `DISC-056` cited; 32 statuses added individually | **Holds.** `DISC-024…055` now each carry one of the five vocabulary values; the two runtime claims are cited, not asserted. |

## 2. The bypass: how C05 could be evaded, and the fix

**M8C's rule.** A group of rows with identical distributions was skipped if *any* member declared a
justification.

**The exploit.** Take the legitimate-share pair (`FP-E02`/`FP-E03`, justified). Give a third row the
**same effective distribution** and no justification of its own. Under the group rule the third row
inherits the pair's exemption and is never reported. Demonstrated by fixture `f14` against the M8C
build: `caught=False`.

**Why it matters beyond the fixture.** The exemption was attached to a *group membership*, not to a
*declaration*. Any row adjacent to a documented pair became invisible — which is precisely the
"defective row beside a justified row" vector in the mandate.

**M8D's replacement rule.** Exemption is per row, and only in two cases:

1. the row declares its own sharing (`sharedCorpusJustification` / `nestedCorpusJustification`); or
2. the row **owns a corpus that strictly contains** an exempted row's corpus — the subset row carries
   the copy, the superset row is the original measurement (`FP-C01` owns `FP-C04`'s corpus).

A row that merely shares a group with an exempted row gets nothing.

**Effect on the baseline.** 5 rows are now exempt on those grounds (2 fully documented groups), and
the check still passes — so the hardening did not need a weakened corpus to stay green.

**Effect on the fixtures.** `f10` and `f13` still fire; `f14` now fires:

```
OK  f14_defect_beside_justified  expect=C05 duplicate-dist  exit=1  caught=True
    row carries an identical non-trivial distribution but declares no sharing of its own;
    proximity to a justified row is not a justification
```

## 3. Every changed rule demonstrated four ways

| Rule change | (1) baseline accepted for the intended reason | (2) corrupted fixture rejected for its own defect | (3) legitimate share not falsely rejected | (4) bypass prevented |
|---|---|---|---|---|
| C04 excludes empty corpora | 109 corpora, `FP-A02/A04` declared `no-corpus` | `f9` (two non-empty corpora made identical) | `FP-E02/E03` still pass | `f12` forces two *scoped* rows to share a corpus → fires |
| C04 accepts nested justification | baseline passes with `FP-C01/C04` | `f9` | `FP-C04` not condemned | `f12` |
| C05 per-row + corpus-superset exemption | 5 exempt rows, 2 documented groups | `f10` (justification stripped) | `FP-E02/E03`, `FP-C01/C04` pass | **`f14` (beside a justified row)** |
| C05/C04 use effective scoped corpora | baseline | `f13` (overlay classes duplicated) | `FP-F01/F02` scoped | `f13` |
| C06 accepts per-row `clientOnly` | 13 FULL rows | `f11` (rationales removed) | `FP-C06/E04/E13` pass | `f4`/`f7` unchanged |
| C10 per-finding status | 56/56 statuses | `f6` (resolved without evidence) | `DISC-029` static, not upgraded | `f6` |
| C12 artifact-staleness (new in M8C) | 19 declarations | `f8` (stale distribution undeclared) | `FP-E02/E03` declared | `f8` |
| **C13 corpus-volume (new in M8D)** | 110 rows reproduce exactly | `f15` (+1,000 lines), `f16` (+3 files) | all correct rows pass | **count manipulation** |

## 4. Bypass vectors named by the mandate, tested individually

| Vector | Test | Result |
|---|---|---|
| **Omit a source path** | `f3_missing_source_reference` — a row declares files but names no path | C02 fires: *"declares 1 files but names no source path"* |
| **Duplicate a row** | `f1_duplicate_capability` | C11 fires: *"row id appears 2 times: FP-A01"* |
| **Manipulate counts** | `f15` (+1,000 lines), `f16` (+3 files) — both previously undetected | **C13 fires** (new). Before M8D, a row's quoted volume could be edited freely and no check noticed |
| **Defect beside a justified row** | `f14` — previously undetected | **C05 fires** (hardened). This was a genuine M8C hole |
| Fabricated path | `f2` | C02 fires |
| Wrong parity classification | `f4`, `f7` | C06 fires |
| Incorrect summary total | `f5` | C07 fires |
| Unresolved marked closed | `f6` | C10 fires |

**Fixtures: 13 (M8C) → 16 (M8D), all rejected for the expected reason.** The three new ones exist
because two of them caught real holes and the third closes the count-editing gap.

## 5. M8C's specific claims, re-verified independently

### 5.1 `FP-C04` nested corpus — **confirmed**

`LegacyPuckEditor.jsx` is **46 lines** (content) and yields **zero** subfeature classes under the
register's own patterns; every class in both rows comes from `PortfolioBuilder.jsx` (1,743 lines).
So `FP-C04`'s distribution is mathematically forced from `FP-C01`'s corpus, and the "explained but
not eliminated" status is correct.

### 5.2 `FP-F09` scope problem — **confirmed, with one refinement**

`src/components/Analytics.jsx` is **10 lines**: it re-exports a `getWebsiteData()` delegate and an
empty `<div className="container-fluid d-none bs-analytics" />`. It implements no analytics surface,
so the declared 13-file corpus reduced to the `EmployerPortal` directory, which is why its stored
distribution matched the four EmployerPortal rows. M8C scoped it to `EmployerOverview.jsx` (174 L),
which is lazily routed at `EmployerPortal.jsx:18,135`. **Refinement:** calling it a "stub" is
accurate for the UI but it is not dead code — it is a live compatibility delegate to
`services/api/platform`. Recorded so the word "stub" is not read as "unused".

### 5.3 `DISC-056` evidence citation — **confirmed exactly**

| Cited item | Independent check |
|---|---|
| `Evidence/artifacts/m8b-runtime-probes.json` | exists |
| `Evidence/logs/m8b-runtime-probes.log` | exists |
| `InMemoryRepository.js:731-736` | line 734 is `async getCustomPageBySlug(slug) {` — the method takes **no options parameter** and applies no `published` filter |
| `MySQLRepository.js:1802-1819` | line 1814 is `async getCustomPageBySlug(slug, options = {})`; line 1816 applies `AND published = 1` when `options.publishedOnly` |

The test-double defect claim is correct, the citation resolves, and the M8C correction (add the
citation, keep the claim) was the right shape.

### 5.4 650 vs 651 inventory — **confirmed**

Re-ran `m8c-file-inventory.py`: **651 inventoried / 650 measured** (one excluded test file,
`src/components/welcome/App.test.js`), union reaches 651, 0 symlinks, 0 case collisions. The
"650/650 attributed" figure is trivially true rather than point-level mapping. Independently
re-derived here again in `M8D-INVENTORY-AND-ATTRIBUTION-VALIDATION.md`.

### 5.5 112 + 5 = 117 ledger — **confirmed**

112 rows declared in the generator, 112 emitted, 0 duplicate ids, 0 orphans; 5 M8A `NEW_ROW`
proposals absent from the register. Re-derived in `M8D-CAPABILITY-LEDGER-RECONCILIATION.md`.

### 5.6 Runtime totals and their probe records — **confirmed**

35 probes (5 × 2xx, 18 × 4xx, 11 × 5xx, 1 skipped) → 23 test cases (8 PASS / 1 FAIL / 12 BLOCKED /
2 N/A) → 11 contract defects (11 BLOCKED). The three collections are separately counted and no probe
is treated as a pass. Re-derived in `M8D-LOCAL-RUNTIME-HANDOFF.md`.

## 6. What M8D changed in the verifier, and why that is not "tuning"

| Change | Direction | Justification |
|---|---|---|
| C05 exemption: group → per row + corpus superset | **stricter** | a proven bypass (`f14`) |
| **C13 corpus-volume added** | **stricter** | count editing was entirely undetected (`f15`, `f16`) |
| Fixtures 13 → 16 | stricter | new holes covered |

No check was loosened in M8D. Two were tightened and one was added. The baseline still passes 13/13,
which is the point: the tightening did not require the package to change.

## 7. Where the package still passes only conditionally

The verifier passing **is not** a statement that the register is correct:

- C03 passes while naming 41 unreconstructed rows — now reconstructed here, and **9 of them were
  wrong**, which the verifier never claimed to detect.
- C13 proves volumes reproduce from declared paths; it cannot tell whether those are the *right*
  paths. `FP-A07` reproduces perfectly (363 L) and is still the wrong corpus.
- C10 passes with a reported structural note: the register still has no closure/disposition field.

**A green verifier and a correct register are different claims, and only the first is machine-checked.**
