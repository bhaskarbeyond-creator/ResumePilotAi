# V4 Final Acceptance Report

> **V5 supersession:** this report's verdict is retained for the record. The current verdict, with the
> corrected reachability register and parity mix, is in `FINAL-AUDIT-HANDOVER.md` §1 — still
> `PARTIAL — INCOMPLETE`, but derived from corrected counts (DISC-024/025/026).


**Revision:** `0adad00d0975444f13b98f9cda3ec7e24c2c6a62`
**Mandate:** final audit coverage reconciliation — independent validation of the whole package at the
reference checkpoint, every metric recalculated, 100 % traceable coverage.
**Date:** 2026-10-29

---

## 1. Verdict

# `PARTIAL — INCOMPLETE`

Not `COMPLETE`: three acceptance requirements cannot be satisfied in this environment (live database,
browser, live providers), and one requirement — 100 % *traceable* coverage — **is** satisfied. The
distinction matters, so it is stated explicitly:

| Mandate requirement | Result |
|---|---|
| (a) every legacy capability gets a decision in the 9-value vocabulary, with subfeature decomposition | **SATISFIED** — 112 rows, 100 % of 650 legacy files attributed; subfeature probes (`OAUTH-PROBE.md`) applied to the four mandated allegations |
| (b) seven reachability classes; no orphan claim before checking wrappers/dispatch/webhooks/jobs/M2M | **SATISFIED** — 384/384 dispositioned; the check prevented 27 webhooks and 9 machine routes from being mislabelled orphans |
| (c) separate counting units; never mixed in one denominator | **SATISFIED** — `METRIC-DEFINITIONS.md`; DB operations explicitly excluded from the route denominator |
| (d) revalidate EG-007…EG-011 and accessibility; never carry forward | **SATISFIED** — all re-tested; one widened (EG-011), one reinterpreted (EG-009 direction), five a11y defects re-read in code |
| (e) audit the 61 checks for what they prove | **SATISFIED** — `AUDIT-CHECK-PROVENANCE.md`: 58 of 61 are self-referential |
| (f) per-metric numerator/denominator/exclusions/formula/source; no averaged score | **SATISFIED** — 10 metric definitions, zero composite scores |
| (g) nine dedicated reconciliation artifacts | **SATISFIED** — see §5 |
| (h) verdict from the four allowed values; `COMPLETE` only on reproducible evidence | **SATISFIED** — this document |
| Runtime confirmation of backend behaviour against a real store | **NOT SATISFIED — BLOCKED (EG-007)** |
| Runtime confirmation of UI/E2E/a11y | **NOT SATISFIED — BLOCKED (EG-011)** |
| Runtime confirmation of provider integrations | **NOT SATISFIED — BLOCKED (EG-010)** |

`FAILED` is not applicable: the package was not rejected, and every claim it now makes has a
reproducible basis. `COMPLETE` is not available: three of the four verification planes (DB, browser,
providers) never executed.

## 2. What the product state actually is (the point of the audit)

| Dimension | Measured state | Confidence |
|---|---|---|
| Legacy capability surface | 650 files / 193,310 lines / 153 endpoints | high (executed inventory) |
| Modern capability surface | 206 files / 68,812 lines / 100 routes / 161 endpoints | high (executed inventory + `tsc`) |
| Capabilities lost outright | **30 of 112 rows `MISSING`** — voice interview, Puck editor + 71 blocks, command palette, HUD, i18n, analytics, SEO/JSON-LD, service worker, consent, maps, photo crop, QR, onboarding wizard, bulk member ops, tenant/coupon/refund/invoice admin, audit-log browser | high (anchored per row) |
| Capabilities fabricated | **9 rows `MOCK / FABRICATED STATE`**, all in the admin console, including a security panel that reports invented events and revokes nothing | high (code cites) |
| Backend operations with a UI | **126/384 (32.8 %)**; 201 have no caller of any kind | high (rule-level register) |
| Operations the legacy UI used and the modern one dropped | **68 of 82 (82.9 %)** | high |
| Data-integrity defect | rejection feedback written to a column the MySQL adapter never persists; revision counter inert ⇒ optimistic concurrency is a no-op | high (closed function), DB-blocked for execution |
| Auth | backend OAuth is stronger than legacy; the modern client can reach only Google | high |
| Build health at this revision | backend parses (364/364), frontend type-checks (0 errors), 1,271 backend + 187 enterprise tests pass | executed |

## 3. Why the verdict is not `FAILED`, and not `COMPLETE`

- Not `FAILED`: the modern application is real, typed, tested and substantially implemented; 28 capability
  rows are at full parity and 36 partial. The failures are specific and enumerated.
- Not `COMPLETE`: "complete" would require the DB-backed 30 certifications, the browser suite, and the
  provider integrations to have executed. They did not, and no amount of static analysis can substitute.
  The mandate's own rule — a harness is not a passing test, a mock test is evidence only about the mock —
  forbids the upgrade.

## 4. Conditions that would move the verdict

| To | Condition |
|---|---|
| `COMPLETE` for coverage (already) | nothing further; 1,492/1,492 items dispositioned |
| `COMPLETE` overall | execute the 30 MariaDB certifications + 14 DB-dependent failures against `mariadb:11.4`; execute the 7 Playwright spec files with a browser; run one sandbox round-trip per provider; run axe and a keyboard/screen-reader pass |
| Verdict on the *product* to improve from `PARTIAL` | remediate, in this order: DISC-020 (feedback persistence) together with DISC-021 (projection), DISC-014/015 (fabricated admin state, read-only legacy portfolios), DISC-019/022 (OAuth breadth), then the 30 `MISSING` rows in descending user impact (voice interview, i18n, admin financial administration) |

## 5. The nine reconciliation artifacts

| # | Artifact | Purpose |
|---:|---|---|
| 1 | `V4-COVERAGE-RECONCILIATION.md` | master reconciliation; the 1,492-item disposition table; every delta figure |
| 2 | `FEATURE-PARITY-MATRIX.md` + `Evidence/artifacts/feature-parity.json` | 112 rows, 9-value vocabulary, 650/650 + 206/206 attribution |
| 3 | `BACKEND-OPERATION-REACHABILITY.md` + `backend-reachability.json` / `backend-operations.tsv` | seven classes, 384/384, rule + reason per row |
| 4 | `ALLEGATION-RESOLUTION-REGISTER.md` | 35 allegations; `RA-31`…`RA-34` investigated in full |
| 5 | `OAUTH-PROBE.md` | subfeature decomposition of the four mandated areas (OAuth, payments, rejection, gallery) |
| 6 | `EG-REVALIDATION-REGISTER.md` | EG-007…EG-012 + A11Y-001…005 re-tested, not carried forward |
| 7 | `RUNTIME-VERIFICATION-V4.md` | what executed, what each run proves, the 14-failure triage, the 30 skips |
| 8 | `AUDIT-CHECK-PROVENANCE.md` | what the 61 checks actually prove (58 self-referential) |
| 9 | `METRIC-DEFINITIONS.md` + `AUDIT-CHANGE-HISTORY.md` | every metric's numerator/denominator/source; every revision with previous conclusion preserved |

Supporting: `DISCREPANCY-LOG.md` (22 findings), `REQUIREMENT-REGISTER.md` §P (65 requirements re-tallied),
`Evidence/logs/v4/*` (executed evidence), `tools/*.cjs` (re-runnable generators), and
`scripts/verify-v4-reconciliation.py` — 9 substantive checks that stat **385 path anchors** and
re-derive every class sum, deliberately kept separate from the original 61-check script so that script was
neither relaxed nor rewritten.

## 6. Integrity statement

- **Application source, tests, migrations and config were not modified.** All changes are under
  `developer-review/`. No force-push, no history rewrite.
- **Every cited path resolves.** 385 register anchors were stat-checked; 4 failed the new check and were
  corrected (`AUDIT-CHECK-PROVENANCE.md` §5).
- **No number in this report was carried forward unexamined.** Every figure was re-derived at `0adad00`;
  where a prior figure failed to reproduce it is withdrawn with the reason recorded
  (`AUDIT-CHANGE-HISTORY.md` §2) — six such withdrawals/replacements, including one claim withdrawn before
  publication.
- **No blocked verification was reported as a pass.** 14 failures, 30 skips, 0 executed browser tests, and
  no live provider calls are all stated in the verdict, not buried.
- **No composite score is published.** The mandate forbids it; the data would not survive it.
- **Expected application fixes performed during this audit: 0.**
