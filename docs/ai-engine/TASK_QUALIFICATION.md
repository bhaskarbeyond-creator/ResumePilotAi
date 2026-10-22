# Product-task qualification policy

This supplements—not replaces—catalog eligibility and the existing router. A discovered model is not a tested model; passing automated contracts is not independent semantic qualification.

## Runtime policy

Product operations in `aiRuntime` supply a server-owned task identifier. Four intelligent modes fail closed unless a matching **fresh, independently reviewed task record** exists. Capabilities, known context/output limits, cooldowns, destination/tenant restrictions and credential-specific discovery still apply first. Explicit model pins and Manual retain unknown evidence visibly rather than silently replacing the model; a known critical failure blocks even a pin. Provider-only pins still require qualification for automatic model selection. Legacy automatic configurations must migrate to an explicit selection mode; they cannot bypass task qualification. Legacy explicit-model pinned configurations retain unknown status but remove credentials with matching known failures. Generic gateway chat is not automatically inferred to be a resume task from prompt text; this is not a universal semantic classifier.

`FREELMAPI_QUALIFICATION_FILE` names an operator-controlled JSON file (max256KiB/256records). No HTTP body, frontend setting, user resume, shared benchmark file or metrics database can provide approvals. Missing/malformed/stale evidence is unknown. No qualified production certificates are shipped.

A file contains `schemaVersion:1`, `records:[]`. Each record needs:
- `scope`: `scopeFor(candidate, tenantContext)` from the server helper. Binds tenant ID (or explicit platform scope), provider, endpoint, actual model ID and credential hash. Unknown tenant identity cannot qualify.
- `jsonMode`: boolean matching the actual request contract. Plain JSON prompting and provider-enforced JSON are not interchangeable evidence.
- `task`: one of resume-write, resume-extract, job-match, ats-format, groundedness, injection, grammar, multilingual, interview.
- `measuredAt`: finite epoch milliseconds, not future, at most24hours old; newest matching record wins, critical failure wins timestamp ties.
- `criticalPassed`, `samples>=3`, `repeats>=3`, `outputBudget>=requested output budget`, `evidenceId` linking reproducible measurements.
- `sourceCommit`: actual evaluated source SHA; `semanticReview` with `approved:true`, actual independent `reviewer` identity and matching `reviewedCommit` SHA. Operators must verify the review; a JSON assertion is not cryptographic reviewer attestation.

Scope/TTL is not immutable weight attestation: endpoint owners must invalidate certificates whenever served weights, templates, quantization or deployment configuration change, including unchanged model aliases. Malformed evidence rows cannot escape into a compatibility-router fallback; product routing errors fail closed. The default remains unknown; do not manufacture approval records to bypass this gate. Independent Opus acceptance is still separately required when authorized.

## Reproducible screening

`node scripts/evaluate-product-suitability.cjs` runs eleven synthetic product cases (nine task families), paired plain-requested JSON and provider-enforced JSON on identical fixtures, three repetitions/model/format, temperature0 and768–1536 output tokens. It reuses the existing SSE identity/transport validator. Original protocol-v2 checks retain96 tokens and unchanged assertions. Original and product-suite totals must not be conflated.

Contracts cover truthful resume rewriting, extraction, JD matching/gaps, ATS schema, unsupported facts/metrics/dates, quoted instruction injection, grammar, Hindi and junior interview constraints. Truncation, format, unsupported-fact/grounding-contract, reference-constraint and transport failures are separate. Lexical/reference constraints are intentionally limited: passing does not prove arbitrary semantic truth, writing clarity or real seniority suitability. Semantic quality remains null until independent review. No generated output or private resume is published. Hash repeatability, real identity, usage, TTFT and latency are retained.

Owned local inference only; never public community workers. Ollama's official compatibility API supports `reasoning_effort:none`; requested equally for all product-screening models, recorded in methodology. Original benchmark settings are unchanged. Optional Qwen3:4b download has one resource-gated attempt (5GB available memory/5GB disk (roughly2.5GB weight download plus headroom)); failure/ineligibility is recorded, never success. Product evaluation has18min total resource budget and90sec/request; unattempted cases are explicitly resource-ineligible, not passes. Actual responses/limitations must be inspected before any qualification claim.

## Security change in this increment

Repository-wide usage inspection found Firebase CLI only in root devDependencies: no script, documented command, release invocation or source import. Removed that unused CLI, retaining Firebase SDKs and firebase.json. This corrects the earlier report's unsubstantiated assumption that a documented CLI workflow required retaining it. No vulnerable CLI is reinstalled globally or moved to hide its audit findings.

Replaced Mammoth's raw DOCX-text-only use with direct fflate ZIP extraction of only word/document.xml and native XML text parsing. Retains DOCX functionality without the CLI-only argparse/sprintf chain. Rejects duplicate/oversized XML entries, DTD/entities, wrong namespaces, corrupt archives and oversized extracted text; non-document ZIP parts are not inflated. PDF uses existing local PDF.js worker. Real browser fixtures cover ordinary documents, corrupt binaries, DTD/entity and oversized document entries. No broad HTML conversion/style fidelity is claimed.

Fresh local audits after removal: root all/prod0; frontend all/prod0; backend all0. These are dependency-graph results, not universal vulnerability absence or deployed-image attestation. Hosted final-head browser/full regression remains required. Prior Firebase3high and frontend3moderate observations remain historical evidence, not current findings.

Paired formatting runs do not loosen any checks or replace the original plain-mode results. They distinguish response-format compliance from the actual product JSON interface. Qualification must match the serving format. Initial64617a9 plain-only screening: each Qwen fixture passed3/33 contracts, not semantic qualification; stronger model was resource-ineligible. Next run releases idle model memory before the same resource guard rather than claiming unavailable hardware is success.

Public availability probing is now a separate explicit workflow-dispatch boolean (`verify_public_inference`, defaultfalse). Deterministic PR checks do not resubmit community jobs for documentation/UI changes. Skipped means not checked, never success; the last504 evidence remains in the register. Two bounded synthetic390px,600px-high JPEG crops in <=3500-character chunks may be emitted through the check API for actual visual inspection; full-resolution matched captures remain in artifacts.

Product context screening budgets serialized UTF-8 bytes plus framing reserve and requested output, rather than the generic English chars/4 heuristic. It deliberately overestimates many inputs; it is not an exact model tokenizer or proof about arbitrary custom chat templates. Provider-side limits and qualification under the actual serving template still apply. A multilingual regression verifies an over-limit pinned model is rejected before dispatch.

Evidence transport correction: GitHub runner truncates individual annotation messages at4096characters. Paired summaries now use compact column-labelled rows per format; full named records remain in artifacts. Preview chunks must be reassembled and validated for JPEG end marker before visual review. Earlier truncated previews were not UI failures or complete visual evidence. Geometry remains measured/asserted at all seven sizes; no pixel-equivalence assertion.
