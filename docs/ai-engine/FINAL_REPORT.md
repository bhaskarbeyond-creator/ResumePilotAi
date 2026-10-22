# AI engine — current A–K gap-closure report

2026-10-22 · **Assignment active · Draft [PR #48 → dev](https://github.com/bhaskarbeyond-creator/ResumePilotAi/pull/48) · Not 10/10 certified**

Functional checkpoint **`aa7e76441e196f33e713ba191c4db834b05b9ddb`**: [engine validation](https://github.com/bhaskarbeyond-creator/ResumePilotAi/actions/runs/39770826095), [quality](https://github.com/bhaskarbeyond-creator/ResumePilotAi/actions/runs/39770826094), both successful. Documentation publication is a subsequent head and must pass its own fresh checks; exact publication-head verification is recorded in the PR, not inferred from these passes. Previous reports remain in Git history.

## A. Model compliance

**No exact Opus model ID or independent review was obtained.** This environment exposes no authorized model selector/inventory or delegated reviewer. Current workspace has no Claude executable/configuration or Claude/Anthropic environment variable names. The prior official CLI 2.1.308 probe returned loggedOut/authMethod none; it was not an Opus execution. The Claude connector lookup is unsupported. No reinstall, ineffective repeated login attempt, fabricated identifier, secret request, or authentication bypass was used.

**Owner action:** securely provision an authorized reviewer session (here or in an approved external environment), obtain its actual available model inventory, select the highest authorized Opus model, review the final PR head and diff independently, and publish the exact model ID, reviewed SHA, findings and resolution/retest evidence. Do not paste credentials into chat. Self-review does not satisfy this requirement.

## B. Repository and delivery

Fixed branch `arena/12d75a56-resumepilotai`; fetched and fast-forwarded the merged developer work before changes. PR #47 was explicitly merged on the owner's preceding request, merge `bcc137a9cbe624ed666161a1e59dcf396072d701`; a merged PR cannot return to draft. New PR #48 remains draft. Latest observed `dev` is that merge, `main` remains `e541b4d613e4a44425a56ff220bdf9c1a8f24069`. No direct main/dev push, force push, reset, branch switch or new merge in this continuation. Pushes verified with `git ls-remote`.

## C. Gap status

[Gap matrix](GAP_MATRIX.md) distinguishes completed evidence from remaining acceptance. New implemented evidence: protocol-v2 evaluation with six additional grounding/adversarial/coding/Hindi/reasoning cases, all-workload failure aggregates, equal two-CPU container quotas, four capability-eligibility regressions, and an isolated immutable historical-source browser comparison with separate optimizer caches. No production provider count was padded and no synthetic score was injected into tenant rankings.

## D. Providers and access

[Register](provider-register.json) retains all 75 entries; registration is not operational proof. Actual canonical inference succeeded for local llama.cpp, local Ollama and public-anonymous AI Horde at this checkpoint. Horde is low-priority/bounded and has historical genuine 504 queue failures; current success is not an availability guarantee.

Fresh official research: [Puter User-Pays](https://github.com/HeyPuter/puter/blob/main/src/docs/src/user-pays-model.md) explicitly requires users' signed-in accounts/allowances; no developer API key does not mean anonymous. [Hugging Face Inference Providers](https://github.com/huggingface/huggingface_hub/blob/main/docs/source/en/guides/inference.md) requires an HF token or provider key. [LocalAI](https://github.com/mudler/LocalAI) is self-hosted, not a verified public anonymous service. Kilo/Pollinations credential requirements remain recorded. No additional reliable anonymous provider was validated; no guessed endpoints, exposed keys, unapproved accounts or duplicate serving adapters added.

Confidential-default traffic cannot use public community workers, including cached results. Only trusted synthetic verification opts in; HTTP request bodies cannot enable that flag.

## E. Catalogs, modes and suitability

Live discovery and per-credential eligibility, endpoint identity, TTL, stale/error semantics, tenant/destination isolation, bounded retries/cooldowns and manual-pin behavior remain intact. All five modes were exercised with actual local inference in the authenticated suite. Four new regressions verify that Auto/Recommended, Quality First, Speed First and Balanced **exclude unknown JSON capability for structured tasks**, even when latency would favor the candidate. Manual pins are not silently replaced.

Quality First is capability/service-evidence fit, **not validated semantic quality**. Benchmark results below do not qualify these models for candidate work and do not enter cross-tenant production ranking. Non-JSON domain suitability still needs stronger workload-specific qualification/human evaluation; a JSON support flag alone cannot prove factual quality.

## F. Reproducible actual evaluation

Protocol 2: twelve applicable tasks × three repetitions × three models = **108 genuine generations**, zero transport/schema failures. An additional long-context task was ineligible for each model because catalog support was unverified, not counted successful. Temperature 0, max 96 output tokens, single concurrency, streaming, no inference retries or warmup exclusion. Two-CPU quotas match; runner behavior, quantization, implementations and prompt caches still limit cross-model comparisons.

|Model / serving path|Strict correct|Latency P50 / P95 ms|TTFT P50 ms|
|---|---:|---:|---:|
|SmolLM2-135M Q4_K_M / llama.cpp|0/36|426.68 / 1120.38|18.05|
|Qwen2.5 0.5B / Ollama|12/36|568.41 / 3388.97|42.30|
|Qwen2.5 1.5B / Ollama|21/36|985.66 / 6852.20|79.03|

Measured 11:29:30.700Z / 11:31:34.018Z. [Machine-readable results](benchmark-results.json) contain per-task correctness, output-limit/reference/transport failure categories and repeatability. All three models scored **0/3 on grounded extraction, unsupported quantitative-claim rejection and the original strict JSON task**. Qwen 1.5B passed untrusted-instruction handling 3/3 but failed Hindi 0/3 and code tracing 0/3 (output limit). Do not recommend these fixtures as production resume models based on responsiveness or aggregate score. The 96-token budget can itself cause failures; these are workload-specific observations, not universal incapability findings.

Semantic quality/cost remain unmeasured, not invented. Original six checks were preserved; /36 protocol-v2 totals cannot be directly compared with historical /18 totals. Synthetic/licensed content only; no candidate/private text or generated output committed. See [protocol](BENCHMARK.md).

## G. Security and dependency risk

Fresh local audits: root production **0**, backend all-tree **0**, frontend all-tree **0**; root all-tree **3 high / 0 critical**. Residual dev-only chain: `firebase-tools → chokidar 3 → braces 3.0.3`, GHSA-vfj7-8cjw-p6xm. Latest official npm Firebase 15.34.1 still depends on chokidar ^3.6.0; braces latest 3.0.3 is affected. No supported patch found; no incompatible override, obsolete Firebase downgrade or audit suppression used.

Attack prerequisite: attacker-controlled deeply nested glob patterns must reach the optional CLI tooling. Root `firebase.json` configures local auth/UI emulators, not an application-supplied functions watcher. Application/release scripts do not import/invoke Firebase CLI; production dependency graph excludes it. This is source/dependency exposure evidence, **not deployed-image attestation or a patched all-tree graph**. Keep configuration/glob inputs trusted/reviewed, do not expose CLI as a production service, omit dev dependencies from production. Removing the CLI requires an approved replacement for the documented emulator workflow; otherwise wait for a compatible upstream fix, then retest emulator and all-tree audits. Residual DoS risk remains.

Hosted actions also emit Node20 runtime deprecation warnings while the runner forces Node24; checks passed, warning is not concealed or treated as a dependency fix.

## H. Historical UI comparison

**Executed**, not source inspection alone: immutable `2abbbe4401efd1945e2749127605bb7f80afe941` frontend archived into a temporary directory, current locked dependencies and disposable real backend, same signed synthetic identity and representative backend data. Seven matched sizes: 320×568, 390×844, 430×932, 768×1024, 1366×768, 1440×900, 1920×1080. Fourteen historical/current ready-state screenshots plus comparison JSON are retained with the current-app screenshots.

Both sources rendered Save All Changes, reloaded, normalized `/adm`, and navigated Back/Forward at every size. Observed document width equals viewport width for both sources at all seven sizes. Separate current-app cases cover persistence, five modes, real generation, permissions, catalog failure/retry and five dialogs. This does **not** mean every historical dialog/save/error workflow was replayed equivalently.

[Boundary report](LEGACY_PARITY.md): not the old deployed backend/dependencies, not pixel equality, no claim of manual image inspection or exhaustive historical browser/role parity. Historical static catalog claims are not retained as current runtime truth.

## I. Executed gates

At functional checkpoint `aa7e76441e196f33e713ba191c4db834b05b9ddb`:
- Real migrated MariaDB backend: **1080/1080 passed, zero skipped** ([job](https://github.com/bhaskarbeyond-creator/ResumePilotAi/actions/runs/39770826095/job/119797617559)).
- Authenticated full-app browser: **18/18 passed** — original 11 plus seven historical comparisons ([job](https://github.com/bhaskarbeyond-creator/ResumePilotAi/actions/runs/39770826095/job/119797617837)).
- Local llama.cpp, two Ollama models and bounded anonymous Horde: genuine inference succeeded; 108 strict benchmark attempts recorded.
- Quality gate: success ([run](https://github.com/bhaskarbeyond-creator/ResumePilotAi/actions/runs/39770826094)); includes product, static security, benchmark tests, type checking, lint/build and scoped audits.

Local scope: product **763 passed**, static **71 passed**, selection + benchmark **26 passed**; lint 0 errors / 207 existing warnings, frontend build succeeded. Full local backend **1039 collected / 1005 passed / 34 failed** without MariaDB; this was not called green. Hosted real-DB results above resolve that environment-specific verification gap. Compilation/test enumeration is not browser execution. Publication-head checks must be freshly verified in the PR.

## J. Independent review

Blocked as in A. No external approval, actual Opus identity or general semantic judge result is fabricated. Source self-review and passing tests are not independent acceptance.

## K. Assessment / remaining acceptance

Substantial additional reproducible evidence, but **not 10/10 and not ready/merge authorization**. Remaining: authorized highest-Opus independent review of final head; validated semantic/candidate-work qualification with suitable models and realistic budgets; upstream dev-tool vulnerability resolution or approved workflow replacement; deployed historical/pixel parity and exhaustive old workflow coverage remain unverified. No general intelligence score or production availability guarantee inferred. PR #48 remains draft; assignment active.

## Subsequent upstream integration — current publication boundary

Final remote reconciliation discovered new developer commits `2dea970b` / `6148f4bc2f1f7c41734b54180de868d4602bde40` on both dev and main. They changed frontend AI modals, quota badge, file importing and resume-builder surfaces. They were preserved via merge `42147123d15b2c8485ea85402ba1a82a1ce31854` into the fixed session branch; no main/dev write was performed by this agent. Earlier statements about main/dev hashes describe their observed checkpoint, not current remote heads. **Earlier green checks do not certify the combined source.** Fresh combined-head validation is required and is recorded in the PR. Local combined product763, lint0errors/207warnings and build passed. The historical screenshot comparison uses current locked dependencies, which now include these upstream additions; it remains source comparison, not historical deployment certification.

The upstream Mammoth1.13.0 dependency introduces **three moderate frontend all-tree findings** (`mammoth → argparse1 → sprintf-js1.1.3`, GHSA-hp3w-g68c-fv3c). Latest Mammoth still uses argparse~1.0.3 and sprintf-js latest is1.1.3; npm proposes an incompatible Mammoth0.3.29 downgrade, not a supported patch. Source investigation found argparse imported by `mammoth/bin/mammoth`, not the browser library entrypoint; the application imports `mammoth` for local DOCX extraction and does not invoke that CLI. Unbounded attacker-controlled precision format strings reaching sprintf are the DoS prerequisite. Browser use is a reduced reachable surface, **not a patched installed graph or blanket parser safety assertion**. Keep CLI formatting/configuration inputs trusted; a supported upstream patch or approved parser replacement plus import regressions is required to close the finding. No override/downgrade/suppression applied. Earlier frontend-zero audits are historical checkpoint results only.

New upstream CV/PDF import and quota/modal features are **not exhaustively certified by the admin-engine browser suite**. In particular, source inspection shows `extractFileText` falls through to FileReader.readAsText for PDF/legacy DOC and DOCX extraction failures; unsupported binary import needs fail-closed handling and actual parser fixtures before claiming production import support. Developer work was not removed or silently declared complete. Independent Opus review and semantic/candidate qualification remain open; draftPR48, not10/10.
