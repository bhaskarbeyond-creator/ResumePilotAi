# Continued engineering — 2026-10-22

**Assignment remains active. PR #46 is draft; do not mark ready or close it.** PR #45 was merged externally while the work was unfinished; the agent neither marked it ready nor merged it. The fixed session branch remains `arena/11b0f680-resumepilotai`, targeting `dev`.

## Current evidence and supersession
This ledger and the updated A–K report supersede the original partial-delivery counts, provider claims and PR reference. Historical reports are not completion certificates.

- Original exported baseline: 983 tests, 924 pass, 59 fail (the export required ancillary source paths to be restored). Every one of the subsequently reported 57 failure names is also present in that baseline.
- Continuation reproduction: 998 tests, 941 pass, 57 fail.
- Canonical/fixture parity checkpoint: 1000 tests, 965 pass, 35 fail. A new tenant-to-platform ranking contamination failure was identified and fixed, not dismissed as pre-existing.
- Full hosted MariaDB checkpoint `1635437`: **1057 tests, 1057 pass, 0 fail, 0 skipped**. Evidence: [backend job 119663807736](https://github.com/bhaskarbeyond-creator/ResumePilotAi/actions/runs/39730378512/job/119663807736), including a machine-readable totals annotation.
- Full hosted `99d133b`: **1060 tests, 1060 pass, 0 fail, 0 skipped**. [Backend job 119667059493](https://github.com/bhaskarbeyond-creator/ResumePilotAi/actions/runs/39731409381/job/119667059493).
- Authenticated full-app `99d133b`: **11/11**, real MariaDB, actual signed non-production identity verifier, real llama.cpp generation. All seven viewports, five subtab deep links/reloads, three additional top-level engine tabs, role denial, deliberate single transport-error recovery, and five actual modal dialogs. [Job 119667059315](https://github.com/bhaskarbeyond-creator/ResumePilotAi/actions/runs/39731409381/job/119667059315).
- Local full suite most recently executed at `05a1bc3`: **1029 tests, 995 pass, 34 fail, 0 skipped**. All 34 are database-dependent local failures; this sandbox has no MariaDB/Docker. They are not waived: the equivalent full hosted gate is mandatory.
- `backend-failure-register.json` classifies every original failure individually, identifies the baseline evidence, remediation and hosted proof. Categories: 34 environment; 1 missing ownership registration; 9 tenant fixture/runtime-contract; 13 runtime/compatibility.
- All `7076e3b` hosted jobs passed: **1065/1065 backend, 0 skipped** ([job 119669199928](https://github.com/bhaskarbeyond-creator/ResumePilotAi/actions/runs/39732086114/job/119669199928)); **11/11 authenticated browser** plus local inference ([job 119669199503](https://github.com/bhaskarbeyond-creator/ResumePilotAi/actions/runs/39732086114/job/119669199503)); **actual public anonymous inference** ([job 119669199896](https://github.com/bhaskarbeyond-creator/ResumePilotAi/actions/runs/39732086114/job/119669199896)); **full quality gate** ([job 119669200006](https://github.com/bhaskarbeyond-creator/ResumePilotAi/actions/runs/39732086154/job/119669200006)). No job is waived.
- Validated final-mode checkpoint `e5782fb`: hosted **1068/1068 backend, 0 skipped**, **11/11 authenticated browser including actual inference in every saved mode**, full quality success. Public anonymous submission at this checkpoint timed out honestly. [Backend](https://github.com/bhaskarbeyond-creator/ResumePilotAi/actions/runs/39732795856/job/119671451316), [browser](https://github.com/bhaskarbeyond-creator/ResumePilotAi/actions/runs/39732795856/job/119671451237), [quality](https://github.com/bhaskarbeyond-creator/ResumePilotAi/actions/runs/39732795835/job/119671451057).
- Previous production-code checkpoint: `7076e3bf8b25b9b4f309de4446c2cf419d705f52`, pushed and independently verified with `git ls-remote`. Both associated hosted workflows passed. Latest code checkpoint is `e5782fb7301ed936ac734f30912bebec3bbac816` (independently verified remote). It additionally bounds credential-cache entry count/concurrent discovery, normalizes malformed capability metadata, and adds actual inference assertions for all five saved modes; its hosted deterministic/local-browser/quality checks passed as above; public inference timed out. Current production-code checkpoint is `05a1bc33f6523b4070e5a1eb53933cf3a6bb5b1c`, which additionally shares the canonical pure configuration builder with product generation/parsing so registered account-required credentials/models/endpoints are actually available there. Key-pool arrays are cloned across cached callers. The full local rerun caught an empty-configuration primary-default compatibility regression in `f62699a`; `05a1bc3` restores the original Gemini default without weakening the test. Current-head hosted results must be read from its checks rather than inferred from earlier checkpoints.

## Implemented corrections
- Tenant SQL fixtures now share the actual registry membership/configuration maps. Production governance remains fail-closed; unauthorized access is correctly rejected by the earlier 403 gate.
- Both migration-027 credential tables have authoritative ownership registration.
- Canonical router/discovery/cache/metrics state resets consistently with seeded fixtures. Keyless/local/public gateways remain opt-in, not accidental fallbacks.
- Tenant/BYOK observations cannot train shared platform ranking or clear shared platform cooldowns. Failed fallback attempts update tenant-scoped health even when a later attempt succeeds.
- Auto, Quality First, Speed First, Balanced and Manual are saved in revisioned settings, loaded by runtime configuration and consumed by the canonical router. Intelligent modes expand the credential-scoped live catalog, gate task capabilities/context, and honor tenant model allowlists/denylists after expansion. Manual pins never silently switch provider/model.
- Quality is **unknown**, not a model-name/parameter-count score. Quality First uses documented capability fit and recent service reliability, not measured output-quality benchmarks. Speed uses recent observed successful latency. Stale/future observations do not earn performance credit.
- Removed fabricated catalog quality/RPM/reliability/latency values, duplicate frontend provider/model arrays, fake local enable toggles, and name-based intelligence sorting. The model table shows credential-scoped discovered records and freshness only.
- Actual selected model is returned in the OpenAI-compatible response, together with provider/actual-model/routing-decision metadata. Cached decisions retain provenance.
- Manual pins on environment-enabled local providers persist. Credential-only saves preserve locked primary, mode, pin, fallback and generation controls. Endpoint overrides persist consistently; blank preserves, `none` clears; embedded credentials/query/fragment are rejected.
- Discovery is shared across admin/runtime, bounded while reading the response stream (not only after buffering), single-flight, credential/endpoint scoped, TTL/backoff bounded (128 cache entries, 16 distinct-credential discoveries in flight; same-credential requests coalesce), and explicit about stale/error/unknown. A successful empty catalog is authoritative, not replaced with registry hints.
- Five dialogs actually render, trap focus and close via Escape. Local cooldown state is read-only: the UI does not pretend to reset upstream quota. Save errors use visible application alerts rather than native browser alerts.
- Fixed stale migration-verifier head/rollback ordering, missing frontend dependency installation in the quality workflow, stale test config paths, obsolete runtime freeze assertion, fake secret-shaped fixture, duplicate in-memory server-owned fields and an undefined unit-test helper. CV templates remain byte-identical to the user-authorized baseline.

## Real inference and official access research
- llama.cpp discovery → canonical router → nonempty actual generation passed on hosted CPU with a licensed small GGUF. Balanced mode is explicitly enabled in the gate. The workflow records model SHA-256 and container digest; generation content is not recorded. This is self-hosted evidence, not public anonymous inference or a quality benchmark.
- Official Haidra documentation explicitly permits anonymous AI Horde usage with public key `0000000000`, lowest queue priority and possible load restrictions. Replaced an unverified compatibility-proxy URL with its native asynchronous text API. One bounded submission, normal status polling and cancellation on timeout; no retry/account/priority evasion. Opt-in; community workers receive prompts, so private data must not be sent.
- **Actual public inference passed** at `1635437`, [job 119663807939](https://github.com/bhaskarbeyond-creator/ResumePilotAi/actions/runs/39730378512/job/119663807939); the check notice confirms nonempty text through discovery and canonical manual routing. Later `99d133b` attempt timed out after 90 seconds (REQUEST_TIMEOUT / 504); this is an external queue-capacity failure, not success. Both outcomes remain visible.
- Kilo official gateway authentication/quickstart requires a Kilo account, API credits and a Bearer API key; registry now uses its documented endpoint and no longer labels it anonymous. Pollinations remains API-key-required. OVH access remains unverified and opt-in; no anonymous inference success is claimed.

## Security
- Critical `proxy-addr@2.0.7`, GHSA-jqcg-44mw-7w3h: malformed short IPv4-mapped IPv6 subnet trust could spoof client IPs. Patched to 2.0.8 within Express-compatible constraints; exploit-specific tests pass. Application uses loopback predicate/numeric hop policy, but vulnerable code was removed rather than waived.
- Nodemailer 10.2.0 mail regressions passed; removed nodemon for Node built-in watch; patched gRPC dependencies.
- Root dependency audit was also executed, not omitted: initial production findings 59, then a clean coherent patch/minor resolution and explicit compatible fixes reduced root production findings to **0**. Root Axios 1.20.0, Vite 8.3.5, coherent Tiptap 3.32 family, i18next-http-backend 4.0.4, gRPC override and Mammoth CLI-only argparse 2 override. Verified actual DOCX parsing, CLI compatibility, editor prototype-pollution regression, i18n/product suites. No `--force` or `--legacy-peer-deps`; npm ci verifies the lock.
- Latest executed production audits: root **0**, backend **0**, frontend **0**. Backend/frontend all-dependency audits also **0**.
- Root **all-dependency** audit: three high development-only findings (`firebase-tools → chokidar@3 → braces`, GHSA-vfj7-8cjw-p6xm). Published braces latest 3.0.3 is still affected. `npm ls braces --omit=dev` is empty. It is not an application/runtime dependency; risk requires untrusted deeply nested glob input in local CLI/emulator tooling. Keep development/emulator config trusted and exclude dev dependencies from production. No unsafe major chokidar override was applied because it removes glob-ignore support used by Firebase CLI. This is disclosed, not reported as an all-dependency green audit.
- Removed governance debug logging of tenant/member/configuration lookups. No credentials, candidate prompts or generated content are committed as evidence.

## Current local validation
- Root lint: 0 errors; 207 existing warnings are explicitly not called a clean warning-free result.
- Product command: **763/763 across five constituent runs** (736 + 1 + 8 + 3 + 15), no skips.
- Security/static command: **71/71**, including three actual dependency regressions.
- Frontend TypeScript + production build passed; existing large-chunk warning remains.
- Component Playwright **39/39**, seven viewports; mocked component/API boundaries are explicitly separate from authenticated full-app proof.
- The final code and documentation are subject to current-head hosted full/quality/browser checks; their eventual post-publication status is not predicted by this ledger. Current code has 1029 local backend assertions (995 pass; the same 34 DB-environment failures) and all local product/security/component/build/audit checks above pass.

## Exact reproduction
Run from repository root with Node 24 (hosted gate uses supported Node 24); never point integration tests at a production database.

```sh
npm ci --ignore-scripts
npm ci --prefix backend --ignore-scripts
npm ci --prefix frontend --ignore-scripts
npm exec --prefix backend -- playwright install --with-deps chromium
npm run lint
npm run test:security:static
npm run test:product
npm --prefix frontend run build
npm audit --omit=dev
npm --prefix backend audit --omit=dev
npm --prefix frontend audit --omit=dev
```

For full backend, start **disposable migrated MariaDB** using `.github/workflows/ai-engine-validation.yml` / `scripts/start-ci-mariadb.sh`, then `npm --prefix backend test`. The same workflow starts the actual model server, invokes `scripts/verify-local-inference.cjs`, and runs `frontend/tests/engine-authenticated.config.ts` against real routes/DB/inference. It provisions a masked ephemeral test-only HMAC secret; the verifier refuses production. Public anonymous proof uses `node scripts/verify-public-anonymous-inference.cjs`, once per gate, and may fail honestly due to community capacity.

## Tooling and remaining limits
- GitHub-hosted CI is authorized and available; it is no longer described as wholly blocked. API-visible job/check annotations provide results even though redirected log-download hosts are inaccessible from this sandbox.
- No `claude` executable, delegated reviewer tool, or installed gh review extension is available. No independent Claude review is claimed; source self-review is not a substitute.
- No provider output-quality benchmark, comparative real multi-provider latency benchmark, always-on public availability, deployed production parity, or complete historical legacy-browser certification is claimed. Public service capacity fluctuates. The assignment and draft PR remain open.

## Final production-code checkpoint (verified before documentation publication)

`05a1bc33f6523b4070e5a1eb53933cf3a6bb5b1c`: all hosted jobs passed, independently read through GitHub API/watch:

- **1070/1070 backend, 0 skipped**, [job 119674534176](https://github.com/bhaskarbeyond-creator/ResumePilotAi/actions/runs/39733685543/job/119674534176).
- **11/11 authenticated full-app browser**, actual inference for all five modes, seven viewports, [job 119674534695](https://github.com/bhaskarbeyond-creator/ResumePilotAi/actions/runs/39733685543/job/119674534695).
- **Actual anonymous nonempty text**, canonical discovery/manual routing, [job 119674534478](https://github.com/bhaskarbeyond-creator/ResumePilotAi/actions/runs/39733685543/job/119674534478). Earlier timeout attempts remain recorded; this does not establish availability guarantees.
- **Complete quality gate success**, [job 119674325622](https://github.com/bhaskarbeyond-creator/ResumePilotAi/actions/runs/39733685434/job/119674325622).
- Final local full backend: **1029 tests, 995 pass, the same 34 database-environment failures, 0 skips**. Local 763 product / 71 static / 39 component checks, frontend build, lint 0 errors and three production audits all passed.

The subsequent publication adds documentation and explicit `/adm`/`/platform` query-preserving aliases plus browser Back/Forward assertions at all seven sizes. It does not change production code. Consult that published head's checks for the new assertions; the checkpoint above is not falsely described as having run those subsequent assertions. Assignment active; PR remains draft.
