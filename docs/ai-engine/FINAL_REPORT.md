# AI Multi-Provider Engine — continued A–K evidence report

2026-10-22 · **Assignment active · Draft follow-up PR #47 → dev · Not 10/10 certified**

Historical reports remain in Git history. This continuation starts from live `e541b4d`, not an assumed open PR #46. See [gap matrix](GAP_MATRIX.md), [provider register](provider-register.json), [benchmark protocol](BENCHMARK.md), [actual benchmark summaries](benchmark-results.json), and [legacy comparison](LEGACY_PARITY.md).

## A. Model compliance

**No Claude engineering/reviewer model ID was selected or verified.** Arena does not expose a verifiable session model ID or selector through the available tools. No identity is guessed.

Investigation went beyond the earlier missing-executable check: installed the official CLI transiently using `npm exec --yes --package=@anthropic-ai/claude-code -- claude --version`: **Claude Code 2.1.308**. This is a CLI version, **not a model identifier**. `claude auth status` returned `loggedIn: false`, `authMethod: none`, `apiProvider: firstParty`. Help exposes `--model` and `--agents`, but unauthenticated controls are not authorized model access or a verified model inventory. No credentials were requested or supplied.

No delegated reviewer is exposed, gh extensions are absent, and available repository workflows contain no authorized Claude reviewer. The Windows clipboard/SendKeys `.bridge/send_to_claude.ps1` neither selects a model nor provides an accessible remote model API here. Actions secret inventory returns **403 Resource not accessible by integration**; secrets are not assumed absent or extracted. Highest-capability Opus implementation/review compliance remains an **evidenced external access blocker**. Implementation/self-review is not independent approval.

## B. Repository status

- Fixed session branch: `arena/e677cdb3-resumepilotai`; no branch switching, destructive reset, force push or production branch write.
- Live verification found PR #46 **merged externally at 2026-10-22T10:05:23Z**. Its head/merge is `25038dc`; remote `dev` and `main` both resolved to `e541b4d613e4a44425a56ff220bdf9c1a8f24069`. The only intervening files were Bridge ledger/state. No agent merge was performed.
- Created **[draft PR #47 → dev](https://github.com/bhaskarbeyond-creator/ResumePilotAi/pull/47)** because a merged PR cannot accept continuation commits. All pushes use the fixed new branch and were independently checked with `git ls-remote`.
- Validated production-code checkpoint: **`1e3ebd9de0dfecdc52dfaff0df14bff1714f8ce4`**. [Engine run](https://github.com/bhaskarbeyond-creator/ResumePilotAi/actions/runs/39763574719), [quality run](https://github.com/bhaskarbeyond-creator/ResumePilotAi/actions/runs/39763574718).
- Subsequent publication adds documentation and a screenshot-readiness assertion, not production engine changes. Read its current-head checks for the final assertion; previous passes are not silently attributed to later code.

## C. Remaining-gap matrix

The twelve-workstream [GAP_MATRIX.md](GAP_MATRIX.md) records per-requirement status, source evidence, actions and external limitations. It is not a checklist marked complete merely because documentation exists.

Closed material gaps: reproducible executed measurements; an actual second local serving path and additional models; confidential-default public-worker exclusion; per-credential catalog eligibility; and pooled-destination cooldown correctness. Full historical/deployed visual parity, authoritative general quality evaluation and independent Opus acceptance remain unverified/blocked as specified below.

## D. Provider register

The machine-readable [provider-register.json](provider-register.json) lists **all 75 registered entries**, their adapter/access classification, authentication requirements, source links, actual inference evidence and privacy restrictions. Registry membership is **not operational proof**.

- **llama.cpp:** actual discovered model → canonical Balanced generation, plus 18 direct streaming measurements, licensed small SmolLM2 GGUF. Self-hosted, not public anonymous.
- **Ollama:** official CPU server, canonical Balanced generation, actual streaming measurements for **Qwen2.5 0.5B and 1.5B**. Local API ignores SDK dummy keys; cloud API requires credentials. Official documentation was retrieved from the current GitHub `docs/api/openai-compatibility.mdx` and `docs/docker.mdx`; stale registry link corrected. No duplicate adapter added.
- **AI Horde:** prior genuine anonymous nonempty generation exists, including this continuation. **Latest checkpoint request failed** with `REQUEST_TIMEOUT`, HTTP 504, community queue. [Failed job](https://github.com/bhaskarbeyond-creator/ResumePilotAi/actions/runs/39763574719/job/119773932737). One bounded submission; normal polling and cancellation, no evasion/retry-to-green. Not continuously available.
- **Kilo/Pollinations:** documented credentials/account requirements retained; no authorized live credential/inference claim.
- **OVH/other entries:** unverified. Removed the unsubstantiated LLM7 “anon ok” label. No exposed keys, unofficial auth bypass, account automation or inflated working-provider count.

**Public community workers cannot process ordinary candidate traffic.** Default confidential requests are excluded before catalog discovery or dispatch. Only trusted synthetic verification explicitly opts in; client request bodies cannot enable that flag. Local/self-hosted and approved credentialed destinations remain subject to tenant policy.

## E. Dynamic catalog and runtime routing

Canonical discovery retains stream-time response bounds, entry/concurrency bounds, credential/endpoint identity, TTL, freshness, single-flight, error backoff and bounded stale data. Successful empty catalogs remain authoritative. Additions, metadata updates, renames, removals, malformed catalogs and outages have deterministic regressions.

New findings/fixes:

1. First-key discovery could exclude an otherwise valid pool or authorize another credential using the first key's catalog. Intelligent selection now discovers eligibility **per credential**, keeps dispatch keys scoped to that eligible catalog and survives a revoked first credential.
2. Manual model/provider pins remain fixed while allowing other eligible credentials for that **same destination**. No silent provider/model substitution.
3. Credential-scoped candidates do not bench the shared destination while another eligible credential remains; both completion and streaming regression tests exercise first-key 401 then success. Executed-destination key-attempt counts remain accurate.
4. Public-worker privacy enforcement happens before cache lookup, so cached public results cannot bypass private destination policy. A prior OVH-based cache fixture was changed to a local Ollama fixture, preserving all isolation assertions and adding positive destination eligibility; the failure was fixed, not skipped.

Modes remain Auto/Recommended, Quality First, Speed First, Balanced and Manual. Capability/context/task eligibility, tenant restrictions, recent service reliability/latency and explicit preferences drive selection. **Quality First is capability fit/service evidence, not a general semantic-quality score.** Benchmark measurements are host/model/workload specific and are not unsafely injected into unrelated tenants' production ranking. Unknown quality remains unknown.

## F. Actual benchmark results

Revised protocol: six synthetic tasks × three repetitions per model, temperature 0, 96 output tokens, streamed responses. Captures executed model, generation/error counts, strict reference/format checks, TTFT, total latency, actual usage where provided, finish reasons and hash-based repeatability. No raw candidate/user content or generated output is committed. No inference retries or fabricated costs.

|Actual local model|Generated / attempted|Strict checks correct|P50 latency ms|P95 latency ms|P50 TTFT ms|
|---|---:|---:|---:|---:|---:|
|SmolLM2-135M Q4_K_M / llama.cpp|18/18|0/18|955.51|1250.80|19.26|
|Qwen2.5 0.5B / Ollama|18/18|10/18|716.98|3028.09|42.31|
|Qwen2.5 1.5B / Ollama|18/18|15/18|605.67|2581.97|80.96|

Measured at `10:32:15.303Z` and `10:33:37.570Z`, 2026-10-22. [llama.cpp job](https://github.com/bhaskarbeyond-creator/ResumePilotAi/actions/runs/39763574719/job/119773932370), [Ollama job](https://github.com/bhaskarbeyond-creator/ResumePilotAi/actions/runs/39763574719/job/119773932878). Full sanitized samples and image/model digests are retained in job summaries/artifacts; compact summaries are committed in [benchmark-results.json](benchmark-results.json).

**Limitations:** strict small synthetic set, lexical summary checks rather than semantic adjudication, no validated human/independent evaluator, unknown cost, long-context cases ineligible because catalog context support is unverified. Different hosted jobs/server thread defaults are not a universal speed comparison. The two Qwen workloads share one host; temperature zero was not assumed perfectly deterministic. A 0/18 transport fixture is not demonstrated suitable for candidate generation. A measurement job passing does not mean its quality assertions all passed. No general model-quality or 10/10 conclusion follows.

## G. Security

Production audits executed after changes: **root 0, backend 0, frontend 0**. Backend/frontend **all-dependency** audits also **0**.

Root all-dependency audit still reports **three high, zero critical**: `firebase-tools → chokidar 3 → braces 3.0.3`, GHSA-vfj7-8cjw-p6xm. Fresh official npm metadata: Firebase latest **15.34.1** still uses chokidar `^3.6.0`; braces latest **3.0.3** is affected. No supported safe patch was available. npm's downgrade to Firebase 6.8.0 is not compatible; forcing chokidar 4 would change glob-ignore semantics.

Actual exposure: deep attacker-controlled glob patterns in optional local CLI/emulator tooling can exhaust the stack. `npm ls braces --omit=dev` is empty. Application/runtime/release scripts do not import or invoke Firebase CLI; `firebase.json` declares local auth/UI emulators, not a user-supplied functions watcher. Keep emulator/configuration inputs trusted, review changes, do not run the CLI as a production service, and omit development packages in production. This is mitigation/residual risk, **not** a claim that the vulnerable package was patched or all-tree audit is green.

Existing critical proxy-addr/Nodemailer/gRPC/root runtime fixes were preserved. New privacy/credential/cache/cooldown tests supplement tenant authorization, isolation and data-integrity tests. No credentials, model weights, production datasets or private prompts were committed.

## H. Legacy/UI parity

[LEGACY_PARITY.md](LEGACY_PARITY.md) records historical source (`2abbbe4`), prior merged UI (`25038dc`), current source, controls, settings, dialog and route comparisons. Authenticated browser proof covers all seven specified viewports, five subtabs, three additional top-level sections, reload/deep links, `/adm`/`/platform` aliases, Back/Forward, real saved modes/inference, role denial, recovery and five dialogs.

Current full-page screenshots are retained in Actions artifacts. A final assertion waits for the actual Runtime model selection panel after Forward before capturing, rather than treating a transient loading screen as visual proof. Screenshots are **current**, not invented historical before/after images. Artifact download redirects to Azure Blob are inaccessible from this sandbox (EOF); no manual pixel inspection of inaccessible images is claimed.

Deployed legacy/production reference access and pixel-matched historical runtime screenshots remain unverified. Historical source comparison and frozen CV invariants are evidence of narrower parity, not full production-browser certification.

## I. Executed tests and gates

At exact production-code `1e3ebd9d`:

- **Full hosted backend, real migrated MariaDB: 1076/1076, zero skips**, [job 119773932773](https://github.com/bhaskarbeyond-creator/ResumePilotAi/actions/runs/39763574719/job/119773932773).
- **Authenticated full-app Playwright: 11/11**, actual local inference for all five modes and seven viewports, [job 119773932370](https://github.com/bhaskarbeyond-creator/ResumePilotAi/actions/runs/39763574719/job/119773932370).
- **Full quality gate passed**, including migration/rollback/preflight, backend/security, product, lint, build and production audits, [job 119773698412](https://github.com/bhaskarbeyond-creator/ResumePilotAi/actions/runs/39763574718/job/119773698412).
- **Ollama actual inference and measurements passed**; anonymous Horde **failed** as disclosed above. External availability is separate from deterministic gates.
- Local full backend **1035 tests, 1001 pass, same 34 database-environment failures, zero skips**; no local MariaDB/Docker. Full hosted proof is required, not waived.
- Local product **763/763** across five runs (736+1+8+3+15); initial missing-history baseline invariant failure fixed by fetching Git history, not changing the assertion.
- Local security/static **71/71**; benchmark harness **5/5**; frontend TypeScript/production build passed; lint **0 errors, 207 existing warnings**; existing bundle-size warning remains.
- Audits as above. New production dependency count: **zero**. Full original 57-failure register is retained and all failures remain covered by hosted full regression.

The latest documentation/screenshot-readiness publication has its own checks; read that head's results rather than attributing this checkpoint to future changes.

## J. Independent review

**Blocked, not passed.** Exact reviewer model ID: **none**. No separate authorized Opus reviewer is authenticated or exposed. CLI install/auth investigation is in A. No simulated review, hidden reasoning trace, invented model ID or self-approval is supplied.

Self-review materially identified public-worker privacy, credential-catalog isolation, premature pooled cooldown, misleading anonymous label, benchmark answer leakage/weak assertions and screenshot readiness. These findings were remediated/tested, but self-review does not satisfy the mandate. An authorized reviewer must inspect the actual PR head/diff/tests independently, verify the resolved Opus model ID, challenge provider/quality/security claims and report concise findings before any readiness decision.

## K. Evidence-based assessment

Ratings are categorical, not invented decimal precision or correctness percentages relabeled as overall quality.

|Dimension|Assessment|
|---|---|
|Functional completeness|Improved and core-regression verified; full release acceptance incomplete|
|Provider diversity|Real expansion: two self-hosted stacks, three measured models; anonymous community capacity intermittent|
|Dynamic discovery|Strong deterministic lifecycle/credential-scoping evidence; vendor metadata completeness varies|
|Routing intelligence|Capability/service/policy based; semantic quality ranking remains explicitly unknown|
|Measured quality|Real but limited strict workload: 0/18, 10/18, 15/18; insufficient for general superiority|
|Speed|TTFT/latency actually measured; no production SLA or cross-host speed-winner claim|
|UI/UX|Seven-size authenticated behavior and captured current screenshots; historical pixel/deployment parity unverified|
|Security|Production trees clean; strengthened confidentiality/tenant/key scopes; dev-tool residual risk disclosed|
|Reliability|Full deterministic gates pass; public community availability remains unreliable|
|Maintainability|Existing canonical service/adapters reused; bounded dependency-free harness; no application rewrite|
|Overall readiness|**Not 10/10 certified; independent Opus acceptance and stated reference/evaluation limits remain**|

Keep PR #47 draft and assignment active. Do not merge, mark ready, close the assignment or modify production `main` based on this report.
