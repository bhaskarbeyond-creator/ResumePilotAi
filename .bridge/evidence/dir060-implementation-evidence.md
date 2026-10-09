# DIR-060 — Evidence (Phase 1 audit + Phase 2 permanent fix)

**Directive:** DIR-060 — Deep Audit of 51 Resume & 4 CV Templates (A4 Layout, 100%
PDF/DOCX Parity, Watermarks & Master Profile Sync). P0.
**Ruling applied:** OPTION A — acting Lead, declared `user-requested` takeover
(the Lead session was unreachable: no `lead.lease.json`; every dispatch logged
`leaseLive:false`). Templates are **AUDIT-ONLY**; ACT authority covers only
NON-frozen surfaces.

---

## 1. IDENTIFY → PROVE: the watermark entitlement defect

**Identified.** `ResumeWatermarkOverlay` decided whether to stamp a document
purely from the **global admin setting** (`watermark.enableFreeWatermark`) and had
**no entitlement input at all**.

**Proven (static forensics, exact locations):**
- Render sites read `values._watermark || values.watermark`:
  `src/components/TemplateRenderer.jsx:58` and
  `src/engine/hybrid/SmartResumeComposer.jsx:76`.
- `_watermark` is **never written anywhere in `src/`** — it appears only as those
  two reads.
- The builder's preview view model (`BuildResume.jsx:959`) carried **neither** a
  watermark nor an entitlement, and `PreviewModal` passes it straight through
  (`PreviewModal.jsx:232`, `<PreviewModal resumeData={previewData}>` at
  `BuildResume.jsx:2530`).
- `removesWatermark` — the authoritative entitlement — exists **only in
  `backend/`** (`backend/security/entitlements.js`); there were **zero** frontend
  references.

**Consequences (both are failures of the same missing gate):**
| User | Before | Directive requirement |
|---|---|---|
| FREE | overlay received `undefined` → returned null → **no watermark in preview** | watermark must render reliably (§4) |
| PAID | overlay had no entitlement input → any caller supplying the global public watermark would **stamp a paid document** | zero leakage (§4) |

## 2. RCA → FIX (permanent, non-frozen)

One shared, unit-tested, **fail-closed** gate now owns the decision:

- **NEW** `src/utils/watermarkEntitlement.js`
  - `shouldRenderWatermark(watermark, entitlement)` — renders **only** when the
    admin setting is ON **and** the user is not entitled to a clean copy; an
    explicit OFF wins; missing/invalid/array configs fail closed.
  - `resolvePreviewWatermark({ watermark, isPaid, removesWatermark })` — the
    object to attach as `_watermark`, or `null`.
  - `readEntitlement(values)` — normalises the nested/flat contract.
- `ResumeWatermarkOverlay.jsx` delegates to the gate and accepts an explicit
  entitlement (`entitlement` | `isPaid` | `removesWatermark`).
- **Both** render sites pass `entitlement={readEntitlement(values)}`.
- `BuildResume.jsx` `previewData` now publishes
  `_watermark: resolvePreviewWatermark({ watermark: freeTierAccess, isPaid: isPaidPreview })`
  and `_entitlement: { isPaid }`, using the **existing** authoritative sources
  (`freeTierAccess` = `public_config.watermark`; `isPaid` = `isPaidMembershipTier`).

## 3. FROZEN boundary respected

`git status` shows **no file under `src/cv-templates/`** was modified:

```
M src/components/BuildResume/BuildResume.jsx
M src/components/TemplateRenderer.jsx
M src/components/common/ResumeWatermarkOverlay.jsx
M src/engine/hybrid/SmartResumeComposer.jsx
?? src/utils/watermarkEntitlement.js
?? tests/dir060-watermark-entitlement.test.mjs
```

The 51 resume + 4 cover template directories are present and untouched (asserted
in the new suite). Any CONFIRMED template-level defect will be raised as a
separate AGENTS.md §10.1 frozen-module request.

## 4. RECHECK → EVIDENCE

| Gate | Command | Result |
|---|---|---|
| New suite | `node --test tests/dir060-watermark-entitlement.test.mjs` | **9/9 pass** |
| Template/export regression | `dir060 + template-data + template-render + template-quality-gate + template-empty-sections + build-resume-shell + export-client` | **70/70 pass** (incl. server-rendering EVERY template) |
| Full product matrix | `npm run test:product` | **756 pass, 0 fail** |
| Lint | `eslint` on every changed file | **0 errors** (11 pre-existing warnings in `BuildResume.jsx`, untouched) |
| Build | `npm run build` | **exit 0, 3.58s** |

**One test caught a real gap during development**: `shouldRenderWatermark([])`
initially returned `true`; the gate now rejects arrays, and the case is pinned.

Log: `.bridge/evidence/dir060-product-regression.log`.

## 5. Honest limitations / remaining work (not claimed as done)

- **Phase 1 template audit matrix is NOT yet complete.** The per-template A4 /
  page-break / overflow matrix via `template-lab/` (`audit.mjs`,
  `overflow-probe.mjs`, `print-probe.mjs`, `spacing-probe.mjs`) is the next step;
  the measured head-start is: only **2 of 55** template SCSS declare `210mm`,
  **0** declare `@page`, and **5** contain any `page-break`/`break-inside` rule —
  the A4 box actually comes from three global layers
  (`globalTemplateEnhancements.css`, `smartEngine.css`, `ResumePageComposer.jsx`).
- **Master-profile → HeadingStep hydration** (S4) was scoped but not yet pinned;
  `HeadingStep.jsx` hydrates from `resumeData` props, so the audit must trace the
  upstream `BuildResume` source.
- **PDF↔DOCX parity** (S3) was not exercised; `docxThemes.js` is a documented port
  of `themePresets.js` with an existing drift test to run.
- No backend/schema change was made.
