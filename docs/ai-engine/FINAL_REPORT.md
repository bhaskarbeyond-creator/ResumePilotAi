# AI engine delivery report

**Date:** 2026-10-22 UTC
**Disposition: INCREMENTAL DELIVERY — NOT PRODUCTION CERTIFIED.**

The full master mandate is **not complete**. This delivery fixes concrete catalog, policy, caching and administration defects; adds an opt-in local integration; and supplies executed regression evidence. It does not claim new operational public inference, 10/10 quality, independent Claude approval or a passing full release gate.

## A. Repository status

- Starting commit: `2abbbe4401efd1945e2749127605bb7f80afe941`.
- Initial `dev` and `main` hashes independently verified using `git ls-remote` after fetch.
- Work branch: `arena/11b0f680-resumepilotai` (fixed session branch).
- During execution both upstream branches advanced to `800b7c56a3c1cfc5d1cefc8d3fbc1d1be1438e22`, a bridge-ledger-only change. Fetched `dev` explicitly and merged without rewriting history (`26eda37`).
- Draft PR: [#45](https://github.com/bhaskarbeyond-creator/ResumePilotAi/pull/45), target **dev**. No direct push to main/dev; no release or merge requested/performed.
- Final delivery hash is the documentation commit containing this report; resolve with `git rev-parse HEAD` and compare `git ls-remote origin refs/heads/arena/11b0f680-resumepilotai`. Confirmed implementation hashes appear in section I. The report intentionally does not embed its own circular commit hash.

## B. Route and workflow coverage

Production administrative surface is `/admin?tab=ai-settings&subtab=…`; component tests exercise the same `AdminAiSettingsTab` in an isolated test entry. These are **not authenticated application E2E tests**.

|Subtab / surface|Purpose / data|Executed coverage|Limitations|
|---|---|---|---|
|`providers`|Server registry/configuration, test/enable/save controls|7 viewport render + reload checks|Full forms, save/persist and permission flows not browser-certified|
|`key-pool`|Stored credential-pool management|7 viewport render + reload checks|No live credential rotation certification|
|`metrics`|Configuration/cooldown snapshot, browser-session verification count|7 viewport render + reload checks; failed-query error state|Not a full usage/latency dashboard certification|
|`unified-gateway`|Endpoint/configuration reference|7 viewport render + reload checks|Mocked HTTP/stream adapter suite, no deployed gateway certification|
|`discovery`|`POST /api/admin/ai/fetch-models`, protected by `requireSuperAdmin`|7 viewport interactive refresh/add/remove/stale checks; failure/preserve/retry|API mocked in browser; actual server discovery covered by deterministic tests|
|Models, chains, Claude, playground top-level tabs|Existing curated model and gateway UI|Source inventory only|No claim of complete migration or functional parity|
|Tenant AI settings/API|Tenant BYOK and policy|Engine allowlist/cache regression tests|Full tenant UI and MariaDB membership flows remain unverified|

Viewports executed: **320×568, 390×844, 430×932, 768×1024, 1366×768, 1440×900, 1920×1080**. Overflow checked on all five engine subtabs; discovery tests also assert no browser exceptions. No visual baseline or complete WCAG certification was executed. Browser history, all nested application paths and every modal still require coverage.

## C. Defect register

|Severity|Issue / root cause|Implemented fix|Verification|
|---|---|---|---|
|High|Cooldown bypass retried every unhealthy provider|Remove second unsafe candidate-building loop|All-cooled-down regression; existing 429 failover suite|
|High|Tenant platform destinations ignored|Enforce tenant allowlist in shared mesh; explicit empty array denies all|Policy regression tests|
|High|Cache lookup could bypass current policy and cross tenant/request scope|Resolve eligibility first; SHA-256 cache identity binds tenant, eligible candidates, credentials and request semantics|Tenant A/B and deny-after-cache regression|
|High|Auto model returned static default before discovery|Consult discovery first; successful empty catalog is authoritative|Addition/removal/auto tests|
|High|Discovery credential cache aliasing|Replace last-eight-character identity with SHA-256|Equal-suffix credential test|
|Medium|Concurrent discovery duplicated traffic|Single-flight requests per catalog identity|10 concurrent refreshes produce one fixture call|
|Medium|Discovery outage looked newly verified|Timestamp/source/status, bounded stale retention, failure flag and backoff|Malformed/failed refresh, stale expiry, first-failure backoff tests|
|Medium|Removed/deprecated model could remain auto-selected|Replace snapshots; filter explicit deprecated/inactive entries|Reconciliation/deprecation regressions|
|Medium|Invented context and exposed discovery diagnostics|Remove 128K fallback context and upstream response bodies|Unknown-context/error-redaction tests|
|Medium|Discovery selected wrong provider|Child selection passed to fetch handler; no unrelated modal credential reuse|Playwright request-body assertions|
|Medium|Configured/keyless implied healthy; failed settings appeared as zeros|Unverified states until explicit successful inference; error/retry on settings failure|Browser state/error tests|
|Medium|Model-name/registry scores treated as measured quality|Remove them from routing rank; use expiring same-model observations only|Unknown, expired, wrong-model and measured-score tests|
|Medium|Failed credentials stayed rejected forever|Remove permanent metrics-based rejection; bounded cooldown remains|Source review + existing cooldown tests; live key recovery unverified|
|Medium|Cross-process persisted health contaminated tests|In-memory metrics in test runner; reset runtime fixture state|Full-suite differential run|

Provider-prefix key checks were relaxed: explicit placeholders and short values are still rejected, but external authentication—not assumed prefixes—is authoritative. Tests do not weaken access controls to obtain green results.

## D. Keyless/provider register

Research check: **2026-10-22 UTC**. Actual external inference verification time: **none**.

|Provider|Access category and official source|Implementation / inference status|Limits and fallback|
|---|---|---|---|
|llama.cpp|Self-hosted, no third-party key when server auth disabled; [official server README](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md) retrieved through GitHub API|**New opt-in registration**, shared OpenAI adapter + `/v1/models`; mocked completion passed; real inference NOT run|Requires loaded compatible model/runtime, private deployment and local resources; no built-in model ID; excluded on discovery absence/cooldown|
|Ollama Local|Self-hosted; [official repository](https://github.com/ollama/ollama)|Existing entry corrected to keyless local/opt-in; shared adapter reused; real inference NOT run|Requires running service/model; not equivalent to authenticated Ollama Cloud|
|Pollinations|**Credential-required**; [official README](https://github.com/pollinations/pollinations#quick-start-3-steps) retrieved, current Quick Start requires account/API key|Removed false anonymous eligibility, moved to `gen.pollinations.ai/v1`; authenticated discovery/inference NOT run|Not counted as newly working keyless access; absent credential excludes from anonymous pool|
|OVH|Existing public-keyless claim; [registry reference](https://endpoints.ai.cloud.ovh.net)|Existing implementation, current public access NOT reverified|No uptime/speed/anonymous availability claim; ordinary cooldown/fallback applies|
|AI Horde|Existing public-keyless claim; [official project](https://github.com/Haidra-Org/AI-Horde)|Existing implementation, gateway permissions/protocol/inference NOT reverified|Queue/model availability uncertain; not newly confirmed operational|
|Kilo|[Official repository](https://github.com/Kilo-Org/kilocode) retrieved; product says no API keys required to start, but that does NOT establish anonymous API permission|Existing registry entry; anonymous API mode NOT verified|No operational claim; account-managed access must be distinguished from public keyless|
|LocalAI|Self-hosted research candidate; [official README](https://github.com/mudler/LocalAI) retrieved|**Research only**, not added as another unverified provider name|Potential adapter reuse; no running service/model or actual inference evidence|

No runtime/model weights are installed. Outbound network allows GitHub/npm/PyPI, not inference hosts. The new local integration is **implemented and fixture-tested, not confirmed operational**. No cloud/local speed, uptime, quality or token-throughput benchmark was measured. Public provider portfolio expansion therefore remains an unmet mandatory gate.

### Local setup (operator-controlled)

Run a privately bound llama.cpp server with a legitimately obtained compatible model, for example:

```sh
llama-server -m /path/to/model.gguf --host 127.0.0.1 --port 8081
# Backend environment:
LLAMACPP_ENABLED=true
LLAMACPP_BASE_URL=http://127.0.0.1:8081/v1
```

Ollama uses `OLLAMA_ENABLED=true` and `OLLAMA_BASE_URL=http://127.0.0.1:11434/v1`. For separate containers use a private service address reachable by the backend, not browser localhost. Never expose an unauthenticated model server publicly. Local inference is not automatically private if an operator changes its destination.

## E. Dynamic catalogs

- Provider `/models` (or existing Gemini discovery) remains the live source; admin provider inventory now consumes backend records, including providers unknown to frontend source.
- Default TTL **1 hour**, refresh coalescing, **30-second failure backoff**, last-good retention capped at **24 hours**, explicit source/freshness/last-success/failure metadata.
- Refresh occurs on use and authorized manual discovery; no all-provider startup probe or render-time polling added.
- Successful snapshots replace prior models, including authoritative empty catalogs. Explicit upstream `deprecated: true` / `active: false` entries are excluded.
- Fixture tests cover addition, rename, removal, deprecation, malformed JSON, failure, preserved stale data, stale expiry and concurrent refresh.
- **Remaining:** durable multi-worker catalog storage, per-provider administrative freshness settings, scheduled refresh, unified model-table migration, saved pinned-model reconciliation and complete capability provenance. Existing model-name tier/vision heuristics and curated UI scores still require audit; they are not independent quality evidence. Runtime bootstrap hints can still be used when discovery is unavailable.

## F. Routing and performance

Implemented policy improvements:

- Enforce enabled/credential/type checks, tenant destinations and active cooldowns before execution/cache reuse.
- Ranking excludes invented registry benchmark scores. Unknown observations contribute zero. Only same-model observations under **30 minutes** old contribute, with linear decay. Stable input order breaks ties.
- Explicit request priority and configured primary/credential preference remain deliberate policy heuristics, not quality claims.
- Shared adapter normalizes successful result provider/model and existing fallback records; candidate execution remains bounded by configured finite providers/key pools and adapter timeouts.
- Historical service observations record provider/model/status/latency, not private prompt content.

**Not delivered:** full Auto/Quality First/Speed First/Balanced/Manual policy UI, evidence-backed quality evaluation, capability-aware context/tool/vision eligibility across all paths, robust manual pin/fallback contract, overall request-wide deadline and complete cancellation/retry auditing. No real performance measurements were gathered. This is safer observed service ranking, not a complete intelligent-model-selection mandate.

## G. UI, parity and data accuracy

- Repaired discovery interaction, selected-provider request, disabled/loading refresh, error/retry and stale warnings.
- Replaced static provider inventory with backend inventory. A failed settings query renders a failure, not a real zero or healthy dashboard.
- Keyless providers count as zero API keys. Inference-verified badges require explicit success in the browser session; merely configured providers are unverified.
- Snapshot metrics description no longer falsely claims live latency/error-rate telemetry.
- Vite binds `0.0.0.0` and allows `.e2b.app`; preview-host request returned HTTP 200.
- Archived implementations and shallow historical baseline were observed, but complete legacy/visual parity was **not performed**. Curated model tables and other dashboard claims remain unresolved work.

## H. Executed test results

|Command / category|Observed result|Meaning|
|---|---|---|
|Targeted catalog/engine/admin node tests|**49 passed / 49**|Mocked provider and deterministic catalog/API verification|
|`npm run test:ai-settings`|**13 passed / 13**|Overlaps admin suite; do not add as unique tests|
|`npm --prefix backend test` after upstream ledger merge and final provider change|**998 tests: 941 passed, 57 failed**, 4 suites|Full backend release gate FAILED|
|Exported baseline full backend|983: 924 passed, 59 failed|Diagnostic comparison only; export omitted some ancillary static paths|
|Failure-name differential|No new failure names against exported baseline|NOT proof all failures are harmless; see JSON register|
|Playwright isolated admin component/workflows|**37 passed / 37**, rerun after upstream merge|Mocked APIs; seven viewports, five subtabs, refresh, errors and overflow|
|`npm run build`|Passed TypeScript/Vite after upstream merge|Existing bundle-size warnings|
|Frontend oxlint|**0 errors, 313 warnings**|Not a clean warning-free lint gate|
|Frontend production dependency audit|**4 high**|FAILED|
|Backend production dependency audit|**10: 3 moderate, 6 high, 1 critical**|FAILED; includes proxy-addr critical advisory|
|Real public/local/credentialed inference|**Not run**|No operational provider certification|
|Full authenticated browser/tenant/database flows|Not certified|MariaDB and valid auth/service infrastructure needed|
|Independent Claude review|Unavailable|No exposed model configuration/delegation tool or Claude CLI|

Full backend failure names are preserved in `backend-failure-register.json`. Results include infrastructure/authorization/source-contract failures and require triage; they are not waived. Dependencies were not blindly force-upgraded.

### Reproduce focused checks

```sh
npm ci --prefix backend --ignore-scripts
npm ci --prefix frontend --ignore-scripts
node --test backend/test/freellmapi-catalog-integrity.test.js \
  backend/test/freellmapi-engine.test.js backend/test/ai-admin.test.js
npm run test:ai-settings
npm run build
npm --prefix frontend run lint
# Separate terminal:
npm --prefix frontend run dev -- --host 0.0.0.0
# With Playwright Chromium installed:
npm exec --prefix frontend -- playwright test --config=frontend/tests/engine-integrity.config.ts
```

Standard browser download was blocked (`cdn.playwright.dev`, ECONNRESET). Tests recovered using an external untracked npm `@sparticuz/chromium` 153.0.0 bundle with its libraries; `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/tmp/chromium`, `LD_LIBRARY_PATH=/tmp/al2023/lib`. No browser package or binary was added to application dependencies. Traces/screenshots on failure are ignored under `frontend/test-results/engine-integrity`.

## I. Git delivery ledger

|Commit|Change|Verification / remote status|
|---|---|---|
|`039a392fda09f3fc72d0c45a380bd6a10b52cdaa`|Discovery/cooldown integrity and initial evidence|28 engine + 8 new tests and build; pushed, remote hash independently verified|
|`952e67fe38f08d0914456656f34c5511106ab2e4`|Local integration, policy/cache/rank, truthful admin states and browser suite|49 targeted tests; 37 browser tests; build; pushed and remote hash independently verified|
|`26eda37`|Merge newer upstream dev ledger commit|Only two incoming ledger lines; post-merge build, settings/browser/full backend rerun|
|Documentation commit containing this report|Final limitations, failure register and delivery ledger|No application-code change; final remote verification recorded in final response|

All pushes target only the fixed session branch. PR remains draft because mandatory gates are unmet.

## J. Remaining blockers / review

1. Real inference validation for new local providers and public candidates; legitimate permitted public access not proven.
2. **Critical/high production dependency findings** and **57 backend failures** require investigation before release.
3. Unified dynamic model table, persisted model reconciliation, capability provenance and complete selection modes remain incomplete.
4. Independent strongest-available Claude review cannot be performed through available tools. A source self-review was performed and led to tenant/cache/ranking fixes, but is not independent approval.
5. Full route/permission/browser-history/modal/legacy/accessibility/security audit is unfinished.
6. Firebase dependencies request Node >=24.12; sandbox Node is 22.22.3. Builds ran, but runtime-support compatibility requires a supported deployment environment.

## K. Evidence-based readiness assessment

Numerical 10-point ratings would imply unmeasured precision. The defensible assessments are:

|Area|Assessment|
|---|---|
|Functional completeness|Partial; fixes verified, full mandate unmet|
|Provider diversity|Local integration added; practical operational expansion unverified|
|Catalog freshness|Improved and fixture-tested; process-local limitations remain|
|Routing intelligence|Safer observed ranking; quality/capability/mode mandate incomplete|
|Speed / response quality|Not measured|
|UI/UX|Five subtabs responsive in component harness; full app parity unverified|
|Data accuracy|Several false-health/zero/freshness states fixed; legacy catalog claims remain|
|Security|Tenant/cache boundaries strengthened; audit findings block release|
|Reliability|Focused regressions pass; full backend suite fails|
|Test quality|Meaningful deterministic and real-browser tests, explicitly mocked boundaries|
|Maintainability|Existing adapters reused, no runtime dependency/platform rewrite|
|Overall readiness|**NOT production-ready; draft incremental delivery only**|
