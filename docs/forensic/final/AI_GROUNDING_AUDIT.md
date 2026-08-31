# AI Grounding Audit

## AI Operations

### Content Operations (grounded)
| Operation | Required Source | Output | Grounding Validation |
|-----------|----------------|--------|----------------------|
| generate-summary | sourceFacts/existingText + experience/workHistory/education/skills/certifications/projects/achievement | { summary, sourceExcerpts[] } | All tokens must be in source; no added quantities/credentials/leadership/outcomes; requires ≥20 chars of source |
| generate-work-description | jobTitle, employer, + notes (≥12 chars) | { suggestions[] } with sourceExcerpt per bullet | Each suggestion must contain verbatim excerpt from source; lexical tokens must appear in source; no new identifiers/quantities/named entities |
| generate-education-description | school, degree, + notes (≥12 chars) | { suggestions[] } | Same extraction-only rules |
| enhance-single-bullet | bullet text | { enhancedBullet } with sourceExcerpt | Single-bullet rewrite; no added claims |

### Recommendation Operations (not candidate facts)
| Operation | Output | Notes |
|-----------|--------|-------|
| generate-skills | { skills[] } | Career suggestions only; explicitly marked as "recommended" not "skills the candidate has"; certifications/employers filtered out |
| autocomplete | { suggestions[] } | Taxonomy values (jobTitle/skill/degree/etc.); no candidate claims |

### Unstructured Generation (cover letter, interview, grammar)
- `generate-ai-cover-letter` – grounded in user-supplied inputs (jobTitle, company, skills, experience, language, jobDescription); uses tone constraints.
- `generate-interview` questions – not a fact-generation operation; produces questions based on resume.
- `check-grammar` – correction suggestions; `startIndex/endIndex` validated against source text slice.
- `parse-resume` – extraction-only prompt ("Extract, but do not generate or rewrite"); `groundResumeExtraction()` after response verifies every scalar/description appears verbatim in source.

## Grounding Enforcement Pipeline (`assertGroundedGeneratedContent`)
1. **Source citation check**: every suggestion must include `sourceExcerpt` that is a substring of source.
2. **Quantity check**: every number/percent/currency/date in output must appear in source (`quantifiedClaims + normalizeQuantity`).
3. **Lexical token check**: every non-connective token must appear in source (STANDARD_CONNECTIVE_TOKENS allowlist).
4. **Protected claim family check**: credentials, awards, leadership, measured outcomes, delivery verbs, collaboration, scale, proficiency claims only allowed if already present in source (regex patterns).
5. **Identifier check**: capitalized multi-word terms, acronyms, versioned tech names must appear in source.
6. **Name/capitalized term check**: capitalized terms inside sentences must appear in source.

## Fallback Behavior
If grounding fails or all providers error:
- Content ops → **source-preserving fallback** (returns the user's original notes, sanitized; no fabricated content).
- Recommendations → **empty fallback** with `requiresUserConfirmation: true` (no skills/autocomplete values invented).
- Cover letter → **deterministic templates** that don't fabricate employer-specific achievements (uses generic placeholders populated only from user inputs).
- Provider failures log with `code`, `provider`, and `operation` for observability.

## Provider Configuration
- 6 providers supported: nvidia, gemini, openai, groq, openrouter, deepseek.
- API keys loaded from env or MariaDB, never from client.
- Model allowlist via `MODEL_PATTERN = /^[A-Za-z0-9._:/-]{1,150}$/` to prevent injection.
- Temperature clamped to [0, 1], maxTokens clamped to [256, 4096].
- Provider failover across enabled providers; primary configurable.
- Self-hosted/Azure-style OpenAI-compatible proxies allowed via operator-configured baseUrl (validated to http(s) URL pattern).

## Findings
- PROVEN: Candidate facts (experience, education, skills, achievements, certifications, employment) are not invented in grounded content ops.
- PROVEN: Parser extracts only verbatim text; skill ratings require explicit `NN%` next to skill name.
- PROVEN: Fail-closed to source-preserving fallback on provider/grounding failure.
- PROVEN: Provider keys/models are operator-controlled.
- Recommendation operations (skills/autocomplete) correctly labeled as suggestions.
