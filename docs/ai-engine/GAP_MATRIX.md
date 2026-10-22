# Mandate gap matrix — 2026-10-22 continuation

## Verified live baseline / authority

- Current session branch: `arena/e677cdb3-resumepilotai`, based on `e541b4d613e4a44425a56ff220bdf9c1a8f24069`; clean at inspection. This session cannot rename/switch its assigned branch.
- `git ls-remote --heads origin`: `dev` and `main` both resolve to `e541b4d`. No direct changes to either branch are authorized or made.
- GitHub API says PR #46 **MERGED**, at `2026-10-22T10:05:23Z`, head/merge `25038dc13d7b10277efddacaebc60ab18928ec5b`. Its historic green 1070/backend and 11/browser checks are preserved; a subsequent quality run was cancelled. They do not certify new changes.
- API comparison `25038dc...e541b4d`: only `.bridge/ledger.jsonl` and `.bridge/state.json` changed. Engine source at the new baseline matches the previous tested implementation, but new changes require their own checks.
- Follow-up delivery must be a **new draft PR to dev** from this session branch; a merged PR cannot remain draft or accept further commits. No merge/ready/close operation is authorized.

## Model access / independent review investigation

Exact session model identifier and selection controls are **not exposed** by the available API tools. No unsupported identifier is substituted. No exact Claude model ID has been used or verified.

- `command -v claude codex opencode aider bridge pwsh`: no executables found.
- `gh extension list`: empty. Available Actions workflows are AI engine validation, quality gate, production release and Dependabot; none is a delegated-model reviewer.
- Environment variable **names only** checked for Claude/Anthropic/model/agent/bridge configuration: none found. No secret values inspected.
- `.bridge/send_to_claude.ps1` inspected: Windows `user32.dll`/clipboard/SendKeys automation aimed at an Antigravity desktop window, with a hardcoded older DIR-003 instruction. It neither selects a model nor provides an authorized remote execution interface in this Linux sandbox. Do not execute it or treat the filename as model evidence.
- `gh secret list` was denied with **403 Resource not accessible by integration**. This does not prove secrets do not exist; it proves this integration cannot inventory them. Do not request/extract credentials or fabricate an authorized Claude workflow.
- Connected tools expose no model inventory/selection or independent delegated reviewer. Model-policy compliance and mandatory Opus independent review therefore remain **blocked by evidenced external capability/access**. Implementation/self-review is not independent review.

## Requirement-by-requirement status

| # | Workstream | Status at this continuation | Evidence / action |
|---|---|---|---|
|1|Highest-capability Claude and independent review|Blocked by external capability/access|Investigation above; no exposed model ID/selector, CLI, reviewer workflow or authorized model credentials. No Opus/independent-approval claim.|
|2|Repository integrity and delivery|Partially complete|Live state fetched; prior PR merged externally. Fixed new session branch; establish new draft PR to dev and independently verify published hash.|
|3|Complete engine route coverage|Partially complete|Existing authenticated suite covers protected settings/discovery, subtab links, aliases, history, errors and dialogs. Re-run on new head; route/source review is not runtime proof.|
|4|Legacy parity / visual comparison|Partially complete|Previous tests plus archived code and baseline source available. No current deployed historical reference or full matched before/after screenshots independently verified.|
|5|Legitimate working keyless paths|Partially complete|Historic actual llama.cpp and anonymous Horde proof, not current availability. Add actual Ollama CPU inference with a distinct model via the existing adapter. Official local API ignores SDK key; cloud requires account/key. No public anonymous diversity invented.|
|6|Dynamic discovery lifecycle|Partially complete pending current-head rerun|Canonical bounded credential/endpoint-scoped discovery; authoritative empty catalog; fixtures for changes/stale/failure/concurrency. Audit new privacy gating before public discovery.|
|7|Intelligent selection/fallback|Partially complete|Persisted five modes and capability/tenant restrictions exist. Quality remains unknown; capability fit and service observations are not measured semantic superiority. Review credential-specific catalog failover separately.|
|8|Measured quality and speed|Incomplete → implementation in progress|New loopback-only streaming benchmark, six synthetic assertion workloads × three repetitions, eligible long-context task, TTFT/latency/identity/usage/failures/repeatability. Real hosted measurements required; harness tests are not model results.|
|9|Security/tenant/privacy/data integrity|Partially complete|Confirmed gap: registry opt-in alone allowed private candidate traffic to community workers. New confidential-default routing guard prevents even public discovery for ordinary requests; synthetic verifier explicitly opts in. Existing tenant tests must re-run.|
|10|Responsive authenticated UI|Partially complete pending current-head rerun|Existing 7 viewports, all five modes with real execution, permissions, dialogs and history; no new UI styling claimed. Historical visual parity remains narrower than full production certification.|
|11|Full regression/build/lint/audits|Partially complete pending execution|Historical counts are not reused as new passes. Full hosted MariaDB and authenticated browser plus quality workflow mandatory. Current root lock audit: 3 dev-only high, 0 critical; fresh all-tree audits required.|
|12|Release readiness|Incomplete|No release certification, 10/10 score, ready/merge action or independent review. Publish exact measurements, current-head checks and remaining external blockers.|

## Approved directive implementation boundaries

The user's explicit autonomous mandate covers: benchmark harness/tests and hosted measurement, existing local adapter verification, canonical public-worker privacy guard and regressions, relevant dependency investigation, evidence documentation and draft follow-up delivery. No unrelated product/template edits, dependency overrides, production branch writes, private prompts, benchmark-driven production ranking or model-access bypasses.

## Dependency investigation

Fresh npm registry: Firebase CLI latest **15.34.1** still declares `chokidar ^3.6.0`; braces latest **3.0.3** remains affected by GHSA-vfj7-8cjw-p6xm. Fresh root lock audit reports the same three high nodes (braces, chokidar, firebase-tools), no criticals. npm's offered downgrade to Firebase 6.8.0 is not a compatible fix. No blind major chokidar override. Runtime exposure, deployment use and compensating controls must be documented separately from production audit results.
