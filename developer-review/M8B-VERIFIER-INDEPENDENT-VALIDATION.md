# M8B — VERIFIER INDEPENDENT VALIDATION

**Source revision:** `69a3ed4`
**New verifier:** `developer-review/tools/m8b-integrity-verify.py`
**Fixture harness:** `developer-review/tools/m8b-fixture-harness.py`
**Fixture evidence:** `Evidence/fixtures/m8b/` + `harness-results.json`

---

## 1. The six claims carried from M8/M8A, each verified independently

M8A asserted six weaknesses in the published verifier set. Each was checked against the actual source and execution
behaviour. **Five are confirmed; one is overstated.**

| # | Claim | Verdict | Exact evidence |
|---|---|---|---|
| 1 | Literal `176` count pin | **CONFIRMED** | `scripts/verify-v4-reconciliation.py:338` — `assert "Per-operation rationale for all 176" in doc`. A prose count is frozen; if the register legitimately became 177 the check fails, and if the doc says 176 while the register says 393 nothing catches it. |
| 2 | Floor thresholds instead of recomputation | **CONFIRMED** | `verify-parity.py:32` `total >= 100`; `:53` `legacyFilesMeasured >= 600`; `:83` `len(ids) >= 30`; `:140` `legacyFiles >= 600`; `verify-v4-reconciliation.py:210` `disc >= 26`, `:211` `req >= 65`, `:212` `ra >= 35`, `:219` `ops >= 385`, `:221` `disc >= 46`. Every one is a floor. |
| 3 | Vacuous `SUPPORTED` for endpoint-less `FULL` rows | **CONFIRMED, and worse than described** | Mechanism is in the *generator*, not the verifier: `tools/parity-endpoint-audit.cjs:105-108` assigns `else grade = 'SUPPORTED'` as the fallback when there are no absent/ambiguous/unreachable endpoints — which is exactly the case when there are **no endpoints at all**. The verifier then exempts `SUPPORTED` from its check at `:281` (`bad = {k:v for k,v in tally.items() if k != "SUPPORTED" and v}`). Three rows are affected: **FP-C06, FP-E04, FP-E13**, each with `endpoints: []` and all counts zero, each `FULL PARITY`. |
| 4 | Broad accepted band for `rowsWithNoDeclaredEndpoint` | **CONFIRMED** | `verify-v4-reconciliation.py:294` `assert 30 <= no_endpoint <= 45`. Actual value 37. Any value in a 16-wide band passes, so 8 rows could silently change corpus and the check would not notice. |
| 5 | Shared helper-verb assumption | **CONFIRMED as a mechanism, OVERSTATED as an effect** | `tools/client-call-existence.cjs:38-43` maps callee *name* → verb (`get/fetch → GET`, `remove/delete → DELETE`, …). But `:100-109` gives an explicit `method:` in the options priority over the map. Empirically, the 9 bare `fetch(` sites — 6 of which pass `method: 'POST'` — are all recorded as **POST** (`/api/export-docx`, `/api/platform/role-view-audit`). No mislabel was found in the 229 recorded call sites. The residual risk is a method outside the parsed argument window, not the shared map itself. |
| 6 | Schema-shape validation without proving measurements are distinct capabilities | **CONFIRMED** | Nothing in any verifier compares corpora across rows, which is why the `FP-A14/A15/A16/A21` duplicate survived 61/61, 20/20 and exit-0 passes. |

Additionally found: `verify-v4-reconciliation.py:290` asserts a **`>=` sum** of the four endpoint buckets against
112 rather than `==` with per-bucket reconciliation. If one row were double-counted into two buckets the sum would
become 113 and still pass.

---

## 2. What the new verifier checks instead

`m8b-integrity-verify.py` derives every expected value from the artifacts; **no count is pinned**.

| check | what it proves |
|---|---|
| C01 provenance | every artifact revision resolves **and** its application tree is identical to the audited revision |
| C02 paths-resolve | every declared path exists; a row reporting a non-zero corpus must name a path |
| C03 corpus-scope | a row measuring a bare directory must declare `corpusScope`, else its table is module-level, not capability-level |
| C04 duplicate-corpus | no two rows share `(paths, files, lines)` without a recorded justification |
| C05 duplicate-dist | no two rows share an identical non-trivial distribution (mass > 2) |
| C06 full-evidence | a `FULL` row needs ≥1 resolving endpoint with `ok>0`, or a `clientOnly` rationale; never `SUPPORTED` on an empty list |
| C07 exact-totals | recomputed totals must **equal** published totals, per classification and per domain |
| C08 dispositions | each claim holds exactly one primary bucket; histogram and claim count reconcile |
| C09 finding-ids | finding IDs unique; the declared total reconciles to the stated finding/ID split |
| C10 verification-evidence | status vocabulary enforced; a `RUNTIME VERIFIED` or explicitly resolved finding must cite resolving evidence |
| C11 unique-rows | row IDs unique; no row without an id |

### 2.1 Before and after, run on the real package

| | before | after |
|---|---|---|
| command | `verify-audit-package.sh; verify-v4-reconciliation.py; verify-parity.py` | `tools/m8b-integrity-verify.py` |
| result | **61/61 PASS, 20/20 PASS, exit 0** | **6 PASS / 5 FAIL, exit 1** |
| detects the `FP-A14`/`A15` duplicate corpus | no | **yes** (C04) |
| detects duplicate distributions | no | **yes** (C05) — 7 groups |
| detects vacuous `FULL` rows | no | **yes** (C06) — FP-C06, FP-E04, FP-E13 |
| detects 53 bare-directory corpora | no | **yes** (C03) |
| detects the missing verification-status field | no | **yes** (C10) — 32 of 55 |
| pins a literal count | yes (`176`) | **no** |
| uses floors | yes (10 sites) | **no** — equality only |

The published verifiers still pass, because this mandate did **not** edit the registers they assert against. The new
verifier fails, because the package genuinely contains the defects above. **A PASS from the old set does not mean
the measurements are sound, and that is now demonstrated rather than asserted.**

---

## 3. Negative testing — eight corrupted fixtures

The harness first runs the unmodified baseline, then applies one corruption per fixture and asserts the expected
check fails **and names the corruption**.

Baseline: `exit=1`, failing `C03, C04, C05, C06, C10` — the five real defects. (If the baseline had passed, the
harness aborts, because a harness that cannot fail proves nothing.)

| # | fixture | corruption | expected | observed | reason given |
|---|---|---|---|---|---|
| 1 | duplicate capability | one row id appears twice, total kept honest | C11 | **caught** | `row id appears 2 times: FP-A01` |
| 2 | fabricated path | `legacyPaths: ["src/components/does/not/exist"]` | C02 | **caught** | `path does not exist` |
| 3 | missing source reference | row declares `legacyFiles: 1` but no path | C02 | **caught** | `declares 1 files but names no source path` |
| 4 | incorrect parity classification | non-`FULL` row relabelled `FULL` with no endpoints | C06 | **caught** | `FULL row graded without any endpoint and without clientOnly rationale` |
| 5 | incorrect summary count | `total` and a classification count inflated by 3 | C07 | **caught** | published ≠ recomputed |
| 6 | unresolved finding marked closed | `DISC-999` marked `RESOLVED` with no evidence | C10 | **caught** | `marked resolved/closed but cites no resolving evidence` |
| 7 | `FULL` row with no supporting implementation | endpoints re-pointed at an unregistered path, grade left `SUPPORTED` | C06 | **caught** | `FULL row has declared endpoints but none resolved as ok` |
| 8 | duplicated measurement table | one row's subfeature vector copied onto another | C05 | **caught** | `identical non-trivial distribution across different rows` |

**8 of 8 rejected for the correct reason.** `EXIT=0`.

### 3.1 Fixtures that initially failed — and were fixed by strengthening the check

- **Fixture 3** was *not* caught on the first run: clearing `legacyPaths` left nothing for C02 to validate. C02 was
  extended to require a path whenever a non-zero corpus is declared. This is a genuine strengthening, not a
  loosening — the check now rejects a state it previously ignored.
- **Fixture 6** was caught but reported against the wrong finding, because the harness took the first rejection
  rather than the one naming `DISC-999`. The harness now matches the fixture's own token, so "caught" means
  "caught for the right reason".

Both are recorded because a fixture harness that passes on its first attempt is usually a harness that is not
testing anything.

---

## 4. Independent recomputation

| quantity | published | independently recomputed | agree |
|---|---:|---:|---|
| capability rows | 112 | 112 | ✓ |
| unique row ids | — | 112 | ✓ |
| classification histogram | 13/51/28/0/12/5/3 | 13/51/28/0/12/5/3 | ✓ |
| domain totals (A–G) | 26/11/7/15/17/11/… | 26/11/7/15/17/11 | ✓ |
| claims with one primary disposition | 16 | 16 | ✓ |
| disposition histogram | 3/7/4/1/0/0/1 | 3/7/4/1/0/0/1 | ✓ |
| DISC findings / IDs | 53 / 55 | 53 / 55 | ✓ |
| `legacyFilesMeasured` | 650 | **not comparable** — distinct-file metric, not a row sum (per-row sum is 1,212; §4 of the reconstruction) | n/a |

The recomputation is a separate implementation (Python, reading the artifacts directly) rather than a second call
into the same generator.

---

## 5. Remaining blind spots

1. **Subfeature class regexes are shared.** The independent tool re-implements the same 16 patterns, so it can
   confirm *arithmetic and scope* but not the *appropriateness* of the class definitions. A class that does not
   correspond to a real capability would be invisible to both implementations.
2. **C04/C05 cannot prove a shared corpus is wrong** — only that it is undeclared. A row that genuinely *is* a
   whole directory (e.g. a template catalogue) is legitimate; it needs a `corpusScope` declaration, which is a
   documentary fix the verifier can demand but not adjudicate.
3. **C06 accepts a `clientOnly` rationale without verifying it.** A mislabelled row could claim `clientOnly` and
   pass. Verifying that claim requires reading the capability, which is not mechanical.
4. **No check exercises runtime behaviour.** Every check is static over artifacts.
5. **The verifier cannot detect a wrong-but-self-consistent package** — if totals, rows and artifacts were all
   regenerated from the same faulty corpus, C04/C05 would catch the corpus duplication but nothing would catch an
   incorrect capability-to-file mapping that is *unique* to each row.
6. **C10 does not verify that cited evidence supports the claim**, only that it resolves on disk.

---

## 6. Reproduction

```bash
python3 developer-review/tools/m8b-integrity-verify.py ; echo $?     # 1 on the real package (5 real defects)
python3 developer-review/tools/m8b-fixture-harness.py ; echo $?     # 0 when all 8 fixtures are rejected correctly
```
