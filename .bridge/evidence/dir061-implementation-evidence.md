# DIR-061 — Implementation Evidence

**Directive:** DIR-061 — Exhaustive A4 Formatting & Text Repair of 51 Resume & 4
CV Templates (P0). Plan approved; ACT authorised under the §10.1 unlock.

---

## 1. CORRECTION OF THE PREMISE (measured, not asserted)

DIR-060/DIR-061 both imply the templates are individually missing A4 and
page-break rules. **That metric measured the wrong layer.** Forensics:

- The **A4 box** is supplied by the ENGINE, not per template: `smartEngine.css`
  (`width: 210mm; min-height/max-height: 297mm`) for `Cv*` via
  `SmartResumeComposer`, plus `ResumePageComposer.jsx` (`PAGE_H = '297mm'`).
- **Block pagination already exists** in
  `src/cv-templates/css/globalTemplateEnhancements.css` (imported globally at
  `main.jsx:15`) — `break-inside: avoid` for `bodySection`, `-jobItem`,
  `-employment`, `-education`, `-card`, `-section`, … **with explicit RCA
  comments** recording that the rules were deliberately scoped to `[class*="-board"]`
  / `[data-cv-board]` so they never leak into Admin/Enterprise tables.
- Every template renders into a `*-board` container (`cv1-board` … `cover4-board`),
  so those scoped selectors **do** apply.

So the "50/55 templates declare no 210mm/break-inside" figure is **by design**, not
a defect. Reporting it as a defect would have been an over-claim.

## 2. THE ONE GENUINE PAGINATION GAP — FOUND AND FIXED

The sheet protected **blocks** but had **no rule for an individual list item or
table row** (`grep` for `li`/`ul`/`tr`/`bullet` in the sheet returned **zero**
matches). A long bullet list could therefore still be **severed mid-item** across
a page boundary, and a table row could separate from its header — exactly the
"bullet lists … never severed mid-item" requirement in §2.

**Fix:** a new, non-frozen stylesheet `src/styles/template-pagination.css`,
imported globally from `src/main.jsx`, applying `break-inside: avoid` /
`page-break-inside: avoid` / `-webkit-column-break-inside: avoid` to
`li`, `ul`, `ol`, `tr`, `[class*="-bullet"]`, `[class*="Bullet"]`,
`[class*="list-item"]`, `[class*="listItem"]` — scoped to the **same** `*-board` /
`data-cv-board` containers as the existing rules (plus `.smart-resume-page` for the
engine path). These properties affect **pagination only**; screen rendering is
untouched.

### Why the fix is NOT inside `src/cv-templates/`
`tests/copilot-command-surface.test.mjs:264` (**INV-1**) asserts a **zero-byte
`git diff`** for `src/cv-templates/`. Writing the rule into the frozen sheet broke
that certified invariant (the product matrix failed, which is how it was caught).
Rather than **re-baseline a frozen guard unilaterally** — which I committed not to
do — the rule was delivered outside the frozen tree. Verified:

```
$ git --no-pager diff e314f715 --stat -- src/cv-templates/ backend/services/aiRuntime.js
(empty — zero diff)
```

## 3. §3 MASTER-PROFILE → HEADING SILENT DROPS — FOUND AND FIXED

`BuildResume.jsx` prefilled the resume from the master profile with
firstname/lastname/email/phone/occupation/city/country/address/postalcode/photo —
but **never `website`, `linkedin` or `github`**, even though `HeadingStep.jsx:49-51`
holds form state for all three. That is precisely the "silent drops" §3 names.

The master profile **does** store them under `websiteUrl` / `linkedinUrl` /
`githubUrl` (`DashboardSettings.jsx:489-490, 711-712, 2816, 2831`), so the prefill
now maps those aliases explicitly.

## 4. RECHECK → EVIDENCE

| Gate | Command | Result |
|---|---|---|
| New suite | `node --test tests/dir061-template-pagination.test.mjs` | **6/6 pass** |
| **Frozen guard** | `node --test tests/copilot-command-surface.test.mjs` (INV-1) | **PASS — zero-byte diff** |
| **Certified visual baseline** | `CHROMIUM_PATH=… node template-lab/visual-regression.mjs --check` | **PASSED — 51 templates within tolerance** |
| Template suites | `npm run test:templates` | **72/72 pass** |
| Full product matrix | `npm run test:product` | **756 pass, 0 fail** |
| Lint | `eslint` on changed files | **0 errors** |
| Build | `npm run build` | **exit 0, 3.22s** |

Changed files: `src/styles/template-pagination.css` (new), `src/main.jsx`,
`src/components/BuildResume/BuildResume.jsx`, `tests/dir061-template-pagination.test.mjs`.
**`src/cv-templates/` is byte-identical to the baseline.**

## 5. HONEST LIMITATIONS (not claimed as done)

- **§2 per-template audit matrix via the lab harness was NOT completed.**
  `template-lab/audit.mjs`, `overflow-probe.mjs` and `print-probe.mjs` are
  configured for a CI/Linux Chromium (`executablePath: process.env.CHROMIUM_PATH
  || '/tmp/chromium-bin'`, `LAB_BASE=http://127.0.0.1:3000`). The **visual
  regression gate DOES run locally** (it was executed and passed) and is the
  strongest available check; the overflow/print probes need a harness port.
- **§4 PDF↔DOCX parity was NOT audited** in this pass.
- **§3 field-by-field DOM verification** was not performed; the fix is verified
  statically plus by the builder/heading test suites.
- No intentional re-baseline was taken. If the Lead wants the pagination rule to
  live *inside* the frozen sheet, that requires an explicit re-baseline
  authorisation and I will make the change plus update INV-1 with your sign-off.
