# Independent Verification Register (Mandate 5)

**Reference revision:** `cccd35a5dac62efa5ead2c309a0fc60b201f9b08` = `origin/arena/393531fe-resumepilotai`
**Base:** `origin/main` = `0adad00d0975444f13b98f9cda3ec7e24c2c6a62`; `origin/dev` = `ea7b7416` (1,459 commits
reachable, merge-base `0adad00`)
**Scope:** re-derive every V4 claim from the repository rather than from the V4 documents.
**Deliberate posture:** every V4 number is treated as a hypothesis. Every check below is classified by
*what it actually proves*, including the checks that prove very little.

---

## 1. What "independent" means here, and what it does not

The mandate forbids accepting the developer's own conclusions as verification. Three kinds of check were
used, and they are not equally strong:

| Kind | Definition | Strength |
|---|---|---|
| **Behavioural** | executes application code and observes output | strongest — but none of the highest-value checks here could be behavioural (no MariaDB, no browser) |
| **Cross-validating** | a second, separately written parser re-derives the same fact from the source tree | medium-high: catches implementation bugs, not a shared misunderstanding of the source |
| **Documentary** | reads a document and checks it against another document or artifact | weakest; useful only for internal consistency |

**Explicit limit:** no check in this pass proves anything about runtime behaviour of the *deployed*
system. `dist/` is not committed, so the served bundle cannot be inspected. Nothing here is evidence
about production.

## 2. Check inventory — every check, classified

| # | Check | Tool / command | Kind | What it proves | What it does **not** prove | Result |
|---:|---|---|---|---|---|---|
| 1 | Authoritative revision and diff scope | `git rev-parse HEAD`, `git diff --name-only 0adad00..HEAD` | documentary | the audit changed only `developer-review/` (30 files at V4; see §3 for V5) | that the tree matches what was reviewed earlier | PASS |
| 2 | Legacy file count | `git ls-tree -r HEAD -- src \| grep -E '\.(js\|jsx)$' \| grep -v '\.test\.'` | behavioural (filesystem) | **650** non-test legacy source files | that each file is reachable at runtime | PASS (corrected from 651, DISC-023) |
| 3 | Legacy inventory tool | `node tools/legacy-modern-inventory.cjs` | self-referential | the tool reports what its walker sees | anything about correctness of the walker | PASS after fixing the test filter (DISC-023) |
| 4 | Modern file count | `find frontend/src` (206 TS/TSX; 204 non-`.d.ts`) | behavioural | 206 files, 68,812 lines | runtime behaviour | PASS |
| 5 | Capability attribution | `node tools/parity-matrix.cjs` | self-referential | 650/650 legacy and 206/206 modern files are attributed to a capability row | that the row's *classification* is right | PASS (attribution only) |
| 6 | Route registration enumeration | `node tools/backend-reachability.cjs` | self-referential until cross-checked | 499 registrations → 385 unique METHOD+path | that a registration is mounted, authorised or working | PASS after `app.all` fix (DISC-024) |
| 7 | Reachability classification | same tool | **cross-validated by #8** | per-op class with rule + reason | that a "no call site" means the feature is unused (DISC-025 shows some calls are simply broken) | PASS after three defect fixes (DISC-024) |
| 8 | Independent reachability re-derivation | `node tools/reachability-crosscheck.cjs` | cross-validating | a second parser agrees on **385/385** operations, 0 disagreements | that either parser understands dynamic path construction | PASS |
| 9 | Client call → served operation | `node tools/client-call-existence.cjs` | behavioural (source) | 229 call sites; **23 distinct paths served by no operation** | that a resolved path returns 200 (auth, validation, DB may still fail) | **FAIL (new defect class, DISC-025)** |
| 10 | FULL PARITY challenge | `node tools/parity-endpoint-audit.cjs` | cross-validating | all 19 remaining FULL rows are endpoint- and reachability-supported (19/19) | that the *capability* behaves like legacy — a wired endpoint is not feature parity | PASS after 8 downgrades (**V5 record; see §6 for the V6 re-run: 12/12 after 7 further downgrades**) |
| 11 | Backend syntax | `node --check` × 364 files | behavioural | every backend file parses | imports resolve, routes mount | PASS (0 failures) |
| 12 | Frontend type-check | `tsc --noEmit -p tsconfig.app.json` | behavioural | 206-file TS surface type-checks (exit 0) | runtime behaviour, layout, a11y | PASS |
| 13 | Canonical backend suite | `cd backend && npm test` | **behavioural** | 1,315 discovered / 1,315 executed / 1,269 pass / 46 fail / 0 skip, exit 1 | that the 46 would pass with MariaDB present — inferred from cited mechanisms, not measured | FAIL (DB-caused) |
| 14 | Failure causation | `Evidence/logs/v5/backend-canonical-suite.triage.md` | documentary over a behavioural log | all 46 failures map to `ECONNREFUSED 127.0.0.1:3306`, the app's own 503 DB guard, or a handler whose only failure mode is the absent pool | that the code is correct | PASS (causation only) |
| 15 | Enterprise suite | `node --test backend/enterprise-test/*` | behavioural | 187/187 pass, exit 0 | live-store behaviour | PASS |
| 16 | Browser suite | `npx playwright test --list` | behavioural (enumeration only) | 3,675 tests across 42 projects are *enumerable* | **0 executed** — no browser binary | BLOCKED (EG-011) |
| 17 | Package verifier | `scripts/verify-audit-package.sh` | self-referential | 61/61 checks pass; 58 of 61 are existence-or-substring checks | any application behaviour | PASS (as designed, reclassified) |
| 18 | Reconciliation verifier | `python3 scripts/verify-v4-reconciliation.py` | self-referential | arithmetic in the reconciliation document is internally consistent | that the underlying counts are right | PASS after fixing its own two bugs |
| 19 | Secret scan | `python3 scripts/scan-secrets.py` | behavioural (regex) | no secrets in `.md`/`.json`/`.log` | `.tsv` files are **not scanned** — a known limitation | PASS (with stated gap) |
| 20 | Deployed artifact | `git ls-tree -r HEAD \| grep -c '^dist/'` | behavioural | `dist/` is not in the repository (0 files) | what the server actually serves | INCONCLUSIVE |

**Tally:** 13 PASS, 3 FAIL (defect found and recorded — #9, #13, and #7 before its fixes), 1 BLOCKED, 1
INCONCLUSIVE, 2 reclassified as weak (#17, #18). The two strongest available checks — a real database and a
real browser — are the two that could not run.

## 3. Corrections applied during verification

Each correction was found by a check above, is reproducible from the cited command, and is disclosed in
`DISCREPANCY-LOG.md` rather than silently patched.

| Correction | Found by | Before | After | Blast radius |
|---|---|---|---|---|
| DISC-023 — inventory counted a test file | check #2 vs #3 | 651 legacy files / 193,320 lines | **650 / 193,310** | 12 documents swept; totals recomputed |
| DISC-024 — classifier errors in both directions | checks #6–#8 | 384 ops; 126/6/27/11/9/201/4 | **385 ops; 152/7/27/11/2/176/10** | every reachability figure, the parity mix, the scorecard |
| DISC-025 — client calls with no served operation | check #9 (new) | not measured | **30 call sites / 23 paths** | 8 FULL PARITY rows downgraded, 2 to MISSING |
| DISC-026 — fabricated success after failed writes | check #9 + source read | not reported | **4 controls** | severity of the admin surface; no parity row changes |
| V4 test figures quoted a gated run | check #13 | 1,271 pass / 14 fail / 30 skip | **1,269 / 46 / 0** | 6 documents annotated |

**Package-wide reconciliation (requirement g):** the nine reported corrections of earlier passes are
individually re-checked in `AUDIT-CHANGE-HISTORY.md`; this pass adds five more (the table above) and each
one is carried into every document that quoted the superseded figure. Where a document was not rewritten —
because it is a historical record — a V5 note was inserted rather than the old number deleted.

## 4. Reproduction

```bash
cd /home/user/ResumePilotAi
git rev-parse HEAD                                  # cccd35a5…
node developer-review/tools/legacy-modern-inventory.cjs
node developer-review/tools/parity-matrix.cjs        # writes FEATURE-PARITY-MATRIX.md + artifact
node developer-review/tools/backend-reachability.cjs # writes register artifact + TSV + log
node developer-review/tools/reachability-crosscheck.cjs
node developer-review/tools/client-call-existence.cjs
node developer-review/tools/parity-endpoint-audit.cjs
cd backend && npm test                               # canonical suite; needs MariaDB to pass
```

All tools are read-only with respect to application source. None of them writes outside
`developer-review/`.

## 5. Residual independence gaps (stated, not hidden)

1. **Two parsers, one corpus.** Checks #7 and #8 are separately written but read the same files; a
   systematic misreading of TypeScript syntax would fool both.
2. **No runtime observation.** A network capture of a running build would settle the 10 `UNVERIFIED`
   operations and would confirm or refute DISC-025 empirically. It could not be taken here (no browser, no
   DB, and the built bundle is not in the repository).
3. **`UNREACHABLE` ≠ unused.** 23 operations were legacy-called; 153 never had a client. Neither state
   says the endpoint is dead in production — only that no caller exists in this tree.
4. **Mocked providers.** No payment gateway, AI provider, SMTP or Firebase call was made. Any statement
   about those integrations is a statement about the mock.

## 6. V6 additions (base `a5835ff6`)

V6 is not a re-run of V5's checks: the mandate requires checks that V5 did not have. Three instructions were
added to the audit's own tooling and one was repaired.

| # | Check | What it can prove | Result |
|---|---|---|---|
| 31 | `parity-depth-checks.cjs` check 8 — FULL rows whose legacy source shows subfeature signals absent from modern | that a keyword-level *lead* exists; **not** that a feature is missing | 4 leads, all adjudicated as attribution breadth (register §6) |
| 32 | check 9 — client call sites resolving to a registered operation | that a call cannot succeed as written (path absent from the register **and** from `backend/` by grep) | 30 sites / 19 paths → 17 defective paths |
| 33 | check 10 — legacy export/edit capability with a recorded disposition | that a removal is *undocumented*; it cannot tell intent from oversight | 10 leads, 2 real residues (DISC-040) |
| 34 | check 7 (repaired) — declared backend actually called, resolving **two local import hops** | that a row is uncalled *including* via its helpers | 0 uncalled rows (V5's version falsely flagged 25) |
| 35 | `verify-v4-reconciliation.py` (repaired) — `assert full == 19` replaced by a derived assertion | that the verifier cannot be satisfied by editing the register | 16/16 pass, and the assertion now fails if a FULL row is unsupported |

**What V6 explicitly does not count as proof** (mandate §7): a component existing, a spec being written, a
mock test passing, or a register row being classified. That is why the verdict stays `PARTIAL — INCOMPLETE`:
the only evidence that could close it — a browser and a database — is unavailable (§5).

**A note on independence.** The V6 checks share the V5 artifacts as inputs. They are independent of the
*conclusions* (they re-derive them from source), not of the *inventory*. If the inventory mis-walked a file,
V6 would not notice; the remedy is a clean-clone re-run, which this environment cannot perform.
