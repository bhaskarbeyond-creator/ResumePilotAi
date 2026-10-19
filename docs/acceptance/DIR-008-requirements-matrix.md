# DIR-008 — Requirements to Evidence Matrix

Status: **M1 baseline** (implementation pending at time of this commit)
Evidence root: `docs/audits/`, `docs/templates/`, `docs/test-reports/`
Valid outcomes: `PASS`, `PARTIAL`, `BLOCKED`, `FAIL`, `NOT STARTED`

| Req ID | Requirement | Primary implementation | Verification | Status (M1) | Evidence |
|---|---|---|---|---|---|
| R-01 | Independent workspace and verified baseline | — | git inspection + build/typecheck | PASS | audit §1–2 |
| R-02 | 100 CV template catalog entries, unique IDs | `frontend/src/lib/template-catalog.ts` | registry test | PASS (inventory) | audit §3.3 |
| R-03 | Every template has a valid renderer mapping | `smart-resume-document.tsx` + layout specs | SSR render test ×100 | PARTIAL (generic fallback possible) | pending |
| R-04 | Every template is structurally distinct | layout spec engine | distinctness report | NOT STARTED | pending |
| R-05 | Every template has a thumbnail asset | `frontend/public/templates` | asset coverage test | FAIL (55/100) | audit §2 |
| R-06 | Deep dive Cv34 fidelity (white header, 5px triple gradient, circular avatar, teal border, % skill bars) | renderer | SSR/DOM assertions | NOT STARTED | pending |
| R-07 | Deep dive Cv1 executive bordered profile card | renderer | SSR/DOM assertions | NOT STARTED | pending |
| R-08 | Deep dive Cv4 Harvard centered academic layout | renderer | SSR/DOM assertions | NOT STARTED | pending |
| R-09 | Deep dive Cv25 documented legacy structure | renderer + audit | structural assertions | NOT STARTED | pending |
| R-10 | Realistic fixtures incl. long names, multilingual, links, long bullets | test fixtures | fixture validation | NOT STARTED | pending |
| R-11 | Missing optional fields do not break layout | renderer/partitioner | empty-section tests | NOT STARTED | pending |
| R-12 | Multi-page A4 documents render without clipping | partitioner/renderer | page-count/height tests | PARTIAL | audit §3.7 |
| R-13 | Master CV is visible and distinguished from resumes | `resumes.tsx` | DOM/static test | PARTIAL (banner exists, no completeness/timestamp) | audit §3.2 |
| R-14 | New resume initializes from Master CV | `resume-builder.tsx` | integration test | FAIL (wrong response shape) | audit §3.2 |
| R-15 | Sync never overwrites edited resume content | builder sync | unit test | PASS (blank-only fill) | audit §3.2 |
| R-16 | Honest sync status/timestamp and completeness | dashboard/settings | DOM test | NOT STARTED | pending |
| R-17 | Resume create/edit/rename/duplicate/delete persisted | dashboard/builder/API | integration tests | PARTIAL | audit §3.1 |
| R-18 | Delete requires destructive confirmation; owner isolation | dashboard/API | API tests | PARTIAL | audit §3.1 |
| R-19 | Duplicate has independent identity/content | dashboard/API | integration test | PARTIAL | audit §3.1 |
| R-20 | Public sharing uses explicit publish + unguessable token | share modal/backend | security tests | FAIL (local toggle only) | audit §3.4 |
| R-21 | Anonymous share renders the selected template | shared view/export | integration test | FAIL (static layout, auth gate) | audit §3.4 |
| R-22 | Revoked/unpublished shares stop working | backend | integration test | PARTIAL (backend state exists) | audit §3.4 |
| R-23 | Public response excludes owner/internal/private fields | backend projection | security test | PARTIAL | audit §3.4 |
| R-24 | Preview renders discrete centered A4 sheets | preview/renderer | DOM/CSS test | PASS (structure) | audit §3.7 |
| R-25 | Zoom 50–150 preserves proportions and does not mutate content | preview modal | static/DOM test | PARTIAL (range correct, a11y gaps) | audit §3.8 |
| R-26 | Preview loading/error/empty states | preview/export | tests | PARTIAL | audit §3.7 |
| R-27 | Partitioner handles heading orphans and long sections | partitioner | unit tests | FAIL | audit §3.7 |
| R-28 | Print CSS A4, no chrome, no blank pages | `index.css` / export page | static test | PARTIAL | audit §3.7 |
| R-29 | PDF export implemented/tested | backend export | integration/blocked browser | PARTIAL (server route; browser render blocked) | audit §2 |
| R-30 | DOCX export implemented/tested | backend docx | node test | PARTIAL | audit §2 |
| R-31 | Rich text sanitized everywhere | `RichTextContent` | XSS tests | PARTIAL (DOMPurify, no protocol pin) | audit §3.7 |
| R-32 | Dates right-aligned without overflow | renderer | DOM/static test | PARTIAL | audit §3.7 |
| R-33 | Modals: Escape, focus trap/return, names, titles/descriptions | Radix components | DOM tests/manual | PARTIAL (missing description) | audit §3.8 |
| R-34 | WCAG 2.1 AA relevant checks | UI | axe/static (browser blocked) | BLOCKED (automated browser), static partial | audit §2 |
| R-35 | ATS scores use real content and documented weights | `atsScore.js` | unit tests | PASS | audit §3.6 |
| R-36 | Dashboard metrics: Total/Ready/Developing/Unique Templates with 80/60 thresholds | `resumes.tsx` | unit/DOM tests | FAIL | audit §3.6 |
| R-37 | No hard-coded demo identity in production surfaces | dashboard/shared/export | grep/static test | FAIL (`Alex Morgan`) | audit §4 D-08 |
| R-38 | No silent generic template fallback | catalog/renderer | coverage test | PARTIAL | audit §4 D-13 |
| R-39 | Build/typecheck pass; performance measured honestly | build | `tsc --noEmit`, `npm run build` | PASS (tsc 0; Vite 1.57 s; wall 18.9 s) | audit §2 |
| R-40 | Unit/integration/static tests and 100-row report | tests/docs | test runner | NOT STARTED | pending |
| R-41 | Browser/visual screenshot evidence | Playwright | `playwright install` | BLOCKED (CDN ECONNRESET) | audit §2 |
| R-42 | Incremental commits/pushes through M1–M9 | git | `git log`, remote verify | NOT STARTED | pending |
| R-43 | Rich text renders as styled elements, never literal markup | `RichTextContent` | fixture render test | PARTIAL | audit §3.7 |
| R-44 | Contact/date/skill content not clipped | renderer CSS | DOM/static checks | PARTIAL | audit §3.7 |
| R-45 | Public/private authorization boundaries | guards/backend | API tests | PARTIAL | audit §3.4 |
| R-46 | Preview/print/export consistency for a template | renderer | traceability report | NOT STARTED | pending |
| R-47 | Cover letters counted separately | catalog | registry test | PASS (4 separate) | audit §3.3 |
| R-48 | No secrets/PII in committed evidence | evidence bundle | secret scan | NOT STARTED | pending |
| R-49 | Error states honest; no fabricated success | UI/API | tests | PARTIAL | audit §3.1 |
| R-50 | Documentation and release certification | docs/release | review | NOT STARTED | pending |
| R-51 | DIR-008 legacy 51-template parity + 3 s budget | layout engine | build/render tests | PARTIAL | audit §1 |

## Template evidence rows

The 100-row template report is generated at `docs/templates/DIR-008-template-inventory.json`
and `docs/templates/DIR-008-template-inventory.md` by `scripts/dir008-template-audit.mjs`.
Each row records: id, name, category, layout family, header, aside, section order, title style,
thumbnail path/existence, renderer fingerprint, preview/export compatibility, fixture test result,
distinctness result and known limitation.

## Release gate summary (M1)

* Mandatory P0 defects open: D-01, D-02, D-03, D-04, D-05
* Browser evidence blocked by environment: see audit §2
* Certification before remediation: **NOT CERTIFIED** (expected at M1)
