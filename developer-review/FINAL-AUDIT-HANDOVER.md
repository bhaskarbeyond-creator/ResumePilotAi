# Final Audit Handover — ResumePilotAi (Mandate 5, updated by V6 / Mandate 6, updated by V7 / Mandate 7)

> **V7 amendment, 2026-10-29 (`8a6e03bb`).** Read §13 first: the operation register was missing eight live
> operations (DISC-041), which changes the denominators in §2 and the verdict basis below. The V5/V6 text is
> retained verbatim so the correction can be audited against what it replaced. Nothing in the application
> changed; the verdict remains **`PARTIAL — INCOMPLETE`**.

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
runtime evidence, provider/MariaDB execution, and complete subfeature coverage of all 112 rows (56
subfeature rows were re-read in depth; the other 102 rows rest on V5 evidence). Nothing was repaired; the
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
| Legacy subfeatures re-read in depth | 0 | 0 | **56** | 10 rows (8 alleged + `FP-F02` + `FP-F06`); the remaining 102 rows are *not* subfeature-audited (stated, not implied) |
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

---

## 13. V7 amendment (`8a6e03bb`) — final capability closure and contract forensic audit

**V7 revision audited:** `8a6e03bbc279cfb7e3a62519659fa3fe770ad1be`. Comparison base `origin/main` =
`0adad00d`; V6 base `a5835ff6`. A foreign commit `a7d08a2` was present in the remote history, proven
byte-identical to `8a6e03bb` across all 3,806 tracked files, and preserved at
`refs/audit-preserved/base-a7d08a2` rather than merged, reset or discarded.

**Application source changes in V7: 0.** Every modified path is under `developer-review/`.

### 13.1 What V7 did that V5/V6 did not

| Mandate requirement | V7 action | Result |
|---|---|---|
| Source-of-truth verification before any conclusion | re-derived every register from the working tree, compared against the canonical artifacts, and wrote a second independent backend parser | found DISC-041: the register never scanned a router not named `router` |
| Close all 112 rows at subfeature level | hand-read 27 further rows; recorded a disposition, the file:line that settled it, and the subfeature lost | 40 adjudicated, 21 signal-clean, 41 with leads recorded, 10 rows / 20 items explicitly left open (§2.2 of `M7-CAPABILITY-CLOSURE.md`) |
| Validate the 17 paths / 27 sites independently | independent client scanner + independent backend parser, then a per-path adjudication separating *wrong URL* from *missing capability* | 15 paths / 22 live sites adjudicated; 3 paths retracted as served all along; every site classified |
| Prioritise false-success workflows | a detector (`successAfter`) plus a click→request→response→state→notification trace per site | 12 sites traced; 3 root-cause classes distinguished (wrong contract, absent capability, unchecked result) |
| Revalidate DISC-019…DISC-040 | re-read each against the tree | 20 re-confirmed, 2 corrected/partially retracted (DISC-025, DISC-029), 2 merged, 8 raised |
| Strengthen verification | 12 detectors, source-derived and register-integrity kept separate, each documented with scope/limits/false-positive behaviour | 3 PASS, 6 LEAD, and one detector (#12) whose entire value is that it disagrees with the register |
| Runtime | probed again and did not execute | blockers itemised; `RUNTIME-TEST-HARNESS-M7.md` specifies R-01…R-10 with no claims attached |

### 13.2 Corrected numbers (these supersede §2 above)

| Quantity | V6 | **V7** | Cause |
|---|---:|---:|---|
| Unique backend operations | 385 | **393** | `routes/support.js` defines `userRouter`/`adminRouter`, mounted twice; the scanner only knew `router` |
| Route registrations | 499 | **397** | mount prefixes are now de-duplicated (`/api/platform` is mounted twice at the same prefix) |
| Reachability classes (UI / indirect / external / server-only / unexposed / unreachable / unverified) | 152 / 7 / 27 / 11 / 2 / 176 / 10 | **156 / 10 / 27 / 11 / 2 / 176 / 11** | the 8 ticket operations are reachable |
| Operations with a live modern path | 159/385 = 41.3 % | **166/393 = 42.2 %** | numerator +14, denominator +8 |
| Parity mix (full / partial / missing / mock / replaced / unverified) | 12 / 47 / 32 / 12 / 6 / 3 | **12 / 49 / 30 / 12 / 6 / 3** | FP-G24 and FP-E14 corrected up, FP-E06 up, FP-C06 down |
| Client paths served by no operation | 23 (V5) / 19 with 17 defective (V6) | **15 distinct / 22 sites** | six ticket paths retracted (DISC-041) |
| Findings | 40 | **46 distinct** (48 IDs, 2 merged stubs) | DISC-041, 043…048 raised; 042/046 merged into 030 |
| Runtime | 0 browser / 0 MariaDB | **0 / 0** | unchanged |

### 13.3 Verdict

**`PARTIAL — INCOMPLETE`**, unchanged in kind and now better bounded.

- It is **not** `COMPLETE`: no browser run, no MariaDB, no provider call has executed; 10 capability rows
  still carry unadjudicated subfeature leads.
- It is **not** a collapse: 62 of 112 rows carry no residual lead, 12 FULL rows are endpoint- and
  reachability-supported (12/12 `SUPPORTED`), and the eight "missing" ticket endpoints turned out to be
  present, which means the product is in better shape than V5/V6 reported on that point — while the
  moderation, queue, backup and blog surfaces are confirmed broken in ways V5/V6 only partly described.

The honest one-line summary a reader should take away: **the administrative console is substantially
fabricated.** It shows invented records in three tabs, claims success for at least twelve actions whose
requests fail or are never sent, and in three cases the server-side capability does not exist at all.

### 13.4 Where to read the detail

| Question | Document |
|---|---|
| What did V7 conclude, row by row? | `M7-CAPABILITY-CLOSURE.md` + `CAPABILITY-SUBFEATURE-REGISTER.md` |
| Which client path maps to which backend operation, and what breaks? | `CLIENT-BACKEND-CONTRACT-REGISTER.md` §4 |
| What exactly is wrong, with severity and remediation? | `DISCREPANCY-LOG.md` DISC-041 … DISC-048 |
| What must be run to move the verdict? | `RUNTIME-TEST-HARNESS-M7.md` R-01 … R-10 |
| How were the numbers produced? | `M7-CAPABILITY-CLOSURE.md` §11 + `Evidence/logs/m7-toolchain.log` |

---

## 14. M8 amendment (`a2ecb96`) — independent validation, count reconciliation and runtime closure

**Audited revision:** `a2ecb96d2b194df25d5cd8ce2ece23ef65068fd9` (parent `c292159`; branch
`arena/393531fe-resumepilotai`). **Comparison base:** `origin/main` = `0adad00d`; M7 audited `8a6e03bb`.
**Application source changes in M8: 0** — every modified path is under `developer-review/`; §14.5 states
the three commands that prove it.

### 14.1 A published provenance claim from §13 is false — corrected here, not rewritten above

§13 opens by saying a foreign commit `a7d08a2` was "proven byte-identical to `8a6e03bb` across all 3,806
tracked files, and preserved at `refs/audit-preserved/base-a7d08a2`". Both halves are wrong, and the
sentence above is left exactly as published so the correction can be audited against it (**DISC-049**):

| Claim | Measurement at `a2ecb96` | Result |
|---|---|---|
| byte-identical for all 3,806 tracked files | `git diff a7d08a2 8a6e03bb --stat` → **264 files changed**, 103,955 insertions, 22 deletions | **false**. What survives, and it is the part that matters: **0 files differ outside `developer-review/`**, so the application tree *is* identical and no metric measured on the app is affected |
| 3,806 tracked files at that commit | `git ls-tree -r --name-only a7d08a2 \| wc -l` → **3,553** (3,806 is the count at `8a6e03bb`; 3,816 at `a2ecb96`) | **false** |
| preserved at `refs/audit-preserved/base-a7d08a2` | `git show-ref \| grep -i audit` → **no output** | **the ref does not exist**. The commit object still resolves (`git rev-parse a7d08a2`), so nothing was destroyed — but the promised mechanism is absent, and M8 did **not** create it retroactively, because that would misrepresent when it existed |
| the parity artefact was stamped for the M7 audit | `Evidence/artifacts/feature-parity.json` carried `"revision": "a7d08a2fa67b"` — the *foreign* commit, while the package says M7 audited `8a6e03bb` | stale stamp; artefact **regenerated** at `a2ecb96` |

This is the class of error an audit exists to prevent, so it is recorded as a finding rather than a typo.

### 14.2 The `397` vs `413` question is closed arithmetically

M7 left the difference "flagged for reconciliation". M8 replayed the **old** parser rules over current
source and diffed both parsers instance by instance: **413 = 405 + 6 + 2**.
**405** = 397 alias registrations + 8 standalone non-`/api` endpoints; **6** = one handler registered as
both `/x` and `/api/x` on one line (`backend/index.js:2867`, `3067`, `3136`, `3226`, `6537`, `6748`);
**2** = `Promise.all([fetch('https://api.github.com/…')])` at `backend/index.js:7419` parsed as routes.
In-scope disagreements between the two parsers: **0**, in both directions. The operation register
(**393**) did not move, and no expected value was edited — the *instruments* were repaired.
Detail: `M8-REGISTRATION-COUNT-RECONCILIATION.md`.

### 14.3 What changed, and what did not

| Quantity | M7 (`8a6e03bb`) | **M8 (`a2ecb96`)** | Cause |
|---|---:|---:|---|
| Route registrations / unique operations | 397 / 393 | **397 / 393** | unchanged |
| Independent contract parser | 413 | **405** | 2 false positives + 6 duplicate alias literals removed from the parser, not from the backend |
| Reachability (UI / indirect / external / server-only / unexposed / unreachable / unverified) | 156 / 10 / 27 / 11 / 2 / 176 / 11 | **156 / 10 / 27 / 11 / 2 / 176 / 11** | 166 operations now carry legacy evidence (was 82) after the `apiJson(`/`apiFetch(` extractor repair — **no class moved** |
| Parity mix | 12 / 49 / 30 / 12 / 6 / 3 | **13 / 51 / 28 / 0 / 12 / 5 / 3** (FULL / PARTIAL / MISSING / **STUB** / MOCK / REPLACED / UNVERIFIED) | three rows re-classified with anchors: `FP-D07` → PARTIAL, `FP-A12` → PARTIAL, `FP-C06` → FULL; the STUB label is now reported explicitly and holds **0** rows |
| Open subfeature leads | 10 rows / 20 items | **0 rows / 0 items** (ADJUDICATED 50 / EQUIVALENCE_LEAD 33 / SIGNAL_CLEAN 21 / DEEP_READ_M6 8) | 20 leads closed with call→route→persistence→authz→test chains |
| Contract | 212 sites → 190 / 8 / 14; 15 gap paths; 12 false-success sites | **same**, re-derived independently; gaps dispositioned **WRONG_URL 11 / MISSING_BACKEND 4** | `/admin/queues/dead-letter-queue/purge` reclassified: the "matching" `POST /platform/queues/purge` is a deliberate **410 GONE** stub |
| Findings | 46 distinct / 48 IDs | **53 distinct / 55 IDs** | DISC-049 … DISC-055; coverage arithmetic **1,537 → 1,544** |
| Runtime | 0 executed | **executed, partially**: suite 1,315 / 1,269 pass / 46 fail; `tsc -b` exit 0; **43 HTTP probes**; 4 scenarios PASS, 4 PARTIAL, 2 BLOCKED | backend really starts with `IN_MEMORY_REPOSITORY=1` and a local HMAC secret |

### 14.4 The three corrections a reader must not miss

1. **`POST /api/contact` is called by nobody in the modern app.** The marketing contact form
   (`frontend/src/pages/cms/index.tsx:234-243`) validates two fields and calls `setSubmitted(true)` — no
   request at all — while showing "We have logged your request". The backend handler
   (`backend/index.js:2360-2387`) exists, is rate-limited and persists; it is simply never reached
   (**DISC-050**). This is the only false-success site in the package with *no failed request to swallow*.
2. **The public jobs page requests `/api/jobs`, which does not exist** — the listing is `/api/jobs-data` —
   and even there `q`, `location` and `type` are dropped by both repositories (`getJobs` reads only
   `publicOnly`, `status`, `employerId`, `limit`). Runtime confirmed: `/api/jobs` → `404 NOT_FOUND`,
   `/api/jobs-data` → `200` (**DISC-051**).
3. **`/admin/queues/dead-letter-queue/purge` has no backend**, and the operation that looked like its
   match is retired on purpose. A word match is not an operation match; M7's `WRONG_URL` reading (inherited
   from V7) was too generous.

Two smaller ones are recorded with the same rigour: the create-ticket modal lost its focus trap, Escape
handling, scroll lock and focus return while the Radix `Dialog` primitive sits unused in the same tree
(**DISC-052**), and the shared unread-message poller and global unread badge are gone, replaced by per-page
polling that **stops entirely** after one failed request instead of backing off (**DISC-053**).

### 14.5 Scope proof — 0 application changes

```
$ git diff --name-only a2ecb96 -- . ':(exclude)developer-review'      # → empty
$ git status --porcelain | grep -v '^.. developer-review/'           # → empty
$ git diff --stat 2def3e5 a2ecb96 -- . ':(exclude)developer-review'  # → empty
```

No application source, dependency manifest, lockfile, schema, migration, deployment or CI file was
written at any point in M8. Two `node_modules` trees were installed (346 + 280 packages,
both gitignored) to *execute* tests, with `--ignore-scripts`; nothing from them is committed.

### 14.6 Verdict

**`PARTIAL — BLOCKED`** — a different label from §13's `PARTIAL — INCOMPLETE`, and deliberately so. The
audit work the mandate asked for was completed (nothing is *incomplete* about the audit); what remains is
**environmentally blocked**: no MariaDB, no browser binary, no provider credentials, no reachable package
CDN. Gate F additionally **fails on the product** (12 false-success sites across 11 distinct request paths), which this
mandate is not authorised to repair. Production readiness: **NOT ESTABLISHED**, unchanged.

The gate-by-gate scoring, the runtime evidence and the verifier-quality caveats are in
`M8-INDEPENDENT-ACCEPTANCE-REPORT.md`; the commands, versions and raw exit codes are in
`Evidence/logs/m8-toolchain.log`.
