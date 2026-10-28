# Audit Check Provenance — what the 61 checks actually prove

**Script under audit:** `developer-review/scripts/verify-audit-package.sh` (61 assertions) calling
`developer-review/scripts/verify-parity.py` (15 sub-checks) and `scripts/scan-secrets.py`.
**Run at revision `0adad00`:** `PASS: 61  FAIL: 0  VERIFICATION PASSED` (exit 0).
**Mandate clause:** V4 requires an audit of the existing checks for *what they actually prove*, not that
they be trusted because they pass.

## 1. The headline finding

> **Fifty-eight of the sixty-one checks compare the audit package to itself.**
> Three touch anything outside `developer-review/`: the git work-tree check, the secret scan's
> allowlist rationale, and the two "inventory" checks that read generated artefacts.

No check re-derives a number from the repository. A package can therefore be internally consistent,
fully self-referential, and still wrong about the codebase — which is exactly what happened in the
prior pass: `FP-C07` claimed "no route in `main.jsx` referenced it" while `src/main.jsx:575` routes it,
and every one of the 61 checks passed on that claim. Passing 61/61 is **necessary and far from
sufficient**, and V4 treats it accordingly.

## 2. Composition

| Category | Count | What it establishes | What it cannot establish |
|---|---:|---|---|
| **File existence** (`check_file`, lines 20–46, 56–67) | **39** | the named file is present and non-directory | that the file is complete, accurate, current, or that its content supports any claim. `README.md` existing proves nothing about the audit. |
| **Substring presence** (`check` 48–51, 54) | **5** | a token (`PROVENANCE`, `PASS`, `E-010`, `DISC-007`, `Confidence (updated):.*High`) occurs somewhere in a file | that the token is in the right context. `DISCREPANCY-LOG has 7 findings` only greps `DISC-007`; the log now has 22 findings and the check still passes under the same description. |
| **Work-tree state** (`check` 52) | **1** | no *tracked* file outside `developer-review/` differs from `HEAD` | nothing about **untracked** files (they are invisible to `git diff`), nothing about files outside the repo, and nothing about whether sources changed *before* `HEAD`. It is a diff against the current commit, not against the audited revision. |
| **Secret scan** (`check` 53 → `scan-secrets.py`) | **1** | no non-empty value assigned to 12 secret-like keys across `developer-review/**/*.{md,json,log}` | nothing outside `developer-review/`, and **nothing in `.tsv`** — the V4 operation register is a `.tsv`, so this scan does not cover it (it contains method/path/reachability only, no secrets, but the scope gap is real). |
| **Parity-register integrity** (`check` 69–75) | **7** | JSON parses; 112 IDs unique and `FP-` prefixed; classifications inside the closed 9-value vocabulary; totals sum by domain; every ID appears in the rendered matrix; the legacy tree is fully attributed (≥600 files). | **modern attribution is not checked by any of the 61**, and **no check stats a cited path** — the JSON did not even carry the paths until V4 added them. `verify-v4-reconciliation.py` now does both. |
| **Backend coverage** (`check` 75 → `check_coverage_reconciles`) | **1** | `consumedByModern + backendWithoutModernUi == uniqueMethodPaths` in `backend-ui-coverage.json` | that the classification is *right*. It validates the **superseded binary artefact**: 192 "consumed" includes 67 dead-hook mentions that no UI can invoke. The check passes while 201 operations are unreachable. |
| **Narrative integrity** (`check` 76–83) | **8** | ≥30 allegation rows with all four verdict words; DISC-013…018 present and the declared count equals the entry count; the superseded "144 files/dirs" figure is still present (history not erased); E-325…E-332 and R-120…R-129 exist; nine named docs contain the date `2026-10-29`; no capability is classified `INTENTIONAL RETIREMENT`; the inventory has all eight domain keys. | that any allegation was *correctly* adjudicated; that any requirement was actually met; that a dated string makes a document an amendment. `check_allegations` reads the RA table in `LEGACY-MODERN-FEATURE-INVENTORY.md`, **not** `ALLEGATION-RESOLUTION-REGISTER.md`. |

39 + 5 + 1 + 1 + 7 + 1 + 8 = **62**, because `check_coverage_reconciles` is counted inside the
parity group; the script's own counter reports **61** assertions (`pass=61`). The classification above
is by intent, not by counter arithmetic.

## 3. Checks that would still pass if the package were wrong

Demonstrated, not hypothesised:

| Scenario | Would the 61 catch it? |
|---|---|
| A capability row cites a file path that does not exist (e.g. `frontend/src/components/applications/…` when the real path is `components/employer/…`) | **No.** ID/vocabulary/attribution checks never stat-match modern paths. This V4 pass found and fixed exactly this class of error. |
| A capability is reclassified from `UNVERIFIED` to `FULL PARITY` on no evidence | **No.** `check_no_unearned_retirement` only guards the retirement value; `FULL PARITY` has no evidence gate. V4 added the evidence requirement editorially (each row carries a citation), not mechanically. |
| 30 capabilities are `MISSING` but the narrative says "full parity" | **No.** Totals reconcile regardless of truth. |
| The backend register's percentages are stale after a tool change | **No.** Nothing re-runs the generator or compares its output to the doc. (Observed this pass: an earlier run of the classifier, before a matching-rule fix, produced `/admin` 70 and `/enterprise` 62; the published document carries the corrected 66 and 54. Nothing in the verifier would have flagged either version, because no check compares a document to its generator's current output.) |
| A secret lands in a `.tsv` or in app source | **No.** Scan is `.md/.json/.log` under `developer-review/` only. |
| Application source is modified in a way that is then committed | **No.** The check diffs against `HEAD`; a committed change is the new baseline. |

## 4. What V4 added *outside* the verifier

Because the verifier cannot carry these, they are enforced operationally and stated here:

1. **Every figure in the V4 documents was re-derived this pass** by re-running all four tools at
   `0adad00` (`legacy-modern-inventory`, `parity-matrix`, `backend-ui-coverage`, `backend-reachability`)
   and by targeted greps whose commands are cited inline.
2. **Modern attribution was measured** (206/206) even though no check requires it.
3. **The seven-class register replaced the binary one** for all V4 claims; the binary artefact is kept
   only for provenance and still satisfies its own check — which is now documented rather than implied.
4. **Claims that failed verification were withdrawn**, not softened (see `AUDIT-CHANGE-HISTORY.md` §2).

## 5. Recommendation (not applied — outside the audit's write boundary)

Strengthen, in a future change: (a) make `check_coverage_reconciles` read the seven-class register and
assert the class sum equals 384; (b) add a modern-attribution assertion; (c) stat every `legacy`/
`modern` path in the register against the filesystem; (d) extend the secret scan to `.tsv`; (e) diff
against the audited revision rather than `HEAD`, and include `git status --porcelain` untracked output.
**(a)–(c) are now implemented in a *separate* script**, `scripts/verify-v4-reconciliation.py`, which does
not touch or relax the original 61 checks — a verifier adjusted until the package passes is worthless.
The new script stats every path, re-derives the class sums, and compares the reachability document with
its JSON. It immediately failed on four citations the original suite had accepted (a builder path under
`components/` that actually lives under `pages/`, a `DashboardActions` directory that is spelled
`DasboardActions` in the repository, a `cv-templates/index.jsx` that does not exist at that level, and a
`utils/geo.js` that does not exist). They are corrected, and the register now carries **385 path anchors,
all of which exist on disk** — a property no earlier version of this package could demonstrate.

(d) and (e) remain recommendations only, because they would require changing the original verifier's
semantics.

## 6. V6 checks — provenance and limits

`tools/parity-depth-checks.cjs` writes `Evidence/artifacts/parity-depth-checks.json`. Each of its ten checks
is a **grammar-level detector over source text**, not a behavioural test:

| Check | Provenance of its input | What would make it wrong |
|---|---|---|
| 1 classification contradiction | `feature-parity.json` + all `.md` in the package | a doc that states a class *without* an `FP-` id on the same line (undetected) |
| 2 swallow-then-success | `frontend/src/**/*.tsx?` | a success handled in a helper the regex cannot see |
| 3 hardcoded baseline | same | a seeded array with no `INITIAL_/DEFAULT_` prefix |
| 4 storage beside API | same | a storage write inside a hook not matched |
| 5 evidence refs | register + docs | a ref to a file outside the repo |
| 6 runtime claims | `RUNTIME-VERIFICATION-V4.md` | a claim phrased without a log path |
| 7 backend actually called | register + client call artifact + 2-hop import graph | a call made through a barrel file more than 2 hops away |
| 8 subfeature signals | legacy vs modern text per row | broad legacy attribution (the 4 hits it produced) |
| 9 dead client paths | client call artifact + register | a path assembled from variables at runtime |
| 10 export disposition | legacy text + row evidence text | an export implemented under an unrelated name |

**The honest summary:** these checks are good at finding *inconsistencies between artifacts* and *patterns
that usually mean hollowing-out*. They cannot demonstrate that a workflow works, and none of them is counted
as doing so. Zero application changes were made to make any of them pass.
