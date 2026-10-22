# Final-gap continuation — 2026-10-22

Live-state inspection found PR #47 already merged into dev as `bcc137a9cbe624ed666161a1e59dcf396072d701`, following the user's earlier explicit merge request. This session starts on fixed branch `arena/12d75a56-resumepilotai`; safely fast-forwarded to dev without resets, history rewriting or main modification. A merged PR cannot be made draft. Follow-up delivery uses a new draft PR to dev.

## Scope and measurable actions

- Benchmark protocol v2 keeps the original six strict checks unchanged and adds code tracing, verified-fact extraction, untrusted-instruction resistance, unsupported numerical-claim rejection, Hindi and ordering reasoning. Twelve applicable cases × three repetitions per model. Semantic quality explicitly remains null; failures distinguish output limit, reference/format, and transport/schema. Scores are not comparable to the old six-case totals.
- Both CPU inference containers now have the same two-CPU quota. This improves resource control but does not make distinct runners/hardware/quantization/tokenizers identical. Repeated measurements still include cold/prefix-cache effects.
- Added all-four-intelligent-mode regressions demonstrating that speed does not qualify unknown JSON support for structured candidate generation. Existing product content/parsing paths request JSON; no benchmark score or model-name rule is injected into tenant rankings. This is a capability safety test, not certification that JSON support guarantees semantic quality. Manual pins and legacy explicitly configured providers are not silently rewritten.
- Historical/current browser comparison uses `git archive` at immutable `2abbbe4401efd1945e2749127605bb7f80afe941`, an isolated temporary frontend, and the same current locked dependencies/disposable backend/test identity. No extra branch/worktree, main modification or old production credentials. Matched route/viewport/save-control/reload/history screenshots plus JSON observations; no pixel-equality claim. Historical code with current backend/dependencies is NOT historical deployed-production certification.

## Model-access investigation

No installed Claude executable, Claude configuration directory or Claude/Anthropic environment-variable names were found in this fresh execution environment. The prior official CLI probe is already recorded: Claude Code2.1.308, loggedIn:false/authMethod:none. Per the user's instruction, do not reinstall or retry the ineffective unauthenticated command. No model inventory or selected Opus ID is exposed by Arena's available tools.

**Required owner action:** provision an authenticated, authorized Claude Code/reviewer session in the approved environment (using that environment's secure sign-in/secret manager, not chat), permit repository read/test execution, select the highest available Opus from its actual inventory, and record the resolved model ID, reviewed PR head, findings and remediation. No independent review/Opus-use claim is made by this continuation.

## Additional provider research (official sources)

- Hugging Face Inference Providers: official `huggingface/huggingface_hub/docs/source/en/guides/inference.md`, authentication section documents HF access token or provider API key. Not another anonymous inference route; rejected as a keyless addition without authorized credentials.
- Puter: official [User-Pays Model](https://github.com/HeyPuter/puter/blob/main/src/docs/src/user-pays-model.md) explicitly says users sign in with their own Puter account and cover their usage/allowance. No developer API key does not mean anonymous inference. Rejected as a public-anonymous expansion; no unapproved account/SDK/proxy introduced.
- LocalAI: official mudler/LocalAI README documents local/self-hosted API compatibility. It is not a new public anonymous endpoint. Existing llama.cpp/Ollama paths already provide tested local serving; no registry-count-only addition or untested deployment claim.
- Existing Horde: one bounded legitimate synthetic attempt per validation workflow, capacity failures preserved. Public/default-private separation remains mandatory. No confidential content is used in this expanded evaluation.

## Firebase CLI recheck

Fresh npm metadata still reports Firebase CLI15.34.1 depending on chokidar^3.6.0, braces latest3.0.3. The previous incompatible override/downgrade is not applied. Runtime/deployment exposure and auth-only local emulator configuration remain as documented in FINAL_REPORT.md. Audits must report production and all-tree scopes separately; an unpatched dev-tool risk is not a patched finding.

All new claims require current-head hosted runs; historical green1076/backend and11/browser counts do not certify this new protocol/comparison. Keep the new PR draft and assignment active pending actual results and independent acceptance.

## Executed checkpoint

`aa7e76441e196f33e713ba191c4db834b05b9ddb`: engine39770826095 and quality39770826094 succeeded; backend1080/0skip, browser18 including seven historical/current comparisons, actual three-model108 generations and Horde. Broad workload failures are retained in benchmark-results.json. Publication requires fresh head checks; [current A–K](FINAL_REPORT.md) supersedes prior-session statuses. Independent Opus access and semantic qualification remain blocked/unverified; draft PR48, not10/10.
