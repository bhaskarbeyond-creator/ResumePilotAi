# DIR-008 — Forensic Audit: Resumes & Master CV Surface

**Directive:** DIR-008 (governing record: `.bridge/directives/DIR-008.json`)
**User mandate:** 100 distinct CV templates, Master CV source of truth, CRUD, secure sharing, A4 preview/export, ATS, accessibility, evidence
**Audit date:** 2026-10-19
**Auditor:** Arena Agent Mode (autonomous engineering session)
**Branch:** `arena/8a774228-resumepilotai`
**Baseline commit:** `bef5428538a0c508898d191c989b155e0f0e8512`

---

## 1. Workspace, repository and environment

| Item | Verified value |
|---|---|
| Independent workspace | `/home/user/ResumePilotAi` |
| Repository root (`git rev-parse --show-toplevel`) | `/home/user/ResumePilotAi` |
| Remote | `https://github.com/bhaskarbeyond-creator/ResumePilotAi.git` |
| Initial branch | `arena/8a774228-resumepilotai` |
| `main` / `origin/main` | `bef5428538a0c508898d191c989b155e0f0e8512` |
| Working tree at audit | clean (`git status --porcelain` = 0 lines) |
| Runtime | Node.js v22.22.3, npm 10.9.8 |
| Frontend | React 19, Vite 8.3, TypeScript 6.0, Tailwind 4, Radix UI |
| Backend | Express 5, MariaDB (authoritative), in-memory test repository (non-production only) |
| Reference environment | `D:\xampp\htdocs\IME365` — **not mounted, not modified** by this workspace |

The branch named in the user mandate (`arena/f4651d36-resumepilotai`) does not exist in this
session. Arena pins this session to `arena/8a774228-resumepilotai`; all work is committed there.
The baseline SHA resolves identically on `HEAD`, `main` and `origin/main`. The clone is shallow
(`grafted`), which is expected in this environment and does not affect the baseline comparison.

### Scope discrepancy between the governing record and the user mandate

* `.bridge/directives/DIR-008.json` describes **51** canonical templates (Cv1–Cv51), a 3.0 s
  Vite budget and a plan-then-act protocol.
* The user mandate for this session requires **100** distinct CV templates, a 100-row report and
  complete feature hardening.
* Resolution: this audit and implementation target the stricter user mandate (100 CV templates)
  while preserving the DIR-008 invariants (real data only, DOMPurify, A4 geometry, build budget,
  no mock fallback). Both requirements are tracked in the acceptance matrix.

### Environment blockers discovered before implementation

| Blocker | Exact evidence | Impact |
|---|---|---|
| Playwright browsers cannot be downloaded | `cd frontend && npx playwright install chromium` → `ECONNRESET` while fetching `cdn.playwright.dev`; no system Chromium/Firefox present | Browser-driven Playwright, visual-regression and live screenshot evidence are blocked. DOM/SSR evidence and static verification remain possible. |
| No local MariaDB in the sandbox | Backend defaults to MariaDB on `127.0.0.1:3306`; no server package installed | Integration tests use the non-production `InMemoryRepository` (`IN_MEMORY_REPOSITORY=1`). Production DB parity is reviewed statically. |
| No production Firebase credentials | Firebase Admin has no service account in this sandbox | Authenticated flows use the non-production HMAC test verifier (`TEST_AUTH_HMAC_SECRET`), never enabled when `NODE_ENV=production`. |

These blockers are recorded honestly in the final certification and are not counted as passes.

---

## 2. Baseline verification (executed, not assumed)

| Check | Command | Result |
|---|---|---|
| TypeScript | `cd frontend && npx tsc --noEmit` | **PASS**, exit 0 |
| Production build | `cd frontend && npm run build` | **PASS**, exit 0; Vite reports `✓ built in 1.57s`; wall clock 18.9 s including `tsc -b` and npm startup |
| Bundle warning | same | `index-BdrDTCes.js` 667.45 kB (201.76 kB gzip) exceeds Vite's 500 kB advisory |
| Template thumbnails | `ls frontend/public/templates` | 55 assets: `Cv1–Cv51` + `Cover1–Cover4`; **Cv52–Cv100 have no thumbnail** |
| Template catalog | `frontend/src/lib/template-catalog.ts` | 100 CV entries + 4 cover-letter entries present |
| Export routes | `frontend/src/app/router.tsx` | `/export/Cv1–Cv100/:resumeId/:language`, `/export/Cover1–4/...`, `/preview/:resumeId` all registered under `RequireExportAccess` |
| Backend resume routes | `backend/routes/resumes.js` | list/get/save/delete/publish/unpublish/publication implemented; all owner-scoped except `/public/:id` |
| Public test verifier | `backend/security/auth.js` | `rptest.` HMAC tokens only when non-production + `TEST_AUTH_HMAC_SECRET` ≥16 chars; inert in production |

---

## 3. Architecture traced end-to-end

### 3.1 Resumes dashboard

`/dashboard/resumes` → `RequireAuth` → `CubaAppShell` → `frontend/src/pages/dashboard/resumes.tsx`.

* `fetchResumes()` → `GET /api/resumes` (Axios base URL `/api`) → `backend/routes/resumes.js`
  → `req.repository.getResumes(uid)`.
* Cards render `getTemplateMeta(template)` with `thumbnail`, `calculateAtsScore(resume.data)`,
  `updatedAt`, and four actions (Edit, Share, PDF, DOCX).
* Modals: Radix dialogs for delete/rename/create; `PreviewModal`; `ShareModal`.
* Create defers persistence: the page navigates to `/build-resume?new=true...`; the builder owns
  draft creation and save.

### 3.2 Master CV

The Master CV is the revisioned `users` profile (`GET/POST /api/users-data/profile`), not a
separate table. `settings.tsx` reads `{ user: { revision, profile } }` and saves with
`{ expectedRevision, profile }`, which the backend guards against `PROFILE_CONFLICT`.

New-resume initialization is implemented in `resume-builder.tsx`:
`?new=true&sync=true` → `handleSyncProfile()` → `GET /users-data/profile` → fills only empty
heading fields and the summary. **This is the correct non-clobbering direction, but it is
broken**: the API returns `{ user: { profile: {...} } }` while the builder reads
`u.displayName`, `u.firstname`, `u.email`, etc. directly off `data.user`. The profile object is
never consulted, so a new "from Master CV" resume is empty.

### 3.3 Template pipeline

Catalog (`template-catalog.ts`) → dashboard/builder card → persisted `resume.template` →
`PreviewModal`/builder preview → `SmartResumeDocument` → `smart-partitioner` (greedy packing) →
same component inside `/export/CvX/:id/:language` → PDF print / backend DOCX.

The renderer currently branches on only five archetypes (`modern-split`, `executive-banner`,
`minimal-ats`, `tech-grid`, `compact-euro`). All 100 IDs map onto those five bodies plus shared
token differences (color, font, divider, skill variant, timeline, density). Many templates with
different IDs render the same page composition. This is the central distinctness gap.

### 3.4 Public sharing

* `ShareModal` toggles a local `isPublic` boolean and never calls the publish API.
* The share URL is `/export/<template>/<rawResumeId>/en`, which is guarded by
  `RequireExportAccess` (authentication or any non-empty `renderToken`). Anonymous recipients are
  redirected to `/login`, so the "public link" does not work publicly.
* `/shared/:resumeId` exists, but it calls `get('/api/resumes/public/:resumeId')` through a client
  whose base URL is already `/api`, producing `/api/api/resumes/public/...`. It also expects the
  resume at the response root, while the API returns `{ success, resume }`.
* The public API resolves **raw resume IDs** (`GET /api/resumes/public/:id`), not unguessable
  tokens. Publication rows are explicit (`publicationMode === 'explicit'`), which is good, but an
  ID is not an authorization secret.
* `RequireExportAccess` accepts any non-empty `renderToken`, so the client guard is not an
  authorization boundary; the backend must remain the authority.

### 3.5 Data model for list rendering

`MySQLRepository.getResumes()` returns full rows (`SELECT *`). The non-production
`InMemoryRepository.getResumes()` returns only `{ id, title, template, updatedAt, revision }`.
The dashboard computes ATS readiness from `resume.data`, so under the in-memory harness every
resume is "unscored", and role/target data is missing. This is a test/reference parity defect and
also makes the dashboard's own metrics untestable.

### 3.6 ATS scoring

`frontend/src/lib/atsScore.js` is a deterministic, weighted quality score
(contact 10, summary 10, experience 28, education 8, skills 14, evidence 14, integrity 16)
with a separate JD-match dimension. The dashboard applies the engine to `resume.data` and
rounds `qualityScore`.

The dashboard’s own thresholds (Ready ≥70, Developing 40–69, Starting <40) contradict the
mandated thresholds (Green ≥80, Amber 60–79, Slate <60). The metric cards also show
Total / Average ATS / Last Updated / Template Styles instead of
Total / Ready to Apply / Developing / Unique Templates.

### 3.7 Rich text, pagination, print

* `RichTextContent` in `smart-resume-document.tsx` sanitizes HTML through DOMPurify when markup is
  detected. It does not enforce safe link protocols explicitly (DOMPurify defaults handle common
  XSS, but `target`/`rel` and protocol policy are not pinned).
* `smart-partitioner.ts` uses fixed estimates (860 px usable, 795 px continuation) and attaches a
  section heading only to the first item. A section that crosses a page boundary loses its
  heading on the continuation page; an item taller than the page is force-placed and the sheet
  uses `overflow: hidden`, which can silently clip content.
* Page footers are inside the fixed-height sheet, but the partitioner's footer buffer is a magic
  number and is not shared with CSS.
* `@page { size: A4; margin: 0 }` exists; there is no explicit per-page `break-after` except on
  `.page-sheet`.

### 3.8 Accessibility

Radix Dialog provides focus trapping and Escape handling for preview/share/delete/rename/create
flows. `PreviewModal`'s `DialogContent` has a `DialogTitle` but no `DialogDescription`. Icon-only
zoom buttons were inspected and need explicit accessible names. The public/shared view is a
separate static layout rather than the rendered template, so print/share fidelity differs from
preview.

---

## 4. Defect register

Severity: **P0** blocks the release mandate; **P1** breaks a required workflow; **P2** quality or
evidence gap.

| ID | Sev | Defect | Evidence | Required remediation |
|---|---|---|---|---|
| D-01 | P0 | 100 catalog IDs collapse into 5 page compositions; templates with different metadata render materially identical pages | `smart-resume-document.tsx` archetype branches; visual comparison | New layout-spec engine with ≥20 page families + per-template structural variants; distinctness test |
| D-02 | P0 | Cv52–Cv100 have no thumbnail asset | `frontend/public/templates` contains 55 files | Generate/derive verified thumbnail assets and enforce asset coverage |
| D-03 | P0 | Master CV sync reads the wrong shape and initializes nothing | `resume-builder.tsx` `handleSyncProfile` vs `usersData.js` projection | Read `user.profile`; map documented fields; test complete/partial/empty/stale |
| D-04 | P0 | Share modal never publishes; public link is auth-gated; public fetch path is double-prefixed | `share-modal.tsx`, `resume-view.tsx`, `require-export-access.tsx` | Real publish/unpublish lifecycle, signed unguessable tokens, public template render route, revocation tests |
| D-05 | P0 | Public API addresses raw resume IDs; revocation only via publication state | `routes/resumes.js`, repositories | Token-based public lookup with publication-revision binding |
| D-06 | P1 | Dashboard ATS computed from list rows that omit `data` in the non-production repository | `InMemoryRepository.getResumes` projection | Return full list rows (parity with MySQL) or enrich server-side |
| D-07 | P1 | ATS thresholds and metric cards disagree with mandate | `resumes.tsx` filters/stat cards | 80/60/slate thresholds; Total/Ready/Developing/Unique Templates |
| D-08 | P1 | Hard-coded `Alex Morgan` name fallback on production dashboard | `resumes.tsx` `candidateName` | Use authenticated identity / honest empty state |
| D-09 | P1 | Section headings lost across page breaks; overflow hidden can clip | `smart-partitioner.ts`, `smart-resume-document.tsx` | Section-aware partitioning, continuation labels, conservative capacities, tests |
| D-10 | P1 | Preview modal has no accessible description; zoom and share control semantics incomplete | `preview-modal.tsx` | `DialogDescription`, aria labels, 50–150 clamp, print/export wiring |
| D-11 | P1 | Public share view is a bespoke static page, not the selected template; response shape mismatch | `shared/resume-view.tsx` | Render `SmartResumeDocument` from the public payload |
| D-12 | P2 | Any non-empty `renderToken` bypasses the client export guard | `require-export-access.tsx` | Treat query presence as a hint only; backend authorization remains mandatory and documented |
| D-13 | P2 | `getTemplateMeta` silently falls back to Cv1 for unknown IDs | `template-catalog.ts` | Explicit resolution or documented fallback with a coverage test |
| D-14 | P2 | No automated frontend template registry/coverage test | `tests/` | Add registry, asset, distinctness, SSR render tests |
| D-15 | P2 | Build advisory: 667 kB main chunk | build log | Report measured budget; do not claim 4 s without evidence (Vite build 1.57 s) |

---

## 5. Planned remediation waves

1. **Layout architecture** — typed `TemplateLayoutSpec` for all 100 IDs, 20+ page families,
   section ordering/aside placement, explicit `data-layout-*` attributes; exhaustive registry
   test and structural distinctness report.
2. **Evidence and fixtures** — shared realistic fixture (long names, multilingual text, links,
   long bullets), A4 page assertions, thumbnail derivation/coverage, 100-row template report.
3. **Master CV and resume CRUD** — correct profile projection, honest sync/completeness state,
   full-row list parity, mutation guards, duplicate independence.
4. **Sharing and export** — signed share token, publish/unpublish UI, anonymous template render,
   secure public data projection, revocation/expiry tests.
5. **Preview, pagination, ATS, accessibility** — section-aware pagination, zoom, print CSS,
   thresholds/metrics, modal semantics, sanitizer tests.
6. **Regression and certification** — static/build/unit/integration tests, evidence bundle,
   honest release report.

## 6. Verification policy

* A template is "rendered" only when the SSR/DOM renderer emits its layout fingerprint, all
  required sections, and its own identity marker.
* A template is "distinct" only when its structural fingerprint differs from every other
  template in at least four independent composition dimensions.
* Browser screenshots are **blocked** in this sandbox (CDN download failure). No screenshot will
  be fabricated. DOM/SSR evidence and static tests are retained; the blocker is carried into the
  final certification.
* Production data is never replaced by synthetic fallback when a real resume ID resolves.
  Fixtures live only in clearly named test/demo modules.

---

## 5. M2 remediation record — per-template layout engine

Commit scope: `frontend/src/lib/template-layouts.ts`,
`frontend/src/components/resume/smart-render-primitives.tsx`,
`frontend/src/components/resume/smart-layout-families.tsx`,
`frontend/src/lib/smart-partitioner.ts`, `frontend/src/lib/template-catalog.ts`,
`scripts/dir008-generate-template-evidence.mjs`, evidence under `docs/templates/`.

### 5.1 What changed

| Defect | Resolution |
| --- | --- |
| D-01 renderer ceiling (4 archetype branches, styling-only variation) | Replaced by a typed `TemplateLayoutSpec` per catalog id and **24 page-one composers** (23 in use across Cv1–Cv100). Geometry — header block, physical rail, rail contents, reading order, title treatment, density, name scale, contact layout — is now data, not a colour token. |
| D-02 missing thumbnails for Cv52–Cv100 | 49 thumbnails generated from the same spec (`frontend/public/templates/Cv52…Cv100.JPG`). Legacy corpus `src/assets/resumesNew` untouched (still exactly 51 files). |
| D-13 silent generic fallback | `getTemplateMeta` and `getLayoutSpec` now throw for unknown ids; `tryGet*` variants exist for UI probing. The family dispatcher renders an explicit “Unsupported template layout” state instead of a different resume. |
| D-09 section dropped / heading orphaned | Partitioner is section-block aware: oversize items are chunked into continuations with a `(continued)` label, headings are never separated from their first item, and every populated section is guaranteed to be in either the rail or the main flow. |

Guarantees enforced at module load and in CI:

* 100 unique fingerprints; every catalog id resolves to an implemented family.
* Pairwise structural distance ≥ 4 independent composition dimensions.
* A rail is only assigned to families that physically render one (`RAIL_FAMILIES`);
  a section can never appear in both the rail and the main flow.
* No demo identity (`Alex Morgan`) or `[object Object]` coercion in rendered output.

### 5.2 Verification (executed)

| Suite | Command | Result |
| --- | --- | --- |
| Layout engine contract (9 tests) | `node --test tests/dir008-layout-engine.test.mjs` | 9/9 PASS |
| Template evidence integrity (6 tests) | `node --test tests/dir008-template-evidence.test.mjs` | 6/6 PASS |
| Legacy production-render suite | `node --test tests/template-production-render.test.mjs` | 8/8 PASS |
| Legacy differentiation / previews / quality gate | `node --test tests/template-differentiation.test.mjs tests/template-previews.test.mjs tests/template-quality-gate.test.mjs` | 24/24 PASS |
| TypeScript | `npx tsc --noEmit` (frontend) | exit 0 |
| Production build | `npm run build` (frontend) | exit 0 |

### 5.3 Evidence

* `docs/templates/DIR-008-template-inventory.md` — 100 rows, family, rail, reading order.
* `docs/templates/dir008-template-inventory.json` — machine-readable + DOM-derived structure
  (rendered page count, rail family, rendered headings, HTML hash) per template.
* `docs/templates/evidence/Cv1.html … Cv100.html` — server-rendered markup of the production
  `SmartResumeDocument` for a realistic fixture.
* `docs/templates/wireframes/Cv1.svg … Cv100.svg` — structural page-one proofs (labelled as
  spec-derived, **not** screenshots).
* `docs/templates/dir008-contact-sheet.jpg` — 10×10 overview of all 100 thumbnails.

**Screenshot status remains BLOCKED**: no browser binary is installable in this sandbox
(Playwright CDN unreachable, `libnss3`/`libnspr4` unavailable, apt non-root). No screenshot is
claimed anywhere; wireframes are explicitly labelled structural proofs.
