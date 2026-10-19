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

---

## 6. M3 remediation record — tokenized public sharing and honest export data

Commit scope: `backend/security/shareTokens.js`, `backend/routes/resumes.js`,
`backend/repositories/InMemoryRepository.js`, `backend/index.js`,
`frontend/src/components/ui/share-modal.tsx`, `frontend/src/pages/shared/resume-view.tsx`,
`frontend/src/pages/export/cv-renderer.tsx`, `frontend/src/components/guards/require-export-access.tsx`,
`frontend/src/lib/share-publication.ts`, `frontend/src/lib/resume-view-model.ts`.

### 6.1 What changed

| Defect | Resolution |
| --- | --- |
| D-03-adjacent: `publishResume` in the in-memory repository destructured client options as its third argument, so a body-less publish threw a 500 | Signature now matches MySQL (`(userId, resumeId, _clientData, options)`), options default to `{}`, and a body-less publish is covered by tests. |
| D-04 local-only share toggle | Share dialog now reads `/resumes/:id/publication`, publishes and unpublishes through the API, shows the link only after the server returns a token, and surfaces 409/503/404/429 honestly. |
| Guessable public links (raw resume id) | New stateless HMAC share tokens (`v1.<base64url id>.<22-char HMAC>`), issued at publish time, verified with timing-safe comparison. Production fails closed without `RESUME_SHARE_SECRET`. |
| D-05 public response leakage | Anonymous responses are projected through an allowlist; owner ids, `user_id`, publication bookkeeping and internal flags are dropped before leaving the server. |
| D-11 `/api/api/` double prefix + wrong response shape in the shared viewer | Viewer uses `resolvePublicResumeEndpoint()` (single `/api` prefix), reads `{ resume }`, and renders through the production `SmartResumeDocument` with the persisted template. |
| D-08 `Alex Morgan` demo fallback in the export page (plus a second, dead set of per-template renderers) | Both demo datasets and the dead legacy renderers were deleted. Unknown ids and failed reads render honest error states; no fabricated person can reach preview, print or PDF. |
| D-12 export guard granted access on any `renderToken` value | The guard now accepts only a 43-character base64url token shape, and the export page redeems the single-use token at `/api/export-render-data` before any content renders; a spent token is stripped from the URL. |
| Export page ignored the render token entirely (headless PDF could not authenticate) | The page now handles `renderToken` (owner export), `publicToken` (anonymous preview) and authenticated draft reads, in that order. |

### 6.2 Verification (executed)

| Suite | Command | Result |
| --- | --- | --- |
| Backend share lifecycle (7 tests) | `node --test backend/test/dir008-public-share.test.js` | 7/7 PASS |
| Frontend sharing contract (13 tests) | `node --test tests/dir008-sharing-contract.test.mjs` | 13/13 PASS |
| Resumes hub UX | `node --test tests/dir110-resumes-hub-ux.test.mjs` | 7/7 PASS |
| Export client | `node --test tests/export-client.test.mjs` | 10/10 PASS |
| TypeScript / production build | `npx tsc --noEmit`, `npm run build` | exit 0 / built |

Backend suite runs against the in-memory repository (`.env` points at MySQL 127.0.0.1:3306, which is absent); this is stated explicitly rather than implying a MariaDB run.

### 6.3 Remaining for sharing

* The share dialog is exercised through its extracted state machine and static contracts; **browser interaction evidence is BLOCKED** (no browser binary).
* Visual verification of the anonymous viewer (print pagination, watermark placement) is likewise BLOCKED; DOM structure and print CSS are asserted statically.

## 7. M4 remediation record — Master CV initialisation, ATS metrics, accessible preview

### 7.1 What changed

| Defect | Resolution |
| --- | --- |
| D-03 `handleSyncProfile` read `data.firstname` from a `{ success, user }` payload, so nothing was ever copied | New `frontend/src/lib/master-profile.ts` resolves the revisioned `user.profile` projection (flat row only as a legacy fallback) and maps contact, summary, experience, education, skills, certifications, languages, projects, achievements, references, custom sections and interests into the builder's canonical entry shapes. |
| D-03 stale/incorrect field names inside mappings | Mappings now match the builder's editor contracts exactly (`language`/`proficiency`, `sectionTitle`, `title`/`relationship`, `issueDate`/`expiryDate`/`credentialUrl`, `githubUrl`/`startDate`/`endDate`, `date`). A field-name drift is what made sections appear saved but render blank. |
| R-15 overwrite risk | Sync is fill-blank by default and reports `applied`/`preserved`; `preserveExisting: false` is the explicit replace path. An empty Master CV or an already-complete resume never produces a success toast. |
| D-06 dashboard scored list rows with no draft content under the in-memory repository | `InMemoryRepository.getResumes` now returns the full row (draft content, occupation, timestamps) with ownership metadata stripped, matching the MySQL `SELECT *` projection. The dashboard reports a resume as `Unscored` rather than zero when content is unavailable. |
| D-07 ATS thresholds and stat strip disagreed with the mandate | New `frontend/src/lib/resume-metrics.ts` with the 80/60 contract (`ready ≥80`, `developing 60–79`, `starting <60`, `unscored`), used by the stat strip, the score pills and the ATS filter. Stat strip is Total / Ready to Apply / Developing / Starting / Unique Templates. |
| D-08 hard-coded `Alex Morgan` fallback on the dashboard and demo names on the login page | Dashboard reads the authenticated display name and degrades to neutral copy; the QA demo block is compiled out of production builds and carries no fabricated person. |
| D-10 preview modal accessibility and export semantics | Added `DialogDescription` + `aria-describedby`, labelled zoom controls with a live readout and 50/150 clamps, `role="alert"` errors instead of `alert()`, disabled export/share actions for unsaved drafts, an explicit unsupported-template state, and print/PDF hand-off to the dedicated A4 export route. |
| D-06-adjacent: `normalizeError` dropped the backend's string `error` message, so 409s surfaced as axios noise | The client now reads `error` as either object or string, and Settings adopts `remoteRevision` on `PROFILE_CONFLICT` while keeping the user's unsaved edits. |

### 7.2 Verification (executed)

| Suite | Command | Result |
| --- | --- | --- |
| Master CV mapping/completeness (16 tests) | `node --test tests/dir008-master-profile.test.mjs` | 16/16 PASS |
| Dashboard metrics + list projection (8 tests) | `node --test tests/dir008-dashboard-metrics.test.mjs` | 8/8 PASS |
| Preview modal a11y/export contract (7 tests) | `node --test tests/dir008-preview-modal-a11y.test.mjs` | 7/7 PASS |
| Sharing contract | `node --test tests/dir008-sharing-contract.test.mjs` | 13/13 PASS |
| Layout engine | `node --test tests/dir008-layout-engine.test.mjs` | 9/9 PASS |
| Template evidence | `node --test tests/dir008-template-evidence.test.mjs` | 6/6 PASS |
| Backend share lifecycle | `node --test backend/test/dir008-public-share.test.js` | 7/7 PASS |
| Backend routes integration | `node --test backend/test/routes.integration.test.js` | 24 pass / 0 fail / 6 skip |
| Resumes hub UX / export client | `node --test tests/dir110-resumes-hub-ux.test.mjs`, `tests/export-client.test.mjs` | 7/7, 10/10 PASS |
| TypeScript / production build | `npx tsc --noEmit`, `npx vite build` | exit 0 / built in 1.50 s |

Browser-rendered evidence remains **BLOCKED** (no browser binary in the sandbox). The M4 claims above are
source-level and unit-level; the preview modal's DOM behaviour is asserted statically, not clicked.

## 8. M5 remediation record — persisted CRUD, employer access, export honesty

### 8.1 What changed

| Defect | Resolution |
| --- | --- |
| A save payload could carry server-owned metadata (`revision`, `isPublished`, ownership) back into the repository | `POST /api/resumes/:id` now strips server-owned keys, returns the persisted row, and both repositories enforce ownership/revision last. `frontend/src/lib/resume-payload.ts` strips the same keys client-side for rename/duplicate. |
| In-memory `saveResume` let `...data` override `revision`, so optimistic concurrency could be rewound | Revision is assigned after the payload merge; conflicts report `remoteRevision`; the route maps both `RESUME_CONFLICT` and `STALE_WRITE` to a structured 409. |
| Rename/duplicate/delete/export failures used `alert()` | Inline `role="alert"` banners in the dashboard and export page; duplicate builds a fresh document with `expectedRevision: null`; rename sends the fetched revision and explains 409s. |
| Employer review drawer opened `/shared/<resumeId>` | The drawer renders the permission-checked employer payload through `SmartResumeDocument` in an accessible dialog. No public link, no publication requirement, no bypass of the employer endpoint. |
| Builder shell offered "Public Share Link" and `/export/Cv1/<id>` with a `'demo'` fallback | Share now navigates to `/dashboard/resumes?share=<id>`, which opens the real Share dialog; the export action is disabled without a resume id and the page re-derives the persisted template. |
| Anonymous viewer labelled a browser print as "Download PDF" | Relabelled "Print / Save as PDF"; the contract test now rejects the misleading label. |

### 8.2 Verification (executed)

| Suite | Command | Result |
| --- | --- | --- |
| Resume CRUD lifecycle (5 tests) | `node --test backend/test/dir008-resume-crud.test.js` | 5/5 PASS |
| Dashboard CRUD payload/UX (5 tests) | `node --test tests/dir008-resume-crud-ui.test.mjs` | 5/5 PASS |
| Employer resume access (5 tests) | `node --test tests/dir008-employer-resume-access.test.mjs` | 5/5 PASS |
| Public sharing contract | `node --test tests/dir008-sharing-contract.test.mjs` | 13/13 PASS |
| Backend share lifecycle | `node --test backend/test/dir008-public-share.test.js` | 7/7 PASS |
| Backend routes integration | `node --test backend/test/routes.integration.test.js` | 24 pass / 0 fail / 6 skip |
| TypeScript / production build | `npx tsc --noEmit`, `npx vite build` | exit 0 / built in 1.56 s |

Note: an intermediate edit briefly made `CandidateReviewDrawer.tsx` unbuildable; the build gate caught it
(`Unexpected token`), the `return (` wrapper was restored, and the final build above is the one recorded.

## 9. M6 remediation record — rich-text safety, date alignment, field robustness

### 9.1 What changed

| Defect | Resolution |
| --- | --- |
| Rich text was sanitised with DOMPurify defaults; `class`, inline `style` and arbitrary protocols were not explicitly policed | New `frontend/src/lib/rich-text.ts`: tag/attribute allowlist, `style`/`src`/`onerror`/`onclick` forbidden, protocols limited to http(s)/mailto/tel, links forced to `target="_blank" rel="noopener noreferrer"`, and an escape-only fallback when no DOM exists. `RichTextContent` now calls it. |
| Missing date fields rendered `undefined – undefined` | New `resume-format.ts` `formatDateRange()`; experience, education, project/certification items and timeline roles use it, and a date is only rendered when a value exists. |
| Dates could be clipped by long titles | Date tokens are `shrink-0 ml-auto whitespace-nowrap`, titles are `min-w-0 break-words`, and the A4 sheet has an `overflow-wrap: anywhere` rule for unbreakable names/URLs (`whitespace-nowrap` still protects dates). |
| Optional fields were only tested with one sparse fixture | New realistic fixture (77-character multilingual name, 74-character email, long unbroken URLs, Devanagari/CJK/Arabic/emoji, 600-character bullet, 12 skills) renders across all 100 templates; every optional section is removed in turn (undefined/null/''/[]/whitespace) across representative templates; a name-only resume renders in all 100. |

### 9.2 Verification (executed)

| Suite | Command | Result |
| --- | --- | --- |
| Rich text + dates (6 tests) | `node --test tests/dir008-rich-text-and-dates.test.mjs` | 6/6 PASS |
| Field robustness (5 tests) | `node --test tests/dir008-field-robustness.test.mjs` | 5/5 PASS |
| Layout engine regression (9 tests) | `node --test tests/dir008-layout-engine.test.mjs` | 9/9 PASS |
| Legacy XSS suite | `node --test tests/xss.test.mjs` | 4/4 PASS |
| TypeScript / production build | `npx tsc --noEmit`, `npx vite build` | exit 0 / built in 1.50 s |

The sanitizer vectors cover script tags, inline handlers, iframes, SVG, inline styles, `javascript:`,
`data:` and `vbscript:` links. Browser-rendered XSS execution remains **BLOCKED** (no browser binary);
the evidence is sanitizer output and SSR markup, not a clicked exploit.

## 10. M7 remediation record — print geometry and DOCX parity

### 10.1 What changed

| Defect | Resolution |
| --- | --- |
| DOCX template validation rejected the expanded catalog (`Cv99` treated as invalid) | `resolveExportTemplate` accepts `Cv1…Cv100`; the stale assertion was corrected and now also proves `Cv100` round-trips and `Cv101` is rejected. |
| Published snapshots could lose a legacy flat identity | The public projection now also allows the flattened draft columns (`firstname`, `lastname`, contact, `employments`, `educations`). Owner ids, publication bookkeeping and internal flags remain excluded. |
| R-28/R-30/R-46 had no executable parity evidence | New suite asserts true A4 print geometry, toolbar hiding, one shared renderer across preview/shared/employer/export surfaces, a real OOXML DOCX containing the resume, no HTML leakage into Word, and no phantom headings from empty rich text. |

### 10.2 Verification (executed)

| Suite | Command | Result |
| --- | --- | --- |
| Print + DOCX parity (6 tests) | `node --test tests/dir008-print-and-docx.test.mjs` | 6/6 PASS |
| DOCX export (19 tests) | `node --test backend/test/docx-export.test.js` | 19/19 PASS |
| DOCX parity (6 tests) | `node --test backend/test/docx-parity.test.js` | 6/6 PASS |
| Cross-app download/share audit | `node --test backend/test/cross-app-download-share-audit.test.js` | 10/10 PASS |
| Public share lifecycle | `node --test backend/test/dir008-public-share.test.js` | 7/7 PASS |

Server-side PDF rendering (headless Chromium) is still **BLOCKED** in this sandbox: the browser binary cannot be
installed (network policy). The print-to-PDF route is exercised at the CSS/document level, not by producing a PDF.

## 11. M8 remediation record — legacy template parity, measured instead of assumed

### 11.1 What the investigation found

The three templates the directive names for a deep dive (Cv34, Cv1, Cv25) were **not** restorations of the
legacy artwork. They were family compositions that happened to carry the legacy id:

| Template | Legacy art (`src/cv-templates/`) | Smart renderer before M8 | Catalog palette before M8 |
| --- | --- | --- | --- |
| Cv34 | White header, 5px `#6c5ce7 → #0f766e → #fd79a8` rule, 32px purple name, 100px circular avatar with a 3px `#0f766e` border, percentage skill meters | Full-bleed `primary` banner with white text and an invented circular "Edition" badge | `#0b0f19` / `#00e5ff` — matched neither |
| Cv1 | `#1e40af` tinted banner (5 % fill, 20 % hairline), 2.5px circular photo ring, labelled information rail, skill pills | Invented 33 % dark slate rail | `#1e3a8a` / `#3b82f6` |
| Cv25 | `#274472` navy band, 4px `#3d6485` avatar frame, 2:1 split with a `#f5f7fa` rail, five-box skill scales | White header + invented slate/teal palette | `#0f172a` / `#10b981` |

A catalog-wide sweep confirmed the pattern was not limited to the deep dives: of the 51 legacy templates, only
three catalogue palettes were traceable to their own stylesheet colours.

### 11.2 What changed

| Change | Detail |
| --- | --- |
| Cv34 restored | White header, exact three-stop rule driven by a new optional `TemplateMeta.accent` token (`#fd79a8`), 3px teal avatar ring, percentage meters that omit a bar when no rating exists, invented "Edition" badge removed. |
| Cv1 restored | Legacy tinted banner (`primary` at `0d`/`33` alpha), 2.5px `#1e40af` ring with an initials fallback when no photo is published, 34 % information rail (labelled icon rows, skill pills, languages), light main column. |
| Cv25 restored | `#274472` navy header, 4px `#3d6485` avatar frame, 2:1 split with the `#f5f7fa` rail, five-box skill scales and CEFR language dots, all with accessibility labels. |
| Catalog corrected | Cv1 `#1e40af`/`#475569`, Cv25 `#274472`/`#3d6485`, Cv34 `#6c5ce7`/`#0f766e` + `accent`. The catalog now publishes the palette the legacy art actually uses. |
| Photo atom | Accepts an explicit ring style so a template can express its own legacy ring without hard-coding colours in JSX. |
| Parity ledger | `scripts/dir008-legacy-parity.mjs` writes `docs/templates/legacy-parity.json` and `.md`: one verdict per canonical template. Only the three restored ids may report `RESTORED`, and each must name its evidence test. |

### 11.3 Honest coverage statement

| Verdict | Count | Meaning |
| --- | --- | --- |
| RESTORED | 3 | Geometry rebuilt from legacy art and protected by automated structural assertions. |
| PALETTE_DIVERGENT | 41 | Catalog palette cannot be traced to the legacy stylesheet; geometry remains family-composed. |
| CATALOG_ONLY | 7 | No dedicated legacy stylesheet exists to compare against. |
| PALETTE_LINKED | 0 | — |

**48 of the 51 canonical templates are therefore not legacy parity.** They render through distinct typed
layout families and satisfy the 100-template distinctness gate, but no 1:1 restoration is claimed. R-51 remains
PARTIAL until each of those templates has its own restoration evidence.

### 11.4 Verification (executed)

| Suite | Command | Result |
| --- | --- | --- |
| Deep-dive parity (7 tests) | `node --test tests/dir008-template-deep-dives.test.mjs` | 7/7 PASS |
| Parity ledger integrity (5 tests) | `node --test tests/dir008-legacy-parity.test.mjs` | 5/5 PASS |
| Layout engine (9 tests) | `node --test tests/dir008-layout-engine.test.mjs` | 9/9 PASS |
| Template evidence (6 tests) | `node --test tests/dir008-template-evidence.test.mjs` | 6/6 PASS |
| Field robustness (5 tests) | `node --test tests/dir008-field-robustness.test.mjs` | 5/5 PASS |
| Print + DOCX parity (6 tests) | `node --test tests/dir008-print-and-docx.test.mjs` | 6/6 PASS |
| TypeScript / production build | `npx tsc --noEmit`, `npx vite build` | exit 0 / built in 1.70 s |

The template evidence package (`docs/templates/evidence/*.html`, wireframes, inventory and contact sheet) was
regenerated from the current renderer after the palette changes so the committed evidence matches the code.

Browser screenshots for these three templates remain **BLOCKED** (no browser binary); the evidence is
server-rendered production markup plus structural assertions, never a fabricated image.

## 12. M9 remediation record — release gates, evidence hygiene and certification

### 12.1 What changed

| Artifact | Purpose |
| --- | --- |
| `scripts/dir008-run-release-gates.mjs` | Executes 22 DIR-008 suites plus `tsc --noEmit` and `vite build`; writes observed counts, durations, exit codes and blocked-evidence reasons to `docs/test-reports/`. Fails the run if any gate fails. |
| `scripts/dir008-scan-evidence.mjs` | Scans the committed evidence bundle for secrets and non-reserved PII, redacting every match; exported `findHits` allows the rules to be proven against canaries. |
| `scripts/dir008-commit-ledger.mjs` | Reads the milestone commits from git and verifies each against a freshly fetched remote before writing the ledger. |
| `tests/dir008-demo-data-guard.test.mjs` | Blocks any demo persona or stock headshot from returning to `frontend/src`; also pins the portfolio builder's empty scaffold. |
| `tests/dir008-evidence-scan-efficacy.test.mjs` | Proves the scanner fires on AWS keys, GitHub tokens, JWTs, bearer tokens and password assignments, and that reserved fixtures are not flagged. |
| `docs/release/DIR-008-release-certification.md` | The release decision, its evidence index, and the four conditions that prevent full certification. |

The portfolio builder was the last production surface that shipped a demo persona; it now starts from an
empty, honest scaffold with initials fallback and explicit empty states.

### 12.2 Verification (executed)

| Gate | Command | Result |
| --- | --- | --- |
| Release gates | `node scripts/dir008-run-release-gates.mjs` | 24/24 suites, 169/169 tests, tsc exit 0, build 1.6 s |
| Evidence scan | `node scripts/dir008-scan-evidence.mjs` | 210 files, 0 blocking, 0 review |
| Scanner efficacy | `node --test tests/dir008-evidence-scan-efficacy.test.mjs` | 4/4 PASS |
| Demo-data guard | `node --test tests/dir008-demo-data-guard.test.mjs` | 3/3 PASS |
| Milestone ledger | `node scripts/dir008-commit-ledger.mjs` | see `docs/release/DIR-008-commit-ledger.md` |

### 12.3 Certification decision

**CONDITIONALLY CERTIFIED.** Automated verification is complete and green; four evidence classes remain
outside what this sandbox can produce: browser/visual screenshots (R-41), in-browser axe/WCAG (R-34),
server-side PDF bytes (R-29) and 1:1 legacy parity for the 48 templates that were not restored in M8 (R-51).
No blocked item is reported as passed, and no screenshot or PDF is simulated.
