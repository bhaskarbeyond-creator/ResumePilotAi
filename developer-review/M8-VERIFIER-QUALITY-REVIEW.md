# M8 §8 — Verifier Quality Review

**Mandate:** 8, §8 — priority P1. For every verifier in the package: what it proves, what it does not,
and which of the named weaknesses (hardcoded counts, stale artefacts, presence-only checks,
self-comparison, shared parser assumptions, unexplained exceptions, historical figures presented as
current) it actually has. Replacements made in M8 are listed with their rationale. **No expected
value was moved to make a check pass.**

**Revision under test:** `a2ecb96d2b194df25d5cd8ce2ece23ef65068fd9`
**Verifiers:** `scripts/verify-audit-package.sh` (61 checks) · `scripts/verify-v4-reconciliation.py`
(**20** checks, was 17 at M8 start) · `scripts/verify-parity.py` (15 subcommands) ·
`scripts/scan-secrets.py`

---

## 1. Result at this revision

| Verifier | Result | Character |
|---|---|---|
| `verify-audit-package.sh` | **61 / 61 PASS** | mostly existence and text-presence; 10 substantive checks |
| `verify-v4-reconciliation.py` | **20 / 20 PASS** | derived from repository + artefacts; 3 checks added in M8 |
| `verify-parity.py` (`totals`, `matrix-ids`, `coverage`, `ids`, and the rest) | **PASS**, silent on success | well-formedness and arithmetic inside the parity register |
| `scan-secrets.py` | **PASS** (captured in `Evidence/logs/m8-secret-scan.log`) | pattern scan of the audit directory only |

Passing all three is **not** an acceptance statement. Section 6 lists what the suite cannot see.

## 2. `verify-audit-package.sh` — 61 checks, by kind

| Kind | Count | Examples | Proves | Does not prove |
|---|---:|---|---|---|
| File exists | 27 | `exists README.md`, all 8 inventories | the package is complete on disk | that any file's content is true |
| Text present | 12 | `README mentions PROVENANCE`, `EVIDENCE-INDEX has E-010`, `REQUIREMENT-REGISTER has PASS counts` | a phrase was not deleted | that the referenced item exists or is correct |
| Register parses / IDs unique / vocabulary closed | 5 | parity register parses with 100+ capabilities; classifications inside the closed vocabulary | structural integrity of `feature-parity.json` | that a classification is right |
| Arithmetic inside the artifact | 3 | totals reconcile with domain counts; coverage artifact reconciles | the generator's sums close | that the inputs were measured correctly |
| Liveness | 4 | `Backend-UI coverage artifact reconciles`; `allegation register: 30+ adjudications, all verdict classes present` | an artefact was regenerated and carries the expected shapes | verdict correctness |
| Non-modification / hygiene | 3 | no application source modified; no non-empty `DB_PASSWORD` | the audit did not edit the app within the paths checked | that no secret of another shape exists |
| Preservation | 2 | audit history preserved; dated amendment sections present | superseded text was kept | that the amendment is accurate |

**Weaknesses confirmed in M8:**

1. **No check re-derives a count from the repository.** Every number is read from an artefact the
   same package generated. If a generator is wrong, its checker agrees with it. (This is the defect
   `AUDIT-CHECK-PROVENANCE.md` recorded in V4 and the reason the Python verifier exists.)
2. **Thresholds are floors, not equalities** — "100+ capabilities", "30+ adjudications",
   "DISC-013..018 present". A register that lost 10 rows still passes.
3. **`git diff excludes DR` is checked against a moving base.** The check proves the audit did not
   touch the app *relative to whatever base the script resolves*; M8 proves the stronger property
   separately (`a7d08a2..HEAD` and `8a6e03bb..HEAD` are empty outside `developer-review/`).
4. **Two checks assert phrases containing historical counts** (`Parity matrix doc renders every
   capability ID`, `Backend-UI coverage artifact reconciles`). They keep the M7 file honest and were
   left untouched: **do not edit an expected value to make a check pass** — the doc was regenerated
   from its generator instead, and the check still passes on the new counts.

## 3. `verify-v4-reconciliation.py` — 20 derived checks

Checks that re-derive from source rather than re-reading an artefact:

| Check | Derivation | Proves | Does not prove |
|---|---|---|---|
| capability totals reconcile | sums `feature-parity.json` | internal arithmetic | measurement validity |
| every cited path exists on disk | `os.path.exists` per cited anchor | no ghost anchors | that the anchor is the right file for the capability |
| both trees fully attributed | filesystem walk of `src/` + `frontend/src` | no unattributed file | correct attribution |
| reachability classes are the seven and sum to total | artifact arithmetic | the class set is closed | classification correctness |
| reachability document matches its JSON | regex per class row | doc/artefact agreement | that both are right |
| legacy/modern counts recomputed from the filesystem | walk + extension filter | the published 650/206 are current | line counts |
| operation register matches its TSV | parse both | two renderings of one truth | truth |
| client call existence artifact reconciles | arithmetic | 229 = served + unserved | parser recall |
| every FULL PARITY row is supported | `parity-endpoint-audit.json` | no FULL row cites an absent endpoint | **see weakness 1** |
| coverage total equals the sum of its parts | arithmetic over the registers (currently **1,544**) | the published total equals its components | that the components are distinct work |
| registration counts reconcile across the two parsers | replays legacy rules | the 413/397/393 story | that either parser sees every route |
| **legacy call evidence re-derivable from `src/`** (M8) | independent python scanner over `src/` | 166 operations with legacy evidence are exactly the ones `src/` calls | shared "helper-then-literal" assumption |
| **M8 gap adjudications cite registered operations** (M8) | re-resolves every `WRONG_URL` citation against the register | no invented equivalent; `MISSING_BACKEND` cites nothing; gap set equals the audit's unresolved set | that the cited operation is the *right* alternative |
| **M8 gap set reproduces the audit's unresolved set** (M8) | gap shapes vs `client-contract-audit.json` | nothing silently dropped or added; false-success counts agree | that the audit's scanner found every call site |
| **M8 parity revalidation agrees with the register** (M8) | compares independent derivation to published distribution | coverage of 112 rows, revision currency, flagged-at-parity rows adjudicated | that unflagged rows were read |

**Weaknesses confirmed in M8 (all recorded, none worked around):**

1. **A FULL row with no endpoints is graded `SUPPORTED` vacuously.** `parity-endpoint-audit.cjs`
   computes `absent/ambiguous/unreachable` over an empty endpoint list, so FP-E13 and (after M8's
   reclassification) FP-C06 pass `c_full_parity_supported` without any endpoint evidence. The check is
   honest about endpoints; it simply cannot express a UI-only capability. Not "fixed" by moving the
   classification — the classification follows the evidence, and the limitation is published.
2. **`c_reach_doc_matches_register` asserts the literal string `"Per-operation rationale for all 176"`.**
   That is a historical figure pinned into an assertion: if the UNREACHABLE class legitimately changed,
   the check would fail for a correct reason and tempt an editor to change the doc. M8 left it in place
   (the count did not change) and flags it as the package's clearest remaining pin.
3. **Cross-implementation agreement is not independence of semantics.** The new legacy-call check and
   the register share the assumption "a call is a helper verb followed by a path literal". A path built
   by concatenation is invisible to both and will never cause a failure.
4. **`c_full_parity_supported` also has a band** (`30 <= rowsWithNoDeclaredEndpoint <= 45`) that was
   widened in V7 with a comment. Bands keep a check alive across legitimate edits but they also stop
   being able to detect a slow drift inside the band.

## 4. `verify-parity.py` — 15 subcommands

All pass. They check: totals, matrix IDs, coverage arithmetic, ID uniqueness, closed vocabulary,
retirement evidence, and the presence of requirement/allegation/amendment rows. They are
**well-formedness** checks over the parity register: none of them re-reads `src/` or `frontend/src`.
Two of them (`retirement`, `vocabulary`) enforce the two rules that matter most for honesty —
`INTENTIONAL RETIREMENT` cannot be asserted without documented intent (0 rows use it), and a
classification cannot leave the closed set. That is genuine enforcement, not decoration.

## 5. What M8 changed in the instruments (and what it refused to change)

| Change | File | Rationale |
|---|---|---|
| Counting units made explicit; `/api` scope documented; accessor reads rejected | `tools/backend-reachability.cjs` | recounts gave 393/397 instead of an unexplained 397/413 (see `M8-REGISTRATION-COUNT-RECONCILIATION.md`) |
| Legacy call extractor learned `apiJson(` / `apiFetch(` | `tools/backend-reachability.cjs` | 84 legacy call sites were invisible; 85 operations carried a false "never called" reason. Class histogram asserted unchanged |
| Alias collapse + receiver restriction | `tools/client-contract-audit.cjs` | removed 2 false positives and 6 double counts, reproduced 405 registrations |
| Registration reconciliation tool | `tools/m8-registration-reconciliation.cjs` | proves the 16-row difference arithmetically instead of by assertion |
| Parity revalidation tool | `tools/m8-parity-revalidation.cjs` | derives signals independently of the classifications |
| Gap revalidation tool | `tools/m8-contract-gap-revalidation.cjs` | re-resolves 15 gaps against the register and records false-success sites |
| Subfeature generator merges both adjudication files | `tools/capability-subfeature-audit.cjs` | M8 verdicts survive regeneration; M7 file untouched |
| 3 new derived checks | `scripts/verify-v4-reconciliation.py` | legacy-call visibility, gap citations, revalidation agreement |
| **Not changed:** `scripts/verify-audit-package.sh` | — | 61 checks left exactly as published; weakening or rewriting them would destroy the only historical anchor |
| **Not changed:** any expected count, band, or threshold | — | the mandate forbids it; where a count moved, the generator moved it and the docs were regenerated |

## 6. What the whole suite still cannot see

1. **Behaviour.** No verifier starts the application. M8's HTTP probes were manual evidence, not
   checks — they are not wired into the suite, so a regression would not be caught.
2. **MariaDB.** No check connects to a database; the 46 backend failures in
   `m8-backend-suite.log` are outside every verifier.
3. **Browser.** No DOM, console or screenshot assertion exists.
4. **Doc-vs-doc drift.** Several checks compare a document to the artefact generated from the same
   code; both can be wrong in the same direction.
5. **Secret scanning** covers the audit directory by pattern; it cannot detect a credential that does
   not match a listed pattern.
6. **Coverage of the package's own growth.** Nothing fails when a new M8 document is added without an
   evidence-index entry; only the reverse (index entry without file) is impossible to satisfy because
   the index is not checked against the filesystem file-by-file.
