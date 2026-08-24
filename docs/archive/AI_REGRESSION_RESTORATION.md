# AI behavior regression restoration evidence

## Baselines inspected

- Regression baseline before this work: `66877797547f17df016bf1eea5f1f3658a7c3c80`.
- Last repository version before the recent security rewrite of the browser AI service: `4a2423175c8954676d39d834cd917a5aabfd2e30`.
- Regression-introducing rewrite: `3d1399ce3689532452813433d67e60725c4f5a73`; follow-up secret split: `a82477cf03f83ba05b33fb83b98808f9050a7995`.
- History examined for `src/services/aiService.js`, `backend/routes/ai.js`, `backend/index.js`, the admin AI settings screen, and every current AI call site. The checkout is grafted at `4a24231`, so no older reachable commit exists in this repository.

## OLD vs CURRENT vs intended

| Area | Pre-security behavior (`4a24231`) | Regression baseline (`6687779`) | Restored intended behavior |
|---|---|---|---|
| Section prompts | Detailed operation-specific prompts used resume, work, education, skill, project, certification, location, tone, notes, and language context. | Browser prompts were removed; the replacement auxiliary endpoint used short generic prompts and the legacy endpoints ignored several supplied context fields. | The pre-security prompt contract is constructed server-side with bounded inputs. Existing notes, complete profile context, tone, language, exclusions, schemas, and formatting rules are preserved. |
| Provider selection | Primary provider plus enabled fallbacks across NVIDIA, Gemini, OpenAI, Groq, and OpenRouter. | User AI operations effectively used Gemini only. Configured provider/model/fallback/temperature settings no longer controlled most workflows. | Secure backend provider chain restores primary selection and fallback for NVIDIA, Gemini, OpenAI, Groq, OpenRouter, and adds the already-configured DeepSeek provider. Models and controls come from server-only/public split settings. |
| Credentials | Provider keys could be read from Firestore or `VITE_*` values and sent directly by browser code. | Keys were moved server-side. | Keys remain server-only. Browser requests are same-origin, Firebase-authenticated API calls and reject client keys/identity fields. |
| Response parsing | Tolerant fenced/prose JSON extraction, aliases, string fallback, skill/certification category handling, and AI-cliché/placeholder cleanup. | The replacement endpoint only parsed a JSON object and rejected otherwise-useful responses; response cleanup and aliases were lost. | Tolerant parsing and cleanup are restored on the backend with bounded, typed UI contracts and active-markup stripping. |
| Resume generation | Complete-resume prompt expected summary, at least three work and education entries, languages, and skills. | Only Gemini was used; provider settings were ignored. | Complete contract remains, all configured providers are supported, tolerant JSON extraction is used, and missing required sections recover without discarding valid AI fields. |
| Resume import | Text extraction AI used detailed schema and NVIDIA/Gemini fallback; the old parser contained dormant image logic. | A short Gemini-only extraction prompt replaced it; failures silently used heuristics. | Detailed schema and provider fallback are restored; deterministic heuristic merge remains as a reliability improvement. Image input remains unavailable because current reachable upload UX only accepts text-bearing documents and secure scanned object upload does not yet exist. |
| Summary/work/education/skills | Both builder and legacy editors had operation-specific outputs and local fallback UX. | Builder calls crossed the backend but no longer used their original prompt behavior. | Builder calls use restored prompts; legacy direct endpoints retain their existing prompt/fallback contracts and now honor the secure provider chain. |
| Certifications/bullet enhancement/autocomplete | Structured certification metadata, concise bullet rewriting, and type-specific autocomplete. | Generic prompts lost full context, categories, old autocomplete types, and robust cleanup. | Original schemas and all old autocomplete types are restored. Stale autocomplete requests are cancelled. |
| Interview generation | Structured questions/options/answers/explanations with difficulty and timing. No streaming. | Gemini-only behavior remained, ignoring configured primary/fallback providers. | Existing interview prompt and UI contract remain; secure multi-provider execution and request cancellation are added. |
| Cover letters | Three-paragraph tailored generation, OpenAI then Gemini, admin model/temperature, and local fallback. Browser sent the whole AI settings object. | Secure keys were used, but system prompt and generation controls changed and provider support narrowed. | The established executive-career prompt semantics, personalization, secure provider chain, model/temperature controls, regeneration, local fallback, and automatic save remain without sending settings/secrets from the browser. |
| Grammar | Exhaustive structured grammar contract and deterministic fallback. | Gemini only. | Existing contract/fallback remains and configured providers are supported with low temperature and bounded output. |
| Cancellation | Most old flows had no network cancellation. | Still absent. | Resume import, full-resume generation, work/education suggestions, autocomplete, interview requests, cover-letter generation, summary helper, and grammar checks now abort on close, replacement, or unmount where applicable. |
| Streaming/retry | No provider streaming and no same-provider retry; provider fallback was the retry mechanism. | No streaming; fallback mostly disappeared. | No artificial streaming behavior was introduced. Provider fallback is restored; failures remain bounded and retryable through existing UI controls. |

## AI feature inventory and contracts

| Workflow | Input/context | Product output contract | Consumer |
|---|---|---|---|
| Complete resume generation | occupation, experience level, supplied skills/education, language | complete resume object with scalar profile fields and work, education, language, and skill arrays | AI generation modal → model objects → builder apply |
| Executive summary/objective | name, target role, calculated experience, work history, education, skills, certifications, projects/achievements, tone/language | `{ summary: string }` | builder summary, legacy summary helper, dashboard profile |
| Work experience suggestions | job/employer/dates/location, existing notes, selected focus tone/style, language | `{ suggestions: string[] }` | review/select modal or dashboard profile insertion |
| Education suggestions | school, degree, dates, location/language | `{ suggestions: string[] }` | review/select modal |
| Skill recommendations | role, experience, work, education, projects, existing skills, language | `{ skills: [{name, category}] }` | builder name chips and dashboard review/apply modal |
| Certification recommendations | role, work, education, skills, existing certifications | `{ certifications: [{title, issuer, category}] }` | dashboard review/apply modal |
| Bullet enhancement | existing factual bullet | `{ enhancedBullet: string }` | single/all bullet enhancement and undo |
| Resume autocomplete | typed prefix and field type | `{ suggestions: string[] }` | keyboard-accessible autocomplete field/cache |
| Resume import extraction | extracted document text | structured profile/work/education/skill/language object | import preview → normalized builder payload |
| Interview assistance | occupation, technical/behavioral type, count, language | interview metadata and structured question array | interview loading/start/answer/results UI |
| Cover-letter generation | candidate name, target job/company/recipient, skills, experience | `{ success, coverLetter, provider }` | cover editor → automatic save; regeneration supported |
| Grammar assistance | editor text and language | `{ hasErrors, corrections[], overallSuggestion }` | grammar review/apply/dismiss UI |
| ATS score and job-description match | local resume fields and pasted job description | deterministic score/keyword match | local ATS meter; this is not a provider AI workflow |
| Job matching | stored job/profile data | deterministic matching UI in current repository | dashboard matching module; no provider AI call was found |

No Anthropic adapter existed in the old service or admin provider configuration. Ollama appeared in admin UI but the old generation loop never executed it; accepting arbitrary local base URLs on the server would introduce SSRF. It remains explicitly non-operational until a deployment-owned endpoint allowlist is designed. These capabilities were not silently represented as restored.

## Security and reliability retained

- Firebase authentication, verified-email policy, server-side authorization, account burst limits, and durable daily quotas execute before provider routes.
- Provider credentials remain in environment variables or `settings/ai_providers`; API responses and public settings expose only model/toggle/configured-state metadata.
- Client-supplied API keys and client-supplied UID/resume/profile ownership fields are rejected.
- Inputs, request bodies, output tokens, response sizes, model identifiers, and provider deadlines are bounded.
- Provider errors return generic retryable errors with request IDs and do not expose keys, provider diagnostics, prompts, or user context in logs.
- A failed primary provider falls back only when the administrator enabled fallback. No unbounded same-provider retries were added.
- AI output is normalized to the established product contracts and active HTML is removed from plain-text AI fields.
- Analytics is not used as entitlement or quota truth; the durable server-side usage transaction is authoritative.

## Deterministic regression coverage

- `backend/test/ai-runtime.test.js`: historical prompt context, all response contracts, parser aliases/cleanup, provider/model configuration, fallback order, disabled fallback, resume schema, cancellation, and safe output.
- `backend/test/ai-routes.integration.test.js`: Firebase auth, verified email, prompt propagation, response contract, server-only key usage, identity/key rejection, input limits, quota headers, and safe provider failures.
- `backend/test/ai-abuse.test.js`: account-bound durable daily quota, fail-closed store behavior, and account burst limits.
- `tests/ai-client.test.mjs`: frontend route/payload compatibility, unchanged UI structures, no browser credentials, structured errors, and cancellation.

Live provider quality, billing, credentials, and latency still require provider-sandbox/staging validation. Deterministic tests intentionally do not claim that external providers were called.
