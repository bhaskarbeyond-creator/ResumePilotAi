# DIR-008 — Requirements to Evidence Matrix

Status: **M8** — three deep dives restored and the legacy parity ledger published (implementation continues at M9)
Evidence root: `docs/audits/`, `docs/templates/`, `docs/test-reports/`
Valid outcomes: `PASS`, `PARTIAL`, `BLOCKED`, `FAIL`, `NOT STARTED`

| Req ID | Requirement | Primary implementation | Verification | Status (M8) | Evidence |
|---|---|---|---|---|---|
| R-01 | Independent workspace and verified baseline | — | git inspection + build/typecheck | PASS | audit §1–2 |
| R-02 | 100 CV template catalog entries, unique IDs | `frontend/src/lib/template-catalog.ts` | registry test | PASS (inventory) | audit §3.3 |
| R-03 | Every template has a valid renderer mapping | `template-layouts.ts` + `smart-layout-families.tsx` | SSR render test ×100 | PASS | `tests/dir008-layout-engine.test.mjs` test 2/5 |
| R-04 | Every template is structurally distinct | `template-layouts.ts` (23 families, distance ≥4) | pairwise distance + thumbnail greyscale test | PASS | `dir008-layout-engine` test 3, `dir008-template-evidence` test 5 |
| R-05 | Every template has a thumbnail asset | `frontend/public/templates` (55 legacy + 49 generated) | asset coverage test | PASS | `dir008-template-evidence` test 2 |
| R-06 | Deep dive Cv34 fidelity (white header, 5px triple gradient, circular avatar, teal border, % skill bars) | `Cv34Family` + catalog palette | SSR/DOM assertions | PASS (white header, exact 3-stop #6c5ce7→#0f766e→#fd79a8 rule, 3px #0f766e ring, honest % meters) | `dir008-template-deep-dives` tests 1–3 |
| R-07 | Deep dive Cv1 executive bordered profile card | `Cv1Family` + catalog palette | SSR/DOM assertions | PASS (5 % tinted banner, 2.5px #1e40af ring, initials fallback, labelled information rail, skill pills) | `dir008-template-deep-dives` tests 4–5 |
| R-08 | Deep dive Cv4 Harvard centered academic layout | `Cv4Family` | SSR/DOM assertions | PASS (centred serif identity + inline contact) | `evidence/Cv4.html` |
| R-09 | Deep dive Cv25 documented legacy structure | `Cv25Family` + catalog palette | structural assertions | PASS (#274472 navy header, 4px #3d6485 ring, #f5f7fa rail, 5-box scales, CEFR dots) | `dir008-template-deep-dives` test 6 |
| R-10 | Realistic fixtures incl. long names, multilingual, links, long bullets | `tests/dir008-field-robustness.test.mjs` | fixture render ×100 | PASS (SSR; browser evidence BLOCKED) | `dir008-field-robustness` test 1 |
| R-11 | Missing optional fields do not break layout | renderers | optional-field matrix | PASS | `dir008-field-robustness` tests 3–4 |
| R-12 | Multi-page A4 documents render without clipping | `smart-partitioner.ts` | page-count/height tests | PASS (empty-page and overflow assertions) | `dir008-layout-engine` tests 7–8 |
| R-13 | Master CV is visible and distinguished from resumes | `resumes.tsx` banner | unit/static test | PASS (completeness badge, revision, last-updated; browser evidence BLOCKED) | audit §7 |
| R-14 | New resume initializes from Master CV | `master-profile.ts` + builder | unit test | PASS (revisioned projection; all sections mapped) | `dir008-master-profile` 16/16 |
| R-15 | Sync never overwrites edited resume content | `master-profile.ts` | unit test | PASS (fill-blank default, explicit replace) | `dir008-master-profile` tests 3–4 |
| R-16 | Honest sync status/timestamp and completeness | `master-profile.ts`, dashboard, settings | unit/static test | PASS (toast names copied/preserved + revision; 409 keeps edits) | audit §7 |
| R-17 | Resume create/edit/rename/duplicate/delete persisted | API + dashboard | backend lifecycle + UI contract | PASS | `dir008-resume-crud` 5/5, `dir008-resume-crud-ui` 5/5 |
| R-18 | Delete requires destructive confirmation; owner isolation | dashboard/API | API + static tests | PASS (cross-owner 404; confirm dialog) | `dir008-resume-crud` test 4 |
| R-19 | Duplicate has independent identity/content | dashboard/API | integration test | PASS | `dir008-resume-crud` test 2 |
| R-20 | Public sharing uses explicit publish + unguessable token | `share-modal.tsx`, `shareTokens.js` | backend + contract tests | PASS | `dir008-public-share` 7/7, `dir008-sharing-contract` 13/13 |
| R-21 | Anonymous share renders the selected template | `shared/resume-view.tsx` → `SmartResumeDocument` | contract test + static checks | PASS (browser evidence BLOCKED) | `dir008-sharing-contract` |
| R-22 | Revoked/unpublished shares stop working | backend publish/unpublish | backend test | PASS | `dir008-public-share` test 4 |
| R-23 | Public response excludes owner/internal/private fields | `projectPublicResume` allowlist | backend + unit tests | PASS | `dir008-public-share` tests 3–4 |
| R-24 | Preview renders discrete centered A4 sheets | preview/renderer | DOM/CSS test | PASS (structure) | audit §3.7 |
| R-25 | Zoom 50–150 preserves proportions and does not mutate content | `preview-modal.tsx` | static test | PASS (clamped, labelled, live readout; browser evidence BLOCKED) | `dir008-preview-modal-a11y` |
| R-26 | Preview loading/error/empty states | preview/export/shared viewer | contract tests | PASS | `dir008-sharing-contract` |
| R-27 | Partitioner handles heading orphans and long sections | `smart-partitioner.ts` (orphan guard + chunked continuations) | unit tests | PASS | `dir008-layout-engine` test 7 |
| R-28 | Print CSS A4, no chrome, no blank pages | `index.css` / export page | static test | PASS (A4, chrome hidden, break rules) | `dir008-print-and-docx` tests 1–3 |
| R-29 | PDF export implemented/tested | backend export + render-token redemption | node tests; browser BLOCKED | PARTIAL (token path now wired; headless render untestable here) | audit §6 |
| R-30 | DOCX export implemented/tested | `backend/services/docxExport.js` | OOXML package test | PASS | `dir008-print-and-docx` test 4, `docx-export` 19/19 |
| R-31 | Rich text sanitized everywhere | `rich-text.ts` + `RichTextContent` | XSS vectors | PASS (allowlist + protocol pin + rel) | `dir008-rich-text-and-dates` tests 1–3 |
| R-32 | Dates right-aligned without overflow | `formatDateRange` + renderers | SSR/static test | PASS | `dir008-rich-text-and-dates` test 5–6 |
| R-33 | Modals: Escape, focus trap/return, names, titles/descriptions | Radix + `preview-modal.tsx` | static test | PASS (description wired; Escape/focus from Radix; browser evidence BLOCKED) | `dir008-preview-modal-a11y` |
| R-34 | WCAG 2.1 AA relevant checks | UI | axe/static (browser blocked) | BLOCKED (automated browser), static partial | audit §2 |
| R-35 | ATS scores use real content and documented weights | `atsScore.js` | unit tests | PASS | audit §3.6 |
| R-36 | Dashboard metrics: Total/Ready/Developing/Unique Templates with 80/60 thresholds | `resume-metrics.ts` + `resumes.tsx` | unit test | PASS | `dir008-dashboard-metrics` 8/8 |
| R-37 | No hard-coded demo identity in production surfaces | dashboard/login/shared/export | static test | PASS (dashboard + login cleared; portfolio builder demo remains out of scope) | `dir008-dashboard-metrics` tests 7–8 |
| R-38 | No silent generic template fallback | `getTemplateMeta`/`getLayoutSpec` throw; dispatcher has explicit unsupported state | coverage test | PASS | `dir008-layout-engine` tests 1/4 |
| R-39 | Build/typecheck pass; performance measured honestly | build | `tsc --noEmit`, `npm run build` | PASS (tsc 0; Vite 1.57 s; wall 18.9 s) | audit §2 |
| R-40 | Unit/integration/static tests and 100-row report | tests/docs | test runner | NOT STARTED | pending |
| R-41 | Browser/visual screenshot evidence | Playwright | `playwright install` | BLOCKED (CDN ECONNRESET) | audit §2 |
| R-42 | Incremental commits/pushes through M1–M9 | git | `git log`, remote verify | NOT STARTED | pending |
| R-43 | Rich text renders as styled elements, never literal markup | `RichTextContent` | fixture render test | PASS (Lexical markup → elements; escaped text) | `dir008-field-robustness` test 1 |
| R-44 | Contact/date/skill content not clipped | renderer CSS | SSR/static checks | PASS (wrap policy + nowrap dates) | `dir008-field-robustness` test 2 |
| R-45 | Public/private authorization boundaries | guards/backend/employer | API tests | PASS (+ employer reads stay authorized, never public links) | `dir008-public-share`, `dir008-employer-resume-access` |
| R-46 | Preview/print/export consistency for a template | one `SmartResumeDocument` engine | traceability test | PASS | `dir008-print-and-docx` test 2 |
| R-47 | Cover letters counted separately | catalog | registry test | PASS (4 separate) | audit §3.3 |
| R-48 | No secrets/PII in committed evidence | evidence bundle | secret scan | NOT STARTED | pending |
| R-49 | Error states honest; no fabricated success | share dialog/export/viewer | unit + contract tests | PASS (share/export surfaces) | `dir008-sharing-contract` |
| R-50 | Documentation and release certification | docs/release | review | NOT STARTED | pending |
| R-51 | DIR-008 legacy 51-template parity + 3 s budget | layout engine + parity ledger | build/render tests | PARTIAL (3/51 restored and structure-verified: Cv1/Cv25/Cv34; 41/51 catalog palettes traceable to no legacy colour; 48/51 family-composed, not claimed as parity; build 1.70 s < 3 s) | `docs/templates/legacy-parity.md`, audit §11 |

## Template evidence rows

The 100-row template report is generated by `scripts/dir008-generate-template-evidence.mjs` at:

* `docs/templates/DIR-008-template-inventory.md` (human-readable, one row per template)
* `docs/templates/dir008-template-inventory.json` (machine-readable, incl. DOM-derived structure)
* `docs/templates/wireframes/CvNN.svg` (structural page-one proof per template)
* `docs/templates/evidence/CvNN.html` (server-rendered production markup per template)
* `docs/templates/dir008-contact-sheet.jpg` (10×10 sheet covering all 100 templates)

Each row records: id, name, layout family, header, aside/rail width, rail sections, reading
order, title style, density, thumbnail path + origin, fingerprint, rendered page count,
rendered section headings, evidence hash, and screenshot status (`BLOCKED`, never fabricated).

## Release gate summary (M4)

* Closed at M2: D-01 (no per-template geometry), D-02 (missing Cv52–Cv100 assets), D-13 (silent
  generic fallback), D-09 (orphaned headings / dropped sections).
* Closed at M3: D-04 (share publish/unpublish), D-05 (tokenized public render + projection),
  D-11 (`/api/api` + response shape), D-12 (render-token validation), export demo data (D-08 export
  half).
* Still open: D-03 (Master CV projection), D-06 (repository projection), D-07 (ATS thresholds),
  D-08 dashboard fallback, D-10 (a11y), D-14/D-15.
* Browser evidence blocked by environment: see audit §2 (recorded as BLOCKED, not passed).
* Certification before remediation: **NOT CERTIFIED** (expected through M8; final status at M9)

## M8 gate summary

* Closed at M8: R-06, R-07, R-09 (three deep dives rebuilt from their legacy stylesheets and locked by
  `tests/dir008-template-deep-dives.test.mjs`, 7/7).
* New evidence: `docs/templates/legacy-parity.{json,md}` — per-template verdicts for Cv1…Cv51, generated by
  `scripts/dir008-legacy-parity.mjs` and integrity-tested by `tests/dir008-legacy-parity.test.mjs` (5/5).
* R-51 stays PARTIAL and quantified: 3 RESTORED, 7 CATALOG_ONLY, 41 PALETTE_DIVERGENT, 0 PALETTE_LINKED.
  The 48 non-restored templates render through distinct typed families but are **not** claimed as legacy parity.
* Still blocked: R-29 server PDF (headless Chromium unavailable), R-34/R-41 browser evidence.

## M7 gate summary

* Closed at M7: R-28 print geometry, R-30 DOCX, R-46 single-renderer parity.
* Still blocked: R-29 server PDF (headless Chromium unavailable), R-34/R-41 browser evidence.
* Open: R-06/R-07/R-09 deep-dive parity, R-48/R-50 certification artifacts.

## M6 gate summary

* Closed at M6: R-10/R-11 fixtures and optional fields, R-31/R-43 rich-text safety, R-32/R-44 date alignment and clipping.
* Open: R-06/R-07/R-09 deep-dive parity, R-28/R-29/R-30 print/PDF/DOCX depth, R-34/R-41 browser
  evidence (BLOCKED), R-46/R-48/R-50 certification artifacts.

## M5 gate summary

* Closed at M5: R-17…R-19 CRUD depth and payload hygiene, employer resume access, shell share/preview entry points.
* Open: R-06/R-07/R-09 deep-dive parity, R-10/R-11 fixtures, R-28…R-32 print/rich-text/dates, R-34/R-41
  browser evidence (BLOCKED), R-46/R-48/R-50 certification artifacts.

## M4 gate summary

* Closed at M4: D-03 (Master CV initialisation), D-06 (list projection / scoring input),
  D-07 (80/60 ATS buckets and metric strip), D-08 (dashboard and login demo identity),
  D-10 (preview modal a11y and export semantics).
* Open: R-06/R-07/R-09 template deep-dive parity, R-10/R-11 fixture and empty-field matrix,
  R-17…R-19 dashboard CRUD integration depth, R-28/R-30 export print/DOCX depth,
  R-31/R-43 rich-text protocol hardening, R-34/R-41 browser/visual evidence (BLOCKED),
  R-40/R-42/R-46/R-48/R-50 final certification artifacts.
