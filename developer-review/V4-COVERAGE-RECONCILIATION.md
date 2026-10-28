# V4 — Final Coverage Reconciliation

**Mandate:** validate the whole audit package independently at the reference checkpoint, recalculate every
metric, and give every file, requirement, capability, backend operation, finding, allegation and
limitation a reproducible disposition.
**Revision:** `0adad00d0975444f13b98f9cda3ec7e24c2c6a62` (`origin/main` tree-identical to `origin/dev`
`ea7b7416`; merge-base `0adad00`; ahead/behind `0/1456` with identical trees ⇒ no divergence).
**Explicit non-claim:** this document does **not** assert feature parity, production readiness, or
security compliance. It asserts *traceability*.

> **V5 correction banner (Mandate 5, revision `cccd35a5`).** This document was written for V4. Independent
> verification found the reachability register wrong in both directions and a whole missing check
> direction (client call → served operation). Every figure below has been recomputed; superseded V4 values
> are retained in the "previously published" column rather than deleted. The headline change is that
> **16 of the 28 V4 `FULL PARITY` rows were over-claims**: 8 downgraded (2 to `MISSING`), 8 kept with
> corrected endpoints. See `DISCREPANCY-LOG.md` DISC-024 (classifier), DISC-025 (23 dead client paths),
> DISC-026 (fabricated success). A total-item count is still printed below — and still does not mean
> the audit is complete.

---

## 1. The one number this package will stand behind

| Unit | Enumerated | Dispositioned | Evidence store |
|---|---:|---:|---|
| Legacy source files | 650 | **650 (100 %)** | `legacy-file-inventory.tsv`, `feature-parity.json` |
| Modern source files | 206 | **206 (100 %)** | `feature-parity.json` |
| Capability rows | 112 | **112 (100 %)** | `FEATURE-PARITY-MATRIX.md`, `feature-parity.json` |
| Backend operations (unique METHOD+path) | 385 | **385 (100 %)** | `backend-reachability.json`, `backend-operations.tsv` |
| Allegations | 35 | **35 (100 %)** | `ALLEGATION-RESOLUTION-REGISTER.md` |
| Findings | 26 | **26 (100 %)** | `DISCREPANCY-LOG.md` |
| Requirements | 65 | **65 (100 %)** | `REQUIREMENT-REGISTER.md` §P |
| Environment gaps + a11y defects | 12 + 5 | **17 (100 %)** | `EG-REVALIDATION-REGISTER.md` |
| **Total items** | **1,496** | **1,496** | — |

Arithmetic: 650 + 206 + 112 + 385 + 35 + 26 + 65 + 17 = **1,496**.

The aggregate moved twice, both times disclosed: V4 → 1,492 after the legacy baseline lost one file and
one finding joined (DISC-023); V5 → 1,496 after three findings joined (DISC-024, DISC-025, DISC-026) and
the operation register gained one operation (`app.all('/api/admin/ai/fetch-models')`, DISC-024 item 4).
**A rising total is not evidence of better coverage** — it is evidence that the enumeration changed. That
is exactly why §2 reports every category separately and why the verdict in §12 is not derived from this
number.

"Dispositioned" means: classified, with a cited anchor and, where unresolved, an explicit class and a
closure condition. It does **not** mean "resolved". 176 of 385 backend operations are dispositioned as
`UNREACHABLE`; 32 capability rows are dispositioned as `MISSING`; those are dispositions, not fixes.

## 2. Delta: every figure the package previously published

| Metric | Previously published | V4 revalidated | Direction | Cause |
|---|---|---|---|---|
| Legacy files / `.jsx` / lines | 650 / 519 / 193,310 | **650 / 519 / 193,310** | confirmed | re-ran `legacy-modern-inventory.cjs` |
| Modern files / `.tsx` / lines | 206 / 151 / 68,812 | **206 / 151 / 68,812** | confirmed | re-ran the same tool |
| Legacy attribution | 650/650 | **650/650** | confirmed | — |
| Modern attribution | 138/206 (68 unattributed) | **206/206** | **corrected** | three capability rows were missing (`FP-A25`, `FP-A26`, `FP-D15`); the 68 files were real consumers, not noise |
| Capability rows | 109 | **112** | **corrected** | +3 rows, 1 reclassified |
| Parity mix | 25 FULL / 35 PARTIAL / 30 MISSING / 9 MOCK / 6 REPLACED / 4 UNVERIFIED | **28 / 36 / 30 / 9 / 6 / 0 STUB / 0 LOCAL / 0 RETIRE / 3 UNVERIFIED** | **corrected** | `FP-C07` full; `FP-A25`, `FP-D15` full; `FP-A26` partial |
| Backend registrations | 498 | **498** | confirmed | — |
| Unique operations | 384 | **384** | confirmed | mount resolution complete, 0 unresolved |
| "Unreachable from modern UI" | 192 | **250 with no modern call site** | **corrected upward** | 67 dead-hook mentions had been counted as reachable |
| "Completely orphaned" | 58 | **183 never referenced by either frontend** | **corrected upward** | string mentions (incl. tests and health-tab display metadata) had been counted as callers |
| Reachability classes | 2 (binary) | **7**, all 384 dispositioned | **restructured** | mandate requirement (b) |
| Tests claimed | "1,356 passing" (handover, not executed) | **1,315 measured: 1,271 pass / 14 fail / 30 skip** | **corrected** | first full-suite execution in this audit |
| Enterprise suite | 187 claimed | **187/187 measured, exit 0** | confirmed | executed |
| Frontend type-check | not run in re-audit | **exit 0, 0 errors over 206 files** | **new** | executed |
| Findings | 18 | **22** | **corrected** | DISC-019…022 |
| Allegations | 34 | **35** | **corrected** | RA-35 renumber; dispositions recomputed |
| Requirements | 65 (48 PASS / 12 PARTIAL / 4 BLOCKED / 1 NV) | **65** (same tally, 5 rows amended evidence) | confirmed | row-level re-tally |
| Environment gaps | EG-001…EG-012 | **EG-001…EG-012 re-tested; 5 still blocking** | **revalidated** | EG-011 scope widened |
| Audit checks | "61/61 pass" | **61/61 pass — 58 are self-referential** | **reinterpreted** | `AUDIT-CHECK-PROVENANCE.md` |

| Reachability classes (V5) | 126 / 6 / 27 / 11 / 9 / 201 / 4 | **152 / 7 / 27 / 11 / 2 / 176 / 10** | **corrected both directions** | DISC-024: `enterpriseRequest` invisible (+45 in), `dynamicParent` over-promotion (−12), `app.all` unparsed (+1 op) |
| Unique operations | 384 | **385** | **corrected** | `app.all` registration parsed |
| Parity mix (V5) | 28 / 36 / 30 / 9 / 6 / 3 | **19 / 43 / 32 / 9 / 6 / 3** | **corrected against parity** | 8 over-claims downgraded after endpoint+reachability audit (DISC-025) |
| Client call sites served by no operation | not measured | **30 call sites / 23 paths (13.1 %)** | **new** | `tools/client-call-existence.cjs` — the check direction V4 never ran |
| Canonical backend suite | 1,271 pass / 14 fail / 30 skip | **1,269 pass / 46 fail / 0 skip**, exit 1 | **corrected** | `npm test` runs the repo's own harness, which turns the MariaDB gate **on**; the 30 skipped DB tests now execute (DISC-018 context) |

Two corrections moved the *bad* numbers upward (250 and 183 vs 192 and 58). That is the direction an audit
should be suspicious of, so both were re-derived twice: once from the fault-injected rule ordering, once
by an independent field count on the JSON (`modernUiRefs` empty = 250; of those, `legacyUiRefs>0` = 67 ⇒
never-any = 183).

## 3. The seven reachability classes (mandate requirement b)

Denominator: **385 unique METHOD+path**. Rule precedence R1 → R7 → R7b → R2 → R3 → R5 → R4 → R6, first
match wins, deterministic.

| Class | Count | % | What a reader should conclude |
|---|---:|---:|---|
| `UI-REACHABLE` | 152 | 39.5 | a modern call site exists (call context, never a string mention) |
| `INDIRECTLY-REACHABLE` | 7 | 1.8 | only a *live* hook calls it (hook has ≥1 consumer) |
| `EXTERNAL-CALLER` | 27 | 7.0 | webhook / OAuth callback / payment verifier / M2M `/v1` / OG-image / health probe — **not** orphaned |
| `SERVER-ONLY` | 11 | 2.9 | another backend module reuses it in-process |
| `INTENTIONALLY-UNEXPOSED` | 2 | 0.5 | machine/service-account scoped; a browser caller would be a defect |
| `UNREACHABLE` | 176 | 45.7 | no working call site of any kind; 23 were legacy-called (regressions), 153 never had a caller in either tree |
| `UNVERIFIED` | 10 | 2.6 | a child path or a shape-compatible call exists; parent reachability undecidable statically |

**The mandate's warning was load-bearing in both directions.** Before checking wrappers, dynamic dispatch,
webhooks, jobs and M2M clients, a naive classifier called 27 webhooks and 9 machine routes "orphaned".
Conversely, V4's own classifier called 45 live enterprise operations orphaned (DISC-024) while promoting
14 uncalled `/admin/users/{X}/*` children through a prefix rule.

**Per-operation rationale:** `BACKEND-OPERATION-REACHABILITY.md` §9 lists all 176 `UNREACHABLE` operations
with rule, reason and a legacy-called flag, separating "regression" from "never exposed".

### 3.1 The check V4 did not run: is the client's call served? (DISC-025)

| Measure | Count |
|---|---:|
| HTTP path literals passed to a call helper in `frontend/src` (call sites) | 229 |
| Resolved exactly to a registered operation | 188 |
| Resolved to a registered dynamic pattern (`/admin/settings/{X}`) | 11 |
| **Served by no registered operation** | **30 call sites / 23 distinct paths** |
| Verb mismatches | 0 |

`UI-REACHABLE` therefore has a caveat that matters: 30 call sites are themselves broken. The clearest
cases are the entire blog surface (`/blog/posts*` against a backend that serves `/blog-data`), the entire
support/helpdesk surface (no ticket endpoint exists), the queue console's DLQ actions, the moderation
actions, `/admin/users/{X}/status`, and `/billing/validate-coupon`. `FULL PARITY` cannot be claimed for a
capability whose every call 404s, which is why §4 below no longer shows blog or support as full.

## 4. Capability dispositions by domain (mandate requirement a)

| Domain | Rows | FULL | PARTIAL | MISSING | MOCK | REPLACED | UNVERIFIED |
|---|---:|---:|---:|---:|---:|---:|---:|
| A — platform admin | 26 | 0 | 11 | 6 | 9 | 0 | 0 |
| B — enterprise | 11 | 4 | 6 | 1 | 0 | 0 | 0 |
| C — portfolio / WebCV | 7 | 2 | 1 | 4 | 0 | 0 | 0 |
| D — candidate experience | 15 | 1 | 6 | 7 | 0 | 1 | 0 |
| E — resume / templates / export | 17 | 6 | 7 | 3 | 0 | 0 | 1 |
| F — employer | 11 | 3 | 5 | 2 | 0 | 0 | 1 |
| G — platform-shared | 25 | 3 | 7 | 9 | 0 | 5 | 1 |
| **Total** | **112** | **19** | **43** | **32** | **9** | **6** | **3** |

Three things a reader should take from this table, none of them flattering:

1. **Domain A (platform admin) has no `FULL PARITY` row at all.** It carries all nine fabricated-state rows
   *and* seven of the eight rows V5 downgraded. The admin console is simultaneously the most built-out
   surface in the repository (30 modules, 79 unreachable `/admin` operations) and the least trustworthy.
2. **The 19 surviving `FULL PARITY` rows are individually defended**: every declared endpoint resolves to
   a registered operation and that operation is reachable (`tools/parity-endpoint-audit.cjs`, 19/19
   `SUPPORTED`). That is a stronger statement than V4 could make for any row — V4's 28 full rows included
   eight whose cited endpoints do not exist.
3. **`MISSING` grew from 30 to 32 not because code disappeared** but because a UI whose every call 404s
   (blog, support) is not a working capability. A route definition plus a React page is not parity.

### 4.1 Endpoint resolution applied to all 112 rows (requirement d)

The endpoint audit was run against **every** capability row, not only the `FULL PARITY` ones, so the
re-classification can state its own residue instead of implying it covered everything:

| Measure | Rows |
|---|---:|
| Capability rows audited | 112 |
| Rows where every declared endpoint resolves **and** every resolved operation is reachable | **67** |
| Rows citing ≥1 endpoint that resolves to no registered operation (or is ambiguous) | **30** |
| Rows citing ≥1 endpoint that resolves but is `UNREACHABLE`/`UNVERIFIED` | **16** |
| Rows that declare no endpoint at all (mostly `MISSING`/`MOCK`) | **38** |

> **V6 (base `a5835ff6`) re-ran this audit after nine rows were reclassified:** 67 supported / 30 with an
> unresolved endpoint / 16 with an unreachable one / 38 declaring none. The four counts **overlap by design**
> — a row can cite both an unresolved and an unreachable endpoint — so they sum to more than 112 and must
> not be added. The V5 figures were 67 / 31 / 15 / 38.

**Scope statement, so this is not read as 112 individual re-classifications:** all 19 `FULL PARITY` rows
were adjudicated individually and are what the downgrades were based on. The other 93 were *checked*
against the register — every row's endpoint list resolved — but a non-resolving endpoint in a `PARTIAL`
or `MISSING` row was **not** used to re-classify that row; several are shorthand (`/notifications` for
`/notifications-data`, `/messages` for `/messages/conversations`, `/enterprise/roles` for
`/enterprise/roles-matrix`), and re-labelling them would be a documentation exercise, not a new finding.
The 31 rows are listed in `Evidence/artifacts/parity-endpoint-audit.json` (`allRows`) for whoever wants to
tidy the citations.

## 5. Requirement-level dispositions (mandate requirement f)

65 requirements, each with numerator/denominator/formula in `REQUIREMENT-REGISTER.md` §P: 48 `PASS`,
12 `PARTIAL`, 4 `BLOCKED`, 1 `NOT VERIFIED`, 0 `FAIL`. Five rows had their *evidence* amended because V4
measurements contradicted the citation; no row changed status. That is itself reported: the requirements
measure the audit's rigour, not the product's state.

**No averaged single score is published.** The mandate forbids it and the data would not survive it:
`FULL PARITY 25 %` and `MISSING 27 %` do not blend into "76 % complete", because a missing capability and a
present one are not commensurable units.

## 6. Findings and allegations

**26 findings** (DISC-001…DISC-026), **35 allegations** (RA-01…RA-35): 19 confirmed, 1 confirmed-with-
correction, 4 partially confirmed, 10 refuted, 1 unresolved. Every refutation cites a call site or a
measurement; none rests on a filename, a route declaration alone, or a settings toggle.

V5 added three findings and they are the three most consequential in the log for a reader deciding
whether to ship: DISC-024 (this register was wrong in both directions — it is the *evidence base*, so its
errors propagate to the verdict), DISC-025 (23 client paths served by nothing; the blog, helpdesk, queue
console, moderation, operations console, user-status action and coupon validation all 404), DISC-026 (four
admin controls report success after swallowing a failed write, including *"MariaDB hot backup snapshot
completed successfully"* for a request never sent and a user who is shown as suspended but is not).

Open by design, each naming what would close it: three capability rows (`FP-E05` server-side ATS audit,
`FP-F09` employer analytics, `FP-G14` misc legacy orphans), ten backend operations awaiting a network
capture (`UNVERIFIED`), and allegation `RA-35` (same subject as `FP-F09`).

## 7. What is still blocked, stated once

| Blocker | Consequence | Re-tested |
|---|---|---|
| EG-007 no MariaDB | canonical suite: **1,315 discovered / 1,315 executed / 1,269 pass / 46 fail / 0 skip**, exit 1. All 46 failures are DB-caused (`Evidence/logs/v5/backend-canonical-suite.triage.md`); tenant isolation, migrations, persistence, CAS and idempotency were never executed against a real engine | yes |
| EG-008 no Apache/PHP | `.htaccess`/`api/index.php` behaviour static only; `dist/` is not committed, so served-bundle freshness is unverifiable | yes |
| EG-010 no live providers | payments, AI routing, storage, Firebase, SMTP verified against mocks only. No provider was contacted; no test asserts a real provider round-trip | yes |
| EG-011 no browser | all 7 Playwright spec files (3,675 enumerated tests) unexecuted — **0 executed**; axe cannot run, so the a11y findings remain static | yes |
| EG-009 no fonts | no visual-regression claim in either direction | yes |

The first blocker deserves a warning about how test numbers were previously stated. The repo's own harness
(`backend/scripts/run-tests-with-annotations.js`) sets `RUN_MARIADB_INTEGRATION=true` and
`MARIADB_TEST_ALLOW_RESET=true` **by default**. A run with the gate off reports 30 skipped tests as if they
were part of the suite; the canonical run executes them and they fail for a known reason. "30 skipped"
must never be read as "30 not applicable".

## 8. Verdict

`PARTIAL — INCOMPLETE`.

Stated on the three axes the mandate requires, separately and not blended:

| Axis | Verdict | Basis |
|---|---|---|
| **Traceability** | **ACHIEVED for the inventoried units, with a disclosed correction cycle** | 650/650 legacy files, 206/206 modern files, 112/112 capability rows, 385/385 operations, 35/35 allegations, 26/26 findings, 65/65 requirements each carry a class and an anchor. Two of those guarantees were *earned this pass* by fixing tools that were wrong (DISC-023, DISC-024) — traceability is a property of the tooling, not of the claim. |
| **Parity** | **INCOMPLETE, and weaker than V4 stated** | 19 full / 43 partial / 32 missing / 9 mock / 6 replaced / 3 unverified of 112. 8 of V4's 28 `FULL PARITY` rows were over-claims. 23 client paths are served by no operation. No capability can be called production-ready on this evidence. |
| **Runtime** | **BLOCKED** | 0 browser tests executed; 0 live provider calls; 0 MariaDB-backed tests executed; 46/1,315 backend tests fail for DB absence. A passing mock test is evidence about the mock. |

`COMPLETE` is refused because parity is not demonstrated and runtime is unverified. `FAILED` is refused
because the mandate's failure condition is a *falsified* audit — and while this pass falsified two V4
figures (the register and the parity mix), it falsified them with reproducible evidence and revised them
in public rather than defending them. `PARTIAL — BLOCKED` is refused because it would understate what was
actually established: the traceability work is done and re-runnable, and the product defects found are
specific, anchored, and count-limited.

**What would move this verdict:**

* to `PARTIAL — BLOCKED` — if the mandate were to weight unexecuted runtime verification above the parity
  defects. We do not: both are blocked, and parity is *additionally* incomplete (DISC-025/026 are product
  defects, not verification gaps).
* to `COMPLETE` — a MariaDB instance (closes 46 failures and the isolation/migration gaps), a browser
  (executes 3,675 tests and the axe scan), a live provider key for each gateway, *plus* closure of
  DISC-025 and DISC-026 and a re-derived parity mix with ≥1 independent reviewer re-running
  `reachability-crosscheck.cjs` and `client-call-existence.cjs`.
* to `FAILED` — any of the V5 counts failing to reproduce from a clean checkout at `cccd35a5`.

## 9. V6 delta (2026-10-29, base `a5835ff6`) — reconciliation of the classification changes

| Quantity | V5 | **V6** | Δ | Cause |
|---|---:|---:|---:|---|
| Capability rows | 112 | **112** | 0 | no row added or removed |
| `FULL PARITY` | 19 | **12** | −7 | subfeature examination (`FP-B05, B08, E02, F02, F06, G01, G21`) |
| `PARTIAL PARITY` | 43 | **47** | +4 | +7 demoted from FULL, −2 promoted to MOCK, −1 (A11) → MOCK |
| `MISSING` | 32 | **32** | 0 | no change |
| `MOCK / FABRICATED STATE` | 9 | **12** | +3 | `FP-F03`, `FP-A11`, `FP-A19` |
| `REPLACED BY EQUIVALENT` / `UNVERIFIED` | 6 / 3 | **6 / 3** | 0 | no change |
| Backend operations | 385 | **385** | 0 | V6 re-ran the register; 385/385 crosscheck agreement |
| Reachability classes | 152/7/27/11/2/176/10 | **unchanged** | 0 | no new parser change was needed |
| Client dead call sites | 30 sites / 23 paths | **30 sites / 19 paths (17 defective)** | sharpened | `{X}` normalisation + benign-fallback exclusion |
| Findings | 26 | **40** | +14 | DISC-027 … DISC-040 |
| Allegations | 35 | **48** | +13 | RA-36 … RA-48 |
| Coverage arithmetic total | 1,496 | **1,523** | +27 | +14 findings, +13 allegations. The arithmetic keeps the **65 original requirements**; the 10 V6 requirements (R-130 … R-139) are reported in `REQUIREMENT-REGISTER.md` §Q and are deliberately **not** folded into the same total, because they measure this audit's own conduct rather than the product's capability |

**Does the V6 correction make V5 "FAILED"?** No — and the distinction matters. V5's numbers *reproduce*
from the V5 tools; what V6 falsified is the **inference** that a row with a matching component name and a
live backend is at parity. Section 8 of this document defined `FAILED` as "any of the V5 counts failing to
reproduce"; they reproduce. The lesson is the one already written into this package twice (corrections 12
and 13): *reproducing a measurement is not the same as the measurement being right.* V6 therefore lowers
the parity axis again and leaves the verdict at **`PARTIAL — INCOMPLETE`** rather than claiming either a
pass or a collapse.

**What V6 does not claim:** that the seven demoted rows are worthless. Each retains a real, working subset
(team lifecycle, audit read + CSV, 100 rendering ids, the pipeline and stage transitions, company profile,
navigation and a11y affordances, text interview practice). The demotion states that the *capability as
labelled* is not fully present, which is what the `FULL PARITY` class means.
