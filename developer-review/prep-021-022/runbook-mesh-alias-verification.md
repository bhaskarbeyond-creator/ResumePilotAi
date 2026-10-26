# Runbook ticket (DRAFT) — Operator verification of Fast Community Mesh aliases for tier promotion

**Decision 3 deliverable. Runbook only — NOT a code change, NOT EXECUTED, no registry entry is
promoted by this document.** Owner: platform operator (human). Cadence: on-demand + quarterly sweep.
The never-guess rule is absolute: a tier is promoted only on the evidence tiers in §3, and
**behavioral fingerprinting alone is never sufficient**.

Scope: the 40 opaque mesh/aggregator aliases deliberately left uncurated at wave 2 (`ac93772`),
enumerated authoritatively by the drift-canary test
(`backend/test/freellmapi-tier-registry-expansion.test.js`, `MESH_ALIASES` + the 80 = 37 + 43
split): `aclide-large, agnes-chat, ainative-chat, aion-large, apinex-chat, bai-chat, bazaar-auto,
beat-chat, blaze-fast, blockrun-70b, clod-large, dp-chat, electronhub-default, exp-chat, freeai-70b,
gizmo-fast, inferbase-70b, lite, llm7-chat, llmtr-chat, logfare-chat, longcat-chat, lucidity-large,
nara-chat, navy-70b, opencode-zen, orca-free, plugsky-chat, radeon-70b, requesty-chat,
router9-auto, routeway-70b, sail-70b, sea-lion-70b, septor-70b, simplellm-large, speka-chat,
uno-free, waterfall-large, xkiro-free`.

---

## 1. Why this runbook exists

Quality mode ranks on the curated tier table only. The aliases above are served by real providers
in the catalog, but their backing models are unverifiable from the alias string — `-70b`, `-fast`,
`-large`, `-free` suffixes are marketing/name artifacts, and mapping them to tiers is exactly the
name-inference F-06 forbids. Until an operator verifies a backing model, the alias honestly stays
`unknown` (no bonus, no penalty, primary-preference tie-break).

## 2. Verification procedure (per alias)

1. **Identify the backing model.** In order of preference:
   a. Provider documentation / model-card page naming the exact upstream model behind the alias.
   b. Written provider confirmation (support ticket / email / contract annex) — save the artifact.
   c. The provider's own `/v1/models`-style metadata **only if** it names an upstream model
      unambiguously (id or documented family) — metadata that merely re-states the alias is not
      evidence (this is why mandate option (a) was rejected in `ac93772`).
2. **Collect corroborating public benchmark data** for the *identified backing model* (LMSYS Chatbot
   Arena Elo band, ArtificialAnalysis intelligence index class) — the same sources wave 1/2 used.
   The alias inherits the backing model's evidence, cited as "alias → model (source, date)".
3. **Optional supporting fingerprint (never sufficient alone):** run the standardized probe set
   (fixed system prompt + 5 discriminating prompts: token-count echo, known-cutoff date question,
   tokenizer artifacts, instruction-style tells, refusal phrasing) against the alias endpoint and
   record the transcript. Fingerprints may *corroborate* a documented identity or *flag a
   contradiction* (documented Llama-3.3-70B alias behaving like an 8B → do not promote; open a
   discrepancy note). They may never be the primary evidence.
4. **Record the evidence file:** `docs/ai-settings/tier-curation/<alias>.md` containing: alias,
   provider id, identified backing model, evidence tier (§3) with source URLs/artifact paths and
   retrieval dates, fingerprint transcript (if run), proposed tier, operator name, second reviewer
   name, decision date.
5. **Two-person rule:** promotion requires the collecting operator **and** the engine owner to sign
   the evidence file. One-person promotions are invalid by process.

## 3. Evidence tiers (promotion gate)

| Tier | Evidence | Promotable? |
|---|---|---|
| **T1** | Provider documentation or written provider confirmation naming the upstream model, + public benchmark data for that model | **YES** — tier = the backing model's curated tier (alias-consistency rule: same model ⇒ same class, every casing/alias — wave-2's enforced invariant) |
| **T2** | Reputable public benchmark/leaderboard listing the *alias itself* mapped to a model class (e.g., an Arena entry under the alias name with documented backing) | **YES** — with the citation in the evidence file |
| **T3** | Behavioral fingerprint only, provider marketing copy only, suffix-string inference ("-70b") | **NO — never.** Stays `unknown`. Record the attempt in the evidence file as `decision: no-promotion` so the sweep doesn't redo it |

## 4. Promotion mechanics (when T1/T2 evidence exists)

1. Edit `backend/freellmapi/providers/registry.js`: add `'<alias>': '<tier>',` under the correct
   wave section with a comment `// wave-3 <date>: <alias> → <backing model> (<evidence file path>)`.
2. Update the drift canary in `freellmapi-tier-registry-expansion.test.js`: move the alias out of
   `MESH_ALIASES` into the wave-3 snapshot assertions and adjust the pinned split (80 = 37+k +
   43−k). The canary failing on an un-updated split is the intended forcing function — a promotion
   that doesn't consciously update the test cannot merge.
3. Re-certify: wave-1 test (7 tests), wave-2 test (6 tests), 10× fresh-process each; full backend
   suite SUITE_EXIT=0; eslint 0/0 touched files; lockfiles 0 bytes.
4. Live probe (A.10-shape): quality mode, primary serving the promoted alias vs a curated
   premium/standard counterpart — assert the wire `qualityEvidence` changes from `"unknown"` to
   `"curated-tier:<tier>"` and ordering matches the tier. BEFORE/AFTER transcripts archived with
   the evidence file.
5. Commit convention: `feat(engine): tier wave-3 — promote <alias> (<backing model>) on T<n>
   evidence` — one alias (or one evidence batch) per commit; body cites the evidence file.

## 5. Rollback if a promotion is later found wrong

Trigger: contradicting provider statement, backing-model swap by the mesh (aliases can silently
re-point!), or a production quality-mode anomaly traced to the alias.

1. **Revert the registry entry** (data-only revert of the promotion commit's registry hunk) —
   quality mode immediately returns to `unknown` for the alias. Blast radius is contained by
   construction: tiers are read only by `rankCandidates` quality-mode tierBonus; auto/balanced/
   speed/manual paths, exploration cadence, quotas and admission never read tiers.
2. Restore the canary numbers (the revert must pass the pinned split — same forcing function in
   reverse).
3. Append an incident section to the evidence file: what contradicted, when detected, revert SHA,
   probe transcripts showing `unknown` restored.
4. Re-run the A.10-shape probe to confirm the wire reads `qualityEvidence:"unknown"` again.
5. If the mesh re-pointed the alias (model swapped behind the same name): record the alias as
   **volatile** in the evidence file; volatile aliases require re-verification each sweep before
   any re-promotion, and two consecutive volatilities permanently bar the alias from promotion
   (documented-unknown forever — the honest end state for unstable aliases).

## 6. Standing cautions

- **Quarterly sweep:** aliases' backing models drift; a promotion is a *dated* judgement. Each
  sweep re-checks promoted aliases' evidence URLs (dead link → re-verify or roll back).
- **Never automate:** this runbook is deliberately human-operated. An automated discovery pass
  (scraping, fingerprint-classifying) would re-import the inference-by-name defect at machine
  scale — mandate option (a) stays rejected.
- **Unknown is a first-class outcome:** a sweep that promotes nothing is a successful sweep. The
  registry's honesty contract is that `unknown` means "no verifiable evidence", not "not yet
  marketed".
