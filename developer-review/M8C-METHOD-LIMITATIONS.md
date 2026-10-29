# M8C — Method Limitations

**Mandate:** 8C §10. **Audited revision:** `69a3ed4`.

This document exists so that no number in M8C can be read as more than it is. Every limitation below
is a statement about **method**, not a disclaimer.

---

## 1. Evidence outranks percentages, green checkmarks and executive declarations

The order of authority used throughout M8C:

1. A reproducible probe or a file that can be opened.
2. A machine-readable artifact whose generating script is committed.
3. A register row with a resolving citation.
4. A report's prose.
5. A total that matches another total.

Level 5 is last on purpose. Three of M8C's findings came from total-matching being wrong: 117 vs 112
(a denominator that included unaccepted proposals), 651 vs 650 (a numerator that included an excluded
test file), and 18 vs 19 shared-corpus rows (a grouping method that missed a row). In each case every
document "agreed" with every other document, and the documents were still wrong.

## 2. Ten separate measures, no combined forensic percentage

No single "audit completion" or "forensic confidence" figure is published. It would need weights for
"half-implemented", "unknown", and "unreconstructed", and no defensible weight exists in the evidence.
The ten measures, each with its denominator on its face:

| # | Measure | Value | Denominator / rule |
|---|---|---|---|
| 1 | Strict FULL parity | **13 / 112 = 11.61%** | accepted register rows |
| 2 | FULL + REPLACED | **18 / 112 = 16.07%** | accepted register rows |
| 3 | Any implementation (FULL+PARTIAL+REPLACED) | 69 / 112 = 61.61% | accepted register rows |
| 4 | Missing or fabricated | 40 / 112 = 35.71% | accepted register rows |
| 5 | FULL parity, UNVERIFIED excluded | 13 / 109 = 11.93% | 112 − 3 unverifiable rows |
| 6 | Legacy file inventory in scope | **650 measured / 651 inventoried** | tests excluded by the audit's own rule |
| 7 | Corpus duplication | **1.865×** (1,212 per-row references / 650 distinct) | within-row deduplicated |
| 8 | Shared-corpus rows reconstructed | **19 = 16 capability-scoped + 2 legitimate share + 1 nested** | the 19 shared-corpus rows; separately **41 of 53** bare-directory rows remain unreconstructed |
| 9 | Runtime test cases | **8 PASS / 1 FAIL / 12 BLOCKED / 2 N/A = 23** | BLOCKED and N/A never count as pass |
| 10 | Browser E2E coverage | **0 of 12 browser-level claims** | no browser in the environment |

Measure 8's exact accounting (authoritative counts in `m8c-corpus-scoping.json` `counts`):
**19 rows share a corpus** — `capabilityScoped` 16, `legitimateShare` 2, `nestedCorpusExplained` 1.
Two further rows (`FP-A02`, `FP-A04`) share an **empty** corpus and are `noCorpus`: they measure
fabricated values, not a capability, and are not part of the 19. Separately, of the **53
bare-directory rows**, 12 are now capability-scoped or a declared legitimate share and **41 remain
`directoryUnreconstructed`** — named, not cleared, and counted as UNVERIFIED everywhere.

**Parity ≠ audit completion ≠ production readiness.** A row can be FULL parity and still be
unreachable; a register can be 100% mapped and still mis-attribute every file; nothing here asserts a
deployment is fit for production.

## 3. The 227-operation caution

Earlier audit families counted **227 operations that no UI class references**. That is *not* 227 dead
endpoints, and M8C does not restate it as such. A non-UI-classified operation may be:

- **unreachable** (no route registration survives) — a dead endpoint;
- **server-only** (webhooks, cron, provider callbacks) — correctly without UI;
- **external-facing** (called by another service or a mobile client);
- **indirectly reachable** (called by a helper the UI uses, or by a route alias);
- **unverified** (the reachability instrument did not resolve it either way);
- **unused** (registered, reachable, never called);
- **intentionally exposed** (admin/ops surface, documented).

Collapsing these into one figure would overstate the defect count by construction. The audit's own
reachability instrument was found wrong **in both directions** in V4 (`DISC-024`), which is direct
evidence that a single "dead endpoints" total is not recoverable from it.

## 4. Static inspection is never runtime execution

Every "static" claim in M8C states what the code does. It does not state that a browser reaches it, a
provider honours it, or a database persists it. All 19 reconstructed capabilities remain static
findings.

## 5. Rules that were applied to the auditor's own work

- `DISC-056` — a finding written by this audit that claimed runtime verification with no citation —
  was corrected by **adding the citation**, not by softening the claim.
- The verifier's own false FAILs (empty-corpus duplication, wrapper-only zero scores) were treated as
  **auditor errors**, not as evidence about the product.
- Where a first fix was wrong (per-row justification skipping), the fix was replaced and the reasoning
  published, rather than quietly deleted.

## 6. Specific limitations by artifact

| Artifact | Limitation |
|---|---|
| `m8c-corpus-scoping.json` | 41 of 53 bare-directory rows remain reconstructed-by-declaration only; their scoped corpora do not exist yet |
| `m8c-capability-ledger.json` | depends on M8A's `proposedRegisterAction` field to identify proposals |
| `m8c-file-inventory.json` | "mapped" = reached by a corpus, not assigned to the right capability |
| `m8c-blast-radius.json` | line counts use `splitlines()`; a file without trailing newline counts one fewer |
| `m8c-runtime-manifest.json` | probe paths are stored normalised (`{id}`), so probe→test mapping is by URL shape; 11/11 contract defects unprobed |
| `m8c-register-evidence-delta.json` | line numbers in citations were captured at `a2ecb96d2b19` and were not re-derived |
| `m8b-integrity-verify.py` | passing 12/12 does not mean the register is correct; the checks are structural |
| `m8b-fixture-harness.py` | 13 fixtures prove the checks fire; they do not prove the checks are sufficient |

## 7. What would change these numbers

- Reconstructing the 41 rows would change measure 8 and every volume-derived figure.
- Running the browser suite would change measures 9 and 10 and could convert FAIL/BLOCKED to PASS.
- Provisioning MariaDB would unblock `T6`'s neighbour cases and could confirm or refute persistence
  behaviour.
- Accepting any of the 5 proposals would make 117 legitimate; until then it is not.

## 8. Standing prohibitions honoured in this mandate

No application code, tests, manifests, lockfiles or deployment configuration were modified. No
verifier check was deleted, no assertion weakened, no expected value changed, no per-row exemption
added. No production data or credentials were used. No screenshots, timestamps, counts or commands
were fabricated. History was not rewritten; the delta is published alongside it.
