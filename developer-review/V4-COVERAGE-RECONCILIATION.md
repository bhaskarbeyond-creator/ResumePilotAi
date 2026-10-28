# V4 — Final Coverage Reconciliation

**Mandate:** validate the whole audit package independently at the reference checkpoint, recalculate every
metric, and give every file, requirement, capability, backend operation, finding, allegation and
limitation a reproducible disposition.
**Revision:** `0adad00d0975444f13b98f9cda3ec7e24c2c6a62` (`origin/main` tree-identical to `origin/dev`
`ea7b7416`; merge-base `0adad00`; ahead/behind `0/1456` with identical trees ⇒ no divergence).
**Explicit non-claim:** this document does **not** assert feature parity, production readiness, or
security compliance. It asserts *traceability*.

---

## 1. The one number this package will stand behind

| Unit | Enumerated | Dispositioned | Evidence store |
|---|---:|---:|---|
| Legacy source files | 651 | **651 (100 %)** | `legacy-file-inventory.tsv`, `feature-parity.json` |
| Modern source files | 206 | **206 (100 %)** | `feature-parity.json` |
| Capability rows | 112 | **112 (100 %)** | `FEATURE-PARITY-MATRIX.md`, `feature-parity.json` |
| Backend operations (unique METHOD+path) | 384 | **384 (100 %)** | `backend-reachability.json`, `backend-operations.tsv` |
| Allegations | 35 | **35 (100 %)** | `ALLEGATION-RESOLUTION-REGISTER.md` |
| Findings | 22 | **22 (100 %)** | `DISCREPANCY-LOG.md` |
| Requirements | 65 | **65 (100 %)** | `REQUIREMENT-REGISTER.md` §P |
| Environment gaps + a11y defects | 12 + 5 | **17 (100 %)** | `EG-REVALIDATION-REGISTER.md` |
| **Total items** | **1,492** | **1,492** | — |

Arithmetic: 651 + 206 + 112 + 384 + 35 + 22 + 65 + 17 = **1,492**. (An earlier draft of this table said
"2,092"; the sum did not support it, and it was corrected before publication rather than left as a round
number.)

"Dispositioned" means: classified, with a cited anchor and, where unresolved, an explicit class and a
closure condition. It does **not** mean "resolved". 201 of 384 backend operations are dispositioned as
`UNREACHABLE`; 30 capability rows are dispositioned as `MISSING`; those are dispositions, not fixes.

## 2. Delta: every figure the package previously published

| Metric | Previously published | V4 revalidated | Direction | Cause |
|---|---|---|---|---|
| Legacy files / `.jsx` / lines | 651 / 519 / 193,320 | **651 / 519 / 193,320** | confirmed | re-ran `legacy-modern-inventory.cjs` |
| Modern files / `.tsx` / lines | 206 / 151 / 68,812 | **206 / 151 / 68,812** | confirmed | re-ran the same tool |
| Legacy attribution | 651/651 | **651/651** | confirmed | — |
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

Two corrections moved the *bad* numbers upward (250 and 183 vs 192 and 58). That is the direction an audit
should be suspicious of, so both were re-derived twice: once from the fault-injected rule ordering, once
by an independent field count on the JSON (`modernUiRefs` empty = 250; of those, `legacyUiRefs>0` = 67 ⇒
never-any = 183).

## 3. The seven reachability classes (mandate requirement b)

Denominator: **384 unique METHOD+path**. Rule precedence R1 → R7 → R2 → R3 → R5 → R4 → R6, first match
wins, deterministic.

| Class | Count | % | What a reader should conclude |
|---|---:|---:|---|
| `UI-REACHABLE` | 126 | 32.8 | a modern call site exists (call context, never a string mention) |
| `INDIRECTLY-REACHABLE` | 6 | 1.6 | only a *live* hook calls it (hook has ≥1 consumer) |
| `EXTERNAL-CALLER` | 27 | 7.0 | webhook / OAuth callback / payment verifier / M2M `/v1` / OG-image / health probe — **not** orphaned |
| `SERVER-ONLY` | 11 | 2.9 | another backend module reuses it in-process |
| `INTENTIONALLY-UNEXPOSED` | 9 | 2.3 | machine/service-account scoped; a browser caller would be a defect |
| `UNREACHABLE` | 201 | 52.3 | no caller of any kind; 57 were legacy-called (regressions), 144 never had a caller in either tree |
| `UNVERIFIED` | 4 | 1.0 | a child path is called; parent reachability undecidable statically |

**The mandate's warning was load-bearing:** before checking wrappers, dynamic dispatch, webhooks, jobs and
M2M clients, a naive classifier called 27 webhooks and 9 machine routes "orphaned". They are not.

## 4. Capability dispositions by domain (mandate requirement a)

| Domain | Rows | FULL | PARTIAL | MISSING | MOCK | REPLACED | UNVERIFIED |
|---|---:|---:|---:|---:|---:|---:|---:|
| A — platform admin | 26 | 3 | 8 | 6 | 9 | 0 | 0 |
| B — enterprise | 11 | 5 | 5 | 1 | 0 | 0 | 0 |
| C — portfolio / WebCV | 7 | 2 | 1 | 4 | 0 | 0 | 0 |
| D — candidate experience | 15 | 1 | 6 | 7 | 0 | 1 | 0 |
| E — resume / templates / export | 17 | 9 | 4 | 3 | 0 | 0 | 1 |
| F — employer | 11 | 3 | 5 | 2 | 0 | 0 | 1 |
| G — platform-shared | 25 | 5 | 7 | 7 | 0 | 5 | 1 |
| **Total** | **112** | **28** | **36** | **30** | **9** | **6** | **3** |

Domain A carries **all** nine fabricated-state rows (9 of its 26) — the concentration is itself a finding: the admin console is where state is invented.
Domain E is the only domain where `FULL PARITY` exceeds half the rows (9/17); domain B is the strongest non-A domain (5 full, 5 partial, 1 missing) — template volume, DOCX/PDF
export, ATS scoring and layout engines were ported well.

## 5. Requirement-level dispositions (mandate requirement f)

65 requirements, each with numerator/denominator/formula in `REQUIREMENT-REGISTER.md` §P: 48 `PASS`,
12 `PARTIAL`, 4 `BLOCKED`, 1 `NOT VERIFIED`, 0 `FAIL`. Five rows had their *evidence* amended because V4
measurements contradicted the citation; no row changed status. That is itself reported: the requirements
measure the audit's rigour, not the product's state.

**No averaged single score is published.** The mandate forbids it and the data would not survive it:
`FULL PARITY 25 %` and `MISSING 27 %` do not blend into "76 % complete", because a missing capability and a
present one are not commensurable units.

## 6. Findings and allegations

22 findings (DISC-001…022), 35 allegations (RA-01…RA-35): **19 confirmed**, 1 confirmed-with-correction,
4 partially confirmed, 10 refuted, 1 unresolved. Every refutation cites a call site or measurement; no
refutation rests on a filename, a route declaration alone, or a settings toggle.

Seven items remain open by design, each naming the evidence that would close it: three capability rows
(`FP-E05` server-side ATS audit, `FP-F09` employer analytics, `FP-G14` misc legacy orphans), four backend
operations awaiting a network capture, and allegation `RA-35` (same subject as `FP-F09`).

## 7. What is still blocked, stated once

| Blocker | Consequence | Re-tested |
|---|---|---|
| EG-007 no MariaDB | 30 tests skip; 14 fail; tenant isolation, migrations, persistence, CAS behaviour unexercised | yes |
| EG-008 no Apache/PHP | `.htaccess`/`api/index.php` behaviour static only; served bundle freshness unknown | yes |
| EG-010 no live providers | payments, AI routing, storage, Firebase, SMTP verified against mocks only | yes |
| EG-011 no browser | all 7 Playwright spec files (3,675 enumerated tests) unexecuted; axe cannot run | yes |
| EG-009 no fonts | no visual-regression claim in either direction | yes |

## 8. Verdict

`PARTIAL — INCOMPLETE`, not `COMPLETE` and not `FAILED`. See `V4-FINAL-ACCEPTANCE-REPORT.md` for the
criterion-by-criterion derivation and the exact conditions that would move it.
