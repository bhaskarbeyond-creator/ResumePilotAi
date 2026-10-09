# DIR-063 — Unfulfilled DIR-060/061 Deliverables: PDF↔DOCX Parity + 55-Template A4 Probes

**Context:** DIR-060 and DIR-061 were auto-certified by the legacy daemon without human
review, leaving two user-requested deliverables unfulfilled. This closes both under the
DIR-062 provenance rules (no self-certification).

---

## 1. DELIVERABLE 1 — PDF vs DOCX parity

### What was already true
`backend/test/docx-parity.test.js` **passed 20/20** and already asserts, for all 51
templates: valid ZIP/OOXML, no HTML leak, primary colour present, native bullets,
content tokens present, layout table for split archetypes.

### What was NOT true
Those are all **structural presence** checks. The directive's actual parity claims —
**section ordering, typography, bullet indentation, date normalisation, contact icons** —
were **never asserted**. They were unverified claims, not proven ones.

### What I added (`backend/test/docx-parity.test.js`, +5 tests)

| Contract | Assertion |
|---|---|
| **Section order** | summary → employment → education in canonical order, anchored on **content** (`Platform engineer with`, `Meridian Financial Systems`, `IIT Madras`) because heading labels differ per archetype |
| **Typography** | the name run's `w:sz` is strictly **larger than every section-heading size**, all 51 |
| **Bullet indent** | `<w:numPr>` present **and** `numbering.xml` defines a real `w:ind` left/start indent |
| **Dates** | the `Jan 2021` … `Present` range survives export |
| **Contact parity** | email, phone and website **values** all survive — no channel dropped |

**Result: 38/38** across `docx-parity` + `docx-export` + `export-pipeline` (was 33).

### Honest finding recorded
Archetypes genuinely diverge: `Cv4`/`Cv10` emit **no** `CONTACT`/`EMPLOYMENT HISTORY`
heading, and `Cv40` matched none of the heading synonyms. I did **not** paper over this by
weakening the test — the ordering contract was re-anchored on content, which holds for
every archetype. The **icon divergence is documented in the test itself**: the PDF renders
contact *icons*, Word cannot, so the DOCX carries *values* (plus labels for most
archetypes). The assertion pins "no channel dropped", not "identical rendering".

---

## 2. DELIVERABLE 2 — Per-template A4 print & overflow (55 templates)

### The proven coverage gap
```js
export const TEMPLATE_IDS = Object.freeze(Array.from({ length: 51 }, (_, i) => `Cv${i + 1}`));
```
`print-probe.mjs` and `overflow-probe.mjs` both iterated `TEMPLATE_IDS` — so **no cover
template was ever probed**, while the directive asks for 55. Worse, `main.jsx` validated
`?template=` against `TEMPLATE_IDS`, so `?template=Cover1` **silently fell back to Cv1**:
the probes would have measured Cv1 while reporting a cover.

### The blocker
Both probes required an **external lab server** (`LAB_BASE`, default
`http://127.0.0.1:3000`) and a **Linux Chromium** (`CHROMIUM_PATH`, default
`/tmp/chromium-bin`). Neither exists here, so the 55-template verification **had never
been executed at all**.

### What I changed
* `template-lab/fixtures.js` — added `COVER_TEMPLATE_IDS` (`Cover1..Cover4`, mirroring
  `src/utils/templateRegistry.js`) and `ALL_TEMPLATE_IDS` (55). **`TEMPLATE_IDS` left at 51**
  so the certified 51-entry visual baseline is untouched.
* `template-lab/main.jsx` — validates against `ALL_TEMPLATE_IDS`.
* `print-probe.mjs` / `overflow-probe.mjs` — iterate `ALL_TEMPLATE_IDS`; accept the
  `[class*="-board"]` root, because cover letters are **not composed** by
  `SmartResumeComposer` and have no `.smart-resume-page`.
* **NEW `template-lab/run-probes.mjs`** — starts vite **in-process** (`createServer`, the
  same pattern `visual-regression.mjs` uses) so **no detached server is spawned** and the
  XAMPP invariant holds; auto-detects the local Playwright Chromium.

### Three real bugs found and fixed while making it run
1. **Event-loop deadlock.** The first runner used `execFileSync`, which **blocks the parent
   event loop** — and the vite server lives in that same loop, so the server could never
   answer the child's requests. Every navigation failed with
   `page.goto: Timeout 30000ms exceeded`. Fixed by using **async** `execFile`.
2. **Vite cold start.** The first request triggers esbuild dependency pre-bundling, which
   exceeded the probe timeout. Added an explicit warm-up fetch + raised the probe
   navigation timeout to 60 s.
3. **The print probe mis-asserted covers.** It reported
   `doc-padding:48px, header-hidden-in-print, footer-hidden-in-print` for every cover.
   Those elements **do not exist** on a cover (no `.smart-resume-document`,
   `.smart-header`, `.smart-page-footer`) — three **false failures** each. Shell-specific
   assertions are now gated behind `hasShell`; A4 geometry, box-shadow and sidebar
   visibility are still asserted for **all 55**.

### Results — executed, not claimed

| Run | Result |
|---|---|
| overflow, `minimal` | **0/55 clip visible content**, **0/55 waste >12%** |
| overflow, `long` | **0/55 clip**, **0/55 waste** |
| overflow, `extreme` | **0/55 clip**, **0/55 waste** |
| print, `long` | **55/55 pass the print-media probe** |
| Cover1–Cover4 | `794×1123` A4 geometry confirmed, `0px` cut, present in every run |

Every run reports all **55** documents, covers included. Logs:
`template-lab/evidence/dir063/`; probe JSON: `template-lab/evidence/senior/`.

---

## 3. VERIFICATION

| Gate | Result |
|---|---|
| NEW `tests/dir063-docx-parity-and-print.test.mjs` | **6/6 pass** |
| backend DOCX suites (parity + export + pipeline) | **38/38 pass** |
| `npm run test:product` | **exit 0** |
| `npm run test:security:static` | **exit 0** |
| `npm run lint` | **exit 0, 0 errors** |
| `npm run build` | **exit 0, 2.55s** (< 4.0s budget) |
| **INV-1** `src/cv-templates/**` vs `e314f715` | **zero diff** |

New scripts: `test:dir063`, `test:dir063:docx`, `test:dir063:probes`.

---

## 4. HONEST LIMITS

* **No true pixel-level DOCX↔PDF comparison.** That needs a DOCX *renderer*
  (LibreOffice/Word) to rasterise the `.docx` and diff it against the PDF raster. I did
  **not** do that. I delivered the strongest feasible proxy: OOXML-level contract
  assertions + print-media emulation of the PDF side. **LibreOffice 26.8.1.1 was installed
  during this session but is NOT yet wired into the parity harness** — a genuine
  follow-up, not something I am claiming as done.
* **Cover templates are not composed.** They render as a single board, so they have no
  pagination to sever — the "zero severed bullets" claim is meaningful for the 51 resumes
  and near-trivial for covers. Stated rather than glossed.
* **Fixtures, not live candidate data.** All 55 × fixture combinations use
  `template-lab/fixtures.js`; real resumes may exercise shapes the fixtures do not.
* **I did not run the full matrix.** Print ran at `long`; overflow at `minimal`, `long`,
  `extreme`. The full 9-fixture × 2-probe sweep is ~990 page loads and was not executed.
* **Unrelated in-tree changes.** `bridge.cjs`, `autowake.cjs`, `lead_watcher.cjs` and
  `lead_watcher_session.cjs` were modified earlier this session under DIR-062
  authorisation; they are present in the same working tree but are not DIR-063 work.

