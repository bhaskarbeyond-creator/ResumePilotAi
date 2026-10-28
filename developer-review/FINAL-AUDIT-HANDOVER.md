# Final Audit Handover — ResumePilotAi (Mandate 5, updated by V6 / Mandate 6)

**V5 revision:** `cccd35a5dac62efa5ead2c309a0fc60b201f9b08`
**V6 audit base:** `a5835ff6693d272505a4e1dfdd3a8faa95b824c4` (V5 chain `631f0e23` → `bad19736` → `a5835ff6`, all ancestors of the V6 head; nothing was reset or force-pushed)
**Comparison base:** `origin/main` = `0adad00d…`; `origin/dev` = `ea7b7416` (1,459 commits reachable)
**Package scope:** 40 documents + 5 analysis tools + artifacts and logs, all under `developer-review/`.
Application source, dependencies, lockfiles, deployment config and database schemas were **not** modified.

---

## 1. Verdict

**`PARTIAL — INCOMPLETE`** (V6 re-examination; unchanged in kind, weaker in the parity axis)

| Axis | Status | One-line basis |
|---|---|---|
| Traceability | **achieved** for the inventoried units | every file, capability, operation, allegation, finding and requirement carries a class and an anchor; the tooling is re-runnable and three tools were fixed *again* in V6 before their output could be trusted (parity-endpoint-audit, parity-depth-checks, verify-v4-reconciliation) |
| Parity | **incomplete, and weaker than V5 stated** | 12 full / 47 partial / 32 missing / 12 mock / 6 replaced / 3 unverified of 112; **17 client paths (27 call sites) resolve to no registered operation**, and 7 of V5's 19 `FULL PARITY` rows did not survive subfeature examination |
| Runtime | **blocked** | unchanged from V5: 0 browser tests executed, 0 live provider calls, 0 MariaDB-backed tests; no V6 claim rests on runtime evidence |

`COMPLETE` is refused: three acceptance gates of Mandate 6 cannot pass in this environment — browser
runtime evidence, provider/MariaDB execution, and complete subfeature coverage of all 112 rows (74
subfeatures were re-read in depth; the other rows rest on V5 evidence). Nothing was repaired; the
application is byte-identical to `a5835ff6` outside `developer-review/`.

## 2. What changed since V4, and why a reader must not reuse V4 numbers

| Quantity | V4 | V5 | **V6** | Cause |
|---|---:|---:|---:|---|
| Legacy source files | 650 | 650 | **650** | unchanged (DISC-023) |
| Modern source files | 206 | 206 | **206** | unchanged |
| Unique backend operations | 384 | 385 | **385** | `app.all(…)` registration was unparsed in V4 |
| Reachability classes (UI / indirect / external / server-only / unexposed / unreachable / unverified) | 126 / 6 / 27 / 11 / 9 / 201 / 4 | 152 / 7 / 27 / 11 / 2 / 176 / 10 | **152 / 7 / 27 / 11 / 2 / 176 / 10** | V5 fixed the scanner (`enterpriseRequest`, `dynamicParent`); V6 re-ran it and found no new disagreements (385/385 crosscheck) |
| Parity mix (full / partial / missing / mock / replaced / unverified) | 28 / 36 / 30 / 9 / 6 / 3 | 19 / 43 / 32 / 9 / 6 / 3 | **12 / 47 / 32 / 12 / 6 / 3** | 7 `FULL PARITY` rows failed subfeature examination; 2 `PARTIAL` rows were fixtures (DISC-029, DISC-030) |
| Client call sites with no registered operation | not measured | 30 sites / 23 paths | **30 sites / 19 distinct paths (17 defective)** | V6 normalised `{X}` and separated benign fallbacks from defects (§5 of the depth register, DISC-027) |
| Legacy subfeatures re-read in depth | 0 | 0 | **74** | only the 8 alleged rows + 5 swept rows; the remaining 99 rows are *not* subfeature-audited (stated, not implied) |
| Detector checks | 6 | 7 | **10** | `tools/parity-depth-checks.cjs`; result 4 PASS / 6 LEAD, every lead adjudicated |
| Findings | 23 | 26 | **40** | DISC-027 … DISC-040 |
| Allegations adjudicated | 35 | 35 | **48** | RA-36 … RA-48 |
| Backend suite | 1,271 pass / 14 fail / 30 skip | 1,269 pass / 46 fail / 0 skip | **1,269 / 46 / 0** (unchanged; re-used, not re-run) | canonical harness enables the MariaDB gate |
| Total items in the coverage arithmetic | 1,492 | 1,496 | **1,523** | +14 findings, +13 allegations — and still not a measure of completeness |

> The V6 column changes **no** unit count except findings, allegations and the arithmetic total. What moved
> is the *classification* of 9 capability rows after subfeature-level reading; the register, the artifacts
> and the detectors are otherwise the V5 instruments re-run and, where they were wrong, repaired.

## 3. The five things a decision-maker should act on

1. **The blog is not wired** (DISC-025). `pages/blog/index.tsx`, `pages/blog/editor.tsx` and
   `AdminBlogManagementTab.tsx` call `/blog/posts*`; the backend serves `/blog-data*` and
   `/admin/blog/posts*`. Every read, publish, edit and delete 404s. `FP-G09` was `FULL PARITY`.
2. **The support/helpdesk surface has no backend at all** (DISC-025). No ticket endpoint exists; six
   client paths (`/support/tickets*`, `/admin/support/tickets*`) are dead. `FP-G24` was `FULL PARITY`.
3. **Admin controls report success for writes that never happened** (DISC-026). A user is displayed as
   suspended; a "MariaDB hot backup snapshot completed successfully (Verified OK)" is shown; caches are
   reported purged; a blog article is reported deleted. All four swallow the failure with
   `.catch(() => {})` and then mutate local state.
4. **The enterprise control plane is better than V4 said, the admin console worse.** 45 enterprise
   operations are genuinely UI-driven (V4 called them unreachable), while 79 `/admin` operations have no
   working caller and several admin panels are fabricated or broken.
5. **Nothing was verified against a real database, a real browser or a real provider.** The 46 backend
   failures are *explained* by the absent database, not excused by it: the code paths behind them were
   never executed.

## 4. Ordered next steps for whoever picks this up

1. Start a disposable MariaDB and re-run `cd backend && npm test`. Expect the 46 to drop; any that
   remain are genuine defects, and the triage file says exactly which tests to look at
   (`Evidence/logs/v5/backend-canonical-suite.triage.md`).
2. Install a browser and run the 3,675 enumerated Playwright tests plus the axe scan. This is the only
   path to any accessibility claim.
3. Fix DISC-025 as a contract mismatch, not a UI bug: decide the canonical path for blog, tickets,
   queues, moderation, user status and coupons, then make both sides agree.
4. Remove the four `.catch(() => {})` fabrications (DISC-026) — this is a correctness *and* a trust issue
   for anyone operating the console.
5. Only then re-derive parity. Do not re-use the V4 mix; regenerate with
   `parity-matrix.cjs` + `parity-endpoint-audit.cjs` and re-run `client-call-existence.cjs` afterwards.

## 5. Reproduction (read-only)

```bash
git rev-parse HEAD                                        # V6 head (descends from a5835ff6)
node developer-review/tools/legacy-modern-inventory.cjs    # 650 legacy / 206 modern, 650/650 + 206/206 attributed
node developer-review/tools/parity-matrix.cjs              # 112 rows: 12/47/32/12/6/3
node developer-review/tools/backend-reachability.cjs       # 385 ops, 7 classes
node developer-review/tools/reachability-crosscheck.cjs    # 385/385, 0 disagreements
node developer-review/tools/client-call-existence.cjs      # 229 call sites, 30 dead sites / 23 paths
node developer-review/tools/parity-endpoint-audit.cjs      # 12/12 FULL rows supported, 112 rows checked
node developer-review/tools/parity-depth-checks.cjs        # NEW: 10 checks, 4 PASS / 6 LEAD (adjudicated)
bash developer-review/scripts/verify-audit-package.sh      # 61/61
python3 developer-review/scripts/verify-v4-reconciliation.py   # 16/16
```

## 5.1 What V6 adds for the next reader

| New question V6 asked | Answer | Where |
|---|---|---|
| Does the member drawer removal matter if the API is alive? | Yes — teams can be created but not staffed; workspaces kept an equivalent via `updateMembership`, which is why only B05 was downgraded | `FEATURE-DEPTH-EVIDENCE-REGISTER.md` §3.1 |
| Is "100 templates" the same as 51 designs? | No — 5 archetypes × 19 families, 6 bespoke specs, 3,254 lines vs 32,696 | §3.3 |
| Did the SMTP/IMAP tab lose anything while keeping its name? | 8 subfeatures, all still server-side and now unreachable from the UI | §3.4 |
| Was the voice coach replaced by an equivalent? | No equivalent exists anywhere in `frontend/src` (0 audio APIs) | §3.5 |
| Is the employer portal's messaging just "partial"? | No — it is a fixture with a state-only send, and the drawer's email path is a dead route reporting success | §3.7, DISC-028 |
| How many client actions can never work? | 17 paths / 27 sites, all verified by backend grep rather than by the register | §5 |
| Can the 10 detectors be trusted? | 6 of them emit leads; 4 leads of one check and most of another were adjudicated as false positives and excluded, with reasons | §6 |

**Ordered next steps, revised by V6** (superseding §4 only where they conflict): fix the contract mismatch
first (DISC-027) because 27 dead calls mask every other admin finding; then remove the fake-success paths
(DISC-026/028/029/030/031) so failures are visible; then restore the four removed surfaces that still have
live backend support (B05 members, A16 email tabs, B08 audit paging/export, G09 data path); only then
re-measure parity. Do **not** treat the V5 mix as a baseline — it overstated FULL by 7 rows.

## 6. What this audit cannot establish, stated plainly

- **It cannot certify production readiness**, and does not. No production system was contacted; no
  credential was used; no deployment was inspected (the served bundle is not in the repository).
- **It cannot call any capability "working"** on the strength of a route definition, a React page, a
  passing mock test, or a passing type-check. Those are exactly the inferences that produced the
  over-claims corrected here.
- **It cannot separate "unused" from "broken"** for the 176 `UNREACHABLE` operations without runtime
  observation; §9 of `BACKEND-OPERATION-REACHABILITY.md` gives the per-operation reason, and 23 of them
  are broken call sites rather than absent ones.
- **It cannot substitute documentation for evidence.** Every register row now has a classification; that
  is a statement about the register, not about the product, and the verdict was deliberately not raised
  when that milestone was reached.

## 7. V6 acceptance-gate statement

| Mandate-6 gate | Status | Note |
|---|---|---|
| All eight dispositions explicit | **PASS** | §2.1 of the depth register; RA-36…RA-48 |
| All affected rows corrected | **PASS** | 9 rows reclassified, evidence rewritten; matrix regenerated by tool |
| All FULL claims challenged | **PASS** | 19 V5-FULL rows re-read; 7 failed; the 12 survivors are endpoint-supported (12/12) |
| Call chains inspected | **PASS** | UI → client helper → route registration → handler for every §3 row with a backend column |
| Mocks distinguished from persistence | **PASS** | DISC-028…DISC-033 separate fabricated/state-only from server-backed |
| All totals agree | **PASS** | verifier 61/61, reconciliation 16/16, crosscheck 385/385 |
| Existing verifiers still pass | **PASS** | both scripts green; the reconciliation script's pinned `19` was replaced by a derived assertion (documented in `AUDIT-CHANGE-HISTORY.md`) |
| Full diff = zero application changes | **PASS** | `git diff --stat a5835ff6..HEAD -- . ':(exclude)developer-review'` = 0 files |
| Remaining runtime limitations explicit | **PASS** | §6 above and `FEATURE-DEPTH-EVIDENCE-REGISTER.md` §8 |
| Verdict may be `COMPLETE` only if all gates pass | **FAIL (by design)** | runtime evidence for the browser and the database remains absent, and 99 of 112 rows were not subfeature-audited → **`PARTIAL — INCOMPLETE`** |
