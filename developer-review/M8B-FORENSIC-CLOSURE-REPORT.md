# M8B — FORENSIC CLOSURE REPORT

**Mandate:** 8B — Forensic Closure, Measurement Reconciliation & Independent Acceptance
**Source revision:** `69a3ed4` = `69a3ed4c28d2fa7984eac7ee48cb75862d2cc029` (HEAD = `origin/arena/393531fe-resumepilotai`)
**Application source checkpoint:** `888c2e5` (HEAD's parent; app trees identical — §2)
**M8A publication commit:** `69a3ed4c28d2fa7984eac7ee48cb75862d2cc029` (the commit being audited *from*)
**Verdict:** **`PARTIAL — BLOCKED`**
**Application files modified:** **0**

---

## 1. Position

M8A's starting conditions were treated as hypotheses. Every one was revalidated.

| M8A starting condition | Revalidated? | Result |
|---|---|---|
| 16/16 claims source-adjudicated | yes | **holds** — one primary disposition each, histogram 3/7/4/1/0/0/1 |
| 0/16 end-to-end tests | yes | **holds** — browser end-to-end is still 0, and now proven impossible here |
| 2/16 backend route-level | yes, exceeded | **8 integration-level PASS**, 1 **FAIL**, 12 blocked rows, 2 N/A |
| 14 runtime blocked | yes, re-attributed | 12 blocked rows, each with a named prerequisite; several previously-blocked claims now have evidence |
| FP-A14/A15 duplicated measurements | yes, **cause corrected** | not a copied template — **directory-scoped corpus attribution**, proven by exact reproduction |
| verifier weaknesses | yes | **5 of 6 confirmed**; one (`helper-verb`) **overstated**; new weaker checks found |
| verdict `PARTIAL — INCOMPLETE` | yes, **revised** | **`PARTIAL — BLOCKED`** — see §7 |

The most consequential M8A correction: **the duplicated measurement was never a copy-paste artifact.** The numbers
were computed correctly, from the wrong corpus.

---

## 2. Gate A — provenance and working tree

| Item | Value |
|---|---|
| branch | `arena/393531fe-resumepilotai` |
| HEAD | `69a3ed4c28d2fa7984eac7ee48cb75862d2cc029` |
| origin | identical (`git rev-parse` both sides) |
| working tree at start | clean |
| audited app checkpoint | `888c2e5` (parent of HEAD) |

Twelve artifacts cite **five different revisions**. All five resolve except `a7d08a2`, which is **not an ancestor**
of HEAD. It is accepted only because the application trees are **byte-identical** to HEAD for every recorded
revision and **all 100 differing files** between `a7d08a2` and HEAD lie under `developer-review/`. That is the
relevant property: *a measurement transfers if the app tree is identical*, not merely if the revision resolves.

**Gate A: PASS.**

---

## 3. Gate B — FP-A14 / FP-A15 independently reconstructed

Detail: `M8B-FP-A14-FP-A15-RECONSTRUCTION.md`.

**Cause, proven by experiment:**

| candidate | verdict |
|---|---|
| copied template | rejected — the published numbers reproduce *exactly* from real source |
| stale artifact | rejected — regenerating at HEAD reproduces them |
| **incorrect attribution** | **accepted** — the corpus is a bare directory shared by four rows |
| generator counting defect | rejected — an independent Python implementation matches all 16 classes to the digit |

`FP-A14`, `FP-A15`, `FP-A16` and `FP-A21` all declare `src/components/admin/settings` (35 files, 14,191 lines), so
all four carry one measurement. Both capabilities live inside a single 2,993-line file
(`subscriptionsSettings.jsx`), as sibling JSX panels — `coupons` at `:2390-2677`, `invoices` at `:1356-1669`.

**Reconstructed, capability-scoped:**

| class | FP-A14 Coupons | FP-A15 Invoices | published (both) |
|---|---:|---:|---:|
| tabular data | 2 | 2 | 14 |
| search | 0 | 0 | 10 |
| filtering | 0 | 8 | 28 |
| pagination | 8 | 6 | 100 |
| dialog | 2 | 0 | 18 |
| CSV / JSON / PDF | 0 / 0 / 0 | 0 / 0 / 0 | 1 / 10 / 5 |
| authz gate | 0 | 0 | 87 |

The two rows are now genuinely distinct, and both far smaller. `authz: 87` and `document: 5` belonged to *other*
settings screens. Classification (`MISSING`) is unchanged and independently supported: 0 modern files.

**Blast radius:** 53 of 112 rows use bare-directory paths; **8 groups / 18 rows** share a corpus; the per-row file
sum is **1.86×** the distinct file count (1,212 vs 651).

**Gate B: PASS for the two required rows.** The other 16 shared-corpus rows remain **UNVERIFIED**, stated as such.

---

## 4. Gate C — measurement and summary-count provenance

Independently recomputed (detail: `M8B-REGISTER-RECONCILIATION.md`):

| quantity | published | recomputed | status |
|---|---:|---:|---|
| capabilities | 112 | 112 | agrees |
| parity histogram | 13/51/28/0/12/5/3 | identical | agrees |
| operations | 393 | 393 | agrees |
| subfeature rows / statuses | 112 · 21/33/8/50 | identical | agrees |
| findings / IDs | 53 / 55 | 53 / 55 | agrees |
| claim dispositions | 3/7/4/1/0/0/1 | identical | agrees |
| `legacyFilesMeasured` | 650 | 651 | **±1 UNRESOLVED** |
| coverage | 1,544 | not re-derived | **UNVERIFIED** |
| 18 rows' subfeature tables | published | not reproducible as capability inventories | **UNRELIABLE** |

**Gate C: PASS**, with three items explicitly carried as unresolved rather than reconciled by assertion.

---

## 5. Gate D — the verifiers were substantively tested

Detail: `M8B-VERIFIER-INDEPENDENT-VALIDATION.md`.

| claim | verdict |
|---|---|
| literal `176` pin | confirmed — `verify-v4-reconciliation.py:338` |
| floor thresholds | confirmed — 10 sites, all `>=` |
| vacuous `SUPPORTED` | **confirmed and traced to the generator**: `parity-endpoint-audit.cjs:105-108` grades a zero-endpoint row `SUPPORTED`; the verifier exempts `SUPPORTED` (`:281`). Three rows affected: `FP-C06`, `FP-E04`, `FP-E13` |
| `rowsWithNoDeclaredEndpoint` band | confirmed — `30 <= n <= 45` |
| shared helper-verb assumption | **overstated** — explicit `method:` wins; all 9 bare `fetch` sites recorded correctly |
| shape-not-meaning validation | confirmed — nothing compares corpora across rows |

**Also found:** `verify-v4-reconciliation.py:290` asserts a `>=` sum over four buckets rather than `==` with
per-bucket reconciliation.

**New verifier** (`tools/m8b-integrity-verify.py`): 11 substantive checks, **no pinned counts**, equality not floors.
On the real package it returns **6 PASS / 5 FAIL** — it fails on the five genuine defects the published set passes.
The published set still returns 61/61, 20/20, exit 0, which is the point: **a green verifier is not evidence of
sound measurement.**

**Negative testing:** 8 corrupted fixtures, **8/8 rejected for the correct reason**, with the baseline first
proven to reproduce the real defects. Two harness defects were found and fixed during this work (§`METHOD-LIMITATIONS` §2).

**Gate D: PASS.**

---

## 6. Gates E–L

| Gate | Result | Basis |
|---|---|---|
| **E** independent recomputation agrees | **PASS** | a separate Python implementation reproduces the whole-directory table exactly and produces the scoped values |
| **F** 16 claims correctly adjudicated and traceable | **PASS** | 16/16, one primary bucket each; **2 ID collisions corrected** (`FP-G22→FP-G26`, `FP-G23→FP-G27`) |
| **G** feasible runtime tests executed and recorded | **PASS for what was feasible** | 23 test rows: **8 PASS**, **1 FAIL**, **12 BLOCKED**, **2 N/A** |
| **H** blocked tests documented | **PASS** | each blocked row has an exact prerequisite |
| **I** reports and registers reconciled | **PASS** | reconciliation dataset + register reconciliation report |
| **J** previously unresolved findings rechecked | **PASS** | 10 IDs dispositioned + `FP-D02` |
| **K** scope respected | **PASS** | `0` application files modified (§9) |
| **L** evidence, log, README, handover validated | **PASS** | see §10 |

---

## 7. Verdict

**`PARTIAL — BLOCKED`**

All forensic work that is *possible in this environment* is complete: the measurement cause is proven, both rows are
independently reconstructed, the verifier set is demonstrably weak and has been replaced by one that fails on real
defects, eight runtime behaviours are verified, and every remaining limitation has a named prerequisite.

It cannot be `COMPLETE` because material acceptance criteria depend on infrastructure that does not exist here:

- **browser end-to-end: 0.** Nine browser-only test rows are blocked, including the highest-risk finding in the
  entire audit — the checkout that fabricates a paid invoice.
- **no MariaDB**, so durability, migrations, CAS semantics and the rate-limit store are untestable, and the
  in-memory double provably diverges from production behaviour.
- **no provider credentials**, so no settlement claim is made in either direction.
- **16 of the 18 shared-corpus rows remain un-reconstructed**, and coverage (1,544) was not re-derived.

It is not `PARTIAL — INCOMPLETE` because no *feasible* audit task remains undone. Every outstanding item is gated on
a named external dependency, listed in `M8B-OPEN-FINDINGS-AND-BLOCKERS.md` §4.

**No 100 % parity claim, no zero-defect claim, no production-readiness claim is made.**

---

## 8. The finding that matters most

Unchanged from M8A but now with more of its context verified: **checkout fabricates a paid order, an invoice number
and "PAID (Verified Server Entitlement)" when the payment call fails** (`checkout-modal.tsx:345-360`).

M8B adds two facts about it:

1. **The server rejects rather than fabricates.** `POST /api/pay` → `400 INVALID_PLAN`; razorpay →
   `400 CLIENT_PAYMENT_IDENTITY_REJECTED` ("Payment ownership and amounts are server-controlled"); paypal →
   `503 PAYMENT_CONFIGURATION_UNAVAILABLE`. The fabrication is **entirely client-side** — a real rejection is
   converted into a fake success.
2. **Server-side coupon validation is strict** (`404 "does not exist"` for a fake code), so the client's fail-open to
   hardcoded coupons is also client-only.

That combination — a correct, defensive backend with a client that overwrites its failures — is invisible to every
route, contract and coverage metric in this audit package.

---

## 9. Scope compliance

```
$ git -c core.quotePath=false status --porcelain | grep -v '^?? developer-review/'
(empty)
```

No application source, configuration, dependency, manifest, lockfile, schema, migration or deployment file was
modified. All new artefacts are under `developer-review/`. `backend/node_modules` is git-ignored and was not
committed. No production credential, account, payment state or personal data was touched; probes used synthetic
identities (`probe-super`, `probe-user`, `probe-other`) and synthetic records only. The one attempted environment
mutation (enable messaging) was **rejected by the application** and changed nothing. No TLS or security control was
weakened: the local HMAC verifier is the repository's own non-production mechanism and is inert under
`NODE_ENV=production`.

---

## 10. Deliverables

| Artefact | Contents |
|---|---|
| `M8B-FORENSIC-CLOSURE-REPORT.md` | this report |
| `M8B-FP-A14-FP-A15-RECONSTRUCTION.md` | cause proven by experiment, independent reconstruction, blast radius |
| `M8B-VERIFIER-INDEPENDENT-VALIDATION.md` | before/after behaviour, 8 fixtures, remaining blind spots |
| `M8B-RUNTIME-CLOSURE-MATRIX.md` | 23 runtime rows, per-test evidence and prerequisites |
| `M8B-REGISTER-RECONCILIATION.md` | published vs recomputed, unreliable counts, ID-collision correction |
| `M8B-OPEN-FINDINGS-AND-BLOCKERS.md` | 10 open IDs dispositioned + `FP-D02`; dependencies; remediation queue |
| `M8B-METHOD-LIMITATIONS.md` | blind spots and seven self-corrections |
| `M8B-reconciliation.json` | machine-readable reconciliation dataset |
| `M8B-omission-challenge.json` | M8A claim register, ID collisions corrected |
| `tools/m8b-integrity-verify.py` | 11 substantive checks, no pinned counts |
| `tools/m8b-fixture-harness.py` | 8 corrupted fixtures + baseline |
| `tools/m8b-reconstruct-a14-a15.py` | independent reconstruction |
| `tools/m8b-runtime-probes.cjs` | 35 runtime probes |
| `Evidence/artifacts/m8b-{runtime-probes,a14-a15-reconstruction}.json` | probe and reconstruction data |
| `Evidence/fixtures/m8b/` | all 8 fixtures + `harness-results.json` |
| `Evidence/logs/m8b-{toolchain,runtime-probes}.log` | command log, probe log |
| `DISCREPANCY-LOG.md` | **DISC-056** test-double divergence |

**Reproduce:**
```bash
python3 developer-review/tools/m8b-integrity-verify.py     # 6 PASS / 5 FAIL — the 5 are real
python3 developer-review/tools/m8b-fixture-harness.py      # 8/8 rejected correctly
python3 developer-review/tools/m8b-reconstruct-a14-a15.py  # scoped A14/A15 inventories
bash    developer-review/scripts/verify-audit-package.sh   # published set, still 61/61
```

---

## 11. Handover — issue as a separate remediation mandate

Ready to implement, ordered by risk (detail in `M8B-OPEN-FINDINGS-AND-BLOCKERS.md` §6):

1. `FS-M8A-01` checkout fabricated success — asserts a financial state; **highest risk**.
2. `FS-M8A-02` / `FP-G26` contact false success — a complete backend exists and is unused.
3. `FS-M8A-05` / `FP-A20` queue fabrication — invented SES frames with false `file:line`.
4. `FS-M8A-03` / `FP-G10` CMS renderer disconnected; unknown slugs serve the wrong page.
5. `FS-M8A-04` / `FP-G09` blog reader — wrong URL, swallowed error, ignored slug.
6. **DISC-056** make `InMemoryRepository` honour `publishedOnly`, or forbid visibility assertions in in-memory runs;
   without this, later runtime evidence carries a known false-positive/negative.
7. Corpus re-attribution for the 18 shared-corpus and 53 bare-directory rows.

Items 1–5 are product defects and must **not** be fixed inside an audit branch. Item 6 is test infrastructure and
should precede any further runtime acceptance work.
