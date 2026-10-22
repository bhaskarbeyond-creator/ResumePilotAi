## New acceptance increment (supersedes earlier current-risk/policy statements)

See [task qualification policy](TASK_QUALIFICATION.md). Runtime product-task qualification now uses fresh operator-controlled, tenant/credential/endpoint/model/task-scoped reviewed evidence; automatic recommendations fail closed on unknown/unreviewed product suitability, known critical failure also blocks pins. No production approvals shipped; self-review is not approval. New product suite uses realistic budgets and preserves original benchmark assertions. Actual hosted results for the next head are pending, not borrowed from9b9f.

Security re-investigation found no Firebase CLI usage beyond its devDependency; removed the unused CLI rather than unsafe override/obsolete downgrade. Removed Mammoth's vulnerable CLI chain by preserving DOCX text extraction via bounded fflate/native XML parsing. Fresh local root all/prod, frontend all/prod and backend all-tree audits are **zero findings**. Earlier3high/3moderate sections below are historical checkpoints, not remaining findings. Browser parser/regression validation of this replacement is mandatory before acceptance.

Independent Opus review remains blocked: no authorized executable/session/model inventory in this environment; Claude connector unsupported. No reinstall/login retries or fabricated ID. Owner must securely provision authorized reviewer, select actual highest available Opus and publish exact model ID, reviewed final SHA, findings and retests; never paste secrets in chat. Prior model totals remain historical; last9b9f Qwen0.5B was9/36, not12/36. Horde's last504 is preserved; no availability inference from older success.

---

# Current gap-closure checkpoint — 2026-10-22

Current fixed branch `arena/12d75a56-resumepilotai`; draft PR #48→dev. PR #47 was merged on explicit owner authorization, not left draft; historical branch/status descriptions below are archived context, not current authority.

|Requirement|Current evidence / remaining boundary|
|---|---|
|Final-head gates|Functional `aa7e76441e196f33e713ba191c4db834b05b9ddb`: hosted backend1080/0skip, browser18, both local servers and Horde, quality successful. Publication head needs its own fresh checks recorded in PR.|
|Broader evaluation|Protocol2 twelve applicable cases × three repeats × three models=108 actual generations; per-task correctness, failure categories, TTFT/latency/repeatability; semantic quality null. Models not production-resume qualified.|
|Five modes / isolation|Current-app live inference/persistence across all modes; four new regressions exclude unknown JSON support in intelligent structured selection; tenant/private-worker/key/cooldown/pin tests retained. No global benchmark ranking injection.|
|Provider expansion|Official Puter account-required; HF authenticated; LocalAI self-hosted. No additional reliable anonymous provider validated, no speculative adapter.|
|Security|Root prod/backend/frontend0; root all-tree3high dev Firebase chain persists. Latest supported metadata and concrete reachability/mitigation documented, no safe patch claimed.|
|Historical comparison|Seven genuinely running matched historical/current source comparisons, 14 screenshots and JSON. Reload/aliases/history/ready layout verified; no pixel/deployed or exhaustive historical interaction parity claim.|
|Independent highest Opus|Blocked: no authorized inventory/session; connector unsupported; no reinstall/repeated ineffective auth. Owner must securely provision reviewer, exact model ID/head/findings required.|
|General candidate quality|Unverified. Strict fixture failures disclosed; realistic-budget model qualification and independent semantic evaluation remain. Unknown structured capability fails closed, not selected on speed alone.|

See [current A–K report](FINAL_REPORT.md) for exact workflow/job IDs, security prerequisites and owner actions. **Not 10/10; keep draft; assignment active.**

---
## Historical prior-session matrix (not current branch/status)

# Mandate gap matrix — 2026-10-22 continuation

## Verified live baseline / authority

- Current session branch: `arena/e677cdb3-resumepilotai`, based on `e541b4d613e4a44425a56ff220bdf9c1a8f24069`; clean at inspection. This session cannot rename/switch its assigned branch.
- `git ls-remote --heads origin`: `dev` and `main` both resolve to `e541b4d`. No direct changes to either branch are authorized or made.
- GitHub API says PR #46 **MERGED**, at `2026-10-22T10:05:23Z`, head/merge `25038dc13d7b10277efddacaebc60ab18928ec5b`. Its historic green 1070/backend and 11/browser checks are preserved; a subsequent quality run was cancelled. They do not certify new changes.
- API comparison `25038dc...e541b4d`: only `.bridge/ledger.jsonl` and `.bridge/state.json` changed. Engine source at the new baseline matches the previous tested implementation, but new changes require their own checks.
- Follow-up delivery must be a **new draft PR to dev** from this session branch; a merged PR cannot remain draft or accept further commits. No merge/ready/close operation is authorized.

## Model access / independent review investigation

Exact session model identifier and selection controls are **not exposed** by the available API tools. No unsupported identifier is substituted. No exact Claude model ID has been used or verified.

- Initial `command -v claude codex opencode aider bridge pwsh`: no executables found. Subsequently investigated a legitimate install as described below.
- `gh extension list`: empty. Available Actions workflows are AI engine validation, quality gate, production release and Dependabot; none is a delegated-model reviewer.
- Environment variable **names only** checked for Claude/Anthropic/model/agent/bridge configuration: none found. No secret values inspected.
- `.bridge/send_to_claude.ps1` inspected: Windows `user32.dll`/clipboard/SendKeys automation aimed at an Antigravity desktop window, with a hardcoded older DIR-003 instruction. It neither selects a model nor provides an authorized remote execution interface in this Linux sandbox. Do not execute it or treat the filename as model evidence.
- `gh secret list` was denied with **403 Resource not accessible by integration**. This does not prove secrets do not exist; it proves this integration cannot inventory them. Do not request/extract credentials or fabricate an authorized Claude workflow.
- Connected tools expose no model inventory/selection or independent delegated reviewer. Model-policy compliance and mandatory Opus independent review therefore remain **blocked by evidenced external capability/access**. Implementation/self-review is not independent review.

## Authorized CLI alternative investigated

Official transient installation succeeded: `npm exec --yes --package=@anthropic-ai/claude-code -- claude --version` → **2.1.308**. `claude auth status` → `loggedIn: false`, `authMethod: none`, `apiProvider: firstParty`. Help exposes `--model`/`--agents`, but there is no authenticated model inventory/session/reviewer. No login flow, credential request, unauthenticated model execution or claim of Opus selection was made. The blocker is now evidenced **missing authorized model authentication**, not merely an absent executable. This does not expose or identify Arena's underlying session model.

## Requirement-by-requirement status

| # | Workstream | Status at this continuation | Evidence / action |
|---|---|---|---|
|1|Highest-capability Claude and independent review|Blocked by external capability/access|Investigation above; no exposed model ID/selector, CLI, reviewer workflow or authorized model credentials. No Opus/independent-approval claim.|
|2|Repository integrity and delivery|Partially complete|Live state fetched; prior PR merged externally. Fixed new session branch; created draft PR #47 to dev; independently verified every remote push.|
|3|Complete engine route coverage|Partially complete|Existing authenticated suite covers protected settings/discovery, subtab links, aliases, history, errors and dialogs. Re-run on new head; route/source review is not runtime proof.|
|4|Legacy parity / visual comparison|Partially complete|Previous tests plus archived code and baseline source available. No current deployed historical reference or full matched before/after screenshots independently verified.|
|5|Legitimate working keyless paths|Partially complete|Historic actual llama.cpp and anonymous Horde proof, not current availability. Add actual Ollama CPU inference with a distinct model via the existing adapter. Official local API ignores SDK key; cloud requires account/key. No public anonymous diversity invented.|
|6|Dynamic discovery lifecycle|Partially complete pending current-head rerun|Canonical bounded credential/endpoint-scoped discovery; authoritative empty catalog; fixtures for changes/stale/failure/concurrency. Audit new privacy gating before public discovery.|
|7|Intelligent selection/fallback|Partially complete|Persisted five modes and capability/tenant restrictions exist. Quality remains unknown; capability fit and service observations are not measured semantic superiority. Review credential-specific catalog failover separately.|
|8|Measured quality and speed|Partially complete (executed bounded evaluation)|New loopback-only streaming benchmark, six synthetic assertion workloads × three repetitions, eligible long-context task, TTFT/latency/identity/usage/failures/repeatability. Executed 54 genuine streamed samples across three models; actual correctness 0/18, 10/18, 15/18 at validated production-code checkpoint. Human/general quality and long-context evidence remain unavailable; harness tests are not model results.|
|9|Security/tenant/privacy/data integrity|Partially complete|Confirmed gap: registry opt-in alone allowed private candidate traffic to community workers. New confidential-default routing guard prevents even public discovery for ordinary requests; synthetic verifier explicitly opts in. Existing tenant tests must re-run.|
|10|Responsive authenticated UI|Partially complete pending current-head rerun|Existing 7 viewports, all five modes with real execution, permissions, dialogs and history; no new UI styling claimed. Historical visual parity remains narrower than full production certification.|
|11|Full regression/build/lint/audits|Partially complete pending execution|Historical counts are not reused as new passes. Full hosted MariaDB and authenticated browser plus quality workflow mandatory. Current root lock audit: 3 dev-only high, 0 critical; fresh all-tree audits required.|
|12|Release readiness|Incomplete|No release certification, 10/10 score, ready/merge action or independent review. Publish exact measurements, current-head checks and remaining external blockers.|

## Approved directive implementation boundaries

The user's explicit autonomous mandate covers: benchmark harness/tests and hosted measurement, existing local adapter verification, canonical public-worker privacy guard and regressions, relevant dependency investigation, evidence documentation and draft follow-up delivery. No unrelated product/template edits, dependency overrides, production branch writes, private prompts, benchmark-driven production ranking or model-access bypasses.

## Dependency investigation

Fresh npm registry: Firebase CLI latest **15.34.1** still declares `chokidar ^3.6.0`; braces latest **3.0.3** remains affected by GHSA-vfj7-8cjw-p6xm. Fresh root lock audit reports the same three high nodes (braces, chokidar, firebase-tools), no criticals. npm's offered downgrade to Firebase 6.8.0 is not a compatible fix. No blind major chokidar override. Runtime exposure, deployment use and compensating controls must be documented separately from production audit results.

## Latest executed production-code checkpoint

`1e3ebd9de0dfecdc52dfaff0df14bff1714f8ce4`: full hosted backend **1076/1076, zero skipped**; authenticated browser **11/11** with actual all-mode inference; full quality gate success; actual Ollama/Qwen evaluation success. Anonymous Horde latest attempt **timed out 504** and remains visibly failed. Local full backend **1035 / 1001 pass / 34 DB-environment failures**, no skips; local product763/static71/benchmark5 passed; build passed, lint0errors207warnings. Root/backend/frontend production audit0; root all-tree3dev-high, backend/frontend all-tree0.

Catalog review additionally fixed per-credential discovery/dispatch scopes and deferred destination cooldown until remaining eligible credentials are exhausted, including both streaming and completion. No tenant observations were promoted into shared platform quality scores. See FINAL_REPORT.md for exact links and BENCHMARK.md for method/limits. Screenshot readiness was strengthened in the subsequent publication; its final-head checks must be evaluated separately.

## Subsequent upstream integration — current publication boundary

Final remote reconciliation discovered new developer commits `2dea970b` / `6148f4bc2f1f7c41734b54180de868d4602bde40` on both dev and main. They changed frontend AI modals, quota badge, file importing and resume-builder surfaces. They were preserved via merge `42147123d15b2c8485ea85402ba1a82a1ce31854` into the fixed session branch; no main/dev write was performed by this agent. Earlier statements about main/dev hashes describe their observed checkpoint, not current remote heads. **Earlier green checks do not certify the combined source.** Fresh combined-head validation is required and is recorded in the PR. Local combined product763, lint0errors/207warnings and build passed. The historical screenshot comparison uses current locked dependencies, which now include these upstream additions; it remains source comparison, not historical deployment certification.

The upstream Mammoth1.13.0 dependency introduces **three moderate frontend all-tree findings** (`mammoth → argparse1 → sprintf-js1.1.3`, GHSA-hp3w-g68c-fv3c). Latest Mammoth still uses argparse~1.0.3 and sprintf-js latest is1.1.3; npm proposes an incompatible Mammoth0.3.29 downgrade, not a supported patch. Source investigation found argparse imported by `mammoth/bin/mammoth`, not the browser library entrypoint; the application imports `mammoth` for local DOCX extraction and does not invoke that CLI. Unbounded attacker-controlled precision format strings reaching sprintf are the DoS prerequisite. Browser use is a reduced reachable surface, **not a patched installed graph or blanket parser safety assertion**. Keep CLI formatting/configuration inputs trusted; a supported upstream patch or approved parser replacement plus import regressions is required to close the finding. No override/downgrade/suppression applied. Earlier frontend-zero audits are historical checkpoint results only.

New upstream CV/PDF import and quota/modal features are **not exhaustively certified by the admin-engine browser suite**. An inherited binary-text fallback was identified and fixed: PDF now uses the existing PDF.js dependency with a local worker, no rendering, 12MB/50-page/100k-character bounds and cancellation; invalid DOCX/PDF and legacy DOC fail closed instead of sending binary-as-text to AI. A new real-browser test extracts synthetic PDF and DOCX fixtures and rejects corrupt binaries. Its hosted result must be verified at the new head; this does not certify all parser edge cases or upstream modal workflows. Developer work was not removed or silently declared complete. Independent Opus review and semantic/candidate qualification remain open; draftPR48, not10/10.
