# AI Provider Architecture RCA and Release Report

**Baseline:** `c38a368467ab709b72e74a3075d9f97941c892df` (`diag: add RCA diagnostic logging...`)
**Investigation date:** 2026-08-20
**Status:** code fix complete; production deployment and live-provider proof pending deployment credentials/access

## Executive finding

The runtime did not enable providers merely because a provider was listed in the UI. A provider was eligible only when its credential resolved from environment, `settings/ai_providers`, or legacy server settings, and its toggle was not explicitly `false`. Consequently, a Firestore configuration containing only an NVIDIA credential/toggle made NVIDIA the only eligible provider. The interview diversity changes did not add a credential or change this calculation.

Two architectural defects made this state especially fragile:

1. The configuration resolver treated historical field spellings inconsistently (`enableOpenrouter` versus `enableOpenRouter`, and corresponding OpenRouter key aliases). This could make a configured provider appear disabled.
2. A failed NVIDIA request could spend the request budget retrying a second NVIDIA model before the provider-level failover loop ran. A timeout therefore looked like a platform outage even when another configured provider was available.

The repository is a shallow checkout whose only available commit is `c38a368`; `a15dd5d` and its parents are not present locally or on the configured `origin` ref. Therefore an exact historical commit attribution beyond the baseline cannot be honestly made from this checkout. The baseline and current `origin/main` were verified to be the same SHA before editing.

## Resolution pipeline audited

`loadProviderConfiguration()` in `backend/services/aiRuntime.js` now resolves, in precedence order:

1. deployment environment (`*_API_KEY`, `*_MODEL`),
2. server-only Firestore `settings/ai_providers`,
3. legacy server-side `data/system_settings.ai` values.

Public Firestore settings (`data/public_config.ai`) provide the primary provider, model/toggles, temperature, token limit, and fallback control. A provider is enabled only when it has a non-empty server-side credential and is not explicitly disabled. `providerOrder()` puts the configured primary first and then the deterministic supported-provider order: NVIDIA, Gemini, OpenAI, Groq, OpenRouter, DeepSeek.

The six provider request implementations were audited:

| Provider | Credential | Model | API runtime |
|---|---|---|---|
| nvidia | `NVIDIA_API_KEY` / secret store / legacy | `NVIDIA_MODEL` or configured model | NVIDIA OpenAI-compatible chat endpoint |
| gemini | `GEMINI_API_KEY` / secret store / legacy | `GEMINI_MODEL` or configured model | Gemini `generateContent` |
| openai | `OPENAI_API_KEY` / secret store / legacy | `OPENAI_MODEL` or configured model | OpenAI chat endpoint |
| groq | `GROQ_API_KEY` / secret store / legacy | `GROQ_MODEL` or configured model | Groq OpenAI-compatible endpoint |
| openrouter | `OPENROUTER_API_KEY` / secret store / legacy | `OPENROUTER_MODEL` or configured model | OpenRouter OpenAI-compatible endpoint |
| deepseek | `DEEPSEEK_API_KEY` / secret store / legacy | `DEEPSEEK_MODEL` or configured model | DeepSeek chat endpoint |

No credential is returned to clients. Admin settings return configured booleans and masked keys only.

## Claude configuration mismatch

Claude is not a runtime provider. The authoritative provider set remains the six providers above. A Claude model exposed through OpenRouter must be saved as:

```text
provider: openrouter
model: anthropic/claude-...
```

A standalone `claude` provider is rejected by the backend provider validation. The current checked-in admin selector contains no standalone Claude provider. This prevents the UI/backend mismatch from being recreated by this build.

## Changes made

### `backend/services/aiRuntime.js`

- Added explicit compatibility handling for historical OpenRouter toggle/key spellings.
- Changed enablement to evaluate each configuration layer independently, so missing sibling flags in a partial public document do not disable a credentialed provider. Explicit `false` remains authoritative.
- Normalized the configured primary provider case before registry lookup.
- Changed model retry behavior: transport timeout/provider outage immediately returns to `generateWithProviders()`, which fails over to the next valid provider. A same-provider model retry is retained only for deterministic model/configuration errors (HTTP 400/404 and model-not-found responses).
- Preserved server-only credentials and deterministic provider ordering.

### `src/components/admin/settings/AiSettings.jsx`

- Pasting an NVIDIA key no longer silently changes the primary provider. Primary selection is an explicit administrator action; adding a credential only enables that provider.
- After save, React state retains only server-provided masks and never retains a newly entered raw secret.

### Tests

Added runtime regression coverage for:

- OpenRouter legacy casing and credential-driven enablement.
- Timeout from NVIDIA moving directly to Gemini rather than retrying another NVIDIA model.

## AI module inventory

All current server AI modules route through the shared runtime:

- Interview Coach: `/api/generate-interview`; shared provider chain; interview-specific prompt, deduplication, grounding, and fallback; `X-AI-Source` distinguishes AI and fallback.
- Resume generation: `/api/generate-resume`; shared provider chain; tolerant JSON extraction; schema-safe fallback.
- Resume summary: `/api/generate-summary`; shared provider chain; parsed/validated output with endpoint fallback.
- Work and education content: `/api/generate-work-description`, `/api/generate-education-description`; shared provider chain and JSON extraction.
- Skills and certifications: `/api/generate-skills`, `/api/generate-content` certification operation; shared provider chain and normalization.
- Grammar: `/api/check-grammar`; shared provider chain and index-validated corrections.
- Generic content: `/api/generate-content`; `executeContentOperation()` and shared provider chain.
- Resume parsing: `/api/parse-resume`; shared provider chain and `extractJson()`.
- Admin provider test/model discovery: `testAiProvider()` and `fetchProviderModels()` use the same provider registry and server-side credential resolution.

No direct provider call was found in the feature routes outside the shared runtime/admin test service. The diversity work is isolated to Interview Coach prompt construction, nonce, exclusion, deduplication, difficulty distribution, and source headers; it does not mutate global provider configuration.

## Validation performed

- `node --test backend/test/ai-runtime.test.js`: **12 passed**.
- `git diff --check`: **passed**.
- Backend full test command was attempted. The available checkout is missing installed backend dependencies (`express`, `supertest`, `firebase-admin`, `stripe`), so 15 test files failed at module load; 36 tests passed. This is an environment dependency failure, not a product assertion failure.
- Production build/live E2E/deployment were not claimed: no production credentials or deployment process was available in this workspace, and no real provider request can be proven without a valid server credential.

## Required release verification

Before release, install the locked backend dependencies and run the complete repository suites. In a deployment with at least two valid provider credentials:

1. Confirm `/api/health` and backend SHA.
2. Generate an interview and verify `X-AI-Source: ai`, `X-AI-Provider`, and `X-AI-Model`.
3. Force the primary provider to timeout and verify the next provider answers.
4. Verify all-provider failure returns the grounded fallback with `X-AI-Source: fallback:provider_failure`.
5. Generate repeated, role/JD/resume/difficulty/type-specific sessions and confirm meaningful variation.
6. Smoke-test summary, resume, work-description, skills, grammar, content, and parse-resume endpoints.

No production deployment, PM2 restart, Cloudflare purge, or live AI proof was performed by this repository-only investigation; reporting those as complete would be fabricated.
