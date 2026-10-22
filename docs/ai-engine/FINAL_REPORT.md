# AI engine — evidence-backed A–K progress report

**2026-10-22 · Assignment active · Draft PR #46 · Not a 10/10 or production-completion certificate**

This report supersedes the original partial delivery. Detailed executed evidence, reproduction commands and limitations are in [CONTINUATION.md](CONTINUATION.md); every original backend failure is classified in [backend-failure-register.json](backend-failure-register.json).

## A. Repository and delivery

- Baseline: `2abbbe4401efd1945e2749127605bb7f80afe941`.
- Fixed branch: `arena/11b0f680-resumepilotai`; no branch switching, destructive reset, force push, main/dev push, release, agent merge or ready-for-review action.
- Upstream changes were fetched and safely merged. PR #45 was merged externally while work was unfinished. The active follow-up is **[draft PR #46 → dev](https://github.com/bhaskarbeyond-creator/ResumePilotAi/pull/46)**.
- Latest production-code checkpoint when this report was written: `05a1bc33f6523b4070e5a1eb53933cf3a6bb5b1c`. Checkpoint `7076e3b` has all hosted jobs green; `e5782fb` additionally passed every-mode actual inference, 1068 backend tests and the full quality gate (its public request timed out). Pushed hashes were independently checked with `git ls-remote`.
- Source changes are coherent checkpoints, not unreported local-only fixes. Read the published head checks for post-publication final validation outcomes; earlier checkpoint passes do not automatically certify later code.

## B. Backend regression accounting

|Executed run|Tests|Pass|Fail|Skipped|
|---|---:|---:|---:|---:|
|Original baseline export, ancillary source paths restored|983|924|59|0|
|Continuation reproduction of reported failures|998|941|57|0|
|After canonical/fixture parity|1000|965|35|0|
|Hosted real MariaDB, `1635437`|1057|1057|0|0|
|Hosted real MariaDB, `99d133b`|1060|1060|0|0|
|Hosted real MariaDB, `7076e3b`|1065|1065|0|0|
|Hosted real MariaDB, `e5782fb`|1068|1068|0|0|
|Final production-code hosted MariaDB, `05a1bc3`|1070|1070|0|0|
|Latest local full run, `05a1bc3`|1029|995|34|0|

All original **57** names are present in the baseline failure log. They are individually classified: **34 environment**, **1 ownership-registry defect**, **9 tenant fixture/runtime-contract defects**, **13 runtime/compatibility defects**. Every original failure passes in the hosted unskipped suite; no failure is accepted merely for being pre-existing.

Local MariaDB/Docker is unavailable, so local 34 failures remain visible rather than skipped. Hosted proof: [1057/1057](https://github.com/bhaskarbeyond-creator/ResumePilotAi/actions/runs/39730378512/job/119663807736), [1060/1060](https://github.com/bhaskarbeyond-creator/ResumePilotAi/actions/runs/39731409381/job/119667059493). Different totals reflect added tests and database-dependent nested assertions, not removed failing tests.

Introduced defects were also investigated: shared-ranking pollution from tenant observations, a nondeterministic test timestamp, an environment-only local manual pin not persisting, partial secret saves resetting routing controls, and discovered-model expansion missing tenant model restrictions. These have specific fixes/regressions; they are not hidden behind the historical baseline.

## C. Security and dependencies

- Critical Express `proxy-addr` advisory **GHSA-jqcg-44mw-7w3h** was inspected and fixed with 2.0.8. Malformed short mapped IPv6 subnet trust could spoof client IPs; exploit-specific tests protect the fix. Existing predicate/numeric trust settings do not justify retaining vulnerable code.
- Nodemailer 10.2.0 mail checks passed; nodemon was removed for native Node watch; gRPC patched.
- Root production dependencies were audited too. Compatible patch/minor refresh plus explicit Axios/Vite/Tiptap/i18next/gRPC fixes and a CLI-only Mammoth argparse override reduced production findings from 59 to **0** without force/legacy-peer-deps. Real DOCX parse, CLI help and editor attribute-injection regressions pass.
- Executed production audits: **root 0 · backend 0 · frontend 0**. Backend/frontend all-dependency audits: **0**.
- Root all-dependency audit is **not green**: three high dev-only findings in `firebase-tools → chokidar@3 → braces` (GHSA-vfj7-8cjw-p6xm). Published braces latest remains affected. `npm ls braces --omit=dev` is empty. Untrusted nested glob patterns in local emulator tooling are the exposure; keep emulator config trusted and omit dev dependencies in production. A major chokidar override was deliberately not forced because Firebase uses its glob-ignore behavior.
- Tenant membership/governance remains fail-closed. Credential/cache identities are hashed and tenant/model restrictions survive catalog expansion. Tenant metrics cannot train platform ranking. Sensitive governance debug output was removed.

## D. Selection modes and actual execution

Implemented persisted **Auto / Recommended, Quality First, Speed First, Balanced, Manual** through revisioned admin settings → runtime configuration → canonical provider/model selection.

- Intelligent modes expand only the credential/endpoint-scoped catalog; unsupported/unknown required tools, JSON, vision and context constraints fail closed.
- Provider/model fallback is bounded, cooldown-aware and policy-constrained. Model allowlists/denylists are checked after discovery expansion. BYOK remains tenant-owned.
- Manual pins stay pinned. Missing/removed/incompatible pinned models do not silently switch destination. Tenant pins are not replaced with platform pins.
- Product generation/parsing and the gateway now share the pure registered-provider configuration builder; account-required provider credentials/models/endpoints no longer disappear at the legacy six-provider loader boundary. Credential-pool arrays cannot be mutated across cached callers.
- Partial credential updates preserve the locked mode, primary, model, fallback and generation controls. Configured local endpoint overrides persist consistently.
- OpenAI-compatible responses identify the **executed** model and expose actual provider/model/routing-decision metadata. Cached decisions retain provenance.
- **No output-quality benchmark exists.** Quality First prioritizes documented capability fit and observed service reliability, not a fabricated intelligence score. Speed uses fresh observed successful latency; unknown/stale/future observations earn no performance credit.
- Legacy pinned configurations remain compatible until an authorized settings save opts into a persisted mode; this compatibility path is not advertised as a new measured quality policy.

## E. Catalog and provider truthfulness

- Admin and runtime share the canonical discovery service. Streamed response size is bounded before materialization; single-flight, TTL, backoff, bounded stale data, 128-entry cache and 16-request cross-credential concurrency limits and credential/endpoint scoping are enforced.
- Successful empty results are authoritative; additions/renames/removals reconcile instead of accumulating stale IDs. Discovery failures are visible, never converted into verified registry hints.
- Removed fabricated quality/speed/reliability/latency/RPM values, parameter-count/name “intelligence” sorting, duplicate frontend lists and fake local enable toggles. Unknown context/capability/quality stays unknown.
- The model table is read-only discovered evidence, not a pretend benchmark or unsaved fallback editor. Provider verification means actual nonempty inference in that session, not mere configuration or catalog access.

## F. Legitimate access and real inference

|Provider|Access classification|Actual evidence / limits|
|---|---|---|
|llama.cpp|Opt-in local/self-hosted|Hosted licensed GGUF CPU generation through live catalog and canonical Balanced router passed. Not anonymous public inference or a quality benchmark.|
|AI Horde|Opt-in public anonymous community queue|Official documented public anonymous key and native async text API. **Real generated text passed** at `1635437`; later request timed out at 90 seconds. Lowest priority; no always-on promise. Community workers receive prompts; do not send private data.|
|Ollama|Opt-in self-hosted|Shared compatible integration/fixtures; no separate actual Ollama inference claim.|
|Kilo|Account/API credits/key required|Official gateway authentication/quickstart inspected; endpoint corrected and anonymous label removed. No authenticated inference credential available.|
|Pollinations|API-key/account required|Official README does not support an anonymous gateway claim; no authenticated inference claimed.|
|OVH and other catalog entries|Unverified / provider-specific credentials|No operational inference or no-account claim without evidence. Registry presence is not proof.|

AI Horde success: [official public inference job 119663807939](https://github.com/bhaskarbeyond-creator/ResumePilotAi/actions/runs/39730378512/job/119663807939). Later [99d133b queue failure](https://github.com/bhaskarbeyond-creator/ResumePilotAi/actions/runs/39731409381/job/119667059686) is explicitly `REQUEST_TIMEOUT`, HTTP 504; queued work is cancelled, not retried or reprioritized. A public gate failure remains visibly failed even though it is non-blocking for core deterministic regression.

## G. Frontend, permissions and full-app browser proof

- Real authenticated Playwright **11/11** at `99d133b`: [job 119667059315](https://github.com/bhaskarbeyond-creator/ResumePilotAi/actions/runs/39731409381/job/119667059315).
- Uses the actual Express app, migrated MariaDB repository, signed non-production identity verifier, real login form, and real model server. No API/repository/auth mocks except a **single deliberately injected 503** for transport-recovery testing.
- All seven sizes: **320×568, 390×844, 430×932, 768×1024, 1366×768, 1440×900, 1920×1080**.
- Five subtab deep links/reloads plus Models, Claude/Agents and Playground; responsive bounds/page errors; selection-mode persistence; manual pin matching actual execution; ordinary-user route/API denial; visible errors/retry; five actual dialogs with focus containment/Escape closure.
- Separate component Playwright **39/39**, with explicitly mocked APIs: addition/removal/stale catalog, errors/retry, all subtab sizes, mode persistence and five dialogs. It does not substitute for authenticated proof.
- **Every saved mode now has actual-inference assertions**, including executed provider/model/routing-decision identity and nonempty generated text; authenticated **11/11 passed** at `e5782fb`, [job 119671451237](https://github.com/bhaskarbeyond-creator/ResumePilotAi/actions/runs/39732795856/job/119671451237). This is one real model across policies, not a multi-provider comparative benchmark.
- Final publication adds explicit `/adm`/`/platform` query-preserving alias and Back/Forward assertions at every viewport; read the published-head checks for these later test-only additions rather than attributing them to earlier runs.
- Legacy request/settings contracts and CV-template invariants remain tested. A complete historical old-UI browser certification and deployed production parity are **not** claimed.

## H. Other executed regression checks

- Root lint: **0 errors, 207 warnings** (not described as warning-free).
- Product command: **763/763** across five runs (736 + 1 + 8 + 3 + 15), no skips.
- Security/static command including dependency regressions: **71/71**.
- Frontend TypeScript + production build: passed; existing bundle-size warning disclosed.
- Critical proxy regression, mail tests and canonical tenant/security suites passed at their recorded checkpoints.
- **Final production-code `05a1bc3`: all hosted jobs passed**: [backend 1070/1070, no skips](https://github.com/bhaskarbeyond-creator/ResumePilotAi/actions/runs/39733685543/job/119674534176), [authenticated browser 11/11 including actual inference for all modes](https://github.com/bhaskarbeyond-creator/ResumePilotAi/actions/runs/39733685543/job/119674534695), [actual public anonymous text](https://github.com/bhaskarbeyond-creator/ResumePilotAi/actions/runs/39733685543/job/119674534478), [complete quality gate](https://github.com/bhaskarbeyond-creator/ResumePilotAi/actions/runs/39733685434/job/119674325622).
- All `7076e3b` hosted jobs passed: [backend 1065/1065](https://github.com/bhaskarbeyond-creator/ResumePilotAi/actions/runs/39732086114/job/119669199928), [authenticated browser 11/11 + actual local inference](https://github.com/bhaskarbeyond-creator/ResumePilotAi/actions/runs/39732086114/job/119669199503), [actual public anonymous inference](https://github.com/bhaskarbeyond-creator/ResumePilotAi/actions/runs/39732086114/job/119669199896), [complete quality gate](https://github.com/bhaskarbeyond-creator/ResumePilotAi/actions/runs/39732086154/job/119669200006).
- The quality workflow was repaired to discover the current migration head, roll newer migrations back in dependency order, use Node 24, install browser and frontend dependencies, and preserve an accessible baseline for template invariants. The complete quality workflow also passed on final production code `05a1bc3`.

## I. Reproduction and evidence integrity

See [CONTINUATION.md](CONTINUATION.md) for exact npm/build/audit commands and disposable-database requirements. `.github/workflows/ai-engine-validation.yml` executes the full backend suite, actual local/public inference and authenticated browser coverage. `.github/workflows/quality-gate.yml` exercises migrations, lint, full security/backend, product, production build and production audits.

The model gate records model SHA-256 and container digest in the hosted job summary. Scripts assert discovered/executed model identity and nonempty generated text; they do not log prompts, responses, credentials or candidate data. Workflow/check annotations expose exact totals and bounded failure details through the authorized GitHub API even when redirected raw log downloads are inaccessible.

## J. Independent review and unresolved limits

- No `claude` executable, delegated reviewer tool or installed gh reviewer extension is available. **No independent Claude review is claimed.** Source self-review found actionable defects but is not independent approval.
- No statistically defensible quality benchmark, comparative real multi-provider latency benchmark, always-on public availability, production deployment certification or comprehensive historical legacy-browser approval exists.
- Root dev-only Firebase CLI glob vulnerability has no published braces patch; production tree is clean, mitigation/scope are disclosed above.
- Local full MariaDB suite cannot pass without a database; hosted validation, not skipping tests, is the approved solution.
- Consult the current published head checks for full/quality/browser outcomes after this report was committed. No earlier checkpoint pass is a blanket certificate for later changes.

## K. Readiness assessment

The work has progressed from partial mocked validation to full hosted database regression, authenticated seven-viewport application coverage and actual local/public inference. Concrete routing, persistence, catalog, tenant-isolation and production dependency defects were fixed.

**It is not appropriate to label this “10/10 complete.”** Output quality is unbenchmarked, public service capacity fluctuates, independent review is unavailable, historical/deployed parity is incomplete, and historical/deployed parity remains narrower than a full legacy-product certification. The assignment stays active and **PR #46 stays draft**; no ready/merge/close action is authorized by this report.
