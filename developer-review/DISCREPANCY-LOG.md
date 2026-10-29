# Master Discrepancy Log — ResumePilotAi

Single source of truth for confirmed findings. IDs are stable and sequential. No finding
below is a hypothetical — every one cites a verbatim excerpt captured during this audit
from the read-only clone of commit `537e298` on branch `main`. Candidates that were
investigated and **disproved** live in `appendix/REFUTED-CANDIDATES.md`, not here.
Candidates that remain **plausible but unproven** live in
`appendix/UNVERIFIED-SUSPICIONS.md`, not here.

> **Update 2026-10-29 (Mandate 5 — independent verification of V4, revision `cccd35a5`).** Three entries
> added. DISC-024 records that the V4 reachability register was wrong in *both* directions (see it before
> citing any V4 class count). DISC-025 records 23 client-side paths that no backend operation serves.
> DISC-026 records admin controls that report success after swallowing a failed write. No V4 entry was
> deleted; DISC-016 keeps its published numbers and is now annotated as superseded by DISC-024.

> **Update 2026-10-29 (Mandate 8 — independent audit validation, revision `a2ecb96`).** Five entries added
> (DISC-049 … DISC-055). DISC-049 corrects the M7 provenance claim: `a7d08a2` is **not** byte-identical to
> `8a6e03bb` (264 files differ, all under `developer-review/`; 0 outside) and the ref the package says
> preserves it does not exist. DISC-050 … DISC-053 are product findings that M7's row-level work surfaced
> only in part: the contact form reports success without a request, the public jobs page requests an
> operation that does not exist, the create-ticket modal lost its keyboard contract, and the shared unread
> poller/badge are gone. No earlier entry was deleted or renumbered; the three rows whose *classification*
> changed (FP-D07, FP-A12, FP-C06) are documented in `M8-PARITY-REVALIDATION.md` with their prior verdicts.

> **Update 2026-10-29 (Mandate 6 — V6 feature-depth forensic re-audit, revision `a5835ff6`).** Fourteen entries
> added (DISC-027 … DISC-040) and five existing rows were **reclassified on new evidence**, never deleted:
> `FP-B05`, `FP-B08`, `FP-E02`, `FP-F02`, `FP-F06` and `FP-G01` moved `FULL PARITY` → `PARTIAL PARITY`, and
> `FP-A11`, `FP-A19` moved `PARTIAL PARITY` → `MOCK / FABRICATED STATE`. The dominant new finding is structural:
> **17 client paths (27 call sites) resolve to no registered backend operation**, so several admin and employer
> workflows cannot succeed — while showing success messages (DISC-027). The V6 subfeature evidence, the 10-check
> detector output and its adjudicated false positives are in `FEATURE-DEPTH-EVIDENCE-REGISTER.md`.

Total confirmed findings in this log: **53** (55 IDs: DISC-001 … DISC-055, of which DISC-042 and DISC-046
are merged into DISC-030 and labelled as stubs). DISC-049 … DISC-055 were raised by Mandate 8 at
`a2ecb96d2b194df25d5cd8ce2ece23ef65068fd9`. DISC-027 … DISC-040 were raised by V6 at revision
`a5835ff6`; DISC-041 and DISC-043 … DISC-048 by V7 at `8a6e03bb`; earlier entries keep their published
numbers and reasoning, with V7 revisions appended in place (DISC-025, DISC-026, DISC-029). DISC-019 … DISC-022 were
raised by the V4 coverage-reconciliation mandate at revision `0adad00`; DISC-001 … DISC-018 are
unchanged by that pass.

> **Update 2026-10-29 (V4 coverage reconciliation, revision `0adad00`).** Every metric in this
> log was rebuilt from the repository at `0adad00`, not carried forward from the report. Four entries
> were added (DISC-019 … DISC-022); DISC-016 was refined from a binary count into a seven-class
> register. Two earlier statements elsewhere in the package were found wrong and are corrected in
> place with the corrected anchor cited: `FP-C07` ("no route in `main.jsx`" — `main.jsx:575` does
> route the gallery) and `FP-F11` ("no employer-side rejection-reason capture" — it exists at
> `CandidateReviewDrawer.tsx:84`). Counts previously published as "104 templates", "1,527 palette
> lines" and "9 archetypes / 24 layout families" were not reproducible; the verified values are
> **100**, **1,371** and **5 archetypes / 6 header styles**, and the old figures are withdrawn in
> `ALLEGATION-RESOLUTION-REGISTER.md` rather than silently replaced.

> **Update 2026-10-29 (forensic re-audit of the legacy→modern transition).**
> DISC-013 … DISC-018 were raised by the re-audit. **DISC-001 is superseded in part**
> (see the banner on that entry). The re-audit also **corrected prior figures** rather
> than editing them in place: the legacy tree is 651 source files / 519 `.jsx` /
> 193,320 lines, not "144 files/dirs" as recorded in `EVIDENCE-INDEX.md` E-002.
> **V5 (independent verification):** those figures were themselves off by one file — the
> inventory counted `src/components/welcome/App.test.js`, which the audit's own rule excludes.
> Corrected to **650 / 193,310**; see DISC-023. The 651 figure is kept here because this
> banner records what the V4 pass published.

> **Update 2026-10-28 (runtime verification pass).** DISC-001 … DISC-007 were
> established statically in the read-only pass. **DISC-008 … DISC-012 were
> discovered by executing the application** in the temporary environment described
> in `TEMP-ENVIRONMENT-MANIFEST.md`; they are labelled
> `RUNTIME VERIFIED (temp env)` and each cites its log/artifact.

---

## [DISC-001] Two parallel, divergent frontend source trees create active-implementation ambiguity

> ### ⚠ SUPERSEDED IN PART — 2026-10-29
> The original finding below is preserved verbatim; only its *disposition* changes.
>
> **Original conclusion:** two divergent trees create ambiguity; the duplicate tree "is not
> guarded by the same publish pipeline as the real app", divergence class `UNKNOWN`.
>
> **New evidence:** `npm --prefix frontend` in every root script and
> `scripts/sync-dist.mjs` shipping `frontend/dist` settle the ambiguity: **the active app is
> `frontend/`**, and root `src/` is outside the build. But "outside the active build" is not
> "dead": 7 `backend/test/*.test.js` assert legacy source strings (contract surface) and
> `scripts/candidate-workspace-inventory.mjs:5` imports legacy code. Measured:
> **651 legacy files / 519 `.jsx` / 193,320 lines** (V5: 650 / 193,310 — DISC-023) vs **206 modern files / 151 `.tsx` /
> 68,812 lines**.
>
> **Revised conclusion:** the ambiguity about *which app runs* is **RESOLVED** (frontend). What
> remains is the opposite problem: the legacy tree is the **only** implementation of 30
> capabilities the modern app lacks (DISC-013), so it cannot be deleted as dead code without
> destroying the record of unported behaviour. Re-classified from *ambiguity* to
> *unmigrated-capability debt*. See `LEGACY-MODERN-FEATURE-INVENTORY.md` §1, §7.

**Severity:** P2 — High

**Severity gate:** "Complexity or duplication with a demonstrated regression risk" (§3.1,
P2 examples) — demonstrated below: the duplicate tree is independently buildable and is
not guarded by the same publish pipeline as the real app.

**Divergence class:** UNKNOWN (no commit message, README, or code comment found that
documents an intentional reason for maintaining two frontend roots; see Disproof Outcome)

**Verification status:** STATICALLY VERIFIED

**Confidence:** High

**Disproof outcome:** SURVIVED — attempted to disprove by searching for a documented
reason (strangler-fig migration note, deprecation notice, README pointer). None found in
root `README`-equivalent locations searched (`CLAUDE.md`, `.gitignore` comments,
`vite.config.js` header comments). `vite.config.js` comments discuss build-identity and a
Firebase-bundle guard, never a deprecation notice for this tree.

**Affected files:**
- `index.html` (repo root) — references `/src/main.jsx`
- `src/main.jsx`-rooted tree (`src/` at repo root — 150+ subdirectories, e.g.
  `src/components/`, `src/cv-templates/` with 51 numbered template folders, `src/engine/`)
- `vite.config.js` (repo root)
- `frontend/index.html` — references `/src/main.tsx`
- `frontend/src/` (TypeScript, Playwright-tested)
- `package.json` (repo root) — build script delegation
- `scripts/sync-dist.mjs` — guarded publish pipeline

**Reference baseline:** N/A — this is an internal active-vs-active duplication, not an
active-vs-`reference-code` divergence.

**Evidence:**

`index.html#script-tag` (repo root):
```html
<script type="module" src="/src/main.jsx"></script>
```

`frontend/index.html#script-tag`:
```html
<script type="module" src="/src/main.tsx"></script>
```

`package.json#scripts` (repo root):
```json
"dev": "npm --prefix frontend run dev",
"build": "npm --prefix frontend run build",
```
(No root script ever invokes the root-level `vite.config.js`/`src/main.jsx` tree.)

`scripts/sync-dist.mjs` header comment:
```
Synchronise the modern frontend build (frontend/dist) into the repository's
Apache DocumentRoot directory (dist/).

Invoked automatically by `frontend/package.json` -> "build" after
`tsc -b && vite build` succeed, so a normal `npm run build` inside
frontend/ refreshes the directory Apache serves.
```

Git recency (`git log -1 --format=%ci -- <path>`):
```
src/            -> 2026-10-25 15:59:46 +0000   (3 days stale relative to HEAD)
frontend/src    -> 2026-10-28 18:21:11 +0530   (same day as HEAD)
```

**Description:** The repository root contains a complete, independently buildable
Vite/React application (`index.html` + `vite.config.js` + `src/main.jsx` + hundreds of
component/template files under root `src/`) that is separate from, and three days
stale relative to, the actively developed and actively built `frontend/` application.
Nothing in the root `package.json` scripts, `.htaccess` deploy rewrite rules, or
`scripts/sync-dist.mjs` publish guard references the root `src/`/`index.html` tree. The
production artifact (`dist/`) is populated exclusively from `frontend/dist` by
`scripts/sync-dist.mjs`, which explicitly refuses to run against an incomplete/foreign
source directory. Root `vite.config.js` is nevertheless fully formed (contains a
build-identity plugin and a Firebase-bundle guard plugin), meaning a developer or CI job
that runs `npx vite build` from the repository root — a natural action given a
root-level `vite.config.js` and `index.html` exist — would silently produce a second,
stale, divergent bundle that is not validated by `sync-dist.mjs`'s boundary checks.

**Expected behavior:** A single, unambiguous active frontend source tree, or an explicit,
documented migration marker (e.g., `src/README-DEPRECATED.md`, a `package.json`
`"deprecated"` field, or removal) if the root tree is legacy.

**Actual behavior:** Two complete, independently buildable frontend trees coexist with no
documented relationship between them.

**Root-cause analysis:**
- *Immediate cause:* Root `src/` (JSX) predates `frontend/src/` (TSX) and was not removed
  or archived when `frontend/` became the maintained implementation.
- *Underlying cause:* A TypeScript migration/rewrite (`frontend/`) appears to have been
  built alongside the legacy tree rather than in-place, and the legacy tree's deletion was
  never completed or ticketed.
- *Systemic cause:* No lint/CI rule or pre-commit check enforces "no second buildable Vite
  entry point outside `frontend/`"; nothing in `scripts/` fails a build if root `src/` is
  edited.
- *Introduction point:* Not determinable with certainty inside the 100-commit shallow
  clone window; the oldest commit in the fetched window (`5b72cba`,
  `feat(resume-engine): universal A4 multi-page partitioner, 100 template catalog & Cuba UI
  integration`) already shows both trees present. `DEFERRED` — requires a full,
  unshallowed clone to find the actual fork point.
- *Recurrence risk:* Likely — nothing currently prevents a third parallel tree from
  appearing during a future rewrite.
- *Prevention strategy:* Either (a) delete root `src/`, `index.html`, `vite.config.js`
  once confirmed unused, or (b) add a CI guard that fails if `vite.config.js` exists
  outside `frontend/` without an explicit allow-list entry.

**Impact and blast radius:** No runtime/production impact was found (the publish pipeline
only reads `frontend/dist`), so this is not a live P0/P1. The blast radius is
developer-experience and audit/parity risk: a future contributor, security reviewer, or
automated scanner that inspects "the frontend" by walking root `src/` will draw
conclusions about a tree that is not what end users receive, and 51 CV template
folders plus all of root `src/components/` represent substantial dead-or-shadow code that
inflates the repository's apparent surface area (contributed to the `1159 .js / 519 .jsx`
file counts observed in the initial inventory).

**Recommended remediation:** PROPOSED — NOT IMPLEMENTED. Two valid options exist and the
choice requires a product/architecture decision, not a unilateral code change:
  1. **Delete** root `src/`, `index.html`, `vite.config.js`, and any root-level CSS/asset
     folders not referenced by `frontend/`, once a developer confirms (via build log
     inspection and a clean `git grep` for cross-references) that nothing in `frontend/`
     imports from root `src/`.
  2. **Archive** the root tree under a clearly named path (e.g. `legacy/vite-jsx-app/`)
     with a top-level `README.md` stating its retirement date and the commit at which
     `frontend/` became canonical, if historical reference value is wanted.
Either option must be preceded by a `git grep -r "from '\.\./\.\./src" frontend/src` (and
equivalent relative-import patterns) to rule out any live cross-tree import.

**Proposed patch:** None generated — this is a directory-deletion/architecture decision,
not a code-diff-level fix, and the mandate prohibits generating a patch that alters
runtime behavior speculatively.

**Verification recipe:**
1. Prerequisite: local clone, no build required.
2. Run: `grep -rn "require(['\"]\.\./\.\./src\|from ['\"]\.\./\.\./src" frontend/src` and
   `grep -rln "src/main.jsx" . --include=*.json --include=*.js --include=*.config.*`
   excluding `node_modules`.
3. Expected result if option 1 is safe: zero matches outside the root tree itself.
4. Failure condition: any match proves a live dependency exists and changes the
   remediation to an extraction task instead of a deletion.

**Execution status:** Not executed as a deletion (forbidden — read-only audit). The
cross-reference grep described above **was** run read-only during this audit
(`grep -rE "VITE_[A-Z_]*(KEY|SECRET|TOKEN)" frontend/src` and adjacent searches); no
root-`src`-into-`frontend`-src import was observed in the files inspected, but a
repository-wide exhaustive grep across all 519 `.jsx` and 152 `.tsx` files was not
completed in this session — `DEFERRED`.

**Rollback and implementation risk:** Low if the cross-reference check in the
verification recipe returns zero matches; deleting unreferenced files is reversible via
git history regardless.

**Dependencies:** None blocking; independent of all other findings.

**Related findings:** DISC-002 (naming confusion compounds this), DISC-005.

**Evidence limitations:** The exhaustive "zero cross-reference" proof was not completed
for the full file set; treat remediation option (1) as conditional on that proof being
re-run and passing.

---

## [DISC-002] Inconsistent project identity across repository metadata

**Severity:** P3 — Minor

**Severity gate:** "Naming or maintainability concerns without a demonstrated significant
regression risk" (§3.1, P3 examples).

**Divergence class:** N/A — not a parity finding; an internal-consistency finding.

**Verification status:** STATICALLY VERIFIED

**Confidence:** High

**Disproof outcome:** SURVIVED — checked whether "IME365" is a legitimate product
sub-brand documented anywhere as intentional; no cross-reference document tying
"ResumePilotAi" (GitHub repo name), "my-app" (`package.json` name), "IME365" (`CLAUDE.md`
governance doc project name and Windows path), and "resumepilot" (reference-code package,
`.env.example` `VITE_WEBSITE_URL=https://resumepilot.example`) together was found.

**Affected files:**
- `package.json#L2` (root) — `"name": "my-app"`
- `CLAUDE.md#L1-L7` — `# IME365 — Claude Code Developer Guidelines...` /
  `**Project:** IME365` / `**Project Root:** d:\xampp\htdocs\IME365`
- `frontend/index.html` — `<meta name="description" content="IME365 — Interview Made
  Easy. Build professional resumes...">`
- `.env.example` — `VITE_WEBSITE_URL=https://resumepilot.example`

**Reference baseline:** N/A.

**Evidence:** (verbatim, as captured above in Affected files — each string was read
directly from its cited file during this audit.)

**Description:** Four different names are used for what appears to be the same product
across files that a new developer would read first: the GitHub remote name
(`ResumePilotAi`), the npm package name (`my-app` — the Node.js default placeholder,
suggesting `npm init` was never customized), the governance document's declared project
name and absolute Windows development path (`IME365`, `d:\xampp\htdocs\IME365`), and the
live frontend's own `<meta description>` branding ("IME365 — Interview Made Easy").

**Expected behavior:** A single canonical product/project name consistently used in
`package.json`, governance docs, and user-facing metadata, or an explicit "formerly known
as" note if a rebrand occurred.

**Actual behavior:** Four distinct names with no cross-reference, and a Windows-specific
absolute path (`d:\xampp\htdocs\IME365`) hard-coded into a governance document that
otherwise describes a Linux/Apache/PHP production deploy path (`.htaccess`,
`api/index.php`).

**Root-cause analysis:**
- *Immediate cause:* `package.json` `"name"` was never changed from the scaffolding
  default; `CLAUDE.md` was authored for or inherited from a differently named project
  ("IME365") and never reconciled with the renamed repository.
- *Underlying cause:* Governance/process documentation (`CLAUDE.md`) and
  product-facing metadata appear to evolve on different cadences/owners than the
  repository name itself.
- *Systemic cause:* No automated check cross-validates `package.json.name`,
  repository name, and user-facing branding strings.
- *Introduction point:* `DEFERRED` — requires full (non-shallow) history to find when the
  repository was renamed, if it was.
- *Recurrence risk:* Possible — low-impact but will keep recurring absent a lint rule.
- *Prevention strategy:* Add a cheap CI check asserting `package.json.name` matches an
  approved constant, and a single "Project Identity" section referenced (not copy-pasted)
  from all governance docs.

**Impact and blast radius:** Cosmetic/process only; no evidence of functional or security
impact. Affects onboarding clarity and audit traceability (a reviewer searching for
"ResumePilotAi" inside the repo's own governance doc will not find it).

**Recommended remediation:** PROPOSED — NOT IMPLEMENTED. Rename `package.json.name` to the
canonical product name, add a one-line "Project aliases" note to `CLAUDE.md` if "IME365"
is an intentional internal/legacy codename, and update `d:\xampp\htdocs\IME365` to a
platform-neutral placeholder (e.g. `<repo-root>`) since production evidently deploys via
Apache/PHP, not XAMPP on Windows.

**Verification recipe:** `grep -rn "IME365\|my-app" package.json CLAUDE.md
frontend/index.html` should return zero stray matches after remediation, or only an
explicitly documented alias note.

**Execution status:** Not executed (documentation-only proposal).

**Rollback and implementation risk:** Negligible — text-only change.

**Dependencies:** None.

**Related findings:** DISC-001.

**Evidence limitations:** None material.

---

## [DISC-003] Release governance explicitly declares the project below its own production-readiness bar, with three unexecuted human-gated verification bars

**Severity:** P1 — Critical

**Severity gate:** This is not a code-level P0 condition, but it meets the mandate's own
release-effect test for P1 ("Ship only with an explicitly documented risk decision" does
not apply here because the repository's *own* governance framework, `CLAUDE.md` §1.3,
defines a **Release Authority/Gatekeeper** approval step that explicitly has not
occurred). Per §3.1, a P1 is appropriate wherever "a required reference capability [is]
absent or non-functional" relative to the project's own defined release contract; here the
project's own audit trail states the required human-gated verification has categorically
not run.

**Divergence class:** N/A — this is a release-process finding sourced from the
repository's own internal audit trail, not an active-vs-reference code comparison.

**Verification status:** STATICALLY VERIFIED (the claim is that the repository's own
committed documents say this; this audit did not independently re-run the drills, nor
could it without violating the read-only/no-side-effects boundary)

**Confidence:** High (direct quotation of the repository's own self-audit, authored under
its own `CLAUDE.md` governance process)

**Disproof outcome:** SURVIVED — attempted to disprove by searching for a subsequent
commit that marks these three bars complete. `git log --oneline` for the 100-commit
window shows the most recent relevant commits are the closure/engagement-ending commits
themselves (`49e82c2`, `4a76767`) and a routing fix (`537e298`, HEAD) that does not
reference H.1/H.2/H.3 completion.

**Affected files:**
- `developer-review/ceiling-table-r17.md` (inside audited repo)
- `developer-review/HANDOVER-CLOSURE-2026-10-28.md` (inside audited repo)
- `developer-review/prep-021-022/path-to-9.5.md` (referenced as authoritative source, not
  independently re-read line-by-line in this session — see Evidence Limitations)

**Reference baseline:** N/A.

**Evidence:**

`developer-review/ceiling-table-r17.md` (verbatim):
```
Rules applied (mandate): NO pre-credit of designed-but-unexecuted work; human-gated
packages are execution-ready but NOT counted; the official number is whatever the
verifier's evidence says; no freeze-readiness declaration is made here.
...
The maximum honestly-declarable number after this mandate, on this branch's evidence
alone, is 9.3 / 10. It is NOT a freeze declaration — freeze-readiness is the verifier's
call against a re-run on the new tip. The program ceiling is 9.525 → 9.5 ... reaching it
requires exactly three human-executed bars — H.1 security drill in the target
environment (+0.075), H.2 mesh-alias operator promotions (+0.075), H.3 one production
observation cycle (+0.075) ... All four packages are committed, execution-ready
(<30 min each for H.1-H.3), and NOT pre-credited in the 9.3.
```

`developer-review/HANDOVER-CLOSURE-2026-10-28.md` (verbatim, §4 "Human-Gated Items & Named
Ownership" table rows):
```
| Groq API Key | Provision valid API key (gsk_...) from console.groq.com/keys in
  backend/.env | Project Lead | Staging / Prod cutover |
| Gemini API Key | Provision Google AI Studio API key (AIzaSy...) ... | Project Lead |
  Staging / Prod cutover |
| OpenRouter API Key | Provision funded OpenRouter key (sk-or-v1-...) with credits ... |
  Project Lead | Staging / Prod cutover |
| PR Opening & Promotion | Authorize PR creation via GitHub web UI or promote branch to
  dev via fast-forward command sequence | Project Lead | Gated on human sign-off |
| Enterprise DDL Window | Schedule and run migrations 028/029 on production cluster ... |
  Database Administrator / Project Lead | Scheduled Maintenance Window |
```

**Description:** The repository's own, extensively evidenced internal audit process
(hundreds of commits of "R-series" rulings, probe transcripts, and a formal
`path-to-9.5.md` bar list) concludes, in writing and at the tip of the branch this audit
inspected, that: (a) the maximum honestly declarable quality score is 9.3/10, explicitly
**not** a freeze/production-readiness declaration; (b) three specific human-executed
verification bars (a live security key-rotation drill, operator promotion of ≥3 AI model
mesh aliases, and a 14-day production observability cycle) have never been executed; and
(c) three third-party AI provider API keys required for the AI feature set remain
placeholder/unprovisioned pending a named human owner ("Project Lead") action before
"Staging / Prod cutover." This is first-party evidence, authored by the project's own
prior engineering governance process, that the application has not cleared its own
release gate.

**Expected behavior:** Per `CLAUDE.md` §1.3's own authority-separation table, "Certify
release readiness" is reserved for a "Designated Gatekeeper" and is explicitly listed as
a responsibility distinct from implementation. A production deployment should only occur
after that named gatekeeper role signs off, which — per the cited evidence — had not
happened as of the inspected commit.

**Actual behavior:** The branch is positioned as merged to `main` (this audit cloned
`origin/main` directly, not a feature/arena branch), while the project's own
documentation says the PR/promotion step and the three H.1/H.2/H.3 bars remain
human-gated and incomplete, and production AI credentials are unset.

**Root-cause analysis:**
- *Immediate cause:* The engineering/audit workstream produced execution-ready
  verification packages (`developer-review/packages/h1-security-drill/`,
  `developer-review/packages/h3-production-observation/`) but a human operator has not
  run them.
- *Underlying cause:* The governance model (`CLAUDE.md`) deliberately separates
  "implementation-ready" from "certified," and autonomous agents are not authorized to
  self-certify — this is by design, not a bug, but it means the artifact in `main` is, by
  the project's own rules, not yet certified.
- *Systemic cause:* There is no CI/branch-protection gate observed in the inspected files
  that would mechanically block a merge to `main` until H.1/H.2/H.3 evidence files exist
  (their presence could be checked in a pre-merge hook); the gate today is organizational
  trust, not a machine-enforced one.
- *Introduction point:* N/A (this is a standing condition, not a regression at a specific
  commit).
- *Recurrence risk:* Likely to recur on every future release cycle unless the human-gated
  steps are converted into an enforced CI check (e.g., a required status check that looks
  for a dated, signed observation-cycle artifact).
- *Prevention strategy:* Add a branch-protection rule on `main` requiring a "release
  certification" status check that fails unless H.1/H.2/H.3 evidence artifacts dated after
  the latest `backend/` or `frontend/` change exist.

**Impact and blast radius:** Whole application — every user journey that depends on the
AI provider fleet (resume AI assist, cover-letter AI, interview coaching — see
`appendix/INVENTORIES/external-integrations.md`) is affected if deployed with the
placeholder keys described in §4 of the closure doc. Multi-tenant isolation guarantees
(`H.3`) and a security key-rotation path (`H.1`) are specifically called out by the
project's own audit as unverified in a live environment.

**Recommended remediation:** PROPOSED — NOT IMPLEMENTED. (1) Before any production
promotion, a named Project Lead/DBA must execute the three committed H.1/H.2/H.3 packages
and the two pending enterprise migrations (028/029) in a real target environment, and
provision the three AI provider keys. (2) Convert this into a machine-checked gate (see
Prevention strategy) so this cannot silently regress to "trust the doc" again.

**Verification recipe:** Confirm presence and freshness of signed evidence files under
`developer-review/packages/h1-security-drill/` and
`developer-review/packages/h3-production-observation/` with a completion date, and confirm
`backend/.env` (not `.env.example`) on the target host contains non-placeholder values for
`GROQ_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`. Expected result: dated,
named-signoff evidence exists. Failure condition: evidence absent or dated before the
latest relevant code change.

**Execution status:** NOT EXECUTED during this audit (running a live security drill or
provisioning real API keys is explicitly outside a read-only audit's authority and would
require live secrets this audit must never request or hold).

**Rollback and implementation risk:** N/A — process control, not a code change.

**Dependencies:** Independent of code-level findings; gates overall Go/No-Go (see
`EXECUTIVE-GAP-SUMMARY.md`).

**Related findings:** DISC-004.

**Evidence limitations:** This audit did not independently re-derive the 9.3/10 score or
re-read `path-to-9.5.md` in full; it is relying on the ceiling table's own summary of that
document. The underlying math/weights in `path-to-9.5.md` were not re-verified line by
line — `DEFERRED`.

---

## [DISC-004] Production AI-provider credentials are unprovisioned placeholders, blocking end-to-end verification of every AI-dependent feature

**Severity:** P1 — Critical

**Severity gate:** "A required reference capability absent or non-functional in the
active implementation" (§3.1, P1 example) — the AI generation capability cannot function
without these keys, and the project's own documentation confirms they are not yet
provisioned for staging/production.

**Divergence class:** N/A — operational configuration finding.

**Verification status:** STATICALLY VERIFIED (`.env.example` + closure-doc cross-check);
**RUNTIME VERIFICATION DEFERRED** for whether the actual deployed `backend/.env` (not
committed, correctly excluded by `.gitignore`) has real values — this audit has no access
to that file and must not request secret values.

**Confidence:** Medium (high confidence that the example file ships empty placeholders and
that the project's own closure doc names these as pending; medium, not high, on current
production state, since the live `.env` is outside this audit's visibility by design).

**Disproof outcome:** SURVIVED — checked whether keys might be supplied through a
different non-`.env` mechanism (e.g., a secrets manager referenced in code). Found
`backend/security/secretVault.js` exists, suggesting a vault abstraction may supply these
in production; this **reduces confidence** that the finding is still live in production,
which is why confidence is marked Medium and the finding explicitly separates the
committed-example-file fact (STATICALLY VERIFIED) from the production-state claim
(DEFERRED).

**Affected files:**
- `.env.example#L (DEEPSEEK_API_KEY, GEMINI_API_KEY, GROQ_API_KEY, OPENAI_API_KEY,
  OPENROUTER_API_KEY, NVIDIA_API_KEY)` — all shipped as empty (`KEY=`)
- `backend/security/secretVault.js` (existence confirmed, contents not fully traced in
  this session)
- `developer-review/HANDOVER-CLOSURE-2026-10-28.md` §4 (quoted under DISC-003)

**Reference baseline:** N/A.

**Evidence:**

`.env.example` (verbatim key lines, values are the file's own empty placeholders, not
redacted real secrets):
```
DEEPSEEK_API_KEY=
GEMINI_API_KEY=
GROQ_API_KEY=
OPENAI_API_KEY=
OPENROUTER_API_KEY=
NVIDIA_API_KEY=
```

(Closure-doc evidence already quoted verbatim under DISC-003; not repeated here to avoid
duplicate-counting per mandate §9.2, but cross-referenced.)

**Description:** The committed `.env.example` defines the full set of AI-provider
environment variables as empty placeholders (expected and correct for an example file).
The repository's own closure documentation, however, independently confirms that as of
the audited commit, the *real* values for at least three of these (Groq, Gemini,
OpenRouter) are still pending human provisioning before "Staging / Prod cutover." This is
two independent pieces of first-party evidence agreeing that the AI feature set is not
yet configured for a live environment.

**Expected behavior:** Either the AI feature set gracefully degrades with a clear
user-facing message when a provider key is absent (this audit found
`backend/freellmapi` includes a HTTP 402 `PAYMENT_REQUIRED` classification path per the
HEAD commit message itself — suggesting some such handling exists) and this finding is
scoped to "not yet in production," or production deployment is blocked until keys exist.

**Actual behavior:** Per the project's own documentation, keys are pending; this audit
cannot independently confirm or refute the current state of the real (uncommitted)
`backend/.env` on any deployed host, and does not have access to do so.

**Root-cause analysis:**
- *Immediate cause:* Secret provisioning is an operator action outside of source control
  by design (correctly — secrets must never be committed).
- *Underlying cause:* The project's human-gated release process had not completed this
  step as of the audited commit.
- *Systemic cause:* No automated "secrets readiness" health check was found exposed
  (e.g., a `/readyz` endpoint that reports per-provider key presence without leaking
  values) that would let an external auditor or on-call engineer confirm readiness
  without reading internal docs. `backend/index.js` does reference `readyzAlerts`
  (`services/readyzAlerts`) — whether it covers AI-key presence was not traced in this
  session (`DEFERRED`).
- *Introduction point:* N/A — standing operational gap, not a code regression.
- *Recurrence risk:* Possible on every redeploy/environment rotation unless key presence
  is asserted by a startup check that fails fast.
- *Prevention strategy:* Add a startup/readiness check that fails closed (clear error, not
  silent degradation) when a configured-as-required AI provider has no resolvable
  credential, and surface that state on an authenticated admin health endpoint.

**Impact and blast radius:** All AI-dependent user journeys (resume content generation,
cover-letter generation, interview coaching feature referenced by `/api/live-interview`
and `/api/generate-interview` route guards seen in `backend/index.js`). Business impact:
a core differentiator of the product (AI-assisted resume building) is non-functional
without these keys.

**Recommended remediation:** PROPOSED — NOT IMPLEMENTED. Named "Project Lead" must
provision real keys in the deployment's actual secret store (not `.env.example`) before
promoting to staging/production, per the project's own closure document. Additionally,
add the startup readiness check described in Prevention strategy.

**Verification recipe:** On the real deployment target only (not in this audit): call an
authenticated admin diagnostics endpoint (if `backend/services/aiAdmin.js`'s
`testAiProvider` is exposed via `/api/admin/ai/test-provider`, per
`docs/ai-settings/security-review.md`) for each of Groq/Gemini/OpenRouter and confirm a
`200`/healthy response rather than an auth/network error. Expected result: all three
return healthy. Failure condition: any returns an unreachable/invalid-credential error.

**Execution status:** NOT EXECUTED (requires live secrets and a running deployment; both
out of scope for a read-only source audit).

**Rollback and implementation risk:** N/A (operational action).

**Dependencies:** Tied to DISC-003's release-gate finding.

**Related findings:** DISC-003.

**Evidence limitations:** Current real-world key state is unknown and was correctly not
investigated further (no secret values were sought). `backend/security/secretVault.js`
was not fully read in this session; it is plausible it sources keys from a managed vault
rather than raw env vars in production, which would partially mitigate this finding —
`DEFERRED` pending a full read of that file and of `backend/freellmapi/` provider
resolution order.

---

## [DISC-005] No pinned Node.js engine version across three independent dependency manifests

**Severity:** P3 — Minor

**Severity gate:** "Naming or maintainability concerns without a demonstrated significant
regression risk" (§3.1, P3 examples).

**Divergence class:** N/A — internal consistency finding.

**Verification status:** STATICALLY VERIFIED

**Confidence:** High

**Disproof outcome:** SURVIVED — checked all three `package.json` files
(root, `frontend/`, `backend/`) for an `engines` field; none present.

**Affected files:** `package.json` (root), `frontend/package.json`, `backend/package.json`

**Reference baseline:** N/A.

**Evidence:** Direct `node -e "console.log(require('./package.json').engines)"` (and the
`frontend`/`backend` equivalents) executed during this audit each printed `undefined`.

**Description:** None of the three independent `package.json` manifests in this
multi-package repository (root, `frontend/`, `backend/`) declares an `engines.node`
constraint, despite the backend depending on native/ESM-sensitive packages
(`@sparticuz/chromium`, `puppeteer-core`, `playwright`) that are version-sensitive to the
Node.js runtime, and despite three separate `package-lock.json` files existing
(root 691,546 bytes committed, plus `frontend/package-lock.json`,
`backend/package-lock.json`) that must stay mutually compatible.

**Expected behavior:** Each `package.json` declares an `engines.node` range (and ideally a
matching `.nvmrc`/`.tool-versions`) so CI, local dev, and production containers cannot
silently drift onto an incompatible Node major version.

**Actual behavior:** No `engines` field in any of the three manifests found.

**Root-cause analysis:**
- *Immediate cause:* `engines` was never added when the three `package.json` files were
  created/split.
- *Underlying cause:* No CI matrix/lint step enforces this.
- *Systemic cause:* General absence of a dependency-governance checklist for this
  multi-package layout.
- *Introduction point:* `DEFERRED` (predates the 100-commit window).
- *Recurrence risk:* Possible — low severity but easy to silently regress further (e.g. a
  fourth package.json added without `engines` either).
- *Prevention strategy:* Add `engines.node` to all three manifests and a CI step that
  runs `npm ls --engine-strict` or equivalent.

**Impact and blast radius:** Low in isolation; compounds environment-drift risk alongside
DISC-001's dual-frontend duplication.

**Recommended remediation:** PROPOSED — NOT IMPLEMENTED. Add a consistent
`"engines": { "node": ">=X <Y" }` to all three manifests, matching whatever Node version
the actual production host/container uses (not independently determinable from source
alone — `DEFERRED`, requires an operator to confirm the deployment target's Node version).

**Verification recipe:** `node -e "console.log(require('./package.json').engines,
require('./frontend/package.json').engines, require('./backend/package.json').engines)"`
should print three defined objects, not `undefined`.

**Execution status:** NOT EXECUTED (proposal only).

**Rollback and implementation risk:** Negligible.

**Dependencies:** None.

**Related findings:** DISC-001.

**Evidence limitations:** None material.

---

## [DISC-006] Content-Security-Policy weakens inline-style protection (`'unsafe-inline'` on `style-src-attr`/`style-src-elem`)

**Severity:** P3 — Minor

**Severity gate:** Does not meet the P0 "exposed secrets"/"auth bypass" bar nor the P1
"confirmed WCAG Level A failure" bar; classified P3 as a defense-in-depth weakening with
no demonstrated active exploit path found during this audit (§3.1 P3: "low-impact...
interaction issues" / general hardening gap without demonstrated regression).

**Divergence class:** N/A — standalone configuration finding, no reference-code CSP file
was located for comparison (`PATH NOT FOUND` — searched `reference-code/**/.htaccess` and
`reference-code/**/*.conf`; none exist in the fetched clone).

**Verification status:** STATICALLY VERIFIED

**Confidence:** High

**Disproof outcome:** SURVIVED — checked whether `script-src` (the higher-severity
directive) also allows `'unsafe-inline'`; it does not (`script-src 'self'` plus an
explicit allow-list of specific third-party origins only), which meaningfully limits the
real-world exploitability of this finding and is reflected in the P3 (not P1/P2) severity.

**Affected files:** `.htaccess#L9` (repo root)

**Evidence:**

`.htaccess` (verbatim, relevant fragment of the single `Content-Security-Policy` header
line):
```
style-src 'self' https://fonts.googleapis.com https://rsms.me; style-src-attr
'unsafe-inline'; style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com
https://rsms.me;
```

**Description:** The production CSP header (served for the Apache/`.htaccess` deployment
target) explicitly permits `'unsafe-inline'` for both `style-src-attr` (inline `style="..."`
attributes) and `style-src-elem` (inline `<style>` blocks). `script-src` is correctly
restricted to `'self'` plus a specific allow-list, so this finding is scoped to CSS-based
injection vectors (e.g., CSS exfiltration via attribute selectors, clickjacking-adjacent
style abuse), not script execution.

**Expected behavior:** `style-src-attr`/`style-src-elem` restricted to `'self'` with
nonces/hashes for any required inline styles, consistent with the strict posture already
applied to `script-src`.

**Actual behavior:** Inline styles are unconditionally allowed.

**Root-cause analysis:**
- *Immediate cause:* The frontend framework/component library in use (likely CSS-in-JS or
  inline `style=` usage from a React UI library) requires inline styles at runtime, and
  `'unsafe-inline'` was used as the pragmatic fix rather than a nonce/hash strategy.
- *Underlying cause:* Nonce-based CSP for styles is harder to retrofit into a Vite SPA
  that doesn't template its own HTML head per-request (confirmed: this is a static SPA
  served by Apache, not a server-rendered app that could inject a per-request nonce).
- *Systemic cause:* No CSP-violation-report collection endpoint was found configured
  (`report-uri`/`report-to` directive absent from the quoted header), so regressions or
  active abuse of this allowance would not be observable.
- *Introduction point:* `DEFERRED` (predates 100-commit window).
- *Recurrence risk:* Unlikely to worsen on its own, but unlikely to improve without a
  deliberate CSS-architecture change (e.g., migrating remaining inline styles to CSS
  Modules/Tailwind classes).
- *Prevention strategy:* Add `report-uri`/`report-to` to observe real-world CSP behavior
  before tightening, then incrementally replace inline-style call sites.

**Impact and blast radius:** Frontend-wide (CSP is a single global header); the practical
blast radius is bounded by the fact that `script-src` remains strict.

**Recommended remediation:** PROPOSED — NOT IMPLEMENTED. Audit remaining inline
`style="..."` usage in `frontend/src`, migrate to class-based styling, and tighten
`style-src-attr`/`style-src-elem` to drop `'unsafe-inline'` once the count reaches zero.
Add a `report-uri`/`report-to` CSP directive in the interim to observe violations safely.

**Verification recipe:** After remediation, `curl -sI https://<prod-host>/ | grep -i
content-security-policy` should no longer contain `'unsafe-inline'` on the two style
directives, and a manual DOM audit should show zero functional regression on themed pages.

**Execution status:** NOT EXECUTED (proposal only; no header was modified).

**Rollback and implementation risk:** Medium — removing `'unsafe-inline'` without first
migrating all inline-style call sites would break styling; must be sequenced, not applied
atomically.

**Dependencies:** Should follow a frontend-wide inline-style inventory (not performed in
this session — `DEFERRED`).

**Related findings:** None.

**Evidence limitations:** The actual count of inline `style=` usages in `frontend/src`
was not enumerated in this session (`DEFERRED`).

---

## [DISC-007] `reference-code/` baseline mixes source, build artifacts, and a committed binary archive, weakening its validity as a clean parity baseline

**Severity:** P3 — Minor

**Severity gate:** §3.1 P3 "maintainability concerns without demonstrated significant
regression risk"; also directly relevant to mandate §2.3 "Baseline validity."

**Divergence class:** REFERENCE-DEFECT (a defect in the baseline itself, not something to
restore).

**Verification status:** STATICALLY VERIFIED

**Confidence:** High

**Disproof outcome:** SURVIVED.

**Affected files:**
- `reference-code/public_html/resumepilot-media-companion.zip`
- `reference-code/public_html/assets/*.js` (multiple pre-built, content-hashed bundle
  files, e.g. `BuildResume-BZql5INj.css`, `BuildResume-Dm6V_7Zc.js`)

**Reference baseline:** This finding is about the baseline itself.

**Evidence:** `find reference-code -iname "*resume*"` (run during this audit) listed, among
source files, `reference-code/public_html/resumepilot-media-companion.zip` and numerous
hashed build artifacts under `reference-code/public_html/assets/` (e.g.
`BuildResume-BZql5INj.css`, `BuildResume-Dm6V_7Zc.js`, `BuildResume-BcASLUvd.js`, and
seven more similarly named chunk files).

**Description:** The directory intended to serve as the audit's legacy/reference
comparison baseline contains not only legacy *source* (`reference-code/backend/`, which is
genuinely useful for parity comparison) but also a compiled, content-hashed static bundle
and a binary zip archive. Binary/compiled artifacts are not meaningfully diffable against
active source for a code-level parity review, and multiple near-duplicate
`BuildResume-*.js` chunk files (at least 9 distinct hashes observed) suggest several
historical builds were committed over time without cleanup.

**Expected behavior:** A reference baseline intended for source-level parity comparison
should contain source only, or clearly separate `reference-code/source/` from
`reference-code/build-artifacts/` (if the compiled snapshots have forensic value, e.g. for
confirming what was actually shipped at a point in time).

**Actual behavior:** Source and multiple generations of compiled output are interleaved
in the same directory tree.

**Root-cause analysis:**
- *Immediate cause:* Whoever captured the legacy baseline appears to have copied a full
  deployed `public_html` directory (including its build output) rather than only the
  pre-build source.
- *Underlying cause:* No documented process for what a "reference-code" snapshot should
  contain.
- *Systemic cause:* No `.gitignore` rule in `reference-code/` excludes build artifacts the
  way the active repo's `.gitignore` (3,587 bytes, actively maintained) likely does for
  `frontend/dist`.
- *Introduction point:* `DEFERRED`.
- *Recurrence risk:* Possible on the next legacy-snapshot capture.
- *Prevention strategy:* Document a "how to capture a reference snapshot" runbook that
  excludes build output and binary archives, or explicitly separates them.

**Impact and blast radius:** Audit/maintainability only — increases repository size
(contributes to the 328M/179M footprint observed) and makes future parity reviews slower
by requiring reviewers to manually skip non-source files.

**Recommended remediation:** PROPOSED — NOT IMPLEMENTED. Remove compiled
`public_html/assets/*` and the `.zip` from `reference-code/` (or relocate them to a
clearly labeled `reference-code/build-snapshot-<date>/` if retained for forensic reasons),
keeping only `reference-code/backend/` and any genuine legacy frontend *source* for
parity use.

**Verification recipe:** `find reference-code -iname "*.zip" -o -iname "*.min.js"` should
return no matches after cleanup, or matches only inside an explicitly labeled snapshot
directory.

**Execution status:** NOT EXECUTED (proposal only).

**Rollback and implementation risk:** Low — these are historical artifacts, not live
dependencies of any build script (not referenced by `scripts/sync-dist.mjs`, which only
reads `frontend/dist`).

**Dependencies:** None.

**Related findings:** None.

**Evidence limitations:** Did not enumerate every file under `reference-code/public_html`
(hundreds of asset files); the sample cited is representative, not exhaustive.


---

## [DISC-008] Five WCAG 2.1 AA violations on the public landing and pricing pages (one critical)

**Severity:** P2 — High (blocking for accessibility conformance claims; `button-name`
is axe *critical* impact)

**Severity gate:** "User-facing functional or accessibility defect with a demonstrable
impact" — each item below was produced by axe-core against the running application and
reproduced at two viewports.

**Divergence class:** N/A — not a parity finding.

**Verification status:** **RUNTIME VERIFIED (temp env)** — Chromium 149.0.7827.0 +
axe-core 4.14.0, tags `wcag2a, wcag2aa, wcag21a, wcag21aa`.

**Confidence:** High (rule-engine output with node selectors and computed contrast).

**Disproof outcome:** SURVIVED — the repository's own `frontend/tests/accessibility.spec.ts`
passes 59/59 in the same session, so the findings were checked against a green
neighbouring suite; its axe assertions simply do not enumerate these nodes
(it does not deep-scan the landing testimonials or the pricing comparison matrix).

**Affected files / evidence:**
- `frontend/src/pages/landing.tsx:239` → `aria-prohibited-attr` (serious, 3 nodes):
  `<div class="flex gap-1 text-warning-500" aria-label="5 star rating">`
- `frontend/src/pages/landing.tsx:79`, `:296` → `label-content-name-mismatch`
  (serious, 2 nodes): logo `<a aria-label="IME365 Home">` whose visible text is not in
  the accessible name
- `frontend/src/pages/billing/pricing.tsx:264-272` → `button-name` (**critical**, 1 node):
  billing-period `role="switch"` button with `aria-checked` but no accessible name
- `frontend/src/pages/billing/pricing.tsx:285` → `color-contrast` 3.16:1
  (`#009966` on `emerald-500/10`); `:335` → 2.45:1 (`text-ink-muted/60`)
- `frontend/src/pages/billing/pricing.tsx:384` → `scrollable-region-focusable`
  (serious): `overflow-x-auto` comparison table not keyboard-scrollable

**Evidence artifacts:** `Evidence/artifacts/axe-violation-details.json` (targets, HTML,
failure summaries, contrast ratios), `Evidence/artifacts/browser-observations.json`
(45 captures), `Evidence/screenshots/375x667-mobile__pricing.png`.

**Stable sub-IDs:** A11Y-001 (aria-prohibited-attr), A11Y-002 (label-content-name-mismatch),
A11Y-003 (button-name, critical), A11Y-004 (color-contrast), A11Y-005
(scrollable-region-focusable). See `UI-UX-AUDIT.md` §Runtime accessibility findings.

**Expected:** every interactive control has an accessible name; decorative star ratings
either use `role="img"`/visually-hidden text or `aria-hidden`; text ≥ 4.5:1; horizontally
scrollable regions reachable by keyboard.
**Actual:** five rule violations, one critical. WCAG 2.1 AA conformance **cannot** be
claimed for these two pages as they stand.

**Remediation (PROPOSED — NOT IMPLEMENTED, application code is out of bounds for this audit):**
add `role="img"`+`aria-label` (or `aria-hidden` + visible text) to the star rows; give the
switch `aria-label="Annual billing"`; raise the two contrast pairs; add
`tabIndex={0}`/`role="region"`+`aria-label` to the scroll wrapper.

---

## [DISC-009] The claimed backend test count (1,356) is not reproducible; the runner discovers 1,315

**Severity:** P3 — Minor (reporting accuracy)

**Verification status:** **RUNTIME VERIFIED (temp env)**

**Confidence:** High

**Disproof outcome:** SURVIVED — 1,356 was not reproduced by any grouping attempted
(backend alone = 1,315; backend + enterprise = 1,502; backend + payments = 1,315 because
the payment files are already part of the 164-file glob).

**Affected files:** `developer-review/appendix/INVENTORIES/tests.md` (claim of 1,356),
`backend/scripts/run-tests-with-annotations.js` (the discovery mechanism).

**Evidence:** `Evidence/logs/backend-suite-mock-pass.log` TAP footer:
`# tests 1315 / # pass 1271 / # fail 14 / # skipped 30`.
**Description:** the previously published "1,356 tests passing" figure cannot be
regenerated from the repository at this revision; the honest rediscovered figure is
1,315 discovered, 1,271 passing, 14 failing (all DB-substitution), 30 skipped (all
MariaDB gates).
**Expected:** documented test totals traceable to a command.
**Actual:** totals that overstate discovery by 41 and overstate passing by 85.

---

## [DISC-010] Baseline migration header claims MySQL compatibility while later migrations are MariaDB-only

**Severity:** P3 — Minor (documentation/portability claim), escalated to P2 only if the
team intends to support MySQL

**Verification status:** **RUNTIME VERIFIED (temp env)** — executed against a real
MySQL 5.7.29 server.

**Confidence:** High

**Disproof outcome:** SURVIVED — the probe applied every migration in order.

**Affected files:** `backend/database/migrations/001_baseline.sql` (header
"Complete Relational MySQL / MariaDB Schema — Hostinger & Cloud Compatible"),
`backend/database/migrations/002_single_owner_enterprise.sql` (first incompatible
statement).

**Evidence:** `Evidence/artifacts/migration-fidelity.json`:
`002_single_owner_enterprise.sql → ER_PARSE_ERROR` on
`ALTER TABLE users ADD COLUMN IF NOT EXISTS revision INT NOT NULL DEFAULT 1`;
29 migrations discovered, **1 applied**, 57 tables created.
**Description:** `ADD COLUMN IF NOT EXISTS` does not exist in MySQL 5.7/8.0 DDL, so the
"MySQL compatible" statement in the baseline header is not true for the migration set as
a whole. The repository's own gate already assumes MariaDB 11.4
(`mariadb-migration-gate.test.js`), so the *code* is consistent; the *comment* and any
downstream expectation of MySQL portability are not.
**Expected:** header states MariaDB-only, or migrations avoid MariaDB-only DDL.
**Actual:** mixed claims.

---

## [DISC-011] `freellmapi-admin-e2e.spec.ts` hardcodes `localhost:5173`, contradicting the project's own Playwright configuration (:4000 + `webServer`)

**Severity:** P2 — High (a committed, documented E2E suite cannot pass by the documented command)

**Verification status:** **RUNTIME VERIFIED (temp env)**

**Confidence:** High

**Disproof outcome:** SURVIVED — 47/47 tests failed with
`page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/...` while the app was
being served on `:4000` exactly as `frontend/playwright.config.ts` prescribes; starting a
second dev server on `:5173` immediately converted the run to **15 passed / 2 failed /
30 not-run** (serial-mode abort).

**Affected files:** `frontend/tests/freellmapi-admin-e2e.spec.ts` (its own `baseUrl`
constant), `frontend/playwright.config.ts` (`baseURL: http://127.0.0.1:4000`, `webServer`
on 4000).

**Evidence:** `Evidence/logs/pw/freellmapi-admin-e2e-db.log` (47 × ERR_CONNECTION_REFUSED),
`Evidence/logs/pw/freellmapi-admin-e2e-5173.log` (15 passed).
**Expected:** specs navigate relative to Playwright's `baseURL`.
**Actual:** the spec pins a different port than the configuration starts, so the suite
fails for environmental reasons even in a fully provisioned environment.

---

## [DISC-012] The accessibility suite's `ime_dev_user` shim does not authenticate the router, so "authenticated surface" assertions silently run against the login page

**Severity:** P2 — High (test-efficacy: green results that do not test what they claim)

**Verification status:** **RUNTIME VERIFIED (temp env)** — 5 viewports × 4 protected routes.

**Confidence:** High

**Disproof outcome:** SURVIVED — every navigation to `/dashboard`, `/admin`,
`/admin/ai-settings?subtab=providers`, `/build-resume` and
`/dashboard/settings?tab=support` with `localStorage.ime_dev_user` set ended at
`/login?next=…` (see `Evidence/artifacts/browser-observations.json`,
`finalUrl` fields).

**Affected files:** `frontend/tests/accessibility.spec.ts` (`setDemoAuth`),
`frontend/src/lib/preview-session.ts:19` (`PREVIEW_SESSION_KEY='ime_dev_user'`),
consumers `preview-modal.tsx:157`, `dashboard/resumes.tsx:134,486`,
`export/cv-renderer.tsx:204`.

**Evidence:** `Evidence/artifacts/browser-observations.json`; the same 59 tests pass in
`Evidence/logs/pw/accessibility.log`.
**Description:** `ime_dev_user` is a *preview/export* session hint, not an authentication
credential recognised by the route guard. The suite still passes because its surface
selectors (`[data-testid="dashboard"], main, [role="main"]`) match the login page's
`main`. Result: the Candidate Dashboard / Employer Portal / Admin Console / Enterprise
Console axe coverage attributed to that suite is, in this environment, axe coverage of
the login page.
**Expected:** authenticated surfaces are reached with a real (or preview-login) bearer
session, or the suite asserts the expected surface identity before scanning.
**Actual:** silent downgrade to unauthenticated surfaces. Recommend asserting
`await expect(page).not.toHaveURL(/\/login/)` before each scan.

---

## [DISC-013] Thirty legacy capabilities were not ported to the active frontend, with no recorded retirement decision

**Severity:** P1 — Critical (product-wide capability debt; the shipping app is materially smaller than the product it replaced)

**Verification status:** STATICALLY VERIFIED (109 capability rows, 3 reproducible generators)

**Confidence:** High

**Disproof outcome:** SURVIVED — attempted to disprove by (a) searching for an ADR/changelog/migration
note documenting any retirement, and (b) re-measuring every count from source. Neither yields a
decision record; and the counts reproduce exactly (`tools/legacy-modern-inventory.cjs`,
`tools/parity-matrix.cjs`).

**Evidence:** `FEATURE-PARITY-MATRIX.md` (109 rows: 25 `FULL PARITY`, 35 `PARTIAL PARITY`,
30 `MISSING`, 9 `MOCK / FABRICATED STATE`, 6 `REPLACED BY EQUIVALENT`, 4 `UNVERIFIED`);
`Evidence/artifacts/feature-parity.json`; `Evidence/logs/parity-matrix.log`.
Legacy file attribution is complete: 650/650 files map to a capability row.

**Description:** `INTENTIONAL RETIREMENT` is applied **zero** times because no evidence of intent
exists. The largest omissions: voice interview (2,432 lines), candidate command palette (1,527 lines),
internationalisation (16 locales / 1,011 keys), Puck + 71 portfolio blocks, image crop, QR generation,
job-map discovery, employer onboarding, admin audit/operators/announcements, coupon & refund
administration, bulk member operations.

**Expected:** every legacy capability is either ported, or its retirement is documented and approved.
**Actual:** silent removal. Deletion without a decision record is indistinguishable from loss.

---

## [DISC-014] Nine admin capabilities render from fabricated state, including a false assertion that a security action succeeded

**Severity:** P1 — Critical (operator deception in security and marketing surfaces)

**Verification status:** STATICALLY VERIFIED (+ reachable in the running app under an admin session)

**Confidence:** High

**Disproof outcome:** SURVIVED — attempted to disprove by tracing every mutation handler to a network
call. `AdminSecurityTab.tsx` (928 lines) and `AdminContentMarketingTab.tsx` (456 lines) contain **zero**
api-client references; `AdminAttentionTab.tsx` contains zero; `AdminModerationTab.tsx` seeds its lists
and swallows write failures via `.catch(() => {})`.

**Evidence:** `AdminSecurityTab.tsx:66-110` (invented events, principals, IPs, `requestPath`),
`:204-213` (`handleRevokeSessions` → toast asserting "Next request will return 401", no fetch);
`AdminContentMarketingTab.tsx:40-150` (`INITIAL_PHRASES` 5, `INITIAL_REVIEWS` 3, `INITIAL_TRUSTED` 5,
`INITIAL_PAGES` 3 — 16 records, 0 API); `AdminDashboardTab.tsx:41-48` (`?? '48,290'`, `?? '420,910'`);
`AdminHealthTab.tsx:460-500` (fabricated latency, "99.8%" delivery, "100% Enforced" isolation).
All corresponding backends exist: `/platform/security-events`, `/platform/operators`,
`/platform/announcements`, `/phrases`, `/admin/reviews`, `/admin/trusted-by`, `/admin/pages`,
`/platform/operational-status`.

**Expected:** panels either call the documented endpoints or present an explicit empty/error state.
**Actual:** invented records presented as live platform data; the highest-severity instance asserts a
completed session revocation that never happened.

---

## [DISC-015] Portfolios created with the legacy page editor are permanently read-only

**Severity:** P1 — Critical (user data becomes uneditable after the platform upgrade)

**Verification status:** STATICALLY VERIFIED

**Confidence:** High

**Disproof outcome:** SURVIVED — attempted to disprove by looking for a migration path from legacy
`content` blocks to the canonical document model. None exists.

**Evidence:** `frontend/src/pages/portfolio/builder.tsx:347`
`const editable = stored ? isWebCvDocument(stored) : false;`, `:477` renders
"Built with the earlier page editor", `:490-533` gates save/preview on `editable`;
`frontend/src/lib/portfolio-document.ts:412-420` `isWebCvDocument()` returns false for documents
carrying block content. Puck is gone (`@puckeditor` absent from `frontend/src`), as are the 71
`PortfolioComponents/*` blocks.

**Expected:** existing portfolios remain editable, or are migrated, or are exportable for re-creation.
**Actual:** a read-only dead end with no migration. This is a data-access regression, distinct from a
missing feature.

---

## [DISC-016] Half of the backend's operation surface (192 of 384) is unreachable from the modern UI

**Severity:** P1 — Critical (implemented, tested backend capability is undrivable by the product)

**Verification status:** STATICALLY VERIFIED (mount prefixes resolved, 0 guessed)

**Confidence:** Medium-High (prefix matching biases toward "consumed", so the figure is a floor)

**Disproof outcome:** SURVIVED — attempted to disprove by widening what counts as a consumer
(prefix matching either direction). The 192 figure survived that generous test.

**Evidence:** `Evidence/artifacts/backend-ui-coverage.json`, `Evidence/logs/backend-ui-coverage.log`:
498 route declarations → **384** unique `METHOD+path` → 192 referenced by modern code → **192** not →
**58** referenced by neither frontend. Clusters: `/admin` 65, `/platform` 33, `/auth` 12, `/email` 11,
`/enterprise` 9.

**Description:** monetisation and operations are the worst hit: `/admin/coupons`,
`/admin/payments/refund`, `/invoices`, `/invoice/generate`, `/payment-orders`,
`/platform/payment-webhooks(/:id/replay)`, `/email/logs|resend|templates|admin/test-imap`,
`/platform/tenants/:id{/decommission}`, `/platform/security-events`, five payment-gateway verifier
routes. This is also the root cause of DISC-014 going unnoticed: nobody reached the real endpoints.

---

## [DISC-017] Internationalisation, product analytics, per-route SEO and the offline shell were removed wholesale

**Severity:** P2 — High (breadth of user-visible regression; compliance-adjacent for consent)

**Verification status:** STATICALLY VERIFIED

**Confidence:** High

**Disproof outcome:** SURVIVED — searched for successor implementations under alternate names
(`i18next`, `useTranslation`, `react-intl`, `gtag`, `react-helmet`, `serviceWorker`, JSON-LD).

**Evidence:** 16 locale directories (`de dk en es fr gk hi is it nl no pl pt ro ru se`), 1,011 distinct
`t()` keys, 131 legacy consumers → **0** i18n references in `frontend/src`; `GA4Provider.jsx` referenced
by 14 legacy files → 0 modern analytics init; `RouteSeo.jsx` (407 lines) + `MetaManager` → one static
`<title>`/description in `frontend/index.html`, only `public-portfolio.tsx` mutates `document.title`;
`src/serviceWorker.js` → 0 registrations; `services/seo/structuredData.js` → 0 JSON-LD;
`PrivacyConsentBanner.jsx` → 0 consent UI (a cookie-policy route remains).

**Description:** Not named in the supplied omission report; found by the Domain G sweep. All modern UI
strings are hard-coded English, every route shares one SEO title, and job postings carry no schema.org
markup (Google Jobs eligibility).

---

## [DISC-018] Prior published figures for the legacy tree were understated by roughly 4.5×

**Severity:** P3 — Medium (audit-integrity: conclusions were drawn from an under-measured baseline)

**Verification status:** STATICALLY VERIFIED (recount)

**Confidence:** High

**Disproof outcome:** N/A — this is a correction of this package's own record, disclosed rather than
edited away.

**Evidence:** `EVIDENCE-INDEX.md` E-002 recorded "`src/` tree | 144 files/dirs, 59 template folders,
`src/main.jsx` 37k lines". Measured: **650** source files (519 `.jsx`), **51** `cv*` template
directories (+6 `cover*`), `src/main.jsx` = **645** lines, 193,320 total lines.
**V5 note:** the file count in this entry was 651 and included one test file; the corrected figures are
650 files / 193,310 lines (DISC-023). The 651 is retained because this entry records the V4 measurement.
Recount via `tools/legacy-modern-inventory.cjs`; per-file ledger in
`Evidence/artifacts/legacy-file-inventory.tsv`.

**Expected:** prior audits state a reproducible measurement with its command.
**Actual:** the earlier figure counted directories at one level and mis-attributed `main.jsx` line
count, which is partly why the legacy tree's true capability surface went unexamined and why DISC-001
never became DISC-013. The original E-002 row is left intact; the correction is appended to
`EVIDENCE-INDEX.md` as E-325.

---

## [DISC-019] OAuth provider breadth regressed from four integrations to one

**Severity:** P2 — High (users of three identity providers lose a sign-in path; two hardened server flows become dead code)

**Verification status:** STATICALLY VERIFIED

**Confidence:** High

**Disproof outcome:** SURVIVED — searched the whole modern tree for `/auth/linkedin`, `/auth/github`, `/auth/oauth/exchange`, `signInWithRedirect`, and for any provider button other than Google.

**Evidence:** legacy starts four flows — Google + Facebook Firebase popups (`useOAuthSignIn.js`) and
server OAuth for LinkedIn and GitHub (`src/components/auth/login/Login.jsx:389,396`, `src/components/auth/register/Register.jsx:254,261`), 11 client call sites
in total. Modern: `pages/auth/login.tsx` is the only auth page; it imports `googleProvider` alone
(`:16`), calls `signInWithPopup` at `:216`, and renders one "Continue with Google" button (`:429-444`).
`grep -rn 'auth/linkedin\|auth/github\|oauth/exchange' frontend/src` → **0 matches**.
The backend flow itself is intact and hardened (`backend/security/oauth.js`, `backend/database/oauthStore.js`:
32-byte state stored only as SHA-256 with TTL, cookie binding via `timingSafeEqual`, single-use
`SELECT … FOR UPDATE` consume, S256 PKCE, verified-email-only, conflict/link guards, fail-closed
`oauth_not_configured`) — it is simply unreachable from the modern client.

**Expected:** a migration preserves the set of supported identity providers, or records a retirement
decision per provider.
**Actual:** three providers were dropped with no recorded retirement, and the surviving security work
is dead code. Recorded separately from the flow-quality question in `ALLEGATION-RESOLUTION-REGISTER.md`
§3.1, which finds the *architecture* improved and only the *coverage* reduced.

---

## [DISC-020] Employer rejection feedback is written to a field the MySQL adapter never persists; the CAS counter is likewise inert

**Severity:** P2 — High (a user-entered message is silently discarded on the only production data path; optimistic concurrency control is a no-op)

**Verification status:** STATICALLY VERIFIED (code path); runtime confirmation blocked by the absence of a MariaDB server in this environment

**Confidence:** High for the code path; the discard is a property of a 38-line closed function, not of a dynamic dispatch

**Disproof outcome:** SURVIVED — searched for an `employer_notes` column in all six migrations and all of `backend/`, for any second write path (`UPDATE applications`), and for any test that references `employerNotes`.

**Evidence:**
1. `components/employer/CandidateReviewDrawer.tsx:245-258` sends `notes: "[Feedback: …] • …"`.
2. `resilientMutations.js:321-328` calls `saveApplication(id, { ...current, status, employerNotes: notes, revision })`.
3. `MySQLRepository.saveApplication` (`:1600-1637`) maps exactly 13 columns and takes `notes` from
   `data.notes` — which, because `...current` is spread first, is the **pre-update** value read back by
   `getApplication`. `employerNotes` has no column (`001_baseline.sql:180-204`) and `revision` is absent
   from the column map, so neither is written.
4. `InMemoryRepository.saveApplication` (`:529-534`) spreads everything, so the feature "works" in memory.
5. `grep -rn employerNotes backend/test frontend/src` → **0 hits**: no test covers this path.
6. The applicant notification is built in the request handler (`index.js:1629-1635`), so the text still
   reaches the candidate even though the record does not change.

**Expected:** a field the user typed is durably stored, and `expectedRevision` detects a concurrent edit.
**Actual:** under MySQL the feedback is dropped and `applications.revision` stays at its default `1`, so
`APPLICATION_CHANGED` can never fire. Because the client re-reads revision `1`, the UI shows no symptom —
the failure is invisible without a database. This is also why the applicant-facing render is missing
without anyone noticing.

**Closure:** persist the payload's `notes` (or add `employer_notes`), map `revision`, and add a
repository-contract test that runs against MariaDB rather than `InMemoryRepository`.

---

## [DISC-021] Applicant-scoped application reads are not field-projected, unlike the sibling endpoint

**Severity:** P3 — Medium (latent disclosure of employer-only columns; becomes P2 once DISC-020 is fixed)

**Verification status:** STATICALLY VERIFIED

**Confidence:** High

**Disproof outcome:** SURVIVED — compared both read paths for the same table and checked for a serializer in `backend/index.js`.

**Evidence:** `GET /api/jobs/:jobId/applications` (`index.js:1728-1743`) authorizes correctly (owner sees
all; everyone else only `app.applicant_id === req.user.uid`) but returns rows from
`MySQLRepository.getApplications`, which is `SELECT * FROM applications` (`:1527-1536`) — including
`employer_id`, `rating` and `notes`. The sibling `getApplicantApplications` (`:1539-1548`) exists
specifically to avoid this and documents that "the employer's columns (rating, notes, employer_id,
extra_json) … are not selected". No response serializer strips fields for the job-scoped path.

**Expected:** one data-minimisation rule per table, applied on every read path.
**Actual:** two rules. Exploitability today is low only because DISC-020 keeps `notes` empty; fixing
DISC-020 without fixing this turns a latent gap into a live one, so the two must ship together.

---

## [DISC-022] A Facebook provider is constructed and advertised while no sign-in path exists

**Severity:** P3 — Medium (configuration surface promises a working integration that cannot run)

**Verification status:** STATICALLY VERIFIED

**Confidence:** High

**Disproof outcome:** SURVIVED — searched for `facebookProvider` consumers and for any Facebook button or handler.

**Evidence:** `lib/firebase.ts:17` imports `FacebookAuthProvider` and `:62` instantiates
`facebookProvider`. `grep -rn facebookProvider frontend/src` → only those two lines: nothing consumes it.
`login.tsx` imports `googleProvider` only. Meanwhile `AdminSettingsTab.tsx:224-228` exposes
`enableFacebookAuthModule` — "Enables 1-click Facebook Sign-in and Sign-up across authentication modals
and registration forms platform-wide" — defaulting to `true` at `:378`.

**Expected:** either the toggle controls a real flow, or it is absent.
**Actual:** an operator can switch on a capability that has no implementation. Kept separate from
DISC-019 because the remediation differs (wire or delete the provider object) and because a settings
toggle is not support — a distinction this audit applies to every "configured" claim.

---

## [DISC-023] The legacy inventory counted a test file, inflating its own baseline by one

**Severity:** P3 — Minor (audit-integrity: a 0.15 % count error in the denominator every legacy metric is expressed against)

**Verification status:** STATICALLY VERIFIED + reproduced (independent recount)

**Confidence:** High

**Disproof outcome:** SURVIVED — compared the generator's ledger against `find src -name '*.js*'` line by line.

**Evidence:** `Evidence/artifacts/legacy-file-inventory.tsv` contained 651 rows; the working tree contains
**650** source files under `src/`. The extra row was `src/components/welcome/App.test.js` (9 lines).
`tools/legacy-modern-inventory.cjs` → `walk()` filtered extensions but not `*.test.js`, while
`METRIC-DEFINITIONS.md` M1 declares "Excluding `src/**/*.test.js`". The generator and its own stated rule
disagreed, and no verifier compared them — `check_attribution_complete` only asserts ≥600 files and an
empty unattributed list, both of which the inflated number satisfies.

**Impact, measured:** legacy files 651 → **650**; legacy lines 193,320 → **193,310**; the V4 aggregate
"1,492 items" → **1,491**. No capability row, classification or verdict changes: the file was attributed
and its removal changes no ratio by more than 0.15 percentage points. Every document that quoted 651 now
quotes 650, with the V4 figure preserved in this log and in `AUDIT-CHANGE-HISTORY.md` §6.

**Expected:** the generator implements its documented exclusion rule, and a verifier asserts the ledger
size equals an independent `find` count.
**Actual:** both were absent. `scripts/verify-v4-reconciliation.py` now recomputes the legacy file count
from the filesystem and compares it to the ledger.

---

## Summary of status change caused by the V5 independent verification (revision `cccd35a5`)

## Summary of status change caused by the V4 reconciliation (revision `0adad00`)

| Finding | Status before | Status now |
|---|---|---|
| DISC-016 | 192/384 unreachable (binary coverage script) | **REFINED, not withdrawn** — 384-op register classified into seven classes: UI-REACHABLE 126, INDIRECTLY 6, EXTERNAL 27, SERVER-ONLY 11, INTENTIONALLY-UNEXPOSED 9, UNREACHABLE 201, UNVERIFIED 4. The earlier "192 without UI" and "58 neither" are superseded by a register with rule-level provenance (`Evidence/artifacts/backend-operations.tsv`) |
| DISC-019 | — | **NEW** — OAuth breadth 4 → 1 provider (FP-G08) |
| DISC-020 | — | **NEW** — rejection feedback dropped by the MySQL adapter; CAS counter inert |
| DISC-021 | — | **NEW** — applicant-scoped reads unprojected (ordering dependency on DISC-020) |
| DISC-022 | — | **NEW** — Facebook provider instantiated + advertised, unreachable |

## Summary of status change caused by this pass

| Finding | Status before | Status now |
|---|---|---|
| DISC-001 … DISC-007 | static, unchanged | unchanged (no re-verification attempted; out of this pass's scope) |
| DISC-008 | — | **NEW — RUNTIME VERIFIED** (5 WCAG violations, 1 critical) |
| DISC-009 | — | **NEW — RUNTIME VERIFIED** (test-count claim drift) |
| DISC-010 | — | **NEW — RUNTIME VERIFIED** (MariaDB-only DDL vs "MySQL compatible" comment) |
| DISC-011 | — | **NEW — RUNTIME VERIFIED** (hardcoded :5173 in an E2E spec) |
| DISC-012 | — | **NEW — RUNTIME VERIFIED** (auth shim gives false assurance) |

## Summary of status change caused by the 2026-10-29 re-audit

| Finding | Status before | Status now |
|---|---|---|
| DISC-001 | open — ambiguity between two trees | **SUPERSEDED IN PART** — active app settled as `frontend/`; reframed as unmigrated-capability debt |
| DISC-013 | — | **NEW** — 30 capabilities not ported, 0 recorded retirements |
| DISC-014 | — | **NEW** — 9 fabricated admin capabilities, incl. false security assertion |
| DISC-015 | — | **NEW** — legacy portfolios are read-only dead ends |
| DISC-016 | — | **NEW** — 192/384 backend operations unreachable from the modern UI |
| DISC-017 | — | **NEW** — i18n / analytics / SEO / PWA / consent removed |
| DISC-018 | — | **NEW** — prior legacy-tree figures understated ~4.5× (self-correction) |

---

## [DISC-024] The V4 reachability register was wrong in both directions: 45 operations under-classified, 14 over-classified, 1 absent

**Severity:** P2 — High (the register is the evidence base for parity claims; errors propagate into
`FEATURE-PARITY-MATRIX.md`, the scorecard and the verdict)
**Confidence:** High — three independent defect mechanisms, each reproduced from source and each fixed in
`tools/backend-reachability.cjs`; the repaired register is cross-checked by a separate parser at 385/385 agreement.
**First raised:** Mandate 5, revision `cccd35a5`. Supersedes the class counts in DISC-016.

**Expected:** every registered operation is classified from actual call sites, in both directions —
a call the client makes must be visible, and a call must not transfer reachability to a *different*
operation.

**Actual:** three independent defects in the V4 classifier.

1. **`enterpriseRequest(` was invisible (false UNREACHABLE).** The call-site regex enumerated
   `get|post|patch|put|del|delete|fetch|request|apiRequest|apiClient.*` but not **`enterpriseRequest`**.
   `frontend/src/lib/enterprise-api.ts` uses it **46 times**. Consequence: **45 operations** were
   classified `UNREACHABLE` or `INTENTIONALLY-UNEXPOSED` although modern code calls them — 38 to
   `UI-REACHABLE` (teams, workspaces, tenants, audit, configuration, memberships, service accounts,
   support grants, data export …) and 7 out of `INTENTIONALLY-UNEXPOSED` (the
   `/enterprise/service-accounts` and `/enterprise/support-grants` families). This is the direction that
   *flatters the audit*: V4's UNREACHABLE figure (201) was inflated by ~38.
2. **`dynamicParent` promoted sub-resources (false UI-REACHABLE).** A call to
   `patch('/admin/users/${id}')` was treated as evidence for every registered child
   (`/admin/users/{X}/ai-entitlement`, `/audit`, `/details`, `/export`, `/password-reset`, `/tenants`,
   `/unenroll-mfa`, `/verify-email`, …). **14 operations** lost their class, including
   `GET /favourites/{X}/check` and `GET /notifications-data/contact/list`, which are called only by
   backend tests. Rule removed; replaced by R7b (`patternCompatibleCall`), which returns `UNVERIFIED`
   with an explicit reason instead of claiming reachability.
3. **A dynamic tail swallowed a sibling operation.** `/resumes/public/{X}` was promoted by the call
   `/resumes/public/token/{X}` — a *different* registered operation with one more segment. Fixed with a
   same-segment-count guard.
4. **`app.all(…)` was not parsed.** `app.all('/api/admin/ai/fetch-models', …)` at
   `backend/index.js:4033` is a live super-admin endpoint; V4's route parser only accepted
   `get|post|put|patch|delete`, so the operation was missing from the register entirely
   (385 unique operations, not 384).
5. **Hook attribution was line-oriented.** A call whose template literal begins on the next line
   (`get<…>(` then `` `/employer/jobs/${jobId}/…` ``) was attributed to no hook and looked dead.
   `GET /employer/jobs/{X}/applications/{X}/resume` moved `UNREACHABLE → INDIRECTLY-REACHABLE`; it has
   two live consumers.

**Corrected register (authoritative):** 499 registrations → **385 unique METHOD+path**, 114 duplicates.
`UI-REACHABLE 152 (39.5 %) / INDIRECTLY-REACHABLE 7 (1.8 %) / EXTERNAL-CALLER 27 (7.0 %) /
SERVER-ONLY 11 (2.9 %) / INTENTIONALLY-UNEXPOSED 2 (0.5 %) / UNREACHABLE 176 (45.7 %) /
UNVERIFIED 10 (2.6 %)`. V4 published 126 / 6 / 27 / 11 / 9 / 201 / 4.

**Net effect is not uniformly favourable.** 45 operations came *into* reachability and 14 came *out* of
it, so the correction cannot be characterised as either tightening or loosening the audit. Both
directions are reported because both were published.

**Independent cross-check:** `tools/reachability-crosscheck.cjs` (separate parser, exact-literal
matching, hook function ranges) now agrees on **385 of 385** operations, 0 disagreements. Two parsers
agreeing is *not* independent proof of runtime behaviour — it is independent proof that the numbers are
reproducible from the source tree.

**Closure condition:** register regenerated from a clean checkout at the reference revision with both
tools reporting 0 disagreements (met), *and* DISC-025's dead client paths addressed — a call to a
non-existent path means the calling UI is not evidence of reachability even when the classifier is right.

**Severity rationale (honest both ways):** this is not an application defect; nothing in the product
changed. It is an audit-integrity defect, and it is rated P2 because a reader who trusted V4's
`UNREACHABLE 201` would have concluded that a fifth of the API was dead, including the whole enterprise
control plane that the admin UI actually drives.

---

## [DISC-025] 17 client-side paths are served by no backend operation — blog, queue console, moderation, operations and user-status actions 404 at runtime

> **V7 revision (`8a6e03bb`).** As first raised this finding listed **23** paths, six of which were
> `/support/tickets*` and `/admin/support/tickets*`. Those six are **retracted**: `backend/routes/support.js`
> registers all eight ticket operations (`:15`, `:30`, `:40`, `:54`, `:71`, `:81`, `:95`, `:110`) and mounts
> at `/api/support` and `/api/admin/support` (`index.js:514`, `:6925`). The V5 register never scanned that
> file because its routers are named `userRouter`/`adminRouter`, not `router` (DISC-041). The corrected count
> is **17 distinct paths / 21 call sites**, and the helpdesk no longer belongs in this finding's title. The
> original 23-row table is retained below with the six retracted rows struck through, so the previous
> conclusion stays readable next to the evidence that overturned it.

**Severity:** P1 — Critical (shipped admin and public surfaces are non-functional; one of them reports success)
**Confidence:** High — two independent static enumerations plus direct reads of both sides of each contract.
**First raised:** Mandate 5, revision `cccd35a5`. Found by the direction the V4 tools never checked:
register → client. `tools/client-call-existence.cjs` checks client → register.

**Expected:** every HTTP path literal passed to a call helper in `frontend/src` resolves to a registered
operation (or to a registered dynamic pattern such as `/admin/settings/{X}`).

**Actual:** 229 call sites were enumerated: 197 exact matches, 11 matches against a registered dynamic
pattern, **21 call sites across 17 distinct paths with no registered operation**, 0 method mismatches.
(As first raised: 188 exact, 11 dynamic, 30 call sites / 23 paths.) The dead paths, with their first call
site; rows 6–11 are retracted in V7 and kept for provenance:

| # | Client call | Call site | Backend reality |
|---:|---|---|---|
| 1 | `GET /blog/posts` | `pages/blog/index.tsx:46`, `AdminBlogManagementTab.tsx:97` | serves `/blog-data`, `/admin/blog/posts` |
| 2 | `GET /blog/posts/{X}` | `pages/blog/editor.tsx:91` | serves `/blog-data/{id}` |
| 3 | `PUT /blog/posts/{X}` | `pages/blog/editor.tsx:147` | serves `POST /blog-data/{id}` |
| 4 | `POST /blog/posts` | `pages/blog/editor.tsx:149` | serves `POST /admin/blog/posts` |
| 5 | `DELETE /blog/posts/{X}` | `AdminBlogManagementTab.tsx:126` | serves `DELETE /admin/blog/posts/{id}` |
| 6 | ~~`GET /support/tickets`~~ | `use-api-hooks.ts:588` | ~~no ticket endpoint exists~~ **RETRACTED V7** — served by `routes/support.js:30` at `/api/support` |
| 7 | ~~`POST /support/tickets`~~ | `use-api-hooks.ts:599` | ~~none~~ **RETRACTED V7** — `routes/support.js:15` |
| 8 | ~~`POST /support/tickets/{X}/messages`~~ | `use-api-hooks.ts:612` | ~~none~~ **RETRACTED V7** — `routes/support.js:54` |
| 9 | ~~`GET /admin/support/tickets`~~ | `AdminHelpDeskTab.tsx:128` | ~~none~~ **RETRACTED V7** — `routes/support.js:71` at `/api/admin/support` |
| 10 | ~~`PATCH /admin/support/tickets/{X}`~~ | `AdminHelpDeskTab.tsx:188` | ~~none~~ **RETRACTED V7** — `routes/support.js:110` |
| 11 | ~~`POST /admin/support/tickets/{X}/messages`~~ | `AdminHelpDeskTab.tsx:157` | ~~none~~ **RETRACTED V7** — `routes/support.js:95` |
| 12 | `POST /admin/jobs/{X}/moderate` | `AdminModerationTab.tsx:184` | serves `PATCH /admin/jobs/{id}` |
| 13 | `POST /admin/employer-applications/{X}/verify` | `AdminModerationTab.tsx:152,167` | serves `PATCH /admin/employer-applications/{id}` |
| 14 | `POST /admin/operations/backup` | `AdminOperationsTab.tsx:122` | **no operations write endpoint** |
| 15 | `POST /admin/operations/cache-clear` | `AdminOperationsTab.tsx:136` | none |
| 16 | `GET /admin/queues` (fallback) | `AdminQueuesTab.tsx:138` | serves `/platform/queues` |
| 17 | `POST /admin/queues/{X}/retry` (fallback) | `AdminQueuesTab.tsx:173` | serves `/platform/queues/retry` |
| 18 | `POST /admin/queues/dead-letter-queue/retry` | `AdminQueuesTab.tsx:186,262` | none |
| 19 | `POST /admin/queues/dead-letter-queue/purge` | `AdminQueuesTab.tsx:204,285` | none |
| 20 | `POST /admin/users/{X}/status` | `AdminUsersTab.tsx:206` | serves `PATCH /admin/users/{id}` |
| 21 | `POST /notify/email` | `CandidateReviewDrawer.tsx:159` | only `/notify/user-signup`, `/notify/email-otp` |
| 22 | `GET /platform/status` | `enterprise-api.ts:528` | serves `/admin/platform/status` |
| 23 | `POST /billing/validate-coupon` | `checkout-modal.tsx:246` | serves `POST /coupons/validate` |

**Why V4 missed it:** every V4 tool asked "is this registered operation called?" and none asked "is this
call served?". The parity matrix also counted API *references* in a tab (`AdminQueuesTab 683 lines /
6 api refs`) as evidence of wiring, which is true of a call that 404s.

**Consequence for parity claims:** `FP-G09` (blog) and `FP-G24` (support) were `FULL PARITY` and are
reclassified `MISSING`; `FP-A20`, `FP-A24`, `FP-A25`, `FP-B10`, `FP-E10`, `FP-E11` and `FP-E16` drop to
`PARTIAL PARITY`. See `FEATURE-PARITY-MATRIX.md` — `FULL PARITY` is now 19 of 112, and all 19 are
endpoint- and reachability-supported by `tools/parity-endpoint-audit.cjs` (19/19 `SUPPORTED`).

**Cross-check:** each path was also grepped in the backend (`support/tickets` 0 hits, `queues` 0 route
definitions, `operations/backup` 0, `cache-clear` 0, `validate-coupon` 0, `moderate` 0 route matches,
`blog/posts` only under `/admin`). `app.all` was checked separately — it is the reason
`/admin/ai/fetch-models` is *not* in this list.

**Closure condition:** every row above either gains a matching backend operation or is removed from the
client; a re-run of `client-call-existence.cjs` reports 0 `MISSING`. Not met.

---

## [DISC-026] Admin controls fabricate success after swallowing a failed write (suspend user, backup, cache purge, blog delete)

**Severity:** P1 — Critical (an administrator is told a security-relevant action succeeded when the server never received it)
**Confidence:** High — four verbatim code paths; the failing endpoint is independently confirmed absent (DISC-025).
**First raised:** Mandate 5, revision `cccd35a5`.

**Expected:** if a write fails, the UI reports failure and the displayed state stays as the server has it.

**Actual:** four controls POST to a non-existent endpoint, swallow the error with `.catch(() => {})`, then
mutate local state and display a success message.

1. **Suspend / reactivate user** — `AdminUsersTab.tsx:206` posts to `/admin/users/${id}/status`, then
   `.catch(() => {})`, then `setUsers(... status: nextStatus)` (line 210-212) and reports success. The
   account is **not** suspended; the console says it is. This is the most serious instance: a moderator
   who suspends an abusive account gets a success state and an unsuspended account.
2. **Backup** — `AdminOperationsTab.tsx:122` posts to `/admin/operations/backup`, `.catch(() => {})`, then
   sets `lastBackup: 'Just now (Verified OK)'` and the message *"MariaDB hot backup snapshot completed
   successfully."* (line 126-128). A backup is claimed that was never requested. The word "Verified" is
   fabricated: nothing verified anything.
3. **Cache purge** — `AdminOperationsTab.tsx:136-140` same shape, *"Application route and model caches
   purged across nodes."*
4. **Blog article delete** — `AdminBlogManagementTab.tsx:126` `del(...).catch(() => {})`, removes the row
   from local state, and shows *"Article … deleted successfully."* (line 128-130); the article is untouched.

**Pattern:** the failure mode is not a crash or a 500 the operator can see — it is a confident success
message. `DISCREPANCY-LOG.md` DISC-014 already records nine fabricated admin capabilities from display
metadata; these four are different because the *action* is fabricated, not the *reading*.

**Fix direction (not applied — application source is out of scope):** remove the `.catch(() => {})`,
surface the error, and only mutate local state after a 2xx; and give the operations console a real
endpoint or remove the buttons.

**Closure condition:** no admin write mutates local state or shows success on a rejected promise; a
Playwright spec asserts the failure path. Not met — and forbidden by the audit's no-app-change rule, so
this is recorded, not fixed.

**V7 revision (`8a6e03bb`) — the class is larger and the diagnosis is narrower.** The defect shape is the
same, but two things changed:

1. **Two more sites of exactly this shape.** `AdminModerationTab.tsx:152/167` (approve/reject an employer
   application) and `:184` (flag a job as spam) swallow with `.catch(() => {})`, flip local state and
   announce success. They are now `DISC-042`.
2. **"The endpoint does not exist" is only half true, and the difference matters for repair.** Of the six
   sites in this finding, **two call an operation that exists under a different contract**:
   *suspend user* → the capability is `PATCH /api/admin/users/:uid {suspended}`
   (`routes/adminUsers.js:673-760`, permission-gated, concurrency-guarded, token-revoking), and *blog
   delete* → `DELETE /api/admin/blog/posts/:postId` (`backend/index.js:3408`). Those are client
   retargets. *Backup*, *cache purge* and *dead-letter purge* have **no** server-side implementation at
   all (nothing in `backend/` creates a snapshot or purges a cache; `POST /platform/queues/purge` answers
   `410`, and bulk dead-letter replay answers `400 BULK_REPLAY_FORBIDDEN`) — those need a feature or the
   button's removal. The full per-site separation is the adjudication table in
   `CLIENT-BACKEND-CONTRACT-REGISTER.md` §4.

The finder that produces the list is `tools/client-contract-audit.cjs` (`successAfter`), which reported
**12** swallow-then-assert-success sites at this revision: the six above, the two moderation sites, the
dead-letter retry/purge pair, user-status, and blog delete. Counted per site, not per finding, because a
single control can be reached from two call sites.

## [DISC-027] 17 client-call paths (27 call sites) have no registered backend operation

| Field | Value |
|---|---|
| **Finding ID** | `DISC-027` |
| **Feature** | Admin console, employer ATS, blog, billing, enterprise platform |
| **Severity** | P1 — Critical — entire workflows can never succeed, yet the UI reports success (see DISC-028 … DISC-031) |
| **Legacy path:line** | backend routes existed for the legacy paths (e.g. `src/services/` called `/api/admin/support/tickets`, which the legacy Express app served) |
| **Modern path:line** | 30 call sites over 19 paths; full table in `FEATURE-DEPTH-EVIDENCE-REGISTER.md` §5 (detector: `parity-depth-checks.cjs` check 9) |
| **Backend dependencies** | 2 of 19 have a counterpart under a different prefix (`/admin/blog/posts`, `/admin/platform/status`); 1 renamed (`/coupons/validate`); 17 have none, verified by grep over `backend/` not only by the register |
| **Persistence / authorization** | persistence: none — the requests 404/405 before reaching a handler; authz: n/a (no handler runs); the *intended* handlers are RBAC-gated |
| **Reproduction** | `node developer-review/tools/parity-depth-checks.cjs` → check 9 lists 30 sites; `grep -rn "support/tickets" backend/` returns nothing |
| **Evidence levels** | L1 STATIC + L2 CALLCHAIN (call site → client helper → route inventory → grep). No L4: browser not available |
| **Affected workflow** | Suspend user, moderate employer application/job, purge DLQ, backup, cache-clear, reply to support ticket, delete blog post, validate coupon, load enterprise platform status, email candidate |
| **Impact** | Actions that appear to work silently do nothing: a suspended account stays active, a deleted post stays published, a promo code is always rejected, the enterprise BYOK panel never populates |
| **Remediation spec** | Register the missing routes or repoint the clients at the routes that exist (prefix + verb), then add a 404→error path in `api-client.ts` so a missing route cannot render as success |
| **Regression acceptance** | A Playwright spec per workflow asserts a non-2xx response surfaces an error state and leaves local state unchanged; `parity-depth-checks.cjs` check 9 returns 0 |
| **Closure** | Not met — audit is read-only; recorded for the repair backlog |
| **Confidence** | High — two independent artefacts (client call sites, backend grep) agree |
| **First raised** | Mandate 6, revision `a5835ff6` (branch head when V6 began) |


## [DISC-028] Recruiter "Message candidate" posts to a non-existent route and displays "Message Dispatched!"

| Field | Value |
|---|---|
| **Finding ID** | `DISC-028` |
| **Feature** | FP-F02 applicant pipeline — candidate email from the review drawer |
| **Severity** | P1 — Critical — a recruiter believes the candidate was emailed; nothing is sent, and no failure is visible |
| **Legacy path:line** | `SendMessageDialog.jsx` → backend notification endpoint (legacy app served `/api/notify/*`) |
| **Modern path:line** | `frontend/src/components/employer/CandidateReviewDrawer.tsx:159` `POST /notify/email` inside `.catch(() => {})`; success UI `:160-180`, `:699` |
| **Backend dependencies** | no `/notify/email` registration anywhere in `backend/`; only `/notify/user-signup` exists and is itself UNREACHABLE (`backend/index.js`, register) |
| **Persistence / authorization** | persistence: none — the email is never queued; the outbox is untouched; authz: n/a (no handler) |
| **Reproduction** | open employer portal → pipeline → candidate drawer → send message; watch network: 404, then the success modal |
| **Evidence levels** | L1 STATIC + L2 CALLCHAIN; the second `catch {` at `:176` sets `messageSuccess` too, so even a thrown error shows success |
| **Affected workflow** | Recruiter → candidate communication for interview invitations and follow-ups |
| **Impact** | Silent loss of candidate contact; the failure is indistinguishable from success |
| **Remediation spec** | Point at the real mail path (the `/email/*` router owns delivery) or the messaging service used by `lib/messages.ts`; remove both success paths on failure |
| **Regression acceptance** | Failure response → inline error, modal stays open, nothing claims dispatch; a spec covers 404 and network-error cases |
| **Closure** | Not met — read-only audit |
| **Confidence** | High |
| **First raised** | Mandate 6, revision `a5835ff6` (branch head when V6 began) |


## [DISC-029] Support help desk has no backend at all; tickets, replies and status changes are fabricated

| Field | Value |
|---|---|
| **Finding ID** | `DISC-029` |
| **Feature** | FP-A19 support / help-desk tickets |
| **Severity** | P1 — Critical — a support queue that never existed is presented to operators as live data |
| **Legacy path:line** | `src/components/admin/helpdesk/*` consumed `/api/admin/support/tickets*` served by the legacy app |
| **Modern path:line** | `AdminHelpDeskTab.tsx:47` `DEFAULT_TICKETS`, `:117` state seed, `:128` GET, `:135` `// Keep baseline`, `:157` reply POST, `:188` status PATCH; user side `use-api-hooks.ts:588/599/612` |
| **Backend dependencies** | zero registrations: `grep -rn "support/tickets" backend/` → no matches; no support router is mounted |
| **Persistence / authorization** | persistence: none; authz: n/a |
| **Reproduction** | open Admin → Support; the list renders with invented customers even offline; `curl /api/admin/support/tickets` → 404 |
| **Evidence levels** | L1 + L2 |
| **Affected workflow** | Customer support triage, replies, status transitions |
| **Impact** | Operators triage fabricated tickets and believe replies were sent; the candidate help centre is dead too |
| **Remediation spec** | Either build/restore the ticket API or retire the tab; until then the tab must show an explicit "unavailable" state |
| **Regression acceptance** | With the API absent the tab shows an error state and no ticket data; a spec asserts no fixture renders after a failed load |
| **Closure** | Not met |
| **Confidence** | High — absence proven by grep, fixtures proven by source |
| **First raised** | Mandate 6, revision `a5835ff6` (branch head when V6 began) |

**V7 revision (`8a6e03bb`) — headline and severity retracted.** "Support help desk has no backend at all"
is **false**. `backend/routes/support.js` registers eight ticket operations and mounts twice
(`/api/support` at `index.js:514`, `/api/admin/support` at `:6925`); `use-api-hooks.ts:585-620` and
`AdminHelpDeskTab.tsx:128/157/188` all resolve. The "zero registrations / no support router is mounted"
evidence was produced by a scanner that only recognises a router named `router` (DISC-041).

What survives, at **P3 not P1**: the tab still seeds `DEFAULT_TICKETS` (`:47`) and both the loader guard
(`res.tickets.length > 0`) and the `catch { /* Keep baseline */ }` (`:135`) keep those fixtures on screen
when the real list is empty or the read fails — recorded as **DISC-047**. The user-side help centre is
functional. No application defect of the original severity exists.


## [DISC-030] Moderation queue is a fixture and both decisions target unregistered routes

| Field | Value |
|---|---|
| **Finding ID** | `DISC-030` |
| **Feature** | FP-A11 employer application + job moderation |
| **Severity** | P1 — Critical — abuse moderation decisions are never applied, while the operator is told they were verified |
| **Legacy path:line** | `src/components/admin/moderation/*` → real moderation endpoints |
| **Modern path:line** | `AdminModerationTab.tsx:58/108` `DEFAULT_APPLICATIONS`/`DEFAULT_JOBS`, `:152/167` `POST /admin/employer-applications/{id}/verify`, `:184` `POST /admin/jobs/{id}/moderate`, each `.catch(() => {})` then success |
| **Backend dependencies** | `PATCH /admin/employer-applications/:uid` (`backend/index.js:6440`) and `resilientMutations.moderateJob/moderateCompany` (`:6875/6899`) exist; the called verbs/paths do not |
| **Persistence / authorization** | persistence: none; authz: intended handlers are permission-gated; the called paths have no handler |
| **Reproduction** | Admin → Moderation → approve an application: row turns APPROVED, network shows 404 |
| **Evidence levels** | L1 + L2 |
| **Affected workflow** | Fraudulent-employer and spam-job moderation |
| **Impact** | Bad actors stay live; the log of "verified" decisions exists only in React state |
| **Remediation spec** | Repoint to `PATCH /admin/employer-applications/:uid` and the moderation mutation endpoints; fetch the queue from the server instead of seeding it |
| **Regression acceptance** | Decision endpoints return 2xx and the row state is re-read from the server; failure keeps the row unchanged |
| **Closure** | Not met |
| **Confidence** | High |
| **First raised** | Mandate 6, revision `a5835ff6` (branch head when V6 began) |

**V7 confirmation (`8a6e03bb`), with two details added.** V7 re-derived both sides independently
(`tools/client-contract-audit.cjs`) and confirms this finding, adding:

1. **The payload would be rejected even if the path were right.** The client sends
   `{decision:'APPROVED'|'REJECTED'}` and `{isSpam, status:'flagged'}`; the real handler accepts
   `{status:'approved'|'rejected'|'active', expectedStatus, reason}` and, for jobs, *exactly one* of
   `{status}` or `{isFeatured}` with `status ∈ active|pending|inactive|archived` (`'flagged'` is not one
   of them). A path-only fix would still fail with `400`.
2. **The tab has no read path at all.** It imports only `post`; `DEFAULT_APPLICATIONS` (`:58`) and
   `DEFAULT_JOBS` (`:81`) are the only sources of data, so even a successful decision would be applied to
   a record the operator cannot verify exists. Both GET operations exist and are reachable
   (`/api/admin/employer-applications` at `backend/index.js:6279`, `/api/admin/jobs` at `:6300`).

DISC-042 and DISC-046 were raised separately before this cross-check and are **merged into this entry**;
their IDs are retained as stubs so no citation breaks.


## [DISC-031] User manager renders fabricated accounts when the API fails, and the status toggle targets a missing route

| Field | Value |
|---|---|
| **Finding ID** | `DISC-031` |
| **Feature** | FP-A17 user manager / User360 |
| **Severity** | P1 — Critical — an outage shows plausible fake accounts (including email addresses) as real users |
| **Legacy path:line** | `src/components/admin/UserManagement/*` loaded from `/api/admin/users` only (no seeded fallback) |
| **Modern path:line** | `AdminUsersTab.tsx:68` `DEFAULT_USERS` (fixtures `usr_001 alex.rivera@example.com`), `:142` initial `useState`, `:176` GET, `:179` `catch {` (no state reset), `:206` `POST /admin/users/{id}/status` + `.catch(() => {})` + success |
| **Backend dependencies** | `GET /admin/users` and `PATCH /admin/users/:id` are registered; `/admin/users/{id}/status` is not |
| **Persistence / authorization** | persistence: none for the toggle; the fixture list is not persisted anywhere; authz: PATCH is RBAC-gated; the called route has no handler |
| **Reproduction** | block `/api/admin/users` in devtools → reload Admin → Users: the fake table renders; toggle a user → success, no server call |
| **Evidence levels** | L1 + L2 |
| **Affected workflow** | User administration, suspension, verification |
| **Impact** | Fabricated identities in an admin table; suspension never applied (overlaps DISC-026) |
| **Remediation spec** | Initialise state to empty + loading, clear on error and render an error panel; call `PATCH /admin/users/:id` for status |
| **Regression acceptance** | Failed load → error state, zero rows; status change fails visibly; spec covers both |
| **Closure** | Not met |
| **Confidence** | High |
| **First raised** | Mandate 6, revision `a5835ff6` (branch head when V6 began) |


## [DISC-032] Employer portal messaging is component state only; the real messaging stack is unused on the employer side

| Field | Value |
|---|---|
| **Finding ID** | `DISC-032` |
| **Feature** | FP-F03 employer candidate messaging |
| **Severity** | P2 — High — recruiter↔candidate conversations are lost on reload and never reach the candidate |
| **Legacy path:line** | `EmployerCandidateMessages.jsx` + `SendMessageDialog.jsx` (server-backed) |
| **Modern path:line** | `pages/employer/portal.tsx:145-185` three hardcoded threads; `:233-247` `setCandidateThreads` only |
| **Backend dependencies** | `/messages/conversations*` and `/messages/send` are registered and used by `lib/messages.ts` → `pages/dashboard/messages.tsx` |
| **Persistence / authorization** | persistence: none; authz: the real endpoints are auth-scoped; unused here |
| **Reproduction** | send a message in the employer portal, reload: the message is gone |
| **Evidence levels** | L1 + L2 |
| **Affected workflow** | Recruiter conversation history |
| **Impact** | Apparent replies that never existed; auditability of recruiter contact is lost |
| **Remediation spec** | Wire the portalled tab to `lib/messages.ts` (the candidate implementation already proves the client works) |
| **Regression acceptance** | Message survives reload and appears for the candidate; spec drives the tab through `messages.ts` |
| **Closure** | Not met |
| **Confidence** | High |
| **First raised** | Mandate 6, revision `a5835ff6` (branch head when V6 began) |


## [DISC-033] Employer Team Seats screen is local state: invites "succeed" without a request

| Field | Value |
|---|---|
| **Finding ID** | `DISC-033` |
| **Feature** | FP-F06 company profile + team seats |
| **Severity** | P2 — High — seat provisioning appears to work but grants no access |
| **Legacy path:line** | `src/components/EmployerPortal/*` seat management against `/api/enterprise/teams` |
| **Modern path:line** | `TeamSeats.tsx:36` `INITIAL_TEAM`, `:74` state seed, invite modal appends to state and shows `inviteSuccess`; no HTTP call in the file |
| **Backend dependencies** | `/enterprise/teams` + `/enterprise/memberships` registered and used by the enterprise surface (`EnterpriseTeamsTab`/`WorkspacesTab`) |
| **Persistence / authorization** | persistence: none; authz: real routes are permission-gated (`workspace.members.manage`) |
| **Reproduction** | Admin → Employer portal → Team → invite a colleague: the row appears, reload removes it |
| **Evidence levels** | L1 |
| **Affected workflow** | Team seat provisioning / RBAC grants |
| **Impact** | Nobody is invited; the seat list is fiction; overlaps DISC-034 (teams member management removed) |
| **Remediation spec** | Route seat changes through `enterpriseApi` membership mutations and render server state |
| **Regression acceptance** | Invite creates a membership row visible after reload; failure surfaces an error |
| **Closure** | Not met |
| **Confidence** | High |
| **First raised** | Mandate 6, revision `a5835ff6` (branch head when V6 began) |


## [DISC-034] Team member management (list/add/remove) removed from the enterprise teams tab while its API survives

| Field | Value |
|---|---|
| **Finding ID** | `DISC-034` |
| **Feature** | FP-B05 teams + archive/restore |
| **Severity** | P2 — High — an administrative capability disappeared with no retirement decision and no equivalent |
| **Legacy path:line** | `src/enterprise/components/EnterpriseTeamsTab.jsx:9-145` `WorkspaceMembersDrawer` equivalent: GET `:13`, add `:36`, remove-with-confirm `:62`, permission `:12` |
| **Modern path:line** | `EnterpriseTeamsTab.tsx` has no drawer and no member call; only `t.memberCount` `:223` |
| **Backend dependencies** | `GET/POST/DELETE /enterprise/teams/{id}/members` registered (`backend/routes/enterprise.js:720/729/738`) and **UNREACHABLE** from every modern client |
| **Persistence / authorization** | persistence: n/a (no client); authz: `workspace.members.manage` / `tenant.members.manage` still enforced server-side |
| **Reproduction** | open Enterprise → Teams: no way to see or change who is on a team |
| **Evidence levels** | L1 + L2 |
| **Affected workflow** | Team assignment for RBAC |
| **Impact** | Teams can be created and archived but not staffed from the UI |
| **Remediation spec** | Restore the member drawer (or equivalent) against the existing endpoints |
| **Regression acceptance** | List/add/remove round-trips and survives reload; removing the last member is blocked with the server message |
| **Closure** | Not met |
| **Confidence** | High |
| **First raised** | Mandate 6, revision `a5835ff6` (branch head when V6 began) |


## [DISC-035] Audit trail narrowed to the newest 100 events; JSON export and deep links removed

| Field | Value |
|---|---|
| **Finding ID** | `DISC-035` |
| **Feature** | FP-B08 enterprise audit |
| **Severity** | P2 — High — a compliance surface silently truncates and cannot be reproduced or shared |
| **Legacy path:line** | `EnterpriseAuditTab.jsx:128-142` server filters + cursor, `:140/159/165` Load more, `:174-178` JSON export, `:184-200` deep link |
| **Modern path:line** | `EnterpriseAuditTab.tsx:42` single `limit:100`, `:55-63` client-side filter, `:85-92` CSV only |
| **Backend dependencies** | `GET /enterprise/audit` supports `cursor, severity, action, actor, since, until` (`backend/routes/enterprise.js:652-662`) — unused by the client |
| **Persistence / authorization** | persistence: read-only; authz: `tenant.audit.read` |
| **Reproduction** | filter for an event older than the newest 100: it never appears; no way to export JSON or link the view |
| **Evidence levels** | L1 + L2 |
| **Affected workflow** | Security review / SIEM export |
| **Impact** | Completeness gap invisible to the operator; exported CSV is a subset with no indication |
| **Remediation spec** | Use server-side filters + cursor pagination; restore JSON export and URL-encoded filter state |
| **Regression acceptance** | Paging past 100 works; export count equals the matched total; deep link reproduces the filter set |
| **Closure** | Not met |
| **Confidence** | High |
| **First raised** | Mandate 6, revision `a5835ff6` (branch head when V6 began) |


## [DISC-036] 100 template ids are generated from 5 structural archetypes; 51 bespoke layouts and 4 cover templates are gone

| Field | Value |
|---|---|
| **Finding ID** | `DISC-036` |
| **Feature** | FP-E02 template catalogue |
| **Severity** | P2 — High — the catalogue claims 100 designs and delivers 5 structures × 19 families |
| **Legacy path:line** | `src/cv-templates/` 51 `cvN` dirs + `cover1..4`, 55 `.scss`, 13,041 JSX / 19,655 SCSS lines |
| **Modern path:line** | `template-catalog.ts` 100 entries → 5 archetypes (26/21/20/20/13); `template-layouts.ts:155-161` 19 families; `:233` 6 `SPECIAL_SPECS`; 3,254 template lines total |
| **Backend dependencies** | n/a (rendering is client-side) |
| **Persistence / authorization** | persistence: n/a; authz: n/a |
| **Reproduction** | select "Cv7" and "Cv19": identical structure and family pool membership; `SPECIAL_SPECS` covers 6 ids |
| **Evidence levels** | L1 (parsed catalogue + `wc -l`) |
| **Affected workflow** | Resume design variety and ATS-safe alternatives |
| **Impact** | Visual differentiation between 100 "templates" is largely typographic; users who bought into a 100-template catalogue get 5 layouts; cover letters left the catalogue |
| **Remediation spec** | Either publish the real count (archetypes × families) or restore bespoke layouts for the ids that had them |
| **Regression acceptance** | Catalogue metadata distinguishes structure per id, or the UX states the archetype/family pairing honestly |
| **Closure** | Not met |
| **Confidence** | High — counts are generated from source, not estimated |
| **First raised** | Mandate 6, revision `a5835ff6` (branch head when V6 began) |


## [DISC-037] Eight email-administration subfeatures are unexposed in the UI while their endpoints remain server-only

| Field | Value |
|---|---|
| **Finding ID** | `DISC-037` |
| **Feature** | FP-A16 SMTP/IMAP + template settings |
| **Severity** | P2 — High — operators cannot configure inbound mail, toggle transactional emails, preview them, or read bounce logs |
| **Legacy path:line** | `EmailSmtpSettings.jsx` (1,839 lines) 5 tabs: `smtp, imap, templates, logs, deliverability` (`:29`), IMAP `:52-68`, ~20 template toggles `:69-92`, preview device modes `:100-104` |
| **Modern path:line** | `AdminEmailSmtpTab.tsx` (348 lines): settings, save-smtp, test-connection, deliverability only (`:75-114`) |
| **Backend dependencies** | all present but unexposed: `POST /email/admin/test-imap` `email.js:1930`, `GET/POST /email/templates` `:2087-2088`, `POST /email/admin/save-template-customization` `:1515`, `/admin/custom-templates` `:1516`, `GET /email/logs` `:2034`, `/email/resend`, `circuit-breaker-status` `:1420`, `reset-circuit-breaker` `:1433` |
| **Persistence / authorization** | persistence: server-side settings persist; the UI cannot reach them; authz: admin/superadmin gates on the email router |
| **Reproduction** | open Admin → Settings → Email: no IMAP block, no template list, no logs |
| **Evidence levels** | L1 + L2 (register cross-check) |
| **Affected workflow** | Transactional email operations (deliverability, template changes, inbound sync) |
| **Impact** | Regression from parity of operation, not of naming: mail configuration can only be changed via the API |
| **Remediation spec** | Restore the five-tab surface against the existing routes (all are already implemented and permission-gated) |
| **Regression acceptance** | Each of the 8 operations is invoked by the UI; register classifies them UI-REACHABLE |
| **Closure** | Not met |
| **Confidence** | High |
| **First raised** | Mandate 6, revision `a5835ff6` (branch head when V6 began) |


## [DISC-038] Voice interview mode removed entirely: 2,432 lines of speech/audio code, zero replacement

| Field | Value |
|---|---|
| **Finding ID** | `DISC-038` |
| **Feature** | FP-G21 AI interview coach |
| **Severity** | P2 — High — a distinct practice modality disappeared; the capability row was marked FULL |
| **Legacy path:line** | `LiveVoiceEngine.js` 233 (voice ranking `:118`, chunked `speak` `:148-209`), `LiveAudioWaveform.jsx` 254, `LiveInterviewSession.jsx` 1,691, `hooks/useInterviewMedia.js` 254 |
| **Modern path:line** | `pages/dashboard/interview-coach.tsx` text-only; `lib/interview-coach.ts` has no audio path; `SpeechRecognition|MediaRecorder|getUserMedia|speechSynthesis|AudioContext` → **0 hits** in `frontend/src` |
| **Backend dependencies** | unchanged (`/generate-interview`, `/live-interview/sessions*` are text-based) |
| **Persistence / authorization** | persistence: sessions persist; audio never existed server-side; authz: n/a |
| **Reproduction** | open Interview Coach: no microphone control, no playback, no waveform |
| **Evidence levels** | L1 + grep census |
| **Affected workflow** | Spoken mock interview practice |
| **Impact** | Users cannot rehearse speaking; text-only practice is not behaviourally equivalent |
| **Remediation spec** | Re-implement capture/playback (Web Speech API + MediaRecorder) or record the retirement decision explicitly |
| **Regression acceptance** | Audio mode present with permission handling and a transcript; or `INTENTIONAL RETIREMENT` with a documented rationale |
| **Closure** | Not met |
| **Confidence** | High |
| **First raised** | Mandate 6, revision `a5835ff6` (branch head when V6 began) |


## [DISC-039] Blog editor downgraded from TipTap rich text to a Markdown textarea; the entire blog data path is unregistered

| Field | Value |
|---|---|
| **Finding ID** | `DISC-039` |
| **Feature** | FP-G09 blog authoring + public blog |
| **Severity** | P2 — High — authors lose tables, images, colour, alignment and previews, and no blog request can succeed |
| **Legacy path:line** | `BlogEditor.jsx` 1,631 lines, 12 TipTap extensions (Table, Image, Color, Highlight, Underline, TextAlign…) `:3-15`, cover image, tag picker, sanitisation |
| **Modern path:line** | `pages/blog/editor.tsx` 461 lines: `<textarea>` "Markdown syntax supported" `:268, :290-293`, second `<textarea>` `:352` |
| **Backend dependencies** | `/blog-data*` and `/admin/blog/posts*` are registered; every modern call uses `/blog/posts*` (unregistered) → see DISC-027 |
| **Persistence / authorization** | persistence: none reachable (404); authz: intended routes are gated; called paths have no handler |
| **Reproduction** | create a post: the editor is plain text; save → 404 |
| **Evidence levels** | L1 + L2 |
| **Affected workflow** | Content authoring and publishing |
| **Impact** | Rich authoring is gone and the feature is non-functional end to end |
| **Remediation spec** | Restore a rich-text editor and correct the client prefix to `/admin/blog/posts` / `/blog-data` |
| **Regression acceptance** | Tables/images/colour survive save+reload; publish path returns 2xx |
| **Closure** | Not met |
| **Confidence** | High |
| **First raised** | Mandate 6, revision `a5835ff6` (branch head when V6 began) |


## [DISC-040] Legacy download helpers (PDF/DOCX) have no recorded disposition in the share and job-editor rows

| Field | Value |
|---|---|
| **Finding ID** | `DISC-040` |
| **Feature** | FP-E08 share surface, FP-F05 job editor |
| **Severity** | P3 — Medium — possible capability loss hidden by broad legacy attribution, not yet provable either way |
| **Legacy path:line** | `downloadResumePdf` / `downloadResumeDocx` / `exportDownloader` inside `src/components/BuildResume` and `src/components/EmployerPortal` |
| **Modern path:line** | share modal has copy-link + publication toggle; resume export lives in `pages/export/*` and `/export-docx` |
| **Backend dependencies** | `/export-docx`, `/export-pdf` registered and reachable from the export pages |
| **Persistence / authorization** | persistence: n/a; authz: resume ownership checks on the export endpoints |
| **Reproduction** | `node developer-review/tools/parity-depth-checks.cjs` → check 10 lists FP-E08/FP-F05 with no disposition text |
| **Evidence levels** | L1 + detector lead (not adjudicated to a defect) |
| **Affected workflow** | Share-then-download, job post export |
| **Impact** | Unknown: the export capability exists, but which surface owned it in legacy is ambiguous in the inventory |
| **Remediation spec** | Either record the disposition in the rows or drop the helper attribution from those capabilities |
| **Regression acceptance** | Each row states where download lives or that it was retired |
| **Closure** | Open — deliberately left as a lead |
| **Confidence** | Low — attribution ambiguity, not a proven regression |
| **First raised** | Mandate 6, revision `a5835ff6` (branch head when V6 began) |


## [DISC-041] The reachability register never scanned a router that is not named `router` — 8 live operations and 6 "missing" client paths were audit artefacts

| Field | Value |
|---|---|
| **Finding ID** | `DISC-041` |
| **Feature** | Audit package: `BACKEND-OPERATION-REACHABILITY.md`, `client-call-existence.cjs`, DISC-025, metric M19 |
| **Severity** | P1 — Critical for audit integrity. Six operations reported as non-existent are in production code and serve the support console; every downstream number (385 operations, 152 UI-reachable, 41.3 % live path, "23 dead client paths") inherited the omission |
| **Legacy path:line** | n/a (tooling) |
| **Modern path:line** | `backend/routes/support.js:15,30,40,54,71,81,95,110`; mounts `backend/index.js:514` (`/api/support`) and `:6925` (`/api/admin/support`) |
| **Backend dependencies** | eight ticket operations, `services/supportTickets`, `req.user.uid` scoping |
| **Persistence / authorization** | MariaDB-backed outbox/repo through `services/supportTickets`; user routes scoped to the caller's uid, admin routes behind the admin mount |
| **Reproduction** | `node developer-review/tools/backend-reachability.cjs` on the pre-V7 tool → `grep -c tickets Evidence/artifacts/backend-operations.tsv` = 0. Then `node developer-review/tools/client-contract-audit.cjs` (independent parser) → 8 registrations from `routes/support.js`, 0 overlap with the register |
| **Evidence levels** | L1 (source) + tool cross-comparison |
| **Affected workflow** | Support ticketing (candidate and admin), and every metric derived from the operation register |
| **Impact** | DISC-025 wrongly reported six live ticket endpoints as non-existent (`support/tickets 0 hits` was true only of the scanner); `FP-G24` was dropped from FULL to MISSING on that basis; M19's denominator and numerator were both wrong |
| **Remediation spec** | Resolve receivers from `const <name> = express.Router()`, map each receiver to its exported name through `module.exports`, apply *every* mount prefix for that name, de-duplicate prefixes before counting. Same fix applied to `tools/reachability-crosscheck.cjs` (leading-slash anchor + all matching lines, not the first) |
| **Regression acceptance** | `backend-reachability.cjs` reports 397 registrations / 393 unique; all 8 ticket operations present in the TSV; cross-check 393/393 agreements, 0 disagreements; contract-parser vs register agreement `onlyInRegister` = 0 with the 8 ticket rows in `shared` |
| **Closure** | **Met for the tool.** Not met for the application: the ticket *console* still keeps fixtures on an empty inbox (DISC-048) |
| **Confidence** | High — two independent parsers, one written after the defect was found, both reading the same 3,806 files |
| **First raised** | Mandate 7, revision `8a6e03bb` |

**Why this is a finding and not a correction note:** the mandate's rule is that a route definition is not
evidence of parity — but the inverse also applies. Calling an operation non-existent because one scanner
did not see it produced a *false defect* (FP-G24 MISSING, DISC-025 rows 6–11) and a *false assurance*
elsewhere (176 UNREACHABLE looked more separate from the UI than it is). Both directions are now bounded by
two parsers that must agree.

**Not claimed:** this is not evidence that the ticket UI works at runtime. Static registration, a live call
site and a consumed hook do not prove that a ticket can be created against a real MariaDB instance; that
remains blocked (see `RUNTIME-TEST-HARNESS-M7.md`).

---

## [DISC-042] MERGED INTO DISC-030 — Admin moderation writes to endpoints that do not exist while equivalent REST operations do

| Field | Value |
|---|---|
| **Finding ID** | `DISC-042` — **status: merged** (canonical entry: `DISC-030`). Not counted as a separate finding in the V7 tally. |
| **Feature** | FP-A20 marketplace moderation (employer verification, job spam gating) |
| **Severity** | P1 — Critical. An administrator approves or rejects an employer, or flags a spam job, and is told it succeeded; the record is unchanged and the employer never gains or loses access |
| **Legacy path:line** | n/a — V5/V7 modern defect; the legacy admin surface is the comparison baseline |
| **Modern path:line** | `AdminModerationTab.tsx:152` and `:167` (`POST /admin/employer-applications/{id}/verify`), `:184` (`POST /admin/jobs/{id}/moderate`) |
| **Backend dependencies** | `PATCH /api/admin/employer-applications/:uid` (`backend/index.js:6440`), `PATCH /api/admin/jobs/:jobId` (`backend/index.js:6886`) |
| **Persistence / authorization** | both PATCH handlers are audited, concurrency-guarded (`409 ADMIN_TARGET_CHANGED`), and the employer one writes Firebase custom claims + revokes refresh tokens |
| **Reproduction** | `node developer-review/tools/client-contract-audit.cjs --verbose` → `/admin/employer-applications/{X}/verify` and `/admin/jobs/{X}/moderate` as `NO_REGISTERED_OPERATION`, both flagged `successAfter=true` |
| **Evidence levels** | L1 |
| **Affected workflow** | Employer onboarding approval, spam moderation |
| **Impact** | Two distinct failures in one control: the request 404s, `.catch(() => {})` hides it, local state flips, and a success toast is shown. The payloads also would not have been accepted: `{decision:'APPROVED'}` vs the API's `{status:'approved'}`, and `status:'flagged'` is not in the status allowlist |
| **Remediation spec** | Retarget to `PATCH` with the server's payload contract and optimistic-concurrency fields; remove `.catch(() => {})`; on failure show the server message and reload the row |
| **Regression acceptance** | A rejected approval leaves the row PENDING and shows an error; a `409 ADMIN_TARGET_CHANGED` reloads the row; no toast asserts success unless the response is 2xx |
| **Closure** | Not met |
| **Confidence** | High — both sides read, verdict supported by the independent contract parser |
| **First raised** | Mandate 7, revision `8a6e03bb` |

**Relationship to DISC-026:** DISC-026 recorded four fabricated admin controls. This finding records two more
of the same shape, and corrects the *diagnosis* for the whole class: in most cases the backend capability
exists (the client is calling the wrong contract), so the repair is a client retarget — except for backup,
cache-clear and dead-letter purge, where nothing exists server-side at all.

---

## [DISC-043] The public job board calls `GET /api/jobs`, an operation that does not exist; the real public listing is `/api/jobs-data`

| Field | Value |
|---|---|
| **Finding ID** | `DISC-043` |
| **Feature** | FP-F10 job search / listing |
| **Severity** | P1 — Critical for the public product surface: the job board's only data call 404s, so the page cannot show a single listing |
| **Legacy path:line** | `src/components/JobsListings/*` (fetched the same listing) |
| **Modern path:line** | `frontend/src/pages/jobs/portal.tsx:74` — `get('/jobs?' + params)` with `baseURL '/api'` |
| **Backend dependencies** | `GET /api/jobs-data` (`backend/routes/jobsData.js:159`), mounted at `backend/index.js:515`; public-only scoping and `isPubliclyVisibleJob` applied server-side |
| **Persistence / authorization** | MariaDB via `req.repository.getJobs(filters)`; employer inventory only when `employerId` is the caller's own uid, otherwise `publicOnly` |
| **Reproduction** | `node developer-review/tools/client-call-existence.cjs` → `MISSING GET /jobs`; `grep -n "app.get('/api/jobs'" backend/index.js` → no match; `routes/jobsData.js:159` is the only public listing |
| **Evidence levels** | L1 |
| **Affected workflow** | Job discovery for candidates |
| **Impact** | The page's error path is shown instead of listings; combined with DISC-025 row 1 (the filter UI also lost most filters) the capability is not merely broken, it is unreachable |
| **Remediation spec** | Point the portal at `GET /api/jobs-data`, keep the existing query-parameter contract, and restore the legacy filter set (see FP-F10 loss note) |
| **Regression acceptance** | `/jobs` renders only publicly-visible jobs returned by the API; an employer-scoped call without ownership returns 403 and is surfaced |
| **Closure** | Not met |
| **Confidence** | High |
| **First raised** | Mandate 7, revision `8a6e03bb` |

---

## [DISC-044] Employer→candidate email has no backend route, and the service that would send it is orphaned

| Field | Value |
|---|---|
| **Finding ID** | `DISC-044` |
| **Feature** | FP-F11 candidate review / rejection messaging |
| **Severity** | P2 — High. Rejection still persists (status PATCH works), so the workflow is not lost, but the candidate is never told |
| **Legacy path:line** | legacy employer portal notified the candidate on status change |
| **Modern path:line** | `frontend/src/components/employer/CandidateReviewDrawer.tsx:159` — `POST /notify/email` |
| **Backend dependencies** | none. `/api/notify/*` client dispatches are retired to `410 CLIENT_NOTIFICATION_DISPATCH_RETIRED` (`backend/index.js:419-424`, `:7203`); `/api/notify/email` is not even in that set, so the request falls through to the zero-trust policy with no handler. `services/emailNotifier.js` is imported at `backend/index.js:14` and **never called** anywhere in `backend/` |
| **Persistence / authorization** | notification outbox (`services/notificationOutbox.js`) exists and is used by auth-token and enterprise flows only |
| **Reproduction** | `grep -rn "EmailNotifier\." backend/index.js` → 0; `grep -rn "notify/email" backend/routes backend/index.js` → only the retired-set variants |
| **Evidence levels** | L1 |
| **Affected workflow** | Rejection feedback to candidates |
| **Impact** | The failure is invisible: the call is swallowed *and* the outer `catch` at `:176-180` also sets `messageSuccess`, so the drawer always reports "Message Dispatched!" (this confirms DISC-028's reading, which a first pass of this audit got wrong and corrected here). Nothing is delivered, no outbox row is written, and the comment "Fallback: log notification to application record" describes a fallback that does not exist |
| **Remediation spec** | Either implement a server-side transition notification (status change enqueues an outbox email) or remove the client call and state plainly that messaging goes through in-app messages |
| **Regression acceptance** | Rejecting an application produces exactly one outbox row for the candidate, and the UI reports success only after the server accepts it |
| **Closure** | Not met |
| **Confidence** | High for the absent route; Medium for "the capability was removed" — no decision record exists, so this is `UNVERIFIED` as an intentional retirement |
| **First raised** | Mandate 7, revision `8a6e03bb` |

---

## [DISC-045] Checkout validates coupons against a non-existent endpoint, then applies hardcoded promo codes locally

| Field | Value |
|---|---|
| **Finding ID** | `DISC-045` |
| **Feature** | FP-A24 billing / checkout |
| **Severity** | P2 — High. The displayed price can differ from the charged price, and checkout fails for any code that is not in the server's coupon table |
| **Legacy path:line** | coupon entry existed in the legacy checkout |
| **Modern path:line** | `frontend/src/pages/billing/checkout-modal.tsx:246` (`POST /api/billing/validate-coupon`), `:255-264` (hardcoded `SAVE20` / `WELCOME50` / `PROMO10` / `LAUNCH100`) |
| **Backend dependencies** | `POST /api/coupons/validate` (`backend/index.js:4597`); order creation re-validates through `paymentActivation.applyServerCoupon` (`:71-101`) |
| **Persistence / authorization** | server recomputes the amount; client-supplied amounts are rejected outright (`CLIENT_PAYMENT_IDENTITY_REJECTED`, `:1177-1180`) |
| **Reproduction** | `node developer-review/tools/client-contract-audit.cjs --verbose` → `/api/billing/validate-coupon` `NO_REGISTERED_OPERATION`; `grep -n "coupons/validate" backend/index.js` → `:4597` |
| **Evidence levels** | L1 |
| **Affected workflow** | Discount application and checkout |
| **Impact** | Two paths: (a) a real coupon is never validated client-side, so the UI shows no discount even when the server would grant one; (b) a hardcoded code shows a discount, then order creation returns `400 INVALID_COUPON` and the purchase fails with an error. **No free or discounted order is obtainable** — the server recomputes and rejects unknown codes — so this is a pricing-integrity and UX defect, not a payment bypass |
| **Remediation spec** | Call `/coupons/validate`; delete the hardcoded constants; render the server's `discount` in the price breakdown |
| **Regression acceptance** | An unknown code shows no discount and an error before submission; a valid code shows the server-calculated amount and the created order returns the same amount |
| **Closure** | Not met |
| **Confidence** | High |
| **First raised** | Mandate 7, revision `8a6e03bb` |

---

## [DISC-046] MERGED INTO DISC-030 — The moderation tab renders fixture records and never reads the backend

| Field | Value |
|---|---|
| **Finding ID** | `DISC-046` — **status: merged** (canonical entry: `DISC-030`). Not counted as a separate finding in the V7 tally. |
| **Feature** | FP-A20 marketplace moderation |
| **Severity** | P1 — Critical. Employer applications and jobs shown to a moderator are invented (`app_101 Nexus AI Robotics GmbH`, fabricated tax IDs); none of the decisions affect the records they appear to describe |
| **Legacy path:line** | legacy admin moderation read from the API |
| **Modern path:line** | `frontend/src/components/admin/AdminModerationTab.tsx:58` (`DEFAULT_APPLICATIONS`), `:81` (`DEFAULT_JOBS`); the file imports only `post` from `@/lib/api-client` — `get` count is 0 |
| **Backend dependencies** | `GET /api/admin/employer-applications` (`backend/index.js:6279`) and `GET /api/admin/jobs` (`:6300`) both exist, are registered and are reachable, and are never called by this tab |
| **Persistence / authorization** | the write handlers behind the equivalent PATCH operations are audited and concurrency-guarded |
| **Reproduction** | `grep -c "get<\|get(" frontend/src/components/admin/AdminModerationTab.tsx` → 0; `grep -c "^const DEFAULT_" …` → 2 |
| **Evidence levels** | L1 |
| **Affected workflow** | Employer verification queue, spam gating |
| **Impact** | This is the strongest form of the MOCK class: not a fallback after a failed read, but a surface with no read at all. A moderator cannot see a real pending employer application through this tab even if one exists |
| **Remediation spec** | Load both queues from their GET operations, delete the fixtures, and keep an explicit empty state |
| **Regression acceptance** | With a database containing one pending application, the tab shows exactly that application; with an empty database it shows an empty state, never invented rows |
| **Closure** | Not met |
| **Confidence** | High |
| **First raised** | Mandate 7, revision `8a6e03bb` |

---

## [DISC-047] An empty support inbox still displays fixture tickets

| Field | Value |
|---|---|
| **Finding ID** | `DISC-047` |
| **Feature** | FP-G24 support console |
| **Severity** | P3 — Medium. No data is lost or wrongly changed, but support staff can be shown tickets that do not exist |
| **Modern path:line** | `frontend/src/components/admin/AdminHelpDeskTab.tsx:128-137` — the loader only replaces state when `res.tickets.length > 0`; the catch keeps the baseline (`/* Keep baseline */`), and the initial state is a fixture list at `:47` |
| **Backend dependencies** | `GET /api/admin/support/tickets` (`backend/routes/support.js:71`) — registered and working |
| **Persistence / authorization** | `services/supportTickets.listTicketsForStaff`, staff-scoped |
| **Reproduction** | Read `:126-138`; the `length > 0` guard means a legitimately empty result leaves `DEFAULT_TICKETS` on screen |
| **Evidence levels** | L1 |
| **Affected workflow** | Support triage |
| **Impact** | The console cannot distinguish "no tickets" from "load failed", and shows fabricated conversations with fabricated customer names in both cases |
| **Remediation spec** | Treat an empty array as data, drop the fixture default, render an explicit empty/error state |
| **Regression acceptance** | Empty database → empty state; failed read → error state; neither shows invented tickets |
| **Closure** | Not met |
| **Confidence** | High |
| **First raised** | Mandate 7, revision `8a6e03bb` |

---

## [DISC-048] The resume photo upload accepts 5 MB into a request body the API caps at 256 KB

| Field | Value |
|---|---|
| **Finding ID** | `DISC-048` |
| **Feature** | FP-E06 photo upload, FP-E01 resume save |
| **Severity** | P2 — High. A user can attach a photo the product says is acceptable and never be able to save the resume with it; the failure arrives as a generic save error |
| **Modern path:line** | `frontend/src/pages/dashboard/resume-builder.tsx:2604` (5 MB guard) → base64 data URL stored in `heading.photo` (`:2600-2612`) → `handleSave` POSTs the whole resume (`:637-661`) |
| **Backend dependencies** | `express.json({ limit: '256kb' })` for every route except `/api/stripe-webhook` (`backend/index.js:316`) |
| **Persistence / authorization** | resume PATCH is ownership-scoped; the body limit applies before the handler |
| **Reproduction** | arithmetic from source: a 300 KB JPEG becomes ~400 KB base64, which exceeds 262,144 bytes once wrapped in JSON. Not executed at runtime (no server/database in this environment) — `RUNTIME-TEST-HARNESS-M7.md` R-05 |
| **Evidence levels** | L1 (static) / **no runtime evidence** |
| **Affected workflow** | Resume builder with photo |
| **Impact** | Payload rejection (`413`) surfaces through `normalizeError` as a save failure; autosave then retries a body that can never fit. The advertised 5 MB limit is unreachable by roughly an order of magnitude |
| **Remediation spec** | Either downscale client-side to fit the body budget, or use a presigned upload and store a URL |
| **Regression acceptance** | A 4 MB source image saves successfully, or the UI refuses it at the true limit with a message naming the limit |
| **Closure** | Not met; runtime confirmation outstanding |
| **Confidence** | Medium-High — the two limits and the code path are read directly; the exact failure status is inferred, not observed |
| **First raised** | Mandate 7, revision `8a6e03bb` |

## [DISC-049] M7's provenance claim is false in two ways, and the ref it says preserves the foreign commit does not exist

| Field | Value |
|---|---|
| **Finding ID** | `DISC-049` |
| **Feature** | Audit package provenance (no application behaviour affected) |
| **Severity** | P3 — Medium. Nothing is lost; a published provenance claim is wrong, and a promised preservation mechanism is absent |
| **Raised by** | Mandate 8 §2 at revision `a2ecb96d2b194df25d5cd8ce2ece23ef65068fd9` |
| **Published claim** | `M7-CAPABILITY-CLOSURE.md:7` and `FINAL-AUDIT-HANDOVER.md:152`: the foreign commit `a7d08a2` "was proven byte-identical to `8a6e03bb` for all 3,806 tracked files and was preserved at `refs/audit-preserved/base-a7d08a2`" |
| **Measurement 1 — identity** | `git diff a7d08a2 8a6e03bb` → **264 files changed, 103,955 insertions(+), 22 deletions(-)**. The claim of byte-identity is false. What *is* true, and is the substantively important half: **0 files differ outside `developer-review/`**, so the application tree is identical and every metric measured on the app is unaffected |
| **Measurement 2 — file count** | `git ls-tree -r --name-only a7d08a2 \| wc -l` → **3,553**, not 3,806 (3,806 is the count at `8a6e03bb`; 3,816 at `a2ecb96`) |
| **Measurement 3 — preservation ref** | `git show-ref \| grep -i audit` → **no output**. `refs/audit-preserved/base-a7d08a2` does not exist in this repository. `git rev-parse a7d08a2` still resolves the commit object, so no evidence was destroyed, but the mechanism the package promises is not in place |
| **Measurement 4 — topology** | `git merge-base --is-ancestor a7d08a2 HEAD` → false; `git rev-list --count HEAD..a7d08a2` = 1, `a7d08a2..HEAD` = 12. `a7d08a2` is a divergent commit, not an ancestor |
| **Consequence in the artefacts** | `Evidence/artifacts/feature-parity.json` carried `revision: "a7d08a2fa67b"` — the generator stamped `HEAD` while the checkout was the foreign commit, although the package says M7 audited `8a6e03bb`. The application tree being identical is why no metric moved; the stamp was still wrong. Regenerated in M8 at `a2ecb96` |
| **Why it matters** | A reader is told (a) two different trees are identical when 264 of their files differ, and (b) a preservation guarantee that is not implemented. Both are exactly the class of claim an audit exists to prevent |
| **Correction applied** | M7's sentences are **left in place as published** and the correction is appended as a dated M8 amendment in `FINAL-AUDIT-HANDOVER.md` and this entry. No published number was rewritten; every M8 artefact carries `a2ecb96` |
| **Closure** | Documentation corrected; the missing ref is recorded rather than fabricated. Not "fixed" by creating the ref retroactively — that would misrepresent when it existed |

## [DISC-050] The public contact form reports success without sending a request

| Field | Value |
|---|---|
| **Finding ID** | `DISC-050` |
| **Feature** | FP-G11 marketing site — contact form |
| **Severity** | P1 — Critical. A visitor's enquiry is discarded while the UI states it was received; the business consequence is a lost lead and a false statement to the customer |
| **Legacy path:line** | `src/components/Contact/Contact.jsx:165-175` awaited `addContactMessage(...)`, threw when `result.success === false`, and only then set `isSuccessShowed`; the request is `src/services/api/platform.js:308-315` → `POST /api/contact` |
| **Modern path:line** | `frontend/src/pages/cms/index.tsx:234-243` (`handleSubmit` validates two fields and calls `setSubmitted(true)`; no request), success card at `:288-300` ("We have logged your request and our support desk will contact you at …"); route `/contact` at `frontend/src/app/router.tsx:74` |
| **Backend dependency** | `POST /api/contact` (`backend/index.js:2360-2387`): validates bounds, persists through `repo.saveContactMessage` with ip/userAgent, returns 202, honeypot short-circuit, rate limiter mounted at `:577`. Registered and reachable from no modern client |
| **Persistence / authorization** | public, rate-limited; persistence exists and is unreached |
| **Reproduction** | static: grep for any `post(`/`fetch(` in `frontend/src/pages/cms/index.tsx` → 0. Runtime (M8, in-memory repository): `POST /api/contact` → `503 RATE_LIMIT_UNAVAILABLE` in a DB-less environment, so the endpoint exists; the form still never calls it |
| **Evidence levels** | L1 (static) + L2 (HTTP execution of the endpoint, not of the form) |
| **Affected workflow** | Public contact / lead capture |
| **Impact** | Unlike every other false-success site in this log, there is not even a failed request to swallow: the handler is `setSubmitted(true)`. The user cannot distinguish success from silence, and the backend that would have stored the message is never contacted |
| **Remediation spec** | POST `{name,email,message}` to `/api/contact`; render the success card only on `202`; render the server's error text on 4xx/5xx; keep the honeypot field |
| **Regression acceptance** | With the backend running, a submitted enquiry produces exactly one `POST /api/contact` and one stored row, and the success card appears only after the 202; with the backend unreachable the card does not appear and an error is shown |
| **Closure** | Not met |

## [DISC-051] The public jobs page requests an operation that does not exist, and its filters are ignored even on the operation that does

| Field | Value |
|---|---|
| **Finding ID** | `DISC-051` |
| **Feature** | FP-F07 / FP-F10 job discovery |
| **Severity** | P1 — Critical. The public job board cannot list or filter jobs |
| **Modern path:line** | `frontend/src/pages/jobs/portal.tsx:61-81` builds `q`, `location`, `type` and calls `get(\`/jobs?…\`)`; `api-client.ts` baseURL is `/api`, so the request is `GET /api/jobs` |
| **Backend dependencies** | No `GET /api/jobs` exists (393-operation register; 0 matches). The listing lives at `GET /api/jobs-data` (`backend/routes/jobsData.js:159`, mounted at `backend/index.js:515`) |
| **Second defect — filters** | `routes/jobsData.js:161-172` forwards `req.query` to `repository.getJobs`, and both implementations read only `publicOnly`, `status`, `employerId`, `limit` (`MySQLRepository.js:1153-1176`; `InMemoryRepository.js:402-425`). `q`, `location` and `type` are silently dropped, so even after fixing the URL the page would list unfiltered results while the UI shows an active filter |
| **Reproduction** | Runtime at `a2ecb96` (`Evidence/logs/m8-http-probe-authenticated.log`): `GET /api/jobs` → `404 {"code":"NOT_FOUND","message":"API route not found"}`; `GET /api/jobs-data` → `200 {"jobs":[]}`. Static: `grep -n "location\\|type" backend/repositories/MySQLRepository.js` in `getJobs` → no predicate |
| **Evidence levels** | L1 (static) + L3 (HTTP runtime, in-memory repository) |
| **Affected workflow** | Public job discovery, employer job visibility |
| **Impact** | The page an unauthenticated visitor lands on cannot produce data. The error path renders an error state, so this is a broken page rather than a fabricated one — but the "All jobs / location / type" controls promise filtering that no layer implements |
| **Remediation spec** | Point the page at `/jobs-data`; add `q`/`location`/`type` predicates in the repository (parameterised), or remove the controls and say so |
| **Regression acceptance** | With three active and one draft job seeded, `/jobs` shows exactly three; applying a location filter changes the result set server-side; the request in the network log is `/api/jobs-data` |
| **Closure** | Not met |

## [DISC-052] The create-ticket modal has no focus trap, no Escape handling, no scroll lock and no focus return

| Field | Value |
|---|---|
| **Finding ID** | `DISC-052` |
| **Feature** | FP-G24 candidate support surface |
| **Severity** | P2 — High. Keyboard and screen-reader users cannot dismiss the dialog with Escape and lose their place when it closes |
| **Legacy path:line** | `src/components/Dashboard/DashboardSupport/DashboardSupport.jsx:127-133` (opener/dialog/subject refs), `:191-202` (scroll lock, initial focus on the subject field, Escape with an in-flight guard), `:831-834` (subject ref bound), teardown returns focus to the opener |
| **Modern path:line** | `frontend/src/pages/dashboard/support.tsx:353-372` — `<div role="dialog" aria-modal="true" aria-labelledby="create-ticket-title">` with an overlay click-to-close and a close button. `grep -c "Escape\\|keydown\\|autoFocus"` in that file → **0** each |
| **Available primitive, unused** | `frontend/src/components/ui/dialog.tsx:1-8` wraps `@radix-ui/react-dialog` (declared in `frontend/package.json`) with focus lock and Escape handling |
| **Reproduction** | static: open the file at `:353-372`; there is no key handler, no `document.body.style.overflow` write, no `ref`, no focus restore path |
| **Evidence levels** | L1 (static). Not exercised with a keyboard: no browser in the audit environment |
| **Affected workflow** | Creating a support ticket with a keyboard |
| **Impact** | Tab focus can leave the dialog and reach the page behind it; Escape does nothing; the page behind scrolls under the modal; closing drops focus to the document start. Two of these are WCAG 2.1 AA failures (2.1.2 No Keyboard Trap is not violated — rather 2.4.3 Focus Order and 2.1.1 Keyboard are) |
| **Remediation spec** | Render this modal with the existing `Dialog` primitive; if it must stay hand-rolled, add initial focus, a `keydown` Escape handler with an in-flight guard, `overflow:hidden` on open, and focus restore on close |
| **Regression acceptance** | Keyboard-only: open, Escape closes when not submitting and does not close mid-submit; Tab cycles inside; focus returns to the opener; the page behind does not scroll |
| **Closure** | Not met |

## [DISC-053] The shared unread-message poller and the global unread badge are gone; what replaced them stops polling on error

| Field | Value |
|---|---|
| **Finding ID** | `DISC-053` |
| **Feature** | FP-D07 notification centre / FP-G23 cross-cutting hooks |
| **Severity** | P3 — Medium. No data is wrong, but message arrival is no longer signalled app-wide, and error handling regressed from a backoff ladder to stopping |
| **Legacy path:line** | `src/hooks/unreadMessagesPoller.js:1-30` — singleton coalescing four subscribers onto one request per tick, 15 s → 30 s → 60 s → 120 s → 240 s → 300 s ladder, genuine `Retry-After` honouring, reset to 15 s on success; consumers `CubaCandidateShell.jsx:170`, `MessagesNavBadge.jsx:74`, `ProfileDisplay.jsx:34`, `EmployerSidebar.jsx:194` |
| **Modern path:line** | `frontend/src/hooks/` contains only `use-api-hooks.ts` and `use-restore-focus-when-idle.ts`. Notifications use `useNotifications()` with `staleTime: 30_000` and **no interval** (`use-api-hooks.ts:532-539`); the only periodic polling is per page: `messages.tsx:146` and `conversation-thread.tsx:54`, both `refetchInterval: (query) => (query.state.status === 'error' ? false : …)` |
| **Behavioural delta** | (a) no global unread-message badge: the only `totalUnread` consumer is the messages page itself (`messages.tsx:153,294`); (b) the bell count does not refresh on its own; (c) after one failed poll a page stops polling entirely instead of backing off and retrying |
| **Reproduction** | static: `ls frontend/src/hooks/`; `grep -rn "totalUnread" frontend/src --include=*.tsx` → messages page only; read the two `refetchInterval` closures |
| **Evidence levels** | L1 (static). Request cadence was not observed: no browser |
| **Affected workflow** | Message awareness from any page other than `/dashboard/messages` |
| **Impact** | A candidate sitting on the dashboard never learns a message arrived; a transient network error silences polling until a manual refetch, which is the opposite of the legacy design that existed specifically to fix a quota storm (DIR-054) |
| **Remediation spec** | One shared query with a coalesced interval and a backoff ladder that honours `Retry-After`; derive a nav badge from it; never conflate "error" with "stop polling" |
| **Regression acceptance** | Two components on one page produce one request per tick; a 429 with `Retry-After: 60` delays the next attempt by 60 s; the badge updates without visiting the messages page |
| **Closure** | Not met |

## [DISC-054] Three team-management operations have no production implementation, and team leads have nowhere to be stored

| Field | Value |
|---|---|
| **Finding ID** | `DISC-054` |
| **Feature** | FP-B05 enterprise workspaces & squads |
| **Severity** | P1 — Critical for enterprise administrators. Editing a team, archiving it or restoring it cannot succeed against the production registry, and a designated team lead is silently discarded on create |
| **Raised by** | Mandate 8 §4 at revision `a2ecb96d2b194df25d5cd8ce2ece23ef65068fd9` (opened as a "lead" being closed, and refuted by tracing past the route) |
| **Surface** | `frontend/src/components/enterprise/EnterpriseTeamsTab.tsx:80-114` (`handleSubmit`), `:235` (edit form loads `t.leadPrincipalId`), `:302` (lead input); `frontend/src/lib/enterprise-api.ts:448-459` (create/update calls) |
| **Routes** | `backend/routes/enterprise.js:684` `POST /api/enterprise/teams`; `:693` `PATCH /api/enterprise/teams/:teamId`; `:702` `POST …/:teamId/archive`; `:711` `POST …/:teamId/restore` — all registered and permission-guarded (`workspace.manage`), all reachable, none retired |
| **The break** | `backend/enterprise/tenantService.js:890-932` forwards to `this.registry.updateTeam`, `this.registry.archiveTeam`, `this.registry.restoreTeam`. The production registry is `MySqlTenantRegistry` (`tenantService.js:7` imports it; `:1343` constructs it as the default; `index.js` wires no other), and it implements **none of the three methods**. Only `backend/test/helpers/inMemoryTenantRegistry.js:580` does |
| **Consequence at runtime** | `TypeError: this.registry.updateTeam is not a function` → caught by each route → `503` with `TENANT_TEAM_UPDATE_FAILED` / `TENANT_TEAM_ARCHIVE_FAILED` / `TENANT_TEAM_RESTORE_FAILED`. The UI surfaces the error honestly (`EnterpriseTeamsTab.tsx:109-111`), so this is a broken capability, not a fabricated success |
| **Second defect — schema** | `enterprise_teams` (`backend/database/migrations/001_baseline.sql:823-831`) has columns `id, tenantId, workspaceId, name, description` — **no lead column and no status column**. `MySqlTenantRegistry.createTeam` (`:1472-1482`) inserts exactly those five. So `leadPrincipalId` sent on create is dropped without error, and `t.leadPrincipalId` is always `undefined`, which is why the tab renders `Lead: Unassigned` next to every team |
| **Why the test suite is green** | `backend/enterprise-test/enterprise-completeness.test.js:116-139` asserts that a lead can be set, is rejected for an outsider and can be cleared — but `:40` constructs `InMemoryTenantRegistry`, which implements `updateTeam` and stores the field. A passing test against a double is evidence about the double |
| **Reproduction (static)** | (1) `grep -n "async updateTeam\|async archiveTeam\|async restoreTeam" backend/enterprise/mysqlTenantRegistry.js` → no output; same grep on `backend/test/helpers/inMemoryTenantRegistry.js` → three hits. (2) `grep -rn "lead_principal_id\|leadPrincipalId" backend --include=*.sql` → no output. (3) `grep -n "leadPrincipalId" backend/test/helpers/inMemoryTenantRegistry.js` → present |
| **Evidence levels** | L1 (static). Not executed: requires the MariaDB-backed registry path, which is blocked in this environment (§5, `M8-RUNTIME-VERIFICATION.md`). The predicted `503` is therefore stated as predicted, not observed |
| **Affected workflow** | Enterprise team administration: rename/lead-assign, archive, restore |
| **Impact** | An enterprise administrator can create a squad but never rename it, never change its lead, never archive it and never restore it. Because create also drops the lead, the lead field is effectively write-only decoration. No data is corrupted — the operations fail closed |
| **Remediation spec** | Implement `updateTeam` / `archiveTeam` / `restoreTeam` on `MySqlTenantRegistry` with tenant-scoped `WHERE` clauses; add `leadPrincipalId` and a `status` (or `archivedAt`) column to `enterprise_teams` in a new forward migration; pass `leadPrincipalId` through `createTeam`; add one regression test that runs against the MySQL registry (or against a shared behavioural contract both registries must satisfy) so the double can no longer mask the gap |
| **Regression acceptance** | With MariaDB: create a team with a lead → `GET /teams` returns that lead; `PATCH` renames and re-leads it; `archive` then `restore` round-trips the status; the completeness suite passes when pointed at the MySQL registry, and fails if `updateTeam` is removed |
| **Closure** | Not met |


## [DISC-055] Four route blocks are declared twice in `backend/routes/platform.js`, the second copy can never run, and the two copies of the payment-settings read disagree on authorization

| Field | Value |
|---|---|
| **Finding ID** | `DISC-055` |
| **Feature** | Platform configuration surface (FP-A12 / admin system settings); no client is required to trigger it |
| **Severity** | P2 — High. Not a data leak by itself, but the live authorization gate is broader than the one documented in the file and broader than the shadowed copy, and the dead copies are a trap for the next editor |
| **Raised by** | Mandate 8 §3/§6 at revision `a2ecb96d2b194df25d5cd8ce2ece23ef65068fd9`, while reconciling why parser B counted 405 registrations for 399 distinct keys |
| **Surface** | `backend/routes/platform.js` — `GET /configuration` declared at `:1670` and again at `:1846`; `GET /payment-settings` at `:1707` and `:1883`; `GET /payment-webhooks` at `:1727` and `:1903`; `POST /payment-webhooks/:eventId/replay` at `:1809` and `:1985`. All four are on the same `express.Router()` (`:22`), mounted at `/api/platform` (`backend/index.js:522`, and again at `:3299`) |
| **Why the second copy is dead** | Express dispatches the first matching handler for a method+path pair and answers inside it; the later copy is registered but unreachable. The `:1670` and `:1846` configuration handlers are **byte-identical** (compared line by line, 14 lines, no diff), which is the signature of an accidental duplication rather than a deliberate second route |
| **The authorization divergence** | `requirePermission` treats an array as *any-of* (`backend/security/auth.js:198-207`: `required.some(p => permissions.has(p))`). `GET /payment-settings` at `:1707` requires `['payments.read', 'system.config.read']`; the dead copy at `:1883` requires `'system.config.read'` only. The comment block above both copies says *"Read stays at `system.config.read`"*. The live gate is therefore the broader one, and the roles that hold `payments.read` but not `system.config.read` are `ADMIN` and `AUDITOR` (`backend/security/auth.js:63-79`), so an AUDITOR — the least-privileged admin role — can read the platform payment-settings projection |
| **Reproduction (static)** | `grep -n "router.get('/configuration'\\|router.get('/payment-settings'\\|router.get('/payment-webhooks'\\|payment-webhooks/:eventId/replay'" backend/routes/platform.js` → eight lines, two per path. `sed -n '1707p;1883p'` → the two different guards. `sed -n '198,207p' backend/security/auth.js` → any-of semantics |
| **Evidence levels** | L1 (static). Runtime at `a2ecb96` could not reach the route: `/api/platform/*` requires an admin token and the platform router answers `404 ENTERPRISE_DISABLED` in this deployment (recorded in `M8-RUNTIME-VERIFICATION.md` §2.3). So the any-of behaviour is read, not exercised |
| **Impact** | (a) Four dead handlers inflate every registration count (this is what made 405 look like a backend disagreement) and will silently do nothing if someone edits them. (b) A payment-configuration read is reachable by a role the file's own comment says should not reach it. (c) The same double-registration pattern exists for `app.get('/healthz')` / `app.get('/api/healthz')` and the readyz pair, where it is *not* a defect — those are two different paths — and that distinction is why the reconciliation counts them separately |
| **Remediation spec** | Delete the later copy of each block; keep one guard per route and state it once; if `payments.read` is intended to grant this read, correct the comment and the test matrix, otherwise drop `payments.read` from the array. Add a route-table test asserting `router.stack` contains each method+path exactly once |
| **Regression acceptance** | For each of the four paths, exactly one handler is registered; an AUDITOR token receives `403` on `GET /api/platform/payment-settings`; an ADMIN token with `system.config.read` receives `200`; the duplicate-registration detector reports zero pairs across `backend/` |
| **Closure** | Not met |

**Note on scope of the claim.** No secret value is asserted to have leaked, and no live response was
observed. What is asserted is what the code says: the live guard is the any-of form, the roles that satisfy
it are ADMIN and AUDITOR, and the file documents a narrower intent. Treating that as "fine because nothing
broke" is exactly the reasoning this audit exists to refuse.
