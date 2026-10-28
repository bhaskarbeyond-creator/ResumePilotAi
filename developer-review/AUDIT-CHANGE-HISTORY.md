# Audit Change History


> **V5 note (`cccd35a5`):** backend-suite figures quoted in this document are from the V4 run, which
> left the repo's MariaDB gate off. The canonical run (`cd backend && npm test`) executes those tests:
> **1,315 discovered / 1,315 executed / 1,269 pass / 46 fail / 0 skipped, exit 1**, all 46 fails DB-caused
> (`Evidence/logs/v5/backend-canonical-suite.triage.md`). Historical numbers are retained, not overwritten.

**Purpose.** V4 requires that a revised conclusion be recorded as *previous conclusion + new evidence +
revision*, never erased. This file is that ledger. Nothing here replaces the underlying documents; each
row points at the file that now carries the corrected text and at the anchor that produced the change.

**Reference checkpoint:** `0adad00d0975444f13b98f9cda3ec7e24c2c6a62` (audited revision, = `origin/main`).

---

## 1. Revision of scope and reference point

| Item | Earlier passes | V4 |
|---|---|---|
| Audited commit cited in documents | `537e298`, then `ff841d5`/`537e2985` | **`0adad00d`** — verified `git rev-parse HEAD`, `origin/main`, and tree hash equality with `origin/dev` (`ea7b7416`) |
| Verdict | `PARTIAL — BLOCKED` | `PARTIAL — INCOMPLETE` (see `V4-FINAL-ACCEPTANCE-REPORT.md`) — the *blockers* are unchanged; what changed is that the remaining work is now enumerable rather than open-ended |
| Parity denominator | 109 rows | **112** rows (`FP-A25`, `FP-A26`, `FP-D15` added; `FP-C07` reclassified) |
| Backend reachability | binary: 192 without UI / 58 neither | **seven classes**, 384/384 dispositioned |

## 2. Corrections of fact (with the evidence that forced them)

| # | Previous conclusion | New evidence | Revision | Where |
|---:|---|---|---|---|
| 1 | "`FP-C07` — no route in `main.jsx` referenced the gallery; could not establish reachability" | `src/main.jsx:575` mounts `<Route path="/portfolios" element={<PortfolioGallery/>}>`; modern `router.tsx:99` mounts the same path | `FP-C07`: `UNVERIFIED` → **`FULL PARITY`**; RA-33 refuted as a *gallery* regression; the real defect is the editor (`FP-C04`) | `FEATURE-PARITY-MATRIX.md`, `ALLEGATION-RESOLUTION-REGISTER.md` §3.3 |
| 2 | "`FP-F11` — no employer-side rejection-reason capture located (admin-side only)" | `components/employer/CandidateReviewDrawer.tsx:84` state, `:245-258` composes `[Feedback: …]` into `notes` | `FP-F11` evidence replaced; classification stays `PARTIAL PARITY` for different, evidenced reasons | matrix, register §3.2 |
| 3 | "Template catalogue = 104 entries; 9 archetypes / 24 layout families" | bracket/string-aware scan: **100** entries `Cv1…Cv100`; **5** distinct `archetype` values, **6** distinct `headerStyle` values. The 104 came from `grep -c "id: '"`, which also counted 8 filter chips | corrected to 100 / 5 / 6 | matrix `FP-E02`/`FP-E03`, register RA-11/RA-12 |
| 4 | "Command palette = 1,527 legacy lines" | `wc -l`: 787 + 109 + 239 + 141 + 95 = **1,371** | corrected; classification unchanged (`MISSING`) | register RA-09 |
| 5 | "Voice interview = 2,432 legacy lines" (figure unattributed) | four voice-path files sum to **2,432**: 1,691 + 233 + 254 + 254 | figure retained **because it now reproduces**, with the file breakdown cited | register RA-08 |
| 6 | "Deployed system runs a different frontend entirely" | every root npm script delegates `--prefix frontend`; `frontend` build runs `sync-dist.mjs` into the Apache DocumentRoot `dist/`; `dist/` is not committed (`git ls-tree` → 0) | withdrawn; replaced by "build freshness unverifiable" (EG-004) | `BACKEND-OPERATION-REACHABILITY.md` §8 |
| 7 | "Payment Webhooks Replay failure looks like a logic defect (404 expected, 500 returned)" | the handler's `catch` converts a DB error into 500 before the 404 branch (`platform.js:1974-1991`); log shows 215 × `ECONNREFUSED 3306` | re-triaged as **environment-caused**; all 14 failures now trace to the absent DB | `RUNTIME-VERIFICATION-V4.md` §3 |
| 8 | "Candidate Playwright suite = 175 tests, blocked" | `frontend/tests` has 7 spec files; `--list` = 3,675 tests / 21 files / 42 projects; **no browser binary at all** | blocker widened to *all* suites; 175 was one project's slice | `EG-REVALIDATION-REGISTER.md` EG-011 |
| 9 | (Prepared for this register, never published) "the deployed commit contains no `frontend/src`" | `git ls-tree -r HEAD` → **211** tracked `frontend/src` files | **withdrawn before publication**; recorded so the withdrawal itself is auditable | this row |
| 10 | "Modern attribution 138/206 (68 unattributed)" | the 68 are consumers of surfaces the matrix tracked only at page level; three capability rows were missing | 3 rows added → **206/206** attributed, with the rule stated (row must name the path; no filename matching) | `METRIC-DEFINITIONS.md` M3 |

### 2.1 Corrections added by Mandate 5 (V5, revision `cccd35a5`)

| # | Previous conclusion | New evidence | Revision | Where |
|---:|---|---|---|---|
| 11 | Legacy inventory = 651 files / 193,320 lines | the walker did not exclude `*.test.*`; the 651st file is `src/components/welcome/App.test.js` | 650 / 193,310; 12 documents swept | DISC-023 |
| 12 | Reachability register 126 / 6 / 27 / 11 / 9 / 201 / 4 over 384 operations | `enterpriseRequest(` invisible to the call-site regex (46 sites → 45 operations under-classified); `dynamicParent` over-promoting (14 operations); `app.all` unparsed (1 operation) | **152 / 7 / 27 / 11 / 2 / 176 / 10 over 385**; second parser agrees 385/385 | DISC-024, register §5 |
| 13 | "No modern caller" was the only question asked | the converse check found **23 client paths served by no operation** (blog, helpdesk, queues, moderation, operations, user status, coupons) | new check + finding; 8 `FULL PARITY` rows downgraded | DISC-025, M11 |
| 14 | Admin capability claims were treated as display-only fabrications (DISC-014) | four admin *write* controls swallow the failure and then report success | new finding, P1 | DISC-026, M12 |
| 15 | Backend suite = 1,271 pass / 14 fail / 30 skip | those figures came from a run with the repo's MariaDB gate off; the canonical `npm test` enables it | **1,269 / 46 / 0**, all 46 DB-caused | M7, `Evidence/logs/v5/` |

Corrections 12 and 13 are the first in this audit that were found by *fixing the instrument* rather than by
reading the product. That is the most transferable lesson in the package: a register that is never
re-derived will keep producing confident, wrong numbers.

## 3. Identifier reconciliation (`RA-31` … `RA-35`)

The 2026-10-29 pass seeded four internal hypotheses as `RA-31`…`RA-34`. The V4 mandate assigns those same
four IDs to OAuth security, employer rejection reasons, portfolio-gallery capabilities and OAuth provider
breadth. Three coincided; one did not.

| Old ID | Topic | Outcome |
|---|---|---|
| old `RA-31` | "employer dashboard analytics are server-derived" | **renumbered `RA-35`** — disposition unchanged (`UNRESOLVED`) |
| `RA-32` | employer rejection reasons | mandate definition kept; deepened with the persistence defect (`DISC-020`) |
| `RA-33` | portfolio gallery | adjudicated `REFUTED` as a gallery regression |
| `RA-34` | OAuth provider breadth | adjudicated `CONFIRMED` (4 → 1) |
| new `RA-31` | OAuth flow and security architecture | `PARTIALLY CONFIRMED` — architecture improved, coverage reduced |

No other IDs moved. `DISC-019`…`DISC-022` were allocated in ascending order at publication; an earlier
draft of `BACKEND-OPERATION-REACHABILITY.md` referenced *planned* DISC numbers 020–023 for other findings,
which would have collided. Every such reference was rewritten to the published IDs (or to `FP-` / `RA-`
IDs where no DISC entry exists). The plan is recorded here so a reader who saw the draft knows why the
document's citations changed.

## 4. What V4 did **not** change

- No application source, test, migration, config or lockfile was modified. `git status` shows changes
  only under `developer-review/`.
- No prior document was rewritten to hide an error. Where a sentence was wrong, the wrong sentence's
  substance is preserved in this ledger and the corrected text carries a dated note.
- No earlier allegation was deleted. `RA-01`…`RA-30` are untouched; `RA-31`…`RA-35` are as above.
- No `INTENTIONAL RETIREMENT` classification was introduced, because no retirement decision exists in the
  repository to support one.
- No blocker was closed by assertion. EG-007…EG-011 remain `BLOCKED` with re-test evidence.

## 5. Standing verification state after V4

| Dimension | State |
|---|---|
| Backend syntax (364 files) | VERIFIED (executed) |
| Frontend types (206 files) | VERIFIED (executed) |
| Backend suite | EXECUTED — 1,271/1,315 pass, 14 fail (DB), 30 skip (DB gate) |
| Enterprise suite | EXECUTED — 187/187 |
| Browser/E2E | BLOCKED (no binary) |
| Live DB / migrations | BLOCKED (no server) |
| Live providers | BLOCKED (no credentials) |
| Apache/PHP layer | BLOCKED (no runtime) |
| Package self-verification | 61/61 checks pass — with the limits stated in `AUDIT-CHECK-PROVENANCE.md` |
