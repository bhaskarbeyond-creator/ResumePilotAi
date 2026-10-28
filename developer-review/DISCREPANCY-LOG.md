# Master Discrepancy Log — ResumePilotAi

Single source of truth for confirmed findings. IDs are stable and sequential. No finding
below is a hypothetical — every one cites a verbatim excerpt captured during this audit
from the read-only clone of commit `537e298` on branch `main`. Candidates that were
investigated and **disproved** live in `appendix/REFUTED-CANDIDATES.md`, not here.
Candidates that remain **plausible but unproven** live in
`appendix/UNVERIFIED-SUSPICIONS.md`, not here.

Total confirmed findings in this log: **7** (DISC-001 … DISC-007). No overflow file is
required (`<60`).

---

## [DISC-001] Two parallel, divergent frontend source trees create active-implementation ambiguity

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
