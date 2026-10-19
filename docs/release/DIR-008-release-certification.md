# DIR-008 — Release Certification

**Directive:** DIR-008 — 51 Template Architectural Parity & Full-Fidelity Real-Data Rendering Engine
**Repository:** `github.com/bhaskarbeyond-creator/ResumePilotAi`
**Branch:** `arena/8a774228-resumepilotai`
**Certification date:** 2026-10-20
**Prepared from:** commits M1–M9 on the branch above (full SHAs in `DIR-008-commit-ledger.md`)

---

## 1. Outcome

> ## ✅ CONDITIONALLY CERTIFIED
>
> All automated gates that can execute in this environment pass, the product surfaces required by the
> directive are implemented and covered by executable evidence, and no fabricated evidence was produced.
> Full certification is withheld for four documented reasons (§5): browser-rendered visual evidence,
> axe/WCAG verification in a real browser, server-side PDF bytes, and 1:1 legacy parity for 48 of the
> 51 canonical templates.

`CONDITIONALLY CERTIFIED` is one of the three permitted outcomes (`CERTIFIED`, `CONDITIONALLY CERTIFIED`,
`NOT CERTIFIED`). It is **not** a synonym for "passed": every unmet item is listed below with the reason
and the evidence that is missing.

---

## 2. What is verified

| Area | Result | Evidence |
| --- | --- | --- |
| Release gates (24 suites, 169 tests) | **24/24 suites, 169/169 tests pass** | `docs/test-reports/DIR-008-release-gates.{json,md}` |
| TypeScript (`tsc --noEmit`) | exit 0 | same report, row `typescript` |
| Production build (`vite build`) | 1.6 s wall, budget 3.0 s | same report, row `production-build` |
| 100-template catalog + explicit specs | 100 ids, 100 unique fingerprints, 23 families, no generic fallback | `dir008-layout-engine` 9/9 |
| Per-template evidence | 100 SSR page proofs, 100 wireframes, 10×10 contact sheet, 100-row inventory | `docs/templates/` |
| Deep-dive restorations | Cv1, Cv25, Cv34 rebuilt from legacy stylesheets and locked by structural tests | `dir008-template-deep-dives` 7/7 |
| Legacy parity ledger | 51 rows, 3 RESTORED / 41 PALETTE_DIVERGENT / 7 CATALOG_ONLY, no unearned `RESTORED` | `docs/templates/legacy-parity.{md,json}` |
| Resume CRUD (create/edit/rename/duplicate/delete/preview) | persisted, revision-checked, owner-isolated | `dir008-resume-crud` 5/5, `dir008-resume-crud-ui` 5/5 |
| Master CV source of truth | revisioned projection, fill-blank sync, conflict-safe | `dir008-master-profile` 16/16 |
| ATS scoring + dashboard metrics | documented weights, 80/60 thresholds, honest unscored state | `dir008-dashboard-metrics` 8/8 |
| Tokenized public share | HMAC token, explicit publish only, allowlisted projection, revocation | `dir008-public-share` 7/7, `dir008-sharing-contract` 13/13 |
| Print geometry + DOCX | A4 print CSS, chrome hidden, real OOXML with resume text | `dir008-print-and-docx` 6/6, `docx-export` 19/19, `docx-parity` 6/6 |
| Rich text safety | allowlist sanitizer, protocol pin, no literal markup | `dir008-rich-text-and-dates` 6/6, `xss` 4/4 |
| Evidence hygiene | 211 files scanned, 0 blocking, 0 review findings; scanner efficacy proven by canaries | `docs/test-reports/DIR-008-evidence-secret-scan.{json,md}` |
| No demo personas | dashboard, login, share, export, portfolio builder cleared; guard test | `dir008-demo-data-guard` 3/3 |

---

## 3. Release identity

| Item | Value |
| --- | --- |
| Workspace | `/home/user/ResumePilotAi` |
| Reference-only source application | `D:\xampp\htdocs\IME365` (never modified) |
| Branch | `arena/8a774228-resumepilotai` |
| Milestones | M0 `bef5428` → M9 (full SHAs and remote containment in `DIR-008-commit-ledger.md`) |
| Working tree | clean at release-record commit |
| Runtime | Node 22, Linux x64, no browser binary |
| ATS algorithm | unchanged from the documented weights in `backend/services/atsScore.js`; no silent retune |

---

## 4. Reproduce

```bash
node scripts/dir008-run-release-gates.mjs      # 24 suites, 169 tests, tsc, build
node scripts/dir008-scan-evidence.mjs           # R-48 evidence scan
node scripts/dir008-legacy-parity.mjs           # regenerate the Cv1–Cv51 ledger
node scripts/dir008-generate-template-evidence.mjs --force   # 100-template evidence package
node scripts/dir008-commit-ledger.mjs           # verify milestone SHAs against the remote
```

---

## 5. Conditions for full certification

| # | Blocker | Why it cannot be closed here | What is required |
| --- | --- | --- | --- |
| 1 | **Browser-rendered visual evidence (R-41)** | `playwright install` fails with CDN `ECONNRESET`; the bundled Chromium cannot start (`libnspr4.so` missing) and package mirrors are unreachable. | Run `npm run test:enterprise:e2e` and capture `cv34_export.png` / `preview_modal.png` on a host with a working browser. |
| 2 | **axe / WCAG 2.1 AA in situ (R-34)** | Same missing browser. Static contracts (Escape, focus trap/return, labels, descriptions, contrast tokens) pass, but automated axe is not executed. | `npm run test:dir048:browser` plus an axe run against preview, export and shared views. |
| 3 | **Server-side PDF bytes (R-29)** | Puppeteer PDF needs the same Chromium. Print CSS and the print-to-PDF document path are verified; no PDF file is produced or asserted. | Produce a PDF from `/export/CvX/:id/en` on a browser-capable host and diff page count/geometry. |
| 4 | **Legacy 1:1 parity for 48 templates (R-51)** | Only Cv1, Cv25 and Cv34 were rebuilt from their legacy stylesheets in this cycle. The other 48 render through distinct typed families; 41 catalogue palettes are traceable to no legacy colour. | Restore each remaining template and add structural assertions per template (the Cv1/Cv25/Cv34 pattern in `tests/dir008-template-deep-dives.test.mjs`). |

Until these are closed, no statement of "100 legacy-parity templates" or "PDF verified" may be made.

---

## 6. Deliberate limitations and honesty notes

* **Screenshots are absent, not simulated.** `docs/templates/evidence/*.html` is server-rendered production
  markup and `wireframes/*.svg` is spec-derived geometry. Neither is labelled as a screenshot; every
  inventory row records `screenshotStatus: BLOCKED`.
* **Template count vs parity count.** 100 templates exist, render through 23 distinct families, and are
  pairwise structurally distinct. Only 3 are legacy restorations. The ledger is the authoritative statement
  of that difference.
* **Shared renderer.** Preview, export, public share and employer drawer all mount the same
  `SmartResumeDocument`, verified by traceability assertions rather than by visual comparison.
* **Public sharing is opt-in.** An unpublished resume returns 404 from both the id and token routes; tokens
  are HMAC-signed and forged/rotated tokens are indistinguishable from unpublished documents.
* **No demo identities ship.** The portfolio builder now starts empty; empty states are explicit.

---

## 7. Sign-off

Prepared by: Agent Mode implementation run on Arena.ai
Certification basis: the executed commands and their recorded output listed in §2 — no result in this
document is asserted without a corresponding artifact under `docs/`.
Outcome: **CONDITIONALLY CERTIFIED** with the four conditions in §5.
