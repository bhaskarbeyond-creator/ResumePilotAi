# Resume Builder — Enterprise Forensic Review (Phase 1: Audit, No Code Changes)

> **Baseline commit:** `1cf3d5d` — accepted CV/Cover-Letter module, treated as a protected regression firewall.
> **Scope:** the 51 Resume Builder templates (Cv1–Cv51) and their builder/export shell. The 4 cover-letter templates (Cover1–Cover4) are explicitly excluded from scoring, counting, and remediation.
> **Phase 1 rule observed:** this report was produced before any product-code modification. The only additions are the `template-lab/` forensic harness (test-only) and this document.

---

## 1. Authoritative Template Inventory (verified against the repository)

| Registry | Count | IDs |
| --- | ---: | --- |
| Resume Builder templates (in scope) | **51** | `Cv1` … `Cv51` |
| Cover-letter templates (excluded, frozen CV module) | **4** | `Cover1` … `Cover4` |
| Stray, unregistered SCSS | 1 | `src/cv-templates/cv53/Cv53.scss` (no JSX, not in registry, no route, no test) |

- **The repository count is exactly 51 + 4 = 55.** Confirmed by `src/utils/templateRegistry.js`, the dynamic `/export/Cv${1..51}` routes in `src/main.jsx`, `tests/verify-all-55-templates.mjs`, and the template-lab audit.
- **Naming reconciliation:** in this codebase the 51 Resume Builder templates are internally named `Cv1…Cv51`, and the 4 frozen templates are the *cover-letter* templates `Cover1…Cover4` (the frozen CV/Cover module — the baseline commit itself is a cover-letter hardening fix). The prompt's "4 CV templates" therefore map to `Cover1…Cover4`; they are excluded everywhere below.
- The rogue `cv53/` folder is dead weight (hygiene finding, P2).

### Registry architecture (as-is)
- `templateRegistry.js` — static `Cv1` default + `import.meta.glob` lazy chunks for Cv2–Cv51; `withNormalizedTemplateData` HOC applies `normalizeTemplateData` (immutable view-model, hidden-section filtering, RTL `dir`) at every render boundary; `getTemplateComponent` falls back to `Cv1` for unknown ids.
- `TemplateRenderer.jsx` — Suspense + error boundary + reset-on-template-change; `isKnownTemplate` guard.
- Discovery is **glob-based** (no central manifest of metadata), so adding a template needs: JSX+SCSS folder, entry in `BuildResume.getTemplateName`, `BuildResume.getTemplateDefaultColors`, `TemplateSelectionModal.getTemplates` (id/name/description/category/popularity), and a JPG preview in `src/assets/resumesNew/`.

---

## 2. Forensic Methodology (all evidence regenerable)

A test-only harness was added at `template-lab/` (no product imports changed):

1. **`audit.mjs`** — real Chromium (Playwright over headless Chromium 149) renders every template × 5 fixtures (`minimal`, `normal`, `long`, `extreme`, `unicode`) plus a 390px mobile pass: 306 renders. Records render state, console/page errors, board geometry (A4 = 210×297 mm), horizontal out-of-bounds elements, clipped-content candidates (scrollWidth/Height overflow on hidden/auto/clip containers), heading sequence, text extraction, and **content coverage probes** (does each fixture field actually appear in output text?).
2. **`visual-metrics.mjs`** — DOM-side WCAG contrast audit (sRGB relative luminance, 4.5:1 body / 3:1 large-text, hex+rgba aware), typography histograms, 30-band ink-density profile (page balance + bottom whitespace), left/right ink balance; pixel-side white ratio, 40-band row/column ink profiles, 1024-bit perceptual hash over the board crop (fixed 250-gray threshold).
3. **`builder-journey.mjs`** — real-builder end-to-end (guest mode): land → fill heading → navigate → add employment → back → switch template → preview → A→B→C→A template round trip → mobile viewport.
4. **`contact-sheets.mjs`** — 3 visual contact sheets from normal-fixture screenshots.

**Baseline verification of the accepted commit (before any change):**
| Suite | Result |
| --- | --- |
| `npm run test:templates` | 8/8 pass |
| `npm run test:product` | 137/137 pass |
| `npm run test:security` | 22 + 124 = 146/146 pass |
| `npm run build` | passes (4.4 s); chunk warnings only |
| `npm run lint` | 23 pre-existing errors (all `document`/`window` no-undef in browser test scripts) + 477 warnings |

---

## 3. Initial Scorecard (pre-change baseline)

| Area | /10 | Key evidence |
| --- | --: | --- |
| Overall architecture | 7 | Clean registry + normalized view-model + persistence service; but 51 bespoke SCSS files, two overlapping normalizers, 2,000-line builder monolith |
| Template architecture | 6 | Lazy loading, shared utils; per-template copy-paste, no layout primitives |
| Template consistency | 5 | 3 templates silently drop employer/school; 50/51 don't render projects/certifications; generic names "Professional 21–50" |
| Visual design | 7 | No pixel-duplicate templates (phash min distance 104/1024); distinctive; but contrast failures in 41/51 |
| Typography | 6 | Mostly single family; 5–9 distinct sizes per board (noise); contrast issues |
| Layout | 6 | Clean on normal fixture for 48/51; long-content overflow in Cv26/35/38; extreme blowouts in ~30 |
| Responsive design | 5 | Fixed-A4 documents by design (correct for print); mobile is a scaled preview, not reflow |
| Mobile UX | 6 | Menu + preview panels work, no overflow (verified); tiny 0.35-scale preview; bottom bar crowded |
| Desktop UX | 8 | Three-pane builder, live preview, save states, conflict UI — journey verified |
| Builder UX | 7 | Solid flow; but projects/certs/achievements/references are uneditable; Cv51 missing from `getTemplateName`; `window.prompt` for custom sections; favorites not persisted |
| Preview | 7 | Same renderer as export (consistency ✓); hardcoded 0.35-scale + 285% size hacks; hover "loading" overlay is actually a click-to-view layer |
| Data integrity | 8 | Transactions + revision conflicts + recovery envelopes; template switch preserves data (verified A→B→C→A); but colors stored inside resume data; switching to Cv21+ **resets user colors**; `sectionOrder` is consumed by **zero** templates |
| Validation | 6 | `validateTemplateData` exists but its warnings are unused by the builder; 900 KB server-side cap |
| Security | 9 | All 49 `dangerouslySetInnerHTML` sinks use `sanitizeRichText` (DOMPurify); render-token export; server-side ownership checks; rate limits |
| Authorization | 9 | Owner-scoped Firestore paths, publication ownerUid checks, export entitlement server-side |
| Accessibility | 4 | **446 WCAG contrast violations across 41/51 templates**; zero `aria-*`/`role` in any template; heading hierarchy broken in ~30; Cv5/Cv6/Cv51 have no `h1` |
| Internationalization | 7 | Builder + 50/51 templates use i18n (16 languages); Cv51 hardcodes English |
| Unicode support | 7 | Telugu/Hindi/CJK/Arabic fixtures render in all 51 (coverage verified); unbreakable long strings blow out layouts |
| ATS compatibility | 5 | Text extracts everywhere; but 3 templates no headings at all, ~30 with broken heading order, only 3 use lists, section titles vary |
| Content adaptability | 4 | Normal ✓; long ✗ (3 templates overflow); extreme ✗ (systemic); no balancing engine |
| Long-content handling | 4 | See above |
| Print readiness | 8 | `@page A4`, print-color-adjust, global break-inside rules, chrome removal — strong shared layer |
| PDF readiness | 8 | Headless Playwright export with render tokens, entitlement gates (frozen subsystem) |
| DOCX readiness | 7 | Backend docx export exists (frozen subsystem); covered by backend tests |
| Performance | 7 | Template chunks lazy; preview assets ~48 KB each; but BuildResume chunk 1.13 MB, fire chunk 888 KB |
| Reliability | 8 | **306/306 renders, zero crashes, zero console errors** across the whole matrix |
| Error handling | 7 | Error boundary + save/conflict states; `alert()` for download errors; guest-mode silent non-save |
| Browser compatibility | 8 | Modern grid/flex; Chromium-verified; legacy engines untested |
| Testing | 8 | 291 tests green; but no visual-regression gate, no per-template layout assertions |
| Maintainability | 5 | 51 duplicated SCSS pipelines; two data normalizers; metadata scattered across 3 files |
| Extensibility | 5 | New template = 4 registration sites; data model itself is future-proof |
| Observability | 5 | GA4 download events; no error telemetry for render failures |
| Production readiness | 6 | Strong core, weak template-quality floor |

**Honest overall baseline: 6.3 / 10** (simple average of the 34 rows).

---

## 4. Complete Findings Register (P0/P1/P2)

### P0 — none.
(No data-loss-on-switch, no XSS, no authorization hole was found. This is a genuine finding, not a forced one.)

### P1 — material product defects
| # | Finding | Evidence | Impact |
| --- | --- | --- | --- |
| F1 | **Cv51 fabricates personal data.** Renders `gender || 'Female'`, `dateOfBirth || '01/04/1964'`, `nationality || 'Italian'` when fields are absent (Cv51.jsx L312-313). | Audit text extraction shows "Sex Female · Date of birth 01/04/1964 · Nationality Italian" on the normal fixture that contains none of these fields. | Users ship resumes claiming a wrong gender/birthdate/nationality. Reputational + personal-data risk. |
| F2 | **Cv4, Cv8, Cv9 silently drop employer & school names.** Employment loops render jobTitle/date/description but never `item.employer`; education renders degree but never `item.school`. | Coverage probe "Meridian"/"Indian Institute" absent from extracted text while other sections render. | Resumes missing every company/university name — ATS keyword loss and recruiter confusion. |
| F3 | **Normal-content clipping in 3 templates.** `cv19-header` (+60 px), `cv48-header` (+20 px), Cv50 `contact-text` (+77/+101/+17 px) truncate real contact data on the standard fixture (Cv50's `white-space:nowrap; overflow:hidden; text-overflow:ellipsis`). | Audit `clippedCandidates` on `normal` fixture; reproducible on desktop and mobile passes. | Contact details silently disappear/ellipsize on an everyday resume. |
| F4 | **Long-content overflow.** Cv26 right column extends 46 px past the board with the long fixture; Cv35 (+25 px) and Cv38 (+94/+95 px) board-level overflow with clipped candidates. | Audit `long` fixture oob+clip. | Multi-role resumes (14+ positions) render broken in these templates. |
| F5 | **Systemic unbreakable-text blowout.** ~30 templates overflow massively with a 240-char unbreakable name/title (Cv5 name +2,589 px, Cv24 +2,065 px, Cv1 header +1,729 px). | Audit `extreme` fixture. | One long name/title/company/URL can destroy the document layout — no global wrap guard exists. |
| F6 | **WCAG contrast: 446 violations across 41/51 templates.** Worst: Cv28 (29), Cv35 (26), Cv50 (19), Cv14/Cv32 (18), Cv39 (17). | visual-metrics DOM audit (sRGB luminance). | Accessibility failures; light-gray-on-white text is hard to read and fails AA. |
| F7 | **"Reorder sections" feature has zero effect on any template.** `sectionOrder` is persisted and editable in the builder but consumed by no template component. | `grep sectionOrder src/cv-templates/cv*/Cv*.jsx` → 0 files. | UI promises an ordering the documents never honor. |
| F8 | **Projects/certifications/achievements/references are dead data.** Only Cv51 renders certifications; **zero** templates render projects; the builder has no step to edit them (only JSON export includes them). | Coverage probes + grep. | Data model sections exist that users cannot see or edit. |
| F9 | **Switching to Cv21–Cv51 wipes user color customization.** `handleTemplateSelect` writes `colors: null` for those templates, overwriting a previously chosen custom color. | BuildResume.jsx `getTemplateDefaultColors` + `handleTemplateSelect`. | User customization silently lost; also presentation state stored in the core data model. |
| F10 | **Cv51 missing from `getTemplateName`** → the builder's preview rail shows the raw id "Cv51" instead of a name. | BuildResume.jsx templateNames map ends at Cv50. | Cosmetic but visible product polish gap. |

### P2 — quality/hygiene
| # | Finding | Evidence |
| --- | --- | --- |
| F11 | Orphan `cv53/Cv53.scss` (no JSX/registry/route). | File system. |
| F12 | `TemplateSelectionModal` imports `CV51.JPG` (uppercase CV) — resolves today, but case-fragile on case-sensitive filesystems. | `src/assets/resumesNew/CV51.JPG`. |
| F13 | Cv18 imports lowercase `./cv18.scss` (only template with divergent casing). | Cv18.jsx L3. |
| F14 | Cv21–Cv50 named "Professional 21…50" with identical popularity (80) — no differentiation for users. | TemplateSelectionModal data. |
| F15 | Favorites in template picker are ephemeral (component state). | TemplateSelectionModal. |
| F16 | Custom sections use `window.prompt()` — poor UX and not translatable. | BuildResume. |
| F17 | No `aria-*`/`role` attributes in any of the 51 templates; Cv5/Cv6/Cv51 have no `h1`; ~30 templates have skipped heading levels; Cv44/Cv49 start with h2/h3 before h1. | Greps + audit heading sequences. |
| F18 | `validateTemplateData` warnings are computed nowhere in the UI. | Grep usage. |
| F19 | BuildResume 1.13 MB / fire 888 KB chunks; template-selection preloads 8 full JPGs. | Vite build output. |
| F20 | 23 pre-existing lint errors (`no-undef` for browser globals in test scripts). | `npm run lint`. |

---

## 5. SWOT (51 Resume Builder templates)

### Strengths (genuine)
- **Reliability core:** 306/306 renders, zero crashes/console errors; error boundary + immutable normalized view-model at every render boundary.
- **Real template differentiation:** no two templates share ink layout (min phash distance 104/1024); density and column balance are professionally varied.
- **Strong shared print/export layer:** A4 `@page`, print-color-adjust, global break-inside rules, chrome removal; frozen export subsystem (render tokens, entitlement, rate limits) is production-grade.
- **Solid data integrity:** transactions, revision conflicts, recovery envelopes, verified template-switch data preservation.
- **i18n coverage:** builder + 50/51 templates in 16 languages; Unicode (Telugu/Hindi/CJK/Arabic) renders across the whole matrix.
- **Sanitization discipline:** every HTML sink uses DOMPurify profiles.

### Weaknesses
- Silent content loss (F2, F3, F4) and fabricated data (F1) in shipped templates.
- Accessibility is effectively unmanaged (F6, F17).
- Dead product promises: section reordering (F7), projects/certs data (F8).
- Long/unbreakable content breaks ~60% of templates (F5, F4).
- Engineering duplication: 51 standalone SCSS systems, two normalizers, metadata in 3 places.

### Opportunities
- Deterministic content engine: global wrap guards, column balancing, section-continuation rules — no "AI" theater needed.
- A real design-token layer (typography scale, spacing, color roles) that removes per-template drift while preserving identity.
- Template metadata manifest (name/description/category/colors in one place) → fixes F14/F15-style drift and future-proofs discovery.
- Automated visual-regression gate (the template-lab harness is already built) wired into CI.
- Wire `validateTemplateData` warnings into the builder as live guidance.

### Threats
- ATS rejection due to missing employer/school names or heading-free templates (F2, F17).
- User embarrassment/legal exposure from fabricated Europass data (F1).
- Accessibility non-compliance (F6) for enterprise/B2B buyers.
- Layout collapse on real-world long names/URLs (F5) → support load, churn, refunds.
- Silent template regressions — today nothing catches them (pre-harness).

---

## 6. RCA for Every Material Gap (summary; details in remediation plan)

| Gap | Problem → Root cause | Fix | Validation |
| --- | --- | --- | --- |
| F1 fabricated data | Placeholder sample data was left as the fallback branch (Europass sample) → **hardcoded literals** | Render fields conditionally; no fallback values | Coverage probe: no "Female/1964/Italian" when absent; unchanged when present |
| F2 employer/school dropped | Legacy templates only printed title+dates → **incomplete render branch**, never caught because no coverage assertions existed | Add employer/school to Cv4/8/9 employment/education rows (smallest safe edit) | Coverage probes go `MISSING`→`ok`; screenshots |
| F3/F4 clipping | `overflow:hidden`+`nowrap` in headers / fixed-width columns → **clipping masks instead of wrapping** | Switch those elements to wrap + `min-width:0` flex fixes; keep intentional ellipsis only where harmless (icons) | Audit `clippedCandidates` = 0 on normal+long |
| F5 unbreakable blowout | No global wrap strategy; flex children default `min-width:auto` → **intrinsic sizing wins** | Global (board-scoped) `overflow-wrap:anywhere` for names/titles/contact + `min-width:0` on flex text containers | `extreme` fixture oob = 0 |
| F6 contrast | Accent colors used for text without luminance checks → **no token discipline** | Per-template text-color corrections driven by the automated contrast report; keep the same accent hues | visual-metrics violations → 0 per template |
| F7 reorder dead | Builder feature added without template consumption → **feature/data gap** | Either honor `sectionOrder` in templates (large) or descope the UI claim (small) — decision below |
| F8 dead sections | Templates predate the extended data model → **asymmetric evolution** | Render projects/certs where layout supports; add editing steps (phased) |

---

## 7. Template-by-Template Baseline (Before)

Score derivation (documented, mechanical): base 8.0; −1.5 drops employer/school; −2.0 Cv51 fabricated data; −1.0 clips normal content; −1.0 long-content overflow/clip; −0.5 extreme blowout; −0.5 mobile clip; −1.0/>15 contrast violations, −0.5/>5; −0.5 no h1; −0.5 h1 not first. Floor 1.0.

| Template | Before | Major issues (evidence) |
| --- | --: | --- |
| Cv1 | 7.5 | extreme blowout |
| Cv2 | 6.0 | extreme blowout; contrast 7; no h1 |
| Cv3 | 7.0 | extreme blowout; contrast 10 |
| Cv4 | 6.0 | drops employer/school; extreme blowout |
| Cv5 | 7.0 | extreme blowout; no h1 |
| Cv6 | 7.0 | extreme blowout; no h1 |
| Cv7 | 7.0 | extreme blowout; contrast 13 |
| Cv8 | 6.0 | drops employer/school; extreme blowout |
| Cv9 | 5.5 | drops employer/school; extreme blowout; contrast 6 |
| Cv10 | 6.0 | extreme blowout; contrast 9; no h1 |
| Cv11 | 6.0 | extreme blowout; contrast 8; no h1 |
| Cv12 | 8.0 | — |
| Cv13 | 8.0 | — |
| Cv14 | 7.0 | contrast 18 |
| Cv15 | 8.0 | — |
| Cv16 | 7.5 | contrast 13 |
| Cv17 | 7.5 | contrast 6 |
| Cv18 | 7.5 | extreme blowout |
| Cv19 | 5.5 | clips normal; long overflow; mobile clip |
| Cv20 | 7.5 | contrast 7 |
| Cv21 | 8.0 | — |
| Cv22 | 7.5 | contrast 8 |
| Cv23 | 7.0 | contrast 16 |
| Cv24 | 7.0 | extreme blowout; contrast 9 |
| Cv25 | 7.5 | extreme blowout |
| Cv26 | 6.0 | long overflow; extreme blowout; contrast 9 |
| Cv27 | 7.0 | extreme blowout; contrast 9 |
| Cv28 | 6.5 | extreme blowout; contrast 29 |
| Cv29 | 7.5 | extreme blowout |
| Cv30 | 7.0 | extreme blowout; contrast 7 |
| Cv31 | 7.0 | extreme blowout; contrast 12 |
| Cv32 | 6.5 | extreme blowout; contrast 18 |
| Cv33 | 7.0 | extreme blowout; contrast 10 |
| Cv34 | 7.5 | extreme blowout |
| Cv35 | 5.5 | long overflow; extreme blowout; contrast 26 |
| Cv36 | 7.0 | extreme blowout; contrast 15 |
| Cv37 | 7.0 | extreme blowout; contrast 15 |
| Cv38 | 6.0 | long overflow; extreme blowout; contrast 8 |
| Cv39 | 6.5 | extreme blowout; contrast 17 |
| Cv40 | 7.0 | extreme blowout; contrast 11 |
| Cv41 | 7.0 | extreme blowout; contrast 7 |
| Cv42 | 7.5 | extreme blowout |
| Cv43 | 7.0 | extreme blowout; contrast 12 |
| Cv44 | 6.5 | extreme blowout; contrast 15; h1 not first |
| Cv45 | 7.5 | extreme blowout |
| Cv46 | 7.0 | extreme blowout; contrast 15 |
| Cv47 | 7.0 | extreme blowout; contrast 8 |
| Cv48 | 4.5 | clips normal; long overflow; mobile clip; contrast 9 |
| Cv49 | 6.5 | extreme blowout; contrast 15; h1 not first |
| Cv50 | 4.0 | clips normal; long overflow; mobile clip; contrast 19 |
| Cv51 | 4.0 | drops occupation; **fabricated personal data**; contrast 7; no h1 |

**Baseline average: 6.63 / 10. Floor (Cv50) 4.0.** Zero templates start at 10/10 — consistent with "no 10/10 without evidence."

---

## 8. Builder UX Journey (verified in real browser, guest mode)

| Step | Result |
| --- | --- |
| Land `/build-resume` → redirect to `/heading` | ✓ |
| Fill heading fields → navigate Next → Previous | ✓ data persisted |
| Add Another Position → 3 inputs appear | ✓ |
| Change Template modal: open / search / select | ✓ |
| Data after template switch | ✓ name/email intact |
| Preview modal shows switched template with data | ✓ |
| A→B→C→A round trip | ✓ data intact |
| Mobile 390 px | ✓ no horizontal overflow; menu + preview panels present |
| Console errors | only environment noise (Firestore/GA/Maps offline with dummy keys) — none from builder code |

Notable UX observations (non-blocking): privacy banner overlays the bottom action bar on first load; the preview's "loading overlay" is actually a hover-only click-to-view layer (mislabeled); the mobile preview uses a hardcoded 0.35 scale that makes it hard to read; `Cv51` shows as a raw id in the preview rail.

---

## 9. Next Phase (planned, not yet executed)

1. **Global content-engine layer** (extend `globalTemplateEnhancements.css`, board-scoped): wrap guards for unbreakable text, flex `min-width:0` fixes, section-continuation/break rules — fixes F5/F4 class defects for all 51 at once.
2. **Per-template surgical fixes**: Cv51 fabricated data; Cv4/8/9 employer/school; Cv19/Cv48/Cv50 header wrapping; long-content column fixes Cv26/35/38.
3. **Contrast pass** driven by the 446-violation report until every template reports 0.
4. **Template metadata manifest** (single source of names/colors/categories) — fixes F9/F10/F14 drift.
5. **Automated quality gates**: `npm run test:templates:matrix` (lab audit as a CI gate: zero crashes, zero console errors, zero normal-fixture clips, coverage probes, contrast budget, overflow budget) + screenshot-based visual regression baseline.
6. Full regression suites + CV-module verification + production build + final certification answers.
